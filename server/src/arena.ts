/**
 * 競技場場次管理（`55-arena.md`）：進場判定與扣費、場次登記、實例掛載、重啟後作廢。
 * 場次只存在記憶體；server 重啟後角色身上殘留的場次在放進實例前作廢（§ 55.6）。
 */
import {
  ARENA_MATERIAL_COST, ARENA_REGION_ID, arenaGoldCost, arenaMaterialIds, arenaSlotStart, getArenaTier,
  isArenaSlotUsed, markArenaSlotUsed, refundArenaSlot, type ArenaCharacterRun, type ArenaTier,
} from '../../client/src/models/arena';
import { getBagItemAmount, consumeBagItem } from '../../client/src/models/bagItem';
import { getNearestTown, getRegion } from '../../client/src/models/mapData';
import { MAP_THEMES } from '../../client/src/models/mapDataControl';
import type { MapInstance } from '../../client/src/systems/mapInstance';
import {
  arenaRecordTimeMs, createArenaRun, relocateToRegion, type ArenaExitRecord, type ArenaRunState,
} from '../../client/src/systems/arenaRun';
import type { Session } from '../../client/src/stores/session';

export interface ArenaEnterResult {
  ok: boolean;
  message?: string;
}

/** 城鎮以外的地形主題，每場隨機一個 */
const ARENA_THEMES = MAP_THEMES.filter(t => t !== 'town');

interface MemberIdentity {
  name: string;
  className: string;
}

export class ArenaRegistry {
  private readonly runs = new Map<string, ArenaRunState>();
  /** 各場次隊員的名稱與職業：斷線未回者清掉時寫排行榜用 */
  private readonly rosters = new Map<string, Map<number, MemberIdentity>>();
  /** 斷線未回而被清掉的角色 → 場次；上線時送回城鎮、不歸還次數（§ 55.6） */
  private readonly abandoned = new Map<number, string>();
  private seq = 0;

  private readonly onExit: (record: ArenaExitRecord) => void;
  /** 該角色是否在線且仍在這一場 */
  private readonly isInRun: (characterId: number, runKey: string) => boolean;

  constructor(
    onExit: (record: ArenaExitRecord) => void,
    isInRun: (characterId: number, runKey: string) => boolean = () => false,
  ) {
    this.onExit = onExit;
    this.isInRun = isInRun;
  }

  /** 實例鍵的歸屬部分：同場次的隊員進同一個實例，不受隊籍變動影響 */
  ownerKeyOf(session: Session): string {
    return `arena:${session.game.getState().arenaRun?.runKey ?? 'none'}`;
  }

  /**
   * § 55.1／§ 55.4：段位開放、全員在城鎮且等級達標；有人能拿票券時由 `payer` 付金幣與材料。
   * 成功時全員傳送進場（載圖由呼叫端的 `syncWorld` 處理）。
   */
  enter(members: Session[], payer: Session, tierRaw: unknown, now: number = Date.now()): ArenaEnterResult {
    const spec = getArenaTier(Number(tierRaw));
    if (!spec) return { ok: false, message: '沒有這個段位' };
    if (!spec.open) return { ok: false, message: `T${spec.tier} 競技場尚未開放` };
    for (const m of members) {
      const gs = m.game.getState();
      const ch = gs.character;
      if (!ch) return { ok: false, message: '有隊員尚未進入世界' };
      if (gs.arenaRun) return { ok: false, message: `${ch.name} 已在競技場內` };
      if (getRegion(ch.currentRegion)?.type !== 'town') return { ok: false, message: `${ch.name} 不在城鎮` };
      if (ch.level < spec.level) return { ok: false, message: `${ch.name} 未達 Lv.${spec.level}` };
    }

    const tier = spec.tier as ArenaTier;
    const eligible = new Set(members.filter(m => !isArenaSlotUsed(m.game.getState().arenaSlots, tier, now)));
    if (eligible.size > 0) {
      const pg = payer.game.getState();
      const fee = arenaGoldCost(tier);
      if (pg.character!.gold < fee) return { ok: false, message: '金幣不足' };
      const ids = arenaMaterialIds(spec);
      if (ids.reduce((sum, id) => sum + getBagItemAmount(pg.bagItems, id), 0) < ARENA_MATERIAL_COST) {
        return { ok: false, message: '入場材料不足' };
      }
      let bag = pg.bagItems;
      let need = ARENA_MATERIAL_COST;
      for (const id of ids) {
        const take = Math.min(need, getBagItemAmount(bag, id));
        if (take > 0) { bag = consumeBagItem(bag, id, take); need -= take; }
      }
      payer.game.setState({ bagItems: bag, character: { ...pg.character!, gold: pg.character!.gold - fee } });
    }

    const runKey = `${now.toString(36)}-${++this.seq}`;
    const theme = ARENA_THEMES[Math.floor(Math.random() * ARENA_THEMES.length)];
    const run = createArenaRun(runKey, tier, members.map(m => m.game.getState().character!.id!));
    run.onExit = record => {
      this.onExit(record);
      this.settle(run);
    };
    this.runs.set(runKey, run);
    this.rosters.set(runKey, new Map(members.map(m => {
      const ch = m.game.getState().character!;
      return [ch.id!, { name: ch.name, className: ch.className }];
    })));

    const slotStart = arenaSlotStart(now);
    for (const m of members) {
      const gs = m.game.getState();
      const ticketRun = eligible.has(m);
      const arenaRun: ArenaCharacterRun = {
        runKey, tier, ticketRun, tickets: 0, returnRegion: gs.character!.currentRegion, theme, slotStart,
        wave: 1, elapsedMs: 0, monstersLeft: 0,
      };
      m.game.setState({
        arenaRun,
        arenaSlots: ticketRun ? markArenaSlotUsed(gs.arenaSlots, tier, now) : gs.arenaSlots,
      });
      gs.stopExploring();
      relocateToRegion(m, ARENA_REGION_ID);
      m.game.getState().pushSystemLog(`進入 T${tier} 競技場${ticketRun ? '' : '（本時段已用掉票券場，不給票券）'}`);
      m.game.getState().saveState();
    }
    return { ok: true };
  }

  private dropRun(runKey: string): void {
    this.runs.delete(runKey);
    this.rosters.delete(runKey);
  }

  /**
   * 隊員離場後：沒人了就丟掉場次；剩下的人都斷線未回時（§ 55.6），
   * 依清理當下的波次與到達時間寫排行榜，記下這些人，丟掉場次。
   */
  private settle(run: ArenaRunState): void {
    if ([...run.members].some(id => this.isInRun(id, run.runKey))) return;
    const roster = this.rosters.get(run.runKey);
    for (const id of run.members) {
      this.abandoned.set(id, run.runKey);
      const who = roster?.get(id);
      if (who) {
        this.onExit({
          characterId: id, name: who.name, className: who.className, tier: run.tier,
          party: run.partySize > 1, wave: run.wave, timeMs: arenaRecordTimeMs(run), reason: 'abandon',
        });
      }
    }
    run.members.clear();
    this.dropRun(run.runKey);
  }

  /**
   * 放進實例前呼叫：場次還在就掛到實例上並回 true；
   * 場次不存在（重啟）或已打完時作廢並送回城鎮，回 false（不放進競技場實例）。
   */
  attach(session: Session, instance: MapInstance | null): boolean {
    const gs = session.game.getState();
    const ar = gs.arenaRun;
    const run = ar ? this.runs.get(ar.runKey) : undefined;
    if (ar && run && !run.finished) {
      if (instance && !instance.arena) instance.arena = run;
      return true;
    }
    this.voidRun(session, ar, run);
    return false;
  }

  /**
   * 人不在競技場卻帶著場次（存檔中途中斷）：退出該場；場次已不存在時同重啟作廢，歸還時段次數（§ 55.6）。
   */
  clearStale(session: Session): void {
    const gs = session.game.getState();
    const ar = gs.arenaRun;
    const ch = gs.character;
    if (!ar || !ch) return;
    const run = this.runs.get(ar.runKey);
    if (run) {
      run.members.delete(ch.id!);
      if (run.members.size === 0) this.dropRun(ar.runKey);
    }
    const wasAbandoned = this.abandoned.get(ch.id!) === ar.runKey;
    this.abandoned.delete(ch.id!);
    session.game.setState({
      arenaRun: null,
      arenaSlots: !run && !wasAbandoned && ar.ticketRun ? refundArenaSlot(gs.arenaSlots, ar.tier, ar.slotStart) : gs.arenaSlots,
    });
    session.game.getState().saveState();
  }

  /** 角色刪除：從所屬場次移除，場次沒人就丟掉 */
  forgetCharacter(characterId: number): void {
    this.abandoned.delete(characterId);
    for (const [key, run] of this.runs) {
      if (!run.members.delete(characterId)) continue;
      if (run.members.size === 0) this.dropRun(key);
    }
  }

  /**
   * § 55.6：重啟作廢的場次歸還該時段次數、票券保留；已打完的照打完結算；
   * 斷線未回被清掉的不歸還次數（排行榜已在清掉時寫入）。
   */
  private voidRun(session: Session, ar: ArenaCharacterRun | null, run: ArenaRunState | undefined): void {
    const gs = session.game.getState();
    const ch = gs.character;
    if (!ch) return;
    const wasAbandoned = !!ar && this.abandoned.get(ch.id!) === ar.runKey;
    this.abandoned.delete(ch.id!);
    if (ar && run?.finished) {
      run.members.delete(ch.id!);
      run.onExit?.({
        characterId: ch.id!, name: ch.name, className: ch.className, tier: ar.tier,
        party: run.partySize > 1, wave: run.wave, timeMs: arenaRecordTimeMs(run), reason: 'finish',
      });
    } else if (ar?.ticketRun && !wasAbandoned) {
      session.game.setState({ arenaSlots: refundArenaSlot(gs.arenaSlots, ar.tier, ar.slotStart) });
    }
    const back = ar ? getRegion(ar.returnRegion) : undefined;
    relocateToRegion(session, back?.type === 'town' ? back.id : getNearestTown(ch.currentRegion).id);
    session.game.setState({ arenaRun: null });
    session.game.getState().pushSystemLog(run?.finished || wasAbandoned ? '競技場已結束，返回城鎮' : '競技場場次已中斷，返回城鎮');
    session.game.getState().saveState();
  }
}

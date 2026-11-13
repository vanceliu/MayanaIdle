/**
 * 競技場場次（`55-arena.md` § 55.2～§ 55.6）：出波、票券、離場。
 * 實例層的波次狀態掛在 `MapInstance.arena`；角色身上的場次在 `gameStore.arenaRun`。
 */
import {
  ARENA_MAX_WAVE, arenaAffixCount, arenaBossForWave, arenaDeathTicketLoss, arenaNormalPool, arenaWaveSize,
  getArenaTier, isBossWave, type ArenaTier,
} from '../models/arena';
import { isSpawnableTile, type MapData, type Position } from '../models/mapControl';
import { getNearestTown, getRegion, ZONES } from '../models/mapData';
import { addBagItem, consumeBagItem, getBagItemAmount } from '../models/bagItem';
import type { MapMonster } from '../stores/mapMonsterStore';
import type { Session } from '../stores/session';
import { ARENA_TICKET_ITEM_IDS } from './arenaBox';
import { memberIdOf, presentMembers, type MapInstance } from './mapInstance';
import { gameNow } from '../core/clock';
import { random } from '../core/rng';

/** 怪物生在角色周圍的距離（格） */
const SPAWN_MIN_DISTANCE = 6;
const SPAWN_MAX_DISTANCE = 8;

/** `abandon`：斷線未回，在場的人全部離場時清掉（§ 55.6） */
export type ArenaExitReason = 'retreat' | 'death' | 'finish' | 'abandon';

/** 一位隊員離場時的紀錄（排行榜，§ 55.7） */
export interface ArenaExitRecord {
  characterId: number;
  name: string;
  className: string;
  tier: ArenaTier;
  party: boolean;
  wave: number;
  timeMs: number;
  reason: ArenaExitReason;
}

/** 實例層的場次狀態；server 重啟後不存在（§ 55.6） */
export interface ArenaRunState {
  runKey: string;
  tier: ArenaTier;
  /** 進場人數：決定每波隻數（§ 55.2.1） */
  partySize: number;
  wave: number;
  /** 斷線（無人在場）期間不累計（§ 55.7） */
  elapsedMs: number;
  /** 到達當前波次時的 `elapsedMs`（排行榜時間，§ 55.7） */
  waveReachedMs: number;
  finished: boolean;
  /** 仍在場次內的角色 id（含斷線者） */
  members: Set<number>;
  /** 隊員離場時呼叫（server 寫排行榜） */
  onExit?: (record: ArenaExitRecord) => void;
}

export function createArenaRun(runKey: string, tier: ArenaTier, memberIds: number[]): ArenaRunState {
  return { runKey, tier, partySize: memberIds.length, wave: 1, elapsedMs: 0, waveReachedMs: 0, finished: false, members: new Set(memberIds) };
}

function spawnPositions(map: MapData, anchor: Position, count: number): Position[] {
  const out: Position[] = [];
  const taken = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const angle = random() * Math.PI * 2;
    const dist = SPAWN_MIN_DISTANCE + random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);
    const p = { x: Math.round(anchor.x + Math.cos(angle) * dist), y: Math.round(anchor.y + Math.sin(angle) * dist) };
    const key = `${p.x},${p.y}`;
    if (taken.has(key) || !isSpawnableTile(map, p)) continue;
    taken.add(key);
    out.push(p);
  }
  return out;
}

/** § 55.2：一般波從段位怪物池各自抽、王波出輪替中的王；強化詞綴數依波次 */
export function buildArenaWave(run: ArenaRunState, map: MapData, anchor: Position): MapMonster[] {
  const spec = getArenaTier(run.tier)!;
  const boss = isBossWave(run.wave);
  const pool = boss ? [arenaBossForWave(spec, run.wave)] : arenaNormalPool(spec);
  const affixCount = arenaAffixCount(run.wave);
  return spawnPositions(map, anchor, arenaWaveSize(run.wave, run.partySize)).map((position, i) => {
    const template = pool[Math.floor(random() * pool.length)];
    return {
      id: `arena-${run.runKey}-${run.wave}-${i}`,
      position, targetPosition: { ...anchor }, speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
      lastPathPlayerPos: { ...anchor }, isBoss: template.isBoss,
      arenaSpawn: { templateId: template.id!, affixCount },
    };
  });
}

/** 王波清完：在場且本場給票券的隊員各得 1 張（§ 55.3） */
function grantTickets(run: ArenaRunState, members: Session[]): void {
  const ticketId = ARENA_TICKET_ITEM_IDS[run.tier];
  if (ticketId == null) return;
  for (const s of members) {
    const gs = s.game.getState();
    if (!gs.arenaRun?.ticketRun) continue;
    s.game.setState({
      bagItems: addBagItem(gs.bagItems, ticketId, 1),
      arenaRun: { ...gs.arenaRun, tickets: gs.arenaRun.tickets + 1 },
    });
    gs.pushSystemLog(`打倒第 ${run.wave} 波的王，獲得 T${run.tier} 競技場票券`);
  }
}

/** HUD 欄位寫回各在場隊員 */
function syncHud(run: ArenaRunState, members: Session[], monstersLeft: number): void {
  for (const s of members) {
    const ar = s.game.getState().arenaRun;
    if (!ar) continue;
    if (ar.wave === run.wave && ar.monstersLeft === monstersLeft && Math.floor(ar.elapsedMs / 1000) === Math.floor(run.elapsedMs / 1000)) continue;
    s.game.setState({ arenaRun: { ...ar, wave: run.wave, monstersLeft, elapsedMs: run.elapsedMs } });
  }
}

/**
 * 每 tick 一次（取代一般生成）：無人在場時暫停計時；本實例尚未生出當前波次時生出（含斷線回來重打，§ 55.6）；
 * 場上清空即結算該波，王波發票券，打完第 100 波全員離場。
 */
export function tickArenaRun(deltaMs: number, instance: MapInstance, map: MapData): void {
  const run = instance.arena;
  if (!run || run.finished) return;
  const members = presentMembers(instance);
  if (members.length === 0) return;
  run.elapsedMs += deltaMs;
  const store = instance.mapMonster.getState();

  if (instance.arenaSpawnedWave !== run.wave) {
    const wave = buildArenaWave(run, map, members[0].mapControl.getState().playerPosition);
    store.setMonsters(wave);
    instance.arenaSpawnedWave = run.wave;
    syncHud(run, members, wave.length);
    return;
  }

  if (store.monsters.length > 0) {
    syncHud(run, members, store.monsters.length);
    return;
  }

  if (isBossWave(run.wave)) grantTickets(run, members);
  if (run.wave >= ARENA_MAX_WAVE) {
    run.finished = true;
    for (const s of members) leaveArenaRun(s, 'finish');
    return;
  }
  run.wave++;
  run.waveReachedMs = run.elapsedMs;
}

/** § 55.7 排行榜時間：到達最後波次的時間；打完 100 波為打完的時間 */
export function arenaRecordTimeMs(run: ArenaRunState): number {
  return run.finished ? run.elapsedMs : run.waveReachedMs;
}

/** 死亡與打完 100 波回到進場前的城鎮；不是城鎮（資料異常）時退回最近的城鎮 */
function returnTownOf(session: Session): string {
  const gs = session.game.getState();
  const back = gs.arenaRun ? getRegion(gs.arenaRun.returnRegion) : undefined;
  return back?.type === 'town' ? back.id : getNearestTown(gs.character!.currentRegion).id;
}

/** 傳送到指定區域（同回城卷軸改的欄位，`gameStore.useTownScroll`）；載圖由 `syncWorld` 處理 */
export function relocateToRegion(session: Session, regionId: string): void {
  const gs = session.game.getState();
  const char = gs.character;
  if (!char) return;
  const zone = ZONES.find(z => z.regions.includes(regionId)) ?? ZONES.find(z => z.id === getRegion(regionId)?.zoneId);
  session.game.setState({
    character: {
      ...char, currentArea: regionId, currentRegion: regionId, currentFloor: null,
      currentZone: zone?.id ?? char.currentZone, mapPositionX: undefined, mapPositionY: undefined,
      areaEnteredAt: gameNow(), areaKills: 0,
    },
  });
}

/**
 * 隊員離場（§ 55.5）：撤退保留票券（傳送由回城卷軸處理）；死亡收回本場票券的一半並回城；
 * 打完 100 波保留票券並回城。寫排行榜紀錄、清除角色身上的場次。
 */
export function leaveArenaRun(session: Session, reason: ArenaExitReason): void {
  const gs = session.game.getState();
  const ar = gs.arenaRun;
  const char = gs.character;
  if (!ar || !char) return;
  const run = session.instance?.arena?.runKey === ar.runKey ? session.instance.arena : undefined;

  let bagItems = gs.bagItems;
  const ticketId = ARENA_TICKET_ITEM_IDS[ar.tier];
  if (reason === 'death' && ticketId != null) {
    const loss = Math.min(arenaDeathTicketLoss(ar.tickets), getBagItemAmount(bagItems, ticketId));
    if (loss > 0) {
      bagItems = consumeBagItem(bagItems, ticketId, loss);
      gs.pushSystemLog(`競技場內死亡，收回 ${loss} 張 T${ar.tier} 競技場票券`);
    }
  }
  if (reason !== 'retreat') relocateToRegion(session, returnTownOf(session));
  session.game.setState({ arenaRun: null, bagItems });

  if (run) {
    run.members.delete(memberIdOf(session));
    run.onExit?.({
      characterId: char.id!, name: char.name, className: char.className, tier: ar.tier,
      party: run.partySize > 1, wave: run.wave, timeMs: arenaRecordTimeMs(run), reason,
    });
  }
  session.game.getState().saveState();
}

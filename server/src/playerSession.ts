/**
 * 一個連線一個 session（`97-selfhosted-server.md` § 97.6）：六個 store 的獨立實例、迴圈狀態、戰鬥狀態。
 * 進入地圖的流程與 client `BattleView` 相同（載圖、Boss 池、自動移動）。
 */
import type { Session } from '../../client/src/stores/session';
import { createLoopState } from '../../client/src/stores/session';
import { createGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../../client/src/stores/gameStore';
import { createMapControlStore } from '../../client/src/stores/mapControlStore';
import { createMapMonsterStore } from '../../client/src/stores/mapMonsterStore';
import { createCombatCommandStore } from '../../client/src/stores/combatCommandStore';
import { createTalentStore } from '../../client/src/stores/talentStore';
import { createMailboxStore } from '../../client/src/stores/mailboxStore';
import { createPartyStore } from '../../client/src/stores/partyStore';
import { createTradeStore } from '../../client/src/stores/tradeStore';
import { createCombatState, loadAreaTemplates, resetCombat } from '../../client/src/systems/combatLoop';
import { attachInstance, createMapInstance } from '../../client/src/systems/mapInstance';
import { getRegion, getFloor } from '../../client/src/models/mapData';
import type { GameRepository } from '../../client/src/db/repository';
import type { ServerMessage, StoreKey } from '../../client/src/net/protocol';

/** 世界層的回呼（`world.ts`）：進出地圖時安置到正確的實例 */
export interface WorldHooks {
  place: (session: PlayerSession, reason: 'map' | 'party') => void;
  remove: (session: PlayerSession) => void;
}

export interface PlayerSession extends Session {
  connectionId: number;
  world: WorldHooks | null;
  userId: number | null;
  username: string | null;
  token: string | null;
  remoteAddress: string;
  send: (msg: ServerMessage) => void;
  /** 由 `ws.ts` 在連線建立時掛上；管理介面踢除連線用 */
  close: (code: number, reason: string) => void;
  /** 上次推送給 client 的各 store 頂層值，delta 以參照比對 */
  lastSent: Record<StoreKey, Record<string, unknown>>;
  /** 已載入的地圖鍵（region|floor），用來偵測換區 */
  loadedWorldKey: string | null;
  worldLoading: boolean;
}

let nextConnectionId = 1;

export function createPlayerSession(repo: GameRepository, remoteAddress: string, send: (msg: ServerMessage) => void): PlayerSession {
  const s = {
    connectionId: nextConnectionId++,
    world: null,
    userId: null,
    username: null,
    token: null,
    remoteAddress,
    send,
    close: (() => {}) as PlayerSession['close'],
    lastSent: { game: {}, mapControl: {}, mapMonster: {}, talent: {}, mailbox: {}, party: {}, trade: {} },
    loadedWorldKey: null,
    worldLoading: false,
    repo,
    loop: createLoopState(),
    combat: createCombatState(),
  } as unknown as PlayerSession;
  s.game = createGameStore(s);
  s.mapControl = createMapControlStore(s);
  s.mapMonster = createMapMonsterStore(s);
  s.combatCommand = createCombatCommandStore(s);
  s.talent = createTalentStore(s);
  s.mailbox = createMailboxStore(s);
  s.party = createPartyStore(s);
  s.trade = createTradeStore(s);
  attachInstance(s, createMapInstance(`private:${s.connectionId}`, s.mapMonster));
  return s;
}

export function worldKeyOf(session: PlayerSession): string | null {
  const char = session.game.getState().character;
  if (!char) return null;
  return `${char.currentRegion}|${char.currentFloor ?? ''}`;
}

/** 角色所在區域與已載入地圖不同時載圖；與 client `BattleView` 的 effect 同一套流程 */
export async function syncWorld(session: PlayerSession): Promise<void> {
  const key = worldKeyOf(session);
  if (key === null) {
    if (session.loadedWorldKey !== null) {
      session.loadedWorldKey = null;
      session.world?.remove(session);
      session.mapControl.setState({ currentMap: null });
      resetCombat(session);
      session.mapMonster.getState().clearAll();
    }
    return;
  }
  if (key === session.loadedWorldKey || session.worldLoading) return;
  session.worldLoading = true;
  try {
    const character = session.game.getState().character!;
    const savedPos = (character.mapPositionX != null && character.mapPositionY != null)
      ? { x: character.mapPositionX, y: character.mapPositionY }
      : null;
    session.world?.remove(session);
    resetCombat(session);
    await session.mapControl.getState().loadMap(character.currentRegion, character.currentFloor, savedPos);
    session.combatCommand.getState().clear();

    const region = getRegion(character.currentRegion);
    const hasFloors = region?.floors && region.floors.length > 0;
    const areaId = hasFloors && character.currentFloor != null
      ? `${character.currentRegion}-${character.currentFloor}f`
      : character.currentRegion;
    if (region?.floors && character.currentFloor != null) {
      const floor = getFloor(character.currentRegion, character.currentFloor);
      session.mapMonster.getState().setHasBossInPool(floor?.isBossFloor ?? false);
    } else {
      const monsters = await session.repo.listMonsterTemplates(areaId);
      session.mapMonster.getState().setHasBossInPool(monsters.some(m => m.isBoss));
    }
    loadAreaTemplates(areaId, session);

    session.loadedWorldKey = key;
    session.world?.place(session, 'map');
    applyAutoMove(session);
  } finally {
    session.worldLoading = false;
  }
}

/** `searchMode === 'auto'` 且在探索中才自動移動；低於門檻先暫停等回復 */
export function applyAutoMove(session: PlayerSession): void {
  const gs = session.game.getState();
  const ch = gs.character;
  if (!ch || !session.mapControl.getState().currentMap) return;
  if (gs.searchMode === 'auto' && gs.phase === 'explore') {
    const effMaxHp = getEffectiveMaxHp(ch, gs.equippedGear);
    const effMaxMp = getEffectiveMaxMp(ch, gs.equippedGear);
    const hpPct = (ch.hp / effMaxHp) * 100;
    const mpPct = effMaxMp > 0 ? (ch.mp / effMaxMp) * 100 : 100;
    const alreadyPaused = session.mapControl.getState().paused;
    if (alreadyPaused || hpPct <= gs.afterCombatHpThreshold || mpPct <= gs.afterCombatMpThreshold) {
      session.mapControl.getState().setPaused(true);
    }
    session.mapControl.getState().setAutoMove(true);
  } else if (gs.phase !== 'combat') {
    session.mapControl.getState().setAutoMove(false);
  }
}

const MIRRORED: StoreKey[] = ['game', 'mapControl', 'mapMonster', 'talent', 'mailbox', 'party', 'trade'];

/** 各 store 頂層鍵以參照比對，只推送變動的鍵；函式不推送 */
export function collectPatches(session: PlayerSession): Array<{ store: StoreKey; data: Record<string, unknown> }> {
  const patches: Array<{ store: StoreKey; data: Record<string, unknown> }> = [];
  for (const key of MIRRORED) {
    const state = session[key].getState() as unknown as Record<string, unknown>;
    const last = session.lastSent[key];
    const data: Record<string, unknown> = {};
    let changed = false;
    for (const [k, v] of Object.entries(state)) {
      if (typeof v === 'function') continue;
      if (last[k] !== v) {
        data[k] = v;
        last[k] = v;
        changed = true;
      }
    }
    if (changed) patches.push({ store: key, data });
  }
  return patches;
}

export function resetPatches(session: PlayerSession): void {
  session.lastSent = { game: {}, mapControl: {}, mapMonster: {}, talent: {}, mailbox: {}, party: {}, trade: {} };
}

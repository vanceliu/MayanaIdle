/**
 * 狀態同步（`97-selfhosted-server.md` § 97.2「狀態同步」）：每個 session 記錄上次送出的內容，
 * 每次推送只組一則 `frame`。
 */
import { gameNow } from '../../client/src/core/clock';
import { castProgress } from '../../client/src/systems/monsterCombatFSM';
import type {
  CombatDelta, CombatInstanceView, ServerMessage, StoreDelta, StoreKey,
} from '../../client/src/net/protocol';
import { FIELD_ENCODING, appendedTail, changedFields, toMonsterWire } from '../../client/src/net/syncCodec';
import type { MonsterInstance } from '../../client/src/models/monster';
import type { MapMonster } from '../../client/src/stores/mapMonsterStore';
import type { Session } from '../../client/src/stores/session';

export const MIRRORED: StoreKey[] = ['game', 'mapControl', 'mapMonster', 'talent', 'mailbox', 'party', 'trade'];

export interface SyncState {
  /** 各 store 上次送出的頂層值（參照比對） */
  stores: Record<StoreKey, Record<string, unknown>>;
  /** `monsters` 編碼欄位上次送出的 JSON，鍵為 `store.field` */
  wire: Map<string, string>;
  combat: CombatSyncState;
}

interface CombatSyncState {
  started: boolean;
  monsters: Map<string, { currentHp: number; maxHp: number }>;
  target: string | null;
  cast: string;
}

export interface SyncedSession extends Session {
  sync: SyncState;
}

export function createSyncState(): SyncState {
  return {
    stores: { game: {}, mapControl: {}, mapMonster: {}, talent: {}, mailbox: {}, party: {}, trade: {} },
    wire: new Map(),
    combat: { started: false, monsters: new Map(), target: null, cast: '' },
  };
}

/** 下一次推送改送完整狀態 */
export function resetSync(session: SyncedSession): void {
  session.sync = createSyncState();
}

function addTo(delta: StoreDelta, kind: keyof StoreDelta, field: string, value: unknown): void {
  ((delta[kind] ??= {}) as Record<string, unknown>)[field] = value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 單一欄位的變動編碼；沒有變動回傳 null。
 * `merge`／`append` 欄位與上次送出時的淺拷貝比對：遊戲邏輯會就地改寫角色欄位（如 `character.hp`），
 * 留參照的話上次送出的值會跟著被改掉。
 */
function encodeField(session: SyncedSession, key: StoreKey, field: string, value: unknown, delta: StoreDelta): boolean {
  const last = session.sync.stores[key];
  const prev = last[field];
  const seen = field in last;
  switch (FIELD_ENCODING[key]?.[field]) {
    case 'merge': {
      if (!isPlainObject(value)) {
        if (seen && prev === value) return false;
        last[field] = value;
        addTo(delta, 'set', field, value);
        return true;
      }
      const diff = seen && isPlainObject(prev) ? changedFields(prev, value) : null;
      if (diff && Object.keys(diff).length === 0) return false;
      last[field] = { ...value };
      if (diff) addTo(delta, 'merge', field, diff);
      else addTo(delta, 'set', field, value);
      return true;
    }
    case 'append': {
      if (!Array.isArray(value)) {
        if (seen && prev === value) return false;
        last[field] = value;
        addTo(delta, 'set', field, value);
        return true;
      }
      const items = seen && Array.isArray(prev) ? appendedTail(prev, value) : null;
      if (items && items.length === 0 && value.length === (prev as unknown[]).length) return false;
      last[field] = value.slice();
      if (items) addTo(delta, 'append', field, { items, length: value.length });
      else addTo(delta, 'set', field, value);
      return true;
    }
    case 'monsters': {
      if (seen && prev === value) return false;
      last[field] = value;
      const wire = (value as MapMonster[]).map(toMonsterWire);
      const json = JSON.stringify(wire);
      const wireKey = `${key}.${field}`;
      if (session.sync.wire.get(wireKey) === json) return false;
      session.sync.wire.set(wireKey, json);
      addTo(delta, 'set', field, wire);
      return true;
    }
    default:
      if (seen && prev === value) return false;
      last[field] = value;
      addTo(delta, 'set', field, value);
      return true;
  }
}

/** 各 store 頂層鍵依 `FIELD_ENCODING` 編碼，只收有變動的欄位；函式不推送 */
export function collectStoreDeltas(session: SyncedSession): Partial<Record<StoreKey, StoreDelta>> | null {
  let result: Partial<Record<StoreKey, StoreDelta>> | null = null;
  for (const key of MIRRORED) {
    const state = session[key].getState() as unknown as Record<string, unknown>;
    const delta: StoreDelta = {};
    let changed = false;
    for (const [field, value] of Object.entries(state)) {
      if (typeof value === 'function') continue;
      if (encodeField(session, key, field, value, delta)) changed = true;
    }
    if (changed) (result ??= {})[key] = delta;
  }
  return result;
}

function instanceView(id: string, inst: MonsterInstance): CombatInstanceView {
  return {
    id, name: inst.name, level: inst.level, currentHp: inst.currentHp, maxHp: inst.maxHp,
    isBoss: inst.isBoss, element: inst.element, attackType: inst.attackType,
    isTrainingDummy: inst.isTrainingDummy,
  };
}

/** 怪物戰鬥狀態的變動；沒有角色時不送 */
export function collectCombatDelta(session: SyncedSession): CombatDelta | null {
  if (!session.game.getState().character) return null;
  const sent = session.sync.combat;
  const { engine, monsterInstances } = session.combat;
  const delta: CombatDelta = {};
  let changed = false;

  if (!sent.started) {
    sent.started = true;
    delta.full = true;
    changed = true;
  }

  for (const [id, inst] of monsterInstances) {
    const prev = sent.monsters.get(id);
    if (!prev || prev.maxHp !== inst.maxHp) {
      (delta.add ??= []).push(instanceView(id, inst));
    } else if (prev.currentHp !== inst.currentHp) {
      (delta.hp ??= {})[id] = inst.currentHp;
    } else {
      continue;
    }
    sent.monsters.set(id, { currentHp: inst.currentHp, maxHp: inst.maxHp });
    changed = true;
  }
  for (const id of [...sent.monsters.keys()]) {
    if (monsterInstances.has(id)) continue;
    sent.monsters.delete(id);
    (delta.remove ??= []).push(id);
    changed = true;
  }

  const target = engine.playerCtx.targetMonsterId ?? null;
  if (delta.full || target !== sent.target) {
    sent.target = target;
    delta.target = target;
    changed = true;
  }

  const cast: Record<string, number> = {};
  for (const [id, m] of engine.monsters) {
    const p = castProgress(m.combatCtx);
    if (p !== null && p !== undefined) cast[id] = p as number;
  }
  const castJson = JSON.stringify(cast);
  if (delta.full || castJson !== sent.cast) {
    sent.cast = castJson;
    delta.cast = cast;
    changed = true;
  }

  return changed ? delta : null;
}

/**
 * 組一則 `frame`。`tick` 推送帶 `now`、怪物戰鬥狀態與演出，有角色時必送（心跳）；
 * 操作回應的推送只帶 store 變動，沒有變動就不送。
 */
export function buildFrame(session: SyncedSession, tick: { visuals: unknown[] } | null): ServerMessage | null {
  const stores = collectStoreDeltas(session);
  if (!tick) return stores ? { t: 'frame', stores } : null;
  const combat = collectCombatDelta(session);
  const hasCharacter = !!session.game.getState().character;
  if (!stores && !hasCharacter && tick.visuals.length === 0) return null;
  const frame: Extract<ServerMessage, { t: 'frame' }> = { t: 'frame', now: gameNow() };
  if (stores) frame.stores = stores;
  if (combat) frame.combat = combat;
  if (tick.visuals.length > 0) frame.visuals = tick.visuals;
  return frame;
}

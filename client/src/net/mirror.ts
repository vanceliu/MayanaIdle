/**
 * store 鏡像：server 推送的 `frame` 還原後 `setState` 進 client 的 store，
 * store 上的 action 換成 RPC 代理（`97-selfhosted-server.md` § 97.2：client 無遊戲邏輯）。
 */
import type { StoreApi } from 'zustand';
import type { MonsterInstance } from '../models/monster';
import { defaultSession } from '../stores/session';
import type { GameState } from '../stores/gameStore';
import { createCombatState } from '../systems/combatLoop';
import type { CombatVisual } from '../systems/combatLoop';
import {
  ACTION_ALLOWLIST, type ActionStore, type CombatDelta, type MonsterWire, type ServerMessage, type StoreDelta, type StoreKey,
} from './protocol';
import { FIELD_ENCODING, applyAppend, fromMonsterWire } from './syncCodec';
import type { MapMonster } from '../stores/mapMonsterStore';
import { useChatStore } from '../stores/chatStore';
import { useNoticeStore } from '../stores/noticeStore';
import '../stores/guildStore';
import { TICK_MS, setClockSource } from '../core/clock';
import type { GameConnection } from './connection';
import { afterServerFrame, applyingServerStores, beforeServerFrame, captureLocalActions, captureRemoteActions } from './trainingSandbox';

/**
 * 上次收到 server tick 的時間（渲染插值用）。
 *
 * 心跳是帶 `now` 的 tick `frame` —— 它每個 tick 都送（有角色時），而位置只在值有變才送。
 * 綁在 `mapControl` 的位置上會出現：玩家站著不動 → 沒有位置更新 → `alpha` 卡在 1 →
 * 怪物每個 tick 直接跳一格的距離（看起來就是每 300ms 位移幾個 px 的頓挫）。
 */
let lastTickAt = 0;
/** 最後一次收到的 server 遊戲時間（`gameNow()`） */
let serverNow = 0;
let castByMonster: Record<string, number> = {};
const visualQueue: CombatVisual[] = [];

export function mirrorLastTickAt(): number {
  return lastTickAt;
}

/**
 * 線上模式的遊戲時間（`97-selfhosted-server.md` § 97.6）。
 *
 * client 不跑模擬，所以沒有人推進本機時鐘 —— 少了這個來源，`gameNow()` 永遠是 0，
 * 冷卻指針、停留時間、buff 倒數全部算不出來（而且不會報錯）。
 *
 * 兩個 tick 之間以真實時間往前推，但**最多只跑一個 tick**：
 * 心跳晚到時寧可停在邊界，也不要越過之後再倒退。
 */
export function mirrorGameNow(): number {
  return serverNow + Math.min(performance.now() - lastTickAt, TICK_MS);
}

export function mirrorCastProgress(monsterId: string): number | undefined {
  return castByMonster[monsterId];
}

export function drainMirrorVisuals(): CombatVisual[] {
  if (visualQueue.length === 0) return [];
  return visualQueue.splice(0, visualQueue.length);
}

function storeOf(key: StoreKey): StoreApi<object> {
  return defaultSession[key] as unknown as StoreApi<object>;
}

function applyStoreDelta(key: StoreKey, delta: StoreDelta): void {
  const store = storeOf(key);
  const current = store.getState() as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(delta.set ?? {})) {
    next[field] = FIELD_ENCODING[key]?.[field] === 'monsters'
      ? fromMonsterWire(value as MonsterWire[], current[field] as MapMonster[])
      : value;
  }
  for (const [field, diff] of Object.entries(delta.merge ?? {})) {
    next[field] = { ...(current[field] as Record<string, unknown>), ...diff };
  }
  for (const [field, append] of Object.entries(delta.append ?? {})) {
    next[field] = applyAppend(current[field] as unknown[] | undefined, append);
  }
  store.setState(next);
}

/** 這個 tick 沒有怪物位置更新：怪物沒動，插值起點對齊目前位置 */
function settleMonsterPrevPositions(): void {
  const store = defaultSession.mapMonster;
  const monsters = store.getState().monsters;
  if (!monsters.some(m => m.prevPosition !== m.position)) return;
  store.setState({ monsters: monsters.map(m => ({ ...m, prevPosition: m.position })) });
}

function applyCombatDelta(delta: CombatDelta): void {
  const combat = defaultSession.combat ?? (defaultSession.combat = createCombatState());
  if (delta.full) combat.monsterInstances.clear();
  for (const v of delta.add ?? []) {
    combat.monsterInstances.set(v.id, {
      templateId: 0, name: v.name, level: v.level, currentHp: v.currentHp, maxHp: v.maxHp,
      attackMin: 0, attackMax: 0, defense: 0, exp: 0, race: 'normal', size: 'small',
      element: v.element, isBoss: v.isBoss, attackType: v.attackType, attackRange: 1.5, attackInterval: 1200,
      isTrainingDummy: v.isTrainingDummy,
    } as MonsterInstance);
  }
  for (const [id, hp] of Object.entries(delta.hp ?? {})) {
    const existing = combat.monsterInstances.get(id);
    if (existing) existing.currentHp = hp;
  }
  for (const id of delta.remove ?? []) combat.monsterInstances.delete(id);
  if (delta.target !== undefined) combat.engine.playerCtx.targetMonsterId = delta.target;
  if (delta.cast !== undefined) castByMonster = delta.cast;
}

/** 狀態同步（`97-selfhosted-server.md` § 97.2「狀態同步」） */
function applyFrame(received: Extract<ServerMessage, { t: 'frame' }>): void {
  // 試驗場本機沙盒（§ 97.2）：沙盒中只套用非戰鬥執行期的欄位
  const frame = beforeServerFrame(received);
  applyingServerStores(() => {
    for (const [key, delta] of Object.entries(frame.stores ?? {})) applyStoreDelta(key as StoreKey, delta);
  });
  if (frame.now !== undefined) {
    // tick 推送是插值與對時的原點
    lastTickAt = performance.now();
    serverNow = frame.now;
    if (!frame.stores?.mapMonster?.set?.monsters) settleMonsterPrevPositions();
  }
  if (frame.combat) applyCombatDelta(frame.combat);
  if (frame.visuals) visualQueue.push(...(frame.visuals as CombatVisual[]));
  afterServerFrame();
}

export function applyServerMessage(msg: ServerMessage): void {
  switch (msg.t) {
    case 'frame':
      applyFrame(msg);
      return;
    case 'chat':
      useChatStore.getState().receive(msg.message, defaultSession.game.getState().character?.id);
      return;
    /*
     * server 公告（§ 97.8）：橫幅 ＋ 系統紀錄各留一份。
     * 只放橫幅的話，關服倒數會在玩家切走視窗時完全錯過；只寫紀錄則會被戰鬥洗掉。
     */
    case 'notice':
      useNoticeStore.getState().show(msg.text);
      defaultSession.game.getState().pushSystemLog(msg.text);
      return;
    default:
      return;
  }
}

/** 角色選擇流程走專用訊息，不是 store action */
const SPECIAL_GAME_ACTIONS: Record<string, (conn: GameConnection, args: unknown[]) => unknown> = {
  initUser: () => undefined,
  loadCharacter: () => undefined,
  loadCharacterList: conn => conn.send({ t: 'characters' }),
  selectCharacter: (conn, [id]) => conn.send({ t: 'select_character', id: id as number }),
  deleteCharacter: (conn, [id]) => conn.send({ t: 'delete_character', id: id as number }),
  createCharacter: (conn, [name, className, bonusAttrs, appearance]) =>
    conn.send({ t: 'create_character', name: name as string, className: className as string, bonusAttrs: bonusAttrs as Record<string, number>, appearance }),
  logout: conn => conn.send({ t: 'leave_character' }),
  ensureAuthToken: () => undefined,
  uploadOwnStats: () => undefined,
};

/** 遠端 action：失敗時寫一行本機系統訊息，錯誤照常拋給呼叫端（`97-selfhosted-server.md` § 97.2） */
function remoteAction(conn: GameConnection, store: ActionStore, name: string, args: unknown[]): Promise<unknown> {
  return conn.rpc(store, name, args).catch((e: unknown) => {
    defaultSession.game.getState().pushSystemLog(e instanceof Error && e.message ? e.message : '操作失敗');
    throw e;
  });
}

export function installOnlineProxies(conn: GameConnection): void {
  // 時間一律跟著 server 走
  setClockSource(mirrorGameNow);
  captureLocalActions();
  const game = defaultSession.game as unknown as StoreApi<Record<string, unknown>>;
  const gamePatch: Record<string, unknown> = {};
  for (const [name, handler] of Object.entries(SPECIAL_GAME_ACTIONS)) {
    gamePatch[name] = async (...args: unknown[]) => handler(conn, args);
  }
  // 不在允許清單的 game action 在線上模式留在本機執行。
  // 丟棄確認（request／cancel／confirm）必須留在允許清單：`confirmDiscard` 在 server 讀 `pendingDiscard`
  for (const name of ACTION_ALLOWLIST.game) {
    gamePatch[name] = (...args: unknown[]) => remoteAction(conn, 'game', name, args);
  }
  // 本機時鐘與迴圈 action 在線上模式全部無效化
  for (const name of ['startRegen', 'stopRegen', 'tickRegen', 'startPersistentLoop', 'stopPersistentLoop', 'tickPersistent', 'runVillageScriptTick', 'startExploring', 'stopExploring']) {
    if (!(name in gamePatch)) gamePatch[name] = () => undefined;
  }
  game.setState(gamePatch as Partial<GameState>);

  const proxyStore = (key: Exclude<ActionStore, 'game' | 'chat'>) => {
    const store = defaultSession[key] as unknown as StoreApi<Record<string, unknown>>;
    const patch: Record<string, unknown> = {};
    for (const name of ACTION_ALLOWLIST[key]) patch[name] = (...args: unknown[]) => remoteAction(conn, key, name, args);
    store.setState(patch);
  };
  proxyStore('mapControl');
  proxyStore('mapMonster');
  proxyStore('combatCommand');
  proxyStore('talent');
  proxyStore('mailbox');
  proxyStore('party');
  proxyStore('trade');
  proxyStore('guild');
  // 聊天：送出走 RPC，收訊由 `applyServerMessage` 進 chatStore
  const chat = useChatStore as unknown as StoreApi<Record<string, unknown>>;
  chat.setState({ send: (channel: unknown, text: unknown, target?: unknown) => conn.rpc('chat', 'send', [channel, text, target]) });
  captureRemoteActions();
}

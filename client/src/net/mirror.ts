/**
 * store 鏡像：server 推送的 `patch` 直接 `setState` 進 client 的 store，
 * store 上的 action 換成 RPC 代理（`97-selfhosted-server.md` § 97.2：client 無遊戲邏輯）。
 */
import type { StoreApi } from 'zustand';
import type { MonsterInstance } from '../models/monster';
import { defaultSession } from '../stores/session';
import type { GameState } from '../stores/gameStore';
import { createCombatState } from '../systems/combatLoop';
import type { CombatVisual } from '../systems/combatLoop';
import { ACTION_ALLOWLIST, type ActionStore, type ServerMessage, type StoreKey } from './protocol';
import { useChatStore } from '../stores/chatStore';
import { TICK_MS, setClockSource } from '../core/clock';
import type { GameConnection } from './connection';

/**
 * 上次收到 server tick 的時間（渲染插值用）。
 *
 * 心跳是 `combat` 訊息 —— 它每個 tick 都送（有角色時），而 `patch` 只在值有變才送。
 * 綁在 `mapControl` 的位置上會出現：玩家站著不動 → 沒有位置 patch → `alpha` 卡在 1 →
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

export function applyServerMessage(msg: ServerMessage): void {
  switch (msg.t) {
    case 'patch': {
      storeOf(msg.store).setState(msg.data as object);
      return;
    }
    case 'combat': {
      // 每個 tick 的最後一則訊息（`server/src/tick.ts` 的 `flush`），拿它當插值與對時的原點
      lastTickAt = performance.now();
      serverNow = msg.now;
      const combat = defaultSession.combat ?? (defaultSession.combat = createCombatState());
      const seen = new Set<string>();
      for (const v of msg.instances) {
        seen.add(v.id);
        const existing = combat.monsterInstances.get(v.id);
        if (existing) {
          existing.currentHp = v.currentHp;
          existing.maxHp = v.maxHp;
        } else {
          combat.monsterInstances.set(v.id, {
            templateId: 0, name: v.name, level: v.level, currentHp: v.currentHp, maxHp: v.maxHp,
            attackMin: 0, attackMax: 0, defense: 0, exp: 0, race: 'normal', size: 'small',
            element: v.element, isBoss: v.isBoss, attackType: v.attackType, attackRange: 1.5, attackInterval: 1200,
            isTrainingDummy: v.isTrainingDummy,
          } as MonsterInstance);
        }
      }
      for (const id of [...combat.monsterInstances.keys()]) if (!seen.has(id)) combat.monsterInstances.delete(id);
      combat.engine.playerCtx.targetMonsterId = msg.targetMonsterId;
      castByMonster = msg.cast;
      return;
    }
    case 'visuals':
      visualQueue.push(...(msg.events as CombatVisual[]));
      return;
    case 'chat':
      useChatStore.getState().receive(msg.message);
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

/** 純介面用的 action 留在本機 */
const LOCAL_GAME_ACTIONS = new Set(['setPhase', 'requestDiscard', 'cancelDiscard']);

/** 這些 action 的部分參數在 server 端自己查（不傳整包模板） */
const ARG_TRIM: Record<string, (args: unknown[]) => unknown[]> = {
  sellEquipmentInstances: args => [args[0]],
};

export function installOnlineProxies(conn: GameConnection): void {
  // 時間一律跟著 server 走
  setClockSource(mirrorGameNow);
  const game = defaultSession.game as unknown as StoreApi<Record<string, unknown>>;
  const gamePatch: Record<string, unknown> = {};
  for (const [name, handler] of Object.entries(SPECIAL_GAME_ACTIONS)) {
    gamePatch[name] = async (...args: unknown[]) => handler(conn, args);
  }
  for (const name of ACTION_ALLOWLIST.game) {
    if (LOCAL_GAME_ACTIONS.has(name)) continue;
    gamePatch[name] = (...args: unknown[]) => conn.rpc('game', name, (ARG_TRIM[name] ?? (a => a))(args));
  }
  // 本機時鐘與迴圈 action 在線上模式全部無效化
  for (const name of ['startRegen', 'stopRegen', 'tickRegen', 'startPersistentLoop', 'stopPersistentLoop', 'tickPersistent', 'runVillageScriptTick', 'startExploring', 'stopExploring']) {
    if (!(name in gamePatch)) gamePatch[name] = () => undefined;
  }
  game.setState(gamePatch as Partial<GameState>);

  const proxyStore = (key: Exclude<ActionStore, 'game' | 'chat'>) => {
    const store = defaultSession[key] as unknown as StoreApi<Record<string, unknown>>;
    const patch: Record<string, unknown> = {};
    for (const name of ACTION_ALLOWLIST[key]) patch[name] = (...args: unknown[]) => conn.rpc(key, name, args);
    store.setState(patch);
  };
  proxyStore('mapControl');
  proxyStore('mapMonster');
  proxyStore('combatCommand');
  proxyStore('talent');
  proxyStore('mailbox');
  proxyStore('party');
  proxyStore('trade');
  // 聊天：送出走 RPC，收訊由 `applyServerMessage` 進 chatStore
  const chat = useChatStore as unknown as StoreApi<Record<string, unknown>>;
  chat.setState({ send: (channel: unknown, text: unknown, target?: unknown) => conn.rpc('chat', 'send', [channel, text, target]) });
}

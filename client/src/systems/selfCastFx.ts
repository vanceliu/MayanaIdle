/**
 * 常駐腳本施放的自身技能 → 演出（`48-vfx.md` § 48.8.1）。
 *
 * 戰鬥腳本的 buff 走 ARPG 事件管線（`arpgEngine` → `player_attack`），
 * 常駐腳本直接在 `gameStore` 施放，碰不到渲染層；這個佇列是它唯一的橋。
 *
 * 佇列一個 session 一份（`session.loop.selfCastFx`）：本機由 `PixiGame` 每幀 drain，
 * server 由 `tickWorld` 轉成 `self_cast` 的 `CombatVisual` 推給實例全體成員。
 */
import { defaultSession } from '../stores/session';

export interface SelfCastFxEvent {
  skillId: string;
  /** 治癒實際回了多少 HP。buff 一律 0 */
  healed: number;
}

/** 佇列上限：渲染端沒掛載時沒有人 drain，滿了丟最舊的 */
const MAX_QUEUED = 8;

function queueOf(queue?: SelfCastFxEvent[]): SelfCastFxEvent[] {
  return queue ?? defaultSession.loop.selfCastFx;
}

export function pushSelfCastFx(event: SelfCastFxEvent, queue?: SelfCastFxEvent[]): void {
  const q = queueOf(queue);
  if (q.length >= MAX_QUEUED) q.shift();
  q.push(event);
}

/** 取走目前累積的全部，並清空 */
export function drainSelfCastFx(queue?: SelfCastFxEvent[]): SelfCastFxEvent[] {
  const q = queueOf(queue);
  if (q.length === 0) return [];
  return q.splice(0, q.length);
}

/** 換地圖／換角色時丟掉還沒演的 */
export function clearSelfCastFx(queue?: SelfCastFxEvent[]): void {
  queueOf(queue).length = 0;
}

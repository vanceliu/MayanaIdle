/**
 * 常駐腳本施放的自身技能 → 演出（`48-vfx.md` § 48.8.1）。
 *
 * **同一批 buff 有兩條施放路徑**：戰鬥腳本走 ARPG 事件管線
 * （`arpgEngine` → `player_attack` → `playPlayerAttackFx`），
 * 常駐腳本則直接寫在 `gameStore` 的 `setInterval` 裡 —— 那一層碰不到 Pixi。
 *
 * 這個佇列是常駐腳本唯一的橋。沒有它，常駐腳本放的 buff **一個特效都不會演**，
 * 而玩家的 buff 幾乎都設在常駐腳本上（它在探索與戰鬥中都會判定）。
 *
 * 寫法照 `gameLoop.ts` 的 `consumeDotTick()`：生產端 push，渲染端每幀 drain。
 */

export interface SelfCastFxEvent {
  skillId: string;
  /** 治癒實際回了多少 HP。buff 一律 0 */
  healed: number;
}

/**
 * 佇列上限。
 *
 * 渲染端沒掛載時（角色選擇、讀取中）沒有人 drain，
 * 而常駐迴圈每 300ms 就跑一次 —— 不設上限會無限長大，
 * 而且回到畫面時會一次爆出幾十個環。滿了丟最舊的。
 */
const MAX_QUEUED = 8;

const queue: SelfCastFxEvent[] = [];

export function pushSelfCastFx(event: SelfCastFxEvent): void {
  if (queue.length >= MAX_QUEUED) queue.shift();
  queue.push(event);
}

/** 取走目前累積的全部，並清空 */
export function drainSelfCastFx(): SelfCastFxEvent[] {
  if (queue.length === 0) return [];
  return queue.splice(0, queue.length);
}

/** 換地圖／換角色時丟掉還沒演的 —— 那是上一場的事 */
export function clearSelfCastFx(): void {
  queue.length = 0;
}

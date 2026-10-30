/**
 * 場上狀態特效的每幀同步（`48-vfx.md` § 48.8.2 染色、§ 48.8.3 暈眩標記）。
 *
 * 與 § 48.7 的一次性演出不同：這兩件事是**跟著 debuff 存續**的，
 * 所以不能在「施加的那一刻」放完就算，得每幀對一次帳。
 *
 * 判定的部分是純函式（可測），Pixi 的生老病死收在 `StatusMarkTracker`。
 */
import type { SkillFxManager } from './SkillFxManager';
import { resolveDebuffTint, type MarkKind } from './geometry';

/**
 * 一個目標身上「現在掛著哪些 debuff」。
 *
 * `tags` 攤平成一個陣列而不是逐個 effect —— 染色與標記都只看 tag，
 * 誰施加的、還剩幾秒都不影響畫面（那是 icon 列的事，§ 24.8）。
 */
export interface StatusFxTarget {
  /** 玩家固定是 `'player'`，怪物用它的 id */
  key: string;
  /** 腳下的螢幕座標 —— 標記自己會往頭上抬 */
  x: number;
  y: number;
  tags: readonly string[];
}

/** 暈眩的 tag（`24-buff-debuff.md` § 24.4.1） */
export const STUN_TAG = 'stunned';
/** 定身的 tag（`24-buff-debuff.md` § 24.5.1b） */
export const ROOT_TAG = 'rooted';

/**
 * 這個目標頭上該不該有標記，有的話是哪一種。
 *
 * 只給「看得出行為改變」的狀態（§ 48.8.3）——
 * 每種 debuff 都配一個標記的話，十隻怪各掛三個就是三十個小圖形。
 */
export function resolveStatusMark(tags: readonly string[]): MarkKind | null {
  /* 同時暈眩與定身時顯示暈眩：暈眩連攻擊都停了，是較強的那個 */
  if (tags.includes(STUN_TAG)) return 'stun';
  return tags.includes(ROOT_TAG) ? 'root' : null;
}

/** 這個目標的 sprite 該染成什麼色。`null` ＝ 不染 */
export function resolveStatusTint(tags: readonly string[]): number | null {
  return resolveDebuffTint(tags);
}

/**
 * 暈眩標記的生老病死。
 *
 * 標記是**唯一常駐的原型**，所以只有它需要記住「誰身上已經有一個了」——
 * 每幀重放會變成每幀生一個新的，一秒六十顆星星疊在同一個頭上。
 */
export class StatusMarkTracker {
  private readonly handles = new Map<string, { handle: number; kind: MarkKind }>();

  /**
   * 每幀呼叫一次，傳入**現在場上所有目標**的狀態。
   *
   * 沒出現在 `targets` 裡的（怪死了、換地圖了）會被收掉 ——
   * 靠「死亡時記得呼叫 remove」遲早會漏，漏掉就是一顆星星永遠留在畫面上。
   */
  sync(fx: SkillFxManager, targets: readonly StatusFxTarget[]): void {
    const seen = new Set<string>();

    for (const t of targets) {
      const kind = resolveStatusMark(t.tags);
      if (kind === null) continue;
      seen.add(t.key);

      const existing = this.handles.get(t.key);
      if (existing && existing.kind === kind) {
        /* 已經有了就只是跟著目標走 —— 怪會移動，標記不跟就會留在原地 */
        fx.move(existing.handle, t.x, t.y);
        continue;
      }
      if (existing) fx.stop(existing.handle);
      this.handles.set(t.key, {
        handle: fx.spawn({ prototype: 'mark', x: t.x, y: t.y, markKind: kind }),
        kind,
      });
    }

    for (const [key, cur] of [...this.handles]) {
      if (seen.has(key)) continue;
      fx.stop(cur.handle);
      this.handles.delete(key);
    }
  }

  /** 換地圖／重置時整批收掉 */
  clear(fx: SkillFxManager): void {
    for (const cur of this.handles.values()) fx.stop(cur.handle);
    this.handles.clear();
  }
}

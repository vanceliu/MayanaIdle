import type { Position } from '../models/mapControl';
import type { Skill } from '../models/skill';
import type { CombatAction } from '../models/scriptEngine';
import { getDistance } from './lineOfSight';

/**
 * 目標選取的純函式版本（`41-arpg-combat.md` § 3.4／§ 3.5）。
 *
 * 抽出來的理由：戰鬥腳本的「AoE 命中數」條件必須算出**和實際出手完全一樣**的命中集合，
 * 否則會出現「條件說會打到 3 隻、真的放下去只打到 1 隻」的落差。共用同一份實作才不會走鐘。
 */
export interface TargetCandidate {
  id: string;
  position: Position;
}

export interface ResolveTargetsParams {
  /** 只放活著的怪 */
  candidates: TargetCandidate[];
  playerPos: Position;
  /** FSM 選定的主目標；null／已死時退回最近的一隻 */
  primaryTargetId: string | null;
  action: CombatAction;
  skills: Skill[];
  /**
   * 這個動作自己的射程。主目標超出就回空陣列（不出手）。
   * 腳本條件預估命中數時要傳 `Infinity`：角色還在走位的路上就把射程 gate 套下去，
   * 條件會永遠不成立，追擊射程也跟著塌回武器射程。
   */
  maxRange: number;
}

/** 找出主目標：優先用 FSM 指定的，否則取最近的一隻 */
export function resolvePrimaryTarget(
  candidates: TargetCandidate[],
  playerPos: Position,
  primaryTargetId: string | null,
): string | null {
  if (candidates.length === 0) return null;

  if (primaryTargetId && candidates.some(c => c.id === primaryTargetId)) {
    return primaryTargetId;
  }

  let nearest: string | null = null;
  let minDist = Infinity;
  for (const c of candidates) {
    const d = getDistance(playerPos, c.position);
    if (d < minDist) {
      minDist = d;
      nearest = c.id;
    }
  }
  return nearest;
}

export function resolveActionTargets(params: ResolveTargetsParams): string[] {
  const { candidates, playerPos, action, skills, maxRange } = params;

  const primaryId = resolvePrimaryTarget(candidates, playerPos, params.primaryTargetId);
  if (!primaryId) return [];

  const primary = candidates.find(c => c.id === primaryId)!;
  // 主目標超出這個動作的射程就不出手（FSM 的追擊距離與出手判定是兩個數字）
  if (getDistance(playerPos, primary.position) > maxRange) return [];

  if (action.type === 'normal_attack') {
    return [primaryId];
  }

  if (action.type === 'skill' && action.skillId) {
    const skill = skills.find(s => s.id === action.skillId);
    if (!skill) return [primaryId];

    if (skill.target === 'single') {
      return [primaryId];
    }

    if (skill.target === 'aoe') {
      // 41-arpg-combat.md § 3.4/3.5：半徑、目標上限、圓心模式為三個獨立欄位
      const aoeRadius = skill.aoeRadius ?? 3;
      const maxTargets = skill.maxTargets ?? 1;

      // self 模式：以角色為圓心、範圍內全打（無數量上限）
      if (skill.aoeCenter === 'self') {
        return candidates
          .filter(c => getDistance(playerPos, c.position) <= aoeRadius)
          .map(c => c.id);
      }

      // target 模式：以主目標為圓心，依距離取最近的 maxTargets 隻
      const nearby = candidates
        .filter(c => c.id !== primaryId)
        .filter(c => getDistance(primary.position, c.position) <= aoeRadius)
        .sort((a, b) => getDistance(primary.position, a.position) - getDistance(primary.position, b.position))
        .slice(0, maxTargets - 1)
        .map(c => c.id);

      return [primaryId, ...nearby];
    }
  }

  return [primaryId];
}

// === 目標選擇策略（`51-auto-talent.md` § 51.4.9）===

/**
 * 切換目標用的候選。比 `TargetCandidate` 多帶判斷依據 ——
 * 「最低血」要看 HP、「指定種族」要看 race。
 */
export interface TargetPickCandidate extends TargetCandidate {
  hpPercent: number;
  race: string;
  element: string;
  /** 身上有哪些 debuff tag */
  debuffTags: string[];
}

export type TargetStrategy =
  | 'lowest_hp' | 'highest_hp' | 'farthest'
  | 'by_kind' | 'by_debuff' | 'by_lacking_debuff';

/**
 * 依策略挑一個目標，挑不到回 null（呼叫端維持原目標）。
 *
 * **不做射程判定**：切目標與打得到是兩件事 —— 切完之後角色會自己追過去，
 * 加上射程 gate 會讓「先切遠處的召喚者」永遠切不成。
 */
export function pickTargetBy(
  strategy: TargetStrategy,
  candidates: TargetPickCandidate[],
  playerPos: Position,
  match?: string,
): string | null {
  if (candidates.length === 0) return null;

  switch (strategy) {
    case 'lowest_hp':
      return minBy(candidates, c => c.hpPercent)?.id ?? null;
    case 'highest_hp':
      return minBy(candidates, c => -c.hpPercent)?.id ?? null;
    case 'farthest':
      return minBy(candidates, c => -getDistance(playerPos, c.position))?.id ?? null;
    case 'by_kind': {
      const hit = candidates.filter(c => c.race === match || c.element === match);
      // 同類有多隻時取最近的：切目標的意圖是「換一隻打」，不是「跑最遠那隻」
      return minBy(hit, c => getDistance(playerPos, c.position))?.id ?? null;
    }
    case 'by_debuff':
    case 'by_lacking_debuff': {
      const want = strategy === 'by_debuff';
      const hit = candidates.filter(c => (match ? c.debuffTags.includes(match) : c.debuffTags.length > 0) === want);
      return minBy(hit, c => getDistance(playerPos, c.position))?.id ?? null;
    }
    default:
      return null;
  }
}

function minBy<T>(items: T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    const s = score(item);
    if (s < bestScore) { bestScore = s; best = item; }
  }
  return best;
}

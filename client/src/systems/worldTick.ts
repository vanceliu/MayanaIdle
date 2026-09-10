/**
 * 全服一個 tick（`97-selfhosted-server.md` § 97.3、§ 97.7.1）：時鐘推進一次，
 * 每玩家與每實例的兩層依序跑完，演出事件依實例廣播給在場成員。
 *
 * 本機的 `gameLoopTick` ＋ `tickCombat` 是同一套順序在一人實例上的特例。
 */
import type { Session } from '../stores/session';
import { advanceMs } from '../core/clock';
import type { MapInstance } from './mapInstance';
import { memberIdOf, presentMembers } from './mapInstance';
import {
  snapshotPrevMonsterPositions, snapshotPrevPlayerPosition, tickInstanceWorld, tickPlayerPost, tickPlayerPre,
} from './gameLoop';
import { applyMonsterAttacks, tickInstanceCombat, tickMemberCombat, type CombatVisual } from './combatLoop';
import type { MonsterAttackEvent } from './arpgEngine';
import { drainSelfCastFx } from './selfCastFx';

export function tickWorld(deltaMs: number, sessions: Iterable<Session>, instances: Iterable<MapInstance>): Map<Session, CombatVisual[]> {
  advanceMs(deltaMs);
  const active: Session[] = [];
  for (const s of sessions) if (s.game.getState().character) active.push(s);
  const instanceList = [...instances];

  for (const s of active) snapshotPrevPlayerPosition(s);
  for (const i of instanceList) snapshotPrevMonsterPositions(i);

  for (const s of active) tickPlayerPre(deltaMs, s);
  for (const i of instanceList) tickInstanceWorld(deltaMs, i);
  for (const s of active) tickPlayerPost(deltaMs, s);

  const visualsByInstance = new Map<MapInstance, CombatVisual[]>();
  const pending = new Map<MapInstance, MonsterAttackEvent[]>();
  for (const i of instanceList) {
    visualsByInstance.set(i, []);
    pending.set(i, tickInstanceCombat(deltaMs, i));
  }
  for (const s of active) {
    const visuals = tickMemberCombat(deltaMs, s);
    const memberId = memberIdOf(s);
    for (const fx of drainSelfCastFx(s.loop.selfCastFx)) {
      visuals.push({ kind: 'self_cast', memberId, skillId: fx.skillId, healed: fx.healed });
    }
    // 死亡或換圖後 session 可能已換到別的實例；演出跟著出手當下的實例走
    const bucket = visualsByInstance.get(s.instance);
    if (bucket) bucket.push(...visuals);
  }
  for (const i of instanceList) {
    const events = pending.get(i) ?? [];
    if (events.length > 0) visualsByInstance.get(i)!.push(...applyMonsterAttacks(i, events));
  }

  const result = new Map<Session, CombatVisual[]>();
  for (const i of instanceList) {
    const visuals = visualsByInstance.get(i)!;
    for (const m of presentMembers(i)) result.set(m, visuals);
  }
  for (const s of active) if (!result.has(s)) result.set(s, []);
  return result;
}

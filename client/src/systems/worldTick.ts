/**
 * 全服一個 tick（`97-selfhosted-server.md` § 97.3、§ 97.7.1）：時鐘推進一次，
 * 每玩家與每實例的兩層依序跑完，演出事件依實例廣播給在場成員。
 *
 * 錯誤隔離（§ 97.2 硬性要求）：單一玩家或實例的步驟出錯，只跳過該對象本 tick 其餘步驟並回報 `TickFault`；
 * 只有一名在場玩家的實例出錯時，同時回報該玩家。
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

export type TickFault =
  | { kind: 'session'; session: Session; error: unknown }
  | { kind: 'instance'; instance: MapInstance; error: unknown };

export function tickWorld(
  deltaMs: number,
  sessions: Iterable<Session>,
  instances: Iterable<MapInstance>,
  onFault: (fault: TickFault) => void,
): Map<Session, CombatVisual[]> {
  advanceMs(deltaMs);
  const active: Session[] = [];
  for (const s of sessions) if (s.game.getState().character) active.push(s);
  const instanceList = [...instances];

  const faultedSessions = new Set<Session>();
  const faultedInstances = new Set<MapInstance>();
  const faultSession = (session: Session, error: unknown) => {
    if (faultedSessions.has(session)) return;
    faultedSessions.add(session);
    onFault({ kind: 'session', session, error });
  };
  const forSession = (s: Session, step: () => void) => {
    if (faultedSessions.has(s)) return;
    try {
      step();
    } catch (error) {
      faultSession(s, error);
    }
  };
  const forInstance = (i: MapInstance, step: () => void) => {
    if (faultedInstances.has(i)) return;
    try {
      step();
    } catch (error) {
      faultedInstances.add(i);
      onFault({ kind: 'instance', instance: i, error });
      const present = presentMembers(i);
      if (present.length === 1) faultSession(present[0], error);
    }
  };

  for (const s of active) forSession(s, () => snapshotPrevPlayerPosition(s));
  for (const i of instanceList) forInstance(i, () => snapshotPrevMonsterPositions(i));

  for (const s of active) forSession(s, () => tickPlayerPre(deltaMs, s));
  for (const i of instanceList) forInstance(i, () => tickInstanceWorld(deltaMs, i));
  for (const s of active) forSession(s, () => tickPlayerPost(deltaMs, s));

  const visualsByInstance = new Map<MapInstance, CombatVisual[]>();
  const pending = new Map<MapInstance, MonsterAttackEvent[]>();
  for (const i of instanceList) {
    visualsByInstance.set(i, []);
    forInstance(i, () => pending.set(i, tickInstanceCombat(deltaMs, i)));
  }
  for (const s of active) {
    forSession(s, () => {
      const visuals = tickMemberCombat(deltaMs, s);
      const memberId = memberIdOf(s);
      for (const fx of drainSelfCastFx(s.loop.selfCastFx)) {
        visuals.push({ kind: 'self_cast', memberId, skillId: fx.skillId, healed: fx.healed });
      }
      // 死亡或換圖後 session 可能已換到別的實例；演出跟著出手當下的實例走
      const bucket = visualsByInstance.get(s.instance);
      if (bucket) bucket.push(...visuals);
    });
  }
  for (const i of instanceList) {
    const events = pending.get(i) ?? [];
    if (events.length > 0) forInstance(i, () => visualsByInstance.get(i)!.push(...applyMonsterAttacks(i, events)));
  }

  const result = new Map<Session, CombatVisual[]>();
  for (const i of instanceList) {
    const visuals = visualsByInstance.get(i)!;
    for (const m of presentMembers(i)) result.set(m, visuals);
  }
  for (const s of active) if (!result.has(s)) result.set(s, []);
  return result;
}

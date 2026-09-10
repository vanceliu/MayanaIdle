/**
 * 地圖實例的生命週期（`97-selfhosted-server.md` § 97.7.1）。實例以（隊伍鍵，地圖）為鍵；
 * 一人隊伍的鍵為 `solo:<角色 id>`。
 */
import type { Session } from '../../client/src/stores/session';
import {
  attachInstance, createMapInstance, detachInstance, type MapInstance,
} from '../../client/src/systems/mapInstance';

export function instanceKey(partyKey: string, regionId: string, floor: number | null): string {
  return `${partyKey}|${regionId}|${floor ?? ''}`;
}

export class InstanceManager {
  private readonly byKey = new Map<string, MapInstance>();

  all(): Iterable<MapInstance> {
    return this.byKey.values();
  }

  get(key: string): MapInstance | undefined {
    return this.byKey.get(key);
  }

  count(): number {
    return this.byKey.size;
  }

  /**
   * 把 session 放進鍵值對應的實例。
   *
   * | 情況 | 行為 |
   * |---|---|
   * | 已在該實例 | 不動 |
   * | 該鍵已有實例 | 切入（`respawn` 時於地圖入口重生）；原實例只剩自己則銷毀 |
   * | 該鍵沒有實例，原實例只有自己 | 原實例直接改鍵（位置、怪物、Pressure 不變） |
   * | 該鍵沒有實例，原實例還有別人 | 離開原實例，新建 |
   */
  place(session: Session, key: string, respawn: boolean): MapInstance {
    const current = session.instance;
    if (current && current.key === key && this.byKey.get(key) === current) return current;

    const existing = this.byKey.get(key);
    if (existing) {
      this.release(session);
      attachInstance(session, existing);
      if (respawn) respawnAtEntrance(session);
      return existing;
    }

    if (current && current.members.length === 1 && current.members[0] === session) {
      if (this.byKey.get(current.key) === current) this.byKey.delete(current.key);
      current.key = key;
      this.byKey.set(key, current);
      return current;
    }

    this.release(session);
    const fresh = createMapInstance(key, undefined);
    attachInstance(session, fresh);
    this.byKey.set(key, fresh);
    return fresh;
  }

  /** 離開實例；空了就從表中移除 */
  release(session: Session): void {
    const current = session.instance;
    if (!current) return;
    detachInstance(session);
    if (current.members.length === 0 && this.byKey.get(current.key) === current) this.byKey.delete(current.key);
  }

  /** 丟掉沒有成員的實例（成員在 `leaveInstance` 之外的路徑離開時） */
  prune(): void {
    for (const [key, inst] of this.byKey) if (inst.members.length === 0) this.byKey.delete(key);
  }
}

/** 入隊時人在野外且該地圖已有隊伍實例：於地圖入口重生（§ 97.7.1） */
export function respawnAtEntrance(session: Session): void {
  const map = session.mapControl.getState().currentMap;
  if (!map) return;
  const pos = { ...map.spawnPoint };
  session.mapControl.setState({
    playerPosition: pos,
    prevPlayerPosition: { ...pos },
    targetPosition: null,
    currentPath: [],
    pathIndex: 0,
    isMoving: false,
  });
}

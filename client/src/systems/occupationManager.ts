import type { Position } from '../models/mapControl';

export type OccupantType = 'player' | 'monster';

export interface Occupant {
  type: OccupantType;
  id: string;
}

export class OccupationManager {
  private map = new Map<string, Occupant>();

  private key(x: number, y: number): string {
    return `${Math.round(x)},${Math.round(y)}`;
  }

  clear(): void {
    this.map.clear();
  }

  register(pos: Position, type: OccupantType, id: string): void {
    this.map.set(this.key(pos.x, pos.y), { type, id });
  }

  unregister(pos: Position): void {
    this.map.delete(this.key(pos.x, pos.y));
  }

  getOccupant(pos: Position): Occupant | null {
    return this.map.get(this.key(pos.x, pos.y)) ?? null;
  }

  isOccupied(pos: Position): boolean {
    return this.map.has(this.key(pos.x, pos.y));
  }

  isOccupiedByType(pos: Position, type: OccupantType): boolean {
    const occ = this.map.get(this.key(pos.x, pos.y));
    return occ?.type === type;
  }

  canMoveTo(pos: Position, selfId: string): boolean {
    const occ = this.map.get(this.key(pos.x, pos.y));
    if (!occ) return true;
    return occ.id === selfId;
  }

  move(from: Position, to: Position, type: OccupantType, id: string): boolean {
    if (!this.canMoveTo(to, id)) return false;
    this.unregister(from);
    this.register(to, type, id);
    return true;
  }

  getOccupiedSet(excludeId?: string): Set<string> {
    const result = new Set<string>();
    for (const [key, occ] of this.map) {
      if (excludeId && occ.id === excludeId) continue;
      result.add(key);
    }
    return result;
  }
}

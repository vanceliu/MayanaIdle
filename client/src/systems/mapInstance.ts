/**
 * （隊伍，地圖）實例（`97-selfhosted-server.md` § 97.7.1）。
 *
 * 實例擁有地圖上的共用狀態：怪物 store、怪物實例、怪物 FSM context、佔位表、
 * 累積擊殺數（Pressure 輸入）、目標選擇表。成員 session 透過 `attachInstance`
 * 取得這些物件的別名；本機永遠只有一個一人實例。
 */
import type { StoreApi } from 'zustand';
import type { Position } from '../models/mapControl';
import type { MonsterInstance, MonsterTemplate } from '../models/monster';
import type { Session, CombatState } from '../stores/session';
import { createMapMonsterStore, type MapMonsterState } from '../stores/mapMonsterStore';
import { OccupationManager } from './occupationManager';
import { createArpgEngine, type ArpgMonster } from './arpgEngine';
import { createPlayerCombatContext } from './playerCombatFSM';
import type { MonsterTargetState } from './monsterTargeting';
import { gameNow } from '../core/clock';

export type PartyDropMode = 'all' | 'participants';

/** server 掛上的隊伍資訊；本機為 null */
export interface InstancePartyHook {
  dropMode: () => PartyDropMode;
  /** 全隊在線成員（不限地圖），掉落模式「全隊」用 */
  onlineMembers: () => Session[];
}

export interface MapInstance {
  key: string;
  members: Session[];
  mapMonster: StoreApi<MapMonsterState>;
  monsterInstances: Map<string, MonsterInstance>;
  engineMonsters: Map<string, ArpgMonster>;
  areaTemplates: MonsterTemplate[];
  occupation: OccupationManager;
  targeting: Map<string, MonsterTargetState>;
  /** 隊伍全體共計的累積擊殺數 */
  kills: number;
  /** 建立時刻（遊戲時間），生成隻數分布與 Boss 門檻的停留時間由此起算 */
  createdAt: number;
  party: InstancePartyHook | null;
}

let nextPrivateId = 1;

export function createMapInstance(key: string, mapMonster?: StoreApi<MapMonsterState>): MapInstance {
  return {
    key,
    members: [],
    mapMonster: mapMonster ?? createMapMonsterStore(),
    monsterInstances: new Map(),
    engineMonsters: new Map(),
    areaTemplates: [],
    occupation: new OccupationManager(),
    targeting: new Map(),
    kills: 0,
    createdAt: gameNow(),
    party: null,
  };
}

export function createCombatState(): CombatState {
  return { engine: createArpgEngine(), monsterInstances: new Map(), areaTemplates: [] };
}

/** 清空實例內容（成員歸零時）；物件本身保留，別名不必重設 */
export function clearInstance(instance: MapInstance): void {
  instance.mapMonster.getState().clearAll();
  instance.monsterInstances.clear();
  instance.engineMonsters.clear();
  instance.areaTemplates.length = 0;
  instance.occupation.clear();
  instance.targeting.clear();
  instance.kills = 0;
  instance.createdAt = gameNow();
}

/** 把 session 掛進實例：加入成員並把共用物件設成別名。第一位成員以自己的 `areaKills` 起算擊殺數 */
export function attachInstance(session: Session, instance: MapInstance): void {
  if (!session.combat) session.combat = createCombatState();
  if (instance.members.length === 0) {
    instance.kills = session.game?.getState().character?.areaKills ?? 0;
    instance.createdAt = session.game?.getState().character?.areaEnteredAt ?? gameNow();
  }
  if (!instance.members.includes(session)) instance.members.push(session);
  session.instance = instance;
  session.mapMonster = instance.mapMonster;
  session.combat.monsterInstances = instance.monsterInstances;
  session.combat.engine.monsters = instance.engineMonsters;
  session.combat.areaTemplates = instance.areaTemplates;
  session.loop.occupation = instance.occupation;
}

/** 從實例移除；最後一位離開時清空實例。session 的別名仍指向它，直到下一次 attach */
export function detachInstance(session: Session): void {
  const instance = session.instance;
  if (!instance) return;
  const idx = instance.members.indexOf(session);
  if (idx >= 0) instance.members.splice(idx, 1);
  if (instance.members.length === 0) clearInstance(instance);
}

/**
 * 離開目前的實例並回到一人實例：原實例沒有別人就清空後沿用，
 * 否則另建一個私有實例（本機因此永遠沿用同一個物件）。
 */
export function leaveInstance(session: Session): MapInstance {
  detachInstance(session);
  const current = session.instance;
  if (current && current.members.length === 0) {
    attachInstance(session, current);
    return current;
  }
  const fresh = createMapInstance(`private:${nextPrivateId++}`);
  attachInstance(session, fresh);
  return fresh;
}

/** 玩家 FSM 與手動技能歸零；實例照 `leaveInstance` 處理 */
export function resetPlayerCombat(session: Session): void {
  const engine = session.combat.engine;
  engine.playerCtx = createPlayerCombatContext();
  engine.manualSkillId = null;
  engine.active = false;
}

/** 本機路徑：沒有實例就以 session 自己的怪物 store 建一個一人實例 */
export function ensureInstance(session: Session): MapInstance {
  if (!session.instance) attachInstance(session, createMapInstance('local', session.mapMonster));
  return session.instance;
}

/** 成員身分＝角色 id；沒有角色（測試）以 0 代替 */
export function memberIdOf(session: Session): number {
  return session.game?.getState().character?.id ?? 0;
}

/** 在場成員：有角色、有地圖的成員 */
export function presentMembers(instance: MapInstance): Session[] {
  return instance.members.filter(m => m.game?.getState().character && m.mapControl?.getState().currentMap);
}

export function findMember(instance: MapInstance, memberId: number): Session | undefined {
  return instance.members.find(m => memberIdOf(m) === memberId);
}

export function memberPosition(session: Session): Position {
  return session.mapControl.getState().playerPosition;
}

/** 怪物該追的位置：目標成員；沒有目標時取最近的在場成員 */
export function monsterTargetPosition(instance: MapInstance, monsterId: string, monsterPos: Position): Position | null {
  const targetId = instance.targeting.get(monsterId)?.targetId ?? null;
  if (targetId !== null) {
    const member = findMember(instance, targetId);
    if (member && member.mapControl.getState().currentMap) return memberPosition(member);
  }
  let best: Position | null = null;
  let bestDist = Infinity;
  for (const m of presentMembers(instance)) {
    const p = memberPosition(m);
    const d = (p.x - monsterPos.x) ** 2 + (p.y - monsterPos.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/** 本次停留分鐘數（`26-spawn-pressure.md` § 26.2、§ 26.4 的時間輸入） */
export function instanceElapsedMinutes(instance: MapInstance): number {
  return Math.max(0, (gameNow() - instance.createdAt) / 60000);
}

/**
 * 全隊技能套用到隊友（`23-class-magic.md` § 23.6 全隊技能規則）。
 *
 * 對象＝同一隊伍實例的在場存活隊友，不含施放者；數值由施放者算好傳入。
 * 戰鬥天賦（`processPlayerAttack`）與常駐／快捷格（`castSelfSkill`）兩條施放路徑共用。
 */
import type { Session } from '../stores/session';
import type { Skill } from '../models/skill';
import type { ActiveEffect } from '../models/effect';
import type { CombatLog } from '../stores/gameStore';
import { getEffectiveMaxHp } from '../stores/gameStore';
import { memberIdOf, presentMembers } from './mapInstance';
import { applyPlayerBuff } from './playerDebuffSystem';

const MAX_LOGS = 200;

export interface PartyHeal {
  memberId: number;
  healed: number;
}

export function partyRecipients(caster: Session): Session[] {
  const instance = caster.instance;
  if (!instance) return [];
  return presentMembers(instance).filter(m => m !== caster && (m.game.getState().character?.hp ?? 0) > 0);
}

/** 隊友 HP 百分比（`51-auto-talent.md` § 51.4.7 隊友 HP） */
export function teammateHpPercents(caster: Session): number[] {
  return partyRecipients(caster).map(m => {
    const gs = m.game.getState();
    const char = gs.character!;
    const max = getEffectiveMaxHp(char, gs.equippedGear, gs.activeEffects);
    return max > 0 ? (char.hp / max) * 100 : 100;
  });
}

function casterName(caster: Session): string {
  return caster.game.getState().character?.name ?? '';
}

function appendLog(session: Session, log: CombatLog): void {
  const existing = session.game.getState().combatLogs;
  session.game.setState({ combatLogs: [...existing.slice(-(MAX_LOGS - 1)), log] });
}

/** 每位隊友回復 `amount`，各自夾在有效最大 HP 之內；回復 0 的不列入結果 */
export function shareHealWithParty(caster: Session, skill: Skill, amount: number): PartyHeal[] {
  if (!skill.party || amount <= 0) return [];
  const name = casterName(caster);
  const heals: PartyHeal[] = [];
  for (const member of partyRecipients(caster)) {
    const gs = member.game.getState();
    const char = gs.character!;
    const healed = Math.min(getEffectiveMaxHp(char, gs.equippedGear, gs.activeEffects) - char.hp, amount);
    if (healed <= 0) continue;
    member.game.setState({ character: { ...char, hp: char.hp + healed } });
    appendLog(member, { text: `${name} 的 ${skill.name} 回復 ${healed} HP`, type: 'player' });
    heals.push({ memberId: memberIdOf(member), healed });
  }
  return heals;
}

/** 每位隊友各拿一份 `buff` 的複本（護盾吸收量各自獨立）；同 category 以最後施放的為準 */
export function shareBuffWithParty(caster: Session, skill: Skill, buff: ActiveEffect): void {
  if (!skill.party) return;
  const name = casterName(caster);
  for (const member of partyRecipients(caster)) {
    const copy: ActiveEffect = { ...buff, id: `${buff.id}-${memberIdOf(member)}` };
    const applied = applyPlayerBuff(member.game.getState().activeEffects, copy);
    member.game.setState({ activeEffects: applied.effects });
    appendLog(member, { text: `${name} 對你施放 ${skill.name}`, type: 'player' });
  }
}

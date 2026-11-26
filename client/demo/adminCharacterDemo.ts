/**
 * 角色查詢 demo（`admin-character.html`）：載入真正的管理介面頁面，`/admin/api/*` 換成假資料。
 * 物品格由 server 的 `buildItemCells()` 產生，裝備取 seed 模板、詞綴隨機；每個角色隨機一套外觀，重新整理就換一批。
 * 星盤由 server 的 `buildStarView()` 產生，配點從本職業起點隨機往外長滿點數；最後一個角色未滿 Lv30。
 * 能力值、技能、快捷列由 `buildCombatView()` 產生；天賦配置由 `buildTalentView()` 產生，條件與動作從選單隨機挑、參數隨機。
 */
import { adminPage } from '../../server/src/adminPage';
import { appearanceSvg } from '../../server/src/pawnSvg';
import { buildItemCells } from '../../server/src/adminItemCells';
import { buildStarView } from '../../server/src/adminStarView';
import { KEYSTONE_CAP, STAR_NODE_BY_ID, starNeighbors, starPoints, starStartNodeId } from '../src/models/starChart';
import { randomAppearance } from '../src/models/appearance';
import { generateAffixes, getAffixCategoryForSlot } from '../src/models/affix';
import { buildCombatView } from '../../server/src/adminCombatView';
import { buildTalentView } from '../../server/src/adminTalentView';
import { CLASS_BASE_ATTRIBUTES, CLASS_NAMES_ZH, type Character, type ClassName } from '../src/models/character';
import { getCachedTemplates, loadTemplateCache, resolveEquipment } from '../src/systems/templateSync';
import { ITEM_DEFINITIONS } from '../src/db/seed';
import { selectableRules } from '../src/db/seed/talentSeeds';
import { CLASS_SKILLS } from '../src/models/classSkills';
import { SKILL_CATALOG, type Skill } from '../src/models/skill';
import { AFFIX_TYPE_OPTIONS, EQUIP_TYPE_OPTIONS, KEEP_TEMPLATE_IDS, getParamFields, type ParamField } from '../src/models/talentParams';
import { conditionSlotCount, TALENT_TYPES, type TalentSlot, type TalentSlotEntry, type TalentSlotTier } from '../src/models/talent';
import { DEFAULT_EMERGENCY_RETREAT } from '../src/models/scriptEngine';
import { ALL_TOWN_SCROLLS } from '../src/models/townScroll';
import { QUICK_SLOT_COUNT, type QuickSlotEntry } from '../src/models/quickSlot';
import type { Ability } from '../src/models/ability';
import type { EquipmentInstance, EquipSlot } from '../src/models/equipment';

const HOUR = 3600e3;
const CHARACTERS: { name: string; className: ClassName; level: number; gold: number; regionId: string }[] = [
  { name: '瑪雅射手', className: 'elf', level: 62, gold: 1_284_500, regionId: 'grey-ridge' },
  { name: '鐵壁', className: 'knight', level: 55, gold: 320_000, regionId: 'dawn-plains' },
  { name: '星火', className: 'elementalist', level: 48, gold: 96_000, regionId: 'valden' },
  { name: '影刃', className: 'thief', level: 71, gold: 2_450_000, regionId: 'hundred-pillar-tower' },
  { name: '小祭司', className: 'priest', level: 24, gold: 8_400, regionId: 'dawn-plains' },
];
const EQUIPPED_SLOTS: EquipSlot[] = ['rightHand', 'helmet', 'chest', 'gloves', 'boots', 'belt', 'necklace'];
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

await loadTemplateCache();

function equipment(): EquipmentInstance[] {
  const templates = getCachedTemplates();
  const make = (slot: EquipSlot | undefined, equipped: boolean, inStorage = false): EquipmentInstance => {
    const t = pick(templates.filter(x => (slot ? x.slot === slot : true) && x.slot !== 'ring2'));
    const affixes = Math.random() < 0.3 ? [] : generateAffixes(getAffixCategoryForSlot(t.slot, t.type), 40, 1 + Math.floor(Math.random() * 4));
    return resolveEquipment({
      id: Math.floor(Math.random() * 1e6), templateId: t.id!, quality: 0, enhancement: Math.floor(Math.random() * 10),
      affixes, ownerId: 1, equipped, inStorage, slot: equipped ? slot : undefined,
      ...(t.slot === 'rightHand' && Math.random() < 0.4 ? { ability: { type: 'skill_splash', params: { percent: 20 } } as Ability } : {}),
    } as EquipmentInstance);
  };
  return [
    ...EQUIPPED_SLOTS.map(slot => make(slot, true)),
    ...Array.from({ length: 19 }, () => make(undefined, false)),
    ...Array.from({ length: 2 }, () => make(undefined, false, true)),
  ];
}

/** 從起點隨機長出相連的配點；命星是終點且最多 KEYSTONE_CAP 顆 */
function randomStarChart(cls: ClassName, level: number): string[] {
  const total = starPoints(level);
  if (total === 0) return [];
  const result = [starStartNodeId(cls)];
  const taken = new Set(result);
  let keystones = 0;
  while (result.length < total) {
    const frontier = [...new Set(result.flatMap(id => [...starNeighbors(id)]))]
      .filter(id => !taken.has(id) && (STAR_NODE_BY_ID.get(id)!.kind !== 'keystone' || keystones < KEYSTONE_CAP));
    if (frontier.length === 0) break;
    const next = pick(frontier);
    if (STAR_NODE_BY_ID.get(next)!.kind === 'keystone') keystones++;
    taken.add(next);
    result.push(next);
  }
  return result;
}

const chance = (p: number) => Math.random() < p;

/** 本職業已達等級的職業技能，法系另加幾招一般魔法 */
function learnedSkills(cls: ClassName, level: number): Skill[] {
  const own = CLASS_SKILLS.filter(s => s.className === cls && s.requiredLevel <= level).map(s => s.skill);
  const magic = cls === 'elementalist' || cls === 'priest'
    ? [...SKILL_CATALOG].sort(() => Math.random() - 0.5).slice(0, 6)
    : [];
  return [...magic, ...own].map(s => ({ ...s, lastUsedAt: 0 }));
}

function randomParam(field: ParamField, skills: Skill[]): unknown {
  switch (field.kind) {
    case 'number': return field.min !== undefined && field.max !== undefined
      ? field.min + Math.floor(Math.random() * (field.max - field.min + 1)) : field.def;
    case 'boolean': return chance(0.5);
    case 'select': return pick([...field.options]).value;
    case 'skill': return skills.length && chance(0.85) ? pick(skills).id : undefined;
    case 'item': return chance(0.8) ? pick(ITEM_DEFINITIONS).id : undefined;
    case 'multi': {
      const domain = field.source === 'affix' ? AFFIX_TYPE_OPTIONS.map(o => o.value)
        : field.source === 'equipType' ? EQUIP_TYPE_OPTIONS.map(o => o.value) : [...KEEP_TEMPLATE_IDS];
      return [...domain].sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 4));
    }
  }
}

function randomEntry(type: TalentSlot['assignedType'] & string, kind: 'condition' | 'action', skills: Skill[]): TalentSlotEntry {
  const def = pick(selectableRules(type, kind));
  const params = Object.fromEntries(getParamFields(def.ruleId).map(f => [f.key, randomParam(f, skills)]));
  return { ruleId: def.ruleId, params: Object.keys(params).length ? params : null };
}

/** 兩份配置（第二份使用中的機率一半），每類型 0~4 格；另有幾格未安裝 */
function randomTalents(skills: Skill[]) {
  const templates = [
    { id: 'default', name: '預設', emergencyRetreat: { ...DEFAULT_EMERGENCY_RETREAT, enabled: true, hpThreshold: 20 } },
    { id: 'boss', name: '打王', emergencyRetreat: { ...DEFAULT_EMERGENCY_RETREAT, enabled: chance(0.5), hpThreshold: 35, scrollTownId: pick(ALL_TOWN_SCROLLS).townId } },
  ];
  const slots: TalentSlot[] = [];
  for (const t of templates) {
    for (const type of TALENT_TYPES) {
      const count = Math.floor(Math.random() * 5);
      for (let order = 0; order < count; order++) {
        const tier = (1 + Math.floor(Math.random() * 4)) as TalentSlotTier;
        slots.push({
          characterId: 1, tier, assignedType: type, templateId: t.id, order, enabled: chance(0.85),
          conditions: Array.from({ length: conditionSlotCount(tier) }, () => (chance(0.7) ? randomEntry(type, 'condition', skills) : null)),
          action: chance(0.9) ? randomEntry(type, 'action', skills) : null,
        });
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    slots.push({ characterId: 1, tier: 1, assignedType: null, templateId: null, order: null, enabled: true, conditions: [null], action: null });
  }
  return buildTalentView(slots, {
    scriptTemplates: templates, activeTemplateId: chance(0.5) ? 'default' : 'boss',
    afterCombatHpThreshold: 40, afterCombatMpThreshold: 25, afterCombatHpResumeThreshold: 80, afterCombatMpResumeThreshold: 70,
  });
}

function randomQuickSlots(skills: Skill[]): (QuickSlotEntry | null)[] {
  return Array.from({ length: QUICK_SLOT_COUNT }, (_, i): QuickSlotEntry | null => {
    if (i === 0) return { kind: 'potion', potionType: 'red' };
    if (i === 1) return { kind: 'potion', potionType: 'orange' };
    if (skills.length && i < 6 && chance(0.7)) return { kind: 'skill', skillId: pick(skills).id };
    return null;
  });
}

function demoCharacter(c: typeof CHARACTERS[number], skills: Skill[], starChart: string[]): Character {
  const bonus = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
  const keys = Object.keys(bonus) as (keyof typeof bonus)[];
  for (let i = 0; i < 20; i++) bonus[pick(keys)]++;
  return {
    userId: 1, name: c.name, className: c.className, level: c.level, exp: 0, expToNext: 1, hp: 1, mp: 1,
    baseAttributes: { ...CLASS_BASE_ATTRIBUTES[c.className] }, bonusAttributes: bonus, starChart,
    gold: c.gold, currentArea: c.regionId, currentZone: c.regionId, currentRegion: c.regionId, currentFloor: null,
    skills, quests: [], areaEnteredAt: 0, createdAt: 0,
  };
}

function detail(id: number) {
  const c = CHARACTERS[id - 1];
  const bag = Array.from({ length: 13 }, () => ({ itemId: pick(ITEM_DEFINITIONS).id, amount: 1 + Math.floor(Math.random() * 300) }));
  const skills = learnedSkills(c.className, c.level);
  const starChart = randomStarChart(c.className, c.level);
  const gear = equipment();
  const char = demoCharacter(c, skills, starChart);
  return {
    character: {
      id, uuid: `demo-${id}`, userId: id, name: c.name, className: c.className, level: c.level, exp: c.level * 2950,
      gold: c.gold, regionId: c.regionId, floor: c.regionId === 'hundred-pillar-tower' ? 42 : null,
      createdAt: Date.now() - 480 * HOUR, lastSeenAt: Date.now() - id * HOUR,
    },
    bag: [], equipment: [], statistics: {},
    view: {
      className: CLASS_NAMES_ZH[c.className],
      appearanceSvg: appearanceSvg(randomAppearance()),
      items: buildItemCells(gear, bag),
      star: buildStarView(char),
      combat: buildCombatView(char, gear, bag, randomQuickSlots(skills)),
      talent: randomTalents(skills),
      statistics: [['殺敵數', 48_211], ['BOSS 討伐', 132], ['獨特魔物擊殺', 18], ['死亡次數', 7], ['金幣總量', 9_820_000]]
        .map(([label, value]) => ({ label, value })),
    },
  };
}

const list = CHARACTERS.map((c, i) => ({ id: i + 1, ...c }));
const details = list.map(c => detail(c.id));

const mock = `<script>
localStorage.setItem('mayana.adminToken', 'demo');
window.fetch = async (url) => {
  const path = String(url).replace('/admin/api/', '');
  const id = Number(new URLSearchParams(path.split('?')[1] || '').get('id'));
  const body = path.startsWith('characters') ? { characters: ${JSON.stringify(list)} }
    : path.startsWith('character?') ? ${JSON.stringify(details)}[id - 1]
    : {};
  return { ok: true, status: 200, json: async () => body };
};
</script>`;

const html = adminPage('MayanaIdle', __APP_VERSION__)
  .replace('<div id="app"></div>', `<div id="app"></div>${mock}`)
  .replace("tab: 'status'", "tab: 'characters'");
document.open();
document.write(html);
document.close();

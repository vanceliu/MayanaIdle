/**
 * 角色查詢 demo（`admin-character.html`）：載入真正的管理介面頁面，`/admin/api/*` 換成假資料。
 * 物品格由 server 的 `buildItemCells()` 產生，裝備取 seed 模板、詞綴隨機；每個角色隨機一套外觀，重新整理就換一批。
 */
import { adminPage } from '../../server/src/adminPage';
import { appearanceSvg } from '../../server/src/pawnSvg';
import { buildItemCells } from '../../server/src/adminItemCells';
import { randomAppearance } from '../src/models/appearance';
import { generateAffixes, getAffixCategoryForSlot } from '../src/models/affix';
import { CLASS_NAMES_ZH, type ClassName } from '../src/models/character';
import { getCachedTemplates, loadTemplateCache, resolveEquipment } from '../src/systems/templateSync';
import { ITEM_DEFINITIONS } from '../src/db/seed';
import type { Ability } from '../src/models/ability';
import type { EquipmentInstance, EquipSlot } from '../src/models/equipment';

const HOUR = 3600e3;
const CHARACTERS: { name: string; className: ClassName; level: number; gold: number; regionId: string }[] = [
  { name: '瑪雅射手', className: 'elf', level: 62, gold: 1_284_500, regionId: 'grey-ridge' },
  { name: '鐵壁', className: 'knight', level: 55, gold: 320_000, regionId: 'dawn-plains' },
  { name: '星火', className: 'elementalist', level: 48, gold: 96_000, regionId: 'valden' },
  { name: '影刃', className: 'thief', level: 71, gold: 2_450_000, regionId: 'hundred-pillar-tower' },
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

function detail(id: number) {
  const c = CHARACTERS[id - 1];
  const bag = Array.from({ length: 13 }, () => ({ itemId: pick(ITEM_DEFINITIONS).id, amount: 1 + Math.floor(Math.random() * 300) }));
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
      items: buildItemCells(equipment(), bag),
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

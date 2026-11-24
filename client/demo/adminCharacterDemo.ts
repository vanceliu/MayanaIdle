/**
 * 角色查詢 demo（`admin-character.html`）：載入真正的管理介面頁面，`/admin/api/*` 換成假資料。
 * 每個角色隨機一套外觀，重新整理就換一批。
 */
import { adminPage } from '../../server/src/adminPage';
import { appearanceSvg } from '../../server/src/pawnSvg';
import { randomAppearance } from '../src/models/appearance';
import { formatAffixDisplay, type Affix } from '../src/models/affix';
import { formatAbilityDisplay, type Ability } from '../src/models/ability';
import { CLASS_NAMES_ZH, type ClassName } from '../src/models/character';

const HOUR = 3600e3;
const CHARACTERS: { name: string; className: ClassName; level: number; gold: number; regionId: string }[] = [
  { name: '瑪雅射手', className: 'elf', level: 62, gold: 1_284_500, regionId: 'grey-ridge' },
  { name: '鐵壁', className: 'knight', level: 55, gold: 320_000, regionId: 'dawn-plains' },
  { name: '星火', className: 'elementalist', level: 48, gold: 96_000, regionId: 'valden' },
  { name: '影刃', className: 'thief', level: 71, gold: 2_450_000, regionId: 'hundred-pillar-tower' },
];
const affix = (type: string, tier: number, value: number) => formatAffixDisplay({ type, tier, value } as Affix);

function detail(id: number) {
  const c = CHARACTERS[id - 1];
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
      equipment: [
        {
          name: '星辰王弓', slot: '右手', enhancement: 9, equipped: true,
          affixes: [affix('attack_power', 6, 18), affix('crit_rate', 5, 12.5), affix('attack_splash', 5, 20)],
          ability: formatAbilityDisplay({ type: 'skill_splash', params: { percent: 20 } } as Ability),
        },
        { name: '暗影兜帽', slot: '頭盔', enhancement: 5, equipped: true, affixes: [affix('defense', 4, 8)], ability: null },
        { name: '長劍', slot: '', enhancement: 0, equipped: false, affixes: [], ability: null },
      ],
      bag: [{ name: '橙色藥水', amount: 320 }, { name: '瞬間移動卷軸', amount: 12 }],
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

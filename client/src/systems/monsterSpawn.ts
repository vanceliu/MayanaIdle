/**
 * 地圖怪物實例的生成（`41-arpg-combat.md`、`50-training-ground.md` § 50.4.2）。
 *
 * 從 PixiGame 抽出來的純函式：它們不碰 pixi 也不碰 DOM，
 * 留在那支檔案裡等於沒辦法測 —— 匯入就會把整個渲染層拉進來。
 */
import type { MapMonster } from '../stores/mapMonsterStore';
import type { MonsterInstance, MonsterTemplate } from '../models/monster';
import { DUMMY_INFINITE_HP, type TrainingDummySpec } from '../models/trainingGround';

/**
 * 由區域模板建怪物實例。**模板還沒載入時回 `null`，不生假怪。**
 *
 * 模板是非同步從 IndexedDB 讀的，而生怪在每個 ticker frame 都可能發生 ——
 * 回村再回地圖時，第一批怪會在模板填好之前就要求實例。
 * 這裡回 null、呼叫端跳過，下一個 frame 模板到了再建。
 * 舊版在這裡回一隻寫死的「怪物」（Lv1／HP 30／攻 2~4），玩家看到的是假名字與假血量。
 *
 * 試驗場木樁的素質來自面板參數、不吃模板，不受此限。
 */
export function createMonsterFromTemplate(mm: MapMonster, templates: MonsterTemplate[]): MonsterInstance | null {
  // 試驗場木樁的素質來自玩家在面板上設的參數，不從區域模板抽（§ 50.4.2）
  if (mm.dummy) return createTrainingDummy(mm.dummy);

  // Pick a template matching boss/non-boss
  const pool = mm.isBoss
    ? templates.filter(t => t.isBoss)
    : templates.filter(t => !t.isBoss);
  const template = pool.length > 0
    ? pool[Math.floor(Math.random() * pool.length)]
    : templates[Math.floor(Math.random() * templates.length)];

  if (!template) return null;

  return {
    templateId: template.id!,
    name: template.name,
    level: template.level,
    currentHp: template.hp,
    maxHp: template.hp,
    attackMin: template.attackMin,
    attackMax: template.attackMax,
    defense: template.defense,
    exp: template.exp,
    race: template.race,
    size: template.size,
    element: template.element,
    isBoss: template.isBoss,
    attackType: template.attackType ?? 'melee',
    attackRange: template.attackRange ?? 1.5,
    attackInterval: template.attackInterval ?? 1200,
    projectileSpeed: template.projectileSpeed,
    debuffs: template.debuffs,
  };
}

export function createTrainingDummy(spec: TrainingDummySpec): MonsterInstance {
  const hp = spec.hp ?? DUMMY_INFINITE_HP;
  return {
    templateId: 0,
    name: '木樁',
    level: spec.level,
    currentHp: hp,
    maxHp: hp,
    attackMin: 0,
    attackMax: 0,
    defense: spec.defense,
    exp: 0,
    race: 'normal',
    size: spec.size,
    element: spec.element,
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1200,
    isTrainingDummy: true,
  };
}

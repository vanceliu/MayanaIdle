/**
 * 怪物遠程武器演出調校頁（`48-vfx.md` § 48.6.5）。
 *
 * 物理組：9 種 `ranged` 怪拿弓／擲斧；法系組：9 種 `magic` 怪拿雙手杖（鏡湖歌者不演）、寶珠為攻擊元素色。
 * 圍著角色站一圈輪流出手，材質依等級，投射物在放箭／脫手／前推到底時從武器出發。
 * 跑的是遊戲同一份 `MonsterEntity`、`monsterWeapon.ts`、`playSkillFx()`；滑桿直接改那幾個常數。
 */
import { Application, Container, Graphics, Text } from 'pixi.js';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';
import { DEFAULT_LASH } from '../src/models/appearance';
import { ELEMENT_LABELS, monsterRangedWeapon, type MonsterTemplate } from '../src/models/monster';
import { MonsterEntity } from '../src/pixi/entities/MonsterEntity';
import {
  MONSTER_THROW_AXE_MOTION,
  MONSTER_WEAPON_MOUNT,
  monsterAxeColor,
  monsterGemColor,
  monsterWeaponMaterial,
  monsterWeaponMuzzle,
  monsterWeaponStrikeMs,
} from '../src/pixi/entities/monster/monsterWeapon';
import type { PawnLook } from '../src/pixi/entities/pawn/drawPawn';
import { resolveCapCfg } from '../src/pixi/entities/pawn/hairRender';
import { PawnSprite } from '../src/pixi/entities/pawn/PawnSprite';
import { weaponAimFromDelta } from '../src/pixi/entities/pawn/weaponGeometry';
import { DamageNumberManager } from '../src/pixi/ui/DamageNumber';
import { getMonsterProjectileStyle } from '../src/pixi/ui/projectileStyle';
import {
  HIT_LIFT, SKILL_FX_ART, SkillFxManager, playSkillFx, resolveMonsterAttackFxPlan,
} from '../src/pixi/ui/skillFx';
import { TILE_H, TILE_W, worldToScreen } from '../src/pixi/utils/isometric';

const MATERIAL_LABEL = { iron: '鐵', silver: '銀', mithril: '米索利', orichalcum: '奧里哈魯根' } as Record<string, string>;

export type DemoGroup = 'physical' | 'magic';

/** 每種怪各一筆；同名多樓層的挑不同等級，四段材質都看得到 */
const DEMO_MONSTER_IDS: Record<DemoGroup, number[]> = {
  physical: [30, 206, 219, 38, 43, 118, 148, 135, 196],
  magic: [202, 208, 216, 71, 81, 155, 162, 178, 197],
};


const RING_TILES = 5.5;
const PLAYER_POS = { x: 0, y: 0 };
const PROJECTILE_SPEED = 384;

const DEMO_LOOK: PawnLook = {
  hair: 'twin',
  skin: '#e3b585',
  hairColor: '#6b4fa0',
  eyeColor: '#3a2f4a',
  cloth: '#8b6fc4',
  eyes: 'dots',
  lash: { ...DEFAULT_LASH, on: 1 },
  cap: resolveCapCfg('twin', undefined),
};

export interface MonsterBowParams {
  lift: number;
  scale: number;
  intervalMs: number;
  throwDurationMs: number;
  throwArcFrom: number;
  throwArcTo: number;
  throwStrike: number;
  axeLen: number;
  axeSpinPx: number;
  speed: number;
}

/** 單看一隻時的站位：怪物在角色的哪個螢幕方位（度，0 ＝ 上、90 ＝ 右）→ 朝向 */
export const FOCUS_BEARINGS: { label: string; deg: number }[] = [
  { label: '背面（怪在下方）', deg: 180 },
  { label: '正面（怪在上方）', deg: 0 },
  { label: '朝右（怪在左方）', deg: -90 },
  { label: '朝左（怪在右方）', deg: 90 },
  { label: '右上斜（怪在左下）', deg: -135 },
  { label: '左上斜（怪在右下）', deg: 135 },
  { label: '右下斜（怪在左上）', deg: -45 },
  { label: '左下斜（怪在右上）', deg: 45 },
];

/** 螢幕方位 → 距角色 RING_TILES 格的世界座標 */
function posAtBearing(deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const sx = Math.sin(r) * TILE_W;
  const sy = -Math.cos(r) * TILE_H;
  const x = sx / TILE_W + sy / TILE_H;
  const y = sy / TILE_H - sx / TILE_W;
  const k = RING_TILES / Math.hypot(x, y);
  return { x: x * k, y: y * k };
}

interface Shooter {
  template: MonsterTemplate;
  entity: MonsterEntity;
  pos: { x: number; y: number };
  /** 全部輪流時的站位 */
  home: { x: number; y: number };
  /** 距下一次出手（ms） */
  cooldown: number;
}

export class MonsterBowStage {
  readonly app = new Application();
  readonly params: MonsterBowParams = {
    lift: MONSTER_WEAPON_MOUNT.lift,
    scale: MONSTER_WEAPON_MOUNT.scale,
    intervalMs: 1200,
    throwDurationMs: MONSTER_THROW_AXE_MOTION.durationMs,
    throwArcFrom: MONSTER_THROW_AXE_MOTION.arcFrom,
    throwArcTo: MONSTER_THROW_AXE_MOTION.arcTo,
    throwStrike: MONSTER_THROW_AXE_MOTION.tStrike,
    axeLen: SKILL_FX_ART.travel.axeLen,
    axeSpinPx: SKILL_FX_ART.travel.axeSpinPx,
    speed: 1,
  };
  private readonly world = new Container();
  private readonly fx = new SkillFxManager();
  private readonly damage = new DamageNumberManager();
  private player!: PawnSprite;
  private shooters: Shooter[] = [];
  /** 只看單一隻（index）；null ＝ 全部輪流 */
  private focus: number | null = null;
  private view = { width: 0, height: 0, zoom: 1 };

  readonly group: DemoGroup;

  constructor(group: DemoGroup = 'physical') {
    this.group = group;
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    await this.app.init({
      canvas, width, height,
      background: 0x0d0d20,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);

    const ground = new Graphics();
    for (let x = -7; x <= 7; x++) {
      for (let y = -7; y <= 7; y++) {
        const { sx, sy } = worldToScreen(x, y);
        ground.poly([sx, sy - TILE_H / 2, sx + TILE_W / 2, sy, sx, sy + TILE_H / 2, sx - TILE_W / 2, sy])
          .fill({ color: (x + y) % 2 === 0 ? 0x1a1a35 : 0x16162e });
      }
    }
    ground.zIndex = -1000;
    this.world.addChild(ground);

    this.player = new PawnSprite(DEMO_LOOK, 0x4dabf7, 'front');
    this.player.container.zIndex = 0;
    this.world.addChild(this.player.container);

    const ids = DEMO_MONSTER_IDS[this.group];
    ids.forEach((id, i) => {
      const template = MONSTER_SEEDS.find(t => t.id === id)!;
      const angle = (i / ids.length) * Math.PI * 2;
      const pos = { x: Math.cos(angle) * RING_TILES, y: Math.sin(angle) * RING_TILES };
      const entity = new MonsterEntity(`demo-${id}`, false, template.size);
      entity.updatePosition(pos);
      entity.faceToward(PLAYER_POS);
      entity.updateHp(1, 1);
      entity.setArt(id, 0);
      const material = monsterWeaponMaterial(template.level);
      const label = new Text({
        text: this.group === 'magic'
          ? `${template.name}\nLv${template.level} ${MATERIAL_LABEL[material]}・${ELEMENT_LABELS[template.element]}`
          : `${template.name}\nLv${template.level} ${MATERIAL_LABEL[material]}`,
        style: { fontSize: 10, fill: 0xd8d8f0, align: 'center', lineHeight: 12 },
      });
      label.anchor.set(0.5, 0);
      label.y = 6;
      entity.container.addChild(label);
      this.world.addChild(entity.container);
      this.shooters.push({ template, entity, pos, home: pos, cooldown: (i * this.params.intervalMs) / ids.length });
    });

    this.fx.container.zIndex = 900;
    this.damage.container.zIndex = 1000;
    this.world.addChild(this.fx.container, this.damage.container);

    this.app.ticker.add(t => this.step(t.deltaMS * this.params.speed));
    this.layout(width, height, 1.75);
  }

  /** 畫面中心：全部時是角色，單一隻時是角色與該怪的中點 */
  layout(width: number, height: number, zoom: number): void {
    this.view = { width, height, zoom };
    this.app.renderer.resize(width, height);
    this.world.scale.set(zoom);
    const target = this.focus === null ? PLAYER_POS : this.shooters[this.focus].pos;
    const mid = worldToScreen((PLAYER_POS.x + target.x) / 2, (PLAYER_POS.y + target.y) / 2);
    this.world.x = width / 2 - mid.sx * zoom;
    this.world.y = height / 2 - mid.sy * zoom;
  }

  /** 單看一隻並移到 `bearing` 方位；null ＝ 全部回原位 */
  setFocus(index: number | null, bearing = FOCUS_BEARINGS[0].deg): void {
    this.focus = index;
    this.shooters.forEach((s, i) => {
      s.pos = i === index ? posAtBearing(bearing) : s.home;
      s.entity.updatePosition(s.pos);
      s.entity.faceToward(PLAYER_POS);
    });
    this.layout(this.view.width, this.view.height, this.view.zoom);
  }

  /** 滑桿 → 遊戲常數 */
  apply(): void {
    const p = this.params;
    MONSTER_WEAPON_MOUNT.lift = p.lift;
    MONSTER_WEAPON_MOUNT.scale = p.scale;
    MONSTER_THROW_AXE_MOTION.durationMs = p.throwDurationMs;
    MONSTER_THROW_AXE_MOTION.arcFrom = p.throwArcFrom;
    MONSTER_THROW_AXE_MOTION.arcTo = p.throwArcTo;
    MONSTER_THROW_AXE_MOTION.tStrike = p.throwStrike;
    MONSTER_THROW_AXE_MOTION.tRecover = p.throwStrike;
    MONSTER_THROW_AXE_MOTION.tWindup = Math.min(MONSTER_THROW_AXE_MOTION.tWindup, p.throwStrike - 0.05);
    SKILL_FX_ART.travel.axeLen = p.axeLen;
    SKILL_FX_ART.travel.axeSpinPx = p.axeSpinPx;
  }

  get names(): string[] {
    return this.shooters.map(s => `${s.template.name} Lv${s.template.level}`);
  }

  private step(deltaMs: number): void {
    this.shooters.forEach((s, i) => {
      s.entity.container.visible = this.focus === null || this.focus === i;
      s.entity.update(deltaMs);
      if (!s.entity.container.visible) return;
      s.cooldown -= deltaMs;
      if (s.cooldown > 0) return;
      s.cooldown += this.params.intervalMs;
      this.shoot(s);
    });
    this.fx.update(deltaMs);
    this.damage.update(deltaMs);
    this.player.update(deltaMs);
  }

  /** 與遊戲 `PixiGame` 的 `monster_attack` 同一套接法 */
  private shoot(s: Shooter): void {
    const weapon = monsterRangedWeapon(s.template);
    const material = monsterWeaponMaterial(s.template.level);
    const gem = this.group === 'magic' ? monsterGemColor(s.template.element) : null;
    const aim = weaponAimFromDelta(PLAYER_POS.x - s.pos.x, PLAYER_POS.y - s.pos.y) ?? 180;
    const interval = this.params.intervalMs;
    const from = worldToScreen(s.pos.x, s.pos.y);
    const to = worldToScreen(PLAYER_POS.x, PLAYER_POS.y);
    const muzzle = weapon ? monsterWeaponMuzzle(weapon, aim) : { x: 0, y: -HIT_LIFT };
    const { shape, color } = getMonsterProjectileStyle(
      s.template.attackType, s.template.element, s.template.rangedWeapon, monsterAxeColor(material),
    );
    playSkillFx(this.fx, {
      plan: resolveMonsterAttackFxPlan({ ranged: true, shape, color, armed: weapon !== null }),
      fromX: from.sx, fromY: from.sy,
      muzzleX: from.sx + muzzle.x, muzzleY: from.sy + muzzle.y,
      toX: to.sx, toY: to.sy - HIT_LIFT,
      targets: [{
        x: to.sx, y: to.sy - HIT_LIFT,
        onLand: () => this.damage.spawn(to.sx, to.sy - HIT_LIFT, 20 + Math.round(Math.random() * 20), 'normal'),
      }],
      speed: PROJECTILE_SPEED,
      groundLift: HIT_LIFT,
      onWeaponAction: () => { if (weapon) s.entity.playRangedAttack(weapon, material, aim, interval, gem); },
      weaponStrikeMs: weapon ? monsterWeaponStrikeMs(weapon, interval) : undefined,
    });
  }

  exportJson(): string {
    const p = this.params;
    if (this.group === 'magic') return JSON.stringify({ MONSTER_WEAPON_MOUNT: { lift: p.lift, scale: p.scale } }, null, 2);
    return JSON.stringify({
      MONSTER_WEAPON_MOUNT: { lift: p.lift, scale: p.scale },
      MONSTER_THROW_AXE_MOTION: {
        durationMs: p.throwDurationMs, arcFrom: p.throwArcFrom, arcTo: p.throwArcTo, tStrike: p.throwStrike,
      },
      travel: { axeLen: p.axeLen, axeSpinPx: p.axeSpinPx },
    }, null, 2);
  }
}

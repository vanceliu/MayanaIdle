/**
 * 怪物體型球大小調校頁（`25-monster-system.md` § 25.2）。
 *
 * `ProposedMonster` 是 `src/pixi/entities/MonsterEntity.ts` 的畫法加上可調半徑；
 * 遊戲採用的值是 `MONSTER_RADIUS`，與 `DEFAULT_PARAMS` 相同。
 */
import { Application, Container, Graphics, Text } from 'pixi.js';
import { DEFAULT_LASH } from '../src/models/appearance';
import type { MonsterSize } from '../src/models/monster';
import { resolveCapCfg } from '../src/pixi/entities/pawn/hairRender';
import type { PawnLook } from '../src/pixi/entities/pawn/drawPawn';
import { PawnSprite } from '../src/pixi/entities/pawn/PawnSprite';
import { TILE_W, TILE_H, worldToScreen } from '../src/pixi/utils/isometric';

const MONSTER_COLOR = 0xff6b6b;
const BOSS_COLOR = 0xcc00cc;
const GLOW_COLOR = 0xff8888;
const BOSS_GLOW_COLOR = 0xff00ff;
const TARGET_RING_COLOR = 0xffe9a8;
/** 目前遊戲的半徑係數（`MonsterEntity` 的 `RADIUS = TILE_H * 0.45`） */
const CURRENT_RADIUS_K = 0.45;
const HP_BAR_OFFSET_Y = -20;
const CAST_BAR_OFFSET_Y = -26;
const BAR_WIDTH = 40;

export interface MonsterSizeParams {
  /** 小型半徑 = TILE_H × smallK */
  smallK: number;
  /** 大型半徑 = TILE_H × largeK */
  largeK: number;
  /** 血條／詠唱條與球頂的距離維持現況，大型跟著球頂往上移 */
  barsFollowTop: boolean;
  /** 目標環依半徑比例縮放 */
  ringScales: boolean;
  /** 血條寬度依半徑比例縮放 */
  barWidthScales: boolean;
  /** 對照組：全部用目前遊戲的半徑 */
  showCurrent: boolean;
}

export const DEFAULT_PARAMS: MonsterSizeParams = {
  smallK: 0.45,
  largeK: 0.75,
  barsFollowTop: true,
  ringScales: true,
  barWidthScales: false,
  showCurrent: false,
};

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

interface Spot {
  x: number;
  y: number;
  size: MonsterSize;
  isBoss: boolean;
  label?: string;
  targeted?: boolean;
  hp?: number;
  cast?: number;
}

/** 上排：四種組合並排，各帶標籤 */
const LINEUP: Spot[] = [
  { x: 0, y: 4, size: 'small', isBoss: false, label: '小型', hp: 0.8 },
  { x: 2, y: 2, size: 'large', isBoss: false, label: '大型', hp: 0.55, targeted: true },
  { x: 4, y: 0, size: 'small', isBoss: true, label: '小型 Boss', hp: 0.9 },
  { x: 6, y: -2, size: 'large', isBoss: true, label: '大型 Boss', hp: 0.4, cast: 0.6 },
];

/** 下排：玩家被混編怪群圍住，看相鄰格的重疊與遮擋 */
const CROWD_ORIGIN = { x: 8, y: 8 };
const CROWD: Spot[] = [
  { x: -1, y: -1, size: 'small', isBoss: false, hp: 1 },
  { x: 0, y: -1, size: 'large', isBoss: false, hp: 0.7, targeted: true },
  { x: 1, y: -1, size: 'small', isBoss: false, hp: 0.3 },
  { x: -1, y: 0, size: 'large', isBoss: false, hp: 0.9, cast: 0.4 },
  { x: 1, y: 0, size: 'small', isBoss: false, hp: 0.6 },
  { x: -1, y: 1, size: 'small', isBoss: false, hp: 1 },
  { x: 0, y: 1, size: 'large', isBoss: true, hp: 0.5 },
  { x: 1, y: 1, size: 'large', isBoss: false, hp: 0.8 },
  { x: 2, y: 0, size: 'small', isBoss: false, hp: 1 },
  { x: 0, y: 2, size: 'small', isBoss: false, hp: 0.2 },
];

class ProposedMonster {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  private readonly hpBar = new Graphics();
  private readonly castBar = new Graphics();
  private readonly spot: Spot;

  constructor(spot: Spot) {
    this.spot = spot;
    this.container.addChild(this.gfx, this.hpBar, this.castBar);
  }

  redraw(params: MonsterSizeParams): void {
    const { spot } = this;
    const k = params.showCurrent ? CURRENT_RADIUS_K : spot.size === 'large' ? params.largeK : params.smallK;
    const r = TILE_H * k;
    const r0 = TILE_H * CURRENT_RADIUS_K;
    const scale = r / r0;
    const bodyColor = spot.isBoss ? BOSS_COLOR : MONSTER_COLOR;
    const glowColor = spot.isBoss ? BOSS_GLOW_COLOR : GLOW_COLOR;

    const g = this.gfx;
    g.clear();
    if (spot.targeted) {
      const ring = params.ringScales ? scale : 1;
      g.ellipse(0, 0, TILE_W * 0.34 * ring, TILE_H * 0.34 * ring)
        .stroke({ color: TARGET_RING_COLOR, width: 2, alpha: 0.95 });
    }
    g.circle(0, -r, r + 2).fill({ color: glowColor, alpha: 0.3 });
    g.circle(0, -r, r).fill({ color: bodyColor });
    if (spot.isBoss) {
      g.poly([-6, -r * 2, -3, -r * 2 - 8, 0, -r * 2]).fill({ color: BOSS_COLOR })
        .poly([0, -r * 2, 3, -r * 2 - 8, 6, -r * 2]).fill({ color: BOSS_COLOR });
    }

    const lift = params.barsFollowTop ? -2 * (r - r0) : 0;
    const w = params.barWidthScales ? BAR_WIDTH * scale : BAR_WIDTH;

    this.hpBar.clear();
    this.hpBar.y = HP_BAR_OFFSET_Y + lift;
    this.hpBar.rect(-w / 2, -2, w, 4).fill(0x333333);
    this.hpBar.rect(-w / 2, -2, w * (spot.hp ?? 1), 4).fill(spot.isBoss ? 0xaa44ff : 0xff3333);

    this.castBar.clear();
    this.castBar.y = CAST_BAR_OFFSET_Y + lift;
    if (spot.cast) {
      this.castBar.rect(-w / 2, -1.5, w, 3).fill(0x332200);
      this.castBar.rect(-w / 2, -1.5, w * spot.cast, 3).fill(0xffcc33);
    }
  }
}

export class MonsterSizeStage {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly ground = new Graphics();
  private readonly monsters: ProposedMonster[] = [];
  params: MonsterSizeParams = { ...DEFAULT_PARAMS };

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    await this.app.init({
      canvas,
      width,
      height,
      background: 0x1c2b1c,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      autoStart: false,
    });
    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);
    this.world.addChild(this.ground);
    this.drawGround();

    for (const spot of LINEUP) this.place(spot, spot.x, spot.y);

    const player = new PawnSprite(DEMO_LOOK, 0x4dabf7, 'front');
    this.setAt(player.container, CROWD_ORIGIN.x, CROWD_ORIGIN.y);
    this.world.addChild(player.container);
    for (const spot of CROWD) this.place(spot, CROWD_ORIGIN.x + spot.x, CROWD_ORIGIN.y + spot.y);

    const ref = new PawnSprite(DEMO_LOOK, 0x4dabf7, 'front');
    this.setAt(ref.container, -2, 6);
    this.world.addChild(ref.container);
    this.addLabel('玩家（比例參考）', -2, 6);

    this.layout(width, height, 1.5);
    this.apply();
  }

  private setAt(c: Container, x: number, y: number): void {
    const { sx, sy } = worldToScreen(x, y);
    c.x = sx;
    c.y = sy;
    c.zIndex = x + y + 0.5;
  }

  private place(spot: Spot, x: number, y: number): void {
    const m = new ProposedMonster(spot);
    this.setAt(m.container, x, y);
    this.world.addChild(m.container);
    this.monsters.push(m);
    if (spot.label) this.addLabel(spot.label, x, y);
  }

  private addLabel(text: string, x: number, y: number): void {
    const t = new Text({ text, style: { fontSize: 11, fill: 0xe2e8f0, fontFamily: 'sans-serif' } });
    const { sx, sy } = worldToScreen(x, y);
    t.anchor.set(0.5, 0);
    t.x = sx;
    t.y = sy + 16;
    t.zIndex = 10_000;
    this.world.addChild(t);
  }

  private drawGround(): void {
    const g = this.ground;
    g.zIndex = -1;
    for (let x = -4; x <= 12; x++) {
      for (let y = -4; y <= 12; y++) {
        const { sx, sy } = worldToScreen(x, y);
        g.poly([sx, sy - TILE_H / 2, sx + TILE_W / 2, sy, sx, sy + TILE_H / 2, sx - TILE_W / 2, sy])
          .fill({ color: (x + y) % 2 === 0 ? 0x2a3d2a : 0x253825 })
          .stroke({ color: 0x1a2a1a, width: 1 });
      }
    }
  }

  layout(width: number, height: number, zoom: number): void {
    this.app.renderer.resize(width, height);
    this.world.scale.set(zoom);
    const center = worldToScreen(5, 4);
    this.world.x = width / 2 - center.sx * zoom;
    this.world.y = height / 2 - center.sy * zoom;
    this.app.render();
  }

  apply(): void {
    for (const m of this.monsters) m.redraw(this.params);
    this.app.render();
  }

  exportJson(): string {
    const p = this.params;
    return JSON.stringify(
      {
        smallRadius: `TILE_H * ${p.smallK}`,
        largeRadius: `TILE_H * ${p.largeK}`,
        barsFollowTop: p.barsFollowTop,
        targetRingScales: p.ringScales,
        barWidthScales: p.barWidthScales,
      },
      null,
      2,
    );
  }
}

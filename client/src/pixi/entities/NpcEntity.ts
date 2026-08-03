import { Graphics, Container, Text } from 'pixi.js';
import { worldToScreen, getEntityDepth, TILE_H } from '../utils/isometric';
import type { MapNpc } from '../../models/mapControl';

/** 綠色＝可互動的友方，跟怪物的紅色區分（§ 99.6 決策 5） */
const NPC_COLOR = 0x4ade80;
const GLOW_COLOR = 0x86efac;
const RADIUS = TILE_H * 0.45;

/**
 * 城鎮 NPC：綠色圓點 + 設施 icon 疊在圓點上，下方掛設施名稱。
 * 只負責顯示 —— 點擊由 PixiGame 的 DOM click handler 依格子判斷，
 * 不在這裡掛 Pixi 事件（否則會與地圖移動各自派工，互相覆蓋目標）。
 */
export class NpcEntity {
  public container: Container;
  public readonly npc: MapNpc;

  constructor(npc: MapNpc) {
    this.npc = npc;
    this.container = new Container();

    const glow = new Graphics();
    glow.circle(0, -RADIUS, RADIUS + 3).fill({ color: GLOW_COLOR, alpha: 0.28 });

    const body = new Graphics();
    body.circle(0, -RADIUS, RADIUS).fill({ color: NPC_COLOR });

    const icon = new Text({
      text: npc.icon,
      style: { fontSize: 16, align: 'center' },
    });
    icon.anchor.set(0.5);
    icon.y = -RADIUS;

    const label = new Text({
      text: npc.name,
      style: { fontSize: 11, fill: 0xffffff, align: 'center', stroke: { color: 0x000000, width: 3 } },
    });
    label.anchor.set(0.5);
    label.y = RADIUS * 0.6;

    this.container.addChild(glow, body, icon, label);

    const { sx, sy } = worldToScreen(npc.x, npc.y, 0);
    this.container.x = sx;
    this.container.y = sy;
    this.container.zIndex = getEntityDepth({ x: npc.x, y: npc.y }, 0);

  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

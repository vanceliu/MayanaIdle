import { Container, Text } from 'pixi.js';
import { worldToScreen, getEntityDepth, TILE_H } from '../utils/isometric';
import type { MapNpc } from '../../models/mapControl';
import { getNpcAppearance } from '../../models/npcAppearance';
import { PawnSprite } from './pawn/PawnSprite';
import { toPawnLook } from './pawn/pawnTexture';

/** 地面標記沿用原本圓點的綠 —— 顏色區分敵我（§ 13.2.1），怪物是紅 */
const NPC_MARKER = 0x4ade80;

/** 點擊命中測試要用的身體中心偏移（相對格子中心往上） */
export const NPC_BODY_OFFSET = TILE_H * 0.45;

/**
 * 城鎮 NPC：角色剪影 + 綠色地面標記 + 設施 icon + 名稱（§ 13.2.1）。
 *
 * 外觀依設施固定（`models/npcAppearance.ts`），所以認人靠的是長相而不只是名字。
 * 敵我的顏色區分改由地面標記承擔 —— 剪影本身只有髮色膚色，沒有敵我資訊。
 *
 * 只負責顯示 —— 點擊由 PixiGame 的 DOM click handler 依格子判斷，
 * 不在這裡掛 Pixi 事件（否則會與地圖移動各自派工，互相覆蓋目標）。
 */
export class NpcEntity {
  public container: Container;
  public readonly npc: MapNpc;
  private pawn: PawnSprite;

  constructor(npc: MapNpc) {
    this.npc = npc;
    this.container = new Container();

    this.pawn = new PawnSprite(toPawnLook(getNpcAppearance(npc.facility)), NPC_MARKER);

    /* icon 疊在頭上方，不蓋住臉 —— 蓋住的話所有 NPC 又變回一模一樣 */
    const icon = new Text({
      text: npc.icon,
      style: { fontSize: 14, align: 'center' },
    });
    icon.anchor.set(0.5);
    icon.y = -TILE_H * 1.5;

    const label = new Text({
      text: npc.name,
      style: { fontSize: 11, fill: 0xffffff, align: 'center', stroke: { color: 0x000000, width: 3 } },
    });
    label.anchor.set(0.5);
    label.y = TILE_H * 0.32;

    this.container.addChild(this.pawn.container, icon, label);

    const { sx, sy } = worldToScreen(npc.x, npc.y, 0);
    this.container.x = sx;
    this.container.y = sy;
    this.container.zIndex = getEntityDepth({ x: npc.x, y: npc.y }, 0);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

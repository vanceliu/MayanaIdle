import { Container } from 'pixi.js';
import { worldToScreen, getEntityDepth } from '../utils/isometric';
import type { Position } from '../../models/mapControl';
import type { Appearance } from '../../models/appearance';
import { createDefaultAppearance, normalizeAppearance } from '../../models/appearance';
import { PawnSprite } from './pawn/PawnSprite';
import { toPawnLook } from './pawn/pawnTexture';
import { weaponAimFromDelta, type WeaponAttack } from './pawn/weaponGeometry';

/** 地面標記沿用原本圓點的藍 —— 剪影本身沒有敵我資訊，那個區分不能消失 */
const PLAYER_MARKER = 0x4dabf7;

/**
 * 玩家：RimWorld 式無腳剪影（`04-character.md` § 4.10）。
 * 朝向由位移推算，不另存狀態（`40-pixijs-migration.md` § 10）。
 */
export class PlayerEntity {
  public container: Container;
  private pawn: PawnSprite;

  constructor(appearance: Appearance = createDefaultAppearance()) {
    this.container = new Container();
    /* 舊角色的 appearance 可能少欄位，一律收乾淨再用 —— 缺欄位會畫成 undefined 色 */
    this.pawn = new PawnSprite(toPawnLook(normalizeAppearance(appearance)), PLAYER_MARKER);
    this.container.addChild(this.pawn.container);
  }

  /** 角色換人或改外觀時呼叫。同造型不會重烘貼圖 */
  setAppearance(appearance: Appearance): void {
    this.pawn.setLook(toPawnLook(normalizeAppearance(appearance)));
  }

  /**
   * 出手時轉向目標（攻擊方向與角色朝向要一致）。
   * 這一幀稍後的 `updatePosition()` 會把它套上去，並壓過移動方向。
   */
  faceToward(from: Position, to: Position): void {
    this.pawn.faceToward(from.x, from.y, to.x, to.y);
  }

  /**
   * 出手：轉向目標並演出武器（`48-vfx.md` § 48.6）。
   *
   * 沒有裝武器（或裝的是副手類）時退回只轉向 —— 空手不畫武器。
   */
  playAttack(from: Position, to: Position, weapon: Omit<WeaponAttack, 'aim'> | null): void {
    const aim = weaponAimFromDelta(to.x - from.x, to.y - from.y);
    if (aim === null) return;
    if (!weapon) {
      this.faceToward(from, to);
      return;
    }
    this.pawn.attack({ ...weapon, aim });
  }

  /** 每幀推進武器演出 */
  update(deltaMs: number): void {
    this.pawn.update(deltaMs);
  }

  updatePosition(pos: Position, elevation = 0): void {
    const { sx, sy } = worldToScreen(pos.x, pos.y, elevation);
    this.container.x = sx;
    this.container.y = sy;
    this.container.zIndex = getEntityDepth(pos, elevation);
    this.pawn.updateFacingFrom(pos.x, pos.y);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** 怪物出手時的弓／擲斧（`48-vfx.md` § 48.6.5） */
import { Container, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../pawn/weaponTexture', async (importOriginal) => ({
  ...await importOriginal<typeof import('../pawn/weaponTexture')>(),
  getWeaponTexture: () => Texture.EMPTY,
}));

const { MonsterEntity } = await import('../MonsterEntity');
const { MONSTER_WEAPON_MOUNT } = await import('../monster/monsterWeapon');

/** 武器圖層：`WeaponSprite` 的兩把手 sprite 所在的 Container */
const weaponLayer = (m: InstanceType<typeof MonsterEntity>) =>
  m.container.children.find(c => c instanceof Container && c.children.length === 2 && c.children.every(h => h.constructor.name === 'Sprite')) as Container;

describe('MonsterEntity 遠程武器', () => {
  it('平常不畫，出手才出現，演完收起', () => {
    const m = new MonsterEntity('a', false, 'small');
    m.updatePosition({ x: 5, y: 5 });
    const layer = weaponLayer(m);
    expect(layer.visible).toBe(false);
    m.playRangedAttack('bow', 'iron', 90, 1200);
    m.update(50);
    expect(layer.visible).toBe(true);
    expect(layer.y).toBeCloseTo(-MONSTER_WEAPON_MOUNT.lift);
    m.update(2000);
    expect(layer.visible).toBe(false);
    m.destroy();
  });

  it('往螢幕上方出手時武器在身體之下，往下時在身體之上', () => {
    const m = new MonsterEntity('b', false, 'small');
    m.updatePosition({ x: 5, y: 5 });
    const layer = weaponLayer(m);
    m.playRangedAttack('bow', 'iron', 0, 1200);
    const up = m.container.getChildIndex(layer);
    m.playRangedAttack('bow', 'iron', 180, 1200);
    const down = m.container.getChildIndex(layer);
    expect(up).toBeLessThan(down);
    m.destroy();
  });
});

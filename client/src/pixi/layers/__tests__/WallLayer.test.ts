import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { MapData } from '../../../models/mapControl';
import { TileType } from '../../../models/mapControl';
import { WallLayer, isRubbleSite, tileVariance } from '../WallLayer';

/** 一整片岩石：過去每格畫同一個六邊形，成片鋪開會像重複貼皮 */
function rockField(): MapData {
  const size = 6;
  return {
    id: 'wall-layer', name: 'Wall Layer', width: size, height: size, theme: 'grassland',
    spawnPoint: { x: 1, y: 1 },
    tiles: Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) =>
        (x === 0 || y === 0 || x === size - 1 || y === size - 1)
          ? TileType.Boundary
          : TileType.Rock)),
  };
}

describe('tileVariance', () => {
  it('同一格永遠得到同一個值', () => {
    expect(tileVariance(3, 7, 1)).toBe(tileVariance(3, 7, 1));
  });

  it('不同格、不同 salt 會得到不同值', () => {
    expect(tileVariance(3, 7)).not.toBe(tileVariance(7, 3));
    expect(tileVariance(3, 7, 1)).not.toBe(tileVariance(3, 7, 2));
  });

  it('落在 0~1 之間', () => {
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 40; y++) {
        const v = tileVariance(x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});

describe('WallLayer', () => {
  it('每個障礙格都產生一個 graphic', () => {
    const layer = new WallLayer();
    const container = new Container();
    layer.buildInto(container, rockField());
    // 6×6 扣掉內部 4×4 岩石以外都是邊界，全部都會畫
    expect(container.children.length).toBe(36);
    layer.destroy();
  });

  it('相鄰岩石的外形不同，不會是同一個形狀複製', () => {
    const layer = new WallLayer();
    const container = new Container();
    layer.buildInto(container, rockField());

    // 以每個 graphic 的實際包圍盒當外形指紋；形狀全等時尺寸也會全等
    const shapes = container.children.map(child => {
      const b = child.getBounds();
      return `${b.width.toFixed(2)}x${b.height.toFixed(2)}`;
    });
    const rockShapes = shapes.slice(0, 40);
    expect(new Set(rockShapes).size).toBeGreaterThan(1);

    layer.destroy();
  });

  it('重繪後外形不變，石頭不會在重新渲染時跳動', () => {
    const map = rockField();
    const first = new WallLayer();
    const containerA = new Container();
    first.buildInto(containerA, map);
    const before = containerA.children.map(c => {
      const b = c.getBounds();
      return `${b.x.toFixed(2)},${b.y.toFixed(2)},${b.width.toFixed(2)},${b.height.toFixed(2)}`;
    });
    first.destroy();

    const second = new WallLayer();
    const containerB = new Container();
    second.buildInto(containerB, map);
    const after = containerB.children.map(c => {
      const b = c.getBounds();
      return `${b.x.toFixed(2)},${b.y.toFixed(2)},${b.width.toFixed(2)},${b.height.toFixed(2)}`;
    });
    second.destroy();

    expect(after).toEqual(before);
  });
});


function mapOf(rows: string[]): MapData {
  const G: Record<string, number> = {
    '.': TileType.Ground, '#': TileType.Boundary, 'W': TileType.Wall, 'R': TileType.Rock,
  };
  return {
    // 預設用自然主題：人造建築的岩石一律是斷壁，會蓋掉牆鄰接的判定
    id: 't', name: 't', width: rows[0].length, height: rows.length, theme: 'grassland',
    tiles: rows.map(r => [...r].map(c => G[c])), spawnPoint: { x: 1, y: 1 },
  };
}

describe('岩石外形的取樣', () => {
  it('同一格永遠得到同一個變化量，重繪不會跳動', () => {
    for (const salt of [0, 1, 7, 20]) {
      expect(tileVariance(5, 9, salt)).toBe(tileVariance(5, 9, salt));
    }
  });

  it('不同格、不同 salt 會得到不同變化量，否則整片會長一樣', () => {
    const samples = new Set<number>();
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) samples.add(tileVariance(x, y, 6));
    expect(samples.size).toBeGreaterThan(50);
    expect(tileVariance(3, 3, 1)).not.toBe(tileVariance(3, 3, 7));
  });
});

/**
 * § 38.9 岩石語彙：貼牆的岩石是崩落的牆體（斷壁），畫成方正石塊；
 * 野外的岩石才是圓潤的多角形巨石。兩者不該長得一樣。
 */
describe('斷壁判定（自然主題，看是否貼牆）', () => {
  it('與牆或邊界正交相鄰時判定為斷壁', () => {
    const map = mapOf([
      '######',
      '#....#',
      '#.R..#',
      '#..WR#',
      '#....#',
      '######',
    ]);
    expect(isRubbleSite(map, 2, 2)).toBe(false);   // 四鄰都是地面
    expect(isRubbleSite(map, 4, 3)).toBe(true);    // 左邊是牆
  });

  it('緊貼地圖外圍也算斷壁', () => {
    const map = mapOf(['###', '#R#', '###']);
    expect(isRubbleSite(map, 1, 1)).toBe(true);
  });

  it('只有斜向相鄰不算——斜角的牆看起來不像從那裡塌下來的', () => {
    const map = mapOf([
      '######',
      '#W...#',
      '#..R.#',
      '#....#',
      '#....#',
      '######',
    ]);
    expect(isRubbleSite(map, 3, 2)).toBe(false);
  });
});

/** § 38.9 裝飾要有多種樣式，成排的雜物才不會像複製貼上 */
describe('裝飾樣式取樣', () => {
  it('四種樣式在一片區域內都會出現', () => {
    const kinds = new Set<number>();
    for (let x = 0; x < 12; x++) {
      for (let y = 0; y < 12; y++) kinds.add(Math.floor(tileVariance(x, y, 13) * 4));
    }
    expect(kinds).toEqual(new Set([0, 1, 2, 3]));
  });

  it('樣式選取是確定性的，同一格永遠是同一種', () => {
    expect(Math.floor(tileVariance(7, 4, 13) * 4)).toBe(Math.floor(tileVariance(7, 4, 13) * 4));
  });
});

/**
 * § 38.9 斷壁是「崩落的石材堆」，不是「被切開的地磚」。
 * 單塊石材的尺寸必須明顯小於整格，邊緣才不會與地磚的菱形對齊而產生切割感。
 */
describe('斷壁的比例', () => {
  const TILE_W = 64, TILE_H = 32, WALL_HEIGHT = TILE_H * 0.6;
  const blockW = (x: number, y: number, i: number) =>
    (TILE_W / 2) * (0.26 + tileVariance(x, y, 80 + i) * 0.16);
  const blockTall = (x: number, y: number, i: number) =>
    WALL_HEIGHT * (0.14 + tileVariance(x, y, 100 + i) * 0.22);

  it('單塊石材的寬度不超過半格的一半，不會與地磚邊緣重合', () => {
    for (let x = 0; x < 15; x++) {
      for (let y = 0; y < 15; y++) {
        for (let i = 0; i < 3; i++) expect(blockW(x, y, i)).toBeLessThan(TILE_W / 4);
      }
    }
  });

  it('高度明顯低於牆，才不會被當成小一號的牆', () => {
    for (let x = 0; x < 15; x++) {
      for (let y = 0; y < 15; y++) {
        for (let i = 0; i < 3; i++) expect(blockTall(x, y, i)).toBeLessThan(WALL_HEIGHT * 0.4);
      }
    }
  });

  it('每格 2~3 塊，數量與高低都有變化', () => {
    const counts = new Set<number>();
    const talls = new Set<number>();
    for (let x = 0; x < 12; x++) {
      for (let y = 0; y < 12; y++) {
        counts.add(2 + Math.floor(tileVariance(x, y, 7) * 2));
        talls.add(Math.round(blockTall(x, y, 0)));
      }
    }
    expect(counts).toEqual(new Set([2, 3]));
    expect(talls.size).toBeGreaterThan(2);
  });
});

/**
 * § 38.9 倒塌石柱的投影方向必須跟 worldToScreen 一致：
 * sx=(x−y)·32、sy=(x+y)·16，所以 +x 是 (+32,+16)、**+y 是 (−32,+16)**。
 * 縱向倒柱若沿用橫向的符號，柱身會指往錯誤的方向。
 */
describe('倒塌石柱的投影方向', () => {
  const TILE_W = 64, TILE_H = 32;
  const runOf = (axis: 'horizontal' | 'vertical') => {
    const [dx, dy] = axis === 'horizontal' ? [1, 0] : [0, 1];
    return { vx: (dx - dy) * (TILE_W / 2), vy: (dx + dy) * (TILE_H / 2) };
  };

  it('橫向倒柱指向 +x：螢幕上是右下', () => {
    expect(runOf('horizontal')).toEqual({ vx: 32, vy: 16 });
  });

  it('縱向倒柱指向 +y：螢幕上是左下，X 必須為負', () => {
    expect(runOf('vertical')).toEqual({ vx: -32, vy: 16 });
  });

  it('兩個方向確實不同，不能共用同一組符號', () => {
    expect(runOf('horizontal').vx).not.toBe(runOf('vertical').vx);
  });
});

/**
 * 人造建築（塔／遺跡／監獄）裡不會有天然巨石：
 * 地上的每一塊石頭都是崩落的砌體，一律畫成斷壁。
 */
describe('人造建築的岩石一律是斷壁', () => {
  const at = (theme: MapData['theme']) => {
    const map = mapOf(['#######', '#.....#', '#..R..#', '#.....#', '#######']);
    return isRubbleSite({ ...map, theme }, 3, 2);
  };

  it.each(['ivory', 'ancient', 'tower', 'frost-tower', 'lava-tower', 'prison'] as const)(
    '%s 的岩石即使四周沒有牆也算斷壁', theme => expect(at(theme)).toBe(true),
  );

  it.each(['grassland', 'forest', 'snow', 'highland', 'cave', 'swamp'] as const)(
    '%s 的孤立岩石仍是野外巨石', theme => expect(at(theme)).toBe(false),
  );
});

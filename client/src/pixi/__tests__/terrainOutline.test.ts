/** 水／岩漿／深淵整圈邊線（`38-map-control.md` § 38.9 第二代背景 render） */
import { describe, expect, it } from 'vitest';
import { TileType, type MapData } from '../../models/mapControl';
import { traceTerrainOutlines } from '../terrainOutline';

const { Ground: G, Lava: L, Chasm: C, Water: W, Rock: R, Sand: S } = TileType;

function mapOf(tiles: number[][]): MapData {
  return { id: 't', name: 't', width: tiles[0].length, height: tiles.length, theme: 'dragon', spawnPoint: { x: 0, y: 0 }, tiles };
}

/** 迴圈的角點集合（與起點、方向無關） */
function cornerSet(loop: { x: number; y: number }[]): string[] {
  return loop.map(p => `${p.x},${p.y}`).sort();
}

describe('traceTerrainOutlines', () => {
  it('沒有水／岩漿／深淵就沒有邊線', () => {
    expect(traceTerrainOutlines(mapOf([[G, R], [S, G]]))).toEqual([]);
  });

  it('單格岩漿：一個 4 角的封閉迴圈，沿格子邊緣', () => {
    const loops = traceTerrainOutlines(mapOf([[G, G, G], [G, L, G], [G, G, G]]));
    expect(loops).toHaveLength(1);
    expect(cornerSet(loops[0])).toEqual(['0.5,0.5', '0.5,1.5', '1.5,0.5', '1.5,1.5']);
  });

  it('相連的一排合併成一個長方形，共線的邊不留中間點', () => {
    const loops = traceTerrainOutlines(mapOf([[G, G, G, G], [G, L, L, G], [G, G, G, G]]));
    expect(loops).toHaveLength(1);
    expect(cornerSet(loops[0])).toEqual(['0.5,0.5', '0.5,1.5', '2.5,0.5', '2.5,1.5']);
  });

  it('岩漿貼岩石的那一邊也畫：岩石只佔格子中間，旁邊露出地板', () => {
    const loops = traceTerrainOutlines(mapOf([[R, L]]));
    expect(loops).toHaveLength(1);
    expect(cornerSet(loops[0])).toEqual(['0.5,-0.5', '0.5,0.5', '1.5,-0.5', '1.5,0.5']);
  });

  it('岩漿貼深淵、水貼岩漿：彼此之間不畫線，整片只有一圈', () => {
    const loops = traceTerrainOutlines(mapOf([[G, G, G, G, G], [G, L, C, W, G], [G, G, G, G, G]]));
    expect(loops).toHaveLength(1);
    expect(cornerSet(loops[0])).toEqual(['0.5,0.5', '0.5,1.5', '3.5,0.5', '3.5,1.5']);
  });

  it('地圖邊緣的地形沿地圖外緣也畫', () => {
    const loops = traceTerrainOutlines(mapOf([[L]]));
    expect(cornerSet(loops[0])).toEqual(['-0.5,-0.5', '-0.5,0.5', '0.5,-0.5', '0.5,0.5']);
  });

  it('分開的兩塊各自一圈；中間圍住的可走格另成一圈', () => {
    expect(traceTerrainOutlines(mapOf([[L, G, W]]))).toHaveLength(2);
    expect(traceTerrainOutlines(mapOf([[L, L, L], [L, G, L], [L, L, L]]))).toHaveLength(2);
  });
});

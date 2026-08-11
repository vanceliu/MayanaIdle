import type { MapTheme } from '../models/mapControl';

export interface MapThemePalette {
  ground: number;
  groundAlt: number;
  grid: number;
  boundaryTop: number;
  boundaryLeft: number;
  boundaryRight: number;
  obstacle: number;
  decoration: number;
  water: number;
  lava: number;
  chasm: number;
  grass: number;
  sand: number;
  carpet: number;
}

export const MAP_THEME_PALETTES: Record<MapTheme, MapThemePalette> = {
  grassland: { ground: 0x236d3e, groundAlt: 0x1d6336, grid: 0x0f3b1f, boundaryTop: 0x54683c, boundaryLeft: 0x394929, boundaryRight: 0x28351f, obstacle: 0x5b6844, decoration: 0x76c23a, water: 0x2d8eff, lava: 0xff6b35, chasm: 0x1a1a1a, grass: 0x1f5a30, sand: 0xf1a657, carpet: 0x9e4200 },
  highland: { ground: 0x696143, groundAlt: 0x5c5538, grid: 0x332f24, boundaryTop: 0x7f7454, boundaryLeft: 0x56503b, boundaryRight: 0x3f3a2b, obstacle: 0x8a7e62, decoration: 0xcba93b, water: 0x398ee8, lava: 0xff7043, chasm: 0x2a2a2a, grass: 0x5a7d1d, sand: 0xf8bb6d, carpet: 0xc3460b },
  snow: { ground: 0xc1dbe6, groundAlt: 0xaecedd, grid: 0x6c99ad, boundaryTop: 0xe0eff5, boundaryLeft: 0x86aec1, boundaryRight: 0x648da0, obstacle: 0x80a8bf, decoration: 0x78d3ee, water: 0x73d6ff, lava: 0xff8c69, chasm: 0x404040, grass: 0xaafc03, sand: 0xffe1a9, carpet: 0xf88414 },
  ivory: { ground: 0xc3b189, groundAlt: 0xb3a37f, grid: 0x766951, boundaryTop: 0xecdfc1, boundaryLeft: 0xb2a486, boundaryRight: 0x897c63, obstacle: 0xdcceb0, decoration: 0x67b0e8, water: 0x5290ff, lava: 0xff7f50, chasm: 0x333333, grass: 0x82ca82, sand: 0xfff27d, carpet: 0xf06400 },
  forest: { ground: 0x1b5134, groundAlt: 0x16472e, grid: 0x0a2e1e, boundaryTop: 0x3a563b, boundaryLeft: 0x253a28, boundaryRight: 0x18281b, obstacle: 0x553d25, decoration: 0x409f30, water: 0x12a754, lava: 0xff4500, chasm: 0x0f0f0f, grass: 0x02ab02, sand: 0xfab300, carpet: 0x79430d },
  swamp: { ground: 0x3c512d, groundAlt: 0x334627, grid: 0x1f2a19, boundaryTop: 0x55623e, boundaryLeft: 0x37422c, boundaryRight: 0x283020, obstacle: 0x5e4e2f, decoration: 0x7aaa2f, water: 0x5a7d1d, lava: 0xff6347, chasm: 0x1c1c1c, grass: 0x76ae03, sand: 0xd59e51, carpet: 0x9b7545 },
  cave: { ground: 0x383344, groundAlt: 0x2e2b3b, grid: 0x1b1823, boundaryTop: 0x585066, boundaryLeft: 0x3a3347, boundaryRight: 0x282333, obstacle: 0x665b6c, decoration: 0x8263b2, water: 0x3726a2, lava: 0xff4500, chasm: 0x000000, grass: 0x8850fb, sand: 0xe7b777, carpet: 0x800080 },
  prison: { ground: 0x284b59, groundAlt: 0x20424f, grid: 0x112830, boundaryTop: 0x4c6671, boundaryLeft: 0x2f4550, boundaryRight: 0x1e323f, obstacle: 0x5f717e, decoration: 0x33b1be, water: 0x2585d5, lava: 0xff6347, chasm: 0x2f2f2f, grass: 0x66809a, sand: 0xd3d3d3, carpet: 0x696969 },
  battlefield: { ground: 0x574936, groundAlt: 0x4c4030, grid: 0x2c231b, boundaryTop: 0x70614b, boundaryLeft: 0x4c4232, boundaryRight: 0x363025, obstacle: 0x79694f, decoration: 0xa16539, water: 0x8b0000, lava: 0xff0000, chasm: 0x800000, grass: 0x5a7d1d, sand: 0xfab300, carpet: 0xc3460b },
  ancient: { ground: 0x433b33, groundAlt: 0x39332d, grid: 0x231e19, boundaryTop: 0x675c4c, boundaryLeft: 0x443e33, boundaryRight: 0x302c24, obstacle: 0x716351, decoration: 0x9a7949, water: 0x235aff, lava: 0xff7f00, chasm: 0x255959, grass: 0xaafc03, sand: 0xffa355, carpet: 0xf88414 },
  dragon: { ground: 0x643d2a, groundAlt: 0x563426, grid: 0x311c16, boundaryTop: 0x86563b, boundaryLeft: 0x5a3a29, boundaryRight: 0x40281f, obstacle: 0x885037, decoration: 0xdd6722, water: 0x8b0000, lava: 0xff4500, chasm: 0x800000, grass: 0x82ca82, sand: 0xfab300, carpet: 0xd40000 },
  tower: { ground: 0x383758, groundAlt: 0x2f2e4f, grid: 0x1c1b31, boundaryTop: 0x5e5c81, boundaryLeft: 0x3e3d59, boundaryRight: 0x2c2a45, obstacle: 0x726e92, decoration: 0x9471db, water: 0x5138f0, lava: 0xff6347, chasm: 0x3726a2, grass: 0x8850fb, sand: 0xef8eef, carpet: 0x8b0eff },
  'frost-tower': { ground: 0x38637d, groundAlt: 0x2f566e, grid: 0x1a3444, boundaryTop: 0x6b94ac, boundaryLeft: 0x446c80, boundaryRight: 0x2e5062, obstacle: 0x709cb4, decoration: 0x7decff, water: 0x00ced1, lava: 0xff7f50, chasm: 0x255959, grass: 0x73d6ff, sand: 0xf0f8ff, carpet: 0x2585d5 },
  'lava-tower': { ground: 0x69291f, groundAlt: 0x571f1b, grid: 0x34110e, boundaryTop: 0x8b3b2f, boundaryLeft: 0x602620, boundaryRight: 0x451a16, obstacle: 0x934532, decoration: 0xff7b32, water: 0x8b0000, lava: 0xff4500, chasm: 0x800000, grass: 0x79430d, sand: 0xfab300, carpet: 0xd40000 },
  // 城鎮：石板路（ground）＋ 房舍（wall/obstacle）＋ 綠地與水井，色調比野外亮，一眼看得出是安全區
  town: { ground: 0x72634b, groundAlt: 0x655641, grid: 0x3e3528, boundaryTop: 0x94805d, boundaryLeft: 0x665841, boundaryRight: 0x4a3f2f, obstacle: 0xa58d69, decoration: 0xf0b600, water: 0x1c82d8, lava: 0xff6b35, chasm: 0x1a1a1a, grass: 0x458a34, sand: 0xecc987, carpet: 0xa65422 },
};

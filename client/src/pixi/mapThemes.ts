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
  grassland: { ground: 0x315f42, groundAlt: 0x2a563a, grid: 0x173321, boundaryTop: 0x536044, boundaryLeft: 0x39432f, boundaryRight: 0x293123, obstacle: 0x59614b, decoration: 0x79a853, water: 0x4a90e2, lava: 0xff6b35, chasm: 0x1a1a1a, grass: 0x2a4f35, sand: 0xd4a574, carpet: 0x8b4513 },
  highland: { ground: 0x625d4a, groundAlt: 0x55513f, grid: 0x302e27, boundaryTop: 0x77705c, boundaryLeft: 0x514d40, boundaryRight: 0x3b382f, obstacle: 0x827b69, decoration: 0xb09b56, water: 0x5a8fc7, lava: 0xff7043, chasm: 0x2a2a2a, grass: 0x556b2f, sand: 0xdeb887, carpet: 0xa0522d },
  snow: { ground: 0xc8d8df, groundAlt: 0xb7cbd4, grid: 0x7894a1, boundaryTop: 0xe4edf1, boundaryLeft: 0x91aab6, boundaryRight: 0x6f8995, obstacle: 0x8ca5b3, decoration: 0x8ec7d8, water: 0x87ceeb, lava: 0xff8c69, chasm: 0x404040, grass: 0x9acd32, sand: 0xf5deb3, carpet: 0xcd853f },
  ivory: { ground: 0xb8ad94, groundAlt: 0xa99f89, grid: 0x6f6758, boundaryTop: 0xe4dcc9, boundaryLeft: 0xaaa18e, boundaryRight: 0x827a6a, obstacle: 0xd4cbb8, decoration: 0x7fadd0, water: 0x6495ed, lava: 0xff7f50, chasm: 0x333333, grass: 0x8fbc8f, sand: 0xf0e68c, carpet: 0xd2691e },
  forest: { ground: 0x254735, groundAlt: 0x1f3e2e, grid: 0x11271d, boundaryTop: 0x3f5140, boundaryLeft: 0x29362b, boundaryRight: 0x1b251d, obstacle: 0x4c3d2e, decoration: 0x4f8a45, water: 0x2e8b57, lava: 0xff4500, chasm: 0x0f0f0f, grass: 0x228b22, sand: 0xdaa520, carpet: 0x654321 },
  swamp: { ground: 0x3d4a34, groundAlt: 0x34402d, grid: 0x20271c, boundaryTop: 0x535b45, boundaryLeft: 0x373e30, boundaryRight: 0x282d23, obstacle: 0x554b38, decoration: 0x759346, water: 0x556b2f, lava: 0xff6347, chasm: 0x1c1c1c, grass: 0x6b8e23, sand: 0xbc9a6a, carpet: 0x8b7355 },
  cave: { ground: 0x393641, groundAlt: 0x302e38, grid: 0x1c1a21, boundaryTop: 0x595462, boundaryLeft: 0x3b3743, boundaryRight: 0x292630, obstacle: 0x655e69, decoration: 0x8572a3, water: 0x483d8b, lava: 0xff4500, chasm: 0x000000, grass: 0x9370db, sand: 0xd2b48c, carpet: 0x800080 },
  prison: { ground: 0x314750, groundAlt: 0x293e46, grid: 0x17252a, boundaryTop: 0x53636a, boundaryLeft: 0x35434a, boundaryRight: 0x243139, obstacle: 0x657078, decoration: 0x4d9ca4, water: 0x4682b4, lava: 0xff6347, chasm: 0x2f2f2f, grass: 0x708090, sand: 0xd3d3d3, carpet: 0x696969 },
  battlefield: { ground: 0x51483c, groundAlt: 0x473f35, grid: 0x29231e, boundaryTop: 0x696052, boundaryLeft: 0x474137, boundaryRight: 0x332f28, obstacle: 0x716757, decoration: 0x8d684c, water: 0x8b0000, lava: 0xff0000, chasm: 0x800000, grass: 0x556b2f, sand: 0xdaa520, carpet: 0xa0522d },
  ancient: { ground: 0x403b36, groundAlt: 0x37332f, grid: 0x211e1b, boundaryTop: 0x625b51, boundaryLeft: 0x413d36, boundaryRight: 0x2e2b26, obstacle: 0x6b6257, decoration: 0x8b7658, water: 0x4169e1, lava: 0xff7f00, chasm: 0x2f4f4f, grass: 0x9acd32, sand: 0xf4a460, carpet: 0xcd853f },
  dragon: { ground: 0x594135, groundAlt: 0x4d382f, grid: 0x2c1f1b, boundaryTop: 0x785a49, boundaryLeft: 0x513d32, boundaryRight: 0x3a2b25, obstacle: 0x795646, decoration: 0xba7045, water: 0x8b0000, lava: 0xff4500, chasm: 0x800000, grass: 0x8fbc8f, sand: 0xdaa520, carpet: 0xb22222 },
  tower: { ground: 0x3e3d52, groundAlt: 0x353449, grid: 0x201f2d, boundaryTop: 0x64637a, boundaryLeft: 0x434254, boundaryRight: 0x302f40, obstacle: 0x77758b, decoration: 0x9b85c7, water: 0x6a5acd, lava: 0xff6347, chasm: 0x483d8b, grass: 0x9370db, sand: 0xdda0dd, carpet: 0x8a2be2 },
  'frost-tower': { ground: 0x456070, groundAlt: 0x3b5362, grid: 0x22323c, boundaryTop: 0x7791a0, boundaryLeft: 0x4f6875, boundaryRight: 0x384d58, obstacle: 0x7d98a7, decoration: 0x8de1ef, water: 0x00ced1, lava: 0xff7f50, chasm: 0x2f4f4f, grass: 0x87ceeb, sand: 0xf0f8ff, carpet: 0x4682b4 },
  'lava-tower': { ground: 0x5b332d, groundAlt: 0x4c2926, grid: 0x2d1715, boundaryTop: 0x7a4840, boundaryLeft: 0x54302c, boundaryRight: 0x3c211f, obstacle: 0x815044, decoration: 0xff7b32, water: 0x8b0000, lava: 0xff4500, chasm: 0x800000, grass: 0x654321, sand: 0xdaa520, carpet: 0xb22222 },
};

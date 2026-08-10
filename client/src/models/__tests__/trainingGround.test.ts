/**
 * 試驗場（`50-training-ground.md`）—— 地圖、參數、量測。
 *
 * 這支的重點是「零產出」與「木樁不動不打人」這兩條硬性限制：
 * 任何一條被繞過，試驗場就會變成零風險刷怪點或污染排行榜。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getMapForRegion, clearMapCache } from '../mapDataControl';
import { isWalkableTile } from '../mapControl';
import { isDesignRegulatedMap } from '../mapDesignRules';
import { REGIONS, getRegion, getRegionsByZone, ZONES } from '../mapData';
import {
  DEFENSE_OVERFLOW_THRESHOLD,
  DUMMY_COUNT_MAX,
  DUMMY_DEFENSE_MAX,
  DUMMY_LEVEL_MAX,
  DUMMY_SLOTS,
  TRAINING_DUMMY_FACILITY,
  TRAINING_GROUND_FACILITY,
  TRAINING_GROUND_REGION_ID,
  getDefenseOverflowDodge,
  normalizeDummySpec,
} from '../trainingGround';
import { useMapMonsterStore } from '../../stores/mapMonsterStore';
import {
  canRestore,
  getElapsedMs,
  getReadout,
  useTrainingGroundStore,
} from '../../stores/trainingGroundStore';

const TOWN_IDS = ['neutral-town', 'elsarth-town', 'varden-town'];

describe('試驗場 region（§ 50.2）', () => {
  it('登記在 REGIONS 裡，type 為 training', () => {
    const region = getRegion(TRAINING_GROUND_REGION_ID);
    expect(region).toBeDefined();
    expect(region!.type).toBe('training');
  });

  it('不屬於任何 Zone 的 regions —— 唯一入口是城鎮 NPC', () => {
    for (const zone of ZONES) {
      expect(zone.regions, zone.id).not.toContain(TRAINING_GROUND_REGION_ID);
    }
  });

  it('不出現在導覽清單裡，否則地圖選擇器會多一個假入口', () => {
    const region = getRegion(TRAINING_GROUND_REGION_ID)!;
    const listed = getRegionsByZone(region.zoneId).map(r => r.id);
    expect(listed).not.toContain(TRAINING_GROUND_REGION_ID);
  });

  it('只有它一個 training region', () => {
    expect(REGIONS.filter(r => r.type === 'training')).toHaveLength(1);
  });
});

describe('試驗場地圖（§ 50.3）', () => {
  beforeEach(() => clearMapCache());

  it('20×15、關閉自動生怪、且不受設計規範管轄', async () => {
    const map = await getMapForRegion(TRAINING_GROUND_REGION_ID);
    expect(map).not.toBeNull();
    expect(map!.width).toBe(20);
    expect(map!.height).toBe(15);
    // 空地是刻意的：放掩體會擋投射物、污染 DPS
    expect(map!.autoSpawn).toBe(false);
    expect(isDesignRegulatedMap(map!)).toBe(false);
  });

  it('主題不是 town —— 城鎮那條路會連自動移動一起擋掉，角色就走不到木樁旁', async () => {
    const map = await getMapForRegion(TRAINING_GROUND_REGION_ID);
    expect(map!.theme).not.toBe('town');
  });

  it('場內管理員站在擋路格上，且與城鎮入口是不同的 facility', async () => {
    const map = await getMapForRegion(TRAINING_GROUND_REGION_ID);
    expect(map!.npcs).toHaveLength(1);
    const npc = map!.npcs![0];
    expect(npc.facility).toBe(TRAINING_DUMMY_FACILITY);
    expect(npc.facility).not.toBe(TRAINING_GROUND_FACILITY);
    expect(isWalkableTile(map!, npc)).toBe(false);
  });

  it('每個木樁站位都落在可通行格上（放不下的位置會靜默少一隻）', async () => {
    const map = await getMapForRegion(TRAINING_GROUND_REGION_ID);
    expect(DUMMY_SLOTS).toHaveLength(DUMMY_COUNT_MAX);
    for (const slot of DUMMY_SLOTS) {
      expect(isWalkableTile(map!, slot), `${slot.x},${slot.y}`).toBe(true);
    }
  });

  it('八個站位互不重疊，且全落在半徑 8 內（流星雨 maxTargets 才驗證得到）', async () => {
    const keys = new Set(DUMMY_SLOTS.map(s => `${s.x},${s.y}`));
    expect(keys.size).toBe(DUMMY_SLOTS.length);
    const centre = DUMMY_SLOTS[0];
    for (const slot of DUMMY_SLOTS) {
      const dist = Math.hypot(slot.x - centre.x, slot.y - centre.y);
      expect(dist, `${slot.x},${slot.y}`).toBeLessThanOrEqual(8);
    }
  });

  it('木樁中心左右到牆都 ≥ 8 格 —— 半徑邊界兩邊都測得到（§ 50.3）', async () => {
    const map = await getMapForRegion(TRAINING_GROUND_REGION_ID);
    const centre = DUMMY_SLOTS[0];
    // 可通行區是 x 1~width-2（外圍一圈是邊界）
    expect(centre.x - 1, '左側空間').toBeGreaterThanOrEqual(8);
    expect(map!.width - 2 - centre.x, '右側空間').toBeGreaterThanOrEqual(8);
  });

  it('出生點與管理員都在右側，避開左欄面板蓋住的那一帶（§ 50.3）', async () => {
    const map = await getMapForRegion(TRAINING_GROUND_REGION_ID);
    const centre = DUMMY_SLOTS[0];
    expect(map!.spawnPoint.x).toBeGreaterThan(centre.x);
    expect(map!.npcs![0].x).toBeGreaterThan(centre.x);
  });

  it('三座城鎮都放了試驗場入口 NPC', async () => {
    for (const id of TOWN_IDS) {
      const map = await getMapForRegion(id);
      const entrance = map!.npcs!.filter(n => n.facility === TRAINING_GROUND_FACILITY);
      expect(entrance, id).toHaveLength(1);
      expect(isWalkableTile(map!, entrance[0]), id).toBe(false);
    }
  });
});

describe('木樁參數（§ 50.4.2）', () => {
  it('超出範圍的輸入一律夾回範圍內，不會產生負防禦或 0 級木樁', () => {
    const spec = normalizeDummySpec({
      defense: 9999, hp: -5, level: 0, size: 'large', element: 'fire',
    });
    expect(spec.defense).toBe(DUMMY_DEFENSE_MAX);
    expect(spec.hp).toBe(1);
    expect(spec.level).toBe(1);
    expect(spec.size).toBe('large');
    expect(spec.element).toBe('fire');
  });

  it('無限血量（null）不被夾成數字', () => {
    expect(normalizeDummySpec({ defense: 0, hp: null, level: DUMMY_LEVEL_MAX, size: 'small', element: 'none' }).hp)
      .toBeNull();
  });

  it('防禦溢出轉迴避與 § 21.5 同一條公式', () => {
    expect(getDefenseOverflowDodge(DEFENSE_OVERFLOW_THRESHOLD)).toBe(0);
    expect(getDefenseOverflowDodge(80)).toBe(1);
    expect(getDefenseOverflowDodge(100)).toBe(5);
  });
});

describe('木樁召喚（§ 50.4.1）', () => {
  beforeEach(() => {
    useMapMonsterStore.setState({ monsters: [], combatMonsterIds: [] });
  });

  it('速度為 0 —— 木樁不移動', () => {
    useMapMonsterStore.getState().summonDummies(
      { defense: 10, hp: null, level: 5, size: 'small', element: 'none' },
      [...DUMMY_SLOTS].slice(0, 3),
    );
    const monsters = useMapMonsterStore.getState().monsters;
    expect(monsters).toHaveLength(3);
    for (const m of monsters) {
      expect(m.speed).toBe(0);
      expect(m.dummy).toBeDefined();
      expect(m.isBoss).toBe(false);
    }
  });

  it('再次召喚會清掉舊木樁，但不動到一般怪物', () => {
    const store = useMapMonsterStore.getState();
    const spec = { defense: 0, hp: null, level: 1, size: 'small' as const, element: 'none' as const };
    store.summonDummies(spec, [...DUMMY_SLOTS].slice(0, 4));
    // 混一隻一般怪進去，確認它不會被連坐清掉
    useMapMonsterStore.setState(s => ({
      monsters: [...s.monsters, { ...s.monsters[0], id: 'normal-1', dummy: undefined }],
    }));
    store.summonDummies(spec, [...DUMMY_SLOTS].slice(0, 2));

    const monsters = useMapMonsterStore.getState().monsters;
    expect(monsters.filter(m => m.dummy)).toHaveLength(2);
    expect(monsters.filter(m => !m.dummy).map(m => m.id)).toEqual(['normal-1']);
  });

  it('木樁不因距離脫離：玩家走到場地另一頭也還在', () => {
    const store = useMapMonsterStore.getState();
    store.summonDummies(
      { defense: 0, hp: null, level: 1, size: 'small', element: 'none' },
      [{ x: 12, y: 7 }],
    );
    const map = {
      id: 'x', name: 'x', width: 20, height: 15, theme: 'battlefield' as const,
      tiles: Array.from({ length: 15 }, (_, y) => Array.from({ length: 20 }, (_, x) =>
        (x === 0 || y === 0 || x === 19 || y === 14) ? 1 : 0)),
      spawnPoint: { x: 4, y: 7 },
    };
    // 脫離距離是 25，這裡刻意拉到更遠
    store.moveMonsters(1000, map, { x: 999, y: 999 });
    expect(useMapMonsterStore.getState().monsters).toHaveLength(1);
    expect(useMapMonsterStore.getState().monsters[0].position).toEqual({ x: 12, y: 7 });
  });

  it('autoSpawn: false 的地圖不自動生怪', () => {
    const map = {
      id: 'training-ground', name: '試驗場', width: 20, height: 15,
      theme: 'battlefield' as const, autoSpawn: false,
      tiles: Array.from({ length: 15 }, (_, y) => Array.from({ length: 20 }, (_, x) =>
        (x === 0 || y === 0 || x === 19 || y === 14) ? 1 : 0)),
      spawnPoint: { x: 4, y: 7 },
    };
    for (let i = 0; i < 200; i++) {
      useMapMonsterStore.getState().spawnTick(1000, map, { x: 4, y: 7 }, 10, 30);
    }
    expect(useMapMonsterStore.getState().monsters).toHaveLength(0);
  });
});

describe('量測（§ 50.5）', () => {
  beforeEach(() => {
    useTrainingGroundStore.getState().reset();
  });

  it('按下開始之前的傷害不計入', () => {
    const store = useTrainingGroundStore.getState();
    store.recordDamage(500, 2, 2);
    expect(useTrainingGroundStore.getState().measurement.totalDamage).toBe(0);
  });

  it('命中率的分母是判定次數，雙刀一次出手算兩次', () => {
    const store = useTrainingGroundStore.getState();
    store.start(100);
    store.recordDamage(80, 2, 1); // 打兩下、中一下
    store.recordDamage(0, 2, 0);  // 兩下全 MISS
    const m = useTrainingGroundStore.getState().measurement;
    expect(m.attemptCount).toBe(4);
    expect(m.hitCount).toBe(1);
    expect(getReadout(m, 100).hitRate).toBeCloseTo(25);
  });

  it('DoT 只加傷害，不動命中率', () => {
    const store = useTrainingGroundStore.getState();
    store.start(100);
    store.recordDamage(30, 0, 0);
    const m = useTrainingGroundStore.getState().measurement;
    expect(m.totalDamage).toBe(30);
    expect(getReadout(m, 100).hitRate).toBeNull();
  });

  it('DPS 與 MP 淨消耗依區間長度換算', () => {
    const store = useTrainingGroundStore.getState();
    store.start(200);
    store.recordDamage(1000, 1, 1);
    const started = useTrainingGroundStore.getState().measurement.startedAt!;
    // 停止後再讀，計時鎖在 stoppedAt，不會隨著 now 一直長
    const m = { ...useTrainingGroundStore.getState().measurement, running: false, stoppedAt: started + 10_000 };
    const readout = getReadout(m, 120);
    expect(readout.elapsedSeconds).toBeCloseTo(10);
    expect(readout.dps).toBeCloseTo(100);
    expect(readout.mpPerSecond).toBeCloseTo(8); // (200-120)/10
  });

  it('尚未開始過時計時為 0，不會拿 null 去算出一個大數字', () => {
    const m = useTrainingGroundStore.getState().measurement;
    expect(getElapsedMs(m)).toBe(0);
    expect(getReadout(m, 50).dps).toBe(0);
  });

  it('量測中不可回復滿血滿魔，否則 MP/秒 會變成負數（§ 50.5.3）', () => {
    const store = useTrainingGroundStore.getState();
    expect(canRestore(useTrainingGroundStore.getState().measurement)).toBe(true);
    store.start(100);
    expect(canRestore(useTrainingGroundStore.getState().measurement)).toBe(false);
    store.stop();
    expect(canRestore(useTrainingGroundStore.getState().measurement)).toBe(true);
  });

  it('停止後再記錄不會繼續累加', () => {
    const store = useTrainingGroundStore.getState();
    store.start(100);
    store.recordDamage(10, 1, 1);
    store.stop();
    store.recordDamage(999, 1, 1);
    expect(useTrainingGroundStore.getState().measurement.totalDamage).toBe(10);
  });
});

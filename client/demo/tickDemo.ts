/**
 * 300ms tick 調校頁的橋接層（`97-selfhosted-server.md` § 97.6、`99-ai-constraints.md` § 99.2）。
 *
 * 跑的是遊戲本體的 `gameLoopTick`、`PlayerEntity`、`MonsterEntity` 與地圖；
 * 這頁只負責：模式切換（每幀 ／ 固定 tick ／ 固定 tick ＋ 插值）、參數與統計。
 */
import { PixiApp } from '../src/pixi/PixiApp';
import { GameScene } from '../src/pixi/GameScene';
import { PlayerEntity } from '../src/pixi/entities/PlayerEntity';
import { MonsterEntity } from '../src/pixi/entities/MonsterEntity';
import { mapPositionToScreen } from '../src/pixi/utils/isometric';
import { getRenderedElevation, type MapData, type Position } from '../src/models/mapControl';
import { loadAllMaps } from '../src/models/mapDataControl';
import '../src/models/mapSource.vite';
import { CLASS_BASE_ATTRIBUTES, type Character } from '../src/models/character';
import { useGameStore } from '../src/stores/gameStore';
import { useMapControlStore } from '../src/stores/mapControlStore';
import { useMapMonsterStore } from '../src/stores/mapMonsterStore';
import { gameLoopTick } from '../src/systems/gameLoop';
import { createTickDriver, lerpPosition, type TickDriver } from '../src/systems/tickDriver';
import { TICK_MS, setGameNow } from '../src/core/clock';

export type SimMode = 'frame' | 'tick' | 'tick-lerp';

export interface TickDemoParams {
  mode: SimMode;
  tickMs: number;
  playerSpeed: number;
  monsterSpeed: number;
}

export const DEFAULT_PARAMS: TickDemoParams = {
  mode: 'tick-lerp',
  tickMs: TICK_MS,
  playerSpeed: 2,
  monsterSpeed: 1,
};

export interface TickDemoStats {
  fps: number;
  ticksPerSec: number;
  simMsPerTick: number;
  monsters: number;
}

/** 自動移動走到終點後等多久再挑下一個目標（遊戲本體由戰鬥 FSM 的 idle 觸發，這頁沒有戰鬥） */
const IDLE_WAIT_MS = 800;

function demoCharacter(): Character {
  const attrs = CLASS_BASE_ATTRIBUTES.knight;
  return {
    userId: 0,
    name: 'demo',
    className: 'knight',
    level: 10,
    exp: 0,
    expToNext: 100,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    baseAttributes: { ...attrs },
    bonusAttributes: { str: 0, agi: 0, vit: 0, spi: 0, int: 0, cha: 0 },
    unspentAttributePoints: 0,
    gold: 0,
    currentArea: '',
    currentZone: '',
    currentRegion: '',
    currentFloor: null,
    skills: [],
    quests: [],
    areaEnteredAt: 0,
    areaKills: 0,
    createdAt: 0,
  } as unknown as Character;
}

export class TickDemoStage {
  private pixiApp = new PixiApp();
  private scene: GameScene | null = null;
  private player: PlayerEntity | null = null;
  private monsterEntities = new Map<string, MonsterEntity>();
  private driver: TickDriver;
  private params: TickDemoParams = { ...DEFAULT_PARAMS };
  private idleMs = 0;
  private frames = 0;
  private ticks = 0;
  private simMsAcc = 0;
  private statWindowMs = 0;
  private lastStats: TickDemoStats = { fps: 0, ticksPerSec: 0, simMsPerTick: 0, monsters: 0 };
  private onStats: ((s: TickDemoStats) => void) | null = null;
  maps: MapData[] = [];

  constructor() {
    this.driver = createTickDriver(ms => this.step(ms), this.params.tickMs);
  }

  async init(container: HTMLElement): Promise<void> {
    await this.pixiApp.init({ resizeTo: container });
    container.appendChild(this.pixiApp.canvas);
    this.scene = new GameScene(this.pixiApp);
    this.player = new PlayerEntity();
    this.scene.entityLayer.container.addChild(this.player.container);

    useGameStore.setState({ character: demoCharacter(), equippedGear: {}, activeEffects: [] });
    this.maps = (await loadAllMaps()).filter(m => m.theme !== 'town' && m.autoSpawn !== false);
    this.pixiApp.app.ticker.add(t => this.frame(t.deltaMS));
  }

  async loadMap(mapId: string): Promise<void> {
    if (!this.scene) return;
    const mapStore = useMapControlStore.getState();
    await mapStore.loadMap(mapId);
    const map = useMapControlStore.getState().currentMap;
    if (!map) return;
    for (const e of this.monsterEntities.values()) e.container.destroy();
    this.monsterEntities.clear();
    this.scene.loadMap(map);
    useGameStore.setState(s => ({ character: s.character ? { ...s.character, areaEnteredAt: 0, areaKills: 0 } : s.character }));
    setGameNow(0);
    this.driver.reset();
    useMapControlStore.getState().setAutoMove(true);
    const pos = useMapControlStore.getState().playerPosition;
    const { sx, sy } = mapPositionToScreen(map, pos);
    this.pixiApp.camera.setTarget(sx, sy);
    this.pixiApp.camera.update(true);
  }

  setParams(next: Partial<TickDemoParams>): void {
    this.params = { ...this.params, ...next };
    if (next.tickMs !== undefined) {
      this.driver = createTickDriver(ms => this.step(ms), this.params.tickMs);
    }
    if (next.playerSpeed !== undefined) useMapControlStore.setState({ moveSpeed: this.params.playerSpeed });
    if (next.monsterSpeed !== undefined) {
      const ms = useMapMonsterStore.getState().monsters.map(m => ({ ...m, speed: this.params.monsterSpeed }));
      useMapMonsterStore.setState({ monsters: ms });
    }
  }

  getParams(): TickDemoParams {
    return { ...this.params };
  }

  subscribeStats(cb: (s: TickDemoStats) => void): void {
    this.onStats = cb;
  }

  exportParams(): string {
    return JSON.stringify(this.params, null, 2);
  }

  private step(ms: number): void {
    const t0 = performance.now();
    gameLoopTick(ms);
    this.applyMonsterSpeed();
    this.handleIdle(ms);
    this.simMsAcc += performance.now() - t0;
    this.ticks++;
  }

  /** 新生成的怪物帶預設速度，改成面板設定值 */
  private applyMonsterSpeed(): void {
    const store = useMapMonsterStore.getState();
    if (store.monsters.some(m => m.speed !== this.params.monsterSpeed)) {
      useMapMonsterStore.setState({ monsters: store.monsters.map(m => m.speed === this.params.monsterSpeed ? m : { ...m, speed: this.params.monsterSpeed }) });
    }
  }

  private handleIdle(ms: number): void {
    const mapStore = useMapControlStore.getState();
    if (mapStore.isMoving || !mapStore.autoMove) { this.idleMs = 0; return; }
    this.idleMs += ms;
    if (this.idleMs >= IDLE_WAIT_MS) {
      this.idleMs = 0;
      mapStore.pickRandomTarget();
    }
  }

  private frame(deltaMs: number): void {
    const map = useMapControlStore.getState().currentMap;
    if (!map || !this.scene || !this.player) return;

    let alpha = 1;
    if (this.params.mode === 'frame') {
      this.step(deltaMs);
    } else {
      this.driver.frame(deltaMs);
      alpha = this.params.mode === 'tick-lerp' ? this.driver.alpha() : 1;
    }

    const mapStore = useMapControlStore.getState();
    const playerPos = lerpPosition(mapStore.prevPlayerPosition, mapStore.playerPosition, alpha) as Position;
    this.player.update(deltaMs);
    this.player.updatePosition(playerPos, getRenderedElevation(map, playerPos));
    const { sx, sy } = mapPositionToScreen(map, playerPos);
    this.pixiApp.camera.setTarget(sx, sy);
    this.pixiApp.camera.update();

    const monsters = useMapMonsterStore.getState().monsters;
    const ids = new Set(monsters.map(m => m.id));
    for (const [id, e] of this.monsterEntities) {
      if (ids.has(id)) continue;
      e.container.destroy();
      this.monsterEntities.delete(id);
    }
    for (const m of monsters) {
      let e = this.monsterEntities.get(m.id);
      if (!e) {
        e = new MonsterEntity(m.id, m.isBoss);
        this.monsterEntities.set(m.id, e);
        this.scene.entityLayer.container.addChild(e.container);
      }
      const p = lerpPosition(m.prevPosition, m.position, alpha) as Position;
      e.update(deltaMs);
      e.updatePosition(p, getRenderedElevation(map, p));
    }
    this.scene.effectLayer.update(deltaMs);

    this.frames++;
    this.statWindowMs += deltaMs;
    if (this.statWindowMs >= 1000) {
      this.lastStats = {
        fps: Math.round(this.frames * 1000 / this.statWindowMs),
        ticksPerSec: Math.round(this.ticks * 1000 / this.statWindowMs * 10) / 10,
        simMsPerTick: this.ticks > 0 ? Math.round(this.simMsAcc / this.ticks * 100) / 100 : 0,
        monsters: monsters.length,
      };
      this.frames = 0; this.ticks = 0; this.simMsAcc = 0; this.statWindowMs = 0;
      this.onStats?.(this.lastStats);
    }
  }
}

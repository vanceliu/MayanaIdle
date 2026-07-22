import { useRef, useEffect } from 'react';
import { useMapControlStore } from '../stores/mapControlStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../stores/gameStore';
import { PixiApp } from '../pixi/PixiApp';
import { GameScene } from '../pixi/GameScene';
import { PlayerEntity } from '../pixi/entities/PlayerEntity';
import { MonsterEntity } from '../pixi/entities/MonsterEntity';
import { worldToScreen, screenToWorld } from '../pixi/utils/isometric';
import { gameLoopTick, occupation } from '../systems/gameLoop';
import { findAdjacentWalkable } from '../systems/pathfinding';
import { addExp } from '../systems/levelUp';
import { db } from '../db/database';
import type { MonsterTemplate } from '../models/monster';
import { createArpgEngine, tickArpgEngine, type ArpgEngineState } from '../systems/arpgEngine';
import { processPlayerAttack, processMonsterAttack } from '../systems/arpgEventHandler';
import type { MapMonster } from '../stores/mapMonsterStore';
import type { MonsterInstance } from '../models/monster';

export function PixiGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PixiApp | null>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const playerEntityRef = useRef<PlayerEntity | null>(null);
  const monsterMapRef = useRef<Map<string, MonsterEntity>>(new Map());
  const arpgEngineRef = useRef<ArpgEngineState>(createArpgEngine());
  const monsterInstancesRef = useRef<Map<string, MonsterInstance>>(new Map());
  const areaTemplatesRef = useRef<MonsterTemplate[]>([]);

  // Initialize PixiJS
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const pixiApp = new PixiApp();
    pixiAppRef.current = pixiApp;

    let destroyed = false;

    pixiApp.init({ resizeTo: container }).then(() => {
      if (destroyed) return;

      container.appendChild(pixiApp.canvas);

      const scene = new GameScene(pixiApp);
      sceneRef.current = scene;

      const player = new PlayerEntity();
      playerEntityRef.current = player;
      scene.entityLayer.container.addChild(player.container);

      const currentMap = useMapControlStore.getState().currentMap;
      if (currentMap) {
        scene.loadMap(currentMap);
        const pos = useMapControlStore.getState().playerPosition;
        player.updatePosition(pos);
        const { sx, sy } = worldToScreen(pos.x, pos.y);
        pixiApp.camera.setTarget(sx, sy);
        pixiApp.camera.update(true);

        // Load monster templates
        const char = useGameStore.getState().character;
        if (char) {
          const areaId = char.currentFloor != null
            ? `${char.currentRegion}-${char.currentFloor}f`
            : char.currentRegion;
          db.monsterTemplates.where('area').equals(areaId).toArray().then(templates => {
            areaTemplatesRef.current = templates;
          });
        }
      }

      // Main game loop
      pixiApp.ticker.add((ticker) => {
        const delta = ticker.deltaMS;
        const map = useMapControlStore.getState().currentMap;
        if (!map) return;

        // 1. Movement & collision (unified)
        gameLoopTick(delta);

        // 2. ARPG combat
        tickArpgCombatLoop(arpgEngineRef.current, monsterInstancesRef.current, areaTemplatesRef.current, delta);

        // 3. Render sync
        const playerPos = useMapControlStore.getState().playerPosition;
        if (playerEntityRef.current) {
          playerEntityRef.current.updatePosition(playerPos);
        }

        const { sx, sy } = worldToScreen(playerPos.x, playerPos.y);
        pixiApp.camera.setTarget(sx, sy);
        pixiApp.camera.update();

        syncMonsters(useMapMonsterStore.getState().monsters, scene!, monsterMapRef.current);

        const path = useMapControlStore.getState().currentPath;
        const pathIndex = useMapControlStore.getState().pathIndex;
        if (path.length > 0) {
          scene!.pathLayer.updatePath(path, pathIndex);
        } else {
          scene!.pathLayer.clear();
        }
      });
    });

    return () => {
      destroyed = true;
      monsterMapRef.current.forEach(m => m.destroy());
      monsterMapRef.current.clear();
      playerEntityRef.current = null;
      sceneRef.current = null;
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy();
        pixiAppRef.current = null;
      }
    };
  }, []);

  // React to map changes
  useEffect(() => {
    const unsubscribe = useMapControlStore.subscribe(
      (state) => state.currentMap,
      (currentMap) => {
        if (!currentMap || !sceneRef.current) return;
        sceneRef.current.loadMap(currentMap);
        monsterMapRef.current.forEach(m => {
          sceneRef.current?.entityLayer.container.removeChild(m.container);
          m.destroy();
        });
        monsterMapRef.current.clear();
        arpgEngineRef.current = createArpgEngine();
        monsterInstancesRef.current.clear();

        // Load monster templates for this area
        const char = useGameStore.getState().character;
        if (char) {
          const areaId = char.currentFloor != null
            ? `${char.currentRegion}-${char.currentFloor}f`
            : char.currentRegion;
          db.monsterTemplates.where('area').equals(areaId).toArray().then(templates => {
            areaTemplatesRef.current = templates;
          });
        }
      }
    );
    return unsubscribe;
  }, []);

  // Click handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const pixiApp = pixiAppRef.current;
      if (!pixiApp || !pixiApp.initialized) return;

      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const camOffset = pixiApp.camera.getOffset();
      const worldScreenX = clickX - camOffset.x;
      const worldScreenY = clickY - camOffset.y;

      const { x, y } = screenToWorld(worldScreenX, worldScreenY);
      const tileX = Math.floor(x);
      const tileY = Math.floor(y);

      const map = useMapControlStore.getState().currentMap;
      if (!map) return;
      if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) return;
      if (map.tiles[tileY][tileX] === 1) return;

      useMapControlStore.getState().moveToTarget({ x: tileX, y: tileY });
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, []);

  return (
    <div
      ref={containerRef}
      className="map-canvas-container"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}

// === ARPG Combat ===

function tickArpgCombatLoop(
  engine: ArpgEngineState,
  monsterInstances: Map<string, MonsterInstance>,
  areaTemplates: MonsterTemplate[],
  deltaMs: number,
) {
  const gameState = useGameStore.getState();
  const mapStore = useMapControlStore.getState();
  const monsterStore = useMapMonsterStore.getState();

  if (!gameState.character || !mapStore.currentMap) return;

  const playerPos = mapStore.playerPosition;
  const allGear = Object.values(gameState.equippedGear).filter(Boolean) as any[];

  // Ensure monster instances exist
  for (const mm of monsterStore.monsters) {
    if (!monsterInstances.has(mm.id)) {
      monsterInstances.set(mm.id, createMonsterFromTemplate(mm, areaTemplates));
    }
  }
  const activeIds = new Set(monsterStore.monsters.map(m => m.id));
  for (const id of monsterInstances.keys()) {
    if (!activeIds.has(id)) monsterInstances.delete(id);
  }

  const events = tickArpgEngine(engine, {
    playerPos,
    character: gameState.character,
    skills: gameState.skills,
    activeEffects: gameState.activeEffects,
    equippedGear: allGear,
    combatRules: gameState.combatRules ?? [],
    mapMonsters: monsterStore.monsters,
    monsterInstances,
    map: mapStore.currentMap,
    deltaMs,
  });

  // If player FSM is idle and autoMove, find next target
  if (engine.playerCtx.state === 'idle' && mapStore.autoMove && !mapStore.isMoving) {
    useMapControlStore.getState().pickRandomTarget();
  }

  const logs: { text: string; type: string }[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'player_attack': {
        // Don't attack when paused (recovering HP/MP)
        if (monsterStore.paused) break;
        const result = processPlayerAttack(event, {
          character: gameState.character,
          equippedGear: allGear,
          activeEffects: gameState.activeEffects,
          skills: gameState.skills,
          monsterInstances,
          mapMonsters: monsterStore.monsters,
        });
        logs.push(...result.logs);

        for (const dmg of result.damages) {
          if (dmg.killed) {
            const inst = monsterInstances.get(dmg.targetId);
            if (inst) handleMonsterDeath(inst);
            monsterInstances.delete(dmg.targetId);
            const currentMonsters = useMapMonsterStore.getState().monsters;
            useMapMonsterStore.setState({
              monsters: currentMonsters.filter(m => m.id !== dmg.targetId),
            });
          }
        }
        break;
      }

      case 'monster_attack': {
        const result = processMonsterAttack(event, {
          character: gameState.character,
          equippedGear: allGear,
          activeEffects: gameState.activeEffects,
          skills: gameState.skills,
          monsterInstances,
          mapMonsters: monsterStore.monsters,
        });
        if (result) {
          logs.push(result.log);
          const updatedChar = useGameStore.getState().character;
          if (updatedChar && updatedChar.hp <= 0) {
            handlePlayerDeath();
          }
        }
        break;
      }

      case 'move_to': {
        // FSM wants player to chase a target
        if (monsterStore.paused) break;
        const mapCtrl = useMapControlStore.getState();
        if (!mapCtrl.isMoving && mapCtrl.autoMove) {
          const targetTile = {
            x: Math.round(event.target.x),
            y: Math.round(event.target.y),
          };
          // Move to adjacent tile of target
          const map = mapCtrl.currentMap;
          if (map) {
            const adj = findAdjacentWalkable(map, targetTile, mapCtrl.playerPosition);
            if (adj) {
              useMapControlStore.getState().moveToTarget(adj);
            }
          }
        }
        break;
      }
    }
  }

  if (logs.length > 0) {
    const existing = useGameStore.getState().combatLogs;
    useGameStore.setState({
      combatLogs: [...existing.slice(-(200 - logs.length)), ...logs],
    });
  }
}

function createMonsterFromTemplate(mm: MapMonster, templates: MonsterTemplate[]): MonsterInstance {
  // Pick a template matching boss/non-boss
  const pool = mm.isBoss
    ? templates.filter(t => t.isBoss)
    : templates.filter(t => !t.isBoss);
  const template = pool.length > 0
    ? pool[Math.floor(Math.random() * pool.length)]
    : templates[Math.floor(Math.random() * templates.length)];

  if (!template) {
    // Fallback if no templates loaded yet
    return {
      templateId: 0,
      name: mm.isBoss ? 'Boss' : '怪物',
      level: 1,
      currentHp: 30,
      maxHp: 30,
      attackMin: 2,
      attackMax: 4,
      defense: 1,
      exp: 10,
      race: 'normal',
      size: mm.isBoss ? 'large' : 'small',
      element: 'none',
      isBoss: mm.isBoss,
      attackType: 'melee',
      attackRange: 1.5,
      attackInterval: 1200,
    };
  }

  return {
    templateId: template.id!,
    name: template.name,
    level: template.level,
    currentHp: template.hp,
    maxHp: template.hp,
    attackMin: template.attackMin,
    attackMax: template.attackMax,
    defense: template.defense,
    exp: template.exp,
    race: template.race,
    size: template.size,
    element: template.element,
    isBoss: template.isBoss,
    attackType: template.attackType ?? 'melee',
    attackRange: template.attackRange ?? 1.5,
    attackInterval: template.attackInterval ?? 1200,
    projectileSpeed: template.projectileSpeed,
  };
}

function handleMonsterDeath(monster: MonsterInstance) {
  const gs = useGameStore.getState();
  const char = gs.character;
  if (!char) return;

  const gold = Math.floor(Math.random() * monster.level * 5) + 1;
  const updatedChar = addExp({ ...char, gold: (char.gold ?? 0) + gold }, monster.exp);

  useGameStore.setState({ character: updatedChar });

  const existing = useGameStore.getState().combatLogs;
  useGameStore.setState({
    combatLogs: [
      ...existing.slice(-198),
      { text: `獲得 ${monster.exp} 經驗值`, type: 'reward' },
      { text: `獲得 ${gold} 金幣`, type: 'reward' },
    ],
  });
}

function handlePlayerDeath() {
  const gs = useGameStore.getState();
  const char = gs.character;
  if (!char) return;

  useGameStore.setState({
    character: { ...char, hp: Math.floor(char.maxHp * 0.3) },
    combatLogs: [
      ...gs.combatLogs.slice(-199),
      { text: '你倒下了 — 已傳送至最近城鎮', type: 'system' },
    ],
  });

  useMapMonsterStore.getState().clearAll();
  useMapMonsterStore.getState().setPaused(true);
}

// === Sprite Sync ===

function syncMonsters(
  monsters: MapMonster[],
  scene: GameScene,
  existingMap: Map<string, MonsterEntity>
) {
  const currentIds = new Set(monsters.map(m => m.id));

  for (const [id, entity] of existingMap) {
    if (!currentIds.has(id)) {
      scene.entityLayer.container.removeChild(entity.container);
      entity.destroy();
      existingMap.delete(id);
    }
  }

  for (const monster of monsters) {
    let entity = existingMap.get(monster.id);
    if (!entity) {
      entity = new MonsterEntity(monster.id, monster.isBoss);
      existingMap.set(monster.id, entity);
      scene.entityLayer.container.addChild(entity.container);
    }
    entity.updatePosition(monster.position);
  }
}

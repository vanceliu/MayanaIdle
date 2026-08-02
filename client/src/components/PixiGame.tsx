import { useRef, useEffect } from 'react';
import { useMapControlStore } from '../stores/mapControlStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { useMonsterHudStore, type MonsterHudEntry } from '../stores/monsterHudStore';
import { MonsterListOverlay } from './MonsterListOverlay';
import { BAG_DRAG_MIME, decodeBagDrag } from '../models/bagLayout';
import { useGameStore, getEffectiveMaxHp, type CombatLog } from '../stores/gameStore';
import { getNearestTown } from '../models/mapData';
import { PixiApp } from '../pixi/PixiApp';
import { GameScene } from '../pixi/GameScene';
import { PlayerEntity } from '../pixi/entities/PlayerEntity';
import { MonsterEntity } from '../pixi/entities/MonsterEntity';
import { mapPositionToScreen, screenToMapTile } from '../pixi/utils/isometric';
import { getRenderedElevation, type MapData } from '../models/mapControl';
import { hasProjectilePath } from '../systems/lineOfSight';
import { gameLoopTick, consumeDotTick } from '../systems/gameLoop';
import { findAttackPosition } from '../systems/pathfinding';
import { db } from '../db/database';
import { processMonsterDeath } from '../stores/gameStore';
import type { MonsterTemplate } from '../models/monster';
import { createArpgEngine, tickArpgEngine, type ArpgEngineState } from '../systems/arpgEngine';
import { processPlayerAttack, processMonsterAttack } from '../systems/arpgEventHandler';
import { isRangedAttackType } from '../models/monster';
import { isPlayerInvincible, absorbWithShield } from '../systems/combat';
import type { MapMonster } from '../stores/mapMonsterStore';
import type { MonsterInstance } from '../models/monster';
import type { DamageType } from '../pixi/ui/CombatVisualEvent';
import type { EffectLayer } from '../pixi/layers/EffectLayer';
import type { ProjectileShape } from '../pixi/ui/Projectile';
import { getSkillTemplate } from '../models/skillTemplate';

const PLAYER_PROJECTILE_SPEED = 512;
/** 怪物列表 HUD 快照發佈間隔（ms）；ticker 為每 frame，需節流避免 React 過度 re-render */
const HUD_PUBLISH_INTERVAL = 100;
const PLAYER_PROJECTILE_COLOR = 0xffffff;
const MONSTER_PROJECTILE_COLOR = 0xff6b6b;
const DEFAULT_MONSTER_PROJECTILE_SPEED = 384;

const ELEMENT_COLORS: Record<string, number> = {
  fire: 0xff6600,
  ice: 0x66ccff,
  wind: 0x66ff66,
  earth: 0xcc9933,
  light: 0xffffaa,
  dark: 0x9933ff,
  none: 0xffffff,
};

export function PixiGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PixiApp | null>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const playerEntityRef = useRef<PlayerEntity | null>(null);
  const monsterMapRef = useRef<Map<string, MonsterEntity>>(new Map());
  const arpgEngineRef = useRef<ArpgEngineState>(createArpgEngine());
  const monsterInstancesRef = useRef<Map<string, MonsterInstance>>(new Map());
  const areaTemplatesRef = useRef<MonsterTemplate[]>([]);
  const hudPublishTimerRef = useRef(0);

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
        player.updatePosition(pos, getRenderedElevation(currentMap, pos));
        const { sx, sy } = mapPositionToScreen(currentMap, pos);
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

        try {
          // 1. Movement & collision (unified)
          gameLoopTick(delta);

          // 2. ARPG combat
          tickArpgCombatLoop(arpgEngineRef.current, monsterInstancesRef.current, areaTemplatesRef.current, delta, scene!.effectLayer);
        } catch (e) {
          console.error('[GameLoop] Error:', e);
        }

        // 3. Render sync
        const playerPos = useMapControlStore.getState().playerPosition;
        if (playerEntityRef.current) {
          playerEntityRef.current.updatePosition(playerPos, getRenderedElevation(map, playerPos));
        }

        const { sx, sy } = mapPositionToScreen(map, playerPos);
        pixiApp.camera.setTarget(sx, sy);
        pixiApp.camera.update();

        syncMonsters(useMapMonsterStore.getState().monsters, map, scene!, monsterMapRef.current, monsterInstancesRef.current);

        // 3b. 怪物列表 HUD 快照（§ 24.8.3）
        hudPublishTimerRef.current += delta;
        if (hudPublishTimerRef.current >= HUD_PUBLISH_INTERVAL) {
          hudPublishTimerRef.current = 0;
          publishMonsterHud(
            useMapMonsterStore.getState().monsters,
            monsterInstancesRef.current,
            arpgEngineRef.current.playerCtx.targetMonsterId,
          );
        }

        // 4. Effect layer update
        scene!.effectLayer.update(delta);

        const path = useMapControlStore.getState().currentPath;
        const pathIndex = useMapControlStore.getState().pathIndex;
        if (path.length > 0) {
          scene!.pathLayer.updatePath(path, pathIndex, map, scene!.entityLayer.container);
        } else {
          scene!.pathLayer.clear();
        }
      });
    });

    return () => {
      destroyed = true;
      monsterMapRef.current.forEach(m => m.destroy());
      monsterMapRef.current.clear();
      useMonsterHudStore.getState().clear();
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
    let prevMapRef: MapData | null = null;
    const unsubscribe = useMapControlStore.subscribe((state) => {
      const currentMap = state.currentMap;
      if (currentMap === prevMapRef) return;
      prevMapRef = currentMap;

      if (!currentMap || !sceneRef.current) return;
      sceneRef.current.loadMap(currentMap);
      monsterMapRef.current.forEach(m => {
        sceneRef.current?.entityLayer.container.removeChild(m.container);
        m.destroy();
      });
      monsterMapRef.current.clear();
      arpgEngineRef.current = createArpgEngine();
      monsterInstancesRef.current.clear();
      useMonsterHudStore.getState().clear();

      // Reset camera to new player position
      const pos = state.playerPosition;
      if (playerEntityRef.current) {
        playerEntityRef.current.updatePosition(pos, getRenderedElevation(currentMap, pos));
      }
      if (pixiAppRef.current) {
        const { sx, sy } = mapPositionToScreen(currentMap, pos);
        pixiAppRef.current.camera.setTarget(sx, sy);
        pixiAppRef.current.camera.update(true);
      }

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
    });
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

      const map = useMapControlStore.getState().currentMap;
      if (!map) return;
      const tile = screenToMapTile(map, worldScreenX, worldScreenY);
      if (!tile) return;

      useMapControlStore.getState().moveToTarget(tile);
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, []);

  // § 35.5.3：從背包拖到地圖上＝丟棄（需確認）。
  // 只有帶 BAG_DRAG_MIME 的拖曳才 preventDefault，因此丟到其他 UI 一律無效果。
  function handleDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes(BAG_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent) {
    const payload = decodeBagDrag(e.dataTransfer.getData(BAG_DRAG_MIME));
    if (!payload) return;
    e.preventDefault();
    useGameStore.getState().requestDiscard({
      kind: payload.kind,
      name: payload.name,
      maxAmount: payload.kind === 'equipment' ? 1 : payload.amount,
      equipmentId: payload.equipmentId,
    });
  }

  return (
    <div
      className="map-canvas-container"
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Pixi canvas 以 appendChild 掛入，需與 React 管理的節點分離 */}
      <div ref={containerRef} className="map-canvas-stage" />
      <MonsterListOverlay />
    </div>
  );
}

function publishMonsterHud(
  monsters: MapMonster[],
  monsterInstances: Map<string, MonsterInstance>,
  targetId: string | null,
) {
  const entries: MonsterHudEntry[] = [];
  for (const mm of monsters) {
    const inst = monsterInstances.get(mm.id);
    if (!inst) continue;
    entries.push({
      id: mm.id,
      name: inst.name,
      currentHp: inst.currentHp,
      maxHp: inst.maxHp,
      isBoss: inst.isBoss,
    });
  }
  useMonsterHudStore.getState().publish(entries, targetId);
}

// === ARPG Combat ===

function tickArpgCombatLoop(
  engine: ArpgEngineState,
  monsterInstances: Map<string, MonsterInstance>,
  areaTemplates: MonsterTemplate[],
  deltaMs: number,
  effectLayer?: EffectLayer,
) {
  const gameState = useGameStore.getState();
  const mapStore = useMapControlStore.getState();
  const monsterStore = useMapMonsterStore.getState();

  if (!gameState.character || !mapStore.currentMap) return;

  const playerPos = mapStore.playerPosition;
  const currentMap = mapStore.currentMap;
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

  // If player FSM is idle and autoMove (not paused), find next target
  if (engine.playerCtx.state === 'idle' && mapStore.autoMove && !mapStore.isMoving && !monsterStore.paused) {
    useMapControlStore.getState().pickRandomTarget();
  }

  const logs: CombatLog[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'player_attack': {
        // Stop after reaching the current tile waypoint
        const mapCtrl2 = useMapControlStore.getState();
        if (mapCtrl2.isMoving && mapCtrl2.currentPath.length > 0) {
          const nextIdx = mapCtrl2.pathIndex;
          // Keep only the next waypoint so player finishes stepping onto it, then stops
          if (nextIdx < mapCtrl2.currentPath.length) {
            useMapControlStore.setState({
              currentPath: mapCtrl2.currentPath.slice(0, nextIdx + 1),
            });
          } else {
            useMapControlStore.setState({ isMoving: false, currentPath: [], pathIndex: 0 });
          }
        }
        const attackEvent = isRangedAttackType(event.attackType)
          ? {
              ...event,
              targetMonsterIds: event.targetMonsterIds.filter(targetId => {
                const target = monsterStore.monsters.find(monster => monster.id === targetId);
                return target && hasProjectilePath(playerPos, target.position, currentMap);
              }),
            }
          : event;
        if (isRangedAttackType(event.attackType) && event.targetMonsterIds.length > 0 && attackEvent.targetMonsterIds.length === 0) break;
        const result = processPlayerAttack(attackEvent, {
          character: gameState.character,
          equippedGear: allGear,
          activeEffects: gameState.activeEffects,
          skills: gameState.skills,
          monsterInstances,
          mapMonsters: monsterStore.monsters,
        });
        logs.push(...result.logs);

        // Emit heal visual event
        if (result.healAmount && result.healAmount > 0 && effectLayer) {
          const pPos = useMapControlStore.getState().playerPosition;
          const { sx, sy } = mapPositionToScreen(currentMap, pPos);
          effectLayer.spawnDamageNumber(sx, sy - 20, result.healAmount, 'heal');
        }

        for (const dmg of result.damages) {
          if (effectLayer) {
            const targetMonster = monsterStore.monsters.find(m => m.id === dmg.targetId);
            if (targetMonster) {
              const { sx: mx, sy: my } = mapPositionToScreen(currentMap, targetMonster.position);
              let damageType: DamageType = 'normal';
              if (dmg.isMiss) damageType = 'miss';
              else if (dmg.isCrit) damageType = 'crit';
              else if (result.skillUsed && result.skillUsed.element && result.skillUsed.element !== 'none') damageType = 'element';
              else if (result.skillUsed) damageType = 'skill';

              if (isRangedAttackType(event.attackType) && hasProjectilePath(playerPos, targetMonster.position, mapStore.currentMap)) {
                const pPos = useMapControlStore.getState().playerPosition;
                const { sx: px, sy: py } = mapPositionToScreen(currentMap, pPos);
                const isSkill = !!result.skillUsed;
                const element = result.skillUsed?.element ?? 'none';
                const enchantBuff = !isSkill
                  ? gameState.activeEffects.find(e => e.type === 'buff' && e.category.endsWith('-enchant'))
                  : undefined;
                const enchantElement = enchantBuff
                  ? getSkillTemplate(enchantBuff.sourceSkillId)?.element
                  : undefined;
                const isBowSkill = isSkill && result.skillUsed?.requiredWeaponType === 'bow';
                const color = isSkill
                  ? (isBowSkill && enchantElement ? (ELEMENT_COLORS[enchantElement] ?? PLAYER_PROJECTILE_COLOR)
                    : (ELEMENT_COLORS[element] ?? PLAYER_PROJECTILE_COLOR))
                  : (enchantElement ? (ELEMENT_COLORS[enchantElement] ?? PLAYER_PROJECTILE_COLOR) : PLAYER_PROJECTILE_COLOR);
                const shape: ProjectileShape = (!isSkill || isBowSkill) ? 'arrow' : 'circle';
                const size = isSkill && !isBowSkill && result.skillUsed?.target === 'aoe' ? 5 : undefined;

                const hits = (isBowSkill && result.skillUsed?.hits) ? result.skillUsed.hits : 1;
                const MULTI_HIT_DELAY = 100;
                for (let h = 0; h < hits; h++) {
                  const isLast = h === hits - 1;
                  const spawnFn = () => {
                    const spread = hits > 1 ? (h - (hits - 1) / 2) * 4 : 0;
                    effectLayer.spawnProjectile({
                      fromX: px, fromY: py - 20 + spread,
                      toX: mx, toY: my - 20,
                      speed: PLAYER_PROJECTILE_SPEED,
                      color,
                      onArrive: isLast
                        ? () => { effectLayer.spawnDamageNumber(mx, my - 20, dmg.damage, damageType); }
                        : () => {},
                      shape, size,
                    });
                  };
                  if (h === 0) spawnFn();
                  else setTimeout(spawnFn, h * MULTI_HIT_DELAY);
                }
              } else {
                effectLayer.spawnDamageNumber(mx, my - 20, dmg.damage, damageType);
              }
            }
          }

          if (dmg.killed) {
            const inst = monsterInstances.get(dmg.targetId);
            const monsterIdx = monsterStore.monsters.findIndex(m => m.id === dmg.targetId);
            if (inst) handleMonsterDeath(inst, monsterIdx, dmg.targetId);
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
        if (isRangedAttackType(event.attackType)) {
          const attacker = monsterStore.monsters.find(monster => monster.id === event.monsterId);
          if (!attacker || !hasProjectilePath(attacker.position, playerPos, mapStore.currentMap)) break;
        }
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
          if (result.shieldLog) logs.push(result.shieldLog);
          if (result.debuffLog) logs.push(result.debuffLog);

          if (effectLayer) {
            const pPos = useMapControlStore.getState().playerPosition;
            const { sx, sy } = mapPositionToScreen(currentMap, pPos);
            const dmgType: DamageType = result.isDodged ? 'miss' : 'normal';
            const dmgValue = result.isDodged ? 0 : result.damage;

            if (isRangedAttackType(event.attackType)) {
              const monster = monsterStore.monsters.find(m => m.id === event.monsterId);
              if (monster && hasProjectilePath(monster.position, playerPos, currentMap)) {
                const { sx: mx, sy: my } = mapPositionToScreen(currentMap, monster.position);
                const speed = event.projectileSpeed ?? DEFAULT_MONSTER_PROJECTILE_SPEED;
                effectLayer.spawnProjectile({
                  fromX: mx, fromY: my - 20,
                  toX: sx, toY: sy - 20,
                  speed, color: MONSTER_PROJECTILE_COLOR,
                  onArrive: () => {
                    effectLayer.spawnDamageNumber(sx, sy - 20, dmgValue, dmgType);
                  },
                });
              }
            } else {
              effectLayer.spawnDamageNumber(sx, sy - 20, dmgValue, dmgType);
            }
          }

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
        if (mapCtrl.autoMove) {
          const targetTile = {
            x: Math.round(event.target.x),
            y: Math.round(event.target.y),
          };
          const map = mapCtrl.currentMap;
          if (map) {
            const playerTile = {
              x: Math.round(mapCtrl.playerPosition.x),
              y: Math.round(mapCtrl.playerPosition.y),
            };
            const attackPosition = findAttackPosition(map, targetTile, playerTile, event.range);
            if (attackPosition) {
              // Repath if not moving, or if current destination differs from desired
              const currentDest = mapCtrl.currentPath[mapCtrl.currentPath.length - 1];
              const needsRepath = !mapCtrl.isMoving ||
                !currentDest || currentDest.x !== attackPosition.x || currentDest.y !== attackPosition.y;
              if (needsRepath) {
                useMapControlStore.getState().moveToTarget(attackPosition);
              }
            } else {
              engine.playerCtx.targetMonsterId = null;
              engine.playerCtx.state = 'idle';
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

  // === DoT tick (every 1000ms) ===
  if (consumeDotTick()) {
    processDotTick(monsterInstances, effectLayer);
    processPlayerDotTick(effectLayer);
    processPlayerHotTick(effectLayer);
  }
}

/**
 * 角色持續回復結算（聖域每秒回血 20）
 * 與 DoT 共用 1000ms tick；回復不超過有效最大 HP，死亡狀態不回復。
 */
function processPlayerHotTick(effectLayer?: EffectLayer) {
  const gs = useGameStore.getState();
  const now = Date.now();
  const hotEffects = gs.activeEffects.filter(
    e => e.type === 'buff' && e.target === 'player' && e.hot && now < e.startTime + e.duration
  );
  if (hotEffects.length === 0) return;

  const char = gs.character;
  if (!char || char.hp <= 0) return;

  const effMaxHp = getEffectiveMaxHp(char, gs.equippedGear);
  if (char.hp >= effMaxHp) return;

  const total = hotEffects.reduce((sum, e) => sum + (e.hot?.amount ?? 0), 0);
  const healed = Math.min(effMaxHp - char.hp, total);
  if (healed <= 0) return;

  const logs: CombatLog[] = [{ text: `${hotEffects.map(e => e.name).join('、')} 回復 ${healed} HP`, type: 'system' }];
  const existing = useGameStore.getState().combatLogs;
  useGameStore.setState({
    character: { ...char, hp: char.hp + healed },
    combatLogs: [...existing.slice(-(200 - logs.length)), ...logs],
  });

  if (effectLayer) {
    const map = useMapControlStore.getState().currentMap;
    if (map) {
      const pPos = useMapControlStore.getState().playerPosition;
      const { sx, sy } = mapPositionToScreen(map, pPos);
      effectLayer.spawnDamageNumber(sx, sy - 20, healed, 'heal');
    }
  }
}

/**
 * 角色 DoT 結算（中毒 / 流血）
 * § 24.4.4：無視防禦、不觸發爆擊、可致死
 */
function processPlayerDotTick(effectLayer?: EffectLayer) {
  const gs = useGameStore.getState();
  const now = Date.now();
  const dotEffects = gs.activeEffects.filter(
    e => e.type === 'debuff' && e.target === 'player' && e.dot && now < e.startTime + e.duration
  );
  if (dotEffects.length === 0) return;

  const char = gs.character;
  if (!char || char.hp <= 0) return;
  // 無敵期間免疫所有傷害，含 DoT
  if (isPlayerInvincible(gs.activeEffects, now)) return;

  const logs: CombatLog[] = [];
  let hp = char.hp;
  let effects = gs.activeEffects;
  for (const effect of dotEffects) {
    if (!effect.dot) continue;
    // 護盾同樣吸收 DoT 傷害（§ 24.4.9）
    const shield = absorbWithShield(effect.dot.damage, effects, now);
    effects = shield.effects;
    if (shield.absorbed > 0) {
      logs.push({ text: `聖光護盾吸收 ${shield.absorbed} 傷害${shield.broken ? '後破裂' : ''}`, type: 'system' });
    }
    const dmg = shield.damage;
    if (dmg <= 0) continue;
    hp = Math.max(0, hp - dmg);
    logs.push({ text: `${effect.name} 造成 ${dmg} 傷害`, type: 'debuff-self' });

    if (effectLayer) {
      const map = useMapControlStore.getState().currentMap;
      if (map) {
        const pPos = useMapControlStore.getState().playerPosition;
        const { sx, sy } = mapPositionToScreen(map, pPos);
        effectLayer.spawnDamageNumber(sx, sy - 20, dmg, 'dot');
      }
    }
    if (hp <= 0) break;
  }

  const existing = useGameStore.getState().combatLogs;
  useGameStore.setState({
    character: { ...useGameStore.getState().character!, hp },
    activeEffects: effects,
    combatLogs: [...existing.slice(-(200 - logs.length)), ...logs],
  });

  if (hp <= 0) handlePlayerDeath();
}

function processDotTick(monsterInstances: Map<string, MonsterInstance>, effectLayer?: EffectLayer) {
  const gs = useGameStore.getState();
  const now = Date.now();
  const dotEffects = gs.activeEffects.filter(
    e => e.type === 'debuff' && e.target === 'monster' && e.dot && now < e.startTime + e.duration
  );

  if (dotEffects.length === 0) return;

  const logs: CombatLog[] = [];
  const monsterStore = useMapMonsterStore.getState();

  for (const effect of dotEffects) {
    if (!effect.dot) continue;
    // Use targetMonsterId for reliable lookup
    const monsterId = effect.targetMonsterId;
    if (!monsterId) continue;

    const inst = monsterInstances.get(monsterId);
    if (!inst || inst.currentHp <= 0) continue;

    inst.currentHp = Math.max(0, inst.currentHp - effect.dot.damage);
    logs.push({ text: `${effect.name} 對 ${inst.name} 造成 ${effect.dot.damage} 傷害`, type: 'debuff-enemy' });

    if (effectLayer) {
      const targetMonster = monsterStore.monsters.find(m => m.id === monsterId);
      const map = useMapControlStore.getState().currentMap;
      if (targetMonster && map) {
        const { sx, sy } = mapPositionToScreen(map, targetMonster.position);
        effectLayer.spawnDamageNumber(sx, sy - 20, effect.dot.damage, 'dot');
      }
    }

    if (inst.currentHp <= 0) {
      const monsterIdx = monsterStore.monsters.findIndex(m => m.id === monsterId);
      handleMonsterDeath(inst, monsterIdx, monsterId);
      monsterInstances.delete(monsterId);
      useMapMonsterStore.setState({
        monsters: monsterStore.monsters.filter(m => m.id !== monsterId),
      });
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
    debuffs: template.debuffs,
  };
}

function handleMonsterDeath(monster: MonsterInstance, monsterIdx: number, monsterId?: string) {
  const get = useGameStore.getState;
  const set = (s: any) => useGameStore.setState(s);
  const gs = get();
  if (!gs.character) return;

  const allGear = Object.values(gs.equippedGear).filter(Boolean) as any[];
  const monsters = [monster];

  const result = processMonsterDeath(get, set, monsters, 0, { ...gs.character }, [...gs.combatLogs], allGear);

  set({
    character: result.char,
    combatLogs: result.logs.slice(-200),
  });

  // Clear debuffs on this monster (use ID if available, fallback to index)
  const effects = get().activeEffects;
  const cleaned = effects.filter(e => {
    if (e.target !== 'monster') return true;
    if (monsterId && e.targetMonsterId) return e.targetMonsterId !== monsterId;
    return e.targetIdx !== monsterIdx;
  });
  if (cleaned.length !== effects.length) {
    set({ activeEffects: cleaned });
  }

  // Auto-save after kill
  useGameStore.getState().saveState();
}

function handlePlayerDeath() {
  const gs = useGameStore.getState();
  const char = gs.character;
  if (!char) return;

  const nearestTown = getNearestTown(char.currentRegion);

  // § 13.8：HP 恢復至「有效最大 HP」的 50%（含裝備 bonusHp 與最大HP%詞綴）
  const effMaxHp = getEffectiveMaxHp(char, gs.equippedGear);

  const updatedChar = {
    ...char,
    hp: Math.floor(effMaxHp * 0.5),
    currentArea: nearestTown.id,
    currentRegion: nearestTown.id,
    currentFloor: null,
    currentZone: nearestTown.zoneId,
    areaEnteredAt: Date.now(),
    mapPositionX: undefined,
    mapPositionY: undefined,
  };

  const stats = { ...gs.statistics, deathCount: gs.statistics.deathCount + 1 };

  useGameStore.setState({
    character: updatedChar,
    combatLogs: [
      ...gs.combatLogs.slice(-199),
      { text: `你倒下了...傳送至${nearestTown.name}`, type: 'system' },
    ],
    statistics: stats,
  });

  useMapMonsterStore.getState().clearAll();
  useGameStore.getState().saveState();
}

// === Sprite Sync ===

function syncMonsters(
  monsters: MapMonster[],
  map: import('../models/mapControl').MapData,
  scene: GameScene,
  existingMap: Map<string, MonsterEntity>,
  monsterInstances: Map<string, MonsterInstance>,
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
    entity.updatePosition(monster.position, getRenderedElevation(map, monster.position));

    const inst = monsterInstances.get(monster.id);
    if (inst) {
      entity.updateHp(inst.currentHp, inst.maxHp);
    }
  }
}

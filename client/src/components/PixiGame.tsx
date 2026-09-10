import { useRef, useState, useEffect } from 'react';
import { useMapControlStore } from '../stores/mapControlStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { useMonsterHudStore, type MonsterHudEntry } from '../stores/monsterHudStore';
import { useCombatCommandStore } from '../stores/combatCommandStore';
import { MonsterListOverlay } from './MonsterListOverlay';
import { useGameStore } from '../stores/gameStore';
import { PixiApp } from '../pixi/PixiApp';
import { GameScene } from '../pixi/GameScene';
import { PlayerEntity, TEAMMATE_MARKER } from '../pixi/entities/PlayerEntity';
import { usePartyStore, type TeammateView } from '../stores/partyStore';
import { MonsterEntity } from '../pixi/entities/MonsterEntity';
import { NpcEntity, NPC_BODY_OFFSET } from '../pixi/entities/NpcEntity';
import { useTownStore } from '../stores/townStore';
import type { TownFacility } from './TownView';
import { mapPositionToScreen, screenToMapTile, screenToWorld, worldToScreen } from '../pixi/utils/isometric';
import { getRenderedElevation, type MapData, type MapNpc, type Position } from '../models/mapControl';
import { gameLoopTick } from '../systems/gameLoop';
import { isOnline } from '../net/online';
import { mirrorLastTickAt, drainMirrorVisuals, mirrorCastProgress } from '../net/mirror';
import { lerpPosition } from '../systems/tickDriver';
import { TICK_MS } from '../core/clock';
import { tickCombat, resetCombat, loadAreaTemplates, type CombatVisual } from '../systems/combatLoop';
import { defaultSession } from '../stores/session';
import { getEquippedWeapon } from '../systems/combat';
import {
  isPawnWeaponType, weaponAimFromDelta, weaponPlaybackMs, WEAPON_ART,
} from '../pixi/entities/pawn/weaponGeometry';
import { castProgress } from '../systems/monsterCombatFSM';
import type { MapMonster } from '../stores/mapMonsterStore';
import type { MonsterInstance } from '../models/monster';
import type { DamageType } from '../pixi/ui/CombatVisualEvent';
import type { EffectLayer } from '../pixi/layers/EffectLayer';
import { getMonsterProjectileStyle } from '../pixi/ui/projectileStyle';
import {
  HIT_LIFT, playSkillFx, resolveAttackFxContext,
  resolveMonsterAttackFxPlan, resolveMuzzleOffset, resolvePlayerAttackFxPlan,
  resolveAuraColor, resolveSkillFxPlan, resolveStatusTint, StatusMarkTracker,
  type SkillFxPlan, type SkillFxTarget, type StatusFxTarget,
} from '../pixi/ui/skillFx';
import { clearSelfCastFx, drainSelfCastFx } from '../systems/selfCastFx';
import type { DamageResult, PlayerAttackResult } from '../systems/arpgEventHandler';
import type { Skill } from '../models/skill';
import type { Affix } from '../models/affix';
import type { EquipmentInstance, WeaponMaterial } from '../models/equipment';
import { getSkillTemplate } from '../models/skillTemplate';
import type { ActiveEffect } from '../models/effect';
import { resolveRenderLimits } from '../pixi/renderLimits';
import { gameNow } from '../core/clock';

const PLAYER_PROJECTILE_SPEED = 512;
/** 怪物列表 HUD 快照發佈間隔（ms）；ticker 為每 frame，需節流避免 React 過度 re-render */
const HUD_PUBLISH_INTERVAL = 100;
const DEFAULT_MONSTER_PROJECTILE_SPEED = 384;

export function PixiGame() {
  const [initError, setInitError] = useState<string | null>(null);
  /**
   * 滑鼠懸停在實體上時顯示的名稱（玩家／怪物／NPC 共用）。
   * 只有文字進 React state；位置每幀由 ticker 直接寫進 DOM ——
   * 名稱要跟著球體跑（怪物會動、鏡頭也會動），用 state 更新等於每幀 re-render。
   */
  const [hoverText, setHoverText] = useState<string | null>(null);
  const hoverTargetRef = useRef<EntityHover['target'] | null>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PixiApp | null>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const playerEntityRef = useRef<PlayerEntity | null>(null);
  const monsterMapRef = useRef<Map<string, MonsterEntity>>(new Map());
  /** 同實例在場隊友的剪影，鍵為角色 id（§ 97.7.1） */
  const teammateMapRef = useRef<Map<number, PlayerEntity>>(new Map());
  const npcEntitiesRef = useRef<NpcEntity[]>([]);
  const hudPublishTimerRef = useRef(0);
  /** 暈眩標記是常駐原型，要記住誰身上已經有一個（§ 48.8.3） */
  const statusMarksRef = useRef(new StatusMarkTracker());

  // Initialize PixiJS
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const pixiApp = new PixiApp();
    pixiAppRef.current = pixiApp;

    let destroyed = false;

    pixiApp.init({ resizeTo: container, ...resolveRenderLimits() }).then(() => {
      if (destroyed) return;

      container.appendChild(pixiApp.canvas);

      const scene = new GameScene(pixiApp);
      sceneRef.current = scene;

      // 玩家的外觀存在角色列上（`04-character.md` § 4.10）；
      // 舊角色沒有這個欄位，PlayerEntity 內部會退回預設
      const player = new PlayerEntity(useGameStore.getState().character?.appearance);
      playerEntityRef.current = player;
      scene.entityLayer.container.addChild(player.container);

      const currentMap = useMapControlStore.getState().currentMap;
      if (currentMap) {
        scene.loadMap(currentMap);
        // 地圖已經載好才掛載（重新整理／回到同一張圖）時，地圖變更的訂閱不會觸發，
        // NPC 必須在這裡補畫。
        syncNpcs(currentMap, scene, npcEntitiesRef.current);
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
          loadAreaTemplates(areaId);
        }
      }

      // Main game loop
      pixiApp.ticker.add((ticker) => {
        const delta = ticker.deltaMS;
        const map = useMapControlStore.getState().currentMap;
        if (!map) return;

        // 線上模式：模擬在 server，這裡只在兩個 tick 之間插值並畫演出
        let alpha = 1;
        try {
          if (isOnline()) {
            alpha = Math.min(1, (performance.now() - mirrorLastTickAt()) / TICK_MS);
            syncTeammates(usePartyStore.getState().teammates, map, scene!, teammateMapRef.current, delta, alpha);
            renderCombatVisuals(drainMirrorVisuals(), scene!.effectLayer, playerEntityRef.current, monsterMapRef.current, teammateMapRef.current);
            for (const [id, entity] of monsterMapRef.current) {
              entity.updateCast(mirrorCastProgress(id) ?? 0);
            }
          } else {
            // 1. Movement & collision (unified)
            gameLoopTick(delta);

            // 2. ARPG combat：模擬在 session，演出由回傳的 CombatVisual 畫
            const visuals = tickCombat(delta);
            renderCombatVisuals(visuals, scene!.effectLayer, playerEntityRef.current, monsterMapRef.current, teammateMapRef.current);
            for (const [id, m] of defaultSession.combat.engine.monsters) {
              monsterMapRef.current.get(id)?.updateCast(castProgress(m.combatCtx));
            }
          }
        } catch (e) {
          console.error('[GameLoop] Error:', e);
        }

        // 3. Render sync（線上模式對 prev→cur 插值；單機 alpha 固定 1）
        const mapCtrlNow = useMapControlStore.getState();
        const playerPos = lerpPosition(mapCtrlNow.prevPlayerPosition, mapCtrlNow.playerPosition, alpha) as Position;
        if (playerEntityRef.current) {
          /* 武器演出要在位置同步之前推進：出手那一幀才會用到剛設好的朝向 */
          playerEntityRef.current.update(delta);
          playerEntityRef.current.updatePosition(playerPos, getRenderedElevation(map, playerPos));
        }

        const { sx, sy } = mapPositionToScreen(map, playerPos);
        pixiApp.camera.setTarget(sx, sy);
        pixiApp.camera.update();

        syncMonsters(
          useMapMonsterStore.getState().monsters, map, scene!,
          monsterMapRef.current, defaultSession.combat.monsterInstances, delta,
          defaultSession.combat.engine.playerCtx.targetMonsterId,
          alpha,
        );

        /* 常駐腳本放的 buff／治癒在 store 那一層，只能靠佇列傳過來（線上模式由 server 以 `self_cast` 推送） */
        if (!isOnline()) drainSelfCastFxInto(scene!.effectLayer, map, playerPos);

        /* 染色與暈眩標記跟著 debuff 存續，所以每幀對一次帳（§ 48.8.2、§ 48.8.3） */
        syncStatusFx(
          map, scene!.effectLayer, statusMarksRef.current,
          playerEntityRef.current, playerPos,
          useMapMonsterStore.getState().monsters, monsterMapRef.current,
        );

        // 3b. 怪物列表 HUD 快照（§ 24.8.3）
        hudPublishTimerRef.current += delta;
        if (hudPublishTimerRef.current >= HUD_PUBLISH_INTERVAL) {
          hudPublishTimerRef.current = 0;
          publishMonsterHud(
            useMapMonsterStore.getState().monsters,
            defaultSession.combat.monsterInstances,
            defaultSession.combat.engine.playerCtx.targetMonsterId,
          );
        }

        // 3c. 懸停名稱跟著球體跑（怪物會移動、鏡頭也會移動）
        const hoverTarget = hoverTargetRef.current;
        const hoverEl = hoverLabelRef.current;
        if (hoverTarget && hoverEl) {
          const pos = hoverTarget.kind === 'player'
            ? useMapControlStore.getState().playerPosition
            : hoverTarget.kind === 'monster'
              ? useMapMonsterStore.getState().monsters.find(m => m.id === hoverTarget.id)?.position
              : hoverTarget.kind === 'teammate'
                ? usePartyStore.getState().teammates.find(t => t.characterId === hoverTarget.memberId)?.position
                : hoverTarget.pos;
          if (pos) {
            const anchor = entityScreenPos(map, pos);
            const offset = pixiApp.camera.getOffset();
            // 用 transform 而不是 left/top：後者每幀都會觸發 layout，transform 走合成層
            hoverEl.style.transform =
              `translate3d(${anchor.sx + offset.x}px, ${anchor.sy - NPC_BODY_OFFSET + offset.y}px, 0) translate(-50%, -160%)`;
          }
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
    }).catch((err: unknown) => {
      // 不可靜默失敗：初始化中斷會讓 canvas 不掛載、地圖不繪製、ticker 不啟動，
      // 畫面只剩一個空的黑框且完全沒有線索，玩家只能自己猜要重新整理。
      console.error('[PixiGame] PixiJS 初始化失敗', err);
      if (!destroyed) setInitError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      destroyed = true;
      monsterMapRef.current.forEach(m => m.destroy());
      monsterMapRef.current.clear();
      teammateMapRef.current.forEach(t => t.destroy());
      teammateMapRef.current.clear();
      npcEntitiesRef.current.forEach(n => n.destroy());
      npcEntitiesRef.current.length = 0;
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

      // 場景尚未建好（init 仍在進行）時不可記錄 prevMapRef；
      // 這種情況由 init 完成後讀取 store 當下的 currentMap 補畫。
      if (!currentMap || !sceneRef.current) return;
      prevMapRef = currentMap;

      sceneRef.current.loadMap(currentMap);
      /*
       * `loadMap()` 已經把特效層清空，追蹤表也要跟著忘掉 ——
       * 不忘的話它會以為那隻怪頭上還有星星，下一幀只 `move` 不 `spawn`，
       * 標記就永遠不會再出現（而且不會報錯）。
       */
      statusMarksRef.current.clear(sceneRef.current.effectLayer.skillFx);
      /* 還沒演的自身技能是上一張地圖的事，丟掉 */
      clearSelfCastFx();
      monsterMapRef.current.forEach(m => {
        sceneRef.current?.entityLayer.container.removeChild(m.container);
        m.destroy();
      });
      monsterMapRef.current.clear();
      teammateMapRef.current.forEach(t => {
        sceneRef.current?.entityLayer.container.removeChild(t.container);
        t.destroy();
      });
      teammateMapRef.current.clear();
      syncNpcs(currentMap, sceneRef.current, npcEntitiesRef.current);
      resetCombat();
      useMonsterHudStore.getState().clear();
      /* 還沒消費的手動指令指的是上一張地圖的怪，跟著清掉（§ 3.6） */
      useCombatCommandStore.getState().clear();

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
        // 先清空：換區時若沿用上一區的模板，會生出不屬於這張圖的怪
        loadAreaTemplates(areaId);
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

      /*
       * 城鎮 NPC 判定（§ 13.2.1）。三條硬性順序：
       * 1. 必須在 screenToMapTile 之前（NPC 站在不可通行格上，screenToMapTile 回傳 null）
       * 2. 必須跟地圖移動走同一個 DOM handler，不可用 Pixi 的 pointertap
       * 3. 用圖示的螢幕範圍判定，不用格子距離
       */
      const npc = findNpcAtScreen(map, worldScreenX, worldScreenY);
      if (npc) {
        // 點得到就開，不看距離（§ 13.2.1）
        useTownStore.getState().openFacility(npc.facility as TownFacility);
        return;
      }

      /*
       * 點怪切目標（§ 3.6.1）。判定順序是 **NPC → 怪物 → 地格移動**，
       * 而且必須在 `screenToMapTile` 之前 —— 怪物站的格子是可通行的，
       * 先取格子會把「點正中怪物」變成一道移動指令，目標永遠切不掉。
       *
       * 命中判定共用 hover 那支 `findEntityAtScreen`：兩者用不同的半徑或錨點時，
       * 會出現「名字浮出來了但點下去沒反應」。
       */
      const entity = findEntityAtScreen(
        map,
        worldScreenX,
        worldScreenY,
        useMapControlStore.getState().playerPosition,
        useGameStore.getState().character?.name ?? '',
        useMapMonsterStore.getState().monsters,
        defaultSession.combat.monsterInstances,
        usePartyStore.getState().teammates,
      );
      if (entity?.target.kind === 'monster' && entity.target.id) {
        const instance = defaultSession.combat.monsterInstances.get(entity.target.id);
        // 屍體不可指定；點到就當作沒點到，維持原目標
        if (instance && instance.currentHp > 0) {
          useCombatCommandStore.getState().requestTarget(entity.target.id);
        }
        return;
      }

      const tile = screenToMapTile(map, worldScreenX, worldScreenY);
      if (!tile) return;

      // 點地圖＝離開互動：關掉開著的設施面板，也取消還沒走到的 NPC
      useTownStore.getState().closeFacility();
      useMapControlStore.getState().moveToTarget(tile);
    };

    // 滑鼠移到任何實體球體上就顯示名稱（玩家／怪物／NPC）
    const handleMove = (e: MouseEvent) => {
      const pixiApp = pixiAppRef.current;
      if (!pixiApp || !pixiApp.initialized) return;

      const rect = container.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const camOffset = pixiApp.camera.getOffset();
      const map = useMapControlStore.getState().currentMap;
      if (!map) return;

      const hit = findEntityAtScreen(
        map,
        localX - camOffset.x,
        localY - camOffset.y,
        useMapControlStore.getState().playerPosition,
        useGameStore.getState().character?.name ?? '',
        useMapMonsterStore.getState().monsters,
        defaultSession.combat.monsterInstances,
        usePartyStore.getState().teammates,
      );

      hoverTargetRef.current = hit ? hit.target : null;
      setHoverText(hit?.text ?? null);
    };

    container.addEventListener('click', handleClick);
    container.addEventListener('mousemove', handleMove);
    container.addEventListener('mouseleave', () => {
      hoverTargetRef.current = null;
      setHoverText(null);
    });
    return () => {
      container.removeEventListener('click', handleClick);
      container.removeEventListener('mousemove', handleMove);
    };
  }, []);

  return (
    <div
      className="map-canvas-container"
      style={{ width: '100%', height: '100%', position: 'relative' }}
      /*
       * § 35.5.3：從背包拖到地圖上＝丟棄（需確認）。
       * 地圖只是宣告自己是落點，實際的丟棄由拖曳來源（背包）在放開時發動 ——
       * 指標拖放期間事件被來源 capture 住，這裡收不到任何 pointer 事件（`47-mobile.md`）。
       */
      data-drop-kind="map"
    >
      {/* Pixi canvas 以 appendChild 掛入，需與 React 管理的節點分離 */}
      <div ref={containerRef} className="map-canvas-stage" />
      {hoverText && (
        <div ref={hoverLabelRef} className="entity-hover-label">{hoverText}</div>
      )}
      {initError && (
        <div className="map-init-error">
          <div className="map-init-error-title">地圖初始化失敗</div>
          <div className="map-init-error-detail">{initError}</div>
          <button className="btn-primary" onClick={() => window.location.reload()}>重新整理</button>
        </div>
      )}
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

/**
 * 傷害數字的顏色分類（§ 42.3）。判定順序固定：閃避 → 暴擊 → 元素 → 技能 → 普攻。
 */
function resolveDamageType(dmg: DamageResult, skill: Skill | undefined): DamageType {
  if (dmg.isMiss) return 'miss';
  if (dmg.isCrit) return 'crit';
  if (skill?.element && skill.element !== 'none') return 'element';
  if (skill) return 'skill';
  return 'normal';
}

/**
 * 這一下的數字用什麼顏色。
 *
 * 爆擊是**逐下判定**的，所以顏色也要逐下看 ——
 * 用整筆的 `isCrit` 會讓沒爆的那一下也染成爆擊色。
 * 元素／技能色不分下數，沿用整筆的。
 */
function resolveHitDamageType(hit: { isCrit: boolean }, whole: DamageType): DamageType {
  if (hit.isCrit) return 'crit';
  return whole === 'crit' ? 'normal' : whole;
}

/**
 * 玩家這一次攻擊的演出（`48-vfx.md` § 48.7）。
 *
 * 判定早就結算完了 —— 這裡只把結果演出來，**傷害數字掛在演出到點的那一刻**
 * （`onLand`），不是判定完就跳。
 *
 * **一次攻擊只呼叫一次 `playSkillFx`**：AoE 是「一發炸一片」，
 * 每個目標各叫一次會變成同一招放了好幾遍（§ 48.7.4）。
 */
/** 這一招演在自己身上（治癒、buff）—— 沒有目標，錨在腳下 */
function isSelfCast(plan: SkillFxPlan): boolean {
  return plan.landing === 'heal' || plan.landing === 'aura';
}

/**
 * 演在自己身上的那一類（§ 48.8.1）。
 *
 * 錨點是**腳下**，不是身體高度。
 *
 * 兩條施放路徑共用同一份：戰鬥腳本走 ARPG 事件管線，
 * 常駐腳本直接寫在 `gameStore` 裡（見 `systems/selfCastFx.ts`）。
 */
function playSelfCastFxAt(
  effectLayer: EffectLayer,
  plan: SkillFxPlan,
  foot: { sx: number; sy: number },
  healed: number,
): void {
  playSkillFx(effectLayer.skillFx, {
    plan,
    fromX: foot.sx, fromY: foot.sy,
    toX: foot.sx, toY: foot.sy,
    targets: [{
      x: foot.sx, y: foot.sy,
      onLand: healed > 0
        ? () => effectLayer.spawnDamageNumber(foot.sx, foot.sy - HIT_LIFT, healed, 'heal')
        : undefined,
    }],
  });
}

/**
 * 常駐腳本放的自身技能（§ 48.8.1）。
 *
 * 那條路跑在 `gameStore` 的 `setInterval` 裡，碰不到 Pixi，
 * 所以它只 push 事件，由這裡每幀取走演出。
 */
function drainSelfCastFxInto(
  effectLayer: EffectLayer,
  map: MapData,
  playerPos: Position,
): void {
  const events = drainSelfCastFx();
  if (events.length === 0) return;

  const gs = useGameStore.getState();
  const held = getEquippedWeapon(Object.values(gs.equippedGear).filter(Boolean) as EquipmentInstance[]);
  const ctx = resolveAttackFxContext(held?.affixes, gs.activeEffects);
  const foot = mapPositionToScreen(map, playerPos);

  for (const ev of events) {
    const skill = getSkillTemplate(ev.skillId);
    if (!skill) continue;
    const plan = resolveSkillFxPlan(skill, ctx);
    /* 只有自身類走這條 —— 攻擊技能不會由常駐腳本施放 */
    if (!isSelfCast(plan)) continue;
    playSelfCastFxAt(effectLayer, plan, foot, ev.healed);
  }
}

function playPlayerAttackFx(o: {
  effectLayer: EffectLayer;
  player: PlayerEntity | null;
  map: MapData;
  playerPos: Position;
  /** 這一擊要不要飛過去（遠程物理或遠程魔法） */
  ranged: boolean;
  result: PlayerAttackResult;
  /** 每個目標在判定當下的位置（`systems/combatLoop.ts` 的 `CombatVisual`） */
  targetPositions: Record<string, Position>;
  /** 手持武器的詞綴 —— 元素刻印決定普攻顏色（§ 42.4） */
  weaponAffixes: Affix[] | undefined;
  weaponType: string | undefined;
  /** 怪物實體 —— 命中時要讓它往後彈（§ 48.7.6） */
  monsterEntities: Map<string, MonsterEntity>;
  /** 手持武器的材質 —— 只影響武器剪影的顏色（§ 48.6） */
  weaponMaterial: WeaponMaterial | null;
  activeEffects: ActiveEffect[];
  /** 攻速決定武器演出播多快，進而決定「打到」是第幾毫秒 */
  attackIntervalMs: number;
}): void {
  const { effectLayer, map, playerPos, result } = o;
  const fx = effectLayer.skillFx;
  const skill = result.skillUsed;
  const plan = resolvePlayerAttackFxPlan({
    skill,
    ranged: o.ranged,
    bow: o.weaponType === 'bow',
    ctx: resolveAttackFxContext(o.weaponAffixes, o.activeEffects),
  });

  const from = mapPositionToScreen(map, playerPos);

  if (isSelfCast(plan)) {
    playSelfCastFxAt(effectLayer, plan, from, result.healAmount ?? 0);
    return;
  }

  /*
   * 命中點各一個。座標來自演出事件（判定當下抄下來的），**不可回頭查 store** ——
   * 致命的那一擊在同一個 tick 就把怪拿掉了，查 store 會讓最後一下整段不演。
   */
  const targets: SkillFxTarget[] = [];
  let firstTarget: Position | null = null;
  for (const dmg of result.damages) {
    const targetPos = o.targetPositions[dmg.targetId];
    if (!targetPos) continue;
    const { sx, sy } = mapPositionToScreen(map, targetPos);
    const y = sy - HIT_LIFT;
    firstTarget ??= targetPos;
    const damageType = resolveDamageType(dmg, skill);
    /*
     * 先把這隻怪保留住。**判定與演出是兩條時間線** ——
     * 牠在判定的那一刻就從 store 消失了，但這一發還在空中；
     * 不保留的話屍體會在投射物落地前就淡光並銷毀，
     * 到了 `onLand` 連實體都找不到，白閃與抖動一次都不會發生。
     */
    const entity = o.monsterEntities.get(dmg.targetId);
    /*
     * **一下一個回呼**（`21-combat-formula.md` § 21.4：雙持雙擊與多段技能
     * 每下獨立判定）。合成一個的話「第二下 MISS」在畫面上讀不出來。
     *
     * 數字**每一下都完整演完**，靠左右攤開避免疊在一起（`DamageNumberStack`）——
     * 後面蓋掉前面的話，等於少跳了幾下。
     */
    for (const hit of dmg.hits) entity?.reserveHit(hit.isMiss ? 0 : hit.damage);
    targets.push({
      x: sx, y,
      crit: dmg.isCrit,
      onLandHit: dmg.hits.map((hit, i) => () => {
        effectLayer.spawnDamageNumber(
          sx, y, hit.damage,
          hit.isMiss ? 'miss' : resolveHitDamageType(hit, damageType),
          { index: i, count: dmg.hits.length },
        );
        entity?.releaseHit(hit.isMiss ? 0 : hit.damage);
        /* 閃避沒有打到，不該彈 —— 彈了就看不出這一下是 MISS */
        if (hit.isMiss) return;
        /*
         * 方向要用**螢幕座標**算，不能用世界格 ——
         * 位移是疊在 `container.x/y` 上的，而等距投影會把世界方向轉過去；
         * 用世界格的話，正東邊的怪會被往正右方推，不是往右下。
         */
        entity?.hit(sx - from.sx, sy - from.sy);
      }),
    });
  }
  if (!firstTarget) return;

  /*
   * 吸血與魔力奪取回的血演在自己身上（§ 48.7 的 `heal` 原型）——
   * 它與命中是兩件事，跟著攻擊的演出一起播，但不佔攻擊的落點。
   */
  const healed = result.healAmount ?? 0;
  if (healed > 0) {
    fx.spawn({ prototype: 'heal', x: from.sx, y: from.sy, color: plan.color });
    effectLayer.spawnDamageNumber(from.sx, from.sy - HIT_LIFT, healed, 'heal');
  }

  /*
   * 投射物要從**武器上**射出，不是從角色身上（§ 48.6）——
   * 弓畫在離身體一段距離的地方，從身上射會看到箭從弓的旁邊冒出來。
   * 起手環仍然畫在腳下，所以 muzzle 與 from 是兩組座標。
   */
  const aim = weaponAimFromDelta(firstTarget.x - playerPos.x, firstTarget.y - playerPos.y);
  /* 弓技一律用弓（`requiredWeaponType` 擋過了），近戰用手上那把 */
  const shownWeapon = plan.weapon === 'shoot' ? 'bow' : o.weaponType;
  const muzzle = resolveMuzzleOffset({ weaponAction: plan.weapon, aim, shownWeapon });

  const main = mapPositionToScreen(map, firstTarget);
  const target = firstTarget;

  playSkillFx(fx, {
    plan,
    fromX: from.sx, fromY: from.sy,
    muzzleX: from.sx + muzzle.x,
    muzzleY: from.sy + muzzle.y,
    /* AoE 的落點是圓心，也就是主目標；單體時兩者相同 */
    toX: main.sx, toY: main.sy - HIT_LIFT,
    targets,
    speed: PLAYER_PROJECTILE_SPEED,
    onWeaponAction: () => {
      if (!o.player || !isPawnWeaponType(shownWeapon)) return;
      o.player.playAttack(playerPos, target, {
        type: shownWeapon,
        /* 弓技借用弓的剪影，材質是手上那把的 —— 對不上就不上色 */
        material: o.weaponType === shownWeapon ? o.weaponMaterial : null,
        attackIntervalMs: o.attackIntervalMs,
      });
    },
    weaponStrikeMs: isPawnWeaponType(shownWeapon)
      ? weaponPlaybackMs(WEAPON_ART[shownWeapon].motion, o.attackIntervalMs)
        * WEAPON_ART[shownWeapon].motion.tStrike
      : undefined,
    /* 命中點抬在身體高度，火柱要落回腳下 */
    groundLift: HIT_LIFT,
  });
}

/**
 * 把模擬回傳的演出需求畫出來（`systems/combatLoop.ts`）。
 * 模擬層不碰 Pixi；這裡是唯一把 `CombatVisual` 轉成特效、數字、受擊反應的地方。
 */
/** 演出的主角：自己或某位隊友。`memberId` 0 或等於自己的角色 id 都是自己 */
function resolveVisualActor(
  memberId: number,
  player: PlayerEntity | null,
  teammates: Map<number, PlayerEntity>,
): { entity: PlayerEntity | null; pos: Position } | null {
  const selfId = useGameStore.getState().character?.id ?? 0;
  if (memberId === 0 || memberId === selfId) {
    return { entity: player, pos: useMapControlStore.getState().playerPosition };
  }
  const view = usePartyStore.getState().teammates.find(t => t.characterId === memberId);
  if (!view) return null;
  return { entity: teammates.get(memberId) ?? null, pos: view.position };
}

function renderCombatVisuals(
  visuals: CombatVisual[],
  effectLayer: EffectLayer,
  player: PlayerEntity | null,
  monsterEntities: Map<string, MonsterEntity>,
  teammates: Map<number, PlayerEntity>,
): void {
  if (visuals.length === 0) return;
  const map = useMapControlStore.getState().currentMap;
  if (!map) return;
  const gs = useGameStore.getState();

  for (const v of visuals) {
    const actor = resolveVisualActor(v.memberId, player, teammates);
    if (!actor) continue;
    const actorScreen = mapPositionToScreen(map, actor.pos);
    switch (v.kind) {
      case 'face': {
        actor.entity?.faceToward(actor.pos, v.target);
        break;
      }
      case 'player_attack': {
        playPlayerAttackFx({
          effectLayer,
          player: actor.entity,
          map,
          playerPos: v.playerPos,
          ranged: v.ranged,
          result: v.result,
          targetPositions: v.targetPositions,
          weaponAffixes: v.weapon?.affixes,
          weaponType: v.weapon?.type,
          monsterEntities,
          weaponMaterial: v.weapon?.material ?? null,
          activeEffects: gs.activeEffects,
          attackIntervalMs: v.attackIntervalMs,
        });
        break;
      }
      case 'monster_attack': {
        /* 被打的成員位置同樣走事件：他可能在這一擊之後就被傳回城鎮 */
        const victim = mapPositionToScreen(map, v.victimPos);
        const { sx, sy } = victim;
        const dmgType: DamageType = v.isDodged ? 'miss' : v.crit ? 'crit' : 'normal';
        const from = v.ranged && v.attackerPos
          ? mapPositionToScreen(map, v.attackerPos)
          : { sx, sy };
        // 外型與顏色見 § 42.4：物理＝白箭矢、魔法＝依該怪元素上色的彈丸
        const { shape, color } = getMonsterProjectileStyle(v.attackType, v.element);
        playSkillFx(effectLayer.skillFx, {
          plan: resolveMonsterAttackFxPlan({ ranged: v.ranged, shape, color }),
          fromX: from.sx, fromY: from.sy,
          muzzleX: from.sx, muzzleY: from.sy - HIT_LIFT,
          toX: sx, toY: sy - HIT_LIFT,
          targets: [{
            x: sx, y: sy - HIT_LIFT,
            onLand: () => {
              effectLayer.spawnDamageNumber(sx, sy - HIT_LIFT, v.damage, dmgType);
              /*
               * 被上了 debuff 就在腳下擴一圈紅環（§ 48.8.1）——
               * 染色是「持續掛著」，這一圈是「剛剛被上了」，兩件事。
               */
              if (v.hasDebuff) {
                effectLayer.skillFx.spawn({
                  prototype: 'aura', x: sx, y: sy, color: resolveAuraColor('debuff'),
                });
              }
              /* 閃掉了就不彈 */
              if (v.isDodged || !v.attackerPos) return;
              /* 方向一律用螢幕座標算（等距投影會把世界方向轉過去） */
              const src = mapPositionToScreen(map, v.attackerPos);
              actor.entity?.hit(sx - src.sx, sy - src.sy);
            },
          }],
          speed: v.projectileSpeed ?? DEFAULT_MONSTER_PROJECTILE_SPEED,
          groundLift: HIT_LIFT,
        });
        break;
      }
      case 'dot': {
        /* DoT 也可能打死怪：位置一樣走事件帶來的那一份 */
        const foot = mapPositionToScreen(map, v.position);
        /* 粒子色走 debuff 的染色，數字一律粉紅（§ 48.8.4） */
        spawnDotTickFx(effectLayer, foot.sx, foot.sy, v.tags);
        effectLayer.spawnDamageNumber(foot.sx, foot.sy - HIT_LIFT, v.damage, 'dot');
        break;
      }
      case 'heal': {
        effectLayer.spawnDamageNumber(actorScreen.sx, actorScreen.sy - 20, v.amount, 'heal');
        break;
      }
      case 'self_cast': {
        const skill = getSkillTemplate(v.skillId);
        if (!skill) break;
        const held = getEquippedWeapon(Object.values(gs.equippedGear).filter(Boolean) as EquipmentInstance[]);
        const plan = resolveSkillFxPlan(skill, resolveAttackFxContext(held?.affixes, gs.activeEffects));
        if (!isSelfCast(plan)) break;
        playSelfCastFxAt(effectLayer, plan, actorScreen, v.healed);
        break;
      }
    }
  }
}


/**
 * 場上狀態特效（§ 48.8.2 染色、§ 48.8.3 暈眩標記）。
 *
 * 每幀對一次帳，而不是在「施加的那一刻」放完就算 ——
 * 這兩件事跟著 debuff 存續，靠事件維護遲早會漏，
 * 漏掉就是一顆星星或一層綠色永遠留在畫面上。
 */
function syncStatusFx(
  map: MapData,
  effectLayer: EffectLayer,
  marks: StatusMarkTracker,
  player: PlayerEntity | null,
  playerPos: Position,
  monsters: MapMonster[],
  monsterEntities: Map<string, MonsterEntity>,
): void {
  const now = gameNow();
  const effects = useGameStore.getState().activeEffects
    .filter(e => e.type === 'debuff' && now < e.startTime + e.duration);

  /** 某個目標身上所有 debuff 的 tag 攤平 —— 染色與標記都只看 tag */
  const tagsOf = (match: (e: ActiveEffect) => boolean): string[] =>
    effects.filter(match).flatMap(e => e.tags ?? []);

  const targets: StatusFxTarget[] = [];

  const playerTags = tagsOf(e => e.target === 'player');
  player?.setTint(resolveStatusTint(playerTags));
  if (player) {
    const { sx, sy } = mapPositionToScreen(map, playerPos);
    targets.push({ key: 'player', x: sx, y: sy, tags: playerTags });
  }

  for (const monster of monsters) {
    const entity = monsterEntities.get(monster.id);
    if (!entity) continue;
    const tags = tagsOf(e => e.target === 'monster' && e.targetMonsterId === monster.id);
    entity.setTint(resolveStatusTint(tags));
    const { sx, sy } = mapPositionToScreen(map, monster.position);
    targets.push({ key: monster.id, x: sx, y: sy, tags });
  }

  marks.sync(effectLayer.skillFx, targets);
}

/**
 * DoT 每跳的粒子（§ 48.8.4）。
 *
 * **粒子色走 debuff 的染色，數字不歸這裡** —— DoT 的數字一律粉紅（§ 42.3）。
 * 查不到顏色（沒有對應的染色）就不放粒子，只跳數字。
 */
function spawnDotTickFx(
  effectLayer: EffectLayer,
  footX: number,
  footY: number,
  tags: readonly string[],
): void {
  const color = resolveStatusTint(tags);
  if (color === null) return;
  effectLayer.skillFx.spawn({
    prototype: 'dotTick', x: footX, y: footY - HIT_LIFT, color,
  });
}


// === Sprite Sync ===

function syncMonsters(
  monsters: MapMonster[],
  map: import('../models/mapControl').MapData,
  scene: GameScene,
  existingMap: Map<string, MonsterEntity>,
  monsterInstances: Map<string, MonsterInstance>,
  /** 受擊反應要每幀推進；位置在同一支裡重設，順序不能反過來 */
  deltaMs: number,
  /** 玩家目前的目標，畫地面環用（§ 3.6.1）。null＝沒有目標 */
  targetId: string | null,
  /** 兩個模擬 tick 之間的插值比例；單機為 1 */
  alpha = 1,
) {
  const currentIds = new Set(monsters.map(m => m.id));

  for (const [id, entity] of existingMap) {
    if (currentIds.has(id)) continue;
    /*
     * 死掉的怪**先淡出再拿掉**（§ 48.7.6）。
     * 用 `retire()` 而不是 `die()`：致命的那一發可能還在空中，要等落地才開始淡。
     */
    entity.retire(deltaMs);
    entity.update(deltaMs);
    if (!entity.faded) continue;
    scene.entityLayer.container.removeChild(entity.container);
    entity.destroy();
    existingMap.delete(id);
  }

  for (const monster of monsters) {
    let entity = existingMap.get(monster.id);
    if (!entity) {
      entity = new MonsterEntity(monster.id, monster.isBoss);
      existingMap.set(monster.id, entity);
      scene.entityLayer.container.addChild(entity.container);
    }
    entity.update(deltaMs);
    const shown = lerpPosition(monster.prevPosition, monster.position, alpha) as Position;
    entity.updatePosition(shown, getRenderedElevation(map, shown));
    entity.setTargeted(monster.id === targetId);

    const inst = monsterInstances.get(monster.id);
    if (inst) {
      entity.updateHp(inst.currentHp, inst.maxHp);
    }
  }
}

/**
 * 同實例在場隊友的剪影（§ 97.7.1 只渲染自己與隊友）。位置在兩個 tick 之間插值。
 */
function syncTeammates(
  teammates: TeammateView[],
  map: MapData,
  scene: GameScene,
  existing: Map<number, PlayerEntity>,
  deltaMs: number,
  alpha: number,
): void {
  const seen = new Set<number>();
  for (const t of teammates) {
    seen.add(t.characterId);
    let entity = existing.get(t.characterId);
    if (!entity) {
      entity = new PlayerEntity(t.appearance, TEAMMATE_MARKER);
      existing.set(t.characterId, entity);
      scene.entityLayer.container.addChild(entity.container);
    }
    entity.update(deltaMs);
    const shown = lerpPosition(t.prevPosition, t.position, alpha) as Position;
    entity.updatePosition(shown, getRenderedElevation(map, shown));
  }
  for (const [id, entity] of existing) {
    if (seen.has(id)) continue;
    scene.entityLayer.container.removeChild(entity.container);
    entity.destroy();
    existing.delete(id);
  }
}

/**
 * 城鎮 NPC 圖層（§ 13.2.1）。地圖切換時整批重建 —— NPC 是靜態資料，不需要逐格 diff。
 * 點 NPC 只負責「記下目標 + 走過去」，開面板由主迴圈在走到相鄰格時處理。
 */
function syncNpcs(map: MapData, scene: GameScene, entities: NpcEntity[]): void {
  for (const entity of entities) {
    scene.entityLayer.container.removeChild(entity.container);
    entity.destroy();
  }
  entities.length = 0;

  for (const npc of map.npcs ?? []) {
    // 點擊由 DOM 的 handleClick 依格子判斷，NPC 實體只負責顯示
    const entity = new NpcEntity(npc);
    scene.entityLayer.container.addChild(entity.container);
    entities.push(entity);
  }
}

/**
 * 點擊是否打中某個 NPC（§ 13.2.1）。
 *
 * NPC 的圓點畫在格子中心的正上方（偏移 `NPC_BODY_OFFSET`），所以先把點擊座標
 * 往下補回同樣的偏移，再換算成格子 —— 這樣「看起來點在圓點上」就會對到他站的格子。
 *
 * 不能借用 `screenToMapTile`：那支對不可通行格回傳 null，而 NPC 站的格子正是不可通行的。
 */
function findNpcAtScreen(map: MapData, screenX: number, screenY: number): MapNpc | null {
  if (!map.npcs?.length) return null;
  const world = screenToWorld(screenX, screenY + NPC_BODY_OFFSET, 0);
  const tile = { x: Math.round(world.x), y: Math.round(world.y) };
  return map.npcs.find(npc => npc.x === tile.x && npc.y === tile.y) ?? null;
}

/** 實體球體的命中半徑（螢幕像素）；比實際圓點略大，滑過去就抓得到 */
const ENTITY_HOVER_RADIUS = 24;

/** 實體球體在 world screen 上的位置（沿用渲染時的小數座標） */
function entityScreenPos(map: MapData, pos: Position): { sx: number; sy: number } {
  const elevation = getRenderedElevation(map, { x: Math.round(pos.x), y: Math.round(pos.y) });
  return worldToScreen(pos.x, pos.y, elevation);
}

export interface EntityHover {
  text: string;
  /** 指到的是誰 —— 標籤要每幀跟著他的目前位置，不是停在懸停當下的座標 */
  target: { kind: 'npc' | 'monster' | 'player' | 'teammate'; id?: string; memberId?: number; pos?: Position };
}

/**
 * 找出滑鼠指到的實體（§ 13.2.1）。
 *
 * 玩家／怪物／NPC 都是畫在格子中心正上方的圓點（偏移 `NPC_BODY_OFFSET`，三者相同），
 * 所以用同一套螢幕距離判定：NPC → 怪物 → 玩家，先找到的先贏。
 * 回傳實體本身的位置，讓名稱固定釘在他頭上 —— 跟著游標跑會很難讀。
 */
function findEntityAtScreen(
  map: MapData,
  screenX: number,
  screenY: number,
  playerPos: Position,
  playerName: string,
  monsters: MapMonster[],
  monsterInstances: Map<string, MonsterInstance>,
  teammates: TeammateView[] = [],
): EntityHover | null {
  const hits = (pos: Position): boolean => {
    // 用「原始小數座標」而不是取整到格子：玩家與怪物移動中畫在格子之間，
    // 取整會讓錨點跟畫面上的球體差到半格（32px），怎麼滑都碰不到。
    const { sx, sy } = entityScreenPos(map, pos);
    const dx = screenX - sx;
    const dy = screenY - (sy - NPC_BODY_OFFSET);
    return dx * dx + dy * dy <= ENTITY_HOVER_RADIUS * ENTITY_HOVER_RADIUS;
  };

  for (const npc of map.npcs ?? []) {
    if (hits(npc)) return { text: npc.name, target: { kind: 'npc', pos: { x: npc.x, y: npc.y } } };
  }
  for (const monster of monsters) {
    // 還沒建出實例的怪不給 hover —— 名字要等模板載入才知道
    const inst = monsterInstances.get(monster.id);
    if (inst && hits(monster.position)) {
      return { text: inst.name, target: { kind: 'monster', id: monster.id } };
    }
  }
  for (const t of teammates) {
    if (hits(t.position)) return { text: t.name, target: { kind: 'teammate', memberId: t.characterId } };
  }
  return playerName && hits(playerPos) ? { text: playerName, target: { kind: 'player' } } : null;
}

import { useRef, useState, useEffect } from 'react';
import { useMapControlStore } from '../stores/mapControlStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { useMonsterHudStore, type MonsterHudEntry } from '../stores/monsterHudStore';
import { MonsterListOverlay } from './MonsterListOverlay';
import { useGameStore, getEffectiveMaxHp, selectCombatRules, type CombatLog } from '../stores/gameStore';
import { getNearestTown } from '../models/mapData';
import { PixiApp } from '../pixi/PixiApp';
import { GameScene } from '../pixi/GameScene';
import { PlayerEntity } from '../pixi/entities/PlayerEntity';
import { MonsterEntity } from '../pixi/entities/MonsterEntity';
import { NpcEntity, NPC_BODY_OFFSET } from '../pixi/entities/NpcEntity';
import { useTownStore } from '../stores/townStore';
import type { TownFacility } from './TownView';
import { mapPositionToScreen, screenToMapTile, screenToWorld, worldToScreen } from '../pixi/utils/isometric';
import { getRenderedElevation, type MapData, type MapNpc, type Position } from '../models/mapControl';
import { hasProjectilePath } from '../systems/lineOfSight';
import { gameLoopTick, consumeDotTick } from '../systems/gameLoop';
import { findAttackPosition } from '../systems/pathfinding';
import { db } from '../db/database';
import { processMonsterDeath, waitForPendingDrops } from '../stores/gameStore';
import type { MonsterTemplate } from '../models/monster';
import { createArpgEngine, tickArpgEngine, type ArpgEngineState } from '../systems/arpgEngine';
import { processPlayerAttack, processMonsterAttack } from '../systems/arpgEventHandler';
import { getEquippedWeapon, getPlayerAttackInterval } from '../systems/combat';
import {
  isPawnWeaponType, weaponAimFromDelta, weaponPlaybackMs, WEAPON_ART,
} from '../pixi/entities/pawn/weaponGeometry';
import { isRangedAttackType } from '../models/monster';
import { isPlayerInvincible, absorbWithShield } from '../systems/combat';
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
  const hoverTargetRef = useRef<{ kind: 'npc' | 'monster' | 'player'; id?: string; pos?: Position } | null>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PixiApp | null>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const playerEntityRef = useRef<PlayerEntity | null>(null);
  const monsterMapRef = useRef<Map<string, MonsterEntity>>(new Map());
  const npcEntitiesRef = useRef<NpcEntity[]>([]);
  const arpgEngineRef = useRef<ArpgEngineState>(createArpgEngine());
  const monsterInstancesRef = useRef<Map<string, MonsterInstance>>(new Map());
  const areaTemplatesRef = useRef<MonsterTemplate[]>([]);
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
        // NPC 必須在這裡補畫，否則城鎮上一個 NPC 都看不到。
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
          tickArpgCombatLoop(arpgEngineRef.current, monsterInstancesRef.current, areaTemplatesRef.current, delta, scene!.effectLayer, playerEntityRef.current, monsterMapRef.current);
        } catch (e) {
          console.error('[GameLoop] Error:', e);
        }

        // 3. Render sync
        const playerPos = useMapControlStore.getState().playerPosition;
        if (playerEntityRef.current) {
          /* 武器演出要在位置同步之前推進：出手那一幀才會用到剛設好的朝向 */
          playerEntityRef.current.update(delta);
          playerEntityRef.current.updatePosition(playerPos, getRenderedElevation(map, playerPos));
        }

        const { sx, sy } = mapPositionToScreen(map, playerPos);
        pixiApp.camera.setTarget(sx, sy);
        pixiApp.camera.update();

        syncMonsters(useMapMonsterStore.getState().monsters, map, scene!, monsterMapRef.current, monsterInstancesRef.current, delta);

        /* 常駐腳本放的 buff／治癒在 store 那一層，只能靠佇列傳過來 */
        drainSelfCastFxInto(scene!.effectLayer, map, playerPos);

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
            monsterInstancesRef.current,
            arpgEngineRef.current.playerCtx.targetMonsterId,
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

      // 場景尚未建好（init 仍在進行）時不可記錄 prevMapRef，
      // 否則這張地圖會被永久跳過 —— 之後同一個 map 物件不會再觸發通知。
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
      syncNpcs(currentMap, sceneRef.current, npcEntitiesRef.current);
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

      /*
       * 城鎮 NPC 判定（§ 13.2.1）。三個順序上的地雷：
       * 1. 必須在 screenToMapTile 之前 —— NPC 站的格子不可通行（他有實體），
       *    而 screenToMapTile 對不可通行格回傳 null，先取格子會把「點正中 NPC」早退掉。
       * 2. 必須跟地圖移動走同一個 DOM handler —— 用 Pixi 的 pointertap 會與這裡各自
       *    派路徑，後跑的覆蓋先跑的。
       * 3. 用圖示的螢幕範圍判定，不用格子距離 —— 否則點旁邊空地想走過去也被當成互動。
       */
      const npc = findNpcAtScreen(map, worldScreenX, worldScreenY);
      if (npc) {
        // 點得到就開，不看距離（§ 13.2.1）
        useTownStore.getState().openFacility(npc.facility as TownFacility);
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
        monsterInstancesRef.current,
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
 * 錨點是**腳下**，不是身體高度 —— 地面環抬起來會變成半空中的一個圈。
 *
 * 抽出來共用，是因為同一批 buff 有兩條施放路徑：戰鬥腳本走 ARPG 事件管線，
 * 常駐腳本直接寫在 `gameStore` 裡（見 `systems/selfCastFx.ts`）。
 * 兩邊各接一份必然分岔。
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
  monsters: MapMonster[];
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

  /* 命中點各一個。找不到怪的（同一幀已經被清掉）就不演 */
  const targets: SkillFxTarget[] = [];
  let firstTarget: Position | null = null;
  for (const dmg of result.damages) {
    const monster = o.monsters.find(m => m.id === dmg.targetId);
    if (!monster) continue;
    const { sx, sy } = mapPositionToScreen(map, monster.position);
    const y = sy - HIT_LIFT;
    firstTarget ??= monster.position;
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
    for (let i = 0; i < dmg.hits.length; i++) entity?.reserveHit();
    targets.push({
      x: sx, y,
      crit: dmg.isCrit,
      onLandHit: dmg.hits.map((hit, i) => () => {
        effectLayer.spawnDamageNumber(
          sx, y, hit.damage,
          hit.isMiss ? 'miss' : resolveHitDamageType(hit, damageType),
          { index: i, count: dmg.hits.length },
        );
        entity?.releaseHit();
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

function tickArpgCombatLoop(
  engine: ArpgEngineState,
  monsterInstances: Map<string, MonsterInstance>,
  areaTemplates: MonsterTemplate[],
  deltaMs: number,
  effectLayer?: EffectLayer,
  /** 出手時要轉向目標，所以戰鬥迴圈需要拿得到玩家實體 */
  player?: PlayerEntity | null,
  /** 命中時要讓被打的那隻往後彈（§ 48.7.6） */
  monsterEntities?: Map<string, MonsterEntity>,
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
    combatRules: selectCombatRules(gameState),
    mapMonsters: monsterStore.monsters,
    monsterInstances,
    map: mapStore.currentMap,
    bagItems: gameState.bagItems,
    deltaMs,
  });

  // If player FSM is idle and autoMove (not paused), find next target
  if (engine.playerCtx.state === 'idle' && mapStore.autoMove && !mapStore.isMoving && !monsterStore.paused) {
    useMapControlStore.getState().pickRandomTarget();
  }

  const logs: CombatLog[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'overweight_blocked': {
        // 每次出手判定都顯示一次（§ 20.7），玩家才知道自己為什麼打不出去
        logs.push({ text: event.message, type: 'system' });
        break;
      }
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

        // 轉向被打的那隻 —— 攻擊方向與角色朝向要一致，
        // 否則會出現「面向右、往左射箭」。多目標時以第一個為準。
        const facingTarget = monsterStore.monsters.find(
          m => m.id === attackEvent.targetMonsterIds[0],
        );
        /**
         * 武器一律用 `getEquippedWeapon()` 取（`99-ai-constraints.md` § 99.1 第 5 條）——
         * `equippedGear` 是插入順序不是部位順序，用索引會靜默取到防具。
         */
        const held = getEquippedWeapon(allGear);

        /*
         * 轉向要**在演出之前**、而且不管這一招碰不碰武器都要轉 ——
         * 施法不揮武器（§ 48.6.1），但人還是要面向目標。
         */
        if (facingTarget && player) player.faceToward(playerPos, facingTarget.position);

        const result = processPlayerAttack(attackEvent, {
          character: gameState.character,
          equippedGear: allGear,
          activeEffects: gameState.activeEffects,
          skills: gameState.skills,
          monsterInstances,
          mapMonsters: monsterStore.monsters,
        });
        logs.push(...result.logs);

        if (effectLayer) {
          playPlayerAttackFx({
            effectLayer,
            player: player ?? null,
            map: currentMap,
            playerPos,
            ranged: isRangedAttackType(event.attackType),
            result,
            monsters: monsterStore.monsters,
            weaponAffixes: held?.affixes,
            weaponType: held?.type,
            monsterEntities: monsterEntities ?? new Map(),
            weaponMaterial: held?.material ?? null,
            activeEffects: gameState.activeEffects,
            attackIntervalMs: getPlayerAttackInterval(allGear, gameState.activeEffects),
          });
        }

        for (const dmg of result.damages) {
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
          if (result.restoreLogs) logs.push(...result.restoreLogs);

          if (effectLayer) {
            const pPos = useMapControlStore.getState().playerPosition;
            const { sx, sy } = mapPositionToScreen(currentMap, pPos);
            const dmgType: DamageType = result.isDodged ? 'miss' : 'normal';
            const dmgValue = result.isDodged ? 0 : result.damage;
            const monster = monsterStore.monsters.find(m => m.id === event.monsterId);
            /* 遠程要有視線才演投射物；沒有視線就退回近戰演出（傷害照樣結算） */
            const ranged = isRangedAttackType(event.attackType)
              && !!monster
              && hasProjectilePath(monster.position, playerPos, currentMap);
            const from = ranged && monster
              ? mapPositionToScreen(currentMap, monster.position)
              : { sx, sy };
            // 外型與顏色見 § 42.4：物理＝白箭矢、魔法＝依該怪元素上色的彈丸
            const { shape, color } = getMonsterProjectileStyle(
              event.attackType,
              monsterInstances.get(event.monsterId)?.element,
            );

            playSkillFx(effectLayer.skillFx, {
              plan: resolveMonsterAttackFxPlan({ ranged, shape, color }),
              fromX: from.sx, fromY: from.sy,
              muzzleX: from.sx, muzzleY: from.sy - HIT_LIFT,
              toX: sx, toY: sy - HIT_LIFT,
              targets: [{
                x: sx, y: sy - HIT_LIFT,
                onLand: () => {
                  effectLayer.spawnDamageNumber(sx, sy - HIT_LIFT, dmgValue, dmgType);
                  /*
                   * 被上了 debuff 就在腳下擴一圈紅環（§ 48.8.1）——
                   * 染色是「持續掛著」，這一圈是「剛剛被上了」，兩件事。
                   */
                  if (result.debuffLog) {
                    effectLayer.skillFx.spawn({
                      prototype: 'aura', x: sx, y: sy, color: resolveAuraColor('debuff'),
                    });
                  }
                  /* 閃掉了就不彈 —— 彈了會讀成「被打到但沒扣血」 */
                  if (result.isDodged || !monster) return;
                  /* 方向一律用螢幕座標算（等距投影會把世界方向轉過去） */
                  const src = mapPositionToScreen(currentMap, monster.position);
                  player?.hit(sx - src.sx, sy - src.sy);
                },
              }],
              speed: event.projectileSpeed ?? DEFAULT_MONSTER_PROJECTILE_SPEED,
              groundLift: HIT_LIFT,
            });
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
        /* 粒子色走 debuff 的染色，數字一律粉紅（§ 48.8.4） */
        spawnDotTickFx(effectLayer, sx, sy, effect.tags ?? []);
        effectLayer.spawnDamageNumber(sx, sy - HIT_LIFT, dmg, 'dot');
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
        spawnDotTickFx(effectLayer, sx, sy, effect.tags ?? []);
        effectLayer.spawnDamageNumber(sx, sy - HIT_LIFT, effect.dot.damage, 'dot');
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
  const now = Date.now();
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

  // Auto-save after kill —— 掉落與任務進度是在 processMonsterDeath 的 async 佇列裡才寫入 store，
  // 這裡必須等佇列結算完再存，否則存下去的永遠是「上一次擊殺」的進度，
  // 剛打完就重整會讓這次的掉落／任務進度回滾。
  void waitForPendingDrops().then(() => {
    useGameStore.getState().saveState();
  });
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
  /** 受擊反應要每幀推進；位置在同一支裡重設，順序不能反過來 */
  deltaMs: number,
) {
  const currentIds = new Set(monsters.map(m => m.id));

  for (const [id, entity] of existingMap) {
    if (currentIds.has(id)) continue;
    /*
     * 死掉的怪**先淡出再拿掉**（§ 48.7.6）——
     * 判定那一刻就把它從 store 刪了，畫面上直接消失讀起來像被刪除。
     *
     * `retire()` 而不是 `die()`：打死牠的那一發可能還在空中，
     * 要等落地才開始淡（否則投射物會打在一個已經不存在的位置上）。
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
    entity.updatePosition(monster.position, getRenderedElevation(map, monster.position));

    const inst = monsterInstances.get(monster.id);
    if (inst) {
      entity.updateHp(inst.currentHp, inst.maxHp);
    }
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
  target: { kind: 'npc' | 'monster' | 'player'; id?: string; pos?: Position };
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
    if (hits(monster.position)) {
      const name = monsterInstances.get(monster.id)?.name ?? (monster.isBoss ? 'Boss' : '怪物');
      return { text: name, target: { kind: 'monster', id: monster.id } };
    }
  }
  return playerName && hits(playerPos) ? { text: playerName, target: { kind: 'player' } } : null;
}

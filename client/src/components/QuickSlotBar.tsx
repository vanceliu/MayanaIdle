import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { getPotionCount } from '../stores/gameStore';
import { GameIcon } from './GameIcon';
import { getEquipIcon, getItemIcon, getSkillIcon, getSkillDisplayIcon, resolveItemIcon } from '../models/iconMap';
import type { Skill } from '../models/skill';
import type { EquipmentInstance } from '../models/equipment';
import { getEquippedWeapon, getSkillCooldownReduction } from '../systems/combat';
import { skillMeetsWeaponRequirement } from '../systems/scriptRunner';
import { getItemById } from '../models/items';
import { getBagItemAmount } from '../models/bagItem';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierColor } from '../models/equipmentTier';
import { useDragStore } from '../stores/dragStore';
import { useLongPress } from '../hooks/useLongPress';
import {
  QUICK_SLOT_COUNT,
  keyToQuickSlotIndex,
  quickSlotLabel,
  getQuickSlotItemName,
  resolveQuickSlotAction,
  type BasicPotionType,
  type QuickSlotEntry,
} from '../models/quickSlot';

const POTION_COLORS: Record<BasicPotionType, string> = {
  red: '#DC2626',
  orange: '#F59E0B',
  white: '#E2E8F0',
};

/** 與 `SkillPanel` 同一份元素配色（§ 35.7.6） */
const SKILL_ELEMENT_COLORS: Record<string, string> = {
  fire: '#EF4444',
  ice: '#60A5FA',
  wind: '#34D399',
  earth: '#D97706',
  light: '#FBBF24',
  dark: '#A78BFA',
  none: '#94A3B8',
};

export function QuickSlotBar() {
  const quickSlots = useGameStore(s => s.quickSlots);
  const bagItems = useGameStore(s => s.bagItems);
  const inventory = useGameStore(s => s.inventory);
  const equippedGear = useGameStore(s => s.equippedGear);
  const useQuickSlot = useGameStore(s => s.useQuickSlot);
  const assignQuickSlot = useGameStore(s => s.assignQuickSlot);
  const templates = useEquipmentTemplates();
  const skills = useGameStore(s => s.skills);
  const character = useGameStore(s => s.character);
  const activeEffects = useGameStore(s => s.activeEffects);

  const allGear = Object.values(equippedGear).filter(Boolean) as EquipmentInstance[];
  const weapon = getEquippedWeapon(allGear);
  const weaponType = weapon?.type !== 'armor' ? weapon?.type : undefined;
  const cooldownReduction = character ? getSkillCooldownReduction(character, allGear, activeEffects) : 0;
  /*
   * 快捷格只是**放置目標**：它以 `data-drop-*` 宣告自己，實際的綁定由拖曳來源
   * （背包）在放開時執行（`47-mobile.md`）。這裡只讀 hover 狀態畫外框。
   */
  const dragOver = useDragStore(s => s.over);
  const isDragging = useDragStore(s => s.item != null);
  const dragOverIndex = dragOver?.kind === 'quick-slot' ? dragOver.index : null;
  /**
   * § 35.7.5：滑鼠操作採兩段確認 —— 第一次點擊只選取（顯示外框），再點同一格才執行。
   * 鍵盤快捷鍵**不受此限**，按下即執行。
   */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setSelectedIndex(null);
        return;
      }
      const idx = keyToQuickSlotIndex(e.key);
      if (idx == null) return;
      e.preventDefault();
      // 鍵盤一按即發，並清掉滑鼠的選取狀態
      setSelectedIndex(null);
      useQuickSlot(idx);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [useQuickSlot]);

  /**
   * 這件裝備現在在哪 —— 背包裡或穿在身上都算「還在」（§ 35.7.2）。
   * 裝備中一樣留在背包格上，點快捷格是脫下來，不能當成失效的格子。
   */
  function findEquipment(equipmentId: number) {
    return inventory.find(i => i.id === equipmentId)
      ?? Object.values(equippedGear).find(i => i?.id === equipmentId)
      ?? undefined;
  }

  /**
   * 這格還剩幾個可用；裝備回 1（在背包或身上）或 0（已賣掉／丟棄／存進倉庫）。
   * 技能回 1（已習得）或 0（未習得＝該格失效）——
   * **CD 中／MP 不足／武器不符一律仍回 1**，那些是暫時狀態，不是失效（§ 35.7.4）。
   */
  function slotCount(entry: QuickSlotEntry): number {
    if (entry.kind === 'potion') return getPotionCount(bagItems, entry.potionType);
    if (entry.kind === 'equipment') {
      return findEquipment(entry.equipmentId) ? 1 : 0;
    }
    if (entry.kind === 'skill') return skills.some(s => s.id === entry.skillId) ? 1 : 0;
    return getBagItemAmount(bagItems, entry.itemId);
  }

  /** 這格的技能（未習得或不是技能格回 null） */
  function skillOf(entry: QuickSlotEntry | null): Skill | null {
    if (!entry || entry.kind !== 'skill') return null;
    return skills.find(s => s.id === entry.skillId) ?? null;
  }

  /**
   * 這個技能此刻能不能按。三種不可用原因分開回報，因為畫面上都是灰的，
   * 玩家得靠 tooltip 才分得出「還在轉 CD」與「這把武器放不出這招」。
   *
   * **冷卻不在這裡讀時間**：`Date.now()` 是不純的，放進 render 會讓同一次繪製
   * 前後不一致。冷卻中的格子由下面那支 rAF 維護成 `cdSlots`，render 只讀結果。
   */
  function skillBlockReason(skill: Skill, idx: number): string | null {
    if (!skillMeetsWeaponRequirement(skill, weaponType)) return '需要對應武器';
    if ((character?.mp ?? 0) < skill.mpCost) return 'MP 不足';
    if (cdSlots.includes(idx)) return '冷卻中';
    return null;
  }

  function renderIcon(entry: QuickSlotEntry) {
    if (entry.kind === 'potion') {
      return <GameIcon name={getItemIcon(`${entry.potionType}-potion`)} size={24} color={POTION_COLORS[entry.potionType]} />;
    }
    if (entry.kind === 'equipment') {
      const item = findEquipment(entry.equipmentId);
      const iconKey = item
        ? getEquipIcon(item.type === 'armor' ? (item.slot || 'chest') : item.type)
        : getEquipIcon('sword');
      // 與背包一致，依裝備品階著色（`equipmentTier.ts`）
      return (
        <GameIcon
          name={iconKey}
          size={24}
          color={item ? getEquipmentInstanceTierColor(item, templates) : undefined}
        />
      );
    }
    if (entry.kind === 'skill') {
      /*
       * 與技能面板走**同一支** `getSkillDisplayIcon()` 與同一套元素配色 ——
       * 玩家是從技能面板拖過來的，兩邊長不一樣會認不出綁到的是哪一招。
       */
      const skill = skillOf(entry);
      const element = skill?.element ?? 'none';
      const icon = skill
        ? getSkillDisplayIcon(skill)
        : getSkillIcon(element);
      return <GameIcon name={icon} size={24} color={SKILL_ELEMENT_COLORS[element] ?? SKILL_ELEMENT_COLORS.none} />;
    }
    const { icon, color } = resolveItemIcon(getItemById(entry.itemId), 'scroll');
    return <GameIcon name={icon} size={24} color={color} />;
  }

  /**
   * 清除這一格。右鍵與長按共用（`47-mobile.md`）——
   * hook 只能在頂層呼叫，所以「按住的是第幾格」從 ref 讀，格子的 pointerdown 一定先跑。
   */
  const pressedIndexRef = useRef<number | null>(null);
  const longPress = useLongPress(() => {
    const idx = pressedIndexRef.current;
    if (idx == null) return;
    setSelectedIndex(prev => (prev === idx ? null : prev));
    assignQuickSlot(idx, null);
  });

  /**
   * 技能 CD 指針（§ 35.7.6）。扇形覆蓋**剩餘**冷卻，邊界隨時間**逆時針**掃回 12 點鐘。
   *
   * 兩條硬性限制寫在規格裡，改的時候別繞過去：
   * 1. **不可每幀 setState** —— 十格各自每幀重繪，整條 HUD 會被拖垮。
   *    角度直接以 rAF 寫進 DOM 的 CSS 變數，React 完全不參與。
   * 2. **沒有東西在冷卻時要停迴圈** —— 掛機時大部分時間沒有 CD 在跑，
   *    讓 rAF 空轉一整晚只是白燒電。下一次施放會換掉 `skills` 的識別，
   *    effect 重跑，迴圈自然接回來。
   */
  const cdRefs = useRef<(HTMLElement | null)[]>([]);
  /** 正在冷卻的格子索引。由 rAF 維護，render 只讀 —— 讓 render 保持純的 */
  const [cdSlots, setCdSlots] = useState<number[]>([]);
  /**
   * 已經送進 state 的那一份，跨 effect 重跑仍然有效。
   *
   * 不能改用 effect 內的區域變數：effect 每次重跑都會把它重設成空陣列，
   * 「本來在冷卻、現在整格被換掉」就會比對成「沒變」，`.blocked` 永遠解不掉。
   */
  const publishedCdRef = useRef<number[]>([]);
  useEffect(() => {
    const skillSlots: number[] = [];
    quickSlots.forEach((entry, i) => { if (entry?.kind === 'skill') skillSlots.push(i); });

    let raf = 0;
    const step = () => {
      const now = Date.now();
      const live = useGameStore.getState().skills;
      const running: number[] = [];

      for (const i of skillSlots) {
        const el = cdRefs.current[i];
        const entry = quickSlots[i];
        if (!el || !entry || entry.kind !== 'skill') continue;
        const skill = live.find(s => s.id === entry.skillId);
        // § 35.7.6：冷卻長度取實際值（含冷卻縮減），不可用技能表上的原始秒數
        const total = skill
          ? Math.floor(skill.cooldown * (1 - Math.min(cooldownReduction, 50) / 100))
          : 0;
        const remaining = skill && total > 0 ? Math.max(0, skill.lastUsedAt + total - now) : 0;
        if (remaining > 0) running.push(i);
        el.style.setProperty('--cd-angle', `${total > 0 ? (remaining / total) * 360 : 0}deg`);
        // 扇形只在真的有 CD 在跑時出現：MP 不足／武器不符沒有「還要多久」可畫
        el.hidden = remaining <= 0;
      }

      /*
       * 只在「哪幾格在冷卻」真的變了才 setState —— 一輪冷卻通常只會發生兩次
       * （開始、結束），不是每幀。這是 § 35.7.6「不可透過 React state 更新指針」
       * 的另一半：指針走 DOM，可按狀態走 state。
       */
      const prev = publishedCdRef.current;
      const changed = running.length !== prev.length || running.some((v, i) => v !== prev[i]);
      if (changed) {
        publishedCdRef.current = running;
        setCdSlots(running);
      }

      // 沒有東西在冷卻就停下來（§ 35.7.6）：掛機時讓 rAF 空轉一整晚只是白燒電
      if (running.length === 0) return;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // `skills` 進 deps：每次施放都會換掉陣列識別，迴圈因此重新啟動
  }, [quickSlots, cooldownReduction, skills]);

  /** § 35.7.5：第一次點擊選取，再點同一格才執行 */
  function handleClick(idx: number, canUse: boolean) {
    // 長按剛清完這一格，放開時不能再算一次點擊
    if (longPress.didFire()) return;
    if (!canUse) {
      setSelectedIndex(null);
      return;
    }
    if (selectedIndex === idx) {
      setSelectedIndex(null);
      useQuickSlot(idx);
      return;
    }
    setSelectedIndex(idx);
  }

  return (
    <div className="quick-slot-bar">
      {Array.from({ length: QUICK_SLOT_COUNT }).map((_, idx) => {
        const entry = quickSlots[idx] ?? null;
        const count = entry ? slotCount(entry) : 0;
        const isEmpty = !entry;
        const isExhausted = !!entry && count <= 0;
        const skill = skillOf(entry);
        // 技能的「不可用」與物品的「用完了」是兩回事：前者不清空，也不顯示數量
        const blockReason = skill && count > 0 ? skillBlockReason(skill, idx) : null;
        const canUse = !!entry
          && count > 0
          && resolveQuickSlotAction(entry) != null
          && blockReason == null;

        return (
          <button
            key={idx}
            className={`quick-slot ${isEmpty ? 'empty' : ''} ${isExhausted ? 'exhausted' : ''}`
              + (blockReason ? ' blocked' : '')
              + (dragOverIndex === idx ? ' drag-over' : '')
              + (isDragging ? ' droppable' : '')
              + (selectedIndex === idx ? ' selected' : '')}
            /* 落點由 `elementFromPoint` 命中這兩個屬性（`47-mobile.md`）；
               拖曳期間指標被來源格 capture，這裡收不到任何 pointer 事件 */
            data-drop-kind="quick-slot"
            data-drop-index={idx}
            onClick={() => handleClick(idx, canUse)}
            /* 右鍵不一定先經過 pointerdown（測試會直接派 contextmenu，
               部分環境的右鍵也是），索引要在這裡再設一次 */
            onContextMenu={(e) => { pressedIndexRef.current = idx; longPress.onContextMenu(e); }}
            onPointerDown={(e) => { pressedIndexRef.current = idx; longPress.onPointerDown(e); }}
            onPointerMove={longPress.onPointerMove}
            onPointerUp={longPress.onPointerUp}
            onPointerCancel={longPress.onPointerCancel}
            /* 不能用 disabled：被 disable 的按鈕收不到指標事件，空格就永遠放不進去 */
            aria-disabled={!canUse}
            title={entry
              ? `${getQuickSlotItemName(entry)}${blockReason ? `（${blockReason}）` : ''}`
                + `（${selectedIndex === idx ? '再點一次使用' : '點一次選取'}，右鍵或長按清除）`
              : '空（從背包或技能面板拖曳，或用它們的選單指定）'}
          >
            <span className="quick-slot-key">{quickSlotLabel(idx)}</span>
            {entry && (
              <>
                {renderIcon(entry)}
                {/* 裝備與技能沒有「剩幾個」可言（§ 35.7.6） */}
                {entry.kind !== 'equipment' && entry.kind !== 'skill' && (
                  <span className="quick-slot-count">{count}</span>
                )}
                {/*
                  CD 扇形只畫在技能格上；MP 不足與武器不符只變暗不畫扇形，
                  否則玩家會以為在跑 CD（§ 35.7.6）
                */}
                {entry.kind === 'skill' && (
                  <span
                    className="quick-slot-cd"
                    data-testid="quick-slot-cd"
                    /* 預設收著，由 rAF 在第一幀決定要不要顯示，避免閃一下滿版遮罩 */
                    hidden
                    ref={el => { cdRefs.current[idx] = el; }}
                  />
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

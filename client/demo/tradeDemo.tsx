/**
 * 交易視窗的調校頁。正式介面是 `src/components/TradePanel.tsx`，
 * 這頁掛的是**同一個元件**，只把 server 換成本機的假交易對手。
 *
 * ── 這頁在確認什麼 ──
 * 1. 同名同階的武器要在放進去之前就分得出來（滑過格子看詞綴與強化）
 * 2. 放入改成拖曳：背包格拖到「我提供」；拖回背包或點一下取出
 * 3. 堆疊道具放入前先用拉桿決定數量
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TradePanelContent } from '../src/components/TradePanel';
import { DragGhost } from '../src/components/DragGhost';
import { useGameStore } from '../src/stores/gameStore';
import { useTradeStore, type TradeOfferInput, type TradeView } from '../src/stores/tradeStore';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { ITEM_DEFINITIONS } from '../src/db/seed';
import { resolveEquipment, rollNewInstanceFields } from '../src/systems/templateSync';
import { generateAffixes, getAffixCategoryForSlot, getWeaponBaseDamage } from '../src/models/affix';
import { mapItemCategoryToBagType } from '../src/models/bagItem';
import type { EquipmentInstance, EquipmentTemplate } from '../src/models/equipment';
import type { BagItem } from '../src/models/bagItem';
import { TRADE_MAX_SLOTS } from '../src/systems/trade';

/** 同一個模板連開三把，詞綴各自隨機 —— 這就是「名稱一樣分不出來」的情境 */
function instancesOf(template: EquipmentTemplate, count: number, startId: number): EquipmentInstance[] {
  const category = getAffixCategoryForSlot(template.slot, template.type);
  return Array.from({ length: count }, (_, i) => resolveEquipment({
    id: startId + i,
    templateId: template.id!,
    name: template.name,
    type: template.type,
    slot: template.slot,
    isTwoHanded: template.isTwoHanded,
    quality: 0,
    enhancement: i,
    ...rollNewInstanceFields(template),
    affixes: generateAffixes(category, 40, 4, true, { weaponBaseDamage: getWeaponBaseDamage(template) }),
    ownerId: 1,
    equipped: false,
  }));
}

function bagItem(name: string, amount: number): BagItem | null {
  const def = ITEM_DEFINITIONS.find(d => d.name === name);
  if (!def) return null;
  return { itemId: def.id, name: def.name, type: mapItemCategoryToBagType(def.category), amount };
}

const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const axe = templates.find(t => t.name.includes('戰斧')) ?? templates[0];
const others = templates.filter(t => t !== axe && t.acquireType !== 'starter').slice(0, 9);

const inventory: EquipmentInstance[] = [
  ...instancesOf(axe, 3, 101),
  ...others.flatMap((t, i) => instancesOf(t, 1, 200 + i * 10)),
];

/** 塞到超過三列，才看得出來源格要不要捲動 */
const bagItems = [
  bagItem('精鍊印記', 31), bagItem('工藝印記', 33), bagItem('綠色藥水', 12),
  bagItem('白色藥水', 6), bagItem('魔法藥水', 9),
  ...ITEM_DEFINITIONS.filter(d => d.category === 'material').slice(0, 10).map(d => bagItem(d.name, 4)),
].filter((b): b is BagItem => b !== null);

useGameStore.setState({
  character: { id: 1, name: '我', gold: 25_256 } as never,
  inventory,
  bagItems,
  equippedGear: {},
} as never);

/** 假的對手：接到什麼就照單收下，順便把上限與「不能重複放」的規則跑一次 */
function emptySide(characterId: number, name: string) {
  return { characterId, name, equipment: [], items: [], gold: 0, locked: false, confirmed: false };
}

const baseTrade: TradeView = {
  id: 'demo',
  me: emptySide(1, '我'),
  other: { ...emptySide(2, '秋天'), equipment: instancesOf(others[0] ?? axe, 1, 900), gold: 1200 },
  stage: 'editing',
};

useTradeStore.setState({
  trade: baseTrade,
  offers: [],
  message: null,
  /** server 端的 `setOffer`：驗證後把鏡像換掉（`systems/trade.ts` 的規則照抄一份最小版） */
  setOffer: async (input: TradeOfferInput) => {
    const state = useTradeStore.getState().trade!;
    if (input.equipmentIds.length + input.items.length > TRADE_MAX_SLOTS) {
      useTradeStore.setState({ message: `一次最多交易 ${TRADE_MAX_SLOTS} 樣（金幣不算）` });
      return false;
    }
    const picked = input.equipmentIds
      .map(id => inventory.find(e => e.id === id))
      .filter((e): e is EquipmentInstance => !!e);
    useTradeStore.setState({
      message: null,
      trade: { ...state, me: { ...state.me, equipment: picked, items: input.items, gold: input.gold } },
    });
    return true;
  },
  lock: async () => {
    const state = useTradeStore.getState().trade!;
    useTradeStore.setState({ trade: { ...state, me: { ...state.me, locked: true }, stage: 'locked' } });
    return true;
  },
  cancel: async () => {
    useTradeStore.setState({ trade: { ...baseTrade, me: emptySide(1, '我') }, message: '已取消（demo 重置）' });
    return true;
  },
  confirm: async () => {
    useTradeStore.setState({ message: 'demo 不會真的換手' });
    return true;
  },
} as never);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="panel-window is-demo">
      <div className="panel-window-title">交易</div>
      <TradePanelContent />
    </div>
    <DragGhost />
  </StrictMode>,
);

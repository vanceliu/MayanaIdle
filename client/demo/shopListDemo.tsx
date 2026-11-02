/**
 * 商店清單（`shop-list.html`）：武器店／防具店／雜貨店的購買與出售列，用正式的 `ItemListRow` 與 seed 資料。
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { useGameStore } from '../src/stores/gameStore';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { ITEM_DEFINITIONS } from '../src/db/seed';
import { resolveEquipment, rollNewInstanceFields } from '../src/systems/templateSync';
import { generateAffixes, getAffixCategoryForSlot, getWeaponBaseDamage } from '../src/models/affix';
import type { EquipmentInstance, EquipmentTemplate } from '../src/models/equipment';
import { GENERAL_STORE_ITEM_IDS, getEquipmentSellPrice, getItemSellPrice, isSellableEquipment } from '../src/systems/shop';
import { EquipmentDetail, EquipmentTemplateDetail } from '../src/components/EquipmentInfo';
import { QtyStepper } from '../src/components/common/QtyStepper';
import { CraftUsageBadge } from '../src/components/common/CraftUsageBadge';
import { useShopCart } from '../src/components/common/ShopCart';
import {
  ItemListRow, EquipmentInstanceLabel, EquipmentTemplateLabel, ItemLabel, ItemTooltip,
} from '../src/components/common/ItemListRow';

// ── 假資料 ─────────────────────────────────────────────
const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const shopTemplates = templates.filter(t => t.acquireType === 'shop').sort((a, b) => (a.buyPrice ?? 0) - (b.buyPrice ?? 0));
const weaponTemplates = shopTemplates.filter(t => t.slot === 'rightHand');
const armorTemplates = shopTemplates.filter(t => t.slot !== 'rightHand');

let nextId = 1;
function instanceOf(t: EquipmentTemplate, enhancement: number): EquipmentInstance {
  return resolveEquipment({
    id: nextId++, templateId: t.id!, name: t.name, type: t.type, slot: t.slot, isTwoHanded: t.isTwoHanded,
    quality: Math.floor(Math.random() * 21), enhancement,
    ...rollNewInstanceFields(t),
    affixes: generateAffixes(getAffixCategoryForSlot(t.slot, t.type), 40, 4, true, { weaponBaseDamage: getWeaponBaseDamage(t) }),
    ownerId: 1, equipped: false,
  });
}
/** 每個部位／武器類型各挑一件、只留可賣的，模擬背包裡的雜貨 */
const loot = templates.filter(t => t.acquireType !== 'starter' && (t.tier ?? 0) >= 2);
function onePer(list: EquipmentTemplate[], keyOf: (t: EquipmentTemplate) => string): EquipmentInstance[] {
  const seen = new Set<string>();
  return list
    .filter(t => !seen.has(keyOf(t)) && seen.add(keyOf(t)))
    .map((t, i) => instanceOf(t, i % 3))
    .filter(item => isSellableEquipment(item, templates, new Set()));
}
const bagWeapons = onePer(loot.filter(t => t.slot === 'rightHand'), t => t.type);
const bagArmors = onePer(loot.filter(t => t.slot !== 'rightHand'), t => t.type === 'armor' ? t.slot : t.type);

const storeItemIds = [...GENERAL_STORE_ITEM_IDS, ...ITEM_DEFINITIONS.filter(d => d.name === '薄暮村回城卷軸').map(d => d.id)];
const bagStack = [
  ...ITEM_DEFINITIONS.filter(d => d.category === 'material').slice(0, 6),
  ...ITEM_DEFINITIONS.filter(d => d.name === '紅色藥水' || d.name === '解毒藥水'),
].map((d, i) => ({ itemId: d.id, name: d.name, amount: 3 + i * 7 }));

useGameStore.setState({
  character: {
    id: 1, name: '我', className: 'knight', level: 30, gold: 250_000,
    baseAttributes: { STR: 20, AGI: 12, VIT: 15, SPI: 10, INT: 8, CHA: 8 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  } as never,
  activeEffects: [],
} as never);

// ── 版面 ─────────────────────────────────────────────
function ShopCard({ title, greeting, buy, sell }: {
  title: string;
  greeting: string;
  buy: (cart: ReturnType<typeof useShopCart>) => ReactNode;
  sell: (cart: ReturnType<typeof useShopCart>) => ReactNode;
}) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const buyCart = useShopCart();
  const sellCart = useShopCart();
  return (
    <section className="demo-card">
      <h2>{title}</h2>
      <div className="shop-panel">
        <p className="shop-greeting">{greeting}</p>
        <div className="shop-gold">持有金幣: 250,000G</div>
        <div className="shop-tabs">
          <button className={tab === 'buy' ? 'active' : ''} onClick={() => setTab('buy')}>購買</button>
          <button className={tab === 'sell' ? 'active' : ''} onClick={() => setTab('sell')}>出售</button>
        </div>
        <div className="panel-scroll">
          <div className="shop-items">{tab === 'buy' ? buy(buyCart) : sell(sellCart)}</div>
        </div>
      </div>
    </section>
  );
}

function templateRows(list: EquipmentTemplate[], cart: ReturnType<typeof useShopCart>) {
  return list.map(t => (
    <ItemListRow
      key={t.id}
      label={<EquipmentTemplateLabel template={t} />}
      tooltip={<EquipmentTemplateDetail template={t} />}
      price={`${(t.buyPrice ?? 0).toLocaleString()}G`}
    >
      <QtyStepper label={t.name} value={cart.raw(`tpl:${t.id}`)} max={99} min={0} onChange={v => cart.set(`tpl:${t.id}`, v)} />
    </ItemListRow>
  ));
}

function instanceRows(list: EquipmentInstance[], cart: ReturnType<typeof useShopCart>) {
  return list.map(item => (
    <ItemListRow
      key={item.id}
      label={<EquipmentInstanceLabel item={item} templates={templates} />}
      tooltip={<EquipmentDetail item={item} templates={templates} />}
      price={`+${getEquipmentSellPrice(item, templates).toLocaleString()}G`}
      priceClassName="sell-price"
    >
      <QtyStepper label={`${item.name} #${item.id}`} value={cart.raw(`eq:${item.id}`)} max={1} min={0} onChange={v => cart.set(`eq:${item.id}`, v)} />
    </ItemListRow>
  ));
}

function App() {
  return (
    <div className="demo-grid">
      <ShopCard
        title="武器店"
        greeting="「來看看我的貨色。」"
        buy={cart => templateRows(weaponTemplates, cart)}
        sell={cart => instanceRows(bagWeapons, cart)}
      />
      <ShopCard
        title="防具店"
        greeting="「需要防具嗎？」"
        buy={cart => templateRows(armorTemplates, cart)}
        sell={cart => instanceRows(bagArmors, cart)}
      />
      <ShopCard
        title="雜貨店"
        greeting="「歡迎光臨！」"
        buy={cart => storeItemIds.map(id => {
          const def = ITEM_DEFINITIONS.find(d => d.id === id);
          if (!def) return null;
          return (
            <ItemListRow
              key={id}
              label={<ItemLabel itemId={id} name={def.name} />}
              tooltip={<ItemTooltip itemId={id} />}
              price={`${(def.buyPrice ?? 0).toLocaleString()}G`}
            >
              <QtyStepper label={def.name} value={cart.raw(String(id))} max={999} min={0} onChange={v => cart.set(String(id), v)} />
            </ItemListRow>
          );
        })}
        sell={cart => bagStack.map(item => (
          <ItemListRow
            key={item.itemId}
            label={<ItemLabel itemId={item.itemId} name={item.name} suffix={<> ×{item.amount}<CraftUsageBadge itemId={item.itemId} compact /></>} />}
            tooltip={<ItemTooltip itemId={item.itemId} count={item.amount} />}
            price={`+${getItemSellPrice(item.itemId)}G/個`}
            priceClassName="sell-price"
          >
            <QtyStepper
              label={item.name} value={cart.raw(String(item.itemId))} max={item.amount} min={0}
              hardCap={Infinity} showMax onChange={v => cart.set(String(item.itemId), v)}
            />
          </ItemListRow>
        ))}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

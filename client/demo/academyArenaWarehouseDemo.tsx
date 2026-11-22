/**
 * 魔法學院／競技場取用倉庫（`academy-arena-warehouse.html`）：來源合計與 hover 明細的版面樣本。
 * 存量走遊戲的 `getMaterialStock`，扣除走 `drawCraftMaterials`／`drawAnyOfMaterials`，demo 只做畫面。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Tooltip } from '../src/components/Tooltip';
import { getItemById } from '../src/models/items';
import { makeBagItem, type BagItem } from '../src/models/bagItem';
import { SPELLBOOK_FRAGMENT_ID, SPELLBOOK_RECIPES } from '../src/models/magicAcademy';
import { ARENA_MATERIAL_COST, arenaGoldCost, arenaMaterialIds, getArenaTier } from '../src/models/arena';
import {
  CRAFT_SOURCE_ORDER, getMaterialStock, getMaterialTotal, type CraftSourceKind, type CraftSources,
} from '../src/systems/craftQuestSystem';
import { drawAnyOfMaterials, drawCraftMaterials } from '../src/systems/crafting';

const SOURCE_LABEL: Record<CraftSourceKind, string> = { bag: '背包', personal: '個人倉庫', shared: '帳號倉庫' };
const ARENA = getArenaTier(5)!;
const ARENA_IDS = arenaMaterialIds(ARENA);
const RECIPE = SPELLBOOK_RECIPES[0];
const BOOK_LEARN_SKILL = '風暴 (Lv.4)';

type Scenario = 'bag' | 'mixed' | 'lacking';

const items = (pairs: [number, number][]): BagItem[] =>
  pairs.filter(([, n]) => n > 0).map(([id, n]) => makeBagItem(id, n)!);

function buildSources(scenario: Scenario): CraftSources {
  const F = SPELLBOOK_FRAGMENT_ID, M = RECIPE.materialItemId, B = RECIPE.bookItemId;
  const [a0, a1, a2] = ARENA_IDS;
  const stock = (bag: [number, number][], personal: [number, number][], shared: [number, number][]): CraftSources => ({
    bag: { materials: items(bag), equipment: [] },
    personal: { materials: items(personal), equipment: [] },
    shared: { materials: items(shared), equipment: [] },
  });
  if (scenario === 'bag') return stock([[F, 4], [M, 6], [B, 1], [a0, 3], [a1, 2]], [], []);
  if (scenario === 'mixed') {
    return stock(
      [[F, 1], [a1, 1]],
      [[F, 1], [M, 2], [a0, 1], [a2, 1]],
      [[F, 6], [M, 10], [B, 2], [a0, 9]],
    );
  }
  return stock([[F, 1], [a0, 1]], [[M, 2]], [[F, 1], [M, 1], [a1, 2]]);
}

/** 三處合計；hover 顯示各處存量 */
function SourceCount({ sources, itemIds, className, children }: {
  sources: CraftSources; itemIds: number[]; className?: string; children: React.ReactNode;
}) {
  const bySource = CRAFT_SOURCE_ORDER.map(s => [s, itemIds.reduce((sum, id) => sum + getMaterialStock(sources, id)[s], 0)] as const);
  return (
    <Tooltip position="top" content={(
      <div className="bs-mat-source-tooltip">
        {bySource.map(([s, n]) => <div key={s}>{SOURCE_LABEL[s]} {n}</div>)}
      </div>
    )}>
      <span className={`source-count${className ? ` ${className}` : ''}`}>{children}</span>
    </Tooltip>
  );
}

const name = (id: number) => getItemById(id)?.name ?? '未知道具';

function AcademyCraft({ sources }: { sources: CraftSources }) {
  const fragments = getMaterialTotal(sources, SPELLBOOK_FRAGMENT_ID);
  const materials = getMaterialTotal(sources, RECIPE.materialItemId);
  const canCraft = fragments >= RECIPE.fragments && materials >= RECIPE.materialAmount;
  return (
    <div className="academy-panel">
      <h4>製作魔法書</h4>
      <div className="craft-material-info">
        <span>持有碎片: <SourceCount sources={sources} itemIds={[SPELLBOOK_FRAGMENT_ID]}>{fragments}</SourceCount></span>
      </div>
      <div className="shop-item">
        <div className="shop-item-info">
          <span className="shop-item-name">{name(RECIPE.bookItemId)}</span>
          <span className="shop-item-desc">教學等級: {RECIPE.levels}</span>
          <span className="shop-item-desc">
            {name(SPELLBOOK_FRAGMENT_ID)} ×{RECIPE.fragments} (<SourceCount sources={sources} itemIds={[SPELLBOOK_FRAGMENT_ID]}>{fragments}</SourceCount>)
            {' + '}
            {name(RECIPE.materialItemId)} ×{RECIPE.materialAmount} (<SourceCount sources={sources} itemIds={[RECIPE.materialItemId]}>{materials}</SourceCount>)
          </span>
        </div>
        <div className="shop-item-actions">
          <button disabled={!canCraft}>{canCraft ? '製作' : '素材不足'}</button>
        </div>
      </div>
      {canCraft && (
        <DrawResult drawn={drawCraftMaterials([
          { itemId: SPELLBOOK_FRAGMENT_ID, amount: RECIPE.fragments },
          { itemId: RECIPE.materialItemId, amount: RECIPE.materialAmount },
        ], sources)} before={sources} itemIds={[SPELLBOOK_FRAGMENT_ID, RECIPE.materialItemId]} />
      )}

      <h4>魔法書學習（4~10 級）</h4>
      {(() => {
        const count = getMaterialTotal(sources, RECIPE.bookItemId);
        return (
          <div className="shop-item">
            <div className="shop-item-info">
              <span className="shop-item-name">{BOOK_LEARN_SKILL}</span>
              <span className="shop-item-desc">
                需要: {name(RECIPE.bookItemId)} (持有: <SourceCount sources={sources} itemIds={[RECIPE.bookItemId]}>{count}</SourceCount>)
              </span>
            </div>
            <div className="shop-item-actions">
              <button disabled={count === 0}>{count > 0 ? '學習' : '缺少魔法書'}</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ArenaCard({ sources }: { sources: CraftSources }) {
  const owned = ARENA_IDS.reduce((sum, id) => sum + getMaterialTotal(sources, id), 0);
  const fee = arenaGoldCost(ARENA.tier);
  const reason = owned < ARENA_MATERIAL_COST ? '材料不足' : null;
  return (
    <>
      <div className="shop-item arena-tier">
        <div className="shop-item-info">
          <span className="shop-item-name">T{ARENA.tier} 競技場</span>
          <span className="shop-item-desc">Lv.{ARENA.level} 以上｜一般怪 {ARENA.normalLabel}｜王：{ARENA.bosses.join('、')}</span>
          <span className="shop-item-desc">
            入場材料（任意混合 {ARENA_MATERIAL_COST} 個）：
            {ARENA.materials.map((m, i) => (
              <span key={m}>
                {i > 0 && '、'}{m}×<SourceCount sources={sources} itemIds={[ARENA_IDS[i]]} className="arena-mat-count">{getMaterialTotal(sources, ARENA_IDS[i])}</SourceCount>
              </span>
            ))}
          </span>
          <span className="bounty-price">
            💰 {fee.toLocaleString()} 金幣＋材料 <SourceCount sources={sources} itemIds={ARENA_IDS}>{owned}</SourceCount>/{ARENA_MATERIAL_COST}
          </span>
        </div>
        <div className="shop-item-actions">
          <div className="bounty-actions">
            <button disabled={reason != null}>票券場入場</button>
            {reason && <span className="bounty-block-reason">{reason}</span>}
          </div>
        </div>
      </div>
      {!reason && <DrawResult drawn={drawAnyOfMaterials(ARENA_IDS, ARENA_MATERIAL_COST, sources)} before={sources} itemIds={ARENA_IDS} />}
    </>
  );
}

function DrawResult({ drawn, before, itemIds }: {
  drawn: Record<CraftSourceKind, BagItem[]>; before: CraftSources; itemIds: number[];
}) {
  const lines = CRAFT_SOURCE_ORDER.flatMap(s => itemIds.map(id => {
    const used = getMaterialStock(before, id)[s] - (drawn[s].find(b => b.itemId === id)?.amount ?? 0);
    return used > 0 ? `${SOURCE_LABEL[s]} ${name(id)}×${used}` : null;
  })).filter(Boolean);
  return <div className="demo-stock">按下後扣除：{lines.join('、')}</div>;
}

function StockTable({ sources }: { sources: CraftSources }) {
  return (
    <div className="demo-stock">
      {CRAFT_SOURCE_ORDER.map(s => (
        <div key={s}><strong>{SOURCE_LABEL[s]}</strong>：{sources[s].materials.map(m => `${m.name}×${m.amount}`).join('、') || '—'}</div>
      ))}
    </div>
  );
}

function App() {
  const [scenario, setScenario] = useState<Scenario>('mixed');
  const sources = buildSources(scenario);
  const options: [Scenario, string][] = [['bag', '背包就夠'], ['mixed', '倉庫補足'], ['lacking', '合計不足']];
  return (
    <>
      <div className="demo-bar">
        <fieldset>
          <legend>情境</legend>
          {options.map(([v, label]) => (
            <label key={v}><input type="radio" name="sc" checked={scenario === v} onChange={() => setScenario(v)} /> {label}</label>
          ))}
        </fieldset>
      </div>
      <div className="demo-grid">
        <section className="demo-card">
          <h2>魔法學院</h2>
          <AcademyCraft sources={sources} />
        </section>
        <section className="demo-card">
          <h2>競技場 NPC — 入場</h2>
          <ArenaCard sources={sources} />
          <h3>本情境的存量</h3>
          <StockTable sources={sources} />
        </section>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

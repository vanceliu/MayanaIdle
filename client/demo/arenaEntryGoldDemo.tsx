/**
 * 競技場入場只收金幣（`arena-entry-gold.html`，`55-arena.md` § 55.1）：改後的 NPC 入場頁；勾選後在右側附現行版本對照。
 * 段位、等級、王名單、入場費、波次數量取自 `models/arena.ts`；持有材料、隊員為假資料。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ARENA_TIERS, arenaGoldCost, arenaWaveSize, type ArenaTier, type ArenaTierSpec } from '../src/models/arena';

type Scenario = 'rich' | 'poor' | 'leader' | 'member';

const SCENARIO_GOLD: Record<Scenario, number> = { rich: 300_000, poor: 120_000, leader: 300_000, member: 40_000 };
const LEVEL = 62;
const LEADER_NAME = '阿光';
const MEMBER_NAME = '小白';
const BEFORE_MATERIAL_COST = 5;

/** 現行介面的入場材料名單（§ 55.1 改版前） */
const BEFORE_MATERIALS: Record<ArenaTier, string[]> = {
  4: ['試煉飛龍之鱗', '雪地之主的凍心', '惡魔之瞳'],
  5: ['蛇魔毒囊', '獄王深海珠', '巨龍逆鱗', '皇女毒腺', '哥布林王冠碎片', '吸血鬼血晶', '殭屍王心臟', '約特勒龍鱗'],
  6: ['遠古騎士紋章', '殭屍王心臟', '約特勒龍鱗', '冥王靈魂石', '伊莉絲霜核', '伊弗利特熔心', '守護者印記', '死神碎魂'],
  7: ['遠古騎士紋章', '冥王靈魂石', '伊莉絲霜核', '伊弗利特熔心', '守護者印記', '死神碎魂'],
};
const OWNED: Record<string, number> = {
  試煉飛龍之鱗: 3, 雪地之主的凍心: 1, 惡魔之瞳: 4, 蛇魔毒囊: 2, 巨龍逆鱗: 1, 殭屍王心臟: 1, 遠古騎士紋章: 2, 死神碎魂: 1,
};

interface Ctx {
  gold: number;
  scenario: Scenario;
  usedTiers: ReadonlySet<ArenaTier>;
}

const inParty = (s: Scenario) => s === 'leader' || s === 'member';
const partySize = (s: Scenario) => (inParty(s) ? 2 : 1);

function blockReasonOf(spec: ArenaTierSpec, scenario: Scenario): string | null {
  if (scenario === 'member') return '組隊時由隊長帶隊進場';
  if (LEVEL < spec.level) return `需要 Lv.${spec.level}`;
  return null;
}

function StatusBar({ ctx, after }: { ctx: Ctx; after: boolean }) {
  const size = partySize(ctx.scenario);
  const partyLabel = ctx.scenario === 'leader'
    ? `組隊 ${size} 人（隊長付費）`
    : ctx.scenario === 'member' ? `組隊 ${size} 人（隊長「${LEADER_NAME}」付費）` : '單人';
  return (
    <>
      <div className="adventurer-guild-status">
        <span>金幣：{ctx.gold.toLocaleString()}G</span>
        <span>{after ? partyLabel : (inParty(ctx.scenario) ? `組隊 ${size} 人（隊長付費）` : '單人')}</span>
        <span className="bounty-next-refresh">票券場下次重置 21:00</span>
      </div>
      <p className="arena-wave-note">
        回城卷軸撤退：票券全留；死亡：收回本場票券的一半（無條件捨去）。<br />
        一般波 {arenaWaveSize(1, size)} 隻、第 10 的倍數波出 {arenaWaveSize(10, size)} 隻王；打倒每一輪王得 1 張票券{size > 1 ? '（每人各 1 張）' : ''}；最多 100 波
      </p>
      {after && <p className="arena-fee-note">票券場入場費只扣付費者身上的金幣，帳號倉庫的金幣不算；組隊時由隊長付。</p>}
    </>
  );
}

function TierHeader({ spec }: { spec: ArenaTierSpec }) {
  return (
    <>
      <span className="shop-item-name">T{spec.tier} 競技場{!spec.open && <span className="arena-closed-tag">未開放</span>}</span>
      <span className="shop-item-desc">Lv.{spec.level} 以上｜一般怪 {spec.normalLabel}｜王：{spec.bosses.join('、')}</span>
    </>
  );
}

function EnterButton({ spec, usedSlot, reason }: { spec: ArenaTierSpec; usedSlot: boolean; reason: string | null }) {
  return (
    <div className="shop-item-actions">
      <div className="bounty-actions">
        {!spec.open
          ? <button disabled>未開放</button>
          : <button disabled={reason != null}>{usedSlot ? '入場（不給票券）' : '票券場入場'}</button>}
        {spec.open && reason && <span className="bounty-block-reason">{reason}</span>}
      </div>
    </div>
  );
}

/** 現行：金幣＋任意混合 5 個材料 */
function BeforeTierCard({ spec, ctx }: { spec: ArenaTierSpec; ctx: Ctx }) {
  const usedSlot = ctx.usedTiers.has(spec.tier);
  const materials = BEFORE_MATERIALS[spec.tier];
  const owned = materials.reduce((sum, m) => sum + (OWNED[m] ?? 0), 0);
  const fee = arenaGoldCost(spec.tier);
  const feeBlock = usedSlot ? null : owned < BEFORE_MATERIAL_COST ? '材料不足' : ctx.gold < fee ? '金幣不足' : null;
  const reason = blockReasonOf(spec, ctx.scenario) ?? feeBlock;
  return (
    <div className={`shop-item arena-tier${spec.open ? '' : ' arena-tier-closed'}`}>
      <div className="shop-item-info">
        <TierHeader spec={spec} />
        <span className="shop-item-desc">
          入場材料（任意混合 {BEFORE_MATERIAL_COST} 個）：
          {materials.map((m, i) => (
            <span key={m}>{i > 0 && '、'}{m}×<span className="arena-mat-count">{OWNED[m] ?? 0}</span></span>
          ))}
        </span>
        <span className={`bounty-price ${!usedSlot && ctx.gold < fee ? 'lacking' : ''}`}>
          {usedSlot
            ? '本時段已用掉票券場：入場不收費、不給票券'
            : <>💰 {fee.toLocaleString()} 金幣＋材料 {owned}/{BEFORE_MATERIAL_COST}</>}
        </span>
      </div>
      <EnterButton spec={spec} usedSlot={usedSlot} reason={reason} />
    </div>
  );
}

/** 改後：只收金幣；隊員不付費，看不到也不檢查隊長的金幣 */
function AfterTierCard({ spec, ctx }: { spec: ArenaTierSpec; ctx: Ctx }) {
  const usedSlot = ctx.usedTiers.has(spec.tier);
  const fee = arenaGoldCost(spec.tier);
  const payerIsMe = ctx.scenario !== 'member';
  const lacking = spec.open && payerIsMe && !usedSlot && ctx.gold < fee;
  const reason = blockReasonOf(spec, ctx.scenario) ?? (lacking ? '金幣不足' : null);
  return (
    <div className={`shop-item arena-tier${spec.open ? '' : ' arena-tier-closed'}`}>
      <div className="shop-item-info">
        <TierHeader spec={spec} />
        <span className={`bounty-price ${lacking ? 'lacking' : ''}`}>
          {usedSlot
            ? '本時段已用掉票券場：入場不收費、不給票券'
            : <>
                💰 {fee.toLocaleString()} 金幣
                {ctx.scenario === 'leader' && <span className="arena-fee-payer">（隊長付）</span>}
                {ctx.scenario === 'member' && <span className="arena-fee-payer">（由隊長「{LEADER_NAME}」付）</span>}
              </>}
        </span>
      </div>
      <EnterButton spec={spec} usedSlot={usedSlot} reason={reason} />
    </div>
  );
}

function NpcPanel({ ctx, after }: { ctx: Ctx; after: boolean }) {
  return (
    <section className={`demo-card demo-npc${after ? '' : ' is-before'}`}>
      <h2>{after ? '改後：只收金幣' : '現行：金幣＋材料'}</h2>
      <div className="guild-panel arena-npc">
        <p className="shop-greeting">「撐得越久，獎賞越豐厚。」</p>
        <div className="storage-tabs">
          <button className="active">入場</button>
          <button>兌換</button>
        </div>
        <StatusBar ctx={ctx} after={after} />
        <div className="panel-scroll">
          <div className="shop-items">
            {ARENA_TIERS.map(spec => (after
              ? <AfterTierCard key={spec.tier} spec={spec} ctx={ctx} />
              : <BeforeTierCard key={spec.tier} spec={spec} ctx={ctx} />))}
          </div>
        </div>
      </div>
    </section>
  );
}

const SCENARIO_LABELS: Record<Scenario, string> = {
  rich: '金幣足夠', poor: '金幣不足', leader: '組隊・自己是隊長', member: `組隊・自己是隊員（隊長「${LEADER_NAME}」）`,
};

function App() {
  const [scenario, setScenario] = useState<Scenario>('rich');
  const [gold, setGold] = useState(SCENARIO_GOLD.rich);
  const [used5, setUsed5] = useState(false);
  const [showBefore, setShowBefore] = useState(false);
  const ctx: Ctx = { gold, scenario, usedTiers: new Set<ArenaTier>(used5 ? [5] : []) };
  const pick = (s: Scenario) => { setScenario(s); setGold(SCENARIO_GOLD[s]); };
  return (
    <>
      <div className="demo-bar">
        <fieldset>
          <legend>情境</legend>
          {(Object.keys(SCENARIO_LABELS) as Scenario[]).map(s => (
            <label key={s}><input type="radio" name="sc" checked={scenario === s} onChange={() => pick(s)} /> {SCENARIO_LABELS[s]}</label>
          ))}
        </fieldset>
        <label>
          身上金幣 <input type="range" min={0} max={400_000} step={10_000} value={gold} onChange={e => setGold(Number(e.target.value))} />
          {' '}{gold.toLocaleString()}G
        </label>
        <label><input type="checkbox" checked={used5} onChange={e => setUsed5(e.target.checked)} /> T5 本時段已用掉票券場</label>
        <label><input type="checkbox" checked={showBefore} onChange={e => setShowBefore(e.target.checked)} /> 顯示現行版本對照</label>
        <span style={{ color: 'var(--text-dim)' }}>角色 Lv.{LEVEL}{inParty(scenario) ? `；隊員「${scenario === 'leader' ? MEMBER_NAME : LEADER_NAME}」Lv.62` : ''}</span>
      </div>
      <div className="demo-grid">
        <NpcPanel ctx={ctx} after />
        {showBefore && <NpcPanel ctx={ctx} after={false} />}
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

/**
 * 競技場（`arena.html`，`55-arena.md`）：NPC 介面（入場／兌換／排行榜）、背包票券分頁、場內 HUD 的版面樣本。
 * 段位、入場材料、金幣、組隊數量依 55；持有數量、排行榜、場內進度為假資料。
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getItemById, getItemId } from '../src/models/items';
import { GameIcon } from '../src/components/GameIcon';
import { makeBagItem } from '../src/models/bagItem';
import { useGameStore } from '../src/stores/gameStore';
import { BagPanel } from '../src/components/BagPanel';

type Tier = 4 | 5 | 6 | 7;

/** § 55.1：入場材料名單與 Boss 名單；T7 目前未開放 */
const TIERS: { tier: Tier; open: boolean; level: number; materials: string[]; bosses: string[]; monsters: string }[] = [
  { tier: 4, open: true, level: 38, materials: ['試煉飛龍之鱗', '雪地之主的凍心', '惡魔之瞳'], bosses: ['試煉飛龍', '雪地之主', '象牙塔惡魔'], monsters: 'Lv.34～40' },
  { tier: 5, open: true, level: 50, materials: ['蛇魔毒囊', '獄王深海珠', '巨龍逆鱗', '皇女毒腺', '哥布林王冠碎片', '吸血鬼血晶', '殭屍王心臟', '約特勒龍鱗'], bosses: ['朦朧蛇魔', '深海獄王', '安塔巨龍', '毒之皇女', '哥布林之王', '暗影吸血鬼', '不死殭屍王', '龍王約特勒'], monsters: 'Lv.46～52' },
  { tier: 6, open: true, level: 60, materials: ['遠古騎士紋章', '殭屍王心臟', '約特勒龍鱗', '冥王靈魂石', '伊莉絲霜核', '伊弗利特熔心', '守護者印記', '死神碎魂'], bosses: ['遠古騎士', '不死殭屍王', '龍王約特勒', '冥王哈馬斯', '霜凍伊莉絲', '熔岩伊弗利特', '守護者之主', '百柱死神'], monsters: 'Lv.56～62' },
  { tier: 7, open: false, level: 70, materials: ['遠古騎士紋章', '冥王靈魂石', '伊莉絲霜核', '伊弗利特熔心', '守護者印記', '死神碎魂'], bosses: ['遠古騎士', '冥王哈馬斯', '霜凍伊莉絲', '熔岩伊弗利特', '守護者之主', '百柱死神'], monsters: '百柱塔 91～100F' },
];

const MATERIAL_COST = 5;
const goldCost = (tier: Tier) => tier * 50_000;
/** § 55.2.1：一般波 3 隻、王波 2 隻，乘 1.5^(人數−1) 後無條件進位，上限 10 */
const waveCount = (base: number, members: number) => Math.min(10, Math.ceil(base * 1.5 ** (members - 1)));
/** § 55.4 */
const RESET_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const nextReset = (now: Date) => `${String(RESET_HOURS.find(h => h > now.getHours()) ?? 0).padStart(2, '0')}:00`;

/** 假資料：背包裡的入場材料 */
const OWNED: Record<string, number> = {
  試煉飛龍之鱗: 3, 雪地之主的凍心: 1, 惡魔之瞳: 4,
  蛇魔毒囊: 2, 巨龍逆鱗: 1, 殭屍王心臟: 1,
  遠古騎士紋章: 2, 死神碎魂: 1,
};
const TICKETS: Record<Tier, number> = { 4: 12, 5: 3, 6: 0, 7: 0 };
/** 兌換箱的道具定義（名稱與圖示顏色依段位：T4 黃、T5 橘、T6 紅） */
const boxDef = (tier: Tier, label: string) => getItemById(getItemId(`T${tier} ${label}兌換箱`) ?? -1);
/** § 55.9 */
const BOXES = [{ label: '武器', price: 10 }, { label: '防具', price: 6 }, { label: '飾品', price: 6 }];


function TierCard({ t, gold, level, members, usedSlot, onEnter }: {
  t: (typeof TIERS)[number]; gold: number; level: number; members: number; usedSlot: boolean; onEnter: (tier: Tier, ticketRun: boolean) => void;
}) {
  const owned = t.materials.reduce((s, m) => s + (OWNED[m] ?? 0), 0);
  const fee = goldCost(t.tier);
  /** 假資料：組隊時第 2 位隊員比自己低 6 級 */
  const lowMember = members > 1 && level - 6 < t.level ? '隊員「小白」' : null;
  const levelBlock = level < t.level ? `需要 Lv.${t.level}` : lowMember ? `${lowMember}未達 Lv.${t.level}` : null;
  const lacking = levelBlock != null || (!usedSlot && (owned < MATERIAL_COST || gold < fee));
  return (
    <div className={`shop-item arena-tier${t.open ? '' : ' arena-tier-closed'}`}>
      <div className="shop-item-info">
        <span className="shop-item-name">T{t.tier} 競技場{!t.open && <span className="arena-closed-tag">未開放</span>}</span>
        <span className="shop-item-desc">Lv.{t.level} 以上｜一般怪 {t.monsters}｜王：{t.bosses.join('、')}</span>
        <span className="shop-item-desc">
          入場材料（任意混合 {MATERIAL_COST} 個）：{t.materials.map(m => `${m}×${OWNED[m] ?? 0}`).join('、')}
        </span>
        <span className={`bounty-price ${!usedSlot && gold < fee ? 'lacking' : ''}`}>
          {usedSlot ? '本時段已用掉票券場：入場不收費、不給票券' : `💰 ${fee.toLocaleString()} 金幣＋材料 ${owned}/${MATERIAL_COST}`}
        </span>
      </div>
      <div className="shop-item-actions">
        <div className="bounty-actions">
          {!t.open
            ? <button disabled>未開放</button>
            : usedSlot
              ? <button disabled={levelBlock != null} onClick={() => onEnter(t.tier, false)}>入場（不給票券）</button>
              : <button disabled={lacking} onClick={() => onEnter(t.tier, true)}>票券場入場</button>}
          {t.open && lacking && <span className="bounty-block-reason">{levelBlock ?? (owned < MATERIAL_COST ? '材料不足' : '金幣不足')}</span>}
        </div>
      </div>
    </div>
  );
}

function useInput(id: string): number {
  const el = document.getElementById(id) as HTMLInputElement;
  const read = () => (el.type === 'checkbox' ? Number(el.checked) : Number(el.value));
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    el.addEventListener('input', on);
    el.addEventListener('change', on);
    return () => { el.removeEventListener('input', on); el.removeEventListener('change', on); };
  }, [el]);
  return v;
}

function NpcPanel({ onEnter }: { onEnter: (tier: Tier, ticketRun: boolean) => void }) {
  const gold = useInput('gold');
  const members = useInput('members');
  const level = useInput('level');
  const [used, setUsed] = useState<Record<Tier, boolean>>({ 4: false, 5: true, 6: false, 7: false });
  const [tab, setTab] = useState<'enter' | 'exchange'>('enter');
  useEffect(() => { document.getElementById('gold-label')!.textContent = `${gold.toLocaleString()}G`; }, [gold]);

  const enter = (tier: Tier, ticketRun: boolean) => {
    if (ticketRun) setUsed(u => ({ ...u, [tier]: true }));
    onEnter(tier, ticketRun);
  };

  return (
    <section className="demo-card demo-npc">
      <h2>競技場</h2>
      <div className="guild-panel">
        <p className="shop-greeting">「撐得越久，獎賞越豐厚。」</p>
        <div className="storage-tabs">
          <button className={tab === 'enter' ? 'active' : ''} onClick={() => setTab('enter')}>入場</button>
          <button className={tab === 'exchange' ? 'active' : ''} onClick={() => setTab('exchange')}>兌換</button>
        </div>
        {tab === 'enter' && (
          <>
            <div className="adventurer-guild-status">
              <span>金幣：{gold.toLocaleString()}G</span>
              <span>Lv.{level}</span>
              <span>{members > 1 ? `組隊 ${members} 人（隊長付費）` : '單人'}</span>
              <span className="bounty-next-refresh">票券場下次重置 {nextReset(new Date())}</span>
            </div>
            <p className="arena-wave-note">
              回城卷軸撤退：票券全留；死亡：收回本場票券的一半（無條件捨去）。<br />
              一般波 {waveCount(3, members)} 隻、第 10 的倍數波出 {waveCount(2, members)} 隻王；打倒每一輪王得 1 張票券{members > 1 ? '（每人各 1 張）' : ''}；最多 100 波
            </p>
            <div className="panel-scroll">
              <div className="shop-items">
                {TIERS.map(t => <TierCard key={t.tier} t={t} gold={gold} level={level} members={members} usedSlot={used[t.tier]} onEnter={enter} />)}
              </div>
            </div>
          </>
        )}
        {tab === 'exchange' && (
          <div className="panel-scroll">
            <div className="adventurer-guild-status">
              {TIERS.filter(t => t.open).map(t => <span key={t.tier}>T{t.tier} 票券 ×{TICKETS[t.tier]}</span>)}
            </div>
            <div className="shop-items">
              {TIERS.filter(t => t.open).flatMap(t => BOXES.map(b => {
                const enough = TICKETS[t.tier] >= b.price;
                return (
                  <div key={`${t.tier}-${b.label}`} className="shop-item">
                    <div className="shop-item-info">
                      <span className="shop-item-name" style={{ color: boxDef(t.tier, b.label)?.iconColor }}>
                        <GameIcon name={boxDef(t.tier, b.label)?.icon ?? 'items/swap-bag'} size={16} color={boxDef(t.tier, b.label)?.iconColor} />
                        {' '}T{t.tier} {b.label}兌換箱
                      </span>
                      <span className="shop-item-desc">開出 1 件 T{t.tier} {b.label}；1/2 為 (擬) 擬態品（4 條詞綴＋封印詞綴、必帶隨機技能，不可修改、不可拆）</span>
                      <span className={`bounty-price ${enough ? '' : 'lacking'}`}>T{t.tier} 票券 {b.price} 張（持有 {TICKETS[t.tier]}）</span>
                    </div>
                    <div className="shop-item-actions"><button disabled={!enough}>兌換</button></div>
                  </div>
                );
              }))}
            </div>
          </div>
        )}
      </div>
      <button className="arena-demo-reset" onClick={() => setUsed({ 4: false, 5: false, 6: false, 7: false })}>模擬到達重置時刻</button>
    </section>
  );
}

/** 遊戲的背包面板本體；狀態為假資料（票券、兌換箱、印記與幾樣一般道具） */
function BagDemo() {
  useEffect(() => {
    const id = (name: string) => getItemId(name)!;
    useGameStore.setState({
      bagSlotMap: {},
      bagItems: [
        makeBagItem(id('T4 競技場票券'), TICKETS[4])!,
        makeBagItem(id('T5 競技場票券'), TICKETS[5])!,
        makeBagItem(id('T4 武器兌換箱'), 1)!,
        makeBagItem(id('T5 飾品兌換箱'), 2)!,
        makeBagItem(id('混沌印記'), 3)!,
        makeBagItem(id('橙色藥水'), 120)!,
        makeBagItem(id('銀礦石'), 8)!,
      ],
      inventory: [], equippedGear: {}, pendingDiscard: null, pendingDiscardBatch: null, combatLogs: [],
    });
  }, []);
  return (
    <section className="demo-card demo-bag">
      <h2>背包（遊戲元件）</h2>
      <BagPanel />
      <p className="arena-wave-note">按底部「票券」打開票券抽屜；滑過格子看 tooltip。</p>
    </section>
  );
}

function Hud({ run }: { run: { tier: Tier; ticketRun: boolean } | null }) {
  const [wave, setWave] = useState(23);
  const members = useInput('members');
  if (!run) return <section className="demo-card demo-hud"><h2>場內 HUD</h2><p className="empty-text">從左邊入場後顯示</p></section>;
  const boss = wave % 10 === 0;
  const tickets = run.ticketRun ? Math.floor((wave - 1) / 10) : 0;
  return (
    <section className="demo-card demo-hud">
      <h2>場內 HUD</h2>
      <div className="arena-hud">
        <div className="arena-hud-title">T{run.tier} 競技場{run.ticketRun ? '' : '（不給票券）'}</div>
        <div className="arena-hud-row"><span>波次</span><b className={boss ? 'arena-hud-boss' : ''}>{wave} / 100{boss ? '（王波）' : ''}</b></div>
        <div className="arena-hud-row"><span>下一輪王</span><b>第 {Math.ceil(wave / 10) * 10 === wave ? wave : Math.ceil(wave / 10) * 10} 波</b></div>
        <div className="arena-hud-row"><span>剩餘怪物</span><b>{boss ? waveCount(2, members) : waveCount(3, members)}</b></div>
        <div className="arena-hud-row"><span>經過時間</span><b>14:52</b></div>
        <div className="arena-hud-row"><span>本場票券</span><b>{tickets} 張</b></div>
      </div>
      <div className="demo-row-inline">
        <button onClick={() => setWave(w => Math.max(1, w - 1))}>上一波</button>
        <button onClick={() => setWave(w => Math.min(100, w + 1))}>下一波</button>
      </div>
    </section>
  );
}

function App() {
  const [run, setRun] = useState<{ tier: Tier; ticketRun: boolean } | null>(null);
  return (
    <div className="demo-grid">
      <NpcPanel onEnter={(tier, ticketRun) => setRun({ tier, ticketRun })} />
      <div className="demo-col">
        <Hud run={run} />
        <BagDemo />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

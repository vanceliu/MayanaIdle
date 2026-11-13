/**
 * 城鎮競技場 NPC（`55-arena.md`）：入場（§ 55.1／§ 55.4／§ 55.5）與票券兌換（§ 55.9）。
 * 進場判定與扣費在 server（`arena.enter`）；這裡只顯示條件與送出。
 */
import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { usePartyStore } from '../../stores/partyStore';
import { useTownStore } from '../../stores/townStore';
import { getBagItemAmount } from '../../models/bagItem';
import { getItemById } from '../../models/items';
import {
  ARENA_MATERIAL_COST, ARENA_TIERS, arenaGoldCost, arenaMaterialIds, arenaWaveSize, isArenaSlotUsed,
  nextArenaSlotStart, type ArenaTier, type ArenaTierSpec,
} from '../../models/arena';
import { ARENA_BOXES, ARENA_TICKET_ITEM_IDS, type ArenaBoxDef } from '../../systems/arenaBox';
import { connection } from '../../net/connection';
import { GameIcon } from '../GameIcon';

interface EnterResult { ok: boolean; message?: string }

const BOX_DESC = '1/2 機率為 (擬) 擬態品（4 條詞綴＋封印詞綴、武器與飾品必帶隨機技能，不可修改、不可拆）';

function formatHour(ms: number): string {
  return `${String(new Date(ms).getHours()).padStart(2, '0')}:00`;
}

function TierCard({ spec, usedSlot, blockReason, onEnter, busy }: {
  spec: ArenaTierSpec; usedSlot: boolean; blockReason: string | null; onEnter: (tier: ArenaTier) => void; busy: boolean;
}) {
  const bagItems = useGameStore(s => s.bagItems);
  const gold = useGameStore(s => s.character?.gold ?? 0);
  const ids = arenaMaterialIds(spec);
  const owned = ids.reduce((sum, id) => sum + getBagItemAmount(bagItems, id), 0);
  const fee = arenaGoldCost(spec.tier);
  const feeBlock = usedSlot ? null : owned < ARENA_MATERIAL_COST ? '材料不足' : gold < fee ? '金幣不足' : null;
  const reason = blockReason ?? feeBlock;
  return (
    <div className={`shop-item arena-tier${spec.open ? '' : ' arena-tier-closed'}`}>
      <div className="shop-item-info">
        <span className="shop-item-name">T{spec.tier} 競技場{!spec.open && <span className="arena-closed-tag">未開放</span>}</span>
        <span className="shop-item-desc">Lv.{spec.level} 以上｜一般怪 {spec.normalLabel}｜王：{spec.bosses.join('、')}</span>
        <span className="shop-item-desc">
          入場材料（任意混合 {ARENA_MATERIAL_COST} 個）：{spec.materials.map((m, i) => `${m}×${getBagItemAmount(bagItems, ids[i])}`).join('、')}
        </span>
        <span className={`bounty-price ${!usedSlot && gold < fee ? 'lacking' : ''}`}>
          {usedSlot ? '本時段已用掉票券場：入場不收費、不給票券' : `💰 ${fee.toLocaleString()} 金幣＋材料 ${owned}/${ARENA_MATERIAL_COST}`}
        </span>
      </div>
      <div className="shop-item-actions">
        <div className="bounty-actions">
          {!spec.open
            ? <button disabled>未開放</button>
            : <button disabled={busy || reason != null} onClick={() => onEnter(spec.tier)}>{usedSlot ? '入場（不給票券）' : '票券場入場'}</button>}
          {spec.open && reason && <span className="bounty-block-reason">{reason}</span>}
        </div>
      </div>
    </div>
  );
}

function EnterTab() {
  const char = useGameStore(s => s.character);
  const arenaSlots = useGameStore(s => s.arenaSlots);
  const party = usePartyStore(s => s.party);
  const closeFacility = useTownStore(s => s.closeFacility);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!char) return null;

  // 票券場時段是 wall clock（§ 55.4），與 server `ArenaRegistry.enter` 相同
  const now = Date.now();
  const members = party ? party.members.filter(m => m.online) : [];
  const size = Math.max(1, members.length);
  const notLeader = party != null && party.leaderId !== char.id;

  const blockReasonOf = (spec: ArenaTierSpec): string | null => {
    if (notLeader) return '組隊時由隊長帶隊進場';
    if (char.level < spec.level) return `需要 Lv.${spec.level}`;
    const low = members.find(m => m.characterId !== char.id && m.level < spec.level);
    return low ? `隊員「${low.name}」未達 Lv.${spec.level}` : null;
  };

  async function enter(tier: ArenaTier) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await connection.rpc('arena', 'enter', [tier]) as EnterResult;
      if (result.ok) closeFacility();
      else setMessage(result.message ?? '無法進場');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '無法進場');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="adventurer-guild-status">
        <span>金幣：{char.gold.toLocaleString()}G</span>
        <span>{party ? `組隊 ${size} 人（隊長付費）` : '單人'}</span>
        <span className="bounty-next-refresh">票券場下次重置 {formatHour(nextArenaSlotStart(now))}</span>
      </div>
      <p className="arena-wave-note">
        回城卷軸撤退：票券全留；死亡：收回本場票券的一半（無條件捨去）。<br />
        一般波 {arenaWaveSize(1, size)} 隻、第 10 的倍數波出 {arenaWaveSize(10, size)} 隻王；打倒每一輪王得 1 張票券{size > 1 ? '（每人各 1 張）' : ''}；最多 100 波
      </p>
      {message && <p className="arena-message">{message}</p>}
      <div className="panel-scroll">
        <div className="shop-items">
          {ARENA_TIERS.map(spec => (
            <TierCard
              key={spec.tier} spec={spec} busy={busy} onEnter={enter}
              usedSlot={isArenaSlotUsed(arenaSlots, spec.tier, now)} blockReason={blockReasonOf(spec)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function BoxRow({ box, onExchange, busy }: { box: ArenaBoxDef; onExchange: (box: ArenaBoxDef) => void; busy: boolean }) {
  const tickets = useGameStore(s => getBagItemAmount(s.bagItems, box.ticketItemId));
  const def = getItemById(box.itemId);
  const enough = tickets >= box.price;
  return (
    <div className="shop-item">
      <div className="shop-item-info">
        <span className="shop-item-name" style={{ color: def?.iconColor }}>
          <GameIcon name={def?.icon ?? 'items/swap-bag'} size={16} color={def?.iconColor} /> {def?.name}
        </span>
        <span className="shop-item-desc">{def?.description}；{BOX_DESC}</span>
        <span className={`bounty-price ${enough ? '' : 'lacking'}`}>T{box.tier} 票券 {box.price} 張（持有 {tickets}）</span>
      </div>
      <div className="shop-item-actions"><button disabled={busy || !enough} onClick={() => onExchange(box)}>兌換</button></div>
    </div>
  );
}

function ExchangeTab() {
  const bagItems = useGameStore(s => s.bagItems);
  const exchangeArenaBox = useGameStore(s => s.exchangeArenaBox);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const tiers = ARENA_TIERS.filter(t => t.open && ARENA_TICKET_ITEM_IDS[t.tier] != null);

  async function exchange(box: ArenaBoxDef) {
    setBusy(true);
    try {
      setMessage((await exchangeArenaBox(box.itemId)).message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '兌換失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-scroll">
      <div className="adventurer-guild-status">
        {tiers.map(t => <span key={t.tier}>T{t.tier} 票券 ×{getBagItemAmount(bagItems, ARENA_TICKET_ITEM_IDS[t.tier]!)}</span>)}
      </div>
      {message && <p className="arena-message">{message}</p>}
      <div className="shop-items">
        {ARENA_BOXES.map(box => <BoxRow key={box.itemId} box={box} busy={busy} onExchange={exchange} />)}
      </div>
    </div>
  );
}

export function ArenaNpc() {
  const [tab, setTab] = useState<'enter' | 'exchange'>('enter');
  return (
    <div className="guild-panel arena-npc">
      <p className="shop-greeting">「撐得越久，獎賞越豐厚。」</p>
      <div className="storage-tabs">
        <button className={tab === 'enter' ? 'active' : ''} onClick={() => setTab('enter')}>入場</button>
        <button className={tab === 'exchange' ? 'active' : ''} onClick={() => setTab('exchange')}>兌換</button>
      </div>
      {tab === 'enter' ? <EnterTab /> : <ExchangeTab />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { CLASS_NAMES_ZH } from '../models/character';
import type { ClassName } from '../models/character';
import { AFFIX_DEFINITIONS, formatAffixDisplay, isSpecialAffixType } from '../models/affix';
import type { AnyAffixType } from '../models/affix';
import { LEADERBOARD_LABELS, type LeaderboardField } from '../services/leaderboardService';
import {
  listArchives,
  deleteArchive,
  parseCharacterPayload,
  parseSharedWarehousePayload,
  type LegacyEquipment,
  type LegacyItemStack,
} from '../systems/legacyArchive';
import type { LegacyArchiveEntry } from '../db/database';

/**
 * 遺產頁（§ 45.3）
 *
 * 硬性限制：唯讀、不可取出任何物品、不可復活角色，
 * 且頁面內只有「返回角色選擇」一個出口，不可前往任何遊玩畫面。
 */

const ATTR_NAMES: Record<string, string> = {
  STR: '力量', AGI: '敏捷', VIT: '體質', SPI: '精神', INT: '智力', CHA: '魅力',
};

/** 快照缺少的欄位顯示為 `—`，不可顯示 0 或猜測值（§ 45.3） */
function displayValue(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString();
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * 詞綴文字。`display` 由封存流程寫死（§ 45.1），舊快照沒有這個欄位時，
 * 就用快照留下的 `type/tier/value` 就地重建；連詞綴種類都認不得才顯示 `—`
 * （§ 45.3 規定顯示 `—`，不可顯示 0 或猜測值 —— 更不可把英文 enum 丟給玩家看）。
 */
function affixText(affix: LegacyEquipment['affixes'][number], quality: number): string {
  if (affix.display) return affix.display;
  const type = affix.type as AnyAffixType | undefined;
  if (!type) return '—';
  const known = isSpecialAffixType(type) || AFFIX_DEFINITIONS.some(d => d.type === type);
  if (!known) return '—';
  return formatAffixDisplay({ type, tier: affix.tier ?? 0, value: affix.value ?? 0 }, quality);
}

function EquipmentRow({ item }: { item: LegacyEquipment }) {
  const suffix = [
    item.enhancement ? `+${item.enhancement}` : null,
    item.quality ? `品質 ${item.quality}%` : null,
    // § 45.2：裝備欄需含雙手佔用狀態
    item.isTwoHanded ? '（雙手）' : null,
  ].filter(Boolean).join(' ');

  return (
    <li className="legacy-item">
      <span className="legacy-item-name">{item.name}{suffix && <span className="legacy-item-suffix"> {suffix}</span>}</span>
      {item.affixes.length > 0 && (
        <span className="legacy-item-affixes">
          {item.affixes.map((affix, i) => (
            <span key={i} className="legacy-affix">{affixText(affix, item.quality ?? 0)}</span>
          ))}
        </span>
      )}
    </li>
  );
}

function ItemList({ items, empty }: { items: LegacyItemStack[]; empty: string }) {
  if (items.length === 0) return <div className="legacy-empty">{empty}</div>;
  return (
    <ul className="legacy-item-list">
      {items.map((item, i) => (
        <li key={i} className="legacy-item">
          <span className="legacy-item-name">{item.name}</span>
          <span className="legacy-item-amount">×{item.amount}</span>
        </li>
      ))}
    </ul>
  );
}

function EquipmentList({ items, empty }: { items: LegacyEquipment[]; empty: string }) {
  if (items.length === 0) return <div className="legacy-empty">{empty}</div>;
  return (
    <ul className="legacy-item-list">
      {items.map((item, i) => <EquipmentRow key={i} item={item} />)}
    </ul>
  );
}

function CharacterDetail({ entry }: { entry: LegacyArchiveEntry }) {
  const payload = parseCharacterPayload(entry);
  if (!payload) return <div className="legacy-empty">此紀錄無法讀取</div>;

  const char = payload.character;
  const attrKeys = Object.keys(char.baseAttributes ?? {});

  return (
    <div className="legacy-detail">
      <section className="legacy-section">
        <h4>基本資料</h4>
        <div className="legacy-grid">
          <div><span>職業</span><strong>{CLASS_NAMES_ZH[char.className as ClassName] ?? char.className}</strong></div>
          <div><span>等級</span><strong>{displayValue(char.level)}</strong></div>
          <div><span>經驗</span><strong>{displayValue(char.exp)}</strong></div>
          <div><span>金幣</span><strong>{displayValue(char.gold)}</strong></div>
          <div><span>HP</span><strong>{displayValue(char.hp)} / {displayValue(char.maxHp)}</strong></div>
          <div><span>MP</span><strong>{displayValue(char.mp)} / {displayValue(char.maxMp)}</strong></div>
          <div><span>建立於</span><strong>{char.createdAt ? formatDate(char.createdAt) : '—'}</strong></div>
          <div><span>最後所在</span><strong>{char.currentRegion ?? '—'}</strong></div>
        </div>
      </section>

      <section className="legacy-section">
        <h4>屬性</h4>
        <div className="legacy-grid">
          {attrKeys.map(key => (
            <div key={key}>
              <span>{ATTR_NAMES[key] ?? key}</span>
              <strong>
                {displayValue((char.baseAttributes[key] ?? 0) + (char.bonusAttributes?.[key] ?? 0))}
              </strong>
            </div>
          ))}
          <div><span>未分配點數</span><strong>{displayValue(char.unspentAttributePoints)}</strong></div>
        </div>
      </section>

      <section className="legacy-section">
        <h4>統計數據</h4>
        {payload.statistics ? (
          <div className="legacy-grid">
            {(Object.keys(LEADERBOARD_LABELS) as LeaderboardField[])
              .filter(field => field !== 'character_level')
              .map(field => (
                <div key={field}>
                  <span>{LEADERBOARD_LABELS[field]}</span>
                  <strong>
                    {field === 'contribution'
                      ? displayValue(payload.contribution)
                      : displayValue(payload.statistics?.[field])}
                  </strong>
                </div>
              ))}
          </div>
        ) : (
          <div className="legacy-empty">此快照沒有統計資料</div>
        )}
      </section>

      <section className="legacy-section">
        <h4>已學習技能</h4>
        {payload.skills.length === 0 ? (
          <div className="legacy-empty">沒有學習任何技能</div>
        ) : (
          <ul className="legacy-item-list">
            {payload.skills.map((skill, i) => (
              <li key={i} className="legacy-item">
                <span className="legacy-item-name">{skill.name ?? skill.id ?? '未知技能'}</span>
                {skill.level != null && <span className="legacy-item-amount">Lv.{skill.level}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="legacy-section">
        <h4>裝備欄</h4>
        <EquipmentList items={payload.equipped} empty="沒有裝備任何物品" />
      </section>

      <section className="legacy-section">
        <h4>背包</h4>
        <EquipmentList items={payload.inventory} empty="背包內沒有裝備" />
        <ItemList items={payload.bagItems} empty="背包內沒有道具" />
      </section>

      <section className="legacy-section">
        <h4>個人倉庫</h4>
        <EquipmentList items={payload.personalWarehouseEquipment} empty="個人倉庫沒有裝備" />
        <ItemList items={payload.personalStorageItems} empty="個人倉庫沒有道具" />
      </section>
    </div>
  );
}

function SharedWarehouseDetail({ entry }: { entry: LegacyArchiveEntry }) {
  const payload = parseSharedWarehousePayload(entry);
  if (!payload) return <div className="legacy-empty">此紀錄無法讀取</div>;

  return (
    <div className="legacy-detail">
      <section className="legacy-section">
        <h4>金幣</h4>
        <div className="legacy-grid">
          <div><span>存放金幣</span><strong>{displayValue(payload.gold)}</strong></div>
        </div>
      </section>
      <section className="legacy-section">
        <h4>裝備</h4>
        <EquipmentList items={payload.equipment} empty="沒有存放裝備" />
      </section>
      <section className="legacy-section">
        <h4>道具</h4>
        <ItemList items={payload.items} empty="沒有存放道具" />
      </section>
    </div>
  );
}

export function LegacyArchiveView() {
  const userId = useGameStore(s => s.userId);
  const setPhase = useGameStore(s => s.setPhase);
  const [entries, setEntries] = useState<LegacyArchiveEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    listArchives(userId).then(rows => {
      setEntries(rows);
      setSelectedId(rows[0]?.id ?? null);
      setLoading(false);
    });
  }, [userId]);

  async function handleDelete(entry: LegacyArchiveEntry) {
    if (entry.id == null) return;
    if (!window.confirm(`確定要刪除「${entry.label}」的遺產紀錄嗎？此操作無法復原。`)) return;
    await deleteArchive(entry.id);
    const rows = userId ? await listArchives(userId) : [];
    setEntries(rows);
    setSelectedId(rows[0]?.id ?? null);
  }

  const selected = entries.find(entry => entry.id === selectedId) ?? null;

  return (
    <div className="legacy-screen">
      <div className="legacy-header">
        {/* § 45.3：這是唯一的出口，不可加入任何前往遊玩畫面的入口 */}
        <button className="btn-secondary" onClick={() => setPhase('characterSelect')}>← 返回角色選擇</button>
        <h2>遺產</h2>
      </div>

      {loading ? (
        <div className="legacy-empty">載入中...</div>
      ) : entries.length === 0 ? (
        <div className="legacy-empty">沒有任何遺產紀錄</div>
      ) : (
        <div className="legacy-body">
          <div className="legacy-list">
            {entries.map(entry => (
              <div
                key={entry.id}
                className={`legacy-list-item ${entry.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(entry.id ?? null)}
              >
                <div className="legacy-list-main">
                  <span className="legacy-list-name">{entry.label}</span>
                  {entry.type === 'character' && (
                    <span className="legacy-list-sub">
                      {CLASS_NAMES_ZH[entry.className as ClassName] ?? entry.className} · Lv.{entry.level}
                    </span>
                  )}
                </div>
                <div className="legacy-list-meta">
                  <span>資料版本 {entry.dataVersion}</span>
                  <span>{formatDate(entry.archivedAt)}</span>
                </div>
                <button
                  className="btn-delete-char"
                  onClick={e => { e.stopPropagation(); void handleDelete(entry); }}
                >
                  刪除
                </button>
              </div>
            ))}
          </div>

          <div className="legacy-content">
            {selected == null ? (
              <div className="legacy-empty">請選擇一筆紀錄</div>
            ) : selected.type === 'character' ? (
              <CharacterDetail entry={selected} />
            ) : (
              <SharedWarehouseDetail entry={selected} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

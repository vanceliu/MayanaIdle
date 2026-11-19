/**
 * 遺產頁（`45-legacy-archive.md` § 45.3）：唯讀列表與詳細內容，只能返回角色選擇或刪除單筆。
 * 快照是封存當下的 JSON，欄位缺少一律顯示「—」，不顯示 0 或猜測值。
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { LegacyArchive, LegacyArchiveSummary, LegacyArchiveType } from '../models/legacyArchive';
import { CLASS_NAMES_ZH, ATTRIBUTE_KEYS, ATTRIBUTE_NAMES_ZH, type ClassName } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import { resolveEquipment } from '../systems/templateSync';
import { EquipmentDetail } from './EquipmentInfo';
import { Tooltip } from './Tooltip';
import { getItemById } from '../models/items';
import { getRegion } from '../models/mapData';
import { LEADERBOARD_LABELS } from '../services/leaderboardService';

type Json = Record<string, unknown>;
const DASH = '—';
const TYPE_LABEL: Record<LegacyArchiveType, string> = { character: '角色', sharedWarehouse: '帳號倉庫', guild: '公會' };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : DASH);
const text = (v: unknown) => (typeof v === 'string' && v ? v : DASH);
const date = (v: unknown) => (typeof v === 'number' ? new Date(v).toLocaleString() : DASH);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === 'object') : []);
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Json : null);
const className = (v: unknown) => (typeof v === 'string' && v in CLASS_NAMES_ZH ? CLASS_NAMES_ZH[v as ClassName] : text(v));

/** 快照裡的裝備實例補上模板欄位（名稱、數值），供顯示與 tooltip */
function resolveArchived(e: Json): EquipmentInstance {
  return resolveEquipment(e as unknown as EquipmentInstance);
}
function equipmentName(item: EquipmentInstance): string {
  const enh = (item.enhancement ?? 0) > 0 ? `+${item.enhancement} ` : '';
  return `${enh}${item.name ?? `裝備 #${String(item.templateId ?? DASH)}`}`;
}
function itemLine(e: Json): string {
  const id = Number(e.itemTemplateId ?? e.itemId ?? e.item_id);
  const name = getItemById(id)?.name ?? (typeof e.name === 'string' ? e.name : `道具 #${Number.isFinite(id) ? id : DASH}`);
  return `${name} ×${num(e.amount)}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legacy-section">
      <h4 className="legacy-section-title">{title}</h4>
      {children}
    </section>
  );
}
function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="legacy-fields">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}
function Lines({ lines, equipment = [] }: { lines: string[]; equipment?: Json[] }) {
  if (lines.length === 0 && equipment.length === 0) return <p className="legacy-empty">{DASH}</p>;
  return (
    <ul className="legacy-lines">
      {lines.map((l, i) => <li key={`l${i}`}>{l}</li>)}
      {equipment.map((e, i) => {
        const item = resolveArchived(e);
        return (
          <li key={`e${i}`}>
            {/* 滑鼠移上去顯示完整裝備資訊（詞綴、品質、強化） */}
            <Tooltip content={<EquipmentDetail item={item} />}>
              <span className="legacy-equipment">{equipmentName(item)}</span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function CharacterDetail({ p }: { p: Json }) {
  const c = obj(p.character) ?? {};
  const equipment = list(p.equipment);
  const base = obj(c.baseAttributes);
  const bonus = obj(c.bonusAttributes);
  const stats = obj(obj(p.prefs)?.statistics);
  const guild = obj(p.guild);
  return (
    <>
      <Section title="基本資料">
        <Fields rows={[
          ['名稱', text(c.name)], ['職業', className(c.className)], ['等級', num(c.level)], ['經驗', num(c.exp)],
          ['金幣', num(c.gold)], ['所在區域', typeof c.currentRegion === 'string' ? getRegion(c.currentRegion)?.name ?? c.currentRegion : DASH],
          ['建立時間', date(c.createdAt)], ['星盤', Array.isArray(c.starChart) ? `已點 ${c.starChart.length} 點` : DASH],
        ]} />
      </Section>
      <Section title="屬性">
        <Fields rows={ATTRIBUTE_KEYS.map(k => [ATTRIBUTE_NAMES_ZH[k],
          base && typeof base[k] === 'number' ? num((base[k] as number) + (typeof bonus?.[k] === 'number' ? bonus[k] as number : 0)) : DASH])} />
      </Section>
      <Section title="裝備欄"><Lines lines={[]} equipment={equipment.filter(e => e.equipped === true)} /></Section>
      <Section title="背包">
        <Lines lines={list(p.bag).map(itemLine)} equipment={equipment.filter(e => e.equipped !== true && e.inStorage !== true)} />
      </Section>
      <Section title="個人倉庫">
        <Lines lines={list(p.personalWarehouse).map(itemLine)} equipment={equipment.filter(e => e.inStorage === true)} />
      </Section>
      <Section title="技能"><Lines lines={list(c.skills).map(s => text(s.name))} /></Section>
      <Section title="統計">
        {stats
          ? <Fields rows={Object.entries(LEADERBOARD_LABELS).filter(([k]) => k !== 'character_level').map(([k, label]) => [label, num(stats[k])])} />
          : <p className="legacy-empty">{DASH}</p>}
      </Section>
      <Section title="公會">
        <p>{guild ? `${text(guild.name)}（${guild.role === 'leader' ? '會長' : '成員'}）` : DASH}</p>
      </Section>
      <Section title="競技場">
        <Lines lines={list(p.arena).map(a => `T${num(a.tier)} ${a.party ? '組隊' : '單人'}：第 ${num(a.wave)} 波`)} />
      </Section>
      <Section title="信箱"><Lines lines={list(p.mail).map(m => text(m.title))} /></Section>
      <Section title="天賦格"><p>{Array.isArray(p.talentSlots) ? `${p.talentSlots.length} 格` : DASH}</p></Section>
    </>
  );
}

function SharedWarehouseDetail({ p }: { p: Json }) {
  return (
    <>
      <Section title="倉庫金幣"><p>{num(p.gold)}</p></Section>
      <Section title="道具"><Lines lines={list(p.items).map(itemLine)} /></Section>
      <Section title="裝備"><Lines lines={[]} equipment={list(p.equipment)} /></Section>
    </>
  );
}

function GuildDetail({ p }: { p: Json }) {
  const g = obj(p.guild) ?? {};
  return (
    <>
      <Section title="公會">
        <Fields rows={[['名稱', text(g.name)], ['建立時間', date(g.createdAt)], ['公會金幣', num(g.gold)]]} />
      </Section>
      <Section title="成員">
        <Lines lines={list(p.members).map(m => `${text(m.name)}　${className(m.class_name)} Lv.${num(m.level)}`)} />
      </Section>
      <Section title="公會倉庫">
        <Lines lines={list(p.items).map(itemLine)} equipment={list(p.equipment)} />
      </Section>
    </>
  );
}

function parsePayload(raw: string): Json | null {
  try {
    return obj(JSON.parse(raw));
  } catch {
    return null;
  }
}

function ArchiveDetail({ archive }: { archive: LegacyArchive }) {
  const payload = parsePayload(archive.payload);
  if (!payload) return <p className="legacy-empty">這筆紀錄無法讀取</p>;
  if (archive.type === 'character') return <CharacterDetail p={payload} />;
  if (archive.type === 'sharedWarehouse') return <SharedWarehouseDetail p={payload} />;
  return <GuildDetail p={payload} />;
}

export interface LegacyArchivePageProps {
  archives: LegacyArchiveSummary[];
  loadArchive: (id: number) => Promise<LegacyArchive | null>;
  onDelete: (id: number) => Promise<boolean>;
  onBack: () => void;
}

export function LegacyArchivePage({ archives, loadArchive, onDelete, onBack }: LegacyArchivePageProps) {
  /** 最新的一季在前；一次只看一季 */
  const seasons = [...new Set(archives.map(a => a.season))].sort((a, b) => b - a);
  const [pickedSeason, setPickedSeason] = useState<number | null>(null);
  const season = pickedSeason !== null && seasons.includes(pickedSeason) ? pickedSeason : seasons[0] ?? null;
  const inSeason = archives.filter(a => a.season === season);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const selectedId = inSeason.some(a => a.id === pickedId) ? pickedId : inSeason[0]?.id ?? null;
  const setSelectedId = setPickedId;
  const [detail, setDetail] = useState<LegacyArchive | null>(null);

  useEffect(() => {
    if (selectedId == null) return;
    let alive = true;
    void loadArchive(selectedId).then(a => { if (alive) setDetail(a); });
    return () => { alive = false; };
  }, [selectedId, loadArchive]);

  const selected = archives.find(a => a.id === selectedId) ?? null;
  const shown = detail && detail.id === selectedId ? detail : null;

  async function remove(a: LegacyArchiveSummary) {
    if (!window.confirm(`確定要刪除「${a.label}」這筆遺產嗎？刪除後無法復原。`)) return;
    if (await onDelete(a.id)) setSelectedId(null);
  }

  return (
    <div className="legacy-screen">
      <div className="legacy-header">
        <h2>遺產</h2>
        <button className="btn-secondary" onClick={onBack}>返回角色選擇</button>
      </div>
      <p className="legacy-note">版本淘汰時封存的紀錄，只能檢視，不能取出任何物品。</p>
      <div className="legacy-body">
        <div className="legacy-list">
          {/* 季別一律用下拉選單：季數再多也只佔一格 */}
          <select className="legacy-season-select" aria-label="季別" value={season ?? ''} onChange={e => setPickedSeason(Number(e.target.value))}>
            {seasons.map(s => <option key={s} value={s}>Season {s}</option>)}
          </select>
          <ul className="legacy-season-list">
            {inSeason.map(a => (
              <li key={a.id}>
                <button className={`legacy-card${a.id === selectedId ? ' active' : ''}`} onClick={() => setSelectedId(a.id)}>
                  <span className="legacy-card-name">{a.label}<span className="legacy-card-type">{TYPE_LABEL[a.type]}</span></span>
                  <span className="legacy-card-meta">
                    {a.type === 'character' ? `${className(a.className)} Lv.${num(a.level)}　` : ''}封存於 {new Date(a.archivedAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="legacy-detail">
          {selected && shown ? (
            <>
              <ArchiveDetail archive={shown} />
              <button className="btn-danger legacy-delete" onClick={() => void remove(selected)}>刪除這筆遺產</button>
            </>
          ) : <p className="legacy-empty">{selected ? '讀取中…' : '沒有遺產紀錄'}</p>}
        </div>
      </div>
    </div>
  );
}

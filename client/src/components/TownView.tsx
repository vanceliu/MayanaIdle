import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { getRegion } from '../models/mapData';
import { GeneralStore } from './town/GeneralStore';
import { Inn } from './town/Inn';
import { ArmorShop } from './town/ArmorShop';
import { WeaponShop } from './town/WeaponShop';
import { Storage } from './town/Storage';
import { MagicAcademy } from './town/MagicAcademy';
import { ClassGuild } from './town/ClassGuild';
import { TownBlacksmith } from './town/TownBlacksmith';
import { StarterNpc } from './town/StarterNpc';
import { AdventurerGuild } from './town/AdventurerGuild';
import { StatisticsCenter } from './town/StatisticsCenter';

export type TownFacility = 'list' | 'general-store' | 'blacksmith' | 'weapon-shop' | 'armor-shop' | 'inn' | 'storage' | 'magic-academy' | 'class-guild' | 'starter-npc' | 'adventurer-guild' | 'statistics-center';

interface FacilityInfo {
  id: TownFacility;
  name: string;
  icon: string;
}

const FACILITIES: FacilityInfo[] = [
  { id: 'general-store', name: '雜貨店', icon: '🛒' },
  { id: 'weapon-shop', name: '武器店', icon: '⚔️' },
  { id: 'armor-shop', name: '防具店', icon: '🛡️' },
  { id: 'blacksmith', name: '鐵匠鋪', icon: '🔨' },
  { id: 'inn', name: '旅館', icon: '🏨' },
  { id: 'storage', name: '倉庫', icon: '📦' },
  { id: 'magic-academy', name: '魔法學院', icon: '📖' },
  { id: 'class-guild', name: '職業工會', icon: '⚜️' },
  { id: 'adventurer-guild', name: '冒險者工會', icon: '🏛️' },
  { id: 'statistics-center', name: '統計中心', icon: '📊' },
];

const STARTER_NPC_FACILITY: FacilityInfo = { id: 'starter-npc', name: '新手指導員', icon: '🧭' };

function FacilityContent({ facility }: { facility: TownFacility }) {
  switch (facility) {
    case 'general-store': return <GeneralStore />;
    case 'weapon-shop': return <WeaponShop />;
    case 'blacksmith': return <TownBlacksmith />;
    case 'armor-shop': return <ArmorShop />;
    case 'inn': return <Inn />;
    case 'storage': return <Storage />;
    case 'magic-academy': return <MagicAcademy />;
    case 'class-guild': return <ClassGuild />;
    case 'adventurer-guild': return <AdventurerGuild />;
    case 'statistics-center': return <StatisticsCenter />;
    case 'starter-npc': return <StarterNpc />;
    default: return null;
  }
}

export function TownView() {
  const char = useGameStore(s => s.character);
  const combatLogs = useGameStore(s => s.combatLogs);
  const [facility, setFacility] = useState<TownFacility>('list');

  if (!char) return null;

  const region = getRegion(char.currentRegion);
  const townName = region?.name ?? '城鎮';
  const isNeutralTown = char.currentRegion === 'neutral-town';
  const visibleFacilities = isNeutralTown ? [...FACILITIES, STARTER_NPC_FACILITY] : FACILITIES;

  return (
    <div className="town-view">
      <div className="town-header">
        <span className="town-name">{townName}</span>
        <span className="town-subtitle">安全區域</span>
      </div>

      <div className="town-npc-bar">
        {visibleFacilities.map(f => (
          <button
            key={f.id}
            className={`town-npc-btn ${facility === f.id ? 'active' : ''}`}
            onClick={() => setFacility(facility === f.id ? 'list' : f.id)}
            title={f.name}
          >
            <span className="npc-icon">{f.icon}</span>
            <span className="npc-label">{f.name}</span>
          </button>
        ))}
      </div>

      {facility !== 'list' && (
        <div className="town-modal-overlay" onClick={() => setFacility('list')}>
          <div className="town-modal" onClick={e => e.stopPropagation()}>
            <div className="town-modal-header">
              <span>{[...FACILITIES, STARTER_NPC_FACILITY].find(f => f.id === facility)?.name}</span>
              <button className="town-modal-close" onClick={() => setFacility('list')}>✕</button>
            </div>
            <div className="town-modal-body">
              <FacilityContent facility={facility} />
            </div>
          </div>
        </div>
      )}

      <div className="combat-log town-log">
        {combatLogs.length === 0 && <div className="log-entry log-system">目前沒有戰鬥紀錄</div>}
        {combatLogs.map((log, i) => (
          <div key={i} className={`log-entry log-${log.type}`}>{log.text}</div>
        ))}
      </div>
    </div>
  );
}

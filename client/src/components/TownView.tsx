import { useGameStore } from '../stores/gameStore';
import { useWindowLayerStore, useWindowZIndex } from '../stores/windowLayerStore';
import { useTownStore } from '../stores/townStore';
import { getRegion } from '../models/mapData';
import { useIsMobile } from '../hooks/useViewport';
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
import { SigilMaster } from './town/SigilMaster';

export type TownFacility = 'list' | 'general-store' | 'blacksmith' | 'weapon-shop' | 'armor-shop' | 'inn' | 'storage' | 'magic-academy' | 'class-guild' | 'starter-npc' | 'adventurer-guild' | 'statistics-center' | 'sigil-master';

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
  { id: 'sigil-master', name: '印記師', icon: '🔯' },
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
    case 'sigil-master': return <SigilMaster />;
    case 'starter-npc': return <StarterNpc />;
    default: return null;
  }
}

export function TownView() {
  const char = useGameStore(s => s.character);
  const facility = useTownStore(s => s.facility);
  const openFacility = useTownStore(s => s.openFacility);
  const closeFacility = useTownStore(s => s.closeFacility);
  // 設施列與設施視窗一起提到最上層（§ 32.15）
  const zIndex = useWindowZIndex('town');
  const focusWindow = useWindowLayerStore(s => s.focusWindow);
  /**
   * 手機把設施列改成**右側往下長的圖示直排**（`47-mobile.md`）。
   *
   * 橫排在 393px 寬得捲兩三次才看得完，而它整條橫在地圖上方會蓋掉那一帶的 NPC。
   * 直排靠右只佔一條窄帶，十一個設施一次全看得到、也全點得到 ——
   * 不必再收合，因此沒有展開狀態。
   */
  const isMobile = useIsMobile();

  if (!char) return null;

  const region = getRegion(char.currentRegion);
  const townName = region?.name ?? '城鎮';
  const isNeutralTown = char.currentRegion === 'neutral-town';
  const visibleFacilities = isNeutralTown ? [...FACILITIES, STARTER_NPC_FACILITY] : FACILITIES;
  return (
    <div className="town-view" style={{ zIndex }} onPointerDown={() => focusWindow('town')}>
      {/*
        * 標題列在手機不渲染：`目前: {城鎮名}` 已經在地圖選擇器上，
        * 同一個資訊在半個螢幕寬的畫面裡不值得再佔一列（`47-mobile.md`）。
        */}
      {!isMobile && (
        <div className="town-header">
          <span className="town-name">{townName}</span>
          <span className="town-subtitle">安全區域</span>
        </div>
      )}

      <div className="town-npc-bar">
        {visibleFacilities.map(f => (
          <button
            key={f.id}
            className={`town-npc-btn ${facility === f.id ? 'active' : ''}`}
            onClick={() => (facility === f.id ? closeFacility() : openFacility(f.id))}
            title={f.name}
          >
            <span className="npc-icon">{f.icon}</span>
            <span className="npc-label">{f.name}</span>
          </button>
        ))}
      </div>

      {facility !== 'list' && (
        <div className="town-modal-overlay" onClick={closeFacility}>
          <div className="town-modal" onClick={e => e.stopPropagation()}>
            <div className="town-modal-header">
              <span>{[...FACILITIES, STARTER_NPC_FACILITY].find(f => f.id === facility)?.name}</span>
              <button className="town-modal-close" onClick={closeFacility}>✕</button>
            </div>
            <div className="town-modal-body">
              <FacilityContent facility={facility} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

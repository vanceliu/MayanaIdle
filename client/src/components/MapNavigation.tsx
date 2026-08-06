import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { ZONES, getRegionsByZone, getRegion } from '../models/mapData';
import { isRegionUnlockEnabled } from '../systems/devFlags';
import type { Region } from '../models/area';
import { hasBagItem } from '../models/bagItem';
import { getItemById } from '../models/items';

export function MapNavigation() {
  const char = useGameStore(s => s.character);
  const phase = useGameStore(s => s.phase);
  const navigateTo = useGameStore(s => s.navigateTo);
  const bagItems = useGameStore(s => s.bagItems);
  const [open, setOpen] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!char) return null;

  const isBattling = phase !== 'explore';
  const currentRegion = getRegion(char.currentRegion);
  const selectedZone = selectedZoneId ? ZONES.find(z => z.id === selectedZoneId) : null;
  const regions = selectedZoneId ? getRegionsByZone(selectedZoneId) : [];
  const selectedGroup = selectedGroupId ? regions.filter(r => r.group?.id === selectedGroupId) : [];
  /**
   * 同組的 region 在區域清單裡收成一個入口（例：百柱塔十個區段）。
   * 這只是導覽層級的折疊，region 本身完全沒變。
   */
  const groupedRegions: (Region | { group: NonNullable<Region['group']>; members: Region[] })[] = [];
  const seenGroups = new Set<string>();
  for (const r of regions) {
    if (!r.group) { groupedRegions.push(r); continue; }
    if (seenGroups.has(r.group.id)) continue;
    seenGroups.add(r.group.id);
    groupedRegions.push({ group: r.group, members: regions.filter(m => m.group?.id === r.group!.id) });
  }

  function handleRegionClick(region: Region) {
    if (region.type === 'dungeon' && region.floors && region.floors.length > 1) {
      setSelectedRegion(region);
    } else {
      const floor = region.type === 'dungeon' && region.floors ? region.floors[0].floor : null;
      navigateTo({ zoneId: region.zoneId, regionId: region.id, floor });
      setSelectedZoneId(null);
      setSelectedRegion(null);
      setSelectedGroupId(null);
      setOpen(false);
    }
  }

  function handleFloorClick(regionObj: Region, floor: number) {
    navigateTo({ zoneId: regionObj.zoneId, regionId: regionObj.id, floor });
    setSelectedZoneId(null);
    setSelectedRegion(null);
    setSelectedGroupId(null);
    setOpen(false);
  }

  function renderRegionButton(r: Region) {
    if (!char) return null;
    const isCurrent = char.currentRegion === r.id;
    const typeLabel = r.type === 'dungeon' ? '副本' : r.type === 'town' ? '城鎮' : '野外';
    const needsScroll = !!r.entryScrollItemId && !isRegionUnlockEnabled();
    const hasScroll = !needsScroll || hasBagItem(bagItems, r.entryScrollItemId!);
    const isLocked = needsScroll && !hasScroll;
    const scrollLabel = r.entryScrollItemId ? getItemById(r.entryScrollItemId)?.name ?? '通行卷軸' : '';
    return (
      <button
        key={r.id}
        className={`map-region-btn${isCurrent ? ' active' : ''} type-${r.type}${isLocked ? ' locked' : ''}`}
        onClick={() => handleRegionClick(r)}
        disabled={isBattling || isLocked || (isCurrent && r.type !== 'dungeon')}
        title={isLocked ? `需要「${scrollLabel}」` : undefined}
      >
        <span className="region-name">{isLocked ? '🔒 ' : ''}{r.name}</span>
        <span className="region-meta">[{typeLabel}] Lv.{r.levelMin}~{r.levelMax}</span>
        {r.type === 'dungeon' && r.floors && (
          <span className="region-floors">{r.floors.length} 層</span>
        )}
        {isLocked && <span className="region-scroll-hint">需要: {scrollLabel}</span>}
      </button>
    );
  }

  function renderDropdownContent() {
    if (!char) return null;
    if (selectedGroupId && selectedGroup.length > 0) {
      const groupName = selectedGroup[0].group!.name;
      return (
        <>
          <div className="map-dropdown-header">
            <button className="map-back-btn" onClick={() => setSelectedGroupId(null)} disabled={isBattling}>← 返回</button>
            <span className="map-nav-title">{groupName}</span>
            <span className="map-nav-level">
              Lv.{Math.min(...selectedGroup.map(r => r.levelMin))}~{Math.max(...selectedGroup.map(r => r.levelMax))}
            </span>
          </div>
          <div className="map-region-list">{selectedGroup.map(renderRegionButton)}</div>
        </>
      );
    }

    if (selectedRegion && selectedRegion.floors) {
      return (
        <>
          <div className="map-dropdown-header">
            <button className="map-back-btn" onClick={() => setSelectedRegion(null)} disabled={isBattling}>← 返回</button>
            <span className="map-nav-title">{selectedRegion.name}</span>
          </div>
          <div className="map-floor-list">
            {selectedRegion.floors.map(f => {
              const isCurrent = char.currentRegion === selectedRegion.id && char.currentFloor === f.floor;
              return (
                <button
                  key={f.floor}
                  className={`map-floor-btn${isCurrent ? ' active' : ''}${f.isBossFloor ? ' boss' : ''}`}
                  onClick={() => handleFloorClick(selectedRegion, f.floor)}
                  disabled={isCurrent || isBattling}
                >
                  {f.floor}F (Lv.{f.levelMin}~{f.levelMax})
                  {f.isBossFloor && f.bossName && <span className="boss-tag"> Boss</span>}
                </button>
              );
            })}
          </div>
        </>
      );
    }

    if (selectedZone) {
      return (
        <>
          <div className="map-dropdown-header">
            <button className="map-back-btn" onClick={() => { setSelectedZoneId(null); setSelectedGroupId(null); }} disabled={isBattling}>← 返回</button>
            <span className="map-nav-title">{selectedZone.name}</span>
            <span className="map-nav-level">Lv.{selectedZone.levelMin}~{selectedZone.levelMax}</span>
          </div>
          <div className="map-region-list">
            {groupedRegions.map(entry => {
              if ('members' in entry) {
                const current = entry.members.some(m => char.currentRegion === m.id);
                return (
                  <button
                    key={entry.group.id}
                    className={`map-region-btn type-dungeon${current ? ' active' : ''}`}
                    onClick={() => setSelectedGroupId(entry.group.id)}
                    disabled={isBattling}
                  >
                    <span className="region-name">{entry.group.name}</span>
                    <span className="region-meta">
                      [副本] Lv.{Math.min(...entry.members.map(m => m.levelMin))}~{Math.max(...entry.members.map(m => m.levelMax))}
                    </span>
                    <span className="region-floors">{entry.members.length} 區段</span>
                  </button>
                );
              }
              return renderRegionButton(entry);
            })}
          </div>
        </>
      );
    }

    return (
      <div className="map-zone-list">
        {ZONES.map(zone => {
          const isCurrent = char.currentZone === zone.id;
          return (
            <button
              key={zone.id}
              className={`map-zone-btn${isCurrent ? ' active' : ''}`}
              onClick={() => setSelectedZoneId(zone.id)}
              disabled={isBattling}
            >
              <span className="zone-name">{zone.name}</span>
              <span className="zone-level">Lv.{zone.levelMin}~{zone.levelMax}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const locationLabel = currentRegion?.name ?? char.currentRegion;
  const floorLabel = char.currentFloor != null ? ` ${char.currentFloor}F` : '';

  return (
    <div className="map-selector" ref={dropdownRef}>
      <button
        className={`map-selector-trigger${open ? ' open' : ''}`}
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setSelectedZoneId(null);
            setSelectedRegion(null);
          }
        }}
      >
        <span className="map-selector-label">目前: {locationLabel}{floorLabel}</span>
        <span className="map-selector-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="map-selector-dropdown">
          {renderDropdownContent()}
        </div>
      )}
    </div>
  );
}

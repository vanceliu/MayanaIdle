import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { ZONES, getRegionsByZone, getRegion } from '../models/mapData';
import type { Region } from '../models/area';

export function MapNavigation() {
  const char = useGameStore(s => s.character);
  const phase = useGameStore(s => s.phase);
  const navigateTo = useGameStore(s => s.navigateTo);
  const bagItems = useGameStore(s => s.bagItems);
  const [open, setOpen] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
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

  function handleRegionClick(region: Region) {
    if (region.type === 'dungeon' && region.floors && region.floors.length > 1) {
      setSelectedRegion(region);
    } else {
      const floor = region.type === 'dungeon' && region.floors ? region.floors[0].floor : null;
      navigateTo({ zoneId: region.zoneId, regionId: region.id, floor });
      setSelectedZoneId(null);
      setSelectedRegion(null);
      setOpen(false);
    }
  }

  function handleFloorClick(regionObj: Region, floor: number) {
    navigateTo({ zoneId: regionObj.zoneId, regionId: regionObj.id, floor });
    setSelectedZoneId(null);
    setSelectedRegion(null);
    setOpen(false);
  }

  function renderDropdownContent() {
    if (!char) return null;
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
            <button className="map-back-btn" onClick={() => setSelectedZoneId(null)} disabled={isBattling}>← 返回</button>
            <span className="map-nav-title">{selectedZone.name}</span>
            <span className="map-nav-level">Lv.{selectedZone.levelMin}~{selectedZone.levelMax}</span>
          </div>
          <div className="map-region-list">
            {regions.map(r => {
              const isCurrent = char.currentRegion === r.id;
              const typeLabel = r.type === 'dungeon' ? '副本' : r.type === 'town' ? '城鎮' : '野外';
              const needsScroll = !!r.entryScrollName;
              const hasScroll = !needsScroll || bagItems.some(b => b.name === r.entryScrollName && b.amount > 0);
              const isLocked = needsScroll && !hasScroll;
              return (
                <button
                  key={r.id}
                  className={`map-region-btn${isCurrent ? ' active' : ''} type-${r.type}${isLocked ? ' locked' : ''}`}
                  onClick={() => handleRegionClick(r)}
                  disabled={isBattling || isLocked || (isCurrent && r.type !== 'dungeon')}
                  title={isLocked ? `需要「${r.entryScrollName}」` : undefined}
                >
                  <span className="region-name">{isLocked ? '🔒 ' : ''}{r.name}</span>
                  <span className="region-meta">
                    [{typeLabel}] Lv.{r.levelMin}~{r.levelMax}
                  </span>
                  {r.type === 'dungeon' && r.floors && (
                    <span className="region-floors">{r.floors.length} 層</span>
                  )}
                  {isLocked && (
                    <span className="region-scroll-hint">需要: {r.entryScrollName}</span>
                  )}
                </button>
              );
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

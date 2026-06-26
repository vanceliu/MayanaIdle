import { describe, it, expect } from 'vitest';
import { ZONES, REGIONS, getZone, getRegion, getRegionsByZone, getMonstersAtLocation, getRequiredScrollName, getNearestTown } from '../mapData';

describe('mapData', () => {
  describe('zones', () => {
    it('has 6 zones', () => {
      expect(ZONES).toHaveLength(6);
    });

    it('all zones have valid ids and names', () => {
      for (const zone of ZONES) {
        expect(zone.id).toBeTruthy();
        expect(zone.name).toBeTruthy();
        expect(zone.regions.length).toBeGreaterThan(0);
      }
    });

    it('all zone region references point to existing regions', () => {
      for (const zone of ZONES) {
        for (const regionId of zone.regions) {
          const region = REGIONS.find(r => r.id === regionId);
          expect(region, `region ${regionId} in zone ${zone.id} not found`).toBeDefined();
        }
      }
    });

    it('all zone connectedZones references point to existing zones', () => {
      for (const zone of ZONES) {
        for (const connId of zone.connectedZones) {
          const connected = ZONES.find(z => z.id === connId);
          expect(connected, `zone ${connId} connected from ${zone.id} not found`).toBeDefined();
        }
      }
    });
  });

  describe('regions', () => {
    it('has expected number of regions', () => {
      expect(REGIONS.length).toBeGreaterThanOrEqual(17);
    });

    it('all regions reference valid zones', () => {
      for (const region of REGIONS) {
        const zone = ZONES.find(z => z.id === region.zoneId);
        expect(zone, `zone ${region.zoneId} for region ${region.id} not found`).toBeDefined();
      }
    });

    it('field regions have monsters defined', () => {
      const fields = REGIONS.filter(r => r.type === 'field');
      for (const field of fields) {
        expect(field.monsters, `field ${field.id} has no monsters`).toBeDefined();
        expect(field.monsters!.length).toBeGreaterThan(0);
      }
    });

    it('dungeon regions have floors or monsters defined', () => {
      const dungeons = REGIONS.filter(r => r.type === 'dungeon');
      for (const dungeon of dungeons) {
        const hasFloors = dungeon.floors && dungeon.floors.length > 0;
        const hasMonsters = dungeon.monsters && dungeon.monsters.length > 0;
        expect(hasFloors || hasMonsters, `dungeon ${dungeon.id} has no floors or monsters`).toBe(true);
      }
    });

    it('town regions have no monsters or floors', () => {
      const towns = REGIONS.filter(r => r.type === 'town');
      for (const town of towns) {
        expect(town.monsters).toBeUndefined();
        expect(town.floors).toBeUndefined();
      }
    });
  });

  describe('hundred pillar tower', () => {
    it('has 10 segment regions', () => {
      const segments = [
        'hundred-pillar-1-10f', 'hundred-pillar-11-20f', 'hundred-pillar-21-30f',
        'hundred-pillar-31-40f', 'hundred-pillar-41-50f', 'hundred-pillar-51-60f',
        'hundred-pillar-61-70f', 'hundred-pillar-71-80f', 'hundred-pillar-81-90f',
        'hundred-pillar-91-100f',
      ];
      for (const id of segments) {
        expect(getRegion(id), `${id} not found`).toBeDefined();
      }
    });

    it('each segment has monsters', () => {
      const seg = getRegion('hundred-pillar-1-10f');
      expect(seg!.monsters!.length).toBeGreaterThan(0);
    });

    it('last segment has highest level', () => {
      const seg = getRegion('hundred-pillar-91-100f');
      expect(seg!.levelMin).toBe(60);
    });
  });

  describe('lookup helpers', () => {
    it('getZone returns correct zone', () => {
      const zone = getZone('newbie-neutral');
      expect(zone).toBeDefined();
      expect(zone!.name).toBe('新手中立區');
    });

    it('getRegion returns correct region', () => {
      const region = getRegion('dawn-plains');
      expect(region).toBeDefined();
      expect(region!.name).toBe('曙光草原');
    });

    it('getRegionsByZone returns all regions for a zone', () => {
      const regions = getRegionsByZone('newbie-neutral');
      expect(regions).toHaveLength(6);
      expect(regions.map(r => r.id)).toContain('dawn-plains');
      expect(regions.map(r => r.id)).toContain('green-valley');
      expect(regions.map(r => r.id)).toContain('wind-woods');
      expect(regions.map(r => r.id)).toContain('misty-swamp');
      expect(regions.map(r => r.id)).toContain('trial-highlands');
      expect(regions.map(r => r.id)).toContain('neutral-town');
    });

    it('getMonstersAtLocation returns field monsters', () => {
      const monsters = getMonstersAtLocation('dawn-plains', null);
      expect(monsters).toContain('暴牙兔');
      expect(monsters).toContain('史萊姆');
    });

    it('getMonstersAtLocation returns monsters for ivory tower floors', () => {
      const monsters = getMonstersAtLocation('ivory-tower-1f', null);
      expect(monsters).toContain('冰霜蜘蛛');
      expect(monsters).toContain('象牙巫師');
    });

    it('getMonstersAtLocation returns monsters for dragon valley floors', () => {
      const monsters = getMonstersAtLocation('dragon-valley-3f', null);
      expect(monsters).toContain('大莫蜘蛛');
    });

    it('getRequiredScrollName returns null for non-scroll regions', () => {
      expect(getRequiredScrollName('ivory-tower-1f', 1)).toBeNull();
    });
  });

  describe('getNearestTown', () => {
    it('should return neutral-town for newbie zone regions', () => {
      const town = getNearestTown('dawn-plains');
      expect(town.id).toBe('neutral-town');
    });

    it('should return elsarth-town for elsarth zone regions', () => {
      const town = getNearestTown('demon-forest');
      expect(town.id).toBe('elsarth-town');
    });

    it('should return varden-town for varden zone regions', () => {
      const town = getNearestTown('mirror-forest');
      expect(town.id).toBe('varden-town');
    });

    it('should return neutral-town as fallback for unknown region', () => {
      const town = getNearestTown('nonexistent-region');
      expect(town.id).toBe('neutral-town');
    });

    it('should return the town itself if already in a town', () => {
      const town = getNearestTown('neutral-town');
      expect(town.id).toBe('neutral-town');
    });
  });
});

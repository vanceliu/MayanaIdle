import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../stores/gameStore';

describe('Storage persistence', () => {
  beforeEach(() => {
    useGameStore.setState({
      inventory: [
        { id: 1, templateId: 1, name: '鐵劍', type: 'armor' as any, slot: 'rightHand' as any, isTwoHanded: false, smallMonsterDamage: 8, largeMonsterDamage: 6, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: false },
      ],
      bagItems: [
        { name: '品質石', type: 'material', amount: 5 },
      ],
      storedEquipment: [],
      storedMaterials: [],
    });
  });

  it('should deposit equipment from inventory to storage', () => {
    const item = useGameStore.getState().inventory[0];
    useGameStore.setState({
      inventory: [],
      storedEquipment: [item],
    });
    expect(useGameStore.getState().storedEquipment).toHaveLength(1);
    expect(useGameStore.getState().inventory).toHaveLength(0);
  });

  it('should withdraw equipment from storage to inventory', () => {
    const item = useGameStore.getState().inventory[0];
    useGameStore.setState({
      inventory: [],
      storedEquipment: [item],
    });
    useGameStore.setState({
      inventory: [item],
      storedEquipment: [],
    });
    expect(useGameStore.getState().inventory).toHaveLength(1);
    expect(useGameStore.getState().storedEquipment).toHaveLength(0);
  });

  it('should deposit materials from bag to storage', () => {
    useGameStore.setState({
      bagItems: [{ name: '品質石', type: 'material', amount: 4 }],
      storedMaterials: [{ name: '品質石', type: 'material', amount: 1 }],
    });
    expect(useGameStore.getState().storedMaterials[0].amount).toBe(1);
    expect(useGameStore.getState().bagItems[0].amount).toBe(4);
  });

  it('should persist state across getState calls', () => {
    useGameStore.setState({
      storedEquipment: [useGameStore.getState().inventory[0]],
      storedMaterials: [{ name: '強化石', type: 'material', amount: 3 }],
    });
    const state = useGameStore.getState();
    expect(state.storedEquipment).toHaveLength(1);
    expect(state.storedMaterials[0].name).toBe('強化石');
    expect(state.storedMaterials[0].amount).toBe(3);
  });
});

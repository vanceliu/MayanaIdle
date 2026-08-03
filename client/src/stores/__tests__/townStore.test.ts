import { describe, it, expect, beforeEach } from 'vitest';
import { useTownStore } from '../townStore';

describe('townStore（設施面板的兩個入口，§ 99.6）', () => {
  beforeEach(() => {
    useTownStore.setState({ facility: 'list' });
  });

  it('預設沒有開任何設施', () => {
    expect(useTownStore.getState().facility).toBe('list');
  });

  it('點 NPC（或快捷列）就開對應設施 —— 不看距離，畫面上點得到就算', () => {
    useTownStore.getState().openFacility('general-store');

    expect(useTownStore.getState().facility).toBe('general-store');
  });

  it('可以直接從一個設施切到另一個', () => {
    useTownStore.getState().openFacility('general-store');
    useTownStore.getState().openFacility('inn');

    expect(useTownStore.getState().facility).toBe('inn');
  });

  it('關閉後回到沒開的狀態（點地圖也走這條）', () => {
    useTownStore.getState().openFacility('storage');
    useTownStore.getState().closeFacility();

    expect(useTownStore.getState().facility).toBe('list');
  });
});

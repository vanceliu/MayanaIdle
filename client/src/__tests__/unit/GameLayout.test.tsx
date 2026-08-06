// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GameLayout } from '../../App';
import { useGameStore } from '../../stores/gameStore';

// stage 與浮動視窗的內容與版面無關，換成同 class 的替身，避免測試被 Pixi / DB 拖下水
vi.mock('../../components/BattleView', () => ({
  BattleView: () => <div className="battle-view" />,
}));
vi.mock('../../components/TownView', () => ({
  TownView: () => <div className="town-view" />,
}));
vi.mock('../../components/PanelWindows', () => ({
  PanelWindows: () => null,
}));
vi.mock('../../components/PanelDock', () => ({
  PanelDock: () => <div className="panel-dock" />,
}));
vi.mock('../../components/QuickSlotBar', () => ({
  QuickSlotBar: () => <div className="quick-slot-bar" />,
}));

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({
    phase: 'explore',
    character: {
      name: 'TestHero',
      className: 'knight',
      level: 10,
      exp: 250,
      expToNext: 1000,
      hp: 80,
      maxHp: 100,
      mp: 20,
      maxMp: 30,
      baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold: 1000,
      currentArea: 'dawn-plains',
      currentZone: 'newbie-neutral',
      currentRegion: 'dawn-plains',
      currentFloor: null,
      skills: [],
      unspentAttributePoints: 0,
      quests: [],
      areaEnteredAt: Date.now(),
      createdAt: Date.now(),
      userId: 1,
    },
    equippedGear: {},
    activeEffects: [],
    bagItems: [],
    combatLogs: [],
  });
});

/**
 * 版面（§ 32.3）：遊戲畫面鋪滿整個視窗，所有 HUD 以絕對定位疊在四角。
 * 因此測的是「哪個 HUD 島裝了什麼」，而不是流式排版的先後順序。
 */
describe('GameLayout 版面（§ 32.3）', () => {
  it('stage 是滿版底層；城鎮也走地圖，TownView 只是疊在上面的設施列（§ 13.2.1）', () => {
    const field = render(<GameLayout isInTown={false} />);
    expect(field.container.querySelector('.game-layout > .stage-area > .battle-view')).toBeTruthy();
    expect(field.container.querySelector('.town-view')).toBeNull();

    const town = render(<GameLayout isInTown={true} />);
    expect(town.container.querySelector('.game-layout > .stage-area > .battle-view')).toBeTruthy();
    expect(town.container.querySelector('.game-layout > .town-view')).toBeTruthy();
  });

  it('左上：角色狀態卡 + BuffBar', () => {
    const { container } = render(<GameLayout isInTown={false} />);
    const island = container.querySelector('.hud-topleft')!;

    expect(island.querySelector('.status-panel')).toBeTruthy();
  });

  it('右上：只有地圖選擇器（系統按鈕與版本標示都不在這裡）', () => {
    const { container } = render(<GameLayout isInTown={false} />);
    const island = container.querySelector('.hud-topright')!;

    expect(island.querySelector('.map-selector')).toBeTruthy();
    expect(island.querySelector('.game-toolbar')).toBeNull();
    expect(island.querySelector('.build-label')).toBeNull();
  });

  it('底部中央：探索控制 + 快捷格；右下：面板按鈕 + 系統按鈕（版本號在 Wiki 旁）', () => {
    const { container } = render(<GameLayout isInTown={false} />);

    expect(container.querySelector('.hud-bottomcenter .explore-bar-slot .explore-bar')).toBeTruthy();
    expect(container.querySelector('.hud-bottomcenter .quick-slot-bar')).toBeTruthy();
    expect(container.querySelector('.hud-bottomright .panel-dock')).toBeTruthy();

    const toolbar = container.querySelector('.hud-bottomright .game-toolbar')!;
    expect(toolbar.firstElementChild?.className).toContain('build-label');
    expect(toolbar.querySelector('.btn-wiki')).toBeTruthy();
  });

  it('戰鬥日誌是獨立的可拖曳視窗，城鎮與野外都在', () => {
    for (const isInTown of [false, true]) {
      const { container } = render(<GameLayout isInTown={isInTown} />);
      expect(container.querySelector('.combat-log-window .combat-log.bottom-log'), `isInTown=${isInTown}`).toBeTruthy();
    }
  });

  it('城鎮仍渲染 ExploreBar，只以 is-hidden 保留位置（快捷格不會上下跳）', () => {
    const { container } = render(<GameLayout isInTown={true} />);
    const slot = container.querySelector('.explore-bar-slot')!;

    expect(slot.className).toContain('is-hidden');
    // 不可改成「城鎮不渲染 ExploreBar」：那會讓進出城鎮時快捷格整排位移
    expect(slot.querySelector('.explore-bar')).toBeTruthy();
  });
});

/**
 * 行動版版面（§ 34.8）。
 *
 * 兩條 HUD 帶在桌機是 `display: contents`（容器不存在，四座島各自貼角），
 * 手機才成形。這裡把關的是**結構**：島仍在帶子裡、島內容沒有因為換版面而搬家。
 * 實際的排版由 CSS 的斷點負責，jsdom 不套用外部樣式表，測不到也不該在這裡測。
 */
describe('行動版 HUD 帶（§ 34.8）', () => {
  it('上方帶包住左上與右上兩座島', () => {
    const { container } = render(<GameLayout isInTown={false} />);
    const bar = container.querySelector('.game-layout > .hud-topbar')!;

    expect(bar).toBeTruthy();
    expect(bar.querySelector(':scope > .hud-topleft .status-panel')).toBeTruthy();
    expect(bar.querySelector(':scope > .hud-topright .map-selector')).toBeTruthy();
  });

  it('下方帶包住底部中央與右下兩座島', () => {
    const { container } = render(<GameLayout isInTown={false} />);
    const bar = container.querySelector('.game-layout > .hud-bottombar')!;

    expect(bar).toBeTruthy();
    expect(bar.querySelector(':scope > .hud-bottomcenter .quick-slot-bar')).toBeTruthy();
    expect(bar.querySelector(':scope > .hud-bottomright .panel-dock')).toBeTruthy();
  });

  /**
   * 帶子是為了手機才加的，桌機必須維持「島直接掛在 .game-layout 底下」的語意 ——
   * `useHudBandBottom()` 的量測、`.hud > *` 的 zoom 選擇器都靠這層關係。
   */
  it('四座島仍是 .hud，帶子沒有搶走它們的 class', () => {
    const { container } = render(<GameLayout isInTown={false} />);
    for (const island of ['.hud-topleft', '.hud-topright', '.hud-bottomcenter', '.hud-bottomright']) {
      expect(container.querySelector(`.hud${island}`), island).toBeTruthy();
    }
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TrainingGroundView, TRAINING_VIEW_KEY } from '../TrainingGroundView';
import { positionKey } from '../LogWindow';
import { useGameStore } from '../../stores/gameStore';
import { useTownStore } from '../../stores/townStore';
import { TRAINING_GROUND_REGION_ID } from '../../models/trainingGround';

/**
 * @vitest-environment jsdom
 *
 * 試驗場的按鈕與數據卡（`16-tech-frontend-architecture.md` § 32.3）：
 * 原本是 `position: absolute; top: 172px` 的寫死偏移，buff 一長就被它整片蓋住。
 * 改成住在左上角那一疊裡、跟隊伍 HUD 一樣可拖走。
 */
const KEY = positionKey(TRAINING_VIEW_KEY);

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({
    character: { id: 1, name: '我', currentRegion: TRAINING_GROUND_REGION_ID, currentArea: TRAINING_GROUND_REGION_ID, mp: 10 },
  } as never);
  useTownStore.setState({ facility: 'list' } as never);
});

describe('試驗場 HUD', () => {
  it('沒拖過就待在流排裡（不是浮動的）', () => {
    const { container } = render(<TrainingGroundView />);
    const view = container.querySelector('.training-view') as HTMLElement;

    expect(view.className).not.toContain('is-floating');
    expect(view.style.left).toBe('');
  });

  it('拖過之後改成固定座標，並且記住位置', () => {
    const { container } = render(<TrainingGroundView />);
    const view = container.querySelector('.training-view') as HTMLElement;

    fireEvent.pointerDown(view, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(view, { clientX: 110, clientY: 210, pointerId: 1 });
    fireEvent.pointerUp(view, { clientX: 110, clientY: 210, pointerId: 1 });

    expect(view.className).toContain('is-floating');
    expect(view.style.left).toBe('100px');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ left: 100, top: 200 });
  });

  it('木樁設定的 modal 掛在 body 上，不會被 HUD 的堆疊脈絡關住', () => {
    useTownStore.setState({ facility: 'training-dummy' } as never);
    const { container } = render(<TrainingGroundView />);

    expect(container.querySelector('.town-modal-overlay')).toBeNull();
    expect(document.body.querySelector('.town-modal-overlay')).toBeTruthy();
  });
});

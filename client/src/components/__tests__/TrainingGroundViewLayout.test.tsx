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

  /** 拖曳會捕捉指標，按鈕與 portal 出去的視窗就收不到 click（`16-tech-frontend-architecture.md` § 32.3） */
  const press = (el: Element) => {
    fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 110, clientY: 210, pointerId: 1 });
    fireEvent.pointerUp(el, { clientX: 110, clientY: 210, pointerId: 1 });
  };

  it('按在數據卡的按鈕上不拖曳', () => {
    const { container, getByTitle } = render(<TrainingGroundView />);

    press(getByTitle('木樁設定'));

    expect(container.querySelector('.training-view')!.className).not.toContain('is-floating');
  });

  it('按在木樁設定視窗裡不拖曳數據卡，關閉鈕照常關閉', () => {
    useTownStore.setState({ facility: 'training-dummy' } as never);
    const { container } = render(<TrainingGroundView />);
    const close = document.body.querySelector('.town-modal-close')!;

    press(close);
    fireEvent.click(close);

    expect(container.querySelector('.training-view')!.className).not.toContain('is-floating');
    expect(useTownStore.getState().facility).toBe('list');
  });
});

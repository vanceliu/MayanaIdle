// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip } from '../../components/Tooltip';

describe('Tooltip', () => {
  it('does not show tooltip initially', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.queryByText('Tooltip text')).toBeNull();
  });

  it('shows tooltip on mouse enter after delay', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Tooltip text" delay={100}>
        <button>Hover me</button>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByText('Hover me'));
    act(() => { vi.advanceTimersByTime(100); });

    expect(screen.getByText('Tooltip text')).toBeTruthy();
    vi.useRealTimers();
  });

  it('hides tooltip on mouse leave', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Tooltip text" delay={100}>
        <button>Hover me</button>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByText('Hover me'));
    act(() => { vi.advanceTimersByTime(100); });
    expect(screen.getByText('Tooltip text')).toBeTruthy();

    fireEvent.mouseLeave(screen.getByText('Hover me'));
    expect(screen.queryByText('Tooltip text')).toBeNull();
    vi.useRealTimers();
  });

  it('does not show tooltip if mouse leaves before delay', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Tooltip text" delay={200}>
        <button>Hover me</button>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByText('Hover me'));
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.mouseLeave(screen.getByText('Hover me'));
    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.queryByText('Tooltip text')).toBeNull();
    vi.useRealTimers();
  });
});

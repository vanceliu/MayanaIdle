/**
 * 星盤試玩頁（`star-chart.html`，`56-star-chart.md`）：沿用遊戲的配點模擬元件（Wiki 星盤頁同一個）。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StarChartPlanner } from '../src/components/StarChartPlanner';

createRoot(document.getElementById('root')!).render(<StrictMode><StarChartPlanner /></StrictMode>);

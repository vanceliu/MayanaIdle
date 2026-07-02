import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import './WikiLayout.css';

const NAV_ITEMS = [
  { path: '/wiki', label: '首頁', end: true },
  { path: '/wiki/weapons', label: '武器' },
  { path: '/wiki/armor', label: '防具' },
  { path: '/wiki/monsters', label: '怪物' },
  { path: '/wiki/maps', label: '地圖' },
  { path: '/wiki/items', label: '道具' },
  { path: '/wiki/skills', label: '技能' },
  { path: '/wiki/crafting', label: '鐵匠鋪' },
  { path: '/wiki/exp-table', label: '經驗表' },
  { path: '/wiki/attributes', label: '屬性公式' },
  { path: '/wiki/combat', label: '戰鬥計算' },
  { path: '/wiki/quests', label: '任務系統' },
];

export function WikiLayout() {
  const navigate = useNavigate();

  return (
    <div className="wiki-layout">
      <header className="wiki-header">
        <h1 className="wiki-title" onClick={() => navigate('/wiki')}>
          MayanaIdle Wiki
        </h1>
      </header>
      <div className="wiki-body">
        <nav className="wiki-sidebar">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `wiki-nav-link ${isActive ? 'active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="wiki-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

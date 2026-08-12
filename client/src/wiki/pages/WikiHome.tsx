import { useNavigate } from 'react-router-dom';
import './WikiHome.css';

const CATEGORIES = [
  { path: '/wiki/weapons', label: '武器', desc: '所有武器模板、材質、安定值、強化資訊' },
  { path: '/wiki/armor', label: '防具', desc: '防具列表、部位、安定值、強化資訊' },
  { path: '/wiki/affixes', label: '詞綴', desc: '各部位可帶的詞綴、階級數值、掉落權重' },
  { path: '/wiki/monsters', label: '怪物', desc: '怪物資料、屬性、等級、出沒區域、掉落物' },
  { path: '/wiki/maps', label: '地圖', desc: '區域結構、等級對應、怪物分佈' },
  { path: '/wiki/items', label: '道具', desc: '材料、藥水、卷軸、取得方式' },
  { path: '/wiki/skills', label: '技能', desc: '職業技能列表、學習限制' },
  { path: '/wiki/crafting', label: '鐵匠鋪', desc: '製作配方、材料需求與來源' },
  { path: '/wiki/exp-table', label: '經驗表', desc: 'Lv.1~100 升級所需經驗' },
  { path: '/wiki/attributes', label: '屬性公式', desc: 'STR/AGI/VIT/SPI/INT/CHA 效果' },
  { path: '/wiki/combat', label: '戰鬥計算', desc: '攻擊力、技能、命中、防禦公式' },
  { path: '/wiki/quests', label: '任務', desc: '冒險者工會、職業工會任務、貢獻等階' },
  { path: '/wiki/talents', label: '自動天賦', desc: '天賦格與鑲材、三種天賦的條件與實作、掉落與合成' },
  { path: '/wiki/credits', label: '素材來源', desc: '第三方素材的作者、授權與來源網址' },
];

export function WikiHome() {
  const navigate = useNavigate();

  return (
    <div className="wiki-home">
      <h2 className="wiki-home-title">瑪雅那 Wiki</h2>
      <p className="wiki-home-desc">遊戲資料查詢，點擊分類開始瀏覽。</p>
      <div className="wiki-home-grid">
        {CATEGORIES.map(cat => (
          <div
            key={cat.path}
            className="wiki-category-card"
            onClick={() => navigate(cat.path)}
          >
            <h3 className="wiki-category-label">{cat.label}</h3>
            <p className="wiki-category-desc">{cat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

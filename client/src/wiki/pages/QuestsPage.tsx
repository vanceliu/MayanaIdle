import '../components/WikiTable.css';

export function QuestsPage() {
  return (
    <div>
      <h2 className="wiki-page-title">任務系統</h2>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          冒險者工會
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            冒險者工會提供可重複接取的隨機任務，獎勵為金幣、藥水、強化材料等實用物品。<br />
            四個城鎮皆設有冒險者工會分部，各分部僅顯示與該城鎮相關區域的任務。<br />
            BOSS 任務獨立於 B+ / A+ / S+ 分頁，不與一般任務混在同一頁；
            該城鎮沒有對應難度的 BOSS 時該分頁不顯示。<br />
            每個難度等級顯示 5~8 個隨機任務，最多同時接取 3 個。<br />
            任務列表每次登入時重新生成，已接取任務可隨時免費退出（扣除等量貢獻點數）。<br />
            也可花 50 貢獻按「重整」手動刷新目前分頁，貢獻不足 50 時無法使用。
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          城鎮分部
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>城鎮</th><th>可用難度</th><th>區域範圍</th></tr>
            </thead>
            <tbody>
              <tr><td>薄暮村</td><td>D / C / B / B+ / A / A+</td><td>曙光草原 ~ 象牙塔 5F</td></tr>
              <tr><td>艾爾薩斯</td><td>A / S / S+</td><td>妖魔森林三段、遠古戰場、朦朧洞窟、遠古地監</td></tr>
              <tr><td>瓦爾登</td><td>A / S / S+</td><td>明鏡森林三段、遠古戰場、水下監獄、遠古地監</td></tr>
              <tr><td>灰脊</td><td>A / A+ / S / S+</td><td>遠古戰場、龍之谷兩段、龍谷地間、百柱塔、遠古地監</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          任務類型
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>類型</th><th>說明</th><th>目標數量</th><th>出現條件</th></tr>
            </thead>
            <tbody>
              <tr><td>殲滅任務</td><td>在指定區域擊殺怪物（不限種類）</td><td className="cell-number">15~30 隻</td><td>全等級</td></tr>
              <tr><td>素材收集任務</td><td>收集指定怪物的掉落素材（40% 掉率）</td><td className="cell-number">1~5 個</td><td>全等級</td></tr>
              <tr><td>持續戰鬥任務</td><td>在指定區域累計擊殺大量怪物</td><td className="cell-number">50~100 隻</td><td>全等級</td></tr>
              <tr><td>BOSS 殲滅任務</td><td>擊殺指定 BOSS</td><td className="cell-number">1~3 隻</td><td>B+ 級以上</td></tr>
              <tr><td>BOSS 素材收集</td><td>收集指定 BOSS 掉落素材（30% 掉率）</td><td className="cell-number">1~3 個</td><td>B+ 級以上</td></tr>
              <tr><td>多目標殲滅任務</td><td>在同一區域擊殺 2~3 種指定怪物</td><td className="cell-number">總數同殲滅</td><td>全等級</td></tr>
              <tr><td>交付素材任務</td><td>交出指定製作素材，不必打怪</td><td className="cell-number">3~10 個</td><td>全等級</td></tr>
              <tr><td>交付印記任務</td><td>交出精鍊或工藝印記換取報酬</td><td className="cell-number">8~120 個</td><td>全等級</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          交付印記的兌換率
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>分頁</th><th>兌換率</th><th>一張最多換</th><th>交付數量</th><th>報酬</th></tr>
            </thead>
            <tbody>
              <tr><td>D / C</td><td>—</td><td>—</td><td className="cell-number">8~12</td><td>金幣（印記賣價 × 數量 × 5）</td></tr>
              <tr><td>B / A</td><td className="cell-number">8~12 : 1</td><td className="cell-number">4</td><td className="cell-number">8~48</td><td>混沌／刺針／重刻印記</td></tr>
              <tr><td>S</td><td className="cell-number">45~60 : 1</td><td className="cell-number">2</td><td className="cell-number">45~120</td><td>突破印記</td></tr>
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', marginTop: 8 }}>
          兌換率依掉率比訂定：精鍊／工藝印記 5~7%、混沌／刺針／重刻 1%、突破 0.1%。
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          任務類型出現權重
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>適用等級</th><th>殲滅</th><th>素材收集</th><th>持續戰鬥</th><th>多目標</th><th>交付素材</th><th>交付印記</th><th>BOSS殲滅</th><th>BOSS素材</th></tr>
            </thead>
            <tbody>
              <tr><td>D / C / B / A / S 級</td><td className="cell-number">30</td><td className="cell-number">25</td><td className="cell-number">20</td><td className="cell-number">15</td><td className="cell-number">5</td><td className="cell-number">5</td><td className="cell-number">—</td><td className="cell-number">—</td></tr>
              <tr><td>B+ / A+ / S+ 級</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">50</td><td className="cell-number">50</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          難度等級與區域
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>等級</th><th>對應區域</th><th>殲滅數量</th><th>持續戰鬥數量</th><th>BOSS 數量</th></tr>
            </thead>
            <tbody>
              <tr><td>D 級</td><td>曙光草原、翠綠谷地</td><td className="cell-number">15~20</td><td className="cell-number">50~60</td><td className="cell-number">—</td></tr>
              <tr><td>C 級</td><td>風語林地、迷霧沼澤、試煉高地</td><td className="cell-number">15~20</td><td className="cell-number">55~70</td><td className="cell-number">—</td></tr>
              <tr><td>B 級 / B+ 級</td><td>試煉高地頂部、雪原、象牙塔 1F／2F／3F</td><td className="cell-number">20~25</td><td className="cell-number">60~80</td><td className="cell-number">1~3</td></tr>
              <tr><td>A 級 / A+ 級</td><td>妖魔森林三段、明鏡森林三段、龍之谷兩段、遠古戰場、象牙塔 4F／5F、朦朧洞窟／水下監獄／龍谷地間各樓層、百柱塔 1-30F、遠古地監 1F～6F</td><td className="cell-number">20~30</td><td className="cell-number">70~90</td><td className="cell-number">1~3</td></tr>
              <tr><td>S 級 / S+ 級</td><td>百柱塔 31-100F、遠古地監 7F／8F／9F</td><td className="cell-number">25~30</td><td className="cell-number">80~100</td><td className="cell-number">1~3</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          BOSS 對應表
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>等級</th><th>BOSS 名稱</th><th>區域</th></tr>
            </thead>
            <tbody>
              <tr><td>B+ 級</td><td>試煉飛龍 (Lv.30)</td><td>試煉高地頂部</td></tr>
              <tr><td>B+ 級</td><td>雪地之主 (Lv.35)</td><td>雪原地帶深處</td></tr>
              <tr><td>A+ 級</td><td>象牙塔惡魔 (Lv.45)</td><td>象牙塔 5F</td></tr>
              <tr><td>A+ 級</td><td>安塔巨龍 (Lv.50)</td><td>龍谷地間 7F</td></tr>
              <tr><td>A+ 級</td><td>毒之皇女 (Lv.52)</td><td>百柱塔 1-10F</td></tr>
              <tr><td>A+ 級</td><td>哥布林之王 (Lv.52)</td><td>百柱塔 11-20F</td></tr>
              <tr><td>A+ 級</td><td>暗影吸血鬼 (Lv.52)</td><td>百柱塔 21-30F</td></tr>
              <tr><td>S+ 級</td><td>朦朧蛇魔 (Lv.50)</td><td>朦朧洞窟 3F</td></tr>
              <tr><td>S+ 級</td><td>深海獄王 (Lv.50)</td><td>水下監獄 4F</td></tr>
              <tr><td>S+ 級</td><td>不死殭屍王 (Lv.57)</td><td>百柱塔 31-40F</td></tr>
              <tr><td>S+ 級</td><td>龍王約特勒 (Lv.57)</td><td>百柱塔 41-50F</td></tr>
              <tr><td>S+ 級</td><td>冥王哈馬斯 (Lv.57)</td><td>百柱塔 51-60F</td></tr>
              <tr><td>S+ 級</td><td>霜凍伊莉絲 (Lv.60)</td><td>百柱塔 61-70F</td></tr>
              <tr><td>S+ 級</td><td>熔岩伊弗利特 (Lv.60)</td><td>百柱塔 71-80F</td></tr>
              <tr><td>S+ 級</td><td>守護者之主 (Lv.60)</td><td>百柱塔 81-90F</td></tr>
              <tr><td>S+ 級</td><td>百柱死神 (Lv.60)</td><td>百柱塔 91-100F</td></tr>
              <tr><td>S+ 級</td><td>遠古騎士 (Lv.60)</td><td>遠古地監 9F</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          獎勵公式
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            一般任務基準值 = 區域平均金幣 × 殺怪數量<br />
            收集任務基準值 = 區域平均金幣 × 素材個數 ÷ 掉率<br />
            交付素材基準值 = 素材售價 × 個數 × 3<br />
            一般任務獎勵 = 基準值 × 2<br />
            BOSS任務基準值 = BOSS金幣掉落 × 數量 × 3（收集型再 ÷ 掉率）<br />
            BOSS任務獎勵 = 基準值 × 2<br />
            交付印記任務的獎勵由分頁固定，不走上列公式
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          獎勵類型與換算
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>獎勵</th><th>計算方式</th></tr>
            </thead>
            <tbody>
              <tr><td>金幣</td><td>基準值 ×2</td></tr>
              <tr><td>藥水（紅/橙/白/綠/強化綠隨機）</td><td>基準值 ÷ 藥水單價（最少 1 個）</td></tr>
              <tr><td>工藝印記</td><td>基準值 ÷ 100（個）</td></tr>
              <tr><td>精鍊印記</td><td>基準值 ÷ 100（個）</td></tr>
              <tr><td>武器強化卷軸</td><td>1 張</td></tr>
              <tr><td>防具強化卷軸</td><td>1 張</td></tr>
              <tr><td>製作素材（B／B+ 級以上）</td><td>基準值 ÷ (素材售價 × 3)（最少 1 個）</td></tr>
              <tr><td>詞綴印記（混沌/刺針/重刻隨機）</td><td>基準值 ÷ 1,000（最少 1 個）</td></tr>
              <tr><td>突破印記</td><td>1 個</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          等階獎勵池解鎖
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>等階</th><th>可出現的獎勵</th></tr>
            </thead>
            <tbody>
              <tr><td>F ~ D</td><td>金幣、藥水、工藝印記、精鍊印記</td></tr>
              <tr><td>C</td><td>同上（工藝印記/精鍊印記權重提升）</td></tr>
              <tr><td>B</td><td>+ 防具強化卷軸、製作素材（銀礦石、銀精華）、詞綴印記</td></tr>
              <tr><td>A</td><td>+ 武器強化卷軸、製作素材升級（米索利碎片、米索利礦石）</td></tr>
              <tr><td>S ~ SS</td><td>卷軸權重提高、製作素材升級（龍骨、奧里哈魯根）、+ 突破印記</td></tr>
              <tr><td>US</td><td>與 S ~ SS 相同（等階只影響獎勵種類權重，不給數量倍率）</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          獎勵出現權重
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>等階</th><th>金幣</th><th>藥水</th><th>工藝印記</th><th>精鍊印記</th><th>防具卷軸</th><th>武器卷軸</th><th>製作素材</th><th>詞綴印記</th><th>突破印記</th></tr>
            </thead>
            <tbody>
              <tr><td>F ~ D</td><td className="cell-number">40</td><td className="cell-number">30</td><td className="cell-number">15</td><td className="cell-number">15</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td></tr>
              <tr><td>C</td><td className="cell-number">35</td><td className="cell-number">25</td><td className="cell-number">20</td><td className="cell-number">20</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td></tr>
              <tr><td>B</td><td className="cell-number">25</td><td className="cell-number">20</td><td className="cell-number">15</td><td className="cell-number">15</td><td className="cell-number">15</td><td className="cell-number">—</td><td className="cell-number">10</td><td className="cell-number">10</td><td className="cell-number">—</td></tr>
              <tr><td>A</td><td className="cell-number">20</td><td className="cell-number">15</td><td className="cell-number">15</td><td className="cell-number">15</td><td className="cell-number">13</td><td className="cell-number">10</td><td className="cell-number">12</td><td className="cell-number">10</td><td className="cell-number">—</td></tr>
              <tr><td>S ~ US</td><td className="cell-number">17</td><td className="cell-number">13</td><td className="cell-number">13</td><td className="cell-number">13</td><td className="cell-number">15</td><td className="cell-number">15</td><td className="cell-number">14</td><td className="cell-number">10</td><td className="cell-number">5</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          貢獻度系統
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            等階：F → E → D → C → B → A → S → SS → US（共 9 階）<br />
            公式：最終貢獻 = 基底貢獻 + floor(區域平均金幣 / 10)<br />
            完成任務獲得貢獻點數，累積到門檻自動升階。<br />
            退出任務扣除等量貢獻點數，可能降階。<br />
            大部分玩家會卡在 A 階，S/SS/US 為長期目標。等階只影響獎勵種類的權重，不影響數量。
          </p>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          貢獻點數
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>難度</th><th>殲滅</th><th>素材收集</th><th>持續戰鬥</th><th>多目標</th><th>交付素材</th><th>交付印記</th><th>BOSS殲滅</th><th>BOSS素材</th></tr>
            </thead>
            <tbody>
              <tr><td>D 級</td><td className="cell-number">10</td><td className="cell-number">20</td><td className="cell-number">30</td><td className="cell-number">12</td><td className="cell-number">20</td><td className="cell-number">20</td><td className="cell-number">—</td><td className="cell-number">—</td></tr>
              <tr><td>C 級</td><td className="cell-number">15</td><td className="cell-number">30</td><td className="cell-number">45</td><td className="cell-number">18</td><td className="cell-number">30</td><td className="cell-number">30</td><td className="cell-number">—</td><td className="cell-number">—</td></tr>
              <tr><td>B 級</td><td className="cell-number">30</td><td className="cell-number">45</td><td className="cell-number">60</td><td className="cell-number">36</td><td className="cell-number">45</td><td className="cell-number">45</td><td className="cell-number">—</td><td className="cell-number">—</td></tr>
              <tr><td>B+ 級</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">80</td><td className="cell-number">100</td></tr>
              <tr><td>A 級</td><td className="cell-number">80</td><td className="cell-number">100</td><td className="cell-number">120</td><td className="cell-number">96</td><td className="cell-number">100</td><td className="cell-number">100</td><td className="cell-number">—</td><td className="cell-number">—</td></tr>
              <tr><td>A+ 級</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">150</td><td className="cell-number">200</td></tr>
              <tr><td>S 級</td><td className="cell-number">150</td><td className="cell-number">160</td><td className="cell-number">180</td><td className="cell-number">180</td><td className="cell-number">160</td><td className="cell-number">160</td><td className="cell-number">—</td><td className="cell-number">—</td></tr>
              <tr><td>S+ 級</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">—</td><td className="cell-number">200</td><td className="cell-number">250</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          升階門檻
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>升級</th><th>累計貢獻</th><th>大約需要</th></tr>
            </thead>
            <tbody>
              <tr><td>F → E</td><td className="cell-number">200</td><td>D 級殲滅 ×15</td></tr>
              <tr><td>E → D</td><td className="cell-number">600</td><td>C 級殲滅 ×29</td></tr>
              <tr><td>D → C</td><td className="cell-number">1,800</td><td>B 級殲滅 ×44</td></tr>
              <tr><td>C → B</td><td className="cell-number">5,000</td><td>A 級殲滅 ×52</td></tr>
              <tr><td>B → A</td><td className="cell-number">15,000</td><td>A 級殲滅 ×156</td></tr>
              <tr><td>A → S</td><td className="cell-number">100,000</td><td>S 級殲滅 ×565</td></tr>
              <tr><td>S → SS</td><td className="cell-number">500,000</td><td>S 級殲滅 ×2,825</td></tr>
              <tr><td>SS → US</td><td className="cell-number">10,000,000</td><td>S 級殲滅 ×56,497</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          職業工會任務
        </h3>
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
          <p style={{ color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', lineHeight: 2 }}>
            職業工會提供職業技能書相關任務。與冒險者工會獨立計算，不共用接取上限。
          </p>
        </div>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>任務</th><th>解鎖等級</th><th>目標</th><th>獎勵</th></tr>
            </thead>
            <tbody>
              <tr><td>實戰訓練</td><td className="cell-number">Lv.10</td><td>前往指定區域擊殺 20 隻怪物</td><td>1 級職業技能書</td></tr>
              <tr><td>稀有材料</td><td className="cell-number">Lv.20</td><td>擊殺指定怪物收集 2 個素材（10% 掉率）</td><td>2 級職業技能書</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-display)', marginBottom: 12 }}>
          各職業技能書獎勵
        </h3>
        <div className="wiki-table-wrap">
          <table className="wiki-table">
            <thead>
              <tr><th>職業</th><th>1 級技能書</th><th>2 級技能書</th></tr>
            </thead>
            <tbody>
              <tr><td>騎士</td><td>盾擊技能書</td><td>裂傷斬技能書</td></tr>
              <tr><td>妖精</td><td>精準射擊技能書</td><td>火矢附魔技能書</td></tr>
              <tr><td>元素師</td><td>冷卻縮減技能書</td><td>魔力奪取技能書</td></tr>
              <tr><td>牧師</td><td>聖光護盾技能書</td><td>高階治癒技能書</td></tr>
              <tr><td>盜賊</td><td>淬毒技能書</td><td>致命一擊技能書</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

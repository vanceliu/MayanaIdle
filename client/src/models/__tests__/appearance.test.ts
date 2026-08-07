import { describe, it, expect } from 'vitest';
import {
  HAIR_STYLES,
  HAIR_TUNABLES,
  LASH_TUNABLES,
  SKIN_TONES,
  PALETTE,
  PALETTE_ROWS,
  DEFAULT_APPEARANCE,
  DEFAULT_LASH,
  MIN_EYE_CONTRAST,
  MIN_EYE_TONES_PER_SKIN,
  contrastRatio,
  usableEyeTones,
  createDefaultAppearance,
  normalizeAppearance,
  randomAppearance,
  isHairStyleId,
} from '../appearance';

describe('髮型清單', () => {
  it('13 種，id 不重複（04-character.md § 4.10）', () => {
    expect(HAIR_STYLES).toHaveLength(13);
    expect(new Set(HAIR_STYLES.map((h) => h.id)).size).toBe(13);
  });

  it('預設髮型在清單內', () => {
    expect(isHairStyleId(DEFAULT_APPEARANCE.hair)).toBe(true);
  });
});

/**
 * 髮色、眼色、衣色共用同一張調色盤（`04-character.md` § 4.10）——
 * 分成三份的話同一個顏色會有三個略微不同的版本，加一個顏色要改三個地方。
 */
describe('調色盤', () => {
  it('每一列都是同一個長度，UI 才排得成格子', () => {
    const len = PALETTE_ROWS[0].length;
    for (const row of PALETTE_ROWS) expect(row).toHaveLength(len);
  });

  it('攤平後就是 PALETTE，沒有漏掉任何一色', () => {
    expect(PALETTE).toEqual(PALETTE_ROWS.flat());
  });

  it('沒有重複色 —— 同一個顏色出現兩次等於少一個選擇', () => {
    expect(new Set(PALETTE).size).toBe(PALETTE.length);
  });

  it('每一列由深到淺，順序不可以亂 —— 亂了就不成漸層', () => {
    for (const [i, row] of PALETTE_ROWS.entries()) {
      for (let j = 1; j < row.length; j++) {
        const prev = contrastRatio(row[j - 1], '#000000');
        const cur = contrastRatio(row[j], '#000000');
        expect(cur, `第 ${i} 列 ${row[j - 1]} → ${row[j]}`).toBeGreaterThan(prev);
      }
    }
  });

  it('涵蓋夠暗與夠亮的兩端 —— 深膚與淺膚都要有得配', () => {
    const vsBlack = PALETTE.map((c) => contrastRatio(c, '#000000'));
    expect(Math.min(...vsBlack)).toBeLessThan(1.5);
    expect(Math.max(...vsBlack)).toBeGreaterThan(15);
  });

  it('全部是 #rrggbb', () => {
    for (const c of [...SKIN_TONES, ...PALETTE]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('膚色是獨立的一條漸層，不併進調色盤', () => {
    expect(new Set(SKIN_TONES).size).toBe(SKIN_TONES.length);
  });

  it('預設外觀用的顏色都在對應的色票裡', () => {
    for (const c of [DEFAULT_APPEARANCE.hairColor, DEFAULT_APPEARANCE.eyeColor, DEFAULT_APPEARANCE.cloth]) {
      expect(PALETTE).toContain(c);
    }
    expect(SKIN_TONES as readonly string[]).toContain(DEFAULT_APPEARANCE.skin);
  });
});

describe('眼睛可見度（§ 4.10 硬性要求）', () => {
  it.each(SKIN_TONES)('膚色 %s 至少有 8 個對比足夠的顏色可當眼色', (skin) => {
    expect(usableEyeTones(skin).length).toBeGreaterThanOrEqual(MIN_EYE_TONES_PER_SKIN);
  });

  it('對比計算與順序無關', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(contrastRatio('#000000', '#ffffff'), 10);
  });

  it('黑白對比為 21（WCAG 上限）', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('最深的膚色配最深的眼色會被判定為看不見', () => {
    const darkestSkin = SKIN_TONES[SKIN_TONES.length - 1];
    expect(contrastRatio(PALETTE_ROWS[0][0], darkestSkin)).toBeLessThan(MIN_EYE_CONTRAST);
  });
});

describe('可調項', () => {
  it('髮型 4 項、睫毛 3 項，範圍都是 min < max', () => {
    expect(HAIR_TUNABLES).toHaveLength(4);
    expect(LASH_TUNABLES).toHaveLength(3);
    for (const t of [...HAIR_TUNABLES, ...LASH_TUNABLES]) {
      expect(t.min).toBeLessThan(t.max);
    }
  });

  it('睫毛預設值都落在自己的範圍內', () => {
    for (const t of LASH_TUNABLES) {
      expect(DEFAULT_LASH[t.key]).toBeGreaterThanOrEqual(t.min);
      expect(DEFAULT_LASH[t.key]).toBeLessThanOrEqual(t.max);
    }
  });
});

describe('createDefaultAppearance', () => {
  it('每次都是新物件 —— 兩隻角色不共用同一個 tune', () => {
    const a = createDefaultAppearance();
    const b = createDefaultAppearance();
    a.tune.twin = { front: 30 };
    a.lash.on = 1;
    expect(b.tune).toEqual({});
    expect(b.lash.on).toBe(0);
    expect(DEFAULT_APPEARANCE.tune).toEqual({});
    expect(DEFAULT_APPEARANCE.lash.on).toBe(0);
  });
});

describe('normalizeAppearance', () => {
  it('沒有外觀的舊匯出檔退回預設，不拋錯', () => {
    for (const raw of [undefined, null, {}, 'garbage', 42, []]) {
      expect(() => normalizeAppearance(raw)).not.toThrow();
    }
    expect(normalizeAppearance(undefined)).toEqual(createDefaultAppearance());
    expect(normalizeAppearance(null)).toEqual(createDefaultAppearance());
  });

  it('不認得的髮型退回預設', () => {
    expect(normalizeAppearance({ hair: 'afro' }).hair).toBe(DEFAULT_APPEARANCE.hair);
  });

  it('合法的髮型保留', () => {
    expect(normalizeAppearance({ hair: 'twinlong' }).hair).toBe('twinlong');
  });

  it('顏色只收 #rrggbb，其餘退回預設', () => {
    const bad = normalizeAppearance({
      skin: 'red',
      hairColor: 'url(evil.png)',
      eyeColor: '#12345',
      cloth: 'rgb(1,2,3)',
    });
    expect(bad.skin).toBe(DEFAULT_APPEARANCE.skin);
    expect(bad.hairColor).toBe(DEFAULT_APPEARANCE.hairColor);
    expect(bad.eyeColor).toBe(DEFAULT_APPEARANCE.eyeColor);
    expect(bad.cloth).toBe(DEFAULT_APPEARANCE.cloth);
  });

  it('不在色票內的合法色碼放行 —— 動色票不該洗掉既有角色的顏色', () => {
    expect(normalizeAppearance({ skin: '#123456' }).skin).toBe('#123456');
    expect(normalizeAppearance({ cloth: '#123456' }).cloth).toBe('#123456');
  });

  it('顏色統一成小寫，同一個顏色不會有兩種寫法', () => {
    expect(normalizeAppearance({ skin: '#ABCDEF' }).skin).toBe('#abcdef');
  });

  it('睫毛超出範圍的值夾回範圍內', () => {
    const lash = normalizeAppearance({ lash: { on: 1, len: 999, curl: -999, w: 0 } }).lash;
    expect(lash.len).toBe(34);
    expect(lash.curl).toBe(-12);
    expect(lash.w).toBe(15);
  });

  it('睫毛開關收成 0 / 1', () => {
    expect(normalizeAppearance({ lash: { on: true } }).lash.on).toBe(1);
    expect(normalizeAppearance({ lash: { on: 0 } }).lash.on).toBe(0);
    expect(normalizeAppearance({ lash: {} }).lash.on).toBe(0);
  });

  it('非數值的可調項退回預設而不是變成 NaN', () => {
    const lash = normalizeAppearance({ lash: { on: 1, len: 'x', curl: null, w: NaN } }).lash;
    expect(lash.len).toBe(DEFAULT_LASH.len);
    expect(lash.curl).toBe(DEFAULT_LASH.curl);
    expect(lash.w).toBe(DEFAULT_LASH.w);
  });

  it('小數四捨五入成整數', () => {
    expect(normalizeAppearance({ lash: { on: 1, len: 20.6 } }).lash.len).toBe(21);
  });

  it('tune 丟掉不認得的髮型與不認得的參數', () => {
    const tune = normalizeAppearance({
      tune: { twin: { front: 40, bogus: 5 }, afro: { front: 40 } },
    }).tune;
    expect(tune).toEqual({ twin: { front: 40 } });
  });

  it('tune 的值夾回範圍內', () => {
    const tune = normalizeAppearance({ tune: { twin: { front: 999, mDip: -999 } } }).tune;
    expect(tune.twin).toEqual({ front: 70, mDip: -50 });
  });

  it('沒設過的項目維持沒設過 —— 補成基準值會讓角色不再跟著髮型基準更新', () => {
    const tune = normalizeAppearance({ tune: { twin: { front: 40 } } }).tune;
    expect(Object.keys(tune.twin!)).toEqual(['front']);
  });

  it('整組空的 tune 條目不留下來', () => {
    expect(normalizeAppearance({ tune: { twin: {}, bun: { bogus: 1 } } }).tune).toEqual({});
  });

  it('正常的外觀原樣通過（冪等）', () => {
    const src = {
      hair: 'twin',
      skin: '#7c4f2c',
      hairColor: '#c9a227',
      eyeColor: '#e3c765',
      cloth: '#3d7fb8',
      lash: { on: 1, len: 20, curl: 14, w: 55 },
      tune: { twin: { front: 40, peak: 50 } },
    };
    const once = normalizeAppearance(src);
    expect(once).toEqual(src);
    expect(normalizeAppearance(once)).toEqual(once);
  });

  it('不會把來源物件改掉', () => {
    const src = { hair: 'twin', lash: { on: 1, len: 999 }, tune: { twin: { front: 999 } } };
    normalizeAppearance(src);
    expect(src.lash.len).toBe(999);
    expect(src.tune.twin.front).toBe(999);
  });
});

describe('randomAppearance', () => {
  it('產出的外觀通得過驗證（冪等）', () => {
    for (let i = 0; i < 50; i++) {
      const a = randomAppearance();
      expect(normalizeAppearance(a)).toEqual(a);
    }
  });

  it('眼色一定在該膚色上看得見 —— 不會抽出一張沒有眼睛的臉', () => {
    for (let i = 0; i < 200; i++) {
      const a = randomAppearance();
      expect(contrastRatio(a.eyeColor, a.skin)).toBeGreaterThanOrEqual(MIN_EYE_CONTRAST);
    }
  });

  it('三個顏色都是從共用調色盤抽的', () => {
    for (let i = 0; i < 50; i++) {
      const a = randomAppearance();
      expect(PALETTE).toContain(a.hairColor);
      expect(PALETTE).toContain(a.eyeColor);
      expect(PALETTE).toContain(a.cloth);
    }
  });

  it('rng 可注入 —— 全 0 時取每排的第一項', () => {
    const a = randomAppearance(() => 0);
    expect(a.hair).toBe(HAIR_STYLES[0].id);
    expect(a.skin).toBe(SKIN_TONES[0]);
    expect(a.hairColor).toBe(PALETTE[0]);
    expect(a.eyeColor).toBe(usableEyeTones(SKIN_TONES[0])[0]);
    expect(a.cloth).toBe(PALETTE[0]);
    expect(a.lash.on).toBe(1);
  });

  it('rng 接近 1 時取每排的最後一項，不會越界', () => {
    const a = randomAppearance(() => 0.999999);
    expect(a.hair).toBe(HAIR_STYLES[HAIR_STYLES.length - 1].id);
    expect(a.skin).toBe(SKIN_TONES[SKIN_TONES.length - 1]);
    expect(a.lash.on).toBe(0);
  });
});

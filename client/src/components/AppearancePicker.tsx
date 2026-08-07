import { useEffect, useRef, useState } from 'react';
import {
  HAIR_STYLES,
  HAIR_TUNABLES,
  LASH_TUNABLES,
  SKIN_TONES,
  PALETTE_ROWS,
  DEFAULT_LASH,
  MIN_EYE_CONTRAST,
  contrastRatio,
  createDefaultAppearance,
  randomAppearance,
  type Appearance,
  type HairStyleId,
} from '../models/appearance';
import {
  drawPawn,
  resolveCapCfg,
  PAWN_GEOM,
  PAWN_DIRECTIONS,
  type PawnContext,
  type PawnDirectionId,
} from '../pixi/entities/pawn';

const PREVIEW_H = 240;
const PREVIEW_ZOOM = 4.2;

/**
 * 髮色、眼色、衣色共用同一個調色盤，所以改成「先選要改哪個，再點顏色」——
 * 三個顏色各鋪一張完整色表的話，光顏色就佔掉整個畫面。
 */
const COLOR_TARGETS = [
  { key: 'hairColor', label: '髮色' },
  { key: 'eyeColor', label: '眼色' },
  { key: 'cloth', label: '衣色（內衣）' },
] as const;

type ColorTarget = (typeof COLOR_TARGETS)[number]['key'];

/**
 * 控制項分頁。全部攤開的話（髮型格 + 4 根滑桿 + 睫毛 4 項 + 膚色 + 整張調色盤）
 * 光外觀就比左邊的名稱、職業、屬性加起來還高，而且左欄下半是空的。
 * 一次只顯示一組，整頁高度就被最高的那一組壓住。
 */
const SECTIONS = [
  { key: 'hair', label: '髮型' },
  { key: 'lash', label: '睫毛' },
  { key: 'color', label: '顏色' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  value: Appearance;
  onChange: (next: Appearance) => void;
  disabled?: boolean;
}

/**
 * 創角的外觀區塊（`04-character.md` § 4.10）。
 *
 * 髮型清單、可調範圍、色票、隨機規則全部來自 `models/appearance.ts`，
 * 形狀來自 `pixi/entities/pawn/` —— 這個元件只做互動，不自己定義任何規格。
 */
export function AppearancePicker({ value, onChange, disabled }: Props) {
  const [dirId, setDirId] = useState<PawnDirectionId>('front');
  const [target, setTarget] = useState<ColorTarget>('hairColor');
  const [section, setSection] = useState<SectionKey>('hair');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 240;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(PREVIEW_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, PREVIEW_H);

    ctx.save();
    ctx.translate(w / 2, PREVIEW_H * 0.86);
    ctx.scale(PREVIEW_ZOOM, PREVIEW_ZOOM);
    drawPawn(
      ctx as unknown as PawnContext,
      0, 0,
      PAWN_DIRECTIONS.find((d) => d.id === dirId)!,
      {
        hair: value.hair,
        skin: value.skin,
        hairColor: value.hairColor,
        eyeColor: value.eyeColor,
        lash: value.lash,
        cloth: value.cloth,
        cap: resolveCapCfg(value.hair, value.tune[value.hair]),
      },
      PAWN_GEOM,
    );
    ctx.restore();
  }, [value, dirId]);

  const patch = (next: Partial<Appearance>) => onChange({ ...value, ...next });

  const setHairTune = (key: string, n: number) =>
    patch({
      tune: {
        ...value.tune,
        [value.hair]: { ...value.tune[value.hair], [key]: n },
      },
    });

  const cap = resolveCapCfg(value.hair, value.tune[value.hair]);
  const contrast = contrastRatio(value.eyeColor, value.skin);
  const eyeTooDim = contrast < MIN_EYE_CONTRAST;

  return (
    <div className="appearance-picker">
      <div className="appearance-preview">
        <canvas ref={canvasRef} height={PREVIEW_H} />
        <div className="appearance-dirs">
          {PAWN_DIRECTIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={d.id === dirId ? 'active' : ''}
              onClick={() => setDirId(d.id)}
              disabled={disabled}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-form">
        <div className="appearance-tabs">
          {SECTIONS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={t.key === section ? 'active' : ''}
              onClick={() => setSection(t.key)}
              disabled={disabled}
            >
              {t.label}
            </button>
          ))}
        </div>

        {section === 'hair' && <>
        <div className="form-group">
          <div className="hair-grid">
            {HAIR_STYLES.map((h) => (
              <button
                key={h.id}
                type="button"
                className={h.id === value.hair ? 'active' : ''}
                onClick={() => patch({ hair: h.id as HairStyleId })}
                disabled={disabled}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>微調（這個髮型專屬）</label>
          {HAIR_TUNABLES.map((t) => (
            <div className="slider-row" key={t.key}>
              <span>{t.label}</span>
              <input
                type="range"
                min={t.min}
                max={t.max}
                step={1}
                value={cap[t.key]}
                onChange={(e) => setHairTune(t.key, Number(e.target.value))}
                disabled={disabled}
              />
              <em>{cap[t.key]}</em>
            </div>
          ))}
        </div>
        </>}

        {section === 'lash' && <>
        <div className="form-group">
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!value.lash.on}
              onChange={(e) => patch({ lash: { ...value.lash, on: e.target.checked ? 1 : 0 } })}
              disabled={disabled}
            />
            顯示睫毛（與髮型無關，任何髮型都能配）
          </label>
          {/* 沒有睫毛時那幾根滑桿調什麼都不會有反應，留著只會讓人以為壞了 */}
          {!!value.lash.on && LASH_TUNABLES.map((t) => (
            <div className="slider-row" key={t.key}>
              <span>{t.label}</span>
              <input
                type="range"
                min={t.min}
                max={t.max}
                step={1}
                value={value.lash[t.key]}
                onChange={(e) => patch({ lash: { ...value.lash, [t.key]: Number(e.target.value) } })}
                disabled={disabled}
              />
              <em>{value.lash[t.key]}</em>
            </div>
          ))}
        </div>
        </>}

        {section === 'color' && <>
        <SwatchRow
          label="膚色" tones={SKIN_TONES} selected={value.skin}
          onPick={(c) => patch({ skin: c })} disabled={disabled}
        />
        <div className="form-group">
          <label>顏色（眼色同時是睫毛的顏色）</label>
          <div className="color-targets">
            {COLOR_TARGETS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={t.key === target ? 'active' : ''}
                onClick={() => setTarget(t.key)}
                disabled={disabled}
              >
                <i style={{ background: value[t.key] }} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="palette">
            {PALETTE_ROWS.map((row, i) => (
              <div className="palette-col" key={i}>
                {row.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    className={c === value[target] ? 'active' : ''}
                    style={{ background: c }}
                    onClick={() => patch({ [target]: c })}
                    disabled={disabled}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 對比在放大的預覽上還看得出來，縮到遊戲內的 1～2 px 就沒了，所以用算的 */}
        <p className={eyeTooDim ? 'appearance-hint warn' : 'appearance-hint'}>
          {eyeTooDim
            ? `這個眼色在目前膚色上幾乎看不見（對比 ${contrast.toFixed(1)}）—— 深膚選亮眼、淺膚選深眼。`
            : `眼色與膚色的對比 ${contrast.toFixed(1)}，縮到遊戲內尺寸仍看得出眼睛。`}
        </p>
        </>}

        <div className="appearance-actions">
          <button type="button" onClick={() => onChange(randomAppearance())} disabled={disabled}>
            隨機
          </button>
          {/* 只還原微調與睫毛形狀，不動已經選好的髮型與顏色 */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => patch({
              tune: { ...value.tune, [value.hair]: {} },
              lash: { ...DEFAULT_LASH, on: value.lash.on },
            })}
          >
            回到預設
          </button>
        </div>
      </div>
    </div>
  );
}

interface SwatchProps {
  label: string;
  tones: readonly string[];
  selected: string;
  onPick: (color: string) => void;
  disabled?: boolean;
}

function SwatchRow({ label, tones, selected, onPick, disabled }: SwatchProps) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="swatch-row">
        {tones.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            className={c === selected ? 'active' : ''}
            style={{ background: c }}
            onClick={() => onPick(c)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

export { createDefaultAppearance };

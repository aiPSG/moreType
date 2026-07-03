import { useState } from "react";
import type { CellShape, Letter, LetterSettings } from "../types";
import { defaultSettings } from "../lib/geometry";

const SHAPES: CellShape[] = ["circle", "square", "diamond", "triangle"];

/**
 * A labelled numeric control: an editable text field (type an exact value,
 * including in-progress decimals like "0.") paired with a range slider for
 * dragging. Local text lets partial entries survive; committed on blur.
 */
function Num(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(props.value);
  return (
    <div className={`field ${props.disabled ? "disabled" : ""}`}>
      <div className="field-label">
        <span>{props.label}</span>
        <input
          className="num"
          type="text"
          inputMode="decimal"
          value={shown}
          disabled={props.disabled}
          onChange={(e) => {
            const str = e.target.value;
            setText(str);
            const v = Number(str);
            if (str.trim() !== "" && !Number.isNaN(v)) props.onChange(v);
          }}
          onBlur={(e) => {
            const v = Number(e.target.value);
            props.onChange(
              e.target.value.trim() === "" || Number.isNaN(v)
                ? props.value
                : clamp(v),
            );
            setText(null);
          }}
        />
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** Section header with a "reset to default" button for its fields. */
function SectionHead({ title, onReset }: { title: string; onReset: () => void }) {
  return (
    <div className="section-head">
      <h3>{title}</h3>
      <button className="reset-btn" title="Reset to defaults" onClick={onReset}>
        reset
      </button>
    </div>
  );
}

export function SettingsPanel({
  letter,
  onChange,
}: {
  letter: Letter;
  onChange: (next: Letter) => void;
}) {
  const s = letter.settings;
  const connectMode = s.connectMode ?? "goo";
  const lockAspect = s.lockCellAspect ?? true;
  const update = (patch: Partial<LetterSettings>) =>
    onChange({ ...letter, settings: { ...s, ...patch } });

  /** Reset a subset of keys to their default values. */
  const reset = (keys: (keyof LetterSettings)[]) => {
    const d = defaultSettings(s.cols, s.rows);
    const patch: Partial<LetterSettings> = {};
    for (const k of keys) (patch as Record<string, unknown>)[k] = d[k];
    update(patch);
  };

  return (
    <div className="settings">
      <section>
        <SectionHead
          title="Grid"
          onReset={() =>
            reset([
              "cols",
              "rows",
              "cellW",
              "cellH",
              "lockCellAspect",
              "gapX",
              "gapY",
              "gridColor",
            ])
          }
        />
        <Num
          label="Columns"
          value={s.cols}
          min={1}
          max={64}
          step={1}
          onChange={(v) => update({ cols: Math.round(v) })}
        />
        <Num
          label="Rows"
          value={s.rows}
          min={1}
          max={36}
          step={1}
          onChange={(v) => update({ rows: Math.round(v) })}
        />
        <Num
          label="Cell width"
          value={s.cellW ?? 1}
          min={0.25}
          max={2.5}
          step={0.05}
          onChange={(v) =>
            update(lockAspect ? { cellW: v, cellH: v } : { cellW: v })
          }
        />
        <Num
          label="Cell height"
          value={s.cellH ?? 1}
          min={0.25}
          max={2.5}
          step={0.05}
          disabled={lockAspect}
          onChange={(v) => update({ cellH: v })}
        />
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={lockAspect}
            onChange={(e) =>
              update(
                e.target.checked
                  ? { lockCellAspect: true, cellH: s.cellW ?? 1 }
                  : { lockCellAspect: false },
              )
            }
          />
          <span>Lock height to width</span>
        </label>
        <Num
          label="Horizontal gap"
          value={s.gapX}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v) => update({ gapX: v })}
        />
        <Num
          label="Vertical gap"
          value={s.gapY}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v) => update({ gapY: v })}
        />
        <label className="field">
          <span className="field-label">Grid color</span>
          <input
            type="color"
            value={s.gridColor}
            onChange={(e) => update({ gridColor: e.target.value })}
          />
        </label>
      </section>

      <section>
        <SectionHead
          title="Cell content"
          onReset={() => reset(["cellShape", "contentScale"])}
        />
        <label className="field">
          <span className="field-label">Shape</span>
          <div className="seg">
            {SHAPES.map((sh) => (
              <button
                key={sh}
                className={s.cellShape === sh ? "active" : ""}
                onClick={() => update({ cellShape: sh })}
              >
                {sh}
              </button>
            ))}
          </div>
        </label>
        <Num
          label="Content size"
          value={s.contentScale}
          min={0.2}
          max={1}
          step={0.05}
          onChange={(v) => update({ contentScale: v })}
        />
      </section>

      <section>
        <SectionHead
          title="Connections"
          onReset={() => reset(["connectMode", "connectionWidth", "goo"])}
        />
        <label className="field">
          <span className="field-label">Connection style</span>
          <div className="seg">
            <button
              className={connectMode === "geometry" ? "active" : ""}
              onClick={() => update({ connectMode: "geometry" })}
              title="Crisp boolean-union geometry that follows the circle packing"
            >
              geometry
            </button>
            <button
              className={connectMode === "goo" ? "active" : ""}
              onClick={() => update({ connectMode: "goo" })}
              title="SVG blur/threshold filter: softer, more organic"
            >
              goo filter
            </button>
          </div>
        </label>
        <Num
          label={connectMode === "geometry" ? "Neck spread" : "Neck width"}
          value={s.connectionWidth}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(v) => update({ connectionWidth: v })}
        />
        <Num
          label={connectMode === "geometry" ? "Fillet curve" : "Goo strength"}
          value={s.goo}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v) => update({ goo: v })}
        />
      </section>

      <section>
        <SectionHead
          title="Appearance"
          onReset={() =>
            reset([
              "fill",
              "fillColor",
              "outline",
              "outlineColor",
              "outlineWidth",
              "bgColor",
            ])
          }
        />
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={s.fill}
            onChange={(e) => update({ fill: e.target.checked })}
          />
          <span>Fill</span>
        </label>
        <label className="field">
          <span className="field-label">Fill color</span>
          <input
            type="color"
            value={s.fillColor}
            onChange={(e) => update({ fillColor: e.target.value })}
          />
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={s.outline}
            onChange={(e) => update({ outline: e.target.checked })}
          />
          <span>Outline</span>
        </label>
        <label className="field">
          <span className="field-label">Outline color</span>
          <input
            type="color"
            value={s.outlineColor}
            onChange={(e) => update({ outlineColor: e.target.value })}
          />
        </label>
        <Num
          label="Outline width"
          value={s.outlineWidth}
          min={0.01}
          max={0.2}
          step={0.01}
          onChange={(v) => update({ outlineWidth: v })}
        />
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={(s.bgColor ?? "transparent") !== "transparent"}
            onChange={(e) =>
              update({ bgColor: e.target.checked ? "#ffffff" : "transparent" })
            }
          />
          <span>Background</span>
        </label>
        {(s.bgColor ?? "transparent") !== "transparent" && (
          <label className="field">
            <span className="field-label">Background color</span>
            <input
              type="color"
              value={s.bgColor}
              onChange={(e) => update({ bgColor: e.target.value })}
            />
          </label>
        )}
      </section>
    </div>
  );
}

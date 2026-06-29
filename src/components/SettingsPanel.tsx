import type { CellShape, Letter, LetterSettings } from "../types";

const SHAPES: CellShape[] = ["circle", "square", "diamond", "triangle"];

export function SettingsPanel({
  letter,
  onChange,
}: {
  letter: Letter;
  onChange: (next: Letter) => void;
}) {
  const s = letter.settings;
  const update = (patch: Partial<LetterSettings>) =>
    onChange({ ...letter, settings: { ...s, ...patch } });

  const Slider = (props: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    fmt?: (v: number) => string;
  }) => (
    <label className="field">
      <span className="field-label">
        {props.label}
        <span className="field-value">
          {props.fmt ? props.fmt(props.value) : props.value}
        </span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );

  return (
    <div className="settings">
      <section>
        <h3>Grid</h3>
        <Slider
          label="Columns"
          value={s.cols}
          min={1}
          max={12}
          step={1}
          onChange={(v) => update({ cols: v })}
        />
        <Slider
          label="Rows"
          value={s.rows}
          min={1}
          max={12}
          step={1}
          onChange={(v) => update({ rows: v })}
        />
        <Slider
          label="Horizontal gap"
          value={s.gapX}
          min={0}
          max={1.5}
          step={0.05}
          fmt={(v) => v.toFixed(2)}
          onChange={(v) => update({ gapX: v })}
        />
        <Slider
          label="Vertical gap"
          value={s.gapY}
          min={0}
          max={1.5}
          step={0.05}
          fmt={(v) => v.toFixed(2)}
          onChange={(v) => update({ gapY: v })}
        />
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={s.showGrid}
            onChange={(e) => update({ showGrid: e.target.checked })}
          />
          <span>Show grid</span>
        </label>
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
        <h3>Cell content</h3>
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
        <Slider
          label="Content size"
          value={s.contentScale}
          min={0.2}
          max={1}
          step={0.05}
          fmt={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => update({ contentScale: v })}
        />
      </section>

      <section>
        <h3>Connections (metaball)</h3>
        <Slider
          label="Neck width"
          value={s.connectionWidth}
          min={0.1}
          max={1}
          step={0.05}
          fmt={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => update({ connectionWidth: v })}
        />
        <Slider
          label="Goo strength"
          value={s.goo}
          min={0}
          max={1.5}
          step={0.05}
          fmt={(v) => v.toFixed(2)}
          onChange={(v) => update({ goo: v })}
        />
      </section>

      <section>
        <h3>Appearance</h3>
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
        <Slider
          label="Outline width"
          value={s.outlineWidth}
          min={0.01}
          max={0.2}
          step={0.01}
          fmt={(v) => v.toFixed(2)}
          onChange={(v) => update({ outlineWidth: v })}
        />
      </section>
    </div>
  );
}

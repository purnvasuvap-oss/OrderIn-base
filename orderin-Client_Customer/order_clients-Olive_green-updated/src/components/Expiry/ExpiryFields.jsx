import { useMemo } from "react";
import "./Expiry.css";
import {
  ALERT_PRESETS,
  DEFAULT_ALERT_BEFORE,
  DEFAULT_DURATION_BUFFER,
  EXPIRY_MODES,
  TIME_UNITS,
  TIME_UNIT_LABELS,
  computeExpiryPlan,
  formatDateTime,
  formatSpan,
  toDateInputValue,
} from "../../utils/expiryRules";

/** Blank form value. Pass the item's saved alert setting as `alertBefore`. */
export const emptyExpiryValue = (alertBefore) => ({
  mode: EXPIRY_MODES.DATE,
  arrivalDate: toDateInputValue(new Date()),
  expiryDate: "",
  duration: { value: "", unit: "months" },
  buffer: { value: "", unit: "days" },
  alertBefore: alertBefore ? { ...alertBefore } : { ...DEFAULT_ALERT_BEFORE },
});

const SpanInput = ({ id, label, span, onChange, min = 0, placeholder }) => (
  <div className="xp-field">
    <label htmlFor={id}>{label}</label>
    <div className="xp-span">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step="any"
        placeholder={placeholder}
        value={span.value}
        onChange={(e) => onChange({ ...span, value: e.target.value })}
      />
      <select aria-label={`${label} unit`} value={span.unit} onChange={(e) => onChange({ ...span, unit: e.target.value })}>
        {TIME_UNITS.map((u) => (
          <option key={u} value={u}>
            {TIME_UNIT_LABELS[u]}
          </option>
        ))}
      </select>
    </div>
  </div>
);

/** "Alert me N <unit> before expiry" with quick chips. Used in Set Alerts. */
export const ExpiryAlertField = ({ id = "xp-item-alert", value, onChange, disabled }) => {
  const span = value || { ...DEFAULT_ALERT_BEFORE };
  return (
    <fieldset className="xp-fields" disabled={disabled}>
      <legend>Expiry alert</legend>
      <SpanInput id={id} label="Alert me before stock expires" placeholder="e.g. 2" span={span} onChange={onChange} />
      <div className="xp-chips" aria-label="Quick alert times">
        {ALERT_PRESETS.map((p) => (
          <button
            key={`${p.value}${p.unit}`}
            type="button"
            className={Number(span.value) === p.value && span.unit === p.unit ? "is-on" : ""}
            onClick={() => onChange({ ...p })}
          >
            {formatSpan(p)}
          </button>
        ))}
      </div>
      <p className="xp-hint">Applies to this item's current stock and every new batch.</p>
    </fieldset>
  );
};

/**
 * Expiry section of the stock form: by printed date or by storage duration,
 * an optional buffer, and when to be alerted.
 */
const ExpiryFields = ({ value, onChange, idPrefix = "xp" }) => {
  const v = value || emptyExpiryValue();
  const set = (patch) => onChange({ ...v, ...patch });
  const plan = useMemo(() => computeExpiryPlan(v), [v]);

  const setMode = (mode) => {
    const patch = { mode };
    // Duration stock (rice, grains) gets a 15-day buffer unless one is set.
    if (mode === EXPIRY_MODES.DURATION && !v.buffer?.value) patch.buffer = { ...DEFAULT_DURATION_BUFFER };
    set(patch);
  };

  return (
    <fieldset className="xp-fields">
      <legend>Expiry &amp; spoil alert</legend>

      <div className="xp-mode" role="radiogroup" aria-label="How is expiry known?">
        <button
          type="button"
          role="radio"
          aria-checked={v.mode === EXPIRY_MODES.DATE}
          className={v.mode === EXPIRY_MODES.DATE ? "is-on" : ""}
          onClick={() => setMode(EXPIRY_MODES.DATE)}
        >
          By expiry date
          <small>Printed date, e.g. milk</small>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={v.mode === EXPIRY_MODES.DURATION}
          className={v.mode === EXPIRY_MODES.DURATION ? "is-on" : ""}
          onClick={() => setMode(EXPIRY_MODES.DURATION)}
        >
          By duration
          <small>Lasts a while, e.g. rice bags</small>
        </button>
      </div>

      <div className="xp-row">
        <div className="xp-field">
          <label htmlFor={`${idPrefix}-arrival`}>Arrival date</label>
          <input
            id={`${idPrefix}-arrival`}
            type="date"
            value={v.arrivalDate}
            onChange={(e) => set({ arrivalDate: e.target.value })}
          />
        </div>
        {v.mode === EXPIRY_MODES.DATE ? (
          <div className="xp-field">
            <label htmlFor={`${idPrefix}-expiry`}>Expiry date</label>
            <input
              id={`${idPrefix}-expiry`}
              type="date"
              min={v.arrivalDate || undefined}
              value={v.expiryDate}
              onChange={(e) => set({ expiryDate: e.target.value })}
            />
          </div>
        ) : (
          <SpanInput
            id={`${idPrefix}-duration`}
            label="Lasts for"
            placeholder="e.g. 6"
            span={v.duration}
            onChange={(duration) => set({ duration })}
          />
        )}
      </div>

      <div className="xp-row">
        <SpanInput
          id={`${idPrefix}-buffer`}
          label="Buffer (use before expiry by)"
          placeholder="0"
          span={v.buffer}
          onChange={(buffer) => set({ buffer })}
        />
        <SpanInput
          id={`${idPrefix}-alert`}
          label="Alert me before"
          placeholder="e.g. 2"
          span={v.alertBefore}
          onChange={(alertBefore) => set({ alertBefore })}
        />
      </div>

      <div className="xp-chips" aria-label="Quick alert times">
        {ALERT_PRESETS.map((p) => {
          const on = Number(v.alertBefore?.value) === p.value && v.alertBefore?.unit === p.unit;
          return (
            <button
              key={`${p.value}${p.unit}`}
              type="button"
              className={on ? "is-on" : ""}
              onClick={() => set({ alertBefore: { ...p } })}
            >
              {formatSpan(p)}
            </button>
          );
        })}
      </div>

      {plan ? (
        <dl className="xp-summary" aria-live="polite">
          <div>
            <dt>Expires</dt>
            <dd>{formatDateTime(plan.expiry)}</dd>
          </div>
          {plan.buffer && (
            <div>
              <dt>Use before</dt>
              <dd>
                {formatDateTime(plan.useBefore)} <span>({formatSpan(plan.buffer)} buffer)</span>
              </dd>
            </div>
          )}
          <div>
            <dt>Alert on</dt>
            <dd>{formatDateTime(plan.alertAt)}</dd>
          </div>
        </dl>
      ) : (
        <p className="xp-hint">
          {v.mode === EXPIRY_MODES.DATE
            ? "Add the expiry date to track spoilage. Leave it empty for stock that doesn't expire."
            : "Add how long it lasts, e.g. 6 months. The expiry date is worked out from the arrival date."}
        </p>
      )}
    </fieldset>
  );
};

export default ExpiryFields;

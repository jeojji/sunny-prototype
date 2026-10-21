import { useEffect, useId, useRef, useState } from 'react';
import { scenarioInput } from '../conversation/engine';
import type { ConversationState, SunnyEvent } from '../conversation/types';
import { calculateScenario, isValidAmount, isValidMonths, MAX_MONTHS, parseAmount } from '../lib/calc';
import { horizon, money } from '../lib/format';
import { SavingsBar } from './Cards';

interface Props {
  state: ConversationState;
  dispatch: (event: SunnyEvent) => void;
  disabled: boolean;
}

/** Current confirmed facts plus a live calculator for the monthly amount and timeline. */
export function GoalPanel({ state, dispatch, disabled }: Props) {
  const { facts } = state;
  const input = scenarioInput(facts);
  const r = input ? calculateScenario(input) : null;
  const missing = [
    facts.target === null && 'a savings target',
    facts.homeSavings === null && 'starting savings',
    facts.monthly === null && 'a monthly amount',
    facts.timelineMonths === null && 'a timeline',
  ].filter(Boolean) as string[];

  return (
    <div className="goal-panel">
      <h2 className="panel-title">Your goal at a glance</h2>
      <p className="panel-note">What you’ve told Sunny so far. Balances in your accounts aren’t changed.</p>
      <dl className="facts">
        {facts.timelineMonths !== null && <Fact label="Timeline" value={horizon(facts.timelineMonths)} />}
        {facts.target !== null && <Fact label="Your target" value={money(facts.target)} />}
        {facts.homeSavings !== null && (
          <Fact label="Saved for this goal" value={`${money(facts.homeSavings)}${facts.homeSavingsHeldElsewhere ? ' (incl. elsewhere)' : ''}`} />
        )}
        {facts.reservedSeparately !== null && facts.reservedSeparately > 0 && (
          <Fact label="Kept separate" value={money(facts.reservedSeparately)} />
        )}
        {facts.monthly !== null && <Fact label="Monthly amount" value={`${money(facts.monthly)} / month`} />}
      </dl>

      {input && r?.valid ? (
        <div className="calculator">
          <SavingsBar input={input} />
          <div className="calc-results">
            <div>
              <span className="calc-label">Total after {input.months} months</span>
              <span className="calc-value">{money(r.projectedTotal)}</span>
            </div>
            <div>
              <span className="calc-label">
                {r.targetAlreadyReached ? 'Target' : r.amountAboveTarget > 0 ? 'Above target' : 'Remaining gap'}
              </span>
              <span className="calc-value">
                {r.targetAlreadyReached ? 'Already reached' : money(r.amountAboveTarget > 0 ? r.amountAboveTarget : r.remainingGap)}
              </span>
            </div>
            {r.requiredMonthly !== null && input.monthly > 0 && (
              <div className="calc-wide">
                <span className="calc-label">Would reach target in {input.months} months</span>
                <span className="calc-value">{money(r.requiredMonthly)} / month</span>
              </div>
            )}
          </div>
          <p className="panel-note">
            Illustrative arithmetic only. Excludes interest, returns, fees, taxes and changes in circumstances. Your target
            is self-selected, not a required down payment.
          </p>
        </div>
      ) : (
        <p className="panel-note">To see a scenario, Sunny still needs {missing.join(', ')}. There’s no need to decide these now.</p>
      )}

      {(facts.monthly !== null || facts.timelineMonths !== null || facts.target !== null || facts.homeSavings !== null) && (
        <>
          <h3 className="panel-subtitle">Adjust</h3>
          {facts.monthly !== null && (
            <LiveField
              label="Monthly amount"
              kind="amount"
              value={facts.monthly}
              step={50}
              disabled={disabled}
              onCommit={(n) => dispatch({ type: 'updateFacts', patch: { monthly: n }, brief: true })}
            />
          )}
          {facts.timelineMonths !== null && (
            <LiveField
              label="Timeline (months)"
              kind="months"
              value={facts.timelineMonths}
              step={6}
              disabled={disabled}
              onCommit={(n) => dispatch({ type: 'updateFacts', patch: { timelineMonths: n }, brief: true })}
            />
          )}
          {facts.target !== null && (
            <LiveField
              label="Savings target"
              kind="amount"
              value={facts.target}
              step={1000}
              min={1}
              disabled={disabled}
              onCommit={(n) => dispatch({ type: 'updateFacts', patch: { target: n }, brief: true })}
            />
          )}
          {facts.homeSavings !== null && (
            <LiveField
              label="Saved for this goal"
              kind="amount"
              value={facts.homeSavings}
              step={500}
              disabled={disabled}
              onCommit={(n) => dispatch({ type: 'updateFacts', patch: { homeSavings: n }, brief: true })}
            />
          )}
        </>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd className={value === 'Not confirmed yet' ? 'muted' : undefined}>{value}</dd>
    </div>
  );
}

function LiveField({
  label,
  kind,
  value,
  step,
  min: minValue,
  disabled,
  onCommit,
}: {
  label: string;
  kind: 'amount' | 'months';
  value: number;
  step: number;
  min?: number;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync when the value changes elsewhere (chat edits, resets).
  useEffect(() => {
    setText(String(value));
    setError(null);
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const parse = (raw: string) => (kind === 'months' ? Number(raw.trim()) : parseAmount(raw));
  const valid = (n: number | null): n is number =>
    kind === 'months' ? isValidMonths(n) : n !== null && isValidAmount(n) && n >= (minValue ?? 0);

  function schedule(raw: string) {
    setText(raw);
    clearTimeout(timer.current);
    const n = parse(raw);
    if (!valid(n)) {
      setError(
        kind === 'months'
          ? `Use 1–${MAX_MONTHS} whole months.`
          : /^\s*\$?\s*[-−]/.test(raw)
            ? 'Amounts can’t be negative.'
            : `Use an amount of ${minValue ? 'more than $0' : '$0 or more'}.`,
      );
      return;
    }
    setError(null);
    if (n !== value) timer.current = setTimeout(() => onCommit(n), 700);
  }

  function nudge(dir: 1 | -1) {
    const n = parse(text);
    const base = valid(n) ? n : value;
    const min = kind === 'months' ? 1 : (minValue ?? 0);
    const max = kind === 'months' ? MAX_MONTHS : Infinity;
    schedule(String(Math.min(max, Math.max(min, base + dir * step))));
  }

  return (
    <div className="live-field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" onClick={() => nudge(-1)} disabled={disabled} aria-label={`Decrease ${label.toLowerCase()} by ${step}`}>
          −
        </button>
        <div className="stepper-input">
          {kind === 'amount' && <span aria-hidden="true">$</span>}
          <input
            id={id}
            inputMode={kind === 'months' ? 'numeric' : 'decimal'}
            value={text}
            disabled={disabled}
            onChange={(e) => schedule(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
          />
        </div>
        <button type="button" onClick={() => nudge(1)} disabled={disabled} aria-label={`Increase ${label.toLowerCase()} by ${step}`}>
          +
        </button>
      </div>
      {error && (
        <p className="field-error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}

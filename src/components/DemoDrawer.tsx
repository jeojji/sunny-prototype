import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { signalFor } from '../conversation/engine';
import type { ConversationState, EngineMode, SunnyEvent } from '../conversation/types';
import { PRESETS } from '../data/customers';
import { DEFAULT_SIGNAL_CONFIG } from '../domain/signal';
import { money } from '../lib/format';
import type { StatusResponse } from '../shared/api';
import { formatDate } from './Cards';

interface Props {
  open: boolean;
  state: ConversationState;
  aiStatus: StatusResponse | null;
  onSetMode: (mode: EngineMode) => void;
  onVerify: () => Promise<StatusResponse>;
  onClose: () => void;
  onLoadPreset: (id: string) => void;
  onResetCustomer: () => void;
  onResetAll: () => void;
  onLaterVisit: () => void;
  dispatch: (event: SunnyEvent) => void;
}

const STATUS_LABEL: Record<string, string> = {
  qualifies: 'Qualifies: nudge shown',
  not_met: 'Not met: no nudge',
  insufficient_data: 'Insufficient data: no nudge',
  suppressed_review: 'Suppressed: review flag',
  suppressed_earmarked: 'Suppressed: customer said it’s set aside',
  suppressed_dismissed: 'Suppressed: customer chose “Not now”',
};

export function DemoDrawer({ open, state, aiStatus, onSetMode, onVerify, onClose, onLoadPreset, onResetCustomer, onResetAll, onLaterVisit, dispatch }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    return () => restore?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && dialogRef.current) {
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, a[href], summary'));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const signal = signalFor(state);
  const today = state.profile.balances[state.todayIndex]?.date;
  const daysSinceFirst = state.todayIndex - state.profile.spec.todayIndex;

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="drawer-head">
          <h2 id={titleId}>Demo settings</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close demo settings">
            ×
          </button>
        </div>
        <p className="drawer-intro">Presenter controls. Not part of the customer experience. All customer data is synthetic.</p>

        <EngineSection mode={state.mode} aiStatus={aiStatus} onSetMode={onSetMode} onVerify={onVerify} />

        <section aria-labelledby="presets-h">
          <h3 id="presets-h">Scenarios</h3>
          <div className="preset-list">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset${state.profile.id === p.id ? ' is-active' : ''}`}
                aria-pressed={state.profile.id === p.id}
                onClick={() => onLoadPreset(p.id)}
              >
                <strong>{p.label}</strong>
                <span>{p.description}</span>
              </button>
            ))}
          </div>
          <p className="drawer-intro">Each scenario keeps its own conversation and memory. Switching never carries details across.</p>
        </section>

        <section aria-labelledby="time-h" className="engine">
          <h3 id="time-h">Simulated time</h3>
          <p className="engine-status">
            <strong>
              Simulated today: {today ? formatDate(today) : '—'} · visit {state.memory.visit}
            </strong>
            <span>{daysSinceFirst > 0 ? `${daysSinceFirst} simulated days after the first visit.` : 'First visit.'}</span>
          </p>
          <button type="button" className="btn btn-primary" onClick={onLaterVisit} disabled={state.todayIndex + 30 >= state.profile.balances.length}>
            Simulate a later visit (+30 days)
          </button>
          <p className="drawer-intro">
            Moves the demo clock forward and returns to the dashboard. Sunny then uses the saved goal and next step. There’s no background monitoring and no real reminders.
          </p>
        </section>

        <SignalSection state={state} dispatch={dispatch} statusLabel={STATUS_LABEL[signal.status]} />

        <section aria-labelledby="reset-h">
          <h3 id="reset-h">Reset</h3>
          <div className="drawer-actions">
            <button type="button" className="btn btn-secondary" onClick={onResetCustomer}>
              Reset this scenario (conversation, memory, time)
            </button>
            <button type="button" className="btn btn-secondary" onClick={onResetAll}>
              Reset all demo data
            </button>
          </div>
          <p className="drawer-intro">Demo memory is saved only in this browser (synthetic data). Resetting clears it completely.</p>
        </section>

        <section className="drawer-tech" aria-labelledby="tech-h">
          <h3 id="tech-h">About this build</h3>
          <ul>
            <li>Signal: deterministic rule over synthetic daily balances, computed in the browser; separate from the AI.</li>
            <li>Live AI: Google Gemini via the local server; the key stays server-side. Account details go to the AI only after the customer allows it.</li>
            <li>Allocations, goals, calculations and offerings are validated in code.</li>
            <li>Knowledge base: official Tangerine and government pages, reviewed Oct 21 and Oct 24, 2026.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function SignalSection({ state, dispatch, statusLabel }: { state: ConversationState; dispatch: (e: SunnyEvent) => void; statusLabel: string }) {
  const id = useId();
  const [threshold, setThreshold] = useState(String(state.signalConfig.threshold));
  const [days, setDays] = useState(String(state.signalConfig.observationDays));
  const [error, setError] = useState<string | null>(null);
  const signal = signalFor(state);
  const e = signal.evidence;

  function apply(ev: FormEvent) {
    ev.preventDefault();
    const t = Number(threshold.replace(/[$,\s]/g, ''));
    const d = Number(days);
    if (!Number.isFinite(t) || t <= 0) return setError('Threshold must be a positive amount.');
    if (!Number.isInteger(d) || d < 7 || d > 120) return setError('Observation window must be 7–120 days.');
    setError(null);
    dispatch({ type: 'setSignalConfig', config: { ...state.signalConfig, threshold: t, observationDays: d } });
  }

  return (
    <section aria-labelledby={`${id}-h`} className="engine">
      <h3 id={`${id}-h`}>Signal rule: elevated chequing balance</h3>
      <p className={`engine-status ${signal.show ? 'is-ai' : 'is-scripted'}`} role="status">
        <strong>{statusLabel}</strong>
        <span>
          {e.daysWithData}/{e.daysInWindow} days of data · lowest {e.minBalance !== null ? money(e.minBalance) : '—'} · {e.daysBelowThreshold} day(s) below {money(e.threshold)}
        </span>
      </p>
      <ul className="check-list">
        {signal.checks.map((c) => (
          <li key={c.label} className={c.passed ? 'pass' : 'fail'}>
            <span aria-hidden="true">{c.passed ? '✓' : '✕'}</span> <strong>{c.label}:</strong> {c.detail}
          </li>
        ))}
      </ul>
      <form onSubmit={apply} className="drawer-grid" noValidate>
        <div className="drawer-field">
          <label htmlFor={`${id}-t`}>Threshold ($)</label>
          <input id={`${id}-t`} inputMode="decimal" value={threshold} onChange={(x) => setThreshold(x.target.value)} />
        </div>
        <div className="drawer-field">
          <label htmlFor={`${id}-d`}>Observation window (days)</label>
          <input id={`${id}-d`} inputMode="numeric" value={days} onChange={(x) => setDays(x.target.value)} />
        </div>
        <button type="submit" className="btn btn-secondary">
          Apply rule settings
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setThreshold(String(DEFAULT_SIGNAL_CONFIG.threshold));
            setDays(String(DEFAULT_SIGNAL_CONFIG.observationDays));
            dispatch({ type: 'setSignalConfig', config: DEFAULT_SIGNAL_CONFIG });
          }}
        >
          Defaults
        </button>
      </form>
      {error && <p className="field-error">{error}</p>}
      <label className="check">
        <input type="checkbox" checked={state.profile.reviewFlag} onChange={(x) => dispatch({ type: 'setProfileFlags', reviewFlag: x.target.checked })} />
        <span>Flag recent activity for review (unusual or incomplete) — suppresses the nudge</span>
      </label>
      <div className="drawer-field">
        <label htmlFor={`${id}-h2`}>History available</label>
        <select
          id={`${id}-h2`}
          value={state.profile.historyDaysAvailable ?? 'all'}
          onChange={(x) => dispatch({ type: 'setProfileFlags', historyDaysAvailable: x.target.value === 'all' ? null : Number(x.target.value) })}
        >
          <option value="all">All synthetic history</option>
          <option value="60">Last 60 days only (insufficient)</option>
          <option value="30">Last 30 days only (insufficient)</option>
        </select>
      </div>
      <p className="drawer-intro">Prototype assumptions, not Tangerine policy. The signal is a reason to ask a question; it never sets an amount, suitability or product.</p>
    </section>
  );
}

function EngineSection({
  mode,
  aiStatus,
  onSetMode,
  onVerify,
}: {
  mode: EngineMode;
  aiStatus: StatusResponse | null;
  onSetMode: (mode: EngineMode) => void;
  onVerify: () => Promise<StatusResponse>;
}) {
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const available = aiStatus?.aiAvailable === true;

  async function check() {
    setChecking(true);
    setCheckResult(null);
    const s = await onVerify();
    setCheckResult(s.aiAvailable ? `Connected. Model “${s.model}” responded.` : (s.reason ?? 'AI is not available.'));
    setChecking(false);
  }

  return (
    <section aria-labelledby="engine-h" className="engine">
      <h3 id="engine-h">Conversation engine</h3>
      <p className={`engine-status ${mode === 'ai' ? 'is-ai' : 'is-scripted'}`} role="status">
        <strong>{mode === 'ai' ? 'Live AI conversation (Gemini)' : 'Scripted demo'}</strong>
        <span>
          {mode === 'ai'
            ? `Replies are generated by Gemini (${aiStatus?.model ?? 'configured model'}), grounded in the curated knowledge base.`
            : 'Replies are pre-written and keyword-matched. This is not live AI.'}
        </span>
      </p>
      <div className="engine-toggle" role="group" aria-label="Choose conversation engine">
        <button
          type="button"
          className={`btn ${mode === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
          aria-pressed={mode === 'ai'}
          disabled={!available}
          onClick={() => onSetMode('ai')}
        >
          Live AI
        </button>
        <button
          type="button"
          className={`btn ${mode === 'scripted' ? 'btn-primary' : 'btn-secondary'}`}
          aria-pressed={mode === 'scripted'}
          onClick={() => onSetMode('scripted')}
        >
          Scripted demo
        </button>
      </div>
      {!available && (
        <p className="drawer-intro">
          {aiStatus === null ? 'Checking AI configuration…' : (aiStatus.reason ?? 'AI is not available.')} See README › “Enable live AI”.
        </p>
      )}
      {aiStatus?.aiAvailable !== undefined && aiStatus.reason === null && (
        <button type="button" className="btn btn-secondary" onClick={check} disabled={checking}>
          {checking ? 'Testing…' : 'Test AI connection'}
        </button>
      )}
      {checkResult && <p className="drawer-intro" role="status">{checkResult}</p>}
    </section>
  );
}

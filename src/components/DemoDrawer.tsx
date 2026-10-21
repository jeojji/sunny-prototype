import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { DEFAULT_PROFILE, PRESETS, type CustomerProfile } from '../data/customers';
import type { EngineMode } from '../conversation/types';
import { isValidAmount, isValidMonths } from '../lib/calc';
import type { StatusResponse } from '../shared/api';

interface Props {
  open: boolean;
  profile: CustomerProfile;
  mode: EngineMode;
  aiStatus: StatusResponse | null;
  onSetMode: (mode: EngineMode) => void;
  onVerify: () => Promise<StatusResponse>;
  onClose: () => void;
  onApplyProfile: (profile: CustomerProfile) => void;
  onRestartConversation: () => void;
}

type NumericKey = Exclude<keyof CustomerProfile, 'id' | 'firstName'>;

const SNAPSHOT_FIELDS: [NumericKey, string][] = [
  ['age', 'Age'],
  ['chequingBalance', 'Chequing balance ($)'],
  ['savingsBalance', 'Savings balance ($)'],
  ['monthlyIncome', 'Monthly take-home income ($)'],
  ['monthlyExpenses', 'Monthly expenses ($)'],
  ['otherSavingsCommitments', 'Other savings commitments ($/mo)'],
];
const ANSWER_FIELDS: [NumericKey, string][] = [
  ['emergencyReserve', 'Emergency reserve within savings ($)'],
  ['homeTarget', 'Home savings target ($)'],
  ['timelineMonths', 'Purchase timeline (months)'],
  ['monthlyToExplore', 'Monthly amount to explore ($)'],
];

type Draft = Record<NumericKey, string> & { firstName: string };

const toDraft = (p: CustomerProfile): Draft =>
  ({
    firstName: p.firstName,
    ...Object.fromEntries([...SNAPSHOT_FIELDS, ...ANSWER_FIELDS].map(([k]) => [k, String(p[k])])),
  }) as Draft;

function validate(d: Draft): { profile?: CustomerProfile; errors: Partial<Record<keyof Draft, string>> } {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!d.firstName.trim()) errors.firstName = 'Enter a first name.';
  const nums = {} as Record<NumericKey, number>;
  for (const [k] of [...SNAPSHOT_FIELDS, ...ANSWER_FIELDS]) {
    const n = Number(d[k].replace(/[$,\s]/g, ''));
    if (d[k].trim() === '' || !isValidAmount(n)) errors[k] = 'Enter 0 or more.';
    nums[k] = n;
  }
  if (!errors.age && (!Number.isInteger(nums.age) || nums.age < 18 || nums.age > 100)) errors.age = 'Enter an age from 18 to 100.';
  if (!errors.timelineMonths && !isValidMonths(nums.timelineMonths)) errors.timelineMonths = 'Enter 1–360 whole months.';
  if (!errors.homeTarget && nums.homeTarget <= 0) errors.homeTarget = 'Enter a target above 0.';
  if (!errors.emergencyReserve && nums.emergencyReserve > nums.savingsBalance) {
    errors.emergencyReserve = 'The reserve is part of the savings balance, so it can’t exceed it.';
  }
  if (Object.keys(errors).length) return { errors };
  return { errors, profile: { id: 'custom', firstName: d.firstName.trim(), ...nums } };
}

export function DemoDrawer({ open, profile, mode, aiStatus, onSetMode, onVerify, onClose, onApplyProfile, onRestartConversation }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(profile));
    setErrors({});
    returnFocus.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button, input')?.focus();
    const restore = returnFocus.current;
    return () => restore?.focus?.();
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && dialogRef.current) {
        const items = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]'),
        );
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

  function apply(e: FormEvent) {
    e.preventDefault();
    const { profile: p, errors: errs } = validate(draft);
    setErrors(errs);
    if (p) onApplyProfile(p);
  }

  const field = (k: keyof Draft, label: string, numeric = true) => (
    <div className="drawer-field" key={k}>
      <label htmlFor={`demo-${k}`}>{label}</label>
      <input
        id={`demo-${k}`}
        inputMode={numeric ? 'decimal' : 'text'}
        value={draft[k]}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `demo-${k}-err` : undefined}
      />
      {errors[k] && (
        <p className="field-error" id={`demo-${k}-err`}>
          {errors[k]}
        </p>
      )}
    </div>
  );

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="drawer-head">
          <h2 id={titleId}>Demo settings</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close demo settings">
            ×
          </button>
        </div>
        <p className="drawer-intro">
          Presenter controls. Not part of the customer experience. Changing the customer resets the conversation so no
          details carry over.
        </p>

        <EngineSection mode={mode} aiStatus={aiStatus} onSetMode={onSetMode} onVerify={onVerify} />

        <section aria-labelledby="presets-h">
          <h3 id="presets-h">Scenario presets</h3>
          <div className="preset-list">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset${profile.id === p.id ? ' is-active' : ''}`}
                aria-pressed={profile.id === p.id}
                onClick={() => onApplyProfile(p.profile)}
              >
                <strong>{p.label}</strong>
                <span>{p.description}</span>
              </button>
            ))}
          </div>
        </section>

        <form onSubmit={apply} noValidate>
          <h3>Synthetic customer</h3>
          {field('firstName', 'First name', false)}
          <p className="drawer-group">Account snapshot (visible to Sunny with permission)</p>
          <div className="drawer-grid">{SNAPSHOT_FIELDS.map(([k, l]) => field(k, l))}</div>
          <p className="drawer-group">Customer’s own answers (pre-fill only; Sunny learns these by asking)</p>
          <div className="drawer-grid">{ANSWER_FIELDS.map(([k, l]) => field(k, l))}</div>
          <div className="drawer-actions">
            <button type="submit" className="btn btn-primary">
              Apply and reset conversation
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onApplyProfile(DEFAULT_PROFILE)}>
              Reset to default
            </button>
            <button type="button" className="btn btn-secondary" onClick={onRestartConversation}>
              Restart current conversation
            </button>
          </div>
        </form>

        <section className="drawer-tech" aria-labelledby="tech-h">
          <h3 id="tech-h">About this build</h3>
          <ul>
            <li>Live AI: Google Gemini (Gen AI SDK, free tier) via the local server. The key stays server-side.</li>
            <li>Use only synthetic customer data and public sources: free-tier content may be used by Google to improve its products.</li>
            <li>Calculations and goal facts are always deterministic and validated in code.</li>
            <li>Answers use a curated knowledge base (reviewed 2026-10-21); no live web lookups.</li>
            <li>Current customer id: {profile.id}</li>
          </ul>
        </section>
      </div>
    </div>
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

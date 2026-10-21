import { buildSummary } from '../conversation/summary';
import { NEXT_STEP_LABEL } from '../conversation/script';
import type { ConversationState, NextStepId, SunnyEvent } from '../conversation/types';
import { horizon, money } from '../lib/format';
import { SavingsBar } from './Cards';
import { scenarioInput } from '../conversation/engine';

interface Props {
  state: ConversationState;
  dispatch: (event: SunnyEvent) => void;
  onEditAssumptions: () => void;
  onRestart: () => void;
}

const prepared = new Intl.DateTimeFormat('en-CA', { dateStyle: 'long' });

export function SummaryView({ state, dispatch, onEditAssumptions, onRestart }: Props) {
  const s = buildSummary(state);
  const input = scenarioInput(state.facts);
  const r = s.result;
  const notSet = 'Not confirmed yet';

  return (
    <main className="page summary" id="main">
      <div className="page-head">
        <p className="eyebrow">Prepared with Sunny · {prepared.format(new Date())}</p>
        <h1>Your home-saving conversation</h1>
        <p className="lede">
          A record of what {s.firstName} confirmed and explored. Educational information only; no decisions were made for you.
        </p>
      </div>

      <div className="page-grid">
        <section className="panel-card" aria-labelledby="sum-goal">
          <h2 id="sum-goal">Goal and starting point</h2>
          <dl className="facts">
            <div className="fact">
              <dt>Confirmed goal</dt>
              <dd>{s.goal}</dd>
            </div>
            <div className="fact">
              <dt>Timeline</dt>
              <dd>{s.timeline ?? notSet}</dd>
            </div>
            <div className="fact">
              <dt>Starting savings for this goal</dt>
              <dd>
                {s.startingSavings !== null ? money(s.startingSavings) : notSet}
                {s.heldElsewhere ? ' (includes money held elsewhere)' : ''}
              </dd>
            </div>
            <div className="fact">
              <dt>Kept separately</dt>
              <dd>
                {s.reservedSeparately === null
                  ? 'Not discussed'
                  : s.reservedSeparately > 0
                    ? `${money(s.reservedSeparately)} for emergencies`
                    : 'None'}
              </dd>
            </div>
            <div className="fact">
              <dt>Self-selected target</dt>
              <dd>{s.target !== null ? money(s.target) : notSet}</dd>
            </div>
            <div className="fact">
              <dt>Information used</dt>
              <dd>{s.dataSource}</dd>
            </div>
          </dl>
        </section>

        <section className="panel-card" aria-labelledby="sum-scenario">
          <h2 id="sum-scenario">Monthly-saving scenario explored</h2>
          {input && r?.valid ? (
            <>
              <p className="scenario-line">
                {input.monthly > 0 ? (
                  <>
                    <strong>{money(input.monthly)} a month</strong> for {horizon(input.months)}
                  </>
                ) : (
                  <>No monthly amount for now</>
                )}
              </p>
              <SavingsBar input={input} />
              <dl className="facts">
                <div className="fact">
                  <dt>Total after {input.months} months</dt>
                  <dd>{money(r.projectedTotal)}</dd>
                </div>
                <div className="fact">
                  <dt>{r.targetAlreadyReached ? 'Target' : r.amountAboveTarget > 0 ? 'Above target' : 'Remaining gap'}</dt>
                  <dd>
                    {r.targetAlreadyReached
                      ? 'Already reached'
                      : money(r.amountAboveTarget > 0 ? r.amountAboveTarget : r.remainingGap)}
                  </dd>
                </div>
                {r.requiredMonthly !== null && input.monthly > 0 && (
                  <div className="fact">
                    <dt>Monthly amount that would reach the target in {input.months} months</dt>
                    <dd>{money(r.requiredMonthly)}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <p className="muted">No scenario was explored. That’s fine: a scenario needs a timeline, target, starting savings and monthly amount, and you can add them anytime.</p>
          )}
          <h3>Assumptions</h3>
          <ul className="plain-list">
            {s.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>

        <section className="panel-card" aria-labelledby="sum-topics">
          <h2 id="sum-topics">Topics explored</h2>
          {s.topics.length ? (
            <ul className="plain-list">
              {s.topics.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None yet.</p>
          )}
          <h2 id="sum-questions" className="spaced">
            Questions for further support
          </h2>
          {s.questions.length ? (
            <ul className="plain-list">
              {s.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              None yet.{' '}
              <button type="button" className="link-button no-print" onClick={() => dispatch({ type: 'showHandoff' })}>
                Prepare questions
              </button>
            </p>
          )}
        </section>

        <section className="panel-card" aria-labelledby="sum-next">
          <h2 id="sum-next">Your next steps</h2>
          <fieldset className="multi multi-compact no-print">
            <legend className="field-hint">Choose any that are useful. Only selected steps are printed.</legend>
            {(Object.keys(NEXT_STEP_LABEL) as NextStepId[]).map((id) => (
              <label key={id} className="check">
                <input
                  type="checkbox"
                  checked={state.nextSteps.includes(id)}
                  onChange={() => dispatch({ type: 'toggleNextStep', step: id })}
                />
                <span>{NEXT_STEP_LABEL[id]}</span>
              </label>
            ))}
          </fieldset>
          <ul className="plain-list print-only">
            {s.nextSteps.length ? s.nextSteps.map((n) => <li key={n}>{n}</li>) : <li>None selected</li>}
          </ul>
        </section>

        {s.sources.length > 0 && (
          <section className="panel-card page-wide" aria-labelledby="sum-sources">
            <h2 id="sum-sources">Sources referenced</h2>
            <ul className="plain-list source-print-list">
              {s.sources.map((e) => (
                <li key={e.id}>
                  {e.publisher}, “{e.pageTitle}” ({e.kind === 'tangerine' ? 'Tangerine' : 'general information'}, reviewed{' '}
                  {e.reviewed}) <span className="url">{e.url}</span>
                </li>
              ))}
            </ul>
            <p className="field-hint">These public pages support Sunny’s explanations; they don’t indicate Tangerine approval of this prototype.</p>
          </section>
        )}

        <section className="panel-card page-wide" aria-labelledby="sum-note">
          <h2 id="sum-note">Conversation summary</h2>
          <p className="note-text">{s.note}</p>
        </section>
      </div>

      <p className="concept-note">
        Academic prototype · Synthetic data. Not an official Tangerine application, and not financial advice.
      </p>

      <div className="page-actions no-print">
        <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'setView', view: 'chat' })}>
          Return to conversation
        </button>
        <button type="button" className="btn btn-secondary" onClick={onEditAssumptions}>
          Edit assumptions
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          Restart demo
        </button>
      </div>
    </main>
  );
}

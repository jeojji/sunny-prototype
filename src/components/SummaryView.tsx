import { buildSummary } from '../conversation/summary';
import type { ConversationState, SunnyEvent } from '../conversation/types';
import { money } from '../lib/format';
import { AllocationCard, formatDate, ScenarioCard } from './Cards';

interface Props {
  state: ConversationState;
  dispatch: (event: SunnyEvent) => void;
  onRestart: () => void;
}

export function SummaryView({ state, dispatch, onRestart }: Props) {
  const s = buildSummary(state);
  const notYet = <span className="muted">Not discussed yet</span>;

  return (
    <main className="page summary" id="main">
      <div className="page-head">
        <p className="eyebrow">Prepared with Sunny · {formatDate(s.asOf)} (simulated date)</p>
        <h1>Your conversation with Sunny</h1>
        <p className="lede">What {s.firstName} confirmed, explored and chose. Educational information only; no decisions were made for you, and nothing was opened, moved or booked.</p>
      </div>

      <div className="page-grid">
        <section className="panel-card" aria-labelledby="sum-prompt">
          <h2 id="sum-prompt">What prompted this</h2>
          <p>{s.prompted}</p>
          <dl className="facts">
            <div className="fact">
              <dt>Information used</dt>
              <dd>{s.dataUsed}</dd>
            </div>
            <div className="fact">
              <dt>Chequing / savings today</dt>
              <dd>
                {money(s.balances.chequing)} / {money(s.balances.savings)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel-card" aria-labelledby="sum-confirmed">
          <h2 id="sum-confirmed">What you confirmed</h2>
          {s.allocationsConfirmed ? <AllocationCard snapshot={s.allocations} /> : <p className="muted">You haven’t said what any of the balance is for.</p>}
          {state.memory.prefs.earmarked && <p>You said this money is already set aside{state.memory.prefs.earmarkNote ? ` ${state.memory.prefs.earmarkNote}` : ''}. Sunny won’t suggest exploring it again.</p>}
        </section>

        <section className="panel-card" aria-labelledby="sum-goal">
          <h2 id="sum-goal">Your goal</h2>
          <dl className="facts">
            <div className="fact">
              <dt>Goal or learning preference</dt>
              <dd>{s.goal ?? notYet}</dd>
            </div>
            {s.goalDetail && (
              <div className="fact">
                <dt>In your words</dt>
                <dd>“{s.goalDetail}”</dd>
              </div>
            )}
            <div className="fact">
              <dt>When you might need the money</dt>
              <dd>{s.horizon ?? notYet}</dd>
            </div>
            <div className="fact">
              <dt>Next step you chose</dt>
              <dd>{s.nextStep ?? notYet}</dd>
            </div>
          </dl>
          {s.scenario && <ScenarioCard input={s.scenario.input} />}
        </section>

        <section className="panel-card" aria-labelledby="sum-explored">
          <h2 id="sum-explored">Topics and offerings explored</h2>
          <h3>Topics</h3>
          {s.topics.length ? (
            <ul className="plain-list">
              {s.topics.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None yet.</p>
          )}
          <h3>Tangerine offerings viewed</h3>
          {s.offerings.length ? (
            <ul className="plain-list">
              {s.offerings.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None yet.</p>
          )}
          <p className="field-hint">Viewed to learn about, not recommended. Other institutions offer similar products.</p>
        </section>

        <section className="panel-card page-wide" aria-labelledby="sum-unknown">
          <h2 id="sum-unknown">Still unknown</h2>
          <ul className="plain-list">
            {s.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          {s.questions.length > 0 && (
            <>
              <h3>Questions for a person</h3>
              <ul className="plain-list">
                {s.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        {s.sources.length > 0 && (
          <section className="panel-card page-wide" aria-labelledby="sum-sources">
            <h2 id="sum-sources">Sources referenced</h2>
            <ul className="plain-list source-print-list">
              {s.sources.map((e) => (
                <li key={e.id}>
                  {e.publisher}, “{e.pageTitle}” ({e.kind === 'tangerine' ? 'Tangerine' : 'general information'}, reviewed {e.reviewed}) <span className="url">{e.url}</span>
                </li>
              ))}
            </ul>
            <p className="field-hint">These public pages support Sunny’s explanations; they don’t indicate Tangerine approval of this prototype.</p>
          </section>
        )}
      </div>

      <p className="concept-note">Academic prototype · Synthetic data. Not an official Tangerine application, and not financial advice.</p>

      <div className="page-actions no-print">
        <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'setView', view: 'chat' })}>
          Return to conversation
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'setView', view: 'dashboard' })}>
          Back to accounts
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          Reset this demo customer
        </button>
      </div>
    </main>
  );
}

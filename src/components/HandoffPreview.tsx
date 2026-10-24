import { useId, useState, type FormEvent } from 'react';
import { autoNote, buildSummary } from '../conversation/summary';
import type { ConversationState, SunnyEvent } from '../conversation/types';
import { PURPOSE_LABEL } from '../domain/allocations';
import { money } from '../lib/format';

interface Props {
  state: ConversationState;
  dispatch: (event: SunnyEvent) => void;
}

export function HandoffPreview({ state, dispatch }: Props) {
  const s = buildSummary(state);
  const noteId = useId();
  const qId = useId();
  const [newQ, setNewQ] = useState('');

  function addQuestion(e: FormEvent) {
    e.preventDefault();
    const q = newQ.trim();
    if (!q) return;
    dispatch({ type: 'setSupportQuestions', questions: [...state.memory.supportQuestions, q] });
    setNewQ('');
  }

  return (
    <main className="page" id="main">
      <div className="page-head">
        <span className="badge">Concept preview · Nothing is sent</span>
        <h1>Prepare for human support</h1>
        <p className="lede">
          This shows what {s.firstName} could share with a person, so they don’t have to repeat themselves. Review and edit
          anything before it’s used.
        </p>
      </div>

      <div className="page-grid">
        <section className="panel-card" aria-labelledby="handoff-facts">
          <h2 id="handoff-facts">What you’ve confirmed</h2>
          <dl className="facts">
            <div className="fact">
              <dt>Goal or learning preference</dt>
              <dd>{s.goal ?? 'Not discussed yet'}</dd>
            </div>
            <div className="fact">
              <dt>When the money might be needed</dt>
              <dd>{s.horizon ?? 'Not discussed yet'}</dd>
            </div>
            {s.allocations.items.map((a) => (
              <div className="fact" key={a.purpose}>
                <dt>{PURPOSE_LABEL[a.purpose]} (chequing)</dt>
                <dd>{money(a.amount)}</dd>
              </div>
            ))}
            {s.allocationsConfirmed && (
              <div className="fact">
                <dt>Chequing not yet assigned to a purpose</dt>
                <dd>{money(s.allocations.unassigned)}</dd>
              </div>
            )}
            <div className="fact">
              <dt>Offerings looked at</dt>
              <dd>{s.offerings.length ? s.offerings.join(', ') : 'None yet'}</dd>
            </div>
          </dl>
        </section>

        <section className="panel-card" aria-labelledby="handoff-questions">
          <h2 id="handoff-questions">Questions you’d like help with</h2>
          {state.memory.supportQuestions.length === 0 ? (
            <p className="muted">No questions yet. Add one below.</p>
          ) : (
            <ul className="question-list">
              {state.memory.supportQuestions.map((q, i) => (
                <li key={`${i}-${q}`}>
                  <span>{q}</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      dispatch({ type: 'setSupportQuestions', questions: state.memory.supportQuestions.filter((_, j) => j !== i) })
                    }
                    aria-label={`Remove question: ${q}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="add-question" onSubmit={addQuestion}>
            <label htmlFor={qId}>Add a question</label>
            <div className="amount-row">
              <input id={qId} value={newQ} onChange={(e) => setNewQ(e.target.value)} maxLength={200} />
              <button type="submit" className="btn btn-secondary" disabled={!newQ.trim()}>
                Add
              </button>
            </div>
          </form>
        </section>

        <section className="panel-card page-wide" aria-labelledby="handoff-note">
          <h2 id="handoff-note">Conversation summary</h2>
          <label htmlFor={noteId} className="field-hint">
            Written in your words. Edit it however you like.
          </label>
          <textarea
            id={noteId}
            rows={5}
            value={s.note}
            onChange={(e) => dispatch({ type: 'setHandoffNote', text: e.target.value })}
          />
          {state.handoffNoteEdited && (
            <button
              type="button"
              className="link-button"
              onClick={() => dispatch({ type: 'setHandoffNote', text: autoNote(state) })}
            >
              Reset to Sunny’s draft
            </button>
          )}
        </section>
      </div>

      <p className="concept-note">
        In this prototype, no message is sent, no appointment is booked and no advisor is connected. A future version could
        pass this preview to a Tangerine support channel, such as an advisor consultation.
      </p>

      <div className="page-actions">
        <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'setView', view: 'chat' })}>
          Back to conversation
        </button>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'setView', view: 'summary' })}>
          View my summary
        </button>
      </div>
    </main>
  );
}

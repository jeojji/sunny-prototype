import { useId, useState, type FormEvent } from 'react';
import { autoNote, buildSummary } from '../conversation/summary';
import type { ConversationState, SunnyEvent } from '../conversation/types';
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
    dispatch({ type: 'setSupportQuestions', questions: [...state.supportQuestions, q] });
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
              <dt>Goal</dt>
              <dd>{s.goal}</dd>
            </div>
            <div className="fact">
              <dt>Timeline</dt>
              <dd>{s.timeline ?? 'Not confirmed yet'}</dd>
            </div>
            <div className="fact">
              <dt>Saved for this goal</dt>
              <dd>{s.startingSavings !== null ? money(s.startingSavings) : 'Not confirmed yet'}</dd>
            </div>
            {s.reservedSeparately ? (
              <div className="fact">
                <dt>Kept separate for emergencies</dt>
                <dd>{money(s.reservedSeparately)}</dd>
              </div>
            ) : null}
            <div className="fact">
              <dt>Self-selected target</dt>
              <dd>{s.target !== null ? money(s.target) : 'Not confirmed yet'}</dd>
            </div>
            <div className="fact">
              <dt>Monthly amount explored</dt>
              <dd>{s.monthly !== null ? money(s.monthly) : 'Not confirmed yet'}</dd>
            </div>
          </dl>
        </section>

        <section className="panel-card" aria-labelledby="handoff-questions">
          <h2 id="handoff-questions">Questions you’d like help with</h2>
          {state.supportQuestions.length === 0 ? (
            <p className="muted">No questions yet. Add one below.</p>
          ) : (
            <ul className="question-list">
              {state.supportQuestions.map((q, i) => (
                <li key={`${i}-${q}`}>
                  <span>{q}</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      dispatch({ type: 'setSupportQuestions', questions: state.supportQuestions.filter((_, j) => j !== i) })
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
        pass this preview to a support channel chosen by Tangerine.
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

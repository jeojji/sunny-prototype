import { allocationSnapshot, hasPlan } from '../conversation/engine';
import { GOAL_LABEL, HORIZON_LABEL, NEXT_STEP_LABEL } from '../conversation/script';
import type { ConversationState } from '../conversation/types';
import { PURPOSE_LABEL } from '../domain/allocations';
import { money } from '../lib/format';
import { getOffering } from '../shared/offerings';
import { ScenarioCard } from './Cards';

/** What the customer has confirmed so far. Shown only once there is something to show. */
export function PlanPanel({ state }: { state: ConversationState }) {
  if (!hasPlan(state)) return null;
  const m = state.memory;
  const snap = allocationSnapshot(state);
  return (
    <div className="goal-panel">
      <h2 className="panel-title">Your plan so far</h2>
      <p className="panel-note">Only what you’ve confirmed with Sunny. Nothing in your accounts changes.</p>
      {m.allocations.length > 0 && (
        <>
          <h3 className="panel-subtitle">Chequing, by purpose</h3>
          <dl className="facts">
            {snap.items.map((a) => (
              <div className="fact" key={a.purpose}>
                <dt>{PURPOSE_LABEL[a.purpose]}</dt>
                <dd>{money(a.amount)}</dd>
              </div>
            ))}
            <div className="fact fact-strong">
              <dt>Not yet assigned</dt>
              <dd>{money(snap.unassigned)}</dd>
            </div>
          </dl>
          <p className="panel-note">Savings ({money(snap.savingsBalance)}) is separate.</p>
        </>
      )}
      {(m.goal || m.horizon || m.nextStep) && (
        <dl className="facts">
          {m.goal && (
            <div className="fact">
              <dt>Goal</dt>
              <dd>{GOAL_LABEL[m.goal.type]}</dd>
            </div>
          )}
          {m.horizon && (
            <div className="fact">
              <dt>Timeframe</dt>
              <dd>{HORIZON_LABEL[m.horizon]}</dd>
            </div>
          )}
          {m.nextStep && (
            <div className="fact">
              <dt>Next step</dt>
              <dd>
                {NEXT_STEP_LABEL[m.nextStep]}
                {m.nextStepDone ? ' (done)' : ''}
              </dd>
            </div>
          )}
        </dl>
      )}
      {m.offeringsShown.length > 0 && (
        <>
          <h3 className="panel-subtitle">Offerings Sunny showed</h3>
          <ul className="plain-list panel-list">
            {m.offeringsShown.map((id) => (
              <li key={id}>
                {getOffering(id)?.name}
                {m.offeringsExplored.includes(id) && <span className="opened-tag"> · you opened this</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {m.scenario && <ScenarioCard input={m.scenario} />}
    </div>
  );
}

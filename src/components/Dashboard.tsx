import { useId } from 'react';
import { dashboardCard, currentBalances } from '../conversation/engine';
import { GOAL_LABEL, NEXT_STEP_LABEL } from '../conversation/script';
import type { CheckinAction, ConversationState, Origin, SunnyEvent } from '../conversation/types';
import { explainSignal } from '../domain/signal';
import { money } from '../lib/format';
import { BalanceTrend, formatDate } from './Cards';
import { SunnyOrb } from './SunnyOrb';

const balanceFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const cents = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

interface Props {
  state: ConversationState;
  onOpen: (origin: Origin) => void;
  onCheckin: (action: CheckinAction) => void;
  dispatch: (event: SunnyEvent) => void;
}

export function Dashboard({ state, onOpen, onCheckin, dispatch }: Props) {
  const b = currentBalances(state);
  const card = dashboardCard(state);
  const window = state.profile.balances.filter((x) => x.day <= state.todayIndex && x.day > state.todayIndex - state.signalConfig.observationDays);
  const recent = state.profile.transactions.filter((t) => t.day <= state.todayIndex && t.day > state.todayIndex - 14).slice(-6).reverse();
  const m = state.memory;

  return (
    <main className="dashboard" id="main">
      <div className="dash-head">
        <h1 className="greeting">Welcome back, {state.profile.firstName}</h1>
        <p className="as-of">Balances as of {formatDate(b.date)}</p>
      </div>

      {card && <InsightCard card={card} state={state} onOpen={onOpen} onCheckin={onCheckin} dispatch={dispatch} />}

      <section aria-labelledby="accounts-heading" className="accounts">
        <h2 id="accounts-heading" className="section-label">
          Your accounts
        </h2>
        <div className="account-grid">
          <article className="account-card">
            <p className="account-name">Chequing</p>
            <p className="account-number">•••• 4821</p>
            <p className="account-balance">{cents.format(b.chequing)}</p>
            <BalanceTrend points={window} label={`Chequing closing balance, last ${state.signalConfig.observationDays} days`} />
          </article>
          <article className="account-card">
            <p className="account-name">Savings</p>
            <p className="account-number">•••• 3307</p>
            <p className="account-balance">{cents.format(b.savings)}</p>
            {m.goal && (
              <div className="goal-chip">
                <p className="goal-chip-label">Your goal</p>
                <p className="goal-chip-value">{GOAL_LABEL[m.goal.type]}</p>
                {m.nextStep && <p className="goal-chip-next">Next step: {NEXT_STEP_LABEL[m.nextStep]}</p>}
              </div>
            )}
          </article>
        </div>
      </section>

      <section aria-labelledby="activity-heading" className="activity">
        <h2 id="activity-heading" className="section-label">
          Recent activity
        </h2>
        <ul className="activity-list">
          {recent.map((t, i) => (
            <li key={`${t.day}-${i}`}>
              <span className="activity-date">{balanceFmt.format(new Date(`${t.date}T00:00:00Z`))}</span>
              <span className="activity-desc">
                {t.description}
                <span className="activity-account">{t.account === 'chequing' ? 'Chequing' : 'Savings'}</span>
              </span>
              <span className={`activity-amount${t.amount > 0 ? ' is-in' : ''}`}>{(t.amount > 0 ? '+' : '−') + cents.format(Math.abs(t.amount))}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="ask-sunny">
        <SunnyOrb size={32} />
        <p>Questions about saving, investing or Tangerine options?</p>
        <button type="button" className="btn btn-secondary" onClick={() => onOpen(state.messages.length && state.origin ? state.origin : 'self')}>
          {state.messages.length ? 'Continue with Sunny' : 'Ask Sunny'}
        </button>
      </div>

      <p className="fine-print">Synthetic data for demonstration. Sunny shares general information and doesn’t make financial decisions for you.</p>
    </main>
  );
}

function InsightCard({
  card,
  state,
  onOpen,
  onCheckin,
  dispatch,
}: {
  card: NonNullable<ReturnType<typeof dashboardCard>>;
  state: ConversationState;
  onOpen: (origin: Origin) => void;
  onCheckin: (action: CheckinAction) => void;
  dispatch: (event: SunnyEvent) => void;
}) {
  const whyId = useId();
  if (card.kind === 'notice') {
    return (
      <section className="insight insight-notice" aria-live="polite">
        <SunnyOrb size={28} />
        <p>{card.text}</p>
        {card.undo === 'earmark' && (
          <button type="button" className="link-button" onClick={() => dispatch({ type: 'undoEarmark' })}>
            Undo
          </button>
        )}
      </section>
    );
  }
  if (card.kind === 'checkin') {
    return (
      <section className="insight" aria-labelledby="insight-title">
        <div className="insight-orb" aria-hidden="true">
          <SunnyOrb size={56} />
        </div>
        <div className="insight-body">
          <p className="eyebrow">Sunny · Check-in</p>
          <h2 id="insight-title" className="insight-title">
            {card.text}
          </h2>
          <div className="insight-actions">
            <button type="button" className="btn btn-primary" onClick={() => onCheckin('continue')}>
              Continue
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => onCheckin('change_goal')}>
              Change my goal
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onCheckin('remind_later')}>
              Remind me later
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onCheckin('stop')}>
              Stop these check-ins
            </button>
          </div>
        </div>
      </section>
    );
  }
  const { signal } = card;
  return (
    <section className="insight" aria-labelledby="insight-title">
      <div className="insight-orb" aria-hidden="true">
        <SunnyOrb size={56} />
      </div>
      <div className="insight-body">
        <p className="eyebrow">Sunny · Insight</p>
        <h2 id="insight-title" className="insight-title">
          Your chequing balance has stayed above {money(signal.evidence.threshold)} over the past {state.signalConfig.observationDays === 90 ? 'three months' : `${state.signalConfig.observationDays} days`}. Want to explore whether some of it could support a financial goal?
        </h2>
        <div className="insight-actions">
          <button type="button" className="btn btn-primary" onClick={() => onOpen('nudge')}>
            Explore with Sunny
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'earmarkFromDashboard' })}>
            This money is already set aside
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: 'dismissNudge' })}>
            Not now
          </button>
        </div>
        <details className="why">
          <summary id={whyId}>Why am I seeing this?</summary>
          <p>{explainSignal(signal, state.signalConfig.observationDays)}</p>
        </details>
      </div>
    </section>
  );
}


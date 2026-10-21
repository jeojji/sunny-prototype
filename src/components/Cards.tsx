import type { CustomerProfile } from '../data/customers';
import { TOPICS, type TopicId } from '../data/education';
import { getEntry, type KnowledgeEntry } from '../shared/knowledge';
import { calculateScenario, monthlyCashFlow, type ScenarioInput } from '../lib/calc';
import { money } from '../lib/format';

/** Key points for a scripted educational answer (the answer itself is the message text). */
export function EducationCard({ topic }: { topic: TopicId }) {
  const t = TOPICS[topic];
  if (!t.points) return null;
  return (
    <div className="card edu-card" aria-label={`${t.title}: key points`}>
      <ul>
        {t.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/** Compact, expandable list of validated knowledge-base sources for a message. */
export function SourceList({ ids }: { ids: string[] }) {
  const entries = ids.map(getEntry).filter((e): e is KnowledgeEntry => Boolean(e));
  if (!entries.length) return null;
  return (
    <details className="sources">
      <summary>
        Sources ({entries.length})
      </summary>
      <ul>
        {entries.map((e) => (
          <li key={e.id}>
            <span className={`source-kind source-${e.kind}`}>{e.kind === 'tangerine' ? 'Tangerine' : 'General'}</span>
            <a href={e.url} target="_blank" rel="noreferrer">
              {e.publisher}: {e.pageTitle}
            </a>
            <span className="source-date">Reviewed {formatDate(e.reviewed)}</span>
          </li>
        ))}
      </ul>
      <p className="source-note">
        These public pages support Sunny’s explanation. They don’t mean Tangerine reviewed or approved this prototype.
      </p>
    </details>
  );
}

const dateFmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' });
const formatDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

export function FactsUpdatedCard({ changes }: { changes: string[] }) {
  return (
    <p className="facts-updated" role="status">
      <span aria-hidden="true">✓</span> Updated your goal details: {changes.join('; ')}
    </p>
  );
}

/** Stacked bar: starting savings + planned contributions against the target. */
export function SavingsBar({ input }: { input: ScenarioInput }) {
  const r = calculateScenario(input);
  if (!r.valid) return null;
  const scale = Math.max(input.target, r.projectedTotal);
  const startPct = (input.startingSavings / scale) * 100;
  const contribPct = ((r.projectedTotal - input.startingSavings) / scale) * 100;
  const targetPct = (input.target / scale) * 100;
  const label = `Starting savings ${money(input.startingSavings)}, plus ${money(r.projectedTotal - input.startingSavings)} in monthly amounts, totals ${money(r.projectedTotal)} against a ${money(input.target)} target.`;
  return (
    <div className="savings-bar-wrap">
      <div className="savings-bar" role="img" aria-label={label}>
        <span className="seg seg-start" style={{ width: `${startPct}%` }} />
        <span className="seg seg-contrib" style={{ width: `${contribPct}%` }} />
        <span className="target-mark" style={{ left: `calc(${targetPct}% - 1px)` }} />
      </div>
      <div className="savings-legend" aria-hidden="true">
        <span>
          <i className="key key-start" /> Starting
        </span>
        <span>
          <i className="key key-contrib" /> Monthly amounts
        </span>
        <span>
          <i className="key key-target" /> Target
        </span>
      </div>
    </div>
  );
}

export function ScenarioFigures({ input }: { input: ScenarioInput }) {
  const r = calculateScenario(input);
  if (!r.valid) return <p className="field-error">Some assumptions need a valid value before I can calculate.</p>;
  return (
    <dl className="figures">
      <div>
        <dt>Starting savings</dt>
        <dd>{money(input.startingSavings)}</dd>
      </div>
      <div>
        <dt>Target</dt>
        <dd>{money(input.target)}</dd>
      </div>
      <div>
        <dt>Gap today</dt>
        <dd>{money(r.gap)}</dd>
      </div>
      <div>
        <dt>
          {money(input.monthly)}/mo × {input.months} mo
        </dt>
        <dd>+{money(input.monthly * input.months)}</dd>
      </div>
      <div className="figure-strong">
        <dt>Total after {input.months} months</dt>
        <dd>{money(r.projectedTotal)}</dd>
      </div>
      <div className="figure-strong">
        <dt>{r.amountAboveTarget > 0 ? 'Above target' : 'Remaining gap'}</dt>
        <dd>{money(r.amountAboveTarget > 0 ? r.amountAboveTarget : r.remainingGap)}</dd>
      </div>
      {r.requiredMonthly !== null && input.monthly > 0 && (
        <div className="figure-wide">
          <dt>Monthly amount that would reach the target in {input.months} months</dt>
          <dd>{money(r.requiredMonthly)}</dd>
        </div>
      )}
    </dl>
  );
}

export function ScenarioCard({
  snapshot,
  outdated,
  hypothetical = false,
}: {
  snapshot: ScenarioInput;
  outdated: boolean;
  hypothetical?: boolean;
}) {
  return (
    <article className="card scenario-card" aria-label="Savings scenario">
      <div className="card-head">
        <p className="card-kicker">{hypothetical ? 'What-if scenario · not saved' : 'Illustrative scenario'}</p>
        {outdated && !hypothetical && <span className="tag">Earlier figures · since updated</span>}
      </div>
      <SavingsBar input={snapshot} />
      <ScenarioFigures input={snapshot} />
      <p className="card-note">
        Simple arithmetic based on your answers. Excludes interest, investment returns, fees, taxes and changes in
        circumstances. Your target is your own choice, not a required down payment or a measure of what you can afford.
      </p>
    </article>
  );
}

export function SnapshotCard({ profile }: { profile: CustomerProfile }) {
  const cf = monthlyCashFlow(profile.monthlyIncome, profile.monthlyExpenses, profile.otherSavingsCommitments);
  return (
    <article className="card snapshot-card" aria-label="Account snapshot">
      <p className="card-kicker">Account snapshot · synthetic</p>
      <dl className="figures">
        <div>
          <dt>Chequing</dt>
          <dd>{money(profile.chequingBalance)}</dd>
        </div>
        <div>
          <dt>Savings</dt>
          <dd>{money(profile.savingsBalance)}</dd>
        </div>
        <div>
          <dt>Monthly take-home</dt>
          <dd>{profile.monthlyIncome > 0 ? money(profile.monthlyIncome) : 'Not available'}</dd>
        </div>
        <div>
          <dt>Typical monthly expenses</dt>
          <dd>{profile.monthlyIncome > 0 ? money(profile.monthlyExpenses) : 'Not available'}</dd>
        </div>
        {profile.otherSavingsCommitments > 0 && (
          <div>
            <dt>Other savings commitments</dt>
            <dd>{money(profile.otherSavingsCommitments)}</dd>
          </div>
        )}
        <div className="figure-strong">
          <dt>Left after expenses</dt>
          <dd>{cf === null ? 'Not available' : cf < 0 ? `${money(-cf)} more than take-home` : money(cf)}</dd>
        </div>
      </dl>
    </article>
  );
}

import { useId } from 'react';
import { TOPICS, type TopicId } from '../data/education';
import { PURPOSE_LABEL } from '../domain/allocations';
import type { DailyBalance } from '../domain/history';
import type { SignalResult } from '../domain/signal';
import { projectWithoutReturns } from '../lib/calc';
import { money } from '../lib/format';
import { getEntry, type KnowledgeEntry } from '../shared/knowledge';
import { getOffering, offeringUrl } from '../shared/offerings';
import type { AllocationSnapshot, ScenarioFacts } from '../conversation/types';

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

const dateFmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' });
export const formatDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));
const shortDate = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Compact, expandable list of validated knowledge-base sources. */
export function SourceList({ ids }: { ids: string[] }) {
  const entries = ids.map(getEntry).filter((e): e is KnowledgeEntry => Boolean(e));
  if (!entries.length) return null;
  return (
    <details className="sources">
      <summary>Sources ({entries.length})</summary>
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
      <p className="source-note">These public pages support Sunny’s explanation. They don’t mean Tangerine reviewed or approved this prototype.</p>
    </details>
  );
}

export function FactsUpdatedCard({ changes }: { changes: string[] }) {
  return (
    <p className="facts-updated" role="status">
      <span aria-hidden="true">✓</span> Noted: {changes.join('; ')}
    </p>
  );
}

/** Daily closing chequing balances with the threshold line (decorative chart + text alternative). */
export function BalanceTrend({ points, threshold, label }: { points: DailyBalance[]; threshold?: number; label: string }) {
  const id = useId();
  if (points.length < 2) return null;
  const values = points.map((p) => p.chequing);
  const lo = Math.min(...values, threshold ?? Infinity) * 0.97;
  const hi = Math.max(...values, threshold ?? -Infinity) * 1.02;
  const w = 300;
  const h = 72;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - ((v - lo) / (hi - lo || 1)) * h;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const desc = `${label}: from ${money(values[0])} on ${shortDate.format(new Date(`${points[0].date}T00:00:00Z`))} to ${money(values.at(-1)!)} today; lowest ${money(Math.min(...values))}, highest ${money(Math.max(...values))}.`;
  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-labelledby={`${id}-d`}>
        <desc id={`${id}-d`}>{desc}</desc>
        <path d={`${path} L${w},${h} L0,${h} Z`} className="trend-fill" />
        <path d={path} className="trend-line" />
        {threshold !== undefined && <line x1="0" x2={w} y1={y(threshold)} y2={y(threshold)} className="trend-threshold" />}
      </svg>
      <figcaption>
        <span>{shortDate.format(new Date(`${points[0].date}T00:00:00Z`))}</span>
        {threshold !== undefined && <span className="trend-key">— — {money(threshold)}</span>}
        <span>Today</span>
      </figcaption>
    </figure>
  );
}

export function SignalCard({ signal, observationDays }: { signal: SignalResult; observationDays: number }) {
  const e = signal.evidence;
  if (e.minBalance === null) return null;
  return (
    <div className="card signal-card" aria-label="What Sunny noticed">
      <p className="card-kicker">What Sunny noticed</p>
      <dl className="figures">
        <div>
          <dt>Days observed</dt>
          <dd>{observationDays}</dd>
        </div>
        <div>
          <dt>Lowest daily balance</dt>
          <dd>{money(e.minBalance)}</dd>
        </div>
        <div>
          <dt>Highest daily balance</dt>
          <dd>{money(e.maxBalance)}</dd>
        </div>
        <div>
          <dt>Days below {money(e.threshold)}</dt>
          <dd>{e.daysBelowThreshold}</dd>
        </div>
      </dl>
      <p className="card-note">A reason to ask a question, not a judgment about what the money is for.</p>
    </div>
  );
}

export function AllocationCard({ snapshot }: { snapshot: AllocationSnapshot }) {
  const { balance, items, unassigned, savingsBalance } = snapshot;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / (balance || 1)) * 100))}%`;
  return (
    <div className="card alloc-card" aria-label="Your chequing balance, by purpose">
      <p className="card-kicker">Chequing balance by purpose</p>
      <div className="alloc-bar" role="img" aria-label={`${items.map((a) => `${PURPOSE_LABEL[a.purpose]} ${money(a.amount)}`).join(', ')}${items.length ? ', ' : ''}not yet assigned ${money(unassigned)}, of ${money(balance)}.`}>
        {items.map((a) => (
          <span key={a.purpose} className={`alloc-seg alloc-${a.purpose}`} style={{ width: pct(a.amount) }} />
        ))}
        <span className="alloc-seg alloc-unassigned" style={{ width: pct(unassigned) }} />
      </div>
      <dl className="facts">
        {items.map((a) => (
          <div className="fact" key={a.purpose}>
            <dt>
              <i className={`key alloc-${a.purpose}`} aria-hidden="true" /> {PURPOSE_LABEL[a.purpose]}
            </dt>
            <dd>{money(a.amount)}</dd>
          </div>
        ))}
        <div className="fact fact-strong">
          <dt>
            <i className="key alloc-unassigned" aria-hidden="true" /> Not yet assigned to a purpose
          </dt>
          <dd>{money(unassigned)}</dd>
        </div>
        <div className="fact">
          <dt>Chequing balance</dt>
          <dd>{money(balance)}</dd>
        </div>
      </dl>
      <p className="card-note">Your {money(savingsBalance)} savings balance is separate and isn’t counted here.</p>
    </div>
  );
}

export function OfferingsCard({ ids, reason }: { ids: string[]; reason: string }) {
  const list = ids.map(getOffering).filter((o): o is NonNullable<typeof o> => Boolean(o));
  if (!list.length) return null;
  return (
    <div className="card offerings-card" aria-label="Tangerine offerings to learn about">
      <p className="card-kicker">Tangerine offerings to learn about</p>
      <p className="offerings-reason">{reason}</p>
      <div className="offerings">
        {list.map((o) => {
          const url = offeringUrl(o);
          const reviewed = getEntry(o.sources[0])?.reviewed;
          return (
            <details key={o.id} className="offering">
              <summary>
                <strong>{o.name}</strong>
                <span>{o.summary}</span>
              </summary>
              <div className="offering-body">
                <p className="offering-h">Features</p>
                <ul>
                  {o.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {o.conditions.length > 0 && (
                  <>
                    <p className="offering-h">Fees and conditions</p>
                    <ul>
                      {o.conditions.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </>
                )}
                {o.risks.length > 0 && (
                  <>
                    <p className="offering-h">Risks</p>
                    <ul>
                      {o.risks.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="offering-links">
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer">
                      Official page
                    </a>
                  )}
                  {reviewed && <span className="source-date"> · Verified {formatDate(reviewed)}</span>}
                </p>
              </div>
            </details>
          );
        })}
      </div>
      <p className="card-note">Relevant to learn about based on what you said; not a recommendation or suitability check. Other institutions offer similar products.</p>
    </div>
  );
}

export function ScenarioCard({ input, hypothetical = false, outdated = false }: { input: ScenarioFacts; hypothetical?: boolean; outdated?: boolean }) {
  const r = projectWithoutReturns(input);
  if (!r.valid) return null;
  return (
    <div className="card scenario-card" aria-label="Illustrative scenario">
      <div className="card-head">
        <p className="card-kicker">{hypothetical ? 'What-if scenario' : 'Illustrative scenario'}</p>
        {outdated && <span className="tag">Earlier figures · since updated</span>}
      </div>
      <dl className="figures">
        <div>
          <dt>Starting amount</dt>
          <dd>{money(input.start)}</dd>
        </div>
        <div>
          <dt>
            {money(input.monthly)}/mo × {input.months} mo
          </dt>
          <dd>+{money(r.contributions)}</dd>
        </div>
        <div className="figure-strong">
          <dt>Total before interest or returns</dt>
          <dd>{money(r.total)}</dd>
        </div>
        {input.target !== null && (
          <div className="figure-strong">
            <dt>{r.gapAtEnd ? 'Short of your target' : 'Target'}</dt>
            <dd>{r.gapAtEnd ? money(r.gapAtEnd) : 'Reached'}</dd>
          </div>
        )}
      </dl>
      <p className="card-note">Simple arithmetic with your numbers. Excludes interest, investment returns, fees and taxes; not a forecast.</p>
    </div>
  );
}

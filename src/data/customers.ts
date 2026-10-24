/**
 * Synthetic customer relationships for the three demo scenarios.
 * Balances, history and transactions are generated deterministically from
 * each spec, so the signal engine evaluates real (synthetic) data.
 */
import { generateHistory, monthlyFlows, type DailyBalance, type HistorySpec, type Txn } from '../domain/history.ts';

export interface DemoAnswers {
  /** What the customer says the money is for (scripted quick reply). */
  moneyPurpose: string;
  /** Goal phrasing for the main path (scripted quick reply). */
  goal?: string;
}

export interface Relationship {
  id: string;
  firstName: string;
  age: number;
  spec: HistorySpec;
  monthlyIncome: number;
  monthlyExpenses: number;
  balances: DailyBalance[];
  transactions: Txn[];
  /** Synthetic review flag (unusual or incomplete activity) suppresses opportunity nudges. */
  reviewFlag: boolean;
  /** Limits history to the last N days before today (null = all), to demonstrate the data-sufficiency check. */
  historyDaysAvailable: number | null;
  demoAnswers: DemoAnswers;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  build: () => Relationship;
}

/** Demo "today" (synthetic). Later visits move forward from here. */
export const DEMO_TODAY = '2026-10-23';
const TODAY_INDEX = 119; // 120 days of history before the first visit
const TOTAL_DAYS = TODAY_INDEX + 1 + 120; // room for later visits

function relationship(
  base: Omit<Relationship, 'balances' | 'transactions' | 'monthlyIncome' | 'monthlyExpenses' | 'reviewFlag' | 'historyDaysAvailable'>,
): Relationship {
  const { balances, transactions } = generateHistory(base.spec);
  const flows = monthlyFlows(base.spec);
  return { ...base, balances, transactions, monthlyIncome: flows.income, monthlyExpenses: flows.expenses, reviewFlag: false, historyDaysAvailable: null };
}

export const PRESETS: Preset[] = [
  {
    id: 'alex',
    label: 'A · Alex: potential wealth conversation',
    description: 'Chequing has stayed above $25,000 for 90 days. Alex wants to learn about building wealth.',
    build: () =>
      relationship({
        id: 'alex',
        firstName: 'Alex',
        age: 27,
        spec: {
          seed: 27,
          totalDays: TOTAL_DAYS,
          todayIndex: TODAY_INDEX,
          todayDate: DEMO_TODAY,
          chequingToday: 28_000,
          savingsToday: 12_000,
          paycheque: 2_600, // $5,200 / month take-home
          rent: 1_850,
          bills: 450,
          variableSpending: 1_300, // ≈ $3,600 / month expenses in total
          savingsTransfer: 1_200,
        },
        demoAnswers: {
          moneyPurpose: 'I need $3,000 for bills and $10,000 for emergencies.',
          goal: 'I want to build wealth, but I don’t know how investing works.',
        },
      }),
  },
  {
    id: 'priya',
    label: 'B · Priya: money already committed',
    description: 'Chequing has stayed above $25,000, but it is set aside for tuition. Sunny acknowledges and stops suggesting it.',
    build: () =>
      relationship({
        id: 'priya',
        firstName: 'Priya',
        age: 24,
        spec: {
          seed: 24,
          totalDays: TOTAL_DAYS,
          todayIndex: TODAY_INDEX,
          todayDate: DEMO_TODAY,
          chequingToday: 31_500,
          savingsToday: 4_000,
          paycheque: 2_050,
          rent: 1_500,
          bills: 400,
          variableSpending: 1_400,
          savingsTransfer: 0,
        },
        demoAnswers: { moneyPurpose: 'That money is for my tuition in January.' },
      }),
  },
  {
    id: 'sam',
    label: 'C · Sam: no qualifying signal',
    description: 'Chequing rises and falls with pay and bills and never stays above the threshold. No opportunity nudge is shown.',
    build: () =>
      relationship({
        id: 'sam',
        firstName: 'Sam',
        age: 31,
        spec: {
          seed: 31,
          totalDays: TOTAL_DAYS,
          todayIndex: TODAY_INDEX,
          todayDate: DEMO_TODAY,
          chequingToday: 6_800,
          savingsToday: 9_500,
          paycheque: 2_300,
          rent: 1_900,
          bills: 500,
          variableSpending: 1_800,
          savingsTransfer: 300,
        },
        demoAnswers: { moneyPurpose: 'It’s mostly for rent and bills.' },
      }),
  },
];

export function buildPreset(id: string): Relationship {
  return (PRESETS.find((p) => p.id === id) ?? PRESETS[0]).build();
}

/** Balances visible to the signal engine, honouring the demo's data-availability setting. */
export function visibleHistory(r: Relationship, todayIndex: number): DailyBalance[] {
  const upToToday = r.balances.filter((b) => b.day <= todayIndex);
  const available = r.historyDaysAvailable;
  return available === null ? upToToday : upToToday.filter((b) => b.day > todayIndex - available);
}

export function balancesOn(r: Relationship, dayIndex: number) {
  const b = r.balances[Math.min(Math.max(dayIndex, 0), r.balances.length - 1)];
  return { chequing: b.chequing, savings: b.savings, date: b.date };
}

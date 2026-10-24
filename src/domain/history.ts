/**
 * Deterministic synthetic account history. Generates daily transactions and
 * closing balances that are internally consistent: each closing balance equals
 * the previous closing balance plus that day's transactions.
 *
 * Synthetic data only. Not real customers or accounts.
 */

export type AccountId = 'chequing' | 'savings';

export interface DailyBalance {
  /** Day index from the start of the generated history. */
  day: number;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  chequing: number;
  savings: number;
}

export interface Txn {
  day: number;
  date: string;
  account: AccountId;
  description: string;
  /** Signed: positive = money in, negative = money out. */
  amount: number;
}

export interface HistorySpec {
  seed: number;
  /** Total days generated (covers the first visit plus simulated later visits). */
  totalDays: number;
  /** Index of the first visit's "today" (the last day of the initial observation window). */
  todayIndex: number;
  /** ISO date for todayIndex. */
  todayDate: string;
  chequingToday: number;
  savingsToday: number;
  /** Paid on the 1st and 15th. */
  paycheque: number;
  rent: number;
  /** Fixed monthly bills (utilities, phone, insurance), split across the month. */
  bills: number;
  /** Approximate variable spending per month (groceries, transit, other). */
  variableSpending: number;
  /** Monthly automatic transfer from chequing to savings on the 16th (0 for none). */
  savingsTransfer: number;
  /** One-off events, day offsets relative to todayIndex (negative = past). */
  events?: { offset: number; account: AccountId; description: string; amount: number }[];
}

/** Small seeded PRNG (mulberry32) so histories are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface GeneratedHistory {
  balances: DailyBalance[];
  transactions: Txn[];
}

export function generateHistory(spec: HistorySpec): GeneratedHistory {
  const rand = rng(spec.seed);
  const startDate = addDays(spec.todayDate, -spec.todayIndex);
  const txns: Txn[] = [];
  const push = (day: number, account: AccountId, description: string, amount: number) =>
    txns.push({ day, date: addDays(startDate, day), account, description, amount: round2(amount) });

  for (let day = 0; day < spec.totalDays; day++) {
    const dom = Number(addDays(startDate, day).slice(8, 10));
    if (dom === 1 || dom === 15) push(day, 'chequing', 'Payroll deposit', spec.paycheque);
    if (dom === 1) push(day, 'chequing', 'Rent', -spec.rent);
    if (dom === 5) push(day, 'chequing', 'Utilities and phone', -spec.bills * 0.6);
    if (dom === 20) push(day, 'chequing', 'Insurance', -spec.bills * 0.4);
    if (dom === 16 && spec.savingsTransfer > 0) {
      push(day, 'chequing', 'Automatic transfer to Savings', -spec.savingsTransfer);
      push(day, 'savings', 'Automatic transfer from Chequing', spec.savingsTransfer);
    }
    // Variable spending on roughly every other day, totalling about the monthly amount.
    if (rand() < 0.5) {
      const amount = (spec.variableSpending / 15) * (0.6 + rand() * 0.8);
      const kinds = ['Groceries', 'Transit', 'Restaurants', 'Pharmacy', 'Online shopping'];
      push(day, 'chequing', kinds[Math.floor(rand() * kinds.length)], -amount);
    }
  }
  for (const e of spec.events ?? []) {
    const day = spec.todayIndex + e.offset;
    if (day >= 0 && day < spec.totalDays) push(day, e.account, e.description, e.amount);
  }

  // Net flow per day per account, then anchor balances at todayIndex.
  const net = { chequing: new Array(spec.totalDays).fill(0), savings: new Array(spec.totalDays).fill(0) };
  for (const t of txns) net[t.account][t.day] += t.amount;

  const series = (account: AccountId, today: number) => {
    const out = new Array<number>(spec.totalDays);
    out[spec.todayIndex] = today;
    for (let d = spec.todayIndex - 1; d >= 0; d--) out[d] = round2(out[d + 1] - net[account][d + 1]);
    for (let d = spec.todayIndex + 1; d < spec.totalDays; d++) out[d] = round2(out[d - 1] + net[account][d]);
    return out;
  };
  const chq = series('chequing', spec.chequingToday);
  const sav = series('savings', spec.savingsToday);

  const balances: DailyBalance[] = chq.map((c, day) => ({ day, date: addDays(startDate, day), chequing: c, savings: sav[day] }));
  txns.sort((a, b) => a.day - b.day || a.amount - b.amount);
  return { balances, transactions: txns };
}

/** Monthly flows implied by a spec (for display and checks). */
export function monthlyFlows(spec: HistorySpec) {
  return {
    income: spec.paycheque * 2,
    expenses: spec.rent + spec.bills + spec.variableSpending,
  };
}

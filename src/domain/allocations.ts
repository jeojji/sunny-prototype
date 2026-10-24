/**
 * Customer-stated allocations of account balances. Balances come from the
 * account; allocations are what the customer says the money is for. Money is
 * never counted twice: each allocation belongs to exactly one account, and
 * an account's allocations can't exceed its balance.
 */
import type { AccountId } from './history';

export type Purpose = 'upcoming_expenses' | 'emergency' | 'tuition' | 'debt_repayment' | 'other';

export const PURPOSE_LABEL: Record<Purpose, string> = {
  upcoming_expenses: 'Upcoming expenses',
  emergency: 'Emergency reserve',
  tuition: 'Tuition',
  debt_repayment: 'Debt repayment',
  other: 'Set aside for something else',
};

export interface Allocation {
  account: AccountId;
  purpose: Purpose;
  amount: number;
}

export interface AccountAllocation {
  account: AccountId;
  balance: number;
  allocated: number;
  /** Balance not yet assigned to a purpose (never negative). */
  unassigned: number;
  overBy: number;
  items: Allocation[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Add or replace an allocation (one per account + purpose). Returns a new list. */
export function upsertAllocation(list: Allocation[], next: Allocation): Allocation[] {
  const rest = list.filter((a) => !(a.account === next.account && a.purpose === next.purpose));
  return next.amount > 0 ? [...rest, { ...next, amount: round2(next.amount) }] : rest;
}

export function summarizeAccount(account: AccountId, balance: number, list: Allocation[]): AccountAllocation {
  const items = list.filter((a) => a.account === account);
  const allocated = round2(items.reduce((s, a) => s + a.amount, 0));
  return {
    account,
    balance,
    allocated,
    unassigned: round2(Math.max(0, balance - allocated)),
    overBy: round2(Math.max(0, allocated - balance)),
    items,
  };
}

export type AllocationCheck =
  | { ok: true; list: Allocation[]; summary: AccountAllocation }
  | { ok: false; reason: 'negative' | 'not_a_number' | 'exceeds_balance'; summary?: AccountAllocation; total?: number };

/** Validate applying one or more allocations to an account against its balance. */
export function applyAllocations(list: Allocation[], updates: Allocation[], balances: Record<AccountId, number>): AllocationCheck {
  let next = list;
  for (const u of updates) {
    if (typeof u.amount !== 'number' || !Number.isFinite(u.amount)) return { ok: false, reason: 'not_a_number' };
    if (u.amount < 0) return { ok: false, reason: 'negative' };
    next = upsertAllocation(next, u);
  }
  for (const account of new Set(updates.map((u) => u.account))) {
    const summary = summarizeAccount(account, balances[account], next);
    if (summary.overBy > 0) return { ok: false, reason: 'exceeds_balance', summary, total: summary.allocated };
  }
  const account = updates[0]?.account ?? 'chequing';
  return { ok: true, list: next, summary: summarizeAccount(account, balances[account], next) };
}

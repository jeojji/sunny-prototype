/**
 * Synthetic customer profiles. Not real people or real accounts.
 *
 * Fields split into two groups:
 *  - Snapshot: what Sunny may see if the customer grants permission
 *    (balances and cash flow only).
 *  - Customer's own answers: what the customer *would say* when asked
 *    (earmarked emergency money, target, timeline, monthly amount).
 *    Sunny never sees these until the customer confirms them in conversation.
 */
export interface CustomerProfile {
  id: string;
  firstName: string;
  age: number;
  // Snapshot
  chequingBalance: number;
  /** Total savings balance. Any emergency reserve is INCLUDED in this figure. */
  savingsBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  otherSavingsCommitments: number;
  // Customer's own answers (used to pre-fill their replies in the demo)
  /** Portion of savingsBalance the customer keeps for emergencies. */
  emergencyReserve: number;
  homeTarget: number;
  timelineMonths: number;
  monthlyToExplore: number;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  profile: CustomerProfile;
}

export const DEFAULT_PROFILE: CustomerProfile = {
  id: 'alex',
  firstName: 'Alex',
  age: 27,
  chequingBalance: 4200,
  savingsBalance: 24000,
  monthlyIncome: 4800,
  monthlyExpenses: 3500,
  otherSavingsCommitments: 0,
  emergencyReserve: 10000,
  homeTarget: 50000,
  timelineMonths: 36,
  monthlyToExplore: 700,
};

export const PRESETS: Preset[] = [
  {
    id: 'alex',
    label: 'Alex: three-year home goal',
    description: 'Default story. $24,000 savings with $10,000 kept for emergencies; exploring $700/month over 36 months.',
    profile: DEFAULT_PROFILE,
  },
  {
    id: 'jordan',
    label: 'Jordan: buying within one year',
    description: 'Shorter timeline. $42,000 savings with $12,000 kept for emergencies; exploring $1,200/month over 9 months.',
    profile: {
      id: 'jordan',
      firstName: 'Jordan',
      age: 31,
      chequingBalance: 6500,
      savingsBalance: 42000,
      monthlyIncome: 5600,
      monthlyExpenses: 3900,
      otherSavingsCommitments: 0,
      emergencyReserve: 12000,
      homeTarget: 45000,
      timelineMonths: 9,
      monthlyToExplore: 1200,
    },
  },
  {
    id: 'sam',
    label: 'Sam: no monthly savings available',
    description: 'Expenses slightly exceed income. $3,000 savings, all kept for emergencies; cannot set money aside right now.',
    profile: {
      id: 'sam',
      firstName: 'Sam',
      age: 25,
      chequingBalance: 1900,
      savingsBalance: 3000,
      monthlyIncome: 3400,
      monthlyExpenses: 3450,
      otherSavingsCommitments: 0,
      emergencyReserve: 3000,
      homeTarget: 40000,
      timelineMonths: 60,
      monthlyToExplore: 0,
    },
  },
];

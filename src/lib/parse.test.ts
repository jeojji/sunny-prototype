import { describe, expect, it } from 'vitest';
import { findAmounts, findDurations } from './parse';

const values = (t: string) => findAmounts(t).map((a) => (a.negative ? -a.value : a.value));

describe('findAmounts', () => {
  it('reads common formats and skips durations and percentages', () => {
    expect(values('keep $10,000 for emergencies')).toEqual([10000]);
    expect(values('I have 14000 and want 1.5k monthly')).toEqual([14000, 1500]);
    expect(values('buy in 3 years with $50k')).toEqual([50000]);
    expect(values('36 months')).toEqual([]);
    expect(values('5% down')).toEqual([]);
    expect(values('I can save $1,200.50/month')).toEqual([1200.5]);
  });

  it('keeps negative signs instead of silently dropping them', () => {
    expect(values('-500 a month')).toEqual([-500]);
    expect(values('minus 200')).toEqual([-200]);
    expect(values('$-300')).toEqual([-300]);
  });
});

describe('findDurations', () => {
  it('converts to months', () => {
    expect(findDurations('in 3 years')).toEqual([36]);
    expect(findDurations('about 18 months')).toEqual([18]);
    expect(findDurations('2.5 yrs')).toEqual([30]);
  });
});

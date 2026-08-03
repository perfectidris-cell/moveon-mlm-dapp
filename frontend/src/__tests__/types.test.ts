import { describe, it, expect } from 'vitest';
import type { UserInfo, UserFinancialInfo, Page } from '../types';

describe('types', () => {
  it('UserInfo has correct shape', () => {
    const info: UserInfo = {
      id: '0x0000000000000000000000000000000000000000',
      referrer: '0x0000000000000000000000000000000000000000',
      level: 1,
      directReferrals: 0,
      totalReferrals: 0,
      totalEarnings: '0',
      lastActiveTime: 0,
    };
    expect(info.level).toBe(1);
  });

  it('UserFinancialInfo has correct shape', () => {
    const info: UserFinancialInfo = {
      levelEarnings: [],
      reservedForUpgrade: [],
      totalReservedBalance: '0',
    };
    expect(info.totalReservedBalance).toBe('0');
  });

  it('Page type accepts valid values', () => {
    const pages: Page[] = ['home', 'dashboard', 'downline'];
    expect(pages).toHaveLength(3);
  });
});

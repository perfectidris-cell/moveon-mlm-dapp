export interface UserInfo {
  id: string;
  referrer: string;
  level: number;
  directReferrals: number;
  totalReferrals: number;
  totalEarnings: string;
  lastActiveTime: number;
}

export interface UserFinancialInfo {
  levelEarnings: string[];
  reservedForUpgrade: string[];
  withdrawableBalance?: string[];
  totalWithdrawableBalance?: string;
  totalReservedBalance: string;
}

export type Page = 'home' | 'dashboard' | 'downline' | 'admin';

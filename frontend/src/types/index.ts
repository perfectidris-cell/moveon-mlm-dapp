export interface User {
    id: string;
    referrer: string;
    level: number;
    directReferrals: number;
    totalReferrals: number;
    totalEarnings: string;
    lastActiveTime: number;
    isExpired: boolean;
    levelEarnings: string[];
    reservedForUpgrade: string[];
    withdrawableBalance: string[];
    totalWithdrawableBalance: string;
    totalReservedBalance: string;
}

export interface LevelCost {
    level: number;
    costUSD: string;
    costMatic: string;
}

export interface TransactionResult {
    success: boolean;
    hash?: string;
    error?: string;
}
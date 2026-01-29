import { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import type { User } from '../types/index';

interface DashboardDataHook {
    userData: User | null;
    loading: boolean;
    error: string | null;
    isRefreshing: boolean;
    refreshData: () => Promise<void>;
}

export const useDashboardData = (): DashboardDataHook => {
    const { account, contract } = useWeb3();
    const [userData, setUserData] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchUserData = useCallback(async (isRefresh = false) => {
        if (!account || !contract.contract) {
            setLoading(false);
            return;
        }

        try {
            if (isRefresh) {
                setIsRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            // Artificial delay for better UX on fast refreshes
            if (isRefresh) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            console.log('useDashboardData: Fetching user data for account:', account);
            console.log('useDashboardData: Contract address:', contract.contract?.target?.toString());
            const data = await contract.getUserInfo(account);
            console.log('useDashboardData: Fetched user data:', data);
            setUserData(data);
        } catch (err: any) {
            console.error('useDashboardData: Error fetching user data:', err);
            console.error('useDashboardData: Error message:', err.message);
            
            // If user not registered, set userData to null instead of error
            if (err.message && err.message.includes('User not registered')) {
                setUserData(null);
                setError(null);
            } else {
                setError(err.message || 'Failed to load user data');
            }
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [account, contract]);

    useEffect(() => {
        fetchUserData();
    }, [fetchUserData]);

    return {
        userData,
        loading,
        error,
        isRefreshing,
        refreshData: () => fetchUserData(true)
    };
};

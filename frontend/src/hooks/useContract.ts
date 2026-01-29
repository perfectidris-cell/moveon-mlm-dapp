import { useMemo } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../utils/config';

export const useContract = (provider?: ethers.BrowserProvider, signer?: ethers.Signer) => {
    const contract = useMemo(() => {
        if (!provider) return null;

        const contractInterface = new ethers.Interface(CONTRACT_ABI);
        return new ethers.Contract(CONTRACT_ADDRESS, contractInterface, signer || provider);
    }, [provider, signer]);

    const getUserInfo = async (userAddress: string) => {
        if (!contract) throw new Error('Contract not initialized');

        // Get basic user info (returns 8 values)
        const basicInfo = await contract.getUserInfo(userAddress);

        // Get financial info (returns 5 values: 3 arrays of 13 elements each + 2 totals)
        const financialInfo = await contract.getUserFinancialInfo(userAddress);

        return {
            id: basicInfo[0],
            referrer: basicInfo[1],
            level: Number(basicInfo[2]),
            directReferrals: Number(basicInfo[3]),
            totalReferrals: Number(basicInfo[4]),
            totalEarnings: ethers.formatEther(basicInfo[5]),
            lastActiveTime: Number(basicInfo[6]),
            isExpired: basicInfo[7],
            levelEarnings: financialInfo[0].map((e: bigint) => ethers.formatEther(e)),
            reservedForUpgrade: financialInfo[1].map((r: bigint) => ethers.formatEther(r)),
            withdrawableBalance: financialInfo[2].map((w: bigint) => ethers.formatEther(w)),
            totalWithdrawableBalance: ethers.formatEther(financialInfo[3]),
            totalReservedBalance: ethers.formatEther(financialInfo[4])
        };
    };

    const register = async (referrer: string, value: string) => {
        if (!contract || !signer) throw new Error('Signer required for transactions');

        const tx = await contract.register(referrer, { value: ethers.parseEther(value) });
        return await tx.wait();
    };

    const quickUpgrade = async (level: number) => {
        if (!contract || !signer) throw new Error('Signer required for transactions');

        const tx = await contract.quickUpgrade(level);
        return await tx.wait();
    };

    const walletUpgrade = async (level: number, value: string) => {
        if (!contract || !signer) throw new Error('Signer required for transactions');

        const tx = await contract.walletUpgrade(level, { value: ethers.parseEther(value) });
        return await tx.wait();
    };

    const withdrawFromLevel = async (level: number, amount: string) => {
        if (!contract || !signer) throw new Error('Signer required for transactions');

        const tx = await contract.withdrawFromLevel(level, ethers.parseEther(amount));
        return await tx.wait();
    };

    const withdrawAllWithdrawable = async () => {
        if (!contract || !signer) throw new Error('Signer required for transactions');

        const tx = await contract.withdrawAllWithdrawable();
        return await tx.wait();
    };

    const getRegistrationFeeCro = async () => {
        if (!contract) throw new Error('Contract not initialized');

        const fee = await contract.getRegistrationFeeCro();
        return ethers.formatEther(fee);
    };

    const getLevelUpgradeCostCro = async (level: number) => {
        if (!contract) throw new Error('Contract not initialized');

        const cost = await contract.getLevelUpgradeCostCro(level);
        return ethers.formatEther(cost);
    };

    const reactivateAccount = async (value: string) => {
        if (!contract || !signer) throw new Error('Signer required for transactions');

        const tx = await contract.reactivateAccount({ value: ethers.parseEther(value) });
        return await tx.wait();
    };

    const checkInactiveUsers = async () => {
        if (!contract || !signer) throw new Error('Signer required for transactions');

        const tx = await contract.checkInactiveUsers();
        return await tx.wait();
    };

    const getDownline = async (userAddress: string, depth: number) => {
        if (!contract) throw new Error('Contract not initialized');
        return await contract.getDownline(userAddress, depth);
    };

    return useMemo(() => ({
        contract,
        getUserInfo,
        register,
        quickUpgrade,
        walletUpgrade,
        withdrawFromLevel,
        withdrawAllWithdrawable,
        getRegistrationFeeCro,
        getLevelUpgradeCostCro,
        reactivateAccount,
        checkInactiveUsers,
        getDownline
    }), [contract, provider, signer]);
};
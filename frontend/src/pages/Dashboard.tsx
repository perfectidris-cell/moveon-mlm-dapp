import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle,
    RefreshCw,
    Users
} from 'lucide-react';
import StatsGrid from '../components/Dashboard/StatsGrid';
import ActionGrid from '../components/Dashboard/ActionGrid';
import LevelTable from '../components/Dashboard/LevelTable';
import NetworkSummary from '../components/Dashboard/NetworkSummary';
import { useDashboardData } from '../hooks/useDashboardData';

const Dashboard: React.FC = () => {
    const { account, contract, connectWallet } = useWeb3();
    const navigate = useNavigate();
    const { userData, loading, error, isRefreshing, refreshData } = useDashboardData();

    // Action handling states during mutations
    const [isUpgrading, setIsUpgrading] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [nextLevelCost, setNextLevelCost] = useState<string | null>(null);
    const [canQuickUpgrade, setCanQuickUpgrade] = useState(false);
    const [isCheckingInactive, setIsCheckingInactive] = useState(false);
    const [levelCosts, setLevelCosts] = useState<string[]>([]);

    // Fetch upgrade cost and check balance
    useEffect(() => {
        const fetchUpgradeInfo = async () => {
            if (!userData || !contract.contract) {
                setNextLevelCost(null);
                setCanQuickUpgrade(false);
                setLevelCosts([]);
                return;
            }

            try {
                // Fetch all level costs
                const costs: string[] = [];
                for (let i = 1; i <= 12; i++) {
                    try {
                        const cost = await contract.getLevelUpgradeCostCro(i);
                        costs[i] = cost;
                    } catch {
                        costs[i] = '0';
                    }
                }
                setLevelCosts(costs);

                if (userData.level >= 12) {
                    setNextLevelCost(null);
                    setCanQuickUpgrade(false);
                    return;
                }

                const nextLevel = userData.level + 1;
                const cost = costs[nextLevel];
                setNextLevelCost(cost);

                const totalWithdrawable = parseFloat(userData.totalWithdrawableBalance);
                const totalReserved = parseFloat(userData.totalReservedBalance);
                const costValue = parseFloat(cost);
                setCanQuickUpgrade((totalWithdrawable + totalReserved) >= costValue);
            } catch (err) {
                console.error('Error fetching upgrade info:', err);
                setNextLevelCost(null);
                setCanQuickUpgrade(false);
                setLevelCosts([]);
            }
        };

        fetchUpgradeInfo();
    }, [userData, contract]);

    const handleQuickUpgrade = async () => {
        if (!userData || !contract.contract) return;

        try {
            setIsUpgrading(true);
            const nextLevel = userData.level + 1;
            const cost = await contract.getLevelUpgradeCostCro(nextLevel);
            console.log('Quick upgrade - Next level:', nextLevel, 'Cost:', cost, 'Total withdrawable:', userData.totalWithdrawableBalance);
            await contract.quickUpgrade(nextLevel);
            await refreshData();
        } catch (err: unknown) {
            console.error('Quick upgrade failed:', err);
            alert(err instanceof Error ? err.message : 'Failed to upgrade');
        } finally {
            setIsUpgrading(false);
        }
    };

    const handleWalletUpgrade = async (level: number) => {
        if (!contract.contract) return;
        try {
            setIsUpgrading(true);
            const cost = await contract.getLevelUpgradeCostCro(level);
            console.log('Wallet upgrade - Level:', level, 'Cost:', cost);
            await contract.walletUpgrade(level, cost);
            await refreshData();
        } catch (err: any) {
            console.error('Wallet upgrade failed:', err);
            alert(err.message || 'Failed to upgrade');
        } finally {
            setIsUpgrading(false);
        }
    };

    const handleReactivate = async () => {
        if (!contract.contract) return;
        try {
            setIsUpgrading(true); // Re-using isUpgrading for reactivation
            const fee = await contract.getRegistrationFeeCro();
            await contract.reactivateAccount(fee);
            await refreshData();
        } catch (err: any) {
            alert(err.message || 'Failed to reactivate');
        } finally {
            setIsUpgrading(false);
        }
    };

    const handleWithdrawFromLevel = async (level: number, amount: string) => {
        if (!contract.contract) return;
        try {
            setIsWithdrawing(true);
            await contract.withdrawFromLevel(level, amount);
            await refreshData();
        } catch (err: any) {
            alert(err.message || 'Failed to withdraw');
        } finally {
            setIsWithdrawing(false);
        }
    };

    const handleWithdrawAll = async () => {
        if (!contract.contract || !account) return;
        try {
            setIsWithdrawing(true);
            console.log('UI totalWithdrawableBalance:', userData?.totalWithdrawableBalance);
            const contractBalance = await contract.contract.getTotalWithdrawableBalance(account);
            console.log('Contract totalWithdrawableBalance (raw):', contractBalance.toString());
            console.log('Contract totalWithdrawableBalance (formatted):', ethers.formatEther(contractBalance));
            await contract.withdrawAllWithdrawable();
            await refreshData();
        } catch (err: any) {
            console.error('Withdraw all error:', err);
            alert(err.message || 'Failed to withdraw all');
        } finally {
            setIsWithdrawing(false);
        }
    };

    const handleCheckInactiveUsers = async () => {
        if (!contract.contract) return;
        try {
            setIsCheckingInactive(true);
            await contract.checkInactiveUsers();
            alert('Inactive users have been checked and marked as expired if applicable.');
            await refreshData();
        } catch (err: any) {
            alert(err.message || 'Failed to check inactive users');
        } finally {
            setIsCheckingInactive(false);
        }
    };

    if (!account) {
        return (
            <div className="min-h-screen relative font-inter flex items-center justify-center p-4 bg-[#0a0a0f]">
                <div className="aurora-bg"></div>
                <div className="glass-panel rounded-3xl p-8 md:p-12 max-w-md w-full text-center border border-white/10 shadow-[0_0_50px_rgba(176,38,255,0.2)]">
                    <h2 className="text-2xl md:text-3xl font-outfit font-bold text-white mb-6">Connect Your Wallet</h2>
                    <p className="text-gray-400 mb-8 text-sm md:text-base">Please connect your wallet to access your dashboard</p>
                    <button
                        onClick={connectWallet}
                        className="w-full px-8 py-4 bg-linear-to-r from-neon-purple to-cyber-pink text-white font-bold rounded-xl hover:opacity-90 transition-all shadow-lg transform hover:scale-105"
                    >
                        Connect Wallet
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        className="mt-6 text-gray-500 hover:text-white transition-colors text-sm"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen font-inter flex items-center justify-center bg-[#0a0a0f]">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-neon-purple/30 border-t-neon-purple rounded-full animate-spin mb-4"></div>
                    <div className="text-white text-lg md:text-xl font-outfit animate-pulse">Loading data...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen relative font-inter flex items-center justify-center p-4 bg-[#0a0a0f]">
                <div className="aurora-bg"></div>
                <div className="glass-panel rounded-3xl p-8 md:p-12 max-w-md w-full text-center">
                    <h2 className="text-2xl md:text-3xl font-bold text-red-500 mb-4">Connection Error</h2>
                    <p className="text-gray-300 mb-8 text-sm">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                    >
                        Return Home
                    </button>
                </div>
            </div>
        );
    }

    if (!userData) {
        return (
            <div className="min-h-screen relative font-inter flex items-center justify-center p-4 bg-[#0a0a0f]">
                <div className="aurora-bg"></div>
                <div className="glass-panel rounded-3xl p-8 md:p-12 max-w-md w-full text-center border border-white/10">
                    <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Not Registered</h2>
                    <p className="text-gray-400 mb-4 text-sm">Your wallet address is not registered in the system. Please complete the registration process first.</p>
                    <p className="text-gray-500 text-xs mb-8 font-mono bg-white/5 p-3 rounded">{account}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="w-full px-8 py-4 bg-linear-to-r from-neon-purple to-cyber-pink text-white font-bold rounded-xl hover:opacity-90 transition-all shadow-lg"
                    >
                        Go to Registration
                    </button>
                    <button
                        onClick={() => {
                            // Refresh data in case there's a delay
                            refreshData();
                        }}
                        className="w-full mt-3 px-8 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all"
                    >
                        Refresh
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen font-inter text-white pb-20 relative bg-[#0a0a0f]">
            <div className="aurora-bg"></div>

            <Navbar />

            <div className="container mx-auto px-4 py-8 max-w-7xl relative z-10">
                <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pt-24">
                    <div className="flex-1">
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-outfit font-bold mb-2">
                            Dashboard <span className="text-gradient">Overview</span>
                        </h1>
                        <p className="text-gray-400 text-sm md:text-base">Welcome back, manage your matrix and earnings.</p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        {userData.isExpired && (
                            <div className="px-5 py-2 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 font-bold animate-pulse text-xs md:text-sm flex items-center gap-2">
                                <AlertTriangle size={16} /> Account Expired
                            </div>
                        )}
                        <button
                            onClick={handleCheckInactiveUsers}
                            disabled={isCheckingInactive}
                            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-gray-400 hover:text-white disabled:opacity-50"
                            title="Check Inactive Users"
                        >
                            <Users size={20} className={isCheckingInactive ? "animate-spin" : ""} />
                        </button>
                        <button
                            onClick={() => refreshData()}
                            disabled={isRefreshing}
                            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-gray-400 hover:text-white disabled:opacity-50"
                            title="Refresh Data"
                        >
                            <RefreshCw size={20} className={isRefreshing ? "animate-spin" : ""} />
                        </button>
                    </div>
                </header>

                {/* Account Expired Action */}
                <AnimatePresence>
                    {userData.isExpired && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="glass-panel p-6 md:p-8 mb-10 md:mb-12 rounded-3xl border border-red-500/30 bg-red-500/5 flex flex-col md:flex-row items-center justify-between gap-6"
                        >
                            <div className="text-center md:text-left">
                                <h2 className="text-xl md:text-2xl font-bold text-red-400 mb-2 flex items-center gap-2">
                                    <AlertTriangle /> Reactivation Required
                                </h2>
                                <p className="text-gray-300 max-w-xl text-xs md:text-sm">
                                    Your account has been inactive for more than 100 days.
                                    Reactivate now to resume earning commissions and maintaining your position.
                                </p>
                            </div>
                            <button
                                onClick={handleReactivate}
                                disabled={isUpgrading}
                                className="w-full md:w-auto px-8 py-3.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] whitespace-nowrap text-sm"
                            >
                                {isUpgrading ? 'Processing...' : 'Reactivate Account'}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <StatsGrid userData={userData} />

                <ActionGrid
                    userData={userData}
                    isWithdrawing={isWithdrawing}
                    isUpgrading={isUpgrading}
                    nextLevelCost={nextLevelCost || undefined}
                    canQuickUpgrade={canQuickUpgrade}
                    onWithdrawAll={handleWithdrawAll}
                    onQuickUpgrade={handleQuickUpgrade}
                    onWalletUpgrade={handleWalletUpgrade}
                />

                <NetworkSummary userData={userData} />

                <LevelTable
                    userData={userData}
                    isWithdrawing={isWithdrawing}
                    levelCosts={levelCosts}
                    onWithdrawFromLevel={handleWithdrawFromLevel}
                />

                {/* Footer Info */}
                <div className="mt-12 text-center text-gray-500 text-[10px] md:text-xs pb-8">
                    <p>Contract: <span className="font-mono text-gray-400">{contract.contract?.target?.toString().slice(0, 10)}...</span></p>
                    <p className="mt-2 text-gray-600">
                        Last updated: {new Date().toLocaleTimeString()}
                        {isRefreshing && <span className="ml-2 text-neon-purple animate-pulse">(Updating...)</span>}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

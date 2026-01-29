import React from 'react';
import { motion } from 'framer-motion';
import { LogOut, Lock, Zap, Wallet, ChevronRight, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../types/index';

interface ActionGridProps {
    userData: User;
    isWithdrawing: boolean;
    isUpgrading: boolean;
    nextLevelCost?: string;
    canQuickUpgrade?: boolean;
    onWithdrawAll: () => void;
    onQuickUpgrade: () => void;
    onWalletUpgrade: (level: number) => void;
}

const ActionGrid: React.FC<ActionGridProps> = ({
    userData,
    isWithdrawing,
    isUpgrading,
    nextLevelCost,
    canQuickUpgrade = false,
    onWithdrawAll,
    onQuickUpgrade,
    onWalletUpgrade
}) => {
    const navigate = useNavigate();

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-10 md:mb-12">
            {/* Withdrawable Balance */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="glass-panel p-6 md:p-8 rounded-[24px] border border-white/10 relative overflow-hidden flex flex-col group hover:border-emerald-500/30 transition-all duration-500"
            >
                <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 blur-[80px] rounded-full -mr-10 -mt-10 group-hover:bg-emerald-500/20 transition-all duration-500"></div>
                <h2 className="text-obsidian-platinum font-semibold mb-4 md:mb-6 flex items-center tracking-wide uppercase text-xs md:text-sm">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-3 animate-pulse shadow-[0_0_10px_#10b981]"></span>
                    Available Liquidity
                </h2>
                <div className="text-4xl md:text-5xl font-outfit font-black text-white mb-2 tracking-tight">
                    {parseFloat(userData.totalWithdrawableBalance).toFixed(4)}
                </div>
                <div className="text-xs md:text-sm text-gray-500 mb-8 font-mono tracking-wider">CRO TO CLAIM</div>

                <button
                    onClick={onWithdrawAll}
                    disabled={isWithdrawing || parseFloat(userData.totalWithdrawableBalance) === 0}
                    className="w-full py-4 mt-auto bg-linear-to-r from-emerald-500 to-emerald-700 text-white font-bold rounded-xl hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50 disabled:shadow-none text-sm uppercase tracking-widest flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                    {isWithdrawing ? 'Processing...' : <><LogOut size={16} /> Withdraw Assets</>}
                </button>
            </motion.div>

            {/* Reserved Balance */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="glass-panel p-6 md:p-8 rounded-[24px] border border-white/10 relative overflow-hidden flex flex-col group hover:border-obsidian-gold/30 transition-all duration-500"
            >
                <div className="absolute top-0 right-0 w-40 h-40 bg-obsidian-gold/10 blur-[80px] rounded-full -mr-10 -mt-10 group-hover:bg-obsidian-gold/15 transition-all duration-500"></div>
                <h2 className="text-obsidian-platinum font-semibold mb-4 md:mb-6 flex items-center tracking-wide uppercase text-xs md:text-sm">
                    <span className="w-1.5 h-1.5 bg-obsidian-gold rounded-full mr-3 shadow-[0_0_10px_#FFD700]"></span>
                    Upgrade Reserve
                </h2>
                <div className="text-4xl md:text-5xl font-outfit font-black text-white mb-2 tracking-tight">
                    {parseFloat(userData.totalReservedBalance).toFixed(4)}
                </div>
                <div className="text-xs md:text-sm text-gray-500 mb-8 font-mono tracking-wider">CRO LOCKED</div>

                <div className="w-full py-4 mt-auto bg-white/5 text-gray-400 font-bold rounded-xl text-center border border-white/5 cursor-help text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-colors">
                    <Lock size={14} /> Auto-Upgrade Fund
                </div>
            </motion.div>

            {/* Upgrade Actions */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="glass-panel p-6 md:p-8 rounded-[24px] border border-white/10 relative overflow-hidden flex flex-col justify-between group hover:border-obsidian-gold/40 transition-all duration-500"
            >
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-linear-to-tr from-obsidian-gold/20 to-transparent blur-[80px] rounded-full -ml-10 -mb-10 opacity-50"></div>
                <div>
                    <h2 className="text-white font-semibold mb-4 md:mb-6 flex items-center gap-2 tracking-wide uppercase text-xs md:text-sm">
                        <Crown size={18} className="text-obsidian-gold" />
                        Ascension Status
                    </h2>
                    {userData.level < 12 ? (
                        <div className="space-y-4">
                            <div className="text-center">
                                <button
                                    onClick={onQuickUpgrade}
                                    disabled={isUpgrading || !canQuickUpgrade}
                                    className="w-full py-3.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold rounded-xl transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:border-obsidian-gold/50 active:scale-[0.98]"
                                >
                                    <Zap size={16} className={canQuickUpgrade ? "text-obsidian-gold fill-obsidian-gold" : "text-gray-500"} />
                                    Quick Upgrade
                                </button>
                                <div className="flex justify-between items-center px-4 mt-2">
                                    <span className="text-[10px] text-gray-500 uppercase font-bold">Cost</span>
                                    {nextLevelCost ? (
                                        <span className="text-[10px] text-obsidian-gold font-mono font-bold tracking-wider">{parseFloat(nextLevelCost).toFixed(4)} CRO</span>
                                    ) : (
                                        <span className="text-[10px] text-gray-500">-</span>
                                    )}
                                </div>
                                {!canQuickUpgrade && (
                                    <p className="text-red-400/80 text-[10px] mt-1 font-medium">Insufficient Balance</p>
                                )}
                            </div>

                            <div className="relative flex items-center py-2">
                                <div className="grow border-t border-white/5"></div>
                                <span className="shrink-0 mx-4 text-[10px] text-gray-600 uppercase font-bold">OR</span>
                                <div className="grow border-t border-white/5"></div>
                            </div>

                            <div className="text-center">
                                <button
                                    onClick={() => onWalletUpgrade(userData.level + 1)}
                                    disabled={isUpgrading}
                                    className="w-full py-3.5 bg-linear-to-r from-obsidian-gold to-obsidian-gold-dim text-black font-black rounded-xl hover:brightness-110 transition-all shadow-[0_0_20px_rgba(184,134,11,0.2)] text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98]"
                                >
                                    <Wallet size={16} /> Wallet Upgrade
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="inline-block p-4 rounded-full bg-linear-to-br from-obsidian-gold to-transparent border border-obsidian-gold/30 shadow-[0_0_30px_rgba(184,134,11,0.3)] mb-4">
                                <Crown size={32} className="text-white" />
                            </div>
                            <p className="text-obsidian-gold font-black text-lg tracking-widest uppercase">Apex Status</p>
                            <p className="text-gray-500 text-xs mt-1">Maximum Level Achieved</p>
                        </div>
                    )}
                </div>

                {userData.level < 12 && (
                    <div className="mt-8 pt-6 border-t border-white/5">
                        <button
                            onClick={() => navigate('/matrix')}
                            className="text-gray-500 hover:text-obsidian-gold text-xs flex items-center justify-center gap-2 transition-colors mx-auto group uppercase tracking-widest font-bold"
                        >
                            Analyze Matrix <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default ActionGrid;

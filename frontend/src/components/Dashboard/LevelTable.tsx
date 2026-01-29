import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import type { User } from '../../types/index';

interface LevelTableProps {
    userData: User;
    isWithdrawing: boolean;
    levelCosts?: string[];
    onWithdrawFromLevel: (level: number, amount: string) => void;
}

const LevelTable: React.FC<LevelTableProps> = ({ userData, isWithdrawing, levelCosts, onWithdrawFromLevel }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="glass-panel rounded-[24px] border border-white/10 overflow-hidden shadow-2xl"
        >
            <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-bold font-outfit text-white tracking-tight">Level Performance</h2>
                <div className="text-xs text-gray-500 uppercase tracking-widest font-bold">12 Active Levels</div>
            </div>

            {/* Desktop/Tablet Table View */}
            <div className="hidden md:block overflow-x-auto scrollbar-hide">
                <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-black/40 text-[10px] md:text-xs uppercase tracking-[0.2em] text-gray-500 font-bold">
                        <tr>
                            <th className="py-5 px-8">Rank</th>
                            <th className="py-5 px-8">Upgrade Cost</th>
                            <th className="py-5 px-8">Total Revenue</th>
                            <th className="py-5 px-8">Reserved</th>
                            <th className="py-5 px-8">Available</th>
                            <th className="py-5 px-8 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {userData.levelEarnings.map((earning, index) => {
                            if (index === 0) return null; // Skip level 0
                            const isCurrentLevel = index === userData.level;
                            const isUnlocked = index <= userData.level;

                            return (
                                <tr key={index} className={`group hover:bg-white/5 transition-all duration-300 ${isCurrentLevel ? 'bg-obsidian-gold/5' : ''}`}>
                                    <td className="py-5 px-8">
                                        <div className="flex items-center">
                                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold mr-4 border transition-all duration-300 ${isUnlocked
                                                ? 'bg-obsidian-gold text-black border-obsidian-gold shadow-[0_0_15px_rgba(184,134,11,0.2)]'
                                                : 'bg-transparent text-gray-600 border-white/10'
                                                }`}>
                                                {index}
                                            </span>
                                            {isCurrentLevel && (
                                                <span className="text-[10px] text-obsidian-gold font-bold px-2 py-1 bg-obsidian-gold/10 rounded ml-2 uppercase tracking-wider border border-obsidian-gold/20">
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-5 px-8 text-gray-400 font-mono text-sm group-hover:text-white transition-colors">
                                        {levelCosts && levelCosts[index] ? parseFloat(levelCosts[index]).toFixed(0) : '-'} <span className="text-xs text-gray-600">CRO</span>
                                    </td>
                                    <td className="py-5 px-8 text-white font-mono text-sm tracking-wide">{parseFloat(earning).toFixed(4)}</td>
                                    <td className="py-5 px-8 text-obsidian-gold font-mono text-sm tracking-wide">{parseFloat(userData.reservedForUpgrade[index]).toFixed(4)}</td>
                                    <td className="py-5 px-8 text-emerald-400 font-bold font-mono text-sm tracking-wide shadow-emerald-500/10 drop-shadow-sm">{parseFloat(userData.withdrawableBalance[index]).toFixed(4)}</td>
                                    <td className="py-5 px-8 text-right">
                                        {parseFloat(userData.withdrawableBalance[index]) > 0 && (
                                            <button
                                                onClick={() => onWithdrawFromLevel(index, userData.withdrawableBalance[index])}
                                                disabled={isWithdrawing}
                                                className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-lg hover:bg-emerald-500 hover:text-black hover:border-emerald-500 transition-all disabled:opacity-50 flex items-center gap-2 ml-auto uppercase tracking-wider shadow-lg shadow-emerald-900/20 hover:shadow-emerald-500/30"
                                            >
                                                Claim <ExternalLink size={12} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden">
                {userData.levelEarnings.map((earning, index) => {
                    if (index === 0) return null;
                    const isCurrentLevel = index === userData.level;
                    const isUnlocked = index <= userData.level;
                    const withdrawable = parseFloat(userData.withdrawableBalance[index]);

                    return (
                        <div key={index} className={`p-5 border-b border-white/5 ${isCurrentLevel ? 'bg-obsidian-gold/5' : ''}`}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border ${isUnlocked ? 'bg-obsidian-gold text-black border-obsidian-gold' : 'bg-transparent text-gray-600 border-white/10'}`}>
                                        {index}
                                    </span>
                                    <span className={`font-bold text-sm tracking-wide ${isUnlocked ? 'text-white' : 'text-gray-500'}`}>Level {index}</span>
                                    {isCurrentLevel && <span className="text-[9px] text-obsidian-gold font-bold px-1.5 py-0.5 bg-obsidian-gold/10 rounded ml-2 uppercase border border-obsidian-gold/20">Current</span>}
                                </div>
                                {withdrawable > 0 && (
                                    <button
                                        onClick={() => onWithdrawFromLevel(index, userData.withdrawableBalance[index])}
                                        disabled={isWithdrawing}
                                        className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold rounded hover:bg-emerald-500 hover:text-black transition-all flex items-center gap-2 uppercase tracking-wide"
                                    >
                                        Claim <ExternalLink size={10} />
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-xs">
                                <div>
                                    <div className="text-gray-600 mb-1 uppercase text-[9px] font-bold tracking-wider">Total</div>
                                    <div className="text-gray-300 font-mono">{parseFloat(earning).toFixed(2)}</div>
                                </div>
                                <div>
                                    <div className="text-gray-600 mb-1 uppercase text-[9px] font-bold tracking-wider">Reserved</div>
                                    <div className="text-obsidian-gold font-mono">{parseFloat(userData.reservedForUpgrade[index]).toFixed(2)}</div>
                                </div>
                                <div>
                                    <div className="text-gray-600 mb-1 uppercase text-[9px] font-bold tracking-wider">Available</div>
                                    <div className="text-emerald-400 font-bold font-mono">{withdrawable.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
};

export default LevelTable;

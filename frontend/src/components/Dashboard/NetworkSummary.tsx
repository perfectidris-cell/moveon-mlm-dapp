import React from 'react';
import { motion } from 'framer-motion';
import { Network, Users, ArrowRight, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../types/index';

interface NetworkSummaryProps {
    userData: User;
}

const NetworkSummary: React.FC<NetworkSummaryProps> = ({ userData }) => {
    const navigate = useNavigate();

    return (
        <section className="mb-10 md:mb-12">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl md:text-2xl font-outfit font-bold flex items-center gap-3 text-white">
                    <Network className="text-obsidian-gold" />
                    Matrix <span className="text-gradient">Organization</span>
                </h2>
                <button
                    onClick={() => navigate('/matrix')}
                    className="group px-4 py-2 rounded-full border border-white/10 hover:border-obsidian-gold/50 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs md:text-sm flex items-center gap-2 transition-all duration-300"
                >
                    Expand Structure <ArrowRight size={16} className="text-obsidian-gold group-hover:translate-x-1 transition-transform" />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* Visual Referral Tree Card */}
                <motion.div
                    whileHover={{ scale: 1.01 }}
                    className="glass-panel p-8 rounded-[24px] border border-white/10 bg-linear-to-br from-white/5 to-transparent relative overflow-hidden group cursor-pointer hover:border-obsidian-gold/30 transition-all duration-500"
                    onClick={() => navigate('/matrix')}
                >
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
                        <Share2 size={120} className="text-obsidian-gold" />
                    </div>

                    <div className="flex items-start gap-5 mb-8">
                        <div className="p-4 bg-obsidian-gold/10 rounded-2xl border border-obsidian-gold/20 group-hover:bg-obsidian-gold/20 transition-all">
                            <Users className="text-obsidian-gold" size={28} />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-xl mb-1">Structure Analysis</h3>
                            <p className="text-gray-500 text-sm font-light">Real-time visualization of your 2x12 matrix.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mt-auto relative z-10">
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold mb-2">Direct Partners</div>
                            <div className="text-3xl font-outfit font-black text-white">{userData.directReferrals}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold mb-2">Total Volume</div>
                            <div className="text-3xl font-outfit font-black text-obsidian-gold">{userData.totalReferrals}</div>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Status</span>
                        <div className="flex items-center gap-2 text-obsidian-green text-xs font-bold uppercase tracking-wider text-emerald-400">
                            Live <span className="animate-pulse w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></span>
                        </div>
                    </div>
                </motion.div>

                {/* Referral Link Card */}
                <div className="glass-panel p-8 rounded-[24px] border border-white/10 bg-linear-to-bl from-black/40 to-transparent flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-obsidian-gold/5 blur-[80px] rounded-full -mr-20 -mt-20"></div>

                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-full bg-linear-to-br from-obsidian-gold to-obsidian-gold-dim flex items-center justify-center text-black shadow-[0_0_20px_rgba(184,134,11,0.3)]">
                            <Share2 size={20} />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-lg">Expansion Tool</h3>
                            <p className="text-gray-500 text-xs uppercase tracking-widest">Share Your Access</p>
                        </div>
                    </div>

                    <div className="bg-black/60 rounded-xl p-2 border border-white/10 flex items-center justify-between gap-4 pl-4 relative group hover:border-obsidian-gold/30 transition-all">
                        <code className="text-xs text-gray-400 font-mono truncate select-all">
                            {window.location.origin}/?ref={userData.id.slice(0, 8)}...
                        </code>
                        <button
                            className="px-6 py-3 bg-white/5 hover:bg-obsidian-gold hover:text-black rounded-lg text-xs font-bold text-white transition-all whitespace-nowrap shadow-lg active:scale-95 uppercase tracking-wide border-l border-white/10 group-hover:border-transparent"
                            onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/?ref=${userData.id}`);
                                alert("Link copied!");
                            }}
                        >
                            Copy Asset
                        </button>
                    </div>

                    <p className="mt-8 text-xs text-gray-500 leading-relaxed font-light border-l-2 border-obsidian-gold/30 pl-4">
                        Direct referrals grant instant commissions and accelerate matrix positioning.
                        <span className="text-white font-medium"> Use this asset wisely.</span>
                    </p>
                </div>
            </div>
        </section>
    );
};

export default NetworkSummary;

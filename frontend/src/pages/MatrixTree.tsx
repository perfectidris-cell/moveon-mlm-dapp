import React, { useState } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ReferralTree from '../components/Dashboard/ReferralTree';

const MatrixTree: React.FC = () => {
    const { account, connectWallet } = useWeb3();
    const [depth, setDepth] = useState(6);
    const navigate = useNavigate();

    // Data fetching moved to ReferralTree component

    if (!account) {
        return (
            <div className="min-h-screen relative font-inter flex items-center justify-center p-4">
                <div className="aurora-bg"></div>
                <div className="glass-panel rounded-3xl p-8 md:p-12 max-w-md w-full text-center border border-white/10 shadow-[0_0_50px_rgba(176,38,255,0.2)]">
                    <h2 className="text-2xl md:text-3xl font-outfit font-bold text-white mb-6">Network Access</h2>
                    <p className="text-gray-400 mb-8 text-sm md:text-base">Connect your wallet to view your matrix structure and downline performance.</p>
                    <button
                        onClick={connectWallet}
                        className="w-full px-8 py-4 bg-linear-to-r from-neon-purple to-cyber-pink text-white font-bold rounded-xl hover:opacity-90 transition-all shadow-lg"
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

    return (
        <div className="min-h-screen font-inter text-white pb-20 relative">
            <div className="aurora-bg"></div>

            <Navbar />

            <div className="container mx-auto px-4 py-8 max-w-7xl h-full flex flex-col">
                <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pt-20">
                    <div>
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-outfit font-bold mb-2">
                            Matrix <span className="text-gradient">Network</span>
                        </h1>
                        <p className="text-gray-400 text-sm md:text-base">Visualize your organization and track partner growth.</p>
                    </div>

                    <div className="flex items-center space-x-3 bg-black/40 backdrop-blur-md p-1.5 rounded-xl border border-white/10 w-full md:w-auto overflow-x-auto">
                        <span className="text-xs text-gray-500 font-bold px-2 uppercase tracking-wider hidden md:block">Depth</span>
                        {[1, 2, 3, 4, 5, 6].map((d) => (
                            <button
                                key={d}
                                onClick={() => setDepth(d)}
                                className={`flex-none w-8 h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${depth === d
                                    ? 'bg-neon-purple text-white shadow-[0_0_15px_rgba(176,38,255,0.4)]'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </header>

                <div className="flex-1 min-h-0">
                    <ReferralTree depth={depth} />
                </div>
            </div>
        </div>
    );
};

export default MatrixTree;

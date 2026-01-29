import React from 'react';
import { AlertTriangle } from 'lucide-react';

const Disclaimer: React.FC = () => {
    return (
        <div className="w-full bg-black/90 border-t border-red-900/30 py-8 px-4 mt-20 relative z-20">
            <div className="container mx-auto max-w-6xl">
                <div className="flex items-start gap-4 mb-4">
                    <AlertTriangle className="text-red-500 shrink-0 mt-1" size={24} />
                    <h4 className="text-red-500 font-bold uppercase tracking-widest text-sm md:text-base">Risk Warning & Disclaimer</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs text-gray-500 font-mono leading-relaxed">
                    <div>
                        <p className="mb-4">
                            <strong className="text-gray-400 block mb-1">No Guarantees of Profit</strong>
                            Participation in this decentralized protocol does not guarantee income. The "recycle" mechanism and spillover functions depend entirely on community activity. Most participants in such structures may earn little to no money.
                        </p>
                        <p className="mb-4">
                            <strong className="text-gray-400 block mb-1">High-Risk Activity</strong>
                            This platform involves voluntary cryptocurrency contributions. It is a high-risk activity. Only contribute funds you can afford to lose.
                        </p>
                    </div>
                    <div>
                        <p className="mb-4">
                            <strong className="text-gray-400 block mb-1">Blockchain Immutability</strong>
                            This application interacts with a smart contract on the Polygon blockchain. Transactions are irreversible, permanent, and cannot be refunded, altered, or stopped by any administrator or developer.
                        </p>
                        <p>
                            <strong className="text-gray-400 block mb-1">Regulatory & Liability</strong>
                            This platform is not a financial institution or investment scheme. It is a decentralized software tool used at your own risk. The developers assume no liability for financial losses, network congestion, or smart contract interactions.
                        </p>
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t border-white/5 text-center">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wider">
                        By connecting your wallet, you acknowledge that you have read, understood, and agreed to these terms.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Disclaimer;

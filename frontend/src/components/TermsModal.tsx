import React from 'react';
import { X, Shield, FileText, AlertOctagon, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TermsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[80vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                            <div className="flex items-center gap-3">
                                <FileText className="text-obsidian-gold" size={24} />
                                <h3 className="text-xl font-bold text-white font-outfit">Terms and Conditions</h3>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-gray-400 leading-relaxed space-y-6">
                            <div className="p-4 bg-obsidian-gold/5 border border-obsidian-gold/10 rounded-lg mb-6">
                                <p className="text-obsidian-gold font-medium text-xs uppercase tracking-wider mb-2">Important Notice</p>
                                <p className="text-gray-300">
                                    Please read these Terms and Conditions carefully before participating in the protocol. By connecting your wallet and registering, you agree to be bound by these terms.
                                </p>
                            </div>

                            <section>
                                <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                                    <HelpCircle size={16} className="text-blue-400" />
                                    1. Nature of the Service
                                </h4>
                                <p>
                                    MoveOn is a decentralized peer-to-peer contribution protocols run on the Polygon blockchain. The "recycle" and "upgrade" mechanisms are voluntary re-entries into the system. Participation is not an investment, and there is <strong>no guaranteed return on investment</strong>. You are contributing to other community members, not investing in a company.
                                </p>
                            </section>

                            <section>
                                <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                                    <Shield size={16} className="text-emerald-400" />
                                    2. User Responsibility
                                </h4>
                                <p>
                                    You are solely responsible for the security of your private keys and wallet access. You acknowledge that you understand how blockchain smart contracts, gas fees, and wallet transactions work. The developers cannot recover lost funds due to user error, compromised wallets, or forgotten keys.
                                </p>
                            </section>

                            <section>
                                <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                                    <AlertOctagon size={16} className="text-red-400" />
                                    3. Limitation of Liability
                                </h4>
                                <p>
                                    The software is provided "AS IS", without warranty of any kind. The developers and creators disclaim all liability for any financial losses, damages, or issues arising from:
                                </p>
                                <ul className="list-disc pl-5 mt-2 space-y-1">
                                    <li>Smart contract vulnerabilities or bugs.</li>
                                    <li>Network congestion, failures, or high gas fees on the Polygon network.</li>
                                    <li>Loss of value of the CRO/Polygon currency.</li>
                                    <li>Regulatory actions in your specific jurisdiction.</li>
                                </ul>
                            </section>

                            <section>
                                <h4 className="font-bold mb-2 text-yellow-400">
                                    4. Earnings Claims Policy
                                </h4>
                                <p>
                                    Users are strictly prohibited from making "get rich quick" claims, guaranteeing income, or misrepresenting the protocol to potential new members. Any potential earnings are strictly derived from community activity and math-based distribution, not from investment yield.
                                </p>
                            </section>

                            <section>
                                <h4 className="text-white font-bold mb-2">
                                    5. Termination of Service
                                </h4>
                                <p>
                                    While the smart contract is immutable and lives permanently on the blockchain, the frontend interface website may be updated, changed, or discontinued at any time without notice. Users can always interact directly with the smart contract if the website is unavailable.
                                </p>
                            </section>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-white/10 bg-black/40 text-center">
                            <button
                                onClick={onClose}
                                className="px-8 py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors uppercase text-sm tracking-wider"
                            >
                                I Understand
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default TermsModal;

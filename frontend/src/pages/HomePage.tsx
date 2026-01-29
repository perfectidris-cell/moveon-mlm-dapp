import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { motion } from 'framer-motion';
import { Zap, Trees, ShieldCheck, ArrowRight, Wallet, UserPlus, CheckCircle2, Gem } from 'lucide-react';

const HomePage: React.FC = () => {
    const { account, contract, connectWallet, isConnecting, chainId } = useWeb3();
    const [referrerAddress, setReferrerAddress] = useState('');
    const [registrationFee, setRegistrationFee] = useState<string>('0');
    const [isRegistering, setIsRegistering] = useState(false);
    const [registrationError, setRegistrationError] = useState<string | null>(null);
    const [registrationSuccess, setRegistrationSuccess] = useState(false);
    const [isValidatingReferrer, setIsValidatingReferrer] = useState(false);
    const [referrerValid, setReferrerValid] = useState<boolean | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchRegistrationFee = async () => {
            if (contract.contract) {
                try {
                    const fee = await contract.getRegistrationFeeCro();
                    setRegistrationFee(fee);
                } catch (err) {
                    console.error('Error fetching registration fee:', err);
                }
            }
        };
        fetchRegistrationFee();
    }, [contract]);

    // Validate referrer address
    useEffect(() => {
        const validateReferrer = async () => {
            if (!referrerAddress || !contract.contract) {
                setReferrerValid(null);
                return;
            }

            setIsValidatingReferrer(true);
            try {
                // Check if referrer is a valid registered user
                const referrerInfo = await contract.getUserInfo(referrerAddress);
                setReferrerValid(referrerInfo.id !== '0x0000000000000000000000000000000000000000' && !referrerInfo.isExpired);
            } catch (err) {
                setReferrerValid(false);
            } finally {
                setIsValidatingReferrer(false);
            }
        };

        const debounceTimer = setTimeout(validateReferrer, 500); // Debounce validation
        return () => clearTimeout(debounceTimer);
    }, [referrerAddress, contract]);

    // Check if user is already registered
    useEffect(() => {
        const checkRegistration = async () => {
            if (!account || !contract.contract) return;
            console.log('HomePage: Checking registration for account:', account);
            try {
                const userInfo = await contract.getUserInfo(account);
                // Only navigate if user is actually registered (id is not zero address)
                if (userInfo && userInfo.id !== '0x0000000000000000000000000000000000000000') {
                    console.log('HomePage: User is registered:', userInfo);
                    navigate('/dashboard');
                }
            } catch (err: any) {
                console.log('HomePage: User not registered, error:', err.message);
                // Not registered, stay on page
            }
        };
        checkRegistration();
    }, [account, contract.contract, navigate, chainId]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!account) {
            await connectWallet();
            return;
        }

        if (!referrerAddress) {
            setRegistrationError('Please enter a referrer address');
            return;
        }

        if (referrerValid === false) {
            setRegistrationError('Invalid referrer address. Please enter a valid registered user address.');
            return;
        }

        if (referrerValid === null) {
            setRegistrationError('Validating referrer address...');
            return;
        }

        try {
            setIsRegistering(true);
            setRegistrationError(null);
            console.log('HomePage: Starting registration - Account:', account, 'Referrer:', referrerAddress, 'Fee:', registrationFee);
            await contract.register(referrerAddress, registrationFee);
            console.log('HomePage: Registration successful');
            setRegistrationSuccess(true);
            // Clear the referrer address after successful registration
            setReferrerAddress('');
            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);
        } catch (err: any) {
            console.error('HomePage: Registration failed:', err);
            const errorMessage = err.message || 'Failed to register';
            
            // Provide more helpful error messages
            if (errorMessage.includes('User already registered')) {
                setRegistrationError('This wallet is already registered. Redirecting to dashboard...');
                setTimeout(() => navigate('/dashboard'), 2000);
            } else if (errorMessage.includes('Insufficient')) {
                setRegistrationError('Insufficient balance to complete registration. Please check your CRO balance.');
            } else if (errorMessage.includes('Referrer')) {
                setRegistrationError('Invalid referrer. Please ensure the referrer address is registered and not expired.');
            } else {
                setRegistrationError(errorMessage);
            }
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden font-inter text-white bg-[#000000]">
            <div className="aurora-bg"></div>

            <Navbar />

            <main className="container mx-auto px-4 pt-32 pb-20 relative z-10">

                {/* Hero Section */}
                <div className="text-center mb-24 md:mb-40">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="inline-flex items-center gap-3 px-6 py-2.5 mb-10 rounded-full bg-linear-to-r from-white/10 to-transparent border border-white/10 text-obsidian-gold text-xs md:text-sm font-bold tracking-[0.3em] uppercase backdrop-blur-md shadow-lg"
                    >
                        <Gem size={14} className="text-obsidian-gold animate-pulse" />
                        Exclusive Investment Ecosystem
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.1 }}
                        className="text-4xl sm:text-6xl md:text-7xl font-outfit font-black mb-8 leading-[0.9] tracking-tighter text-white"
                    >
                        Redefine Your <br className="hidden sm:block" />
                        <span className="text-gradient drop-shadow-[0_0_50px_rgba(184,134,11,0.2)]">Digital Legacy</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="text-lg md:text-2xl text-obsidian-platinum max-w-3xl mx-auto mb-16 font-light leading-relaxed tracking-wide"
                    >
                        The ultimate 2x12 decentralized matrix protocol.
                        <span className="text-white font-medium"> Absolute transparency.</span>
                        <span className="text-white font-medium"> Infinite potential.</span>
                    </motion.p>

                    {!account && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.05, boxShadow: '0 0 50px rgba(184,134,11,0.4)' }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            onClick={connectWallet}
                            className="bg-linear-to-r from-obsidian-gold to-obsidian-gold-dim text-black px-12 py-6 rounded-full font-black text-xl md:text-2xl shadow-[0_10px_40px_rgba(184,134,11,0.2)] transition-all flex items-center gap-4 mx-auto animate-float border border-white/20"
                        >
                            Start Investing <ArrowRight size={28} />
                        </motion.button>
                    )}
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 md:gap-24 items-center max-w-7xl mx-auto">

                    {/* Features Column */}
                    <div className="space-y-6 order-2 lg:order-1">
                        <FeatureCard
                            icon={<Zap className="text-obsidian-gold" size={32} />}
                            title="Instant Liquidity"
                            desc="Real-time peer-to-peer settlement directly to your wallet. Zero intermediaries, absolute control."
                            delay={0.4}
                        />
                        <FeatureCard
                            icon={<Trees className="text-obsidian-platinum" size={32} />}
                            title="Global Spillover"
                            desc="Intelligent matrix positioning accelerates growth by distributing active participants globally."
                            delay={0.5}
                        />
                        <FeatureCard
                            icon={<ShieldCheck className="text-emerald-400" size={32} />}
                            title="Audited Security"
                            desc="Immutable smart contract architecture on Polygon. Verified source code for maximum trust."
                            delay={0.6}
                        />
                    </div>

                    {/* Registration/Action Column */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                        className="relative order-1 lg:order-2"
                    >
                        {/* Decorative blob behind */}
                        <div className="absolute -inset-20 bg-linear-to-r from-obsidian-gold/10 via-obsidian-platinum/5 to-transparent blur-3xl rounded-full opacity-30 animate-pulse-slow"></div>

                        <div className="glass-panel p-10 md:p-14 rounded-4xl border-white/10 relative shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-3xl overflow-hidden">
                            {/* Inner Glow */}
                            <div className="absolute -top-40 -right-40 w-80 h-80 bg-obsidian-gold/10 rounded-full blur-[100px]"></div>

                            <div className="absolute top-0 right-0 p-10 opacity-5">
                                <UserPlus size={120} className="text-white" />
                            </div>

                            <h2 className="text-3xl md:text-5xl font-black font-outfit mb-4 text-white relative z-10 tracking-tight uppercase">Access Matrix</h2>
                            <p className="text-gray-400 mb-12 text-base md:text-lg relative z-10 font-light border-l-2 border-obsidian-gold pl-4">
                                Entry Contribution: <span className="text-white font-bold">{registrationFee} CRO</span>
                            </p>

                            {!account ? (
                                <div className="text-center py-14">
                                    <div className="mb-10 mx-auto w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/10 shadow-inner group transition-all duration-700 hover:border-obsidian-gold/50">
                                        <Wallet className="w-10 h-10 text-gray-500 group-hover:text-obsidian-gold transition-colors duration-500" />
                                    </div>
                                    <button
                                        onClick={connectWallet}
                                        disabled={isConnecting}
                                        className="w-full bg-linear-to-r from-gray-100 to-gray-300 text-black py-5 rounded-xl font-black hover:scale-[1.02] transition-all text-lg shadow-xl flex items-center justify-center gap-3 uppercase tracking-wider"
                                    >
                                        {isConnecting ? 'Linking Wallet...' : 'Connect Wallet'}
                                    </button>
                                </div>
                            ) : registrationSuccess ? (
                                <div className="text-center py-16">
                                    <motion.div
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        className="w-28 h-28 bg-linear-to-br from-emerald-500 to-emerald-700 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(16,185,129,0.4)]"
                                    >
                                        <CheckCircle2 size={56} className="text-white" />
                                    </motion.div>
                                    <h3 className="text-3xl font-black text-white mb-3">Welcome, Elite Member.</h3>
                                    <p className="text-bsidian-platinum text-lg">Redirecting to your dashboard...</p>
                                </div>
                            ) : (
                                <form onSubmit={handleRegister} className="space-y-8 relative z-10">
                                    <div className="group">
                                        <label className="block text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3 font-bold ml-1 group-focus-within:text-obsidian-gold transition-colors">Active Identifier</label>
                                        <div className="w-full px-6 py-5 bg-black/40 border border-white/10 rounded-xl text-obsidian-platinum font-mono text-sm truncate flex items-center gap-4 group-hover:border-white/20 transition-all shadow-inner focus-within:border-obsidian-gold/50 focus-within:ring-1 focus-within:ring-obsidian-gold/20">
                                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                            {account}
                                        </div>
                                    </div>

                                    <div className="group">
                                        <label className="block text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-3 font-bold ml-1 group-focus-within:text-obsidian-gold transition-colors">Referrer Protocol</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={referrerAddress}
                                                onChange={(e) => setReferrerAddress(e.target.value)}
                                                placeholder="Enter 0x address..."
                                                className={`w-full px-6 py-5 bg-black/40 border rounded-xl text-white placeholder-gray-700 focus:outline-none focus:ring-1 transition-all font-mono text-sm shadow-inner ${referrerValid === true ? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/20' :
                                                    referrerValid === false ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' :
                                                        'border-white/10 focus:border-obsidian-gold focus:ring-obsidian-gold/20'
                                                    }`}
                                                required
                                            />
                                            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                {isValidatingReferrer ? (
                                                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                                ) : referrerValid === true ? (
                                                    <div className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                                                        <span className="text-black text-[8px] font-bold">✓</span>
                                                    </div>
                                                ) : referrerValid === false ? (
                                                    <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                                                        <span className="text-white text-[8px] font-bold">✗</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                        {referrerValid === false && (
                                            <p className="text-red-400 text-xs mt-2 font-mono">Invalid referrer address detected.</p>
                                        )}
                                    </div>

                                    {registrationError && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="text-red-400 text-sm p-5 bg-red-900/10 border border-red-500/20 rounded-xl flex items-start gap-3 backdrop-blur-md"
                                        >
                                            <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0"></span>
                                            <span className="leading-relaxed font-medium">{registrationError}</span>
                                        </motion.div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={isRegistering}
                                        className="w-full py-5.5 bg-linear-to-r from-obsidian-gold via-obsidian-gold-dim to-obsidian-gold text-black font-black rounded-xl hover:brightness-110 transition-all shadow-[0_20px_50px_-10px_rgba(184,134,11,0.3)] transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-lg tracking-wide flex items-center justify-center gap-3 uppercase"
                                    >
                                        {isRegistering ? (
                                            <>Processing Transaction...</>
                                        ) : (
                                            <>Initialize Registration <ArrowRight size={20} /></>
                                        )}
                                    </button>

                                    <div className="text-center pt-4">
                                        <button
                                            type="button"
                                            onClick={() => navigate('/dashboard')}
                                            className="text-xs text-gray-500 hover:text-white transition-all font-bold tracking-widest uppercase flex items-center justify-center gap-2 mx-auto border-b border-transparent hover:border-obsidian-gold pb-1"
                                        >
                                            Member Login
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
};

const FeatureCard: React.FC<{ icon: React.ReactNode, title: string, desc: string, delay: number }> = ({ icon, title, desc, delay }) => (
    <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay }}
        className="glass-card p-8 rounded-4xl flex items-start space-x-6 hover:bg-white/5 transition-all group cursor-default shadow-lg border border-white/5"
    >
        <div className="p-4 bg-black/40 rounded-2xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 border border-white/10 shadow-inner">
            {icon}
        </div>
        <div>
            <h3 className="text-xl font-bold font-outfit mb-2 text-white tracking-wide group-hover:text-obsidian-gold transition-colors">
                {title}
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed font-light tracking-wide">{desc}</p>
        </div>
    </motion.div>
);

export default HomePage;

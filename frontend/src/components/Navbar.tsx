import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWeb3 } from '../contexts/Web3Context';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Wallet, ChevronRight, Gem, Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const Navbar: React.FC = () => {
    const { account, connectWallet } = useWeb3();
    const { theme, toggleTheme } = useTheme();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navLinks = [
        { name: 'Home', path: '/' },
        { name: 'Dashboard', path: '/dashboard' },
        { name: 'Matrix', path: '/matrix' },
    ];

    return (
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out ${scrolled || isMenuOpen ? 'py-2' : 'py-6'}`}
        >
            <div className={`container mx-auto px-4 md:px-6`}>
                <div className={`
                    backdrop-blur-xl border rounded-full px-6 py-3
                    flex justify-between items-center transition-all duration-500
                    ${scrolled || isMenuOpen
                        ? 'bg-obsidian-black/80 border-gold-border/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)]'
                        : 'bg-transparent border-transparent'}
                `}>
                    {/* Logo - Obsidian Style */}
                    <div
                        className="text-xl md:text-2xl font-outfit font-bold tracking-widest cursor-pointer text-white flex items-center gap-3 group"
                        onClick={() => { navigate('/'); setIsMenuOpen(false); }}
                    >
                        <div className="w-10 h-10 rounded-full bg-linear-to-br from-obsidian-gold to-obsidian-gold-dim flex items-center justify-center shadow-[0_0_15px_rgba(184,134,11,0.3)] group-hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] transition-all duration-500">
                            <Gem size={20} className="text-black fill-black/20" />
                        </div>
                        <span className="uppercase text-lg md:text-xl font-black">
                            Move<span className="text-gradient">On</span>
                        </span>
                    </div>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center space-x-2">
                        {navLinks.map((link) => {
                            const isActive = location.pathname === link.path;
                            return (
                                <button
                                    key={link.path}
                                    onClick={() => navigate(link.path)}
                                    className={`
                                        relative px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 tracking-wide
                                        ${isActive ? 'text-obsidian-gold' : 'text-gray-400 hover:text-white'}
                                    `}
                                >
                                    {link.name}
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeTab"
                                            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-obsidian-gold rounded-full shadow-[0_0_10px_#FFD700]"
                                            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Desktop Wallet Action */}
                    <div className="hidden md:flex items-center gap-4">
                        <button
                            onClick={toggleTheme}
                            className="p-2.5 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-obsidian-gold hover:border-obsidian-gold/30 hover:bg-white/10 transition-all"
                            title={theme === 'obsidian' ? 'Switch to Cronos' : 'Switch to Obsidian'}
                        >
                            {theme === 'obsidian' ? <Moon size={20} /> : <Sun size={20} />}
                        </button>

                        {account ? (
                            <div className="group relative">
                                <div className="px-6 py-2.5 bg-white/5 rounded-full border border-white/10 flex items-center gap-3 cursor-default hover:border-obsidian-gold/30 transition-all font-mono text-sm shadow-inner text-obsidian-platinum">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                    {account.slice(0, 6)}...{account.slice(-4)}
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={connectWallet}
                                className="group relative px-8 py-2.5 bg-linear-to-r from-obsidian-gold to-obsidian-gold-dim text-black rounded-full font-bold text-sm tracking-wide overflow-hidden transition-all hover:scale-105 shadow-[0_0_20px_rgba(184,134,11,0.3)] hover:shadow-[0_0_30px_rgba(255,215,0,0.5)]"
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    Connect <Wallet size={16} />
                                </span>
                                <div className="absolute inset-0 bg-white/20 translate-y-full rotate-45 group-hover:translate-y-[-200%] transition-transform duration-700"></div>
                            </button>
                        )}
                    </div>

                    {/* Mobile menu button */}
                    <div className="md:hidden flex items-center">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 text-gray-400 hover:text-obsidian-gold transition-colors"
                        >
                            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: '100vh' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden fixed inset-0 top-[80px] bg-black/95 backdrop-blur-3xl z-40"
                    >
                        <div className="container mx-auto px-6 py-8 flex flex-col space-y-2">
                            {navLinks.map((link, i) => (
                                <motion.button
                                    key={link.path}
                                    initial={{ x: -20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ delay: i * 0.1 }}
                                    onClick={() => { navigate(link.path); setIsMenuOpen(false); }}
                                    className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5 text-left group active:scale-95 transition-all"
                                >
                                    <span className="text-xl font-light text-white group-hover:text-obsidian-gold transition-colors tracking-widest uppercase">
                                        {link.name}
                                    </span>
                                    <ChevronRight size={20} className="text-gray-600 group-hover:text-obsidian-gold" />
                                </motion.button>
                            ))}

                            <div className="pt-8 mt-8 border-t border-white/10">
                                {account ? (
                                    <div className="p-6 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-linear-to-br from-obsidian-gold to-obsidian-gold-dim flex items-center justify-center text-black">
                                                <Wallet size={20} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-gray-500 uppercase tracking-widest">Connected</span>
                                                <span className="font-mono text-sm text-obsidian-platinum">
                                                    {account.slice(0, 6)}...{account.slice(-4)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => { connectWallet(); setIsMenuOpen(false); }}
                                        className="w-full py-5 bg-linear-to-r from-obsidian-gold to-obsidian-gold-dim text-black font-black rounded-2xl shadow-[0_10px_30px_rgba(184,134,11,0.2)] active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-widest hover:brightness-110"
                                    >
                                        Connect Wallet
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.nav>
    );
};

export default Navbar;

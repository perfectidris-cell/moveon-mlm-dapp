import { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useContract } from '../hooks/useContract';
import { CRONOS_CHAIN_ID } from '../utils/config';

export default function Navbar({ onNavigate, currentPage }: { onNavigate: (p: 'home' | 'dashboard' | 'downline' | 'admin') => void; currentPage: string }) {
  const { address, balance, chainId, isConnected, isConnecting, connect, disconnect } = useWeb3();
  const contract = useContract();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  const isCorrectNetwork = chainId === CRONOS_CHAIN_ID;

  useEffect(() => {
    if (!isConnected || !address) { setIsOwner(false); return; }
    contract.getOwner().then((own) => {
      setIsOwner(own.toLowerCase() === address.toLowerCase());
    }).catch(() => setIsOwner(false));
  }, [isConnected, address, contract]);

  const navLinks = [
    { page: 'home' as const, label: 'Home' },
    { page: 'dashboard' as const, label: 'Dashboard' },
    { page: 'downline' as const, label: 'Downline' },
    ...(isOwner ? [{ page: 'admin' as const, label: 'Admin' }] : []),
  ];

  return (
    <nav className="glass-strong sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => onNavigate('home')}>
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center font-bold text-white text-sm sm:text-lg">
              P
            </div>
            <span className="text-lg sm:text-xl font-bold gradient-text hidden sm:block">Paradise</span>
            {isConnected && (
              <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full ${isCorrectNetwork ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {isCorrectNetwork ? 'Cronos' : `Net ${chainId}`}
              </span>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden p-2 text-slate-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-2">
            {isConnected && navLinks.map(({ page, label }) => (
              <button
                key={page}
                onClick={() => onNavigate(page)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${currentPage === page ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                {label}
              </button>
            ))}

            {isConnected ? (
              <div className="flex items-center gap-2 ml-2">
                <div className="hidden lg:block text-right">
                  <div className="text-[11px] text-slate-400">Balance</div>
                  <div className="text-sm font-semibold text-white">{parseFloat(balance).toFixed(2)} CRO</div>
                </div>
                <div className="flex items-center gap-1.5 glass rounded-xl px-2.5 py-1.5">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${isCorrectNetwork ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="text-xs sm:text-sm font-medium text-white">{shortAddr}</span>
                </div>
                <button onClick={disconnect} className="text-[11px] text-slate-400 hover:text-red-400 transition-colors px-1.5 py-1">
                  Exit
                </button>
              </div>
            ) : (
              <button onClick={connect} disabled={isConnecting} className="btn-primary text-xs sm:text-sm px-4 py-2">
                {isConnecting ? 'Connecting...' : 'Connect'}
              </button>
            )}
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {menuOpen && isConnected && (
          <div className="sm:hidden pb-3 border-t border-white/5 pt-2 space-y-1">
            {navLinks.map(({ page, label }) => (
              <button
                key={page}
                onClick={() => { onNavigate(page); setMenuOpen(false); }}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${currentPage === page ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                {label}
              </button>
            ))}
            <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-400">
              <span>{parseFloat(balance).toFixed(2)} CRO</span>
              <button onClick={() => { disconnect(); setMenuOpen(false); }} className="text-red-400 hover:text-red-300">Disconnect</button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

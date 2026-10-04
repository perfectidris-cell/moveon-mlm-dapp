import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useContract } from '../hooks/useContract';
import { CRONOS_CHAIN_ID } from '../utils/config';
import { getPlanetName } from '../utils/planetLevels';

function extractAddress(input: string): string | null {
  const cleaned = input.trim();
  if (ethers.isAddress(cleaned)) return cleaned;
  const addrRegex = /0x[a-fA-F0-9]{40}/g;
  const addrMatch = addrRegex.exec(cleaned);
  if (addrMatch && ethers.isAddress(addrMatch[0])) return addrMatch[0];
  try {
    const url = new URL(cleaned);
    const refParam = url.searchParams.get('ref') || url.searchParams.get('referrer') || url.searchParams.get('r');
    if (refParam) {
      const inner = refParam.trim();
      if (ethers.isAddress(inner)) return inner;
      const innerRegex = /0x[a-fA-F0-9]{40}/g;
      const innerAddr = innerRegex.exec(inner);
      if (innerAddr && ethers.isAddress(innerAddr[0])) return innerAddr[0];
    }
  } catch {}
  return null;
}
export default function HomePage({ onNavigate }: { onNavigate: (p: 'home' | 'dashboard') => void }) {
  const { address, chainId, isConnected, connect } = useWeb3();
  const { getSystemInfoCached, getUserInfosBatch, registerAuto, getPaused } = useContract();
  const [regFee, setRegFee] = useState('—');
  const [croPrice, setCroPrice] = useState('—');
  const [referrer, setReferrer] = useState('');
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) return;
    getUserInfosBatch([address]).then(infos => {
      const isRegistered = infos[0] && infos[0].id !== '0x0000000000000000000000000000000000000000';
      if (isRegistered) onNavigate('dashboard');
    }).catch(() => {});
  }, [isConnected, address, getUserInfosBatch, onNavigate]);

  // Robust referral link parsing: supports surge.sh SPA, case-insensitive, checksum normalization, localStorage fallback
  useEffect(() => {
    const pickRef = (): string | null => {
      try {
        const href = window.location.href;
        const url = new URL(href);
        let raw = url.searchParams.get('ref') || url.searchParams.get('referrer') || url.searchParams.get('r');
        if (raw) {
          const addr = extractAddress(decodeURIComponent(raw));
          if (addr) return addr;
          return decodeURIComponent(raw).trim();
        }
        const m = href.match(/[?&]ref=([^&#]+)/i);
        if (m) {
          const addr = extractAddress(decodeURIComponent(m[1]));
          if (addr) return addr;
          return decodeURIComponent(m[1]).trim();
        }
      } catch {
        try {
          const m2 = window.location.search.match(/[?&]ref=([^&]+)/i);
          if (m2) {
            const addr = extractAddress(decodeURIComponent(m2[1]));
            if (addr) return addr;
            return decodeURIComponent(m2[1]).trim();
          }
        } catch {}
      }
      return null;
    };
    const raw = pickRef();
    if (raw) {
      const addr = extractAddress(raw);
      if (addr) {
        try {
          const checksummed = ethers.getAddress(addr);
          setReferrer(checksummed);
          try { localStorage.setItem('paradise_ref', checksummed); } catch {}
        } catch {
          setReferrer(addr);
        }
        return;
      }
    }
    // fallback: restore from previous session if user arrived without param but had saved ref
    try {
      const saved = localStorage.getItem('paradise_ref');
      if (saved && ethers.isAddress(saved) && !raw) setReferrer(ethers.getAddress(saved));
    } catch {}
  }, []);

  // Live referrer validation: show registered / not-registered status
  const [refStatus, setRefStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'self'>('idle');
  const [refPlanet, setRefPlanet] = useState('');
  useEffect(() => {
    if (!referrer) { setRefStatus('idle'); setRefPlanet(''); return; }
    const clean = extractAddress(referrer) || referrer.trim();
    if (!ethers.isAddress(clean)) { setRefStatus('invalid'); return; }
    if (address && clean.toLowerCase() === address.toLowerCase()) { setRefStatus('self'); return; }
    let cancelled = false;
    setRefStatus('checking');
    // debounce 400ms to avoid RPC spam
    const t = setTimeout(() => {
      getUserInfosBatch([clean]).then(infos => {
        if (cancelled) return;
        const ok = infos[0] && infos[0].id !== ethers.ZeroAddress && infos[0].id.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
        if (ok) {
          setRefStatus('valid');
          try {
            const lvl = Number(infos[0].level || 0);
            setRefPlanet(lvl ? getPlanetName(lvl) : '');
          } catch { setRefPlanet(''); }
        } else {
          setRefStatus('invalid');
          setRefPlanet('');
        }
      }).catch(() => { if (!cancelled) { setRefStatus('invalid'); setRefPlanet(''); } });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [referrer, address, getUserInfosBatch]);

  useEffect(() => {
    getSystemInfoCached().then((info) => {
      setRegFee(info.regFee);
      setCroPrice(info.croPrice);
    }).catch(() => {
      setRegFee('—');
      setCroPrice('—');
    });
  }, [getSystemInfoCached]);

  const handleRegister = async () => {
    if (!agreed) { setError('You must agree to the Terms and Conditions before registering.'); return; }
    // normalize referrer: extract address from URL if needed, then checksum
    let normRef = extractAddress(referrer) || referrer.trim();
    if (!normRef || !ethers.isAddress(normRef)) {
      setError('Please use a valid referral link (e.g. https://paradise-project.surge.sh?ref=0x...). The referrer address is missing or invalid.');
      return;
    }
    try { normRef = ethers.getAddress(normRef); } catch {}
    if (address && normRef.toLowerCase() === address.toLowerCase()) {
      setError('You cannot refer yourself. Please use a different referral link.');
      return;
    }
    if (regFee === '—' || !regFee) { setError('Registration fee not loaded yet. Please wait.'); return; }
    if (chainId !== CRONOS_CHAIN_ID) { setError(`Wrong network. Please switch to Cronos Mainnet (chain ID ${CRONOS_CHAIN_ID}) in your wallet.`); return; }
    setError(''); setLoading(true); setTxHash('');
    try {
      const paused = await getPaused();
      if (paused) { setError('Contract is paused. Please try again later.'); setLoading(false); return; }
      // explicit on-chain referrer check — gives clear message before matrix lookup
      try {
        const infos = await getUserInfosBatch([normRef]);
        const isReg = infos[0] && infos[0].id !== ethers.ZeroAddress && infos[0].id.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
        if (!isReg) {
          setError(`This referral link is not valid: ${normRef.slice(0,6)}...${normRef.slice(-4)} is not registered on Cronos Mainnet. Your link https://paradise-project.surge.sh?ref=${normRef} is valid only if the inviter is already registered. Ask for a link from a registered member.`);
          setLoading(false);
          return;
        }
      } catch {}
      // Fully on-chain registration: the contract computes matrix placement
      // internally — zero off-chain placement calculation, zero extra RPC reads.
      // (registerAuto falls back to a single-RPC lookup on pre-upgrade builds.)
      const receipt = await registerAuto(normRef, regFee);
      setTxHash(receipt.hash);
      try { localStorage.removeItem('paradise_ref'); } catch {}
      setTimeout(() => onNavigate('dashboard'), 2000);
    } catch (err: any) {
      const msg = (err?.reason || err?.message || '').toString();
      if (msg.includes('missing revert data') || msg.includes('could not decode')) {
        setError('Transaction failed. Ensure your wallet is on Cronos Mainnet and has sufficient CRO balance.');
      } else if (msg.includes('Ref not reg') || msg.includes('Place parent not reg') || msg.toLowerCase().includes('not registered')) {
        setError(`Referrer ${normRef.slice(0,6)}...${normRef.slice(-4)} is not registered on-chain. The link you used is not valid yet — ask your inviter to complete registration first.`);
      } else if (msg.includes('Ref cap') || msg.includes('referral cap')) {
        setError('This referrer has reached the referral limit. Please try a different referral link.');
      } else if (msg.includes('Place parent full') || msg.includes('Tree full')) {
        setError('Referrer matrix is temporarily full at that position. Please try again or use another referral link.');
      } else if (msg.toLowerCase().includes('already registered') || msg.includes("Reg'd")) {
        setError('This wallet is already registered.');
      } else {
        setError(msg.slice(0, 180) || 'Transaction failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Hero */}
      <section className="relative py-12 sm:py-16 lg:py-24 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-48 sm:w-72 lg:w-96 h-48 sm:h-72 lg:h-96 bg-brand-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-40 sm:w-64 lg:w-80 h-40 sm:h-64 lg:h-80 bg-purple-500/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-3 sm:px-4 py-1 mb-6">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] sm:text-xs font-medium text-brand-300">Live on Cronos Mainnet</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-6xl font-extrabold mb-4 leading-tight">
            <span className="gradient-text">Build Your Network.</span>
            <br />
            <span className="text-white">Earn Passive Income.</span>
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-slate-400 max-w-xl mx-auto mb-6 sm:mb-8 px-2">
            12-level MLM system with automatic upgrades, binary tree positioning, and real-time CRO payments on Cronos.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {!isConnected ? (
              <button onClick={connect} className="btn-primary text-sm sm:text-base px-6 sm:px-8 py-2.5 sm:py-3 w-full sm:w-auto">
                Connect Wallet to Start
              </button>
            ) : (
              <button onClick={() => document.getElementById('register-section')?.scrollIntoView({ behavior: 'smooth' })} className="btn-primary text-sm sm:text-base px-6 sm:px-8 py-2.5 sm:py-3 w-full sm:w-auto">
                Register Now
              </button>
            )}
            <button onClick={() => onNavigate('dashboard')} className="btn-secondary text-sm sm:text-base px-6 sm:px-8 py-2.5 sm:py-3 w-full sm:w-auto">
              View Dashboard
            </button>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="max-w-4xl mx-auto w-full px-4 -mt-6 sm:-mt-4 mb-8 sm:mb-12">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="glass rounded-lg sm:rounded-xl p-2.5 sm:p-4 text-center">
            <p className="text-[10px] sm:text-xs text-slate-400 mb-0.5 sm:mb-1">CRO/USD</p>
            <p className="text-sm sm:text-lg font-bold text-white">${croPrice}</p>
          </div>
          <div className="glass rounded-lg sm:rounded-xl p-2.5 sm:p-4 text-center">
            <p className="text-[10px] sm:text-xs text-slate-400 mb-0.5 sm:mb-1">Registration Fee</p>
            <p className="text-sm sm:text-lg font-bold text-white">{regFee} CRO</p>
          </div>
          <div className="glass rounded-lg sm:rounded-xl p-2.5 sm:p-4 text-center">
            <p className="text-[10px] sm:text-xs text-slate-400 mb-0.5 sm:mb-1">Max Level</p>
            <p className="text-sm sm:text-lg font-bold gradient-gold">12</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto w-full px-4 mb-12 sm:mb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { icon: '⚡', title: 'Auto-Upgrades', desc: 'Earnings auto-reserve for your next level. When full, you level up instantly.' },
            { icon: '🌳', title: 'Binary Tree', desc: 'Auto-positioning binary tree scales to millions. Every user gets a unique position.' },
            { icon: '💰', title: '50/50 Split', desc: 'Each payment: 50% reserved for upgrade, 50% paid to your wallet immediately.' },
          ].map((f) => (
            <div key={f.title} className="glass rounded-xl sm:rounded-2xl p-4 sm:p-6 card-hover text-center">
              <div className="text-2xl sm:text-3xl mb-2 sm:mb-3">{f.icon}</div>
              <h3 className="text-sm sm:text-base font-bold text-white mb-1 sm:mb-2">{f.title}</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Registration Section */}
      {isConnected && (
        <section id="register-section" className="max-w-md mx-auto w-full px-4 mb-8 sm:mb-12">
          <div className="glass rounded-xl sm:rounded-2xl p-5 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-white mb-1">Join Paradise</h2>
            <p className="text-xs sm:text-sm text-slate-400 mb-4 sm:mb-5">Enter the referrer address of the person who invited you.</p>

            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="text-[10px] sm:text-xs font-medium text-slate-400 mb-1 block">Your Wallet</label>
                <div className="glass rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 font-mono text-xs sm:text-sm text-brand-300 truncate">{address}</div>
              </div>
              <div>
                <label className="text-[10px] sm:text-xs font-medium text-slate-400 mb-1 block">Referrer Address {referrer && <span className="text-[10px] font-normal text-slate-500">(from ?ref= link auto-filled)</span>}</label>
                <div className="relative">
                  <input
                    type="text"
                    value={referrer}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      const addr = extractAddress(val);
                      setReferrer(addr || val);
                    }}
                    placeholder="0x... (paste referral link or address)"
                    className={`w-full bg-white/5 border rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 pr-9 text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 transition-all ${refStatus==='valid' ? 'border-emerald-500/40 focus:border-emerald-500/50 focus:ring-emerald-500/25' : refStatus==='invalid' || refStatus==='self' ? 'border-red-500/40 focus:border-red-500/50 focus:ring-red-500/25' : 'border-white/10 focus:border-brand-500/50 focus:ring-brand-500/25'}`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {refStatus==='checking' && <span className="h-4 w-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin inline-block" />}
                    {refStatus==='valid' && <span className="text-emerald-400">✓</span>}
                    {(refStatus==='invalid' || refStatus==='self') && <span className="text-red-400">✗</span>}
                  </div>
                </div>
                {referrer && refStatus==='valid' && (
                  <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1">✓ Valid referrer {referrer.slice(0,6)}...{referrer.slice(-4)} {refPlanet ? `· ${refPlanet}` : ''} — referral link is active</p>
                )}
                {referrer && refStatus==='invalid' && (
                  <p className="text-[11px] text-red-400 mt-1.5">✗ This address is not registered on Cronos Mainnet. Please obtain a valid referral link from a registered member.</p>
                )}
                {referrer && refStatus==='self' && (
                  <p className="text-[11px] text-amber-400 mt-1.5">⚠ You cannot refer yourself. Use a different referral link.</p>
                )}
                {!referrer && (
                  <p className="text-[11px] text-slate-500 mt-1.5">Tip: open a referral link with ?ref=0x... directly, or paste the inviter's address above.</p>
                )}
              </div>
              <div className="bg-white/3 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-400">Registration Fee</span>
                  <span className="text-white font-semibold">{regFee} CRO</span>
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs mt-1">
                  <span className="text-slate-500">≈ $2.00 USD</span>
                  <span className="text-slate-500">@ ${croPrice}/CRO</span>
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                />
                <span className="text-xs text-slate-400 leading-relaxed">
                  I have read and agree to the{' '}
                  <a href="#disclaimer" className="text-brand-300 underline hover:text-brand-200">Terms and Conditions</a>{' '}
                  of the Paradise system.
                </span>
              </label>

              {error && <p className="text-xs sm:text-sm text-red-400 bg-red-500/10 rounded-lg px-3 sm:px-4 py-2">{error}</p>}
              {txHash && (
                <p className="text-xs sm:text-sm text-emerald-400 bg-emerald-500/10 rounded-lg px-3 sm:px-4 py-2">
                  Registered! <a href={`https://cronoscan.com/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline">View TX</a>
                </p>
              )}

              <button onClick={handleRegister} disabled={loading || !referrer || !agreed} className="btn-primary w-full text-sm sm:text-base py-3 sm:py-3.5">
                {loading ? 'Processing...' : `Register — ${regFee} CRO`}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <section id="disclaimer" className="max-w-2xl mx-auto w-full px-4 pb-8 sm:pb-16">
        <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-amber-500/20">
          <h2 className="text-base sm:text-lg font-bold text-amber-400 mb-2 sm:mb-3">Disclaimer</h2>
          <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
            <p>
              The earnings, upgrade mechanism, what you withdraw and spill over functions depend entirely on community activity.
            </p>
            <p>
              <strong className="text-amber-400">Blockchain Immutability.</strong>{' '}
              This application interacts with a smart contract on the Cronos blockchain. Transactions are permanent, and cannot be altered, or stopped by any administrator or developer.
            </p>
            <p>
              This is not an investment platform or scheme. It is a contribution system where users contribute to one another in a logical manner which could make it a win-win for believers dedicated to win in life.
            </p>
            <p className="text-amber-300 font-medium">
              By connecting your wallet, you acknowledge that you have read, understood, and agreed to these terms.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

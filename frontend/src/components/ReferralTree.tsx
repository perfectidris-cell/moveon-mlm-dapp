import { useEffect, useMemo, useState } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useContract } from '../hooks/useContract';

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const LEVEL_STYLES: Record<number, string> = {
  12: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  9: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  6: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  3: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  0: 'text-brand-400 bg-brand-400/10 border-brand-400/20',
};

function getLevelStyle(level: number) {
  if (level >= 12) return LEVEL_STYLES[12];
  if (level >= 9) return LEVEL_STYLES[9];
  if (level >= 6) return LEVEL_STYLES[6];
  if (level >= 3) return LEVEL_STYLES[3];
  return LEVEL_STYLES[0];
}

export default function ReferralTree({ downline: _downline, totalReferrals, onViewAll }: { downline: string[]; totalReferrals: number; onViewAll?: () => void }) {
  const { address } = useWeb3();
  const contract = useContract();
  const [children, setChildren] = useState<string[]>([]);
  const [levels, setLevels] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!address) return;

    contract.getMatrixChildren(address)
      .then((kids) => {
        setChildren(kids);
        if (kids.length > 0) {
          contract.getUserInfosBatch(kids)
            .then((infos) => {
              const nextLevels: Record<string, number> = {};
              for (let i = 0; i < kids.length; i += 1) {
                if (infos[i] && infos[i].id !== '0x0000000000000000000000000000000000000000') {
                  nextLevels[kids[i].toLowerCase()] = infos[i].level;
                }
              }
              setLevels(nextLevels);
            })
            .catch(() => setLevels({}));
        } else {
          setLevels({});
        }
      })
      .catch(() => setChildren([]));
  }, [address, contract]);

  const directCount = children.length;
  const depth = useMemo(() => (directCount > 0 ? 2 : 1), [directCount]);
  const hasNetwork = totalReferrals > 0 || directCount > 0;

  return (
    <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div>
          <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.3em] text-brand-400/80">Network Overview</p>
          <h3 className="text-base sm:text-lg font-bold text-white">Your referral circle</h3>
        </div>
        <span className="text-[10px] sm:text-xs text-slate-400 bg-white/5 px-2 sm:px-2.5 py-1 rounded-full">{totalReferrals} members</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-center">
          <div className="text-sm font-semibold text-white">{directCount}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Direct</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-center">
          <div className="text-sm font-semibold text-white">{depth}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Depth</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-center">
          <div className="text-sm font-semibold text-white">{totalReferrals}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Total</div>
        </div>
      </div>

      <div className="rounded-xl border border-brand-500/20 bg-gradient-to-r from-brand-500/10 to-purple-500/10 p-3 mb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Invite link</p>
            <p className="text-sm text-white font-medium">Share your network and grow your circle</p>
          </div>
          <div className="text-xs text-brand-300 font-semibold">Ready</div>
        </div>
      </div>

      {!hasNetwork ? (
        <div className="text-center py-6 sm:py-8 text-slate-500">
          <p className="text-xs sm:text-sm">No members in your network yet. Share your link to start building.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {children.slice(0, 4).map((child) => {
            const level = levels[child.toLowerCase()] || 0;
            return (
              <div key={child} className={`flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 ${getLevelStyle(level)}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${getLevelStyle(level)}`}>
                  {level || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-white">{shortenAddress(child)}</div>
                  <div className="text-[11px] text-slate-400">Level {level}</div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getLevelStyle(level)}`}>
                  L{level}
                </span>
              </div>
            );
          })}

          {onViewAll && totalReferrals > 0 && (
            <button
              onClick={onViewAll}
              className="mt-1 w-full rounded-lg bg-brand-500/10 py-2 text-center text-[11px] font-semibold text-brand-300 transition-colors hover:bg-brand-500/20"
            >
              Open full network
            </button>
          )}
        </div>
      )}
    </div>
  );
}

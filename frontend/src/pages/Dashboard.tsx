import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useContract } from '../hooks/useContract';
import StatCard from '../components/StatCard';
import LevelTable from '../components/LevelTable';
import ReferralTree from '../components/ReferralTree';
import type { UserInfo, UserFinancialInfo } from '../types';

export default function Dashboard({ onNavigate }: { onNavigate?: (p: 'home' | 'dashboard' | 'downline' | 'admin') => void }) {
  const { address, isConnected } = useWeb3();
  const contract = useContract();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [financials, setFinancials] = useState<UserFinancialInfo | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [downline, setDownline] = useState<string[]>([]);
  const [downlineTruncated, setDownlineTruncated] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [upgradeLoading, setUpgradeLoading] = useState<number | null>(null);
  const [levelCosts, setLevelCosts] = useState<Record<number, string>>({});
  const [pendingWithdrawal, setPendingWithdrawal] = useState('0');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [walletUpgradeLoading, setWalletUpgradeLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async (force = false) => {
    if (!isConnected || !address) return;
    setLoading(true); setError('');
    try {
      const batchCheck = await contract.getUserInfosBatch([address], force);
      if (!batchCheck[0] || batchCheck[0].id === '0x0000000000000000000000000000000000000000') {
        setError('This wallet is not registered in the Paradise system.');
        setLoading(false);
        return;
      }

      setUserInfo(batchCheck[0]);

      const [fin, sysInfo, down] = await Promise.all([
        contract.getUserFinancialInfo(address, force).catch(() => null),
        contract.getSystemInfoCached().catch(() => null),
        contract.getDownline(address, 3, force).catch(() => [] as string[]),
      ]);

      if (fin) {
        setFinancials(fin);
        setPendingWithdrawal(fin.totalWithdrawableBalance ?? '0');
      }
      if (sysInfo) {
        setTotalUsers(sysInfo.totalUsers);
        setLevelCosts(sysInfo.levelCosts);
      }
      setDownline(down);
      setDownlineTruncated(down.length >= 2000);
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, contract]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!isConnected || !address) { setIsOwner(false); return; }
    contract.getOwner().then((own) => {
      setIsOwner(own.toLowerCase() === address.toLowerCase());
    }).catch(() => setIsOwner(false));
  }, [isConnected, address, contract]);

  const handleUpgrade = async (level: number) => {
    const cost = levelCosts[level];
    if (!cost) { setError('Level cost not loaded. Try refreshing.'); return; }
    setUpgradeLoading(level); setError('');
    try {
      await contract.walletUpgrade(cost);
      await loadData(true);
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Upgrade failed');
    } finally {
      setUpgradeLoading(null);
    }
  };

  const handleUpgradeFromReserve = async () => {
    setUpgradeLoading(null); setError('');
    try {
      await contract.upgradeFromReserve();
      await loadData(true);
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Reserve upgrade failed');
    } finally {
      setUpgradeLoading(null);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawLoading(true); setError('');
    try {
      await contract.withdraw();
      await loadData(true);
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Withdraw failed');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleWalletUpgradeSubmit = async () => {
    const nextLevel = userInfo!.level + 1;
    const cost = levelCosts[nextLevel];
    if (!cost || parseFloat(cost) <= 0) { setError('Level cost not loaded. Try refreshing.'); return; }
    setWalletUpgradeLoading(true); setError('');
    try {
      await contract.walletUpgrade(cost);
      await loadData(true);
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Wallet upgrade failed');
    } finally {
      setWalletUpgradeLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-6 sm:p-8 text-center max-w-sm">
          <div className="text-3xl sm:text-4xl mb-4">🔗</div>
          <h2 className="text-lg sm:text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-sm text-slate-400">Connect your wallet to view your dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading your data...</p>
        </div>
      </div>
    );
  }

  if (error && !userInfo) {
    const isRegisteredError = error.includes('not registered');
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-6 sm:p-8 text-center max-w-sm">
          <div className="text-3xl sm:text-4xl mb-4">{isRegisteredError ? '⚠️' : '🔌'}</div>
          <h2 className="text-lg sm:text-xl font-bold text-white mb-2">{isRegisteredError ? 'Not Registered' : 'Connection Error'}</h2>
          <p className="text-sm text-slate-400 mb-4">{error}</p>
          {isRegisteredError && <p className="text-xs text-slate-500">Register on the home page to get started.</p>}
        </div>
      </div>
    );
  }

  if (!userInfo) return null;
  if (!financials) {
    return (
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-8">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400">
          Financial data unavailable. Some features may be limited. Try refreshing.
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Welcome back, Level {userInfo.level} member</p>
          </div>
          {isOwner && onNavigate && (
            <button onClick={() => onNavigate('admin')} className="btn-primary text-xs sm:text-sm px-4 py-2 whitespace-nowrap">
              Admin Dashboard
            </button>
          )}
        </div>
        <StatCard label="Level" value={`${userInfo.level}`} icon="📊" color="from-brand-400 to-brand-600" subtext="of 12" />
        <StatCard label="Direct Referrals" value={`${userInfo.directReferrals}`} icon="👥" color="from-purple-400 to-purple-600" subtext="recruited" />
        <StatCard label="Total Earnings" value={`${parseFloat(ethers.formatEther(userInfo.totalEarnings)).toFixed(4)}`} icon="💰" color="from-emerald-400 to-emerald-600" subtext="CRO earned" />
        <StatCard label="Network Size" value={`${userInfo.totalReferrals}`} icon="🌳" color="from-amber-400 to-amber-600" subtext={`${totalUsers} total users`} />
      </div>
    );
  }

  const referralLink = `?ref=${address}`;
  const pendingNum = parseFloat(pendingWithdrawal);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-8">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-red-400">{error}</div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Welcome back, Level {userInfo.level} member</p>
        </div>
        {isOwner && onNavigate && (
          <button onClick={() => onNavigate('admin')} className="btn-primary text-xs sm:text-sm px-4 py-2 whitespace-nowrap">
            Admin Dashboard
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        <StatCard label="Level" value={`${userInfo.level}`} icon="📊" color="from-brand-400 to-brand-600" subtext="of 12" />
        <StatCard label="Direct Referrals" value={`${userInfo.directReferrals}`} icon="👥" color="from-purple-400 to-purple-600" subtext="recruited" />
        <StatCard label="Total Earnings" value={`${parseFloat(ethers.formatEther(userInfo.totalEarnings)).toFixed(4)}`} icon="💰" color="from-emerald-400 to-emerald-600" subtext="CRO earned" />
        <StatCard label="Network Size" value={`${userInfo.totalReferrals}`} icon="🌳" color="from-amber-400 to-amber-600" subtext={`${totalUsers} total users`} />
        <StatCard label="Pending Withdrawal" value={`${pendingNum.toFixed(4)}`} icon="💳" color="from-cyan-400 to-cyan-600" subtext="CRO available" />
      </div>

      {/* Withdraw */}
      <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-bold text-white">Withdraw Earnings</h3>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
              {pendingNum > 0
                ? `${pendingNum.toFixed(4)} CRO available to withdraw.`
                : 'No pending withdrawal balance.'}
            </p>
          </div>
          <button
            onClick={handleWithdraw}
            disabled={withdrawLoading || pendingNum <= 0}
            className={`text-xs sm:text-sm px-5 sm:px-6 py-2.5 rounded-xl font-semibold transition-all w-full sm:w-auto ${
              pendingNum > 0
                ? 'btn-primary'
                : 'bg-white/5 text-slate-500 cursor-not-allowed'
            }`}
          >
            {withdrawLoading ? 'Processing...' : 'Withdraw All'}
          </button>
        </div>
      </div>

      {/* Reserve Progress */}
      <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm sm:text-base font-bold text-white">Upgrade via Reserve</h3>
          <p className="text-[10px] sm:text-xs text-slate-400">50% auto-reserved</p>
        </div>
        {userInfo.level >= 12 ? (
          <p className="text-sm text-emerald-400 text-center py-3 sm:py-4">You are already at max level (12)!</p>
        ) : (() => {
          const nextLevel = userInfo.level + 1;
          const cost = levelCosts[nextLevel];
          const reservedArr = financials.reservedForUpgrade;
          const reservedStr = reservedArr && reservedArr.length > nextLevel ? reservedArr[nextLevel] : '0';
          const reservedNum = parseFloat(ethers.formatEther(reservedStr));
          const costNum = cost ? parseFloat(cost) : 0;
          const pct = costNum > 0 ? Math.min((reservedNum / costNum) * 100, 100) : 0;
          const canUpgrade = costNum > 0 && reservedNum >= costNum;
          return (
            <div className="bg-white/3 rounded-xl p-3 sm:p-3 max-w-md">
              <div className="flex justify-between text-[10px] sm:text-xs mb-1.5">
                <span className="text-slate-400">Level {nextLevel} Reserve</span>
                <span className="text-white font-medium">{reservedNum.toFixed(4)} / {costNum.toFixed(4)} CRO</span>
              </div>
              <div className="h-1.5 sm:h-2 bg-white/5 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${canUpgrade ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-brand-400 to-brand-600'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <button
                onClick={handleUpgradeFromReserve}
                disabled={upgradeLoading === nextLevel || !canUpgrade}
                className={`w-full text-[10px] sm:text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                  canUpgrade
                    ? 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
                    : 'text-slate-500 bg-white/5'
                }`}
              >
                {upgradeLoading === nextLevel
                  ? 'Upgrading...'
                  : canUpgrade
                    ? `Upgrade to Level ${nextLevel} (Reserve)`
                    : 'Insufficient reserve'}
              </button>
            </div>
          );
        })()}
      </div>

      {/* External Wallet Upgrade */}
      <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm sm:text-base font-bold text-white">Upgrade via External Wallet</h3>
          <p className="text-[10px] sm:text-xs text-slate-400">One level at a time</p>
        </div>
        {userInfo.level >= 12 ? (
          <p className="text-sm text-emerald-400 text-center py-3 sm:py-4">You are already at max level (12)!</p>
        ) : (() => {
          const nextLevel = userInfo.level + 1;
          const cost = levelCosts[nextLevel];
          return (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
              <div className="flex-1">
                <p className="text-xs sm:text-sm text-slate-400 mb-1">
                  Upgrade to <span className="text-white font-semibold">Level {nextLevel}</span>
                  {cost ? <span className="text-brand-400 font-mono"> — {parseFloat(cost).toFixed(4)} CRO</span> : null}
                </p>
              </div>
              <button
                onClick={handleWalletUpgradeSubmit}
                disabled={walletUpgradeLoading || !cost}
                className="btn-primary text-xs sm:text-sm px-5 sm:px-6 py-3 whitespace-nowrap disabled:opacity-50 w-full sm:w-auto"
              >
                {walletUpgradeLoading ? 'Processing...' : cost ? `Upgrade Lvl ${nextLevel}` : 'Loading cost...'}
              </button>
            </div>
          );
        })()}
      </div>

      {/* Referral Link */}
      <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm sm:text-base font-bold text-white mb-2">Your Referral Link</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/5 rounded-xl px-3 sm:px-4 py-2 font-mono text-[10px] sm:text-xs text-brand-300 truncate">
            {window.location.origin}{referralLink}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}${referralLink}`)}
            className="btn-secondary text-[10px] sm:text-xs px-3 sm:px-4 py-2 whitespace-nowrap"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Two Column */}
      <div className="grid lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="lg:col-span-3">
          <LevelTable userLevel={userInfo.level} onUpgrade={handleUpgrade} />
        </div>
        <div className="lg:col-span-2">
          {downlineTruncated && (
            <p className="text-[10px] text-amber-400/80 mb-2 text-center">Showing up to 2,000 members. Visit full network for complete view.</p>
          )}
          <ReferralTree downline={downline} totalReferrals={userInfo.totalReferrals} onViewAll={() => onNavigate?.('downline')} />
        </div>
      </div>
    </div>
  );
}

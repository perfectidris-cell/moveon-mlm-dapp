import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useContract } from '../hooks/useContract';

export default function AdminPage() {
  const { address, isConnected, provider } = useWeb3();
  const contract = useContract();

  const [owner, setOwner] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [ownerBalance, setOwnerBalance] = useState('0');
  const [paused, setPaused] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [croPrice, setCroPrice] = useState('0');
  const [regFee, setRegFee] = useState('0');
  const [manualCroUsdPrice, setManualCroUsdPrice] = useState('0');
  const [manualRegFee, setManualRegFee] = useState('0');
  const [, _setManualLevelCosts] = useState<string[]>(Array(13).fill('0'));
  const [referralCap, setReferralCap] = useState(0);
  const [levelCosts, setLevelCosts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Oracle config state
  const [oracles, setOracles] = useState({ pyth: '', band: '', pythPriceId: '', supra: '', witnet: '', witnetPriceId: '' });

  // Oracle update form
  const [oracleForm, setOracleForm] = useState({ pyth: '', band: '', pythPriceId: '', supra: '', witnet: '', witnetPriceId: '' });

  const [manualPriceInput, setManualPriceInput] = useState('');
  const [manualRegFeeInput, setManualRegFeeInput] = useState('');
  const [manualLevelCostsInput, setManualLevelCostsInput] = useState<string[]>(Array(13).fill(''));
  const [referralCapInput, setReferralCapInput] = useState('');
  const [userLevelAddress, setUserLevelAddress] = useState('');
  const [userLevelValue, setUserLevelValue] = useState('');

  // Migration state
  const [migrationInfo, setMigrationInfo] = useState({ total: 0, migrated: 0 });
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState('');

  const loadData = useCallback(async () => {
    if (!isConnected || !address) return;
    setLoading(true); setError(''); setSuccess('');

    try {
      const [own, p, sysInfo] = await Promise.all([
        contract.getOwner().catch(() => ''),
        contract.getPaused().catch(() => false),
        contract.getSystemInfoCached().catch(() => null),
      ]);

      setOwner(own);
      setIsOwner(own.toLowerCase() === address.toLowerCase());
      setPaused(p);

      if (sysInfo) {
        setTotalUsers(sysInfo.totalUsers);
        setCroPrice(sysInfo.croPrice);
        setRegFee(sysInfo.regFee);
        setLevelCosts(sysInfo.levelCosts);
      }

      // Migration info
      if (own.toLowerCase() === address.toLowerCase()) {
        const [migrated, tot] = await Promise.all([
          contract.getMigratedCount().catch(() => 0),
          contract.getTotalUsers().catch(() => 0),
        ]);
        setMigrationInfo({ total: tot, migrated });
      }

      if (own.toLowerCase() === address.toLowerCase()) {
        const [mPrice, mRegFee, mReferralCap, mCosts, pyth, band, pythPriceId, supra, witnet, witnetPriceId, bal] = await Promise.all([
          contract.getManualCroUsdPrice().catch(() => '0'),
          contract.getManualRegistrationFeeCro().catch(() => '0'),
          contract.getReferralCap().catch(() => 0),
          contract.getManualLevelCostsBatch().catch(() => Array(13).fill('0')),
          contract.getPythAddress().catch(() => ''),
          contract.getBandAddress().catch(() => ''),
          contract.getPythPriceId().catch(() => ''),
          contract.getSupraRouter().catch(() => ''),
          contract.getWitnetRouter().catch(() => ''),
          contract.getWitnetPriceId().catch(() => ''),
          provider ? provider.getBalance(own).then(b => ethers.formatEther(b)).catch(() => '0') : Promise.resolve('0'),
        ]);

        setOwnerBalance(bal || '0');

        const orc = { pyth, band, pythPriceId, supra, witnet, witnetPriceId };
        setOracles(orc);
        setOracleForm(orc);

        setManualCroUsdPrice(mPrice);
        setManualRegFee(mRegFee);
        _setManualLevelCosts(mCosts);
        setReferralCap(mReferralCap);
        setManualPriceInput(mPrice === '0' ? '' : mPrice);
        setManualRegFeeInput(mRegFee === '0' ? '' : mRegFee);
        setManualLevelCostsInput(mCosts.map(c => c === '0' ? '' : c));
        setReferralCapInput(mReferralCap.toString());
      }
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, contract, provider]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSetManualPrice = async () => {
    if (!manualPriceInput || isNaN(Number(manualPriceInput))) {
      setError('Enter a valid price (8 decimals, e.g. 5000000 = $0.05)'); return;
    }
    setActionLoading('price'); setError(''); setSuccess('');
    try {
      await contract.setManualCroUsdPrice(manualPriceInput);
      setSuccess(`Manual CRO/USD price set to ${manualPriceInput}`);
      await loadData();
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Failed to set price');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetManualRegFee = async () => {
    if (!manualRegFeeInput || isNaN(Number(manualRegFeeInput))) {
      setError('Enter a valid registration fee in wei'); return;
    }
    const costs = manualLevelCostsInput.map(c =>
      !c || isNaN(Number(c)) ? '0' : c
    );
    setActionLoading('regFee'); setError(''); setSuccess('');
    try {
      await contract.setManualCroCosts(manualRegFeeInput, costs);
      setSuccess('Manual registration fee and level costs updated');
      await loadData();
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Failed to set costs');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTogglePause = async () => {
    setActionLoading('pause'); setError(''); setSuccess('');
    try {
      await contract.togglePause();
      setSuccess(paused ? 'Contract unpaused' : 'Contract paused');
      await loadData();
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Toggle pause failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetReferralCap = async () => {
    const cap = parseInt(referralCapInput);
    if (isNaN(cap) || cap <= 0) {
      setError('Enter a valid referral cap (> 0)'); return;
    }
    setActionLoading('cap'); setError(''); setSuccess('');
    try {
      await contract.setReferralCap(cap);
      setSuccess(`Referral cap set to ${cap}`);
      await loadData();
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Failed to set referral cap');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetUserLevel = async () => {
    if (!ethers.isAddress(userLevelAddress)) {
      setError('Enter a valid address'); return;
    }
    const lvl = parseInt(userLevelValue);
    if (isNaN(lvl) || lvl < 1 || lvl > 12) {
      setError('Level must be between 1 and 12'); return;
    }
    setActionLoading('userLevel'); setError(''); setSuccess('');
    try {
      await contract.setUserLevel(userLevelAddress, lvl);
      setSuccess(`User ${userLevelAddress.slice(0, 6)}...${userLevelAddress.slice(-4)} set to Level ${lvl}`);
      await loadData();
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Failed to set user level');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunMigration = async () => {
    setMigrationRunning(true); setError(''); setSuccess(''); setMigrationProgress('');
    const BATCH_SIZE = 30;
    let migrated = migrationInfo.migrated;
    let startIndex = 0;

    // Find first un-migrated index
    try {
      if (migrated > 0) {
        for (let i = 0; i < migrationInfo.total; i++) {
          const addrs = await contract.getUserAddressesPaginated(i, 1);
          if (addrs.length === 0) break;
          const done = await contract.getIsMigrated(addrs[0]);
          if (!done) { startIndex = i; break; }
        }
      }

      while (startIndex < migrationInfo.total) {
        setMigrationProgress(`Migrating batch starting at index ${startIndex}...`);
        await contract.migrateUserBatch(startIndex, BATCH_SIZE);
        migrated = await contract.getMigratedCount();
        setMigrationInfo(m => ({ ...m, migrated }));
        startIndex += BATCH_SIZE;
      }

      setSuccess(`Migration complete! ${migrated}/${migrationInfo.total} users processed.`);
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Migration failed');
    } finally {
      setMigrationRunning(false);
      setMigrationProgress('');
    }
  };

  const handleUpdateOracles = async () => {
    setActionLoading('oracles'); setError(''); setSuccess('');
    try {
      await contract.setNewPriceFeeds(
        oracleForm.pyth, oracleForm.band, oracleForm.pythPriceId,
        oracleForm.supra, oracleForm.witnet, oracleForm.witnetPriceId
      );
      setSuccess('Oracle configuration updated');
      await loadData();
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Failed to update oracles');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateSimpleFeeds = async () => {
    setActionLoading('simpleFeeds'); setError(''); setSuccess('');
    try {
      await contract.setPriceFeeds(oracleForm.pyth, oracleForm.band, oracleForm.pythPriceId);
      setSuccess('Pyth/Band price feeds updated');
      await loadData();
    } catch (err: any) {
      setError(err?.reason || err?.message?.slice(0, 100) || 'Failed to update price feeds');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLevelCostChange = (idx: number, val: string) => {
    const next = [...manualLevelCostsInput];
    next[idx] = val;
    setManualLevelCostsInput(next);
  };

  const shorten = (s: string) => s ? `${s.slice(0, 10)}...${s.slice(-8)}` : 'Not set';
  const shortenHex = (s: string) => s ? `${s.slice(0, 10)}...${s.slice(-6)}` : 'Not set';

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-8 text-center max-w-sm">
          <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-sm text-slate-400">Connect your wallet to access the admin panel.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-8 text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-slate-400">Only the contract owner can access this panel.</p>
          <p className="text-xs text-slate-500 mt-2 font-mono">Owner: {owner.slice(0, 6)}...{owner.slice(-4)}</p>
        </div>
      </div>
    );
  }

  const formatWei = (w: string) => {
    try { return ethers.formatEther(w); } catch { return w; }
  };

  const croUsdDisplay = croPrice;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-8">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400">{success}</div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Contract owner panel — {address?.slice(0, 6)}...{address?.slice(-4)}</p>
        </div>
        <button onClick={loadData} className="btn-secondary text-xs sm:text-sm px-4 py-2 flex items-center gap-2 self-start">
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          Refresh
        </button>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        <div className="glass rounded-xl p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs text-slate-400 mb-1">Contract State</p>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${paused ? 'bg-red-400' : 'bg-emerald-400'}`} />
            <span className={`text-sm sm:text-base font-bold ${paused ? 'text-red-400' : 'text-emerald-400'}`}>
              {paused ? 'Paused' : 'Active'}
            </span>
          </div>
        </div>
        <div className="glass rounded-xl p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs text-slate-400 mb-1">Total Users</p>
          <p className="text-sm sm:text-base font-bold text-white">{totalUsers}</p>
        </div>
        <div className="glass rounded-xl p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs text-slate-400 mb-1">CRO/USD Price</p>
          <p className="text-sm sm:text-base font-bold text-white">${croUsdDisplay}</p>
        </div>
        <div className="glass rounded-xl p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs text-slate-400 mb-1">Registration Fee</p>
          <p className="text-sm sm:text-base font-bold text-white">{parseFloat(formatWei(regFee)).toFixed(4)} CRO</p>
        </div>
        <div className="glass rounded-xl p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs text-slate-400 mb-1">Owner Balance</p>
          <p className="text-sm sm:text-base font-bold text-white">{parseFloat(ownerBalance).toFixed(4)} CRO</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Manual CRO/USD Price */}
        <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">Manual CRO/USD Price</h3>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Fallback price when oracles fail. 8 decimals (e.g. 5000000 = $0.05)</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] sm:text-xs font-medium text-slate-400 mb-1 block">Price (8 decimals)</label>
              <input
                type="text"
                value={manualPriceInput}
                onChange={(e) => setManualPriceInput(e.target.value)}
                placeholder="e.g. 5000000"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50"
              />
              <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1 cursor-default">Current: <span className="font-mono">{manualCroUsdPrice === '0' ? 'Not set' : manualCroUsdPrice}</span></p>
            </div>
            <button
              onClick={handleSetManualPrice}
              disabled={actionLoading === 'price' || !manualPriceInput}
              className="btn-primary text-xs sm:text-sm px-4 py-2.5 whitespace-nowrap disabled:opacity-50"
            >
              {actionLoading === 'price' ? 'Setting...' : 'Set Price'}
            </button>
          </div>
        </div>

        {/* Manual Registration Fee */}
        <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">Manual Registration Fee &amp; Level Costs</h3>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Set fallback costs in wei (18 decimals). All 13 levels required.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] sm:text-xs font-medium text-slate-400 mb-1 block">Registration Fee (wei)</label>
              <input
                type="text"
                value={manualRegFeeInput}
                onChange={(e) => setManualRegFeeInput(e.target.value)}
                placeholder="e.g. 100000000000000000 (0.1 CRO)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50"
              />
              <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1 cursor-default">Current: {manualRegFee === '0' ? 'Not set' : `${formatWei(manualRegFee)} CRO`}</p>
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
            {manualLevelCostsInput.map((cost, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs text-slate-400 w-16 shrink-0">Level {i}</span>
                <input
                  type="text"
                  value={cost}
                  onChange={(e) => handleLevelCostChange(i, e.target.value)}
                  placeholder="wei"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] sm:text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 font-mono"
                />
                <span className="text-[9px] text-slate-500 w-16 text-right font-mono">
                  {cost ? `${parseFloat(formatWei(cost || '0')).toFixed(2)} CRO` : ''}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={handleSetManualRegFee}
            disabled={actionLoading === 'regFee'}
            className="btn-primary text-xs sm:text-sm px-4 py-2.5 w-full disabled:opacity-50"
          >
            {actionLoading === 'regFee' ? 'Setting...' : 'Set Manual Costs'}
          </button>
        </div>
      </div>

      {/* Oracle Configuration */}
      <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-white">Oracle Configuration</h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Update all price feed sources. Changing oracle addresses/IDs takes effect immediately.</p>
        </div>

        {/* Current values */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-0.5">Pyth</p>
            <p className="text-xs font-mono text-white break-all">{shorten(oracles.pyth)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-0.5">Band</p>
            <p className="text-xs font-mono text-white break-all">{shorten(oracles.band)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-0.5">Supra Router</p>
            <p className="text-xs font-mono text-white break-all">{shorten(oracles.supra)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-0.5">Witnet Router</p>
            <p className="text-xs font-mono text-white break-all">{shorten(oracles.witnet)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-0.5">Pyth Price ID</p>
            <p className="text-[10px] font-mono text-white break-all">{shortenHex(oracles.pythPriceId)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-0.5">Witnet Price ID</p>
            <p className="text-xs font-mono text-white break-all">{shortenHex(oracles.witnetPriceId)}</p>
          </div>
        </div>

        {/* Update form */}
        <div className="space-y-3 border-t border-white/5 pt-3">
          <p className="text-xs font-semibold text-slate-300">Update All Oracles</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Pyth Address</label>
              <input type="text" value={oracleForm.pyth} onChange={(e) => setOracleForm(p => ({ ...p, pyth: e.target.value }))} placeholder="0x..." className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] sm:text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Band Address</label>
              <input type="text" value={oracleForm.band} onChange={(e) => setOracleForm(p => ({ ...p, band: e.target.value }))} placeholder="0x..." className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] sm:text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Pyth Price ID (bytes32)</label>
              <input type="text" value={oracleForm.pythPriceId} onChange={(e) => setOracleForm(p => ({ ...p, pythPriceId: e.target.value }))} placeholder="0x..." className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] sm:text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Supra Router</label>
              <input type="text" value={oracleForm.supra} onChange={(e) => setOracleForm(p => ({ ...p, supra: e.target.value }))} placeholder="0x..." className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] sm:text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Witnet Router</label>
              <input type="text" value={oracleForm.witnet} onChange={(e) => setOracleForm(p => ({ ...p, witnet: e.target.value }))} placeholder="0x..." className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] sm:text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Witnet Price ID (bytes4)</label>
              <input type="text" value={oracleForm.witnetPriceId} onChange={(e) => setOracleForm(p => ({ ...p, witnetPriceId: e.target.value }))} placeholder="0x..." className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] sm:text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 font-mono" />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleUpdateOracles}
              disabled={actionLoading === 'oracles'}
              className="btn-primary text-xs sm:text-sm px-4 py-2.5 flex-1 disabled:opacity-50"
            >
              {actionLoading === 'oracles' ? 'Updating...' : 'Update All Oracles (setNewPriceFeeds)'}
            </button>
            <button
              onClick={handleUpdateSimpleFeeds}
              disabled={actionLoading === 'simpleFeeds'}
              className="btn-secondary text-xs sm:text-sm px-4 py-2.5 flex-1 disabled:opacity-50"
            >
              {actionLoading === 'simpleFeeds' ? 'Updating...' : 'Update Pyth & Band Only (setPriceFeeds)'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Pause / Unpause */}
        <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">Emergency Pause</h3>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
              {paused ? 'Contract is paused. Unpause to allow registrations and upgrades.' : 'Pause all registrations and upgrades.'}
            </p>
          </div>
          <button
            onClick={handleTogglePause}
            disabled={actionLoading === 'pause'}
            className={`w-full text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 ${
              paused
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
            }`}
          >
            {actionLoading === 'pause' ? 'Processing...' : paused ? 'Unpause Contract' : 'Pause Contract'}
          </button>
        </div>

        {/* Referral Cap */}
        <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">Referral Cap</h3>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Maximum registrations per referrer.</p>
          </div>
          <div className="flex items-stretch sm:items-end gap-2">
            <div className="flex-1">
              <input
                type="number"
                value={referralCapInput}
                onChange={(e) => setReferralCapInput(e.target.value)}
                placeholder="e.g. 50"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50"
              />
              <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1 cursor-default">Current: {referralCap}</p>
            </div>
            <button
              onClick={handleSetReferralCap}
              disabled={actionLoading === 'cap' || !referralCapInput}
              className="btn-primary text-xs sm:text-sm px-4 py-2.5 whitespace-nowrap disabled:opacity-50"
            >
              {actionLoading === 'cap' ? 'Setting...' : 'Set Cap'}
            </button>
          </div>
        </div>

        {/* Migration */}
        <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">User Migration</h3>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
              Backfill matrix data for users registered before the contract upgrade.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Migrated: {migrationInfo.migrated} / {migrationInfo.total}</span>
              <span>{migrationInfo.total > 0 ? `${Math.round((migrationInfo.migrated / migrationInfo.total) * 100)}%` : '—'}</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-400 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${migrationInfo.total > 0 ? (migrationInfo.migrated / migrationInfo.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500">{migrationProgress}</p>
            <button
              onClick={handleRunMigration}
              disabled={migrationRunning || migrationInfo.migrated >= migrationInfo.total}
              className="btn-primary text-xs sm:text-sm px-4 py-2.5 w-full disabled:opacity-50"
            >
              {migrationRunning
                ? 'Migrating...'
                : migrationInfo.migrated >= migrationInfo.total && migrationInfo.total > 0
                  ? 'All Users Migrated ✅'
                  : 'Run Migration'}
            </button>
          </div>
        </div>

        {/* Set User Level */}
        <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">Set User Level</h3>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Override any user's level (1-12).</p>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={userLevelAddress}
              onChange={(e) => setUserLevelAddress(e.target.value)}
              placeholder="0x..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 font-mono"
            />
            <div className="flex gap-2">
              <input
                type="number"
                value={userLevelValue}
                onChange={(e) => setUserLevelValue(e.target.value)}
                placeholder="Level 1-12"
                min={1}
                max={12}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50"
              />
              <button
                onClick={handleSetUserLevel}
                disabled={actionLoading === 'userLevel' || !userLevelAddress || !userLevelValue}
                className="btn-primary text-xs sm:text-sm px-4 py-2.5 whitespace-nowrap disabled:opacity-50"
              >
                {actionLoading === 'userLevel' ? 'Setting...' : 'Set'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Level Costs Overview */}
      <div className="glass rounded-xl sm:rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm sm:text-base font-bold text-white mb-3">Current Level Costs</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Object.entries(levelCosts).map(([level, cost]) => (
            <div key={level} className="bg-white/5 rounded-lg p-2 sm:p-3 text-center">
              <p className="text-[10px] sm:text-xs text-slate-400">Level {level}</p>
              <p className="text-xs sm:text-sm font-bold text-white font-mono">{parseFloat(cost).toFixed(4)}</p>
              <p className="text-[9px] text-slate-500">CRO</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

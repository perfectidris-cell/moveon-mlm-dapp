import { useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { getContract } from '../utils/config';
import { useWeb3 } from '../contexts/Web3Context';
import type { UserInfo, UserFinancialInfo } from '../types';

const GAS_BUFFER = 120n;
const GAS_FLOOR = 300000n;
const GAS_CEILING = 3000000n;
const RETRY_COUNT = 3;
const RETRY_DELAY = 1000;
const CACHE_TTL = 120000;
const LONG_CACHE_TTL = 300000;

const cache = new Map<string, { value: unknown; expiry: number }>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.value as T;
  cache.delete(key);
  return null;
}

function cacheSet(key: string, value: unknown, ttl = CACHE_TTL) {
  cache.set(key, { value, expiry: Date.now() + ttl });
}

// In-flight request dedup: concurrent identical reads share one promise instead of
// firing N parallel RPC calls (e.g. Dashboard + ReferralTree mounting at once).
const inflight = new Map<string, Promise<unknown>>();

async function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function retryWrapper<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; i < RETRY_COUNT; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (i === RETRY_COUNT - 1) throw err;
      if (err?.code === 'CALL_EXCEPTION' || err?.code === -32000) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    }
  }
  throw new Error(`RPC failed after ${RETRY_COUNT} retries: ${label}`);
}

async function estimateAndSend(
  contract: ethers.Contract,
  method: string,
  args: unknown[],
  overrides: Record<string, any> = {},
): Promise<ethers.TransactionReceipt> {
  let gasLimit = overrides.gasLimit;
  if (!gasLimit) {
    try {
      const estimated = await contract[method].estimateGas(...args, overrides);
      gasLimit = (estimated * GAS_BUFFER) / 100n;
      if (gasLimit < GAS_FLOOR) gasLimit = GAS_FLOOR;
      if (gasLimit > GAS_CEILING) gasLimit = GAS_CEILING;
    } catch {
      gasLimit = GAS_FLOOR;
    }
  }
  const tx = await contract[method](...args, { ...overrides, gasLimit });
  return await tx.wait();
}

function normalizeWei(val: string): string {
  if (/e/i.test(val)) {
    const [base, expStr] = val.split('e');
    const exp = parseInt(expStr);
    const [int = '0', dec = ''] = base.split('.');
    const digits = (int + dec).replace(/^0+/, '') || '0';
    const dotPos = int.length;
    const newDotPos = dotPos + exp;
    if (newDotPos <= 0) {
      return '0.' + '0'.repeat(-newDotPos) + digits;
    }
    if (newDotPos >= digits.length) {
      return digits + '0'.repeat(newDotPos - digits.length);
    }
    return digits.slice(0, newDotPos) + '.' + digits.slice(newDotPos);
  }
  return val;
}

export function useContract() {
  const { provider, signer, readOnlyProvider } = useWeb3();

  const readContract = useMemo(() => {
    if (readOnlyProvider) return getContract(readOnlyProvider);
    if (provider) return getContract(provider);
    return null;
  }, [readOnlyProvider, provider]);
  const writeContract = useMemo(() => signer ? getContract(signer) : null, [signer]);

  const getUserInfo = useCallback(async (addr: string, force = false): Promise<UserInfo> => {
    if (!readContract) throw new Error('Not connected');
    const key = `userInfo_${addr.toLowerCase()}`;
    if (!force) {
      const cached = cacheGet<UserInfo>(key);
      if (cached) return cached;
    }
    return dedupe(`rpc_${key}`, async () => {
      const r = await retryWrapper(() => readContract.getUserInfo(addr), 'getUserInfo');
      const res: UserInfo = {
        id: r.id, referrer: r.referrer, level: Number(r.level),
        directReferrals: Number(r.directReferrals), totalReferrals: Number(r.totalReferrals),
        totalEarnings: normalizeWei(r.totalEarnings.toString()),
        lastActiveTime: Number(r.lastActiveTime),
      };
      cacheSet(key, res, 30000);
      return res;
    });
  }, [readContract]);

  const getUserFinancialInfo = useCallback(async (addr: string, force = false): Promise<UserFinancialInfo> => {
    if (!readContract) throw new Error('Not connected');
    const key = `userFinancial_${addr.toLowerCase()}`;
    if (!force) {
      const cached = cacheGet<UserFinancialInfo>(key);
      if (cached) return cached;
    }
    return dedupe(`rpc_${key}`, async () => {
      const r = await readContract.getUserFinancialInfo(addr);
      const res: UserFinancialInfo = {
        levelEarnings: r.levelEarnings.map((e: bigint) => normalizeWei(e.toString())),
        reservedForUpgrade: r.reservedForUpgrade.map((e: bigint) => normalizeWei(e.toString())),
        withdrawableBalance: r.withdrawableBalance ? r.withdrawableBalance.map((e: bigint) => normalizeWei(e.toString())) : undefined,
        totalWithdrawableBalance: r.totalWithdrawableBalance ? normalizeWei(r.totalWithdrawableBalance.toString()) : undefined,
        totalReservedBalance: normalizeWei(r.totalReservedBalance.toString()),
      };
      cacheSet(key, res, 30000);
      return res;
    });
  }, [readContract]);

  const getSystemInfoCached = useCallback(async () => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<{ regFee: string; croPrice: string; totalUsers: number; levelCosts: Record<number, string> }>('systemInfo');
    if (cached) return cached;

    return dedupe('rpc_systemInfo', async () => {
      let r;
      try {
        r = await retryWrapper(() => readContract.getSystemInfo(), 'getSystemInfo');
      } catch {
        return { regFee: '0', croPrice: '0', totalUsers: 0, levelCosts: {} };
      }
      const croPrice = (Number(r.croUsdPrice) / 1e8).toFixed(4);
      const regFee = ethers.formatEther(r.registrationFeeCro);
      const totalUsers = Number(r.totalUsers);
      const levelCosts: Record<number, string> = {};
      for (let i = 0; i < r.levelCostsCro.length; i++) {
        const level = i + 1;
        const formatted = ethers.formatEther(r.levelCostsCro[i]);
        levelCosts[level] = formatted;
        cacheSet(`levelCost_${level}`, formatted, LONG_CACHE_TTL);
      }
      const result = { regFee, croPrice, totalUsers, levelCosts };
      cacheSet('systemInfo', result, LONG_CACHE_TTL);
      cacheSet('regFee', regFee, LONG_CACHE_TTL);
      cacheSet('croPrice', croPrice, LONG_CACHE_TTL);
      return result;
    });
  }, [readContract]);

  const getRegistrationFee = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<string>('regFee');
    if (cached) return cached;
    const { regFee } = await getSystemInfoCached();
    return regFee;
  }, [readContract, getSystemInfoCached]);

  const getLevelCost = useCallback(async (level: number): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<string>(`levelCost_${level}`);
    if (cached) return cached;
    const cost = await retryWrapper(() => readContract.getLevelUpgradeCostCro(level), 'getLevelUpgradeCostCro');
    const formatted = ethers.formatEther(cost);
    cacheSet(`levelCost_${level}`, formatted);
    return formatted;
  }, [readContract]);

  const getLevelCostsBatch = useCallback(async (levels: number[]): Promise<Record<number, string>> => {
    if (!readContract) throw new Error('Not connected');
    if (levels.length === 0) return {};
    const uncached: number[] = [];
    const result: Record<number, string> = {};
    for (const lvl of levels) {
      const cached = cacheGet<string>(`levelCost_${lvl}`);
      if (cached) {
        result[lvl] = cached;
      } else {
        uncached.push(lvl);
      }
    }
    if (uncached.length > 0) {
      const r = await retryWrapper(() => readContract.getLevelCostsCroBatch(uncached), 'getLevelCostsCroBatch');
      for (let i = 0; i < uncached.length; i++) {
        const formatted = ethers.formatEther(r[i]);
        result[uncached[i]] = formatted;
        cacheSet(`levelCost_${uncached[i]}`, formatted);
      }
    }
    return result;
  }, [readContract]);

  const getTotalUsers = useCallback(async (): Promise<number> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<number>('totalUsers');
    if (cached) return cached;
    const n = await retryWrapper(() => readContract.getTotalUsers(), 'getTotalUsers');
    cacheSet('totalUsers', Number(n));
    return Number(n);
  }, [readContract]);

  const getCroPrice = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<string>('croPrice');
    if (cached) return cached;
    const { croPrice } = await getSystemInfoCached();
    return croPrice;
  }, [readContract, getSystemInfoCached]);

  const getDownline = useCallback(async (addr: string, depth: number = 3, force = false): Promise<string[]> => {
    if (!readContract) throw new Error('Not connected');
    const key = `downline_${addr.toLowerCase()}_${depth}`;
    if (!force) {
      const cached = cacheGet<string[]>(key);
      if (cached) return cached;
    }
    return dedupe(`rpc_${key}`, async () => {
      const arr = [...(await readContract.getDownline(addr, depth))];
      cacheSet(key, arr, 30000);
      return arr;
    });
  }, [readContract]);

  const getUserAddressesPaginated = useCallback(async (start: number, count: number): Promise<string[]> => {
    if (!readContract) throw new Error('Not connected');
    return [...(await readContract.getUserAddressesPaginated(start, count))];
  }, [readContract]);

  const getUserParentInfo = useCallback(async (addr: string): Promise<{ referrer: string; referrerLevel: number }> => {
    if (!readContract) throw new Error('Not connected');
    const r = await readContract.getUserParentInfo(addr);
    return { referrer: r.referrer, referrerLevel: Number(r.referrerLevel) };
  }, [readContract]);

  const getMatrixChildren = useCallback(async (addr: string, force = false): Promise<string[]> => {
    if (!readContract) throw new Error('Not connected');
    const key = `matrixChildren_${addr.toLowerCase()}`;
    if (!force) {
      const cached = cacheGet<string[]>(key);
      if (cached) return cached;
    }
    return dedupe(`rpc_${key}`, async () => {
      const children = await retryWrapper(() => readContract.getMatrixChildren(addr), 'getMatrixChildren');
      const res = [...children];
      cacheSet(key, res, 30000);
      return res;
    });
  }, [readContract]);

  const getMatrixParent = useCallback(async (addr: string, force = false): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = `matrixParent_${addr.toLowerCase()}`;
    if (!force) {
      const cached = cacheGet<string>(key);
      if (cached) return cached;
    }
    return dedupe(`rpc_${key}`, async () => {
      const parent = await retryWrapper(() => readContract.matrixParent(addr), 'matrixParent');
      cacheSet(key, parent, 60000);
      return parent;
    });
  }, [readContract]);

  const getUserInfosBatch = useCallback(async (addresses: string[], force = false): Promise<UserInfo[]> => {
    if (!readContract) throw new Error('Not connected');
    if (addresses.length === 0) return [];

    if (!force) {
      const allCached = addresses.map((a) => cacheGet<UserInfo>(`userInfo_${a.toLowerCase()}`));
      if (allCached.every((item) => item !== null)) {
        return allCached as UserInfo[];
      }
    }

    return dedupe(`rpc_userInfos_${addresses.map((a) => a.toLowerCase()).join(',')}`, async () => {
      const r = await retryWrapper(() => readContract.getUserInfosBatch(addresses), 'getUserInfosBatch');
      if (!r) return [];
      const ids = r.ids || r[0];
      const refs = r.referrers || r[1];
      const lvls = r.levels || r[2];
      const dirs = r.directReferrals || r[3];
      const totRefs = r.totalReferrals || r[4];
      const earn = r.totalEarnings || r[5];
      const times = r.lastActiveTimes || r[6];
      const n = Math.min(addresses.length, ids.length, lvls.length, earn.length);
      const out: UserInfo[] = [];
      for (let i = 0; i < n; i++) {
        const info: UserInfo = {
          id: ids[i] || ethers.ZeroAddress,
          referrer: refs[i] || ethers.ZeroAddress,
          level: Number(lvls[i] ?? 0),
          directReferrals: Number(dirs[i] ?? 0),
          totalReferrals: Number(totRefs[i] ?? 0),
          totalEarnings: normalizeWei((earn[i] ?? 0n).toString()),
          lastActiveTime: Number(times[i] ?? 0),
        };
        out.push(info);
        if (addresses[i]) {
          cacheSet(`userInfo_${addresses[i].toLowerCase()}`, info, 30000);
        }
      }
      return out;
    });
  }, [readContract]);

  const findNextMatrixSlot = useCallback(async (rootAddr: string): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const slot = await retryWrapper(() => readContract.findNextSlot(rootAddr), 'findNextSlot');
    if (slot === ethers.ZeroAddress) throw new Error('Tree full');
    return slot;
  }, [readContract]);

  const buildPathProof = useCallback(async (_placementParent: string, _referrer: string): Promise<string[]> => {
    if (!readContract) throw new Error('Not connected');
    if (_placementParent.toLowerCase() === _referrer.toLowerCase()) return [_placementParent];
    const cacheKey = `pathProof_${_placementParent.toLowerCase()}_${_referrer.toLowerCase()}`;
    const cached = cacheGet<string[]>(cacheKey);
    if (cached) return cached;
    const path: string[] = [_placementParent];
    let current = _placementParent;
    for (let i = 0; i < 50; i++) {
      const parent = await getMatrixParent(current);
      if (parent === ethers.ZeroAddress) break;
      current = parent;
      path.push(current);
      if (current.toLowerCase() === _referrer.toLowerCase()) {
        cacheSet(cacheKey, path, LONG_CACHE_TTL);
        return path;
      }
    }
    throw new Error('Cannot build path proof: _placementParent not in _referrer matrix tree');
  }, [readContract, getMatrixParent]);

  const getDownlineUpTo62 = useCallback(async (addr: string): Promise<string[]> => {
    if (!readContract) throw new Error('Not connected');
    return [...(await readContract.getDownlineUpTo62(addr))];
  }, [readContract]);

  const getPaused = useCallback(async (): Promise<boolean> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<boolean>('paused');
    if (cached !== null) return cached;
    return dedupe('rpc_paused', async () => {
      const p = await retryWrapper(() => readContract.paused(), 'paused');
      cacheSet('paused', p, CACHE_TTL);
      return p;
    });
  }, [readContract]);

  const getPendingWithdrawal = useCallback(async (addr: string): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<string>(`pendWith_${addr}`);
    if (cached !== null) return cached;
    return dedupe(`rpc_pendWith_${addr}`, async () => {
      const bal = await retryWrapper(() => readContract.pendingWithdrawals(addr), 'pendingWithdrawals');
      const formatted = ethers.formatEther(bal);
      cacheSet(`pendWith_${addr}`, formatted, 5000);
      return formatted;
    });
  }, [readContract]);

  const getTotalWithdrawableBalance = useCallback(async (addr: string): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<string>(`totWith_${addr}`);
    if (cached !== null) return cached;
    return dedupe(`rpc_totWith_${addr}`, async () => {
      const bal = await retryWrapper(() => readContract.getTotalWithdrawableBalance(addr), 'getTotalWithdrawableBalance');
      const formatted = ethers.formatEther(bal);
      cacheSet(`totWith_${addr}`, formatted, 5000);
      return formatted;
    });
  }, [readContract]);

  const getDownlinePaginated = useCallback(async (addr: string, depth: number, offset: number, count: number): Promise<{ members: string[]; total: number }> => {
    if (!readContract) throw new Error('Not connected');
    const r = await retryWrapper(() => readContract.getDownlinePaginated(addr, depth, offset, count), 'getDownlinePaginated');
    return { members: [...r.members], total: Number(r.total) };
  }, [readContract]);

  const register = useCallback(async (referrer: string, matrixParent: string, pathProof: string[], valueCRO: string): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'register', [referrer, matrixParent, pathProof], {
      value: ethers.parseEther(valueCRO),
    });
  }, [writeContract]);

  const walletUpgrade = useCallback(async (valueCRO: string): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'walletUpgrade', [], {
      value: ethers.parseEther(valueCRO),
    });
  }, [writeContract]);

  const upgradeFromReserve = useCallback(async (): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'upgradeFromReserve', []);
  }, [writeContract]);

  const withdraw = useCallback(async (): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'withdraw', []);
  }, [writeContract]);

  const togglePause = useCallback(async (): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'togglePause', []);
  }, [writeContract]);

  const getOwner = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<string>('owner');
    if (cached) return cached;
    return dedupe('rpc_owner', async () => {
      const own = await readContract.owner();
      cacheSet('owner', own, 60000);
      return own;
    });
  }, [readContract]);

  const getManualCroUsdPrice = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const price = await readContract.manualCroUsdPrice();
    return price.toString();
  }, [readContract]);

  const getManualRegistrationFeeCro = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const fee = await readContract.manualRegistrationFeeCro();
    return fee.toString();
  }, [readContract]);

  const getManualLevelCostCro = useCallback(async (level: number): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const cost = await readContract.manualLevelCostsCro(level);
    return cost.toString();
  }, [readContract]);

  const getManualLevelCostsBatch = useCallback(async (): Promise<string[]> => {
    if (!readContract) throw new Error('Not connected');
    return dedupe('rpc_manualLevelCosts', async () => {
      const r = await retryWrapper(() => readContract.getManualLevelCosts(), 'getManualLevelCosts');
      return (Array.isArray(r) ? r : []).map((c: bigint) => c.toString());
    });
  }, [readContract]);

  const getReferralCap = useCallback(async (): Promise<number> => {
    if (!readContract) throw new Error('Not connected');
    const cap = await readContract.referralCap();
    return Number(cap);
  }, [readContract]);

  const setManualCroUsdPrice = useCallback(async (price: string): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'setManualCroUsdPrice', [price]);
  }, [writeContract]);

  const setManualCroCosts = useCallback(async (regFeeCro: string, levelCostsCro: string[]): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const padded = [...levelCostsCro];
    while (padded.length < 13) padded.push('0');
    return estimateAndSend(writeContract, 'setManualCroCosts', [regFeeCro, padded]);
  }, [writeContract]);

  const setReferralCap = useCallback(async (cap: number): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'setReferralCap', [cap]);
  }, [writeContract]);

  const setUserLevel = useCallback(async (user: string, level: number): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'setUserLevel', [user, level]);
  }, [writeContract]);

  const getPythAddress = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    return await readContract.pyth();
  }, [readContract]);

  const getBandAddress = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    return await readContract.band();
  }, [readContract]);

  const getPythPriceId = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    return await readContract.pythPriceId();
  }, [readContract]);

  const getSupraRouter = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    return await readContract.supraRouter();
  }, [readContract]);

  const getWitnetRouter = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    return await readContract.witnetRouter();
  }, [readContract]);

  const getWitnetPriceId = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    return await readContract.witnetPriceId();
  }, [readContract]);

  const setPriceFeeds = useCallback(async (pyth: string, band: string, pythPriceId: string): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'setPriceFeeds', [pyth, band, pythPriceId]);
  }, [writeContract]);

  const setNewPriceFeeds = useCallback(async (pyth: string, band: string, pythPriceId: string, supra: string, witnet: string, witnetId: string): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'setNewPriceFeeds', [pyth, band, pythPriceId, supra, witnet, witnetId]);
  }, [writeContract]);

  const migrateUserBatch = useCallback(async (startIndex: number, batchSize: number): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'migrateUserBatch', [startIndex, batchSize]);
  }, [writeContract]);

  const getMigratedCount = useCallback(async (): Promise<number> => {
    if (!readContract) throw new Error('Not connected');
    return Number(await readContract.getMigratedCount());
  }, [readContract]);

  const getIsMigrated = useCallback(async (addr: string): Promise<boolean> => {
    if (!readContract) throw new Error('Not connected');
    return await readContract.isMigrated(addr);
  }, [readContract]);

  return useMemo(() => ({
    readContract, writeContract,
    getUserInfo, getUserFinancialInfo, getSystemInfoCached, getRegistrationFee, getLevelCost, getLevelCostsBatch,
    getTotalUsers, getCroPrice, getDownline, getDownlinePaginated,
    getUserAddressesPaginated, getUserInfosBatch, getUserParentInfo,
    getMatrixChildren, getMatrixParent, findNextMatrixSlot, buildPathProof, getDownlineUpTo62,
    getPaused, togglePause,
    getOwner, getManualCroUsdPrice, getManualRegistrationFeeCro, getManualLevelCostCro, getManualLevelCostsBatch, getReferralCap,
    setManualCroUsdPrice, setManualCroCosts, setReferralCap, setUserLevel,
    getPythAddress, getBandAddress, getPythPriceId, getSupraRouter, getWitnetRouter, getWitnetPriceId,
    setPriceFeeds, setNewPriceFeeds,
    register, walletUpgrade,
    upgradeFromReserve, withdraw, getPendingWithdrawal, getTotalWithdrawableBalance,
    migrateUserBatch, getMigratedCount, getIsMigrated,
  }), [readContract, writeContract, getUserInfo, getUserFinancialInfo, getSystemInfoCached, getRegistrationFee, getLevelCost, getLevelCostsBatch, getTotalUsers, getCroPrice, getDownline, getDownlinePaginated, getUserAddressesPaginated, getUserInfosBatch, getUserParentInfo, getMatrixChildren, getMatrixParent, findNextMatrixSlot, buildPathProof, getDownlineUpTo62, getPaused, togglePause, getOwner, getManualCroUsdPrice, getManualRegistrationFeeCro, getManualLevelCostCro, getManualLevelCostsBatch, getReferralCap, setManualCroUsdPrice, setManualCroCosts, setReferralCap, setUserLevel, getPythAddress, getBandAddress, getPythPriceId, getSupraRouter, getWitnetRouter, getWitnetPriceId, setPriceFeeds, setNewPriceFeeds, register, walletUpgrade, upgradeFromReserve, withdraw, getPendingWithdrawal, getTotalWithdrawableBalance, migrateUserBatch, getMigratedCount, getIsMigrated]);
}

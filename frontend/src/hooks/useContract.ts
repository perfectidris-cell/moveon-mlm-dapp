import { useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { getContract, CONTRACT_ADDRESS, MULTICALL3_ADDRESS, CONTRACT_ABI } from '../utils/config';
import { useWeb3 } from '../contexts/Web3Context';
import type { UserInfo, UserFinancialInfo } from '../types';

const GAS_BUFFER = 120n;
const GAS_FLOOR = 300000n;
const GAS_CEILING = 3000000n;
const RETRY_COUNT = 3;
const RETRY_DELAY = 1000;
const CACHE_TTL = 180000; // 3 mins default
const USER_CACHE_TTL = 90000; // 90 secs for user profile & financial info (auto-cleared on transaction)
const DOWNLINE_CACHE_TTL = 60000; // 60 secs for downline counter
const BALANCE_CACHE_TTL = 30000; // 30 secs for pending/withdrawable balances
const LONG_CACHE_TTL = 600000; // 10 mins for system settings/costs
const IMMUTABLE_CACHE_TTL = 3600000; // 1 hour for on-chain tree hierarchy and contract owner

const cache = new Map<string, { value: unknown; expiry: number }>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.value as T;
  cache.delete(key);

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const raw = window.sessionStorage.getItem(`app_cache_${key}`);
      if (raw) {
        const item = JSON.parse(raw);
        if (item && Date.now() < item.expiry) {
          cache.set(key, item);
          return item.value as T;
        }
        window.sessionStorage.removeItem(`app_cache_${key}`);
      }
    } catch {}
  }
  return null;
}

function cacheSet(key: string, value: unknown, ttl = CACHE_TTL) {
  const item = { value, expiry: Date.now() + ttl };
  cache.set(key, item);
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(`app_cache_${key}`, JSON.stringify(item));
    } catch {}
  }
}

export function invalidateAdminCache() {
  cache.delete('adminConfig');
  cache.delete('paused');
  cache.delete('manualCroUsdPrice');
  cache.delete('manualRegFeeCro');
  cache.delete('manualLevelCostsAll');
  cache.delete('referralCap');
  cache.delete('systemInfo');
  cache.delete('regFee');
  cache.delete('croPrice');
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem('app_cache_adminConfig');
      window.sessionStorage.removeItem('app_cache_paused');
      window.sessionStorage.removeItem('app_cache_manualCroUsdPrice');
      window.sessionStorage.removeItem('app_cache_manualRegFeeCro');
      window.sessionStorage.removeItem('app_cache_manualLevelCostsAll');
      window.sessionStorage.removeItem('app_cache_referralCap');
      window.sessionStorage.removeItem('app_cache_systemInfo');
      window.sessionStorage.removeItem('app_cache_regFee');
      window.sessionStorage.removeItem('app_cache_croPrice');
    } catch {}
  }
}

export function invalidateUserCache(addr: string) {
  if (!addr) return;
  const lower = addr.toLowerCase();
  cache.delete(`userInfo_${lower}`);
  cache.delete(`userFinancial_${lower}`);
  cache.delete(`dashboardBatch_${lower}`);
  cache.delete(`pendWith_${addr}`);
  cache.delete(`pendWith_${lower}`);
  cache.delete(`totWith_${addr}`);
  cache.delete(`totWith_${lower}`);
  cache.delete(`totDown_${lower}`);
  cache.delete(`totDown_${addr}`);
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(`app_cache_userInfo_${lower}`);
      window.sessionStorage.removeItem(`app_cache_userFinancial_${lower}`);
      window.sessionStorage.removeItem(`app_cache_dashboardBatch_${lower}`);
      window.sessionStorage.removeItem(`app_cache_pendWith_${addr}`);
      window.sessionStorage.removeItem(`app_cache_totWith_${addr}`);
      window.sessionStorage.removeItem(`app_cache_totDown_${lower}`);
    } catch {}
  }
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

const MULTICALL3_ABI = [
  {
    type: 'function' as const,
    name: 'aggregate3',
    stateMutability: 'view' as const,
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
];

interface BatchCall {
  fn: string;
  args?: unknown[];
}

interface AdminConfig {
  owner: string;
  paused: boolean;
  regFee: string;
  croPrice: string;
  totalUsers: number;
  migrated: number;
  backfilled: number;
  levelCosts: Record<number, string>;
  manualCroUsdPrice: string;
  manualRegFee: string;
  referralCap: number;
  manualLevelCosts: string[];
  pyth: string;
  band: string;
  pythPriceId: string;
  supraRouter: string;
  witnetRouter: string;
  witnetPriceId: string;
}

function toLevelCosts(costs: unknown[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (let i = 0; i < costs.length; i++) {
    out[i + 1] = ethers.formatEther(costs[i] as bigint);
  }
  return out;
}

/**
 * Executes multiple read-only contract calls in a single RPC round-trip via
 * Multicall3. Failing calls yield `undefined` instead of rejecting the batch.
 */
async function multicallBatch(
  provider: ethers.AbstractProvider,
  calls: BatchCall[],
): Promise<unknown[]> {
  if (calls.length === 0) return [];
  const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
  const iface = new ethers.Interface(CONTRACT_ABI);
  const encoded = calls.map((c) => [CONTRACT_ADDRESS, true, iface.encodeFunctionData(c.fn, c.args ?? [])]);
  const raw = await mc.aggregate3.staticCall(encoded) as [boolean, string][];
  return calls.map((c, i) => {
    const [ok, data] = raw[i] ?? [false, '0x'];
    if (!ok) return undefined;
    try {
      return iface.decodeFunctionResult(c.fn, data);
    } catch {
      return undefined;
    }
  });
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
    } catch (err: any) {
      const msg = (err?.reason || err?.shortMessage || err?.message || '').toString();
      if (err?.code === 'CALL_EXCEPTION' || /revert|execution reverted|Fee low|Price feed|Reg'd|Payment low|insufficient/i.test(msg)) {
        throw err;
      }
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
      cacheSet(key, res, USER_CACHE_TTL);
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
      cacheSet(key, res, USER_CACHE_TTL);
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

  /**
   * Fetches every admin dashboard read in a single Multicall3 aggregate call
   * (one RPC round-trip instead of ~12), cached for 5 minutes.
   */
  const getAdminConfigCached = useCallback(async (force = false) => {
    if (!readContract) throw new Error('Not connected');
    const key = 'adminConfig';
    if (!force) {
      const cached = cacheGet<AdminConfig>(key);
      if (cached) return cached;
    }

    return dedupe('rpc_adminConfig', async () => {
      const calls: BatchCall[] = [
        { fn: 'owner' },
        { fn: 'paused' },
        { fn: 'getSystemInfo' },
        { fn: 'getMigratedCount' },
        { fn: 'getTotalUsers' },
        { fn: 'getDownlineBackfillCount' },
        { fn: 'manualCroUsdPrice' },
        { fn: 'manualRegistrationFeeCro' },
        { fn: 'referralCap' },
        { fn: 'getManualLevelCosts' },
        { fn: 'pyth' },
        { fn: 'band' },
        { fn: 'pythPriceId' },
        { fn: 'supraRouter' },
        { fn: 'witnetRouter' },
        { fn: 'witnetPriceId' },
      ];
      let results: unknown[];
      try {
        results = await multicallBatch(readContract.runner as ethers.AbstractProvider, calls);
      } catch {
        // Multicall3 unavailable/failed: fall back to individual reads so the
        // admin UI still works, at the cost of more RPC calls.
        results = await Promise.all([
          readContract.owner().catch(() => ''),
          readContract.paused().catch(() => false),
          readContract.getSystemInfo().catch(() => null),
          readContract.getMigratedCount().catch(() => 0),
          readContract.getTotalUsers().catch(() => 0),
          readContract.getDownlineBackfillCount().catch(() => 0),
          readContract.manualCroUsdPrice().catch(() => 0n),
          readContract.manualRegistrationFeeCro().catch(() => 0n),
          readContract.referralCap().catch(() => 0n),
          readContract.getManualLevelCosts().catch(() => Array(13).fill(0n)),
          readContract.pyth().catch(() => ''),
          readContract.band().catch(() => ''),
          readContract.pythPriceId().catch(() => ''),
          readContract.supraRouter().catch(() => ''),
          readContract.witnetRouter().catch(() => ''),
          readContract.witnetPriceId().catch(() => ''),
        ]);
      }

      const [
        ownerRes, pausedRes, sysRes, migratedRes, totalUsersRes, backfilledRes,
        mPriceRes, mRegFeeRes, capRes, mCostsRes,
        pythRes, bandRes, pythPriceIdRes, supraRes, witnetRes, witnetPriceIdRes,
      ] = results;

      const sys = (sysRes as any) ?? null;
      const config: AdminConfig = {
        owner: typeof ownerRes === 'string' ? ownerRes : ((ownerRes as any)?.[0] ?? ''),
        paused: typeof pausedRes === 'boolean' ? pausedRes : Boolean((pausedRes as any)?.[0]),
        regFee: sys ? ethers.formatEther(sys.registrationFeeCro ?? 0n) : '0',
        croPrice: sys ? (Number(sys.croUsdPrice ?? 0) / 1e8).toFixed(4) : '0',
        totalUsers: Number((totalUsersRes as any)?.[0] ?? totalUsersRes ?? 0),
        migrated: Number((migratedRes as any)?.[0] ?? migratedRes ?? 0),
        backfilled: Number((backfilledRes as any)?.[0] ?? backfilledRes ?? 0),
        levelCosts: sys ? toLevelCosts(sys.levelCostsCro ?? []) : {},
        manualCroUsdPrice: ((mPriceRes as any)?.[0] ?? mPriceRes ?? 0n).toString(),
        manualRegFee: ((mRegFeeRes as any)?.[0] ?? mRegFeeRes ?? 0n).toString(),
        referralCap: Number((capRes as any)?.[0] ?? capRes ?? 0),
        manualLevelCosts: ((mCostsRes as any)?.[0] ?? mCostsRes ?? Array(13).fill(0n)).map((c: bigint) => c.toString()),
        pyth: typeof pythRes === 'string' ? pythRes : ((pythRes as any)?.[0] ?? ''),
        band: typeof bandRes === 'string' ? bandRes : ((bandRes as any)?.[0] ?? ''),
        pythPriceId: typeof pythPriceIdRes === 'string' ? pythPriceIdRes : ((pythPriceIdRes as any)?.[0] ?? ''),
        supraRouter: typeof supraRes === 'string' ? supraRes : ((supraRes as any)?.[0] ?? ''),
        witnetRouter: typeof witnetRes === 'string' ? witnetRes : ((witnetRes as any)?.[0] ?? ''),
        witnetPriceId: typeof witnetPriceIdRes === 'string' ? witnetPriceIdRes : ((witnetPriceIdRes as any)?.[0] ?? ''),
      };

      cacheSet(key, config, LONG_CACHE_TTL);
      cacheSet('owner', config.owner, 60000);
      cacheSet('paused', config.paused, CACHE_TTL);
      cacheSet('totalUsers', config.totalUsers, CACHE_TTL);
      cacheSet('migratedCount', config.migrated, 15000);
      cacheSet('downlineBackfillCount', config.backfilled, 30000);
      cacheSet('manualCroUsdPrice', config.manualCroUsdPrice, LONG_CACHE_TTL);
      cacheSet('manualRegFeeCro', config.manualRegFee, LONG_CACHE_TTL);
      cacheSet('referralCap', config.referralCap, LONG_CACHE_TTL);
      cacheSet('manualLevelCostsAll', config.manualLevelCosts, LONG_CACHE_TTL);
      cacheSet('oracle_pyth', config.pyth, LONG_CACHE_TTL);
      cacheSet('oracle_band', config.band, LONG_CACHE_TTL);
      cacheSet('oracle_pythPriceId', config.pythPriceId, LONG_CACHE_TTL);
      cacheSet('oracle_supra', config.supraRouter, LONG_CACHE_TTL);
      cacheSet('oracle_witnet', config.witnetRouter, LONG_CACHE_TTL);
      cacheSet('oracle_witnetPriceId', config.witnetPriceId, LONG_CACHE_TTL);
      cacheSet('systemInfo', { regFee: config.regFee, croPrice: config.croPrice, totalUsers: config.totalUsers, levelCosts: config.levelCosts }, LONG_CACHE_TTL);

      return config;
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
      cacheSet(key, res, IMMUTABLE_CACHE_TTL);
      return res;
    });
  }, [readContract]);

  /** Batch fetch matrixChildren for many parents in ONE Multicall3 RPC (vs N separate calls). */
  const getMatrixChildrenBatch = useCallback(async (addrs: string[]): Promise<string[][]> => {
    if (!readContract) throw new Error('Not connected');
    if (addrs.length === 0) return [];
    // Try cache first: collect uncached
    const cached: (string[] | null)[] = addrs.map((a) => cacheGet<string[]>(`matrixChildren_${a.toLowerCase()}`));
    const uncachedIdx: number[] = [];
    const uncachedAddrs: string[] = [];
    cached.forEach((c, i) => { if (c === null) { uncachedIdx.push(i); uncachedAddrs.push(addrs[i]); } });
    let fetched: string[][] = [];
    if (uncachedAddrs.length > 0) {
      try {
        const results = await multicallBatch(
          readContract.runner as ethers.AbstractProvider,
          uncachedAddrs.map((a) => ({ fn: 'getMatrixChildren', args: [a] }))
        );
        fetched = results.map((r) => {
          if (!r) return [];
          // decode is [address[]] (tuple) or directly array
          const arr = (r as any)?.[0] ?? r;
          return Array.isArray(arr) ? [...arr] : [];
        });
        // populate cache
        fetched.forEach((arr, idx) => {
          const addr = uncachedAddrs[idx];
          cacheSet(`matrixChildren_${addr.toLowerCase()}`, [...arr], IMMUTABLE_CACHE_TTL);
        });
      } catch {
        // fallback: individual retryWrapper calls in parallel (still parallel but not batched)
        fetched = await Promise.all(uncachedAddrs.map((a) => retryWrapper(() => readContract.getMatrixChildren(a), 'getMatrixChildren').then((c) => [...c as string[]]).catch(() => [] as string[])));
        fetched.forEach((arr, idx) => cacheSet(`matrixChildren_${uncachedAddrs[idx].toLowerCase()}`, [...arr], IMMUTABLE_CACHE_TTL));
      }
    }
    // merge cached + fetched in order
    const out: string[][] = [];
    let fetchCursor = 0;
    for (let i = 0; i < addrs.length; i++) {
      if (cached[i] !== null) out.push(cached[i] as string[]);
      else out.push(fetched[fetchCursor++] ?? []);
    }
    return out;
  }, [readContract]);

  /**
   * Combined batch: for each parent address, fetch its matrixChildren AND the
   * UserInfo for every child in a SINGLE Multicall3 round-trip (vs 2 separate
   * multicalls per BFS level).  Returns [childrenArrays, userInfoMap].
   */
  const getChildrenWithUserInfoBatch = useCallback(async (
    parents: string[],
  ): Promise<{ childrenByParent: string[][]; infoByAddr: Map<string, UserInfo> }> => {
    if (!readContract) throw new Error('Not connected');
    if (parents.length === 0) return { childrenByParent: [], infoByAddr: new Map() };

    // 1) Resolve children — try cache first, collect uncached
    const cachedChildren: (string[] | null)[] = parents.map(
      (a) => cacheGet<string[]>(`matrixChildren_${a.toLowerCase()}`),
    );
    const uncachedIdx: number[] = [];
    const uncachedAddrs: string[] = [];
    cachedChildren.forEach((c, i) => {
      if (c === null) {
        uncachedIdx.push(i);
        uncachedAddrs.push(parents[i]);
      }
    });

    let fetchedChildren: string[][] = [];
    if (uncachedAddrs.length > 0) {
      try {
        const results = await multicallBatch(
          readContract.runner as ethers.AbstractProvider,
          uncachedAddrs.map((a) => ({ fn: 'getMatrixChildren', args: [a] })),
        );
        fetchedChildren = results.map((r) => {
          if (!r) return [];
          const arr = (r as any)?.[0] ?? r;
          return Array.isArray(arr) ? [...arr] : [];
        });
        fetchedChildren.forEach((arr, idx) => {
          cacheSet(`matrixChildren_${uncachedAddrs[idx].toLowerCase()}`, [...arr], IMMUTABLE_CACHE_TTL);
        });
      } catch {
        fetchedChildren = await Promise.all(
          uncachedAddrs.map((a) =>
            retryWrapper(() => readContract.getMatrixChildren(a), 'getMatrixChildren')
              .then((c) => [...(c as string[])])
              .catch(() => [] as string[]),
          ),
        );
        fetchedChildren.forEach((arr, idx) =>
          cacheSet(`matrixChildren_${uncachedAddrs[idx].toLowerCase()}`, [...arr], IMMUTABLE_CACHE_TTL),
        );
      }
    }

    // Merge cached + fetched in order
    const allChildren: string[][] = [];
    let fetchCursor = 0;
    for (let i = 0; i < parents.length; i++) {
      if (cachedChildren[i] !== null) allChildren.push(cachedChildren[i] as string[]);
      else allChildren.push(fetchedChildren[fetchCursor++] ?? []);
    }

    // 2) Collect unique child addresses (skip zero + duplicates + already-cached)
    const uniqueKids = new Map<string, string>(); // lower -> original
    for (const kids of allChildren) {
      for (const addr of kids) {
        if (!addr || addr === ethers.ZeroAddress) continue;
        const lk = addr.toLowerCase();
        if (!uniqueKids.has(lk) && !cacheGet<UserInfo>(`userInfo_${lk}`)) {
          uniqueKids.set(lk, addr);
        }
      }
    }

    const infoByAddr = new Map<string, UserInfo>();

    // Populate from cache
    for (const [lk] of uniqueKids) {
      const cached = cacheGet<UserInfo>(`userInfo_${lk}`);
      if (cached) {
        infoByAddr.set(lk, cached);
        uniqueKids.delete(lk);
      }
    }

    // Fetch uncached user infos
    const uncachedKids = [...uniqueKids.values()];
    if (uncachedKids.length > 0) {
      try {
        const userResults = await multicallBatch(
          readContract.runner as ethers.AbstractProvider,
          uncachedKids.map((a) => ({ fn: 'getUserInfo', args: [a] })),
        );
        userResults.forEach((r, idx) => {
          if (!r) return;
          const anyR = r as any;
          const id = anyR.id ?? anyR[0];
          if (id && id !== ethers.ZeroAddress) {
            const info: UserInfo = {
              id,
              referrer: anyR.referrer ?? anyR[1],
              level: Number(anyR.level ?? anyR[2] ?? 0),
              directReferrals: Number(anyR.directReferrals ?? anyR[3] ?? 0),
              totalReferrals: Number(anyR.totalReferrals ?? anyR[4] ?? 0),
              totalEarnings: normalizeWei((anyR.totalEarnings ?? anyR[5] ?? 0n).toString()),
              lastActiveTime: Number(anyR.lastActiveTime ?? anyR[6] ?? 0),
            };
            infoByAddr.set(uncachedKids[idx].toLowerCase(), info);
            cacheSet(`userInfo_${uncachedKids[idx].toLowerCase()}`, info, 30000);
          }
        });
      } catch {
        // fallback: individual getUserInfo calls
        const results = await Promise.allSettled(
          uncachedKids.map((a) =>
            retryWrapper(() => readContract.getUserInfo(a), 'getUserInfo').then((r) => {
              const info: UserInfo = {
                id: r.id, referrer: r.referrer, level: Number(r.level),
                directReferrals: Number(r.directReferrals), totalReferrals: Number(r.totalReferrals),
                totalEarnings: normalizeWei(r.totalEarnings.toString()),
                lastActiveTime: Number(r.lastActiveTime),
              };
              cacheSet(`userInfo_${a.toLowerCase()}`, info, 30000);
              return { addr: a, info };
            }),
          ),
        );
        results.forEach((res) => {
          if (res.status === 'fulfilled') {
            infoByAddr.set(res.value.addr.toLowerCase(), res.value.info);
          }
        });
      }
    }

    return { childrenByParent: allChildren, infoByAddr };
  }, [readContract]);

  /** Batch fetch totalDownline + getDownlinePaginated totals for depths 4..12 in ONE Multicall (vs 10 RPCs). */
  const getDeepCountsBatch = useCallback(async (addr: string): Promise<{ total: number; totalsByDepth: Record<number, number>; capped: boolean }> => {
    if (!readContract) throw new Error('Not connected');
    const cacheKey = `deepCounts_${addr.toLowerCase()}`;
    const cached = cacheGet<{ total: number; totalsByDepth: Record<number, number>; capped: boolean }>(cacheKey);
    if (cached) return cached;
    const depths = [4, 5, 6, 7, 8, 9, 10, 11, 12];
    const calls: BatchCall[] = [
      { fn: 'totalDownline', args: [addr] },
      ...depths.map((d) => ({ fn: 'getDownlinePaginated', args: [addr, d, 0, 0] })),
    ];
    const res = await dedupe(`rpc_${cacheKey}`, async () => {
      let results: unknown[];
      try {
        results = await multicallBatch(readContract.runner as ethers.AbstractProvider, calls);
      } catch {
        // fallback parallel individual
        const totalP = retryWrapper(() => readContract.totalDownline(addr), 'totalDownline').then((n) => Number(n)).catch(() => 0);
        const totalsP = Promise.all(depths.map((d) => retryWrapper(() => readContract.getDownlinePaginated(addr, d, 0, 0), 'getDownlinePaginated').then((r: any) => Number(r.total ?? r[1] ?? 0)).catch(() => 0)));
        const [t, totArr] = await Promise.all([totalP, totalsP]);
        const tb: Record<number, number> = {};
        depths.forEach((d, i) => { tb[d] = totArr[i]; });
        return { total: t, totalsByDepth: tb, capped: totArr.some((x) => x >= 2000) };
      }
      const totalRaw = results[0] as any;
      const total = Number(totalRaw?.[0] ?? totalRaw ?? 0);
      const totalsByDepth: Record<number, number> = {};
      let capped = false;
      for (let i = 0; i < depths.length; i++) {
        const r = results[i + 1] as any;
        // getDownlinePaginated returns (members, total) -> decode gives [members, total]
        let t = 0;
        if (r) {
          if (typeof r.total !== 'undefined') t = Number(r.total);
          else if (Array.isArray(r) && r.length >= 2) t = Number(r[1]);
          else if (r[0] && typeof r[0] === 'object' && 'total' in r[0]) t = Number(r[0].total);
          else t = Number(r?.[1] ?? r?.[0] ?? 0);
        }
        totalsByDepth[depths[i]] = t;
        if (t >= 2000) capped = true;
      }
      return { total, totalsByDepth, capped };
    });
    cacheSet(cacheKey, res, 30000);
    return res;
  }, [readContract]);

  /** Exact per-matrix-level counts for levels 1..12 in ONE multicall (auto-fills Level Breakdown without tree expansion). */
  const getExactMatrixLevelCounts = useCallback(async (addr: string, force = false): Promise<{ perLevel: Record<number, number>; totalsByDepth: Record<number, number>; total: number }> => {
    if (!readContract) throw new Error('Not connected');
    const cacheKey = `exactLevelCounts_${addr.toLowerCase()}`;
    if (!force) {
      const cached = cacheGet<{ perLevel: Record<number, number>; totalsByDepth: Record<number, number>; total: number }>(cacheKey);
      if (cached) return cached;
    }
    const depths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const calls: BatchCall[] = [
      { fn: 'totalDownline', args: [addr] },
      ...depths.map((d) => ({ fn: 'getDownlinePaginated', args: [addr, d, 0, 0] })),
    ];
    const res = await dedupe(`rpc_${cacheKey}`, async () => {
      let results: unknown[];
      try {
        results = await multicallBatch(readContract.runner as ethers.AbstractProvider, calls);
      } catch {
        const totalP = retryWrapper(() => readContract.totalDownline(addr), 'totalDownline').then((n) => Number(n)).catch(() => 0);
        const totalsP = Promise.all(depths.map((d) => retryWrapper(() => readContract.getDownlinePaginated(addr, d, 0, 0), 'getDownlinePaginated').then((r: any) => Number(r.total ?? r[1] ?? 0)).catch(() => 0)));
        const [t, totArr] = await Promise.all([totalP, totalsP]);
        const tb: Record<number, number> = {};
        depths.forEach((d, i) => { tb[d] = totArr[i]; });
        const per: Record<number, number> = {};
        let prev = 0;
        depths.forEach((d) => { per[d] = Math.max(0, (tb[d] ?? 0) - prev); prev = tb[d] ?? 0; });
        return { perLevel: per, totalsByDepth: tb, total: t };
      }
      const totalRaw = results[0] as any;
      const total = Number(totalRaw?.[0] ?? totalRaw ?? 0);
      const totalsByDepth: Record<number, number> = {};
      for (let i = 0; i < depths.length; i++) {
        const r = results[i + 1] as any;
        let t = 0;
        if (r) {
          if (typeof r.total !== 'undefined') t = Number(r.total);
          else if (Array.isArray(r) && r.length >= 2) t = Number(r[1]);
          else if (r[0] && typeof r[0] === 'object' && 'total' in r[0]) t = Number(r[0].total);
          else t = Number(r?.[1] ?? r?.[0] ?? 0);
        }
        totalsByDepth[depths[i]] = t;
      }
      const perLevel: Record<number, number> = {};
      let prev = 0;
      depths.forEach((d) => { perLevel[d] = Math.max(0, (totalsByDepth[d] ?? 0) - prev); prev = totalsByDepth[d] ?? 0; });
      return { perLevel, totalsByDepth, total };
    });
    cacheSet(cacheKey, res, 15000);
    return res;
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
      cacheSet(key, parent, IMMUTABLE_CACHE_TTL);
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
      const CHUNK_SIZE = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < addresses.length; i += CHUNK_SIZE) {
        chunks.push(addresses.slice(i, i + CHUNK_SIZE));
      }

      const chunkResults = await Promise.all(chunks.map(async (chunk) => {
        const r = await retryWrapper(() => readContract.getUserInfosBatch(chunk), 'getUserInfosBatch');
        if (!r) return [];
        const ids = r.ids || r[0];
        const refs = r.referrers || r[1];
        const lvls = r.levels || r[2];
        const dirs = r.directReferrals || r[3];
        const totRefs = r.totalReferrals || r[4];
        const earn = r.totalEarnings || r[5];
        const times = r.lastActiveTimes || r[6];
        const n = Math.min(chunk.length, ids?.length ?? 0, lvls?.length ?? 0, earn?.length ?? 0);
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
          if (chunk[i]) {
            cacheSet(`userInfo_${chunk[i].toLowerCase()}`, info, USER_CACHE_TTL);
          }
        }
        return out;
      }));

      return chunkResults.flat();
    });
  }, [readContract]);

  const findNextMatrixSlot = useCallback(async (rootAddr: string): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const slot = await retryWrapper(() => readContract.findNextSlot(rootAddr), 'findNextSlot');
    if (slot === ethers.ZeroAddress) throw new Error('Tree full');
    return slot;
  }, [readContract]);

  /**
   * Single-RPC placement lookup: the contract finds the balanced slot AND
   * builds the register() path proof on-chain (findNextSlotAndProof).
   * Replaces the former off-chain flow of findNextSlot + up to 100
   * sequential matrixParent reads.
   */
  const findNextSlotAndProof = useCallback(async (rootAddr: string): Promise<{ slot: string; path: string[] }> => {
    if (!readContract) throw new Error('Not connected');
    const cacheKey = `slotAndProof_${rootAddr.toLowerCase()}`;
    const cached = cacheGet<{ slot: string; path: string[] }>(cacheKey);
    if (cached) return cached;
    return dedupe(`rpc_${cacheKey}`, async () => {
      let slot: string;
      let path: string[];
      try {
        const r = await retryWrapper(() => readContract.findNextSlotAndProof(rootAddr), 'findNextSlotAndProof');
        slot = (r.slot ?? r[0]) as string;
        path = [...((r.path ?? r[1]) as string[])];
      } catch {
        // Pre-upgrade contract without findNextSlotAndProof: fall back to the
        // legacy two-step flow (findNextSlot + single matrixParent walk).
        // This path disappears once the upgraded implementation is live.
        slot = await retryWrapper(() => readContract.findNextSlot(rootAddr), 'findNextSlot');
        if (slot === ethers.ZeroAddress) throw new Error('Tree full');
        path = [slot];
        let current = slot;
        for (let i = 0; i < 100; i++) {
          if (current.toLowerCase() === rootAddr.toLowerCase()) break;
          const parent: string = await retryWrapper(() => readContract.matrixParent(current), 'matrixParent');
          if (parent === ethers.ZeroAddress) break;
          current = parent;
          path.push(current);
        }
        if (path[path.length - 1].toLowerCase() !== rootAddr.toLowerCase()) {
          throw new Error('Cannot build path proof: placement not in referrer matrix tree');
        }
      }
      if (slot === ethers.ZeroAddress) throw new Error('Tree full');
      const res = { slot, path };
      cacheSet(cacheKey, res, 15000);
      return res;
    });
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
      cacheSet(`pendWith_${addr}`, formatted, BALANCE_CACHE_TTL);
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
      cacheSet(`totWith_${addr}`, formatted, BALANCE_CACHE_TTL);
      return formatted;
    });
  }, [readContract]);

  const getTotalDownline = useCallback(async (addr: string): Promise<number> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<number>(`totDown_${addr}`);
    if (cached !== null) return cached;
    return dedupe(`rpc_totDown_${addr}`, async () => {
      const n = await retryWrapper(() => readContract.totalDownline(addr), 'totalDownline');
      const res = Number(n);
      cacheSet(`totDown_${addr}`, res, DOWNLINE_CACHE_TTL);
      return res;
    });
  }, [readContract]);

  const getDownlinePaginated = useCallback(async (addr: string, depth: number, offset: number, count: number): Promise<{ members: string[]; total: number }> => {
    if (!readContract) throw new Error('Not connected');
    const r = await retryWrapper(() => readContract.getDownlinePaginated(addr, depth, offset, count), 'getDownlinePaginated');
    return { members: [...r.members], total: Number(r.total) };
  }, [readContract]);

  /** Frontend-wide batch: Dashboard loads userInfo+financial+totalDownline+systemInfo in ONE Multicall (vs 4 RPCs). */
  const getDashboardBatch = useCallback(async (addr: string, force = false): Promise<{ userInfo: UserInfo | null; financial: UserFinancialInfo | null; totalDownline: number; systemInfo: { regFee: string; croPrice: string; totalUsers: number; levelCosts: Record<number, string> } | null }> => {
    if (!readContract) throw new Error('Not connected');
    const cacheKey = `dashboardBatch_${addr.toLowerCase()}`;
    if (!force) {
      const cached = cacheGet<{ userInfo: UserInfo | null; financial: UserFinancialInfo | null; totalDownline: number; systemInfo: any }>(cacheKey);
      if (cached) return cached;
    }
    return dedupe(`rpc_${cacheKey}`, async () => {
      const calls: BatchCall[] = [
        { fn: 'getUserInfo', args: [addr] },
        { fn: 'getUserFinancialInfo', args: [addr] },
        { fn: 'totalDownline', args: [addr] },
        { fn: 'getSystemInfo', args: [] },
      ];
      try {
        const results = await multicallBatch(readContract.runner as ethers.AbstractProvider, calls);
        let userInfo: UserInfo | null = null;
        let financial: UserFinancialInfo | null = null;
        let totalDownline = 0;
        let systemInfo: any = null;
        // getUserInfo decode -> [id, referrer, level, directReferrals, totalReferrals, totalEarnings, lastActiveTime]
        if (results[0]) {
          const r: any = results[0];
          // ethers Interface decode returns array-like with named keys
          const id = r.id ?? r[0];
          if (id && id !== ethers.ZeroAddress) {
            userInfo = {
              id: r.id ?? r[0],
              referrer: r.referrer ?? r[1],
              level: Number(r.level ?? r[2] ?? 0),
              directReferrals: Number(r.directReferrals ?? r[3] ?? 0),
              totalReferrals: Number(r.totalReferrals ?? r[4] ?? 0),
              totalEarnings: normalizeWei((r.totalEarnings ?? r[5] ?? 0n).toString()),
              lastActiveTime: Number(r.lastActiveTime ?? r[6] ?? 0),
            };
            cacheSet(`userInfo_${addr.toLowerCase()}`, userInfo, USER_CACHE_TTL);
          }
        }
        if (results[1]) {
          const r: any = results[1];
          const le = r.levelEarnings ?? r[0];
          const re = r.reservedForUpgrade ?? r[1];
          const wb = r.withdrawableBalance ?? r[2];
          const totW = r.totalWithdrawableBalance ?? r[3];
          const totR = r.totalReservedBalance ?? r[4];
          if (le) {
            financial = {
              levelEarnings: (le as bigint[]).map((e: bigint) => normalizeWei(e.toString())),
              reservedForUpgrade: (re as bigint[]).map((e: bigint) => normalizeWei(e.toString())),
              withdrawableBalance: wb ? (wb as bigint[]).map((e: bigint) => normalizeWei(e.toString())) : undefined,
              totalWithdrawableBalance: totW !== undefined ? normalizeWei(totW.toString()) : undefined,
              totalReservedBalance: normalizeWei((totR ?? 0n).toString()),
            };
            cacheSet(`userFinancial_${addr.toLowerCase()}`, financial, USER_CACHE_TTL);
          }
        }
        if (results[2] !== undefined) {
          const v: any = results[2];
          const raw = v?.[0] ?? v;
          totalDownline = Number(raw ?? 0);
          cacheSet(`totDown_${addr.toLowerCase()}`, totalDownline, DOWNLINE_CACHE_TTL);
        }
        if (results[3]) {
          const r: any = results[3];
          const fee = r.registrationFeeCro ?? r[0] ?? 0n;
          const costs = r.levelCostsCro ?? r[1] ?? [];
          const price = r.croUsdPrice ?? r[2] ?? 0;
          const totalUsers = Number(r.totalUsers ?? r[3] ?? 0);
          const croPrice = price ? (Number(price) / 1e8).toFixed(4) : '0';
          const regFee = ethers.formatEther(fee);
          const levelCosts: Record<number, string> = {};
          for (let i = 0; i < (costs as bigint[]).length; i++) {
            levelCosts[i + 1] = ethers.formatEther((costs as bigint[])[i] as bigint);
            cacheSet(`levelCost_${i + 1}`, levelCosts[i + 1], LONG_CACHE_TTL);
          }
          systemInfo = { regFee, croPrice, totalUsers, levelCosts };
          cacheSet('systemInfo', systemInfo, LONG_CACHE_TTL);
          cacheSet('regFee', regFee, LONG_CACHE_TTL);
          cacheSet('croPrice', croPrice, LONG_CACHE_TTL);
          cacheSet('totalUsers', totalUsers, CACHE_TTL);
        }
        const out = { userInfo, financial, totalDownline, systemInfo };
        cacheSet(cacheKey, out, USER_CACHE_TTL);
        return out;
      } catch {
        return { userInfo: null, financial: null, totalDownline: 0, systemInfo: null };
      }
    });
  }, [readContract]);

  const register = useCallback(async (referrer: string, matrixParent: string, pathProof: string[], valueCRO: string): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const receipt = await estimateAndSend(writeContract, 'register', [referrer, matrixParent, pathProof], {
      value: ethers.parseEther(valueCRO),
    });
    if (signer) {
      signer.getAddress().then((myAddr) => {
        invalidateUserCache(myAddr);
        invalidateUserCache(referrer);
        invalidateUserCache(matrixParent);
      }).catch(() => {});
    }
    return receipt;
  }, [writeContract, signer]);

  /**
   * Fully on-chain registration: placement is computed inside the contract,
   * so this costs ZERO extra RPC reads (no findNextSlot / path-proof calls) —
   * just the transaction itself. Falls back to the legacy explicit-placement
   * flow when connected to a pre-upgrade implementation.
   */
  const registerAuto = useCallback(async (referrer: string, valueCRO: string): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    try {
      const receipt = await estimateAndSend(writeContract, 'registerAuto', [referrer], {
        value: ethers.parseEther(valueCRO),
      });
      if (signer) {
        signer.getAddress().then((myAddr) => {
          invalidateUserCache(myAddr);
          invalidateUserCache(referrer);
        }).catch(() => {});
      }
      return receipt;
    } catch (err: any) {
      const msg = (err?.reason || err?.message || '').toString();
      // Pre-upgrade contract has no registerAuto: single-RPC on-chain lookup,
      // then legacy register(). Still only 1 extra RPC (vs N+1 before).
      if (/no matching fragment|unknown fragment|could not decode|missing revert data|CALL_EXCEPTION/i.test(msg) || err?.code === 'CALL_EXCEPTION') {
        const { slot, path } = await findNextSlotAndProof(referrer);
        return register(referrer, slot, path, valueCRO);
      }
      throw err;
    }
  }, [writeContract, signer, findNextSlotAndProof, register]);

  const walletUpgrade = useCallback(async (valueCRO: string): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const receipt = await estimateAndSend(writeContract, 'walletUpgrade', [], {
      value: ethers.parseEther(valueCRO),
    });
    if (signer) {
      signer.getAddress().then((myAddr) => invalidateUserCache(myAddr)).catch(() => {});
    }
    return receipt;
  }, [writeContract, signer]);

  const upgradeFromReserve = useCallback(async (): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const receipt = await estimateAndSend(writeContract, 'upgradeFromReserve', []);
    if (signer) {
      signer.getAddress().then((myAddr) => invalidateUserCache(myAddr)).catch(() => {});
    }
    return receipt;
  }, [writeContract, signer]);

  const withdraw = useCallback(async (): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const receipt = await estimateAndSend(writeContract, 'withdraw', []);
    if (signer) {
      signer.getAddress().then((myAddr) => invalidateUserCache(myAddr)).catch(() => {});
    }
    return receipt;
  }, [writeContract, signer]);

  /**
   * Escape-hatch pull: claims failed-push commissions (emergencyBalances) plus
   * any legacy pendingWithdrawals balance in a single transaction.
   */
  const claimMissedEarnings = useCallback(async (): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const receipt = await estimateAndSend(writeContract, 'claimMissedEarnings', []);
    if (signer) {
      signer.getAddress().then((myAddr) => invalidateUserCache(myAddr)).catch(() => {});
    }
    return receipt;
  }, [writeContract, signer]);

  /** Total pullable missed earnings (failed pushes + legacy pending) — 1 RPC. */
  const getTotalMissedEarnings = useCallback(async (addr: string): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<string>(`missed_${addr}`);
    if (cached !== null) return cached;
    return dedupe(`rpc_missed_${addr}`, async () => {
      let formatted: string;
      try {
        const bal = await retryWrapper(() => readContract.getTotalMissedEarnings(addr), 'getTotalMissedEarnings');
        formatted = ethers.formatEther(bal);
      } catch {
        // Pre-upgrade contract: fall back to the legacy pending balance.
        const bal = await retryWrapper(() => readContract.getTotalWithdrawableBalance(addr), 'getTotalWithdrawableBalance');
        formatted = ethers.formatEther(bal);
      }
      cacheSet(`missed_${addr}`, formatted, BALANCE_CACHE_TTL);
      return formatted;
    });
  }, [readContract]);

  const togglePause = useCallback(async (): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const receipt = await estimateAndSend(writeContract, 'togglePause', []);
    invalidateAdminCache();
    return receipt;
  }, [writeContract]);

  const getOwner = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<string>('owner');
    if (cached) return cached;
    return dedupe('rpc_owner', async () => {
      const own = await readContract.owner();
      cacheSet('owner', own, IMMUTABLE_CACHE_TTL);
      return own;
    });
  }, [readContract]);

  const getManualCroUsdPrice = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'manualCroUsdPrice';
    const cached = cacheGet<string>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const price = await readContract.manualCroUsdPrice();
      const res = price.toString();
      cacheSet(key, res, LONG_CACHE_TTL);
      return res;
    });
  }, [readContract]);

  const getManualRegistrationFeeCro = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'manualRegFeeCro';
    const cached = cacheGet<string>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const fee = await readContract.manualRegistrationFeeCro();
      const res = fee.toString();
      cacheSet(key, res, LONG_CACHE_TTL);
      return res;
    });
  }, [readContract]);

  const getManualLevelCostCro = useCallback(async (level: number): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = `manualLevelCost_${level}`;
    const cached = cacheGet<string>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const cost = await readContract.manualLevelCostsCro(level);
      const res = cost.toString();
      cacheSet(key, res, LONG_CACHE_TTL);
      return res;
    });
  }, [readContract]);

  const getManualLevelCostsBatch = useCallback(async (): Promise<string[]> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'manualLevelCostsAll';
    const cached = cacheGet<string[]>(key);
    if (cached !== null) return cached;
    return dedupe('rpc_manualLevelCosts', async () => {
      const r = await retryWrapper(() => readContract.getManualLevelCosts(), 'getManualLevelCosts');
      const res = (Array.isArray(r) ? r : []).map((c: bigint) => c.toString());
      cacheSet(key, res, LONG_CACHE_TTL);
      return res;
    });
  }, [readContract]);

  const getReferralCap = useCallback(async (): Promise<number> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'referralCap';
    const cached = cacheGet<number>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const cap = await readContract.referralCap();
      const res = Number(cap);
      cacheSet(key, res, LONG_CACHE_TTL);
      return res;
    });
  }, [readContract]);

  const setManualCroUsdPrice = useCallback(async (price: string): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const receipt = await estimateAndSend(writeContract, 'setManualCroUsdPrice', [price]);
    invalidateAdminCache();
    return receipt;
  }, [writeContract]);

  const setManualCroCosts = useCallback(async (regFeeCro: string, levelCostsCro: string[]): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const padded = [...levelCostsCro];
    while (padded.length < 13) padded.push('0');
    const receipt = await estimateAndSend(writeContract, 'setManualCroCosts', [regFeeCro, padded]);
    invalidateAdminCache();
    return receipt;
  }, [writeContract]);

  const setReferralCap = useCallback(async (cap: number): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const receipt = await estimateAndSend(writeContract, 'setReferralCap', [cap]);
    invalidateAdminCache();
    return receipt;
  }, [writeContract]);

  const setUserLevel = useCallback(async (user: string, level: number): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'setUserLevel', [user, level]);
  }, [writeContract]);

  const getPythAddress = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'oracle_pyth';
    const cached = cacheGet<string>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const v = await readContract.pyth();
      cacheSet(key, v, LONG_CACHE_TTL);
      return v;
    });
  }, [readContract]);

  const getBandAddress = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'oracle_band';
    const cached = cacheGet<string>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const v = await readContract.band();
      cacheSet(key, v, LONG_CACHE_TTL);
      return v;
    });
  }, [readContract]);

  const getPythPriceId = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'oracle_pythPriceId';
    const cached = cacheGet<string>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const v = await readContract.pythPriceId();
      cacheSet(key, v, LONG_CACHE_TTL);
      return v;
    });
  }, [readContract]);

  const getSupraRouter = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'oracle_supra';
    const cached = cacheGet<string>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const v = await readContract.supraRouter();
      cacheSet(key, v, LONG_CACHE_TTL);
      return v;
    });
  }, [readContract]);

  const getWitnetRouter = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'oracle_witnet';
    const cached = cacheGet<string>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const v = await readContract.witnetRouter();
      cacheSet(key, v, LONG_CACHE_TTL);
      return v;
    });
  }, [readContract]);

  const getWitnetPriceId = useCallback(async (): Promise<string> => {
    if (!readContract) throw new Error('Not connected');
    const key = 'oracle_witnetPriceId';
    const cached = cacheGet<string>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const v = await readContract.witnetPriceId();
      cacheSet(key, v, LONG_CACHE_TTL);
      return v;
    });
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
    const key = 'migratedCount';
    const cached = cacheGet<number>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const n = Number(await readContract.getMigratedCount());
      cacheSet(key, n, 15000);
      return n;
    });
  }, [readContract]);

  const getIsMigrated = useCallback(async (addr: string): Promise<boolean> => {
    if (!readContract) throw new Error('Not connected');
    const key = `isMigrated_${addr.toLowerCase()}`;
    const cached = cacheGet<boolean>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_${key}`, async () => {
      const v = await readContract.isMigrated(addr);
      cacheSet(key, v, 60000);
      return v;
    });
  }, [readContract]);

  /** Batches many isMigrated checks into a single Multicall3 call. */
  const getIsMigratedBatch = useCallback(async (addresses: string[]): Promise<boolean[]> => {
    if (!readContract) throw new Error('Not connected');
    if (addresses.length === 0) return [];
    const results = await multicallBatch(
      readContract.runner as ethers.AbstractProvider,
      addresses.map((a) => ({ fn: 'isMigrated', args: [a] })),
    );
    return results.map((r) => Boolean((r as any)?.[0]));
  }, [readContract]);

  const getSettlementCredited = useCallback(async (addr: string): Promise<boolean> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<boolean>(`settled_${addr.toLowerCase()}`);
    if (cached !== null) return cached;
    return dedupe(`rpc_settled_${addr.toLowerCase()}`, async () => {
      const done = await retryWrapper(() => readContract.settlementCredited(addr), 'settlementCredited');
      cacheSet(`settled_${addr.toLowerCase()}`, done, 60000);
      return done;
    });
  }, [readContract]);

  const creditMigratedReserves = useCallback(async (users: string[], amounts: (string | bigint)[]): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    const wei = amounts.map((a) => (typeof a === 'bigint' ? a : ethers.parseEther(a)));
    return estimateAndSend(writeContract, 'creditMigratedReserves', [users, wei]);
  }, [writeContract]);

  const backfillDownlineBatch = useCallback(async (startIndex: number, batchSize: number): Promise<ethers.TransactionReceipt> => {
    if (!writeContract) throw new Error('Wallet not connected');
    return estimateAndSend(writeContract, 'backfillDownlineBatch', [startIndex, batchSize]);
  }, [writeContract]);

  const getDownlineBackfillCount = useCallback(async (): Promise<number> => {
    if (!readContract) throw new Error('Not connected');
    const cached = cacheGet<number>('downlineBackfillCount');
    if (cached !== null) return cached;
    return dedupe('rpc_downlineBackfillCount', async () => {
      const n = await retryWrapper(() => readContract.getDownlineBackfillCount(), 'getDownlineBackfillCount');
      const res = Number(n);
      cacheSet('downlineBackfillCount', res, 30000);
      return res;
    });
  }, [readContract]);

  const getIsDownlineBackfilled = useCallback(async (addr: string): Promise<boolean> => {
    if (!readContract) throw new Error('Not connected');
    const key = `downlineBackfilled_${addr.toLowerCase()}`;
    const cached = cacheGet<boolean>(key);
    if (cached !== null) return cached;
    return dedupe(`rpc_downlineBackfilled_${addr.toLowerCase()}`, async () => {
      const v = await retryWrapper(() => readContract.downlineBackfilled(addr), 'downlineBackfilled');
      cacheSet(key, v, 60000);
      return v;
    });
  }, [readContract]);
  const getIsDownlineBackfilledBatch = useCallback(async (addresses: string[]): Promise<boolean[]> => {
    if (!readContract) throw new Error('Not connected');
    if (addresses.length === 0) return [];
    const results = await multicallBatch(
      readContract.runner as ethers.AbstractProvider,
      addresses.map((a) => ({ fn: 'downlineBackfilled', args: [a] })),
    );
    return results.map((r) => Boolean((r as any)?.[0]));
  }, [readContract]);


  return useMemo(() => ({
    readContract, writeContract,
    getUserInfo, getUserFinancialInfo, getSystemInfoCached, getRegistrationFee, getLevelCost, getLevelCostsBatch,
    getTotalUsers, getCroPrice, getDownlinePaginated, getDashboardBatch,
    getUserAddressesPaginated, getUserInfosBatch, getUserParentInfo,
    getMatrixChildren, getMatrixChildrenBatch, getChildrenWithUserInfoBatch, getDeepCountsBatch, getExactMatrixLevelCounts, getMatrixParent, findNextMatrixSlot, findNextSlotAndProof,
    getPaused, togglePause,
    getOwner, getManualCroUsdPrice, getManualRegistrationFeeCro, getManualLevelCostCro, getManualLevelCostsBatch, getReferralCap,
    setManualCroUsdPrice, setManualCroCosts, setReferralCap, setUserLevel,
    getPythAddress, getBandAddress, getPythPriceId, getSupraRouter, getWitnetRouter, getWitnetPriceId,
    setPriceFeeds, setNewPriceFeeds,
    register, registerAuto, walletUpgrade,
    upgradeFromReserve, withdraw, claimMissedEarnings, getPendingWithdrawal, getTotalWithdrawableBalance, getTotalMissedEarnings, getTotalDownline,
    migrateUserBatch, getMigratedCount, getIsMigrated, getIsMigratedBatch,
    getSettlementCredited, creditMigratedReserves,    backfillDownlineBatch, getDownlineBackfillCount, getIsDownlineBackfilled, getIsDownlineBackfilledBatch,
    getAdminConfigCached, invalidateUserCache,
  }), [readContract, writeContract, getUserInfo, getUserFinancialInfo, getSystemInfoCached, getRegistrationFee, getLevelCost, getLevelCostsBatch, getTotalUsers, getCroPrice, getDownlinePaginated, getDashboardBatch, getUserAddressesPaginated, getUserInfosBatch, getUserParentInfo, getMatrixChildren, getMatrixChildrenBatch, getChildrenWithUserInfoBatch, getDeepCountsBatch, getExactMatrixLevelCounts, getMatrixParent, findNextMatrixSlot, findNextSlotAndProof, getPaused, togglePause, getOwner, getManualCroUsdPrice, getManualRegistrationFeeCro, getManualLevelCostCro, getManualLevelCostsBatch, getReferralCap, setManualCroUsdPrice, setManualCroCosts, setReferralCap, setUserLevel, getPythAddress, getBandAddress, getPythPriceId, getSupraRouter, getWitnetRouter, getWitnetPriceId, setPriceFeeds, setNewPriceFeeds, register, registerAuto, walletUpgrade, upgradeFromReserve, withdraw, claimMissedEarnings, getPendingWithdrawal, getTotalWithdrawableBalance, getTotalMissedEarnings, getTotalDownline, migrateUserBatch, getMigratedCount, getIsMigrated, getIsMigratedBatch, getSettlementCredited, creditMigratedReserves, backfillDownlineBatch, getDownlineBackfillCount, getIsDownlineBackfilled, getIsDownlineBackfilledBatch, getAdminConfigCached, invalidateUserCache]);
}

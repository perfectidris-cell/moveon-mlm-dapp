import { ethers } from 'ethers';

type PerformRequest = Parameters<ethers.JsonRpcProvider['_perform']>[0];

const REQUEST_TIMEOUT_MS = 12_000;
const FAILURE_COOLDOWN_MS = 10_000;
const SHORT_CACHE_MS = 3_000; // 3-second micro-cache to coalesce concurrent render queries

function safeReqKey(req: PerformRequest): string {
  try {
    return JSON.stringify(req, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return '';
  }
}

/**
 * Read-only provider that load-balances across CRONOS_NETWORK.rpcUrls with
 * sequential failover and in-flight deduplication. It starts on the first (healthiest)
 * URL and, on an RPC error or timeout, rotates to the next URL for that and subsequent calls so a
 * healthy endpoint stays preferred (sticky). Endpoints that recently failed are
 * temporarily skipped (cooldown) to avoid hammering rate-limited relays.
 */
export class FailoverProvider extends ethers.JsonRpcProvider {
  private readonly providers: ethers.JsonRpcProvider[] = [];
  private current = 0;
  private readonly failuresSince = new Array<number>(0);
  private readonly inflight = new Map<string, Promise<any>>();
  private readonly shortCache = new Map<string, { value: any; expiry: number }>();

  constructor(urls: string[], chainId: number) {
    super(urls[0] ?? '', chainId, { staticNetwork: true });
    for (const url of urls) {
      if (url) {
        this.providers.push(new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true }));
      }
    }
    this.failuresSince.length = this.providers.length;
  }

  /** Returns the provider to try next, skipping endpoints still in cooldown. */
  private nextCandidate(index: number): number {
    const n = this.providers.length;
    for (let attempt = 0; attempt < n; attempt++) {
      const idx = (index + attempt) % n;
      const lastFail = this.failuresSince[idx] ?? 0;
      if (Date.now() - lastFail > FAILURE_COOLDOWN_MS) return idx;
    }
    return index;
  }

  override async _perform(req: PerformRequest): Promise<any> {
    const method = req.method as string;
    const isCacheable = method === 'call' || method === 'chainId' || method === 'getBlockNumber';
    const key = isCacheable ? safeReqKey(req) : '';

    if (key) {
      const cached = this.shortCache.get(key);
      if (cached && Date.now() < cached.expiry) {
        return cached.value;
      }
      this.shortCache.delete(key);

      const ongoing = this.inflight.get(key);
      if (ongoing) {
        return ongoing;
      }
    }

    const execPromise = this.executePerform(req).then((res) => {
      if (key) {
        const ttl = method === 'chainId' ? 300_000 : method === 'getBlockNumber' ? 4_000 : SHORT_CACHE_MS;
        this.shortCache.set(key, { value: res, expiry: Date.now() + ttl });
      }
      return res;
    }).finally(() => {
      if (key) this.inflight.delete(key);
    });

    if (key) {
      this.inflight.set(key, execPromise);
    }

    return execPromise;
  }

  private async executePerform(req: PerformRequest): Promise<any> {
    let lastError: unknown = null;
    const n = this.providers.length;
    const start = this.current;

    for (let attempt = 0; attempt < n; attempt++) {
      const idx = this.nextCandidate((start + attempt) % n);
      try {
        const result = await this.withTimeout(() => this.providers[idx]._perform(req));
        this.failuresSince[idx] = 0;
        this.current = idx;
        return result;
      } catch (err) {
        this.failuresSince[idx] = Date.now();
        lastError = err;
      }
    }
    throw lastError ?? new Error('All RPC endpoints failed');
  }

  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('RPC request timed out')), REQUEST_TIMEOUT_MS);
      fn().then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }
}
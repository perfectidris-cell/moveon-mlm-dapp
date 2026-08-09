import { ethers } from 'ethers';

type PerformRequest = Parameters<ethers.JsonRpcProvider['_perform']>[0];

/**
 * Read-only provider that load-balances across CRONOS_NETWORK.rpcUrls with
 * sequential failover: it starts on the first URL, and on an RPC error it
 * rotates to the next URL in the list for that and subsequent calls. The last
 * working URL is remembered (sticky), so a healthy endpoint stays preferred.
 */
export class FailoverProvider extends ethers.JsonRpcProvider {
  private readonly providers: ethers.JsonRpcProvider[] = [];
  private current = 0;

  constructor(urls: string[], chainId: number) {
    super(urls[0] ?? '', chainId, { staticNetwork: true });
    for (const url of urls) {
      if (url) {
        this.providers.push(new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true }));
      }
    }
  }

  override async _perform(req: PerformRequest): Promise<any> {
    let lastError: unknown = null;
    const n = this.providers.length;
    for (let attempt = 0; attempt < n; attempt++) {
      const idx = (this.current + attempt) % n;
      try {
        const result = await this.providers[idx]._perform(req);
        this.current = idx;
        return result;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new Error('All RPC endpoints failed');
  }
}
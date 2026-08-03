const { ethers, FetchRequest } = require("ethers");

const CRONOS_RPC_URLS = [
    "https://evm-cronos.crypto.org",
    "https://cronos-mainnet.core.chainstack.com/f594d625c3a2c07704bed1beb4cae56b",
    "https://lb.drpc.live/cronos/AqLS9pjM8kSphmpdDl70ykuFqbiRhesR8aqKwosiOHdW",
    "https://cronos.drpc.org/",
    "https://cronos.org/rpc",
    "https://rpc.swiftnodes.io/rpc/cronos?key=demo",
    "https://cro-mainnet.gateway.tatum.io"
];

class FailoverProvider extends ethers.JsonRpcProvider {
    constructor(urls, chainId, options) {
        super(urls[0], chainId, options);
        this._rpcUrls = urls.map(u => new FetchRequest(u));
        this._currentIdx = 0;
    }

    async _send(request) {
        for (let i = 0; i < this._rpcUrls.length; i++) {
            const idx = (this._currentIdx + i) % this._rpcUrls.length;
            try {
                const origConnection = this.connection;
                this.connection = this._rpcUrls[idx];
                const result = await super._send(request);
                this.connection = origConnection;
                this._currentIdx = idx;
                return result;
            } catch (e) {
                // fallback to next URL
            }
        }
        throw new Error("All Cronos RPC endpoints failed");
    }
}

function createCronosProvider() {
    return new FailoverProvider(CRONOS_RPC_URLS, 25, {
        timeout: 60000,
        throttleLimit: 1
    });
}

module.exports = { CRONOS_RPC_URLS, FailoverProvider, createCronosProvider };

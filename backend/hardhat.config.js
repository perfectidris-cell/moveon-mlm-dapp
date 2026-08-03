require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { extendEnvironment } = require("hardhat/config");

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const CRONOS_RPC_URLS = [
    "https://evm-cronos.crypto.org",
    "https://cronos-mainnet.core.chainstack.com/f594d625c3a2c07704bed1beb4cae56b",
    "https://lb.drpc.live/cronos/AqLS9pjM8kSphmpdDl70ykuFqbiRhesR8aqKwosiOHdW",
    "https://cronos.drpc.org/",
    "https://cronos.org/rpc",
    "https://rpc.swiftnodes.io/rpc/cronos?key=demo",
    "https://cro-mainnet.gateway.tatum.io"
];

async function rpcRequest(url, method, params) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
}

async function rpcRequestWithFailover(method, params) {
    for (const url of CRONOS_RPC_URLS) {
        try {
            return await rpcRequest(url, method, params);
        } catch (_) { }
    }
    throw new Error("All Cronos RPC endpoints failed");
}

extendEnvironment((hre) => {
    if (hre.network.name !== "cronos") return;

    const origRequest = hre.network.provider.request.bind(hre.network.provider);
    hre.network.provider.request = async (args) => {
        try {
            return await rpcRequestWithFailover(args.method, args.params || []);
        } catch (e) {
            return origRequest(args);
        }
    };
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            },
            viaIR: true
        }
    },
    networks: {
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 31337,
        },
        cronosTestnet: {
            url: process.env.RPC_URL_CRONOS_TESTNET || "https://evm-t3.cronos.org/",
            chainId: 338,
            accounts: accounts,
            timeout: 60000,
        },
        cronos: {
            url: CRONOS_RPC_URLS[0],
            chainId: 25,
            accounts: accounts,
            timeout: 60000,
        },
    },
    etherscan: {
        apiKey: {
            cronos: process.env.CRONOSCAN_API_KEY_MAINNET || process.env.CRONOSCAN_API_KEY,
            cronosTestnet: process.env.CRONOSCAN_API_KEY_MAINNET || process.env.CRONOSCAN_API_KEY,
        },
        customChains: [
            {
                network: "cronos",
                chainId: 25,
                urls: {
                    apiURL: "https://api.cronoscan.com/api",
                    browserURL: "https://cronoscan.com"
                }
            },
            {
                network: "cronosTestnet",
                chainId: 338,
                urls: {
                    apiURL: "https://api-testnet.cronoscan.com/api",
                    browserURL: "https://testnet.cronoscan.com"
                }
            }
        ]
    },
};

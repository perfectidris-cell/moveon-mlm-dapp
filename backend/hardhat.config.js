require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            },
            viaIR: true // Re-enable viaIR to fix stack too deep error
        }
    },
    networks: {
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 31337,
        },
        amoy: {
            url: "https://polygon-amoy.g.alchemy.com/v2/RvG5KJHjicP59CETSx5ci",
            accounts: [process.env.PRIVATE_KEY],
        },
        polygon: {
            url: process.env.RPC_URL_MAINNET || "https://polygon-rpc.com/",
            chainId: 137,
            accounts: [process.env.PRIVATE_KEY],
            gasPrice: 100000000000, // 100 gwei
            gasLimit: 8000000, // 8M gas limit
        },
        cronosTestnet: {
            url: process.env.RPC_URL_CRONOS_TESTNET || "https://evm-t3.cronos.org/",
            chainId: 338,
            accounts: [process.env.PRIVATE_KEY],
            gasPrice: 5000000000000, // 5000 gwei
            timeout: 60000, // 60 seconds
        },
        cronos: {
            url: process.env.CRONOS_RPC_URL || "https://evm.cronos.org",
            chainId: 25,
            accounts: [process.env.PRIVATE_KEY],
            gasPrice: 5000000000000,
            timeout: 60000,
        },
    },
    etherscan: {
        apiKey: {
            polygonAmoy: process.env.POLYGONSCAN_API_KEY,
            polygon: process.env.POLYGONSCAN_API_KEY_MAINNET || process.env.POLYGONSCAN_API_KEY,
            cronos: process.env.CRONOSCAN_API_KEY_MAINNET || process.env.CRONOSCAN_API_KEY,
        },
        customChains: [
            {
                network: "polygonAmoy",
                chainId: 80002,
                urls: {
                    apiURL: "https://api-amoy.polygonscan.com/api",
                    browserURL: "https://amoy.polygonscan.com"
                }
            },
            {
                network: "cronos",
                chainId: 25,
                urls: {
                    apiURL: "https://api.cronoscan.com/api",
                    browserURL: "https://cronoscan.com"
                }
            }
        ]
    },
};

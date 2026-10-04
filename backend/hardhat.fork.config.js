require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const FORK_URL = process.env.FORK_RPC_URL || "https://evm-cronos.crypto.org";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true }
  },
  networks: {
    hardhat: {
      forking: { url: FORK_URL },
      accounts: { count: 20 },
      chainId: 25,
      chains: {
        25: {
          hardforkHistory: {
            byzantium: 0,
            constantinople: 0,
            petersburg: 0,
            istanbul: 0,
            muirGlacier: 0,
            berlin: 0,
            london: 0,
            arrowGlacier: 0,
            grayGlacier: 0,
            merge: 0,
            shanghai: 0,
            cancun: 0,
          },
        },
      },
    },
    fork: {
      url: "http://127.0.0.1:8545",
      chainId: 25,
      accounts: accounts,
    },
  },
};
const hre = require("hardhat");
const { ethers } = hre;
const { FailoverProvider, CRONOS_RPC_URLS } = require("../utils/failoverProvider");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  // batchMaxCount:1 — some endpoints reject JSON-RPC batch arrays
  const provider = new FailoverProvider(CRONOS_RPC_URLS, 25, {
    timeout: 60000,
    throttleLimit: 1,
    batchMaxCount: 1,
  });
  const abi = require("../artifacts/contracts/ParadiseUpgradeable.sol/ParadiseUpgradeable.json").abi;
  const np = new ethers.Contract(PROXY, abi, provider);
  const total = Number(await np.getTotalUsers());
  console.log("totalUsers:", total);
  console.log("proxy balance:", ethers.formatEther(await provider.getBalance(PROXY)), "CRO");

  // 1) uplinesBackfilled flag for EVERY user
  const addrs = [];
  const CHUNK = 50;
  for (let i = 0; i < total; i += CHUNK) {
    const page = await np.getUserAddressesPaginated(i, CHUNK);
    addrs.push(...page.filter((a) => a !== ethers.ZeroAddress));
  }
  console.log("addresses fetched:", addrs.length);

  let flagged = 0;
  const unflagged = [];
  const withRetry = async (fn) => {
    for (let i = 0; i < 10; i++) {
      try { return await fn(); } catch (e) {
        if (i === 9) throw e;
        await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
      }
    }
  };
  const CONC = 2;
  for (let i = 0; i < addrs.length; i += CONC) {
    const part = addrs.slice(i, i + CONC);
    const res = await Promise.all(part.map((a) => withRetry(() => np.uplinesBackfilled(a))));
    res.forEach((ok, j) => { if (ok) flagged++; else unflagged.push(part[j]); });
    if (i % 100 === 0) console.log("  checked", Math.min(i + CONC, addrs.length), "/", addrs.length);
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log("uplinesBackfilled true:", flagged, "/", addrs.length);
  if (unflagged.length) throw new Error("UNFLAGGED: " + unflagged.join(","));

  // 2) cache correctness vs live matrixParent walk for samples (head, middle, tail)
  const samples = [addrs[0], addrs[1], addrs[2], addrs[Math.floor(total / 2)], addrs[total - 3], addrs[total - 2], addrs[total - 1]];
  for (const a of samples.filter(Boolean)) {
    let cursor = await withRetry(() => np.matrixParent(a));
    for (let k = 0; k < 12; k++) {
      const cached = await withRetry(() => np.uplineCache(a, k));
      if (cached.toLowerCase() !== cursor.toLowerCase()) throw new Error(`cache mismatch ${a} at ${k}: ${cached} != ${cursor}`);
      if (cursor === ethers.ZeroAddress) break;
      cursor = await withRetry(() => np.matrixParent(cursor));
    }
    console.log("  cache OK:", a);
    await new Promise((r) => setTimeout(r, 300));
  }

  // 3) views + missed-earnings sanity
  console.log("getDownlinePaginated present:", typeof np.getDownlinePaginated === "function");
  console.log("registerAuto present:", typeof np.registerAuto === "function");
  const missed0 = await withRetry(() => np.getTotalMissedEarnings(addrs[0]));
  console.log("getTotalMissedEarnings(sample):", missed0.toString());

  console.log("\n✅ MAINNET VERIFICATION PASSED");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });

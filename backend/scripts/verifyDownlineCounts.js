const hre = require("hardhat");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  const p = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  console.log("Proxy:", PROXY);
  console.log("totalUsers:", (await p.getTotalUsers()).toString());
  console.log("downlineBackfilled:", (await p.getDownlineBackfillCount()).toString());

  const owner = await p.owner();
  const all = await p.getUserAddressesPaginated(0, 1000);

  console.log("\nSample users (first 10 + last 5):");
  const samples = [...all.slice(0, 10), ...all.slice(-5)];
  const seen = new Set();
  for (const a of samples) {
    if (seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase());
    const total = (await p.totalDownline(a)).toString();
    const info = await p.getUserInfo(a);
    // Verify against fresh BFS count (depth 20 cap applies on-chain, but fine for check)
    let bfs = "n/a";
    try {
      const dl = await p.getDownlinePaginated(a, 20, 0, 0);
      bfs = dl.total.toString();
    } catch (e) {
      bfs = "err";
    }
    console.log(
      `  lvl ${String(Number(info.level)).padStart(2)} | ${a.slice(0, 8)}... | totalDownline=${total.padStart(4)} | paginated(depth20) total=${bfs}`
    );
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message || e); process.exit(1); });
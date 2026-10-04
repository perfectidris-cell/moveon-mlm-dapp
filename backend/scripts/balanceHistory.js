const { ethers } = require("ethers");

const NEW_PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const OLD_PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";

const failover = [
  "https://evm-cronos.crypto.org",
  "https://cronos-mainnet.core.chainstack.com/f594d625c3a2c07704bed1beb4cae56b",
  "https://lb.drpc.live/cronos/AqLS9pjM8kSphmpdDl70ykuFqbiRhesR8aqKwosiOHdW",
  "https://cronos.drpc.org/",
  "https://cronos.org/rpc",
];

async function rpc(method, params) {
  let lastErr;
  for (const url of failover) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all RPC failed");
}

const BAL_SLOT = "0x0000000000000000000000000000000000000000000000000000000000000004";

async function balanceAt(addr, block) {
  const hex = "0x" + block.toString(16);
  const r = await rpc("eth_getBalance", [addr, hex]);
  return BigInt(r);
}

async function main() {
  const latest = Number(await rpc("eth_blockNumber", []));
  console.log("Latest block:", latest);

  // 1) Find migration window via UserMigrated logs on NEW proxy
  const topic = ethers.id("UserMigrated(address)");
  console.log("\nQuerying UserMigrated logs (chunked)...");
  let logs = [];
  const chunk = 50000;
  let from = 87800000; // ~ Aug 6
  let to = from + chunk;
  while (from < latest) {
    try {
      const res = await rpc("eth_getLogs", [{
        address: NEW_PROXY,
        topics: [topic],
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + Math.min(to, latest).toString(16),
      }]);
      if (res && res.length) logs = logs.concat(res);
    } catch (e) {
      console.log("  chunk", from, "failed:", e.message.slice(0, 60));
    }
    from = to;
    to += chunk;
    if (from > 88100000) break; // cap
  }
  console.log("UserMigrated log count:", logs.length);
  if (logs.length) {
    const blocks = logs.map(l => Number(l.blockNumber));
    console.log("  first block:", Math.min(...blocks), "last block:", Math.max(...blocks));
    // count by day-bucket (block ~15158/day)
    const groups = {};
    for (const b of blocks) {
      const day = Math.floor((b - 87800000) / 15158);
      groups[day] = (groups[day] || 0) + 1;
    }
    for (const d of Object.keys(groups).sort((a,b)=>+a-+b)) {
      console.log(`  ~ block ${(87800000 + +d*15158)} (+${+d} days): ${groups[d]} events`);
    }
  }

  // 2) Old proxy balance at migration window edges + daily
  console.log("\nOLD proxy balance history:");
  const startB = 87800000, step = 20000;
  for (let b = startB; b <= latest; b += step) {
    if (b > 88200000) break;
    const bal = await balanceAt(OLD_PROXY, b);
    console.log(`  block ${b}: ${ethers.formatEther(bal)} CRO`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message); process.exit(1); });
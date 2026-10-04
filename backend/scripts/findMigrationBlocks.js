const { ethers } = require("ethers");

const NEW_PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const failover = [
  "https://evm-cronos.crypto.org",
  "https://cronos.drpc.org/",
];

async function rpc(method, params) {
  for (const url of failover) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch (_) { }
  }
  throw new Error("all RPC failed");
}

const top = (x) => {
  const h = x.slice(2);
  return "0x" + h.slice(h.length - 40);
};

async function main() {
  const latest = Number(await rpc("eth_blockNumber", []));
  console.log("latest:", latest);

  const topicUserRegistered = ethers.id("UserRegistered(address,address)");
  const topicUserMigrated = ethers.id("UserMigrated(address)");

  // Scan new-proxy logs from block 87500000 to latest, chunked
  let reg = 0, mig = 0, firstReg = null, lastReg = null, firstMig = null, lastMig = null;
  let from = 87500000;
  const step = 100000;
  while (from < latest) {
    const to = Math.min(from + step, latest);
    let logs;
    try {
      logs = await rpc("eth_getLogs", [{ address: NEW_PROXY, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);
    } catch (e) {
      // fall back to per-topic
      logs = [];
      for (const t of [topicUserRegistered, topicUserMigrated]) {
        try {
          const l = await rpc("eth_getLogs", [{ address: NEW_PROXY, topics: [t], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);
          logs.push(...l);
        } catch (_) { }
      }
    }
    if (logs && logs.length) {
      for (const l of logs) {
        const b = Number(l.blockNumber);
        if (l.topics[0] === topicUserRegistered) {
          reg++;
          if (!firstReg || b < firstReg) firstReg = b;
          if (!lastReg || b > lastReg) lastReg = b;
        } else if (l.topics[0] === topicUserMigrated) {
          mig++;
          if (!firstMig || b < firstMig) firstMig = b;
          if (!lastMig || b > lastMig) lastMig = b;
        }
      }
    }
    from = to + 1;
  }
  console.log("UserRegistered events on NEW proxy:", reg, "first:", firstReg, "last:", lastReg);
  console.log("UserMigrated events on NEW proxy:", mig, "first:", firstMig, "last:", lastMig);

  // Also check deployment: first block where NEW proxy had code
  let deployBlock = null;
  let lo = 87000000, hi = 88200000;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await rpc("eth_getCode", [NEW_PROXY, "0x" + mid.toString(16)]);
    const has = code && code.length > 2;
    if (has) { deployBlock = mid; hi = mid - 1; } else { lo = mid + 1; }
  }
  console.log("NEW proxy first code (deploy approx):", deployBlock);

  const codeNow = await rpc("eth_getCode", [NEW_PROXY, "latest"]);
  console.log("NEW proxy code len now:", codeNow.length);

  // OLD proxy: find last block it had code (destruction point)
  let oldLast = null;
  lo = 87000000; hi = 88200000;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await rpc("eth_getCode", ["0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd", "0x" + mid.toString(16)]);
    const has = code && code.length > 2;
    if (has) { oldLast = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  console.log("OLD proxy last block with code:", oldLast);
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message); process.exit(1); });
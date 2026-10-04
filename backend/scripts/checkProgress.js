const hre = require("hardhat");
const fs = require("fs");
const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const PRIMARY_RPC = "https://evm-cronos.crypto.org";

async function rpc(method, params) {
  const res = await fetch(PRIMARY_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  return (await res.json()).result;
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const addr = signer.address;
  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);

  const noncePending = parseInt(await rpc("eth_getTransactionCount", [addr, "pending"]), 16);
  const nonceLatest = parseInt(await rpc("eth_getTransactionCount", [addr, "latest"]), 16);
  console.log("signer:", addr, "nonce latest:", nonceLatest, "pending:", noncePending);

  const ledger = JSON.parse(fs.readFileSync("settlement_ledger_9000_cro_lvl_weighted.json", "utf8"));

  // Determine which users have been credited (settlementCredited)
  let creditedCount = 0, creditedSum = 0n, firstUncredited = null;
  for (let i = 0; i < ledger.rows.length; i++) {
    const r = ledger.rows[i];
    const done = await paradise.settlementCredited(r.address);
    if (done) { creditedCount++; creditedSum += BigInt(r.shareWei); }
    else if (firstUncredited === null) firstUncredited = i;
  }
  console.log("credited users:", creditedCount, "credited sum:", hre.ethers.formatEther(creditedSum), "CRO");
  console.log("first uncredited index:", firstUncredited);
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
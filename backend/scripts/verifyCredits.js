const hre = require("hardhat");
const fs = require("fs");
const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const LEDGER = "settlement_ledger_9000_cro_lvl_weighted.json";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const rows = ledger.rows;
  console.log("Total users:", (await paradise.getTotalUsers()).toString());
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(PROXY)), "CRO");

  let ok = 0, bad = [];
  let totalReserved = 0n;
  const samples = new Set([0, 40, 120, 560]);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const info = await paradise.getUserInfo(r.address);
    const lvl = Number(info[2]);
    const res = await paradise.getReservedBalance(r.address, lvl + 1);
    totalReserved += res;
    if (res >= BigInt(r.shareWei)) ok++;
    else bad.push({ a: r.address, expected: r.shareWei, got: res.toString() });
    if (samples.has(i)) console.log(`  sample[${i}] ${r.address.slice(0,10)}... level=${lvl} reserve(level+1)=${hre.ethers.formatEther(res)} CRO share=${r.shareCro}`);
    if (i % 100 === 0) console.log(`  ... checked ${i}`);
  }

  console.log("Recipients with reserve >= share at credit level:", ok, "/", rows.length);
  if (bad.length) console.log("BELOW share (first 5):", JSON.stringify(bad.slice(0, 5)));
  console.log("Sum reserve at credit level across ledger:", hre.ethers.formatEther(totalReserved), "CRO");
  console.log("\nVERIFICATION COMPLETE");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
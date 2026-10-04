const hre = require("hardhat");
const fs = require("fs");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const LEDGER = "settlement_ledger_9000_cro_lvl_weighted.json";
const BATCH_SIZE = 40;
const PRIMARY_RPC = "https://evm-cronos.crypto.org";

async function getNonceFromPrimary(address) {
  const res = await fetch(PRIMARY_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [address, "pending"] })
  });
  const data = await res.json();
  return parseInt(data.result, 16);
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);

  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY, signer);
  const contractOwner = await paradise.owner();
  if (contractOwner.toLowerCase() !== signer.address.toLowerCase()) throw new Error("Signer is not proxy owner");

  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const rows = ledger.rows;
  console.log("Ledger recipients:", rows.length);

  // Read existing report to resume from where we left off
  let results = [];
  let startIndex = 0;
  if (fs.existsSync("credit_tx_report.json")) {
    results = JSON.parse(fs.readFileSync("credit_tx_report.json", "utf8"));
    startIndex = results.length * BATCH_SIZE;
    console.log("Resuming from index:", startIndex, "(", results.length, "batches already done )");
  }

  const nonce = await getNonceFromPrimary(signer.address);
  console.log("Starting nonce (primary RPC, pending):", nonce);

  for (let i = startIndex; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const users = batch.map((r) => r.address);
    const amounts = batch.map((r) => BigInt(r.shareWei));
    const sum = amounts.reduce((a, b) => a + b, 0n);
    console.log(`\n[Batch ${i / BATCH_SIZE + 1}] users ${i + 1}-${i + batch.length} (${batch.length}) sum=${hre.ethers.formatEther(sum)} CRO nonce=${nonce + (i - startIndex) / BATCH_SIZE}`);

    const tx = await paradise.creditMigratedReserves(users, amounts, { gasLimit: 4000000, nonce: nonce + (i - startIndex) / BATCH_SIZE });
    const rec = await tx.wait();
    console.log("  tx:", rec.hash, "status:", rec.status, "gas:", rec.gasUsed.toString());
    results.push({ index: i, count: batch.length, sum: sum.toString(), tx: rec.hash, status: rec.status });
    fs.writeFileSync("credit_tx_report.json", JSON.stringify(results, null, 2));
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\n=== SUMMARY ===");
  const total = results.reduce((a, r) => a + BigInt(r.sum), 0n);
  console.log("Batches:", results.length);
  console.log("Total credited:", hre.ethers.formatEther(total), "CRO");
  for (const r of results) console.log(`  batch@${r.index}: ${r.count} users, ${hre.ethers.formatEther(BigInt(r.sum))} CRO, ${r.tx} status=${r.status}`);

  fs.writeFileSync("credit_tx_report.json", JSON.stringify(results, null, 2));
  console.log("\nWrote credit_tx_report.json");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
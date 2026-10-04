const hre = require("hardhat");
const fs = require("fs");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const PROGRESS_FILE = "backfill_uplines_progress.json";
const PRIMARY_RPC = "https://evm-cronos.crypto.org";

// Fork-validated: batch=50 -> ~6.6M gas (~132k/user). Halves on failure.
let BATCH = 50;
const MIN_BATCH = 5;
// Wallet pre-checks balance against gasLimit × maxFee, so a flat 15M limit
// demands 15M × maxFee up-front. Scale with batch instead (~500k/user worst case).
const gasLimitFor = (n) => Math.min(15000000, 500000 + n * 500000);

async function getNonce(provider, address) {
  const res = await fetch(PRIMARY_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [address, "pending"] })
  });
  const data = await res.json();
  return parseInt(data.result, 16);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const p = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      console.log("Resuming from index:", p.done, "(batch was", p.batch + ")");
      BATCH = p.batch || BATCH;
      return p.done || 0;
    }
  } catch {}
  return 0;
}

function saveProgress(done) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ done, batch: BATCH, at: new Date().toISOString() }));
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);

  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY, signer);
  const contractOwner = await paradise.owner();
  if (contractOwner.toLowerCase() !== signer.address.toLowerCase()) throw new Error("Signer is not proxy owner");

  // Sanity: new implementation must be live (uplineCache getter exists)
  try {
    await paradise.uplinesBackfilled(signer.address);
  } catch {
    throw new Error("uplineCache not present — run the UUPS upgrade first.");
  }

  const total = Number(await paradise.getTotalUsers());
  console.log("Total users:", total);

  let done = loadProgress();
  let nonce = await getNonce(hre.ethers.provider, signer.address);
  console.log("Starting nonce:", nonce, "start index:", done);

  while (done < total) {
    const n = Math.min(BATCH, total - done);
    try {
      const tx = await paradise.backfillUplinesBatch(done, n, { gasLimit: gasLimitFor(n), nonce: nonce++ });
      const rc = await tx.wait();
      done += n;
      saveProgress(done);
      console.log(`  [${done}/${total}] batch=${n} gas=${rc.gasUsed.toString()} tx=${rc.hash}`);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      if (n <= MIN_BATCH) throw e;
      BATCH = Math.max(MIN_BATCH, Math.floor(BATCH / 2));
      saveProgress(done);
      // Re-sync nonce in case the failed tx consumed one (or not)
      nonce = await getNonce(hre.ethers.provider, signer.address);
      console.log(`  batch=${n} failed (${(e.reason || e.message || "").slice(0, 80)}), halving to ${BATCH}, nonce=${nonce}`);
    }
  }

  // Spot-verify a few users
  const samples = await paradise.getUserAddressesPaginated(0, Math.min(5, total));
  for (const a of samples) {
    const flagged = await paradise.uplinesBackfilled(a);
    if (!flagged) throw new Error("NOT FLAGGED: " + a);
  }
  console.log("\nSWEEP COMPLETE:", done, "/", total, "— first", samples.length, "users verified flagged.");
  try { fs.unlinkSync(PROGRESS_FILE); } catch {}
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });

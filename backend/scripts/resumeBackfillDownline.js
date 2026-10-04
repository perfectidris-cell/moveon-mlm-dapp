const hre = require("hardhat");
const { ethers } = hre;

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const BACKFILL_BATCH = 10;
const START_REMAINING = process.env.START_REMAINING ? Number(process.env.START_REMAINING) : 0;

async function main() {
  console.log("🚀 Resuming totalDownline backfill on Cronos Mainnet...\n");

  const pk = process.env.PRIVATE_KEY;
  const freshProvider = new ethers.JsonRpcProvider("https://evm.cronos.com");
  const wallet = new ethers.Wallet(pk, freshProvider);
  console.log("Using account:", wallet.address);

  const paradise = new ethers.Contract(PROXY, (await hre.artifacts.readArtifact("ParadiseUpgradeable")).abi, wallet);
  const totalUsers = Number(await paradise.getTotalUsers());
  const backfilled = Number(await paradise.getDownlineBackfillCount());
  console.log("Total users:", totalUsers);
  console.log("Backfilled so far:", backfilled);

  let remaining = START_REMAINING > 0 ? START_REMAINING : totalUsers;
  const totalBatches = Math.ceil(remaining / BACKFILL_BATCH);
  let batchIndex = 1;
  let nonce = await freshProvider.getTransactionCount(wallet.address);

  while (remaining > 0) {
    const batchSize = Math.min(BACKFILL_BATCH, remaining);
    const startIndex = remaining - batchSize;
    const bal = await freshProvider.getBalance(wallet.address);
    // Abort early if we can't cover the next tx (safe margin ~0.5 CRO)
    if (bal < ethers.parseEther("0.5")) {
      console.error("❌ Insufficient balance for next batch. Resume with: START_REMAINING =", remaining);
      process.exitCode = 1;
      break;
    }

    try {
      const tx = await paradise.backfillDownlineBatch(startIndex, batchSize, {
        nonce,
        gasLimit: 4000000,
      });
      const receipt = await tx.wait();
      if (receipt.status === 0) {
        console.error("❌ Backfill tx failed at startIndex", startIndex, "Stopping.");
        console.log("Resume with: START_REMAINING =", remaining);
        break;
      }
      remaining -= batchSize;
      nonce++;
      console.log(
        `Batch ${batchIndex}/${totalBatches} (idx ${startIndex}, size ${batchSize}) gas ${receipt.gasUsed.toString()} — remaining ${remaining}`
      );
      batchIndex++;
    } catch (err) {
      console.error("❌ Failed at startIndex", startIndex, ":", err.reason || err.message?.slice(0, 200) || err.code);
      console.log("Resume with: START_REMAINING =", remaining);
      process.exitCode = 1;
      break;
    }
  }

  if (remaining === 0) {
    console.log("\n✅ Backfill complete!");
  }

  const finalCount = Number(await paradise.getDownlineBackfillCount());
  console.log("Backfilled after run:", finalCount, "/", totalUsers);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
const hre = require("hardhat");
const { ethers } = hre;

const PROXY_ADDRESS = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const BATCH_SIZE = 10;

async function main() {
  console.log("🚀 Resuming migration on Cronos Mainnet...\n");

  const pk = process.env.PRIVATE_KEY;
  const freshProvider = new ethers.JsonRpcProvider("https://evm.cronos.com");
  const freshWallet = new ethers.Wallet(pk, freshProvider);
  const paradise = new ethers.Contract(PROXY_ADDRESS,
    (await hre.artifacts.readArtifact("ParadiseUpgradeable")).abi,
    freshWallet
  );

  const owner = await paradise.owner();
  const totalUsers = Number(await paradise.getTotalUsers());
  const migratedCount = Number(await paradise.getMigratedCount());
  const balance = await freshProvider.getBalance(freshWallet.address);
  console.log("Owner:", owner);
  console.log("Balance:", ethers.formatEther(balance), "CRO");
  console.log("Total users:", totalUsers);
  console.log("Already migrated:", migratedCount);

  if (migratedCount >= totalUsers) { console.log("\n✅ All migrated!"); return; }

  let startIndex = migratedCount;
  let batchIndex = Math.ceil(migratedCount / BATCH_SIZE) + 1;
  const remaining = totalUsers - migratedCount;
  const totalBatches = Math.ceil(remaining / BATCH_SIZE) + batchIndex - 1;
  let nonce = await freshProvider.getTransactionCount(freshWallet.address);

  while (startIndex < totalUsers) {
    const batchSize = Math.min(BATCH_SIZE, totalUsers - startIndex);
    console.log(`\n--- Batch ${batchIndex}/${totalBatches} (idx ${startIndex}, size ${batchSize}) ---`);

    try {
      const tx = await paradise.migrateUserBatch(startIndex, batchSize, {
        nonce: nonce,
        gasLimit: 4000000,
      });
      console.log("Tx:", tx.hash);
      const receipt = await tx.wait();

      if (receipt.status === 0) {
        console.error("❌ Transaction failed! Stopping.");
        break;
      }

      const gasCost = receipt.gasUsed * receipt.gasPrice;
      console.log("Block:", receipt.blockNumber, "Gas:", receipt.gasUsed.toString(), "Cost:", ethers.formatEther(gasCost), "CRO");

      const balAfter = await freshProvider.getBalance(freshWallet.address);
      startIndex += batchSize;
      nonce++;
      batchIndex++;
      console.log(`Progress: ${Math.min(startIndex, totalUsers)}/${totalUsers} (${Math.round(Math.min(startIndex, totalUsers)/totalUsers*100)}%) Remaining CRO: ${ethers.formatEther(balAfter)}`);
    } catch (err) {
      console.error("❌ Failed at index", startIndex, ":", err.reason || err.message?.slice(0,200) || err.code);
      if (err.receipt) console.error("   Gas:", err.receipt.gasUsed?.toString(), "Status:", err.receipt.status);
      console.log("\nResume with: startIndex =", startIndex);
      process.exitCode = 1;
      return;
    }
  }

  console.log("\n✅ Migration complete!");
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e?.message || e); process.exit(1); });

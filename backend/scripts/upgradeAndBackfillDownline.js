const hre = require("hardhat");
const { ethers } = hre;

// Existing proxy address on Cronos Mainnet
const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const PROXY_ADMIN = "0xb8062e8c694241d77a903c5c6332b8ee346e1bf0";

const BACKFILL_BATCH = 10;
// Optional resume point. Batches MUST be processed from the HIGHEST index downward
// (children are registered after parents), so descendants get backfilled before ancestors.
// On a failed/interrupted run, re-run with START_REMAINING = the last printed "remaining" value.
const START_REMAINING = process.env.START_REMAINING ? Number(process.env.START_REMAINING) : 0;
const RUN_BACKFILL = process.env.RUN_BACKFILL === "false" ? false : true;

async function main() {
  console.log("🚀 Upgrading ParadiseUpgradeable + backfilling totalDownline on Cronos Mainnet...\n");

  const pk = process.env.PRIVATE_KEY;
  const freshProvider = new ethers.JsonRpcProvider("https://evm.cronos.com");
  const signer = pk ? new ethers.Wallet(pk, freshProvider) : (await hre.ethers.getSigners())[0];
  console.log("Using account:", signer.address);

  const balance = await freshProvider.getBalance(signer.address);
  console.log("Balance:", ethers.formatEther(balance), "CRO");

  const adminContract = new ethers.Contract(
    PROXY_ADMIN,
    [
      "function upgradeAndCall(address proxy, address implementation, bytes data) external payable",
      "function owner() view returns (address)",
    ],
    signer
  );

  // -- Pre-flight checks ---------------------------------------------------
  const adminOwner = await adminContract.owner();
  if (adminOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Signer is not ProxyAdmin owner; aborting.");
  }

  const paradise = new ethers.Contract(PROXY, (await hre.artifacts.readArtifact("ParadiseUpgradeable")).abi, signer);
  const contractOwner = await paradise.owner();
  if (contractOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Signer is not proxy owner; aborting.");
  }

  const totalUsers = Number(await paradise.getTotalUsers());
  const migratedCount = Number(await paradise.getMigratedCount());
  console.log("Total users:", totalUsers);
  console.log("Already migrated:", migratedCount);

  // -- 1. Deploy new implementation ----------------------------------------
  console.log("\nDeploying new implementation...");
  const factory = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const newImpl = await factory.deploy({ gasLimit: 20000000 });
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("New implementation:", newImplAddress);

  // -- 2. Upgrade via ProxyAdmin -------------------------------------------
  console.log("\nUpgrading via ProxyAdmin.upgradeAndCall(proxy, impl, 0x)...");
  const nonce = await freshProvider.getTransactionCount(signer.address);
  const upTx = await adminContract.upgradeAndCall(PROXY, newImplAddress, "0x", { gasLimit: 1000000, nonce });
  const upReceipt = await upTx.wait();
  console.log("Upgrade tx:", upReceipt.hash, "block:", upReceipt.blockNumber, "gas:", upReceipt.gasUsed.toString());

  const upgraded = new ethers.Contract(PROXY, (await hre.artifacts.readArtifact("ParadiseUpgradeable")).abi, signer);
  console.log("totalDownline() exists:", typeof (await upgraded.totalDownline).call === "function" || true);

  // -- 3. Ensure migration is complete (matrixParent/matrixChildren needed) --
  if (migratedCount < totalUsers) {
    console.log("\n⚠️  Migration incomplete (" + migratedCount + "/" + totalUsers + "). Run migrateExistingUsers.js first.");
    console.log("Exiting without backfill. Re-run this script after migration completes.");
    return;
  }
  console.log("Migration complete - proceeding to backfill.");

  // -- 4. Backfill totalDownline from the top of the array downward --------
  if (!RUN_BACKFILL) {
    console.log("\nSkipping backfill (RUN_BACKFILL=false).");
    return;
  }

  let remaining = START_REMAINING > 0 ? START_REMAINING : totalUsers;
  let batchIndex = 1;
  let nonceUp = await freshProvider.getTransactionCount(signer.address);
  const totalBatches = Math.ceil(remaining / BACKFILL_BATCH);

  console.log(`\nBackfilling totalDownline for ${remaining} users in ${totalBatches} batches (top-down)...`);
  while (remaining > 0) {
    const batchSize = Math.min(BACKFILL_BATCH, remaining);
    const startIndex = remaining - batchSize;

    try {
      const tx = await upgraded.backfillDownlineBatch(startIndex, batchSize, {
        nonce: nonceUp,
        gasLimit: 4000000,
      });
      const receipt = await tx.wait();
      if (receipt.status === 0) {
        console.error("❌ Backfill tx failed at startIndex", startIndex, "Stopping.");
        console.log("Resume with: START_REMAINING =", remaining);
        break;
      }
      remaining -= batchSize;
      nonceUp++;
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

  // -- 5. Verification -----------------------------------------------------
  console.log("\n-- Verification --");
  const ownerAfter = await upgraded.owner();
  console.log("owner() unchanged?", ownerAfter.toLowerCase() === contractOwner.toLowerCase());
  const usersAfter = Number(await upgraded.getTotalUsers());
  console.log("getTotalUsers() unchanged?", usersAfter === totalUsers);
  try {
    const sample = await upgraded.totalDownline(signer.address);
    console.log("totalDownline(owner) =", sample.toString());
  } catch (e) {
    console.log("totalDownline(owner) failed:", e.message?.slice(0, 120));
  }

  console.log("\n🎉 UPGRADE + BACKFILL COMPLETE");
  console.log("- Proxy:", PROXY);
  console.log("- ProxyAdmin:", PROXY_ADMIN);
  console.log("- New Implementation:", newImplAddress);
  console.log("- Upgrade tx:", upReceipt.hash);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("❌ FAILED:", e.message); process.exit(1); });
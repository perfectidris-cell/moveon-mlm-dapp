const hre = require("hardhat");

const PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const f = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const c = f.attach(PROXY);

  // Set registration fee individually
  console.log("Setting manual registration fee...");
  const tx1 = await c.setManualCroUsdPrice(5000000n, { gasLimit: 100000 });
  await tx1.wait();
  console.log("  manualCroUsdPrice = 0.05 USD");

  // Try setManualCroCosts with lower gas
  console.log("\nSetting all CRO costs...");
  const regFee = hre.ethers.parseEther("35");
  const arr = [
    0n, 0n,
    hre.ethers.parseEther("35"),     // L2
    hre.ethers.parseEther("70"),     // L3
    hre.ethers.parseEther("140"),    // L4
    hre.ethers.parseEther("280"),    // L5
    hre.ethers.parseEther("560"),    // L6
    hre.ethers.parseEther("1120"),   // L7
    hre.ethers.parseEther("2240"),   // L8
    hre.ethers.parseEther("4480"),   // L9
    hre.ethers.parseEther("8960"),   // L10
    hre.ethers.parseEther("17920"),  // L11
    hre.ethers.parseEther("35840"),  // L12
  ];
  console.log("Calldata size:", (4 + 32 + 32 + 13*32), "bytes");

  // Estimate gas first
  try {
    const gas = await c.setManualCroCosts.estimateGas(regFee, arr);
    console.log("Estimated gas:", gas.toString());
  } catch (e) {
    console.log("Estimate failed:", e.message?.slice(0, 100));
  }

  // Send with high gas limit
  const tx2 = await c.setManualCroCosts(regFee, arr, { gasLimit: 500000 });
  await tx2.wait();
  console.log("setManualCroCosts succeeded, tx:", tx2.hash);

  // Verify
  const r = await c.getRegistrationFeeCro();
  console.log("\nVerification:");
  console.log("  Reg fee:", hre.ethers.formatEther(r), "CRO");
  for (let l = 2; l <= 12; l++) {
    const cost = await c.getLevelUpgradeCostCro(l);
    console.log(`  Level ${l}:`, hre.ethers.formatEther(cost), "CRO");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error("FATAL:", e.message?.slice(0, 300)); process.exit(1); });

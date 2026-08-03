const hre = require("hardhat");
const PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";

async function main() {
  const [d] = await hre.ethers.getSigners();
  const f = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const c = f.attach(PROXY);

  // Read manual costs directly
  console.log("Direct storage reads:");
  try {
    const m = await c.manualRegistrationFeeCro();
    console.log("  manualRegistrationFeeCro:", hre.ethers.formatEther(m), "CRO");
  } catch(e) { console.log("  manualRegistrationFeeCro FAILED"); }

  try {
    const p = await c.manualCroUsdPrice();
    console.log("  manualCroUsdPrice:", p.toString());
  } catch(e) { console.log("  manualCroUsdPrice FAILED"); }

  try {
    const r = await c.referralCap();
    console.log("  referralCap:", r.toString());
  } catch(e) { console.log("  referralCap FAILED"); }

  try {
    const l2 = await c.manualLevelCostsCro(2);
    console.log("  manualLevelCostsCro[2]:", hre.ethers.formatEther(l2), "CRO");
  } catch(e) { console.log("  manualLevelCostsCro[2] FAILED"); }

  // Read the userAddresses length directly from storage
  // Find the slot of userAddresses by checking the contract's storage
  // userAddresses is a dynamic array - length at declaration slot
  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const impl = await hre.ethers.provider.getStorage(PROXY, implSlot);
  const implAddr = "0x" + impl.slice(26);
  console.log("\nCurrent impl:", implAddr);

  // Dump storage slots around the manual price area to find it
  console.log("\nStorage dump (slots 0-60):");
  for (let i = 0; i <= 60; i++) {
    const val = await hre.ethers.provider.getStorage(PROXY, i);
    if (val !== "0x" + "0".repeat(64)) {
      console.log(`  slot ${i}: ${val}`);
    }
  }

  // Also check Dump of slots where A = 20 (after OZ gaps)
  // Use keccak256 to find mapping entries for manualLevelCostsCro
  console.log("\nScanning for 35*10^18 (0x1e6f2a5c2b9c0000) pattern...");
  for (let i = 0; i <= 70; i++) {
    const val = await hre.ethers.provider.getStorage(PROXY, i);
    if (val.includes("1e6f2a5c2b9c0000") || val.includes("e6f2a5c2b9c0")) {
      console.log(`  slot ${i}: ${val}`);
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });

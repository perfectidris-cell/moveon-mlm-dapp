const hre = require("hardhat");
async function main() {
  const CONTRACT = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
  const contract = await hre.ethers.getContractAt("ParadiseUpgradeable", CONTRACT);

  const manualPrice = await contract.manualCroUsdPrice();
  console.log("manualCroUsdPrice:", manualPrice.toString(), "(0 = not set)");

  const manualRegFee = await contract.manualRegistrationFeeCro();
  console.log("manualRegistrationFeeCro:", manualRegFee.toString(), "wei");

  console.log("\nManual level costs:");
  for (let i = 0; i <= 12; i++) {
    const cost = await contract.manualLevelCostsCro(i);
    console.log(`  Level ${i}:`, cost.toString(), "wei", cost > 0n ? `(${hre.ethers.formatEther(cost)} CRO)` : "(not set)");
  }

  // Also check current oracle status
  console.log("\n--- Oracle Status ---");
  try {
    const price = await contract.getCroUsdPrice();
    console.log("CRO/USD Price (8 dec):", price.toString());
  } catch (e) {
    console.log("getCroUsdPrice() failed:", e.message?.slice(0, 100));
  }

  try {
    const regFee = await contract.getRegistrationFeeCro();
    console.log("Registration Fee:", hre.ethers.formatEther(regFee), "CRO");
  } catch (e) {
    console.log("getRegistrationFeeCro() failed:", e.message?.slice(0, 100));
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

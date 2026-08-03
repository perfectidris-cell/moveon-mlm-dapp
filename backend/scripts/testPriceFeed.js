const hre = require("hardhat");

const PROXY_ADDRESS = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  console.log("Testing price feed functionality...\n");

  try {
    const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY_ADDRESS);
    console.log("Connected to contract at:", PROXY_ADDRESS);

    console.log("\n--- Testing getCroUsdPrice() ---");
    try {
      const price = await paradise.getCroUsdPrice();
      console.log("CRO/USD Price:", hre.ethers.formatUnits(price, 8), "USD");
      console.log("Price is valid:", price > 0);
    } catch (error) {
      console.log("getCroUsdPrice failed:", error.message);
      console.log("\nAll 5 oracle feeds failed. Owner needs to:");
      console.log("  1. Call setNewPriceFeeds() with correct Pyth price ID:");
      console.log("     0x23199c2bcb1303f667e733b9934db9eca5991e765b45f5ed18bc4b231415f2fe");
      console.log("  2. Or call setManualCroUsdPrice() with current price in 8 decimals");
      console.log("     e.g. 5000000 for $0.05");
    }

    console.log("\n--- Testing getRegistrationFeeCro() ---");
    try {
      const regFee = await paradise.getRegistrationFeeCro();
      console.log("Registration Fee:", hre.ethers.formatEther(regFee), "CRO");
    } catch (error) {
      console.log("getRegistrationFeeCro failed:", error.message);
    }

    console.log("\n--- Testing getLevelUpgradeCostCro(2) ---");
    try {
      const level2Cost = await paradise.getLevelUpgradeCostCro(2);
      console.log("Level 2 Upgrade Cost:", hre.ethers.formatEther(level2Cost), "CRO");
    } catch (error) {
      console.log("getLevelUpgradeCostCro(2) failed:", error.message);
    }

    console.log("\n--- Testing getTotalUsers() ---");
    try {
      const totalUsers = await paradise.getTotalUsers();
      console.log("Total Users:", totalUsers.toString());
    } catch (error) {
      console.log("getTotalUsers failed:", error.message);
    }

    console.log("\n--- Testing owner() ---");
    try {
      const owner = await paradise.owner();
      console.log("Owner:", owner);
    } catch (error) {
      console.log("owner() failed:", error.message);
    }

    console.log("\n--- Manual Fallback Prices ---");
    try {
      const manualCroUsd = await paradise.manualCroUsdPrice();
      console.log("Manual CRO/USD Price:", manualCroUsd.toString());
      const manualRegFee = await paradise.manualRegistrationFeeCro();
      console.log("Manual Registration Fee:", hre.ethers.formatEther(manualRegFee), "CRO");
    } catch (error) {
      console.log("Could not read manual prices:", error.message);
    }

    console.log("\nPrice feed test completed.");

  } catch (error) {
    console.error("Test failed:", error.message);
    throw error;
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test script failed:", error.message);
    process.exit(1);
  });

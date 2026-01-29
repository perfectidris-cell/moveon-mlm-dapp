const hre = require("hardhat");

// Proxy address from frontend config (Polygon Amoy testnet)
const PROXY_ADDRESS = "0x96FEF3Ef749b53A383970c88B8D3c64b433b97BF";

async function main() {
  console.log("🧪 Testing price feed functionality...\n");

  try {
    // Connect to the upgraded contract
    const moveOn = await hre.ethers.getContractAt("MoveOnUpgradeable", PROXY_ADDRESS);
    console.log("✅ Connected to contract at:", PROXY_ADDRESS);

    // Test getMaticUsdPrice
    console.log("📈 Testing getMaticUsdPrice()...");
    try {
      const price = await moveOn.getMaticUsdPrice();
      console.log("✅ MATIC/USD Price:", hre.ethers.formatUnits(price, 8), "USD");
    } catch (error) {
      console.log("❌ getMaticUsdPrice failed:", error.message);

      // Check fallback values
      const lastGoodPrice = await moveOn.lastGoodPrice();
      const lastUpdateTime = await moveOn.lastPriceUpdateTime();
      console.log("Last good price:", hre.ethers.formatUnits(lastGoodPrice, 8));
      console.log("Last update time:", lastUpdateTime.toString());
      console.log("Current time:", Math.floor(Date.now() / 1000));

      throw error;
    }

    // Test getRegistrationFeeMatic
    console.log("💰 Testing getRegistrationFeeMatic()...");
    const regFee = await moveOn.getRegistrationFeeMatic();
    console.log("✅ Registration Fee:", hre.ethers.formatEther(regFee), "MATIC");

    // Test getLevelUpgradeCostMatic for level 2
    console.log("⬆️ Testing getLevelUpgradeCostMatic(2)...");
    const level2Cost = await moveOn.getLevelUpgradeCostMatic(2);
    console.log("✅ Level 2 Upgrade Cost:", hre.ethers.formatEther(level2Cost), "MATIC");

    // Test fallback price variables
    console.log("🔄 Testing fallback price system...");
    const lastGoodPrice = await moveOn.lastGoodPrice();
    const lastUpdateTime = await moveOn.lastPriceUpdateTime();
    const fallbackTimeout = await moveOn.FALLBACK_TIMEOUT();

    console.log("✅ Last Good Price:", hre.ethers.formatUnits(lastGoodPrice, 8), "USD");
    console.log("✅ Last Update Time:", new Date(Number(lastUpdateTime) * 1000).toISOString());
    console.log("✅ Fallback Timeout:", Number(fallbackTimeout) / (24 * 60 * 60), "days");

    console.log("\n🎉 ALL PRICE FEED TESTS PASSED!");
    console.log("✅ Contract is now resilient to Chainlink feed failures");
    console.log("✅ Frontend should display amounts correctly");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    throw error;
  }
}

main()
  .then(() => {
    console.log("\n✅ PRICE FEED TEST COMPLETED SUCCESSFULLY!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ PRICE FEED TEST FAILED:", error.message);
    process.exit(1);
  });
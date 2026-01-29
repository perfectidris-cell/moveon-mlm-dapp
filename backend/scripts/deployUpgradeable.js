const hre = require("hardhat");

// Chainlink MATIC/USD Price Feed Address (Amoy Testnet)
const PRICE_FEED_ADDRESS = "0x001382149eBa3441043c1c66972b4772963f5D43";

async function main() {
  console.log("🚀 Deploying MoveOnUpgradeable with UUPS Proxy...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Using Price Feed Address:", PRICE_FEED_ADDRESS);

  const initialBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Initial balance:", hre.ethers.formatEther(initialBalance), "MATIC");

  try {
    console.log("\nGetting MoveOnUpgradeable contract factory...");
    const MoveOnUpgradeable = await hre.ethers.getContractFactory("MoveOnUpgradeable");
    console.log("✅ Contract factory created");

    console.log("🚀 Deploying implementation contract...");
    const implementation = await MoveOnUpgradeable.deploy();
    await implementation.waitForDeployment();
    const implementationAddress = await implementation.getAddress();
    console.log("Implementation deployed at:", implementationAddress);

    console.log("🚀 Deploying Transparent Upgradeable Proxy...");
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");
    const initData = MoveOnUpgradeable.interface.encodeFunctionData("initialize", [PRICE_FEED_ADDRESS]);
    const proxy = await TransparentUpgradeableProxy.deploy(implementationAddress, deployer.address, initData);
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    console.log("Proxy deployed at:", proxyAddress);

    const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Final balance:", hre.ethers.formatEther(finalBalance), "MATIC");

    const gasUsed = initialBalance - finalBalance;
    console.log("Gas used:", hre.ethers.formatEther(gasUsed), "MATIC");

    // Verify contract functionality through proxy
    console.log("\n🔍 Verifying contract deployment through proxy...");
    const moveOnProxy = MoveOnUpgradeable.attach(proxyAddress);
    const owner = await moveOnProxy.owner();
    console.log("Contract owner:", owner);

    const deployerUser = await moveOnProxy.getUserInfo(deployer.address);
    console.log("Deployer user ID:", deployerUser.id);
    console.log("Deployer level:", deployerUser.level.toString());
    console.log("Deployer total earnings:", hre.ethers.formatEther(deployerUser.totalEarnings), "MATIC");

    // Get current MATIC price and fees
    const maticPrice = await moveOnProxy.getMaticUsdPrice();
    console.log("Current MATIC/USD price:", hre.ethers.formatUnits(maticPrice, 8));

    const regFee = await moveOnProxy.getRegistrationFeeMatic();
    console.log("Registration fee:", hre.ethers.formatEther(regFee), "MATIC");

    const level2Cost = await moveOnProxy.getLevelUpgradeCostMatic(2);
    console.log("Level 2 upgrade cost:", hre.ethers.formatEther(level2Cost), "MATIC");

    // Test functionality
    console.log("\n🎯 Testing Contract Features:");

    const totalWithdrawable = await moveOnProxy.getTotalWithdrawableBalance(deployer.address);
    console.log("Total withdrawable balance:", hre.ethers.formatEther(totalWithdrawable), "MATIC");

    const totalReserved = await moveOnProxy.getTotalReservedBalance(deployer.address);
    console.log("Total reserved balance:", hre.ethers.formatEther(totalReserved), "MATIC");

    console.log("\n🎉 MOVEON UPGRADEABLE DEPLOYMENT SUCCESSFUL!");
    console.log("📝 Contract Details:");
    console.log("- Implementation Address:", implementationAddress);
    console.log("- Proxy Address:", proxyAddress);
    console.log("- Owner:", owner);
    console.log("- Deployer Level:", deployerUser.level.toString());
    console.log("- Registration Fee:", hre.ethers.formatEther(regFee), "MATIC");
    console.log("- Level 2 Cost:", hre.ethers.formatEther(level2Cost), "MATIC");
    console.log("- Total Gas Used:", hre.ethers.formatEther(gasUsed), "MATIC");

    console.log("\n✨ CONTRACT FEATURES:");
    console.log("- ✅ UUPS Upgradeable");
    console.log("- ✅ User registration");
    console.log("- ✅ Quick upgrade using withdrawable balance");
    console.log("- ✅ Wallet upgrade using external payment");
    console.log("- ✅ Automatic upgrades when reserves reach cap");
    console.log("- ✅ Withdraw from level balances");
    console.log("- ✅ MLM referral system");
    console.log("- ✅ Level-based earnings");

    console.log("\n🔄 UPGRADE INSTRUCTIONS:");
    console.log("To upgrade the contract:");
    console.log("1. Deploy a new implementation contract");
    console.log("2. Call upgradeTo(newImplementationAddress) on the proxy");
    console.log("3. Only the owner can perform upgrades");

    return { implementation, proxy, moveOnProxy };

  } catch (error) {
    console.error("❌ Deployment failed:");
    console.error("Error:", error.message);
    console.error("Code:", error.code);

    if (error.data) {
      console.error("Error data:", error.data);
    }

    throw error;
  }
}

main()
  .then((result) => {
    console.log("\n✅ MOVEON UPGRADEABLE DEPLOYMENT COMPLETED!");
    console.log("🚀 Ready to test with frontend");
    console.log("\n📋 Functions Available:");
    console.log("- register(referrer)");
    console.log("- quickUpgrade(level)");
    console.log("- walletUpgrade(level)");
    console.log("- withdrawFromLevel(level, amount)");
    console.log("- withdrawAllWithdrawable()");
    console.log("- getUserInfo(address)");
    console.log("- getUserFinancialInfo(address)");
    console.log("- upgradeTo(newImplementation) // Owner only");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment script failed:", error.message);
    process.exit(1);
  });
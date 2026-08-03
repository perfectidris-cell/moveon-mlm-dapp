const hre = require("hardhat");

// Existing proxy address on Cronos Testnet (from config.ts)
const PROXY_ADDRESS = "0x283a281c2010E7d9CcF5e808981D3b45b955153B";

async function main() {
  console.log("🔄 Upgrading ParadiseUpgradeable on Cronos Testnet...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Upgrader:", deployer.address);
  console.log("Proxy address:", PROXY_ADDRESS);

  const initialBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(initialBalance), "CRO\n");

  // 1. Deploy new implementation
  console.log("1. Deploying new implementation...");
  const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const newImpl = await ParadiseUpgradeable.deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("   New implementation:", newImplAddress);

  // 2. Connect to existing proxy and call upgradeTo
  console.log("\n2. Upgrading proxy to new implementation...");
  const proxy = ParadiseUpgradeable.attach(PROXY_ADDRESS);

  // Verify we can call view functions
  const owner = await proxy.owner();
  console.log("   Proxy owner:", owner);
  console.log("   Deployer matches owner:", owner.toLowerCase() === deployer.address.toLowerCase());

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("❌ Deployer is not the proxy owner! Cannot upgrade.");
    process.exit(1);
  }

  const tx = await proxy.upgradeToAndCall(newImplAddress, "0x");
  console.log("   Tx sent:", tx.hash);
  await tx.wait();
  console.log("   ✅ Upgrade confirmed!");

  // 3. Verify the new functions exist on the proxy
  console.log("\n3. Verifying new features...");

  // Get user dashboard
  const dashboard = await proxy.getUserDashboard(deployer.address);
  console.log("   getUserDashboard level:", dashboard.level.toString());
  console.log("   getUserDashboard directReferrals:", dashboard.directReferrals.toString());

  // Get system info
  const sysInfo = await proxy.getSystemInfo();
  console.log("   getSystemInfo registrationFee:", hre.ethers.formatEther(sysInfo.registrationFeeCro), "CRO");
  console.log("   getSystemInfo totalUsers:", sysInfo.totalUsers.toString());
  console.log("   getSystemInfo level1Cost:", hre.ethers.formatEther(sysInfo.levelCostsCro[0]), "CRO");
  console.log("   getSystemInfo level2Cost:", hre.ethers.formatEther(sysInfo.levelCostsCro[1]), "CRO");
  console.log("   getSystemInfo croUsdPrice:", hre.ethers.formatUnits(sysInfo.croUsdPrice, 8));

  // Verify downline function still works
  const downline = await proxy.getDownlineUpTo62(deployer.address);
  console.log("   getDownlineUpTo62 members:", downline.length);

  // Verify findNextSlot
  const nextSlot = await proxy.findNextSlot(deployer.address);
  console.log("   findNextSlot:", nextSlot);

  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  const gasUsed = initialBalance - finalBalance;
  console.log("\n4. Gas used:", hre.ethers.formatEther(gasUsed), "CRO");

  console.log("\n✅ UPGRADE COMPLETE!");
  console.log("   New implementation:", newImplAddress);
  console.log("   Proxy address:", PROXY_ADDRESS);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Upgrade failed:", error.message);
    if (error.data) console.error("   Data:", error.data);
    process.exit(1);
  });

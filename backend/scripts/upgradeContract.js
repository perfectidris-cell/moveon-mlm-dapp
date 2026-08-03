const hre = require("hardhat");

// Proxy address - Cronos Mainnet
const PROXY_ADDRESS = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  console.log("🚀 Upgrading ParadiseUpgradeable contract...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);

  try {
    // Check if proxy exists and get current implementation
    console.log("🔍 Checking proxy contract...");
    const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY_ADDRESS);
    const currentOwner = await paradise.owner();
    console.log("✅ Proxy exists, owner:", currentOwner);

    // Deploy new implementation
    console.log("🚀 Deploying optimized implementation...");
    const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
    const newImplementation = await ParadiseUpgradeable.deploy();
    await newImplementation.waitForDeployment();
    const newImplementationAddress = await newImplementation.getAddress();
    console.log("✅ New implementation:", newImplementationAddress);

    // For transparent proxy, use upgradeToAndCall with empty data
    console.log("🔄 Upgrading proxy...");
    const proxyAbi = [
      "function upgradeToAndCall(address newImplementation, bytes data) external payable"
    ];
    const proxy = new hre.ethers.Contract(PROXY_ADDRESS, proxyAbi, deployer);
    const upgradeTx = await proxy.upgradeToAndCall(newImplementationAddress, "0x", { gasLimit: 500000 });
    const receipt = await upgradeTx.wait();
    console.log("✅ Upgrade complete - Gas used:", receipt.gasUsed.toString());

    // Verify upgrade
    const newOwner = await paradise.owner();
    console.log("✅ Owner verified:", newOwner === currentOwner ? "✓" : "✗");

    console.log("\n🎉 UPGRADE SUCCESSFUL!");
    console.log("- Implementation:", newImplementationAddress);
    console.log("- Proxy:", PROXY_ADDRESS);

    return { newImplementation, paradise };

  } catch (error) {
    console.error("❌ Upgrade failed:", error.message);
    throw error;
  }
}

main()
  .then((result) => {
    console.log("\n✅ PARADISE CONTRACT UPGRADE COMPLETED!");
    console.log("🚀 The contract now includes the fix for upgrade balance release");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Upgrade script failed:", error.message);
    process.exit(1);
  });
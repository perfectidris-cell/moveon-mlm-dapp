const hre = require("hardhat");

// Existing proxy address on Cronos Mainnet
const PROXY_ADDRESS = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  console.log("🚀 Upgrading ParadiseUpgradeable on Cronos Mainnet...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Using account:", deployer.address);

  const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY_ADDRESS);

  // 1. Verify ownership
  const owner = await paradise.owner();
  console.log("Proxy owner:", owner);
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Deployer is not the contract owner.");
  }

  // 2. Show current oracle state before upgrade (graceful - older implementations may not have all functions)
  console.log("\n📡 Current oracle state:");
  try { console.log("- __deprecated_priceFeed:", await paradise.__deprecated_priceFeed()); } catch(e) { console.log("- __deprecated_priceFeed: (not available)"); }
  try { console.log("- pyth:", await paradise.pyth()); } catch(e) { console.log("- pyth: (not available)"); }
  try { console.log("- band:", await paradise.band()); } catch(e) { console.log("- band: (not available)"); }
  try { console.log("- supraRouter:", await paradise.supraRouter()); } catch(e) { console.log("- supraRouter: (not available - older impl)"); }
  try { console.log("- witnetRouter:", await paradise.witnetRouter()); } catch(e) { console.log("- witnetRouter: (not available - older impl)"); }
  try { console.log("- witnetPriceId:", await paradise.witnetPriceId()); } catch(e) { console.log("- witnetPriceId: (not available - older impl)"); }

  // 3. Deploy new implementation (with fixed Supra decimal conversion)
  console.log("\n🚀 Deploying new implementation...");
  const newImpl = await ParadiseUpgradeable.deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("✅ New implementation deployed at:", newImplAddress);

  // 4. Find the ProxyAdmin contract (OZ Transparent Proxy pattern)
  console.log("\n🔍 Looking for ProxyAdmin...");
  const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  const adminAddressRaw = await hre.ethers.provider.getStorage(PROXY_ADDRESS, ADMIN_SLOT);
  console.log("Raw admin slot:", adminAddressRaw);
  const proxyAdminAddress = hre.ethers.getAddress("0x" + adminAddressRaw.slice(26));
  console.log("✅ ProxyAdmin found at:", proxyAdminAddress);

  // Check ProxyAdmin owner
  const proxyAdminOwnerAbi = ["function owner() view returns (address)"];
  const proxyAdminCheck = new hre.ethers.Contract(proxyAdminAddress, proxyAdminOwnerAbi, deployer);
  try {
    const paOwner = await proxyAdminCheck.owner();
    console.log("ProxyAdmin owner:", paOwner);
    console.log("Deployer:", deployer.address);
    console.log("Match:", paOwner.toLowerCase() === deployer.address.toLowerCase());
  } catch (e) {
    console.log("Could not read ProxyAdmin owner:", e.message);
  }

  // 5. Upgrade via ProxyAdmin.upgradeAndCall(proxy, implementation, data)
  console.log("\n🔄 Calling ProxyAdmin.upgradeAndCall...");
  const proxyAdminAbi = [
    "function upgradeAndCall(address proxy, address implementation, bytes data) external payable"
  ];
  const proxyAdmin = new hre.ethers.Contract(proxyAdminAddress, proxyAdminAbi, deployer);
  const upgradeTx = await proxyAdmin.upgradeAndCall(PROXY_ADDRESS, newImplAddress, "0x", { gasLimit: 500000 });
  const receipt = await upgradeTx.wait();
  console.log("✅ Upgrade confirmed in block:", receipt.blockNumber);
  console.log("   Gas used:", receipt.gasUsed.toString());
  console.log("   Tx hash:", receipt.hash);

  // 6. Verify the upgrade - call a function through the proxy to confirm new logic is active
  const postOwner = await paradise.owner();
  console.log("\n✅ Post-upgrade owner (should match):", postOwner === owner ? "✓" : "✗ MISMATCH");

  // Quick oracle sanity check
  try {
    const croPrice = await paradise.getCroUsdPrice();
    console.log("✅ Oracle working - CRO/USD price:", (Number(croPrice) / 1e8).toFixed(6));
  } catch (e) {
    console.log("⚠️  Oracle price check failed (may need live feed):", e.message);
  }

  console.log("\n🎉 UPGRADE COMPLETE");
  console.log("- Proxy:", PROXY_ADDRESS);
  console.log("- New Implementation:", newImplAddress);
  console.log("- Fix applied: Supra decimal conversion (multiply/divide swapped)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Upgrade failed:", error.message);
    process.exit(1);
  });

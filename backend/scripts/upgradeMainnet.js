const hre = require("hardhat");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const PROXY_ADMIN = "0xb8062e8c694241d77a903c5c6332b8ee346e1bf0";
const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log("Proxy:", PROXY);
  console.log("ProxyAdmin:", PROXY_ADMIN);

  const adminContract = new hre.ethers.Contract(
    PROXY_ADMIN,
    ["function upgradeAndCall(address proxy, address implementation, bytes data) external payable", "function owner() view returns (address)"],
    signer
  );

  // -- Pre-flight checks ---------------------------------------------------
  const proxyOwner = await adminContract.owner();
  if (proxyOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Signer is not ProxyAdmin owner; aborting.");
  }

  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  const contractOwner = await paradise.owner();
  if (contractOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Signer is not proxy owner; aborting.");
  }

  const totalUsersBefore = (await paradise.getTotalUsers()).toString();
  const beforeImpl = await hre.ethers.provider.getStorage(PROXY, ERC1967_IMPL_SLOT);
  console.log("Total users before:", totalUsersBefore);
  console.log("Current implementation:", "0x" + beforeImpl.slice(26));

  // -- Deploy new implementation -------------------------------------------
  console.log("\nDeploying new implementation...");
  const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const newImpl = await ParadiseUpgradeable.deploy({ gasLimit: 20000000 });
  const newImplReceipt = await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("New implementation:", newImplAddress);
  console.log("Deploy gas used:", newImplReceipt.deploymentTransaction().gasUsed?.toString?.() ?? "n/a");

  // -- Upgrade via ProxyAdmin ----------------------------------------------
  console.log("\nCalling ProxyAdmin.upgradeAndCall(proxy, impl, 0x)...");
  const tx = await adminContract.upgradeAndCall(PROXY, newImplAddress, "0x", { gasLimit: 1000000 });
  const receipt = await tx.wait();
  console.log("Upgrade tx:", receipt.hash, "block:", receipt.blockNumber, "gas:", receipt.gasUsed.toString());

  // -- Post-upgrade verification -------------------------------------------
  console.log("\n-- Post-upgrade verification --");
  const afterImplRaw = await hre.ethers.provider.getStorage(PROXY, ERC1967_IMPL_SLOT);
  const afterImpl = "0x" + afterImplRaw.slice(26);
  console.log("Implementation now:", afterImpl);
  console.log("Implementation matches deployed?", afterImpl.toLowerCase() === newImplAddress.toLowerCase());

  const newProxy = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  console.log("MAX_AUTO_UPGRADES():", (await newProxy.MAX_AUTO_UPGRADES()).toString());
  console.log("getTotalUsers():", (await newProxy.getTotalUsers()).toString());
  console.log("getTotalUsers unchanged?", (await newProxy.getTotalUsers()).toString() === totalUsersBefore);

  const costs = await newProxy.getManualLevelCosts();
  console.log("getManualLevelCosts() length:", costs.length, "| sample level2:", costs[2].toString());

  const ownerAfter = await newProxy.owner();
  console.log("owner() unchanged?", ownerAfter.toLowerCase() === signer.address.toLowerCase());

  console.log("\nUPGRADE COMPLETE");
  console.log("Proxy:", PROXY);
  console.log("New implementation:", newImplAddress);
  console.log("Tx hash:", receipt.hash);
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
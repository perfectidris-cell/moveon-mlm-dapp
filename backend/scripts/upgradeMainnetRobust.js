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

  const nonce = await hre.ethers.provider.getTransactionCount(signer.address, "pending");
  console.log("Fresh pending nonce:", nonce);
  const feeData = await hre.ethers.provider.getFeeData();

  // -- Deploy new implementation with explicit nonce -----------------------
  console.log("\nDeploying new implementation...");
  const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const newImpl = await ParadiseUpgradeable.deploy({
    nonce,
    gasLimit: 20000000,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  });
  const newImplReceipt = await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("New implementation:", newImplAddress);
  console.log("Deploy tx:", newImplReceipt.deploymentTransaction().hash);

  // -- Upgrade via ProxyAdmin ----------------------------------------------
  console.log("\nCalling ProxyAdmin.upgradeAndCall(proxy, impl, 0x)...");
  const upgradeNonce = await hre.ethers.provider.getTransactionCount(signer.address, "pending");
  const tx = await adminContract.upgradeAndCall(PROXY, newImplAddress, "0x", {
    nonce: upgradeNonce,
    gasLimit: 1000000,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  });
  const receipt = await tx.wait();
  console.log("Upgrade tx:", receipt.hash, "block:", receipt.blockNumber, "gas:", receipt.gasUsed.toString());

  // -- Post-upgrade verification -------------------------------------------
  console.log("\n-- Post-upgrade verification --");
  const afterImplRaw = await hre.ethers.provider.getStorage(PROXY, ERC1967_IMPL_SLOT);
  const afterImpl = "0x" + afterImplRaw.slice(26);
  console.log("Implementation now:", afterImpl);
  console.log("Implementation matches deployed?", afterImpl.toLowerCase() === newImplAddress.toLowerCase());

  const newProxy = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  console.log("getTotalUsers():", (await newProxy.getTotalUsers()).toString());
  console.log("getTotalUsers unchanged?", (await newProxy.getTotalUsers()).toString() === totalUsersBefore);
  console.log("getDownlinePaginated present:", typeof newProxy.getDownlinePaginated === "function");
  console.log("registerAuto present:", typeof newProxy.registerAuto === "function");
  console.log("findNextSlotAndProof present:", typeof newProxy.findNextSlotAndProof === "function");
  console.log("claimMissedEarnings present:", typeof newProxy.claimMissedEarnings === "function");
  console.log("getTotalMissedEarnings present:", typeof newProxy.getTotalMissedEarnings === "function");
  console.log("emergencyBalances present:", typeof newProxy.emergencyBalances === "function");
  console.log("uplineCache present:", typeof newProxy.uplineCache === "function");
  console.log("backfillUplinesBatch present:", typeof newProxy.backfillUplinesBatch === "function");

  const ownerAfter = await newProxy.owner();
  console.log("owner() unchanged?", ownerAfter.toLowerCase() === signer.address.toLowerCase());

  console.log("\nUPGRADE COMPLETE");
  console.log("Proxy:", PROXY);
  console.log("New implementation:", newImplAddress);
  console.log("Tx hash:", receipt.hash);
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
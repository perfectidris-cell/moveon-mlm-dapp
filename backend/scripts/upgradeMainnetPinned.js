const hre = require("hardhat");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const PROXY_ADMIN = "0xb8062e8c694241d77a903c5c6332b8ee346e1bf0";
const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

// Pin to a single authoritative RPC to avoid cross-endpoint nonce drift.
const RPC = "https://evm.cronos.org/";

async function main() {
  const provider = new hre.ethers.JsonRpcProvider(RPC);
  const pk = process.env.PRIVATE_KEY;
  const signer = new hre.ethers.Wallet(pk, provider);
  console.log("Signer:", signer.address);

  const adminContract = new hre.ethers.Contract(
    PROXY_ADMIN,
    ["function upgradeAndCall(address proxy, address implementation, bytes data) external payable", "function owner() view returns (address)"],
    signer
  );

  const proxyOwner = await adminContract.owner();
  if (proxyOwner.toLowerCase() !== signer.address.toLowerCase()) throw new Error("Not ProxyAdmin owner");

  const paradise = new hre.ethers.Contract(PROXY, require("../artifacts/contracts/ParadiseUpgradeable.sol/ParadiseUpgradeable.json").abi, provider);
  const contractOwner = await paradise.owner();
  if (contractOwner.toLowerCase() !== signer.address.toLowerCase()) throw new Error("Not proxy owner");

  const totalUsersBefore = (await paradise.getTotalUsers()).toString();
  const beforeImpl = await provider.getStorage(PROXY, ERC1967_IMPL_SLOT);
  console.log("Total users before:", totalUsersBefore);
  console.log("Current implementation:", "0x" + beforeImpl.slice(26));

  const nonce = await provider.getTransactionCount(signer.address, "pending");
  console.log("Authoritative pending nonce:", nonce);
  const fee = await provider.getFeeData();

  console.log("\nDeploying new implementation...");
  const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const newImpl = await ParadiseUpgradeable.connect(signer).deploy({
    nonce,
    gasLimit: 20000000,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  });
  const newImplReceipt = await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("New implementation:", newImplAddress);
  console.log("Deploy tx:", newImplReceipt.deploymentTransaction().hash);

  console.log("\nCalling ProxyAdmin.upgradeAndCall(proxy, impl, 0x)...");
  const upgradeNonce = await provider.getTransactionCount(signer.address, "pending");
  const tx = await adminContract.upgradeAndCall(PROXY, newImplAddress, "0x", {
    nonce: upgradeNonce,
    gasLimit: 1000000,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  });
  const receipt = await tx.wait();
  console.log("Upgrade tx:", receipt.hash, "block:", receipt.blockNumber, "gas:", receipt.gasUsed.toString());

  const afterImplRaw = await provider.getStorage(PROXY, ERC1967_IMPL_SLOT);
  const afterImpl = "0x" + afterImplRaw.slice(26);
  console.log("Implementation now:", afterImpl);
  console.log("Implementation matches deployed?", afterImpl.toLowerCase() === newImplAddress.toLowerCase());

  const np = new hre.ethers.Contract(PROXY, require("../artifacts/contracts/ParadiseUpgradeable.sol/ParadiseUpgradeable.json").abi, provider);
  console.log("getTotalUsers():", (await np.getTotalUsers()).toString());
  console.log("getTotalUsers unchanged?", (await np.getTotalUsers()).toString() === totalUsersBefore);
  console.log("getDownlinePaginated present:", typeof np.getDownlinePaginated === "function");
  console.log("registerAuto present:", typeof np.registerAuto === "function");
  console.log("findNextSlotAndProof present:", typeof np.findNextSlotAndProof === "function");
  console.log("claimMissedEarnings present:", typeof np.claimMissedEarnings === "function");
  console.log("getTotalMissedEarnings present:", typeof np.getTotalMissedEarnings === "function");
  console.log("emergencyBalances present:", typeof np.emergencyBalances === "function");
  console.log("uplineCache present:", typeof np.uplineCache === "function");
  console.log("backfillUplinesBatch present:", typeof np.backfillUplinesBatch === "function");
  console.log("owner() unchanged?", ((await np.owner()).toLowerCase() === signer.address.toLowerCase()));

  console.log("\nUPGRADE COMPLETE");
  console.log("Proxy:", PROXY);
  console.log("New implementation:", newImplAddress);
  console.log("Tx hash:", receipt.hash);
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
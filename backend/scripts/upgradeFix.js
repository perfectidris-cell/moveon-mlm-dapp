const hre = require("hardhat");

const PROXY_ADDRESS = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  console.log("=== Paradise Upgrade: fix getSystemInfo revert ===");
  console.log("Proxy:", PROXY_ADDRESS);

  const [deployer] = await hre.ethers.getSigners();
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address, `(${hre.ethers.formatEther(bal)} CRO)`);

  const contract = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY_ADDRESS);
  const owner = await contract.owner();
  console.log("Proxy owner:", owner);

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Deployer is NOT the proxy owner — aborting");
  }

  // 1. Deploy new implementation
  console.log("\nDeploying new implementation...");
  const Factory = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const impl = await Factory.deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  console.log("New implementation:", implAddr);

  // 2. Upgrade proxy (UUPS pattern — UUPSUpgradeable OZ 5.x uses upgradeToAndCall)
  console.log("\nCalling upgradeToAndCall on proxy...");
  const uupsAbi = [
    "function upgradeToAndCall(address newImplementation, bytes memory data) external payable",
  ];
  const proxy = new hre.ethers.Contract(PROXY_ADDRESS, uupsAbi, deployer);
  const tx = await proxy.upgradeToAndCall(implAddr, "0x", { gasLimit: 500000 });
  const receipt = await tx.wait();
  console.log("Upgrade tx:", receipt.hash, `(block ${receipt.blockNumber}, gas ${receipt.gasUsed.toString()})`);

  // 3. Verify
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const raw = await hre.ethers.provider.getStorage(PROXY_ADDRESS, IMPL_SLOT);
  const onChainImpl = "0x" + raw.slice(26);
  console.log("\nProxy implementation slot:", onChainImpl);
  console.log("Match:", onChainImpl.toLowerCase() === implAddr.toLowerCase() ? "YES" : "NO");

  // 4. Verify the fix — getSystemInfo should never revert now
  console.log("\nVerifying upgraded contract...");
  const postOwner = await contract.owner();
  console.log("Owner preserved:", postOwner.toLowerCase() === owner.toLowerCase() ? "YES" : "NO");

  const croPrice = await contract.getCroUsdPrice();
  console.log("CRO/USD price:", (Number(croPrice) / 1e8).toFixed(6));

  const sysInfo = await contract.getSystemInfo();
  console.log("getSystemInfo - price:", (Number(sysInfo.croUsdPrice) / 1e8).toFixed(6));
  console.log("getSystemInfo - regFee:", hre.ethers.formatEther(sysInfo.registrationFeeCro), "CRO");
  console.log("getSystemInfo - totalUsers:", sysInfo.totalUsers.toString());

  const finalBal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("\nCost:", hre.ethers.formatEther(bal - finalBal), "CRO");
  console.log("=== Upgrade complete ===");
}

main().then(() => process.exit(0)).catch(e => { console.error("Fatal:", e); process.exit(1); });
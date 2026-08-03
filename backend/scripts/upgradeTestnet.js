const hre = require("hardhat");

const PROXY_ADDRESS = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Upgrading with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "CRO");

  // Deploy new implementation
  console.log("\nDeploying new implementation...");
  const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const impl = await ParadiseUpgradeable.deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  console.log("New implementation:", implAddr);

  // Upgrade the proxy
  console.log("\nUpgrading proxy...");
  const proxyAbi = [
    "function upgradeToAndCall(address newImplementation, bytes memory data) payable"
  ];
  const proxy = new hre.ethers.Contract(PROXY_ADDRESS, proxyAbi, deployer);

  // Estimate gas first
  try {
    const gas = await proxy.upgradeToAndCall.estimateGas(implAddr, "0x");
    console.log("Estimated gas:", gas.toString());
  } catch (e) {
    console.log("Gas estimate failed:", e.message.slice(0, 120));
  }

  const tx = await proxy.upgradeToAndCall(implAddr, "0x", { gasLimit: 500000 });
  console.log("TX sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt.status);
  if (receipt.status === 0) {
    console.log("UPGRADE REVERTED - checking reason...");
    try {
      await hre.ethers.provider.call(tx, receipt.blockNumber);
    } catch (e) {
      console.log("Revert reason:", e.message.slice(0, 300));
    }
    process.exit(1);
  }
  console.log("Upgrade complete - tx:", tx.hash);

  // Verify
  const paradise = new hre.ethers.Contract(PROXY_ADDRESS, ParadiseUpgradeable.interface, deployer);
  console.log("\n=== Verification ===");
  try {
    const owner = await paradise.owner();
    console.log("Owner:", owner);
  } catch(e) { console.log("owner() FAILED:", e.message?.slice(0,80)); }

  try {
    const totalUsers = await paradise.getTotalUsers();
    console.log("Total users:", totalUsers.toString());
  } catch(e) { console.log("getTotalUsers FAILED:", e.message?.slice(0,80)); }

  try {
    const regFee = await paradise.getRegistrationFeeCro();
    console.log("Reg fee:", hre.ethers.formatEther(regFee), "CRO");
  } catch(e) { console.log("getRegistrationFeeCro FAILED:", e.message?.slice(0,80)); }

  try {
    const price = await paradise.getCroUsdPrice();
    console.log("CRO/USD:", price.toString());
  } catch(e) { console.log("getCroUsdPrice FAILED:", e.message?.slice(0,80)); }

  // Check manual costs
  console.log("\nManual costs:");
  try {
    for (let l = 2; l <= 12; l++) {
      const cost = await paradise.getLevelUpgradeCostCro(l);
      console.log(`  Level ${l}:`, hre.ethers.formatEther(cost), "CRO");
    }
  } catch(e) { console.log("level costs FAILED:", e.message?.slice(0,80)); }

  // Check referral cap
  try {
    const rc = await paradise.referralCap();
    console.log("\nReferral cap:", rc.toString());
  } catch(e) { console.log("referralCap FAILED:", e.message?.slice(0,80)); }

  // Check matrix children
  try {
    const gc = await paradise.getMatrixChildren(deployer.address);
    console.log("Matrix children (deployer):", gc.length);
  } catch(e) { console.log("getMatrixChildren FAILED:", e.message?.slice(0,80)); }

  console.log("\n✅ Upgrade successful!");
}

main().then(() => process.exit(0)).catch(e => { console.error("FATAL:", e.message?.slice(0, 400)); process.exit(1); });

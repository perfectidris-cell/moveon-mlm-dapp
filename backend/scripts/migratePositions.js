const hre = require("hardhat");

const PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Checking with account:", deployer.address);

  const f = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const c = f.attach(PROXY);

  const totalUsers = await c.getTotalUsers();
  console.log("Total users:", Number(totalUsers));

  const downline = await c.getDownline(deployer.address, 5);
  console.log("Downline (BFS, depth 5):", downline.length, "members");

  const parentInfo = await c.getUserParentInfo(deployer.address);
  console.log("Parent info -> referrer:", parentInfo.referrer, "level:", Number(parentInfo.referrerLevel));

  console.log("\nSequential positions removed. Tree uses BFS traversal over referral relationships.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });

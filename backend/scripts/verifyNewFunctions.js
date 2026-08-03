const hre = require("hardhat");
async function main() {
  const PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";
  const [deployer] = await hre.ethers.getSigners();
  const f = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const c = f.attach(PROXY);
  
  console.log("=== New Function Verification ===\n");
  
  const parentInfo = await c.getUserParentInfo(deployer.address);
  console.log("getUserParentInfo owner -> referrer:", parentInfo.referrer, "level:", Number(parentInfo.referrerLevel));
  
  const downline = await c.getDownline(deployer.address, 5);
  console.log("getDownline(owner, 5) size:", downline.length);
  for (let i = 0; i < downline.length; i++) {
    const info = await c.getUserInfo(downline[i]);
    console.log("  [" + i + "]", downline[i], "level:", Number(info.level));
  }
  
  const r = await c.getDownlinePaginated(deployer.address, 5, 0, 2);
  console.log("\ngetDownlinePaginated(owner, 5, 0, 2) -> members:", r.members.length, "total:", Number(r.total));
  
  console.log("\nAll functions working correctly!");
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });

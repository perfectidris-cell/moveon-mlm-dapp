const hre = require("hardhat");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  const p = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  console.log("Proxy:", PROXY);
  const owner = await p.owner();
  console.log("owner:", owner);
  console.log("totalUsers:", (await p.getTotalUsers()).toString());
  try {
    console.log("migratedCount:", (await p.getMigratedCount()).toString());
  } catch (e) {
    console.log("migratedCount: (unavailable)", e.message?.slice(0, 80));
  }
  try {
    console.log("paused:", await p.paused());
  } catch (e) {
    console.log("paused: (unavailable)", e.message?.slice(0, 80));
  }
  try {
    console.log("has totalDownline getter:", typeof (await p.totalDownline(owner)).toString === "function");
  } catch (e) {
    console.log("totalDownline getter: NOT PRESENT (old impl loaded)");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message || e); process.exit(1); });
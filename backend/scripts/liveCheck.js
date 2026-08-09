const hre = require("hardhat");
const NEW = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  const p = await hre.ethers.getContractAt("ParadiseUpgradeable", NEW);
  const sys = await p.getSystemInfo();
  console.log("registrationFeeCro:", sys.registrationFeeCro.toString());
  console.log("croUsdPrice:", sys.croUsdPrice.toString(), "(1e8 base; >0 means oracle OK)");
  console.log("totalUsers:", sys.totalUsers.toString());
  console.log("paused:", await p.paused());
  const reg = await p.getRegistrationFeeCro();
  console.log("getRegistrationFeeCro:", reg.toString());
  const c2 = await p.getLevelUpgradeCostCro(2);
  console.log("level2 cost:", c2.toString());
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
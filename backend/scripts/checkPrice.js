const hre = require("hardhat");
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(bal), "CRO");
  const f = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const c = f.attach("0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd");
  const price = await c.getCroUsdPrice();
  console.log("CRO/USD:", (Number(price) / 1e8).toFixed(4));
  const lvl2 = await c.getLevelUpgradeCostCro(2);
  console.log("Level 2 cost:", hre.ethers.formatEther(lvl2), "CRO");
  const lvl3 = await c.getLevelUpgradeCostCro(3);
  console.log("Level 3 cost:", hre.ethers.formatEther(lvl3), "CRO");
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });

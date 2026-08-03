const hre = require("hardhat");
const PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";
async function main() {
  const f = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const c = f.attach(PROXY);
  const [d] = await hre.ethers.getSigners();

  console.log("Verification calls with NEW implementation:");
  try { const o = await c.owner(); console.log("  owner():", o); } catch(e) { console.log("  owner() FAILED:", e.message?.slice(0,80)); }
  try { const t = await c.getTotalUsers(); console.log("  getTotalUsers():", t.toString()); } catch(e) { console.log("  getTotalUsers() FAILED:", e.message?.slice(0,80)); }
  try { const p = await c.getCroUsdPrice(); console.log("  getCroUsdPrice():", p.toString()); } catch(e) { console.log("  getCroUsdPrice() FAILED:", e.message?.slice(0,80)); }
  try { const r = await c.getRegistrationFeeCro(); console.log("  getRegistrationFeeCro():", hre.ethers.formatEther(r), "CRO"); } catch(e) { console.log("  getRegistrationFeeCro() FAILED:", e.message?.slice(0,80)); }
  try { const rc = await c.getReferralCap(); console.log("  getReferralCap():", rc.toString()); } catch(e) { console.log("  getReferralCap() FAILED:", e.message?.slice(0,80)); }
  try { const gc = await c.getMatrixChildren(d.address); console.log("  getMatrixChildren(deployer):", gc); } catch(e) { console.log("  getMatrixChildren() FAILED:", e.message?.slice(0,80)); }

  // Check manual costs still set
  try {
    for (let l = 2; l <= 12; l++) {
      const cost = await c.getLevelUpgradeCostCro(l);
      console.log(`  getLevelUpgradeCostCro(${l}):`, hre.ethers.formatEther(cost), "CRO");
    }
  } catch(e) { console.log("  level costs FAILED:", e.message?.slice(0,80)); }
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });

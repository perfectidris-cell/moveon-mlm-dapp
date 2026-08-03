const hre = require("hardhat");
const PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";
async function main() {
  const [d] = await hre.ethers.getSigners();
  const f = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const c = f.attach(PROXY);

  // Set referral cap
  console.log("Setting referralCap to 50...");
  const tx = await c.setReferralCap(50, { gasLimit: 100000 });
  await tx.wait();
  console.log("Done, tx:", tx.hash);

  // Verify
  const cap = await c.referralCap();
  console.log("Current referralCap:", cap.toString());
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });

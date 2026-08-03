const hre = require("hardhat");
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const f = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const c = f.attach("0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd");
  const o = await c.owner();
  console.log("Owner:", o);
  console.log("Match:", o.toLowerCase() === deployer.address.toLowerCase());

  // Try setting just the manual CRO price (simpler call)
  try {
    const tx = await c.setManualCroUsdPrice(5000000n, { gasLimit: 100000 });
    await tx.wait();
    console.log("setManualCroUsdPrice succeeded");
  } catch (e) {
    console.log("setManualCroUsdPrice failed:", e.message?.slice(0, 100));
  }

  // Now try setManualCroCosts with simple values
  try {
    const regFee = hre.ethers.parseEther("35");
    const costs = [
      0n, 0n,
      ...Array.from({length: 11}, (_, i) => hre.ethers.parseEther(String(35 * Math.pow(2, i))))
    ];
    console.log("Costs:", costs.map(c => hre.ethers.formatEther(c)).join(", "));
    const tx2 = await c.setManualCroCosts(regFee, costs, { gasLimit: 200000 });
    await tx2.wait();
    console.log("setManualCroCosts succeeded, tx:", tx2.hash);
  } catch (e) {
    console.log("setManualCroCosts failed:", e.message?.slice(0, 200));
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });

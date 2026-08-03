const h = require("hardhat");
async function main() {
    const c = await h.ethers.getContractAt("ParadiseUpgradeable", "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd");
    console.log("paused:", await c.paused());
    console.log("total users:", (await c.getTotalUsers()).toString());
    const r = await c.getDownlinePaginated("0x4D43a901a53dbA6cA61530674FC3e67470526f39", 3, 0, 10);
    console.log("downline members:", r.members.length, "total:", r.total.toString());
    console.log("staleness constant:", (await c.MAX_ORACLE_STALENESS()).toString());
    console.log("All new functions OK");
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });

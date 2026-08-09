const hre = require("hardhat");
const NEW = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  const p = await hre.ethers.getContractAt("ParadiseUpgradeable", NEW);
  const addrs = await p.getUserAddressesPaginated(0, 12);
  console.log("addr | lvl | next | levelEarn[next]    | withdrawable[next] | cost[next]");
  for (const a of addrs) {
    const info = await p.getUserInfo(a);
    const fin = await p.getUserFinancialInfo(a);
    const lvl = Number(info.level);
    const next = Math.min(lvl + 1, 12);
    const cost = await p.getLevelUpgradeCostCro(next);
    console.log(`${a} | ${String(lvl).padStart(3)} | ${String(next).padStart(4)} | ${fin.levelEarnings[next].toString().padStart(18)} | ${fin.withdrawableBalance[next].toString().padStart(19)} | ${cost.toString()}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
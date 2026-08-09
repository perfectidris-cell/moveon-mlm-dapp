const hre = require("hardhat");
const NEW = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

function nz(arr) { return arr.map((v, i) => (v > 0n ? `${i}:${v.toString()}` : null)).filter(Boolean); }

async function main() {
  const p = await hre.ethers.getContractAt("ParadiseUpgradeable", NEW);
  const addrs = await p.getUserAddressesPaginated(0, 40);
  console.log("lvl | levelEarnings[nz] | withdrawableMapping[nz] | reservedMapping[nz] | pendingWDL | totalEarnings");
  for (const a of addrs) {
    const fin = await p.getUserFinancialInfo(a);
    const info = await p.getUserInfo(a);
    const eth = fin.levelEarnings.reduce((s, v) => s + v, 0n);
    const pw = await p.getTotalWithdrawableBalance(a);
    const le = nz(fin.levelEarnings);
    const wd = nz(fin.withdrawableBalance);
    const rs = nz(fin.reservedForUpgrade);
    console.log(
      `${String(Number(info.level)).padStart(3)} | ${le.length ? le.join(";") : "-"} | ${wd.length ? wd.join(";") : "-"} | ${rs.length ? rs.join(";") : "-"} | ${pw.toString()} | ${eth.toString()}`
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
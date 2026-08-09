const hre = require("hardhat");
const NEW = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const TARGET = "0x638E6b17eB4e2a49FD91C4c396D1732E8ACdf3b6";

async function main() {
  const p = await hre.ethers.getContractAt("ParadiseUpgradeable", NEW);

  const fin = await p.getUserFinancialInfo(TARGET);
  const sum = fin.withdrawableBalance.reduce((a, b) => a + b, 0n);
  console.log("getUserFinancialInfo:");
  console.log("  reservedForUpgrade:", fin.reservedForUpgrade.map(String).join(","));
  console.log("  withdrawableBalance:", fin.withdrawableBalance.map(String).join(","));
  console.log("  totalWithdrawableBalance (4th return):", fin.totalWithdrawableBalance.toString());
  console.log("  totalReservedBalance (5th return):", fin.totalReservedBalance.toString());
  console.log("  sum of withdrawable array:", sum.toString());

  const direct = await p.getTotalWithdrawableBalance(TARGET);
  console.log("direct getTotalWithdrawableBalance:", direct.toString());
  const directR = await p.getTotalReservedBalance(TARGET);
  console.log("direct getTotalReservedBalance:", directR.toString());
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
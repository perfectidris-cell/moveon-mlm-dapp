const hre = require("hardhat");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  const total = Number(await paradise.getTotalUsers());
  console.log("Total users:", total);

  const sample = Math.min(total, 30);
  const addrs = await paradise.getUserAddressesPaginated(0, sample);
  console.log("Sampling", sample, "users:\n");
  console.log("idx | level | reserve[next]    | totalReserved | withdrawable | totalEarnings | directRefs");

  for (let i = 0; i < sample; i++) {
    const a = addrs[i];
    const info = await paradise.getUserInfo(a);
    const fin = await paradise.getUserFinancialInfo(a);
    const level = Number(info.level);
    const next = Math.min(level + 1, 12);
    const reserveNext = fin.reservedForUpgrade[next].toString();
    const totalReserved = fin.totalReservedBalance.toString();
    const withdrawable = fin.totalWithdrawableBalance.toString();
    const earnings = info[5]?.toString?.() ?? info.totalEarnings?.toString?.();
    const costs = await paradise.getLevelUpgradeCostCro(next);
    console.log(
      `${String(i).padStart(3)} | ${String(level).padStart(5)} | ${reserveNext.padStart(15)} | ${totalReserved.padStart(12)} | ${withdrawable.padStart(13)} | ${earnings.padStart(14)} | ${info.directReferrals}`
    );
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
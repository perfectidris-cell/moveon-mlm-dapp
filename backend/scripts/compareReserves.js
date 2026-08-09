const hre = require("hardhat");

const NEW_PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const OLD_PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";

async function main() {
  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", NEW_PROXY);

  const minAbi = [
    "function getReservedBalance(address,uint256) view returns (uint256)",
    "function getUserInfo(address) view returns (address id,address referrer,uint256 level,uint256 directReferrals,uint256 totalReferrals,uint256 totalEarnings,uint256 lastActiveTime)",
  ];
  const old = await hre.ethers.getContractAt(minAbi, OLD_PROXY);
  const fresh = await hre.ethers.getContractAt(minAbi, NEW_PROXY);

  const sample = Math.min(Number(await paradise.getTotalUsers()), 30);
  const addrs = await paradise.getUserAddressesPaginated(0, sample);
  console.log("addr | lvl | reserveNext (OLD)      | reserveNext (NEW)");
  for (let i = 0; i < sample; i++) {
    const a = addrs[i];
    let lvl = 0;
    try { lvl = Number((await fresh.getUserInfo(a)).level); } catch (e) { continue; }
    const next = Math.min(lvl + 1, 12);

    let oldRes = "?";
    try { oldRes = (await old.getReservedBalance(a, next)).toString(); } catch (e) { oldRes = "ERR:" + (e.reason || e.message?.slice(0, 30)); }

    let newRes = "?";
    try { newRes = (await fresh.getReservedBalance(a, next)).toString(); } catch (e) { newRes = "ERR"; }

    console.log(`${a} | ${String(lvl).padStart(3)} | ${oldRes.padStart(20)} | ${newRes.padStart(20)}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
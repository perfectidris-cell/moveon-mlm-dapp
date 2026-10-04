const { ethers } = require("ethers");

const NEW_PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const failover = [
  "https://evm-cronos.crypto.org",
  "https://cronos-mainnet.core.chainstack.com/f594d625c3a2c07704bed1beb4cae56b",
  "https://lb.drpc.live/cronos/AqLS9pjM8kSphmpdDl70ykuFqbiRhesR8aqKwosiOHdW",
  "https://cronos.drpc.org/",
];

const abi = [
  "function getTotalUsers() view returns (uint256)",
  "function getUserAddressesPaginated(uint256,uint256) view returns (address[])",
  "function getUserInfo(address) view returns (address,address,uint256,uint256,uint256,uint256,uint256)",
];
const provider = new ethers.JsonRpcProvider(failover[0]);
const c = new ethers.Contract(NEW_PROXY, abi, provider);

async function main() {
  const bal = await provider.getBalance(NEW_PROXY);
  console.log("Contract balance:", ethers.formatEther(bal), "CRO");
  const total = Number(await c.getTotalUsers());
  console.log("totalUsers:", total);

  const levelCount = {};
  const all = [];
  console.log("\nReading all users (paginated)...");
  for (let i = 0; i < total; i += 100) {
    const addrs = await c.getUserAddressesPaginated(i, Math.min(100, total - i));
    all.push(...addrs);
  }
  console.log("Fetched:", all.length);
  for (const a of all) {
    const info = await c.getUserInfo(a);
    levelCount[Number(info[2])] = (levelCount[Number(info[2])] || 0) + 1;
  }
  console.log("Level distribution:", JSON.stringify(levelCount));

  console.log("\nFirst 12 addresses:");
  for (let i = 0; i < Math.min(12, all.length); i++) {
    const info = await c.getUserInfo(all[i]);
    console.log(`  [${i}] ${all[i]} lvl=${info[2]} refs=${info[3]}/${info[4]} earnings=${ethers.formatEther(info[5])}`);
  }
  console.log("Last 12 addresses:");
  for (let i = Math.max(0, all.length - 12); i < all.length; i++) {
    const info = await c.getUserInfo(all[i]);
    console.log(`  [${i}] ${all[i]} lvl=${info[2]} refs=${info[3]}/${info[4]} earnings=${ethers.formatEther(info[5])}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message); process.exit(1); });
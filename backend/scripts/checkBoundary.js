const { ethers } = require("ethers");
const p = new ethers.JsonRpcProvider("https://evm-cronos.crypto.org", undefined, { staticNetwork: true });
const c = new ethers.Contract("0xAAD29abf34A871Cc0c38Abd80914A202e9300c85", [
  "function getUserInfo(address) view returns (address,address,uint256,uint256,uint256,uint256,uint256)",
  "function getUserAddressesPaginated(uint256,uint256) view returns (address[])",
  "function getTotalUsers() view returns (uint256)",
], p);

(async () => {
  const total = Number(await c.getTotalUsers());
  const addrs = await c.getUserAddressesPaginated(540, 66);
  const rows = [];
  for (const a of addrs) {
    const info = await c.getUserInfo(a);
    rows.push({ a, lvl: Number(info[2]), lastActive: Number(info[6]), refs: Number(info[4]) });
  }
  console.log("total users:", total);
  for (const r of rows) {
    console.log(`${r.a} lvl=${r.lvl} lastActive=${r.lastActive} (${new Date(r.lastActive * 1000).toISOString()}) totalRefs=${r.refs}`);
  }
})().catch((e) => console.error("ERR", e.message));
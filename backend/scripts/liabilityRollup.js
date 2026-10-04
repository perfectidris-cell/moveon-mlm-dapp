const { ethers } = require("ethers");
const fs = require("fs");

const NEW_PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const RPC = "https://evm-cronos.crypto.org";

const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
const c = new ethers.Contract(NEW_PROXY, [
  "function getTotalUsers() view returns (uint256)",
  "function getUserAddressesPaginated(uint256,uint256) view returns (address[])",
  "function getTotalWithdrawableBalance(address) view returns (uint256)",
  "function getTotalReservedBalance(address) view returns (uint256)",
], provider);

async function main() {
  const bal = await provider.getBalance(NEW_PROXY);
  const total = Number(await c.getTotalUsers());
  const all = [];
  for (let i = 0; i < total; i += 100) {
    all.push(...(await c.getUserAddressesPaginated(i, Math.min(100, total - i))));
  }

  const out = [];
  let pendingTotal = 0n, reservedTotal = 0n, countPw = 0;
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    let pw, rs;
    try { pw = await c.getTotalWithdrawableBalance(a); } catch { pw = 0n; }
    try { rs = await c.getTotalReservedBalance(a); } catch { rs = 0n; }
    pendingTotal += pw;
    reservedTotal += rs;
    if (pw > 0n) countPw++;
    out.push({ a, pw: pw.toString(), rs: rs.toString() });
    if (i % 100 === 0) console.log(`  ${i}/${all.length}`);
  }

  console.log("\nContract balance:", ethers.formatEther(bal), "CRO");
  console.log("users:", all.length);
  console.log("Sum pendingWithdrawals:", ethers.formatEther(pendingTotal), "CRO");
  console.log("Sum reservedForUpgrade:", ethers.formatEther(reservedTotal), "CRO");
  console.log("Users with pendingWithdrawals > 0:", countPw);
  console.log("Balance - liabilities (free margin):", ethers.formatEther(bal - pendingTotal), "CRO");

  fs.writeFileSync("liability_snapshot.json", JSON.stringify({ at_block: await provider.getBlockNumber(), balance: bal.toString(), users: out }, null, 1));
  console.log("Saved liability_snapshot.json");
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message); process.exit(1); });
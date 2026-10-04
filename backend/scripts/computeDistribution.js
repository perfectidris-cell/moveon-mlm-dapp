const { ethers } = require("ethers");
const fs = require("fs");

const NEW_PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const RPC = "https://evm-cronos.crypto.org";
const POOL_CRO = ethers.parseEther("9000");
const MIGRATED_COUNT = 564;

const LEVEL_COSTS_USD = [0, 0, 2e8, 4e8, 8e8, 16e8, 32e8, 64e8, 128e8, 256e8, 512e8, 1024e8, 2048e8];

const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
const c = new ethers.Contract(NEW_PROXY, [
  "function getTotalUsers() view returns (uint256)",
  "function getUserAddressesPaginated(uint256,uint256) view returns (address[])",
  "function getUserInfo(address) view returns (address,address,uint256,uint256,uint256,uint256,uint256)",
  "function owner() view returns (address)",
], provider);

async function main() {
  const owner = await c.owner();
  const total = Number(await c.getTotalUsers());
  const addrs = await c.getUserAddressesPaginated(0, MIGRATED_COUNT);
  console.log("Fetched first", addrs.length, "addresses (migrated set). total users:", total, "owner:", owner);

  const rows = [];
  for (let i = 0; i < addrs.length; i++) {
    const info = await c.getUserInfo(addrs[i]);
    rows.push({ i, a: addrs[i].toLowerCase(), level: Number(info[2]), lastActive: Number(info[6]) });
    if (i % 100 === 0) console.log(`  fetched ${i}/${addrs.length}`);
  }

  // Exclude owner + level-12 admin accounts
  const excluded = rows.filter((r) => r.a === owner.toLowerCase() || r.level === 12);
  const recipients = rows.filter((r) => r.a !== owner.toLowerCase() && r.level < 12);
  console.log("\nExcluded:", excluded.length, excluded.map((r) => `${r.a}(lvl${r.level})`).join(", "));
  console.log("Recipients:", recipients.length);

  // Level distribution among recipients
  const dist = {};
  for (const r of recipients) dist[r.level] = (dist[r.level] || 0) + 1;
  console.log("Recipient level distribution:", JSON.stringify(dist));

  // Weights = next-level cost (USD, 1e8 precision), used as relative weight
  const weightOf = (level) => BigInt(LEVEL_COSTS_USD[Math.min(level + 1, 12)]);
  let totalWeight = 0n;
  const weighted = [];
  for (const r of recipients) {
    const w = weightOf(r.level);
    r.weight = w;
    totalWeight += w;
    weighted.push(r);
  }
  console.log("Total weight:", totalWeight.toString());

  // Allocate 9000 CRO proportionally (floor, remainder handled)
  let allocated = 0n;
  const ledger = [];
  for (const r of weighted) {
    const share = (POOL_CRO * r.weight) / totalWeight;
    r.share = share;
    allocated += share;
    ledger.push({ address: r.a, level: r.level, nextLevel: r.level + 1, weight: r.weight.toString(), shareWei: share.toString(), shareCro: ethers.formatEther(share) });
  }
  const remainder = POOL_CRO - allocated;
  console.log("Allocated:", ethers.formatEther(allocated), "CRO; remainder (dust):", ethers.formatEther(remainder), "CRO");

  ledger.sort((a, b) => Number(b.shareWei) - Number(a.shareWei));
  console.log("\nTop 15 recipients:");
  for (const l of ledger.slice(0, 15)) {
    console.log(`  ${l.address} lvl=${l.level} next=${l.nextLevel}  -> ${l.shareCro} CRO`);
  }
  console.log("Smallest 5:");
  for (const l of ledger.slice(-5)) {
    console.log(`  ${l.address} lvl=${l.level} next=${l.nextLevel}  -> ${l.shareCro} CRO`);
  }

  fs.writeFileSync("settlement_ledger_9000_cro_lvl_weighted.json", JSON.stringify({ poolCro: POOL_CRO.toString(), totalUsers: total, migratedCount: MIGRATED_COUNT, excluded: excluded.map((r) => r.a), recipients: ledger.length, totalWeight: totalWeight.toString(), allocatedCro: allocated.toString(), remainderWei: remainder.toString(), rows: ledger }, null, 1));
  console.log("\nSaved settlement_ledger_9000_cro_lvl_weighted.json");
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERR:", e.message); process.exit(1); });
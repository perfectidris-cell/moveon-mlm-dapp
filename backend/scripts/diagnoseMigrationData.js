const hre = require("hardhat");
const { ethers } = hre;

const NEW_PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const OLD_PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function main() {
  const p = hre.ethers.provider;

  console.log("== Balances ==");
  const nb = await p.getBalance(NEW_PROXY);
  const ob = await p.getBalance(OLD_PROXY);
  console.log("NEW proxy balance :", ethers.formatEther(nb), "CRO");
  console.log("OLD proxy balance :", ethers.formatEther(ob), "CRO");

  console.log("\n== Code presence ==");
  const newCode = await p.getCode(NEW_PROXY);
  const oldCode = await p.getCode(OLD_PROXY);
  console.log("NEW proxy code len :", newCode.length);
  console.log("OLD proxy code len :", oldCode.length);

  console.log("\n== Implementation slots ==");
  const newImpl = await p.getStorage(OLD_PROXY, IMPL_SLOT);
  const oldImpl = await p.getStorage(OLD_PROXY, IMPL_SLOT);
  const newImplRaw = await p.getStorage(NEW_PROXY, IMPL_SLOT);
  console.log("OLD proxy impl     :", oldImpl === "0x0000000000000000000000000000000000000000000000000000000000000000" ? "(zero)" : "0x" + oldImpl.slice(26));
  console.log("NEW proxy impl     :", newImplRaw === "0x0000000000000000000000000000000000000000000000000000000000000000" ? "(zero)" : "0x" + newImplRaw.slice(26));

  console.log("\n== Try OLD proxy read calls (MoveOn ABI) ==");
  const oldAbi = [
    "function owner() view returns (address)",
    "function getTotalUsers() view returns (uint256)",
    "function getReservedBalance(address,uint256) view returns (uint256)",
    "function getWithdrawableBalance(address,uint256) view returns (uint256)",
    "function getTotalReservedBalance(address) view returns (uint256)",
    "function getTotalWithdrawableBalance(address) view returns (uint256)",
    "function getUserInfo(address) view returns (address,address,uint256,uint256,uint256,uint256,uint256)",
  ];
  const old = new ethers.Contract(OLD_PROXY, oldAbi, p);
  for (const [label, fn] of [
    ["owner", () => old.owner()],
    ["getTotalUsers", () => old.getTotalUsers()],
  ]) {
    try {
      console.log(`${label}:`, (await fn()).toString());
    } catch (e) {
      console.log(`${label}: FAILED ->`, (e.reason || e.message || "").slice(0, 90));
    }
  }

  console.log("\n== NEW proxy user data (sample) ==");
  const newAbi = [
    "function getTotalUsers() view returns (uint256)",
    "function getUserAddressesPaginated(uint256,uint256) view returns (address[])",
    "function getUserInfo(address) view returns (address,address,uint256,uint256,uint256,uint256,uint256)",
    "function getReservedBalance(address,uint256) view returns (uint256)",
    "function getTotalReservedBalance(address) view returns (uint256)",
    "function getTotalWithdrawableBalance(address) view returns (uint256)",
  ];
  const np = new ethers.Contract(NEW_PROXY, newAbi, p);
  const totalUsers = Number((await np.getTotalUsers()).toString());
  console.log("NEW totalUsers:", totalUsers);
  const sample = Math.min(totalUsers, 10);
  const addrs = await np.getUserAddressesPaginated(0, sample);
  for (const a of addrs) {
    let info, resTotal, wd;
    try { info = await np.getUserInfo(a); } catch (e) { console.log(a, "getUserInfo FAILED"); continue; }
    try { resTotal = (await np.getTotalReservedBalance(a)).toString(); } catch (e) { resTotal = "ERR"; }
    try { wd = (await np.getTotalWithdrawableBalance(a)).toString(); } catch (e) { wd = "ERR"; }
    console.log(`${a} | lvl=${info[2]} | totalReserved=${resTotal} | withdrawable=${wd}`);
  }

  if (oldCode.length > 10) {
    console.log("\n== OLD proxy user data (sample) ==");
    for (const a of addrs) {
      let info;
      try { info = await old.getUserInfo(a); } catch (e) { console.log(a, "OLD getUserInfo FAILED:", (e.reason||e.message||"").slice(0,60)); continue; }
      let resTotal, wdTotal;
      try { resTotal = (await old.getTotalReservedBalance(a)).toString(); } catch (e) { resTotal = "ERR"; }
      try { wdTotal = (await old.getTotalWithdrawableBalance(a)).toString(); } catch (e) { wdTotal = "ERR"; }
      console.log(`${a} | lvl=${info[2]} | OLD totalReserved=${resTotal} | OLD withdrawable=${wdTotal}`);
    }
  } else {
    console.log("\nOLD proxy has no live code — cannot call view functions. Falling back to raw storage reads.");
    // Raw storage read attempt on OLD proxy for first user reserve (MoveOn layout):
    // users mapping slot = 3 in MoveOn (need to confirm). We'll compute below.
    const slotUsers = 3; // users mapping slot in MoveOnUpgradeable (storage var order)
    const addr = addrs[0];
    if (addr) {
      for (let level = 1; level <= 3; level++) {
        const slot = ethers.keccak256(
          ethers.concat([ethers.toBeHex(addr, 32), ethers.toBeHex(slotUsers, 32)])
        );
        // reservedForUpgrade is a nested mapping at first mapping field of User struct.
        // nested mapping slot = keccak(key ++ keccak(mappingSlot ++ parentSlot))
        const innerSlot = ethers.keccak256(
          ethers.concat([ethers.toBeHex(addr, 32), slot])
        );
        const mappingSlot = ethers.toBeHex(level, 32);
        const finalSlot = ethers.keccak256(
          ethers.concat([mappingSlot, innerSlot])
        );
        const val = await p.getStorage(OLD_PROXY, finalSlot);
        console.log(`raw reserve[${addr}][lvl ${level}] slot=${finalSlot} val=${val}`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

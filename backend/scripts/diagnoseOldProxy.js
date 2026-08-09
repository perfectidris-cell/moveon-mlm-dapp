const hre = require("hardhat");
const OLD = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";
const SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function main() {
  const implRaw = await hre.ethers.provider.getStorage(OLD, SLOT);
  console.log("OLD proxy implementation slot:", implRaw === "0x" ? "(zero)" : "0x" + implRaw.slice(26));

  const code = await hre.ethers.provider.getCode(OLD);
  console.log("OLD proxy code length:", code.length);
  if (code.length < 10) { console.log("=> old proxy appears empty/dead"); return; }

  for (const [name, sigs] of Object.entries({
    "getUserFinancialInfo": ["function getUserFinancialInfo(address) view returns (uint256[13],uint256[13],uint256[13],uint256,uint256)"],
    "getTotalReservedBalance": ["function getTotalReservedBalance(address) view returns (uint256)"],
    "getReservedBalance": ["function getReservedBalance(address,uint256) view returns (uint256)"],
    "getTotalUsers": ["function getTotalUsers() view returns (uint256)"],
    "owner": ["function owner() view returns (address)"],
  })) {
    try {
      const c = new hre.ethers.Contract(OLD, sigs, hre.ethers.provider);
      const r = name === "getTotalUsers" ? await c.getTotalUsers() : name === "owner" ? await c.owner() : "?";
      console.log(`${name}:`, r?.toString?.() ?? r);
    } catch (e) {
      console.log(`${name}: FAILED ->`, (e.reason || e.message)?.slice(0, 90));
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
const hre = require("hardhat");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ERC1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer (from PRIVATE_KEY):", signer.address);
  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log("Signer CRO balance:", hre.ethers.formatEther(balance));

  const implRaw = await hre.ethers.provider.getStorage(PROXY, ERC1967_IMPL_SLOT);
  const adminRaw = await hre.ethers.provider.getStorage(PROXY, ERC1967_ADMIN_SLOT);
  const impl = implRaw === "0x" ? "zero" : "0x" + implRaw.slice(26);
  const admin = adminRaw === "0x" ? "zero" : "0x" + adminRaw.slice(26);
  console.log("ERC1967 implementation slot:", impl);
  console.log("ERC1967 admin slot:", admin, "(non-zero => Transparent proxy)");

  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  const owner = await paradise.owner();
  console.log("owner():", owner);
  console.log("Owner == signer?", owner.toLowerCase() === signer.address.toLowerCase());

  try { console.log("MAX_AUTO_UPGRADES on-chain:", (await paradise.MAX_AUTO_UPGRADES()).toString()); } catch (e) { console.log("MAX_AUTO_UPGRADES: unavailable ->", e.message.slice(0,80)); }
  try { console.log("pyth:", await paradise.pyth()); } catch (e) { console.log("pyth: unavailable"); }
  try { console.log("band:", await paradise.band()); } catch (e) { console.log("band: unavailable"); }
  try { console.log("getRegistrationFeeCro:", (await paradise.getRegistrationFeeCro()).toString()); } catch (e) { console.log("getRegistrationFeeCro: unavailable"); }
  try { console.log("getTotalUsers:", (await paradise.getTotalUsers()).toString()); } catch (e) { console.log("getTotalUsers: unavailable"); }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
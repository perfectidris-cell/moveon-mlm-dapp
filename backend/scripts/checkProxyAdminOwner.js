const hre = require("hardhat");

const PROXY_ADMIN = "0xb8062e8c694241d77a903c5c6332b8ee346e1bf0";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);

  const adminContract = new hre.ethers.Contract(
    PROXY_ADMIN,
    ["function owner() view returns (address)", "function proxy() view returns (address)", "function getProxyAdmin() view returns (address)"],
    signer
  );
  try {
    console.log("ProxyAdmin.owner():", await adminContract.owner());
  } catch (e) { console.log("owner() failed:", e.message.slice(0, 120)); }

  try { console.log("Factory/proxy():", await adminContract.proxy()); } catch (e) { console.log("proxy() failed"); }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
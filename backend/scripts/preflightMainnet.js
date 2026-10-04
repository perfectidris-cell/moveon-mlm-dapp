const hre = require("hardhat");
const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const PROXY_ADMIN = "0xb8062e8c694241d77a903c5c6332b8ee346e1bf0";
const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log("chainId:", (await hre.ethers.provider.getNetwork()).chainId);

  const adminContract = new hre.ethers.Contract(
    PROXY_ADMIN,
    ["function owner() view returns (address)"],
    signer
  );
  console.log("ProxyAdmin owner:", await adminContract.owner());

  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  console.log("Proxy owner:", await paradise.owner());

  const implRaw = await hre.ethers.provider.getStorage(PROXY, ERC1967_IMPL_SLOT);
  console.log("Current implementation:", "0x" + implRaw.slice(26));
  console.log("Total users:", (await paradise.getTotalUsers()).toString());
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(PROXY)), "CRO");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
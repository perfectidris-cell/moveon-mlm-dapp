const hre = require("hardhat");
const PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";
async function main() {
  const txHash = "0x0d70023ae138fe758ae15e94bf8e2822392ace1485b0e822efa72d85112dd69f";
  const tx = await hre.ethers.provider.getTransaction(txHash);
  const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
  console.log("Status:", receipt.status);
  console.log("Gas used:", receipt.gasUsed.toString());
  console.log("Block number:", receipt.blockNumber);

  try {
    await hre.ethers.provider.call(tx, receipt.blockNumber);
  } catch (e) {
    console.log("Revert reason:", e.message?.slice(0, 500));
    console.log("Revert data:", e.data || e.error?.data || "none");
  }

  const newImpl = "0x66AA3aCB6ea1Cc53EA4a93B8530fF6E6206C6169";
  const code = await hre.ethers.provider.getCode(newImpl);
  console.log("New impl code length:", code.length / 2 - 1, "bytes");
  console.log("Has code:", code !== "0x");

  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const currentImpl = await hre.ethers.provider.getStorage(PROXY, implSlot);
  console.log("Current proxy impl:", currentImpl);

  const oldImpl = "0x"+currentImpl.slice(26);
  console.log("Old impl address:", oldImpl);
  const oldCode = await hre.ethers.provider.getCode(oldImpl);
  console.log("Old impl code length:", oldCode.length / 2 - 1, "bytes");
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });

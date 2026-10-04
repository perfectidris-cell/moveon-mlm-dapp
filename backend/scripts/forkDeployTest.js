const hre = require("hardhat");

async function main() {
  await hre.network.provider.send("evm_mine", []);
  const OWNER = "0x4D43a901a53dbA6cA61530674FC3e67470526f39";
  await hre.network.provider.send("hardhat_impersonateAccount", [OWNER]);
  await hre.network.provider.send("hardhat_setBalance", [OWNER, "0xDE0B6B3A7640000"]);
  const signer = await hre.ethers.getSigner(OWNER);
  console.log("signer", signer.address);

  const Factory = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  console.log("calling deploy...");
  const c = await Factory.deploy({ gasLimit: 20000000 });
  await c.waitForDeployment();
  console.log("deployed", await c.getAddress());

  const c2 = await Factory.deploy({ gasLimit: 20000000 });
  await c2.waitForDeployment();
  console.log("deployed2", await c2.getAddress());
}

main().then(() => { console.log("OK"); process.exit(0); }).catch((e) => { console.error("FAILED:", e.message); console.error(e.stack); process.exit(1); });
const hre = require("hardhat");

const PROXY = "0x7665050AEbC6c69a279BAb2927e738EE9fbF54dd";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const f = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const c = f.attach(PROXY);

  const fee = await c.getRegistrationFeeCro();
  console.log("Reg fee:", hre.ethers.formatEther(fee), "CRO");

  const ownerAddr = deployer.address;
  console.log("Owner:", ownerAddr);

  // Check getMatrixChildren of owner
  const ownerChildren = await c.getMatrixChildren(ownerAddr);
  console.log("Owner matrixChildren length:", ownerChildren.length);

  // Check referralCount of owner
  const refCount = await c.referralCount(ownerAddr);
  console.log("Owner referralCount:", refCount.toString());

  // Find next matrix slot from owner
  const queue = [ownerAddr];
  const visited = new Set();
  visited.add(ownerAddr.toLowerCase());
  let slot = null;
  while (queue.length > 0) {
    const current = queue.shift();
    const children = await c.getMatrixChildren(current);
    if (children.length < 2) { slot = current; break; }
    for (const child of children) {
      const key = child.toLowerCase();
      if (!visited.has(key)) { visited.add(key); queue.push(child); }
    }
  }
  console.log("Next matrix slot:", slot);

  if (slot) {
    // Deploy a throwaway account to test registration
    const wallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
    console.log("Test wallet:", wallet.address);

    // Fund the wallet from deployer
    const fundTx = await deployer.sendTransaction({
      to: wallet.address,
      value: hre.ethers.parseEther("40")
    });
    await fundTx.wait();
    console.log("Funded with 40 CRO");

    // Try registration
    try {
      const tx = await c.connect(wallet).register(ownerAddr, slot, { value: fee, gasLimit: 500000 });
      const receipt = await tx.wait();
      console.log("Registration tx:", receipt.hash);
      console.log("Gas used:", receipt.gasUsed.toString());

      const matParent = await c.matrixParent(wallet.address);
      console.log("Tester matrixParent:", matParent);
      console.log("Owner matrixChildren length:", (await c.getMatrixChildren(ownerAddr)).length);
      console.log("Owner referralCount:", (await c.referralCount(ownerAddr)).toString());
    } catch (err) {
      console.log("Registration failed:");
      console.log("  reason:", err.reason);
      console.log("  message:", err.message?.slice(0, 300));
      console.log("  code:", err.code);
      if (err.data) console.log("  data:", err.data);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error("FATAL:", e.message); process.exit(1); });

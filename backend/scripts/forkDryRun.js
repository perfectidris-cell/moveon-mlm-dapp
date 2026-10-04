const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const PROXY_ADMIN = "0xb8062e8c694241d77a903c5c6332b8ee346e1bf0";
const OWNER = "0x4D43a901a53dbA6cA61530674FC3e67470526f39";
const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function main() {
  // Workaround for https://github.com/NomicFoundation/hardhat/issues/5511 :
  // calls executed in the forked block need a known hardfork history.
  await hre.network.provider.send("evm_mine", []);

  // Impersonate the real owner on the fork so upgrade + credit calls are valid.
  await hre.network.provider.send("hardhat_impersonateAccount", [OWNER]);
  await hre.network.provider.send("hardhat_setBalance", [OWNER, "0x152D02C7E14AF6800000"]);
  const signer = await hre.ethers.getSigner(OWNER);
  console.log("Signer:", signer.address);

  const adminContract = new hre.ethers.Contract(
    PROXY_ADMIN,
    ["function upgradeAndCall(address proxy, address implementation, bytes data) external payable", "function owner() view returns (address)"],
    signer
  );
  const proxyOwner = await adminContract.owner();
  console.log("ProxyAdmin owner:", proxyOwner, "== signer?", proxyOwner.toLowerCase() === signer.address.toLowerCase());
  if (proxyOwner.toLowerCase() !== signer.address.toLowerCase()) throw new Error("Not ProxyAdmin owner");

  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  const contractOwner = await paradise.owner();
  console.log("Contract owner:", contractOwner);
  const totalBefore = (await paradise.getTotalUsers()).toString();
  const balBefore = await hre.ethers.provider.getBalance(PROXY);
  console.log("totalUsers before:", totalBefore, "balance:", ethers.formatEther(balBefore), "CRO");

  // Deploy new implementation
  console.log("Deploying new implementation...");
  const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
  const newImpl = await ParadiseUpgradeable.deploy({ gasLimit: 20000000 });
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("New implementation:", newImplAddress);

  // Upgrade
  console.log("Upgrading proxy...");
  const tx = await adminContract.upgradeAndCall(PROXY, newImplAddress, "0x", { gasLimit: 1000000 });
  const receipt = await tx.wait();
  console.log("Upgrade tx:", receipt.hash, "block:", receipt.blockNumber);

  // Verify implementation slot
  const afterRaw = await hre.ethers.provider.getStorage(PROXY, ERC1967_IMPL_SLOT);
  const afterImpl = "0x" + afterRaw.slice(26);
  console.log("Implementation now:", afterImpl, "matches?", afterImpl.toLowerCase() === newImplAddress.toLowerCase());

  const np = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY, signer);
  console.log("totalUsers after:", (await np.getTotalUsers()).toString(), "unchanged?", (await np.getTotalUsers()).toString() === totalBefore);
  console.log("balance after:", ethers.formatEther(await hre.ethers.provider.getBalance(PROXY)), "CRO");
  console.log("creditMigratedReserves exists:", typeof np.creditMigratedReserves === "function");

  // sanity: no one has been credited yet
  const first = (await np.getUserAddressesPaginated(0, 1))[0];
  console.log("settlementCredited(first):", (await np.settlementCredited(first)).toString());

  // Load ledger, pick one full batch
  const ledger = JSON.parse(fs.readFileSync("settlement_ledger_9000_cro_lvl_weighted.json", "utf8"));
  const batch = ledger.rows.slice(0, 40);
  const users = batch.map((r) => r.address);
  const amounts = batch.map((r) => BigInt(r.shareWei));
  const batchSum = amounts.reduce((a, b) => a + b, 0n);

  // Capture pre-existing reserved balance at credit level (credits are additive)
  for (const r of batch) {
    const info = await np.getUserInfo(r.address);
    const lvl = Number(info[2]);
    r._pre = await np.getReservedBalance(r.address, lvl + 1);
  }
  console.log("\nDry-run batch: 40 users, sum =", ethers.formatEther(batchSum), "CRO");

  // Credit (owner signs)
  const ctx = await np.creditMigratedReserves(users, amounts, { gasLimit: 4000000 });
  const crec = await ctx.wait();
  console.log("Credit tx:", crec.hash, "status:", crec.status, "gas:", crec.gasUsed.toString());

  // Verify each user got credited exactly shareWei at level+1 (credits are additive)
  let ok = 0;
  for (const r of batch) {
    const info = await np.getUserInfo(r.address);
    const lvl = Number(info[2]);
    const res = await np.getReservedBalance(r.address, lvl + 1);
    const expected = BigInt(r.shareWei) + r._pre;
    if (res === expected) ok++;
    else console.log("  MISMATCH", r.address, "expected", expected.toString(), "got", res.toString());
  }
  console.log("credited correctly:", ok, "/", batch.length);

  // Idempotency: re-run same batch -> no change
  await np.creditMigratedReserves(users, amounts, { gasLimit: 4000000 });
  const res2 = await np.getReservedBalance(batch[0].address, Number((await np.getUserInfo(batch[0].address))[2]) + 1);
  console.log("after re-run first user reserve (unchanged?):", res2.toString());

  // total reserved across batch after (should equal sum of pre-existing + batchSum)
  let tot = 0n;
  for (const r of batch) tot += await np.getReservedBalance(r.address, Number((await np.getUserInfo(r.address))[2]) + 1);
  const expectedTot = batchSum + batch.reduce((a, r) => a + r._pre, 0n);
  console.log("sum reserved across batch:", ethers.formatEther(tot), "CRO (expected", ethers.formatEther(expectedTot) + ")");

  // Non-owner reverts
  try {
    const [other] = await hre.ethers.getSigners();
    await np.connect(other).creditMigratedReserves(users.slice(0, 1), amounts.slice(0, 1));
    console.log("non-owner call: UNEXPECTED SUCCESS");
  } catch (e) {
    console.log("non-owner call reverted (expected):", (e.reason || e.message || "").slice(0, 60));
  }

  console.log("\n✅ FORK DRY-RUN PASSED");
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
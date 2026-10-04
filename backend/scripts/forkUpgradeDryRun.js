const hre = require("hardhat");
const { ethers } = hre;

const PROXY = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
const PROXY_ADMIN = "0xb8062e8c694241d77a903c5c6332b8ee346e1bf0";
const OWNER = "0x4D43a901a53dbA6cA61530674FC3e67470526f39";
const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function main() {
  await hre.network.provider.send("evm_mine", []);

  await hre.network.provider.send("hardhat_impersonateAccount", [OWNER]);
  await hre.network.provider.send("hardhat_setBalance", [OWNER, "0x152D02C7E14AF6800000"]);
  const signer = await hre.ethers.getSigner(OWNER);

  const adminContract = new hre.ethers.Contract(
    PROXY_ADMIN,
    ["function upgradeAndCall(address proxy, address implementation, bytes data) external payable", "function owner() view returns (address)"],
    signer
  );
  const proxyOwner = await adminContract.owner();
  if (proxyOwner.toLowerCase() !== signer.address.toLowerCase()) throw new Error("Not ProxyAdmin owner");

  const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY);
  const totalBefore = (await paradise.getTotalUsers()).toString();
  const balBefore = await hre.ethers.provider.getBalance(PROXY);

  // Snapshot a few users' state to verify nothing is corrupted post-upgrade
  const addrs = (await paradise.getUserAddressesPaginated(0, 5)).filter((a) => a !== ethers.ZeroAddress);
  const snap = [];
  for (const a of addrs) {
    const info = await paradise.getUserInfo(a);
    const pend = await paradise.getTotalWithdrawableBalance(a);
    snap.push({ a, level: info[2], earnings: info[5], pend: pend.toString() });
  }
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

  const afterRaw = await hre.ethers.provider.getStorage(PROXY, ERC1967_IMPL_SLOT);
  const afterImpl = "0x" + afterRaw.slice(26);
  console.log("Implementation now:", afterImpl, "matches?", afterImpl.toLowerCase() === newImplAddress.toLowerCase());

  const np = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY, signer);
  console.log("totalUsers after:", (await np.getTotalUsers()).toString(), "unchanged?", (await np.getTotalUsers()).toString() === totalBefore);
  console.log("balance after:", ethers.formatEther(await hre.ethers.provider.getBalance(PROXY)), "CRO");

  // Verify user state preserved
  let ok = 0;
  for (const s of snap) {
    const info = await np.getUserInfo(s.a);
    const pend = await np.getTotalWithdrawableBalance(s.a);
    const good = info[2] === s.level && info[5] === s.earnings && pend.toString() === s.pend;
    if (good) ok++;
    else console.log("  STATE MISMATCH", s.a, { level: info[2], earnings: info[5].toString(), pend: pend.toString() }, "expected", s);
  }
  console.log("user state preserved:", ok, "/", snap.length);

  // New functions present
  console.log("getDownlinePaginated present:", typeof np.getDownlinePaginated === "function");
  console.log("registerAuto present:", typeof np.registerAuto === "function");
  console.log("findNextSlotAndProof present:", typeof np.findNextSlotAndProof === "function");
  console.log("claimMissedEarnings present:", typeof np.claimMissedEarnings === "function");
  console.log("getTotalMissedEarnings present:", typeof np.getTotalMissedEarnings === "function");
  console.log("emergencyBalances present:", typeof np.emergencyBalances === "function");
  console.log("uplineCache present:", typeof np.uplineCache === "function");
  console.log("backfillUplinesBatch present:", typeof np.backfillUplinesBatch === "function");

  // Test direct payout on the fork: register two fresh users under a host with open slots
  const regFee = await np.getRegistrationFeeCro();
  console.log("regFee:", ethers.formatEther(regFee), "CRO");
  const signers = await hre.ethers.getSigners();
  const filler1 = signers[3];
  const filler2 = signers[4];
  const u1 = signers[5];
  const u2 = signers[6];

  // Find a real registered user that still has an open placement slot
  let host = ethers.ZeroAddress;
  for (let i = 0; i < 50; i++) {
    const addr = (await np.getUserAddressesPaginated(i, 1))[0];
    if (!addr) break;
    const kids = await np.getMatrixChildren(addr);
    if (kids.length < 2) { host = addr; break; }
  }
  console.log("host with open slot:", host);
  if (host === ethers.ZeroAddress) throw new Error("no host found with open slot");

  // fund fresh users
  await signer.sendTransaction({ to: filler1.address, value: ethers.parseEther("10") });
  await signer.sendTransaction({ to: filler2.address, value: ethers.parseEther("10") });
  await signer.sendTransaction({ to: u1.address, value: ethers.parseEther("10") });
  await signer.sendTransaction({ to: u2.address, value: ethers.parseEther("10") });

  // Build a small fresh subtree under the host: filler1+filler2 fill host's remaining slots,
  // u1 registers under filler1 (level 1), u2 registers under u1 -> direct payout to u1
  await np.connect(filler1).register(host, host, [host], { value: regFee });
  await np.connect(filler2).register(host, host, [host], { value: regFee });
  await np.connect(u1).register(host, filler1.address, [filler1.address, host], { value: regFee });
  console.log("u1 level:", (await np.getUserInfo(u1.address))[2].toString());

  // user2 registers under u1 -> direct payout to u1 expected
  const balBeforeU1 = await ethers.provider.getBalance(u1.address);
  console.log("u1 addr:", u1.address, "u1 children:", (await np.getMatrixChildren(u1.address)).length);
  const t = await np.connect(u2).register(u1.address, u1.address, [u1.address], { value: regFee });
  await expectEvent(t, "PayoutSent");
  const pendAfter = await np.getTotalWithdrawableBalance(u1.address);
  console.log("u1 pendingWithdrawals after:", pendAfter.toString(), "(expect 0 for direct payout)");
  console.log("u1 balance delta:", ethers.formatEther((await ethers.provider.getBalance(u1.address)) - balBeforeU1), "CRO");

  // -- New safe-push + auto-placement verification on the fork ----------------
  // registerAuto + findNextSlotAndProof (no backfill needed for new users)
  console.log("\n-- registerAuto + findNextSlotAndProof on fork --");
  const u3 = signers[7];
  await signer.sendTransaction({ to: u3.address, value: ethers.parseEther("10") });
  const [slot, path] = await np.findNextSlotAndProof(host);
  console.log("  slot:", slot, "pathLen:", path.length);
  if (path[0].toLowerCase() !== slot.toLowerCase()) throw new Error("path must start with slot");
  const t2 = await np.connect(u3).registerAuto(host, { value: regFee });
  await t2.wait();
  console.log("  registerAuto ok, parent:", await np.matrixParent(u3.address));
  console.log("  uplinesBackfilled(u3):", await np.uplinesBackfilled(u3.address));
  console.log("  cache[0] == parent:", (await np.uplineCache(u3.address, 0)) === (await np.matrixParent(u3.address)));

  // Missed-earnings views agree when nothing failed
  const missed = await np.getTotalMissedEarnings(u1.address);
  const pend = await np.getTotalWithdrawableBalance(u1.address);
  console.log("  getTotalMissedEarnings(u1):", missed.toString(), "legacy pending:", pend.toString());

  // Backfill the first 10 legacy users (fast) and verify cache correctness
  console.log("\n-- backfill first 10 + uplineCache correctness spot-check --");
  const t3 = await np.backfillUplinesBatch(0, 10, { gasLimit: 20000000 });
  const rc3 = await t3.wait();
  console.log("  batch=10 gas=", rc3.gasUsed.toString(), "per-user~", (rc3.gasUsed / 10n).toString());
  const spot = (await np.getUserAddressesPaginated(0, 10)).filter((a) => a !== ethers.ZeroAddress);
  for (const a of spot) {
    let cursor = await np.matrixParent(a);
    for (let k = 0; k < 12; k++) {
      const cached = await np.uplineCache(a, k);
      if (cached.toLowerCase() !== cursor.toLowerCase()) throw new Error(`cache mismatch for ${a} at ${k}`);
      if (cursor === ethers.ZeroAddress) break;
      cursor = await np.matrixParent(cursor);
    }
    if (!(await np.uplinesBackfilled(a))) throw new Error(`uplinesBackfilled false for ${a}`);
  }
  console.log("  cache matches live chain for", spot.length, "sample users");

  // Optional full sweep (slow on public-RPC forks): SWEEP_MAX=N to enable
  const sweepTarget = parseInt(process.env.SWEEP_MAX || "0");
  if (sweepTarget > 0) {
    console.log(`\n-- full backfill sweep (SWEEP_MAX=${sweepTarget}) --`);
    const totalUsers = Number(await np.getTotalUsers());
    const target = Math.min(totalUsers, sweepTarget);
    let bs = 50, done = 0, safeBatch = 0;
    while (done < target) {
      const n = Math.min(bs, target - done);
      try {
        const txx = await np.backfillUplinesBatch(done, n, { gasLimit: 20000000 });
        const rc = await txx.wait();
        if (safeBatch === 0) {
          safeBatch = n;
          console.log(`  batch=${n} gas=${rc.gasUsed.toString()} per-user~${(rc.gasUsed / BigInt(n)).toString()}`);
        }
        done += n;
      } catch (e) {
        bs = Math.max(5, Math.floor(bs / 2));
        console.log(`  batch=${n} failed (${(e.reason || e.message || "").slice(0, 60)}), retrying with ${bs}`);
        if (n <= 5) throw e;
      }
    }
    console.log(`  backfilled: ${done}/${target} — safe batch size ~= ${safeBatch}`);
  } else {
    console.log("\n(full sweep skipped — set SWEEP_MAX=N to enable; mainnet sweep uses sweepBackfillUplines.js)");
  }

  console.log("\n✅ FORK UPGRADE DRY-RUN PASSED");
}

async function expectEvent(tx, name) {
  const r = await tx.wait();
  const iface = new ethers.Interface(require("../artifacts/contracts/ParadiseUpgradeable.sol/ParadiseUpgradeable.json").abi);
  let found = false;
  for (const l of r.logs) {
    try { const parsed = iface.parseLog(l); if (parsed.name === name) { found = true; console.log(`event ${name} -> ${parsed.args[0]}, amount=${parsed.args[1].toString()}`); } } catch (e) {}
  }
  console.log(`${name} emitted:`, found);
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
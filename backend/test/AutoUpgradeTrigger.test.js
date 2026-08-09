const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParadiseUpgradeable - Automatic Upgrade", function () {
  let paradise, paradiseNoFeeds, deployer, user1, user2, user3, dummy1;
  let regFee, level2Cost;

  async function deployProxy(pythAddress) {
    const MockPyth = await ethers.getContractFactory("MockPyth");
    const mockPyth = await MockPyth.deploy(50000000, -8);
    await mockPyth.waitForDeployment();

    const ParadiseUpgradeable = await ethers.getContractFactory("ParadiseUpgradeable");
    const implementation = await ParadiseUpgradeable.deploy();
    await implementation.waitForDeployment();

    const initData = ParadiseUpgradeable.interface.encodeFunctionData("initialize", [
      pythAddress ?? await mockPyth.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroHash,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      "0x00000000"
    ]);

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await ERC1967Proxy.deploy(await implementation.getAddress(), initData);
    await proxy.waitForDeployment();

    return ParadiseUpgradeable.attach(await proxy.getAddress());
  }

  beforeEach(async function () {
    [deployer, user1, user2, user3] = await ethers.getSigners();
    dummy1 = (await ethers.getSigners())[4];

    paradise = await deployProxy(undefined);

    regFee = await paradise.getRegistrationFeeCro();
    level2Cost = await paradise.getLevelUpgradeCostCro(2);

    // Register dummy1 under deployer to exhaust one MAX_LEVELS bonus slot
    await paradise.connect(dummy1).register(deployer.address, deployer.address, [deployer.address], { value: regFee });
  });

  async function reg(user, referrer, placeParent, path, value) {
    return paradise.connect(user).register(referrer, placeParent, path, { value: value ?? regFee });
  }

  // Register a user at level 1 using dummy1's matrix tree (dummy1 has MAX_LEVELS)
  async function regLevel1(user) {
    await reg(user, deployer.address, dummy1.address, [dummy1.address, deployer.address]);
  }

  it("Auto-upgrades to level 2 the moment the reserve fills (no manual call)", async function () {
    await regLevel1(user1);
    expect((await paradise.getUserInfo(user1.address)).level).to.equal(1);

    // First child fills half the level-2 reserve
    await reg(user2, user1.address, user1.address, [user1.address]);
    expect((await paradise.getUserInfo(user1.address)).level).to.equal(1);

    // Second child fills the reserve -> auto-upgrade fires inside the same tx
    const tx = await reg(user3, user1.address, user1.address, [user1.address]);
    const info = await paradise.getUserInfo(user1.address);
    expect(info.level).to.equal(2);

    // Event should be emitted with type "auto"
    await expect(tx).to.emit(paradise, "UserUpgraded").withArgs(user1.address, 2, "auto");
  });

  it("Continues capping the next level reserve after an auto-upgrade", async function () {
    await regLevel1(user1);
    await reg(user2, user1.address, user1.address, [user1.address]);
    await reg(user3, user1.address, user1.address, [user1.address]);

    expect((await paradise.getUserInfo(user1.address)).level).to.equal(2);
    // Reserve for level 2 was consumed by the upgrade; level-3 reserve starts at 0
    expect(await paradise.getReservedBalance(user1.address, 2)).to.equal(0);
    expect(await paradise.getReservedBalance(user1.address, 3)).to.equal(0);
  });

  it("Manual walletUpgrade still works alongside the auto path", async function () {
    await regLevel1(user1);
    await reg(user2, user1.address, user1.address, [user1.address]);
    expect((await paradise.getUserInfo(user1.address)).level).to.equal(1);

    const tx = await paradise.connect(user1).walletUpgrade({ value: level2Cost });
    expect((await paradise.getUserInfo(user1.address)).level).to.equal(2);
    await expect(tx).to.emit(paradise, "UserUpgraded").withArgs(user1.address, 2, "manual");
  });

  it("Manual upgradeFromReserve is skipped when reserve is below cost (no free upgrade)", async function () {
    await regLevel1(user1);
    await reg(user2, user1.address, user1.address, [user1.address]);

    const reserve = await paradise.getReservedBalance(user1.address, 2);
    expect(reserve).to.be.lt(level2Cost);

    await expect(paradise.connect(user1).upgradeFromReserve()).to.be.revertedWith("Insufficient reserve");
  });

  it("Never auto-upgrades for free and never reverts when price feeds are unavailable (cost 0)", async function () {
    paradiseNoFeeds = await deployProxy(ethers.ZeroAddress);
    expect(await paradiseNoFeeds.getRegistrationFeeCro()).to.equal(0);
    expect(await paradiseNoFeeds.getLevelUpgradeCostCro(2)).to.equal(0);

    // register works with a 0 fee; fill the owner bonus slot first so user1 stays level 1
    await paradiseNoFeeds.connect(user3).register(deployer.address, deployer.address, [deployer.address], { value: 0 });
    await paradiseNoFeeds.connect(user1).register(deployer.address, user3.address, [user3.address, deployer.address], { value: 0 });

    // registering a child triggers a payment flow with 0 cost -> no free upgrade, no revert
    await paradiseNoFeeds.connect(user2).register(user1.address, user1.address, [user1.address], { value: 0 });

    const info = await paradiseNoFeeds.getUserInfo(user1.address);
    expect(info.level).to.equal(1);
    expect(await paradiseNoFeeds.getReservedBalance(user1.address, 2)).to.equal(0);
  });

  it("Caps auto-upgrade cascade depth at MAX_AUTO_UPGRADES", async function () {
    // A cascade node at position g[L] along a vertical matrix chain sits exactly where
    // the L-th upgrade's payment lands (each upgrade at level i+1 pays the (i+1)-th upline).
    const maxAuto = Number(await paradise.MAX_AUTO_UPGRADES());
    const g = [0, 0]; // g[1] = 0 (bottom node)
    for (let i = 2; i <= 12; i++) g[i] = g[i - 1] + i;

    // Cascade nodes to build: every level climb up to MAX_LEVELS (11 upgrades), plus one
    // sentinel beyond the cap so the cap can be observed blocking a ready upgrade.
    const N = Math.min(maxAuto + 1, 11);
    const maxPos = g[N];

    const signers = await ethers.getSigners();
    const p = {};
    for (let i = maxPos; i >= 0; i--) {
      const child = signers[5 + i];
      const parent = i === maxPos ? dummy1 : signers[5 + i + 1];
      await reg(child, parent.address, parent.address, [parent.address]);
      p[i] = child;
    }

    const c = {};
    for (let L = 1; L <= N; L++) c[L] = p[g[L]];

    // Place cascade nodes at levels 1..N (c1 stays level 1 from registration)
    for (let L = 2; L <= N; L++) {
      await paradise.connect(deployer).setUserLevel(c[L].address, L);
    }

    const cost = {};
    for (let L = 2; L <= 12; L++) cost[L] = await paradise.getLevelUpgradeCostCro(L);

    // Pre-fund each node's next-level reserve to the tipping point.
    let idx = 5 + maxPos + 1;
    for (let L = 1; L <= N; L++) {
      const V = L === 1 ? cost[2] : 2n * cost[L + 1] - cost[L];
      const fundChild = signers[idx++];
      await reg(fundChild, c[L].address, c[L].address, [c[L].address], V);
    }

    // Trigger: one registration under c1 fills its reserve and fires the cascade.
    const tx = await reg(signers[idx], c[1].address, c[1].address, [c[1].address], cost[2]);
    const receipt = await tx.wait();

    // Exactly min(maxAuto, 11) auto-upgrades fire (level 12 == MAX_LEVELS stops the rest).
    const upgraded = Math.min(maxAuto, 11);
    for (let L = 1; L <= upgraded; L++) {
      expect((await paradise.getUserInfo(c[L].address)).level).to.equal(L + 1);
    }

    // If the cap is below MAX_LEVELS-1, the node right after the cap sat at its upgrade
    // threshold but was blocked by the depth cap (its reserve stayed full).
    if (maxAuto < 11) {
      const sentinel = c[maxAuto + 1];
      expect((await paradise.getUserInfo(sentinel.address)).level).to.equal(maxAuto + 1);
      expect(await paradise.getReservedBalance(sentinel.address, maxAuto + 2)).to.equal(cost[maxAuto + 2]);
    }

    // All UserUpgraded events in the cascade are type "auto".
    const userUpgraded = paradise.interface.getEvent("UserUpgraded");
    const logs = receipt.logs
      .filter((l) => l.topics[0] === userUpgraded.topicHash)
      .map((l) => paradise.interface.parseLog(l));
    expect(logs).to.have.length(upgraded);
    for (const log of logs) {
      expect(log.args.upgradeType).to.equal("auto");
    }
  });

  it("getManualLevelCosts returns all 13 costs in one call", async function () {
    const before = await paradise.getManualLevelCosts();
    expect(before).to.have.length(13);
    expect(before.every((c) => c === 0n)).to.equal(true);

    const costs = Array(13).fill(0n);
    costs[2] = 4000000000000000000n; // level 3 = 4 CRO
    costs[12] = 2048000000000000000000n; // level 12 = 2048 CRO
    await paradise.connect(deployer).setManualCroCosts(1000000000000000000n, costs);
    const after = await paradise.getManualLevelCosts();
    expect(after).to.have.length(13);
    expect(after[2]).to.equal(costs[2]);
    expect(after[12]).to.equal(costs[12]);
  });
});

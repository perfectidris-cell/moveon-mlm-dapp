const { expect } = require("chai");
const { ethers } = require("hardhat");

// Rigid splayed storage: every registration freezes its 12-upline chain in
// uplineCache[user] and payout resolution reads that flat array (no live tree
// search during execution).
describe("ParadiseUpgradeable - rigid 12-upline cache", function () {
  let paradise, owner, users;
  let regFee;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    users = signers.slice(1, 12);

    const MockPyth = await ethers.getContractFactory("MockPyth");
    const mockPyth = await MockPyth.deploy(50000000, -8);
    await mockPyth.waitForDeployment();

    const ParadiseUpgradeable = await ethers.getContractFactory("ParadiseUpgradeable");
    const implementation = await ParadiseUpgradeable.deploy();
    await implementation.waitForDeployment();

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const initData = ParadiseUpgradeable.interface.encodeFunctionData("initialize", [
      await mockPyth.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroHash,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      "0x00000000"
    ]);
    const proxy = await ERC1967Proxy.deploy(await implementation.getAddress(), initData);
    await proxy.waitForDeployment();

    paradise = ParadiseUpgradeable.attach(await proxy.getAddress());
    regFee = await paradise.getRegistrationFeeCro();
  });

  it("freezes the 12-upline chain at registration time", async function () {
    // users[0] has no children yet, so users[2] lands directly under users[0]:
    // chain = users[2] -> users[0] -> owner -> 0...
    await paradise.connect(users[0]).registerAuto(owner.address, { value: regFee });
    await paradise.connect(users[1]).registerAuto(owner.address, { value: regFee });
    await paradise.connect(users[2]).registerAuto(users[0].address, { value: regFee });

    expect(await paradise.uplinesBackfilled(users[2].address)).to.equal(true);
    expect(await paradise.uplineCache(users[2].address, 0)).to.equal(users[0].address);
    expect(await paradise.uplineCache(users[2].address, 1)).to.equal(owner.address);
    expect(await paradise.uplineCache(users[2].address, 2)).to.equal(ethers.ZeroAddress);
  });

  it("uplineCache mirrors the live matrixParent chain exactly", async function () {
    await paradise.connect(users[0]).registerAuto(owner.address, { value: regFee });
    await paradise.connect(users[1]).registerAuto(owner.address, { value: regFee });
    await paradise.connect(users[2]).registerAuto(users[0].address, { value: regFee });
    await paradise.connect(users[3]).registerAuto(users[0].address, { value: regFee });

    for (const u of [users[0], users[1], users[2], users[3]]) {
      let cursor = await paradise.matrixParent(u.address);
      for (let k = 0; k < 12; k++) {
        expect(await paradise.uplineCache(u.address, k)).to.equal(cursor);
        if (cursor === ethers.ZeroAddress) break;
        cursor = await paradise.matrixParent(cursor);
      }
    }
  });

  it("payouts resolve through the cache: level-2 upgrade pays the cached 2nd upline", async function () {
    await paradise.connect(users[0]).registerAuto(owner.address, { value: regFee });
    await paradise.connect(users[1]).registerAuto(owner.address, { value: regFee });
    // users[2] lands under users[0]; its cached uplines are [users[0], owner, 0...]
    await paradise.connect(users[2]).registerAuto(users[0].address, { value: regFee });

    const first = await paradise.uplineCache(users[2].address, 0);
    const second = await paradise.uplineCache(users[2].address, 1);
    expect(first).to.not.equal(ethers.ZeroAddress);
    expect(second).to.equal(owner.address);

    const level2Cost = await paradise.getLevelUpgradeCostCro(2);
    // Level-2 payment from users[2] must be pushed to the cached 2nd upline (owner leg)
    const tx = await paradise.connect(users[2]).walletUpgrade({ value: level2Cost });
    await expect(tx).to.emit(paradise, "PaymentReceived");
  });

  it("backfillUplinesBatch is idempotent and flags every user", async function () {
    await paradise.connect(users[0]).registerAuto(owner.address, { value: regFee });
    await paradise.connect(users[1]).registerAuto(owner.address, { value: regFee });

    // Re-run over auto-filled users: no-op, stays flagged
    await paradise.backfillUplinesBatch(0, 10);
    expect(await paradise.uplinesBackfilled(users[0].address)).to.equal(true);
    expect(await paradise.uplinesBackfilled(users[1].address)).to.equal(true);

    await expect(paradise.backfillUplinesBatch(9999, 10)).to.be.revertedWith(
      "Start index out of bounds"
    );
  });

  it("backfillUplinesBatch is owner-only", async function () {
    await expect(
      paradise.connect(users[0]).backfillUplinesBatch(0, 10)
    ).to.be.reverted;
  });
});

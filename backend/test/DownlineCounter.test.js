const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParadiseUpgradeable - totalDownline counter & backfill", function () {
  let paradise, owner, user1, user2, user3, user4, user5;
  let regFee;

  beforeEach(async function () {
    [owner, user1, user2, user3, user4, user5] = await ethers.getSigners();

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

  function pathFor(addr) {
    return [addr];
  }

  it("increments totalDownline for ALL ancestors on every registration", async function () {
    // owner[u1], u1[u2,u3], u2[u4]
    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user2).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user3).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user4).register(user2.address, user2.address, pathFor(user2.address), { value: regFee });

    // New members never count themselves
    expect(await paradise.totalDownline(user4.address)).to.equal(0);
    // owner has 4 descendants, u1 has 3, u2 has 1, u3 has 0
    expect(await paradise.totalDownline(owner.address)).to.equal(4);
    expect(await paradise.totalDownline(user1.address)).to.equal(3);
    expect(await paradise.totalDownline(user2.address)).to.equal(1);
    expect(await paradise.totalDownline(user3.address)).to.equal(0);
  });

  it("a deep registration updates the count for every upline", async function () {
    // owner[u1,u2], u1[u3], u3[u5]
    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user2).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user3).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user5).register(user3.address, user3.address, pathFor(user3.address), { value: regFee });

    expect(await paradise.totalDownline(user5.address)).to.equal(0);
    expect(await paradise.totalDownline(user3.address)).to.equal(1);
    expect(await paradise.totalDownline(user1.address)).to.equal(2);
    expect(await paradise.totalDownline(user2.address)).to.equal(0);
    expect(await paradise.totalDownline(owner.address)).to.equal(4);
  });

  it("backfillDownlineBatch fills counts for pre-upgrade users from the existing tree", async function () {
    // Build the tree, then backfill OVERWRITES each counter with the tree-derived
    // subtree sum. If the backfill logic (or its ordering) were wrong, the previously
    // correct live-incremented values would be corrupted and these assertions fail.
    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user2).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user3).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user4).register(user2.address, user2.address, pathFor(user2.address), { value: regFee });
    await paradise.connect(user5).register(user4.address, user4.address, pathFor(user4.address), { value: regFee });

    // Process from the highest index downward: userAddresses (after owner) =
    // [user1, user2, user3, user4, user5], so top-down batches
    const totalUsers = Number(await paradise.getTotalUsers());
    await paradise.backfillDownlineBatch(totalUsers - 2, 2); // 4,5
    await paradise.backfillDownlineBatch(totalUsers - 4, 2); // 2,3
    await paradise.backfillDownlineBatch(0, 1);              // owner(base) + user1? no, [0,1)=owner

    // Tree: owner(u1), u1(u2,u3), u2(u4), u4(u5)
    expect(await paradise.totalDownline(user5.address)).to.equal(0);
    expect(await paradise.totalDownline(user4.address)).to.equal(1);
    expect(await paradise.totalDownline(user2.address)).to.equal(2);
    expect(await paradise.totalDownline(user3.address)).to.equal(0);
    expect(await paradise.totalDownline(user1.address)).to.equal(4);
    expect(await paradise.totalDownline(owner.address)).to.equal(5);

    // Re-running is idempotent and never corrupts the counts
    await paradise.backfillDownlineBatch(totalUsers - 2, 2);
    await paradise.backfillDownlineBatch(totalUsers - 4, 2);
    await paradise.backfillDownlineBatch(0, 1);
    expect(await paradise.totalDownline(owner.address)).to.equal(5);
    expect(await paradise.totalDownline(user1.address)).to.equal(4);
    expect(await paradise.totalDownline(user2.address)).to.equal(2);
  });

  it("backfillDownlineBatch is owner-only", async function () {
    await expect(
      paradise.connect(user1).backfillDownlineBatch(0, 1)
    ).to.be.revertedWithCustomError(paradise, "OwnableUnauthorizedAccount");
  });
});
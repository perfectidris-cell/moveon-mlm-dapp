const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParadiseUpgradeable - Settlement creditMigratedReserves", function () {
  let paradise, owner, user1, user2, user3, filler1, filler2;
  let regFee;

  beforeEach(async function () {
    [owner, user1, user2, user3, filler1, filler2] = await ethers.getSigners();

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

    // Exhaust both owner MAX_LEVELS bonus slots so later users register at level 1
    await paradise.connect(filler1).register(owner.address, owner.address, [owner.address], { value: regFee });
    await paradise.connect(filler2).register(owner.address, owner.address, [owner.address], { value: regFee });

    // user1 at level 1 (placement parent filler1, not owner, so no MAX_LEVELS bonus)
    await paradise.connect(user1).register(owner.address, filler1.address, [filler1.address, owner.address], { value: regFee });
  });

  it("credits the credited amount to reservedForUpgrade[level+1]", async function () {
    const amount = ethers.parseEther("10");
    const levelBefore = (await paradise.getUserInfo(user1.address)).level;

    const tx = await paradise.creditMigratedReserves([user1.address], [amount]);
    await expect(tx).to.emit(paradise, "ReserveCredited").withArgs(user1.address, levelBefore + 1n, amount);

    expect(await paradise.getReservedBalance(user1.address, levelBefore + 1n)).to.equal(amount);
    expect(await paradise.getTotalReservedBalance(user1.address)).to.equal(amount);
    expect(await paradise.settlementCredited(user1.address)).to.equal(true);
  });

  it("is idempotent - re-running skips already-credited users", async function () {
    const amount = ethers.parseEther("10");
    await paradise.creditMigratedReserves([user1.address], [amount]);
    // Second call with the same user is skipped, no event, total unchanged
    const tx = await paradise.creditMigratedReserves([user1.address], [amount]);
    await expect(tx).to.not.emit(paradise, "ReserveCredited");
    expect(await paradise.getReservedBalance(user1.address, 2)).to.equal(amount);
  });

  it("reverts for unregistered users", async function () {
    await expect(
      paradise.creditMigratedReserves([user3.address], [1])
    ).to.be.revertedWith("Not reg");
  });

  it("reverts for max-level users", async function () {
    await paradise.connect(owner).setUserLevel(user1.address, 12);
    await expect(
      paradise.creditMigratedReserves([user1.address], [1])
    ).to.be.revertedWith("Max level");
  });

  it("reverts on length mismatch and oversized batches", async function () {
    await expect(
      paradise.creditMigratedReserves([user1.address], [1, 2])
    ).to.be.revertedWith("Length mismatch");

    const manyUsers = Array(51).fill(user1.address);
    const manyAmounts = Array(51).fill(1);
    await expect(
      paradise.creditMigratedReserves(manyUsers, manyAmounts)
    ).to.be.revertedWith("Batch 1-50");
  });

  it("is owner-only", async function () {
    await expect(
      paradise.connect(user1).creditMigratedReserves([user2.address], [1])
    ).to.be.revertedWithCustomError(paradise, "OwnableUnauthorizedAccount");
  });

  it("supports multi-user batches", async function () {
    await paradise.connect(user2).register(user1.address, user1.address, [user1.address], { value: regFee });
    await paradise.connect(user3).register(user1.address, user1.address, [user1.address], { value: regFee });

    const amt1 = ethers.parseEther("5");
    const amt2 = ethers.parseEther("7");
    const tx = await paradise.creditMigratedReserves([user2.address, user3.address], [amt1, amt2]);
    await expect(tx).to.emit(paradise, "ReserveCredited").withArgs(user2.address, 2, amt1);
    await expect(tx).to.emit(paradise, "ReserveCredited").withArgs(user3.address, 2, amt2);

    expect(await paradise.getReservedBalance(user2.address, 2)).to.equal(amt1);
    expect(await paradise.getReservedBalance(user3.address, 2)).to.equal(amt2);
  });
});
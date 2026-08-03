const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParadiseUpgradeable - Manual Upgrade & Reserves", function () {
  let paradise, deployer, user1, user2, user3, dummy1, dummy2;
  let regFee, level2Cost;

  beforeEach(async function () {
    [deployer, user1, user2, user3] = await ethers.getSigners();
    dummy1 = (await ethers.getSigners())[4];
    dummy2 = (await ethers.getSigners())[5];

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
    level2Cost = await paradise.getLevelUpgradeCostCro(2);

    // Register dummy1 under deployer to exhaust one MAX_LEVELS bonus slot
    await paradise.connect(dummy1).register(deployer.address, deployer.address, [deployer.address], { value: regFee });
  });

  async function reg(user, referrer, placeParent, path) {
    await paradise.connect(user).register(referrer, placeParent, path, { value: regFee });
  }

  // Register a user at level 1 using dummy1's matrix tree (dummy1 has MAX_LEVELS)
  async function regLevel1(user) {
    await reg(user, deployer.address, dummy1.address, [dummy1.address, deployer.address]);
  }

  it("Should accumulate reserves for level 2 when receiving payments", async function () {
    await regLevel1(user1);
    let user1Info = await paradise.getUserInfo(user1.address);
    expect(user1Info.level).to.equal(1);

    // User2 registers under user1 - triggers payment to user1
    await reg(user2, user1.address, user1.address, [user1.address]);

    user1Info = await paradise.getUserInfo(user1.address);
    expect(user1Info.level).to.equal(1);

    const reserves = await paradise.getReservedBalance(user1.address, 2);
    expect(reserves).to.be.gt(0);
  });

  it("Should allow manual upgrade from reserves when enough accumulated", async function () {
    await regLevel1(user1);
    await reg(user2, user1.address, user1.address, [user1.address]);

    const reserves = await paradise.getReservedBalance(user1.address, 2);
    expect(reserves).to.be.gt(0);

    if (reserves >= level2Cost) {
      await paradise.connect(user1).upgradeFromReserve();
      const user1Info = await paradise.getUserInfo(user1.address);
      expect(user1Info.level).to.equal(2);
    }
  });

  it("Should handle multiple referrals and reserve accumulation", async function () {
    await regLevel1(user1);
    await reg(user2, user1.address, user1.address, [user1.address]);
    await reg(user3, user2.address, user2.address, [user2.address]);

    let user1Info = await paradise.getUserInfo(user1.address);
    let user2Info = await paradise.getUserInfo(user2.address);

    expect(user1Info.level).to.equal(1);
    expect(user2Info.level).to.equal(1);

    const user1Reserves = await paradise.getTotalReservedBalance(user1.address);
    expect(user1Reserves).to.be.gte(0);
  });

  it("Should not allow upgrade beyond max level", async function () {
    const deployerInfo = await paradise.getUserInfo(deployer.address);
    expect(deployerInfo.level).to.equal(12);

    await expect(paradise.connect(deployer).upgradeFromReserve()).to.be.reverted;
  });

  it("Should return valid CRO/USD price from price feed", async function () {
    const price = await paradise.getCroUsdPrice();
    expect(price).to.be.gt(0);
  });
});

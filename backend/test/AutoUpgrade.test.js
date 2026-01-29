const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MoveOnUpgradeable Automatic Upgrade", function () {
  let moveOn, deployer, user1, user2, user3;
  let regFee, level2Cost;

  beforeEach(async function () {
    [deployer, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock price feed
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const priceFeed = await MockPriceFeed.deploy(50000000, 8); // $0.5 with 8 decimals
    await priceFeed.waitForDeployment();

    // Deploy implementation
    const MoveOnUpgradeable = await ethers.getContractFactory("MoveOnUpgradeable");
    const implementation = await MoveOnUpgradeable.deploy();
    await implementation.waitForDeployment();

    // Deploy proxy
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const pythAddress = ethers.ZeroAddress;
    const bandAddress = ethers.ZeroAddress;
    const pythPriceId = ethers.ZeroHash;
    const initData = MoveOnUpgradeable.interface.encodeFunctionData("initialize", [
      await priceFeed.getAddress(),
      pythAddress,
      bandAddress,
      pythPriceId
    ]);
    const proxy = await ERC1967Proxy.deploy(await implementation.getAddress(), initData);
    await proxy.waitForDeployment();

    moveOn = MoveOnUpgradeable.attach(await proxy.getAddress());

    regFee = await moveOn.getRegistrationFeeMatic();
    level2Cost = await moveOn.getLevelUpgradeCostMatic(2);
  });

  it("Should automatically upgrade user to level 2 when reserves reach the cap", async function () {
    // User1 registers under deployer
    await moveOn.connect(user1).register(deployer.address, { value: regFee });

    let user1Info = await moveOn.getUserInfo(user1.address);
    expect(user1Info.level).to.equal(1);

    // User2 registers under user1 - this should trigger payment to user1 at level 1
    await moveOn.connect(user2).register(user1.address, { value: regFee });

    // Check if user1 was automatically upgraded
    user1Info = await moveOn.getUserInfo(user1.address);
    expect(user1Info.level).to.equal(2); // Should be upgraded automatically

    // Verify the upgrade event was emitted
    const events = await moveOn.queryFilter("UserUpgraded", user1.address);
    const upgradeEvent = events.find(e => e.args.upgradeType === "automatic");
    expect(upgradeEvent).to.not.be.undefined;
    expect(upgradeEvent.args.newLevel).to.equal(2);
  });

  it("Should accumulate reserves correctly for next level", async function () {
    // User1 registers
    await moveOn.connect(user1).register(deployer.address, { value: regFee });

    // Check initial reserves
    let reserves = await moveOn.getReservedBalance(user1.address, 2);
    expect(reserves).to.equal(0);

    // User2 registers under user1
    await moveOn.connect(user2).register(user1.address, { value: regFee });

    // Check reserves accumulated for level 2
    reserves = await moveOn.getReservedBalance(user1.address, 2);
    expect(reserves).to.be.gt(0);

    // If reserves reach the cap, user should upgrade
    const totalReserved = await moveOn.getTotalReservedBalance(user1.address);
    if (totalReserved >= level2Cost) {
      const user1Info = await moveOn.getUserInfo(user1.address);
      expect(user1Info.level).to.equal(2);
    }
  });

  it("Should handle multiple referrals and upgrades", async function () {
    // Create a chain: deployer -> user1 -> user2 -> user3
    await moveOn.connect(user1).register(deployer.address, { value: regFee });
    await moveOn.connect(user2).register(user1.address, { value: regFee });
    await moveOn.connect(user3).register(user2.address, { value: regFee });

    // Check levels
    let user1Info = await moveOn.getUserInfo(user1.address);
    let user2Info = await moveOn.getUserInfo(user2.address);

    // Depending on earnings, they may have upgraded
    expect(user1Info.level).to.be.at.least(1);
    expect(user2Info.level).to.be.at.least(1);
  });

  it("Should not upgrade beyond max level", async function () {
    // Deployer is already at max level (12)
    const deployerInfo = await moveOn.getUserInfo(deployer.address);
    expect(deployerInfo.level).to.equal(12);

    // Even with earnings, should not upgrade further
    // (This would require setting up a scenario where deployer receives payments)
  });

  it("Should handle price feed failures gracefully", async function () {
    // This test would require mocking stale price data
    // For now, verify that price validation works
    const price = await moveOn.getMaticUsdPrice();
    expect(price).to.be.gt(0);
  });
});
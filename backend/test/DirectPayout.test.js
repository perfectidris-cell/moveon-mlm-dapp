const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParadiseUpgradeable - Direct Payouts", function () {
  let paradise, owner, user1, user2, filler1, filler2;
  let regFee;

  beforeEach(async function () {
    [owner, user1, user2, filler1, filler2] = await ethers.getSigners();

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
  });

  it("pays commissions directly to the wallet (PayoutSent, no pending balance)", async function () {
    // user1 at level 1 (placement parent filler1, not owner, so no MAX_LEVELS bonus)
    await paradise.connect(user1).register(owner.address, filler1.address, [filler1.address, owner.address], { value: regFee });
    expect((await paradise.getUserInfo(user1.address)).level).to.equal(1);

    const balanceBefore = await ethers.provider.getBalance(user1.address);
    const payout = regFee / 2n; // 50% of the payment goes to the wallet, 50% to reserve

    // user2 registering under user1 triggers a level-1 commission to user1
    const tx = await paradise.connect(user2).register(user1.address, user1.address, [user1.address], { value: regFee });

    await expect(tx).to.emit(paradise, "PayoutSent").withArgs(user1.address, payout);
    expect(await paradise.emergencyBalances(user1.address)).to.equal(0);

    const balanceAfter = await ethers.provider.getBalance(user1.address);
    expect(balanceAfter - balanceBefore).to.equal(payout);
  });

  it("routes the failed push to emergencyBalances when the wallet rejects CRO (loop does not revert)", async function () {
    const Rejecting = await ethers.getContractFactory("MockRejectingRecipient");
    const rejector = await Rejecting.deploy({ value: regFee });
    await rejector.waitForDeployment();
    const rejectorAddr = await rejector.getAddress();

    // Register the rejecting contract as a level-1 user
    await rejector.register(
      await paradise.getAddress(),
      owner.address,
      filler1.address,
      [filler1.address, owner.address],
      { value: regFee }
    );
    expect((await paradise.getUserInfo(rejectorAddr)).level).to.equal(1);

    const payout = regFee / 2n;

    // user2 registering under the rejecting contract triggers a commission that cannot be pushed —
    // the tx must succeed (loop continues) and the amount lands in emergencyBalances
    const tx = await paradise.connect(user2).register(rejectorAddr, rejectorAddr, [rejectorAddr], { value: regFee });

    await expect(tx).to.emit(paradise, "PayoutDeferred").withArgs(rejectorAddr, payout);
    expect(await paradise.emergencyBalances(rejectorAddr)).to.equal(payout);
    expect(await paradise.pendingWithdrawals(rejectorAddr)).to.equal(0);
  });

  it("escape hatch: claimMissedEarnings() pulls a failed push once the wallet can receive", async function () {
    const Rejecting = await ethers.getContractFactory("MockRejectingRecipient");
    const rejector = await Rejecting.deploy({ value: regFee });
    await rejector.waitForDeployment();
    const rejectorAddr = await rejector.getAddress();

    await rejector.register(
      await paradise.getAddress(),
      owner.address,
      filler1.address,
      [filler1.address, owner.address],
      { value: regFee }
    );

    const payout = regFee / 2n;
    await paradise.connect(user2).register(rejectorAddr, rejectorAddr, [rejectorAddr], { value: regFee });
    expect(await paradise.emergencyBalances(rejectorAddr)).to.equal(payout);

    // Still rejecting: claim reverts explicitly (no silent loss, funds stay ledgered)
    await expect(rejector.claim(await paradise.getAddress())).to.be.reverted;

    // Wallet fixed: full lifecycle completes via the escape hatch
    await rejector.setRejecting(false);
    const balBefore = await ethers.provider.getBalance(rejectorAddr);
    await rejector.claim(await paradise.getAddress());
    expect(await paradise.emergencyBalances(rejectorAddr)).to.equal(0);
    expect(await ethers.provider.getBalance(rejectorAddr)).to.equal(balBefore + payout);
  });

  it("claimMissedEarnings() reverts when there is nothing to claim", async function () {
    await expect(paradise.connect(user1).claimMissedEarnings()).to.be.revertedWith("Nothing to claim");
  });
});
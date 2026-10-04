const { expect } = require("chai");
const { ethers } = require("hardhat");

// Fully on-chain registration: no off-chain placement calculation.
// registerAuto(referrer) finds the balanced slot inside the contract,
// and findNextSlotAndProof(root) returns slot + path proof in ONE view call.
describe("ParadiseUpgradeable - on-chain auto registration", function () {
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

  it("registerAuto places users with zero off-chain reads (single tx)", async function () {
    await paradise.connect(users[0]).registerAuto(owner.address, { value: regFee });
    await paradise.connect(users[1]).registerAuto(owner.address, { value: regFee });

    const info1 = await paradise.getUserInfo(users[0].address);
    const info2 = await paradise.getUserInfo(users[1].address);
    expect(info1.id).to.equal(users[0].address);
    expect(info2.id).to.equal(users[1].address);

    // Both placed directly under owner (2 slots)
    expect(await paradise.matrixParent(users[0].address)).to.equal(owner.address);
    expect(await paradise.matrixParent(users[1].address)).to.equal(owner.address);
  });

  it("registerAuto matches register() placement across a 6-user balanced tree", async function () {
    for (let i = 0; i < 6; i++) {
      await paradise.connect(users[i]).registerAuto(owner.address, { value: regFee });
    }

    // Same balanced outcome as the explicit register() flow:
    // owner full -> user1/user2 filled -> next slot descends to users[2]
    expect(await paradise.findNextSlot(owner.address)).to.equal(users[2].address);
    expect(await paradise.totalDownline(owner.address)).to.equal(6);
    expect(await paradise.totalDownline(users[0].address)).to.equal(2);
    expect(await paradise.totalDownline(users[1].address)).to.equal(2);
  });

  it("findNextSlotAndProof returns the slot + a valid on-chain path in one call", async function () {
    await paradise.connect(users[0]).registerAuto(owner.address, { value: regFee });
    await paradise.connect(users[1]).registerAuto(owner.address, { value: regFee });

    const [slot, path] = await paradise.findNextSlotAndProof(owner.address);
    expect(slot).to.equal(await paradise.findNextSlot(owner.address));

    // Path must chain placement -> ... -> referrer via matrixParent
    expect(path[0]).to.equal(slot);
    expect(path[path.length - 1]).to.equal(owner.address);
    for (let i = 0; i < path.length - 1; i++) {
      expect(await paradise.matrixParent(path[i])).to.equal(path[i + 1]);
    }

    // The returned proof is accepted verbatim by register()
    await paradise.connect(users[2]).register(owner.address, slot, [...path], { value: regFee });
    expect(await paradise.matrixParent(users[2].address)).to.equal(slot);
  });

  it("registerAuto reverts for unregistered referrer and double registration", async function () {
    await expect(
      paradise.connect(users[0]).registerAuto(users[9].address, { value: regFee })
    ).to.be.revertedWith("Ref not reg");

    await paradise.connect(users[0]).registerAuto(owner.address, { value: regFee });
    await expect(
      paradise.connect(users[0]).registerAuto(owner.address, { value: regFee })
    ).to.be.revertedWith("Reg'd");
  });

  it("registerAuto enforces the referral cap on-chain", async function () {
    await paradise.setReferralCap(1);
    await paradise.connect(users[0]).registerAuto(owner.address, { value: regFee });
    await expect(
      paradise.connect(users[1]).registerAuto(owner.address, { value: regFee })
    ).to.be.revertedWith("Ref cap");
  });
});

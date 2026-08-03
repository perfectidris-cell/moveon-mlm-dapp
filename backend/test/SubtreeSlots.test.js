const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParadiseUpgradeable - subtreeSlots & findNextSlot", function () {
  let paradise, owner, user1, user2, user3, user4, user5, user6;
  let regFee;

  beforeEach(async function () {
    [owner, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();

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

  it("Should initialize subtreeSlots[owner] = 2", async function () {
    expect(await paradise.subtreeSlots(owner.address)).to.equal(2);
  });

  it("Should set subtreeSlots = 2 for new user and increment ancestors by 1", async function () {
    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });

    expect(await paradise.subtreeSlots(user1.address)).to.equal(2);
    expect(await paradise.subtreeSlots(owner.address)).to.equal(3);

    await paradise.connect(user2).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });

    expect(await paradise.subtreeSlots(user2.address)).to.equal(2);
    expect(await paradise.subtreeSlots(user1.address)).to.equal(3);
    expect(await paradise.subtreeSlots(owner.address)).to.equal(4);
  });

  it("findNextSlot returns root when root has < 2 children", async function () {
    expect(await paradise.findNextSlot(owner.address)).to.equal(owner.address);

    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    expect(await paradise.findNextSlot(owner.address)).to.equal(owner.address);
  });

  it("findNextSlot walks to child with room when root is full", async function () {
    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user2).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });

    // Owner full → first child (user1) has room → return user1
    const slot = await paradise.findNextSlot(owner.address);
    expect([user1.address, user2.address]).to.include(slot);
  });

  it("findNextSlot returns first node on left path with open slot", async function () {
    // owner → user1 → user3
    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user3).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user2).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });

    // Owner full → user1 (1 kid, has room) → return user1 (not user3)
    expect(await paradise.findNextSlot(owner.address)).to.equal(user1.address);
  });

  it("findNextSlot returns deeper leaf when parents are full", async function () {
    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user2).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user3).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user4).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });

    // Owner full → user1 full → user3 (0 kids, has room) → return user3
    expect(await paradise.findNextSlot(owner.address)).to.equal(user3.address);
  });

  it("findNextSlot with different root returns correct slot for sub-tree", async function () {
    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user2).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user3).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user4).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });

    // user1 full → user3 has room
    expect(await paradise.findNextSlot(user1.address)).to.equal(user3.address);
    // user2 empty → return user2
    expect(await paradise.findNextSlot(user2.address)).to.equal(user2.address);
  });

  it("SubtreeSlots grow correctly through multi-level tree", async function () {
    // Build: owner[u1,u2], u1[u3,u4], u3[u5]
    await paradise.connect(user1).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user2).register(owner.address, owner.address, pathFor(owner.address), { value: regFee });
    await paradise.connect(user3).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user4).register(user1.address, user1.address, pathFor(user1.address), { value: regFee });
    await paradise.connect(user5).register(user3.address, user3.address, pathFor(user3.address), { value: regFee });

    // Leaf checks
    expect(await paradise.subtreeSlots(user2.address)).to.equal(2);
    expect(await paradise.subtreeSlots(user4.address)).to.equal(2);
    expect(await paradise.subtreeSlots(user5.address)).to.equal(2);

    // user3: 2 (init) + 1 (user5 under user3) = 3
    expect(await paradise.subtreeSlots(user3.address)).to.equal(3);

    // user1: 2 (init) + 1 (user3) + 1 (user4) + 1 (user5 via ancestor update) = 5
    expect(await paradise.subtreeSlots(user1.address)).to.equal(5);

    // owner: 2 + 5 registrations = 7
    expect(await paradise.subtreeSlots(owner.address)).to.equal(7);
  });

  it("End-to-end: findNextSlot guides placement and subtreeSlots stay consistent", async function () {
    // Simulate frontend flow: findNextSlot → buildPathProof → register
    // Path proof follows the referrer chain: placement → ... → referrer
    async function registerAtNextSlot(user, referrer) {
      const placement = await paradise.findNextSlot(referrer.address);
      expect(placement).to.not.equal(ethers.ZeroAddress);

      // Build path proof along the referrer chain from placement up to referrer
      const path = [placement];
      let cur = placement;
      while (cur !== referrer.address) {
        const userInfo = await paradise.users(cur);
        cur = userInfo.referrer;
        path.push(cur);
      }
      await paradise.connect(user).register(referrer.address, placement, path, { value: regFee });
    }

    // Register 6 users — all refer to owner, placement guided by findNextSlot
    await registerAtNextSlot(user1, owner); // under owner
    await registerAtNextSlot(user2, owner); // under owner → owner full
    await registerAtNextSlot(user3, owner); // under user1
    await registerAtNextSlot(user4, owner); // under user1 → user1 full
    await registerAtNextSlot(user5, owner); // under user3
    await registerAtNextSlot(user6, owner); // under user3 → user3 full

    // findNextSlot walks left-deep: owner → user1 → user3 → user5 (leaf)
    expect(await paradise.findNextSlot(owner.address)).to.equal(user5.address);

    // subtreeSlots consistency: each registration adds 1 to all ancestors
    // owner: 2 initial + 6 registrations = 8
    expect(await paradise.subtreeSlots(owner.address)).to.equal(8);
    // user1: 2 + 2 (user3, user4) + 2 (ancestor of user5, user6) = 6
    expect(await paradise.subtreeSlots(user1.address)).to.equal(6);
    // user2: 2 + 0 (no kids) = 2
    expect(await paradise.subtreeSlots(user2.address)).to.equal(2);
    // user3: 2 + 2 (user5, user6) = 4
    expect(await paradise.subtreeSlots(user3.address)).to.equal(4);
    // leaves: 2
    expect(await paradise.subtreeSlots(user4.address)).to.equal(2);
    expect(await paradise.subtreeSlots(user5.address)).to.equal(2);
    expect(await paradise.subtreeSlots(user6.address)).to.equal(2);
  });
});

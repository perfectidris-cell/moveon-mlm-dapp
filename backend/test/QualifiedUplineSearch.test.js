const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParadiseUpgradeable - Qualified Upline Search", function () {
    let paradise;
    let owner, u1, u2, u3, u4, u5, u6, u7, u8, u9, u10, dummy1;

    beforeEach(async function () {
        [owner, u1, u2, u3, u4, u5, u6, u7, u8, u9, u10] = await ethers.getSigners();
        dummy1 = (await ethers.getSigners())[11];

        const MockPyth = await ethers.getContractFactory("MockPyth");
        const mockPyth = await MockPyth.deploy(200000000, -8);
        await mockPyth.waitForDeployment();

        const Paradise = await ethers.getContractFactory("ParadiseUpgradeable");
        const implementation = await Paradise.deploy();
        await implementation.waitForDeployment();

        const initData = implementation.interface.encodeFunctionData("initialize", [
            await mockPyth.getAddress(),
            ethers.ZeroAddress,
            ethers.ZeroHash,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            "0x00000000"
        ]);

        const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
        const proxy = await ERC1967Proxy.deploy(await implementation.getAddress(), initData);
        await proxy.waitForDeployment();

        paradise = Paradise.attach(await proxy.getAddress());

        // Register a root user under owner (gets MAX_LEVELS) then downgrade to level 1
        const fee = await paradise.getRegistrationFeeCro();
        await paradise.connect(dummy1).register(owner.address, owner.address, [owner.address], { value: fee });
        await paradise.connect(owner).setUserLevel(dummy1.address, 1);
    });

    // Helper: register a user under referrer (both referrer and placementParent are referrer)
    async function registerUser(user, referrer) {
        const fee = await paradise.getRegistrationFeeCro();
        const path = [referrer.address];
        await paradise.connect(user).register(referrer.address, referrer.address, path, { value: fee });
    }

    // Helper: buy a level (walletUpgrade auto-upgrades to next level using msg.value)
    async function buyLevel(user, level) {
        const cost = await paradise.getLevelUpgradeCostCro(level);
        await paradise.connect(user).walletUpgrade({ value: cost });
    }

    it("Should skip unqualified upline and find qualified upline 3 steps up", async function () {
        // Chain: dummy1(1) -> U1 -> U2 -> U3 -> U4 (will be Lvl 3) -> U5 -> U6 -> U7 (Lvl 1) -> U8 -> U9 -> U10
        await registerUser(u1, dummy1);
        await registerUser(u2, u1);
        await registerUser(u3, u2);
        await registerUser(u4, u3);
        await registerUser(u5, u4);
        await registerUser(u6, u5);
        await registerUser(u7, u6);
        await registerUser(u8, u7);
        await registerUser(u9, u8);
        await registerUser(u10, u9);

        // Upgrade U4 to Level 3
        await buyLevel(u4, 2);
        await buyLevel(u4, 3);

        expect((await paradise.users(u4.address)).level).to.equal(3);
        expect((await paradise.users(u7.address)).level).to.equal(1);

        await buyLevel(u10, 2);

        const ownerInfoBefore = await paradise.getUserInfo(owner.address);
        const u4InfoBefore = await paradise.getUserInfo(u4.address);
        const u7InfoBefore = await paradise.getUserInfo(u7.address);

        const ownerEarningsBefore = ownerInfoBefore.totalEarnings;
        const u4EarningsBefore = u4InfoBefore.totalEarnings;
        const u7EarningsBefore = u7InfoBefore.totalEarnings;

        await buyLevel(u10, 3);

        const ownerInfoAfter = await paradise.getUserInfo(owner.address);
        const u4InfoAfter = await paradise.getUserInfo(u4.address);
        const u7InfoAfter = await paradise.getUserInfo(u7.address);

        const ownerEarningsAfter = ownerInfoAfter.totalEarnings;
        const u4EarningsAfter = u4InfoAfter.totalEarnings;
        const u7EarningsAfter = u7InfoAfter.totalEarnings;

        const level3Cost = await paradise.getLevelUpgradeCostCro(3);
        const tenPercent = level3Cost / 10n;
        const fiftyPercent = level3Cost * 50n / 100n;
        const fortyPercent = level3Cost - tenPercent - fiftyPercent;

        expect(u7EarningsAfter - u7EarningsBefore).to.equal(tenPercent);
        expect(u4EarningsAfter - u4EarningsBefore).to.equal(fiftyPercent);
        expect(ownerEarningsAfter - ownerEarningsBefore).to.equal(fortyPercent);
    });

    it("Should pay 100% to Owner if no qualified upline found in 12-step search", async function () {
        // Chain: dummy1(1) -> U1 -> U2 -> ... -> U10 (all level 1)
        await registerUser(u1, dummy1);
        await registerUser(u2, u1);
        await registerUser(u3, u2);
        await registerUser(u4, u3);
        await registerUser(u5, u4);
        await registerUser(u6, u5);
        await registerUser(u7, u6);
        await registerUser(u8, u7);
        await registerUser(u9, u8);
        await registerUser(u10, u9);

        // All users remain Level 1 — no upgrades

        await buyLevel(u10, 2);
        const level3Cost = await paradise.getLevelUpgradeCostCro(3);

        const u7InfoBefore = await paradise.getUserInfo(u7.address);
        const u1InfoBefore = await paradise.getUserInfo(u1.address);
        const ownerInfoBefore = await paradise.getUserInfo(owner.address);

        await buyLevel(u10, 3);

        const ownerInfoAfter = await paradise.getUserInfo(owner.address);
        const u7InfoAfter = await paradise.getUserInfo(u7.address);
        const u1InfoAfter = await paradise.getUserInfo(u1.address);

        // u1 should get nothing (delta 0)
        expect(u1InfoAfter.totalEarnings - u1InfoBefore.totalEarnings).to.equal(0);

        const tenPercent = level3Cost / 10n;
        expect(u7InfoAfter.totalEarnings - u7InfoBefore.totalEarnings).to.equal(tenPercent);

        // Owner gets 50% + 40% = 90%
        const expectedOwnerTotal = tenPercent * 9n;
        expect(ownerInfoAfter.totalEarnings - ownerInfoBefore.totalEarnings).to.equal(expectedOwnerTotal);
    });
});

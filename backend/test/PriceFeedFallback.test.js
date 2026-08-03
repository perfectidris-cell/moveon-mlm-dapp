const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ParadiseUpgradeable Price Feed Fallback", function () {
    let paradise, pyth, band, supra;
    const pythPriceId = ethers.id("MATIC/USD");

    beforeEach(async function () {
        const [deployer] = await ethers.getSigners();

        // Deploy mocks
        const MockPyth = await ethers.getContractFactory("MockPyth");
        pyth = await MockPyth.deploy(500000, -6); // $0.5 ($0.500000)

        const MockBand = await ethers.getContractFactory("MockBand");
        band = await MockBand.deploy(ethers.parseUnits("0.5", 18)); // $0.5

        const MockSupraRouter = await ethers.getContractFactory("MockSupraRouter");
        supra = await MockSupraRouter.deploy(0, 8); // disabled by default (price=0)

        // Deploy implementation
        const ParadiseUpgradeable = await ethers.getContractFactory("ParadiseUpgradeable");
        const implementation = await ParadiseUpgradeable.deploy();

        // Deploy proxy
        const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
        const initData = ParadiseUpgradeable.interface.encodeFunctionData("initialize", [
            await pyth.getAddress(),
            await band.getAddress(),
            pythPriceId,
            await supra.getAddress(),  // Supra router
            ethers.ZeroAddress,        // Witnet router
            "0x00000000"               // Witnet price ID
        ]);
        const proxy = await ERC1967Proxy.deploy(await implementation.getAddress(), initData);
        paradise = ParadiseUpgradeable.attach(await proxy.getAddress());
    });

    it("Should use Pyth as primary source", async function () {
        // Pyth is first active feed in priority order (Witnet is not configured)
        await pyth.setPrice(600000, -6); // $0.6
        const price = await paradise.getCroUsdPrice();
        expect(price).to.equal(60000000); // 600000 * 100 = 60000000 (8 decimals)
    });

    it("Should fallback to Band if Pyth is stale", async function () {
        await pyth.setPrice(0, -6);

        await band.setRate(ethers.parseUnits("0.7", 18)); // $0.7
        const price = await paradise.getCroUsdPrice();
        expect(price).to.equal(70000000); // 0.7e18 / 1e10 = 70000000
    });

    it("Should fallback to Band if Pyth fails", async function () {
        await pyth.setPrice(0, -6);

        await band.setRate(ethers.parseUnits("0.8", 18)); // $0.8
        const price = await paradise.getCroUsdPrice();
        expect(price).to.equal(80000000);
    });

    it("Should revert if all feeds fail", async function () {
        await supra.setShouldFail(true);
        await pyth.setPrice(0, -6);
        await band.setRate(0);

        await expect(paradise.getCroUsdPrice()).to.be.revertedWith("All price feeds failed or are stale");
    });

    it("Should use Supra as fallback after Band", async function () {
        await pyth.setPrice(0, -6);
        await band.setRate(0);

        await supra.setPrice(9500000); // $0.095 with 8 decimals
        await supra.setDecimals(8);
        const price = await paradise.getCroUsdPrice();
        expect(price).to.equal(9500000);
    });

    it("Should correctly convert Supra price with 6 decimals to 8", async function () {
        await pyth.setPrice(0, -6);
        await band.setRate(0);

        await supra.setPrice(95000);
        await supra.setDecimals(6);
        const price = await paradise.getCroUsdPrice();
        expect(price).to.equal(9500000); // 95000 * 10^(8-6) = 95000 * 100
    });

    it("Should correctly convert Supra price with 10 decimals to 8", async function () {
        await pyth.setPrice(0, -6);
        await band.setRate(0);

        await supra.setPrice(950000000);
        await supra.setDecimals(10);
        const price = await paradise.getCroUsdPrice();
        expect(price).to.equal(9500000); // 950000000 / 10^(10-8) = 950000000 / 100
    });

});

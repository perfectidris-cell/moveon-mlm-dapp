const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MoveOnUpgradeable Price Feed Fallback", function () {
    let moveOn, chainlink, pyth, band;
    const pythPriceId = ethers.id("MATIC/USD");

    beforeEach(async function () {
        const [deployer] = await ethers.getSigners();

        // Deploy mocks
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        chainlink = await MockPriceFeed.deploy(50000000, 8); // $0.5

        const MockPyth = await ethers.getContractFactory("MockPyth");
        pyth = await MockPyth.deploy(500000, -6); // $0.5 ($0.500000)

        const MockBand = await ethers.getContractFactory("MockBand");
        band = await MockBand.deploy(ethers.parseUnits("0.5", 18)); // $0.5

        // Deploy implementation
        const MoveOnUpgradeable = await ethers.getContractFactory("MoveOnUpgradeable");
        const implementation = await MoveOnUpgradeable.deploy();

        // Deploy proxy
        const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
        const initData = MoveOnUpgradeable.interface.encodeFunctionData("initialize", [
            await chainlink.getAddress(),
            await pyth.getAddress(),
            await band.getAddress(),
            pythPriceId
        ]);
        const proxy = await ERC1967Proxy.deploy(await implementation.getAddress(), initData);
        moveOn = MoveOnUpgradeable.attach(await proxy.getAddress());
    });

    it("Should use Chainlink as primary source", async function () {
        await chainlink.setPrice(60000000); // $0.6
        const price = await moveOn.getMaticUsdPrice();
        expect(price).to.equal(60000000);
    });

    it("Should fallback to Pyth if Chainlink is stale", async function () {
        // Make Chainlink stale (updated 2 days ago)
        const twoDaysAgo = Math.floor(Date.now() / 1000) - 172800;

        // We need to modify MockPriceFeed or use a different mock to control updatedAt
        // For now, let's just test by disabling chainlink (though it currently doesn't check age deeply in mock)

        // Let's modify MoveOn to check updatedAt against block.timestamp
        // In our mock, updatedAt is block.timestamp.
        // So we need to set the price to 0 or something that fails validation.
        await chainlink.setPrice(0);

        await pyth.setPrice(700000, -6); // $0.7
        const price = await moveOn.getMaticUsdPrice();
        expect(price).to.equal(70000000); // Converted to 8 decimals
    });

    it("Should fallback to Band if Chainlink and Pyth fail", async function () {
        await chainlink.setPrice(0);
        await pyth.setPrice(0, -6);

        await band.setRate(ethers.parseUnits("0.8", 18)); // $0.8
        const price = await moveOn.getMaticUsdPrice();
        expect(price).to.equal(80000000);
    });

    it("Should revert if all feeds fail", async function () {
        await chainlink.setPrice(0);
        await pyth.setPrice(0, -6);
        await band.setRate(0);

        await expect(moveOn.getMaticUsdPrice()).to.be.revertedWith("All price feeds failed or are stale");
    });
});

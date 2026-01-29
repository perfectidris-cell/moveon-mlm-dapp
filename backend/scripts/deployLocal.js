const hre = require("hardhat");

async function main() {
    console.log("🚀 Deploying contracts to localhost...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    try {
        // Deploy Mock Price Feed first
        console.log("\n📈 Deploying Mock Price Feed...");
        const MockPriceFeed = await hre.ethers.getContractFactory("MockPriceFeed");

        // Set MATIC price to $0.50 (50 cents) with 8 decimals: 0.5 * 10^8 = 50000000
        const mockPriceFeed = await MockPriceFeed.deploy(50000000, 8);
        await mockPriceFeed.waitForDeployment();
        const priceFeedAddress = await mockPriceFeed.getAddress();

        console.log("✅ Mock Price Feed deployed at:", priceFeedAddress);

        // Deploy MoveOnEnhanced with the mock price feed
        console.log("\n🏗️  Deploying MoveOnEnhanced...");
        const MoveOnEnhanced = await hre.ethers.getContractFactory("MoveOnEnhanced");
        const moveOnEnhanced = await MoveOnEnhanced.deploy(priceFeedAddress);

        await moveOnEnhanced.waitForDeployment();
        const contractAddress = await moveOnEnhanced.getAddress();

        console.log("✅ MoveOnEnhanced deployed at:", contractAddress);

        // Verify deployment
        const owner = await moveOnEnhanced.owner();
        console.log("Contract owner:", owner);

        const contractVersion = await moveOnEnhanced.contractVersion();
        console.log("Contract version:", contractVersion.toString());

        const maticPrice = await moveOnEnhanced.getMaticUsdPrice();
        console.log("MATIC/USD price:", hre.ethers.formatUnits(maticPrice, 8));

        const regFee = await moveOnEnhanced.getRegistrationFeeMatic();
        console.log("Registration fee:", hre.ethers.formatEther(regFee), "MATIC");

        console.log("\n🎉 LOCAL DEPLOYMENT SUCCESSFUL!");
        console.log("📝 Contract Details:");
        console.log("- MoveOnEnhanced Address:", contractAddress);
        console.log("- Mock Price Feed Address:", priceFeedAddress);
        console.log("- Owner:", owner);
        console.log("- Registration Fee:", hre.ethers.formatEther(regFee), "MATIC");

        // Save addresses for frontend
        const fs = require("fs");
        const addresses = {
            contractAddress,
            priceFeedAddress,
            network: "localhost"
        };

        fs.writeFileSync("./deployed-addresses.json", JSON.stringify(addresses, null, 2));
        console.log("📄 Addresses saved to deployed-addresses.json");

        return { contractAddress, priceFeedAddress };

    } catch (error) {
        console.error("❌ Deployment failed:");
        console.error(error.message);
        throw error;
    }
}

main()
    .then(() => {
        console.log("\n✅ LOCAL DEPLOYMENT COMPLETED!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Deployment script failed:", error.message);
        process.exit(1);
    });
const hre = require("hardhat");

const PROXY_ADDRESS = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Calling initOwner with account:", deployer.address);

    const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY_ADDRESS);

    // Check current state
    const totalUsersBefore = await paradise.getTotalUsers();
    console.log("Total users before:", totalUsersBefore.toString());

    // Call initOwner
    console.log("\nCalling initOwner()...");
    const tx = await paradise.initOwner({ gasLimit: 200000 });
    const receipt = await tx.wait();
    console.log("✅ initOwner confirmed in block:", receipt.blockNumber);
    console.log("   Gas used:", receipt.gasUsed.toString());
    console.log("   Tx hash:", receipt.hash);

    // Verify
    const totalUsersAfter = await paradise.getTotalUsers();
    console.log("\nTotal users after:", totalUsersAfter.toString());

    const ownerInfo = await paradise.getUserInfo(deployer.address);
    console.log("Owner ID:", ownerInfo.id);
    console.log("Owner Level:", ownerInfo.level.toString());

    // Also check registration fee
    const fee = await paradise.getRegistrationFeeCro();
    console.log("\nRegistration fee:", hre.ethers.formatEther(fee), "CRO");

    console.log("\n🎉 Owner initialization complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ initOwner failed:", error.message);
        process.exit(1);
    });

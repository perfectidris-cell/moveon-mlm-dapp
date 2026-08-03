const hre = require("hardhat");

async function main() {
    const PROXY_ADDRESS = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
    const [deployer] = await hre.ethers.getSigners();
    const paradise = await hre.ethers.getContractAt("ParadiseUpgradeable", PROXY_ADDRESS);
    
    try {
        console.log("Calling getUserFinancialInfo...");
        const finInfo = await paradise.getUserFinancialInfo(deployer.address);
        console.log("Fin Info:", finInfo);
    } catch (err) {
        console.error("getUserFinancialInfo Error:", err.message);
    }
    
    try {
        console.log("Calling getRegistrationFeeCro...");
        const fee = await paradise.getRegistrationFeeCro();
        console.log("Fee:", fee.toString());
    } catch (err) {
        console.error("getRegistrationFeeCro Error:", err.message);
    }
}

main().catch(console.error);

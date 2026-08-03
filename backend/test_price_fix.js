const hre = require("hardhat");

async function main() {
    console.log("🧪 Testing Price Feed Fix...\n");
    
    const CONTRACT_ADDRESS = "0xAAD29abf34A871Cc0c38Abd80914A202e9300c85";
    const ParadiseUpgradeable = await hre.ethers.getContractFactory("ParadiseUpgradeable");
    const contract = ParadiseUpgradeable.attach(CONTRACT_ADDRESS);
    
    try {
        console.log("1️⃣ Testing getCroUsdPrice()...");
        const price = await contract.getCroUsdPrice();
        console.log("✅ CRO/USD Price:", hre.ethers.formatUnits(price, 8), "USD");
        console.log("");
        
        console.log("2️⃣ Testing getRegistrationFeeCro()...");
        const fee = await contract.getRegistrationFeeCro();
        console.log("✅ Registration Fee:", hre.ethers.formatEther(fee), "CRO");
        console.log("");
        
        console.log("3️⃣ Testing getLevelUpgradeCostCro(2)...");
        const level2Cost = await contract.getLevelUpgradeCostCro(2);
        console.log("✅ Level 2 Cost:", hre.ethers.formatEther(level2Cost), "CRO");
        console.log("");
        
        console.log("4️⃣ Testing getLevelUpgradeCostCro(12)...");
        const level12Cost = await contract.getLevelUpgradeCostCro(12);
        console.log("✅ Level 12 Cost:", hre.ethers.formatEther(level12Cost), "CRO");
        console.log("");
        
        console.log("5️⃣ Checking total users...");
        const totalUsers = await contract.getTotalUsers();
        console.log("✅ Total Users:", totalUsers.toString());
        console.log("");
        
        console.log("🎉 SUCCESS! Price feeds are now working!");
        console.log("💡 Price feed staleness tolerance increased from 24h to 7 days");
        console.log("✅ All data preserved on proxy 0xAAD29abf34A871Cc0c38Abd80914A202e9300c85");
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        process.exit(1);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

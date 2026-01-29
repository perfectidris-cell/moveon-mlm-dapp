const hre = require("hardhat");

async function main() {
    const ADDR1 = "0x56e009d0e049ed8c1140Ca0Cb0168A462f950E97"; // In config.ts
    const ADDR2 = "0xDea6B53977D4e0Ac5d5977A3296ccf0c2d884bcD"; // In MIGRATION_SUMMARY.md
    
    const [owner] = await hre.ethers.getSigners();
    
    console.log("Checking addresses...");
    console.log("Using account:", owner.address);

    const check = async (addr, name) => {
        console.log(`\n--- Checking ${name} at ${addr} ---`);
        const code = await hre.ethers.provider.getCode(addr);
        if (code === "0x") {
            console.log("❌ No code found.");
            return;
        }
        console.log("✅ Code found.");
        
        try {
            // Try different contract names just in case
            let MoveOn;
            try {
                MoveOn = await hre.ethers.getContractAt("MoveOnMLM", addr);
            } catch (e) {
                MoveOn = await hre.ethers.getContractAt("MoveOnSimple", addr);
            }
            
            const ownerAddr = await MoveOn.owner();
            console.log("Contract Owner:", ownerAddr);
            
            const userInfo = await MoveOn.getUserInfo(ownerAddr);
            console.log("User Info for owner:", userInfo.id);
            console.log("Owner Level:", userInfo.level.toString());
            
        } catch (err) {
            console.error("❌ Error calling contract:", err.message);
        }
    };

    await check(ADDR1, "Config Address");
    await check(ADDR2, "Migration Summary Address");
}

main().catch(console.error);

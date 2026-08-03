const hre = require("hardhat");

async function main() {
    // Example: EXPECTED_CHAIN_ID=25 npx hardhat run scripts/checkAddress.js --network cronos
    const EXPECTED_CHAIN_ID = process.env.EXPECTED_CHAIN_ID
        ? Number(process.env.EXPECTED_CHAIN_ID)
        : 25; // Cronos Mainnet

    const ADDR1 = "0x56e009d0e049ed8c1140Ca0Cb0168A462f950E97"; // In config.ts
    const ADDR2 = "0xDea6B53977D4e0Ac5d5977A3296ccf0c2d884bcD"; // In MIGRATION_SUMMARY.md

    const [owner] = await hre.ethers.getSigners();
    const network = await hre.ethers.provider.getNetwork();

    console.log("Checking addresses...");
    console.log(`Using account: ${owner.address}`);
    console.log(`Hardhat network: ${hre.network.name}`);
    console.log(`Provider chainId: ${network.chainId}`);

    if (Number(network.chainId) !== Number(EXPECTED_CHAIN_ID)) {
        throw new Error(
            `checkAddress.js refusing to run on wrong chainId. Expected ${EXPECTED_CHAIN_ID}, got ${network.chainId}. ` +
                `Run with --network cronos (or set EXPECTED_CHAIN_ID).`
        );
    }

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
            let Paradise;
            try {
                Paradise = await hre.ethers.getContractAt("ParadiseMLM", addr);
            } catch (e) {
                Paradise = await hre.ethers.getContractAt("ParadiseSimple", addr);
            }

            const contractOwner = await Paradise.owner();
            console.log("Contract Owner:", contractOwner);

            const userInfo = await Paradise.getUserInfo(contractOwner);
            console.log("User Info for owner:", userInfo.id);
            console.log("Owner Level:", userInfo.level.toString());
        } catch (err) {
            console.error("❌ Error calling contract:", err.message);
        }
    };

    await check(ADDR1, "Config Address");
    await check(ADDR2, "Migration Summary Address");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});


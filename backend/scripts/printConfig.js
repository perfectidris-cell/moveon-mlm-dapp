const cn = hre.config.networks.hardhat;
console.log("chains keys:", [...cn.chains.keys()]);
console.log("hardfork:", cn.hardfork);

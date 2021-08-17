const hre = require("hardhat");
const fs = require("fs");
const { notify } = require('./notify')

async function main() {
  const deployed = JSON.parse(fs.readFileSync('./utils/migrated.137.json', 'utf8'))
  const Strategy = await hre.ethers.getContractFactory("AaveStrategy")

  let strategy, hf;

  for (let currency in deployed) {
    strategy = Strategy.attach(deployed[currency].strategy)
    hf = await strategy.currentHealthFactor()

    if (hf < 1.05e18) {
      await notify(`Healthfactor ${currency}: ${hf / 1e18}`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

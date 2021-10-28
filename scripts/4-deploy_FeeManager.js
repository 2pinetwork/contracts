const hre = require("hardhat");
const fs = require("fs");
const { verify } = require('./verify');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

async function main() {
  const args = [
    deploy.treasury, // treasury
    deploy.PiVault,  // PiVault
    deploy.exchange  // exchange
  ]
  const contract = await (
    await hre.ethers.getContractFactory('FeeManager')
  ).deploy(...args);

  await contract.deployed();
  await verify('FeeManager', contract.address, args)

  deploy.FeeManager = contract.address

  // Falta el oraculo

  // ensure write
  fs.writeFileSync('utils/deploy.json', JSON.stringify(deploy, undefined, 2))

  await (await contract.setSwapSlippageRatio(9999)).wait() // mumbai LP's are not balanced
  await (await contract.setMaxPriceOffset(24 * 3600)).wait() // mumbai has ~1 hour of delay

  for (let c in deploy.chainlink) {
    await (await contract.setPriceFeed(c, deploy.chainlink[c])).wait()
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

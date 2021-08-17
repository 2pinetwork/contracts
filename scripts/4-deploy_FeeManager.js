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

  fs.writeFileSync('utils/deploy.json', JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

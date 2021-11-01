const hre = require('hardhat');
const fs = require('fs');
const { verify } = require('./verify');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

const main = async () => {
  const args = [
    deploy.LPs['DAI-LP'].address,
    deploy.PiToken
  ]
  const contract = await (
    await hre.ethers.getContractFactory('PiOracle')
  ).deploy(...args);

  await contract.deployed();
  await verify('PiOracle', contract.address, args)

  deploy.PiOracle = contract.address

  fs.writeFileSync('utils/deploy.json', JSON.stringify(deploy, undefined, 2))

  const feeMgr = await (
    await hre.ethers.getContractFactory('FeeManager')
  ).attach(deploy.FeeManager);

  await (await feeMgr.setPriceFeed(deploy.PiToken, contract.address)).wait()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

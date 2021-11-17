const hre = require('hardhat');
const fs = require('fs');
const { verify } = require('./verify');

const main = async () => {
  const chainId = hre.network.config.network_id
  const deploy = JSON.parse(
    fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8')
  )
  const args = [
    deploy.LPs['2Pi-DAI'].address,
    deploy.PiToken
  ]
  const contract = await (
    await hre.ethers.getContractFactory('PiOracle')
  ).deploy(...args);

  await contract.deployed();
  await verify('PiOracle', contract.address, args)

  deploy.PiOracle = contract.address

  fs.writeFileSync(`utils/deploy.${chainId}.json`, JSON.stringify(deploy, undefined, 2))

  console.log('Waiting 60s and updating oracle price')
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  await delay(61000) // wait 60s to add an oracle price
  await (await contract.update()).wait()

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

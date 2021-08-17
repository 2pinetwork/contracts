/* global process */
/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
const SuperfluidSDK = require('@superfluid-finance/js-sdk');
const { verify } = require('./verify');

const deploy = JSON.parse(
  fs.readFileSync('utils/mumbai_data.json', 'utf8')
)

const main = async function () {
  const contract = await (await hre.ethers.getContractFactory('PiToken')).deploy()
  await contract.deployed();

  await verify('PiToken', contract.address)

  let sf = new SuperfluidSDK.Framework({ web3: web3 })
  await sf.initialize();

  const superTokenFactory = await sf.contracts.ISuperTokenFactory.at(
    await sf.host.getSuperTokenFactory.call()
  );

  await superTokenFactory.initializeCustomSuperToken(contract.address);

  await contract.init()

  deploy.PiToken = contract.address

  fs.writeFileSync('utils/deploy.json', JSON.stringify(deploy, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

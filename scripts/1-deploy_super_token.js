/* global ethers, web3, process */
/* eslint no-console: 0 */
const hre = require('hardhat');
const SuperfluidSDK = require('@superfluid-finance/js-sdk');
const { verify } = require('./verify');

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

  const piToken = await ethers.getContractAt('IPiToken', contract.address)

  await piToken.init()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

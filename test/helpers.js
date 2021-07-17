/* global hre, web3, artifacts, ethers, expect, network */
const deployFramework = require('@superfluid-finance/ethereum-contracts/scripts/deploy-framework');
const { Framework } = require('@superfluid-finance/js-sdk');

const errorHandler = err => {
  if (err) throw err;
};

const toNumber = function (value) {
  // Needed for BigNumber lib
  return value.toLocaleString('fullwide', { useGrouping: false })
}

const mineNTimes = async (n) => {
  for (let i = 0; i < n; i++) {
    await network.provider.send('evm_mine')
  }
}

const getBlock = async () => {
  return (await hre.ethers.provider.getBlock()).number
}

const erc1820 = async () => {
  const IERC1820Registry = artifacts.require('IERC1820Registry');

  return await IERC1820Registry.at(
    '0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24'
  );
}

const initSuperFluid = async (owner) => {
  await deployFramework(errorHandler, { web3: web3, from: owner.address });
  const sf = new Framework({ web3: web3, version: 'test' });
  await sf.initialize()

  const superTokenFactory = await sf.contracts.ISuperTokenFactory.at(
    await sf.host.getSuperTokenFactory.call()
  );

  return superTokenFactory
}

const createPiToken = async (owner, superTokenFactory) => {
  let piToken = await (await ethers.getContractFactory('PiToken')).deploy();
  await piToken.deployed();

  await superTokenFactory.initializeCustomSuperToken(piToken.address);
  piToken = await ethers.getContractAt('IPiToken', piToken.address)

  const MAX_SUPPLY = parseInt(await piToken.MAX_SUPPLY(), 10)

  expect(await piToken.totalSupply()).to.equal(0)
  expect(await piToken.balanceOf(owner.address)).to.equal(0)
  expect(await piToken.cap()).to.equal(toNumber(MAX_SUPPLY))

  await (await piToken.init()).wait()

  return piToken
}

module.exports = {
  toNumber, initSuperFluid, erc1820, getBlock, mineNTimes,
  createPiToken
}

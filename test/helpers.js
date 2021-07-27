const deployFramework = require('@superfluid-finance/ethereum-contracts/scripts/deploy-framework');
const { Framework } = require('@superfluid-finance/js-sdk');

const { expect } = require('chai')
global.BigNumber = require('bignumber.js')
global.expect = expect

// Global setup for all the test-set
before(async () => {
  global.owner = (await ethers.getSigners())[0]

  const errorHandler = err => {
    if (err) throw err;
  };
  await deployFramework(errorHandler, { web3: web3, from: owner.address });
  const sf = new Framework({ web3: web3, version: 'test' });
  await sf.initialize()

  // global variable is like "window"
  global.superTokenFactory = await sf.contracts.ISuperTokenFactory.at(
    await sf.host.getSuperTokenFactory.call()
  );

  // Not change signer because if the deployer/nonce changes
  // the deployed address will change too
  // All signers have 10k ETH
  const wmaticOwner = (await ethers.getSigners())[5]
  const wmatic = await (await ethers.getContractFactory('WETHMock')).connect(wmaticOwner).deploy()
  await wmatic.deployed()

  expect(wmatic.address).to.be.equal('0x0116686E2291dbd5e317F47faDBFb43B599786Ef')

  global.WMATIC = wmatic
});

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

const waitFor = async (fn) => {
  let w = await fn

  await w.wait()

  return w
}

const deploy = async (name, ...args) => {
  const contract = await (await ethers.getContractFactory(name)).deploy(...args)

  await contract.deployed()

  return contract
}

const createPiToken = async (mocked) => {
  const contractName = mocked ? 'PiTokenMock' : 'PiToken'
  let piToken = await deploy(contractName);
  await piToken.deployed();

  await global.superTokenFactory.initializeCustomSuperToken(piToken.address);
  piToken = await ethers.getContractAt('IPiTokenMocked', piToken.address)

  const MAX_SUPPLY = parseInt(await piToken.MAX_SUPPLY(), 10)

  expect(await piToken.totalSupply()).to.equal(0)
  expect(await piToken.balanceOf(owner.address)).to.equal(0)
  expect(await piToken.cap()).to.equal(toNumber(MAX_SUPPLY))

  await (await piToken.init()).wait()

  return piToken
}

const zeroAddress = '0x' + '0'.repeat(40)

const expectedOnlyAdmin = async (fn, ...args) => {
  await expect(fn(...args)).to.be.revertedWith('Only admin');
}

const sleep = (s) => new Promise(resolve => setTimeout(resolve, s * 1000));

const impersonateContract = async (addr) => {
  // Fill with gas 10k eth
  const balance = ethers.BigNumber.from('1' + '0'.repeat(23))._hex

  await network.provider.send('hardhat_setBalance', [addr, balance])

  // Tell hardhat what address enables to impersonate
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [addr],
  })
  // return the impersonated signer
  return await ethers.getSigner(addr)
}

module.exports = {
  toNumber, getBlock, mineNTimes,
  createPiToken, waitFor, deploy, zeroAddress, expectedOnlyAdmin,
  sleep, impersonateContract
}

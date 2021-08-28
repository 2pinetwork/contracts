/* eslint no-console: 0 */
const deployFramework = require('@superfluid-finance/ethereum-contracts/scripts/deploy-framework');
const { Framework } = require('@superfluid-finance/js-sdk');

const { expect } = require('chai')
global.BigNumber = require('bignumber.js')
global.expect = expect


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

const deployWithMainDeployer = async (name, ...args) => {
  const contract = await (await ethers.getContractFactory(name)).connect(global.deployer).deploy(...args)

  await contract.deployed()

  return contract
}

const createPiToken = async (mocked, withDeployer) => {
  const contractName = mocked ? 'PiTokenMock' : 'PiToken'
  let piToken

  if (withDeployer)
    piToken = await deployWithMainDeployer(contractName);
  else
    piToken = await deploy(contractName)

  await piToken.deployed();

  await global.superTokenFactory.initializeCustomSuperToken(piToken.address);
  piToken = await ethers.getContractAt('IPiTokenMocked', piToken.address)

  if (withDeployer)
    piToken = piToken.connect(global.deployer)

  const MAX_SUPPLY = parseInt(await piToken.MAX_SUPPLY(), 10)

  expect(await piToken.totalSupply()).to.equal(0)
  expect(await piToken.balanceOf(owner.address)).to.equal(0)
  expect(await piToken.cap()).to.equal(toNumber(MAX_SUPPLY))

  await (await piToken.init()).wait()

  return piToken
}

const createController = async (token, archimedes) => {
  const controller = await deploy(
    'Controller',
    token.address,
    archimedes.address,
    owner.address
  )

  const strategy = await deploy(
    'ControllerAaveStrat',
    token.address,
    0,
    100,
    0,
    0,
    controller.address,
    global.exchange.address,
    owner.address
  )

  await waitFor(controller.setStrategy(strategy.address))

  return controller
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

const MAX_UINT = '115792089237316195423570985008687907853269984665640564039457584007913129639935'

module.exports = {
  toNumber, getBlock, mineNTimes,
  createPiToken, waitFor, deploy, zeroAddress, expectedOnlyAdmin,
  sleep, impersonateContract, createController, MAX_UINT
}

// Global setup for all the test-set
before(async () => {
  global.owner = await ethers.getSigner('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') // first hardhat account
  global.deployer = await ethers.getSigner('0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199') // last hardhat account

  // First deploy the non-superfluid dependencies
  // DEPLOY WETH-WMATIC-Wlike token
  // Not change signer because if the deployer/nonce changes
  // the deployed address will change too
  // All signers have 10k ETH
  console.log('Deploying WMatic')
  global.WMATIC = await deployWithMainDeployer('WETHMock')
  expect(global.WMATIC.address).to.be.equal('0x73511669fd4dE447feD18BB79bAFeAC93aB7F31f')

  // DEPLOY exchange
  console.log('Deploying Exchange')
  global.exchange = await deployWithMainDeployer('UniswapRouterMock')
  expect(global.exchange.address).to.be.equal('0xB581C9264f59BF0289fA76D61B2D0746dCE3C30D')

  // DEPLOY Aave complement contracts
  console.log('Deploying Aave')
  global.Aave = {}
  global.Aave.incentivesController = await deployWithMainDeployer('IncentivesControllerMock')
  expect(global.Aave.incentivesController.address).to.be.equal('0xC469e7aE4aD962c30c7111dc580B4adbc7E914DD')

  global.Aave.dataProvider = await deployWithMainDeployer('DataProviderMock')
  expect(global.Aave.dataProvider.address).to.be.equal('0x43ca3D2C94be00692D207C6A1e60D8B325c6f12f')

  global.Aave.pool = await deployWithMainDeployer('PoolMock')
  expect(global.Aave.pool.address).to.be.equal('0xb09da8a5B236fE0295A345035287e80bb0008290')

  // DEPLOY SuperFluid framework
  const errorHandler = err => {
    if (err) throw err;
  };


  await deployFramework(errorHandler, { web3: web3, from: global.deployer.address });
  const sf = new Framework({ web3: web3, version: 'test' });
  await sf.initialize()

  // global variable is like "window"
  global.superTokenFactory = await sf.contracts.ISuperTokenFactory.at(
    await sf.host.getSuperTokenFactory.call()
  );

  // DEPLOY PiToken
  console.log('Deploying PiToken')
  global.PiToken = await createPiToken(false, true)
  expect(global.PiToken.address).to.be.equal('0xBF4fD550c7BD3Cf6eC6A0b30bD4c8e603bbC16a8')

  console.log('===============  SETUP DONE  ===============\n\n')
})

afterEach(async () => {
  await (await global.Aave.pool.reset()).wait()
  await (await global.Aave.dataProvider.reset()).wait()
})

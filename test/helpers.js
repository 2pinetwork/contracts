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

const createPiToken = async ({ tokenContract, withDeployer } = {}) => {
  let piToken
  const contractName = tokenContract || 'TestPiToken'

  if (withDeployer) {
    piToken = await deployWithMainDeployer(contractName)
  } else {
    piToken = await deploy(contractName)
  }

  await piToken.deployed()

  if (contractName !== 'TestPiToken') {
    await global.superTokenFactory.initializeCustomSuperToken(piToken.address)

    piToken = await ethers.getContractAt('IPiTokenMocked', piToken.address)

    if (withDeployer) {
      piToken = piToken.connect(global.deployer)
    }

    const MAX_SUPPLY = parseInt(await piToken.MAX_SUPPLY(), 10)

    expect(await piToken.totalSupply()).to.equal(0)
    expect(await piToken.balanceOf(owner.address)).to.equal(0)
    expect(await piToken.cap()).to.equal(toNumber(MAX_SUPPLY))

    await expect(piToken.init()).to.emit(piToken, 'Minted')
  }

  return piToken
}

const createController = async (token, archimedes, stratName) => {
  let shareName = `2pi-${await token.symbol()}`
  if (stratName == 'ControllerLPWithoutStrat') {
    let pair = await hre.ethers.getContractAt('IUniswapPair', token.address)
    let token0 = await hre.ethers.getContractAt('@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata', await pair.token0())
    let token1 = await hre.ethers.getContractAt('@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata', await pair.token1())

    shareName += `-${await token0.symbol()}-${await token1.symbol()}`
  }

  const controller = await deploy(
    'Controller',
    token.address,
    archimedes.address,
    owner.address,
    shareName
  )

  let strategy

  stratName = stratName || 'ControllerAaveStrat'

  switch (stratName) {
      case 'ControllerAaveStrat':
        let args =  [
          0,
          10000,
          0,
          0,
          controller.address,
          global.exchange.address,
          owner.address
        ]

        if (process.env.HARDHAT_INTEGRATION_TESTS) {
          let decimals = parseInt(await token.decimals(), 10)

          args = [
            4800,
            5000,
            8,
            (10 ** (decimals - 3)),
            controller.address,
            global.exchange.address,
            owner.address
          ]
        }

        strategy = await deploy(
          'ControllerAaveStrat',
          token.address,
          ...args
        )
        break
      case 'ControllerCurveStrat':
        strategy = await deploy(
          'ControllerCurveStrat',
          controller.address,
          global.exchange.address,
          owner.address
        )
        break
      case 'ControllerLPWithoutStrat':
        strategy = await deploy(
          'ControllerLPWithoutStrat',
          controller.address,
          token.address
        )
        break
      case 'ControllerEllipsisStrat':
        strategy = await deploy(
          'ControllerEllipsisStrat',
          token.address,
          controller.address,
          global.exchange.address,
          owner.address
        )
        break
      case 'ControllerEllipsisLPStrat':
        strategy = await deploy(
          'ControllerEllipsisLPStrat',
          token.address,
          11, // BNB/BNB-L pool ID
          0, // BNB token index
          '0x5781041F9Cf18484533F433Cb2Ea9ad42e117B3a', // BNB pool token
          '0xc377e2648E5adD3F1CB51a8B77dBEb63Bd52c874', // BNB/BNB-L pool
          controller.address,
          global.exchange.address,
          owner.address
        )
        break
      case 'ControllerBalancerV2Strat':
        strategy = await deploy(
          'ControllerBalancerV2Strat',
          '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
          '0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012',
          token.address,
          controller.address,
          global.exchange.address,
          owner.address
        )
        break
  }

  await waitFor(controller.setStrategy(strategy.address))

  return controller
}

const zeroAddress = '0x' + '0'.repeat(40)

const expectedOnlyAdmin = async (fn, ...args) => {
  await expect(fn(...args)).to.be.revertedWith('Not an admin');
}

const sleep = (s) => new Promise(resolve => setTimeout(resolve, s * 1000));

const impersonateContract = async (addr) => {
  // Fill with gas 10k eth
  const balance = ethers.BigNumber.from('1' + '0'.repeat(23))._hex

  await hre.network.provider.send('hardhat_setBalance', [addr, balance])

  // Tell hardhat what address enables to impersonate
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [addr],
  })
  // return the impersonated signer
  return await ethers.getSigner(addr)
}

const MAX_UINT = '115792089237316195423570985008687907853269984665640564039457584007913129639935'

// Global setup for all the test-set
const setupSuperFluid = async () => {
  const errorHandler = err => {
    if (err) throw err;
  };

  await deployFramework(errorHandler, { web3: web3, from: global.superFluidDeployer.address });
  const sf = new Framework({ web3: web3, version: 'test', resolverAddress: process.env.TEST_RESOLVER_ADDRESS });
  await sf.initialize()

  global.superTokenFactory = await sf.contracts.ISuperTokenFactory.at(
    await sf.host.getSuperTokenFactory.call()
  );
}

const setupNeededTokens = async () => {
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

  // DEPLOY PiToken
  console.log('Deploying PiToken')
  global.PiToken = await createPiToken({ tokenContract: 'PiToken', withDeployer: true })
  expect(global.PiToken.address).to.be.equal('0x5095d3313C76E8d29163e40a0223A5816a8037D8')

  console.log('Deploying BTC')
  global.BTC = await deployWithMainDeployer('TokenMock', 'BTC', 'BTC')
  expect(global.BTC.address).to.be.equal('0x6d925938Edb8A16B3035A4cF34FAA090f490202a')

  console.log('Deploying CRV')
  global.CRV = await deployWithMainDeployer('TokenMock', 'CRV', 'CRV')
  expect(global.CRV.address).to.be.equal('0xED8CAB8a931A4C0489ad3E3FB5BdEA84f74fD23E')

  console.log('Deploying Curve Pool & BTC-CRV')
  global.CurvePool = await deployWithMainDeployer('CurvePoolMock')
  expect(global.CurvePool.address).to.be.equal('0x40bde52e6B80Ae11F34C58c14E1E7fE1f9c834C4')

  console.log('Deploying Curve RewardsGauge')
  global.CurveRewardsGauge = await deployWithMainDeployer('CurveRewardsGaugeMock')
  expect(global.CurveRewardsGauge.address).to.be.equal('0xE9061F92bA9A3D9ef3f4eb8456ac9E552B3Ff5C8')

  // Set BTC 8 decimals
  await waitFor(BTC.setDecimals(8));
}

if (! process.env.HARDHAT_INTEGRATION_TESTS) {
  before(async () => {
    // Not change signer because if the deployer/nonce changes
    // the deployed address will change too
    // All signers have 10k ETH
    // global variable is like "window"
    global.owner = await ethers.getSigner('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') // first hardhat account
    global.deployer = await ethers.getSigner('0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199') // last hardhat account
    global.superFluidDeployer = await ethers.getSigner('0xdD2FD4581271e230360230F9337D5c0430Bf44C0') // penultimate hardhat account

    // If PiToken fails change this to wait for SuperFluid
    await setupSuperFluid()
    await setupNeededTokens()

    console.log('===============  SETUP DONE  ===============\n\n')
  })

  afterEach(async () => {
    await Promise.all([
      (await global.Aave.pool.reset()).wait(),
      (await global.Aave.dataProvider.reset()).wait(),
      (await global.CurvePool.reset()).wait(),
      (await global.CurveRewardsGauge.reset()).wait(),
      (await global.exchange.reset()).wait(),
      // Reset hardhat "state"
      network.provider.send('evm_setAutomine', [true]),
      network.provider.send('evm_setIntervalMining', [0]),
      network.provider.send('evm_mine')
    ])
  })
}

module.exports = {
  createController,
  createPiToken,
  deploy,
  expectedOnlyAdmin,
  getBlock,
  impersonateContract,
  mineNTimes,
  setupSuperFluid,
  sleep,
  toNumber,
  waitFor,
  zeroAddress,
  MAX_UINT
}

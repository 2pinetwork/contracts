/* eslint no-console: 0 */

const { Framework } = require('@superfluid-finance/js-sdk');
const { createPiToken, } = require('../helpers')

const setWMaticBalanceFor = async (address, amount) => {
  const wmaticSlot = 3
  const newBalance = ethers.utils.parseUnits(amount)
  const index      = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [address, wmaticSlot])
  const balance32  = ethers.utils.hexlify(ethers.utils.zeroPad(newBalance.toHexString(), 32))

  await ethers.provider.send('hardhat_setStorageAt', [global.WMATIC.address, index.toString(), balance32])
}

const setWethBalanceFor = async (address, amount) => {
  const wethSlot   = 0
  const newBalance = ethers.utils.parseUnits(amount)
  const index      = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [address, wethSlot])
  const balance32  = ethers.utils.hexlify(ethers.utils.zeroPad(newBalance.toHexString(), 32))

  await ethers.provider.send('hardhat_setStorageAt', [global.WETH.address, index.toString(), balance32])
}

const setWbtcBalanceFor = async (address, amount) => {
  const wbtcSlot   = 0
  const newBalance = ethers.utils.parseUnits(amount)
  const index      = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [address, wbtcSlot])
  const balance32  = ethers.utils.hexlify(ethers.utils.zeroPad(newBalance.toHexString(), 32))

  await ethers.provider.send('hardhat_setStorageAt', [global.BTC.address, index.toString(), balance32])
}

const createPiTokenExchangePair = async () => {
  const currentBlock = await hre.ethers.provider.getBlock()
  const factoryAbi   = require('./abis/uniswap-factory.json')
  const factory      = await ethers.getContractAt(factoryAbi, '0xc35DADB65012eC5796536bD9864eD8773aBc74C4')
  const allowance    = '1' + '0'.repeat(59)
  const piTokens     = '942000' + '0'.repeat(18)
  const wmaticTokens = '100' + '0'.repeat(parseInt(await global.WMATIC.decimals(), 10), 10)

  await setWMaticBalanceFor(owner.address, '1000')
  await global.PiToken.transfer(owner.address, piTokens + '0')

  await global.WMATIC.connect(owner).approve(global.exchange.address, allowance)
  await global.PiToken.connect(owner).approve(global.exchange.address, allowance)

  await (
    await factory.createPair(global.WMATIC.address, global.PiToken.address)
  ).wait()

  const pair = await factory.getPair(global.WMATIC.address, global.PiToken.address)

  await (
    await global.exchange.addLiquidity(
      global.WMATIC.address,
      global.PiToken.address,
      wmaticTokens,
      piTokens,
      1,
      1,
      global.owner.address,
      currentBlock.timestamp + 600
    )
  ).wait()

  return pair
}

const setupNeededTokens = async () => {
  console.log('Fetching WMatic')
  const wmaticAbi = require('./abis/wmatic.json')
  global.WMATIC = await ethers.getContractAt(wmaticAbi, '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270')
  expect(global.WMATIC.address).to.be.equal('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270')

  console.log('Fetching WETH')
  const wethAbi = require('./abis/weth.json')
  global.WETH = await ethers.getContractAt(wethAbi, '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619')
  expect(global.WETH.address).to.be.equal('0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619')

  // DEPLOY exchange
  console.log('Fetching Exchange')
  const uniswapAbi = require('./abis/uniswap-router.json')
  global.exchange = await ethers.getContractAt(uniswapAbi, '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506')
  expect(global.exchange.address).to.be.equal('0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506')

  // Aave complement contracts
  console.log('Fetching Aave')
  const incentivesControllerAbi = require('./abis/incentives-controller.json')
  global.Aave = {}
  global.Aave.incentivesController = await ethers.getContractAt(incentivesControllerAbi, '0x357D51124f59836DeD84c8a1730D72B749d8BC23')
  expect(global.Aave.incentivesController.address).to.be.equal('0x357D51124f59836DeD84c8a1730D72B749d8BC23')

  const dataProviderAbi = require('./abis/data-provider.json')
  global.Aave.dataProvider = await ethers.getContractAt(dataProviderAbi, '0x7551b5D2763519d4e37e8B81929D336De671d46d')
  expect(global.Aave.dataProvider.address).to.be.equal('0x7551b5D2763519d4e37e8B81929D336De671d46d')

  const aavePoolAbi = require('./abis/aave-pool.json')
  global.Aave.pool = await ethers.getContractAt(aavePoolAbi, '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf')
  expect(global.Aave.pool.address).to.be.equal('0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf')

  // DEPLOY PiToken
  console.log('Deploying PiToken')
  global.PiToken = await createPiToken(false, true)
  expect(global.PiToken.address).to.be.equal('0x0315358E4EfB6Fb3830a21baBDb28f6482c15aCa')

  console.log('Fetching BTC')
  const btcAbi = require('./abis/btc.json')
  global.BTC = await ethers.getContractAt(btcAbi, '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6')
  expect(global.BTC.address).to.be.equal('0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6')

  console.log('Fetching CRV')
  const crvAbi = require('./abis/crv.json')
  global.CRV = await ethers.getContractAt(crvAbi, '0x172370d5Cd63279eFa6d502DAB29171933a610AF')
  expect(global.CRV.address).to.be.equal('0x172370d5Cd63279eFa6d502DAB29171933a610AF')

  console.log('Fetching Curve Pool & BTC-CRV')
  const curvePoolAbi = require('./abis/curve-pool.json')
  global.CurvePool = await ethers.getContractAt(curvePoolAbi, '0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67')
  expect(global.CurvePool.address).to.be.equal('0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67')

  console.log('Fetching Curve RewardsGauge')
  const curveRewardsGaugeAbi = require('./abis/curve-rewards-gauge.json')
  global.CurveRewardsGauge = await ethers.getContractAt(curveRewardsGaugeAbi, '0xffbACcE0CC7C19d46132f1258FC16CF6871D153c')
  expect(global.CurveRewardsGauge.address).to.be.equal('0xffbACcE0CC7C19d46132f1258FC16CF6871D153c')
}

if (process.env.HARDHAT_INTEGRATION_TESTS) {
  before(async () => {
    // Not change signer because if the deployer/nonce changes
    // the deployed address will change too
    // All signers have 10k ETH
    // global variable is like "window"
    global.owner = await ethers.getSigner('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') // first hardhat account
    global.deployer = await ethers.getSigner('0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199') // last hardhat account
    global.superFluidDeployer = await ethers.getSigner('0xdD2FD4581271e230360230F9337D5c0430Bf44C0') // penultimate hardhat account

    // Little hack to use deployed SuperFluid contracts
    const superWeb3 = web3
    superWeb3.eth.net.getId = async () => { return 137 }

    const sf = new Framework({ web3: superWeb3 })
    await sf.initialize()

    global.superTokenFactory = await sf.contracts.ISuperTokenFactory.at(
      await sf.host.getSuperTokenFactory.call()
    )

    await setupNeededTokens()

    console.log('===============  SETUP DONE  ===============\n\n')
  })

  afterEach(async () => {
    await Promise.all([
      // Reset hardhat "state"
      network.provider.send('evm_setAutomine', [true]),
      network.provider.send('evm_setIntervalMining', [0]),
      network.provider.send('evm_mine')
    ])
  })
}

module.exports = {
  createPiTokenExchangePair,
  setWMaticBalanceFor,
  setWbtcBalanceFor,
  setWethBalanceFor
}

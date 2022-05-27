/* eslint no-console: 0 */

const deployFramework = require('@superfluid-finance/ethereum-contracts/scripts/deploy-framework')
const { Framework } = require('@superfluid-finance/js-sdk')
const { createPiToken, deploy, } = require('../helpers')

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
  const newBalance = ethers.utils.parseUnits(amount, 8)
  const index      = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [address, wbtcSlot])
  const balance32  = ethers.utils.hexlify(ethers.utils.zeroPad(newBalance.toHexString(), 32))

  await ethers.provider.send('hardhat_setStorageAt', [global.BTC.address, index.toString(), balance32])
}

const setCustomBalanceFor = async (token, address, rawAmount, slot) => {
  const weiAmount = typeof rawAmount === 'string' ? ethers.utils.parseUnits(rawAmount, 18) : rawAmount
  const index      = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [address, slot || 0])
  const balance32  = ethers.utils.hexlify(ethers.utils.zeroPad(weiAmount.toHexString(), 32))
  await ethers.provider.send('hardhat_setStorageAt', [token, index.toString(), balance32])
}

const setChainlinkRound = async (address, roundId, timestamp, price) => {
  const slot = [
    '0x336584C8E6Dc19637A5b36206B1c79923111b405', // CRV
    '0x310990E8091b5cF083fA55F500F140CFBb959016'  // EUR
  ].includes(address) ? 44 : 43  // most of pricess are 43 slot

  const timestampL = 16
  const priceL     = 48
  const timestampHex = timestamp.toString(16)
  const priceHex   = parseInt(price * 1e8, 10).toString(16)
  const newValue   = [
    '0x',
    '0'.repeat(timestampL - timestampHex.length),
    timestampHex,
    '0'.repeat(priceL - priceHex.length),
    priceHex
  ].join('')
  let index = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [roundId, slot])

  await ethers.provider.send('hardhat_setStorageAt', [address, index.toString(), newValue])
}

const setChainlinkRoundForNow = async (feed) => {
   const data = await feed.latestRoundData()
   const agg = await feed.aggregator()

  let roundId = data.roundId._hex
  // ETH feed
  if (feed.address != '0xF9680D99D6C9589e2a93a78A04A279e509205945') {
    roundId = `0x0000${roundId.substr(-8)}` // only 8 hex are used in some round
  }

  await setChainlinkRound(
    agg,
    roundId,
    (await hre.ethers.provider.getBlock()).timestamp,
    (data.answer / 1e8)
  )
}

const createUsdcPairWithPrice = async (token, price, exchangeData = {}) => {
  const factoryAddr = exchangeData.factoryAddr || '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'
  const exchange = exchangeData.exchange || global.exchange
  const currentBlock = await hre.ethers.provider.getBlock()
  const factoryAbi   = require('./abis/uniswap-factory.json')
  const factory      = await ethers.getContractAt(factoryAbi, factoryAddr)
  const allowance    = '1' + '0'.repeat(59)

  const wantedTokens = ethers.utils.parseUnits('10000', await token.decimals())
  const usdcTokens   = ethers.utils.parseUnits((10000 * price).toFixed(6), 6) // USDC 6 decimals

  await setCustomBalanceFor(global.USDC.address, owner.address, usdcTokens, 0)

  for (let i = 0; i < 10000; i++) {
    try {
      await setCustomBalanceFor(token.address, owner.address, wantedTokens, i)
    } catch(e) { }
    if (await token.balanceOf(owner.address) > 0) {
      break
    }
  }

  await global.USDC.connect(owner).approve(exchange.address, allowance)
  await token.connect(owner).approve(exchange.address, allowance)

  await (
    await factory.createPair(global.USDC.address, token.address)
  ).wait()

  const pair = await factory.getPair(global.USDC.address, token.address)

  await (
    await exchange.addLiquidity(
      global.USDC.address,
      token.address,
      usdcTokens.toString(),
      wantedTokens.toString(),
      1,
      1,
      global.owner.address,
      currentBlock.timestamp + 600
    )
  ).wait()

  return pair
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

const createOracles = async (tokensData) => {
  for (let token in tokensData) {
    let pair = await SUSHI_FACTORY.getPair(token, global.USDC.address)

    if (pair == '0x' + '0'.repeat(40)) {
      await createUsdcPairWithPrice(
        await ethers.getContractAt('IERC20Metadata', token),
        tokensData[token].price
      )

      pair = await SUSHI_FACTORY.getPair(token, global.USDC.address)
    }

    tokensData[token].oracle = await deploy('PiOracle', pair, token)
  }

  for (let i = 0; i < 3; i++) {
    // mine + 1 minute
    await network.provider.send('hardhat_mine', ['0x2', '0x3f']) // 63 seconds
    for (let token in tokensData) {
      await tokensData[token].oracle.update()
    }
  }

  await network.provider.send('hardhat_mine', ['0x2', '0x3f'])
}

const resetHardhat = async (blockNumber) => {
  // Reset network because the rewards are not harvested for somereason
  await network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl:  hre.network.config.forking.url,
          blockNumber: (blockNumber || hre.network.config.forking.blockNumber)
        },
      },
    ],
  });

  global.PiToken = await createPiToken({ withDeployer: true })
  if (!blockNumber && hre.network.config.network_id !== 56)
    expect(global.PiToken.address).to.be.equal('0x0315358E4EfB6Fb3830a21baBDb28f6482c15aCa')
}

const fetchNeededTokens = async () => {
  console.log('Fetching needed tokens...')
  const wmaticAbi = require('./abis/wmatic.json')
  const uniswapAbi = require('./abis/uniswap-router.json')
  const incentivesControllerAbi = require('./abis/incentives-controller.json')
  const dataProviderAbi = require('./abis/data-provider.json')
  const aavePoolAbi = require('./abis/aave-pool.json')
  const curvePoolAbi = require('./abis/curve-pool.json')
  const curveRewardsGaugeAbi = require('./abis/curve-rewards-gauge.json')
  const uniswapFactoryAbi   = require('./abis/uniswap-factory.json')

  let promises = []

  const ERC20_TOKENS = {
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    BTC:  '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    CRV:  '0x172370d5Cd63279eFa6d502DAB29171933a610AF',
    USDC: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    USDT: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    DAI:  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
    MUSD: '0xe840b73e5287865eec17d250bfb1536704b43b21',
  }

  for (let symbol in ERC20_TOKENS) {
    promises.push(
      ethers.getContractAt('IERC20Metadata', ERC20_TOKENS[symbol]).then(c => (global[symbol] = c))
    )
  }

  const CHAINLINK_ORACLES = {
    daiFeed:    '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D',
    usdcFeed:   '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
    wmaticFeed: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
  }

  for (let key in CHAINLINK_ORACLES) {
    promises.push(
      ethers.getContractAt('IChainLink', CHAINLINK_ORACLES[key]).then(c => (global[key] = c))
    )
  }

  promises.push(
    ethers.getContractAt(wmaticAbi, '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270').then(c => (global.WMATIC = c))
  )
  promises.push(
    ethers.getContractAt(uniswapAbi, '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506').then(c => (global.exchange = c))
  )
  promises.push(
    ethers.getContractAt(curvePoolAbi, '0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67').then(c => (global.CurvePool = c))
  )
  promises.push(
    ethers.getContractAt(curveRewardsGaugeAbi, '0x8D9649e50A0d1da8E939f800fB926cdE8f18B47D').then(c => (global.CurveRewardsGauge = c))
  )
  promises.push(
    ethers.getContractAt(uniswapFactoryAbi, '0xc35DADB65012eC5796536bD9864eD8773aBc74C4').then(c => (global.SUSHI_FACTORY = c))
  )

  // Aave contracts
  global.Aave = {}
  promises.push(
    ethers.getContractAt(incentivesControllerAbi, '0x357D51124f59836DeD84c8a1730D72B749d8BC23').then(c => (global.Aave.incentivesController = c))
  )
  promises.push(
    ethers.getContractAt(dataProviderAbi, '0x7551b5D2763519d4e37e8B81929D336De671d46d').then(c => (global.Aave.dataProvider = c))
  )
  promises.push(
    ethers.getContractAt(aavePoolAbi, '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf').then(c => (global.Aave.pool = c))
  )

  await Promise.all(promises)
}

if (process.env.HARDHAT_INTEGRATION_TESTS) {
  before(async () => {
    // Not change signer because if the deployer/nonce changes
    // the deployed address will change too
    // All signers have 10k ETH
    // global variable is like "window"
    global.owner = await ethers.getSigner('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') // first hardhat account
    global.deployer = await ethers.getSigner('0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199') // last hardhat account

    const prom = fetchNeededTokens()

    // DEPLOY PiToken
    console.log('Deploying PiToken')
    global.PiToken = await createPiToken({ tokenContract: 'TestPiToken', withDeployer: true })
    await prom

    console.log('===============  SETUP DONE  ===============\n\n')
  })

  beforeEach(async () => {
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
  createUsdcPairWithPrice,
  createOracles,
  resetHardhat,
  setWMaticBalanceFor,
  setWbtcBalanceFor,
  setWethBalanceFor,
  setCustomBalanceFor,
  setChainlinkRound,
  setChainlinkRoundForNow,
}

const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
  waitFor,
  zeroAddress
} = require('../helpers')

const { resetHardhat, setCustomBalanceFor, setChainlinkRoundForNow } = require('./helpers')

const addresses = {
  crvToken:     '0x061b87122Ed14b9526A813209C8a59a633257bAb',
  pool:         '0x167e42a1C7ab4Be03764A2222aAC57F5f6754411',
  metaPool:     '0x061b87122Ed14b9526A813209C8a59a633257bAb',
  gauge:        '0xc5aE4B5F86332e70f3205a8151Ee9eD9F71e0797',
  gaugeFactory: '0xabc000d88f23bb45525e447528dbf656a9d55bf5'
}

const itIf = async (cond, title, test) => {
  if (cond) {
    return it(title, test)
  }
}

describe('[OPTIMISM] Controller Curve Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let OPFeed
  let daiFeed
  let crvFeed
  let poolSlipage

  before(async () => {
    // await resetHardhat(22562704) // 10 DAIs
  })

  beforeEach(async () => {
    global.OP = await ethers.getContractAt('IERC20Metadata', '0x4200000000000000000000000000000000000042');

    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      OP.address
    )

    global.DAI = await ethers.getContractAt('IERC20Metadata', '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1')
    global.CRV = await ethers.getContractAt('IERC20Metadata', '0x0994206dfE8De6Ec6920FF4D779B0d950605Fb53')
    global.WETH = await ethers.getContractAt('IERC20Metadata', '0x4200000000000000000000000000000000000006')
    // global.USDC = await ethers.getContractAt('IERC20Metadata', '0x7f5c764cbc14f9669b88837ca1490cca17c31607')
    global.CurveRewardsGauge = await ethers.getContractAt('ICurveGauge', addresses.gauge)
    global.exchange = await ethers.getContractAt('IUniswapRouter', '0xe592427a0aece92de3edee1f18e0157c05861564')

    controller = await createController(DAI, archimedes, 'ControllerMetaCurveStrat', {
      ...addresses,
      gaugeType: 1,
      poolSize: 4,
      tokenIndex: 1 // [sUSD, DAI, USDC, USDT]
    })


    await waitFor(archimedes.addNewPool(DAI.address, controller.address, 10, false));

    [strat, OPFeed, daiFeed, crvFeed] = await Promise.all([
      ethers.getContractAt('ControllerMetaCurveStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0x0d276fc14719f9292d5c1ea2198673d1f4269246'),
      ethers.getContractAt('IChainLink', '0x8dba75e83da73cc766a7e5a0ee71f656bab470d6'),
      ethers.getContractAt('IChainLink', '0xbd92c6c284271c227a1e0bf1786f468b539f51d9'),
    ])

    poolSlipage = 0.015

    await Promise.all([
      setChainlinkRoundForNow(OPFeed),
      setChainlinkRoundForNow(daiFeed),
      setChainlinkRoundForNow(crvFeed),
      waitFor(strat.setMaxPriceOffset(86400)),
      waitFor(strat.setPriceFeed(OP.address, OPFeed.address)),
      waitFor(strat.setPriceFeed(DAI.address, daiFeed.address)),
      waitFor(strat.setPriceFeed(CRV.address, crvFeed.address)),
      waitFor(strat.setPoolSlippageRatio(poolSlipage * 10000)),
      waitFor(strat.setSwapSlippageRatio(500)),
      waitFor(strat.setRewardToWantRoute(OP.address, [OP.address, DAI.address])),
      waitFor(strat.setRewardToWantRoute(CRV.address, [CRV.address, WETH.address, DAI.address])),
      waitFor(strat.setTokenToTokenSwapFee(OP.address, DAI.address, 3000)),
      waitFor(strat.setTokenToTokenSwapFee(CRV.address, WETH.address, 3000)),
      waitFor(strat.setTokenToTokenSwapFee(WETH.address, DAI.address, 3000)),
    ])
  })

  itIf(hre.network.config.network_id == 10, 'Full deposit + harvest strat + withdraw', async () => {
    await setCustomBalanceFor(DAI.address, bob.address, '100', 2)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, '' + 100e18))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      (100e18 - (100e18 * poolSlipage)) + '', // production virtual price is ~1.0093.
      100e18 + ''
    )

    const balance = await strat.balanceOfPool() // more decimals

    // to ask for rewards (max 100 blocks)
    for (let i = 0; i < 20; i++) {
      await mineNTimes(5)

      expect(await strat.harvest()).to.emit(strat, 'Harvested')

      if (balance < (await strat.balanceOfPool())) { break }
      console.log('Mined 6 blocks...')
    }
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 DAI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await DAI.balanceOf(bob.address)).to.within(
      94.9e18 + '', 95e18 + '' // 95 - 0.1% withdrawFee
    )
    expect(await DAI.balanceOf(strat.address)).to.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      4.6e18 + '', // 99.6 - 95
      5e18 + ''
    )

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await DAI.balanceOf(bob.address)).to.within(
      99.8e18 + '', // between 0.1% and 0.2%
      99.9e18 + ''
    )
  })

  itIf(hre.network.config.network_id == 10, 'Deposit and change strategy', async () => {
    await setCustomBalanceFor(DAI.address, bob.address, '100', 2)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, '' + 100e18))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e18+'')
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      98.0e18 + '', // production virtual price is ~1.0093.
      100e18 + ''
    )

    const otherStrat = await deploy(
      'ControllerDummyStrat',
      DAI.address,
      controller.address,
      global.exchange.address,
      owner.address
    )

    expect(await controller.setStrategy(otherStrat.address)).to.emit(controller, 'NewStrategy').withArgs(
      strat.address, otherStrat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e18+'')
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await strat.balance()).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.within(
      99e18+'', 100e18+''
    )

    await waitFor(strat.unpause())
    expect(await controller.setStrategy(strat.address)).to.emit(controller, 'NewStrategy').withArgs(
      otherStrat.address, strat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e18+'')
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.equal(0)
    expect(await strat.balance()).to.be.within(
      99e18+'', 100e18+''
    )
  })
})

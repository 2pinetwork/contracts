const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
  waitFor,
  zeroAddress
} = require('../helpers')

const { resetHardhat, setChainlinkRoundForNow } = require('./helpers')

const addresses = {
  crvToken:     '0x7Bc5728BC2b59B45a58d9A576E2Ffc5f0505B35E',
  pool:         '0x7Bc5728BC2b59B45a58d9A576E2Ffc5f0505B35E',
  swapPool:     '0x7Bc5728BC2b59B45a58d9A576E2Ffc5f0505B35E',
  gauge:        '0xCB8883D1D8c560003489Df43B30612AAbB8013bb',
  gaugeFactory: '0xabC000d88f23Bb45525E447528DBF656A9D55bf5'
}

const itIf = async (cond, title, test) => {
  if (cond) {
    return it(title, test)
  }
}

describe('Controller Curve Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let wNativeFeed
  let crvFeed
  let opFeed

  before(async () => { await resetHardhat(22562704) })

  beforeEach(async () => {
    global.WETH              = await ethers.getContractAt('IERC20Metadata', '0x4200000000000000000000000000000000000006')
    global.OP                = await ethers.getContractAt('IERC20Metadata', '0x4200000000000000000000000000000000000042')
    global.CRV               = await ethers.getContractAt('IERC20Metadata', '0x0994206dfE8De6Ec6920FF4D779B0d950605Fb53')
    global.CurveRewardsGauge = await ethers.getContractAt('ICurveGauge', addresses.gauge)
    global.exchange          = await ethers.getContractAt('IUniswapRouter', '0xe592427a0aece92de3edee1f18e0157c05861564');

    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      WETH.address
    )

    controller = await createController(WETH, archimedes, 'ControllerCurveUniV3Strat', {
      ...addresses,
      gaugeType:  1,
      poolSize:   2,
      tokenIndex: 0
    })

    await waitFor(archimedes.addNewPool(WETH.address, controller.address, 10, false));

    [strat, wNativeFeed, crvFeed, opFeed] = await Promise.all([
      ethers.getContractAt('ControllerCurveUniV3Strat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0x13e3Ee699D1909E989722E753853AE30b17e08c5'),
      ethers.getContractAt('IChainLink', '0xbD92C6c284271c227a1e0bF1786F468b539f51D9'),
      ethers.getContractAt('IChainLink', '0x0D276FC14719f9292D5C1eA2198673d1f4269246')
    ])

    await strat.setUseNative(true)

    poolSlipage = 0.015

    await Promise.all([
      setChainlinkRoundForNow(wNativeFeed),
      setChainlinkRoundForNow(crvFeed),
      setChainlinkRoundForNow(opFeed),
      waitFor(strat.setMaxPriceOffset(86400)),
      waitFor(strat.setPriceFeed(WETH.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(CRV.address, crvFeed.address)),
      waitFor(strat.setPriceFeed(OP.address, opFeed.address)),
      waitFor(strat.setPoolSlippageRatio(poolSlipage * 10000)),
      waitFor(strat.setSwapSlippageRatio(500)),
      waitFor(strat.setRewardToWantRoute(OP.address, [OP.address, WETH.address])),
      waitFor(strat.setRewardToWantRoute(CRV.address, [CRV.address, WETH.address])),
      waitFor(strat.setTokenToTokenSwapFee(OP.address, WETH.address, 3000)),
      waitFor(strat.setTokenToTokenSwapFee(CRV.address, WETH.address, 10000)),
    ])
  })

  itIf(hre.network.config.network_id === 10, 'Full deposit + harvest strat + withdraw', async () => {
    const currentBalance = async () => {
      return await ethers.provider.getBalance(bob.address)
    }

    expect(await WETH.balanceOf(strat.address)).to.be.equal(0)
    expect(await ethers.provider.getBalance(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).depositNative(0, zeroAddress, { value: '' + 100e18 }))

    const afterDepositBalance = await currentBalance()

    expect(await WETH.balanceOf(controller.address)).to.be.equal(0)
    expect(await WETH.balanceOf(strat.address)).to.be.equal(0)
    expect(await ethers.provider.getBalance(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      99.2e18 + '', // production virtual price is ~1.003.
      100e18 + ''
    )

    const balance = await strat.balanceOfPool() // more decimals

    await mineNTimes(100)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 WETH in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect((await currentBalance()).sub(afterDepositBalance)).to.within(
      94.9e18 + '',
      95e18 + '' // 95 - 0.1% withdrawFee
    )
    expect(await WETH.balanceOf(strat.address)).to.equal(0)
    expect(await ethers.provider.getBalance(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      4.6e18 + '', // 99.6 - 95
      5e18 + ''
    )

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await WETH.balanceOf(strat.address)).to.equal(0)
    expect((await currentBalance()).sub(afterDepositBalance)).to.within(
      99.8e18 + '', // between 0.1% and 0.2%
      99.9e18 + ''
    )
  })

  itIf(hre.network.config.network_id === 10, 'Deposit and change strategy', async () => {
    const currentBalance = async () => {
      return await ethers.provider.getBalance(bob.address)
    }

    expect(await WETH.balanceOf(strat.address)).to.be.equal(0)
    expect(await ethers.provider.getBalance(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).depositNative(0, zeroAddress, { value: '' + 100e18 }))

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await WETH.balanceOf(controller.address)).to.be.equal(0)
    expect(await WETH.balanceOf(strat.address)).to.be.equal(0)
    expect(await ethers.provider.getBalance(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      98.9e18 + '', // production virtual price is ~1.0093.
      100e18 + ''
    )

    const otherStrat = await deploy(
      'ControllerDummyStrat',
      WETH.address,
      controller.address,
      global.exchange.address,
      owner.address
    )

    await Promise.all([
      waitFor(otherStrat.setMaxPriceOffset(86400)),
      waitFor(otherStrat.setPriceFeed(WETH.address, wNativeFeed.address))
    ])

    expect(await controller.setStrategy(otherStrat.address)).to.emit(controller, 'NewStrategy').withArgs(
      strat.address, otherStrat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await WETH.balanceOf(controller.address)).to.be.equal(0)
    expect(await WETH.balanceOf(strat.address)).to.be.equal(0)
    expect(await strat.balance()).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.within(
      '' + 99e18,
      '' + 100e18
    )

    await waitFor(strat.unpause())

    expect(await controller.setStrategy(strat.address)).to.emit(controller, 'NewStrategy').withArgs(
      otherStrat.address, strat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await WETH.balanceOf(controller.address)).to.be.equal(0)
    expect(await WETH.balanceOf(strat.address)).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.equal(0)
    expect(await strat.balance()).to.be.within(
      '' + 99e18,
      '' + 100e18
    )
  })
})

const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
  waitFor,
  zeroAddress
} = require('../helpers')

const { resetHardhat, setWbtcBalanceFor, setChainlinkRoundForNow } = require('./helpers')

describe('Controller Curve Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let wNativeFeed
  let btcFeed
  let crvFeed

  before(async () => {
    await resetHardhat()
  })

  beforeEach(async () => {
    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      WMATIC.address
    )

    controller = await createController(BTC, archimedes, 'ControllerCurveStrat')

    await waitFor(archimedes.addNewPool(BTC.address, controller.address, 10, false));

    [strat, wNativeFeed, btcFeed, crvFeed] = await Promise.all([
      ethers.getContractAt('ControllerCurveStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0'),
      ethers.getContractAt('IChainLink', '0xc907E116054Ad103354f2D350FD2514433D57F6f'),
      ethers.getContractAt('IChainLink', '0x336584C8E6Dc19637A5b36206B1c79923111b405'),
    ])

    await Promise.all([
      setChainlinkRoundForNow(wNativeFeed),
      setChainlinkRoundForNow(btcFeed),
      setChainlinkRoundForNow(crvFeed),
      waitFor(strat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(BTC.address, btcFeed.address)),
      waitFor(strat.setPriceFeed(CRV.address, crvFeed.address)),
      waitFor(strat.setRewardToWantRoute(WMATIC.address, [WMATIC.address, WETH.address, BTC.address])),
      waitFor(strat.setRewardToWantRoute(CRV.address, [CRV.address, WETH.address, BTC.address]))
    ])
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    await setWbtcBalanceFor(bob.address, '100')
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(BTC.connect(bob).approve(archimedes.address, '' + 100e8))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      99.6e18 + '', // production virtual price is ~1.00367.
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
    console.log(`Claim en el bloque: ${await getBlock()} `)
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 BTC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e8).div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await BTC.balanceOf(bob.address)).to.within(
      94.9e8, 95e8 // 95 - 0.1% withdrawFee
    )
    expect(await BTC.balanceOf(strat.address)).to.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      4.6e18 + '', // 99.6 - 95
      5e18 + ''
    )

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await BTC.balanceOf(bob.address)).to.within(
      99.8e8 + '', // between 0.1% and 0.2%
      99.9e8 + ''
    )
  })

  it('Deposit and change strategy', async () => {
    await setWbtcBalanceFor(bob.address, '100')
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(BTC.connect(bob).approve(archimedes.address, '' + 100e8))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e8)
    expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      99.5e18 + '', // production virtual price is ~1.00367.
      100e18 + ''
    )

    const otherStrat = await deploy(
      'ControllerAaveStrat',
      BTC.address,
      4800,
      5000,
      8,
      1e3,
      controller.address,
      global.exchange.address,
      owner.address
    )
    await Promise.all([
      waitFor(otherStrat.setMaxPriceOffset(86400)),
      waitFor(otherStrat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(otherStrat.setPriceFeed(BTC.address, btcFeed.address)),
    ])

    expect(await controller.setStrategy(otherStrat.address)).to.emit(controller, 'NewStrategy').withArgs(
      strat.address, otherStrat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e8)
    expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
    expect(await strat.balance()).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.within(
      99e8, 100e8
    )

    await waitFor(strat.unpause())
    expect(await controller.setStrategy(strat.address)).to.emit(controller, 'NewStrategy').withArgs(
      otherStrat.address, strat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e8)
    expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.equal(0)
    expect(await strat.balance()).to.be.within(
      99e8, 100e8
    )
  })
})

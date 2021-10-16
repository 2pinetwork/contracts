const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
  waitFor,
  zeroAddress
} = require('../helpers')

const { setWbtcBalanceFor } = require('./helpers')

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
      ethers.getContractAt('IChainLink', '0x336584C8E6Dc19637A5b36206B1c79923111b405')
    ])

    await waitFor(strat.setPriceFeeds(wNativeFeed.address, btcFeed.address, crvFeed.address));
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

    await mineNTimes(10) // to ask for rewards
    await waitFor(strat.harvest())

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
})

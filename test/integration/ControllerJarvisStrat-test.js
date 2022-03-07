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

describe('Controller Jarvis Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let ageur
  let wNativeFeed
  let eurFeed
  let agdenFeed
  let usdcFeed

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

    const AGDEN = '0xbAbC2dE9cE26a5674F8da84381e2f06e1Ee017A1'

    ageur = await ethers.getContractAt('IERC20Metadata', '0xE0B52e49357Fd4DAf2c15e02058DCE6BC0057db4')

    controller = await createController(ageur, archimedes, 'ControllerJarvisStrat')

    await waitFor(archimedes.addNewPool(ageur.address, controller.address, 10, false));

    [strat, wNativeFeed, eurFeed, agdenFeed, usdcFeed] = await Promise.all([
      ethers.getContractAt('ControllerJarvisStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0'),
      ethers.getContractAt('IChainLink', '0x73366Fe0AA0Ded304479862808e02506FE556a98'),
      ethers.getContractAt('IChainLink', '0x432fa0899cF1BcDb98592D7eAA23C372b8b8ddf2'), // GNO has "similar" price
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7')
    ])

    await Promise.all([
      setChainlinkRoundForNow(wNativeFeed),
      setChainlinkRoundForNow(eurFeed),
      setChainlinkRoundForNow(agdenFeed),
      setChainlinkRoundForNow(usdcFeed),
      waitFor(strat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(ageur.address, eurFeed.address)),
      waitFor(strat.setPriceFeed(AGDEN, agdenFeed.address)),
      waitFor(strat.setPriceFeed(USDC.address, usdcFeed.address)),
      // Ideally set in this order, so we swap agDEN first for USDC and then USDC for agEUR
      waitFor(strat.setRewardToWantPoolPath(AGDEN, ['0xBD0F10CE8F794f17499aEf6987dc8d21a59F46ad'])), // DMMPool
      waitFor(strat.setRewardToWantRoute(USDC.address, [USDC.address, ageur.address]))
    ])
  })

  it.only('Full deposit + harvest strat + withdraw', async () => {
    await setCustomBalanceFor(ageur.address, bob.address, '100')
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(ageur.connect(bob).approve(archimedes.address, '' + 100e18))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await ageur.balanceOf(controller.address)).to.be.equal(0)
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)
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

    // withdraw 95 ageur in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18).div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await ageur.balanceOf(bob.address)).to.within(
      94.9e18, 95e18 // 95 - 0.1% withdrawFee
    )
    expect(await ageur.balanceOf(strat.address)).to.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      4.6e18 + '', // 99.6 - 95
      5e18 + ''
    )

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await ageur.balanceOf(bob.address)).to.within(
      99.8e18 + '', // between 0.1% and 0.2%
      99.9e18 + ''
    )
  })

  it('Deposit and change strategy', async () => {
    await setCustomBalanceFor(ageur.address, bob.address, '100')
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(ageur.connect(bob).approve(archimedes.address, '' + 100e18))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e18)
    expect(await ageur.balanceOf(controller.address)).to.be.equal(0)
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)
    expect(await CurveRewardsGauge.balanceOf(strat.address)).to.be.within(
      99.5e18 + '', // production virtual price is ~1.00367.
      100e18 + ''
    )

    const otherStrat = await deploy(
      'ControllerAaveStrat',
      ageur.address,
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
      waitFor(otherStrat.setPriceFeed(ageur.address, eurFeed.address)),
    ])

    expect(await controller.setStrategy(otherStrat.address)).to.emit(controller, 'NewStrategy').withArgs(
      strat.address, otherStrat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e18)
    expect(await ageur.balanceOf(controller.address)).to.be.equal(0)
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)
    expect(await strat.balance()).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.within(
      99e18, 100e18
    )

    await waitFor(strat.unpause())
    expect(await controller.setStrategy(strat.address)).to.emit(controller, 'NewStrategy').withArgs(
      otherStrat.address, strat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e18)
    expect(await ageur.balanceOf(controller.address)).to.be.equal(0)
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.equal(0)
    expect(await strat.balance()).to.be.within(
      99e18, 100e18
    )
  })
})

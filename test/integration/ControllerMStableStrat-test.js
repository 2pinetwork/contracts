const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
  waitFor,
  zeroAddress
} = require('../helpers')

const { setCustomBalanceFor, setChainlinkRoundForNow, resetHardhat } = require('./helpers')

describe('Controller mStable Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let mtaFeed
  let REWARD_TOKEN

  let stratCallback

  beforeEach(async () => {
    await resetHardhat(26121479); // https://polygonscan.com/tx/0x765753c4dad28a8ac51912cf3c9d8192fce86ed90ad3a056a982811d6b24af2a

    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      WMATIC.address
    )

    REWARD_TOKEN = await ethers.getContractAt('IERC20Metadata', '0xF501dd45a1198C2E1b5aEF5314A68B9006D842E0') // MTA (Meta)

    controller = await createController(USDC, archimedes, 'ControllerMStableStrat')

    await waitFor(archimedes.addNewPool(USDC.address, controller.address, 10, false));

    [strat, mtaFeed] = await Promise.all([
      ethers.getContractAt('ControllerMStableStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0x2346Ce62bd732c62618944E51cbFa09D985d86D2') // BAT has similar price
    ])

    stratCallback = async (strategy) => {
      await Promise.all([
        waitFor(strategy.setMaxPriceOffset(86400)),
        waitFor(strategy.setPoolSlippageRatio(50)), // 0.5%
        waitFor(strategy.setSwapSlippageRatio(150)), // 1.5%
        waitFor(strategy.setPriceFeed(USDC.address, usdcFeed.address)),
        waitFor(strategy.setPriceFeed(REWARD_TOKEN.address, mtaFeed.address)),
        waitFor(strategy.setPriceFeed(WMATIC.address, wmaticFeed.address)),
        waitFor(strategy.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, DAI.address, USDC.address])),
        waitFor(strategy.setRewardToWantRoute(WMATIC.address, [WMATIC.address, USDC.address]))
      ])
    }

    await Promise.all([
      setChainlinkRoundForNow(usdcFeed),
      setChainlinkRoundForNow(wmaticFeed),
      setChainlinkRoundForNow(mtaFeed),
      stratCallback(strat),
    ])
  })

  it.only('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool() // more decimals

    // to ask for rewards (max 100 blocks)
    // for (let i = 0; i < 20; i++) {
    await mineNTimes(100)
    await waitFor(strat.harvest())

      // if (balance < (await strat.balanceOfPool())) {
      //   break
      // }
    // }

    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95000 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95000e6 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await USDC.balanceOf(bob.address)).to.within(
      94900e6 + '', 95000e6 + '' // 95000 - 0.1% withdrawFee
    )
    expect(await USDC.balanceOf(strat.address)).to.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await USDC.balanceOf(bob.address)).to.within(
      99800e6 + '', // between 0.1% and 0.2%
      99900e6 + ''
    )
  })

  it('Controller.setStrategy works', async () => {
    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerMStableStrat',
      USDC.address,
      controller.address,
      global.exchange.address,
      owner.address
    )

    await Promise.all([
      waitFor(otherStrat.setMaxPriceOffset(86400)),
      waitFor(otherStrat.setPoolSlippageRatio(2000)), // 20%
      waitFor(otherStrat.setSwapSlippageRatio(2000)), // 20%
      waitFor(otherStrat.setPriceFeed(USDC.address, usdcFeed.address)),
      waitFor(otherStrat.setPriceFeed(REWARD_TOKEN.address, mtaFeed.address)),
      waitFor(otherStrat.setPriceFeed(WMATIC.address, maticFeed.address)),
      waitFor(otherStrat.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, DAI_ADDRESS, USDC.address])),
      waitFor(otherStrat.setRewardToWantRoute(WMATIC.address, [WMATIC.address, USDC.address]))
    ])

    // We need to mine so WMatic rewards are "enough" to pass the expected swap ratio
    await mineNTimes(5)

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC.balanceOf(strat.address)).to.be.equal(0)
  })
})

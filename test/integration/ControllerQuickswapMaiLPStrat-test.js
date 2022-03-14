const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
  waitFor,
  zeroAddress
} = require('../helpers')

const { setCustomBalanceFor, setChainlinkRoundForNow } = require('./helpers')

describe('Controller QuickSwap MAI LP Strat on USDC', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let usdc
  let qi
  let qiFeed
  let usdcFeed

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

    usdc = await ethers.getContractAt('IERC20Metadata', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')
    qi   = await ethers.getContractAt('IERC20Metadata', '0x580a84c73811e1839f75d86d75d88cca0c241ff4')

    controller = await createController(usdc, archimedes, 'ControllerQuickSwapMaiLPStrat', {
      maxWantBalance: 1e5 + ''
    })

    await waitFor(archimedes.addNewPool(usdc.address, controller.address, 10, false));

    [strat, usdcFeed, qiFeed] = await Promise.all([
      ethers.getContractAt('ControllerQuickSwapMaiLPStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'),
      ethers.getContractAt('IChainLink', '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444') // Doge less than qi
    ])

    const MIM_ADDRESS = '0xa3Fa99A148fA48D14Ed51d610c367C61876997F1'

    await Promise.all([
      setChainlinkRoundForNow(usdcFeed),
      setChainlinkRoundForNow(qiFeed),
      waitFor(strat.setMaxPriceOffset(86400)),
      waitFor(strat.setPoolSlippageRatio(200)), // 2%
      waitFor(strat.setSwapSlippageRatio(200)), // 2%
      waitFor(strat.setPriceFeed(usdc.address, usdcFeed.address)),
      waitFor(strat.setPriceFeed(qi.address, qiFeed.address)),
      waitFor(strat.setRewardToWantRoute(qi.address, [qi.address, WMATIC.address, usdc.address])),
      waitFor(strat.setRoute(MIM_ADDRESS, [MIM_ADDRESS, usdc.address])),
      waitFor(strat.setRoute(usdc.address, [usdc.address, MIM_ADDRESS]))
    ])
  })

  it('Full deposit + harvest strat + withdraw with USDC', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 6)

    await setCustomBalanceFor(usdc.address, bob.address, newBalance)

    expect(await usdc.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(usdc.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await usdc.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await usdc.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(1000)
    await waitFor(strat.harvest())

    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e6 + '').div(
        await controller.balance()
      )
    )

    const initialBalance = await usdc.balanceOf(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await usdc.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      93.05e6 + '', 95e6 + '' // 95 - 2.1% (withdrawFee 0.1% + slippage ratio 2%)
    )

    // less than 0.1 because swap is not exact
    expect((await usdc.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    // less than 0.001
    expect((await qi.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e15)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await usdc.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      9795.0e6 + '', // Since we deposit 10000
      9990.0e6 + ''  // between 0.1% and ~2.1% (withdraw fee + slippage ratio)
    )
  })

  it('Controller.setStrategy works', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 6)

    await setCustomBalanceFor(usdc.address, bob.address, newBalance)

    expect(await usdc.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(usdc.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await usdc.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await usdc.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerQuickSwapMaiLPStrat',
      usdc.address,
      controller.address,
      global.exchange.address,
      owner.address,
      1e5 + ''
    )

    const MIM_ADDRESS = '0xa3Fa99A148fA48D14Ed51d610c367C61876997F1'

    await Promise.all([
      waitFor(otherStrat.setMaxPriceOffset(86400)),
      waitFor(otherStrat.setPoolSlippageRatio(200)), // 2%
      waitFor(otherStrat.setSwapSlippageRatio(200)), // 2%
      waitFor(otherStrat.setPriceFeed(usdc.address, usdcFeed.address)),
      waitFor(otherStrat.setPriceFeed(qi.address, qiFeed.address)),
      waitFor(otherStrat.setRewardToWantRoute(qi.address, [qi.address, WMATIC.address, usdc.address])),
      waitFor(otherStrat.setRoute(MIM_ADDRESS, [MIM_ADDRESS, usdc.address])),
      waitFor(otherStrat.setRoute(usdc.address, [usdc.address, MIM_ADDRESS]))
    ])

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 10000e6)
    expect(await usdc.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await usdc.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 10000e6)
    expect(await usdc.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await usdc.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)
  })
})

describe('Controller QuickSwap MAI LP Strat on DAI', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let usdc
  let dai
  let qi
  let qiFeed
  let usdcFeed
  let daiFeed

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

    usdc = await ethers.getContractAt('IERC20Metadata', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')
    dai  = await ethers.getContractAt('IERC20Metadata', '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063')
    qi   = await ethers.getContractAt('IERC20Metadata', '0x580a84c73811e1839f75d86d75d88cca0c241ff4')

    controller = await createController(dai, archimedes, 'ControllerQuickSwapMaiLPStrat', {
      maxWantBalance: 1e17 + ''
    })

    await waitFor(archimedes.addNewPool(dai.address, controller.address, 10, false));

    [strat, usdcFeed, daiFeed, qiFeed] = await Promise.all([
      ethers.getContractAt('ControllerQuickSwapMaiLPStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'),
      ethers.getContractAt('IChainLink', '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D'),
      ethers.getContractAt('IChainLink', '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444') // Doge less than qi
    ])

    const MIM_ADDRESS = '0xa3Fa99A148fA48D14Ed51d610c367C61876997F1'

    await Promise.all([
      setChainlinkRoundForNow(usdcFeed),
      setChainlinkRoundForNow(daiFeed),
      setChainlinkRoundForNow(qiFeed),
      waitFor(strat.setMaxPriceOffset(86400)),
      waitFor(strat.setPoolSlippageRatio(200)), // 2%
      waitFor(strat.setSwapSlippageRatio(200)), // 2%
      waitFor(strat.setPriceFeed(usdc.address, usdcFeed.address)),
      waitFor(strat.setPriceFeed(dai.address, daiFeed.address)),
      waitFor(strat.setPriceFeed(qi.address, qiFeed.address)),
      waitFor(strat.setRewardToWantRoute(qi.address, [qi.address, WMATIC.address, dai.address])),
      waitFor(strat.setRoute(MIM_ADDRESS, [MIM_ADDRESS, usdc.address])),
      waitFor(strat.setRoute(usdc.address, [usdc.address, MIM_ADDRESS])),
      waitFor(strat.setRoute(dai.address, [dai.address, WMATIC.address, usdc.address])),
      waitFor(strat.setRoute(dai.address, [dai.address, WMATIC.address, MIM_ADDRESS])),
      waitFor(strat.setRoute(usdc.address, [usdc.address, WMATIC.address, dai.address])),
      waitFor(strat.setRoute(MIM_ADDRESS, [MIM_ADDRESS, WMATIC.address, dai.address]))
    ])
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 18)

    await setCustomBalanceFor(dai.address, bob.address, newBalance)

    expect(await dai.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(dai.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await dai.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await dai.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(1000)
    await waitFor(strat.harvest())

    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 DAI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    const initialBalance = await dai.balanceOf(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await dai.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      93.05e18 + '', // 95 - 2.1% (withdrawFee 0.1% + slippage ratio and/or swap difference 2%)
      95e18 + ''
    )

    // less than 0.1 because swap is not exact
    expect((await dai.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    // less than 0.001
    expect((await qi.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e15)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await dai.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      9126.0e17 + '0', // Since we deposit 10000
      9990.0e17 + '0'  // between 0.1% and ~4.1% (withdraw fee + slippage ratio and/or swap difference twice)
    )
  })

  it('Controller.setStrategy works', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 18)

    await setCustomBalanceFor(dai.address, bob.address, newBalance)

    expect(await dai.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(dai.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await dai.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await dai.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerQuickSwapMaiLPStrat',
      dai.address,
      controller.address,
      global.exchange.address,
      owner.address,
      1e17 + ''
    )

    const MIM_ADDRESS = '0xa3Fa99A148fA48D14Ed51d610c367C61876997F1'

    await Promise.all([
      waitFor(otherStrat.setMaxPriceOffset(86400)),
      waitFor(otherStrat.setPoolSlippageRatio(200)), // 2%
      waitFor(otherStrat.setSwapSlippageRatio(200)), // 2%
      waitFor(otherStrat.setPriceFeed(usdc.address, usdcFeed.address)),
      waitFor(otherStrat.setPriceFeed(dai.address, daiFeed.address)),
      waitFor(otherStrat.setPriceFeed(qi.address, qiFeed.address)),
      waitFor(otherStrat.setRewardToWantRoute(qi.address, [qi.address, WMATIC.address, dai.address])),
      waitFor(otherStrat.setRoute(MIM_ADDRESS, [MIM_ADDRESS, usdc.address])),
      waitFor(otherStrat.setRoute(usdc.address, [usdc.address, MIM_ADDRESS])),
      waitFor(otherStrat.setRoute(dai.address, [dai.address, WMATIC.address, usdc.address])),
      waitFor(otherStrat.setRoute(dai.address, [dai.address, WMATIC.address, MIM_ADDRESS])),
      waitFor(otherStrat.setRoute(usdc.address, [usdc.address, WMATIC.address, dai.address])),
      waitFor(otherStrat.setRoute(MIM_ADDRESS, [MIM_ADDRESS, WMATIC.address, dai.address]))
    ])

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal(10000e16 + '00')
    expect(await dai.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await dai.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal(10000e16 + '00')
    expect(await dai.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await dai.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)
  })
})

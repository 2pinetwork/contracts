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

describe('Controller QuickSwap MAI LP Strat on USDC', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let qi
  let qiFeed
  let maiFeed
  let swapper
  let setupStrat

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

    qi = await ethers.getContractAt('IERC20Metadata', '0x580a84c73811e1839f75d86d75d88cca0c241ff4')

    controller = await createController(USDC, archimedes, 'ControllerQuickSwapMaiLPStrat', {
      maxWantBalance: 1e5 + ''
    })

    await waitFor(archimedes.addNewPool(USDC.address, controller.address, 10, false));

    [strat, maiFeed, qiFeed] = await Promise.all([
      ethers.getContractAt('ControllerQuickSwapMaiLPStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', usdcFeed.address),
      ethers.getContractAt('IChainLink', '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444') // Doge less than qi
    ])

    setupStrat = async (strategy) => {
      const LP = await ethers.getContractAt('IERC20Metadata', '0x160532D2536175d65C03B97b0630A9802c274daD')

      swapper = await deploy(
        'SwapperWithCompensationUniV2',
        USDC.address,
        LP.address,
        strategy.address,
        '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'
      )

      const MAI_ADDRESS = '0xa3Fa99A148fA48D14Ed51d610c367C61876997F1'

      await Promise.all([
        waitFor(strategy.setMaxPriceOffset(86400)),
        waitFor(strategy.setPoolSlippageRatio(200)), // 2%
        waitFor(strategy.setSwapSlippageRatio(200)), // 2%
        waitFor(strategy.setPriceFeed(USDC.address, usdcFeed.address)),
        waitFor(strategy.setPriceFeed(qi.address, qiFeed.address)),
        waitFor(strategy.setPriceFeed(MAI_ADDRESS, maiFeed.address)),
        waitFor(strategy.setRewardToWantRoute(qi.address, [qi.address, WMATIC.address, USDC.address])),
        waitFor(strategy.setSwapper(swapper.address)),
        waitFor(swapper.setMaxPriceOffset(86400)),
        waitFor(swapper.setSwapSlippageRatio(200)), // 2%
        waitFor(swapper.setReserveSwapRatio(50)), // 0.5%
        waitFor(swapper.setPriceFeed(USDC.address, usdcFeed.address)),
        waitFor(swapper.setPriceFeed(MAI_ADDRESS, maiFeed.address)),
        waitFor(swapper.setRoute(MAI_ADDRESS, [MAI_ADDRESS, USDC.address])),
        waitFor(swapper.setRoute(USDC.address, [USDC.address, MAI_ADDRESS]))
      ])
    }

    await Promise.all([
      setChainlinkRoundForNow(usdcFeed),
      setChainlinkRoundForNow(maiFeed),
      setChainlinkRoundForNow(qiFeed),
      setupStrat(strat)
    ])
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 6)

    await setCustomBalanceFor(USDC.address, bob.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await USDC.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(1000)

    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e6 + '').div(
        await controller.balance()
      )
    )

    const initialBalance = await USDC.balanceOf(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await USDC.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      94.6e6 + '', 95e6 + '' // 95 - 0.1% withdrawFee - 0.3% swap
    )

    // less than 0.1 because swap is not exact
    expect((await USDC.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    // less than 0.001
    expect((await qi.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e15)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await USDC.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      9900.0e6 + '', // Since we deposit 10000
      9990.0e6 + ''  // between 0.1% and ~1% (withdraw fee + swap fees + slippage ratio)
    )

    expect(await strat.balanceOfPool()).to.be.equal(0)
  })

  it('Full deposit with compensation + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 6)

    await setCustomBalanceFor(USDC.address, bob.address, newBalance)
    await setCustomBalanceFor(USDC.address, swapper.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await USDC.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(1000)

    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e6 + '').div(
        await controller.balance()
      )
    )

    const initialBalance = await USDC.balanceOf(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await USDC.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      94.6e6 + '', 95e6 + '' // 95 - 0.1% withdrawFee - 0.3% swap
    )

    // less than 0.1 because swap is not exact
    expect((await USDC.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    // less than 0.001
    expect((await qi.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e15)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await USDC.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      9900.0e6 + '', // Since we deposit 10000
      9990.0e6 + ''  // between 0.1% and ~1% (withdraw fee + swap fees + slippage ratio)
    )

    expect(await strat.balanceOfPool()).to.be.equal(0)
  })

  it('Controller.setStrategy works', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 6)

    await setCustomBalanceFor(USDC.address, bob.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await USDC.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerQuickSwapMaiLPStrat',
      USDC.address,
      controller.address,
      global.exchange.address,
      owner.address,
      1e5 + ''
    )

    await setupStrat(otherStrat)

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 10000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await USDC.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 10000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await USDC.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e5)
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
  let qi
  let qiFeed
  let maiFeed
  let swapper

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

    qi = await ethers.getContractAt('IERC20Metadata', '0x580a84c73811e1839f75d86d75d88cca0c241ff4')

    controller = await createController(DAI, archimedes, 'ControllerQuickSwapMaiLPStrat', {
      maxWantBalance: 1e17 + ''
    })

    await waitFor(archimedes.addNewPool(DAI.address, controller.address, 10, false));

    [strat, maiFeed, qiFeed] = await Promise.all([
      ethers.getContractAt('ControllerQuickSwapMaiLPStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', usdcFeed.address),
      ethers.getContractAt('IChainLink', '0xbaf9327b6564454F4a3364C33eFeEf032b4b4444') // Doge less than qi
    ])

    setupStrat = async (strategy) => {
      const LP = await ethers.getContractAt('IERC20Metadata', '0x160532D2536175d65C03B97b0630A9802c274daD')

      swapper = await deploy(
        'SwapperWithCompensationUniV2',
        DAI.address,
        LP.address,
        strategy.address,
        '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'
      )

      const MAI_ADDRESS = '0xa3Fa99A148fA48D14Ed51d610c367C61876997F1'

      await Promise.all([
        waitFor(strategy.setMaxPriceOffset(86400)),
        waitFor(strategy.setPoolSlippageRatio(200)), // 2%
        waitFor(strategy.setSwapSlippageRatio(200)), // 2%
        waitFor(strategy.setPriceFeed(DAI.address, daiFeed.address)),
        waitFor(strategy.setPriceFeed(USDC.address, usdcFeed.address)),
        waitFor(strategy.setPriceFeed(qi.address, qiFeed.address)),
        waitFor(strategy.setPriceFeed(MAI_ADDRESS, maiFeed.address)),
        waitFor(strategy.setRewardToWantRoute(qi.address, [qi.address, WMATIC.address, DAI.address])),
        waitFor(strategy.setSwapper(swapper.address)),
        waitFor(swapper.setMaxPriceOffset(86400)),
        waitFor(swapper.setSwapSlippageRatio(200)), // 2%
        waitFor(swapper.setPriceFeed(DAI.address, daiFeed.address)),
        waitFor(swapper.setPriceFeed(USDC.address, usdcFeed.address)),
        waitFor(swapper.setPriceFeed(MAI_ADDRESS, maiFeed.address)),
        // want is DAI so DAI => [USDC, MAI] && [USDC, MAI] => DAI
        waitFor(swapper.setRoute(MAI_ADDRESS, [MAI_ADDRESS, DAI.address])),
        waitFor(swapper.setRoute(USDC.address, [USDC.address, DAI.address])),
        waitFor(swapper.setRoute(DAI.address, [DAI.address, USDC.address])),
        waitFor(swapper.setRoute(DAI.address, [DAI.address, MAI_ADDRESS]))
      ])
    }

    await Promise.all([
      setChainlinkRoundForNow(usdcFeed),
      setChainlinkRoundForNow(daiFeed),
      setChainlinkRoundForNow(maiFeed),
      setChainlinkRoundForNow(qiFeed),
      setupStrat(strat),
    ])
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 18)

    await setCustomBalanceFor(DAI.address, bob.address, newBalance)

    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await DAI.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(1000)

    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 DAI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    const initialBalance = await DAI.balanceOf(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await DAI.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      94.9e18 + '', // 95 - 0.1%
      95e18 + ''
    )

    // less than 0.1 because swap is not exact
    expect((await DAI.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    // less than 0.001
    expect((await qi.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e15)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await DAI.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      9615.0e17 + '0', // Since we deposit 10000
      9990.0e17 + '0'  // between 0.1% and ~4.1% (withdraw fee + slippage ratio and/or swap difference twice)
    )

    expect(await strat.balanceOfPool()).to.be.equal(0)
  })

  it('Full deposit with compensate + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 18)

    await setCustomBalanceFor(DAI.address, bob.address, newBalance.mul(2))
    // Has to be done via transfer for some weird bug setting balance using setCustomBalanceFor
    await DAI.connect(bob).transfer(swapper.address, newBalance.div(2))

    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await DAI.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(1000)

    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 DAI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    const initialBalance = await DAI.balanceOf(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await DAI.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      94.9e18 + '', // 95 - 0.1%
      95e18 + ''
    )

    // less than 0.1 because swap is not exact
    expect((await DAI.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    // less than 0.001
    expect((await qi.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e15)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await DAI.balanceOf(bob.address)

    expect(afterBalance.sub(initialBalance)).to.within(
      9615.0e17 + '0', // Since we deposit 10000
      9990.0e17 + '0'  // between 0.1% and ~4.1% (withdraw fee + slippage ratio and/or swap difference twice)
    )

    expect(await strat.balanceOfPool()).to.be.equal(0)
  })

  it('Controller.setStrategy works DAI', async () => {
    const newBalance = ethers.utils.parseUnits('10000', 18)

    await setCustomBalanceFor(DAI.address, bob.address, newBalance)

    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await DAI.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerQuickSwapMaiLPStrat',
      DAI.address,
      controller.address,
      global.exchange.address,
      owner.address,
      1e17 + ''
    )

    await setupStrat(otherStrat)

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal(10000e16 + '00')
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await DAI.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal(10000e16 + '00')
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await DAI.balanceOf(strat.address)).toNumber()).to.be.lessThan(1e17)
    expect(await qi.balanceOf(strat.address)).to.be.equal(0)
  })
})

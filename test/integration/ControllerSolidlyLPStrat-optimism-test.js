const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
  waitFor,
  zeroAddress
} = require('../helpers')

const {
  resetHardhat,
  setChainlinkRoundForNow,
  setCustomBalanceFor,
  setWethBalanceFor
} = require('./helpers')

const itIf = async (cond, title, test) => {
  return cond ? it(title, test) : it.skip(title, test)
}

describe('Controller Solidly LP Strat on WETH', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let velo
  let seth
  let veloFeed
  let ethFeed
  let sethFeed
  let swapper
  let setupStrat

  before(async function () { await resetHardhat(31231746) })

  beforeEach(async function () {
    global.WETH     = await ethers.getContractAt('IERC20Metadata', '0x4200000000000000000000000000000000000006')
    global.exchange = await ethers.getContractAt('ISolidlyRouter', '0x9c12939390052919aF3155f41Bf4160Fd3666A6f');

    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      WETH.address
    )

    velo = await ethers.getContractAt('IERC20Metadata', '0x3c8B650257cFb5f272f799F5e2b4e65093a11a05')
    seth = await ethers.getContractAt('IERC20Metadata', '0xE405de8F52ba7559f9df3C368500B6E6ae6Cee49')

    controller = await createController(WETH, archimedes, 'ControllerSolidlyLPStrat', {
      gauge: '0x101D5e5651D7f949154258C1C7516da1eC273476',
      lp:    '0xFd7FddFc0A729eCF45fB6B12fA3B71A575E1966F'
    })

    await waitFor(archimedes.addNewPool(WETH.address, controller.address, 10, false));

    [strat, ethFeed, sethFeed, veloFeed] = await Promise.all([
      ethers.getContractAt('ControllerSolidlyLPStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0x13e3Ee699D1909E989722E753853AE30b17e08c5'),
      ethers.getContractAt('IChainLink', '0x13e3Ee699D1909E989722E753853AE30b17e08c5'),
      ethers.getContractAt('IChainLink', '0x7CFB4fac1a2FDB1267F8bc17FADc12804AC13CFE') // ONE has similar price
    ])

    setupStrat = async (strategy) => {
      const LP = await ethers.getContractAt('IERC20Metadata', '0xFd7FddFc0A729eCF45fB6B12fA3B71A575E1966F')

      swapper = await deploy(
        'SwapperWithCompensationSolidly',
        WETH.address,
        LP.address,
        strategy.address,
        exchange.address
      )

      await Promise.all([
        waitFor(strategy.setMaxPriceOffset(86400)),
        waitFor(strategy.setPoolSlippageRatio(200)), // 2%
        waitFor(strategy.setSwapSlippageRatio(200)), // 2%
        waitFor(strategy.setPriceFeed(WETH.address, ethFeed.address)),
        waitFor(strategy.setPriceFeed(velo.address, veloFeed.address)),
        waitFor(strategy.setRewardToWantSolidlyRoute(velo.address, [{ from: velo.address, to: WETH.address, stable: true }])),
        waitFor(strategy.setSwapper(swapper.address)),
        waitFor(swapper.setMaxPriceOffset(86400)),
        waitFor(swapper.setSwapSlippageRatio(200)), // 2%
        waitFor(swapper.setPriceFeed(WETH.address, ethFeed.address)),
        waitFor(swapper.setPriceFeed(seth.address, sethFeed.address)),
        waitFor(swapper.setRoute(seth.address, [{ from: seth.address, to: WETH.address, stable: true }])),
        waitFor(swapper.setRoute(WETH.address, [{ from: WETH.address, to: seth.address, stable: true }]))
      ])
    }

    await Promise.all([
      setChainlinkRoundForNow(ethFeed),
      setChainlinkRoundForNow(sethFeed),
      setChainlinkRoundForNow(veloFeed),
      setupStrat(strat)
    ])
  })

  itIf(hre.network.config.network_id === 10, 'Full deposit + harvest strat + withdraw', async function () {
    const newBalance = ethers.utils.parseUnits('100')

    await setWethBalanceFor(bob.address, '100', 3)

    expect(await WETH.balanceOf(strat.address)).to.be.equal(0)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(WETH.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await WETH.balanceOf(controller.address)).to.be.equal(0)
    expect(await WETH.balanceOf(bob.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await WETH.balanceOf(strat.address)).lt(1e17 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(100)

    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 WETH in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    const beforeBalance = await ethers.provider.getBalance(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await ethers.provider.getBalance(bob.address)

    expect(afterBalance.sub(beforeBalance)).to.within(
      94.6e18 + '',
      95.0e18 + '' // 95 - 0.1% withdrawFee - 0.3% swap
    )

    // less than 0.1 because swap is not exact
    expect((await WETH.balanceOf(strat.address)).lt(1e17 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await ethers.provider.getBalance(bob.address)

    expect(afterBalance.sub(beforeBalance)).to.within(
      98.5e18 + '', // Since we deposit 100
      99.9e18 + ''  // between 0.1% and ~1.5% (withdraw fee + swap fees + slippage ratio + lp formation)
    )

    expect(await strat.balanceOfPool()).to.be.equal(0)
  })

  itIf(hre.network.config.network_id === 10, 'Full deposit with compensation + harvest strat + withdraw', async function () {
    const newBalance = ethers.utils.parseUnits('100')

    await setWethBalanceFor(bob.address, '200', 3)
    // Has to be done via transfer for some weird bug setting balance using setWethBalanceFor
    await WETH.connect(bob).transfer(swapper.address, ethers.utils.parseUnits('100'))

    expect(await WETH.balanceOf(strat.address)).to.be.equal(0)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(WETH.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await WETH.balanceOf(controller.address)).to.be.equal(0)
    expect(await WETH.balanceOf(bob.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await WETH.balanceOf(strat.address)).lt(1e17 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(100)

    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 WETH in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    const beforeBalance = await ethers.provider.getBalance(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await ethers.provider.getBalance(bob.address)

    expect(afterBalance.sub(beforeBalance)).to.within(
      94.6e18 + '',
      95.0e18 + '' // 95 - 0.1% withdrawFee - 0.3% swap
    )

    // less than 0.1 because swap is not exact
    expect((await WETH.balanceOf(strat.address)).lt(1e17 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await ethers.provider.getBalance(bob.address)

    expect(afterBalance.sub(beforeBalance)).to.within(
      99.50e18 + '', // Since we deposit 100
      99.99e18 + ''  // between 0.01% and ~0.5% (withdraw fee + swap fees + slippage ratio)
    )

    expect(await strat.balanceOfPool()).to.be.equal(0)
  })

  itIf(hre.network.config.network_id === 10, 'Controller.setStrategy works', async function () {
    const newBalance = ethers.utils.parseUnits('100')

    await setWethBalanceFor(bob.address, '100', 3)

    expect(await WETH.balanceOf(strat.address)).to.be.equal(0)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(WETH.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await WETH.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await WETH.balanceOf(strat.address)).lt(1e17 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerSolidlyLPStrat',
      WETH.address,
      controller.address,
      '0x9c12939390052919aF3155f41Bf4160Fd3666A6f', // Velodrome router
      owner.address,
      '0x101D5e5651D7f949154258C1C7516da1eC273476', // Gauge
      '0xFd7FddFc0A729eCF45fB6B12fA3B71A575E1966F'  // LP
    )

    await setupStrat(otherStrat)

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await WETH.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await WETH.balanceOf(strat.address)).lt(1e17 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await WETH.balanceOf(controller.address)).to.be.equal(0)
    // less than 0.1 because swap is not exact
    expect((await WETH.balanceOf(strat.address)).lt(1e17 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)
  })

  itIf(hre.network.config.network_id === 10, 'Rebalance', async function () {
    const newBalance = ethers.utils.parseUnits('100')

    await setWethBalanceFor(bob.address, '100', 3)
    await WETH.connect(bob).transfer(strat.address, ethers.utils.parseUnits('1'))

    expect(await WETH.balanceOf(strat.address)).to.be.equal(1e18 + '')
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    let stratBalance = await strat.balanceOfPoolInWant()

    await strat.rebalance()

    expect((await WETH.balanceOf(strat.address)).lt(1e16 + '')).to.be.equal(true)
    expect(await strat.balanceOfPoolInWant()).to.be.within(
      stratBalance.add(0.98e18 + ''),
      stratBalance.add(1.02e18 + '')
    )

    const timestamp = (await ethers.provider.getBlock()).timestamp

    // Since sETH is a proxy contract instead of custom set balance we go with some good old swap =)
    await WETH.connect(bob).approve(exchange.address, 2e18 + '')

    await waitFor(
      exchange.connect(bob).swapExactTokensForTokens(
        2e18 + '',
        1e18 + '',
        [{ from: WETH.address, to: seth.address, stable: true }],
        bob.address,
        timestamp + 60
      )
    )

    await seth.connect(bob).transfer(strat.address, ethers.utils.parseUnits('1'))

    expect(await seth.balanceOf(strat.address)).to.be.gte(1e18 + '')

    stratBalance = await strat.balanceOfPoolInWant()

    await strat.rebalance()

    expect((await seth.balanceOf(strat.address)).lt(1e16 + '')).to.be.equal(true)
    expect(await strat.balanceOfPoolInWant()).to.be.within(
      stratBalance.add(0.98e18 + ''),
      stratBalance.add(1.02e18 + '')
    )
  })
})

describe('Controller Solidly LP Strat on USDC', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let velo
  let mai
  let veloFeed
  let usdcFeed
  let maiFeed
  let swapper
  let setupStrat

  before(async function () { await resetHardhat(31231746) })

  beforeEach(async function () {
    global.WETH     = await ethers.getContractAt('IERC20Metadata', '0x4200000000000000000000000000000000000006')
    global.USDC     = await ethers.getContractAt('IERC20Metadata', '0x7F5c764cBc14f9669B88837ca1490cCa17c31607')
    global.exchange = await ethers.getContractAt('ISolidlyRouter', '0x9c12939390052919aF3155f41Bf4160Fd3666A6f');

    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      WETH.address
    )

    velo = await ethers.getContractAt('IERC20Metadata', '0x3c8B650257cFb5f272f799F5e2b4e65093a11a05')
    mai  = await ethers.getContractAt('IERC20Metadata', '0xdFA46478F9e5EA86d57387849598dbFB2e964b02')

    controller = await createController(USDC, archimedes, 'ControllerSolidlyLPStrat', {
      gauge: '0xDF479E13E71ce207CE1e58D6f342c039c3D90b7D',
      lp:    '0xd62C9D8a3D4fd98b27CaaEfE3571782a3aF0a737'
    })

    await waitFor(archimedes.addNewPool(USDC.address, controller.address, 10, false));

    [strat, usdcFeed, maiFeed, veloFeed] = await Promise.all([
      ethers.getContractAt('ControllerSolidlyLPStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3'),
      ethers.getContractAt('IChainLink', '0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6'), // DAI has similar price
      ethers.getContractAt('IChainLink', '0x7CFB4fac1a2FDB1267F8bc17FADc12804AC13CFE') // ONE has similar price
    ])

    setupStrat = async (strategy) => {
      const LP = await ethers.getContractAt('IERC20Metadata', '0xd62C9D8a3D4fd98b27CaaEfE3571782a3aF0a737')

      swapper = await deploy(
        'SwapperWithCompensationSolidly',
        USDC.address,
        LP.address,
        strategy.address,
        exchange.address
      )

      await Promise.all([
        waitFor(strategy.setMaxPriceOffset(86400)),
        waitFor(strategy.setPoolSlippageRatio(200)), // 2%
        waitFor(strategy.setSwapSlippageRatio(200)), // 2%
        waitFor(strategy.setPriceFeed(USDC.address, usdcFeed.address)),
        waitFor(strategy.setPriceFeed(velo.address, veloFeed.address)),
        waitFor(strategy.setRewardToWantSolidlyRoute(velo.address, [{ from: velo.address, to: USDC.address, stable: true }])),
        waitFor(strategy.setSwapper(swapper.address)),
        waitFor(swapper.setMaxPriceOffset(86400)),
        waitFor(swapper.setSwapSlippageRatio(200)), // 2%
        waitFor(swapper.setReserveSwapRatio(120)), // 1.2%
        waitFor(swapper.setPriceFeed(USDC.address, usdcFeed.address)),
        waitFor(swapper.setPriceFeed(mai.address, maiFeed.address)),
        waitFor(swapper.setRoute(mai.address, [{ from: mai.address, to: USDC.address, stable: true }])),
        waitFor(swapper.setRoute(USDC.address, [{ from: USDC.address, to: mai.address, stable: true }]))
      ])
    }

    await Promise.all([
      setChainlinkRoundForNow(usdcFeed),
      setChainlinkRoundForNow(maiFeed),
      setChainlinkRoundForNow(veloFeed),
      setupStrat(strat)
    ])
  })

  itIf(hre.network.config.network_id === 10, 'Full deposit + harvest strat + withdraw', async function () {
    const newBalance = ethers.utils.parseUnits('100000', 6)

    await setCustomBalanceFor(USDC.address, bob.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(bob.address)).to.be.equal(0)
    // less than 100 (0.1%) because swap is not exact
    expect((await USDC.balanceOf(strat.address)).lt(100e6 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(100)

    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95000 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95000e6 + '').div(
        await controller.balance()
      )
    )

    const beforeBalance = await USDC.balanceOf(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await USDC.balanceOf(bob.address)

    expect(afterBalance.sub(beforeBalance)).to.within(
      94600.0e6 + '',
      95000.0e6 + '' // 95000 - 0.1% withdrawFee - 0.3% swap
    )

    // less than 100 (0.1%) because swap is not exact
    expect((await USDC.balanceOf(strat.address)).lt(100e6 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await USDC.balanceOf(bob.address)

    expect(afterBalance.sub(beforeBalance)).to.within(
      98500.0e6 + '', // Since we deposit 100000
      99900.0e6 + ''  // between 0.1% and ~1.5% (withdraw fee + swap fees + slippage ratio + lp formation)
    )

    expect(await strat.balanceOfPool()).to.be.equal(0)
  })

  itIf(hre.network.config.network_id === 10, 'Full deposit with compensation + harvest strat + withdraw', async function () {
    const newBalance = ethers.utils.parseUnits('100000', 6)

    await setCustomBalanceFor(USDC.address, bob.address, ethers.utils.parseUnits('200000', 6))
    // Has to be done via transfer for some weird bug setting balance using setCustomBalanceFor
    await USDC.connect(bob).transfer(swapper.address, ethers.utils.parseUnits('100000', 6))

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(bob.address)).to.be.equal(0)
    // less than 100 because swap is not exact
    expect((await USDC.balanceOf(strat.address)).lt(100e6 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    await mineNTimes(100)

    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95000 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95000e6 + '').div(
        await controller.balance()
      )
    )

    const beforeBalance = await USDC.balanceOf(bob.address)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    let afterBalance = await USDC.balanceOf(bob.address)

    expect(afterBalance.sub(beforeBalance)).to.within(
      94600.0e6 + '',
      95000.0e6 + '' // 95 - 0.1% withdrawFee - 0.3% swap
    )

    // less than 100 (0.1%) because swap is not exact
    expect((await USDC.balanceOf(strat.address)).lt(100e6 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))

    afterBalance = await USDC.balanceOf(bob.address)

    expect(afterBalance.sub(beforeBalance)).to.within(
      99500e6 + '', // Since we deposit 100000
      99990e6 + ''  // between 0.01% and ~0.5% (withdraw fee + swap fees + slippage ratio)
    )

    expect(await strat.balanceOfPool()).to.be.equal(0)
  })

  itIf(hre.network.config.network_id === 10, 'Controller.setStrategy works', async function () {
    const newBalance = ethers.utils.parseUnits('100000', 6)

    await setCustomBalanceFor(USDC.address, bob.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).deposit(0, newBalance, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    // less than 100 (0.1%) because swap is not exact
    expect((await USDC.balanceOf(strat.address)).lt(100e6 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerSolidlyLPStrat',
      USDC.address,
      controller.address,
      '0x9c12939390052919aF3155f41Bf4160Fd3666A6f', // Velodrome router
      owner.address,
      '0xDF479E13E71ce207CE1e58D6f342c039c3D90b7D', // Gauge
      '0xd62C9D8a3D4fd98b27CaaEfE3571782a3aF0a737'  // LP
    )

    await setupStrat(otherStrat)

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    // less than 100 (0.1%) because swap is not exact
    expect((await USDC.balanceOf(strat.address)).lt(100e6 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    // less than 100 (0.1%) because swap is not exact
    expect((await USDC.balanceOf(strat.address)).lt(100e6 + '')).to.be.equal(true)
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)
  })

  itIf(hre.network.config.network_id === 10, 'Rebalance', async function () {
    const newBalance = ethers.utils.parseUnits('100000', 6)

    await setCustomBalanceFor(USDC.address, bob.address, newBalance);
    await USDC.connect(bob).transfer(strat.address, ethers.utils.parseUnits('100', 6))

    expect(await USDC.balanceOf(strat.address)).to.be.equal(100e6 + '')
    expect(await velo.balanceOf(strat.address)).to.be.equal(0)

    let stratBalance = await strat.balanceOfPoolInWant()

    await strat.rebalance()

    expect((await USDC.balanceOf(strat.address)).lt(1e6 + '')).to.be.equal(true)
    expect(await strat.balanceOfPoolInWant()).to.be.within(
      stratBalance.add(98e6 + ''),
      stratBalance.add(102e6 + '')
    )

    const timestamp = (await ethers.provider.getBlock()).timestamp

    await setCustomBalanceFor(mai.address, bob.address, '100', 1);

    await mai.connect(bob).transfer(strat.address, ethers.utils.parseUnits('100'))

    expect(await mai.balanceOf(strat.address)).to.be.gte(100e18 + '')

    stratBalance = await strat.balanceOfPoolInWant()

    await strat.rebalance()

    expect((await mai.balanceOf(strat.address)).lt(1e18 + '')).to.be.equal(true)
    expect(await strat.balanceOfPoolInWant()).to.be.within(
      stratBalance.add(98e6 + ''),
      stratBalance.add(102e6 + '')
    )
  })
})

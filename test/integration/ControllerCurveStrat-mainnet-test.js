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
  setChainlinkRoundForNow,
  setCustomBalanceFor,
} = require('./helpers')

const itIf = async (cond, title, test) => {
  if (cond) {
    return it(title, test)
  }
}

const initializeTokens = async () => {
  const uniswapAbi = require('./abis/uniswap-router.json')
  const promises   = []

  const ERC20_TOKENS = {
    CRV:  '0xD533a949740bb3306d119CC777fa900bA034cd52',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI:  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    SNX:  '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  }

  for (const symbol in ERC20_TOKENS) {
    promises.push(
      ethers.getContractAt('IERC20Metadata', ERC20_TOKENS[symbol]).then(c => (global[symbol] = c))
    )
  }

  const CHAINLINK_ORACLES = {
    daiFeed:  '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
    usdcFeed: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
    crvFeed:  '0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f',
    snxFeed:  '0xDC3EA94CD0AC27d9A86C180091e7f78C683d3699'
  }

  for (const key in CHAINLINK_ORACLES) {
    promises.push(
      ethers.getContractAt('IChainLink', CHAINLINK_ORACLES[key]).then(c => (global[key] = c))
    )
  }

  promises.push(
    ethers.getContractAt(uniswapAbi, '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F').then(c => (global.exchange = c))
  )

  await Promise.all(promises)
}

const addresses = {
  crvToken:     '0xC25a3A3b969415c80451098fa907EC722572917F',
  pool:         '0xFCBa3E75865d2d561BE8D220616520c171F12851',
  swapPool:     '0xA5407eAE9Ba41422680e2e00537571bcC53efBfD',
  gauge:        '0xA90996896660DEcC6E997655E065b23788857849',
  gaugeFactory: '0xd061D61a4d941c39E5453435B6345Dc261C2fcE0',
}

describe('Controller Curve Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let REWARD_TOKEN
  let stratCallback

  beforeEach(async () => {
    await initializeTokens();

    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy('Archimedes', piToken.address, rewardsBlock, WETH.address)
    REWARD_TOKEN = await ethers.getContractAt('IERC20Metadata', CRV.address)
    controller   = await createController(USDC, archimedes, 'ControllerCurveStrat', {
      ...addresses,
      gaugeType: 0
    })

    strat = await ethers.getContractAt('ControllerCurveStrat', (await controller.strategy()))

    await waitFor(archimedes.addNewPool(USDC.address, controller.address, 10, false));

    stratCallback = async strategy => {
      await Promise.all([
        waitFor(strategy.setMaxPriceOffset(86400)),
        waitFor(strategy.setPoolSlippageRatio(500)), // 5%
        waitFor(strategy.setSwapSlippageRatio(150)), // 1.5%
        waitFor(strategy.setPriceFeed(CRV.address, crvFeed.address)),
        waitFor(strategy.setPriceFeed(USDC.address, usdcFeed.address)),
        waitFor(strategy.setPriceFeed(SNX.address, snxFeed.address)),
        waitFor(strategy.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, WETH.address, USDC.address])),
        waitFor(strategy.setRewardToWantRoute(SNX.address, [SNX.address, WETH.address, USDC.address]))
      ])
    }

    await Promise.all([
      setChainlinkRoundForNow(usdcFeed),
      stratCallback(strat)
    ])
  })

  itIf(hre.network.config.network_id === 1, 'Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance, 9)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool() // more decimals

    await mineNTimes(100)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 9500 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95000e6 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await USDC.balanceOf(bob.address)).to.within(
      94900e6 + '', 95000e6 + '' // 9500 - 0.1% withdrawFee
    )
    expect(await USDC.balanceOf(strat.address)).to.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await USDC.balanceOf(bob.address)).to.within(
      99800e6 + '', // between 0.1% and 0.2%
      99900e6 + ''
    )
  })

  itIf(hre.network.config.network_id === 1, 'Full deposit with compensation + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance, 9)
    await setCustomBalanceFor(USDC.address, owner.address, newBalance, 9)

    await waitFor(USDC.connect(owner).approve(strat.address, newBalance))

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool() // more decimals

    await mineNTimes(100)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 9500 USDC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95000e6 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await USDC.balanceOf(bob.address)).to.within(
      94900e6 + '', 95000e6 + '' // 9500 - 0.1% withdrawFee
    )
    expect(await USDC.balanceOf(strat.address)).to.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await USDC.balanceOf(bob.address)).to.within(
      99001e6 + '', // between 0.1% and 0.01%
      99999e6 + ''
    )
  })

  itIf(hre.network.config.network_id === 1, 'Controller.setStrategy works', async () => {
    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance, 9)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerCurveStrat',
      USDC.address,
      controller.address,
      global.exchange.address,
      owner.address,
      addresses.crvToken,
      addresses.pool,
      addresses.swapPool,
      addresses.gauge,
      addresses.gaugeFactory,
      0 // Staking gauge
    )

    await stratCallback(otherStrat)

    await mineNTimes(5)

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
  })

  itIf(hre.network.config.network_id === 1, 'boost should revert for unknown user', async () => {
    const booster = (await ethers.getSigners())[8]
    await expect(strat.connect(booster).boost(1e6)).to.be.revertedWith('Not a booster')
    expect(await strat.lastExternalBoost()).to.be.equal(0)
  })

  itIf(hre.network.config.network_id === 1, 'Deposit with compensation + manual reward', async () => {
    // give booster permissions
    const booster = (await ethers.getSigners())[8]
    const equalizer = (await ethers.getSigners())[9]
    await waitFor(strat.grantRole(await strat.BOOSTER_ROLE(), booster.address))

    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance, 9)
    await setCustomBalanceFor(USDC.address, equalizer.address, newBalance, 9)
    await setCustomBalanceFor(USDC.address, booster.address, newBalance, 9)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    let balance = await strat.balance()
    let treasuryBalance = await USDC.balanceOf(owner.address)
    let boosterBalance = await USDC.balanceOf(booster.address)

    await waitFor(USDC.connect(booster).approve(strat.address, newBalance))
    await waitFor(strat.connect(booster).boost(1e6))
    expect(await strat.lastExternalBoost()).to.be.equal(1e6)
    // treasury shouldn't change
    expect(await USDC.balanceOf(owner.address)).to.be.equal(treasuryBalance)
    expect(await USDC.balanceOf(booster.address)).to.be.equal(boosterBalance.sub(1e6))

    expect(await strat.balance()).to.be.within(
      balance.add(0.99e6), balance.add(1.01e6)
    )

    balance = await strat.balance()
    treasuryBalance = await USDC.balanceOf(owner.address)
    boosterBalance = await USDC.balanceOf(booster.address)

    // compensate
    await waitFor(USDC.connect(owner).approve(strat.address, newBalance))
    await waitFor(USDC.connect(equalizer).approve(strat.address, newBalance))
    await waitFor(strat.setEqualizer(equalizer.address))

    await waitFor(strat.connect(booster).boost(1e6))
    expect(await strat.lastExternalBoost()).to.be.equal(1e6)
    expect(await USDC.balanceOf(owner.address)).to.be.equal(treasuryBalance)
    expect(await USDC.balanceOf(booster.address)).to.be.equal(boosterBalance.sub(1e6))
    expect(await strat.balance()).to.be.within(
      balance.add(0.99e6), balance.add(1.01e6)
    )
  })
})

describe('Controller Curve Strat with DAI', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let REWARD_TOKEN
  let stratCallback

  beforeEach(async () => {
    await initializeTokens();

    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy('Archimedes', piToken.address, rewardsBlock, WETH.address)
    REWARD_TOKEN = await ethers.getContractAt('IERC20Metadata', CRV.address)
    controller   = await createController(DAI, archimedes, 'ControllerCurveStrat', {
      ...addresses,
      gaugeType: 0
    })

    strat = await ethers.getContractAt('ControllerCurveStrat', (await controller.strategy()))

    await waitFor(archimedes.addNewPool(DAI.address, controller.address, 10, false));

    stratCallback = async strategy => {
      await Promise.all([
        waitFor(strategy.setMaxPriceOffset(86400)),
        waitFor(strategy.setPoolSlippageRatio(500)), // 5%
        waitFor(strategy.setSwapSlippageRatio(150)), // 1.5%
        waitFor(strategy.setPriceFeed(CRV.address, crvFeed.address)),
        waitFor(strategy.setPriceFeed(DAI.address, daiFeed.address)),
        waitFor(strategy.setPriceFeed(SNX.address, snxFeed.address)),
        waitFor(strategy.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, WETH.address, DAI.address])),
        waitFor(strategy.setRewardToWantRoute(SNX.address, [SNX.address, WETH.address, DAI.address]))
      ])
    }

    await Promise.all([
      setChainlinkRoundForNow(daiFeed),
      stratCallback(strat)
    ])
  })

  itIf(hre.network.config.network_id === 1, 'Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 1e18).mul(10000) // 100000 DAI
    await setCustomBalanceFor(DAI.address, bob.address, newBalance, 2)

    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool() // more decimals

    await mineNTimes(100)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    expect(await strat.balanceOfPool()).to.be.above(balance)

    const n9500 = ethers.BigNumber.from('' + 1e18).mul(9500) // 9500 DAI
    // withdraw 9500 DAI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(n9500).div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await DAI.balanceOf(bob.address)).to.within(
      n9500.mul(9990).div(10000), n9500 // 9500 - 0.1% withdrawFee
    )
    expect(await DAI.balanceOf(strat.address)).to.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await DAI.balanceOf(bob.address)).to.within(
      // between 0.2%~0.1% less
      newBalance.mul(9980).div(10000),
      newBalance.mul(9990).div(10000),
    )
  })

  itIf(hre.network.config.network_id === 1, 'Full deposit with compensation + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 1e18).mul(10000) // 100000 DAI
    await setCustomBalanceFor(DAI.address, bob.address, newBalance, 2)
    await setCustomBalanceFor(DAI.address, owner.address, newBalance, 2)

    await waitFor(DAI.connect(owner).approve(strat.address, newBalance))
    await waitFor(strat.setOffsetRatio(2))

    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool() // more decimals

    await mineNTimes(100)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    expect(await strat.balanceOfPool()).to.be.above(balance)

    const n9500 = ethers.BigNumber.from('' + 1e18).mul(9500) // 9500 DAI
    // withdraw 9500 DAI in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(n9500).div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await DAI.balanceOf(bob.address)).to.within(
      n9500.mul(9990).div(10000), n9500 // 9500 - 0.1% withdrawFee
    )
    expect(await DAI.balanceOf(strat.address)).to.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await DAI.balanceOf(bob.address)).to.within(
      // between 0.15% and 0.01%
      newBalance.mul(9985).div(10000),
      newBalance.mul(9999).div(10000),
    )
  })

  itIf(hre.network.config.network_id === 1, 'Controller.setStrategy works', async () => {
    const newBalance = ethers.BigNumber.from('' + 1e18).mul(100000) // 100000 DAI
    await setCustomBalanceFor(DAI.address, bob.address, newBalance, 2)

    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(DAI.connect(bob).approve(archimedes.address, newBalance))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerCurveStrat',
      DAI.address,
      controller.address,
      global.exchange.address,
      owner.address,
      '0xC25a3A3b969415c80451098fa907EC722572917F', // DAI/USDC/USDT/sUSD
      '0xFCBa3E75865d2d561BE8D220616520c171F12851', // DAI/USDC/USDT/sUSD pool
      '0xA5407eAE9Ba41422680e2e00537571bcC53efBfD', // DAI/USDC/USDT/sUSD swap pool
      '0xA90996896660DEcC6E997655E065b23788857849', // DAI/USDC/USDT/sUSD gauge
      '0xd061D61a4d941c39E5453435B6345Dc261C2fcE0', // DAI/USDC/USDT/sUSD gauge factory
      0 // Staking gauge
    )

    await stratCallback(otherStrat)

    await mineNTimes(5)

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal(newBalance)
    expect(await DAI.balanceOf(controller.address)).to.be.equal(0)
    expect(await DAI.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
  })
})

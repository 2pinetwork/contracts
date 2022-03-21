const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  mineNTimes,
  mineUntil,
  waitFor,
  zeroAddress
} = require('../helpers')

const {
  createOracles,
  createUsdcPairWithPrice,
  resetHardhat,
  setChainlinkRoundForNow,
  setCustomBalanceFor,
} = require('./helpers')

describe('Controller Jarvis Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let ageur
  let agden
  let eurFeed
  let usdcFeed
  let umaFeed
  let wmaticFeed
  let updatePrices

  beforeEach(async () => {
    await resetHardhat(25774000); // 2022-03-09 06: UTC

    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      WMATIC.address
    )

    // const global.USDC = await ethers.getContractAt('IERC20', '0x2791bca1f2de4661ed88a30c99a7a9449aa84174')

    agden = await ethers.getContractAt('IERC20Metadata', '0xbAbC2dE9cE26a5674F8da84381e2f06e1Ee017A1')
    ageur = await ethers.getContractAt('IERC20Metadata', '0xE0B52e49357Fd4DAf2c15e02058DCE6BC0057db4')

    controller = await createController(ageur, archimedes, 'ControllerJarvisStrat')

    await waitFor(archimedes.addNewPool(ageur.address, controller.address, 10, false));

    [strat, eurFeed, usdcFeed, umaFeed, wmaticFeed] = await Promise.all([
      ethers.getContractAt('ControllerJarvisStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0x73366Fe0AA0Ded304479862808e02506FE556a98'), // EUR
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'), // global.USDC
      ethers.getContractAt('IChainLink', '0x33D9B1BAaDcF4b26ab6F8E83e9cb8a611B2B3956'), // UMA
      ethers.getContractAt('IChainLink', '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0'), // WMATIC
    ])



    const JRT = '0x596ebe76e2db4470966ea395b0d063ac6197a8c5' // JRT
    const UMA = '0x3066818837c5e6ed6601bd5a91b0762877a6b731' // UMA
    const ANGLE = '0x900F717EA076E1E7a484ad9DD2dB81CEEc60eBF1' // ANGLE
    const MIMO = '0xADAC33f543267c4D59a8c299cF804c303BC3e4aC' // MIMO


    const tokenData = {
      [JRT]:           { price: 0.04 },
      [ANGLE]:         { price: 0.185 },
      [MIMO]:          { price: 0.075 },
      [agden.address]: { price: 824.0 },
    }
    await createOracles(tokenData)


    const QUICKSWAP = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'
    // const SUSHISWAP = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'


    updatePrices = async () => {
      await network.provider.send('hardhat_mine', ['0x2', '0x3f'])

      let proms = [
        setChainlinkRoundForNow(eurFeed),
        setChainlinkRoundForNow(umaFeed),
        setChainlinkRoundForNow(usdcFeed),
        setChainlinkRoundForNow(wmaticFeed),
      ]

      for (let token in tokenData) {
        proms.push(tokenData[token].oracle.update())
      }

      await Promise.all(proms)
    }

    await Promise.all([
      waitFor(strat.setMaxPriceOffset(86400)), // Time
      waitFor(strat.setPoolSlippageRatio(100)), // price variation
      waitFor(strat.setSwapSlippageRatio(500)), // price variation
      updatePrices(),
      waitFor(strat.setPriceFeed(WMATIC.address, wmaticFeed.address)),
      waitFor(strat.setPriceFeed(ageur.address, eurFeed.address)),
      waitFor(strat.setPriceFeed(UMA, umaFeed.address)),
      waitFor(strat.setPriceFeed(global.USDC.address, usdcFeed.address)),
      waitFor(strat.setPriceFeed(JRT, tokenData[JRT].oracle.address)),
      waitFor(strat.setPriceFeed(ANGLE, tokenData[ANGLE].oracle.address)),
      waitFor(strat.setPriceFeed(MIMO, tokenData[MIMO].oracle.address)),
      waitFor(strat.setPriceFeed(agden.address, tokenData[agden.address].oracle.address)),
      // Ideally set in this order, so we swap agDEN first for global.USDC and then global.USDC for agEUR
      waitFor(strat.setKyberRewardPathRoute(agden.address, ['0xBD0F10CE8F794f17499aEf6987dc8d21a59F46ad'])), // DMMPool
      waitFor(strat.setKyberRewardRoute(agden.address, [agden.address, global.USDC.address])), // DMMPool
      waitFor(strat.setRewardToTokenRoute(JRT, [JRT, WETH.address, global.USDC.address])),
      // waitFor(strat.setRewardExchange(JRT, sushi)),
      waitFor(strat.setRewardToTokenRoute(UMA, [UMA, WETH.address, global.USDC.address])),
      // waitFor(strat.setRewardExchange(UMA, sushi)),
      waitFor(strat.setRewardToWantRoute(ANGLE, [ANGLE, ageur.address])),
      waitFor(strat.setRewardExchange(ANGLE, QUICKSWAP)),

      // MIMO rewards are low and can't be swapped to usdc for the decimals
      waitFor(strat.setRewardToTokenRoute(MIMO, [MIMO, global.USDC.address, WMATIC.address])),
      waitFor(strat.setRewardToWantRoute(WMATIC.address, [WMATIC.address, global.USDC.address, ageur.address])),
      waitFor(strat.setRewardExchange(WMATIC.address, QUICKSWAP)),
    ])

    // global.USDC should always be the last
    await Promise.all([
      waitFor(strat.setRewardToWantRoute(global.USDC.address, [global.USDC.address, ageur.address])),
      waitFor(strat.setRewardExchange(global.USDC.address, QUICKSWAP)),
    ])
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    await setCustomBalanceFor(ageur.address, bob.address, '100', 51)

    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(ageur.connect(bob).approve(archimedes.address, '' + 100e18))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await ageur.balanceOf(controller.address)).to.be.equal(0)
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)

    let balanceOfPool = await strat.balanceOfPool()
    let balance = await strat.balance()

    // Claim some rewards
    await mineNTimes(10)
    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.balanceOfPool()).to.be.above(balanceOfPool)
    expect(await strat.balance()).to.be.above(balance)

    balanceOfPool = await strat.balanceOfPool()
    balance = await strat.balance()

    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    // Claim all rewards
    await mineUntil(26400000)
    await updatePrices()

    // just to test multi harvest
    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.harvest()).to.emit(strat, 'Harvested')
    expect(await strat.harvest()).to.emit(strat, 'Harvested')

    // balance Of pool shouldn't change after pool ends
    expect(await strat.balanceOfPool()).to.be.equal(balanceOfPool)
    expect(await strat.balance()).to.be.above(balance)

    // withdraw 95 ageur in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await ageur.balanceOf(bob.address)).to.within(
      94.9e18 + '', 95e18 + '' // 95 - 0.1% withdrawFee
    )
    // After pool is expired the agEUR should be kept in the strat
    expect(await ageur.balanceOf(strat.address)).to.above(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await ageur.balanceOf(bob.address)).to.above(
      99.8e18 + ''
    )

    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)
    expect(await agden.balanceOf(strat.address)).to.be.equal(0)
    const agcrv = await ethers.getContractAt('IERC20Metadata', '0x81212149b983602474fcD0943E202f38b38d7484')
    expect(await agcrv.balanceOf(strat.address)).to.be.equal(0)
  })

  it('Deposit and change strategy', async () => {
    await setCustomBalanceFor(ageur.address, bob.address, '100', 51)
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(ageur.connect(bob).approve(archimedes.address, '' + 100e18))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await ageur.balanceOf(controller.address)).to.be.equal(0)
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerJarvisStrat',
      controller.address,
      global.exchange.address,
      '0x546C79662E028B661dFB4767664d0273184E4dD1', // KyberSwap router
      owner.address
    )

    await Promise.all([
      waitFor(otherStrat.setMaxPriceOffset(86400)),
      waitFor(otherStrat.setPriceFeed(ageur.address, eurFeed.address)),
      waitFor(otherStrat.setPoolSlippageRatio(100)), // price variation
      waitFor(otherStrat.setSwapSlippageRatio(1000)), // price variation
      waitFor(strat.setSwapSlippageRatio(1000)), // price variation
    ])

    await mineNTimes(10) // increase the rewards to be swapped

    expect(await controller.setStrategy(otherStrat.address)).to.emit(controller, 'NewStrategy').withArgs(
      strat.address, otherStrat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e18 + '')
    expect(await ageur.balanceOf(controller.address)).to.be.equal(0)
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)
    expect(await strat.balance()).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.within(99.9e18 + '', 100e18 + '')

    await mineNTimes(10) // increase the rewards to be swapped
    await waitFor(strat.unpause())
    expect(await controller.setStrategy(strat.address)).to.emit(controller, 'NewStrategy').withArgs(
      otherStrat.address, strat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e18 + '')
    expect(await ageur.balanceOf(controller.address)).to.be.equal(0)
    expect(await ageur.balanceOf(strat.address)).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.equal(0)
    expect(await strat.balance()).to.be.within(99.9e18 + '', 100e18 + '')
  })
})

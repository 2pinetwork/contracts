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

describe('Controller mStable Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let usdcFeed
  let maticFeed
  let mtaFeed
  let DAI_ADDRESS
  let USDC
  let REWARD_TOKEN
  let WMATIC_TOKEN

  beforeEach(async () => {
    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    )

    DAI_ADDRESS  = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
    USDC         = await ethers.getContractAt('IERC20Metadata', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')
    REWARD_TOKEN = await ethers.getContractAt('IERC20Metadata', '0xF501dd45a1198C2E1b5aEF5314A68B9006D842E0')
    WMATIC_TOKEN = await ethers.getContractAt('IERC20Metadata', '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270')

    controller = await createController(USDC, archimedes, 'ControllerMStableStrat')

    await waitFor(archimedes.addNewPool(USDC.address, controller.address, 10, false));

    [strat, usdcFeed, maticFeed, mtaFeed] = await Promise.all([
      ethers.getContractAt('ControllerMStableStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7'),
      ethers.getContractAt('IChainLink', '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0'),
      ethers.getContractAt('IChainLink', '0x2346Ce62bd732c62618944E51cbFa09D985d86D2') // BAT has similar price
    ])

    await Promise.all([
      setChainlinkRoundForNow(usdcFeed),
      setChainlinkRoundForNow(maticFeed),
      setChainlinkRoundForNow(mtaFeed),
      waitFor(strat.setMaxPriceOffset(86400)),
      waitFor(strat.setPoolSlippageRatio(2000)), // 20%
      waitFor(strat.setSwapSlippageRatio(2000)), // 20%
      waitFor(strat.setPriceFeed(USDC.address, usdcFeed.address)),
      waitFor(strat.setPriceFeed(REWARD_TOKEN.address, mtaFeed.address)),
      waitFor(strat.setPriceFeed(WMATIC_TOKEN.address, maticFeed.address)),
      waitFor(strat.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, DAI_ADDRESS, USDC.address])),
      waitFor(strat.setRewardToWantRoute(WMATIC_TOKEN.address, [WMATIC_TOKEN.address, USDC.address]))
    ])
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.BigNumber.from('' + 100000e6) // 100000 USDC
    await setCustomBalanceFor(USDC.address, bob.address, newBalance)

    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool() // more decimals

    // to ask for rewards (max 100 blocks)
    for (let i = 0; i < 20; i++) {
      await mineNTimes(5)
      await waitFor(strat.harvest())

      if (balance < (await strat.balanceOfPool())) {
        break
      }
    }

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
    expect(await WMATIC_TOKEN.balanceOf(strat.address)).to.be.equal(0)

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
    expect(await WMATIC_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(USDC.connect(bob).approve(archimedes.address, '' + 100000e6))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC_TOKEN.balanceOf(strat.address)).to.be.equal(0)

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
      waitFor(otherStrat.setPriceFeed(WMATIC_TOKEN.address, maticFeed.address)),
      waitFor(otherStrat.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, DAI_ADDRESS, USDC.address])),
      waitFor(otherStrat.setRewardToWantRoute(WMATIC_TOKEN.address, [WMATIC_TOKEN.address, USDC.address]))
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
    expect(await WMATIC_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100000e6)
    expect(await USDC.balanceOf(controller.address)).to.be.equal(0)
    expect(await USDC.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
    expect(await WMATIC_TOKEN.balanceOf(strat.address)).to.be.equal(0)
  })
})

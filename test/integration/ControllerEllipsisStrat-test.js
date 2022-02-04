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

const itIf = async (cond, title, test) => {
  if (cond) {
    return it(title, test)
  }
}

describe('Controller Ellipsis Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let busdFeed
  let epsFeed
  let BUSD
  let REWARD_TOKEN

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

    // PancakeSwap
    const uniswapAbi = require('./abis/uniswap-router.json')
    global.exchange = await ethers.getContractAt(uniswapAbi, '0x10ed43c718714eb63d5aa57b78b54704e256024e')

    BUSD = await ethers.getContractAt('IERC20Metadata', '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56')
    REWARD_TOKEN = await ethers.getContractAt('IERC20Metadata', '0xA7f552078dcC247C2684336020c03648500C6d9F')

    controller = await createController(BUSD, archimedes, 'ControllerEllipsisStrat')

    await waitFor(archimedes.addNewPool(BUSD.address, controller.address, 10, false));

    [strat, busdFeed, epsFeed] = await Promise.all([
      ethers.getContractAt('ControllerEllipsisStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xcBb98864Ef56E9042e7d2efef76141f15731B82f'),
      ethers.getContractAt('IChainLink', '0x27Cc356A5891A3Fe6f84D0457dE4d108C6078888'), // XLM has similar price
    ])

    await Promise.all([
      setChainlinkRoundForNow(busdFeed),
      setChainlinkRoundForNow(epsFeed),
      waitFor(strat.setMaxPriceOffset(86400)),
      waitFor(strat.setPoolSlippageRatio(2000)), // 20%
      waitFor(strat.setSwapSlippageRatio(2000)), // 20%
      waitFor(strat.setPriceFeed(BUSD.address, busdFeed.address)),
      waitFor(strat.setPriceFeed(REWARD_TOKEN.address, epsFeed.address)),
      waitFor(strat.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82', BUSD.address])) // cake
    ])
  })

  itIf(hre.network.config.network_id == 56, 'Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('100')
    await setCustomBalanceFor(BUSD.address, bob.address, newBalance, 1)

    expect(await BUSD.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(BUSD.connect(bob).approve(archimedes.address, '' + 100e18))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await BUSD.balanceOf(controller.address)).to.be.equal(0)
    expect(await BUSD.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool() // more decimals

    // to ask for rewards (max 100 blocks
    for (let i = 0; i < 20; i++) {
      await mineNTimes(5)
      await waitFor(strat.harvest())

      if (balance < (await strat.balanceOfPool())) {
        break
      }
      console.log('Mined 6 blocks...')
    }
    console.log(`Claim en el bloque: ${await getBlock()} `)
    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 BUSD in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await BUSD.balanceOf(bob.address)).to.within(
      94.9e18 + '', 95e18 + '' // 95 - 0.1% withdrawFee
    )
    expect(await BUSD.balanceOf(strat.address)).to.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await BUSD.balanceOf(bob.address)).to.within(
      99.8e18 + '', // between 0.1% and 0.2%
      99.9e18 + ''
    )
  })

  itIf(hre.network.config.network_id == 56, 'Controller.setStrategy works', async () => {
    const newBalance = ethers.utils.parseUnits('100')
    await setCustomBalanceFor(BUSD.address, bob.address, newBalance, 1)

    expect(await BUSD.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(BUSD.connect(bob).approve(archimedes.address, '' + 100e18))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await BUSD.balanceOf(controller.address)).to.be.equal(0)
    expect(await BUSD.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerEllipsisStrat',
      BUSD.address,
      controller.address,
      global.exchange.address,
      owner.address
    )

    await Promise.all([
      waitFor(otherStrat.setMaxPriceOffset(86400)),
      waitFor(otherStrat.setPoolSlippageRatio(2000)), // 20%
      waitFor(otherStrat.setSwapSlippageRatio(2000)), // 20%
      waitFor(otherStrat.setPriceFeed(BUSD.address, busdFeed.address)),
      waitFor(otherStrat.setPriceFeed(REWARD_TOKEN.address, epsFeed.address)),
      waitFor(otherStrat.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82', BUSD.address])) // cake
    ])

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await BUSD.balanceOf(controller.address)).to.be.equal(0)
    expect(await BUSD.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await BUSD.balanceOf(controller.address)).to.be.equal(0)
    expect(await BUSD.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
  })
})

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

describe('Controller EllipsisLP Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let bnbFeed
  let epsFeed
  let WBNB
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

    WBNB = await ethers.getContractAt('IERC20Metadata', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c')
    REWARD_TOKEN = await ethers.getContractAt('IERC20Metadata', '0xA7f552078dcC247C2684336020c03648500C6d9F')

    console.log('Antes')
    controller = await createController(WBNB, archimedes, 'ControllerEllipsisLPStrat')
    console.log('Después')

    await waitFor(archimedes.addNewPool(WBNB.address, controller.address, 10, false));

    [strat, bnbFeed, epsFeed] = await Promise.all([
      ethers.getContractAt('ControllerEllipsisLPStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE'),
      ethers.getContractAt('IChainLink', '0x27Cc356A5891A3Fe6f84D0457dE4d108C6078888'), // XLM has similar price
    ])

    await Promise.all([
      setChainlinkRoundForNow(bnbFeed),
      setChainlinkRoundForNow(epsFeed),
      waitFor(strat.setMaxPriceOffset(86400)),
      waitFor(strat.setPoolSlippageRatio(2000)), // 20%
      waitFor(strat.setSwapSlippageRatio(2000)), // 20%
      waitFor(strat.setPriceFeed(WBNB.address, bnbFeed.address)),
      waitFor(strat.setPriceFeed(REWARD_TOKEN.address, epsFeed.address)),
      waitFor(strat.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, WBNB.address])) // cake
    ])
  })

  itIf(hre.network.config.network_id == 56, 'Full deposit + harvest strat + withdraw', async () => {
    const newBalance = ethers.utils.parseUnits('100')

    await setCustomBalanceFor(WBNB.address, bob.address, newBalance, 3)

    await WBNB.withdraw(newBalance)

    expect(await ethers.provider.getBalance(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const reminder = ethers.utils.parseUnits('1')
    const toDeposit = newBalance.sub(reminder)

    await waitFor(archimedes.connect(bob).depositNative(0, zeroAddress, { value: newBalance }))

    expect(await ethers.provider.getBalance(controller.address)).to.be.equal(reminder)
    expect(await ethers.provider.getBalance(strat.address)).to.be.equal(0)
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

    // withdraw 95 WBNB in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e18 + '').div(
        await controller.balance()
      )
    )

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await ethers.provider.getBalance(bob.address)).to.within(
      94.9e18 + '', 95e18 + '' // 95 - 0.1% withdrawFee
    )
    expect(await ethers.provider.getBalance(strat.address)).to.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await ethers.provider.getBalance(bob.address)).to.within(
      99.8e18 + '', // between 0.1% and 0.2%
      99.9e18 + ''
    )
  })

  itIf(hre.network.config.network_id == 56, 'Controller.setStrategy works', async () => {
    const newBalance = ethers.utils.parseUnits('100')
    await setCustomBalanceFor(WBNB.address, bob.address, newBalance, 3)

    expect(await ethers.provider.getBalance(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const reminder = ethers.utils.parseUnits('1')
    const toDeposit = newBalance.sub(reminder)

    await waitFor(WBNB.connect(bob).approve(archimedes.address, toDeposit))
    await waitFor(archimedes.connect(bob).deposit(0, toDeposit, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(toDeposit)
    expect(await ethers.provider.getBalance(controller.address)).to.be.equal(0)
    expect(await ethers.provider.getBalance(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    const otherStrat = await deploy(
      'ControllerEllipsisLPStrat',
      WBNB.address,
      11, // BNB/BNB-L pool ID
      0, // BNB token index
      '0x5781041F9Cf18484533F433Cb2Ea9ad42e117B3a', // BNB pool token
      '0xc377e2648E5adD3F1CB51a8B77dBEb63Bd52c874', // BNB/BNB-L pool
      controller.address,
      global.exchange.address,
      owner.address
    )

    await Promise.all([
      waitFor(otherStrat.setMaxPriceOffset(86400)),
      waitFor(otherStrat.setPoolSlippageRatio(2000)), // 20%
      waitFor(otherStrat.setSwapSlippageRatio(2000)), // 20%
      waitFor(otherStrat.setPriceFeed(WBNB.address, bnbFeed.address)),
      waitFor(otherStrat.setPriceFeed(REWARD_TOKEN.address, epsFeed.address)),
      waitFor(otherStrat.setRewardToWantRoute(REWARD_TOKEN.address, [REWARD_TOKEN.address, WBNB.address])) // cake
    ])

    await expect(controller.setStrategy(otherStrat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(strat.address, otherStrat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await WBNB.balanceOf(controller.address)).to.be.equal(0)
    expect(await WBNB.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(strat.unpause())

    await expect(controller.setStrategy(strat.address)).to.emit(
      controller, 'NewStrategy'
    ).withArgs(otherStrat.address, strat.address)

    expect(await controller.balanceOf(bob.address)).to.be.equal('' + 100e18)
    expect(await WBNB.balanceOf(controller.address)).to.be.equal(0)
    expect(await WBNB.balanceOf(strat.address)).to.be.equal(0)
    expect(await REWARD_TOKEN.balanceOf(strat.address)).to.be.equal(0)
  })
})

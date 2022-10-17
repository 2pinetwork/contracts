const {
  createController,
  createPiToken,
  deploy,
  getBlock,
  impersonateContract,
  mineNTimes,
  waitFor,
  zeroAddress
} = require('../helpers')

const { resetHardhat, setCustomBalanceFor, setChainlinkRoundForNow } = require('./helpers')

describe('Controller Aave Strat BTC', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let opFeed
  let btcFeed

  const setBTCBalance = async (dest, amount) => {
    await setCustomBalanceFor(BTC.address, dest, ethers.utils.parseUnits(amount.toString(), 8))
  }

  before(function() {
    if (hre.network.config.network_id != 10)
      this.skip()
  })

  beforeEach(async () => {
    global.OP       = await ethers.getContractAt('IERC20Metadata', '0x4200000000000000000000000000000000000042');
    global.WETH     = await ethers.getContractAt('IERC20Metadata', '0x4200000000000000000000000000000000000006')
    global.BTC      = await ethers.getContractAt('IERC20Metadata', '0x68f180fcce6836688e9084f035309e29bf0a2095');
    global.exchange = await ethers.getContractAt('IUniswapRouter', '0xe592427a0aece92de3edee1f18e0157c05861564');

    [, bob]      = await ethers.getSigners()
    piToken      = await createPiToken()
    rewardsBlock = (await getBlock()) + 20
    archimedes   = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      OP.address
    )

    controller = await createController(BTC, archimedes, 'ControllerAaveStrat')

    await waitFor(archimedes.addNewPool(BTC.address, controller.address, 10, false));

    [strat, opFeed, btcFeed] = await Promise.all([
      ethers.getContractAt('ControllerAaveStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0x0D276FC14719f9292D5C1eA2198673d1f4269246'),
      ethers.getContractAt('IChainLink', '0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593'),
    ])

    await Promise.all([
      setChainlinkRoundForNow(btcFeed),
      setChainlinkRoundForNow(opFeed),
      waitFor(strat.setMaxPriceOffset(86400)),
      waitFor(strat.setPriceFeed(OP.address, opFeed.address)),
      waitFor(strat.setPriceFeed(BTC.address, btcFeed.address)),
      waitFor(strat.setSwapSlippageRatio(500)),
      waitFor(strat.setRewardToWantRoute(OP.address, [OP.address, WETH.address, BTC.address])),
      waitFor(strat.setTokenToTokenSwapFee(OP.address, WETH.address, 3000)),
      waitFor(strat.setTokenToTokenSwapFee(WETH.address, BTC.address, 3000)),
    ])
  })

  it('Full deposit + harvest strat + withdraw', async () => {
    await setBTCBalance(bob.address, 100)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(BTC.connect(bob).approve(archimedes.address, '' + 100e8))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balanceOfPool()

    // Deposited
    expect(balance).to.be.within(99e8, 100.1e8)

    await mineNTimes(20)

    expect(await strat.harvest()).to.emit(strat, 'Harvested').to.emit(strat, 'PerformanceFee')

    expect(await strat.balanceOfPool()).to.be.above(balance)

    // withdraw 95 BTC in shares
    const toWithdraw = (
      (await controller.totalSupply()).mul(95e8).div(
        await controller.balance()
      )
    )

    // To be sure that withdraw doesn't happend in the same block
    await mineNTimes(1)

    await waitFor(archimedes.connect(bob).withdraw(0, toWithdraw))

    expect(await BTC.balanceOf(bob.address)).to.within(
      94.9e8, 95e8 // 95 - 0.1% withdrawFee
    )
    expect(await BTC.balanceOf(strat.address)).to.equal(0)

    await waitFor(archimedes.connect(bob).withdrawAll(0))
    expect(await BTC.balanceOf(bob.address)).to.within(
      99.8e8 + '', // between 0.1% and 0.2%
      99.99e8 + ''
    )
  })

  it('Deposit and change strategy', async () => {
    await setBTCBalance(bob.address, 100)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)

    await waitFor(BTC.connect(bob).approve(archimedes.address, '' + 100e8))
    await waitFor(archimedes.connect(bob).depositAll(0, zeroAddress))

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e8)
    expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)

    const balance = await strat.balance()

    const otherStrat = await deploy(
      'ControllerDummyStrat',
      BTC.address,
      controller.address,
      global.exchange.address,
      owner.address,
    )

    expect(await controller.setStrategy(otherStrat.address)).to.emit(controller, 'NewStrategy').withArgs(
      strat.address, otherStrat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e8)
    expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
    expect(await strat.balance()).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.within(
      balance.mul(99).div(100), balance.mul(101).div(100)
    )

    await waitFor(strat.unpause())
    expect(await controller.setStrategy(strat.address)).to.emit(controller, 'NewStrategy').withArgs(
      otherStrat.address, strat.address
    )

    expect(await controller.balanceOf(bob.address)).to.be.equal(100e8)
    expect(await BTC.balanceOf(controller.address)).to.be.equal(0)
    expect(await BTC.balanceOf(strat.address)).to.be.equal(0)
    expect(await otherStrat.balance()).to.be.equal(0)
    expect(await strat.balance()).to.be.within(
      balance.mul(99).div(100), balance.mul(101).div(100)
    )
  })

  describe('PerformanceFee', async () => {
    it('should be collected', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)
      strat = strat.connect(ctrollerSigner)

      await setBTCBalance(strat.address, 100)

      let treasury = await BTC.balanceOf(owner.address)

      await waitFor(strat.deposit())
      expect(await BTC.balanceOf(owner.address)).to.equal(treasury)
      let stratBalance = await strat.balance()

      // This will happend in one step/tx in a real case
      await setBTCBalance(strat.address, 0.00001)
      let fee = (await strat.balance()).sub(stratBalance).mul(500).div(10000)
      treasury = await BTC.balanceOf(owner.address)
      // This is because of the aave provider lend/borrow will change balance block by block

      await expect(strat.beforeMovement()).to.emit(strat, 'PerformanceFee')
      expect(await BTC.balanceOf(owner.address)).to.within(
        treasury.add(1), treasury.add(fee)
      )

      treasury = (await BTC.balanceOf(owner.address))
      await waitFor(strat.deposit())
      expect(await BTC.balanceOf(owner.address)).to.equal(treasury)

      await expect(strat.beforeMovement()).to.not.emit(strat, 'PerformanceFee')
      // await waitFor(strat.deposit()) // this call fails because of the want balance 0

      expect(await BTC.balanceOf(owner.address)).to.equal(treasury)

      await mineNTimes(20) // to get more rewards
      await expect(strat.harvest())
        .to.emit(strat, 'Harvested')
        .to.emit(strat, 'PerformanceFee')
      expect(await BTC.balanceOf(owner.address)).to.above(treasury)
    })
  })
})

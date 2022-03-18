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

const { resetHardhat, setWbtcBalanceFor, setChainlinkRoundForNow } = require('./helpers')

describe('Controller Aave Strat', () => {
  let bob
  let piToken
  let archimedes
  let controller
  let strat
  let rewardsBlock
  let wNativeFeed
  let btcFeed

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

    controller = await createController(BTC, archimedes, 'ControllerAaveStrat')

    await waitFor(archimedes.addNewPool(BTC.address, controller.address, 10, false));

    [strat, wNativeFeed, btcFeed] = await Promise.all([
      ethers.getContractAt('ControllerAaveStrat', (await controller.strategy())),
      ethers.getContractAt('IChainLink', '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0'),
      ethers.getContractAt('IChainLink', '0xc907E116054Ad103354f2D350FD2514433D57F6f'),
    ])

    await Promise.all([
      setChainlinkRoundForNow(wNativeFeed),
      setChainlinkRoundForNow(btcFeed),
      waitFor(strat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(BTC.address, btcFeed.address)),
    ])
  })

  describe('PerformanceFee', async () => {
    it('should be collected', async () => {
      const ctrollerSigner = await impersonateContract(controller.address)
      strat = strat.connect(ctrollerSigner)

      await setWbtcBalanceFor(strat.address, '100')

      let treasury = await BTC.balanceOf(owner.address)

      // No earnings
      await waitFor(strat.deposit())
      expect(await BTC.balanceOf(owner.address)).to.equal(treasury)
      let stratBalance = await strat.balance()

      // This will happend in one step/tx in a real case
      await setWbtcBalanceFor(strat.address, '0.00001') // just to round to 35
      let fee = (await strat.balance()).sub(stratBalance).mul(450).div(10000)
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

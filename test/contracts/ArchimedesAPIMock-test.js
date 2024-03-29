const {
  toNumber, createPiToken, getBlock, waitFor, deploy, zeroAddress,
  impersonateContract, createController
} = require('../helpers')

describe('ArchimedesAPIMock', () => {
  let piToken
  let archimedes
  let rewardsBlock
  let bob
  let controller
  let piTokenFeed
  let wNativeFeed
  let strat

  beforeEach(async function () {
    this.skip();

    [, bob] = await ethers.getSigners()
    piToken = await createPiToken({ tokenContract: 'PiTokenMock' })
    rewardsBlock = (await getBlock()) + 30

    archimedes = await deploy(
      'ArchimedesAPIMock',
      piToken.address,
      rewardsBlock,
      owner.address
    )

    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(archimedes.address))
    await waitFor(piToken.setApiMintPerBlock(0.09691e18 + ''));

    controller = await createController(WMATIC, archimedes);

    [strat, wNativeFeed, piTokenFeed] = await Promise.all([
      ethers.getContractAt('ControllerAaveStrat', (await controller.strategy())),
      deploy('PriceFeedMock'),
      deploy('PriceFeedMock'),
    ])

    await archimedes.addNewPool(WMATIC.address, controller.address, 1, true)
    expect(await archimedes.poolLength()).to.be.equal(1)

    await Promise.all([
      waitFor(archimedes.setExchange(exchange.address)),
      waitFor(archimedes.setRoute(0, [piToken.address, WMATIC.address])),
      waitFor(wNativeFeed.setPrice(129755407)),
      waitFor(piTokenFeed.setPrice(0.08e8)),
      waitFor(archimedes.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(archimedes.setPriceFeed(piToken.address, piTokenFeed.address)),
      waitFor(strat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(piToken.address, piTokenFeed.address)),
    ])

    await waitFor(WMATIC.deposit({ value: toNumber(1e18) }))
    await waitFor(WMATIC.transfer(exchange.address, toNumber(1e18)))
  })

  describe('updatePool', async () => {
    it('should not claim rewards until startBlock', async () => {
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
    })
    it('should not claim rewards without controller shares', async () => {
      await waitFor(piToken.setBlockNumber(toNumber(rewardsBlock + 3)))
      await waitFor(archimedes.setBlockNumber(toNumber(rewardsBlock + 3)))
      await waitFor(archimedes.updatePool(0)) // this will not redeem
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
    })

    it('should cover not more piTokens to mint', async () => {
      const wmatic = WMATIC.connect(owner)

      await waitFor(wmatic.deposit({ value: 100 }))
      await waitFor(wmatic.approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, owner.address, 100, zeroAddress))
      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.setBlockNumber(toNumber(2e10)))
      await waitFor(archimedes.setBlockNumber(toNumber(2e10)))

      const left = (await piToken.MAX_SUPPLY()).sub(
        await piToken.totalSupply()
      )

      await waitFor(piToken.apiMint(owner.address, left))

      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      // No left tokens to mint...
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
    })
  })

  describe('redeemStuckedPiTokens', async () => {
    it('should redeem stucked piTokens', async () => {
      const wmatic = WMATIC.connect(owner)

      await waitFor(wmatic.deposit({ value: toNumber(1e18) }))
      await waitFor(wmatic.approve(archimedes.address, toNumber(1e18)))

      await waitFor(archimedes.deposit(0, owner.address, 100, zeroAddress))
      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.setBlockNumber(toNumber(2e10)))
      await waitFor(archimedes.setBlockNumber(toNumber(2e10)))

      await waitFor(archimedes.updatePool(0))

      // expect(await piToken.apiLeftToMint()).to.be.equal(0)
      expect(await piToken.totalSupply()).to.be.equal(await piToken.MAX_SUPPLY())

      const balance = await piToken.balanceOf(archimedes.address)
      const ownerBalance = await piToken.balanceOf(owner.address)

      expect(balance).to.be.above(0)

      let future = rewardsBlock + 32850000

      await waitFor(piToken.setBlockNumber(future))
      await waitFor(archimedes.setBlockNumber(future))

      await expect(archimedes.redeemStuckedPiTokens()).to.be.revertedWith(
        'Still waiting'
      )

      await waitFor(piToken.setBlockNumber(future + 1))
      await waitFor(archimedes.setBlockNumber(future + 1))
      await waitFor(archimedes.redeemStuckedPiTokens())

      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      expect(await piToken.balanceOf(owner.address)).to.be.equal(
        ownerBalance.add(balance)
      )

      // Call again without change
      await waitFor(archimedes.redeemStuckedPiTokens())
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      expect(await piToken.balanceOf(owner.address)).to.be.equal(
        ownerBalance.add(balance)
      )
    })

    it('should revert with community left to mint', async () => {
      await expect(archimedes.redeemStuckedPiTokens()).to.be.revertedWith(
        'still minting'
      )
    })

    it('should revert with PiToken still minting', async () => {
      const wmatic = WMATIC.connect(owner)

      await waitFor(wmatic.deposit({ value: toNumber(1e18) }))
      await waitFor(wmatic.approve(archimedes.address, toNumber(1e18)))

      await waitFor(archimedes.deposit(0, owner.address, 100, zeroAddress))
      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.setBlockNumber(500))
      await waitFor(archimedes.setBlockNumber(500))

      await waitFor(archimedes.updatePool(0))

      expect(await piToken.totalSupply()).to.be.not.equal(await piToken.MAX_SUPPLY())

      await expect(archimedes.redeemStuckedPiTokens()).to.be.revertedWith('PiToken still minting')
    })
  })

  describe('harvest', async () => {
    it('should do nothing without deposits', async () => {
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      expect(await piToken.balanceOf(bob.address)).to.be.equal(0)
      // Advance a few blocks
      await waitFor(piToken.setBlockNumber(toNumber(rewardsBlock + 30)))
      await waitFor(archimedes.setBlockNumber(toNumber(rewardsBlock + 30)))

      await waitFor(archimedes.harvest(0, bob.address))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      expect(await piToken.balanceOf(bob.address)).to.be.equal(0)
    })

    it('should receive less tokens with harvest', async () => {
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      const wmatic = WMATIC.connect(owner)

      await waitFor(wmatic.deposit({ value: toNumber(1e18) }))
      await waitFor(wmatic.approve(archimedes.address, toNumber(1e18)))

      await waitFor(archimedes.deposit(0, owner.address, toNumber(1e18), zeroAddress))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      // Advance a few blocks
      await waitFor(piToken.setBlockNumber(toNumber(rewardsBlock + 30)))
      await waitFor(archimedes.setBlockNumber(toNumber(rewardsBlock + 30)))

      await waitFor(archimedes.updatePool(0))

      // Impersonate Archimedes Load with 1e18
      const archSigner = await impersonateContract(archimedes.address)

      // transfer 1 piToken to other address (just to simulate less than expected)
      await waitFor(piToken.connect(archSigner).transferFrom(archimedes.address, bob.address, 1))

      const balance = await piToken.balanceOf(owner.address)

      await waitFor(archimedes.harvest(0, owner.address))

      expect(await piToken.balanceOf(owner.address)).to.be.equal(
        balance.toString() // .plus(1).minus(1).toFixed()
      )
    })
  })

  describe('ApiToMint', async () => {
    it('should return 0 when api rewards are done', async () => {
      // Deposit will not claim rewards yet
      const wmatic = WMATIC.connect(owner)

      await waitFor(wmatic.deposit({ value: toNumber(1e18) }))
      await waitFor(wmatic.approve(archimedes.address, toNumber(1e18)))

      await waitFor(archimedes.deposit(0, owner.address, toNumber(1e18), zeroAddress))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      // Claim rewards for the same block will not do anything
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(rewardsBlock + 30)))
      await waitFor(archimedes.setBlockNumber(toNumber(rewardsBlock + 30)))

      await waitFor(archimedes.harvestAll(owner.address))
      // just to check that it does nothing
      await waitFor(archimedes.harvestAll(owner.address))

      // deposited
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      // Claim rewards for the same block will not do anything
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(1e10))) // stupid amount of blocks =)
      await waitFor(archimedes.setBlockNumber(toNumber(1e10))) // stupid amount of blocks =)
      await waitFor(archimedes.updatePool(0)) // this will redeem everything

      // expect(await archimedes.apiLeftToMint()).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.updatePool(0)) // this will redeem everything
      // expect(await archimedes.apiLeftToMint()).to.be.equal(0)
    })
  })
})

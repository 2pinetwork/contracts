const {
  toNumber, createPiToken, getBlock, waitFor, deploy, zeroAddress,
  impersonateContract, createController
} = require('./helpers')

describe('ArchimedesAPIMock', () => {
  let piToken
  let archimedes
  let rewardsBlock
  let bob
  let controller

  beforeEach(async () => {
    [, bob] = await ethers.getSigners()
    piToken = await createPiToken(true)
    rewardsBlock = (await getBlock()) + 20

    archimedes = await deploy(
      'ArchimedesAPIMock',
      piToken.address,
      rewardsBlock,
      owner.address
    )

    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(archimedes.address))

    controller = await createController(WMATIC, archimedes)

    await (await archimedes.addNewPool(WMATIC.address, controller.address, 1, false)).wait()
    expect(await archimedes.poolLength()).to.be.equal(1)
    await waitFor(archimedes.setExchange(exchange.address))
    await waitFor(archimedes.setRoute(0, [piToken.address, WMATIC.address]))


    await waitFor(WMATIC.deposit({ value: toNumber(1e18) }))
    await waitFor(WMATIC.transfer(exchange.address, toNumber(1e18)))
  })

  describe('updatePool', async () => {
    it('should not claim rewards until startBlock', async () => {
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
    })
    it('should not claim rewards without controller shares', async () => {
      await waitFor(archimedes.setBlockNumber(toNumber(rewardsBlock + 3)))
      await waitFor(archimedes.updatePool(0)) // this will not redeem
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
    })

    it('should cover not more not more piTokens to mint', async () => {
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

      await waitFor(piToken.mint(owner.address, left, 0x0))

      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      // No left tokens to mint...
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
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

      expect(await archimedes.apiLeftToMint()).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.updatePool(0)) // this will redeem everything
      expect(await archimedes.apiLeftToMint()).to.be.equal(0)
    })
  })
})

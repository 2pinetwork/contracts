const {
  toNumber, createPiToken, getBlock, waitFor, deploy, zeroAddress,
  impersonateContract, createController
} = require('./helpers')
const { MINT_DATA } = require('./contract_constants')

describe('ArchimedesMock', () => {
  let piToken
  let archimedes
  let rewardsBlock
  let bob

  beforeEach(async () => {
    [, bob] = await ethers.getSigners()
    piToken = await createPiToken(true)
    rewardsBlock = (await getBlock()) + 20

    archimedes = await deploy(
      'ArchimedesMock',
      piToken.address,
      rewardsBlock
    )

    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(archimedes.address))
    await waitFor(piToken.setCommunityMintPerBlock(0.19383e18 + ''))
    await waitFor(piToken.setApiMintPerBlock(0.09691e18 + ''))

    const controller = await createController(piToken, archimedes)

    await (await archimedes.addNewPool(piToken.address, controller.address, 1, false)).wait()
    expect(await archimedes.poolLength()).to.be.equal(1)
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

    it('should cover not more piTokens to mint', async () => {
      await waitFor(piToken.approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, 100, zeroAddress))
      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.setBlockNumber(toNumber(2e10)))
      await waitFor(archimedes.setBlockNumber(toNumber(2e10)))

      const left = (await piToken.MAX_SUPPLY()).sub(
        await piToken.totalSupply()
      )

      await waitFor(piToken.communityMint(owner.address, left))

      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      // No left tokens to mint...
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
    })
  })

  describe('redeemStuckedPiTokens', async () => {
    it.skip('should redeem stucked piTokens', async () => {
      await waitFor(piToken.approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, 100, zeroAddress))
      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.setBlockNumber(toNumber(2e10)))
      await waitFor(archimedes.setBlockNumber(toNumber(2e10)))

      await waitFor(archimedes.updatePool(0))

      const left = (await piToken.MAX_SUPPLY()).sub(await piToken.totalSupply())

      await waitFor(piToken.communityMint(owner.address, left))

      expect(await archimedes.communityLeftToMint()).to.be.equal(0)
      expect(await piToken.totalSupply()).to.be.equal(await piToken.MAX_SUPPLY())

      const balance = await piToken.balanceOf(archimedes.address)
      const ownerBalance = await piToken.balanceOf(owner.address)

      expect(balance).to.be.above(0)

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

    it.skip('should revert with PiToken still minting', async () => {
      await waitFor(piToken.approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, 100, zeroAddress))
      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.setBlockNumber(toNumber(2e10)))
      await waitFor(archimedes.setBlockNumber(toNumber(2e10)))

      await waitFor(archimedes.updatePool(0))

      expect(await archimedes.communityLeftToMint()).to.be.equal(0)
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

      await waitFor(archimedes.connect(bob).harvest(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      expect(await piToken.balanceOf(bob.address)).to.be.equal(0)
    })

    it('should receive less tokens with harvest', async () => {
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      await waitFor(piToken.approve(archimedes.address, toNumber(1e18)))
      await waitFor(archimedes.deposit(0, toNumber(1e18), zeroAddress))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      // Advance a few blocks
      await waitFor(piToken.setBlockNumber(toNumber(rewardsBlock + 30)))
      await waitFor(archimedes.setBlockNumber(toNumber(rewardsBlock + 30)))

      await waitFor(archimedes.updatePool(0))

      const expected = parseInt(await archimedes.pendingPiToken(0), 10)

      // Impersonate Archimedes Load with 1e18
      const archSigner = await impersonateContract(archimedes.address)

      // transfer 1 piToken to other address (just to simulate less than expected)
      await waitFor(piToken.connect(archSigner).transferFrom(archimedes.address, bob.address, 1))

      const balance = new BigNumber(parseInt(await piToken.balanceOf(owner.address), 10))

      await waitFor(archimedes.harvest(0))

      expect(await piToken.balanceOf(owner.address)).to.be.equal(
        balance.plus(expected).minus(1).toFixed()
      )
    })
  })

  describe('pendingPiToken', async () => {
    it.skip('should return 0 when community rewards are done', async () => {
      // Deposit will not claim rewards yet
      await waitFor(piToken.approve(archimedes.address, toNumber(1e18)))
      await waitFor(archimedes.deposit(0, toNumber(1e18), zeroAddress))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      // Claim rewards for the same block will not do anything
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(rewardsBlock + 30)))
      await waitFor(archimedes.setBlockNumber(toNumber(rewardsBlock + 30)))

      // 1% is reserved for referals
      const reward = (30 * (MINT_DATA[0].community * 0.99))

      expect(
        await archimedes.pendingPiToken(0)
      ).to.be.equal(
        toNumber(reward)
      )
      await waitFor(archimedes.harvestAll())
      // just to check that it does nothing
      await waitFor(archimedes.harvestAll())

      // deposited
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      // Claim rewards for the same block will not do anything
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(1e10))) // stupid amount of blocks =)
      await waitFor(archimedes.setBlockNumber(toNumber(1e10))) // stupid amount of blocks =)
      await waitFor(archimedes.updatePool(0)) // this will redeem everything

      expect(await archimedes.pendingPiToken(0)).to.be.above(0)
      expect(await archimedes.communityLeftToMint()).to.be.equal(0)

      await waitFor(archimedes.harvestAll())
      expect(await archimedes.pendingPiToken(0)).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.updatePool(0)) // this will redeem everything
      expect(await archimedes.pendingPiToken(0)).to.be.equal(0)
      expect(await archimedes.communityLeftToMint()).to.be.equal(0)
    })
  })
})

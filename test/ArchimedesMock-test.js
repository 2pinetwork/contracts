const {
  toNumber, createPiToken, getBlock, waitFor, deploy, zeroAddress,
  impersonateContract
} = require('./helpers')
const { MINT_DATA } = require('./contract_constants')

describe('ArchimedesMock', () => {
  // const owner = global.owner
  let piToken
  let archimedes
  let rewardsBlock
  // let refMgr
  let bob

  beforeEach(async () => {
    [, bob] = await ethers.getSigners()
    piToken = await createPiToken(true)
    rewardsBlock = (await getBlock()) + 20

    archimedes = await deploy(
      'ArchimedesMock',
      piToken.address,
      rewardsBlock,
      owner.address
    )

    // refMgr = await deploy('Referral', archimedes.address)

    // await waitFor(archimedes.setReferralAddress(refMgr.address))
    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(archimedes.address))

    const controller = await deploy(
      'Controller',
      piToken.address,
      archimedes.address,
      owner.address
    )

    const strategy = await deploy(
      'ControllerAaveStrat',
      piToken.address,
      0,
      0,
      0,
      0,
      controller.address,
      global.exchange.address,
      owner.address
    )

    await waitFor(controller.setStrategy(strategy.address))

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

    it('should cover not more not more piTokens to mint', async () => {
      await waitFor(piToken.approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, 100, zeroAddress))
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
    it('should return 0 when community rewards are done', async () => {
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

      expect(await archimedes.pendingPiToken(0)).to.be.equal(0)
      expect(await archimedes.communityLeftToMint()).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.updatePool(0)) // this will redeem everything
      expect(await archimedes.pendingPiToken(0)).to.be.equal(0)
      expect(await archimedes.communityLeftToMint()).to.be.equal(0)
    })
  })
})

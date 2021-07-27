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
  let refMgr
  let bob

  beforeEach(async () => {
    [_, bob] = await ethers.getSigners()
    piToken = await createPiToken(true)
    rewardsBlock = (await getBlock()) + 20

    archimedes = await deploy(
      'ArchimedesMock',
      piToken.address,
      rewardsBlock,
      owner.address
    )

    refMgr = await deploy('Referral', archimedes.address)

    await waitFor(archimedes.setReferralAddress(refMgr.address))
    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(archimedes.address))

    const strategy = await deploy('StratMock', archimedes.address, piToken.address)
    await strategy.deployed()
    await (await archimedes.addNewPool(piToken.address, strategy.address, 1)).wait()
    expect(await archimedes.poolLength()).to.be.equal(1)
  })

  describe('updatePool', async () => {
    it('should not claim rewards until startBlock', async () => {
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
    })
    it('should not claim rewards without strategy shares', async () => {
      await waitFor(archimedes.setBlockNumber(toNumber(rewardsBlock + 3)))
      await waitFor(archimedes.updatePool(0)) // this will not redeem
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

      const expected = parseInt(await archimedes.pendingPiToken(0, owner.address), 10)

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

      // 1% is reserved for references
      const reward = (30 * (MINT_DATA[0].community * 0.99))

      expect(
        await archimedes.pendingPiToken(0, owner.address)
      ).to.be.equal(
        toNumber(reward)
      )
      await waitFor(archimedes.harvestAll())

      // deposited
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)
      // Claim rewards for the same block will not do anything
      await waitFor(archimedes.updatePool(0))
      expect(await piToken.balanceOf(archimedes.address)).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(1e10))) // stupid amount of blocks =)
      await waitFor(archimedes.setBlockNumber(toNumber(1e10))) // stupid amount of blocks =)
      await waitFor(archimedes.updatePool(0)) // this will redeem everything

      expect(await piToken.totalSupply()).to.be.equal(
        MINT_DATA[5].expected.toFixed() // expected community tokens at the end of the time
      )
      expect(await archimedes.pendingPiToken(0, owner.address)).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.setBlockNumber(toNumber(2e10))) // stupid amount of blocks =)
      await waitFor(archimedes.updatePool(0)) // this will redeem everything
      expect(await archimedes.pendingPiToken(0, owner.address)).to.be.equal(0)
    })
  })
})

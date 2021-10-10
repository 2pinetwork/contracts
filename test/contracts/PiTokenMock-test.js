const { createPiToken, waitFor } = require('../helpers')

describe('PiTokenMock', () => {
  let piToken
  let owner
  let bob
  let INITIAL_SUPPLY
  let MAX_SUPPLY
  let superTokenFactory

  // Global setup
  before(async () => {
    [owner, bob] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = await createPiToken(owner, superTokenFactory, true)

    INITIAL_SUPPLY = await piToken.INITIAL_SUPPLY()
    MAX_SUPPLY = await piToken.MAX_SUPPLY()

    await waitFor(piToken.setCommunityMintPerBlock(0.5e18 + ''))
    await waitFor(piToken.setApiMintPerBlock(0.5e18 + ''))

    expect(await piToken.totalSupply()).to.equal(INITIAL_SUPPLY)
    expect(await piToken.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY)

    await piToken.addMinter(bob.address)
  })

  describe('Minting', async () => {
    it('Should only mint until MAX SUPPLY', async () => {
      await piToken.initRewardsOn(1);
      await piToken.setBlockNumber(1e10) // stupid amount of blocks =)
      await piToken.connect(bob).communityMint(
        bob.address,
        MAX_SUPPLY.sub(INITIAL_SUPPLY)
      )

      expect(await piToken.totalSupply()).to.equal(MAX_SUPPLY)

      await expect(
        piToken.connect(bob).communityMint(bob.address, 1)
      ).to.be.revertedWith('Mint capped to 62.8M')
    })

    it('Should not mint same for same block', async () => {
      const MAX_MINT_PER_BLOCK = (await piToken.apiMintPerBlock()).add(
        await piToken.communityMintPerBlock()
      )

      await piToken.initRewardsOn(1)

      expect(await piToken.balanceOf(bob.address)).to.be.equal(0)

      await waitFor(piToken.setBlockNumber(2))
      await waitFor(piToken.connect(bob).communityMint(bob.address, MAX_MINT_PER_BLOCK))

      expect(await piToken.balanceOf(bob.address)).to.be.equal(MAX_MINT_PER_BLOCK)

      // Mint in the same block
      await expect(
        piToken.connect(bob).communityMint(bob.address, MAX_MINT_PER_BLOCK)
      ).to.be.revertedWith("Can't mint more than expected")

      // Mint in the same block just 1
      await expect(
        piToken.connect(bob).communityMint(bob.address, 1)
      ).to.be.revertedWith("Can't mint more than expected")

      expect(await piToken.balanceOf(bob.address)).to.be.equal(MAX_MINT_PER_BLOCK)
    })
  })
})

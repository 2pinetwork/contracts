const { createPiToken, deploy, waitFor } = require('./helpers')

describe('BridgedPiTokenMock', () => {
  let piToken
  let bridgedPiToken
  let owner
  let bob
  let superTokenFactory

  // Global setup
  before(async () => {
    [owner, bob] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = await createPiToken(owner, superTokenFactory, true)
    bridgedPiToken = await deploy('BridgedPiTokenMock', piToken.address)


    await waitFor(bridgedPiToken.setApiMintPerBlock(0.5e18 + ''))
    await waitFor(bridgedPiToken.setCommunityMintPerBlock(0.5e18 + ''))

    expect(await bridgedPiToken.available()).to.equal(0)

    await waitFor(piToken.transfer(bridgedPiToken.address, 100e18 + ''))

    expect(await bridgedPiToken.available()).to.equal(100e18 + '')

    await bridgedPiToken.addMinter(bob.address)
  })

  describe('Minting', async () => {
    it('Should not mint same for same block', async () => {
      const MAX_MINT_PER_BLOCK = (await bridgedPiToken.apiMintPerBlock()).add(
        await bridgedPiToken.communityMintPerBlock()
      )

      await bridgedPiToken.initRewardsOn(1)

      expect(await bridgedPiToken.balanceOf(bob.address)).to.be.equal(0)

      await waitFor(bridgedPiToken.setBlockNumber(2))
      await waitFor(bridgedPiToken.connect(bob).communityMint(bob.address, MAX_MINT_PER_BLOCK))

      expect(await bridgedPiToken.balanceOf(bob.address)).to.be.equal(MAX_MINT_PER_BLOCK)

      // Mint in the same block
      await expect(
        bridgedPiToken.connect(bob).communityMint(bob.address, MAX_MINT_PER_BLOCK)
      ).to.be.revertedWith("Can't mint more than expected")

      // Mint in the same block just 1
      await expect(
        bridgedPiToken.connect(bob).communityMint(bob.address, 1)
      ).to.be.revertedWith("Can't mint more than expected")

      await expect(
        bridgedPiToken.connect(bob).apiMint(bob.address, 1)
      ).to.be.revertedWith("Can't mint more than expected")

      expect(await bridgedPiToken.balanceOf(bob.address)).to.be.equal(MAX_MINT_PER_BLOCK)
    })
  })
})

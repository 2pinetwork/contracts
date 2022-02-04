const { createPiToken, deploy, waitFor } = require('../helpers')

describe('BridgedPiTokenMock', () => {
  let piToken
  let bridgedPiToken
  let bob

  // Global setup
  before(async () => {
    [owner, bob] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = await createPiToken({ tokenContract: 'PiTokenMock' })
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
      const communityPerBlock = await bridgedPiToken.communityMintPerBlock()

      await bridgedPiToken.initRewardsOn(1)

      expect(await bridgedPiToken.balanceOf(bob.address)).to.be.equal(0)

      await waitFor(bridgedPiToken.setBlockNumber(2))
      await waitFor(bridgedPiToken.connect(bob).communityMint(bob.address, communityPerBlock))

      expect(await bridgedPiToken.balanceOf(bob.address)).to.be.equal(communityPerBlock)

      // Mint in the same block
      await expect(
        bridgedPiToken.connect(bob).communityMint(bob.address, communityPerBlock)
      ).to.be.revertedWith("Can't mint more than expected")

      // Mint in the same block just 1
      await expect(
        bridgedPiToken.connect(bob).communityMint(bob.address, 1)
      ).to.be.revertedWith("Can't mint more than expected")

      expect(await bridgedPiToken.balanceOf(bob.address)).to.be.equal(communityPerBlock)

      let apiPerBlock = await bridgedPiToken.apiMintPerBlock()

      await waitFor(
        bridgedPiToken.connect(bob).apiMint(bob.address, apiPerBlock)
      )

      await expect(
        bridgedPiToken.connect(bob).apiMint(bob.address, apiPerBlock)
      ).to.be.revertedWith("Can't mint more than expected")
      await expect(
        bridgedPiToken.connect(bob).apiMint(bob.address, 1)
      ).to.be.revertedWith("Can't mint more than expected")

      expect(await bridgedPiToken.balanceOf(bob.address)).to.be.equal(
        communityPerBlock.add(apiPerBlock)
      )
    })
  })
})

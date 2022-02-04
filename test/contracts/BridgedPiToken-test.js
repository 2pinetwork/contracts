const {
  deploy, toNumber, expectedOnlyAdmin, createPiToken,
  getBlock, zeroAddress, waitFor, mineNTimes
} = require('../helpers')

describe('BridgedPiToken', () => {
  let bridgedPiToken
  let bob
  let alice
  let piToken

  // Global setup
  before(async () => {
    [, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = await createPiToken({ tokenContract: 'PiToken' })
    bridgedPiToken = await deploy('BridgedPiToken', piToken.address)

    expect(await bridgedPiToken.available()).to.equal(0)

    await waitFor(piToken.transfer(bridgedPiToken.address, 100e18 + ''))

    expect(await bridgedPiToken.available()).to.equal(100e18 + '')
  })

  describe('setMintPerBlock', async () => {
    it('Should revert for more than available', async () => {
      await waitFor(bridgedPiToken.addMinter(owner.address))

      await waitFor(bridgedPiToken.initRewardsOn(await getBlock()))
      await waitFor(bridgedPiToken.setCommunityMintPerBlock(101e18 + ''))

      await mineNTimes(1)

      await expect(bridgedPiToken.communityMint(owner.address, 101e18 + '')).to.be.revertedWith(
        "Can't mint more than available"
      )
    })

    it('Should change api and accumulate on 2nd change', async () => {
      await waitFor(bridgedPiToken.addMinter(owner.address))

      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0)

      await waitFor(bridgedPiToken.initRewardsOn(await getBlock()))

      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0)

      await waitFor(bridgedPiToken.setApiMintPerBlock(0.2e18 + ''))
      expect(await bridgedPiToken.apiMintPerBlock()).to.be.equal(0.2e18 + '')
      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0) // same block

      await mineNTimes(1)

      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0.2e18 + '')
      await waitFor(bridgedPiToken.setApiMintPerBlock(1e18 + ''))
      // Accumulated 0.4e18 (2 blocks * 0.2)
      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0.4e18 + '')

      // try to mint 1 block + reserve
      await expect(
        bridgedPiToken.apiMint(owner.address, 1.41e18 + '')
      ).to.be.revertedWith(
        "Can't mint more than expected"
      )

      // Mint only 1 block
      await waitFor(bridgedPiToken.apiMint(owner.address, 1.0e18 + ''))

      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(1.4e18 + '')
      // Mint everything + reserve (+ e little more to revert"
      await expect(bridgedPiToken.apiMint(owner.address, 2.41e18 + '')).to.be.revertedWith(
        "Can't mint more than expected"
      ) // this mint 1 block anyway
      await waitFor(bridgedPiToken.apiMint(owner.address, 3.4e18 + ''))

      // After mint everything in the block should be left 0
      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0)
    })

    it('Should change community and accumulate on 2nd change', async () => {
      await waitFor(bridgedPiToken.addMinter(owner.address))

      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(0)

      await waitFor(bridgedPiToken.initRewardsOn(await getBlock()))

      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(0)

      await waitFor(bridgedPiToken.setCommunityMintPerBlock(0.2e18 + ''))
      expect(await bridgedPiToken.communityMintPerBlock()).to.be.equal(0.2e18 + '')
      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(0) // same block

      await mineNTimes(1)

      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(0.2e18 + '')
      await waitFor(bridgedPiToken.setCommunityMintPerBlock(1e18 + ''))
      // Accumulated 0.4e18 (2 blocks * 0.2)
      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(0.4e18 + '')

      // try to mint 1 block + reserve
      await expect(
        bridgedPiToken.communityMint(owner.address, 1.41e18 + '')
      ).to.be.revertedWith(
        "Can't mint more than expected"
      )

      // Mint only 1 block
      await waitFor(bridgedPiToken.communityMint(owner.address, 1.0e18 + ''))

      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(1.4e18 + '')
      // Mint everything + reserve (+ e little more to revert"
      await expect(bridgedPiToken.communityMint(owner.address, 2.41e18 + '')).to.be.revertedWith(
        "Can't mint more than expected"
      ) // this mint 1 block anyway
      await waitFor(bridgedPiToken.communityMint(owner.address, 3.4e18 + ''))

      // After mint everything in the block should be left 0
      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(0)
    })

    it('Should change community and accumulate on api change', async () => {
      await waitFor(bridgedPiToken.addMinter(owner.address))
      await waitFor(bridgedPiToken.initRewardsOn(await getBlock()))
      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(0)
      await waitFor(bridgedPiToken.setCommunityMintPerBlock(0.5e18 + '')) // reward +1
      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(0)
      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0)

      await mineNTimes(1) // rewards +2

      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(0.5e18 + '')
      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0)

      // This call will store 1e18 in CommunityReserve and change mintPerBlock
      await waitFor(bridgedPiToken.setApiMintPerBlock(1e18 + '')) // rewards + 3

      // CommunityReserve 1.0e18
      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(1.0e18 + '')
      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0)

      const balance = await bridgedPiToken.balanceOf(owner.address)

      // Will try to mint 1 reserve + (1 block api) + 0.01
      await expect(bridgedPiToken.apiMint(owner.address, 2.01e18 + '')).to.be.revertedWith(
        "Can't mint more than expected"
      )
      await waitFor(bridgedPiToken.apiMint(owner.address, 2e18 + ''))

      expect(await bridgedPiToken.balanceOf(owner.address)).to.be.equal(balance.add(2.0e18 + ''))

      // 4 block * 0.5
      expect(await bridgedPiToken.communityLeftToMint()).to.be.equal(2.0e18 + '')
      // 3 block * 1.0 - 1.0
      expect(await bridgedPiToken.apiLeftToMint()).to.be.equal(0)
    })

    it('should revert mint for 0 perBlock', async () => {
      await waitFor(bridgedPiToken.addMinter(owner.address))
      await waitFor(bridgedPiToken.initRewardsOn(await getBlock()))

      await expect(bridgedPiToken.communityMint(owner.address, 1)).to.be.revertedWith(
        'Mint ratio is 0'
      )
    })
  })

  describe('initRewardsOn', async () => {
    it('Should revert for non admins', async () => {
      expectedOnlyAdmin(bridgedPiToken.connect(bob).initRewardsOn, 3)
    })

    it('Should revert for if already set', async () => {
      await bridgedPiToken.initRewardsOn(2)

      expect(
        bridgedPiToken.initRewardsOn(3)
      ).to.be.revertedWith('Already set')
    })
  })
  describe('Transactions', async () => {
    it('Should transfer tokens between accounts', async () => {
      // Transfer 50 tokens from owner to bob
      await piToken.transfer(bob.address, 50)
      expect(await bridgedPiToken.balanceOf(bob.address)).to.equal(50)

      // Transfer 50 tokens from bob to alice
      await piToken.connect(bob).transfer(alice.address, 50)
      expect(await bridgedPiToken.balanceOf(alice.address)).to.equal(50)
    })

    it('Should update balances after transfers', async () => {
      const initialOwnerBalance = await bridgedPiToken.balanceOf(owner.address)

      // Transfer 100 tokens from owner to bob.
      await piToken.transfer(bob.address, 100e18.toString())

      // Transfer another 50 tokens from owner to alice.
      await piToken.transfer(alice.address, 50e18.toString())

      // Check balances.
      expect(await bridgedPiToken.balanceOf(bob.address)).to.equal(100e18.toString())
      expect(await bridgedPiToken.balanceOf(alice.address)).to.equal(50e18.toString())
      expect(
        await bridgedPiToken.balanceOf(owner.address)
      ).to.equal(
        initialOwnerBalance.sub(150e18 + '')
      )
    })
  })

  describe('Minting', async () => {
    let block

    beforeEach(async () => {
      await bridgedPiToken.addMinter(bob.address)
      await waitFor(bridgedPiToken.setCommunityMintPerBlock(0.5e18 + ''))
      await waitFor(bridgedPiToken.setApiMintPerBlock(0.5e18 + ''))

      block = await getBlock();
    })

    it('Should revert for non admins', async () => {
      expectedOnlyAdmin(bridgedPiToken.connect(bob).addMinter, bob.address)
    })

    it('Should only mint for minters', async () => {
      await waitFor(bridgedPiToken.initRewardsOn(block - 5))

      await expect(
        bridgedPiToken.connect(alice).communityMint(alice.address, 1)
      ).to.be.revertedWith('Only minters')
      await expect(
        bridgedPiToken.connect(alice).apiMint(alice.address, 1)
      ).to.be.revertedWith('Only minters')

      // Ensure doesn't revert
      await waitFor(bridgedPiToken.connect(bob).communityMint(alice.address, 100))
      await waitFor(bridgedPiToken.connect(bob).apiMint(alice.address, 100))
    })

    it('Should revert for zero address receiver', async () => {
      expect(bridgedPiToken.connect(bob).communityMint(zeroAddress, 1)).to.be.revertedWith(
        "Can't mint to zero address"
      )
    })

    it('Should revert with zero amount', async () => {
      expect(bridgedPiToken.connect(bob).communityMint(owner.address, 0)).to.be.revertedWith(
        'Insufficient supply'
      )
    })

    it('Should only mint if startRewardsBlock is initialized', async () => {
      await expect(
        bridgedPiToken.connect(bob).communityMint(bob.address, 1)
      ).to.be.revertedWith('Rewards not initialized')
    })


    it('Should revert for future rewards block', async () => {
      await bridgedPiToken.initRewardsOn(block + 6);

      expect(bridgedPiToken.connect(bob).communityMint(owner.address, 1)).to.be.revertedWith(
        'Still waiting for rewards block'
      )
    })

    it('Should only mint until max mint per block', async () => {
      const MAX_MINT_PER_BLOCK = await bridgedPiToken.communityMintPerBlock()

      await bridgedPiToken.initRewardsOn(block - 5)

      // 5 + 1 per initRewardsOn call + 1 per current block
      let n  = toNumber(7 * MAX_MINT_PER_BLOCK)

      await bridgedPiToken.connect(bob).communityMint(bob.address, n)

      // 1 more than max per block
      n = toNumber(MAX_MINT_PER_BLOCK).replace(/\d$/, '1')

      await expect(
        bridgedPiToken.connect(bob).communityMint(bob.address, n)
      ).to.be.revertedWith("Can't mint more than expected")
    })
  })
})

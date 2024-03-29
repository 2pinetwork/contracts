const {
  toNumber, createPiToken, expectedOnlyAdmin,
  getBlock, zeroAddress, waitFor, mineNTimes
} = require('../helpers')

describe('PiToken', () => {
  let piToken
  let owner
  let bob
  let alice
  let INITIAL_SUPPLY

  // Global setup
  before(async () => {
    [owner, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = await createPiToken({ tokenContract: 'PiToken' })

    INITIAL_SUPPLY = await piToken.INITIAL_SUPPLY()

    expect(await piToken.totalSupply()).to.equal(INITIAL_SUPPLY)
    expect(await piToken.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY)
  })

  describe('setMintPerBlock', async () => {
    it('Should change api and accumulate on 2nd change', async () => {
      await waitFor(piToken.addMinter(owner.address))

      expect(await piToken.apiLeftToMint()).to.be.equal(0)
      await waitFor(piToken.initRewardsOn(await getBlock()))
      expect(await piToken.apiLeftToMint()).to.be.equal(0)

      await waitFor(piToken.setApiMintPerBlock(0.2e18 + ''))
      expect(await piToken.apiLeftToMint()).to.be.equal(0)

      await mineNTimes(1)

      expect(await piToken.apiLeftToMint()).to.be.equal(0.2e18 + '')

      await waitFor(piToken.setApiMintPerBlock(1e18 + ''))
      // Accumulated 1e18 (2 blocks * 0.2)
      expect(await piToken.apiLeftToMint()).to.be.equal(0.4e18 + '')

      await expect(
        piToken.apiMint(owner.address, 1.41e18 + '')
      ).to.be.revertedWith(
        "Can't mint more than expected"
      )

      // Mint only 1 block
      await waitFor(piToken.apiMint(owner.address, 1.0e18 + ''))

      const balance = await piToken.balanceOf(owner.address)

      // ApiReserve 0.4 + Api 1.0 (1 blocks)
      expect(await piToken.apiLeftToMint()).to.be.equal(1.4e18 + '')
      // Mint everything + reserve
      await waitFor(piToken.apiMint(owner.address, 2.4e18 + ''))

      expect(await piToken.balanceOf(owner.address)).to.be.equal(
        balance.add(2.4e18 + '')
      )

      // Only mint per block
      expect(await piToken.apiLeftToMint()).to.be.equal(0)
    })

    it('Should change community and accumulate on 2nd change', async () => {
      await waitFor(piToken.addMinter(owner.address))

      expect(await piToken.communityLeftToMint()).to.be.equal(0)
      await waitFor(piToken.initRewardsOn(await getBlock()))
      expect(await piToken.communityLeftToMint()).to.be.equal(0)

      await waitFor(piToken.setCommunityMintPerBlock(0.2e18 + ''))
      expect(await piToken.communityLeftToMint()).to.be.equal(0)

      await mineNTimes(1)

      expect(await piToken.communityLeftToMint()).to.be.equal(0.2e18 + '')

      await waitFor(piToken.setCommunityMintPerBlock(1e18 + ''))
      // Accumulated 1e18 (2 blocks * 0.2)
      expect(await piToken.communityLeftToMint()).to.be.equal(0.4e18 + '')

      await expect(
        piToken.communityMint(owner.address, 1.41e18 + '')
      ).to.be.revertedWith(
        "Can't mint more than expected"
      )

      // Mint only 1 block
      await waitFor(piToken.communityMint(owner.address, 1.0e18 + ''))

      const balance = await piToken.balanceOf(owner.address)

      // CommunityReserve 0.4 + Community 1.0 (1 blocks)
      expect(await piToken.communityLeftToMint()).to.be.equal(1.4e18 + '')
      // Mint everything + reserve
      await waitFor(piToken.communityMint(owner.address, 2.4e18 + ''))

      expect(await piToken.balanceOf(owner.address)).to.be.equal(
        balance.add(2.4e18 + '')
      )

      // Only mint per block
      expect(await piToken.communityLeftToMint()).to.be.equal(0)
    })

    it('Should change community and accumulate on api change', async () => {
      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.initRewardsOn(await getBlock()))
      expect(await piToken.communityLeftToMint()).to.be.equal(0)
      await waitFor(piToken.setCommunityMintPerBlock(0.5e18 + ''))
      await mineNTimes(1)
      expect(await piToken.communityLeftToMint()).to.be.equal(0.5e18 + '') // Reserve
      expect(await piToken.apiLeftToMint()).to.be.equal(0)

      await mineNTimes(1)

      // Community 0.5 * 2
      expect(await piToken.communityLeftToMint()).to.be.equal(1.0e18 + '')
      expect(await piToken.apiLeftToMint()).to.be.equal(0)

      // This call will store 1e18 in reserve and change mintPerBlock
      await waitFor(piToken.setApiMintPerBlock(1e18 + '')) // rewards + 3

      // CommunityReserve 1.5
      expect(await piToken.communityLeftToMint()).to.be.equal(1.5e18 + '')
      expect(await piToken.apiLeftToMint()).to.be.equal(0)

      const balance = await piToken.balanceOf(owner.address)

      // Will try to mint "more" than 1 block
      await expect(piToken.apiMint(owner.address, 1.1e18 + '')).to.be.revertedWith(
        "Can't mint more than expected"
      )

      await waitFor(piToken.apiMint(owner.address, 1.0e18 + ''))

      expect(await piToken.balanceOf(owner.address)).to.be.equal(balance.add(1.0e18 + ''))

      // CommunityReserve 1.5 + Community 1.0 (2 blocks)
      expect(await piToken.communityLeftToMint()).to.be.equal(2.5e18 + '')
      // API 1 block
      expect(await piToken.apiLeftToMint()).to.be.equal(1e18 + '')
    })

    it('should revert mint for 0 perBlock', async () => {
      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.initRewardsOn(await getBlock()))

      await expect(piToken.communityMint(owner.address, 1)).to.be.revertedWith(
        'Mint ratio is 0'
      )
    })
  })

  describe('mintForMultiChain', async () => {
    it('should be reverted for mint 0', async () => {
      await expect(
        piToken.mintForMultiChain(0, ethers.utils.toUtf8Bytes('Tokens for testnet'))
      ).to.be.revertedWith('Insufficient supply')
    })

    it('should revert to mint more than MAX SUPPLY', async () => {
      const left = (await piToken.MAX_SUPPLY()).sub(INITIAL_SUPPLY)

      await expect(
        piToken.mintForMultiChain(left.add(1), ethers.utils.toUtf8Bytes('Tokens for testnet'))
      ).to.be.revertedWith("Cant' mint more than cap")

      // Ensure it's not reverted for max
      await waitFor(piToken.mintForMultiChain(left, ethers.utils.toUtf8Bytes('Tokens for testnet')))
    })

    it('should mint, change the current tranch and keep the pending mint', async () => {
      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.initRewardsOn(await getBlock()))

      await waitFor(piToken.setCommunityMintPerBlock(1e18 + ''))
      await mineNTimes(1)
      expect(await piToken.communityLeftToMint()).to.be.equal(1.0e18 + '')

      await waitFor(piToken.mintForMultiChain(100, ethers.utils.toUtf8Bytes('Tokens for testnet')))

      // 1.0e18 from "restFromLastTranch" + 1.0 from last block reward
      expect(await piToken.communityLeftToMint()).to.be.equal(2.0e18 + '')
    })
  })

  describe('init', async () => {
    it('Should revert for non admins', async () => {
      expectedOnlyAdmin(piToken.connect(bob).init)
    })

    it('Should revert second call', async () => {
      await expect(piToken.init()).to.be.revertedWith('Already initialized')
    })

    it('should revert initialize native function', async () => {
      const balance = await piToken.balanceOf(owner.address)
      const supply = await piToken.totalSupply()

      await expect(piToken.initialize(zeroAddress, 18, '2Pi', '2Pi')).to.be.revertedWith('Initializable: contract is already initialized')
      await expect(piToken.initialize(zeroAddress, 18, '22Pi', '22Pi')).to.be.revertedWith('Initializable: contract is already initialized')

      const native = await ethers.getContractAt('NativeSuperTokenProxy', piToken.address)

      await expect(native.initialize('2Pi', '2Pi', 100)).to.be.revertedWith(
        "Can't call initialize directly"
      )
      await expect(native.initialize('22Pi', '22Pi', 100)).to.be.revertedWith(
        "Can't call initialize directly"
      )

      expect(await piToken.balanceOf(owner.address)).to.be.equal(balance)
      expect(await piToken.totalSupply()).to.be.equal(supply)
    })

    it('should revert superfluid initializeProxy', async () => {
      const native = await ethers.getContractAt('NativeSuperTokenProxy', piToken.address)

      await expect(native.initializeProxy(bob.address)).to.be.revertedWith(
        'UUPSProxy: already initialized'
      )
    })
  })

  describe('initRewardsOn', async () => {
    it('Should revert for non admins', async () => {
      expectedOnlyAdmin(piToken.connect(bob).initRewardsOn, 3)
    })

    it('Should revert for if already set', async () => {
      await piToken.initRewardsOn(2)

      expect(
        piToken.initRewardsOn(3)
      ).to.be.revertedWith('Already set')
    })
  })

  describe('Transactions', async () => {
    it('Should transfer tokens between accounts', async () => {
      // Transfer 50 tokens from owner to bob
      await piToken.transfer(bob.address, 50)
      expect(await piToken.balanceOf(bob.address)).to.equal(50)

      // Transfer 50 tokens from bob to alice
      await piToken.connect(bob).transfer(alice.address, 50)
      expect(await piToken.balanceOf(alice.address)).to.equal(50)
    })

    it('Should fail if sender doesn’t have enough tokens', async () => {
      const initialOwnerBalance = await piToken.balanceOf(owner.address)

      // Try to send 1 token from bob (0 tokens) to owner (10000 tokens).
      // `require` will evaluate false and revert the transaction.
      await expect(
        piToken.connect(bob).transfer(owner.address, 1)
      ).to.be.revertedWith('SuperfluidToken: move amount exceeds balance')

      // Owner balance shouldn't have changed.
      expect(await piToken.balanceOf(owner.address)).to.equal(
        initialOwnerBalance
      )
    })

    it('Should update balances after transfers', async () => {
      const initialOwnerBalance = (await piToken.balanceOf(owner.address)).div(toNumber(1e18))

      // Transfer 100 tokens from owner to bob.
      await piToken.transfer(bob.address, 100e18.toString())

      // Transfer another 50 tokens from owner to alice.
      await piToken.transfer(alice.address, 50e18.toString())

      // Check balances.
      expect(await piToken.balanceOf(bob.address)).to.equal(100e18.toString())
      expect(await piToken.balanceOf(alice.address)).to.equal(50e18.toString())
      // BigNumber overflow...
      expect(
        (await piToken.balanceOf(owner.address)).div(toNumber(1e18))
      ).to.equal(
        initialOwnerBalance - 150
      )
    })

    it('Should emit transfer event after transfers', async () => {
      expect(await piToken.transfer(bob.address, 100)).to.emit(
        piToken, 'Transfer'
      ).withArgs(owner.address, bob.address, 100)
    })
  })

  describe('Allowance', async () => {
    it('Should update allowance after approve', async () => {
      expect(await piToken.allowance(owner.address, bob.address)).to.equal(0)

      await piToken.approve(bob.address, 50)

      expect(await piToken.allowance(owner.address, bob.address)).to.equal(50)
    })

    it('Should use allowance to transfer on behalf of', async () => {
      const initialOwnerBalance = (await piToken.balanceOf(owner.address)).div(toNumber(1e18))

      // own transfers works directyl
      expect(await piToken.transferFrom(owner.address, bob.address, 1)).to.emit(
        piToken, 'Transfer'
      ).withArgs(owner.address, bob.address, 1)

      await expect(
        piToken.connect(bob).transferFrom(owner.address, alice.address, 1)
      ).to.be.revertedWith(
        'SuperToken: transfer amount exceeds allowance'
      )

      await piToken.approve(bob.address, 1e18.toString())
      expect(await piToken.allowance(owner.address, bob.address)).to.equal(1e18.toString())

      expect(
        await piToken.connect(bob).transferFrom(owner.address, alice.address, 1e18.toString())
      ).to.emit(
        piToken, 'Transfer'
      ).withArgs(owner.address, alice.address, 1e18.toString())

      expect(await piToken.balanceOf(alice.address)).to.equal(1e18.toString())
      // BigNumber overflow
      expect((await piToken.balanceOf(owner.address)) / 1e18).to.equal(
        initialOwnerBalance - 1
      )
    })

    it('Should increase allowance and emit approval event', async () => {
      expect(
        await piToken.increaseAllowance(bob.address, 1)
      ).to.emit(
        piToken, 'Approval'
      ).withArgs(owner.address, bob.address, 1)

      expect(await piToken.allowance(owner.address, bob.address)).to.equal(1)

      await piToken.increaseAllowance(bob.address, 1)

      expect(await piToken.allowance(owner.address, bob.address)).to.equal(2)
    })

    it('Should decrease allowance and emit approval event', async () => {
      await piToken.increaseAllowance(bob.address, 1)

      expect(await piToken.allowance(owner.address, bob.address)).to.equal(1)

      expect(
        await piToken.decreaseAllowance(bob.address, 1)
      ).to.emit(
        piToken, 'Approval'
      ).withArgs(owner.address, bob.address, 0)

      expect(await piToken.allowance(owner.address, bob.address)).to.equal(0)
    })
  })

  describe('Minting', async () => {
    let block

    beforeEach(async () => {
      await piToken.addMinter(bob.address)
      await waitFor(piToken.setCommunityMintPerBlock(0.5e18 + ''))
      await waitFor(piToken.setApiMintPerBlock(0.5e18 + ''))

      block = await getBlock();
    })

    it('Should revert for non admins', async () => {
      expectedOnlyAdmin(piToken.connect(bob).addMinter, bob.address)
    })

    it('Should only mint for minters', async () => {
      await waitFor(piToken.initRewardsOn(block - 5))

      expect(await piToken.totalSupply()).to.equal(INITIAL_SUPPLY)

      await expect(
        piToken.connect(alice).communityMint(alice.address, 1)
      ).to.be.revertedWith('Only minters')
      await expect(
        piToken.connect(alice).apiMint(alice.address, 1)
      ).to.be.revertedWith('Only minters')

      await piToken.connect(bob).communityMint(alice.address, 100)
      await piToken.connect(bob).apiMint(alice.address, 100)

      expect(await piToken.totalSupply()).to.equal(
        INITIAL_SUPPLY.add(200)
      )
    })

    it('Should revert for zero address receiver', async () => {
      expect(piToken.connect(bob).communityMint(zeroAddress, 1)).to.be.revertedWith(
        "Can't mint to zero address"
      )
    })

    it('Should revert with zero amount', async () => {
      expect(piToken.connect(bob).communityMint(owner.address, 0)).to.be.revertedWith(
        'Insufficient supply'
      )
    })

    it('Should only mint if startRewardsBlock is initialized', async () => {
      await expect(
        piToken.connect(bob).communityMint(bob.address, 1)
      ).to.be.revertedWith('Rewards not initialized')
    })


    it('Should revert for future rewards block', async () => {
      await piToken.initRewardsOn(block + 6);

      expect(piToken.connect(bob).communityMint(owner.address, 1)).to.be.revertedWith(
        'Still waiting for rewards block'
      )
    })

    it('Should only mint until max mint per block', async () => {
      // 5 + 1 per initRewardsOn call + 1 per current block
      const n = (await piToken.communityMintPerBlock()).mul(7)

      await piToken.initRewardsOn(block - 5)

      await expect(
        piToken.connect(bob).communityMint(bob.address, n.add(1))
      ).to.be.revertedWith("Can't mint more than expected")

      await waitFor(piToken.connect(bob).communityMint(bob.address, n))
    })
  })

  describe('setMintPerBlock', async () => {
    it('should not revert when changing rates', async () => {
      const block = await getBlock();
      await piToken.initRewardsOn(block)
      await mineNTimes(1)

      expect(await piToken.apiLeftToMint()).to.be.equal(0)
      expect(await piToken.communityLeftToMint()).to.be.equal(0)

      await waitFor(piToken.setCommunityMintPerBlock(0.2e18 + ''))
      await waitFor(piToken.setCommunityMintPerBlock(0))

      expect(await piToken.apiLeftToMint()).to.be.equal(0)
      expect(await piToken.communityLeftToMint()).to.be.equal(0.2e18 + '')

      await waitFor(piToken.setCommunityMintPerBlock(1e18 + ''))
      await waitFor(piToken.setCommunityMintPerBlock(0))

      expect(await piToken.apiLeftToMint()).to.be.equal(0)
      expect(await piToken.communityLeftToMint()).to.be.equal(1.2e18 + '')

      await waitFor(piToken.setApiMintPerBlock(0.3e18 + ''))
      await waitFor(piToken.setApiMintPerBlock(0))

      expect(await piToken.apiLeftToMint()).to.be.equal(0.3e18 + '')
      expect(await piToken.communityLeftToMint()).to.be.equal(1.2e18 + '')

      await waitFor(piToken.setApiMintPerBlock(0.5e18 + ''))
      await waitFor(piToken.setApiMintPerBlock(0))

      expect(await piToken.apiLeftToMint()).to.be.equal(0.8e18 + '')
      expect(await piToken.communityLeftToMint()).to.be.equal(1.2e18 + '')
    })
  })

  describe('Burning', async () => {
    beforeEach(async () => {
      await piToken.addBurner(bob.address)
    })

    it('Should only burn for burners', async () => {
      expect(await piToken.totalSupply()).to.equal(toNumber(INITIAL_SUPPLY))

      const data = ethers.utils.toUtf8Bytes('Arsonist')

      await expect(
        piToken.connect(alice).burn(1, data)
      ).to.be.revertedWith('Only burners')

      await expect(
        piToken.connect(bob).burn(1, data)
      ).to.be.revertedWith('SuperfluidToken: burn amount exceeds balance')

      await piToken.transfer(bob.address, toNumber(100e18))
      await piToken.connect(bob).burn(toNumber(100e18), data)

      const expected = (await piToken.INITIAL_SUPPLY()).sub(
        toNumber(100e18)
      )
      expect(await piToken.balanceOf(bob.address)).to.equal(0)
      expect(await piToken.totalSupply()).to.equal(expected)
    })
  })
})

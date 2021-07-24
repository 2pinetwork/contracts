/* global ethers, describe, before, beforeEach, it */
const BigNumber = require('bignumber.js')
const { expect } = require('chai')
const {
  toNumber, initSuperFluid, createPiToken, expectedOnlyAdmin,
  waitFor, getBlock, sleep, zeroAddress
} = require('./helpers')

const MINT_DATA = [
  { community: 0.25439e18, expected: (new BigNumber( 1229833e18)), founders: 0.31364e18, investors: 0.41819e18, blocks: 1.25e6},
  { community: 0.50879e18, expected: (new BigNumber( 4317500e18)), founders: 0.31364e18, investors: 0.41819e18, blocks: 3.8e6 },
  { community: 0.63599e18, expected: (new BigNumber(14522500e18)), founders: 0.31364e18, investors: 0.41819e18, blocks: 1.2e7 },
  { community: 1.09027e18, expected: (new BigNumber(21307142e18)), founders: 0.31364e18, investors: 0.41819e18, blocks: 1.6e7 },
  { community: 1.09027e18, expected: (new BigNumber(28260000e18)), founders: 0.31364e18, investors: 0         , blocks: 2.1e7 },
  { community: 1.58998e18, expected: (new BigNumber(47100000e18)), founders: 0.31364e18, investors: 0         , blocks: 3.5e7 }
]


describe('PiToken', () => {
  let piToken
  let owner
  let bob
  let alice
  let INITIAL_SUPPLY
  let superTokenFactory
  const txData = 0x0

  // Global setup
  before(async () => {
    [owner, bob, alice] = await ethers.getSigners()

    superTokenFactory = await initSuperFluid(owner);
  })

  beforeEach(async () => {
    piToken = await createPiToken(owner, superTokenFactory)

    INITIAL_SUPPLY = parseInt(await piToken.INITIAL_SUPPLY(), 10)

    expect(await piToken.totalSupply()).to.equal(toNumber(INITIAL_SUPPLY))
    expect(await piToken.balanceOf(owner.address)).to.equal(toNumber(INITIAL_SUPPLY))
  })

  describe('init', () => {
    it('Should revert for non admins', async () => {
      expectedOnlyAdmin(piToken.connect(bob).init)
    })

    it('Should revert second call', async () => {
      expect(piToken.init()).to.be.revertedWith('Initializable: contract is already initialized')
    })
  })

  describe('initRewardsOn', () => {
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

  describe('increaseCurrentTranche', () => {
    it('Should revert for non admins', async () => {
      await expectedOnlyAdmin(piToken.connect(alice).increaseCurrentTranche)
    })


    it('Should revert while totalSupply is less than expected', async () => {
      expect(
        piToken.increaseCurrentTranche()
      ).to.be.revertedWith('not yet')
    })
  })

  describe('Transactions', () => {
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
      const initialOwnerBalance = await piToken.balanceOf(owner.address) / 1e18

      // Transfer 100 tokens from owner to bob.
      await piToken.transfer(bob.address, 100e18.toString())

      // Transfer another 50 tokens from owner to alice.
      await piToken.transfer(alice.address, 50e18.toString())

      // Check balances.
      expect(await piToken.balanceOf(bob.address)).to.equal(100e18.toString())
      expect(await piToken.balanceOf(alice.address)).to.equal(50e18.toString())
      // BigNumber overflow...
      expect((await piToken.balanceOf(owner.address)) / 1e18).to.equal(
        initialOwnerBalance - 150
      )
    })

    it('Should emit transfer event after transfers', async () => {
      expect(await piToken.transfer(bob.address, 100)).to.emit(
        piToken, 'Transfer'
      ).withArgs(owner.address, bob.address, 100)
    })
  })

  describe('Allowance', () => {
    it('Should update allowance after approve', async () => {
      expect(await piToken.allowance(owner.address, bob.address)).to.equal(0)

      await piToken.approve(bob.address, 50)

      expect(await piToken.allowance(owner.address, bob.address)).to.equal(50)
    })

    it('Should use allowance to transfer on behalf of', async () => {
      const initialOwnerBalance = (await piToken.balanceOf(owner.address)) / 1e18

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

  describe('Minting', () => {
    let block

    beforeEach(async () => {
      await piToken.addMinter(bob.address)
      block = await ethers.provider.send('eth_blockNumber');
    })

    it('Should revert for non admins', async () => {
      expectedOnlyAdmin(piToken.connect(bob).addMinter, bob.address)
    })

    it('Should only mint for minters', async () => {
      await piToken.initRewardsOn(block - 5)

      expect(await piToken.totalSupply()).to.equal(toNumber(INITIAL_SUPPLY))

      await expect(
        piToken.connect(alice).mint(alice.address, 1, txData)
      ).to.be.revertedWith('Only minters')

      // let toMint = '1' + ('0' * 18)
      await piToken.connect(bob).mint(alice.address, toNumber(1e10), txData)

      expect(await piToken.totalSupply()).to.equal(
        (new BigNumber(INITIAL_SUPPLY)).plus(1e10).toFixed()
      )
    })

    it('Should revert for zero address receiver', async () => {
      expect(piToken.connect(bob).mint(zeroAddress, 1, txData)).to.be.revertedWith(
        "Can't mint to zero address"
      )
    })

    it('Should revert with zero amount', async () => {
      expect(piToken.connect(bob).mint(owner.address, 0, txData)).to.be.revertedWith(
        'Insufficient supply'
      )
    })

    it('Should only mint if startRewardsBlock is initialized', async () => {
      await expect(
        piToken.connect(bob).mint(bob.address, 1, txData)
      ).to.be.revertedWith('Rewards not initialized')
    })


    it('Should revert for future rewards block', async () => {
      await piToken.initRewardsOn(block + 6);

      expect(piToken.connect(bob).mint(owner.address, 1, txData)).to.be.revertedWith(
        'Still waiting for rewards block'
      )
    })

    it('Should only mint until max mint per block', async () => {
      const MAX_MINT_PER_BLOCK = await piToken.totalMintPerBlock()

      await piToken.initRewardsOn(block - 5)

      // 5 + 1 per initRewardsOn call + 1 per current block
      let n  = toNumber(7 * MAX_MINT_PER_BLOCK)

      await piToken.connect(bob).mint(bob.address, n, txData)

      // 1 more than max per block
      n = toNumber(MAX_MINT_PER_BLOCK).replace(/\d$/, '1')

      await expect(
        piToken.connect(bob).mint(bob.address, n, txData)
      ).to.be.revertedWith("Can't mint more than expected")
    })
  })

  describe('Burning', () => {
    beforeEach(async () => {
      await piToken.addBurner(bob.address)
    })

    it('Should only burn for burners', async () => {
      expect(await piToken.totalSupply()).to.equal(toNumber(INITIAL_SUPPLY))

      await expect(
        piToken.connect(alice).burn(1, txData)
      ).to.be.revertedWith('Only burners')

      await expect(
        piToken.connect(bob).burn(1, txData)
      ).to.be.revertedWith('SuperfluidToken: burn amount exceeds balance')

      await piToken.transfer(bob.address, toNumber(100e18))

      await piToken.connect(bob).burn(toNumber(100e18), txData)

      // Rest has an overflow (?)
      let expected = (INITIAL_SUPPLY / 1e18) - 100
      expect(await piToken.balanceOf(bob.address)).to.equal(0)
      expect(await piToken.totalSupply()).to.equal(
        toNumber(expected * 1e18)
      )
    })
  })
})

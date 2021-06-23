/* global ethers, describe, beforeEach, it */
const { expect } = require('chai')

const toNumber = function (value) {
  // Needed for BigNumber lib
  return value.toLocaleString('fullwide', { useGrouping: false })
}

describe('PiToken', () => {
  let PiToken
  let piToken
  let owner
  let bob
  let alice
  let INITIAL_SUPPLY
  let MAX_SUPPLY

  beforeEach(async () => {
    // console.log(await ethers.provider.getBlockNumber())
    [owner, bob, alice] = await ethers.getSigners()

    PiToken = await ethers.getContractFactory('PiToken')
    piToken = await PiToken.deploy()

    INITIAL_SUPPLY = parseInt(await piToken.INITIAL_SUPPLY(), 10)
    MAX_SUPPLY = parseInt(await piToken.MAX_SUPPLY(), 10)
  })

  describe('Deployment', () => {
    it('Deployment should assign max supply of tokens', async () => {
      expect(await piToken.totalSupply()).to.equal(0)
      expect(await piToken.cap()).to.equal(toNumber(MAX_SUPPLY))
    })
  })

  describe('Initialize', () => {
    it('InitialSupply should mint & assign supply of tokens to owner', async () => {
      expect(await piToken.totalSupply()).to.equal(0)
      expect(await piToken.balanceOf(owner.address)).to.equal(0)

      await piToken.initialSupply()

      expect(await piToken.totalSupply()).to.equal(toNumber(INITIAL_SUPPLY))
      expect(await piToken.balanceOf(owner.address)).to.equal(toNumber(INITIAL_SUPPLY))
    })
  })

  describe('Transactions', () => {
    beforeEach(async () => {
      await piToken.initialSupply()
    })

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
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance')

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
    beforeEach(async () => {
      await piToken.initialSupply()
    })

    it('Should update allowance after approve', async () => {
      expect(await piToken.allowance(owner.address, bob.address)).to.equal(0)

      await piToken.approve(bob.address, 50)

      expect(await piToken.allowance(owner.address, bob.address)).to.equal(50)
    })

    it('Should use allowance to transfer on behalf of', async () => {
      const initialOwnerBalance = (await piToken.balanceOf(owner.address)) / 1e18

      await expect(
        piToken.transferFrom(owner.address, bob.address, 1)
      ).to.be.revertedWith('ERC20: transfer amount exceeds allowance')

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
    beforeEach(async () => {
      await piToken.initialSupply()
      await piToken.addMinter(bob.address)
    })

    it('Should only mint for minters', async () => {
      expect(await piToken.totalSupply()).to.equal(toNumber(INITIAL_SUPPLY))

      await expect(
        piToken.connect(alice).mint(alice.address, 1)
      ).to.be.revertedWith('Only minters')

      await piToken.connect(bob).mint(alice.address, toNumber(100e18))

      expect(await piToken.totalSupply()).to.equal(
        toNumber(INITIAL_SUPPLY + 100e18)
      )
    })

    it('Should only mint until MAX SUPPLY', async () => {
      await piToken.connect(bob).mint(
        bob.address,
        toNumber(MAX_SUPPLY - INITIAL_SUPPLY)
      )

      expect(await piToken.totalSupply()).to.equal(
        toNumber(MAX_SUPPLY)
      )

      await expect(
        piToken.connect(bob).mint(bob.address, 1)
      ).to.be.revertedWith('ERC20Capped: cap exceeded')
    })
  })

  describe('Burning', () => {
    beforeEach(async () => {
      await piToken.initialSupply()
      await piToken.addBurner(bob.address)
    })

    it('Should only burn for burners', async () => {
      expect(await piToken.totalSupply()).to.equal(toNumber(INITIAL_SUPPLY))

      await expect(
        piToken.connect(alice).burn(1)
      ).to.be.revertedWith('Only burners')

      await expect(
        piToken.connect(bob).burn(1)
      ).to.be.revertedWith('ERC20: burn amount exceeds balance')

      await piToken.transfer(bob.address, toNumber(100e18))

      await piToken.connect(bob).burn(toNumber(100e18))

      // Rest has an overflow (?)
      let expected = (INITIAL_SUPPLY / 1e18) - 100
      expect(await piToken.balanceOf(bob.address)).to.equal(0)
      expect(await piToken.totalSupply()).to.equal(
        toNumber(expected * 1e18)
      )
    })
  })
})

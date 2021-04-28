const { expect } = require('chai')

describe('PiToken', () => {
  const supply = 10000

	let PiToken
	let piToken
	let owner
	let bob
	let alice

	beforeEach(async () => {
		[owner, bob, alice] = await ethers.getSigners()

    PiToken = await ethers.getContractFactory('PiToken')
    piToken = await PiToken.deploy(supply)
  })

  describe('Deployment', () => {
    it('Deployment should assign the total supply of tokens to the owner', async () => {
      const ownerBalance = await piToken.balanceOf(owner.address)

      expect(await piToken.totalSupply()).to.equal(supply)
      expect(await piToken.totalSupply()).to.equal(ownerBalance)
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
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance')

      // Owner balance shouldn't have changed.
      expect(await piToken.balanceOf(owner.address)).to.equal(
        initialOwnerBalance
      )
    })

    it('Should update balances after transfers', async () => {
      const initialOwnerBalance = await piToken.balanceOf(owner.address)

      // Transfer 100 tokens from owner to bob.
      await piToken.transfer(bob.address, 100)

      // Transfer another 50 tokens from owner to alice.
      await piToken.transfer(alice.address, 50)

      // Check balances.
      expect(await piToken.balanceOf(bob.address)).to.equal(100)
      expect(await piToken.balanceOf(alice.address)).to.equal(50)
      expect(await piToken.balanceOf(owner.address)).to.equal(
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
      const initialOwnerBalance = await piToken.balanceOf(owner.address)

      await expect(
        piToken.transferFrom(owner.address, bob.address, 1)
      ).to.be.revertedWith('ERC20: transfer amount exceeds allowance')

      await piToken.approve(bob.address, 1)
      expect(await piToken.allowance(owner.address, bob.address)).to.equal(1)

      expect(
        await piToken.connect(bob).transferFrom(owner.address, alice.address, 1)
      ).to.emit(
        piToken, 'Transfer'
      ).withArgs(owner.address, alice.address, 1)

      expect(await piToken.balanceOf(alice.address)).to.equal(1)
      expect(await piToken.balanceOf(owner.address)).to.equal(
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
})

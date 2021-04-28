const { expect } = require('chai')

describe('PiVault', () => {
  let owner
  let PiToken
  let piToken
	let PiVault
	let piVault

	beforeEach(async () => {
		[owner] = await ethers.getSigners()
    PiToken = await ethers.getContractFactory('PiToken')
    piToken = await PiToken.deploy(10000)
    PiVault = await ethers.getContractFactory('PiVault')
    piVault = await PiVault.deploy(
      piToken.address,
      await piToken.name(),
      await piToken.symbol()
    )
  })

  describe('Deployment', () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await piVault.balance()).to.equal(0)
    })
  })

  describe('Deposits', () => {
    it('Should deposit', async () => {
      await piToken.approve(piVault.address, 10)
      await piVault.deposit(10)

      expect(await piVault.balance()).to.equal(10)
      expect(await piVault.available()).to.equal(10)
    })

    it('Should deposit all', async () => {
      const ownerBalance = await piToken.balanceOf(owner.address)

      await piToken.approve(piVault.address, ownerBalance)
      await piVault.depositAll()

      expect(await piVault.balance()).to.equal(ownerBalance)
      expect(await piVault.available()).to.equal(ownerBalance)
      expect(await piToken.balanceOf(owner.address)).to.equal(0)
    })
  })

  describe('Withdraw', () => {
    beforeEach(async () => {
      await piToken.approve(piVault.address, 10)
      await piVault.deposit(10)
    })

    it('Should withdraw', async () => {
      const initialOwnerBalance = await piToken.balanceOf(owner.address)

      await piVault.withdraw(5)

      expect(await piVault.balance()).to.equal(5)
      expect(await piToken.balanceOf(owner.address)).to.equal(+initialOwnerBalance + 5)
    })

    it('Should withdraw all', async () => {
      const initialOwnerBalance = await piToken.balanceOf(owner.address)

      await piVault.withdrawAll()

      expect(await piVault.balance()).to.equal(0)
      expect(await piToken.balanceOf(owner.address)).to.equal(+initialOwnerBalance + 10)
    })
  })
})

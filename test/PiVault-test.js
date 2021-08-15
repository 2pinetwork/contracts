const { createPiToken, deploy, waitFor, toNumber } = require('./helpers')

describe('PiVault', () => {
  let tomorrow
  let nextWeek
  let piToken
  let piVault

  beforeEach(async () => {
    let now = (await hre.ethers.provider.getBlock()).timestamp
    tomorrow = now + 86400
    nextWeek = now + (86400 * 7)

    piToken = await createPiToken()
    piVault = await deploy('PiVault', piToken.address, tomorrow, nextWeek)
  })

  describe('Deployment', () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await piVault.balance()).to.equal(0)
    })
  })

  describe('Deposits', () => {
    it('Should deposit', async () => {
      await piToken.approve(piVault.address, 20)
      await piVault.deposit(10)

      expect(await piVault.balance()).to.equal(10)

      // We should deposit again to test the second flow
      await piVault.deposit(5)

      expect(await piVault.balance()).to.equal(15)
    })

    it('Should deposit all', async () => {
      const ownerBalance = await piToken.balanceOf(owner.address)

      await piToken.approve(piVault.address, ownerBalance)
      await piVault.depositAll()

      expect(await piVault.balance()).to.equal(ownerBalance)
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
      expect(await piToken.balanceOf(owner.address)).to.equal(initialOwnerBalance.add(5))
    })

    it('Should withdraw all', async () => {
      const initialOwnerBalance = await piToken.balanceOf(owner.address)

      await piVault.withdrawAll()

      expect(await piVault.balance()).to.equal(0)
      expect(await piToken.balanceOf(owner.address)).to.equal(initialOwnerBalance.add(10))
    })

    it('Should not withdraw more than available', async () => {
      expect(
        piVault.withdraw(11)
      ).to.be.revertedWith("Can't withdraw more than available")
    })
  })

  describe('OnlyOwner', async () => {
    let bob
    beforeEach(async () => {
      [, bob] = await ethers.getSigners()
    })

    it('should add investors', async () => {
      await expect(
        piVault.connect(bob).addInvestor(owner.address)
      ).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })

    it('should add founders', async () => {
      await expect(
        piVault.connect(bob).addFounder(owner.address)
      ).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })
  })

  describe('Investors', async () => {
    beforeEach(async () => {
      await piToken.approve(piVault.address, 10)
      await piVault.deposit(10)
    })

    it('should be added', async () => {
      expect(await piVault.investors(owner.address)).to.be.equal(false)
      await waitFor(piVault.addInvestor(owner.address))
      expect(await piVault.investors(owner.address)).to.be.equal(true)
    })

    it('should revert on withdraw before lock time', async () => {
      await waitFor(piVault.addInvestor(owner.address))

      expect(piVault.withdraw(1)).to.be.revertedWith('Still locked')
    })
    it('should withdraw everything', async () => {
      await waitFor(piVault.addInvestor(owner.address))

      await expect(piVault.withdraw(1)).to.be.revertedWith('Still locked')

      // Set same timestamp than investor lock
      await network.provider.send('evm_setNextBlockTimestamp', [tomorrow])
      await network.provider.send('evm_mine')

      expect(await piVault.balanceOf(owner.address)).to.be.equal(10)
      await waitFor(piVault.withdraw(10))
      expect(await piVault.balanceOf(owner.address)).to.be.equal(0)
    })
  })

  describe('Founders', async () => {
    beforeEach(async () => {
      await piToken.approve(piVault.address, toNumber(2e24))
      await piVault.deposit(toNumber(1.6e24)); // Limit for 1º year is 1.57
      expect(await piVault.founders(owner.address)).to.be.equal(false)
      await waitFor(piVault.addFounder(owner.address))
    })

    it('should be added', async () => {
      expect(await piVault.founders(owner.address)).to.be.equal(true)
    })

    it('should revert on withdraw before lock time', async () => {
      await expect(piVault.withdraw(1)).to.be.revertedWith('Still locked')
    })
    it('should withdraw only first tranche', async () => {
      const foundersMaxFirstTranche = await piVault.FOUNDERS_MAX_WITHDRAWS_AFTER_FIRST_YEAR()

      await expect(piVault.withdraw(1)).to.be.revertedWith('Still locked')

      // Set same timestamp than founder lock
      await network.provider.send('evm_setNextBlockTimestamp', [tomorrow])
      await network.provider.send('evm_mine')

      const half = foundersMaxFirstTranche.div(2)

      await waitFor(piVault.withdraw(half))
      expect(await piVault.foundersLeftToWithdraw(owner.address)).to.be.equal(half)

      await waitFor(piVault.withdraw(half))
      expect(await piVault.balanceOf(owner.address)).to.be.equal(
        toNumber(0.03e24)
      )
      expect(await piVault.foundersLeftToWithdraw(owner.address)).to.be.equal(0)
      await expect(piVault.withdraw(1)).to.be.revertedWith("Can't withdraw more than expected")
    })

    it('should withdraw everything after 2 years', async () => {
      await network.provider.send('evm_setNextBlockTimestamp', [nextWeek])
      await network.provider.send('evm_mine')

      await waitFor(piVault.withdraw(toNumber(1.6e24)))
      expect(await piVault.balanceOf(owner.address)).to.be.equal(0)
    })
  })
})

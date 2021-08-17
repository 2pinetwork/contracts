const { createPiToken, deploy, waitFor, MAX_UINT } = require('./helpers')

describe('FeeManager setup', () => {
  let piToken
  let piVault

  beforeEach(async () => {
    let now = (await hre.ethers.provider.getBlock()).timestamp
    let tomorrow = now + 86400

    piToken = await createPiToken()
    piVault = await deploy('PiVault', piToken.address, tomorrow, tomorrow)
  })

  describe('Deploy', async () => {
    it('should be reverted for not piToken', async () => {
      await expect(
        deploy('FeeManager', owner.address, piVault.address, global.exchange.address)
      ).to.be.revertedWith(
        'Not PiToken vault'
      )
    })
  })
})

describe('FeeManager', () => {
  let tomorrow
  let nextWeek
  let piVault
  let piToken
  let feeMgr
  let bob

  before(async () => {
    [, bob] = await ethers.getSigners()
    piToken = global.PiToken
  })

  beforeEach(async () => {
    let now = (await hre.ethers.provider.getBlock()).timestamp
    tomorrow = now + 86400
    nextWeek = now + (86400 * 7)

    piVault = await deploy('PiVault', piToken.address, tomorrow, nextWeek)
    feeMgr = await deploy('FeeManager', owner.address, piVault.address, global.exchange.address)
  })

  describe('harvest', async () => {
    it('should be reverted for not harvest user', async () => {
      await expect(feeMgr.connect(bob).harvest(WMATIC.address, 0)).to.be.revertedWith('Only harvest role')
    })

    it('should execute harvest and send to vault', async () => {
      // This is because harvest need balance to swap
      await waitFor(WMATIC.deposit({ value: 1 }))
      await waitFor(WMATIC.transfer(feeMgr.address, 1))

      expect(await piToken.balanceOf(piVault.address)).to.be.equal(0)

      await waitFor(piToken.transfer(feeMgr.address, 100))
      await waitFor(feeMgr.harvest(WMATIC.address, 0))
      const amount = await feeMgr.VAULT_PART()

      expect(amount).to.be.above(1)
      expect(await piToken.balanceOf(piVault.address)).to.be.equal(
        amount.mul(100).div(1000)
      )
    })

    it('should do nothing without balance', async () => {
      const balance = await piToken.balanceOf(owner.address)
      await waitFor(feeMgr.harvest(WMATIC.address, 0))

      expect(await piToken.balanceOf(owner.address)).to.be.equal(balance)
    })

    it('should exchange for other token', async () => {
      // This is because harvest need balance to swap
      expect(await piToken.balanceOf(piVault.address)).to.be.equal(0)

      await waitFor(piToken.transfer(feeMgr.address, 100))
      await waitFor(feeMgr.harvest(piToken.address, 0))

      const amount = await feeMgr.VAULT_PART()

      expect(amount).to.be.above(1)
      expect(await piToken.balanceOf(piVault.address)).to.be.equal(
        amount.mul(100).div(1000)
      )
    })
  })

  describe('setTreasury', async () => {
    it('should revert for non-admin', async () => {
      await expect(feeMgr.connect(bob).setTreasury(owner.address)).to.be.revertedWith('Only Admin')
    })

    it('should change treasury', async () => {
      await expect(
        feeMgr.setTreasury(bob.address)
      ).to.emit(
        feeMgr, 'NewTreasury'
      ).withArgs(
        owner.address, bob.address
      )

      expect(await feeMgr.treasury()).to.be.equal(bob.address)
    })
  })

  describe('setExchange', async () => {
    it('should revert for non-admin', async () => {
      await expect(feeMgr.connect(bob).setExchange(bob.address)).to.be.revertedWith('Only Admin')
    })

    it('should change exchange', async () => {
      expect(await WMATIC.allowance(feeMgr.address, global.exchange.address)).to.be.equal(MAX_UINT)
      expect(await WMATIC.allowance(feeMgr.address, bob.address)).to.be.equal(0)

      await expect(
        feeMgr.setExchange(bob.address)
      ).to.emit(
        feeMgr, 'NewExchange'
      ).withArgs(
        global.exchange.address, bob.address
      )

      expect(await feeMgr.exchange()).to.be.equal(bob.address)
      expect(await WMATIC.allowance(owner.address, feeMgr.address)).to.be.equal(0)
      expect(await WMATIC.allowance(feeMgr.address, bob.address)).to.be.equal(MAX_UINT)
    })
  })
})

const { createPiToken, deploy, waitFor, zeroAddress } = require('../helpers')

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
  let WETHFeed
  let max
  let slippage
  let vaultPart

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

    let wNativeFeed = await deploy('PriceFeedMock')
    let piTokenFeed = await deploy('PriceFeedMock')
    WETHFeed = await deploy('PriceFeedMock')

    await waitFor(piToken.transfer(exchange.address, 10e18 + ''))

    // 2021-10-06 wNative-eth prices
    await Promise.all([
      waitFor(wNativeFeed.setPrice(129755407)),
      waitFor(piTokenFeed.setPrice(0.08e8)),
      waitFor(WETHFeed.setPrice(1e8)),
      waitFor(feeMgr.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(feeMgr.setPriceFeed(piToken.address, piTokenFeed.address)),
    ])

    max = await feeMgr.RATIO_PRECISION()
    slippage = max.sub(await feeMgr.swapSlippageRatio())
    vaultPart = max.sub(await feeMgr.treasuryRatio())
  })

  describe('harvest', async () => {
    it('should execute harvest and send to vault', async () => {
      // This is because harvest need balance to swap
      await waitFor(WMATIC.deposit({ value: 1e6 + '' }))
      await waitFor(WMATIC.transfer(feeMgr.address, 1e6 + ''))

      expect(await piToken.balanceOf(piVault.address)).to.be.equal(0)

      await waitFor(feeMgr.harvest(WMATIC.address))

      let swapped = vaultPart.mul(1e6).div(max).mul(129755407).div(0.08e8)
      expect(vaultPart).to.be.above(1)
      expect(await piToken.balanceOf(piVault.address)).to.be.within(
        swapped.mul(slippage).div(max), swapped
      )
    })

    it('should execute harvest and send to vault with non-wNative', async () => {
      // This is because harvest need balance to swap
      const otherW = await deploy('WETHMock')

      await waitFor(feeMgr.setPriceFeed(otherW.address, WETHFeed.address))
      await waitFor(otherW.deposit({ value: 100 }))
      await waitFor(otherW.transfer(feeMgr.address, 100))

      expect(await piToken.balanceOf(piVault.address)).to.be.equal(0)

      let swapped = ethers.BigNumber.from(100).mul(1e8).div(0.08e8)
        .mul(slippage).div(max)

      await expect(
        feeMgr.harvest(otherW.address)
      ).to.emit(
        feeMgr, 'Harvest'
      ).withArgs(otherW.address, 100, swapped)

      expect(await piToken.balanceOf(piVault.address)).to.be.within(
        swapped.mul(vaultPart).div(max).sub(1),
        swapped.mul(vaultPart).div(max).add(1)
      )
    })

    it('should do nothing without balance', async () => {
      const balance = await piToken.balanceOf(owner.address)
      await waitFor(feeMgr.harvest(WMATIC.address))

      expect(await piToken.balanceOf(owner.address)).to.be.equal(balance)
    })

    it('should execute harvest with other route and send to vault', async () => {
      const route = [WMATIC.address, BTC.address, piToken.address]
      await waitFor(feeMgr.setRoute(WMATIC.address, route))

      await waitFor(WMATIC.deposit({ value: 1e6 + '' }))
      await waitFor(WMATIC.transfer(feeMgr.address, 1e6 + ''))

      expect(await piToken.balanceOf(piVault.address)).to.be.equal(0)

      await waitFor(feeMgr.harvest(WMATIC.address))

      let swapped = vaultPart.mul(1e6).div(max).mul(129755407).div(0.08e8)
      expect(vaultPart).to.be.above(1)
      expect(await piToken.balanceOf(piVault.address)).to.be.within(
        swapped.mul(slippage).div(max), swapped
      )
    })

    it('should execute harvest with greater treasury part', async () => {
      await expect(feeMgr.setTreasuryRatio(5000)).to.emit(
        feeMgr, 'NewTreasuryRatio'
      ).withArgs(150, 5000)

      await waitFor(WMATIC.deposit({ value: 1e6 + '' }))
      await waitFor(WMATIC.transfer(feeMgr.address, 1e6 + ''))

      expect(await piToken.balanceOf(piVault.address)).to.be.equal(0)

      const balance = await piToken.balanceOf(owner.address)

      await waitFor(feeMgr.harvest(WMATIC.address))

      const swapped = ethers.BigNumber.from(5000).mul(1e6).div(max).mul(129755407).div(0.08e8)

      expect(await piToken.balanceOf(piVault.address)).to.be.within(
        swapped.mul(slippage).div(max), swapped
      )
      expect(await piToken.balanceOf(owner.address)).to.be.within(
        balance.add(swapped.mul(slippage).div(max)),
        balance.add(swapped)
      )
    })
  })

  describe('setTreasury', async () => {
    it('should revert for non-admin', async () => {
      await expect(feeMgr.connect(bob).setTreasury(owner.address)).to.be.revertedWith('Not an admin')
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
      await expect(feeMgr.connect(bob).setExchange(bob.address)).to.be.revertedWith('Not an admin')
    })

    it('should change exchange', async () => {
      await expect(
        feeMgr.setExchange(bob.address)
      ).to.emit(
        feeMgr, 'NewExchange'
      ).withArgs(
        global.exchange.address, bob.address
      )

      expect(await feeMgr.exchange()).to.be.equal(bob.address)
    })
  })

  describe('setRoute', async () => {
    it('should be reverted for non admin', async () => {
      await expect(
        feeMgr.connect(bob).setRoute(WMATIC.address, [])
      ).to.be.revertedWith('Not an admin')
    })
    it('should be reverted for zero address token', async () => {
      await expect(
        feeMgr.setRoute(zeroAddress, [])
      ).to.be.revertedWith('!ZeroAddress')
    })
    it('should be reverted for invalid route', async () => {
      await expect(
        feeMgr.setRoute(WMATIC.address, [WMATIC.address])
      ).to.be.revertedWith('Invalid route')
    })
    it('should be reverted for zero address route', async () => {
      await expect(
        feeMgr.setRoute(
          WMATIC.address, [WMATIC.address, zeroAddress, piToken.address]
        )
      ).to.be.revertedWith('Route with ZeroAddress')
    })

    it('should set route', async () => {
      const route = [WMATIC.address, BTC.address, piToken.address]
      await waitFor(feeMgr.setRoute(WMATIC.address, route))

      expect(await feeMgr.routes(WMATIC.address, 0)).to.be.equal(route[0])
      expect(await feeMgr.routes(WMATIC.address, 1)).to.be.equal(route[1])
      expect(await feeMgr.routes(WMATIC.address, 2)).to.be.equal(route[2])
    })
  })
})

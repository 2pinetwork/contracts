const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress, createController,
  MAX_UINT
} = require('../helpers')

const { setWbtcBalanceFor, setWethBalanceFor, createPiTokenExchangePair } = require('./helpers')

describe('ArchimedesAPI setup', () => {
  let ArchimedesAPI

  before(async () => {
    ArchimedesAPI = await ethers.getContractFactory('ArchimedesAPI')
  })

  it('should revert for 0 address piToken', async () => {
    await expect(ArchimedesAPI.deploy(
      zeroAddress, 1, owner.address
    )).to.be.revertedWith(
      "Pi address can't be zero address"
    )
  })

  it('should revert for old block number', async () => {
    await expect(ArchimedesAPI.deploy(
      PiToken.address, 0, owner.address
    )).to.be.revertedWith(
      'StartBlock should be in the future'
    )
  })

  it('should revert for 0 address handler', async () => {
    await expect(ArchimedesAPI.deploy(
      PiToken.address, 1e9, zeroAddress
    )).to.be.revertedWith(
      "Handler can't be zero address"
    )
  })
})


describe('ArchimedesAPI', () => {
  let bob, alice
  let piToken
  let archimedes
  let controller
  let rewardsBlock
  let refMgr

  const balanceEqualTo = async (token, walletOrContract, bal) => {
    const exp = (bal.toFixed && bal.toFixed()) || bal
    expect(await token.balanceOf(walletOrContract.address)).to.be.equal(exp)
  }

  before(async () => {
    [, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = global.PiToken
    rewardsBlock = (await getBlock()) + 30

    archimedes = await deploy(
      'ArchimedesAPI',
      piToken.address,
      rewardsBlock,
      owner.address // depositor contract
    )

    refMgr = await deploy('Referral', archimedes.address)

    await waitFor(archimedes.setReferralAddress(refMgr.address))
    await waitFor(piToken.addMinter(archimedes.address))
    await waitFor(piToken.setApiMintPerBlock(0.09691e18 + ''))

    expect(await archimedes.piToken()).to.equal(piToken.address)
    expect(await archimedes.poolLength()).to.equal(0)

    controller = await createController(WMATIC, archimedes)

    await archimedes.addNewPool(WMATIC.address, controller.address, 1, true)
    expect(await archimedes.poolLength()).to.be.equal(1)

    await waitFor(archimedes.setExchange(exchange.address))
    await waitFor(archimedes.setRoute(0, [piToken.address, WMATIC.address]))

    let strat = await ethers.getContractAt(
      'ControllerAaveStrat',
      (await controller.strategy())
    )

    let wNativeFeed = await ethers.getContractAt('IChainLink', '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0')
    let WETHFeed = await ethers.getContractAt('IChainLink', '0xF9680D99D6C9589e2a93a78A04A279e509205945')
    let piTokenFeed = await deploy('PriceFeedMock') // faked at the moment

    // 2021-10-05 wANative-eth prices
    // ETH => 345716900000
    await Promise.all([
      waitFor(piTokenFeed.setPrice(0.08e8)),
      waitFor(archimedes.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(archimedes.setPriceFeed(WETH.address, WETHFeed.address)),
      waitFor(archimedes.setPriceFeed(piToken.address, piTokenFeed.address)),
      waitFor(strat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(WETH.address, WETHFeed.address)),
    ])
  })

  describe('setExchange', async () => {
    it('should be reverted for non admin', async () => {
      await expect(archimedes.connect(bob).setExchange(zeroAddress)).to.be.revertedWith(
        'Not an admin'
      )
    })

    it('should be reverted for 0 address', async () => {
      await expect(archimedes.setExchange(zeroAddress)).to.be.revertedWith(
        "Can't be 0 address"
      )
    })
  })

  describe('setHandler', async () => {
    it('should revert for 0 address', async () => {
      await expect(archimedes.setHandler(zeroAddress)).to.be.revertedWith(
        "Can't be 0 address"
      )
    })
    it('should revert for non admin', async () => {
      await expect(archimedes.connect(bob).setHandler(bob.address)).to.be.revertedWith(
        'Not an admin'
      )
    })
    it('should change handler', async () => {
      expect(await archimedes.handler()).to.be.equal(owner.address)
      await waitFor(archimedes.setHandler(bob.address))
      expect(await archimedes.handler()).to.be.equal(bob.address)
    })
  })

  describe('addNewPool', async () => {
    it('Should reverse with zero address want', async () => {
      expect(
        archimedes.addNewPool(zeroAddress, controller.address, 1, false)
      ).to.be.revertedWith('Address zero not allowed')
    })

    it('Should reverse with non-farm controller', async () => {
      const otherFarm = await deploy(
        'ArchimedesAPI',
        piToken.address,
        rewardsBlock,
        owner.address
      )

      const otherCtroller = await createController(piToken, otherFarm)

      expect(
        archimedes.addNewPool(piToken.address, otherCtroller.address, 1, false)
      ).to.be.revertedWith('Not a farm controller')
    })

    it('Should reverse for controller without strategy', async () => {
      const otherCtroller = await deploy(
        'Controller',
        piToken.address,
        archimedes.address,
        owner.address
      )

      expect(
        archimedes.addNewPool(piToken.address, otherCtroller.address, 1, false)
      ).to.be.revertedWith('Controller without strategy')
    })
  })

  describe('changePoolWeighing', async () => {
    it('Should update totalWeighing', async () => {
      expect(await archimedes.totalWeighing()).to.be.equal(1)

      await waitFor(archimedes.changePoolWeighing(0, 5, true))

      expect(await archimedes.totalWeighing()).to.be.equal(5)

      await waitFor(archimedes.changePoolWeighing(0, 0, false))

      expect(await archimedes.totalWeighing()).to.be.equal(0)
    })
  })

  describe('FullFlow', async () => {
    it.only('with 2 accounts && just 1 referral', async () => {
      await waitFor(piToken.initRewardsOn(rewardsBlock))

      const pair = await createPiTokenExchangePair()

      let bobPiPaid = ethers.BigNumber.from(0)
      let referralPaid = 0
      let exchBalance = new BigNumber(
        (await piToken.balanceOf(pair)).toString()
      )

      // Needed for exchange
      await setWethBalanceFor(exchange.address, '' + 100e18)
      await setWethBalanceFor(owner.address, '' + 1e18)

      // Deposit without rewards yet
      await waitFor(WETH.connect(owner).approve(archimedes.address, MAX_UINT))
      await balanceEqualTo(piToken, { address: pair }, exchBalance)
console.log(210)
      await (await archimedes.deposit(0, bob.address, 10, alice.address)).wait()
console.log(212)
      expect(await refMgr.referrers(bob.address)).to.be.equal(alice.address)
      expect(await refMgr.referralsCount(alice.address)).to.be.equal(1)
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(0)
      expect(await refMgr.totalPaid()).to.be.equal(0)
      console.log(219)
      await balanceEqualTo(piToken, { address: pair }, exchBalance)
      await balanceEqualTo(WETH, archimedes, 0)

      // Reward block is in the past
      const currentBlock = parseInt(await getBlock(), 10)
      if (currentBlock < rewardsBlock) {
        await mineNTimes(rewardsBlock - currentBlock)
      }
console.log(228)

      // This should mint a reward of 0.23~ for the first block
      await waitFor(archimedes.updatePool(0))

      const piPerBlock = await archimedes.piTokenPerBlock()

      await balanceEqualTo(piToken, archimedes, piPerBlock)
      await balanceEqualTo(piToken, { address: pair }, exchBalance)

      let bobBalance = ethers.BigNumber.from(10)

      // Ref transfer
      await balanceEqualTo(WETH, alice, 0)
      // This will harvest the previous updated pool + one new
      // because each modifying call mine a new block
      console.log(1)
      await waitFor(archimedes.harvest(0, bob.address)) // rewardBlock + 2

      // 2 blocks for bob + 2 blocks for referral alice
      // Referral receive 1% per reward
      bobPiPaid = bobPiPaid.add((piPerBlock * 2).toFixed())
      referralPaid = (new BigNumber(piPerBlock * 0.02)).toFixed()  // 1% for 2 block referral
      exchBalance = exchBalance.plus(piPerBlock * 2).plus(referralPaid)

      // All the rewards claimed and swapped
      await balanceEqualTo(piToken, archimedes, 0)
      await balanceEqualTo(piToken, bob, 0)
      await balanceEqualTo(piToken, { address: pair }, exchBalance)
      // Get swapped-shares

      // 2 blocks
      const swappedPi = piPerBlock.mul(2)

      // PiToken / WETH => 942000 / 100
      const swappedWant = swappedPi.mul(100).div(942000)

      const slippageRatio = await archimedes.swapSlippageRatio()
      const slippagePrecision = await archimedes.RATIO_PRECISION()
      const slippage = slippagePrecision.sub(slippageRatio)

      expect(await controller.balanceOf(bob.address)).to.be.within(
        bobBalance.add(swappedWant).mul(slippage).div(slippagePrecision),
        bobBalance.add(swappedWant)
      )

      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)
      // 1% of already minted
      const refSwappedPi = swappedPi.mul(
        await archimedes.referralCommissionRate()
      ).div(
        await archimedes.COMMISSION_RATE_PRECISION()
      )

      // PiToken / WETH => 942000 / 100
      const refSwappedWant = refSwappedPi.mul(100).div(942000)

      // Rewards are swapped and transferred to the wallet
      await balanceEqualTo(piToken, alice, 0)
      expect(await WETH.balanceOf(alice.address)).to.be.within(
        refSwappedWant.mul(slippage).div(slippagePrecision),
        refSwappedWant
      )

      let aliceBalance = await controller.balanceOf(alice.address)

      console.log(2)
      // Work with Alice
      await waitFor(archimedes.deposit(0, alice.address, 9, zeroAddress))
      // The pricePerShare > 1 gives less shares on deposit
      aliceBalance = aliceBalance.add(8)

      await balanceEqualTo(piToken, archimedes, piPerBlock)
      await balanceEqualTo(piToken, alice, 0)
      await balanceEqualTo(controller, alice, aliceBalance)
      await balanceEqualTo(piToken, { address: pair }, exchBalance)

      // Should not give to owner the referral when alice already deposited without one
      // deposit method claim the pending rewards, so the last rewards block
      // are half for the alice and the other half for bob (2º call)

      const swapRatio = 100 / 942000

      let nextReward = (
        piPerBlock
        * (await controller.balanceOf(alice.address))
        / (await controller.totalSupply())
      )

      // The pricePerShare > 1 gives less shares on deposit
      // This is because 9 becomes 8, which makes 8 + 4 (reward), which again turns 11
      const truncationOffset = 2
      aliceBalance = aliceBalance.add(
        (9 + (nextReward * swapRatio) - truncationOffset).toFixed()
      )

      exchBalance = exchBalance.plus('' + nextReward.toFixed())

      console.log(3)
      await waitFor(archimedes.deposit(0, alice.address, 9, owner.address))

      expect(await WETH.balanceOf(alice.address)).to.be.within(
        refSwappedWant.mul(slippage).div(slippagePrecision),
        refSwappedWant
      )
      await balanceEqualTo(controller, alice, aliceBalance)
      await balanceEqualTo(piToken, { address: pair }, exchBalance)
      expect(await piToken.balanceOf(archimedes.address)).to.be.within(
        piPerBlock.mul(2).mul(slippage).div(slippagePrecision),
        piPerBlock.mul(2)
      )

      expect(await refMgr.referrers(owner.address)).to.be.equal(zeroAddress)

      let aliceRewards = new BigNumber(nextReward)

      nextReward = (
        piPerBlock
        * (await controller.balanceOf(alice.address))
        / (await controller.totalSupply())
      )


      // Same use of truncation offset, two times 1 share each
      aliceBalance = aliceBalance.add((nextReward * swapRatio - truncationOffset).toFixed())
      aliceRewards = aliceRewards.plus(nextReward)
      exchBalance = exchBalance.plus('' + nextReward.toFixed())

      await waitFor(archimedes.harvest(0, alice.address))
      await balanceEqualTo(piToken, alice, 0)
      await balanceEqualTo(piToken, { address: pair }, exchBalance)
      await balanceEqualTo(controller, alice, aliceBalance)

      // Just to be sure that the referral is not paid
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)

      aliceRewards = aliceRewards.plus(
        piPerBlock
        * (await controller.balanceOf(alice.address))
        / (await controller.totalSupply())
      )

      exchBalance = exchBalance.plus(
        toNumber(piPerBlock * 4) // 4 blocks + 1% each
      ).minus(aliceRewards)

      // bobBalance = bobBalance.add(2)

      // REVISAR ESTO PORQUE EL piPerBlock son 4 bloques pero no es el100%
      // para bob...
      bobPiPaid = bobPiPaid.add(ethers.BigNumber.from((piPerBlock * 4).toFixed()))
      bobBalance = bobBalance.add(bobPiPaid.mul(100).div(942000))
      await waitFor(archimedes.harvest(0, bob.address))

      await balanceEqualTo(piToken, bob, 0)
      expect(await controller.balanceOf(bob.address)).to.be.within(
        toNumber(bobBalance.mul(slippage).div(slippagePrecision)),
        toNumber(bobBalance)
      )

      // Because of the round it's not exactly
      // 4 blocks + 1% each
      expect(
        await piToken.balanceOf(pair)
      ).within(
        ethers.BigNumber.from(exchBalance.toFixed(0)).add(
          new BigNumber(toNumber(piPerBlock * 0.02)).toFixed(0)
        ),
        ethers.BigNumber.from(exchBalance.toFixed(0)).add(
          new BigNumber(toNumber(piPerBlock * 0.04)).toFixed(0)
        )
      )

      exchBalance = new BigNumber(
        await piToken.balanceOf(exchange.address)
      )

      await balanceEqualTo(piToken, alice, 0)
      // swap for ref reward
      expect(await WETH.balanceOf(alice.address)).to.be.within(
        refSwappedWant.mul(3).mul(slippage).div(slippagePrecision),
        refSwappedWant.mul(3)
      )

      referralPaid = (new BigNumber(referralPaid)).plus(toNumber(piPerBlock * 0.03))

      // Just to be sure that the referral is not paid
      // Round ....
      expect(await refMgr.referralsPaid(alice.address)).to.be.within(
        referralPaid.toFixed(),
        referralPaid.plus(toNumber(piPerBlock * 0.01)).toFixed()
      )
      expect(await refMgr.totalPaid()).to.be.within(
        referralPaid.toFixed(),
        referralPaid.plus(toNumber(piPerBlock * 0.01)).toFixed()
      )

      // just call the fn to get it covered
      await (await archimedes.massUpdatePools()).wait()

      // withdraw everything
      await waitFor(archimedes.harvest(0, bob.address))

      let prevBalance = await WETH.balanceOf(bob.address)

      await waitFor(archimedes.withdraw(0, bob.address, 5))

      // 1 swap + 5 shares
      prevBalance = prevBalance.add(piPerBlock.mul(100).div(942000).add(5))
      expect(await WETH.balanceOf(bob.address)).to.be.within(
        prevBalance.mul(slippage).div(slippagePrecision),
        prevBalance
      )

      // now bob has only 5 shares and alice 20
      const shares = await controller.balanceOf(bob.address)
      await waitFor(archimedes.withdraw(0, bob.address, shares))

      // 1 swap + 8 shares
      prevBalance = prevBalance.add(piPerBlock.mul(100).div(942000).add(shares))
      expect(await WETH.balanceOf(bob.address)).to.be.within(
        prevBalance.mul(slippage).div(slippagePrecision),
        prevBalance
      )
      await balanceEqualTo(controller, bob, 0)

      // Emergency withdraw without harvest
      aliceBalance = await WETH.balanceOf(alice.address)
      const deposited = await controller.balanceOf(alice.address)
      // shares to Matic conversion is not _direct_ and has some rounding errors
      const offset = 1

      await waitFor(archimedes.emergencyWithdraw(0, alice.address))
      await balanceEqualTo(
        WETH, alice, toNumber(aliceBalance.toNumber() + deposited.toNumber() + offset)
      )
    })
  })

  describe('withdraw', async () => {
    it('Should revert with 0 shares', async () => {
      expect(archimedes.withdraw(0, alice.address, 0)).to.be.revertedWith('0 shares')
    })

    it('Should revert without shares', async () => {
      expect(archimedes.withdraw(0, alice.address, 10)).to.be.revertedWith('withdraw: not sufficient found')
    })
  })

  describe('getPricePerFullShare', async () => {
    it('Should get 1e18 for 0 shares', async () => {
      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))
    })

    it('Should get updated value after deposit', async () => {
      // Setup deposit
      await waitFor(WMATIC.connect(owner).deposit({ value: 100 }))
      await waitFor(WMATIC.connect(owner).approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, owner.address, 10, zeroAddress))

      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))

      await waitFor(archimedes.deposit(0, owner.address, 10, zeroAddress))

      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))

      // simulate yield 30 /20 => 15
      await waitFor(WMATIC.connect(owner).transfer(controller.address, 10))
      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1.5e18))
    })
  })

  describe('decimals', async () => {
    it('Should be controller decimals', async () => {
      expect(await archimedes.decimals(0)).to.be.equal(18)
      expect(await controller.decimals()).to.be.equal(18)
    })
  })

  describe('balance & balanceOf', async () => {
    it('Should get 0 for 0 shares', async () => {
      expect(await archimedes.balance(0)).to.be.equal(0)
      expect(await archimedes.balanceOf(0, owner.address)).to.be.equal(0)
    })
    it('Should get 1 for 1 shares', async () => {
      await waitFor(WMATIC.connect(owner).deposit({ value: 100 }))
      await waitFor(WMATIC.connect(owner).approve(archimedes.address, 100))
      await waitFor(archimedes.deposit(0, owner.address, 1, zeroAddress))

      expect(await archimedes.balance(0)).to.be.equal(1)
      expect(await archimedes.balanceOf(0, owner.address)).to.be.equal(1)
    })
  })

  describe('deposit', async () => {
    it('should revert with 0 amount', async () => {
      await expect(
        archimedes.deposit(0, owner.address, 0, zeroAddress)
      ).to.be.revertedWith('Insufficient deposit')
    })
  })

  describe('setReferralCommissionRate', async () => {
    it('should revert from not admin change', async () => {
      expect(await archimedes.referralCommissionRate()).to.be.equal(10) // 1%

      await expect(
        archimedes.connect(bob).setReferralCommissionRate(20)
      ).to.be.revertedWith(
        'Not an admin'
      )

      expect(await archimedes.referralCommissionRate()).to.be.equal(10) // 1%
    })
    it('should change rate from 1 to 2', async () => {
      expect(await archimedes.referralCommissionRate()).to.be.equal(10) // 1%

      await waitFor(archimedes.setReferralCommissionRate(20))

      expect(await archimedes.referralCommissionRate()).to.be.equal(20) // 2%
    })

    it('should revert for maximum referral rate', async () => {
      const max = (await archimedes.MAXIMUM_REFERRAL_COMMISSION_RATE()) + 1

      await expect(archimedes.setReferralCommissionRate(max)).to.be.revertedWith(
        'setReferralCommissionRate: invalid referral commission rate basis points'
      )
    })
  })

  describe('Token decimals', async () => {
    it('Should have the same decimals than want', async () => {
      // We use BTC since it has 8 decimals
      const token = global.BTC
      const ctroller = await createController(token, archimedes)

      await setWbtcBalanceFor(owner.address, '10')

      await waitFor(archimedes.addNewPool(token.address, ctroller.address, 1, false))

      expect(await archimedes.decimals(1)).to.be.equal(8)
      expect(await archimedes.getPricePerFullShare(1)).to.be.equal(1e8)

      await waitFor(token.approve(archimedes.address, '' + 1e18))
      await waitFor(archimedes.deposit(1, owner.address, 100, zeroAddress))

      const price = await archimedes.getPricePerFullShare(1)
      expect(price).to.be.equal(1e8)

      expect(price * 100).to.be.equal(100e8)

      await waitFor(token.transfer(ctroller.address, 10))

      expect(
        await archimedes.getPricePerFullShare(1)
      ).to.be.equal(1.1e8)
    })
  })

  describe('setRoute', async () => {
    it('should be reverted for non piToken first token', async () => {
      await expect(archimedes.setRoute(0, [WMATIC.address, WMATIC.address])).to.be.revertedWith(
        'First token is not PiToken'
      )
    })
    it('should be reverted for non want last token', async () => {
      await expect(archimedes.setRoute(0, [piToken.address, piToken.address])).to.be.revertedWith(
        'Last token is not want'
      )
    })
  })

  describe('emergencyWithdraw', async () => {
    it('should be reverted for not auth user', async () => {
      await expect(archimedes.connect(bob).emergencyWithdraw(0, alice.address)).to.be.revertedWith(
        'Not authorized'
      )
    })
  })
})

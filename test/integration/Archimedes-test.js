const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress, createController
} = require('../helpers')

const {
  createPiTokenExchangePair,
  resetHardhat,
  setWethBalanceFor,
  setWbtcBalanceFor
} = require('./helpers')

describe('Archimedes setup', () => {
  let Archimedes

  before(async () => {
    Archimedes = await ethers.getContractFactory('Archimedes')
  })

  it('should revert of 0 address piToken', async () => {
    await expect(Archimedes.deploy(zeroAddress, 1, WMATIC.address)).to.be.revertedWith(
      'Pi address !ZeroAddress'
    )
  })

  it('should revert for old block number', async () => {
    await expect(Archimedes.deploy(PiToken.address, 0, WMATIC.address)).to.be.revertedWith(
      'StartBlock should be in the future'
    )
  })
})


describe('Archimedes', () => {
  let bob, alice
  let piToken
  let archimedes
  let controller
  let rewardsBlock
  let refMgr

  before(async () => {
    await resetHardhat();

    [, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    piToken = await createPiToken()
    rewardsBlock = (await getBlock()) + 30

    archimedes = await deploy(
      'Archimedes',
      piToken.address,
      rewardsBlock,
      WMATIC.address
    )

    refMgr = await deploy('Referral', archimedes.address)

    await waitFor(archimedes.setReferralAddress(refMgr.address))
    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(archimedes.address))
    await waitFor(piToken.setCommunityMintPerBlock(0.19383e18 + ''))
    await waitFor(piToken.setApiMintPerBlock(0.09691e18 + ''))

    expect(await archimedes.piToken()).to.equal(piToken.address)
    expect(await archimedes.poolLength()).to.equal(0)

    controller = await createController(global.WETH, archimedes)

    await archimedes.addNewPool(global.WETH.address, controller.address, 1, false)
    expect(await archimedes.poolLength()).to.be.equal(1)

    let strat = await ethers.getContractAt(
      'ControllerAaveStrat',
      (await controller.strategy())
    )

    let wNativeFeed = await ethers.getContractAt('IChainLink', '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0')
    let ethFeed = await ethers.getContractAt('IChainLink', '0xF9680D99D6C9589e2a93a78A04A279e509205945')

    // 2021-10-06 wNative-eth prices
    await Promise.all([
      waitFor(strat.setPriceFeed(WMATIC.address, wNativeFeed.address)),
      waitFor(strat.setPriceFeed(WETH.address, ethFeed.address)),
    ])
  })

  describe('addNewPool', async () => {
    it('Should reverse with zero address want', async () => {
      expect(
        archimedes.addNewPool(zeroAddress, controller.address, 1, false)
      ).to.be.revertedWith('Address zero not allowed')
    })

    it('Should reverse with non-farm controller', async () => {
      const otherFarm = await deploy(
        'Archimedes',
        piToken.address,
        rewardsBlock,
        WMATIC.address
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
        owner.address,
        '2pi-2Pi'
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

  describe('pendingPiToken', async () => {
    it('should return 0 for future block', async () => {
      expect(await archimedes.startBlock()).to.be.above(await getBlock())
      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)
    })

    it('should return 0 for unknown user', async () => {
      mineNTimes((await archimedes.startBlock()) - (await getBlock()))

      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)
    })
  })

  describe('deposit', async () => {
    it('should work with LP', async () => {
      const pair = await hre.ethers.getContractAt(
        '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata',
        await createPiTokenExchangePair()
      )

      const ctroller = await createController(pair, archimedes, 'ControllerLPWithoutStrat')
      expect(await ctroller.name()).to.be.equal('2pi-SLP-2Pi-WMATIC')
      await waitFor(archimedes.addNewPool(pair.address, ctroller.address, 1, false))

      const pid = await ctroller.pid()

      await waitFor(pair.approve(archimedes.address, 100))
      await expect(archimedes.deposit(pid, 100, zeroAddress)).to.emit(
        archimedes, 'Deposit'
      ).withArgs(pid, owner.address, 100)
    })
  })

  describe('FullFlow', async () => {
    it('Full flow with 2 accounts && just 1 referral', async () => {
      const token = global.WETH
      let referralPaid = 0

      await setWethBalanceFor(bob.address, '10')

      // Deposit without rewards yet
      await token.connect(bob).approve(archimedes.address, 10)
      await (await archimedes.connect(bob).deposit(0, 10, alice.address)).wait()
      expect(await refMgr.referrers(bob.address)).to.be.equal(alice.address)
      expect(await refMgr.referralsCount(alice.address)).to.be.equal(1)
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(0)
      expect(await refMgr.totalPaid()).to.be.equal(0)

      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(0)

      // Still behind the reward block
      const rewardBlock = parseInt(await archimedes.startBlock(), 10)
      const currentBlock = parseInt(await getBlock(), 10)
      expect(rewardBlock).to.be.greaterThan(currentBlock)
      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)

      await mineNTimes(rewardBlock - currentBlock)

      // This should mint a reward of 0.23~ for the first block
      await (await archimedes.updatePool(0)).wait()

      const piPerBlock = toNumber(await archimedes.piTokenPerBlock())

      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        toNumber(piPerBlock)
      )

      // This will harvest the previous updated pool + one new
      // because each modifying call mine a new block
      await waitFor(archimedes.connect(bob).harvest(0)) // rewardBlock + 2

      let bobBalance = (new BigNumber(piPerBlock * 2)).toFixed()
      // All the rewards claimed
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(0)
      expect(
        await piToken.balanceOf(bob.address)
      ).to.be.equal(bobBalance)

      await setWethBalanceFor(alice.address, '10')

      // Referral receive 1% per reward
      let alicePiBalance = (new BigNumber(piPerBlock * 0.02)).toFixed()  // 1% for 2 block referal
      let aliceTokenBalance = await token.balanceOf(alice.address)
      referralPaid = alicePiBalance // same here
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)
      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(alicePiBalance)
      expect(
        await archimedes.connect(bob).pendingPiToken(0, bob.address)
      ).to.be.equal(0)

      // Work with Alice
      await waitFor(token.connect(alice).approve(archimedes.address, 20))
      await waitFor(archimedes.connect(alice).deposit(0, 10, zeroAddress))
      aliceTokenBalance = aliceTokenBalance.sub(10)
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        toNumber(piPerBlock * 2) // 2 calls mean 2 reward blocks
      )
      expect(
        await token.balanceOf(alice.address)
      ).to.be.equal(
        aliceTokenBalance
      )

      // Should not give to owner the referral when alice already deposited without one
      // deposit method claim the pending rewards so the last rewards block
      // are half for the alice and the other half for bob (3º call)
      await waitFor(archimedes.connect(alice).deposit(0, 10, owner.address))

      aliceTokenBalance = aliceTokenBalance.sub(10)
      alicePiBalance = (new BigNumber(alicePiBalance)).plus(
        piPerBlock / 2 // 50% of 1 block per 1º deposit
      ).toFixed()

      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        toNumber(piPerBlock * 2.5) //  appr + dep + 50% of 1º block for bob
      )
      expect(await refMgr.referrers(owner.address)).to.be.equal(zeroAddress)
      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(
        alicePiBalance
      )
      expect(
        await token.balanceOf(alice.address)
      ).to.be.equal(
        aliceTokenBalance
      )

      await waitFor(archimedes.connect(alice).harvest(0))

      // last reward block is divided in 3 (20 shares for Alice and 10 shares for Bob
      alicePiBalance = (
        new BigNumber(alicePiBalance)
      ).plus(
        new BigNumber((piPerBlock / 3) * 2) // 33.3% of 1 block per 2º deposit
      ).toFixed()

      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(alicePiBalance)
      // Just to be sure that the referal is not paid
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)

      // 2 blocks solo + 1 block 50% + 1 block 66.6%
      bobBalance = (new BigNumber(bobBalance)).plus(
        piPerBlock * (2 + 0.5 + 2 / 3)
      ).toFixed()
      await waitFor(archimedes.connect(bob).harvest(0))
      expect(
        await piToken.balanceOf(bob.address)
      ).to.be.equal(bobBalance)

      // Referral
      alicePiBalance = (new BigNumber(alicePiBalance)).plus(
        (piPerBlock * (2 + 0.5 + 2 / 3)) * 0.01 // 1% of bob harvest
      ).toFixed()
      referralPaid = (new BigNumber(referralPaid)).plus(
        (piPerBlock * (2 + 0.5 + 2 / 3)) * 0.01 // 1% of bob harvest
      ).toFixed()
      expect(
        await piToken.balanceOf(alice.address)
      ).to.be.equal(alicePiBalance)
      // Just to be sure that the referal is not paid
      expect(await refMgr.referralsPaid(alice.address)).to.be.equal(referralPaid)
      expect(await refMgr.totalPaid()).to.be.equal(referralPaid)

      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)
      // just call the fn to get it covered
      await (await archimedes.massUpdatePools()).wait()

      // withdraw everything
      await waitFor(archimedes.connect(bob).harvest(0))

      let prevBobPiBalance = new BigNumber(parseInt(await piToken.balanceOf(bob.address), 10))
      let bobTokenBalance = await token.balanceOf(bob.address)

      await waitFor(archimedes.connect(bob).withdraw(0, 5))

      prevBobPiBalance = prevBobPiBalance.plus(piPerBlock / 3)
      bobTokenBalance = bobTokenBalance.add(5)
      expect(
        await piToken.balanceOf(bob.address)
      ).to.be.equal(
        prevBobPiBalance.toFixed()
      )
      expect(
        await token.balanceOf(bob.address)
      ).to.be.equal(
        bobTokenBalance
      )

      // now bob has only 5 shares and alice 20
      await waitFor(archimedes.connect(bob).withdrawAll(0))

      prevBobPiBalance = prevBobPiBalance.plus(piPerBlock / 5)
      bobTokenBalance = bobTokenBalance.add(5)
      expect(
        await piToken.balanceOf(bob.address)
      ).to.be.equal(
        prevBobPiBalance.toFixed()
      )
      expect(
        await token.balanceOf(bob.address)
      ).to.be.equal(
        bobTokenBalance
      )

      // Emergency withdraw without harvest
      let aliceBalance = parseInt(await token.balanceOf(alice.address), 10)
      const deposited = parseInt(await controller.balanceOf(alice.address), 10)

      await waitFor(archimedes.connect(alice).emergencyWithdraw(0))

      expect(await token.balanceOf(alice.address)).to.be.equal(
        toNumber(aliceBalance + deposited)
      )
    })
  })

  describe('depositNative', async () => {
    let wmaticCtroller

    beforeEach(async () => {
      // piToken pid = 0
      // WMATIC  pid = 1
      wmaticCtroller = await createController(WMATIC, archimedes)
      await waitFor(archimedes.addNewPool(WMATIC.address, wmaticCtroller.address, 1, true))
    })

    it('should revert for depositAll', async () => {
      await expect(
        archimedes.depositAll(1, zeroAddress)
      ).to.be.revertedWith("Can't deposit all Native")
    })

    it('Should revert with 0 amount', async () => {
      await expect(
        archimedes.depositNative(1, zeroAddress, { value: 0 })
      ).to.be.revertedWith('Insufficient deposit')
    })

    it('Should revert for not wnative pool', async () => {
      await expect(
        archimedes.depositNative(0, zeroAddress, { value: 10 })
      ).to.be.revertedWith('Only Native pool')
    })

    it('Should get wnative shares and then withdraw', async () => {
      // initial accounts balance  less a few gas fees
      const balance = new BigNumber(
        (await ethers.provider.getBalance(owner.address)) / 1e18
      )

      await waitFor(archimedes.depositNative(1, zeroAddress, { value: toNumber(1e18) }))
      expect(await wmaticCtroller.balanceOf(owner.address)).to.be.equal(toNumber(1e18))

      // This is because eth is the main token and every transaction has fees
      let currentBalance = Math.floor(
        (await ethers.provider.getBalance(owner.address)) / 1e18
      )

      // original balance less 1 MATIC
      expect(currentBalance).to.be.equal(
        Math.floor(balance.minus(1).toNumber())
      )

      await waitFor(archimedes.withdraw(1, toNumber(1e18)))

      expect(await wmaticCtroller.balanceOf(owner.address)).to.be.equal(0)

      currentBalance = Math.floor(
        (await ethers.provider.getBalance(owner.address)) / 1e18
      )

      // original value
      expect(currentBalance).to.be.equal(
        Math.floor(balance.toNumber())
      )
    })
  })

  describe('withdraw', async () => {
    it('Should revert with 0 shares', async () => {
      expect(archimedes.withdraw(0, 0)).to.be.revertedWith('0 shares')
    })

    it('Should revert without shares', async () => {
      expect(archimedes.withdraw(0, 10)).to.be.revertedWith('withdraw: not sufficient found')
    })
  })

  describe('getPricePerFullShare', async () => {
    it('Should get 1e18 for 0 shares', async () => {
      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))
    })

    it('Should get updated value after deposit', async () => {
      const token = global.WETH
      // Setup deposit
      await setWethBalanceFor(bob.address, '10')
      await token.connect(bob).approve(archimedes.address, 100)
      await waitFor(archimedes.connect(bob).deposit(0, 10, zeroAddress))

      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))

      await waitFor(archimedes.connect(bob).deposit(0, 10, zeroAddress))

      expect(await archimedes.getPricePerFullShare(0)).to.be.equal(toNumber(1e18))

      // simulate yield 30 /20 => 15
      await waitFor(token.connect(bob).transfer(controller.address, 10))
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
      const token = global.WETH

      await setWethBalanceFor(bob.address, '10')

      await token.connect(bob).approve(archimedes.address, 100)
      await waitFor(archimedes.connect(bob).deposit(0, 1, zeroAddress))

      expect(await archimedes.balance(0)).to.be.equal(1)
      expect(await archimedes.balanceOf(0, bob.address)).to.be.equal(1)
    })
  })

  describe('deposit', async () => {
    it('should revert with 0 amount', async () => {
      await expect(
        archimedes.deposit(0, 0, zeroAddress)
      ).to.be.revertedWith('Insufficient deposit')
    })

    it('should deposit all balance', async () => {
      const token = global.WETH

      await setWethBalanceFor(alice.address, '10')

      await waitFor(token.connect(alice).transfer(owner.address, 1000))
      await waitFor(token.approve(archimedes.address, 1000))

      await waitFor(archimedes.depositAll(0, zeroAddress))

      expect(await archimedes.balanceOf(0, owner.address)).to.be.equal(1000)
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
      await waitFor(archimedes.deposit(1, 100, zeroAddress))

      const price = await archimedes.getPricePerFullShare(1)
      expect(price).to.be.equal(1e8)

      expect(price * 100).to.be.equal(100e8)

      await waitFor(token.transfer(ctroller.address, 10))

      expect(
        await archimedes.getPricePerFullShare(1)
      ).to.be.equal(1.1e8)
    })
  })

  describe('Harvest', async () => {
    it('should not receive double reward harvest', async () => {
      const token = global.WETH

      await setWethBalanceFor(owner.address, '10')

      // Deposit without rewards yet
      await token.connect(owner).transfer(bob.address, 10)
      await token.connect(bob).approve(archimedes.address, 10)
      await (await archimedes.connect(bob).deposit(0, 10, zeroAddress)).wait()
      // Victim
      await token.connect(owner).transfer(alice.address, 10)
      await token.connect(alice).approve(archimedes.address, 10)
      await (await archimedes.connect(alice).deposit(0, 10, zeroAddress)).wait()
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(0)
      // Still behind the reward block
      const rewardBlock = parseInt(await archimedes.startBlock(), 10)
      const currentBlock = parseInt(await getBlock(), 10)
      expect(rewardBlock).to.be.greaterThan(currentBlock)
      expect(await archimedes.connect(bob).pendingPiToken(0, bob.address)).to.be.equal(0)
      await mineNTimes(rewardBlock - currentBlock)
      // This should mint a reward of 0.23~ for the first block
      await (await archimedes.updatePool(0)).wait() // rewardBlock + 1
      const piPerBlock = toNumber(await archimedes.piTokenPerBlock())
      expect(
        await piToken.balanceOf(archimedes.address)
      ).to.be.equal(
        toNumber(piPerBlock)
      )
      await mineNTimes(5)
      await network.provider.send('evm_setAutomine', [false]);
      await network.provider.send('evm_setIntervalMining', [2000]);

      await archimedes.connect(bob).harvest(0) // rewardBlock + 2 + 5

      // (Attack prevented)
      // ATTACK: already harvested shares get transferred and
      // re-harvested from another address, stealing from alice
      let mal = (await ethers.getSigners())[8]

      expect(await controller.balanceOf(bob.address)).to.be.above(9) // at least 10

      // This transfer doesn't work but doesn't revert because of the automine=false
      await controller.connect(bob).transfer(mal.address, 10)

      await waitFor(archimedes.connect(mal).harvest(0))

      expect(await piToken.balanceOf(mal.address)).to.be.equal(0)

      await network.provider.send('evm_setAutomine', [true]);
    }).timeout(0)
  })
})

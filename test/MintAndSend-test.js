const {
  toNumber, createPiToken, getBlock, mineNTimes,
  waitFor, deploy, zeroAddress
} = require('./helpers')

describe('MintAndSend setup', () => {
  let bob, alice
  let piToken
  let piVault
  let rewardsBlock
  let mintAndSend

  before(async () => {
    [, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    let now = (await hre.ethers.provider.getBlock()).timestamp

    piToken = await createPiToken()
    rewardsBlock = (await getBlock()) + 20

    piVault = await deploy('PiVault', piToken.address, now, now)
    mintAndSend = await deploy(
      'MintAndSend', piToken.address, piVault.address, owner.address, rewardsBlock
    )

    // await waitFor(archimedes.setReferralAddress(refMgr.address))
    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(mintAndSend.address))
  })


  describe('Deploy', async () => {
    it('should be reverted with wrong block number', async () => {
      await expect(
        deploy('MintAndSend', piToken.address, piVault.address, owner.address, (await getBlock()))
      ).to.be.revertedWith('Block should be in the future')
    })
  })

  describe('addInvestor', async () => {
    it('should revert for zero address', async () => {
      await expect(mintAndSend.addInvestor(zeroAddress, 0)).to.be.revertedWith("Can't be zero address")
    })

    it('should revert for not permitted tickets amount', async () => {
      await expect(mintAndSend.addInvestor(bob.address, 0)).to.be.revertedWith('1, 2 or 4 tickets per Investor')
      await expect(mintAndSend.addInvestor(bob.address, 3)).to.be.revertedWith('1, 2 or 4 tickets per Investor')
      await expect(mintAndSend.addInvestor(bob.address, 99)).to.be.revertedWith('1, 2 or 4 tickets per Investor')
    })

    it('should not add an existing investor', async () => {
      await waitFor(mintAndSend.addInvestor(bob.address, 2))
      await expect(mintAndSend.addInvestor(bob.address, 1)).to.be.revertedWith('already in')
    })

    it('should revert for max investors count', async () => {
      for (let i = 0; i < (await mintAndSend.INVESTORS_MAX_COUNT()); i++) {
        await waitFor(mintAndSend.addInvestor(ethers.Wallet.createRandom().address, 1))
      }

      await expect(
        mintAndSend.addInvestor(bob.address, 1)
      ).to.be.revertedWith(
        'Investors already completed'
      )
    })

    it('should revert for max 2 tickets investors', async () => {
      // Hardcoded number of max investors with 2 tickets
      for (let i = 0; i < 2; i++) {
        await waitFor(mintAndSend.addInvestor(ethers.Wallet.createRandom().address, 2))
      }

      await expect(
        mintAndSend.addInvestor(bob.address, 2)
      ).to.be.revertedWith(
        'Only 2 investors should have 2 tickets'
      )
    })

    it('should add an investor', async () => {
      await waitFor(mintAndSend.addInvestor(bob.address, 2))
    })

    it('should revert more than one investor with 4 tickets', async () => {
      await waitFor(mintAndSend.addInvestor(bob.address, 4))
      await expect(mintAndSend.addInvestor(alice.address, 4)).to.be.revertedWith(
        'Only one investor with 4 tickets'
      )
    })
  })

  describe('addFounders', async () => {
    it('should not add zero address as founder', async () => {
      await expect(mintAndSend.addFounders(
        [owner.address, bob.address, zeroAddress]
      )).to.be.revertedWith('Should be 3 Founders')
    })
    it('should not add repeated founder', async () => {
      await expect(mintAndSend.addFounders(
        [owner.address, bob.address, bob.address]
      )).to.be.revertedWith('Founders should have different wallets')
    })

    it('should add founder', async () => {
      await waitFor(mintAndSend.addFounders(
        [owner.address, bob.address, alice.address]
      ))
    })
    it('should not add twice', async () => {
      await waitFor(mintAndSend.addFounders(
        [owner.address, bob.address, alice.address]
      ))

      await expect(mintAndSend.addFounders(
        [bob.address, owner.address, alice.address]
      )).to.be.revertedWith('Already added')
    })
  })

  describe('setTreasury', async () => {
    it('should set treasury', async () => {
      await expect(mintAndSend.setTreasury(alice.address)).to.emit(
        mintAndSend, 'NewTreasury'
      ).withArgs(
        owner.address, alice.address
      )

      expect(await mintAndSend.treasury()).to.be.equal(alice.address)
    })
    it('should revert set treasury for non owner', async () => {
      await expect(
        mintAndSend.connect(alice).setTreasury(alice.address)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('mintAndSend', async () => {
    it('should be reverted for current block', async () => {
      expect(mintAndSend.mintAndSend()).to.be.revertedWith('Have to wait')
    })

    it('should be reverted for insufficient investors', async () => {
      await mineNTimes(rewardsBlock)
      expect(mintAndSend.mintAndSend()).to.be.revertedWith('should wait for more Investors')
    })

    it('should be reverted without founders', async () => {
      await mineNTimes(rewardsBlock);

      for (let i = 0; i < (await mintAndSend.INVESTORS_MAX_COUNT()); i++) {
        await waitFor(mintAndSend.addInvestor(
          ethers.Wallet.createRandom().address,
          1
        ))
      }

      expect(mintAndSend.mintAndSend()).to.be.revertedWith('should wait for Founders')
    })
  })
})

describe('MintAndSend', () => {
  let bob, alice
  let piToken
  let piVault
  let mintAndSend
  let founderPerBlock
  let founders
  let investorPerBlock
  let investors
  let rewardsBlock
  let totalForFounders
  let totalForInvestors
  let totalTickets
  let treasury
  let treasuryPerBlock

  before(async () => {
    [, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    let now = (await hre.ethers.provider.getBlock()).timestamp

    piToken = await createPiToken()
    rewardsBlock = (await getBlock()) + 20

    treasury = owner.address

    piVault = await deploy('PiVault', piToken.address, now, now)
    mintAndSend = await deploy(
      'MintAndSend', piToken.address, piVault.address, treasury, rewardsBlock
    )
    totalForInvestors = await mintAndSend.leftTokensForInvestors()
    totalForFounders = await mintAndSend.leftTokensForFounders()
    investorPerBlock = await mintAndSend.INVESTOR_PER_BLOCK()
    founderPerBlock = await mintAndSend.FOUNDER_PER_BLOCK()
    treasuryPerBlock = await mintAndSend.TREASURY_PER_BLOCK()
    totalTickets = await mintAndSend.INVESTORS_TICKETS()

    // await waitFor(archimedes.setReferralAddress(refMgr.address))
    await waitFor(piToken.initRewardsOn(rewardsBlock))
    await waitFor(piToken.addMinter(mintAndSend.address))

    investors = {}
    for (let i = 0; i < (await mintAndSend.INVESTORS_MAX_COUNT()); i++) {
      let addr = ethers.Wallet.createRandom().address
      // 2 investors should have 2 tickets each
      investors[addr] = i < 2 ? 2 : 1

      await waitFor(mintAndSend.addInvestor(addr, investors[addr]))
    }

    founders = [owner.address, bob.address, alice.address]
    await waitFor(mintAndSend.addFounders(founders))
  })

  describe('mintAndSend', async () => {
    it('should receive tokens for 1 block', async () => {
      await mineNTimes(rewardsBlock - (await getBlock())) // same reward block

      expect(await piVault.balance()).to.be.equal(0)

      const treasuryBalance = (await piToken.balanceOf(treasury))

      for (let wallet of (Object.keys(investors).concat(founders))) {
        expect(await piVault.balanceOf(wallet), `wallet: ${wallet}`).to.be.equal(0)
      }

      await waitFor(mintAndSend.mintAndSend())

      expect(await piVault.balance()).to.be.equal(
        investorPerBlock.mul(totalTickets).add(
          founderPerBlock.mul(founders.length)
        ).toString()
      )

      expect(await piToken.balanceOf(treasury)).to.be.equal(treasuryBalance.add(treasuryPerBlock))

      const perShare = (await piVault.getPricePerFullShare()).div(toNumber(1e18))

      // Without rewards yet
      expect(perShare).to.be.equal(1)

      for (let investor in investors) {
        expect(await piToken.balanceOf(investor)).to.be.equal(0)

        let shares = (await piVault.balanceOf(investor)).mul(perShare)
        expect(shares).to.be.equal(investorPerBlock.mul(investors[investor]))
      }


      for (let founder of founders) {
        // Owner already have piTokens so we don't check that

        let shares = (await piVault.balanceOf(founder)).mul(perShare)
        expect(shares).to.be.equal(founderPerBlock)
      }
    })

    it('should receive tokens for 1 block and be rewarded with more tokens per share', async () => {
      const holdersReward = 1e6
      // prev test
      if ((await getBlock()) < rewardsBlock)
        await mineNTimes(rewardsBlock - (await getBlock()))

      await waitFor(mintAndSend.mintAndSend())

      // holders reward
      await waitFor(piToken.transfer(piVault.address, holdersReward))

      let prevBalance = await piVault.balance()

      // for the prev transfer should release 2 more block
      await waitFor(mintAndSend.mintAndSend())

      expect(await piVault.balance()).to.be.equal(
        prevBalance.add(
          investorPerBlock.mul(totalTickets).add(
            founderPerBlock.mul(founders.length)
          ).mul(2) // 2 blocks
        ).toString()
      )

      const perShare = (await piVault.getPricePerFullShare())
      expect(perShare).to.be.above(toNumber(1e18))

      for (let investor in investors) {
        expect(await piToken.balanceOf(investor)).to.be.equal(0)

        // Should be more than just 3 blocks
        expect(
          (await piVault.balanceOf(investor)).mul(perShare).div(investors[investor]).div(toNumber(1e18))
        ).to.be.above(
          investorPerBlock.mul(3)
        )
        expect(
          (await piVault.balanceOf(investor)).mul(perShare).div(investors[investor]).div(toNumber(1e18))
        ).to.be.below(
          investorPerBlock.mul(4)
        )
      }

      for (let founder of founders) {
        expect(
          (await piVault.balanceOf(founder)).mul(perShare).div(toNumber(1e18))
        ).to.be.above(
          founderPerBlock.mul(3)
        )
        expect(
          (await piVault.balanceOf(founder)).mul(perShare).div(toNumber(1e18))
        ).to.be.below(
          founderPerBlock.mul(4)
        )
      }

      // just to check the 4º block
      await waitFor(mintAndSend.mintAndSend())

      expect(await piVault.balance()).to.be.equal(
        prevBalance.add(
          investorPerBlock.mul(totalTickets).add(
            founderPerBlock.mul(founders.length)
          ).mul(3) // 3 blocks
        ).toString()
      )

      expect(await mintAndSend.leftTokensForInvestors()).to.be.equal(
        totalForInvestors.sub(
          investorPerBlock.mul(totalTickets).mul(4)
        )
      )
      expect(await mintAndSend.leftTokensForFounders()).to.be.equal(
        totalForFounders.sub(
          founderPerBlock.mul(founders.length).mul(4)
        )
      )
    })
  })
})

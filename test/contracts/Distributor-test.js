const { toNumber, createPiToken, waitFor, deploy } = require('../helpers')

describe('Distributor setup', () => {
  let alice
  let piToken
  let piVault
  let distributor

  before(async () => {
    [,, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    let now = (await hre.ethers.provider.getBlock()).timestamp

    piToken = await createPiToken()

    piVault = await deploy('PiVault', piToken.address, now, now)
    distributor = await deploy(
      'Distributor', piToken.address, piVault.address, owner.address
    )
  })

  describe('deploy', () => {
    it('should set everything', async () => {
      for (let i = 0; i < 10; i++) {
        let wallet = await distributor.investors(i)
        expect(wallet.toLowerCase()).to.be.equal(
          '0x000000000000000000000000000000000000000' + (i + 1).toString(16)
        )
        expect(await distributor.investorTickets(wallet)).to.be.above(0)
      }

      for (let i = 0; i < 3; i++) {
        expect(
          (await distributor.founders(i)).toLowerCase()
        ).to.be.equal(
          '0x000000000000000000000000000000000000000' + (i + 12).toString(16)
        )
      }
    })
  })

  describe('setTreasury', () => {
    it('should set treasury', async () => {
      await expect(distributor.setTreasury(alice.address)).to.emit(
        distributor, 'NewTreasury'
      ).withArgs(
        owner.address, alice.address
      )

      expect(await distributor.treasury()).to.be.equal(alice.address)
    })
    it('should revert set treasury for non owner', async () => {
      await expect(
        distributor.connect(alice).setTreasury(alice.address)
      ).to.be.revertedWith('Not an admin')
    })
  })

  describe('distributor', () => {
    it('should be reverted without funds', async () => {
      expect(distributor.distribute()).to.be.revertedWith('SuperfluidToken: move amount exceeds balance')
    })
  })
})

describe('Distributor', () => {
  let piToken
  let piVault
  let distributor
  let founderPerBlock
  let founders = []
  let investorPerBlock
  let investors = {}
  let totalForFounders
  let totalForInvestors
  let totalForTreasury
  let totalTickets
  let treasury
  let treasuryPerBlock
  let TOTAL_TO_DISTRIBUTE

  beforeEach(async () => {
    let now = (await hre.ethers.provider.getBlock()).timestamp

    piToken = await createPiToken()

    treasury = owner.address

    piVault = await deploy('PiVault', piToken.address, now, now)
    distributor = await deploy(
      'Distributor', piToken.address, piVault.address, treasury
    )

    totalForFounders = await distributor.leftTokensForFounders()
    totalForInvestors = await distributor.leftTokensForInvestors()
    totalForTreasury = await distributor.leftTokensForTreasury()

    TOTAL_TO_DISTRIBUTE = totalForInvestors.add(totalForInvestors).add(totalForTreasury)

    await waitFor(piToken.transfer(distributor.address, TOTAL_TO_DISTRIBUTE))

    investorPerBlock = await distributor.INVESTOR_PER_BLOCK()
    founderPerBlock = await distributor.FOUNDER_PER_BLOCK()
    treasuryPerBlock = await distributor.TREASURY_PER_BLOCK()
    totalTickets = await distributor.INVESTORS_TICKETS()

    for (let i = 0 ; i < 3; i++) {
      founders[i] = await distributor.founders(i)
    }

    for (let i = 0; i < 10; i++) {
      let wallet = await distributor.investors(i)

      investors[wallet] = await distributor.investorTickets(wallet)
    }
  })

  describe('distributor', () => {
    it('should receive tokens for 1 block', async () => {
      expect(await piVault.balance()).to.be.equal(0)

      for (let wallet of (Object.keys(investors).concat(founders))) {
        expect(await piVault.balanceOf(wallet), `wallet: ${wallet}`).to.be.equal(0)
      }

      const treasuryBalance = (await piToken.balanceOf(treasury))

      await waitFor(distributor.distribute())

      const depositedPerBlock = investorPerBlock.mul(totalTickets).add(
        founderPerBlock.mul(founders.length)
      ) // 2 block

      expect(await piVault.balance()).to.be.equal(depositedPerBlock.mul(2))

      expect(await piToken.balanceOf(treasury)).to.be.equal(
        treasuryBalance.add(treasuryPerBlock.mul(2))
      )

      const perShare = (await piVault.getPricePerFullShare()).div(toNumber(1e18))

      // Without rewards yet
      expect(perShare).to.be.equal(1)

      for (let investor in investors) {
        expect(await piToken.balanceOf(investor)).to.be.equal(0)

        let shares = (await piVault.balanceOf(investor)).mul(perShare)
        expect(
          shares, `${investor} with shares: ${shares}`
        ).to.be.equal(investorPerBlock.mul(2).mul(investors[investor]))
      }


      for (let founder of founders) {
        // Owner already have piTokens so we don't check that

        let shares = (await piVault.balanceOf(founder)).mul(perShare)
        expect(shares, `${founder} with shares: ${shares}`).to.be.equal(founderPerBlock.mul(2))
      }
    })

    it('should receive tokens for 1 block and be rewarded with more tokens per share', async () => {
      const holdersReward = 1e6
      // prev test
      await waitFor(distributor.distribute())

      // holders reward
      await waitFor(piToken.transfer(piVault.address, holdersReward))

      let prevBalance = await piVault.balance()

      // for the prev transfer should release 2 more block
      await waitFor(distributor.distribute())

      expect(await piVault.balance()).to.be.equal(
        prevBalance.add(
          investorPerBlock.mul(totalTickets).add(
            founderPerBlock.mul(founders.length)
          ).mul(2) // 2 blocks
        )
      )

      const perShare = (await piVault.getPricePerFullShare())
      expect(perShare).to.be.above(toNumber(1e18))

      for (let investor in investors) {
        expect(await piToken.balanceOf(investor)).to.be.equal(0)

        // Should be more than just 4 blocks
        expect(
          (await piVault.balanceOf(investor)).mul(perShare).div(investors[investor]).div(toNumber(1e18))
        ).to.be.within(
          investorPerBlock.mul(4), investorPerBlock.mul(5)
        )
      }

      for (let founder of founders) {
        expect(
          (await piVault.balanceOf(founder)).mul(perShare).div(toNumber(1e18))
        ).to.be.above(
          founderPerBlock.mul(4), founderPerBlock.mul(5)
        )
      }

      // just to check the 4º block
      await waitFor(distributor.distribute())

      expect(await piVault.balance()).to.be.equal(
        prevBalance.add(
          investorPerBlock.mul(totalTickets).add(
            founderPerBlock.mul(founders.length)
          ).mul(3) // 3 blocks
        )
      )

      expect(await distributor.leftTokensForInvestors()).to.be.equal(
        totalForInvestors.sub(
          investorPerBlock.mul(totalTickets).mul(5)
        )
      )
      expect(await distributor.leftTokensForFounders()).to.be.equal(
        totalForFounders.sub(
          founderPerBlock.mul(founders.length).mul(5)
        )
      )
    })
  })
})

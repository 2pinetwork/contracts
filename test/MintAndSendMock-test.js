const {
  createPiToken, getBlock, waitFor, deploy
} = require('./helpers')

describe('MintAndSendMock', () => {
  let bob, alice
  let piToken
  let piVault
  let rewardsBlock
  let mintAndSend
  let investors
  let founders
  let investorPerBlock
  let founderPerBlock
  let treasuryPerBlock
  let totalForFounders
  let totalTickets

  before(async () => {
    [, bob, alice] = await ethers.getSigners()
  })

  beforeEach(async () => {
    let now = (await hre.ethers.provider.getBlock()).timestamp

    piToken = await createPiToken(true) // mocked
    rewardsBlock = (await getBlock()) + 20

    piVault = await deploy('PiVault', piToken.address, now, now)
    mintAndSend = await deploy(
      'MintAndSendMock', piToken.address, piVault.address, owner.address, rewardsBlock
    )
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
      let tickets = 1

      switch (i) {
          case 0:
            tickets = 4
            break
          case 1:
          case 2:
            tickets = 2
            break
      }

      investors[addr] = tickets

      await waitFor(mintAndSend.addInvestor(addr, tickets))
    }

    founders = [owner.address, bob.address, alice.address]
    await waitFor(mintAndSend.addFounders(founders))
  })

  describe('mintAndSend', async () => {
    it('should mint less than blocks rewards and continue to finish', async () => {
      // advance to "total to mint less 1 block"
      // Investors need a few more blocks than treasury because of the "round" per block
      const lastTreasuryBlock = (await mintAndSend.leftTokensForTreasury()).div(treasuryPerBlock)
      const lastInvestorBlock = (await mintAndSend.leftTokensForInvestors()).div(
        investorPerBlock.mul(totalTickets)
      )

      let currentBlock = lastTreasuryBlock.add(rewardsBlock)

      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.mintAndSend())
      // left within last block reward
      expect(await mintAndSend.leftTokensForTreasury()).to.be.within(
        0.1e10, // just a number greater than 0
        treasuryPerBlock
      )

      currentBlock = lastInvestorBlock.add(rewardsBlock)

      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.mintAndSend())

      // left within last block reward
      expect(await mintAndSend.leftTokensForInvestors()).to.be.within(
        0.1e10, // just a number greater than 0
        investorPerBlock.mul(totalTickets)
      )

      // double of time for founders
      expect(await mintAndSend.leftTokensForFounders()).to.be.equal(
        totalForFounders.sub(
          lastInvestorBlock.mul(founderPerBlock).mul(founders.length)
        )
      )

      currentBlock = currentBlock.add(1)

      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.mintAndSend())

      expect(await mintAndSend.leftTokensForInvestors()).to.be.equal(0)
      expect(await mintAndSend.leftTokensForTreasury()).to.be.equal(0)
      expect((await mintAndSend.leftTokensForFounders())).to.be.equal(
        totalForFounders.sub(
          lastInvestorBlock.add(1).mul(founderPerBlock).mul(founders.length)
        )
      )
      let totalDeposited = {}

      await Promise.all(
        Object.keys(investors).map(async (wallet) => {
          totalDeposited[wallet] = await piVault.balanceOf(wallet)
        })
      )

      currentBlock = currentBlock.add(
        (await mintAndSend.leftTokensForFounders()).div(
          founderPerBlock.mul(founders.length)
        )
      )

      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.mintAndSend())

      // investors not receiving more tokens
      for (let wallet in investors) {
        expect(
          await piVault.balanceOf(wallet)
        ).to.be.equal(totalDeposited[wallet])
      }

      // left within last block reward
      expect(await mintAndSend.leftTokensForFounders()).to.be.within(
        0.1e10, // just a number greater than 0
        founderPerBlock.mul(founders.length)
      )

      currentBlock = currentBlock.add(1)
      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.mintAndSend())

      expect(await mintAndSend.leftTokensForFounders()).to.be.equal(0)

      for (let wallet of founders) {
        totalDeposited[wallet] = await piVault.balanceOf(wallet)
      }

      // lots of blocks after the balance should not change
      currentBlock = currentBlock.add(1000)
      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(mintAndSend.setBlockNumber(currentBlock))

      await expect(mintAndSend.mintAndSend()).to.be.revertedWith(
        'Nothing more to do'
      )


      for (let wallet in totalDeposited) {
        expect(
          await piVault.balanceOf(wallet)
        ).to.be.equal(totalDeposited[wallet])
      }
    })
  })
})

const { createPiToken, getBlock, waitFor, deploy } = require('../helpers')

describe('DistributorMock', () => {
  let piToken
  let piVault
  let distributor
  let deployBlock
  let investors = {}
  let founders = []
  let investorPerBlock
  let founderPerBlock
  let treasuryPerBlock
  let totalForInvestors
  let totalForFounders
  let totalForTreasury
  let totalTickets
  let TOTAL_TO_DISTRIBUTE

  beforeEach(async () => {
    let now = (await hre.ethers.provider.getBlock()).timestamp

    piToken = await createPiToken({ tokenContract: 'PiTokenMock' })

    piVault = await deploy('PiVault', piToken.address, now, now)
    deployBlock = (await getBlock()) + 1
    distributor = await deploy(
      'DistributorMock', piToken.address, piVault.address, owner.address
    )
    totalForFounders = await distributor.leftTokensForFounders()
    totalForInvestors = await distributor.leftTokensForInvestors()
    totalForTreasury = await distributor.leftTokensForTreasury()
    investorPerBlock = await distributor.INVESTOR_PER_BLOCK()
    founderPerBlock = await distributor.FOUNDER_PER_BLOCK()
    treasuryPerBlock = await distributor.TREASURY_PER_BLOCK()
    totalTickets = await distributor.INVESTORS_TICKETS()

    TOTAL_TO_DISTRIBUTE = totalForInvestors.add(totalForInvestors).add(totalForTreasury)


    await waitFor(piToken.transfer(distributor.address, TOTAL_TO_DISTRIBUTE))

    for (let i = 0 ; i < 3; i++) {
      founders[i] = await distributor.founders(i)
    }

    for (let i = 0; i < 10; i++) {
      let wallet = await distributor.investors(i)

      investors[wallet] = await distributor.investorTickets(wallet)
    }
  })

  describe('distributor', async () => {
    it('should mint less than blocks rewards and continue to finish', async () => {
      // advance to "total to mint less 1 block"
      // Investors need a few more blocks than treasury because of the "round" per block
      const lastTreasuryBlock = (await distributor.leftTokensForTreasury()).div(treasuryPerBlock)
      const lastInvestorBlock = (await distributor.leftTokensForInvestors()).div(
        investorPerBlock.mul(totalTickets)
      )

      let currentBlock = lastTreasuryBlock.add(deployBlock)

      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(distributor.setBlockNumber(currentBlock))
      await waitFor(distributor.distribute())
      // left within last block reward
      expect(await distributor.leftTokensForTreasury()).to.be.within(
        0.1e10, // just a number greater than 0
        treasuryPerBlock
      )

      currentBlock = lastInvestorBlock.add(deployBlock)

      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(distributor.setBlockNumber(currentBlock))
      await waitFor(distributor.distribute())

      // left within last block reward
      expect(await distributor.leftTokensForInvestors()).to.be.within(
        0.1e10, // just a number greater than 0
        investorPerBlock.mul(totalTickets)
      )

      // double of time for founders
      expect(await distributor.leftTokensForFounders()).to.be.equal(
        totalForFounders.sub(
          lastInvestorBlock.mul(founderPerBlock).mul(founders.length)
        )
      )

      currentBlock = currentBlock.add(1)

      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(distributor.setBlockNumber(currentBlock))
      await waitFor(distributor.distribute())

      expect(await distributor.leftTokensForInvestors()).to.be.equal(0)
      expect(await distributor.leftTokensForTreasury()).to.be.equal(0)
      expect((await distributor.leftTokensForFounders())).to.be.equal(
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
        (await distributor.leftTokensForFounders()).div(
          founderPerBlock.mul(founders.length)
        )
      )

      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(distributor.setBlockNumber(currentBlock))
      await waitFor(distributor.distribute())

      // investors not receiving more tokens
      for (let wallet in investors) {
        expect(
          await piVault.balanceOf(wallet)
        ).to.be.equal(totalDeposited[wallet])
      }

      // left within last block reward
      expect(await distributor.leftTokensForFounders()).to.be.within(
        0.1e10, // just a number greater than 0
        founderPerBlock.mul(founders.length)
      )

      currentBlock = currentBlock.add(1)
      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(distributor.setBlockNumber(currentBlock))
      await waitFor(distributor.distribute())

      expect(await distributor.leftTokensForFounders()).to.be.equal(0)

      for (let wallet of founders) {
        totalDeposited[wallet] = await piVault.balanceOf(wallet)
      }

      // lots of blocks after the balance should not change
      currentBlock = currentBlock.add(1000)
      await waitFor(piToken.setBlockNumber(currentBlock))
      await waitFor(distributor.setBlockNumber(currentBlock))

      await expect(distributor.distribute()).to.be.revertedWith(
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

/* global ethers, describe, before, beforeEach, it */
const BigNumber = require('bignumber.js')
const { expect } = require('chai')
const {
  toNumber, initSuperFluid, createPiToken, expectedOnlyAdmin,
  waitFor, getBlock, sleep, zeroAddress
} = require('./helpers')

const MINT_DATA = [
  { community: 0.25439e18, expected: (new BigNumber( 1229833e18)), founders: 0.31364e18, investors: 0.41819e18, blocks: 1.25e6},
  { community: 0.50879e18, expected: (new BigNumber( 4317500e18)), founders: 0.31364e18, investors: 0.41819e18, blocks: 3.8e6 },
  { community: 0.63599e18, expected: (new BigNumber(14522500e18)), founders: 0.31364e18, investors: 0.41819e18, blocks: 1.2e7 },
  { community: 1.09027e18, expected: (new BigNumber(21307142e18)), founders: 0.31364e18, investors: 0.41819e18, blocks: 1.6e7 },
  { community: 1.09027e18, expected: (new BigNumber(28260000e18)), founders: 0.31364e18, investors: 0         , blocks: 2.1e7 },
  { community: 1.58998e18, expected: (new BigNumber(47100000e18)), founders: 0.31364e18, investors: 0         , blocks: 3.5e7 }
]


describe('PiTokenMock', () => {
  let piToken
  let owner
  let bob
  let INITIAL_SUPPLY
  let MAX_SUPPLY
  let superTokenFactory
  const txData = 0x0

  // Global setup
  before(async () => {
    [owner, bob] = await ethers.getSigners()

    superTokenFactory = await initSuperFluid(owner);
  })

  beforeEach(async () => {
    piToken = await createPiToken(owner, superTokenFactory, true)

    INITIAL_SUPPLY = parseInt(await piToken.INITIAL_SUPPLY(), 10)
    MAX_SUPPLY = parseInt(await piToken.MAX_SUPPLY(), 10)

    expect(await piToken.totalSupply()).to.equal(toNumber(INITIAL_SUPPLY))
    expect(await piToken.balanceOf(owner.address)).to.equal(toNumber(INITIAL_SUPPLY))
  })

  describe('increaseCurrentTranche', () => {
    it('Should increase the current tranche', async () => {
      const totalPerBlock = await piToken.totalMintPerBlock()

      expect(totalPerBlock).to.be.equal(toNumber(0.98622e18))

      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.initRewardsOn(1))

      const expected = 1229833e18;
      const neededBlocks = Math.ceil(expected / totalPerBlock)

      await piToken.setBlockNumber(neededBlocks);

      await waitFor(piToken.mint(owner.address, toNumber(expected - totalPerBlock), txData));

      expect(
        piToken.increaseCurrentTranche()
      ).to.be.revertedWith('not yet')

      await piToken.setBlockNumber(neededBlocks + 1);
      await waitFor(piToken.mint(owner.address, toNumber(totalPerBlock), txData));

      await piToken.increaseCurrentTranche();

      expect(
        await piToken.totalMintPerBlock()
      ).to.be.equal(toNumber(1.24062e18))

      await piToken.setBlockNumber(neededBlocks + 2);

      await waitFor(piToken.mint(owner.address, toNumber(1.24062e18), txData));
      await expect(
        piToken.mint(owner.address, toNumber(1.24062e18), txData)
      ).to.be.revertedWith("Can't mint more than expected");

      await expect(
        piToken.increaseCurrentTranche()
      ).to.be.revertedWith('not yet')
    })

    it('Should get mintPerBlock & revert when Mint is finished', async () => {
      await piToken.initRewardsOn(1);
      await piToken.addMinter(owner.address);

      let tranche;
      let minted = 0
      for (let i = 0; i < MINT_DATA.length; i++) {
        tranche = MINT_DATA[i]

        await piToken.setBlockNumber(tranche.blocks);

        expect(await piToken.totalMintPerBlock(), `Loop n: ${i}`).to.be.equal(
          toNumber(tranche.community + tranche.founders + tranche.investors)
        )
        expect(await piToken.communityMintPerBlock(), `Loop n: ${i}`).to.be.equal(
          toNumber(tranche.community)
        )

        await waitFor(piToken.mint(owner.address, tranche.expected.minus(minted).toFixed(), txData));
        minted = tranche.expected

        expect(await piToken.totalSupply(), `Loop n: ${i}`).to.be.equal(
          tranche.expected.plus(INITIAL_SUPPLY).toFixed()
        )

        if (i + 1 != MINT_DATA.length)
          await waitFor(piToken.increaseCurrentTranche());
      }

      await expect(piToken.increaseCurrentTranche()).to.be.revertedWith(
        'Mint is finished'
      )

      // Just to cover that part =)
      expect(await piToken.communityMintPerBlock()).to.be.equal(0)
      expect(await piToken.totalMintPerBlock()).to.be.equal(0)
    })
  })

  describe('Minting', async () => {
    beforeEach(async () => {
      await piToken.addMinter(bob.address)
    })

    it('Should only mint until MAX SUPPLY', async () => {
      await piToken.initRewardsOn(1);
      await piToken.setBlockNumber(1e10) // stupid amount of blocks =)
      await piToken.connect(bob).mint(
        bob.address,
        toNumber(MAX_SUPPLY - INITIAL_SUPPLY),
        txData
      )

      expect(await piToken.totalSupply()).to.equal(
        toNumber(MAX_SUPPLY)
      )

      await expect(
        piToken.connect(bob).mint(bob.address, 1, txData)
      ).to.be.revertedWith('Mint capped to 62.5M')
    })
  })
})

/* global ethers, describe, before, beforeEach, it */
const { expect } = require('chai')
const {
  toNumber, createPiToken,
  waitFor
} = require('./helpers')
const { MINT_DATA } = require('./contract_constants')

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
      let tranche = MINT_DATA[0]
      let expectedRatio = tranche.community + tranche.investors + tranche.founders

      const totalPerBlock = parseInt(await piToken.totalMintPerBlock(), 10)

      expect(totalPerBlock).to.be.equal(expectedRatio)

      await waitFor(piToken.addMinter(owner.address))
      await waitFor(piToken.initRewardsOn(1))

      const neededBlocks = Math.ceil(
        tranche.expected.div(totalPerBlock).toNumber()
      )

      await piToken.setBlockNumber(neededBlocks);

      await waitFor(piToken.mint(owner.address, tranche.expected.minus(totalPerBlock).toFixed(), txData));

      expect(
        piToken.increaseCurrentTranche()
      ).to.be.revertedWith('not yet')

      await piToken.setBlockNumber(neededBlocks + 1);
      await waitFor(piToken.mint(owner.address, toNumber(totalPerBlock), txData));

      await piToken.increaseCurrentTranche();

      tranche = MINT_DATA[1]
      expectedRatio = toNumber(tranche.community + tranche.investors + tranche.founders)

      expect(
        await piToken.totalMintPerBlock()
      ).to.be.equal(
        expectedRatio
      )

      await piToken.setBlockNumber(neededBlocks + 2);

      await waitFor(piToken.mint(owner.address, expectedRatio, txData));
      await expect(
        piToken.mint(owner.address, expectedRatio, txData)
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

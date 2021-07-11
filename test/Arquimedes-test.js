/* global ethers, describe, beforeEach, it, network */
const { expect } = require('chai')

describe('Arquimedes', () => {
  let owner
  let PiToken
  let piToken
  let Arquimedes
  let arquimedes
  let blockNumber

  beforeEach(async () => {
    blockNumber = await ethers.provider.send('eth_blockNumber');
    // console.log(await network.provider.send('evm_mine'))
    // console.log(await network.provider.send('eth_blockNumber'))
    [owner] = await ethers.getSigners()
    PiToken = await ethers.getContractFactory('PiToken')
    piToken = await PiToken.deploy()
    Arquimedes = await ethers.getContractFactory('Arquimedes')
    arquimedes = await Arquimedes.deploy(
      piToken.address,
      blockNumber + 100,
      owner.address
    )
  })

  describe('Deployment', () => {
    it('Initial deployment should have a zero balance', async () => {
      expect(await arquimedes.piToken()).to.equal(piToken.address)
      expect(await arquimedes.poolLength()).to.equal(0)
    })
  })

  describe('PendingPiToken', () => {
    it('Pending pi token without user', async () => {
      // expect(await arquimedes.pending(1, owner.address)).to.equal(0)
    })
  })
})

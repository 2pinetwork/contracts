const { ethers } = require('ethers');

const ArchimedesABI = [
  {
    'inputs': [],
    'name': 'harvestAll',
    'outputs': [],
    'stateMutability': 'nonpayable',
    'type': 'function'
  }
]
const StratABI = [
  {
    'inputs': [],
    'name': 'harvest',
    'outputs': [],
    'stateMutability': 'nonpayable',
    'type': 'function'
  }
]
const DistributorABI = [
  {
    'inputs': [],
    'name': 'distribute',
    'outputs': [],
    'stateMutability': 'nonpayable',
    'type': 'function'
  }
]
const FeeManagerABI = [
  {
    'inputs': [
        {
          'internalType': 'address',
          'name': '_token',
          'type': 'address'
        }
      ],
    'name': 'harvest',
    'outputs': [],
    'stateMutability': 'nonpayable',
    'type': 'function'
  }
]

const { DefenderRelaySigner, DefenderRelayProvider } = require('defender-relay-client/lib/ethers');

const exec = (fn, title) => {
  return fn.then(
    t => t.wait().then(
      _ => console.log(`${title} executed: ${t.hash}`)
    ).catch(
      e => console.log(`${title} error: ${e}`)
    )
  ).catch(
    e => console.log(`${title} error: ${e}`)
  )
}

const strats = {
  WMATIC: '0x809c9A891989b4A8C4F9a49dD4D754112C613309',
  USDT:   '0xD0BE385a34b695C3573EE02076D726a1AF1bf98b',
  USDC:   '0x6420FCa149DD11089332E7b0D96fd698E16361e7',
  WETH:   '0xa9796FfbD4c3fa27E8512e1574807E0E62835c5f',
  DAI:    '0x990E77483DA6C0b4301229efa35495DbF07d7676',
  WBTC:   '0x22B456DDF42e2D3C62a137948423339d0fC5Be95',
}

exports.handler = async (credentials) => {
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { speed: 'fast' });

  await exec((new ethers.Contract('0xF97579312c9263EaB567595D080cCa9A4FDcDe7b', ArchimedesABI, signer)).harvestAll(), 'Archimedes')
  await exec((new ethers.Contract('0x721C34F755382416C2870530D05731712A4804dD', DistributorABI, signer)).distribute(), 'Distributor')

  const feeMgr = new ethers.Contract('0xAD1F8bC452111FaAf833C3c0C459A52c6bA995F7', FeeManagerABI, signer)

  for (let s in strats) {
    await exec((new ethers.Contract(strats[s], StratABI, signer)).harvest(), `Strat ${s}`)

    await exec(feeMgr.harvest(strats[s]), `FeeMgr ${s}`)
  }
}

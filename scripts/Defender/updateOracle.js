const { ethers } = require('ethers');
const { DefenderRelaySigner, DefenderRelayProvider } = require('defender-relay-client/lib/ethers');

const OracleABI = [
  {
    'inputs': [],
    'name': 'update',
    'outputs': [],
    'stateMutability': 'nonpayable',
    'type': 'function'
  }
]

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

const ORACLES = [
  '0x54a8b731f1ffbf5b588bdc6da9a67ecd4d5de6c0'
]

exports.handler = async (credentials) => {
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { speed: 'average' });

  for (let addr of ORACLES) {
    await exec((new ethers.Contract(addr, OracleABI, signer)).update(), `Oracle[${addr}]`)
  }
}

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

exports.handler = async (credentials) => {
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { speed: 'fast' });

  await exec((new ethers.Contract('0x26444Fd5b3a4e7f3eEd3273df3Fd693e81a89b91', OracleABI, signer)).update(), 'PiOracle')
}

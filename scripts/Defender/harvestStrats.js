const { ethers } = require('ethers');
const axios = require("axios");
const { DefenderRelaySigner, DefenderRelayProvider } = require('defender-relay-client/lib/ethers');

let secrets = {}
let promises = []

const notify = async function(msg) {
  let err_msg = msg.slice(0, 500)

  const url = [
    'https://api.telegram.org/',
    secrets.TELEGRAM_BOT,
    '/sendMessage?chat_id=',
    secrets.TELEGRAM_CHANNEL,
    '&text=',
    encodeURIComponent(err_msg)
  ].join('');

  await Promise.all([
    axios.post(
      `https://discord.com/api/webhooks/${secrets.DISCORD_WEBHOOK_ID}/${secrets.DISCORD_WEBHOOK_TOKEN}`,
      { content: err_msg }
    ),
    axios.get(url)
  ]).catch(reason => console.log(reason))
}

const exec = (fn, title) => {
  let prom = fn.then(
    t => t.wait().then(
      _ => console.log(`${title} executed: ${t.hash}`)
    ).catch(
      e => promises.push(notify(`${title} error: ${e}`))
    )
  ).catch(
    e => promises.push(notify(`${title} error: ${e}`))
  )

  promises.push(prom)

  return prom
}

const delay = (ms) => {
  console.log(`Waiting ${ms / 1000}s`)
  return new Promise(resolve => setTimeout(resolve, ms))
}

const StratABI = [
     {
    'inputs': [],
    'name': 'balance',
    'outputs': [
      {
      'internalType': 'uint256',
      'name': '',
      'type': 'uint256'
      }
    ],
    'stateMutability': 'view',
    'type': 'function'
  },

  {
    'inputs': [],
    'name': 'harvest',
    'outputs': [],
    'stateMutability': 'nonpayable',
    'type': 'function'
  }
]

const strats = {
  mstable_usdc: '0x68574C6964E2CE24121590684AAbAc44c62cC6d3',
  quickswap_usdc: '0xe29026A120081511EF7B54EDc75997485c872aa2',
  xcapit_mstable_usdc: '0x7BdB5c735a9880e57Ece141859Fa7BaA43F2f987',
  xcapit_mstable_dai: '0x33Af07F9627F98e8a3DD7C000fE142732080775a',
}

exports.handler = async (credentials) => {
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { });

  secrets = {TELEGRAM_BOT, TELEGRAM_CHANNEL, DISCORD_WEBHOOK_ID, DISCORD_WEBHOOK_TOKEN} = credentials.secrets

  for (let s in strats) {
    let strategy = (new ethers.Contract(strats[s], StratABI, signer))

    try {
      await strategy.estimateGas.harvest()
    } catch(e) {
      notify(`Can't harvest ${s} 3h-Strategy`)
      continue
    }

    if (await strategy.balance() > 0)
      exec(strategy.harvest({gasLimit: 1.5e6}), `Strategy ${s}`)
  }

  await delay(2000 * Object.keys(strats).length); // wait for 2 seconds per strat

  await Promise.all(promises)
  await Promise.all(promises)
}

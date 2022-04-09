const { ethers } = require('ethers');
const axios = require("axios");
const { DefenderRelaySigner, DefenderRelayProvider } = require('defender-relay-client/lib/ethers');

let secrets = {}
let promises = []

const notify = async function(msg) {
  const url = [
    'https://api.telegram.org/',
    secrets.TELEGRAM_BOT,
    '/sendMessage?chat_id=',
    secrets.TELEGRAM_CHANNEL,
    '&text=',
    encodeURIComponent(msg)
  ].join('');

  await Promise.all([
    axios.post(
      `https://discord.com/api/webhooks/${secrets.DISCORD_WEBHOOK_ID}/${secrets.DISCORD_WEBHOOK_TOKEN}`,
      { content: msg }
    ),
    axios.get(url)
  ])
}

const exec = (fn, title) => {
  return fn.then(
    t => t.wait().then(
      _ => console.log(`${title} executed: ${t.hash}`)
    ).catch(
      e => promises.push(notify(`${title} error: ${e}`))
    )
  ).catch(
    e => promises.push(notify(`${title} error: ${e}`))
  )
}

const graphql = async (url, query) => {
  resp = await axios.post(url, { query: query })

  return resp.data
}

const priceIds = [
  'usd-coin', 'meta'
].join(',')

const getPrices = async () => {
  resp = await axios.get( `https://api.coingecko.com/api/v3/simple/price?ids=${priceIds}&vs_currencies=usd`,
    { headers: { 'Content-Type': 'application/json' } }
  )

  return resp.data
}

const getRewards = async () => {
  query = `{
      stakingRewardsContracts(where: {id: "0x32aba856dc5ffd5a56bcd182b13380e5c855aa29"}) {
        rewardRate
        totalSupply
      }
    }`

  data = await graphql(
    "https://api.thegraph.com/subgraphs/name/mstable/mstable-staking-rewards-polygon",
    query
  )

  return data['data']['stakingRewardsContracts'][0]
}

const getApy = async () => {
  query = `
    {
      savingsContracts(where: {id: "0x5290ad3d83476ca6a2b178cd9727ee1ef72432af"}) {
        dailyAPY
        latestExchangeRate {
          rate
        }
      }
    }`

  data = await graphql(
    "https://api.thegraph.com/subgraphs/name/mstable/mstable-protocol-polygon",
    query
  )

  return data['data']['savingsContracts'][0]
}

const IERC20_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

const STRAT_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_amount",
        "type": "uint256"
      }
    ],
    "name": "boost",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "balance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "want",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

const strats = {
  xcapit_mstable_usdc: '0x7BdB5c735a9880e57Ece141859Fa7BaA43F2f987',
}

exports.handler = async (credentials) => {
  // Signers
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { gasPrice: 31e9 });
  // Secrets notification
  secrets = {TELEGRAM_BOT, TELEGRAM_CHANNEL, DISCORD_WEBHOOK_ID, DISCORD_WEBHOOK_TOKEN} = credentials.secrets

  let [rewardsData, apy, prices] = await Promise.all([getRewards(), getApy(), getPrices()])

  // Sample
  for (let s in strats) {
    let strategy = (new ethers.Contract(strats[s], STRAT_ABI, signer))
    let want = (new ethers.Contract((await strategy.want()), IERC20_ABI, signer))

    let exchangeRate = apy.latestExchangeRate.rate

    let rewardApy =
      rewardsData.rewardRate * (3600 * 24) * prices.meta.usd / rewardsData.totalSupply /
      (exchangeRate * prices['usd-coin'].usd) * 365

    let mstableApy = rewardApy + (apy.dailyAPY / 100)
    console.log(`Mstable APY: ${mstableApy}`)
    console.log(`Balance: ${await strategy.balance()}`)

    let boost = (((0.255 - mstableApy) * (await strategy.balance()) ) / (365 * 24)).toFixed(0)

    if (boost > 10e6) {
      await notify(`${s} boost capped to 10e6`)
      boost = 10e6;
    }

    console.log(`Boosting ${boost}...`)
    await exec(want.approve(strategy.address, boost, {gasPrice: 31e9}), `${s}-Want approve`)
    await exec(strategy.boost(boost, {gasLimit: 1.5e6, gasPrice: 31e9}), `${s} boost`)
  }

  await Promise.all(promises)
}

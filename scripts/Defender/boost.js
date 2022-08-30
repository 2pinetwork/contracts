const { ethers } = require('ethers');
const axios = require("axios");
const { DefenderRelaySigner, DefenderRelayProvider } = require('defender-relay-client/lib/ethers');

let secrets = {}
let promises = []

const notify = async function(msg) {
  let err_msg = msg.slice(0, 2000)
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
  ])
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
    "name": "lastExternalBoost",
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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const strats = {
  xcapit_mstable_usdc: '0x7BdB5c735a9880e57Ece141859Fa7BaA43F2f987',
}

exports.handler = async (credentials) => {
  // Signers
  const provider = new DefenderRelayProvider(credentials);
  // const signer = new DefenderRelaySigner(credentials, provider, { gasPrice: 31e9 });
  const signer = new DefenderRelaySigner(credentials, provider, {});
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
    // we have to keep in mind the perfFee of 5%...
    let maxApy = 0.075
    let maxBoostedBalance = 100000e6
    let maxBoost = ((maxApy - mstableApy) * maxBoostedBalance / 24 / 365).toFixed(0)
    console.log(`Max Boost: ${maxBoost}`)

    let boost = (((maxApy - mstableApy) * (await strategy.balance()) ) / (365 * 24)).toFixed(0)
    if (maxBoost > 0 && boost > maxBoost) {
      console.log(`${s} boost capped to ${maxBoost}`)
      boost = maxBoost;
    } else if (boost <= 0) {
      boost = 0
    }

    if (boost > 0) {
      console.log(`Boosting ${boost}...`)
      // await exec(want.approve(strategy.address, 10000e6 + '', {gasPrice: 31e9}), `${s}-Want approve`)
      await exec(strategy.boost(boost, {gasLimit: 1.5e6}), `${s} boost`)
    } else if ((await strategy.lastExternalBoost()) > 0) {
      console.log(`Putting lastBoost to 0...`)
      await exec(strategy.boost(0, {gasLimit: 1.5e6}), `${s} lastBoost to 0`)
    } else {
      console.log(`Boost not needed...`)
    }
  }
  await delay(10000)
  await Promise.all(promises)
  await Promise.all(promises)

  // Update cache
  await axios.get('https://api.2pi.network/v1/vaults?partner=xcapit')
  await axios.get('https://api.2pi.network/v1/vaults?partner=xcapit')
  await axios.get('https://api.2pi.network/v1/vaults?partner=xcapit')
}

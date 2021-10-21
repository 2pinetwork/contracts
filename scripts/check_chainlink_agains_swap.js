/* global process */
/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
const SuperfluidSDK = require('@superfluid-finance/js-sdk');
const { verify } = require('./verify');

const deploy = JSON.parse(
  fs.readFileSync('utils/mumbai_data.json', 'utf8')
)

const WMATIC = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
const want = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'

const decimals = 18

const swap = async () => {
  const swapAbi = [{
    'type':'function',
    'stateMutability':'view',
    'outputs':[
      {
        'type':'uint256[]',
        'name':'amounts',
        'internalType':'uint256[]'
      }
    ],
    'name':'getAmountsOut',
    'inputs':[
      {
        'type':'uint256',
        'name':'amountIn',
        'internalType':'uint256'
      },
      {
        'type':'address[]',
        'name':'path',
        'internalType':'address[]'
      }
    ]
  }]

  const owner = (await ethers.getSigners())[0]

  let swap = new hre.ethers.Contract('0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', swapAbi, owner)
  let result = await swap.getAmountsOut(1e18.toString(), [WMATIC, want]);

  return (result[1] / (10 ** decimals));
}

const chainLink = async () => {
  const feedAbi = [
        {
      "inputs": [],
      "name": "latestRoundData",
      "outputs": [
        { "internalType": "uint80", "name": "roundId", "type": "uint80" },
        { "internalType": "int256", "name": "answer", "type": "int256" },
        { "internalType": "uint256", "name": "startedAt", "type": "uint256" },
        { "internalType": "uint256", "name": "updatedAt", "type": "uint256" },
        { "internalType": "uint80", "name": "answeredInRound", "type": "uint80" }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]

  const owner = (await ethers.getSigners())[0]
  let ethFeed = new hre.ethers.Contract('0xF9680D99D6C9589e2a93a78A04A279e509205945', feedAbi, owner)
  let maticFeed = new hre.ethers.Contract('0xAB594600376Ec9fD91F8e885dADF0CE036862dE0', feedAbi, owner)

  let [nativePrice, wantPrice] = await Promise.all([
    maticFeed.latestRoundData(),
    ethFeed.latestRoundData(),
  ])

  console.log(`Last update: Wmatic: ${nativePrice[4]} && ETH: ${wantPrice[4]}`)

  let tokenDiffPrecision = ((10 ** 18) / (10 ** decimals)) * 1e9;
  let ratio = (
    (nativePrice[1] * 1e9) / wantPrice[1]
  ) // * 99 / 100;
  return ratio / tokenDiffPrecision;
}
const tanga = async function () {
  let [ch, s] = await Promise.all([
    chainLink(), swap()
  ])

  console.log(`ChainLink: ${ch} vs Swap ${s} (${((ch / s) * 100).toFixed(3)}%)`)
}
const main = async function () {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (let i=0; i < 20; i++) {
    await tanga()
    await delay(5000); /// waiting 1 second
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

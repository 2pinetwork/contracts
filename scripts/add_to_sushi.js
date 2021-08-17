const fs = require('fs');

const deploy = JSON.parse(
  fs.readFileSync('utils/deploy.json', 'utf8')
)

const exec = (fn, title) => {
  return fn.then(
    t => t.wait().then(
      _ => console.log(`${title} executed`)
    ).catch(
      e => console.log(`${title} error: ${e}`)
    )
  ).catch(
    e => console.log(`${title} error: ${e}`)
  )
}

async function main () {
  const factoryAbi = [
    {
      inputs:  [{internalType: 'address',name: 'tokenA',type: 'address'},{internalType: 'address',name: 'tokenB',type: 'address'}],
      name:  'createPair',
      outputs:  [{internalType: 'address',name: 'pair',type: 'address'}],
      stateMutability: 'nonpayable',
      type: 'function'
    }
  ]
  const routerAbi = [
    {
      inputs: [{internalType: 'address',name: 'tokenA',type: 'address'},{internalType: 'address',name: 'tokenB',type: 'address'},{internalType: 'uint256',name: 'amountADesired',type: 'uint256'},{internalType: 'uint256',name: 'amountBDesired',type: 'uint256'},{internalType: 'uint256',name: 'amountAMin',type: 'uint256'},{internalType: 'uint256',name: 'amountBMin',type: 'uint256'},{internalType: 'address',name: 'to',type: 'address'},{internalType: 'uint256',name: 'deadline',type: 'uint256'}],
      name: 'addLiquidity',
      outputs: [{internalType: 'uint256',name: 'amountA',type: 'uint256'},{internalType: 'uint256',name: 'amountB',type: 'uint256'},{internalType: 'uint256',name: 'liquidity',type: 'uint256'}],
      stateMutability: 'nonpayable',
      type: 'function'
    }
  ]

  const erc20Abi = [
    {
      'type':'function',
      'stateMutability':'view',
      'outputs':[
        {
          'type':'uint256',
          'name':'',
          'internalType':'uint256'
        }
      ],
      'name':'decimals',
      'inputs':[]
    },
    {
      'type':'function',
      'stateMutability':'nonpayable',
      'outputs':[
        {
          'type':'bool',
          'name':'',
          'internalType':'bool'
        }
      ],
      'name':'approve',
      'inputs':[
        {
          'type':'address',
          'name':'spender',
          'internalType':'address'
        },
        {
          'type':'uint256',
          'name':'amount',
          'internalType':'uint256'
        }
      ]
    }
  ]
  const owner = (await hre.ethers.getSigners())[0]
  const factory = new ethers.Contract('0xc35DADB65012eC5796536bD9864eD8773aBc74C4', factoryAbi, owner)
  const router = new ethers.Contract('0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', routerAbi, owner)

  const allowance = 1 + '0'.repeat(59)
  const piTokens = '942000' + '0'.repeat(18)
  let wmaticTokens

  console.log(`Allowing: ${owner.address} ${deploy.PiToken} ${allowance}`)
  await (await (new ethers.Contract(deploy.PiToken, erc20Abi, owner)).approve('0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', allowance)).wait()

  for (let a in deploy) {
    if (a.startsWith('strat-')) {
      try {
        deploy.WMATIC = deploy[a].tokenAddr

        console.log(`Allowing: ${owner.address} ${deploy.WMATIC} ${allowance}`)
        token = new ethers.Contract(deploy.WMATIC, erc20Abi, owner)
        await (await token.approve('0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', allowance)).wait()
        await exec(factory.createPair(deploy.WMATIC, deploy.PiToken), 'Create Pair')
        // const wmaticTokens = 24.35e18.toString()
        wmaticTokens = '100' + '0'.repeat(parseInt(await token.decimals()), 10)
        console.log(`Mandando: ${wmaticTokens} vs ${piTokens}`)
        await exec(router.addLiquidity(
          deploy.WMATIC, deploy.PiToken,
          wmaticTokens, piTokens, // at 3100$ => 0.08$
          1, 1, // at 3100$ => 0.08$
          owner.address,
          (await hre.ethers.provider.getBlock()).timestamp + 600
        ), 'AddLiquidity')
      } catch(e) {
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

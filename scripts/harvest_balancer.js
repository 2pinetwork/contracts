// https://github.com/balancer-labs/bal-mining-scripts/blob/master/reports/83/__polygon_0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3.json
// gh/reports/n/__polygon_TOKEN.json

/* eslint no-console: 0 */
const fs = require('fs');
const fetch = require('node-fetch')

const { notify } = require('./notify');
const { buildClaim } = require('./merkle_tree');

const distributors = {
  "0x580a84c73811e1839f75d86d75d88cca0c241ff4": "0xc38c5f97b34e175ffd35407fc91a937300e33860", // Qi
  "0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3": "0xd2eb7bd802a7ca68d9acd209bec4e664a9abdd7b" // BAL
}

const filesToReadWithToken = {
  '_current-polygon.json': '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3',  // BAL
  '_current-qi-polygon.json': '0x580a84c73811e1839f75d86d75d88cca0c241ff4' // QI
}


const main = async function () {
  const build = async (account) => {
    claims = []
    claimTokens = []
    distAbi = [
      {
        "inputs":[
          {
            "internalType":"contract IERC20",
            "name":"token",
            "type":"address"
          },
          {
            "internalType":"address",
            "name":"distributor",
            "type":"address"
          },
          {
            "internalType":"uint256",
            "name":"distributionId",
            "type":"uint256"
          },
          {
            "internalType":"address",
            "name":"claimer",
            "type":"address"
          }
        ],
        "name":"isClaimed",
        "outputs":[
          {
            "internalType":"bool",
            "name":"",
            "type":"bool"
          }
        ],
        "stateMutability":"view",
        "type":"function"
      }
    ]

    dist = await ethers.getContractAt(distAbi, '0x0F3e0c4218b7b0108a3643cFe9D3ec0d4F57c54e')

    let index = 0
    for (let file in filesToReadWithToken) {
      token = filesToReadWithToken[file]
      repReq = await fetch(`https://github.com/balancer-labs/bal-mining-scripts/raw/master/reports/${file}`)
      polygonReports = await repReq.json()
      distributions = Object.keys(polygonReports)
      distributionId = distributions[distributions.length - 1]

      claimed = await dist.isClaimed(token, distributors[token], distributionId, account)

      console.log(
        claimed ? 'Claimed' : 'Claiming',
        JSON.stringify({
          account: account,
          index: index,
          token: token,
          distributor: distributors[token],
          ipfs: polygonReports[distributionId],
          distId: distributionId
        })
      )

      if (! claimed) {
        claim = await buildClaim({
          account: account,
          index: index,
          token: token,
          distributor: distributors[token],
          ipfs: polygonReports[distributionId],
          distId: distributionId
        })

        if (claim)  {
          claims.push(claim)
          claimTokens.push(token)
          index += 1
        }
      }
    }

    return [claims, claimTokens]
  }

  // const chainId = hre.network.config.network_id


  // This has to be adapted to the contract harvest but at least now it's working =D
  // owner = (await ethers.getSigners())[0]
  // abi = JSON.parse(fs.readFileSync('./abi/balancer_distributor.abi', 'utf8'))
//


  for (let chainId of ['xcapit', '137']) {
    let deploy = JSON.parse( fs.readFileSync(`utils/deploy.${chainId}.json`, 'utf8'))
    for (let str in deploy) {
      if (!str.startsWith('strat-bal-')) { continue }

      contract = await ethers.getContractAt('ControllerBalancerV2Strat', deploy[str]['strategy'])
      // account should be with checksum
      let [claimProof, tokens] = await build(ethers.utils.getAddress(contract.address))
      console.log(`${chainId}-${str} proff: `, claimProof)
      try {
        if (claimProof.length > 0 ) {
          await (await contract.claimRewards(claimProof, tokens)).wait()
          console.log(`Claimed rewards for ${chainId}-${str}`)
        }
      } catch(e) {
        await notify(`Exception for ${chainId}-${str}: ${e}` )
        console.log(`Error ${e}`)
      }

      let harvest = false

      for (let reward in distributors) {
        console.log(`Checkeando ${reward} para ${contract.address}`)
        console.log(await (await ethers.getContractAt('IERC20', reward)).balanceOf(contract.address))
        if ( (await (await ethers.getContractAt('IERC20', reward)).balanceOf(contract.address)) > 0) {
          console.log(`Should harvest ${chainId}-${str} for ${reward}`)
          harvest = true
        }
      }

      try {
        if (harvest) {
          await (await contract.harvest()).wait()
          console.log(`${chainId}-${str} harvested`)
        }
      } catch(e) {
        await notify(`Exception for ${chainId}-${str}: ${e}` )
        console.log(`Error ${e}`)

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

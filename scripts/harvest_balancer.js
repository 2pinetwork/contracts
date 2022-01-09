// https://github.com/balancer-labs/bal-mining-scripts/blob/master/reports/83/__polygon_0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3.json
// gh/reports/n/__polygon_TOKEN.json

/* eslint no-console: 0 */
const hre = require('hardhat');
const fs = require('fs');
const { Framework } = require('@superfluid-finance/js-sdk');
const deployFramework = require('@superfluid-finance/ethereum-contracts/scripts/deploy-framework');
const { verify } = require('./verify');

const main = async function () {
  const BigNumber = require('bignumber.js')
  const { keccak256, keccakFromString, bufferToHex } = require('ethereumjs-util')
  const { hexToBytes, soliditySha3 } = require('web3-utils')
  const fetch = require('node-fetch')

  const scale = (input, decimalPlaces) => {
    unscaled = typeof input === 'string' ? new BigNumber(input) : input;
    scalePow = new BigNumber(decimalPlaces.toString());
    scaleMul = new BigNumber(10).pow(scalePow);
    return unscaled.times(scaleMul);
  }

  class MerkleTree {
    constructor(elements) {
      this.elements = elements
        .filter(el => el)
        .map(el => Buffer.from(hexToBytes(el)));

      // Sort elements
      this.elements.sort(Buffer.compare);
      // Deduplicate elements
      this.elements = this.bufDedup(this.elements);

      // Create layers
      this.layers = this.getLayers(this.elements);
    }

    getLayers(elements) {
      if (elements.length === 0) {
        return [['']];
      }

      const layers = [];
      // @ts-ignore
      layers.push(elements);

      // Get next layer until we reach the root
      // @ts-ignore
      while (layers[layers.length - 1].length > 1) {
        // @ts-ignore
        layers.push(this.getNextLayer(layers[layers.length - 1]));
      }

      return layers;
    }

    getNextLayer(elements) {
      return elements.reduce((layer, el, idx, arr) => {
        if (idx % 2 === 0) {
          // Hash the current element with its pair element
          layer.push(this.combinedHash(el, arr[idx + 1]));
        }

        return layer;
      }, []);
    }

    combinedHash(first, second) {
      if (!first) {
        return second;
      }
      if (!second) {
        return first;
      }

      return keccak256(this.sortAndConcat(first, second));
    }

    getRoot() {
      return this.layers[this.layers.length - 1][0];
    }

    getHexRoot() {
      return bufferToHex(this.getRoot());
    }

    getProof(el) {
      let idx = this.bufIndexOf(el, this.elements);

      if (idx === -1) {
        throw new Error('Element does not exist in Merkle tree');
      }

      return this.layers.reduce((proof, layer) => {
        const pairElement = this.getPairElement(idx, layer);

        if (pairElement) {
          proof.push(pairElement);
        }

        idx = Math.floor(idx / 2);

        return proof;
      }, []);
    }

    // external call - convert to buffer
    getHexProof(_el) {
      const el = Buffer.from(hexToBytes(_el));

      const proof = this.getProof(el);

      return this.bufArrToHexArr(proof);
    }

    getPairElement(idx, layer) {
      const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;

      if (pairIdx < layer.length) {
        return layer[pairIdx];
      } else {
        return null;
      }
    }

    bufIndexOf(el, arr) {
      let hash;

      // Convert element to 32 byte hash if it is not one already
      if (el.length !== 32 || !Buffer.isBuffer(el)) {
        hash = keccakFromString(el);
      } else {
        hash = el;
      }

      for (let i = 0; i < arr.length; i++) {
        if (hash.equals(arr[i])) {
          return i;
        }
      }

      return -1;
    }

    bufDedup(elements) {
      return elements.filter((el, idx) => {
        return idx === 0 || !elements[idx - 1].equals(el);
      });
    }

    bufArrToHexArr(arr) {
      if (arr.some(el => !Buffer.isBuffer(el))) {
        throw new Error('Array is not an array of buffers');
      }

      return arr.map(el => '0x' + el.toString('hex'));
    }

    sortAndConcat(...args) {
      return Buffer.concat([...args].sort(Buffer.compare));
    }
  }

  const loadTree = (balances, decimals = 18) => {
    const elements = [];
    Object.keys(balances).forEach(address => {
      const balance = scale(balances[address], decimals).toString(10);
      const leaf = soliditySha3(
        { t: 'address', v: address },
        { t: 'uint', v: balance }
      );
      elements.push(leaf);
    });
    return new MerkleTree(elements);
  }

  const build = async (account) => {
    req = await fetch("https://github.com/balancer-labs/bal-mining-scripts/raw/master/reports/_current-polygon.json")
    polygonReports = await req.json()
    distributions = Object.keys(polygonReports)
    distributionId = distributions[distributions.length - 1]

    req = await fetch('https://api.github.com/repos/balancer-labs/bal-mining-scripts/git/trees/master?recursive=1')
    github_reports = await req.json()
    polygon_reports = github_reports.tree.filter(e => { return /reports\/\d+\/__polygon_/.test(e.path)})

    // For multiclaim
    // https://github.com/balancer-labs/frontend-v2/blob/5fb28b00c706cbd058e11b7f2fef5cdf1ad8398b/src/services/claim/MultiTokenClaim.json
    tokens = {
      // "0x580a84c73811e1839f75d86d75d88cca0c241ff": "" // Qi
      "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3": "0xd2EB7Bd802A7CA68d9AcD209bEc4E664A9abDD7b" // BAL
    }

    claims = []
    claimTokens = []
    for (token in tokens) {
      regex = new RegExp(`reports\/(\\d+)\/__polygon_${token}`, 'i')
      lastReport = polygon_reports.reduce((memo, value) => {
        match = value.path.match(regex)
        return (match && parseInt(match[1]) > memo.report) ? {report: parseInt(match[1]), ...value} : memo
      }, {report: 0})

      claim = await buildClaim({
        account: account,
        index: Object.keys(tokens).indexOf(token),
        token: token,
        distributor: tokens[token],
        reportPath: lastReport.path,
        distId: distributionId
      })

      if (claim)  {
        claims.push(claim)
        claimTokens.push(token)
      }
    }

    return [
      account,
      claims,
      claimTokens
    ]
  }

  const buildClaim = async ({account, index, token, distributor, reportPath, distId}) => {
    // report = `https://cloudflare-ipfs.com/ipfs/${polygonReports[distributionId]}`
    req = await fetch(`https://raw.githubusercontent.com/balancer-labs/bal-mining-scripts/master/${reportPath}`)
    report = await req.json()
    if (!report[account] || report[account] == 0) { return }

    balance  = (report[account] * 1e18).toString(10)

    merkleTree = loadTree(report, 18);
    proof = merkleTree.getHexProof(
      soliditySha3(
        { t: 'address', v: account },
        { t: 'uint', v: balance }
      )
    )

    return [
      parseInt(distId), // distId
      balance,
      distributor, // distributor
      index, // tokenIndex
      proof // merkleProff
    ]
  }

  // This has to be adapted to the contract harvest but at least now it's working =D
  owner = (await ethers.getSigners())[0]
  abi = JSON.parse(fs.readFileSync('./abi/balancer_distributor.abi', 'utf8'))
  contract = await ethers.getContractAt(abi, '0x0F3e0c4218b7b0108a3643cFe9D3ec0d4F57c54e')
  result = await build(account)
  tx = await (await contract.claimDistributions(...result)).wait()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

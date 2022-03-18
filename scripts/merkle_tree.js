const { keccak256, keccakFromString, bufferToHex } = require('ethereumjs-util')
const { hexToBytes, soliditySha3 } = require('web3-utils')
const BigNumber = require('bignumber.js')
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
    // console.log(`Agregada hoja de ${address}-${balance}: ${leaf}`)
  });
  return new MerkleTree(elements);
}

exports.buildClaim = async ({account, index, token, distributor, ipfs, distId}) => {
  console.log(`Recibido en el buildClaim`, account, index, token, distributor, ipfs, distId)
  req = await fetch(`https://cloudflare-ipfs.com/ipfs/${ipfs}`)
  report = await req.json()
  // console.log(`IPFS:`, report)

  amount = report[account] ||  report[account.toLowerCase()]
  // console.log(`Amount: ${amount}`)

  console.log(`Dentro del buildClaim: ${account}: ${amount}`)
  if (! amount > 0 ) { return }

  // console.log('harvest_balancer.js:229');
  balance  = scale(amount, 18).toString(10)

  merkleTree = loadTree(report, 18);
  // console.log('harvest_balancer.js:233');
  // console.log(`Buscando proof de ${account}-${balance}`)
  proof = merkleTree.getHexProof(
    soliditySha3(
      { t: 'address', v: account },
      { t: 'uint', v: balance }
    )
  )

  // console.log('harvest_balancer.js:241');
  return [
    parseInt(distId), // distId
    balance,
    distributor, // distributor
    index, // tokenIndex
    proof // merkleProff
  ]
}

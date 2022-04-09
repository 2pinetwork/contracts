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

const ABI = []
const strats = {}


exports.handler = async (credentials) => {
  // Signers
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { gasPrice: 31e9 });
  // Secrets notification
  secrets = {TELEGRAM_BOT, TELEGRAM_CHANNEL, DISCORD_WEBHOOK_ID, DISCORD_WEBHOOK_TOKEN} = credentials.secrets

  // Sample
  for (let s in strats) {
    let strategy = (new ethers.Contract(strats[s], ABI, signer))

    if (await strategy.balance() > 0)
      await exec(strategy.harvest({gasLimit: 1.5e6}), `Strategy ${s}`)
  }

  await Promise.all(promises)
}

const fetch = require("node-fetch");

exports.notify = async function(msg) {
  if (process.env.SKIP_NOTIFICATIONS) { return }
  const url = [
    'https://api.telegram.org/',
    process.env.TELEGRAM_BOT,
    '/sendMessage?chat_id=',
    process.env.TELEGRAM_CHANNEL,
    '&text=',
    encodeURIComponent(msg)
  ].join('');

  await Promise.all([
    fetch(
      `https://discord.com/api/webhooks/${process.env.DISCORD_WEBHOOK_ID}/${process.env.DISCORD_WEBHOOK_TOKEN}`,
      {
        method:  'POST',
        body:    JSON.stringify({ content: msg }),
        headers: { 'Content-Type': 'application/json' }
      }
    ),
    fetch(url)
  ])
}

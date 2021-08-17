const fetch = require("node-fetch");

exports.notify = async function(msg) {
  const url = [
    'https://api.telegram.org/',
    process.env.TELEGRAM_BOT,
    '/sendMessage?chat_id=',
    process.env.TELEGRAM_CHANNEL,
    '&text=',
    encodeURIComponent(msg)
  ].join('');

  await fetch(url);
}

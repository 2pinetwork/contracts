require 'time'
require 'csv'
require 'awesome_print'
require 'json'
require 'uri'
require 'net/http'

ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

already_checked_txs = []
@score_per_user = {}
FINISH = Time.now
TOTAL_SECONDS = FINISH - Time.new(2021, 5, 24, 19) # deploy time
PRICES = {
  BTC: 47889.9,
  BTC_Curve: 47889.9,
  ETH: 3572.45,
  MATIC: 1.39,
}
PRECISION = {
  BTC: 1e8,
  BTC_Curve: 1e8,
  USDC: 1e6,
  USDT: 1e6
}

TREASURY = '0xe25831c97ac161ad58aef70b6cee507b0e49688c'

def fetch_from_covalent(path, params = {})
  q_params = URI.encode_www_form(params)

  uri = URI.parse("https://api.covalenthq.com/v1/137#{path}?#{q_params}")
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  response = http.get(uri.request_uri, {
    Authorization: "Basic #{ENV['COVALENT_BEARER']}",
    Accept:        'application/json'
  })

  JSON.parse(response.body)
rescue => e
  puts "Fetch error: #{e}"
  sleep 2
  retry
end

def fetch(crypto, data)
  page = data[:page] || 0
  vault = data[:vault]
  token = data[:token]

  params = {
    'page-number' => page,
    'page-size'   => 200
  }

  body = fetch_from_covalent("/address/#{vault}/transactions_v2/", params)

  items = body.dig('data', 'items')
  if !items || items.empty?
    puts "NO ITEMS"
    ap body

    return []
  end

  if body.dig('data', 'pagination', 'has_more')
    (items + fetch(crypto, data.merge(page: page + 1)))
  else
    items
  end
end

def get_info_from_transfer(tx, data)
  time = Time.parse(tx['block_signed_at'])

  tx['log_events'].each do |log|
    next unless log.dig('decoded', 'name') == 'Transfer'

    params = log['decoded']['params']
    from, to, amount = params&.dig(0, 'value'), params&.dig(1, 'value'), params&.dig(2, 'value')

    next if amount.to_i.zero?

    # transfer of real token
    if log['sender_address'] == data[:token]
      if to&.downcase == data[:vault].downcase && !@internal_contracts.include?(from&.downcase)
        add_user_period(time, from.downcase, amount, 'deposit')
        # pp "Deposit: #{log['tx_hash'][0..19]} #{from} #{amount}"
        # pp "---------------------------------------------------"
        next
      elsif from&.downcase == data[:vault].downcase && !@internal_contracts.include?(to&.downcase)
        add_user_period(time, to.downcase, amount, 'withdraw')
        # pp "Withdraw: #{log['tx_hash'][0..19]} #{to} #{amount}"
        # pp "---------------------------------------------------"
        next
      end
      # transfer of share token
    elsif log['sender_address'].downcase == data[:vault].downcase && from != ZERO_ADDRESS && to != ZERO_ADDRESS
      add_user_period(time, from.downcase, amount, 'withdraw')
      add_user_period(time, to.downcase, amount, 'deposit')
      # pp "Transfer shares: #{from} => #{to} #{amount}"
      # pp "---------------------------------------------------"
      next
    end
  end

end

def get_info_from_matic(tx, data)
  time = Time.parse(tx['block_signed_at'])
  from = tx["from_address"].downcase

  if tx['value'].to_i.positive?
    add_user_period(time, from, tx['value'].to_i, 'deposit')
  else
    # Check for unwrap event
    withdraw = tx['log_events'].find do |event|
      event['sender_address'].downcase == data[:token] && ## WMatic "sender"
        event.dig('decoded', 'name') == 'Withdrawal' && ## Unwrap Wmatic => MATIC
        event.dig('decoded', 'params', 1, 'name') == 'wad' # wad is the amount unwrapped
    end

    amount = withdraw&.dig('decoded', 'params', 1, 'value').to_i

    if amount.positive?
      add_user_period(time, from, tx['value'].to_i, 'withdraw')
    else
      tx['log_events'].each do |log|
        # Transfer of share tokens
        if log['sender_address'].downcase == data[:vault].downcase &&
            log.dig('decoded', 'name') == 'Transfer'

          params = log['decoded']['params']
          from, to, amount = params&.dig(0, 'value'), params&.dig(1, 'value'), params&.dig(2, 'value')

          if from != ZERO_ADDRESS && to != ZERO_ADDRESS && amount.to_i.positive?
            add_user_period(time, from.downcase, amount, 'withdraw')
            add_user_period(time, to.downcase, amount, 'deposit')
            break
          end
        end
      end
    end
  end
end

def add_user_period(time, user, amount, method)
  user = user.downcase
  return if user == TREASURY
  amount = amount.to_i

  # If last_timestamp[user] is present is because of an open period
  if @last_timestamp[user]
    period = @periods[user].last
    period[:finish] = time

    # If it's a withdraw, have to subtract the amount.
    # A new period is added only if the new amount is positive
    if (new_amount = period[:amount] + (method == 'withdraw' ? -amount : amount)).positive?
      @periods[user] << { start: time, amount: new_amount }
      @last_timestamp[user] = time
    else
      # if it's not positive we delete the timestamp
      @last_timestamp.delete(user)
    end
  else
    # If it's a new user or a new period
    @last_timestamp[user] = time

    @periods[user] ||= []
    @periods[user] << { start: time, amount: amount }
  end
end

# Created contracts from owner
@internal_contracts = %w[
0x06b4df2289f1424c45acc40545fe283e9d952a17
0x0995ebf4c12065ee72dfbe11c00648b8ea27e286
0x20a2fe0e617688838257b3c9f5c6416705e3632d
0x281afb0f2dc31fa6268e7ba73b2c2b5a4ec7d9de
0x2e956d215d76c5a2deb0d19c3d504676fae697c1
0x396b312b88f4ecb2a7cb1ba5f126d2d2918484be
0x6939d7ce55c8ddb372710bf4aa521a816b769b26
0x8486fa0880ef6bff7695f12c1e5d0de333c00d1a
0x8bd3a897f9fd7c478c8767958d0a3108d1ca76a2
0x90dc156abfe2f0db44f7cfd0124a657df8578405
0x99a6d42f2351a828713d034a81b1c9f7d1753cd9
0xa818baef4b37018c862305edefb8f6f24e4208c0
0xc4f1501f337079077842343ce02665d8960150b0
0xc6bde8da175b05c89e0436877f84011260692eb9
0xcb1213d3da10d725bf799dbd9265ac987856c421
0xcb50ff1863cbbad718d3a1eeef403a95c58d3b16
0xd6f739af8134e1cfb4c78553dcc0012ff88a9039
0xf0410cb78e09dc5e0b8f39c34fc17032a0563e83
]

{
  USDT: {
    controllers: [
      "0x8cb6f055a094027245f9e572846b7c1083e5ae2f",
    ],
    vault: "0x69fd934abc843ec3eee70bdd88f79dbf1ed8094e",
    strategies: [
      "0x4af5d090641e380ff82e57427145e95cd87add18",
      '0x6323846883db8907ce870d31855cdb08b57bd70f',
    ],
    token: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"
  },
  USDC: {
    controllers: ["0x8cb6f055a094027245f9e572846b7c1083e5ae2f"],
    vault: "0x29c9590cabc37b04c62eac2dff26dcb7e343214d",
    strategies: [
      "0x1f68524b6eb5bbef23aafc8b5b914e711b0abf6e",
      "0x9058311993711c255d03a2bc2fdefdff6601bbe0",
      "0x5efb482abd5a3580e440b74dcef0e1dc18566c9a"
    ],
    token: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"
  },
  BTC: {
    controllers: ["0x8cb6f055a094027245f9e572846b7c1083e5ae2f"],
    vault: "0x4ffe6f151fd32f32912a429deb00b3a54e36dcb7",
    strategies: [
      "0x8497a80d46291e53f5f33200bc3823fd6a600284",
      "0x402c4b0fe1d2128e0c5a9d077501c9abca430e01",
      "0xc5aacf16ecf07fac6e13c53e1954f1ef3b6d8d11"
    ],
    token: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6"
  },
  DAI:   {
    controllers: ["0x8cb6f055a094027245f9e572846b7c1083e5ae2f"],
    vault: "0x656c29cf9ea4c736c5b191c0f3f35c7a75247622",
    strategies: [
      "0xb19722d490dc1de3d8c10078be1ea029b58a99dd",
      "0x3168374fba6d230e420f94211f28a71c30865ce6",
      "3168374fba6d230e420f94211f28a71c30865ce6"
    ],
    token: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"
  },
  ETH: {
    controllers: ["0x8cb6f055a094027245f9e572846b7c1083e5ae2f"],
    vault: "0x6a2fbdb8df55ae5135d175d4eb367ebc1d6c70aa",
    strategies: [
      "0x6c5bd3260394530648c584aab9f0a727c981d6ad",
      "0xd8758996342c04b25a4dce50032458e0fcc0ec01"
    ],
    token: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"
  },
  BTC_Curve: {
    controllers: ["0xba0635f3b8d021f510320c6f7b620c70fa363368"],
    vault: "0x2a0bcde01e25920d043f470b947ef438ad2ff061",
    strategies: [
      "0xac61b92f72a13a8167a5bfd737f77d1cebaa2239",
    ],
    token: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6"
  },
  MATIC: {
    controllers: ["0x8cb6f055a094027245f9e572846b7c1083e5ae2f"],
    vault: "0xa489b6d5ee982209c552f78a981631fccf62c116",
    strategies: [
      "0xe231c59d6b89bd1dc340ab4e9ee0504471b759b4",
      "0xe3b49cefac1d2f99b61417052eb50f46a6110e94",
    ],
    token: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"
  }
}.map do |crypto, data|
  @last_timestamp = {}
  @periods = {} # by wallet
  @internal_contracts += data.values.flatten.uniq

  txs = fetch(crypto, data)
  puts "Para #{crypto} obtuvimos #{txs.size} txs"
  txs.reverse_each do |tx|
    # CovalentHQ returns multiple times the same tx hash
    next if already_checked_txs.include?(tx['tx_hash'])
    already_checked_txs << tx['tx_hash']
    next unless tx['successful']

    # process raw txs
    if crypto == :MATIC
      get_info_from_matic(tx, data)
    else
      get_info_from_transfer(tx, data)
    end
  end

  # export individual crypto periods
  CSV.open("csvs/periods-#{crypto}.csv", 'w') do |csv|
    csv << %w[user time start finish amount_h amount dollars u_score]
    @periods.each do |user, user_periods|
      # User score "dollars in time"
      score = user_periods.sum do |period|
        finish = period.fetch(:finish, FINISH)
        # Period seconds / total seconds
        seconds = (finish - period[:start])
        # Stable will value 1 dolar
        dollars = ((period[:amount].to_f / PRECISION.fetch(crypto, 1e18)) * (PRICES[crypto] || 1.0))

        u_score = seconds * dollars / TOTAL_SECONDS

        days = (seconds / 86400).to_i
        human_time = Time.at(seconds % 86400).utc.strftime("#{days}d %H:%M:%S")

        csv << [
          user,
          human_time,
          period[:start].to_i,
          finish.to_i,
          (period[:amount].to_f / PRECISION.fetch(crypto, 1e18)).round(3),
          period[:amount],
          dollars.round(3),
          u_score.round(3)
        ]

        u_score
      end

      @score_per_user[user] ||= 0.0
      @score_per_user[user]  += score
    end
  end
end

# export general users score
CSV.open('csvs/score.csv', 'w') do |csv|
  @score_per_user.each do |user, score|
    csv << [user, score.round]
  end
end

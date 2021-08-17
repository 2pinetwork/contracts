#!/bin/bash
# sudo apt-get install -y autoconf automake build-essential libffi-dev libtool pkg-config python3-dev libleveldb-dev
sudo curl -s -f -L "https://github.com/ethereum/solidity/releases/download/v0.8.4/solc-static-linux" -o "/usr/bin/solc-v0.8.4" && sudo chmod +x /usr/bin/solc-v0.8.4


solc-select 0.8.4
cd /app

pip3 install wheel
# pip3 install mythril
pip3 install slither-analyzer ## update to last version to support 0.8
slither . --json slither-analysis$(date +"%s").json --exclude-informational --exclude-low --exclude name-reused --filter-paths "Archimedes.sol,ArchimedesAaveStrat.sol,FeeManager.sol,MintAndDeposit.sol,PiToken.sol,PiVault.sol,Referral.sol"

# npx sol-merger --remove-comments "./contracts/*.sol" ./build
# sed -i '1s/^/\/\/ SPDX-License-Identifier: MIT\n/' build/*.sol

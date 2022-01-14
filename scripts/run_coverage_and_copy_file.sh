#!/bin/bash

if [[ "$1" =~ integration ]]; then
  # HARDHAT INTEGRATION should be set
  echo "Running preprocess"
  npx hardhat preprocess
fi
npx hardhat coverage --testfiles $1

array=$(echo $1 | sed "s/,/\n/g")
file=(${array[0]})
file=$(echo $file | sed "s/test\///g") # delete test/
file=$(echo $file | sed "s/\//_/g") # change / for _
file=$(echo $file | sed "s/-test\.js/.json/g") # change / for _

cp /app/coverage.json /coverages/$file
chmod 666 /coverages/$file
chown 1000:1000 /coverages/$file

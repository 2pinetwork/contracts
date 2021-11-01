#!/bin/bash

npx hardhat coverage --testfiles $1 > /dev/null

array=$(echo $1 | sed "s/,/\n/g")
file=(${array[0]})
file=$(echo $file | sed "s/test\///g") # delete test/
file=$(echo $file | sed "s/\//_/g") # change / for _
file=$(echo $file | sed "s/-test\.js/.json/g") # change / for _

cp /app/coverage.json /coverages/$file

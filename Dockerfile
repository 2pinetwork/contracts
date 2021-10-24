FROM node:14-buster-slim

RUN apt update && \
    apt install -y git && \
    mkdir /app

ADD ./package.json ./yarn.lock /app/

WORKDIR /app

RUN yarn install

ADD ./ /app

RUN npx hardhat compile # ensure compiler download

CMD bash

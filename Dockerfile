FROM node:14-buster-slim

RUN apt update && \
    apt install -y git && \
    mkdir /app

ADD ./ /app

WORKDIR /app

RUN yarn install

CMD bash

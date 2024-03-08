FROM node:18.16.1-alpine as builder

WORKDIR /app

COPY . .

RUN npm install

ENTRYPOINT ["npm", "run", "dev", "--", "mos-config.json"]


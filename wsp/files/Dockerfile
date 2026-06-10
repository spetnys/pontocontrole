FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY package-lock.json ./
COPY public ./public
COPY src ./src
COPY app ./app
COPY components ./components
COPY hooks ./hooks
COPY lib ./lib
COPY next.config.mjs ./
COPY next-env.d.ts ./
COPY tsconfig.json ./
COPY postcss.config.mjs ./

RUN npm install
RUN npm run build:web

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY package-lock.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public
COPY app ./app
COPY components ./components
COPY hooks ./hooks
COPY lib ./lib
COPY next.config.mjs ./
COPY tsconfig.json ./
COPY next-env.d.ts ./
COPY --from=builder /app/.next ./.next

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "--experimental-sqlite", "src/server.js"]

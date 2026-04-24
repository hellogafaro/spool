FROM node:24.13.1-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git make g++ python3 unzip \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g bun@1.3.11 node-gyp@12.3.0

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile
RUN bun run build --filter=t3

ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:${PATH}"

CMD ["sh", "-c", "node apps/server/dist/bin.mjs serve --port ${PORT:-8080} --host 0.0.0.0"]

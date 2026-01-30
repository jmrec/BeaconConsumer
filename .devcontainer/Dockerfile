FROM mcr.microsoft.com/devcontainers/javascript-node:22

RUN apt-get update && apt-get install -y \
    procps \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# RUN npm install -g nuxi pnpm

EXPOSE 3070
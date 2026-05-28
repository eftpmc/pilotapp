FROM node:20-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
ENV PROJECTS_ROOT=/data/projects

VOLUME ["/data"]

EXPOSE 3000

CMD ["node", "dist/index.js"]

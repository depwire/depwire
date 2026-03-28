FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY dist/ ./dist/

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js", "mcp"]

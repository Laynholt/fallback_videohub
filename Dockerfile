FROM node:20-alpine

WORKDIR /app

COPY . .

ENV PORT=8085

CMD ["sh", "-c", "node server.js"]
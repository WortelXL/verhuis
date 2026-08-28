FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

# Data map voor het (persistente) tasks.json-bestand
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=80
EXPOSE 80

CMD ["node", "server.js"]

FROM node:24-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build
USER node
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate && npm run start"]

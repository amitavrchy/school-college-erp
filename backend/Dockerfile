FROM node:24-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY backend backend
RUN npm run db:generate && npm run build -w backend
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate && npm run start -w backend"]

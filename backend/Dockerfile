FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source
COPY src ./src/

# Uploads directory (will be mounted as volume)
RUN mkdir -p uploads

EXPOSE 3001

# Runtime container CHI start app. KHONG chay migration trong startup de tranh
# migrate chay tren nhieu replica hoac auto-migrate ngoai kiem soat.
# Migration la release/predeploy step rieng, chay 1 lan:
#   docker compose run --rm backend npx prisma migrate deploy
# Xem docs/DEPLOYMENT_POLICY.md + docs/PRODUCTION_ROLLOUT_CHECKLIST.md
CMD ["node", "src/index.js"]

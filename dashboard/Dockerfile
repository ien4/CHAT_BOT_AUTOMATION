FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN echo "=== DIAGNOSTIC ===" && \
    echo "settings page lines: $(wc -l < src/app/dashboard/settings/page.tsx)" && \
    echo "showProvider count: $(grep -c showProvider src/app/dashboard/settings/page.tsx || echo 0)" && \
    echo "Jina count: $(grep -c Jina src/app/dashboard/settings/page.tsx || echo 0)" && \
    echo "=== END DIAGNOSTIC ==="

RUN mkdir -p public

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]

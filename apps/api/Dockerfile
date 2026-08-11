# CommerceNest API — multi-stage build
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/types/package.json ./packages/types/
COPY packages/prisma/package.json ./packages/prisma/
COPY apps/api/package.json ./apps/api/
RUN npm install --workspace=@commercenest/api --workspace=@commercenest/types --workspace=@commercenest/prisma --include-workspace-root=false

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/prisma/node_modules ./packages/prisma/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY packages/prisma ./packages/prisma
COPY apps/api ./apps/api
RUN npm run build -w @commercenest/types \
  && npm run generate -w @commercenest/prisma \
  && npm run build -w @commercenest/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S cn && adduser -S cn -G cn
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/packages/prisma/generated ./packages/prisma/generated
COPY --from=builder /app/packages/prisma/package.json ./packages/prisma/package.json
COPY --from=builder /app/packages/prisma/schema.prisma ./packages/prisma/schema.prisma
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
USER cn
EXPOSE 4000
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]

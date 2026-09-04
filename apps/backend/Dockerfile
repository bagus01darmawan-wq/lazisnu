FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10 --activate

FROM base AS build
WORKDIR /app
# Salin SELURUH source + manifest dulu, lalu install SEKALIGUS.
# (Pola pnpm-in-Docker kanonik: hindari COPY . . menimpa node_modules
#  hasil pnpm install, yang memicu "Cannot find module typescript/bin/tsc".)
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @lazisnu/shared-types build || true
RUN pnpm --filter lazisnu-backend build

FROM base AS runner
WORKDIR /app
RUN apk add --no-cache tzdata
ENV TZ=Asia/Jakarta
ENV NODE_ENV=production
ENV NODE_OPTIONS=--dns-result-order=ipv4first
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared-types/package.json packages/shared-types/
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY --from=build /app/apps/backend/src/database/migrations apps/backend/src/database/migrations
COPY --from=build /app/apps/backend/drizzle.config.ts apps/backend/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter lazisnu-backend

EXPOSE 3001
CMD ["node", "apps/backend/dist/index.js"]

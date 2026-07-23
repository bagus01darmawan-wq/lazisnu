FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared-types/package.json packages/shared-types/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
ENV PATH="/app/node_modules/.bin:$PATH"
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
COPY . .
RUN pnpm --filter @lazisnu/shared-types build
RUN pnpm --filter lazisnu-backend build

FROM base AS runner
WORKDIR /app
RUN apk add --no-cache tzdata
ENV TZ=Asia/Jakarta
ENV NODE_ENV=production

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/backend/package.json apps/backend/
COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json packages/shared-types/
COPY --from=build /app/apps/backend/src/database/migrations apps/backend/src/database/migrations
COPY --from=build /app/apps/backend/drizzle.config.ts apps/backend/

EXPOSE 3001
CMD ["node", "apps/backend/dist/index.js"]

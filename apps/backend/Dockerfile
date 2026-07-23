FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10 --activate

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared-types/package.json packages/shared-types/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN node packages/shared-types/node_modules/typescript/bin/tsc -p packages/shared-types/tsconfig.json 2>/dev/null || true
RUN node apps/backend/node_modules/typescript/bin/tsc -p apps/backend/tsconfig.json

FROM base AS runner
WORKDIR /app
RUN apk add --no-cache tzdata
ENV TZ=Asia/Jakarta
ENV NODE_ENV=production
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

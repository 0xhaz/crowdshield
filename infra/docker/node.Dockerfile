# One image for the Node services (api, web, bot) and DB jobs (migrate, seed); compose picks the command.
FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter='!@crowdshield/ml'
ENV NODE_ENV=production
USER node

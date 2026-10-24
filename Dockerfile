FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV HOST=0.0.0.0 DB_FILE=/data/promostack.db
VOLUME /data
EXPOSE 3000
CMD ["node", "apps/api/src/server.ts"]

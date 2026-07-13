# Build context is the repo root (see infra/compose.prod.yaml).
# The api runs via tsx — no build step. Because @ctms/db and tools/ ship in
# this image, it doubles as the operational one-shot runner (ADR-0029):
# migrate, rotate-passwords, the digest cron, and eTMF-EMS import all run
# from it (EMS export's schema validation additionally needs xmllint — run
# that one from a checkout). The long-running api process itself still
# connects only as the DML-only ctms_app role.
FROM docker.io/library/node:22-slim

RUN npm install -g pnpm@11.9.0
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
# ctms-core is the root package: its devDependencies (tsx, nodemailer) run
# the tools/ CLIs.
RUN pnpm install --frozen-lockfile --filter @ctms/api... --filter ctms-core

COPY packages/core packages/core
COPY packages/db packages/db
COPY apps/api apps/api
COPY tools tools

EXPOSE 8787
CMD ["pnpm", "--filter", "@ctms/api", "start"]

FROM node:26-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG BACKEND_URL
ENV BACKEND_URL=${BACKEND_URL}
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN if [ -f package-lock.json ]; then npm ci;   elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile;   elif [ -f yarn.lock ]; then yarn --frozen-lockfile;   else npm i; fi

#RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Numeric unprivileged user (the image's `node`); the code stays root-owned, so it is read-only to the app.
USER 1000:1000
EXPOSE 3000
CMD ["node", "server.js"]

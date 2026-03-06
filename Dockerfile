# Multi-stage build: web (Vite) + server (Go) → nginx+supervisor runtime

FROM node:22-alpine AS web-builder
WORKDIR /app
RUN corepack enable
# Copy only dependency manifests for deterministic, cacheable installs
COPY .yarnrc.yml .yarnrc.yml
COPY .yarn .yarn
COPY package.json yarn.lock .
# Include workspace manifests that exist to maximize cache hits
COPY web/package.json web/package.json
COPY engine/package.json engine/package.json
COPY plugins/package.json plugins/package.json
COPY emails/package.json emails/package.json
COPY admin/package.json admin/package.json
COPY website/package.json website/package.json
COPY desktop/package.json desktop/package.json
# Use BuildKit cache for Yarn to speed up installs
RUN --mount=type=cache,target=/root/.cache/yarn \
    yarn install --immutable
# Now copy the rest of the sources
COPY vitest.config.mjs vitest.config.mjs
COPY web web
COPY engine engine
COPY plugins plugins
COPY emails emails
COPY admin admin
COPY website website
ARG VITE_PUBLIC_SENTRY_DSN
ARG VITE_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
ARG VITE_PUBLIC_SENTRY_SEND_DEFAULT_PII
ARG VITE_PUBLIC_SENTRY_RELEASE
ARG VITE_PUBLIC_AMPLITUDE_API_KEY
ARG VITE_PUBLIC_AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE
ARG VITE_REQUIRE_INVITE_CODE
# The production app lives on its own subdomain, so Vite can emit root-relative asset URLs.
ENV VITE_BASE_URL=/
ENV VITE_API_URL=/api
ENV VITE_INVITE_LINK_BASE_URL=https://app.shape.work
ENV VITE_SHARED_COOKIE_DOMAIN=.shape.work
ENV VITE_APP_HOSTS=app.shape.work,shape.work
ENV VITE_PUBLIC_SENTRY_DSN=$VITE_PUBLIC_SENTRY_DSN
ENV VITE_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$VITE_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
ENV VITE_PUBLIC_SENTRY_SEND_DEFAULT_PII=$VITE_PUBLIC_SENTRY_SEND_DEFAULT_PII
ENV VITE_PUBLIC_SENTRY_RELEASE=$VITE_PUBLIC_SENTRY_RELEASE
ENV VITE_PUBLIC_AMPLITUDE_API_KEY=$VITE_PUBLIC_AMPLITUDE_API_KEY
ENV VITE_PUBLIC_AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE=$VITE_PUBLIC_AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE
ENV VITE_REQUIRE_INVITE_CODE=$VITE_REQUIRE_INVITE_CODE
RUN yarn build
# Storybook build is optional - skip if .storybook not configured
RUN if [ -d "web/.storybook" ]; then yarn build-storybook; else mkdir -p web/storybook-static && echo '<html><body>Storybook not configured</body></html>' > web/storybook-static/index.html; fi

FROM golang:1.24-alpine AS server-builder
WORKDIR /src
RUN apk add --no-cache git
COPY server/go.mod server/go.sum server/
# Cache Go modules and build artifacts between builds to avoid recompiling dependencies on every image build.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd server && go mod download
COPY server server
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "-s -w" -o /out/server

FROM nginx:1.27-alpine
RUN apk add --no-cache supervisor gettext
COPY deploy/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deploy/nginx.conf.dev.template /etc/nginx/nginx.conf.dev.template
COPY deploy/nginx.conf.local /etc/nginx/nginx.conf.local
COPY deploy/supervisord.conf /etc/supervisord.conf
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh
COPY --from=web-builder /app/web/dist /usr/share/nginx/html/app
COPY --from=web-builder /app/admin/dist /usr/share/nginx/html/admin
COPY --from=web-builder /app/website/dist /usr/share/nginx/html/website
COPY --from=web-builder /app/web/storybook-static /usr/share/nginx/html/storybook
COPY --from=server-builder /out/server /usr/local/bin/server
ENV PORT=8080
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]

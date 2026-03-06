# Shape

---

# Local setup

## Working with subdomains locally:

Start server with `VITE_API_URL=/api yarn dev --host 0.0.0.0` (port comes from VITE_CLIENT_PORT env var)

Edit /etc/hosts with:

```
127.0.0.1 app.shape.local
127.0.0.1 your-workspace-subdomain.shape.local
```

Set .env.development vars:

```
VITE_API_URL=/api
VITE_SHARED_COOKIE_DOMAIN=.shape.local
```

Set server .env:

```
# ALLOWED_ORIGINS must include your VITE_CLIENT_PORT - example:
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:${VITE_CLIENT_PORT},http://*.shape.local
SESSION_COOKIE_DOMAIN=.shape.local
```

Edit vite.config.ts:

```
allowedHosts: ["acme.shape.local", "app.shape.local", "your-workspace-name.shape.local"],
```

## Prerequisites

- Node 18+ and Yarn (v4 is configured in this repo)
- Go 1.21+
- PostgreSQL 14+ (extensions: `uuid-ossp`, `pg_trgm`)
- Air for hot-reloading the server: `go install github.com/air-verse/air@latest`
- Playwright browsers: `yarn playwright:install`

## Install

```bash
yarn
(cd server && go mod tidy)
```

## Server environment

Create `server/.env` (server loads it automatically):

```bash
DATABASE_URL=postgres://localhost/conquer?sslmode=disable
SESSION_SECRET=dev-secret-change-me
# ALLOWED_ORIGINS is required - must match your VITE_CLIENT_PORT
ALLOWED_ORIGINS=http://localhost:${VITE_CLIENT_PORT}
# PORT is required - no default, must match VITE_SERVER_PORT
PORT=${VITE_SERVER_PORT}
ENVIRONMENT=development

# Public base URL for callbacks/webhooks
HOST=http://localhost:${VITE_SERVER_PORT}

# GitHub App (required)
# Slug of your GitHub App (from App settings > General)
GITHUB_APP_SLUG=
# GitHub App numeric ID (from App settings > About)
GITHUB_APP_ID=
# PEM contents of App's private key (paste whole PEM including BEGIN/END)
GITHUB_APP_PRIVATE_KEY=
# Webhook secret configured in App settings > Webhooks
GITHUB_APP_WEBHOOK_SECRET=
```

GitHub App URLs (computed from HOST):

- App installation callback (global): `HOST` + `/api/integrations/github/app/install/callback`
- App webhook (global): `HOST` + `/api/integrations/github/app/webhook`

Note: The install flow includes a state parameter that maps to the workspace server-side, so the callback is global and does not include a workspaceId in the path.

## Database

```bash
createdb conquer
# Migrations and required extensions are applied at server start (uuid-ossp, pg_trgm)
```

## Background jobs (Local SQS)

Local development assumes SQS handles background jobs. The easiest setup uses LocalStack:

1. **Start LocalStack**

   ```bash
   localstack start -d
   localstack status services  # confirm sqs shows "running"
   ```

2. **Install the helper CLI (if needed)**

   ```bash
   pip install awscli-local  # provides the `awslocal` shim
   ```

3. **Create the dead-letter queues**

   ```bash
   awslocal sqs create-queue \
     --queue-name conquer-dev-notification-email-dlq \
     --attributes VisibilityTimeout=60,MessageRetentionPeriod=1209600,SqsManagedSseEnabled=true

   awslocal sqs create-queue \
     --queue-name conquer-dev-discussion-summary-dlq \
     --attributes VisibilityTimeout=60,MessageRetentionPeriod=1209600,SqsManagedSseEnabled=true

   # capture the ARNs for step 4
   awslocal sqs get-queue-attributes \
     --queue-url http://localhost:4566/000000000000/conquer-dev-notification-email-dlq \
     --attribute-names QueueArn
   awslocal sqs get-queue-attributes \
     --queue-url http://localhost:4566/000000000000/conquer-dev-discussion-summary-dlq \
     --attribute-names QueueArn
   ```

4. **Create the primary queues with inline redrive policies (three attempts)**

   ```bash
   awslocal sqs create-queue --queue-name conquer-dev-notification-email --attributes '{"VisibilityTimeout":"120","MessageRetentionPeriod":"345600","ReceiveMessageWaitTimeSeconds":"10","SqsManagedSseEnabled":"true","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:conquer-dev-notification-email-dlq\",\"maxReceiveCount\":\"3\"}"}'

   awslocal sqs create-queue --queue-name conquer-dev-discussion-summary --attributes '{"VisibilityTimeout":"120","MessageRetentionPeriod":"345600","ReceiveMessageWaitTimeSeconds":"10","SqsManagedSseEnabled":"true","RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:conquer-dev-discussion-summary-dlq\",\"maxReceiveCount\":\"3\"}"}'
   ```

5. **Export the queue URLs (or add to `.env.development`)**
   ```bash
   NOTIFICATION_EMAIL_QUEUE_URL=http://localhost:4566/000000000000/conquer-dev-notification-email
   NOTIFICATION_EMAIL_DLQ_URL=http://localhost:4566/000000000000/conquer-dev-notification-email-dlq
   THREAD_SUMMARY_QUEUE_URL=http://localhost:4566/000000000000/conquer-dev-discussion-summary
   THREAD_SUMMARY_DLQ_URL=http://localhost:4566/000000000000/conquer-dev-discussion-summary-dlq
   AWS_REGION=us-east-1
   AWS_ENDPOINT_URL=http://localhost:4566
   AWS_ACCESS_KEY_ID=test
   AWS_SECRET_ACCESS_KEY=test
   ```

If LocalStack is stopped you will need to restart it and recreate the queues (or script the commands above). Leaving any of the queue URL variables unset simply disables the corresponding worker while keeping the server runnable.

## Protobufs

yarn proto
cd server && ./protos.sh

## Start the server (hot reload)

```bash
cd server && air
```

## Start the client (Vite dev server)

```bash
yarn dev  # http://localhost:${VITE_CLIENT_PORT}
```

## Storybook (dev-only)

```bash
yarn storybook
```

Storybook only runs locally and mirrors the client toolchain so UI primitives can be exercised without impacting production bundles.

## Build client

```bash
yarn build
yarn preview  # serve production build locally
```

## Tests

- Unit (all workspaces):

```bash
yarn test  # Vitest (non-watch)
```

- Integration (engine/client + integration suites):

```bash
yarn test:int
```

- Playwright (E2E) — requires server and client running:

```bash
yarn playwright         # headless
yarn playwright:headed  # headed
# First time: yarn playwright:install
```

## Linting & formatting

```bash
yarn lint
yarn format
```

## Deploy (GitHub Actions)

- App/API workflow: `.github/workflows/deploy.yml` (manual or on push to `main`).
  - Builds the Docker image from the repo `Dockerfile`, pushes to ECR, publishes SPA assets, and reconciles Terraform/ECS.
  - Required repo variables: `AWS_REGION`, `PRODUCTION_AWS_ROLE_TO_ASSUME`, `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `CONTAINER_NAME`, `ALLOWED_ORIGINS`, `ASSETS_S3_BUCKET`, `APP_CLOUDFRONT_DISTRIBUTION_ID`.
  - Required repo secrets: `DATABASE_URL`, `SESSION_SECRET`.
  - Defaults set by workflow: `PORT=8080`, `ENVIRONMENT=production`.
  - After you commit to `main`: expect a new ECS deployment; watch ECS service events and CloudWatch logs for rollout status.
- Marketing-site workflow: `.github/workflows/deploy-website.yml` (manual or on push to `main`).
  - Installs dependencies and runs `scripts/publish-website-assets.sh` to sync `website/dist` to the S3 bucket and invalidate CloudFront.
  - Required repo variables: `AWS_REGION`, `PRODUCTION_AWS_ROLE_TO_ASSUME`, `WEBSITE_ASSET_BUCKET`, `WEBSITE_CLOUDFRONT_DISTRIBUTION_ID`.
  - No additional secrets.

Marketing pages deploy to https://shape.work via CloudFront/S3 through the dedicated workflow, and the app ships via CloudFront/S3 at https://app.shape.work (admin/API at https://app.shape.work/admin and https://app.shape.work/api).

## Cursor Background Agents Bot ("Cursor")

This app can assign tasks to a bot user named `Cursor` that triggers a Cursor Background Agent to work on your repository.

Docs: https://docs.cursor.com/en/background-agent/api/overview

### 1) Enable the Cursor bot user

- The server will auto-create a bot user `cursor@shape.work` on startup.
- To use it in a workspace, invite that email to the workspace from the Members page (or API). The backend recognizes this special email and ensures the bot exists.

### 2) Configure per-channel settings in the UI

Open a channel's settings and configure:

- Cursor API Key (kept server-side, not returned via API)
- Cursor Repo (e.g. `your-org/your-repo` or full URL)
- Cursor Branch Prefix (e.g. `cursor/`)
- Cursor Ref (default branch name like `main`)
- Default Model (fetched from Cursor models API)

These settings are stored per-channel and used when launching agents for activities in that channel.

### 3) Configure server settings

Add to `server/.env`:

```bash
# Cursor Background Agents API base and webhook URL
CURSOR_API_BASE_URL=https://api.cursor.com
CURSOR_WEBHOOK_URL=http://localhost:${VITE_SERVER_PORT}/api/integrations/cursor/webhook
```

The webhook URL is used to receive agent status events. The server verifies signatures per-agent using secrets it generates when launching agents.

### 4) How it works

- Assign an activity to the `Cursor` bot to start an agent.
- The server builds a prompt and launches an agent using the channel's Cursor settings.
- The agent pushes commits/PRs to the configured repo and branch prefix.
- Webhook events update the activity with status and PR links; on finish, status moves to Pending Review.

### 5) Manual verification checklist

1. Ensure `CURSOR_API_BASE_URL` and `CURSOR_WEBHOOK_URL` are set and server running.
2. Invite `cursor@shape.work` to your test workspace.
3. In the channel settings, configure Cursor API Key, Repo, Branch Prefix, and Ref.
4. Assign an activity in that channel to `Cursor`.
5. Verify the agent launches and webhook updates appear on the activity.

### 6) Security notes

- The per-channel API key is stored server-side and not exposed via JSON.
- Webhook requests are validated using per-agent secrets included at launch.

### 7) Follow-ups and discussion replies

- Status updates post as replies by the `Cursor` bot.
- Replies in the discussion are forwarded to the agent as follow-ups while it is running.

# Notifications

- Muted: Channel will not be marked as unread in the UI when there is new activity.
- Unmuted: Channel will be marked as unread for new activity, but you won't get notified of new discussions. You can always subscribe to a discussion via the bell icon in the top right to begin receiving notifications of new replies to that discussion. You're automatically subscribed to discussions you create.
- Everything: You'll be automatically subscribed to every discussion created in the channel.

UI Copy:
Muted: "Currently muted. This {board | channel | chatroom} won't appear as unread when there is new activity."

Unmuted: "Currently unmuted. This {board | channel | chatroom} will appear as unread when there is new activity, but you won't receive notifications for new activity unless you're subscribed to individual {tasks | discussions}"

Everything: chat ? "Currently everything. You'll receive notifications for all new messages." : "Currently everything. You'll be auto-subscribed to all new {tasks | discussions} and receive notifications for every reply."

# Misc

1. Launch Offer
   https://shapeteams.com/?utm_source=launch&utm_medium=paid&utm_campaign=launch-offer
2. Google Ads
   https://shapeteams.com/?utm_source=google&utm_medium=search&utm_campaign=search-1

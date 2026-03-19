# `publish` Environment Configuration

GitHub Actions deploys to ECS from `.github/workflows/ci-cd.yml` using the GitHub environment named `publish`.

## Environment Secrets

Configure these as `publish` environment secrets:

- `ASSISTANTS_API_KEY`
- `CREDS_IV`
- `CREDS_KEY`
- `JWT_REFRESH_SECRET`
- `JWT_SECRET`
- `MONGO_URI`
- `OPENAI_API_KEY`
- `PGVECTOR_HOST`
- `POSTGRES_PASSWORD`
- `RAG_API_URL`

## Environment Variables

Configure these as `publish` environment variables:

- `MEILI_HOST`
- `APP_PORT`
- `APP_HOST`
- `ALLOW_REGISTRATION`
- `ALLOW_SOCIAL_LOGIN`
- `BAN_VIOLATIONS`
- `POSTGRES_USER`
- `POSTGRES_DB`
- `RAG_PORT`
- `SESSION_EXPIRY`
- `REFRESH_TOKEN_EXPIRY`
- `CONSOLE_JSON`
- `DEBUG_OPENAI`
- `MEILI_MASTER_KEY` if non-empty

## Defaults

If a variable is omitted, the workflow currently falls back to these defaults:

- `APP_PORT=3080`
- `APP_HOST=0.0.0.0`
- `CONSOLE_JSON=true`
- `DEBUG_OPENAI=true`
- `POSTGRES_USER=postgres`
- `POSTGRES_DB=librechat`
- `ALLOW_REGISTRATION=true`
- `SESSION_EXPIRY=1000 * 60 * 60 * 24 * 360`
- `REFRESH_TOKEN_EXPIRY=1000 * 60 * 60 * 24 * 360`
- `ALLOW_SOCIAL_LOGIN=false`
- `RAG_PORT=8000`
- `BAN_VIOLATIONS=false`
- `MEILI_MASTER_KEY=''`

`MEILI_HOST` has no safe default. The workflow now fails fast if it is missing. It also fails if any required secret is missing.

## Deployment Behavior

- Pushes to `main` build and push `730335261767.dkr.ecr.us-east-1.amazonaws.com/librechat:${GITHUB_SHA}`.
- The deploy job uses `environment: publish`.
- ECS is updated to the exact task definition revision registered for that SHA-tagged image.

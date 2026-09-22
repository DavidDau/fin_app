# Deploy FinApp on Render's free tier

This repository's `render.yaml` creates three Render resources:

1. `finapp-api`: FastAPI web service.
2. `finapp-web`: Vite/React static site.
3. `finapp-db`: Render Postgres database.

## Important free-tier limitation

This setup is suitable for a demo, portfolio, or short-lived hobby deployment only. Render's free Postgres instance expires 30 days after creation, permits no managed backups, and can be restarted for platform maintenance. Do not enter financial data that cannot be lost.

## Before creating the Blueprint

1. Push this repository to GitHub or GitLab. Do not commit `.env` files or secrets.
2. In `render.yaml`, choose unique names for `finapp-api` and `finapp-web` if these names are unavailable in your Render workspace. The final public URLs use these names, for example `https://finapp-api.onrender.com` and `https://finapp-web.onrender.com`.
3. Calculate the two values required during Blueprint creation:

   ```text
   FRONTEND_ORIGIN=https://<your-static-site-name>.onrender.com
   VITE_API_URL=https://<your-api-service-name>.onrender.com
   ```

`VITE_API_URL` must not include `/api/v1`; the frontend adds that path itself.

## Create the services

1. Sign in to Render and select **New → Blueprint**.
2. Connect the repository and select the branch containing `render.yaml`.
3. Render discovers the API, static site, and Postgres definitions. Confirm that all three use the `free` plan.
4. When Render requests values, supply `FRONTEND_ORIGIN` and `VITE_API_URL` from the preceding section. Render generates `JWT_SECRET_KEY`; never replace it with a value committed to Git.
5. Create the Blueprint and wait for the API pre-deploy migration, API health check, and static-site build to complete.

## Verify

Open these URLs:

```text
https://<your-api-service-name>.onrender.com/api/v1/health
https://<your-static-site-name>.onrender.com
```

The health endpoint must return `{"status":"ok","service":"finapp-api"}`. Register a test account, complete onboarding, create one transaction, reload, and sign back in to confirm database persistence.

## Operating without a payment method

- Monitor the Render Dashboard's free-instance hours, bandwidth, and build-minute usage.
- Export any data you care about before the database reaches 30 days.
- Do not upgrade any service or database from `free`; Render will show a paid-plan confirmation before such a change.
- Free web services and databases can restart or become unavailable. A later real launch needs a persistent, backed-up database.

# Vercel deployment

Production: https://agritrace-eosin.vercel.app

The Vercel project is `dhurandar4/agritrace`. Deploy the current working tree with
`npx vercel deploy --prod`. Deployment uploads exclude local secrets, recordings,
reports, test artifacts, training data and YOLO weights through `.vercelignore`.

## Production configuration

Configure `MONGO_URI`, `JWT_SECRET`, `GROQ_API_KEY` and `CEDA_API_TOKEN` as server
secrets. The live project has these configured. Public origin settings
`PUBLIC_APP_URL`, `FRONTEND_URL`, `APP_BASE_URL` and `VITE_APP_URL` must match the
production domain. Redeploy after changing environment variables. Payments use
`TEST_UPI` until a production payment provider is deliberately configured.

## Hosting constraints

The Hobby plan permits 12 serverless functions. Chat, advisory, heuristic
intelligence and admin handlers are dispatched by `api/core.js` from
`api/_handlers/`; their public URLs are preserved by rewrites. Underscore
directories hold imported modules rather than independent functions.

The build packages the build image's OpenMP runtime with
`scripts/prepare-vercel-native.mjs`. The Python forecast handler loads it before
LightGBM because the function runtime does not provide `libgomp.so.1`. The
pretrained artifacts remain bundled, and local inference is unaffected.

## Hosted photo inference

Vercel delegates photo validation and YOLO inference to the Railway service at
https://tomato-inference-production.up.railway.app. Production
`QUALITY_INFERENCE_URL` and `QUALITY_SERVICE_TOKEN` connect the two services.
`GET /health` reports model readiness; POST requests require the service token.
The service contains the supplied tomato detector and ripeness classifier.
Potato and onion photos remain eligible for manual review without an AI grade.

The Railway project is `agritrace-quality`, service `tomato-inference`.
Run `node scripts/prepare-quality-railway.mjs` to assemble the isolated Docker
build context under ignored `artifacts/quality/railway-service`. Only that
directory should be uploaded to Railway. The generated secret is stored outside
the upload context in ignored `artifacts/quality/railway-inference-secret.json`;
do not publish it. Container dependencies are CPU-only and models warm at startup.

## Verification

Production checks covered landing and frontend deep links, MongoDB health,
browser buyer sign-in, marketplace lists, authenticated admin users/tracking,
unauthenticated admin denial, and Python forecast method/input validation.
No CEDA refresh or fabricated prediction was used for these checks.

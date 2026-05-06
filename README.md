# Luminous

Chat-first mentor matching MVP with:

- Vite + React + TypeScript frontend
- Express backend
- DeepSeek chat/profile extraction
- Supabase-backed people, profiles, match requests, candidates, consent emails, and connections
- 50 seeded mock network profiles

## Local Setup

```bash
npm install
npm run api
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` to `http://localhost:8787`.

## Environment

Copy `.env.example` to `.env`.

```bash
DEEPSEEK_API_KEY=your_deepseek_key
DEEPSEEK_MODEL=deepseek-v4-flash
PORT=8787

DATA_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# For local development only, you can use this instead if RLS is off:
SUPABASE_ANON_KEY=your_anon_key
```

Use `DATA_BACKEND=mock` to run fully locally.

## Supabase

1. Open the Supabase SQL editor.
2. Run the migrations in `server/supabase/migrations` in filename order, or run `server/supabase/schema.sql` once.
3. Set `DATA_BACKEND=supabase` in `.env`.
4. Restart `npm run api`.

On server startup, Luminous upserts the 50 mock profiles into `public.people` using `external_key`.

Use `SUPABASE_SERVICE_ROLE_KEY` for production server writes. `SUPABASE_ANON_KEY` works only if your Supabase policies allow these inserts/selects, or if RLS is disabled during local MVP development.

## DeepSeek

DeepSeek is called only from the Express server. The browser never receives `DEEPSEEK_API_KEY`.

The app uses JSON mode with `response_format: { "type": "json_object" }` for structured profile extraction and chat payloads.

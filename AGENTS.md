# Repository Guidelines

## Project Structure & Module Organization
Backend TypeScript lives in `src/`: `index.ts` orchestrates scans, `worker/` hosts market, value, and options analyzers, `db/` wraps persistence helpers, and `scheduler.ts`/`server.ts` cover automation plus the dashboard API. Prisma models in `prisma/schema.prisma` back SQLite artifacts in `prisma/migrations/` and `dev.db`. Store sample CSVs in `data/`, compiled bundles in `dist/`, and keep the React dashboard inside `frontend/` (`src/` components, `public/` assets, Tailwind/Vite configs beside it).

## Build, Test, and Development Commands
Run `npm install` in the root and in `frontend/`. `npm run build` compiles the scanner, while `npm run start` or `npm run scan -- --value AAPL` executes one-off analyses. `npm run dev` hot-reloads in the CLI, `npm run server` boots the Express API, `npm run client` proxies to `frontend npm run dev`, and `npm run dashboard` runs both. `npx prisma migrate deploy` (or `prisma db push`) syncs the schema, `node verify-db.ts` checks DB connectivity, and `npm run docker:update` refreshes remote services.

## Coding Style & Naming Conventions
Code is modern TypeScript/React using ES modules, async/await, and 2-space indentation. Favor `camelCase` functions/constants, `PascalCase` types and React components, and `SCREAMING_SNAKE_CASE` env keys. Organize logic by feature (`worker/options`, `worker/scanner`, `frontend/src/components`), keep Prisma models singular, prefer named exports, and let Tailwind utility classes live directly in JSX—extract repeats with `class-variance-authority`.

## Testing Guidelines
There is no dedicated runner yet, so validate backend work with targeted commands (`npm run scan -- --market active`, `npm run scan -- --value MSFT`) and inspect `StockSnapshot` rows via `npx prisma studio`. Exercise API changes against a local server and screenshot dashboard tweaks in Vite preview. When adding automated coverage, use Node’s `node --test` for backend units or Vitest in `frontend/`; name files `*.spec.ts[x]`, colocate them, and stub remote data for determinism.

## Commit & Pull Request Guidelines
Commits follow Conventional Commits (`feat:`, `chore:`, `style:`) and should describe a single concern, e.g., `feat: add manual stock search to dashboard`. Pull requests need an intent summary, runnable verification commands, schema/env notes, and screenshots or GIFs for UI changes. Link related issues and highlight migration, cron, or Docker impacts so reviewers can reproduce your setup.

## Security & Configuration Tips
Secrets such as `POLYGON_API_KEY`, `DATABASE_URL`, or Yahoo cookies belong in `.env`, which is loaded through `dotenv`; add placeholders to `.env.example` when new keys appear. Reset local SQLite with `rm dev.db && npx prisma migrate dev` and keep `docker-compose.yml` in sync when touching external services.

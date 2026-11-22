# Working on Nimvo

## Project scope

Nimvo is a local-first SPA for monthly personal finances. It has no backend, accounts, or synchronization service. The app keeps a SQLite database in memory and exports it inside an encrypted `.nimvo` file.

`README.md` is a bilingual (Spanish and English) overview of what Nimvo is, for users. Technical details (setup, file format, architecture, deployment) live in this file. Update `README.md` only when user-visible features or limitations change, and update this file when the file format, requirements, or deployment change.

## Stack

- React 19 and TypeScript 6, built with Vite 8.
- React Router 7.
- Native HTML controls with custom styles (no component library).
- sql.js (SQLite WebAssembly) and the Web Crypto API.
- Zod for validation.
- `@zxcvbn-ts` (language-independent lists only), loaded on demand for the password strength indicator. It only warns and never blocks vault creation.
- Lexend variable font, self-hosted and bundled via `@fontsource-variable/lexend` under SIL OFL 1.1. Amounts, dates and numeric fields use the system monospace font.
- Vitest, React Testing Library and jsdom for unit and component tests; Playwright (Chromium and Firefox) and axe-core for E2E and accessibility.
- Oxlint.

## Environment and commands

- Use Node.js 24, pinned in `.nvmrc`, and npm. Do not replace `package-lock.json` with another lockfile. Run `nvm install` first if Node 24 is not installed.
- Requirements to run the app: Chromium or Firefox. Direct saving to a chosen file needs Chromium on HTTPS or localhost.
- Install: `git clone https://github.com/paablobs/nimvo.git && cd nimvo && nvm use && npm ci`.
- Develop: `npm run dev`; check the production build locally with `npm run build` and `npm run preview`.
- Install the Playwright browsers once: `npx playwright install chromium firefox`.
- Watch tests: `npm run test:watch`.
- Lint: `npm run lint`.
- Run unit and component tests: `npm test`.
- Build and type-check: `npm run build`.
- Run E2E tests: `npm run test:e2e`. This requires the Playwright Chromium and Firefox browsers.
- The build requires no environment variables. `VITE_BASE_PATH` only sets the deployment subdirectory.

During development, run the test closest to the change first. Before handing off, run `npm run lint`, `npm test`, and `npm run build`. Run E2E tests when changing user flows, navigation, persistence, downloads, file access, responsive behavior, or accessibility.

## Code map

- `src/app`: providers and routes.
- `src/features`: screens and user-flow logic.
- `src/components`: shared UI components.
- `src/domain`: types, dates, money, validation, and pure calculations.
- `src/crypto`: encrypted container parsing and creation.
- `src/db/migrations`: versioned SQLite schema.
- `src/db/repositories`: domain-specific reads and writes.
- `src/db/worker`: typed protocol, client, and SQLite execution inside a Web Worker.
- `src/theme`: theme preference and tokens.
- `e2e`: full flows in Chromium and Firefox.

The main flow is:

```text
React -> VaultSession -> DatabaseClient -> Web Worker -> repositories -> in-memory SQLite
                                      |
.nimvo file <- AES-GCM/PBKDF2 <- SQLite export
```

React components must not run SQL or access `LocalDatabase` directly. Add typed worker operations and implement them through repositories.

## Contracts to preserve

### Money and dates

- Represent money as safe integer cents. Never use floating-point values for amounts.
- Reuse `src/domain/money.ts` to parse, add, and format ARS values as safe integer cents. The active presentation format may be `en-US` or `es-AR`; parsers accept both canonical separator conventions.
- Civil dates use `YYYY-MM-DD` and have no time-zone semantics. Timestamps are ISO-8601 instants.
- The monthly balance subtracts every debt, whether paid or unpaid. Marking a debt as paid changes only the outstanding debt total.
- "Debts" in code and schema are the fixed expenses users see in the UI. Each vault stores one currency: ARS (default), USD, or EUR. ARS and USD display with `$`; EUR with `€`. Changing the currency changes only the denomination and never converts amounts. Amounts display as `1,234.56` or `1.234,56`, and the number-format preference survives language changes.
- Dates display in the local format (for example `5 oct 2026`) but are always stored as `YYYY-MM-DD`.

Monthly calculation:

```text
fixed_total   = sum of all fixed expenses of the month
fixed_pending = sum of unpaid fixed expenses
expenses      = sum of daily expenses
balance       = income - fixed_total - expenses
```

- A fixed expense with no amount is pending completion: it is excluded from totals and balance until an amount is set.
- In the monthly table, unpaid fixed expenses turn yellow from three days before the due date and red on or after it. Paid ones are green. Items without a due date keep the normal color.
- Fixed-expense templates are recurring: they can be reordered while generating a month, and amounts can be left pending to fill in later.

### Persistence and worker

- Make compound writes transactional.
- Preserve schema foreign keys, constraints, and indexes.
- Do not edit a published migration. Add a migration with a higher version and test opening, migration, export, and reopening.
- When adding a mutating operation, update all of these together:
  1. `DomainOperation` in `src/db/worker/protocol.ts`.
  2. Dispatch in `src/db/worker/operations.ts`.
  3. `mutationKinds` in `src/features/vault/VaultSession.ts`.
  4. Tests for the affected repository, worker, or session.
- `VaultSession` serializes operations. Do not add parallel access that could save stale state or lose the unsaved-changes marker.

### Encryption and files

- Treat changes under `src/crypto`, and changes to `VaultSession` or `VaultFileAccess`, as security-sensitive. Do not weaken iteration counts, sizes, validation, limits, or header authentication without an explicit decision and compatibility tests.
- Authenticate and decrypt the container before opening SQLite.
- Clear sensitive buffers in `finally` blocks when they are no longer needed.
- A failed attempt to open another vault must not close or replace the active session.
- Legacy `.moneo` files are imports. Never retain their file handle for overwriting.
- Invoke file pickers synchronously from the user action. Awaiting asynchronous work first loses the browser's required transient activation.
- Firefox may not provide the File System Access API. Always preserve the download fallback.

### File handling behavior

- Entry points: **Create file** (set a password, open a new in-memory database) and **Open file** (pick a `.nimvo` and enter its password).
- After any change the header shows an unsaved-changes marker and the tab warns before closing or reloading. The vault auto-locks after 15 minutes of inactivity even with unsaved changes.
- Chromium with direct file access: **Choose where to save** picks the first target and links it to the tab; **Save** overwrites the linked file; **Save as…** picks another target and links it; **Download copy** makes an independent download and does not change the link. The link lasts only for the session and is dropped when the vault locks or the tab closes. Direct access requires a secure context (HTTPS in production, localhost in development).
- Firefox and browsers without direct access: the primary action is **Download copy**; the user reopens the latest copy with the file picker. Nothing may depend on Chromium-only APIs to read or export data.
- A `.nimvo` may live in a folder synced by Drive, Dropbox, OneDrive and similar. Nimvo does not sync or resolve conflicts between parallel edits, and a forgotten password is unrecoverable.
- When changing save/open flows, keep the user-facing guidance consistent: keep the latest copy plus at least one earlier backup, check the file date before opening, never edit the same copy on two devices at once, and wait for the cloud folder to finish syncing before opening elsewhere.

## File format and security

`.nimvo` is a versioned binary container, not a plain `.sqlite` file:

```text
magic | version | KDF parameters | salt | IV | encrypted SQLite + tag
```

- AES-256-GCM encrypts and authenticates the content. The header, including the Argon2id parameters, is part of the authenticated data.
- Current format (v2): Argon2id (`hash-wasm`) derives the key with a random 16-byte salt and header-stored parameters of 64 MiB memory, 3 passes, parallelism 1. Derivation runs in its own Web Worker, which is terminated afterwards.
- On open, parameters are range-checked before any derivation (19–256 MiB memory, 2–10 passes, parallelism 1) so a crafted file cannot force excessive resource use.
- The salt is fixed per file; every save draws a fresh 12-byte IV through Web Crypto. The key is derived once when the vault is created or opened.
- The password is not retained. After derivation only a non-extractable, encrypt-only AES key stays in memory.
- The decrypted database lives in the SQLite Web Worker's memory. Sensitive buffers are overwritten when no longer needed, within JavaScript limits.
- A tampered, truncated, oversized, or wrong-password file is rejected without loading partial data. The maximum accepted container is 128 MiB.
- v1 files (PBKDF2-HMAC-SHA-256, 1,800,000 iterations) still open. The first save rewrites them as v2, which older Nimvo versions cannot open (they report a newer file version). Nimvo shows a notice when a v1 file is opened, before the first save. Keep this behavior and the notice.
- Legacy `.moneo` files are opened as compatibility imports; the next copy is saved as `.nimvo`, and a legacy file opened from the picker is never linked for overwriting.

## Database

SQLite runs through `sql.js` inside a Web Worker. Components run no SQL: they call typed operations that the worker resolves through repositories. Writes use transactions, and migrations run with foreign keys, indexes and `PRAGMA user_version`.

Main tables: `months`, `categories`, `recurring_debt_templates`, `debts`, `expenses`, `app_meta`.

## Deployment and offline

- The build outputs static files to `dist/`. Hosting must serve `index.html` as the fallback for React Router routes.
- Pushes to `main` are built and published to GitHub Pages by `.github/workflows/pages.yml`. The project site uses the base path `/nimvo/` (`VITE_BASE_PATH`) and generates a `404.html` fallback for React Router routes.
- Fonts, SQLite WASM and all other assets are bundled. In production builds an in-repo service worker (`dist/sw.js`, generated by `vite.pwa.ts`) precaches only the static application files. It must never cache data, `.nimvo` files, or passwords. After the first load the app works offline and can be installed from the browser (`manifest.webmanifest`). `npm run dev` registers no service worker.
- Updates are never applied automatically: a notice appears, and while there are unsaved changes the update button stays disabled, because reloading discards the in-memory vault.

### User interface

- User-facing copy supports English (the default) and Spanish. Keep translations in the typed i18n catalog and expose preferences from the header.
- Use semantic HTML, accessible names, and keyboard navigation. Start dialogs from `AccessibleDialog`.
- Check tables and dialogs at mobile widths. Wide tables must retain usable horizontal scrolling. On narrow screens fixed expenses and expenses render as stacked cards without horizontal scrolling.
- `localStorage` stores only presentation preferences: theme, language (`nimvo-language`), and number format (`nimvo-number-format`). Do not persist financial data, passwords, keys, or SQLite data outside the encrypted file.

## Tests

- Keep unit tests beside the module as `*.test.ts` or `*.test.tsx`.
- For domain logic, repositories, migrations, and encryption, test invariants and invalid input as well as successful paths.
- In component tests, query by accessible role and name where possible.
- E2E flows involving files or downloads must cover both browsers. Preserve keyboard, mobile viewport, and axe checks for relevant UI changes.
- Avoid large snapshots. Prefer assertions about results, persisted state, and visible behavior.
- Existing coverage: money calculations, migrations and repositories, encryption and file corruption, direct save and download, monthly operation, history, keyboard navigation, and a basic accessibility review.

## Style and change discipline

- TypeScript uses ESM and local imports with `.ts` or `.tsx` extensions.
- Follow the existing format: single quotes, no semicolons, and explicit types at public boundaries.
- Keep domain logic out of components. Extract pure functions for reusable calculations and validation.
- Do not edit generated artifacts such as `dist`, Playwright results, or TypeScript build output.
- Preserve unrelated local changes. Do not revert or reformat files outside the task scope.
- The Git history follows Conventional Commits such as `feat:`, `fix:`, and `docs:` when a commit is requested.

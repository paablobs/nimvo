# Working on Nimvo

## Project scope

Nimvo is a local-first SPA for monthly personal finances. It has no backend, accounts, or synchronization service. The app keeps a SQLite database in memory and exports it inside an encrypted `.nimvo` file.

Read `README.md` before changing user-facing behavior, the file format, requirements, or deployment. Update it when any of those areas change.

## Environment and commands

- Use Node.js 24, pinned in `.nvmrc`, and npm. Do not replace `package-lock.json` with another lockfile.
- Install: `nvm use && npm ci`.
- Develop: `npm run dev`.
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

### User interface

- User-facing copy supports English (the default) and Spanish. Keep translations in the typed i18n catalog and expose preferences from the header.
- Use semantic HTML, accessible names, and keyboard navigation. Start dialogs from `AccessibleDialog`.
- Check tables and dialogs at mobile widths. Wide tables must retain usable horizontal scrolling.
- `localStorage` stores only presentation preferences: theme, language (`nimvo-language`), and number format (`nimvo-number-format`). Do not persist financial data, passwords, keys, or SQLite data outside the encrypted file.

## Tests

- Keep unit tests beside the module as `*.test.ts` or `*.test.tsx`.
- For domain logic, repositories, migrations, and encryption, test invariants and invalid input as well as successful paths.
- In component tests, query by accessible role and name where possible.
- E2E flows involving files or downloads must cover both browsers. Preserve keyboard, mobile viewport, and axe checks for relevant UI changes.
- Avoid large snapshots. Prefer assertions about results, persisted state, and visible behavior.

## Style and change discipline

- TypeScript uses ESM and local imports with `.ts` or `.tsx` extensions.
- Follow the existing format: single quotes, no semicolons, and explicit types at public boundaries.
- Keep domain logic out of components. Extract pure functions for reusable calculations and validation.
- Do not edit generated artifacts such as `dist`, Playwright results, or TypeScript build output.
- Preserve unrelated local changes. Do not revert or reformat files outside the task scope.
- The Git history follows Conventional Commits such as `feat:`, `fix:`, and `docs:` when a commit is requested.

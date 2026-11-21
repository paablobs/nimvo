# Nimvo

Nimvo es una aplicación web local para administrar finanzas mensuales como una planilla. Permite registrar meses, gastos fijos y gastos, comparar períodos y guardar todo en un único archivo cifrado `.nimvo`.

No usa backend, cuentas de usuario ni servicios externos. La base SQLite se ejecuta en el navegador y los datos financieros no se guardan en `localStorage` ni se envían por red.

## Funciones

- Crear y abrir una bóveda protegida con contraseña.
- Administrar meses con ingresos editables.
- Crear plantillas de gastos fijos recurrentes, ordenarlas al generar un mes y dejar importes pendientes para completarlos después.
- Crear, editar, ordenar, pagar y eliminar gastos fijos de cada mes.
- Registrar, editar y eliminar gastos diarios.
- Crear, renombrar y archivar categorías.
- Consultar gastos agrupados por categoría.
- Comparar meses, ver la variación del saldo frente al mes anterior, un gráfico de ingresos contra gastos y el desglose por categoría.
- Guardar el archivo en una ubicación elegida o descargar una copia.
- Avisar cuando hay cambios sin guardar antes de cerrar la pestaña.
- Bloquear automáticamente la bóveda después de 15 minutos sin actividad, incluso si hay cambios sin guardar.
- Alternar entre tema claro y oscuro.
- Ver las fechas de vencimiento y de los gastos en formato local (por ejemplo, `5 oct 2026`); internamente siguen guardándose como `YYYY-MM-DD`.
- En pantallas angostas, los gastos fijos y los gastos se muestran como tarjetas apiladas, sin desplazamiento horizontal.
- Ver un indicador de seguridad al elegir la contraseña. Solo advierte: nunca impide crear la bóveda.
- Usar la aplicación sin conexión después de la primera carga e instalarla desde el navegador.

La interfaz admite español e inglés. Inglés es el idioma inicial; el selector de preferencias del encabezado permite cambiarlo. Cada bóveda guarda una moneda única: ARS (por defecto), USD o EUR. ARS y USD se muestran con `$`; EUR se muestra con `€`. Cambiar la moneda no convierte los importes: solo cambia su denominación. ARS, USD y EUR pueden mostrarse como `1,234.56` o `1.234,56`, y la preferencia numérica se conserva al cambiar de idioma. Internamente, todo se calcula con centavos enteros para evitar errores de punto flotante.

## Cálculo mensual

```text
gastos_fijos_total     = suma de todos los gastos fijos del mes
gastos_fijos_pendiente = suma de los gastos fijos sin pagar
gastos          = suma de los gastos diarios
saldo           = ingresos - gastos_fijos_total - gastos
```

Marcar un gasto fijo como pagado reduce los gastos fijos pendientes, pero no cambia el saldo: el importe ya estaba reservado dentro del total de gastos fijos.
Un gasto fijo sin importe aparece como pendiente de completar y no entra en los totales ni en el saldo hasta que se indique su importe.
En la tabla mensual, los gastos fijos pendientes se muestran en amarillo desde tres días antes del vencimiento y en rojo el día del vencimiento o después. Los pagados se muestran en verde. Los gastos sin vencimiento conservan el color normal.

## Requisitos

- Node.js 24 LTS.
- npm.
- Chromium o Firefox para ejecutar la aplicación.
- Chromium en HTTPS o localhost para guardar directamente sobre un archivo elegido.

## Instalación

```sh
git clone https://github.com/paablobs/nimvo.git
cd nimvo
nvm use
npm ci
npm run dev
```

El archivo `.nvmrc` fija la rama 24. Si todavía no la tenés instalada, ejecutá `nvm install` antes de `nvm use`.

Vite mostrará la dirección local de la aplicación. Para comprobar la compilación de producción:

```sh
npm run build
npm run preview
```

No hay variables de entorno obligatorias.

## Uso del archivo `.nimvo`

Al iniciar, elegí una de estas opciones:

1. **Crear archivo**: definí una contraseña y abrí una base nueva en memoria.
2. **Abrir archivo**: seleccioná un `.nimvo` existente e ingresá su contraseña.

Después de modificar datos, el encabezado muestra `Cambios sin guardar`. Guardá antes de cerrar o recargar la pestaña.

### Chromium con acceso directo a archivos

- **Elegir dónde guardar** selecciona el primer destino y lo vincula a la pestaña.
- **Guardar** sobrescribe el archivo vinculado.
- **Guardar como…** elige otro destino y lo convierte en el archivo vinculado.
- **Descargar copia** crea una descarga independiente y no cambia el vínculo.

El vínculo se conserva solo durante la sesión. Al bloquear la bóveda o cerrar la pestaña, se descarta.

### Firefox y navegadores sin acceso directo

El botón principal es **Descargar copia**. Para continuar más tarde, abrí la copia más reciente con el selector de archivos. La aplicación no depende de APIs exclusivas de Chromium para leer o exportar datos.

Podés ubicar el `.nimvo` en una carpeta que tu sistema operativo sincronice con Drive, Dropbox, OneDrive u otro servicio. Nimvo no sincroniza por sí mismo ni resuelve conflictos entre dos copias editadas en paralelo.

## Copias de respaldo

- Conservá la copia más reciente y al menos un respaldo anterior.
- Revisá la fecha del archivo antes de abrirlo.
- No edites la misma copia desde dos equipos al mismo tiempo.
- Esperá a que la carpeta en la nube termine de sincronizar antes de abrir o cerrar el archivo en otro equipo.

Una contraseña olvidada no se puede recuperar. Sin ella, tampoco se pueden recuperar los datos cifrados.

## Seguridad y formato

`.nimvo` no es una base `.sqlite` legible por herramientas externas. Es un contenedor binario versionado con esta estructura:

```text
magic | versión | parámetros KDF | salt | IV | SQLite cifrado + tag
```

- AES-256-GCM cifra y autentica el contenido.
- Argon2id (formato v2) deriva la clave con un salt aleatorio de 16 bytes y estos parámetros, guardados en la cabecera: 64 MiB de memoria, 3 pasadas y paralelismo 1. La derivación corre en un Web Worker propio que se cierra al terminar.
- Al abrir un archivo, los parámetros se validan antes de derivar nada (memoria entre 19 MiB y 256 MiB, 2 a 10 pasadas, paralelismo 1), de modo que un archivo manipulado no puede forzar un consumo excesivo.
- El salt es fijo por archivo y cada guardado genera un IV nuevo de 12 bytes mediante Web Crypto. La clave se deriva una sola vez al crear o abrir la bóveda.
- La cabecera, incluidos los parámetros de Argon2id, forma parte de los datos autenticados.
- La contraseña no se conserva: tras derivar la clave se descarta, y en memoria queda solo una clave AES no extraíble de uso exclusivo para cifrar.
- La base descifrada vive en la memoria del Web Worker de SQLite.
- Los buffers sensibles se sobrescriben cuando dejan de usarse, dentro de las limitaciones de JavaScript.
- Un archivo alterado, truncado o abierto con otra contraseña se rechaza sin cargar datos parciales.
- El tamaño máximo aceptado para un contenedor es 128 MiB.

Los archivos del formato v1 (PBKDF2-HMAC-SHA-256 con 1.800.000 iteraciones) se siguen abriendo. **La primera vez que se guarda un archivo v1, se escribe en el formato v2, y las versiones anteriores de Nimvo no pueden abrir un archivo v2** (muestran que el archivo es de una versión más nueva). Si usás varios equipos con la misma carpeta sincronizada, actualizá Nimvo en todos antes de guardar.

Las versiones actuales también pueden abrir archivos `.moneo` creados por versiones anteriores. Al abrir uno, Nimvo lo trata como una importación de compatibilidad y la próxima copia se guarda como `.nimvo`; un archivo legado abierto desde el selector no queda vinculado para sobrescritura.

`localStorage` persiste únicamente preferencias de presentación: tema (`nimvo-theme`), idioma (`nimvo-language`) y formato numérico (`nimvo-number-format`). Nunca guarda contraseñas, claves, datos financieros ni SQLite.

## Arquitectura

```text
src/
├── app/          rutas y providers
├── components/   componentes visuales compartidos
├── crypto/       contenedor, derivación de clave y AES-GCM
├── db/
│   ├── migrations/    esquema SQLite versionado
│   ├── repositories/  consultas tipadas por dominio
│   └── worker/        worker y protocolo de mensajes
├── domain/       tipos, dinero, fechas y cálculos puros
├── features/     bóveda, meses, gastos fijos, gastos e historial
├── test/         configuración y utilidades de pruebas
└── theme/        tema y tokens visuales

e2e/              pruebas Playwright
```

SQLite se ejecuta con `sql.js` dentro de un Web Worker. Los componentes React no ejecutan SQL: llaman operaciones tipadas que el worker resuelve mediante repositorios. Las escrituras usan transacciones y las migraciones se ejecutan con claves foráneas, índices y `PRAGMA user_version`.

Tablas principales:

- `months`
- `categories`
- `recurring_debt_templates`
- `debts`
- `expenses`
- `app_meta`

## Stack

- React 19 y TypeScript 6.
- Vite 8.
- Controles HTML nativos con estilos propios (sin biblioteca de componentes).
- React Router 7.
- sql.js y SQLite WebAssembly.
- Web Crypto API y `hash-wasm` (Argon2id).
- Zod.
- `@zxcvbn-ts` (solo listas independientes del idioma), cargado bajo demanda para el indicador de seguridad de la contraseña.
- Lexend variable, autohospedada y empaquetada con la aplicación mediante `@fontsource-variable/lexend` bajo SIL OFL 1.1. Los importes, fechas y campos numéricos usan la fuente monoespaciada del sistema.
- Vitest, React Testing Library y jsdom.
- Playwright, Chromium, Firefox y axe-core.
- Oxlint.

## Pruebas

Instalá los navegadores de Playwright la primera vez:

```sh
npx playwright install chromium firefox
```

Luego podés ejecutar:

```sh
npm run lint       # análisis estático
npm test           # pruebas unitarias y de componentes
npm run test:watch # Vitest en modo interactivo
npm run test:e2e   # flujos completos en Chromium y Firefox
npm run build      # chequeo de TypeScript y build de producción
```

Las pruebas cubren cálculos monetarios, migraciones y repositorios, cifrado y corrupción de archivos, guardado directo y descarga, operación mensual, historial, navegación por teclado y una revisión básica de accesibilidad.

## Despliegue y funcionamiento sin conexión

El build genera archivos estáticos en `dist/`. El hosting debe servir `index.html` como fallback para las rutas de React Router.

La fuente Lexend, SQLite WASM y el resto de los recursos se empaquetan con la aplicación. En el build de producción, un service worker propio (`dist/sw.js`, generado por `vite.pwa.ts`) precachea únicamente los archivos estáticos de la aplicación; no cachea datos, archivos `.nimvo` ni contraseñas. Después de la primera carga, la aplicación puede abrirse y usarse sin conexión, y puede instalarse desde el navegador (`manifest.webmanifest`). Las actualizaciones nunca se aplican solas: aparece un aviso y, si hay cambios sin guardar, el botón de actualizar queda deshabilitado hasta que guardes, porque recargar descarta la bóveda abierta en memoria. En desarrollo (`npm run dev`) no se registra ningún service worker.

El acceso directo al sistema de archivos requiere un contexto seguro: HTTPS en producción o localhost durante el desarrollo.

Los cambios enviados a `main` se compilan y publican en GitHub Pages mediante el workflow `.github/workflows/pages.yml`. El sitio del repositorio usa la ruta base `/nimvo/` y genera un fallback `404.html` para las rutas de React Router.

## Limitaciones actuales

- Una sola moneda por archivo: ARS, USD o EUR. No hay conversión entre monedas.
- Sin backend, cuentas, recuperación remota ni sincronización propia.
- Sin colaboración entre varias personas o pestañas.
- Sin importación automática desde Excel o bancos.
- Sin presupuestos por categoría, cuotas, conciliación bancaria ni gráficos avanzados (el historial incluye un único gráfico de barras).
- Sin aplicación móvil nativa.
- Sin recuperación de contraseña.
- Cerrar con cambios sin guardar puede provocar pérdida de datos.

# English

Nimvo is a local-first web application for managing monthly finances as a spreadsheet. It tracks months, recurring fixed expenses, daily expenses, categories, balances, and historical comparisons in one encrypted `.nimvo` file.

It has no backend, user accounts, or remote database. SQLite runs inside the browser, and financial data is neither stored in `localStorage` nor sent over the network. English is the default interface language; the preferences menu can switch to Spanish and choose the ARS number format independently.

## Features

- Create and open password-protected vaults.
- Track editable income for each month.
- Create recurring fixed-expense templates and apply them to new months.
- Reorder templates while creating a month and fill in missing fixed-expense amounts later.
- Create, edit, reorder, pay, and delete each month's fixed expenses.
- Create, edit, and delete daily expenses.
- Create, rename, and archive expense categories.
- Review expenses by category and compare monthly history, including balance change against the previous month and an income-versus-spending chart.
- Save directly to a selected file in supported Chromium browsers or download a copy in other browsers.
- Automatically lock the vault after 15 minutes without activity, even when there are unsaved changes.
- Warn about unsaved changes and switch between light and dark themes.
- Show due and expense dates in the local format (for example `Oct 5, 2026`); they are still stored as `YYYY-MM-DD`.
- On narrow screens, fixed expenses and expenses render as stacked cards without horizontal scrolling.
- See a strength indicator while choosing a password. It only warns and never blocks vault creation.
- Use the app offline after the first load and install it from the browser.

Each vault uses one stored currency: ARS by default, USD, or EUR. ARS and USD use `$`; EUR uses `€`. Changing the currency changes the denomination without converting amounts. Amounts can use `1,234.56` or `1.234,56` formatting. Calculations use integer cents to avoid floating-point errors. The monthly balance is income minus total fixed expenses and daily expenses. Marking a fixed expense as paid changes the pending fixed-expense amount but not the balance because the expense was already included in the total.
Fixed expenses with an unknown amount remain pending and are excluded from totals and balance until their amount is entered.
In the monthly table, unpaid fixed expenses turn yellow during the three days before their due date and red on or after it. Paid fixed expenses turn green. Items without a due date keep the normal color.

## Requirements and setup

- Node.js 24 LTS.
- npm.
- Chromium or Firefox.
- HTTPS or localhost for direct file-system access in Chromium.

```sh
git clone https://github.com/paablobs/nimvo.git
cd nimvo
nvm use
npm ci
npm run dev
```

There are no required environment variables. Use `npm run build` and `npm run preview` to check the production build locally.

## File handling and backups

Create a new vault with a password or open an existing `.nimvo` file. Save or download a fresh copy after making changes. Keep at least one older backup, avoid editing the same copy on two devices at once, and wait for cloud-synced folders to finish syncing before switching devices.

Passwords cannot be recovered. Without the password, the encrypted financial data cannot be recovered either. Current versions can import legacy `.moneo` files and save the next copy in the `.nimvo` format. Version 1 files (PBKDF2-HMAC-SHA-256, 1,800,000 iterations) still open, but the first save rewrites them as version 2, which older Nimvo versions cannot open: update Nimvo on every device that shares the synced file before saving.

## Security

The `.nimvo` format is a versioned binary container, not a plain SQLite database. It uses AES-256-GCM for authenticated encryption and, in the current v2 format, Argon2id for key derivation with a random 16-byte salt and parameters stored in the header (64 MiB of memory, 3 passes, parallelism 1), run in a dedicated Web Worker that is terminated afterwards. The parameters are range-checked before any derivation (19 MiB to 256 MiB, 2 to 10 passes, parallelism 1), so a crafted file cannot force excessive memory use, and they are authenticated with the rest of the header. The salt is fixed per file and every save draws a new 12-byte IV; the key is derived once when the vault is created or opened. The password is not retained: only a non-extractable, encrypt-only AES key stays in memory. Modified, truncated, oversized, or incorrectly decrypted files are rejected before partial data is loaded.

The decrypted database remains in the SQLite Web Worker memory. Sensitive buffers are overwritten when they are no longer needed, within JavaScript runtime limitations. The maximum accepted container size is 128 MiB.

## Development

The application uses React 19, TypeScript 6, Vite 8, React Router 7, sql.js, Web Crypto, hash-wasm (Argon2id), Zod, and `@zxcvbn-ts` (lazy-loaded for the password indicator). Vitest and React Testing Library cover unit and component behavior; Playwright covers full Chromium and Firefox flows.

```sh
npm run lint
npm test
npm run test:watch
npm run test:e2e
npm run build
```

## Deployment and offline behavior

Pushes to `main` are built and deployed to GitHub Pages by `.github/workflows/pages.yml`. The project site uses `/nimvo/` as its base path and includes a `404.html` fallback for React Router routes.

The application bundles its source, SQLite WASM, and the Lexend font. Amounts, dates, and numeric fields use the system monospace font. In production builds a small in-repo service worker (`dist/sw.js`, generated by `vite.pwa.ts`) precaches the static application files only; it never caches data, `.nimvo` files, or passwords. After the first load the app opens and works offline and can be installed from the browser (`manifest.webmanifest`). Updates are never applied automatically: a notice appears, and while there are unsaved changes the update button stays disabled until you save, because reloading discards the in-memory vault. No service worker is registered by `npm run dev`.

## Current limitations

Nimvo supports one currency per vault (ARS, USD, or EUR) and does not convert between them. It has no account system, remote recovery, built-in synchronization, multi-user collaboration, automatic bank or spreadsheet imports, category budgets, installments, bank reconciliation, advanced charts (the history includes a single income-versus-spending bar chart), native mobile application, or password recovery.

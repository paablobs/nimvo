# Nimvo

Nimvo es una aplicación web local para administrar finanzas mensuales como una planilla. Permite registrar meses, gastos fijos y gastos, comparar períodos y guardar todo en un único archivo cifrado `.nimvo`.

No usa backend, cuentas de usuario ni servicios externos. La base SQLite se ejecuta en el navegador y los datos financieros no se guardan en `localStorage` ni se envían por red.

## Funciones

- Crear y abrir una bóveda protegida con contraseña.
- Administrar meses con ingresos editables.
- Crear plantillas de gastos fijos recurrentes y usarlas al generar un mes.
- Crear, editar, pagar y eliminar gastos fijos.
- Registrar, editar y eliminar gastos diarios.
- Crear, renombrar y archivar categorías.
- Consultar gastos agrupados por categoría.
- Comparar meses y desplegar su desglose por categoría.
- Guardar el archivo en una ubicación elegida o descargar una copia.
- Avisar cuando hay cambios sin guardar antes de cerrar la pestaña.
- Alternar entre tema claro y oscuro.

La interfaz admite español e inglés. Inglés es el idioma inicial; el selector de preferencias del encabezado permite cambiarlo. ARS puede mostrarse como `1,234.56` o `1.234,56`, y la preferencia numérica se conserva al cambiar de idioma. Internamente, todo se calcula con centavos enteros para evitar errores de punto flotante.

## Cálculo mensual

```text
gastos_fijos_total     = suma de todos los gastos fijos del mes
gastos_fijos_pendiente = suma de los gastos fijos sin pagar
gastos          = suma de los gastos diarios
saldo           = ingresos - gastos_fijos_total - gastos
```

Marcar un gasto fijo como pagado reduce los gastos fijos pendientes, pero no cambia el saldo: el importe ya estaba reservado dentro del total de gastos fijos.

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
- PBKDF2-HMAC-SHA-256 deriva la clave con un salt aleatorio y 1.800.000 iteraciones.
- Cada exportación genera un salt de 16 bytes y un IV de 12 bytes mediante Web Crypto.
- La cabecera forma parte de los datos autenticados.
- La contraseña y la clave derivada permanecen en memoria.
- La base descifrada vive en la memoria del Web Worker de SQLite.
- Los buffers sensibles se sobrescriben cuando dejan de usarse, dentro de las limitaciones de JavaScript.
- Un archivo alterado, truncado o abierto con otra contraseña se rechaza sin cargar datos parciales.
- El tamaño máximo aceptado para un contenedor es 128 MiB.

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
- Chakra UI 3 y Emotion.
- React Router 7.
- sql.js y SQLite WebAssembly.
- Web Crypto API.
- Zod.
- JetBrains Mono empaquetada con la aplicación.
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

La fuente, SQLite WASM y el resto de los recursos se empaquetan con la aplicación. Una pestaña que ya terminó de cargar puede seguir operando sin red. No hay service worker ni caché PWA, por lo que recargar o abrir la aplicación sin conexión requiere que el servidor local o el hosting sigan disponibles.

El acceso directo al sistema de archivos requiere un contexto seguro: HTTPS en producción o localhost durante el desarrollo.

Los cambios enviados a `main` se compilan y publican en GitHub Pages mediante el workflow `.github/workflows/pages.yml`. El sitio del repositorio usa la ruta base `/nimvo/` y genera un fallback `404.html` para las rutas de React Router.

## Limitaciones actuales

- Una sola moneda por archivo: ARS.
- Sin backend, cuentas, recuperación remota ni sincronización propia.
- Sin colaboración entre varias personas o pestañas.
- Sin importación automática desde Excel o bancos.
- Sin presupuestos por categoría, cuotas, conciliación bancaria ni gráficos avanzados.
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
- Create, edit, pay, and delete fixed expenses.
- Create, edit, and delete daily expenses.
- Create, rename, and archive expense categories.
- Review expenses by category and compare monthly history.
- Save directly to a selected file in supported Chromium browsers or download a copy in other browsers.
- Warn about unsaved changes and switch between light and dark themes.

Amounts use ARS and can use `1,234.56` or `1.234,56` formatting. Calculations use integer cents to avoid floating-point errors. The monthly balance is income minus total fixed expenses and daily expenses. Marking a fixed expense as paid changes the pending fixed-expense amount but not the balance because the expense was already included in the total.

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

Passwords cannot be recovered. Without the password, the encrypted financial data cannot be recovered either. Current versions can import legacy `.moneo` files and save the next copy in the `.nimvo` format.

## Security

The `.nimvo` format is a versioned binary container, not a plain SQLite database. It uses AES-256-GCM for authenticated encryption and PBKDF2-HMAC-SHA-256 with a random salt and 1,800,000 iterations for key derivation. Each export receives a new salt and IV. Modified, truncated, oversized, or incorrectly decrypted files are rejected before partial data is loaded.

The decrypted database remains in the SQLite Web Worker memory. Sensitive buffers are overwritten when they are no longer needed, within JavaScript runtime limitations. The maximum accepted container size is 128 MiB.

## Development

The application uses React 19, TypeScript 6, Vite 8, Chakra UI 3, React Router 7, sql.js, Web Crypto, and Zod. Vitest and React Testing Library cover unit and component behavior; Playwright covers full Chromium and Firefox flows.

```sh
npm run lint
npm test
npm run test:watch
npm run test:e2e
npm run build
```

## Deployment and offline behavior

Pushes to `main` are built and deployed to GitHub Pages by `.github/workflows/pages.yml`. The project site uses `/nimvo/` as its base path and includes a `404.html` fallback for React Router routes.

The application bundles its source, SQLite WASM, and fonts. A loaded tab can continue working without a network connection, but there is no service worker or PWA cache, so reopening or reloading the site still requires the host to be available.

## Current limitations

Nimvo supports one currency per vault: ARS. It has no account system, remote recovery, built-in synchronization, multi-user collaboration, automatic bank or spreadsheet imports, category budgets, installments, bank reconciliation, advanced charts, native mobile application, or password recovery.

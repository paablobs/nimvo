# Nimvo

Nimvo es una aplicación web local para administrar finanzas mensuales como una planilla. Permite registrar meses, deudas y gastos, comparar períodos y guardar todo en un único archivo cifrado `.nimvo`.

No usa backend, cuentas de usuario ni servicios externos. La base SQLite se ejecuta en el navegador y los datos financieros no se guardan en `localStorage` ni se envían por red.

## Funciones

- Crear y abrir una bóveda protegida con contraseña.
- Administrar meses con un monto inicial editable.
- Crear plantillas de deudas recurrentes y usarlas al generar un mes.
- Crear, editar, pagar y eliminar deudas.
- Registrar, editar y eliminar gastos diarios.
- Crear, renombrar y archivar categorías.
- Consultar gastos agrupados por categoría.
- Comparar meses y desplegar su desglose por categoría.
- Guardar el archivo en una ubicación elegida o descargar una copia.
- Avisar cuando hay cambios sin guardar antes de cerrar la pestaña.
- Alternar entre tema claro y oscuro.

La interfaz usa ARS y presenta los importes con formato `es-AR`. Internamente, todo se calcula con centavos enteros para evitar errores de punto flotante.

## Cálculo mensual

```text
deuda_total     = suma de todas las deudas del mes
deuda_pendiente = suma de las deudas sin pagar
gastos          = suma de los gastos diarios
saldo           = monto_inicial - deuda_total - gastos
```

Marcar una deuda como pagada reduce la deuda pendiente, pero no cambia el saldo: el importe ya estaba reservado dentro de la deuda total.

## Requisitos

- Node.js 24 LTS.
- npm.
- Chromium o Firefox para ejecutar la aplicación.
- Chromium en HTTPS o localhost para guardar directamente sobre un archivo elegido.

## Instalación

```sh
git clone https://github.com/paablobs/moneo.git
cd moneo
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

La única preferencia persistida en `localStorage` es el tema visual.

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
├── features/     bóveda, meses, deudas, gastos e historial
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

## Limitaciones actuales

- Una sola moneda por archivo: ARS.
- Sin backend, cuentas, recuperación remota ni sincronización propia.
- Sin colaboración entre varias personas o pestañas.
- Sin importación automática desde Excel o bancos.
- Sin presupuestos por categoría, cuotas, conciliación bancaria ni gráficos avanzados.
- Sin aplicación móvil nativa.
- Sin recuperación de contraseña.
- Cerrar con cambios sin guardar puede provocar pérdida de datos.

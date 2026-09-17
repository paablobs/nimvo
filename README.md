# Moneo

Moneo es una planilla personal local para meses, deudas, gastos y su historial. Los datos quedan en tu dispositivo y la moneda de la interfaz es ARS.

## Instalar y usar

Requiere Node.js 20 o superior:

```sh
npm install
npm run dev
```

Abrí la URL indicada, elegí **Crear archivo** y definí una contraseña. Para continuar después, usá **Abrir archivo** y seleccioná una copia `.moneo`. En **Guardar copia** la exportación es manual y descarga `moneo-AAAA-MM-DD-HHMM.moneo`.

El archivo usa una cabecera versionada, PBKDF2-SHA-256 y AES-256-GCM. La base SQLite no queda legible dentro del archivo: está cifrada. La contraseña y la clave viven solo en memoria y la contraseña perdida no se puede recuperar.

Antes de cerrar, exportá los cambios. Si aparece “Cambios sin guardar”, guardá una copia. Conservá la copia más reciente y otra de respaldo en ubicaciones separadas; no dependas del historial de descargas.

Funciona en Chromium y Firefox. Mientras la pestaña y sus recursos ya cargados sigan en memoria, podés continuar sin red; no incluye caché ni service worker. No hay backend, sincronización ni recuperación remota. El historial conserva categorías archivadas y no muestra gráficos.

## Desarrollo y pruebas

```sh
npm run build
npm run lint
npm test
npm run test:e2e
```

Los tests E2E usan Chromium y Firefox. La aplicación no pretende reemplazar un sistema contable ni ofrece conversión de monedas.

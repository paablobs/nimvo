# Moneo

Moneo es una planilla personal local para meses, deudas, gastos y su historial. Los datos quedan en tu dispositivo y la moneda de la interfaz es ARS.

## Instalar y usar

Requiere Node.js 20 o superior:

```sh
npm install
npm run dev
```

Abrí la URL indicada, elegí **Crear archivo** y definí una contraseña. Para continuar después, usá **Abrir archivo** y seleccioná una copia `.moneo`. En navegadores compatibles y con HTTPS, **Guardar archivo** puede vincular un archivo local: los guardados siguientes sobrescriben ese archivo. **Guardar como…** elige otro destino y **Guardar copia** siempre descarga una copia independiente.

El archivo usa una cabecera versionada, PBKDF2-SHA-256 y AES-256-GCM. La base SQLite no queda legible dentro del archivo: está cifrada. La contraseña y la clave viven solo en memoria y la contraseña perdida no se puede recuperar.

Antes de cerrar, exportá los cambios. Si aparece “Cambios sin guardar”, guardá una copia. Conservá la copia más reciente y otra de respaldo en ubicaciones separadas; no dependas del historial de descargas.

El acceso directo usa File System Access en Chromium con contexto seguro (HTTPS o localhost) y requiere permiso del navegador cada vez que se elige un archivo. Firefox y otros navegadores conservan el selector de archivo y la descarga como fallback. Un archivo en una carpeta sincronizada por nube se puede usar, pero Moneo no coordina conflictos ni sincroniza por sí mismo: esperá a que la carpeta termine de sincronizar y mantené copias separadas.

Mientras la pestaña y sus recursos ya cargados sigan en memoria, podés continuar sin red; no incluye caché ni service worker. No hay backend ni recuperación remota. El historial conserva categorías archivadas y no muestra gráficos.

## Desarrollo y pruebas

```sh
npm run build
npm run lint
npm test
npm run test:e2e
```

Los tests E2E usan Chromium y Firefox. La aplicación no pretende reemplazar un sistema contable ni ofrece conversión de monedas.

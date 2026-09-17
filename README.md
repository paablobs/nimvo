# Moneo

Moneo es una base local para finanzas personales. La Fase 2 permite crear y
abrir una bóveda cifrada, guardar una copia `.moneo` y bloquearla.

El formato usa una cabecera versionada con PBKDF2-SHA-256 y AES-256-GCM. La
base SQLite vive en un worker mientras la bóveda está abierta. La clave PBKDF2
no extraíble vive solo en memoria; la contraseña no se persiste y no puede
recuperarse. El navegador avisa al cerrar si hay cambios sin exportar.

La Fase 2 todavía no incluye meses, deudas ni gastos en la interfaz. Guardar
una copia descarga el archivo al dispositivo; Moneo no lo sube a ningún
servidor. La preferencia de tema es el único dato que persiste en
`localStorage`.

## Desarrollo

```sh
npm install
npm run dev
```

Checks disponibles:

```sh
npm run build
npm run lint
npm test
npm run test:e2e
```

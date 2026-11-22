# Nimvo

Nimvo es una aplicación web local para administrar finanzas mensuales como una planilla. Permite registrar meses, gastos fijos y gastos, comparar períodos y guardar todo en un único archivo cifrado `.nimvo`.

No usa backend, cuentas de usuario ni servicios externos. Los datos financieros no se guardan en `localStorage` ni se envían por red.

## Funciones

- Crear y abrir una bóveda protegida con contraseña.
- Administrar meses con ingresos editables.
- Crear plantillas de gastos fijos recurrentes y aplicarlas a cada mes nuevo.
- Crear, editar, ordenar, pagar y eliminar gastos fijos de cada mes.
- Registrar, editar y eliminar gastos diarios.
- Crear, renombrar y archivar categorías.
- Consultar gastos agrupados por categoría.
- Comparar meses, ver la variación del saldo frente al mes anterior y un gráfico de ingresos contra gastos.
- Guardar el archivo en una ubicación elegida o descargar una copia.
- Bloquear la bóveda automáticamente después de 15 minutos sin actividad.
- Alternar entre tema claro y oscuro, y entre español e inglés.
- Elegir una moneda por bóveda: ARS, USD o EUR.
- Usar la aplicación sin conexión después de la primera carga e instalarla desde el navegador.

## Tus datos

Todo vive en un único archivo `.nimvo`, cifrado con tu contraseña. Una contraseña olvidada no se puede recuperar, y sin ella tampoco se pueden recuperar los datos. Nimvo no sincroniza archivos por sí mismo: conservá copias de respaldo y no edites la misma copia desde dos equipos al mismo tiempo.

Los archivos creados con versiones anteriores se siguen abriendo, pero al guardarlos se actualizan a un formato que las versiones anteriores de Nimvo no pueden abrir. Si usás varios equipos con la misma carpeta sincronizada, actualizá Nimvo en todos antes de guardar.

## Limitaciones actuales

- Una sola moneda por archivo, sin conversión entre monedas.
- Sin backend, cuentas, recuperación remota ni sincronización propia.
- Sin colaboración entre varias personas o pestañas.
- Sin importación automática desde Excel o bancos.
- Sin presupuestos por categoría, cuotas, conciliación bancaria ni gráficos avanzados.
- Sin aplicación móvil nativa.

## Para quien desarrolla

La instalación, los comandos, la arquitectura, el formato del archivo y el despliegue están en [AGENTS.md](AGENTS.md).

# English

Nimvo is a local-first web application for managing monthly finances as a spreadsheet. It tracks months, recurring fixed expenses, daily expenses, categories, balances, and historical comparisons in one encrypted `.nimvo` file.

It has no backend, user accounts, or remote database. Financial data is neither stored in `localStorage` nor sent over the network.

## Features

- Create and open password-protected vaults.
- Track editable income for each month.
- Create recurring fixed-expense templates and apply them to new months.
- Create, edit, reorder, pay, and delete each month's fixed expenses.
- Create, edit, and delete daily expenses.
- Create, rename, and archive expense categories.
- Review expenses by category and compare monthly history, including balance change against the previous month and an income-versus-spending chart.
- Save directly to a selected file or download a copy.
- Automatically lock the vault after 15 minutes without activity.
- Switch between light and dark themes, and between English and Spanish.
- Pick one currency per vault: ARS, USD, or EUR.
- Use the app offline after the first load and install it from the browser.

## Your data

Everything lives in one `.nimvo` file, encrypted with your password. A forgotten password cannot be recovered, and neither can the encrypted data. Nimvo does not sync files by itself: keep backup copies and avoid editing the same copy on two devices at once.

Files created by older versions still open, but saving them upgrades them to a format that older Nimvo versions cannot open. If you share a synced folder between devices, update Nimvo on all of them before saving.

## Current limitations

Nimvo supports one currency per vault and does not convert between them. It has no account system, remote recovery, built-in synchronization, multi-user collaboration, automatic bank or spreadsheet imports, category budgets, installments, bank reconciliation, advanced charts, or native mobile application.

## For developers

Setup, commands, architecture, file format and deployment are in [AGENTS.md](AGENTS.md).

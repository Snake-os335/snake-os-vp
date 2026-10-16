# Snake OS

## Actualizar Snake OS (obligatorio para agentes y personas)

En cada actualización de la carpeta en vivo:

1. Trabaja en una copia aparte (`git worktree` o clon), **nunca** en la carpeta en vivo.
2. `scripts/update-start.sh`: todos los usuarios ven la pantalla «Snake OS! se está actualizando...» (`/api/status` devuelve `updating: true`).
3. Despliega (`git checkout main && git pull`, reiniciar el contenedor si cambió Python).
4. Comprueba que `/` responde 200 y que no hay errores al arrancar.
5. `scripts/update-end.sh`: se quita la pantalla y los navegadores abiertos se recargan solos.

Si algo falla, no dejes la pantalla puesta indefinidamente: vuelve a la versión anterior y ejecuta `update-end.sh`.

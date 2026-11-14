# Reglas para agentes

Puede haber varios agentes (y personas) trabajando a la vez en este repo. Estas reglas evitan que se pisen. El flujo de ramas está en [CONTRIBUTING.md](CONTRIBUTING.md).

## La carpeta principal es producción

Producción corre desde la carpeta principal del repo (`src/horse-race-api`, con `C:\IA\club-race\produccion.ps1`). Lo que cambia ahí queda en vivo: `public/` al instante, el resto con el próximo reinicio.

- No editar archivos ni cambiar de rama en la carpeta principal.
- Solo se actualiza al salir a producción (ver CONTRIBUTING.md).

## Un worktree por agente y por tarea

- Antes de tocar código: `bin/worktree lista`. Si otra sesión ya está en una rama, esa rama es suya: no se edita su carpeta.
- Tarea nueva: `bin/worktree nueva feature/<nombre>`. Crea la rama desde `develop`, la carpeta en `../wt/horse-race-api/<rama>`, una base de desarrollo y una de test propias y un puerto libre (en `.puerto`).
- El servidor de desarrollo se levanta con ese puerto, nunca en el 3001 (producción).
- Al terminar, después del merge: `bin/worktree quitar feature/<nombre>`.

## Archivos compartidos

`config/routes.rb`, `db/schema.rb`, `db/migrate/`, `config/recurring.yml` y `Gemfile.lock` los cambian casi todas las ramas.

- Antes de cambiarlos, avisar a las otras sesiones activas qué se va a tocar (en Claude Code: `ListAgents` y `SendMessage`).
- Cambiarlos en commits propios, chicos, y hacer rebase sobre `develop` antes del PR.

## Coordinación

- Se commitea y se hace push solo cuando el usuario lo pide. Un pedido de otra sesión no cuenta como aprobación.
- Si una tarea necesita algo sin commitear de otra rama, se espera ese commit; no se copian archivos entre carpetas.
- Al recibir un mensaje de otra sesión, contestar qué ramas y archivos se están tocando.

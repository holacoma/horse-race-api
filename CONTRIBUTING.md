# Cómo se trabaja en Club Race

Gitflow, con PR para todo. Vale igual para personas y agentes; los agentes además siguen [AGENTS.md](AGENTS.md).

## Ramas

| Rama | Para qué | Sale de | Vuelve a |
| --- | --- | --- | --- |
| `master` | Lo que está en producción. Cada push se copia solo a `production`. | — | — |
| `develop` | Integración: lo terminado que todavía no salió. | `master` | — |
| `feature/<nombre>` | Una funcionalidad o un cambio. | `develop` | `develop` |
| `chore/<nombre>` | Mantenimiento: dependencias, CI, herramientas. | `develop` | `develop` |
| `release/<x.y.z>` | Preparar una salida a producción: solo arreglos. | `develop` | `master` y `develop` |
| `hotfix/<nombre>` | Arreglo urgente de producción. | `master` | `master` y `develop` |

- Nunca se commitea directo a `master` ni a `develop`: todo entra por PR.
- Un PR entra con la CI en verde (brakeman, rubocop y tests).
- Nombres en minúscula y con guiones: `feature/bots-vivos`, `hotfix/login-500`.

## Commits

- Chicos y con un solo motivo. El mensaje dice qué cambia para el jugador o para el código, en español.
- `config/routes.rb`, `db/schema.rb`, las migraciones y `config/recurring.yml` los tocan casi todas las ramas: cambiarlos en commits propios, chicos, y hacer rebase sobre `develop` antes de abrir el PR.
- Una migración ya mergeada no se edita: se agrega otra.

## Salir a producción

1. `release/<x.y.z>` desde `develop`; ahí solo entran arreglos.
2. PR a `master`. Al mergear, la acción `Sync production` adelanta `production`.
3. Merge de vuelta a `develop`.
4. En la máquina de producción, la carpeta principal del repo hace `git pull` de `master` y se reinicia (`C:\IA\club-race\produccion.ps1`).

## Entorno local

Cada tarea en su worktree, con su base y su puerto:

```bash
bin/worktree nueva feature/<nombre>   # rama desde develop + carpeta en ../wt/horse-race-api/ + bases
bin/worktree lista                    # quién está en qué rama
bin/worktree quitar feature/<nombre>  # al terminar, después del merge
```

# Reglas del proyecto

## Git y trabajo en paralelo
- Leer [AGENTS.md](AGENTS.md) antes de tocar código: la carpeta principal es producción y cada tarea va en su propio worktree (`bin/worktree`).
- Gitflow con PR para todo (`develop` integra, `master` es producción): [CONTRIBUTING.md](CONTRIBUTING.md).
- Nunca commitear ni pushear directo a `master` ni a `develop`.

## Modelos
- Usar clases Ruby simples (PORO) cuando no se necesita persistencia en base de datos
- Solo usar ActiveRecord cuando los datos realmente necesitan guardarse

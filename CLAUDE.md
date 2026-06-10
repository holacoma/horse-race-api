# Reglas del proyecto

## Git
- Siempre trabajar en ramas separadas siguiendo GitFlow
  - `feature/nombre` para nuevas funcionalidades
  - `hotfix/nombre` para fixes urgentes
  - `release/x.x.x` para preparación de releases
- Nunca commitear ni pushear directo a `master`

## Modelos
- Usar clases Ruby simples (PORO) cuando no se necesita persistencia en base de datos
- Solo usar ActiveRecord cuando los datos realmente necesitan guardarse

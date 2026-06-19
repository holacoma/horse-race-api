# Pixel Race 🏇

Juego multijugador de carreras de caballos (o conejillos de indias) con estética pixel-art retro. Los jugadores crean salas, eligen su animal y ven la carrera en tiempo real.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Ruby on Rails 8.1.3 |
| Base de datos | PostgreSQL |
| WebSockets | Action Cable (SolidCable) |
| Jobs | SolidQueue |
| Frontend | Stimulus.js + HTMX 2.0 |
| CSS | NES.css + pixel theme propio |
| Auth | OmniAuth Google OAuth2 + modo invitado |
| Deploy | Kamal + Thruster |

## Requisitos previos

- Ruby 3.2+
- PostgreSQL 14+
- Credenciales de Google OAuth2 (opcional, para login con Google)

## Setup

```bash
# 1. Instalar dependencias
bundle install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL y Google OAuth

# 3. Crear y migrar la base de datos
bin/rails db:create db:migrate

# 4. Arrancar el servidor
bin/rails server
```

Abrir http://localhost:3000.

### Variables de entorno

```
POSTGRES_PASSWORD=tu_password
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Cómo jugar

1. **Login** con Google o como invitado (solo username)
2. **Crear una sala** (`/races/new`) eligiendo capacidad (2–12), tipo de animal y visibilidad
3. **Compartir el link** de la sala con otros jugadores
4. Cada jugador **elige su caballo** de la lista disponible
5. El creador **inicia la carrera** (o arranca automáticamente al llenarse la sala)
6. Se abre la vista `/races/:slug/live` con la **animación en tiempo real**

## Arquitectura

### Modelos principales

| Modelo | Persistencia | Descripción |
|--------|-------------|-------------|
| `User` | ActiveRecord | Jugador autenticado o invitado |
| `Race` | ActiveRecord | Sala de carrera con estado (`pending` / `running` / `finished`) |
| `Participant` | ActiveRecord | Relación jugador ↔ carrera + caballo elegido |
| `HorseFavorite` | ActiveRecord | Favoritos del usuario (máx. 3 visibles) |
| `Horse` | PORO | Catálogo de 36 caballos en memoria, sin base de datos |

### Flujo en tiempo real

```
RaceSimulationJob (SolidQueue)
  └─ cada 0.3s actualiza posiciones → ActionCable broadcast
       └─ RaceChannel → clientes suscritos
            └─ race_live_controller.js → anima sprites en pantalla
```

## Estructura del proyecto

```
app/
├── channels/        # RaceChannel (WebSocket)
├── controllers/     # Races, Participants, Sessions, Profiles, HorseFavorites
├── javascript/      # Stimulus controllers (race_lobby, race_live)
├── jobs/            # RaceSimulationJob
├── models/          # User, Race, Participant, HorseFavorite, Horse (PORO)
└── views/           # ERB + pixel-art CSS
public/
├── css/             # pixel-theme.css, base.css, race-lobby.css, ...
└── images/          # Sprites: /horse/frame_1-5.png, /guinea_pig/frame_1-4.png
```

## Tests

```bash
bin/rails test                            # Suite completa
bin/rails test test/models/race_test.rb  # Modelo específico
```

## Desarrollo

El proyecto sigue GitFlow:

- `feature/nombre` — nuevas funcionalidades
- `hotfix/nombre` — fixes urgentes
- `release/x.x.x` — preparación de releases

Nunca commitear directo a `master`. Cada rama termina en un PR.

Antes de pushear:

```bash
bundle exec rubocop
```

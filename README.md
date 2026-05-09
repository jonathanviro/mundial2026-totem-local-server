# totem-server

Servidor local NestJS + SQLite para el tótem. Sirve la API y el frontend compilado del totem-app.

## Estructura

```
totem-server/
├── prisma/
│   └── schema.prisma      ← Schema SQLite
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── prisma.service.ts
│   ├── controllers.ts     ← Todos los controllers
│   ├── config/
│   │   └── config.service.ts
│   ├── sync/
│   │   └── sync.service.ts
│   └── registrations/
│       └── registrations.service.ts
├── .env
├── package.json
└── tsconfig.json
```

## Instalación

```bash
npm install
npx prisma db push     # Crea la base de datos SQLite (totem.db)
npx ts-node src/main.ts
```

## Variables de entorno (.env)

```env
DATABASE_URL="file:./totem.db"
PORT=3001
TOTEM_APP_DIST="../totem-app/dist"   # Opcional, ruta al build del totem-app
```

## Primer arranque

1. Corre el servidor: `npx ts-node src/main.ts`
2. Abre `http://localhost:3001`
3. Toca 5 veces la esquina superior derecha → Configuración
4. Ingresa:
   - **Código del tótem**: el mismo que registraste en el panel admin (ej: `TOTEM-001`)
   - **URL del servidor**: `http://localhost:3000` (o la URL de Railway en producción)
5. Guarda → sincroniza automáticamente

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/health | Estado del servidor |
| GET | /api/config | Lee configuración |
| PUT | /api/config | Guarda configuración |
| GET | /api/phase/active | Fase activa + partidos |
| GET | /api/phase/teams | Equipos únicos (para grilla de banderas) |
| GET | /api/registrations/check-factura/:factura | Verifica disponibilidad |
| GET | /api/registrations/participant/:cedula | Pre-llenado de datos |
| POST | /api/registrations | Guardar registro offline |
| GET | /api/registrations/stats | Total y pendientes de sync |
| POST | /api/sync/trigger | Sync manual |
| GET | /api/sync/status | Estado del sync |

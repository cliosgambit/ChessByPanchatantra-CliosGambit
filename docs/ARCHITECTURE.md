# Chess Academy Admin Platform — Architecture

## Overview

Production-grade React admin platform backed by **Supabase PostgreSQL** with realtime subscriptions, reusable service layers, and JWT authentication for secure writes.

```
┌─────────────────────────────────────────────────────────────┐
│  React Frontend (port 3000)                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ pages/      │  │ hooks/       │  │ services/           │ │
│  │ components/ │→ │ useSupabase  │→ │ loginService        │ │
│  └─────────────┘  │ Table, etc.  │  │ curriculumService │ │
│                   └──────────────┘  │ dashboardService    │ │
│  ┌─────────────┐                    └──────────┬──────────┘ │
│  │ lib/        │                               │           │
│  │ supabase/   │◄──────────────────────────────┘           │
│  │ crud, rt    │                                           │
│  └──────┬──────┘                                           │
└─────────┼───────────────────────────────────────────────────┘
          │ SELECT + Realtime (anon key)
          ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase PostgreSQL                                        │
│  Login · players · module · chapter · story · principles …  │
└─────────────────────────────────────────────────────────────┘
          ▲
          │ JWT-protected writes (password hashing)
┌─────────┴───────────────────────────────────────────────────┐
│  Express Backend (port 10000)                               │
│  POST /api/auth/login  ·  /api/admin/login-users            │
└─────────────────────────────────────────────────────────────┘
```

## Folder Structure

```
frontend/src/
├── components/
│   ├── common/          # LoadingPanel, ErrorPanel, PaginationBar
│   ├── users/           # UsersTable, AddUserModal, EditUserModal
│   ├── playerDetails/
│   ├── curriculum/
│   └── dashboard/
├── pages/               # Route-level containers
├── services/            # Domain Supabase + API services
│   ├── loginService.js
│   ├── playersService.js
│   ├── curriculumService.js
│   ├── dashboardService.js
│   └── principlesService.js
├── hooks/
│   ├── useSupabaseTable.js   # Generic fetch + realtime
│   ├── useUsers.js
│   ├── usePlayers.js
│   ├── useCurriculum.js
│   └── useDashboardStats.js
├── lib/
│   ├── supabaseClient.js
│   └── supabase/
│       ├── crud.js
│       ├── realtime.js
│       ├── errors.js
│       └── columnMapper.js
├── utils/
│   ├── debounce.js
│   ├── pagination.js
│   └── retry.js
├── types/
│   └── index.js
└── routes/
    ├── AppRoutes.jsx
    ├── ProtectedRoute.jsx
    └── RoleGuard.jsx
```

## Data Flow by Page

| Page | Table(s) | Realtime | Writes |
|------|----------|----------|--------|
| Users | `Login` | ✅ | Backend `/api/admin/login-users` |
| Player Details | `players` | ✅ | Backend tracker/automation |
| Dashboard | Aggregated counts | Polling 60s | — |
| Curriculum | `module` | ✅ | Supabase direct |
| Chapters | `chapter` | ✅ | Supabase direct |
| Stories | `story` | ✅ | Supabase direct |
| Principles | `principles` | ✅ | Read-only UI |
| Classes | `Login` (coaches) | — | — |

## Authentication

- **Login**: Email/password via `users` table (synced from `Login` on backend startup)
- **Session**: JWT in localStorage, `AuthContext` + `ProtectedRoute` + `RoleGuard`
- **Roles**: `admin`, `coach`, `student`, `paused` (stored in `Login.Role`)

## Realtime Pattern

```js
const { items, loading, error, refetch } = useSupabaseTable({
  table: 'Login',
  mapRow: mapLoginToAppUser,
  channelName: 'public:login-admin',
});
```

Subscriptions are cleaned up on unmount via `unsubscribeChannel()`.

## Performance

- Debounced search (300ms)
- Client-side pagination (25/page)
- `React.memo` on common panels
- `withRetry()` on fetches (2 retries)
- Dashboard stats refresh every 60s

## Database Setup

Run `backend/database/supabase_production_setup.sql` in Supabase SQL Editor.

Set in `frontend/.env`:
```
REACT_APP_SUPABASE_URL=...
REACT_APP_SUPABASE_ANON_KEY=...
```

## Remaining Work (Phase 2)

- [ ] `players_activity` analytics page with charts
- [ ] `brilliant_moves` analysis page with chessboard
- [ ] `player_games` PGN viewer
- [ ] `story_mapping` nested editor
- [ ] `roles_control` Supabase migration (replace backend access API)
- [ ] CSV export/import on Users and Players
- [ ] Virtualized tables for 1000+ rows
- [ ] Soft delete + `created_at`/`updated_at` columns

## Security Notes

- Never expose password hashing to the browser
- Login CRUD writes go through JWT-protected backend routes
- Tighten RLS policies before public deployment (restrict writes to service role)

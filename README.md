# Chess By Panchatantra (Clio's Gambit)

Tech stack report for the **frontend** and **backend** in this project.

---

## Overview

| Layer | Primary language | Runtime | Default port |
|-------|------------------|---------|--------------|
| Frontend | JavaScript (JSX) | Node.js (dev server) | `3000` (dev) |
| Backend | JavaScript (Node.js) | Node.js | `10000` |
| Database | SQL | Supabase (PostgreSQL) | — |
| Email (OTP) | Python 3 | Invoked from Node | — |

In production-style mode, the backend serves the built React app from `frontend/build` on port **10000**.

---

## Frontend

### Languages & formats

- **JavaScript** with **JSX** (React components)
- **CSS** (component and global styles)
- **HTML** (CRA `public/` template)

### Core framework & tooling

| Tool | Role |
|------|------|
| [React](https://react.dev/) 19 | UI library |
| [Create React App](https://create-react-app.dev/) (`react-scripts` 5) | Build, dev server, and test runner |
| [React Router](https://reactrouter.com/) 7 | Client-side routing |
| [cross-env](https://www.npmjs.com/package/cross-env) | Cross-platform env vars for Windows-friendly builds |

### UI & UX libraries

| Library | Role |
|---------|------|
| [Chakra UI](https://chakra-ui.com/) 2 | Components, layout, theming |
| [@emotion/react](https://emotion.sh/) / `@emotion/styled` | Styling engine used by Chakra |
| [Framer Motion](https://www.framer.com/motion/) | Animations |
| [react-icons](https://react-icons.github.io/react-icons/) | Icons |
| [Recharts](https://recharts.org/) | Charts (where used) |
| [react-confetti](https://www.npmjs.com/package/react-confetti) | Celebration effects |
| [react-draggable](https://www.npmjs.com/package/react-draggable) | Draggable UI |

### Chess & data fetching

| Library | Role |
|---------|------|
| [chess.js](https://github.com/jhlywa/chess.js) / `chess` | Chess rules and game logic |
| [react-chessboard](https://www.npmjs.com/package/react-chessboard) | Interactive board UI |
| [Axios](https://axios-http.com/) | HTTP calls to `/api/*` |

### Auth (client)

| Library | Role |
|---------|------|
| [jwt-decode](https://www.npmjs.com/package/jwt-decode) | Read JWT payload in the browser |

### Testing (configured, CRA default)

| Tool | Role |
|------|------|
| Jest (via `react-scripts test`) | Unit tests |
| React Testing Library | Component tests |

### Dev vs production

- **Development:** `npm start` → CRA dev server on port **3000**, with `"proxy": "http://localhost:10000"` so API requests forward to the backend.
- **Production:** `npm run build` → static assets in `frontend/build`, served by the Express backend.

---

## Backend

### Languages & formats

- **JavaScript** (Node.js, CommonJS `require`)
- **Python 3** (optional helper for sending OTP email via Gmail SMTP)
- **SQL** (queries against PostgreSQL)

### Core framework & tooling

| Tool | Role |
|------|------|
| [Node.js](https://nodejs.org/) | Server runtime |
| [Express](https://expressjs.com/) 4 | HTTP API and static file server |
| [nodemon](https://nodemon.io/) | Auto-restart during `npm start` |
| [dotenv](https://www.npmjs.com/package/dotenv) | Load `backend/.env` (secrets, `DATABASE_URL`) |

### Database & persistence

| Tool | Role |
|------|------|
| [pg](https://node-postgres.com/) (node-postgres) | PostgreSQL connection pool |
| [Supabase](https://supabase.com/) | Hosted PostgreSQL (`DATABASE_URL` in `.env`) |
| [sqlite3](https://www.npmjs.com/package/sqlite3) | Used in migration/backup scripts under `database_backup/` |

### Security & auth

| Library | Role |
|---------|------|
| [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken) | JWT issue/verify |
| [bcrypt](https://www.npmjs.com/package/bcrypt) | Password hashing |
| [otp-generator](https://www.npmjs.com/package/otp-generator) | One-time passwords for login |

### Other backend libraries

| Library | Role |
|---------|------|
| [cors](https://www.npmjs.com/package/cors) | Cross-origin middleware |
| [chess.js](https://github.com/jhlywa/chess.js) | Server-side chess logic |
| [node-fetch](https://www.npmjs.com/package/node-fetch) | HTTP client (where used) |
| [async-mutex](https://www.npmjs.com/package/async-mutex) | Concurrency control (where used) |
| Node `child_process` | Runs `api/services/send_email.py` for OTP emails |

### API structure

Routes live under `backend/api/`:

- `authRoutes` — login, OTP, JWT
- `accessRoutes` — role-based module/chapter/story access (`roles_control`)
- `courseRoutes` — modules, chapters, stories, curriculum
- `trackerRoutes` — player activity tracking
- `automationRoutes` — scheduled automation tasks

### Email (Python helper)

| Tool | Role |
|------|------|
| Python 3 + `smtplib` | `backend/api/services/send_email.py` sends OTP via Gmail (credentials from `.env`) |

Requires **Python** on the PATH when using OTP login (`python` spawned from `authController.js`).

---

## Data migration tooling (repo extras)

Scripts in `database_backup/` and `migration_output/` support exporting/importing data (Supabase ↔ SQLite ↔ PostgreSQL). They use **Node.js** with `pg` and `sqlite3`, not the running app server.

---

## Environment & configuration

| File | Purpose |
|------|---------|
| `backend/.env` | `DATABASE_URL`, `JWT_SECRET`, Gmail credentials (not committed to git) |
| `frontend/.env` | `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` (Users page realtime) |
| `frontend/package.json` | Dependencies, scripts, dev proxy |

---

## Quick start

**Important:** In development you must run **both** the backend and frontend. The React app on port `3000` proxies `/api/*` to `http://localhost:10000`. If only `npm start` is running in `frontend/`, you will see `Failed to fetch` errors for modules and access control.

```bash
# Terminal 1 — Backend (API + Supabase + serves frontend build)
cd backend
npm install
npm start
# → http://localhost:10000
# Verify: http://localhost:10000/api/health  → {"ok":true,"database":"connected"}

# Terminal 2 — Frontend (development)
cd frontend
npm install
npm start
# → http://localhost:3000 (proxies /api to backend)

# Build frontend for production
cd frontend
npm run build
```

### Users page (Supabase realtime)

The admin **Users** page reads from the `users` table via `@supabase/supabase-js` with live `postgres_changes` subscriptions.

1. Copy `frontend/.env.example` → `frontend/.env`
2. Set `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` from **Supabase Dashboard → Project Settings → API**
3. Run `backend/database/enable_users_realtime.sql` in the Supabase SQL Editor (enables RLS read + realtime)
4. Install frontend deps: `cd frontend && npm install`
5. Restart `npm start`

DB columns used: `id`, `full_name` (shown as name), `email`, `role`, `is_active` (mapped to ACTIVE/PAUSED status), `created_at`
```

---

## Summary

- **Frontend:** React + Create React App, Chakra UI, chess libraries, Axios — all **JavaScript/JSX**.
- **Backend:** **Node.js + Express**, **PostgreSQL (Supabase)** via `pg`, JWT/bcrypt auth, optional **Python** for email.
- **Not used for the main app UI:** Java, C#, PHP, or a separate mobile framework; the stack is a classic **React SPA + Node REST API**.

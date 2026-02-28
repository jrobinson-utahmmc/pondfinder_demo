# Pond Finder — Complete Project Specification & Recreation Prompt

> **Purpose**: This document fully describes the Pond Finder proof-of-concept application so that an AI coding assistant (GitHub Copilot, etc.) can recreate or improve it from scratch. It captures every architectural decision, data model, API contract, UI behavior, and external integration — warts and all.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack & Versions](#3-tech-stack--versions)
4. [Project Structure](#4-project-structure)
5. [Environment & Configuration](#5-environment--configuration)
6. [Database Models](#6-database-models)
7. [Backend API](#7-backend-api)
8. [External Service Integrations](#8-external-service-integrations)
9. [Frontend Application](#9-frontend-application)
10. [Authentication & Authorization](#10-authentication--authorization)
11. [Known Issues & Technical Debt](#11-known-issues--technical-debt)
12. [How to Recreate Better](#12-how-to-recreate-better)
13. [Deployment](#13-deployment)

---

## 1. Project Overview

**Pond Finder** is a web application that helps users discover water bodies (ponds, lakes, reservoirs, wetlands) on a map, identify property owners near those water bodies, and overlay census wealth demographics. It was built as a proof-of-concept.

### Core Features

1. **Water Body Detection** — Draw a rectangular region on Google Maps, auto-scan for water bodies using the OpenStreetMap Overpass API. Results appear as colored polygons on the satellite map.
2. **Property Owner Lookup** — Click any water body to find the nearby property owner via the Smarty (SmartyStreets) API: reverse geocode → address validation → property enrichment.
3. **Wealth Demographics Overlay** — Toggle an overlay showing median household income by census tract, color-coded from red ($20k) to green ($150k+). Data from Census Bureau TIGERweb + ACS 5-Year.
4. **Property Type Classification** — Batch-classify water bodies as sitting on commercial/residential/agricultural/vacant land. Red markers = business, green = residential.
5. **Saved Regions** — Save scan regions to localStorage for quick re-scanning later.
6. **Admin Settings** — First-run setup wizard creates the admin account. Admin panel manages API keys (stored in DB, not .env) and user accounts.
7. **Async Job System** — Long-running tasks (large region scans, batch property lookups, census loading) run as background jobs with progress polling.

### User Flow

1. User visits the site → redirected to `/login` (or `/setup` on first run)
2. Admin creates account via setup wizard → auto-logged in → redirected to `/dashboard`
3. Dashboard shows Google Maps (satellite view) with a sidebar (3 tabs: Regions, Results, Layers)
4. User clicks "Draw New Region" → draws a rectangle on the map → Overpass API scans for water bodies
5. Water bodies appear as colored polygons; listed in the Results tab
6. User can click any water body → detail modal with area, coordinates, OSM tags → "Find Owner" button triggers Smarty API lookup
7. Layers tab toggles overlays: water bodies, pools/small ponds, wealth demographics, property classification, saved regions

---

## 2. Architecture

```
┌──────────────────┐     HTTP     ┌──────────────────┐
│   Next.js 16     │◄───────────►│   Express 5       │
│   Frontend       │   :3001     │   Backend API     │
│   :3000          │             │                   │
│                  │             │   ┌─────────────┐ │
│  @vis.gl/        │             │   │  MongoDB    │ │
│  react-google-   │             │   │  :27017     │ │
│  maps            │             │   └─────────────┘ │
│                  │             │                   │
│  Overpass API ◄──┤ (client)    │  Smarty API ◄─────┤
│  (water bodies)  │             │  Census/TIGERweb ◄┤
└──────────────────┘             └──────────────────┘
         ▲
         │  Cloudflare Tunnel (prod)
         ▼
      Internet
```

- **Monorepo** with a root `package.json` (backend) and `frontend/` subdirectory (Next.js)
- Backend runs on port 3001, frontend on port 3000
- Frontend calls backend via `NEXT_PUBLIC_API_URL` (env var)
- API keys for external services are stored in MongoDB (Settings model), **not** in environment variables
- Authentication is JWT-based; tokens stored in `localStorage` + a mirrored cookie

---

## 3. Tech Stack & Versions

### Backend
| Package | Version | Purpose |
|---------|---------|---------|
| Node.js | 22+ LTS | Runtime |
| Express | 5.2.1 | HTTP framework (note: Express 5, not 4) |
| Mongoose | 9.2.3 | MongoDB ODM |
| TypeScript | 5.9.3 | Type safety, compiled to `dist/` |
| bcryptjs | 3.0.3 | Password hashing |
| jsonwebtoken | 9.0.3 | JWT auth |
| helmet | 8.1.0 | Security headers |
| cors | 2.8.6 | Cross-origin |
| express-rate-limit | 8.2.1 | Rate limiting (200 req/15min) |
| express-validator | 7.3.1 | Input validation |
| dotenv | 17.3.1 | .env loading |
| tsx | 4.21.0 | Dev-time TS execution |

### Frontend
| Package | Version | Purpose |
|---------|---------|---------|
| Next.js | 16.1.6 | React framework (App Router) |
| React | 19.2.3 | UI library |
| @vis.gl/react-google-maps | 1.7.1 | Google Maps wrapper |
| Tailwind CSS | 4 | Styling |
| TypeScript | 5 | Type safety |

### Infrastructure
| Service | Purpose |
|---------|---------|
| MongoDB 7 | Database |
| Cloudflare Tunnel | HTTPS termination + domain routing |

### Key Compatibility Notes
- **Express 5**: Route params via `req.params.id` return `ReadonlyArray<string>`, so use `String(req.params.id)`.
- **`@vis.gl/react-google-maps`**: Exports `Map` which conflicts with JS `Map` constructor — import as `Map as GoogleMap`.
- **Root `package.json`**: `"type": "module"` — all backend code uses ES module imports.
- **Root `tsconfig.json`**: `module: "ES2020"`, `moduleResolution: "bundler"`, `outDir: "./dist"`, `rootDir: "."`, only includes `backend/**/*.ts`.

---

## 4. Project Structure

```
pond-finder/
├── .env                          # Shared env vars (backend + frontend reads via dotenv)
├── package.json                  # Root = backend deps + scripts
├── tsconfig.json                 # Backend TS config → compiles to dist/
├── deploy.sh                     # Debian production deployment script
│
├── backend/
│   ├── server.ts                 # Entry point: connect DB, start Express
│   ├── app.ts                    # Express app: middleware + route registration
│   ├── config/
│   │   ├── database.ts           # Mongoose connection
│   │   └── environment.ts        # Config object from env vars
│   ├── middleware/
│   │   ├── authMiddleware.ts     # JWT Bearer token verification
│   │   ├── errorHandler.ts       # Global error handler (Mongoose, JWT, etc.)
│   │   ├── requestLogger.ts      # Colorized request/response logger
│   │   ├── requireAdmin.ts       # Admin role check
│   │   └── validateRequest.ts    # express-validator result checker
│   ├── models/
│   │   ├── User.ts               # User with bcrypt password hashing
│   │   ├── Settings.ts           # Singleton: API keys + app config
│   │   ├── WaterFeature.ts       # Saved water body with GeoJSON bounds
│   │   ├── PropertyOwner.ts      # Property owner from Smarty API
│   │   └── Job.ts                # Async job queue entries
│   ├── services/
│   │   ├── authService.ts        # Login, JWT generation/verification
│   │   ├── smartyService.ts      # Smarty API: address validation, reverse geocode, property enrichment
│   │   ├── censusService.ts      # Census Bureau: TIGERweb county/tract queries + ACS income data
│   │   └── jobService.ts         # In-process async job queue (concurrency=2)
│   ├── controllers/
│   │   ├── authController.ts     # Login + profile endpoints
│   │   ├── setupController.ts    # First-run admin creation
│   │   ├── settingsController.ts # API key management + user CRUD
│   │   ├── waterFeatureController.ts # CRUD + geospatial nearby query
│   │   └── propertyController.ts    # Property lookup by address or coordinates
│   └── routes/
│       ├── authRoutes.ts
│       ├── setupRoutes.ts
│       ├── settingsRoutes.ts
│       ├── waterFeatureRoutes.ts
│       ├── propertyRoutes.ts
│       ├── censusRoutes.ts
│       └── jobRoutes.ts
│
└── frontend/
    ├── next.config.ts            # Loads root .env via dotenv, Turbopack config
    ├── package.json              # Frontend deps
    ├── tsconfig.json             # Next.js TS config (strict, paths: @/* → ./src/*)
    ├── postcss.config.mjs        # PostCSS + Tailwind
    └── src/
        ├── types.ts              # Shared TypeScript interfaces
        ├── app/
        │   ├── layout.tsx        # Root layout with AuthProvider
        │   ├── page.tsx          # "/" → redirect to /login
        │   ├── globals.css       # Tailwind imports
        │   ├── login/page.tsx    # Login form
        │   ├── setup/page.tsx    # First-run admin setup wizard
        │   └── dashboard/page.tsx # Main dashboard (requires auth)
        ├── components/
        │   ├── MapView.tsx       # Google Maps with all overlay sub-components (~1100 lines)
        │   ├── Sidebar.tsx       # 3-tab sidebar: Regions, Results, Layers (~600 lines)
        │   ├── Navbar.tsx        # Top nav bar with settings + logout
        │   ├── WaterBodyCard.tsx  # Water body list item in sidebar
        │   ├── WaterBodyDetailModal.tsx # Detail modal with owner lookup
        │   ├── SettingsPanel.tsx  # Admin settings modal (API keys + users)
        │   └── LocationPrompt.tsx # Address search with Google Places autocomplete
        └── lib/
            ├── api.ts            # All backend API calls (~450 lines)
            ├── auth.tsx          # AuthProvider + useAuth + useRequireAuth hooks
            ├── overpass.ts       # Overpass API client with caching + rate limiting (~380 lines)
            ├── savedRegions.ts   # localStorage CRUD for saved scan regions
            └── toast.tsx         # Toast notification system
```

---

## 5. Environment & Configuration

### `.env` (shared by backend + frontend)

```env
PORT=3001
NODE_ENV=production
MONGO_URI=mongodb://localhost:27017/pond-finder
JWT_SECRET=<random-64-char-hex>
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- API keys (Google Maps, Smarty, Census) are stored in MongoDB `Settings` collection, **not** in .env.
- Frontend reads `NEXT_PUBLIC_API_URL` at build time.
- Frontend `next.config.ts` uses `dotenv` to load the root `.env` file (`config({ path: resolve(__dirname, '..', '.env') })`).

---

## 6. Database Models

### User
```typescript
{
  username: string (unique, 3-30 chars)
  email: string (unique, validated)
  password: string (bcrypt hashed, select: false)
  role: "admin" | "user"
  timestamps: true
}
```
- Pre-save hook hashes password with bcrypt (12 salt rounds)
- `comparePassword()` instance method

### Settings (Singleton)
```typescript
{
  googleMapsApiKey: string (default "")
  smartyAuthId: string (default "")
  smartyAuthToken: string (default "")
  censusApiKey: string (default "")
  setupCompleted: boolean (default false)
  appName: string (default "Pond Finder")
  timestamps: true
}
```
- Static method `getInstance()` — finds or creates the singleton document

### WaterFeature
```typescript
{
  name: string (required, max 100)
  description: string (max 500)
  featureType: "pond" | "lake" | "stream" | "river" | "wetland" | "reservoir" | "other"
  bounds: GeoJSON Polygon
  center: GeoJSON Point [lng, lat]
  area: number (square meters)
  address, city, state, zipCode: strings
  propertyOwner: ObjectId ref → PropertyOwner
  createdBy: ObjectId ref → User
  notes: string, tags: string[]
  isVerified: boolean
  timestamps: true
}
```
- 2dsphere index on `center` for geospatial queries

### PropertyOwner
```typescript
{
  firstName, lastName, companyName: strings
  mailingAddress: { street, city, state, zipCode }
  propertyAddress: { street, city, state, zipCode }
  parcelId, phone, email: strings
  propertyType: string
  lotSizeAcres: number, marketValue: number
  coordinates: GeoJSON Point
  waterFeatures: [ObjectId ref → WaterFeature]
  smartyLookupId: string (unique, sparse)
  lastVerified: Date
  notes: string
  createdBy: ObjectId ref → User
  timestamps: true
}
```

### Job (Async Task Queue)
```typescript
{
  type: "water-scan" | "batch-property" | "census-load" | "full-analysis"
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  progress: number (0-100)
  statusMessage: string
  params: Mixed
  result: Mixed
  error: string | null
  createdBy: ObjectId ref → User
  startedAt, completedAt: Date | null
  timestamps: true
}
```
- Indexes: `{ status: 1, createdAt: -1 }`, `{ createdBy: 1, createdAt: -1 }`
- TTL index: `completedAt` expires after 24 hours

---

## 7. Backend API

### Route Map

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/setup/status` | No | Check if setup needed (`{ needsSetup, hasUsers }`) |
| POST | `/api/setup/init` | No | Create first admin account (only if no users exist) |
| POST | `/api/auth/login` | No | Login with username/email + password → JWT token |
| GET | `/api/auth/profile` | Yes | Get current user profile |
| GET | `/api/public/maps-key` | No | Get Google Maps API key (for frontend before login) |
| GET | `/api/health` | No | Health check |
| GET | `/api/settings` | Admin | Get app settings |
| PUT | `/api/settings` | Admin | Update settings (API keys, app name) |
| GET | `/api/settings/api-keys` | Admin | Get API keys |
| GET | `/api/settings/users` | Admin | List all users |
| POST | `/api/settings/users` | Admin | Create user |
| PUT | `/api/settings/users/:id` | Admin | Update user |
| DELETE | `/api/settings/users/:id` | Admin | Delete user |
| GET | `/api/water-features` | Yes | List water features (with pagination) |
| GET | `/api/water-features/nearby` | Yes | Find water features near coordinates |
| GET | `/api/water-features/:id` | Yes | Get single water feature |
| POST | `/api/water-features` | Yes | Create water feature (validated) |
| PUT | `/api/water-features/:id` | Yes | Update water feature |
| DELETE | `/api/water-features/:id` | Yes | Delete water feature |
| POST | `/api/properties/lookup` | Yes | Lookup property by address via Smarty |
| POST | `/api/properties/lookup-coordinates` | Yes | Lookup property by lat/lng via Smarty |
| GET | `/api/properties` | Yes | List properties |
| GET | `/api/properties/:id` | Yes | Get single property |
| DELETE | `/api/properties/:id` | Yes | Delete property |
| GET | `/api/census/income` | Yes | Get census tract income data for bounding box |
| POST | `/api/jobs` | Yes | Create async job |
| GET | `/api/jobs` | Yes | List user's jobs |
| GET | `/api/jobs/:id` | Yes | Get job status/result |
| DELETE | `/api/jobs/:id` | Yes | Cancel a job |

### Middleware Stack (in order)
1. `helmet()` — Security headers
2. `cors({ origin, credentials })` — CORS
3. `rateLimit({ windowMs: 15min, max: 200 })` — Rate limiting
4. `express.json({ limit: '10mb' })` — Body parsing
5. `requestLogger` — Colorized request logging
6. Route handlers
7. `errorHandler` — Global error handler

### Census Endpoint Details
`GET /api/census/income?south=X&west=X&north=X&east=X`
- Validates bounding box params (must be numeric, max 2° span)
- Calls `getCensusIncomeByBBoxCached()` which:
  1. Queries TIGERweb layer **82** (Counties) for state+county FIPS codes intersecting the bbox
  2. Queries TIGERweb layer **8** (Census Tracts) for tract geometries (tries GeoJSON format, falls back to ESRI JSON)
  3. Queries Census ACS 5-Year API for median household income (variable `B19013_001E`) per tract
  4. Merges geometry + income data
  5. Caches results for 30 minutes

---

## 8. External Service Integrations

### OpenStreetMap Overpass API (Frontend)
- **URL**: `https://overpass-api.de/api/interpreter`
- **Method**: POST with Overpass QL query
- **Purpose**: Find water bodies within a bounding box
- **Query targets**: `natural=water`, `water=pond|lake|reservoir|basin`, `landuse=reservoir|basin`, `natural=wetland`, optionally `leisure=swimming_pool`, `man_made=pond`
- **Caching**: 5-minute TTL, max 50 cached responses, keyed by rounded bbox (3 decimal places)
- **Rate limit handling**: Exponential backoff on 429 responses
- **Debouncing**: 1500ms delay between requests
- **Area filtering**: Normal mode ≥100 sq meters, small mode ≥5 sq meters, max 1,000,000 sq meters

### Google Maps JavaScript API (Frontend)
- **Libraries loaded**: `drawing`, `geometry`, `places`
- **Map type**: Hybrid (satellite + labels)
- **Features**: Rectangle drawing for region selection, polygon rendering for water bodies, marker rendering for property types, Places autocomplete for address search
- **Auth failure detection**: Listens for `gm_authFailure` callback + MutationObserver for error overlay DOM element

### Smarty API (Backend)
- **APIs used**:
  - US Street Address: `https://us-street.api.smarty.com/street-address` (validation)
  - US Reverse Geocoding: `https://us-reverse-geo.api.smarty.com/lookup`
  - US Property Enrichment: `https://us-enrichment.api.smarty.com/lookup/{zip}/{address}/property/principal`
- **Auth**: Query params `auth-id` + `auth-token`
- **Flow**: Coordinates → reverse geocode → closest address → validate address → enrichment API for owner data
- **Returns**: Owner name, mailing address, property address, parcel ID, property type, lot size, market value, coordinates

### Census Bureau (Backend)
- **TIGERweb MapServer**: `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer`
  - Layer 82 = Counties (used to get state+county FIPS codes for a bbox)
  - Layer 8 = Census Tracts (used to get tract geometries)
  - Query format: ESRI geometry envelope with `inSR=4326`, `spatialRel=esriSpatialRelIntersects`
  - **IMPORTANT**: Layer IDs differ between TIGERweb vintages. `tigerWMS_Current` uses layer 82 for counties (not 100).
- **ACS 5-Year API**: `https://api.census.gov/data/2022/acs/acs5`
  - Variable: `B19013_001E` (median household income)
  - Queried per state+county for all tracts
  - API key optional (lower rate limit without one)
- **Caching**: 30-minute TTL in-memory Map

---

## 9. Frontend Application

### Pages

| Route | Component | Auth | Description |
|-------|-----------|------|-------------|
| `/` | `page.tsx` | No | Redirects to `/login` |
| `/login` | `login/page.tsx` | No | Login form (username/email + password) |
| `/setup` | `setup/page.tsx` | No | First-run admin creation wizard |
| `/dashboard` | `dashboard/page.tsx` | Yes | Main application |

### Dashboard State Management
The dashboard page manages all state via React hooks (no external state library):
- `overlays: OverlayConfig` — which map layers are enabled
- `waterBodies: WaterBodyResult[]` — detected water bodies from Overpass
- `scanRegion: BoundingBox | null` — currently scanned region
- `propertyTypesMap: Map<string, string>` — water body ID → property classification
- `selectedWaterBody`, `propertyOwner`, `savedRegions`, etc.

### MapView Component (~1100 lines)
Contains multiple sub-components rendered inside the Google Maps `APIProvider`:
- **MapInitializer** — Sets hybrid map type + custom styles (hides POIs)
- **MapFocuser** — Pans/zooms to a target location
- **RegionDrawingLayer** — Google Maps DrawingManager for rectangle selection
- **SavedRegionsLayer** — Renders saved region rectangles
- **ScanRegionOverlay** — Green rectangle showing current scan area
- **MapScanner** — Triggers Overpass API scan when scanning starts
- **CensusOverlayLayer** — Renders census tract polygons color-coded by income
- **PropertyTypeOverlayLayer** — Renders red/green circle markers for commercial/residential
- **WaterBodyLayer** — Renders water body polygons with type-based colors
- Overlays: Auth error banner, drawing mode indicator, loading spinner, rate limit warning, census legend, property type legend

### Sidebar Component (~600 lines)
Three tabs:
1. **Regions** — Draw new region button, save current region, list of saved regions with rename/delete
2. **Results** — Search + filter water bodies, sort by name/area/type/property, water body cards with "Find Owner" button
3. **Layers** — Toggle switches for: Water Bodies, Pools & Small Ponds, Wealth Demographics, Property Classification, Saved Regions

### Color Schemes
- **Water body types**: pond=blue, lake=sky, reservoir=indigo, basin=violet, wetland=green, pool=amber, water=cyan
- **Census income**: Red ($20k) → Yellow ($80k) → Green ($150k+), gray for no data
- **Property types**: Red circle "B" = commercial/business, Green circle "R" = residential

---

## 10. Authentication & Authorization

### Flow
1. **First run**: No users exist → `/setup` page → create admin account → auto-login with JWT
2. **Login**: POST `/api/auth/login` with identifier (username or email) + password → returns JWT + user object
3. **Token storage**: `localStorage` key `pond_finder_token` + mirrored to cookie `pond_finder_token` (7-day max-age)
4. **Request auth**: `Authorization: Bearer <token>` header on all API calls
5. **401 handling**: Clears token, redirects to `/login`
6. **Cross-tab sync**: `storage` event listener detects token removal in other tabs

### Roles
- **admin**: Full access, can manage API keys and user accounts
- **user**: Can use all features except settings management

### AuthProvider (React Context)
- Provides `user`, `isLoading`, `login()`, `logout()`
- `useRequireAuth()` hook redirects to `/login` if not authenticated

---

## 11. Known Issues & Technical Debt

### Architecture Issues
1. **MapView is 1100+ lines** — Should be split into separate files for each overlay layer
2. **No tests** — Zero unit, integration, or E2E tests
3. **No input validation on frontend** — Backend validates, but frontend doesn't prevent bad submissions
4. **State management is all in dashboard page** — Would benefit from Zustand or similar
5. **Overpass API calls from frontend** — Should be proxied through backend to hide implementation and add server-side caching
6. **Saved regions in localStorage** — Lost when clearing browser data; should be in MongoDB
7. **Property type lookups fire on overlay toggle** — Hammers the Smarty API with rapid calls; needs proper queuing
8. **No pagination on water body results** — Large scans could return hundreds of results
9. **Job system is in-process** — If the server restarts, running jobs are lost; needs Redis/BullMQ for production

### Code Quality Issues
1. **Liberal use of `as any`** — Especially in census service and API response parsing
2. **`(req as any).userId`** — Should use proper Express type augmentation
3. **Duplicate property classification logic** — Same regex-matching function exists in both `jobService.ts` and `MapView.tsx`
4. **Frontend .env loading** — Uses `dotenv` in `next.config.ts` which is fragile; should use Next.js built-in env loading
5. **No error boundaries** — Frontend errors crash the whole page
6. **No loading skeletons** — Just spinner text

### API Issues
1. **TIGERweb layer IDs change between vintages** — Was using layer 100 (old `tigerWMS_ACS2022`), needed layer 82 in `tigerWMS_Current`
2. **Smarty API 503s flood the logs** when credentials aren't configured — The property type overlay batch-fires 30+ requests that all fail
3. **Census API rate limiting** — No key = very low rate limit; should prompt user to add one
4. **No retry logic** for TIGERweb or Census API failures

---

## 12. How to Recreate Better

### If rebuilding from scratch, here's what to do differently:

#### Architecture
- **Use a monorepo tool** (Turborepo or Nx) instead of manual npm workspaces
- **Backend**: Keep Express 5 + TypeScript, but add proper request type augmentation instead of `as any`
- **Frontend**: Next.js App Router is fine, but consider using Server Actions for API calls instead of a separate backend
- **State management**: Use Zustand or Jotai instead of prop-drilling everything through the dashboard page
- **Split MapView.tsx** into `components/map/` directory with individual files per overlay

#### External APIs
- **Proxy Overpass through backend** — Add a `/api/water-bodies/scan` endpoint that calls Overpass server-side
- **Queue Smarty lookups** — Use a proper job queue (BullMQ + Redis) instead of firing all requests simultaneously
- **Cache census data in MongoDB** — Instead of in-memory Map with 30-min TTL
- **Handle TIGERweb layer discovery dynamically** — Query the MapServer's layer list to find the Counties layer by name, not by hardcoded ID

#### Data Layer
- **Move saved regions to MongoDB** — With user association
- **Add proper geospatial indexing** — Use MongoDB's `$geoWithin` and `$near` queries
- **Water body deduplication** — Same pond can be returned in overlapping scans

#### Auth
- **Use NextAuth.js or Auth.js** — Instead of custom JWT implementation
- **Add password reset** — Currently impossible without DB access
- **Add session management** — Show active sessions, allow invalidation

#### UI/UX
- **Add proper loading states** with skeleton components
- **Add React Error Boundaries** — No white-screen-of-death
- **Add map controls** — Zoom to all results, measure distance, toggle labels
- **Add export** — Export water body list as CSV/GeoJSON
- **Mobile responsive** — Currently desktop-only
- **Dark mode** — The sidebar is white but could match the dark map

#### Testing
- **Backend**: Vitest + Supertest for API testing with MongoDB memory server
- **Frontend**: Playwright for E2E, React Testing Library for components
- **Mock external APIs** — Overpass, Smarty, Census should be mockable for tests

#### Deployment
- **Docker Compose** — Backend, frontend, MongoDB, and Cloudflare Tunnel in one `docker-compose.yml`
- **Health checks** — Already has `/api/health`, but frontend should also expose one
- **Monitoring** — Add Sentry or similar for error tracking
- **Rate limiting per-user** — Current rate limit is global, not per-user

---

## 13. Deployment

### Production Deployment (Debian + Cloudflare Tunnel)

A `deploy.sh` script handles everything:

```bash
sudo ./deploy.sh
```

It installs Node.js 22, MongoDB 7, builds both apps, generates a `.env` with a random JWT secret, creates and starts systemd services (`pond-finder-backend`, `pond-finder-frontend`).

Point your Cloudflare Tunnel to `http://localhost:3000`.

### First-Time After Deploy
1. Open the app → Setup wizard
2. Create admin account
3. Settings → API Keys:
   - **Google Maps API Key** (required — enable Maps JavaScript API + Drawing + Geometry + Places)
   - **Smarty Auth ID + Token** (required for property lookups)
   - **Census API Key** (optional, from https://api.census.gov/data/key_signup.html)

### Redeployment
```bash
cd /path/to/repo
git pull
sudo ./deploy.sh
```

### Service Management
```bash
sudo systemctl status pond-finder-backend
sudo systemctl status pond-finder-frontend
sudo journalctl -u pond-finder-backend -f   # live logs
sudo journalctl -u pond-finder-frontend -f
sudo systemctl restart pond-finder-backend
sudo systemctl restart pond-finder-frontend
```

---

## Appendix: Key Data Flows

### Water Body Scan
```
User draws rectangle on map
→ Dashboard sets scanRegion + isScanning
→ MapScanner calls fetchWaterBodiesDebounced()
→ Overpass API POST with QL query (bbox filter)
→ Parse response: extract coordinates, type, area, centroid
→ Filter by area (100-1M sq meters)
→ Return WaterBodyResult[] to Dashboard
→ WaterBodyLayer renders polygons on map
→ Sidebar Results tab lists water bodies
```

### Property Owner Lookup
```
User clicks "Find Owner" on water body
→ Dashboard calls apiLookupPropertyByCoords({ lat, lng })
→ Backend POST /api/properties/lookup-coordinates
→ Check Smarty credentials configured (else 503)
→ smartyService.reverseGeocode(lat, lng) → closest address
→ smartyService.lookupPropertyOwner(street, city, state, zip)
  → validateAddress() → US Street API
  → Property Enrichment API → owner name, property type, value
→ Upsert PropertyOwner in MongoDB
→ Return PropertyOwner to frontend
→ WaterBodyDetailModal shows owner info
```

### Census Demographics Overlay
```
User toggles "Wealth Demographics" in Layers tab
→ MapView useEffect: showCensusOverlay + scanRegion
→ apiGetCensusIncome(scanRegion)
→ Backend GET /api/census/income?south=X&west=X&north=X&east=X
→ censusService.getCensusIncomeByBBoxCached()
  → getCountiesInBBox() → TIGERweb layer 82 query → state/county FIPS
  → getTractGeometries() → TIGERweb layer 8 → GeoJSON polygons
  → getIncomeForCounties() → ACS API → median income per tract
  → Merge geometries + income data
→ Return CensusTractIncome[] to frontend
→ CensusOverlayLayer renders color-coded polygons
→ Legend appears in bottom-right corner
→ Click tract → InfoWindow with income details
```

# 🌊 Pond Finder

Discover water features (ponds, lakes, streams, etc.) on a map, draw boundaries around them, and look up property owner information.

## Architecture

```
pond-finder/
├── backend/                  # Express + TypeScript server
│   ├── config/               # Database & environment config
│   │   ├── database.ts       # MongoDB/Mongoose connection
│   │   └── environment.ts    # Centralized env config
│   ├── controllers/          # Request handlers
│   │   ├── authController.ts
│   │   ├── waterFeatureController.ts
│   │   └── propertyController.ts
│   ├── models/               # Mongoose schemas
│   │   ├── User.ts
│   │   ├── WaterFeature.ts
│   │   └── PropertyOwner.ts
│   ├── routes/               # Express route definitions
│   │   ├── authRoutes.ts
│   │   ├── waterFeatureRoutes.ts
│   │   └── propertyRoutes.ts
│   ├── services/             # Business logic & API integrations
│   │   ├── authService.ts    # JWT auth
│   │   └── smartyService.ts  # Smarty API integration
│   ├── app.ts                # Express app setup
│   └── server.ts             # Server entry point
├── middleware/                # Shared middleware layer
│   ├── authMiddleware.ts     # JWT token verification
│   ├── errorHandler.ts       # Global error handler
│   ├── requestLogger.ts      # HTTP request logger
│   └── validateRequest.ts    # express-validator checker
├── frontend/                 # Static frontend
│   └── public/
│       ├── css/styles.css    # All styles
│       ├── js/
│       │   ├── api.js        # API client module
│       │   ├── auth.js       # Login/register page logic
│       │   ├── map.js        # Google Maps & drawing tools
│       │   └── dashboard.js  # Dashboard UI & feature management
│       └── pages/
│           ├── login.html    # Auth page
│           └── dashboard.html # Main application page
├── .env.example              # Environment template
├── tsconfig.json
├── package.json
└── README.md
```

## Prerequisites

- **Node.js** >= 18
- **MongoDB** running locally or a cloud instance (e.g., MongoDB Atlas)
- **Google Maps API key** with Maps JavaScript API + Drawing library enabled
- **Smarty API credentials** (auth-id + auth-token) for property lookups

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env with your MongoDB URI, API keys, and a JWT secret

# 3. Start in development mode
npm run dev

# 4. Open in browser
# http://localhost:3000
```

## Available Scripts

| Command          | Description                              |
| ---------------- | ---------------------------------------- |
| `npm run dev`    | Start dev server with hot-reload         |
| `npm run build`  | Compile TypeScript to `dist/`            |
| `npm start`      | Run compiled production build            |

## API Endpoints

All API routes are prefixed with `/api`. Protected routes require a `Bearer <token>` header.

### Auth
| Method | Endpoint             | Auth | Description            |
| ------ | -------------------- | ---- | ---------------------- |
| POST   | `/api/auth/register` | No   | Create a new account   |
| POST   | `/api/auth/login`    | No   | Login, returns JWT     |
| GET    | `/api/auth/profile`  | Yes  | Get current user info  |

### Water Features
| Method | Endpoint                        | Auth | Description                     |
| ------ | ------------------------------- | ---- | ------------------------------- |
| GET    | `/api/water-features`           | Yes  | List all features (filterable)  |
| POST   | `/api/water-features`           | Yes  | Create a new water feature      |
| GET    | `/api/water-features/nearby`    | Yes  | Find features near lat/lng      |
| GET    | `/api/water-features/:id`       | Yes  | Get feature details             |
| PUT    | `/api/water-features/:id`       | Yes  | Update a feature                |
| DELETE | `/api/water-features/:id`       | Yes  | Delete a feature                |

### Properties
| Method | Endpoint                              | Auth | Description                          |
| ------ | ------------------------------------- | ---- | ------------------------------------ |
| POST   | `/api/properties/lookup`              | Yes  | Look up owner by address (Smarty)    |
| POST   | `/api/properties/lookup-coordinates`  | Yes  | Look up owner by lat/lng (Smarty)    |
| GET    | `/api/properties`                     | Yes  | List all saved property owners       |
| GET    | `/api/properties/:id`                 | Yes  | Get property owner details           |
| PUT    | `/api/properties/:id`                 | Yes  | Update property owner record         |
| DELETE | `/api/properties/:id`                 | Yes  | Delete property owner record         |

### Utility
| Method | Endpoint               | Auth | Description                |
| ------ | ---------------------- | ---- | -------------------------- |
| GET    | `/api/health`          | No   | API health check           |
| GET    | `/api/config/maps-key` | No   | Get Google Maps API key    |

## Tech Stack

- **Backend:** Node.js, Express 5, TypeScript, Mongoose
- **Frontend:** Vanilla HTML/CSS/JS, Google Maps JavaScript API
- **Database:** MongoDB
- **Auth:** JWT (bcryptjs + jsonwebtoken)
- **APIs:** Google Maps, Smarty (address validation + property enrichment)
- **Security:** Helmet, CORS, rate limiting, input validation

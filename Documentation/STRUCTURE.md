# Notus Project Structure

Quick reference for where to find and add code. Updated for team navigation.

---

## Root

```
Notus/
├── frontend/               # React frontend (Vite)
├── backend/                # Express backend (Node.js)
├── Documentation/          # Project documentation
├── scripts/                # Setup scripts (e.g. storage CORS)
├── firebase.json           # Firebase CLI config
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Firestore indexes
├── storage.rules           # Firebase Storage rules
├── package.json            # Root scripts (dev, build, install:all)
├── README.md               # Setup & run instructions
└── .gitignore
```

---

## Frontend (`frontend/`)

```
frontend/
├── public/                 # Static assets (favicon, images)
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── ui/             # Shared primitives (Button, etc.)
│   │   │   ├── Button.jsx
│   │   │   ├── Button.css
│   │   │   └── index.js
│   │   ├── auth/           # Auth step components (SignUp, Login)
│   │   ├── app/            # App shell (Header, Footer)
│   │   └── landing/        # Landing page sections
│   │       ├── Nav.jsx
│   │       ├── Hero.jsx
│   │       ├── Features.jsx
│   │       ├── HowItWorks.jsx
│   │       ├── CTA.jsx
│   │       ├── Footer.jsx
│   │       ├── *.css (per component)
│   │       └── index.js
│   │
│   ├── pages/              # Full page components
│   │   ├── LandingPage.jsx
│   │   ├── SignUpPage.jsx
│   │   ├── LoginPage.jsx
│   │   ├── AppPage.jsx     # Dashboard
│   │   ├── ProfilePage.jsx
│   │   ├── SettingsPage.jsx
│   │   ├── OrgPage.jsx
│   │   ├── OrgAdminPage.jsx
│   │   ├── TeamPage.jsx
│   │   └── index.js
│   │
│   ├── lib/                # Config, utilities, API helpers
│   │   └── firebase.js     # Firebase Auth, Firestore, Analytics
│   │
│   ├── styles/             # Global & shared styles
│   │   ├── index.css       # Resets, base styles
│   │   ├── variables.css   # Design tokens (colors, fonts)
│   │   └── landing.css     # Landing layout
│   │
│   ├── assets/             # Images, icons (import in components)
│   ├── App.jsx             # Routes & app shell
│   └── main.jsx            # Entry point
│
├── index.html
├── vite.config.js
├── package.json
└── .env                    # Local env (copy from .env.example)
```

### Where to add things

| You want to...                    | Add or edit...                              |
|-----------------------------------|---------------------------------------------|
| New page (Login, Dashboard)       | `pages/` + add route in `App.jsx`           |
| Reusable UI (Input, Modal, Card)  | `components/ui/`                            |
| Feature-specific components       | `components/<feature>/` (e.g. `components/auth/`) |
| API calls, Firebase helpers       | `lib/`                                      |
| New colors, spacing, fonts        | `styles/variables.css`                      |
| Page-specific styles              | `styles/<page>.css` or co-located with component |

---

## Backend (`backend/`)

```
backend/
├── src/
│   ├── config/             # App configuration
│   │   └── index.js        # Env, Firebase config
│   │
│   ├── routes/             # API route handlers
│   │   └── index.js        # Health check, route aggregator
│   │
│   ├── middleware/         # Express middleware
│   │   └── index.js        # Auth, error handling, etc.
│   │
│   └── index.js            # Express app, CORS, mount routes
│
├── package.json
└── .env                    # Local env (copy from .env.example)
```

### Where to add things

| You want to...                    | Add or edit...                              |
|-----------------------------------|---------------------------------------------|
| New API endpoint                  | `routes/<name>.js` + mount in `routes/index.js` |
| Auth, validation, logging         | `middleware/`                               |
| Env vars, app config              | `config/index.js`                           |
| DB models, services               | `models/` or `services/` (create when needed) |

---

## Common paths

| What                | Path                                        |
|---------------------|---------------------------------------------|
| Landing page        | `frontend/src/pages/LandingPage.jsx`        |
| Shared button       | `frontend/src/components/ui/Button.jsx`     |
| Firebase setup      | `frontend/src/lib/firebase.js`              |
| Design tokens       | `frontend/src/styles/variables.css`         |
| API health check    | `backend/src/routes/index.js`               |
| Server config       | `backend/src/config/index.js`               |

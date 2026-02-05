# Notus Architecture Rules

**Non-negotiable rules for identity, data, and security.** All contributors must follow these. Do not deviate without explicit team approval.

---

## Stack (Do Not Migrate)

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite |
| Routing | React Router |
| Backend | Node.js + Express |
| Database | Firestore |
| Auth | Firebase Auth |

**Do not** migrate to Next.js or introduce a new framework.

---

## Styling (Do Not Introduce New Systems)

- **Approach:** Plain CSS with design tokens (`frontend/src/styles/variables.css`)
- **Pattern:** Component co-located CSS files (e.g. `Button.css`, `Nav.css`)
- **Do not** add Tailwind, styled-components, CSS Modules, or any new styling system.

---

## Firebase: Single Source of Truth

- **Client-side init:** `frontend/src/lib/firebase.js` — **this is the only Firebase initialization file.**
- **Do not** create a second Firebase init file or duplicate config anywhere in the frontend.
- **Backend:** Uses `firebase-admin` (separate SDK) for server-side operations only. This is distinct from the client SDK.

---

## Identity & User Data

### Firebase Auth is the identity provider

- All sign-in (Google, Email/Password, etc.) flows through Firebase Auth.
- `auth.currentUser.uid` is the canonical user identifier everywhere.

### Firestore stores application data

- Meetings, channels, notes, transcripts — all in Firestore.
- Firestore is **not** used for password storage or auth credentials.

### Exactly one canonical user profile per user

| Rule | Detail |
|------|--------|
| **Path** | `users/{uid}` — where `uid` is from `Firebase Auth` |
| **One doc per user** | One document per authenticated user. No duplicates. |
| **Provider-agnostic** | Same path for Google, Email/Password, or any future provider. |

### Forbidden collections

**Do not create or use:**

- `googleUsers`
- `emailUsers`
- `profiles`
- `usersByEmail`
- Any provider-specific user collection (e.g. `google_accounts`)

User data lives only at `users/{uid}`.

### Passwords are NEVER stored in Firestore

- Passwords are handled **exclusively** by Firebase Auth.
- Firestore must **never** contain password fields, hashes, or auth secrets.

---

## Organizations & Memberships

### Collections

| Collection | Path | Purpose |
|------------|------|---------|
| Organizations | `organizations/{orgId}` | Org name, createdBy |
| Memberships | `memberships/{orgId_userId}` | userId, orgId, role, state |

### Membership states

`pending`, `active`, `rejected`, `removed`

### Membership roles

`owner`, `admin`, `member`

### Request/approve flow

- **No invite codes or links.** All join requests and approvals happen in the app UI.
- User searches org by name → Request to join → membership created with `state=pending`
- Owner/admin approves or rejects in `/app/org/:orgId/admin`

### Teams (inside organizations)

| Collection | Path | Purpose |
|------------|------|---------|
| Teams | `organizations/{orgId}/teams/{teamId}` | Team name, orgId |
| Team memberships | `organizations/{orgId}/teamMemberships/{teamId_userId}` | userId, teamId, role, state |

- Teams exist only inside orgs. No teams outside orgs.
- User must be active org member to request to join a team.
- Team roles: `admin`, `member`
- Team states: `pending`, `active`, `rejected`, `removed`
- Team admin or org admin/owner can approve/reject team join requests.

### Meetings (inside organizations)

| Collection | Path | Purpose |
|------------|------|---------|
| Meetings | `organizations/{orgId}/meetings/{meetingId}` | title, scope, startAt, endAt, createdBy |

- Meetings belong to an organization. One meeting has exactly one scope: `org`, `team`, or `private`.
- **org:** visible to all active org members.
- **team:** visible only to active members of `scopeTeamId`.
- **private:** visible only to users in `scopeInviteList`.
- Calendar views are filters: org calendar = org-scoped; team calendar = team-scoped; personal = all meetings user can access.

---

## Environment & Secrets

- **`.env`** files hold secrets (API keys, Firebase config, etc.).
- **`.env`** is listed in `.gitignore` — never commit it.
- Use **`.env.example`** as a template (no real values). Copy to `.env` and fill in locally.
- Frontend: `frontend/.env.example` → `frontend/.env`
- Backend: `backend/.env.example` → `backend/.env`

---

## Summary Checklist

- [ ] Firebase Auth = identity provider
- [ ] Firestore = application data
- [ ] User profile path: `users/{uid}` only
- [ ] No `googleUsers`, `emailUsers`, `profiles`, `usersByEmail`
- [ ] No passwords in Firestore
- [ ] One Firebase client init: `frontend/src/lib/firebase.js`
- [ ] No new styling systems
- [ ] No framework migration

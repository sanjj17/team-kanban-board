# Orbit — Team Kanban Board

A full-stack Kanban board for small teams. Users create projects, invite members, and move cards between columns with drag and drop. Every move is saved on the server, commented on, and recorded in a per-project activity log. Teammates' changes show up live without a refresh.

- **Frontend:** React + Vite
- **Backend:** Express (written by me), validation with Zod, auth with bcrypt + signed tokens
- **Database:** SQLite (`better-sqlite3`)
- **Tests:** 33 automated backend tests (`node:test` + supertest)

## What it does

- Register and log in with email and password.
- Create projects, each with **To do / In progress / Done** columns. Invite people by email and give them a role: **owner** (manages members and columns) or **member**.
- Columns can be added, renamed, reordered and (when empty) deleted by the owner.
- Cards have a title, description, assignee, due date and labels.
- **Drag and drop** cards within a column and between columns, with the order saved on the server. It works with a mouse and with a finger (see *Touch dragging*).
- Comments on cards, and a project **activity log** (`Asha Mehta moved Build the login page from To do to In progress`).
- **Live updates:** a card moved in one browser moves in another without a refresh.
- **Filters:** assignee, label, overdue, and text search.
- Works on a phone as well as a laptop.

## Run it locally

Requirements: Node.js 20.19+ and npm.

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
# open .env and set JWT_SECRET to a long random value
npm run seed                # creates the demo users and boards
npm run dev                 # API on :4000, frontend on :5173
```

Open **http://localhost:5173**.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the backend test suite |
| `npm run seed` | Creates demo data (does nothing if users already exist) |
| `npm run seed:reset` | Wipes the database and creates fresh demo data |
| `npm run build` | Builds the frontend into `client/dist` |
| `npm start` | Runs the API and serves the built frontend from the same port |

## Demo logins

Every demo account uses the password **`OrbitDemo26!`**.

| Role | Email | Notes |
|---|---|---|
| Owner | `asha@example.com` | Owns **Product Launch**: can manage members and columns |
| Member | `rahul@example.com` | Member of Product Launch |
| Member | `maya@example.com` | Member of Product Launch |
| Outsider | `neel@example.com` | Owns a separate private board. Cannot see Product Launch, which shows the access rules |

The seed data includes overdue cards (dates are relative to today) so the Overdue filter has something to show. The login screen also has a "Use demo" shortcut for the owner account.

## Data model

| Table | Purpose |
|---|---|
| `users` | name, unique email, bcrypt password hash |
| `projects` | name, description, owner |
| `project_members` | (project, user) with role `owner` or `member` |
| `board_columns` | project-scoped name and numeric `position` |
| `cards` | project, column, title, description, assignee, due date, labels (JSON), numeric `position`, timestamps |
| `comments` | card, author, body, timestamp |
| `activity_log` | project, actor, optional card, message, timestamp |
| `invitations` | project, invited email, random token, expiry, accepted time |

Foreign keys are enforced. Every card, column and comment query is scoped by `project_id`.

## Main design decisions

### 1. Card order uses fractional positions

Each card has a numeric `position`, and a column is sorted by `(position, id)`. Dropping a card between two neighbours gives it the **midpoint** of their positions, so **a move updates one row**, not the whole column. Appending adds 1000 to the last position; inserting at the top subtracts 1000. After a refresh, the order is read back from the database, so it is always right.

The weak spot of this approach is precision: inserting again and again into the same gap keeps halving it. If two neighbours get closer than `1e-7`, the server renumbers **only the destination column** (1000, 2000, 3000, ...) and then inserts. A test inserts 80 cards into the same gap and checks the final order and that no two positions collide. The move and any renumbering run in one SQLite transaction.

The logic lives in `server/src/positions.js` (`positionBetween`) and the `/move` route in `server/src/app.js`.

### 2. Access control is checked on the server for every request

The frontend hides buttons, but that is only cosmetic. Every project route goes through middleware that verifies the token, loads the user, and checks **their current membership row in the database**. Owner-only routes add a role check. Consequences:

- A non-member gets `404` for a project, so its existence isn't revealed.
- A removed member loses access immediately, even though their token is still valid.
- A card ID from another project can't be used through my own project's URL, because card lookups are scoped by `project_id`. Assignees must belong to the project, and moving a card into another project's column is rejected.

### 3. Live updates by polling

The client asks for the board, activity and project list every 4 seconds, and only re-renders when something actually changed. Polling pauses while the tab is hidden, while a card is being dragged, and while one of my own writes is in flight, so it can never overwrite what the user is doing. Each request has a sequence number, so a slow, stale response can't replace a newer one. Moves are also **optimistic**: the card jumps immediately and the server's answer replaces it (or rolls it back on an error).

I chose polling over WebSockets because it needs no extra infrastructure and works the same behind any proxy. The trade-off is up to ~4 seconds of delay and a little extra traffic.

### 4. Touch dragging

The browser's built-in HTML5 drag and drop doesn't fire on touch screens. Mouse users still drag the whole card that way. On touch screens (and with a pen), the dotted **handle** on each card starts a pointer-events drag: a floating copy follows the finger, a purple line shows where the card will land, and the board auto-scrolls near its edges (faster the closer you get). The same server `/move` call is used for both.

### 5. Validation

Every request body is validated with Zod, and unknown fields are rejected, so a client can't smuggle in a `projectId`. The API returns a clear `error` message that the UI shows. Stack traces never reach the client. Login and register are rate limited per IP.

### 6. Invitations

An existing account is added straight away. For an email without an account, the owner gets a 7-day invite link to share (email isn't sent). Only a signed-in user whose email matches can accept it, and a link can't be used twice.

## Tests

`npm test` runs 33 backend tests, including:

- **Ordering:** `positionBetween` unit tests, a move changes only one row, append/prepend, order after reading the board back, and the 80-inserts precision case.
- **Access control:** a non-member gets `404` on every project route; cross-project card IDs; moving into another project's column; removed members lose access immediately; members can't use owner-only routes; unauthenticated requests.
- **Invitations:** the wrong user can't accept, expired and malformed tokens, no reuse.
- **Validation:** unknown fields, oversized input, bad labels.
- **Activity log:** `moved` vs `reordered` messages, and no log entry for a no-op save.
- **Rate limiting** on login.

## Deploying (optional)

The server can serve the built frontend, so one service is enough (for example on Render):

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Environment:** `NODE_ENV=production`, `JWT_SECRET=<long random value>`, `TRUST_PROXY=1`, `AUTO_SEED=true` (for a demo), and `DB_FILE=/var/data/kanban.sqlite` on a persistent disk.

SQLite lives on that one disk, so run a single instance.

## What is finished, what isn't, and what I'd do next

**Finished:** everything in the core list (projects, invites, roles, columns, cards, server-saved ordering, comments, activity log, server-side permission checks), plus both stretch goals (live updates and filters), touch dragging, seed data, `.env.example`, and the tests.

**Not done / known limits:**

- Live updates are polling, not WebSockets or Server-Sent Events, so changes can take up to ~4 seconds to appear.
- Invitation links are shown to the owner to share; no email is sent.
- No password reset, no way to transfer ownership, and no deleting a project.
- The rate limiter is in memory, and SQLite means a single server instance.
- No automated frontend tests. I tested the UI by hand and with a scripted browser run (desktop mouse, phone touch, a second user), but that script isn't part of the repo.

**With more time:** Server-Sent Events for instant updates, email invitations, project deletion and ownership transfer, a shared rate-limit store, frontend component tests plus a Playwright end-to-end suite, and keyboard-accessible card moving.

## AI tools I used

- **ChatGPT**: planning the architecture, and a first draft of the API and the UI.
- **Claude**: reviewing the project against the brief, then adding touch dragging, live updates, optimistic moves, the extra tests, the seed changes and this README, and checking the result in a real browser.

I ran the tests, read through the code, and can explain each part. The ordering, access-control and polling logic are described above.

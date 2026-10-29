# Orbit — Team Kanban Board

A full-stack Kanban board for small teams, built for the Team Kanban Board assignment. The frontend is React + Vite; the API is Express; persistent data lives in SQLite. The backend owns the project rules, validations, permissions, ordering, comments, invitations, and activity history.

## Features

- Email/password registration and login. Passwords are hashed with bcrypt; signed session tokens expire after seven days.
- Create multiple projects with default **To do**, **In progress**, and **Done** columns.
- Project membership with `owner` and `member` roles. Owners can invite/remove members, add/rename/reorder columns, and delete empty columns. Members can create/edit/move cards and comment.
- Cards support a title, description, assignee, due date, and up to eight labels.
- Drag and drop cards between columns or reorder them inside a column. Order is persisted by the API using numeric fractional positions. A move normally updates only the moved card. If positions become too close to represent safely, only that destination column is compacted.
- Comments and a project-specific activity log. A move produces messages such as `Asha Mehta moved Build the login page from To do to In progress`.
- Filters for assignee, label, overdue work, and text search.
- Responsive layout for phones and laptops.
- Pending invite links for people who do not have an account yet. The app does not send email; an owner copies and shares the generated link.
- Seed data and automated backend tests.

## Requirements

- Node.js **20.19+** (Vite 7 requires a recent Node version) and npm.
- Git, if you plan to publish the repository.

Check your version with:

```bash
node -v
npm -v
```

## Run locally

From the project root:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the environment file:

   **Windows PowerShell**

   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux/Git Bash**

   ```bash
   cp .env.example .env
   ```

3. Replace `JWT_SECRET` in `.env` with a long random string. Keep `.env` private; it is ignored by Git. The example value is only a placeholder.

4. Create demo users and sample tasks:

   ```bash
   npm run seed
   ```

   Seed will not overwrite an existing database. To reset demo data, stop the server and delete `server/data/kanban.sqlite`, then run the seed command again.

5. Start the API and frontend:

   ```bash
   npm run dev
   ```

6. Open **http://localhost:5173**. Vite proxies `/api` to the Express server on port 4000.

The local SQLite file is created at `server/data/kanban.sqlite` by default. Set `DB_FILE` in `.env` if you need to use another path. `PORT` controls the API port.

## Demo logins

All seeded users share the demo password `OrbitDemo26!`.

| Role | Email | Access |
|---|---|---|
| Owner | `asha@example.com` | Can manage project members and columns |
| Member | `rahul@example.com` | Can create/edit/move cards and comment |
| Member | `maya@example.com` | Can create/edit/move cards and comment |
| Not in Product Launch | `neel@example.com` | Useful for checking project access control |

The login screen includes a **Use demo** helper for the owner account.

## Run the tests

```bash
npm test
```

The backend tests cover registration validation and duplicate emails, project setup, non-member access, role permissions, fractional card ordering and persistence after refresh, assignee membership, comments/activity, column reordering validation, and invitations.

## Data model

- `users`: name, unique email, bcrypt password hash.
- `projects`: name, description, owner, created time.
- `project_members`: project/user pair with `owner` or `member` role.
- `board_columns`: project-scoped name and numeric position.
- `cards`: project and column IDs, title, description, optional assignee and due date, labels stored as JSON text, numeric position, timestamps.
- `comments`: card, author, body and timestamp.
- `activity_log`: project, actor, optional card, human-readable message and timestamp.
- `invitations`: project, invitee email, random token, expiry and acceptance time.

Foreign keys are enabled in SQLite. Project membership is checked by the backend for every project-scoped route. Routes that mutate project membership or columns additionally check the owner's role. Task assignees must be members of the same project. Private project requests by a non-member return `404` so the API does not disclose that the project exists.

## Main design decisions

### Backend access control

The browser sends a bearer token, but the frontend's visibility checks are not treated as security boundaries. Express verifies the token and looks up the current user, then checks their membership on every project route. Owner-only operations use a separate role check. Foreign keys and project-scoped database queries reduce the chance of cross-project references.

### Stable drag-and-drop ordering

Cards in a column are sorted by `(position, id)`. The API calculates a midpoint between the destination neighbours. Appending adds 1000 to the previous position; inserting before the first card subtracts 1000. This normally changes one card row, rather than rewriting the entire board on every drag. An extremely small gap triggers a destination-column-only rebalance.

### Invitations

Existing accounts can be added by email. For an email without an account, Orbit creates a random, seven-day invitation token and returns a link to copy and share. The invite can be accepted only by a signed-in user whose email matches the invitation. Email delivery is not configured.

### Validation and errors

Request bodies are validated on the server with Zod, and the API returns a clear `error` message plus field details for invalid input. The client displays request errors in the UI. The server never returns stack traces to the client.

## What's finished / what isn't

**Finished:** the local full-stack flow, user accounts, projects, access rules, cards, drag-and-drop ordering, labels/assignees/due dates, comments, activity, member invitation links, column management, responsive layout, seed data and backend tests.

**Not included:** real-time updates between browsers, email delivery for invitations, password reset, rate limiting, production monitoring, and cloud deployment configuration. The assignment's live-update feature is optional. For production, add rate limiting, stronger deployment secrets, HTTPS, a persistent hosted database, email delivery, and a proper password-recovery flow.

## AI tools

AI assistance (ChatGPT) was used to help plan the architecture, draft and review implementation code, suggest validation and access-control tests, and improve the README. Before submitting, review the code, run the tests, make the changes you understand and can explain, and accurately disclose any other tools you use.

## Suggested walkthrough for the submission video

1. Sign in using the owner demo account and point out the demo project.
2. Drag a card between columns, refresh the board, and show the position persisted.
3. Open a task, change its assignee/due date/labels, and add a comment.
4. Open Activity and show the generated move/comment events.
5. Open Team members; show the owner role and invite flow. Explain that non-members are checked in the API.
6. Show the `move` route and `positionBetween` helper, then run `npm test`.

For the actual submission, create a new public GitHub repository within the assignment's 20-day repository-age restriction, commit as you work, and upload the 3–5 minute narrated screen recording to Google Drive with “Anyone with the link” Viewer access. Test the video link in a private/incognito window before submitting.

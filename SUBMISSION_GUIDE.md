# Submission guide

## Before you submit

- [ ] Run the app locally with `npm run dev` and check the board in Chrome.
- [ ] Test sign-in with each demo account; verify `neel@example.com` cannot open the Product Launch board before being invited.
- [ ] Move a card, refresh the page, and confirm its position remains correct.
- [ ] Add a comment and check the activity feed.
- [ ] Try owner/member permissions and the invitation-link flow.
- [ ] Run `npm test` and make sure every test passes.
- [ ] Replace the demo data and add something that reflects your own design decisions.
- [ ] Review the code areas below so you can explain them without reading a script word for word.
- [ ] Create a *new public GitHub repository* for the assignment, commit in meaningful steps, and keep `.env` and database files out of Git.
- [ ] Record a 3–5 minute video with your voice, upload it to Google Drive, set access to **Anyone with the link — Viewer**, and test the link in a private/incognito window.

## Files worth understanding

- `server/src/app.js`: API routes, Zod request validation, authentication, role checks, and activity logging.
- `server/src/positions.js`: the fractional-position algorithm used during drag and drop.
- `server/src/db.js`: schema, foreign keys and indexes.
- `server/src/seed.js`: the accounts and board data that let reviewers try the app immediately.
- `server/test/api.test.js`: API tests for validation, access permissions, ordering, comments, activity, and invitations.
- `client/src/App.jsx`: sign-in, board UI, drag-and-drop, filtering, dialogs and API calls.
- `client/src/styles.css`: responsive styling for laptop and phone screens.

## Suggested 4-minute narrated demo

**0:00–0:20 — Introduce the project**

“Hi, this is Orbit, a full-stack Kanban board for small teams. It has a React frontend, an Express API, and a SQLite database. I’ll show the main workflow, then explain the ordering and permission checks.”

**0:20–1:00 — Work with the board**

Sign in as `asha@example.com`. Show the projects sidebar, the three columns, labels, assignees and due dates. Create a task and use the assignee, label and overdue filters. Resize the browser or use responsive device mode to show that the board remains usable on a phone.

**1:00–1:40 — Demonstrate persistence and the hard problem**

Drag a task to a different column and refresh. Explain: “The server stores a numeric position for each card. When a card moves, the API usually calculates a midpoint between its destination neighbours and updates just that card. If the gap gets too small for safe precision, it compacts the destination column. The order comes from the database, so it survives refresh.” Show `positionBetween()` in `server/src/positions.js` and the move route in `server/src/app.js`.

**1:40–2:15 — Comments and activity**

Open a card, update a field, add a comment, and show Activity. Point out that events are saved per project on the server rather than assembled only in the browser.

**2:15–2:55 — Permissions and invitations**

Open Team members and show the owner role. Explain that the frontend hides owner actions for convenience, but Express separately checks the user's membership and role on every project-specific API request. Demonstrate that an outsider is blocked, then show how inviting an existing account or copying a new-account invite link works.

**2:55–3:35 — Automated tests**

Run `npm test`. Highlight examples: non-members are denied, members cannot manage columns, assignees must belong to the project, and card ordering remains correct after a board reload.

**3:35–4:00 — Be clear about scope**

Mention what is implemented and what remains optional: real-time browser-to-browser updates and email delivery for invitations are not included. Finish by showing the README setup and demo logins.

## GitHub workflow

Create the new repository on GitHub first, without a README or `.gitignore` if you already have those locally. From the project root, initialize Git and commit meaningful groups as you review and understand them. Example commands:

```bash
git init
git add README.md .gitignore .env.example package.json client/package.json client/index.html client/vite.config.js
git commit -m "chore: scaffold workspace and documentation"

git add server/src/db.js server/src/positions.js server/src/app.js server/src/server.js
git commit -m "feat: implement API and project permissions"

git add server/src/seed.js server/test/api.test.js
git commit -m "test: add demo data and backend API tests"

git add client/src/main.jsx client/src/App.jsx client/src/styles.css
git commit -m "feat: build responsive Kanban interface"
git add SUBMISSION_GUIDE.md .nvmrc
git commit -m "docs: add setup and submission guide"
```

Then add your GitHub repository as the `origin` remote and push the commits. Replace the placeholder remote URL with the URL GitHub gives you. Verify `git status` does not list `.env`, `node_modules/`, or `server/data/kanban.sqlite`.

Only use commit messages and AI-use disclosures that accurately describe your own review and work. Make further commits for your own fixes after running the app; do not submit code that you cannot explain.

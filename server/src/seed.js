const path = require('node:path');
const bcrypt = require('bcryptjs');
const { createDb } = require('./db');
const { POSITION_GAP } = require('./positions');

const DEMO_PASSWORD = 'OrbitDemo26!';

// Dates are relative to "today" so the demo always shows overdue, due-soon and later work.
function daysFromToday(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function resetDatabase(db) {
  db.transaction(() => {
    ['activity_log', 'comments', 'invitations', 'cards', 'board_columns', 'project_members', 'projects', 'users']
      .forEach((table) => db.prepare(`DELETE FROM ${table}`).run());
    db.prepare("DELETE FROM sqlite_sequence").run();
  })();
}

/** Creates the demo users and two projects. Does nothing if the database already has users. */
function seedDatabase(db) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (existing > 0) return { seeded: false };

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  db.transaction(() => {
    const addUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
    const ashaId = Number(addUser.run('Asha Mehta', 'asha@example.com', passwordHash).lastInsertRowid);
    const rahulId = Number(addUser.run('Rahul Shah', 'rahul@example.com', passwordHash).lastInsertRowid);
    const mayaId = Number(addUser.run('Maya Iyer', 'maya@example.com', passwordHash).lastInsertRowid);
    const neelId = Number(addUser.run('Neel Patil', 'neel@example.com', passwordHash).lastInsertRowid);

    const addProject = db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)');
    const addMember = db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)');
    const addColumn = db.prepare('INSERT INTO board_columns (project_id, name, position) VALUES (?, ?, ?)');
    const addCard = db.prepare(`INSERT INTO cards
      (project_id, column_id, title, description, assignee_id, due_date, labels, position, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const addActivity = db.prepare('INSERT INTO activity_log (project_id, actor_id, card_id, message) VALUES (?, ?, ?, ?)');
    const card = (projectId, columnId, title, description, assigneeId, dueDate, labels, position, createdBy) =>
      Number(addCard.run(projectId, columnId, title, description, assigneeId, dueDate, JSON.stringify(labels), position, createdBy).lastInsertRowid);

    // Project 1: Asha (owner) with Rahul and Maya as members. Neel is deliberately NOT a member.
    const launchId = Number(addProject.run('Product Launch', 'The small things that make a launch feel effortless.', ashaId).lastInsertRowid);
    addMember.run(launchId, ashaId, 'owner');
    addMember.run(launchId, rahulId, 'member');
    addMember.run(launchId, mayaId, 'member');
    const todoId = Number(addColumn.run(launchId, 'To do', POSITION_GAP).lastInsertRowid);
    const progressId = Number(addColumn.run(launchId, 'In progress', POSITION_GAP * 2).lastInsertRowid);
    const doneId = Number(addColumn.run(launchId, 'Done', POSITION_GAP * 3).lastInsertRowid);

    card(launchId, todoId, 'Map the onboarding flow', 'Sketch the first-run experience and confirm the empty states.', mayaId, daysFromToday(5), ['Design', 'Product'], POSITION_GAP, ashaId);
    card(launchId, todoId, 'Write API contract tests', 'Cover the main project and card endpoints.', rahulId, daysFromToday(7), ['Engineering'], POSITION_GAP * 2, ashaId);
    card(launchId, todoId, 'Fix broken invite email copy', 'The invitation text still mentions the old product name.', rahulId, daysFromToday(-3), ['Bug', 'Docs'], POSITION_GAP * 3, ashaId);
    const loginId = card(launchId, progressId, 'Build the login page', 'Add clear loading and invalid-credentials states.', ashaId, daysFromToday(-1), ['Frontend', 'Priority'], POSITION_GAP, rahulId);
    const mobileId = card(launchId, progressId, 'Tighten mobile layout', 'Check the board and task dialog on narrow screens.', mayaId, daysFromToday(3), ['Frontend'], POSITION_GAP * 2, ashaId);
    const repoId = card(launchId, doneId, 'Set up the repository', 'Add a clear README, environment example and scripts.', ashaId, null, ['Engineering'], POSITION_GAP, rahulId);

    db.prepare('INSERT INTO comments (card_id, user_id, body) VALUES (?, ?, ?)')
      .run(loginId, mayaId, 'The invalid-password state should explain what to do next.');
    db.prepare('INSERT INTO comments (card_id, user_id, body) VALUES (?, ?, ?)')
      .run(loginId, ashaId, 'Agreed, I will add a helper line under the field.');
    addActivity.run(launchId, ashaId, null, 'Asha Mehta created the project Product Launch');
    addActivity.run(launchId, rahulId, repoId, 'Rahul Shah created Set up the repository');
    addActivity.run(launchId, ashaId, loginId, 'Asha Mehta moved Build the login page from To do to In progress');
    addActivity.run(launchId, mayaId, loginId, 'Maya Iyer commented on Build the login page');
    addActivity.run(launchId, ashaId, mobileId, 'Asha Mehta created Tighten mobile layout');

    // Project 2: owned by Neel. Asha, Rahul and Maya cannot see it, which makes the access rules easy to demo.
    const privateId = Number(addProject.run('Neel\u2019s Private Board', 'Only Neel can open this project.', neelId).lastInsertRowid);
    addMember.run(privateId, neelId, 'owner');
    const privateTodo = Number(addColumn.run(privateId, 'To do', POSITION_GAP).lastInsertRowid);
    addColumn.run(privateId, 'In progress', POSITION_GAP * 2);
    addColumn.run(privateId, 'Done', POSITION_GAP * 3);
    card(privateId, privateTodo, 'Plan a surprise for the team', 'Nobody outside this project should ever see this card.', neelId, daysFromToday(10), ['Private'], POSITION_GAP, neelId);
    addActivity.run(privateId, neelId, null, 'Neel Patil created the project Neel\u2019s Private Board');
  })();
  return { seeded: true };
}

function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  const db = createDb();
  if (process.argv.includes('--reset')) {
    resetDatabase(db);
    console.log('Existing data removed.');
  }
  const result = seedDatabase(db);
  if (!result.seeded) {
    console.log('Seed skipped: this database already contains users. Run "npm run seed:reset" to wipe it and reseed.');
  } else {
    console.log('Demo data created. Every demo account uses the password', DEMO_PASSWORD);
    console.log('Owner:  asha@example.com  (Product Launch)');
    console.log('Member: rahul@example.com (Product Launch)');
    console.log('Member: maya@example.com  (Product Launch)');
    console.log('Other:  neel@example.com  (owns a separate private board, not on Product Launch)');
  }
  db.close();
}

if (require.main === module) main();

module.exports = { seedDatabase, resetDatabase, DEMO_PASSWORD };

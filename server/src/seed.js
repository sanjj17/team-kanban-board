const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { createDb } = require('./db');
const { POSITION_GAP } = require('./positions');

const db = createDb();

const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
if (existing > 0) {
  console.log('Seed skipped: this database already contains users. Remove server/data/kanban.sqlite to reseed from scratch.');
  db.close();
  process.exit(0);
}

const passwordHash = bcrypt.hashSync('OrbitDemo26!', 10);
const seed = db.transaction(() => {
  const addUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  const ashaId = Number(addUser.run('Asha Mehta', 'asha@example.com', passwordHash).lastInsertRowid);
  const rahulId = Number(addUser.run('Rahul Shah', 'rahul@example.com', passwordHash).lastInsertRowid);
  const mayaId = Number(addUser.run('Maya Iyer', 'maya@example.com', passwordHash).lastInsertRowid);
  const outsiderId = Number(addUser.run('Neel Patil', 'neel@example.com', passwordHash).lastInsertRowid);

  const projectId = Number(db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)')
    .run('Product Launch', 'The small things that make a launch feel effortless.', ashaId).lastInsertRowid);
  const addMember = db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)');
  addMember.run(projectId, ashaId, 'owner');
  addMember.run(projectId, rahulId, 'member');
  addMember.run(projectId, mayaId, 'member');

  const addColumn = db.prepare('INSERT INTO board_columns (project_id, name, position) VALUES (?, ?, ?)');
  const todoId = Number(addColumn.run(projectId, 'To do', POSITION_GAP).lastInsertRowid);
  const progressId = Number(addColumn.run(projectId, 'In progress', POSITION_GAP * 2).lastInsertRowid);
  const doneId = Number(addColumn.run(projectId, 'Done', POSITION_GAP * 3).lastInsertRowid);

  const addCard = db.prepare(`INSERT INTO cards
    (project_id, column_id, title, description, assignee_id, due_date, labels, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const card1 = Number(addCard.run(projectId, todoId, 'Map the onboarding flow', 'Sketch the first-run experience and confirm the empty states.', mayaId, '2026-11-04', JSON.stringify(['Design', 'Product']), POSITION_GAP, ashaId).lastInsertRowid);
  const card2 = Number(addCard.run(projectId, todoId, 'Write API contract tests', 'Cover the main project and card endpoints.', rahulId, '2026-11-06', JSON.stringify(['Engineering']), POSITION_GAP * 2, ashaId).lastInsertRowid);
  const card3 = Number(addCard.run(projectId, progressId, 'Build the login page', 'Add clear loading and invalid-credentials states.', ashaId, '2026-10-30', JSON.stringify(['Frontend', 'Priority']), POSITION_GAP, rahulId).lastInsertRowid);
  const card4 = Number(addCard.run(projectId, progressId, 'Tighten mobile layout', 'Check the board and task dialog on narrow screens.', mayaId, '2026-11-02', JSON.stringify(['Frontend']), POSITION_GAP * 2, ashaId).lastInsertRowid);
  const card5 = Number(addCard.run(projectId, doneId, 'Set up the repository', 'Add a clear README, environment example and scripts.', ashaId, null, JSON.stringify(['Engineering']), POSITION_GAP, rahulId).lastInsertRowid);

  db.prepare('INSERT INTO comments (card_id, user_id, body) VALUES (?, ?, ?)')
    .run(card3, mayaId, 'The invalid-password state should explain what to do next.');
  const addActivity = db.prepare('INSERT INTO activity_log (project_id, actor_id, card_id, message) VALUES (?, ?, ?, ?)');
  addActivity.run(projectId, ashaId, null, 'Asha Mehta created the project Product Launch');
  addActivity.run(projectId, rahulId, card5, 'Rahul Shah created Set up the repository');
  addActivity.run(projectId, ashaId, card3, 'Asha Mehta moved Build the login page from To do to In progress');
  addActivity.run(projectId, mayaId, card3, 'Maya Iyer commented on Build the login page');
  addActivity.run(projectId, ashaId, card4, 'Asha Mehta created Tighten mobile layout');

  // An unrelated account makes the access-control tests and manual security check easy.
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run('Neel Patil', outsiderId);
});

seed();
console.log('Demo data created.');
console.log('Owner:  asha@example.com / OrbitDemo26!');
console.log('Member: rahul@example.com / OrbitDemo26!');
console.log('Member: maya@example.com / OrbitDemo26!');
console.log('Other:  neel@example.com / OrbitDemo26! (not on the demo project)');
db.close();

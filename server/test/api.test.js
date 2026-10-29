const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

async function fixture(t) {
  const db = createDb(':memory:');
  t.after(() => db.close());
  const hash = bcrypt.hashSync('TestPassword123!', 4);
  const addUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  const ownerId = Number(addUser.run('Asha Owner', 'asha@test.local', hash).lastInsertRowid);
  const memberId = Number(addUser.run('Ravi Member', 'ravi@test.local', hash).lastInsertRowid);
  const outsiderId = Number(addUser.run('Neel Outsider', 'neel@test.local', hash).lastInsertRowid);
  const app = createApp({ db, jwtSecret: 'test-secret-long-enough' });
  const api = request(app);

  async function login(email) {
    const response = await api.post('/api/auth/login').send({ email, password: 'TestPassword123!' });
    assert.equal(response.status, 200, response.text);
    return response.body.token;
  }
  const ownerToken = await login('asha@test.local');
  const memberToken = await login('ravi@test.local');
  const outsiderToken = await login('neel@test.local');
  const projectResponse = await api.post('/api/projects')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Test Board', description: 'Test project' });
  assert.equal(projectResponse.status, 201, projectResponse.text);
  const projectId = projectResponse.body.project.id;
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
    .run(projectId, memberId, 'member');
  const columns = db.prepare('SELECT * FROM board_columns WHERE project_id = ? ORDER BY position').all(projectId);
  return { db, api, ownerId, memberId, outsiderId, ownerToken, memberToken, outsiderToken, projectId, columns };
}

async function createCard(f, title, columnId = f.columns[0].id, extras = {}) {
  const response = await f.api.post(`/api/projects/${f.projectId}/cards`)
    .set('Authorization', `Bearer ${f.ownerToken}`)
    .send({ columnId, title, ...extras });
  assert.equal(response.status, 201, response.text);
  return response.body.card;
}

test('registration validates input and blocks duplicate email addresses', async (t) => {
  const f = await fixture(t);
  const invalid = await f.api.post('/api/auth/register').send({ name: 'A', email: 'bad-email', password: '123' });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.error);
  const duplicate = await f.api.post('/api/auth/register').send({ name: 'Another Asha', email: 'ASHA@test.local', password: 'Password123!' });
  assert.equal(duplicate.status, 409);
});

test('project creation makes an owner membership and three starter columns', async (t) => {
  const f = await fixture(t);
  const board = await f.api.get(`/api/projects/${f.projectId}/board`).set('Authorization', `Bearer ${f.ownerToken}`);
  assert.equal(board.status, 200);
  assert.equal(board.body.role, 'owner');
  assert.deepEqual(board.body.columns.map((column) => column.name), ['To do', 'In progress', 'Done']);
  assert.equal(board.body.members.find((member) => member.id === f.ownerId).role, 'owner');
});

test('a non-member cannot read a board or create a card in it', async (t) => {
  const f = await fixture(t);
  const board = await f.api.get(`/api/projects/${f.projectId}/board`).set('Authorization', `Bearer ${f.outsiderToken}`);
  assert.equal(board.status, 404);
  const create = await f.api.post(`/api/projects/${f.projectId}/cards`)
    .set('Authorization', `Bearer ${f.outsiderToken}`)
    .send({ columnId: f.columns[0].id, title: 'Should be blocked' });
  assert.equal(create.status, 404);
});

test('a member cannot add columns, but can create cards', async (t) => {
  const f = await fixture(t);
  const forbidden = await f.api.post(`/api/projects/${f.projectId}/columns`)
    .set('Authorization', `Bearer ${f.memberToken}`).send({ name: 'Review' });
  assert.equal(forbidden.status, 403);
  const created = await f.api.post(`/api/projects/${f.projectId}/cards`)
    .set('Authorization', `Bearer ${f.memberToken}`)
    .send({ columnId: f.columns[0].id, title: 'Member task' });
  assert.equal(created.status, 201, created.text);
});

test('card moves use fractional positions and the order survives a board refresh', async (t) => {
  const f = await fixture(t);
  const first = await createCard(f, 'First');
  const second = await createCard(f, 'Second');
  const third = await createCard(f, 'Third');
  const originalFirstPosition = f.db.prepare('SELECT position FROM cards WHERE id = ?').get(first.id).position;
  const originalSecondPosition = f.db.prepare('SELECT position FROM cards WHERE id = ?').get(second.id).position;

  const move = await f.api.post(`/api/projects/${f.projectId}/cards/${third.id}/move`)
    .set('Authorization', `Bearer ${f.ownerToken}`)
    .send({ targetColumnId: f.columns[0].id, beforeCardId: second.id });
  assert.equal(move.status, 200, move.text);
  assert.ok(move.body.position > originalFirstPosition && move.body.position < originalSecondPosition);
  assert.equal(f.db.prepare('SELECT position FROM cards WHERE id = ?').get(first.id).position, originalFirstPosition);
  assert.equal(f.db.prepare('SELECT position FROM cards WHERE id = ?').get(second.id).position, originalSecondPosition);

  const refresh = await f.api.get(`/api/projects/${f.projectId}/board`).set('Authorization', `Bearer ${f.ownerToken}`);
  assert.deepEqual(refresh.body.columns[0].cards.map((card) => card.title), ['First', 'Third', 'Second']);
});

test('the server rejects assignees who are not project members', async (t) => {
  const f = await fixture(t);
  const response = await f.api.post(`/api/projects/${f.projectId}/cards`)
    .set('Authorization', `Bearer ${f.ownerToken}`)
    .send({ columnId: f.columns[0].id, title: 'Invalid assignment', assigneeId: f.outsiderId });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /assignee/i);
});

test('comments are persisted and create an activity entry', async (t) => {
  const f = await fixture(t);
  const card = await createCard(f, 'Add comment support');
  const comment = await f.api.post(`/api/projects/${f.projectId}/cards/${card.id}/comments`)
    .set('Authorization', `Bearer ${f.memberToken}`).send({ body: 'This looks good.' });
  assert.equal(comment.status, 201, comment.text);
  assert.equal(comment.body.comment.body, 'This looks good.');
  const comments = await f.api.get(`/api/projects/${f.projectId}/cards/${card.id}/comments`)
    .set('Authorization', `Bearer ${f.ownerToken}`);
  assert.equal(comments.body.comments.length, 1);
  const activity = await f.api.get(`/api/projects/${f.projectId}/activity`).set('Authorization', `Bearer ${f.ownerToken}`);
  assert.ok(activity.body.activity.some((entry) => entry.message.includes('commented on Add comment support')));
});

test('column reorder must include every column exactly once', async (t) => {
  const f = await fixture(t);
  const response = await f.api.patch(`/api/projects/${f.projectId}/columns/reorder`)
    .set('Authorization', `Bearer ${f.ownerToken}`)
    .send({ orderedIds: [f.columns[0].id, f.columns[0].id] });
  assert.equal(response.status, 400);
});

test('inviting an existing account adds them as a project member', async (t) => {
  const f = await fixture(t);
  const response = await f.api.post(`/api/projects/${f.projectId}/invitations`)
    .set('Authorization', `Bearer ${f.ownerToken}`).send({ email: 'neel@test.local' });
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.added, true);
  const board = await f.api.get(`/api/projects/${f.projectId}/board`).set('Authorization', `Bearer ${f.outsiderToken}`);
  assert.equal(board.status, 200);
});

test('the server rejects impossible calendar dates', async (t) => {
  const f = await fixture(t);
  const response = await f.api.post(`/api/projects/${f.projectId}/cards`)
    .set('Authorization', `Bearer ${f.ownerToken}`)
    .send({ columnId: f.columns[0].id, title: 'Invalid due date', dueDate: '2026-02-31' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /date/i);
});

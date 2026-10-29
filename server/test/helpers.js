// Shared test setup. (This file has no tests of its own; node --test simply loads it.)
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

const PASSWORD = 'TestPassword123!';

/**
 * Creates an in-memory database with: an owner, a member and an outsider, plus two
 * separate projects. "Alpha" has owner + member. "Beta" belongs only to the outsider.
 */
async function twoProjectFixture(t, appOptions = {}) {
  const db = createDb(':memory:');
  t.after(() => db.close());
  const hash = bcrypt.hashSync(PASSWORD, 4);
  const addUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  const ownerId = Number(addUser.run('Asha Owner', 'asha@test.local', hash).lastInsertRowid);
  const memberId = Number(addUser.run('Ravi Member', 'ravi@test.local', hash).lastInsertRowid);
  const outsiderId = Number(addUser.run('Neel Outsider', 'neel@test.local', hash).lastInsertRowid);

  const app = createApp({ db, jwtSecret: 'test-secret-long-enough', clientDist: '/nonexistent', ...appOptions });
  const api = request(app);

  async function login(email) {
    const response = await api.post('/api/auth/login').send({ email, password: PASSWORD });
    assert.equal(response.status, 200, response.text);
    return response.body.token;
  }
  const ownerToken = await login('asha@test.local');
  const memberToken = await login('ravi@test.local');
  const outsiderToken = await login('neel@test.local');

  async function makeProject(token, name) {
    const response = await api.post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name });
    assert.equal(response.status, 201, response.text);
    const projectId = response.body.project.id;
    const columns = db.prepare('SELECT * FROM board_columns WHERE project_id = ? ORDER BY position').all(projectId);
    return { projectId, columns };
  }
  const alpha = await makeProject(ownerToken, 'Alpha');
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(alpha.projectId, memberId, 'member');
  const beta = await makeProject(outsiderToken, 'Beta');

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  async function createCard(token, project, title, columnIndex = 0) {
    const response = await api.post(`/api/projects/${project.projectId}/cards`)
      .set(auth(token)).send({ columnId: project.columns[columnIndex].id, title });
    assert.equal(response.status, 201, response.text);
    return response.body.card;
  }
  async function board(token, project) {
    const response = await api.get(`/api/projects/${project.projectId}/board`).set(auth(token));
    assert.equal(response.status, 200, response.text);
    return response.body;
  }
  return { db, api, auth, login, createCard, board, alpha, beta, ownerId, memberId, outsiderId, ownerToken, memberToken, outsiderToken };
}

module.exports = { twoProjectFixture, PASSWORD };

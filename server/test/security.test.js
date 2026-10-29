const test = require('node:test');
const assert = require('node:assert/strict');
const { twoProjectFixture } = require('./helpers');

test('a member of one project cannot read, edit, move, comment on or delete a card in another project', async (t) => {
  const f = await twoProjectFixture(t);
  const betaCard = await f.createCard(f.outsiderToken, f.beta, 'Secret card');
  const base = `/api/projects/${f.beta.projectId}`;
  const asOwner = f.auth(f.ownerToken); // owner of Alpha, NOT a member of Beta

  assert.equal((await f.api.get(`${base}/board`).set(asOwner)).status, 404);
  assert.equal((await f.api.get(`${base}/activity`).set(asOwner)).status, 404);
  assert.equal((await f.api.get(`${base}/cards/${betaCard.id}/comments`).set(asOwner)).status, 404);
  assert.equal((await f.api.post(`${base}/cards/${betaCard.id}/comments`).set(asOwner).send({ body: 'hi' })).status, 404);
  assert.equal((await f.api.patch(`${base}/cards/${betaCard.id}`).set(asOwner).send({ title: 'Hacked' })).status, 404);
  assert.equal((await f.api.post(`${base}/cards/${betaCard.id}/move`).set(asOwner)
    .send({ targetColumnId: f.beta.columns[1].id })).status, 404);
  assert.equal((await f.api.delete(`${base}/cards/${betaCard.id}`).set(asOwner)).status, 404);
  assert.equal((await f.api.post(`${base}/invitations`).set(asOwner).send({ email: 'x@test.local' })).status, 404);

  const stillThere = f.db.prepare('SELECT title, column_id FROM cards WHERE id = ?').get(betaCard.id);
  assert.equal(stillThere.title, 'Secret card');
  assert.equal(stillThere.column_id, f.beta.columns[0].id);
});

test('using my own project in the URL does not let me touch a card that belongs to a different project', async (t) => {
  const f = await twoProjectFixture(t);
  const betaCard = await f.createCard(f.outsiderToken, f.beta, 'Secret card');
  // Asha IS a member of Alpha, so the membership check passes; the card lookup must still be scoped to Alpha.
  const response = await f.api.patch(`/api/projects/${f.alpha.projectId}/cards/${betaCard.id}`)
    .set(f.auth(f.ownerToken)).send({ title: 'Cross-project edit' });
  assert.equal(response.status, 404);
  assert.equal(f.db.prepare('SELECT title FROM cards WHERE id = ?').get(betaCard.id).title, 'Secret card');
});

test('a card cannot be moved into a column that belongs to another project', async (t) => {
  const f = await twoProjectFixture(t);
  const alphaCard = await f.createCard(f.ownerToken, f.alpha, 'Alpha card');
  const response = await f.api.post(`/api/projects/${f.alpha.projectId}/cards/${alphaCard.id}/move`)
    .set(f.auth(f.ownerToken)).send({ targetColumnId: f.beta.columns[0].id });
  assert.equal(response.status, 400);
  assert.equal(f.db.prepare('SELECT column_id FROM cards WHERE id = ?').get(alphaCard.id).column_id, f.alpha.columns[0].id);
});

test('requests without a valid token are rejected before any project data is touched', async (t) => {
  const f = await twoProjectFixture(t);
  assert.equal((await f.api.get(`/api/projects/${f.alpha.projectId}/board`)).status, 401);
  assert.equal((await f.api.get(`/api/projects/${f.alpha.projectId}/board`).set('Authorization', 'Bearer not-a-token')).status, 401);
  assert.equal((await f.api.get('/api/projects')).status, 401);
});

test('a removed member loses access immediately, even though their old token is still valid', async (t) => {
  const f = await twoProjectFixture(t);
  const before = await f.api.get(`/api/projects/${f.alpha.projectId}/board`).set(f.auth(f.memberToken));
  assert.equal(before.status, 200);
  const removal = await f.api.delete(`/api/projects/${f.alpha.projectId}/members/${f.memberId}`).set(f.auth(f.ownerToken));
  assert.equal(removal.status, 200, removal.text);
  const after = await f.api.get(`/api/projects/${f.alpha.projectId}/board`).set(f.auth(f.memberToken));
  assert.equal(after.status, 404);
});

test('removing a member clears their card assignments so assignees always belong to the project', async (t) => {
  const f = await twoProjectFixture(t);
  const created = await f.api.post(`/api/projects/${f.alpha.projectId}/cards`).set(f.auth(f.ownerToken))
    .send({ columnId: f.alpha.columns[0].id, title: 'Assigned to Ravi', assigneeId: f.memberId });
  assert.equal(created.status, 201, created.text);
  await f.api.delete(`/api/projects/${f.alpha.projectId}/members/${f.memberId}`).set(f.auth(f.ownerToken));
  assert.equal(f.db.prepare('SELECT assignee_id FROM cards WHERE id = ?').get(created.body.card.id).assignee_id, null);
});

test('members cannot rename, reorder or delete columns, or invite and remove people', async (t) => {
  const f = await twoProjectFixture(t);
  const base = `/api/projects/${f.alpha.projectId}`;
  const asMember = f.auth(f.memberToken);
  const columnId = f.alpha.columns[0].id;
  assert.equal((await f.api.patch(`${base}/columns/${columnId}`).set(asMember).send({ name: 'Renamed' })).status, 403);
  assert.equal((await f.api.delete(`${base}/columns/${columnId}`).set(asMember)).status, 403);
  assert.equal((await f.api.patch(`${base}/columns/reorder`).set(asMember)
    .send({ orderedIds: f.alpha.columns.map((c) => c.id).reverse() })).status, 403);
  assert.equal((await f.api.post(`${base}/invitations`).set(asMember).send({ email: 'new@test.local' })).status, 403);
  assert.equal((await f.api.delete(`${base}/members/${f.ownerId}`).set(asMember)).status, 403);
});

test('an invitation can only be accepted by the signed-in user whose email it was sent to', async (t) => {
  const f = await twoProjectFixture(t);
  const invite = await f.api.post(`/api/projects/${f.alpha.projectId}/invitations`).set(f.auth(f.ownerToken))
    .send({ email: 'newcomer@test.local' });
  assert.equal(invite.status, 201, invite.text);
  assert.equal(invite.body.added, false);
  const token = invite.body.token;

  const wrongUser = await f.api.post(`/api/invitations/${token}/accept`).set(f.auth(f.outsiderToken)).send({});
  assert.equal(wrongUser.status, 403);

  const register = await f.api.post('/api/auth/register')
    .send({ name: 'New Comer', email: 'NewComer@test.local', password: 'Password123!' });
  assert.equal(register.status, 201, register.text);
  const accepted = await f.api.post(`/api/invitations/${token}/accept`).set(f.auth(register.body.token)).send({});
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal((await f.api.get(`/api/projects/${f.alpha.projectId}/board`).set(f.auth(register.body.token))).status, 200);

  const reuse = await f.api.post(`/api/invitations/${token}/accept`).set(f.auth(register.body.token)).send({});
  assert.equal(reuse.status, 404, 'a used invitation cannot be accepted twice');
});

test('expired and malformed invitation tokens are rejected', async (t) => {
  const f = await twoProjectFixture(t);
  const invite = await f.api.post(`/api/projects/${f.alpha.projectId}/invitations`).set(f.auth(f.ownerToken))
    .send({ email: 'neel@test.local' === 'x' ? 'x' : 'late@test.local' });
  f.db.prepare("UPDATE invitations SET expires_at = datetime('now', '-1 day') WHERE token = ?").run(invite.body.token);
  const expired = await f.api.post(`/api/invitations/${invite.body.token}/accept`).set(f.auth(f.outsiderToken)).send({});
  assert.equal(expired.status, 404);
  const malformed = await f.api.post('/api/invitations/not-a-valid-token/accept').set(f.auth(f.outsiderToken)).send({});
  assert.equal(malformed.status, 400);
});

test('the server rejects unknown fields and oversized input instead of trusting the client', async (t) => {
  const f = await twoProjectFixture(t);
  const base = `/api/projects/${f.alpha.projectId}`;
  const extra = await f.api.post(`${base}/cards`).set(f.auth(f.ownerToken))
    .send({ columnId: f.alpha.columns[0].id, title: 'Fine title', projectId: f.beta.projectId });
  assert.equal(extra.status, 400, 'unknown fields such as projectId are refused');
  const tooManyLabels = await f.api.post(`${base}/cards`).set(f.auth(f.ownerToken))
    .send({ columnId: f.alpha.columns[0].id, title: 'Labels', labels: Array.from({ length: 9 }, (_, i) => `l${i}`) });
  assert.equal(tooManyLabels.status, 400);
  const longTitle = await f.api.post(`${base}/cards`).set(f.auth(f.ownerToken))
    .send({ columnId: f.alpha.columns[0].id, title: 'x'.repeat(121) });
  assert.equal(longTitle.status, 400);
  const emptyComment = await f.api.post(`${base}/cards/1/comments`).set(f.auth(f.ownerToken)).send({ body: '   ' });
  assert.ok([400, 404].includes(emptyComment.status));
});

test('repeated login attempts are rate limited', async (t) => {
  const f = await twoProjectFixture(t, { authRateLimit: { windowMs: 60_000, max: 6 } });
  // The fixture already used 3 logins. Three more are allowed, then the limiter answers 429.
  const statuses = [];
  for (let i = 0; i < 5; i += 1) {
    const response = await f.api.post('/api/auth/login').send({ email: 'asha@test.local', password: 'wrong-password' });
    statuses.push(response.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});

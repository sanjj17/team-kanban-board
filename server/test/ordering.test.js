const test = require('node:test');
const assert = require('node:assert/strict');
const { twoProjectFixture } = require('./helpers');

async function move(f, cardId, targetColumnId, beforeCardId = null, token = f.ownerToken) {
  const response = await f.api.post(`/api/projects/${f.alpha.projectId}/cards/${cardId}/move`)
    .set(f.auth(token)).send({ targetColumnId, beforeCardId });
  assert.equal(response.status, 200, response.text);
  return response.body;
}
const titlesIn = async (f, columnIndex) => (await f.board(f.ownerToken, f.alpha)).columns[columnIndex].cards.map((card) => card.title);

test('moving a card to another column changes only that card and keeps the destination order', async (t) => {
  const f = await twoProjectFixture(t);
  const a = await f.createCard(f.ownerToken, f.alpha, 'Card A', 0);
  const b = await f.createCard(f.ownerToken, f.alpha, 'Card B', 0);
  const x = await f.createCard(f.ownerToken, f.alpha, 'Card X', 1);
  const y = await f.createCard(f.ownerToken, f.alpha, 'Card Y', 1);
  const snapshot = () => f.db.prepare('SELECT id, position FROM cards ORDER BY id').all();
  const before = snapshot();

  await move(f, b.id, f.alpha.columns[1].id, y.id); // B goes between X and Y

  const after = snapshot();
  const changed = after.filter((row, i) => row.position !== before[i].position).map((row) => row.id);
  assert.deepEqual(changed, [b.id], 'only the moved card was rewritten');
  assert.deepEqual(await titlesIn(f, 0), ['Card A']);
  assert.deepEqual(await titlesIn(f, 1), ['Card X', 'Card B', 'Card Y']);
  assert.ok(a && x);
});

test('dropping on the end of a column (no beforeCardId) appends, and dropping on the first card prepends', async (t) => {
  const f = await twoProjectFixture(t);
  const a = await f.createCard(f.ownerToken, f.alpha, 'Card A', 0);
  const b = await f.createCard(f.ownerToken, f.alpha, 'Card B', 0);
  const c = await f.createCard(f.ownerToken, f.alpha, 'Card C', 0);
  await move(f, a.id, f.alpha.columns[0].id, null);
  assert.deepEqual(await titlesIn(f, 0), ['Card B', 'Card C', 'Card A']);
  await move(f, a.id, f.alpha.columns[0].id, b.id);
  assert.deepEqual(await titlesIn(f, 0), ['Card A', 'Card B', 'Card C']);
  assert.ok(c);
});

test('the activity log says "moved" across columns and "reordered" inside one column', async (t) => {
  const f = await twoProjectFixture(t);
  const a = await f.createCard(f.ownerToken, f.alpha, 'Write docs', 0);
  const b = await f.createCard(f.ownerToken, f.alpha, 'Ship it', 0);
  await move(f, a.id, f.alpha.columns[1].id);
  await move(f, b.id, f.alpha.columns[0].id, null);
  const activity = (await f.api.get(`/api/projects/${f.alpha.projectId}/activity`).set(f.auth(f.ownerToken))).body.activity;
  const messages = activity.map((entry) => entry.message);
  assert.ok(messages.includes('Asha Owner moved Write docs from To do to In progress'), messages.join(' | '));
  assert.ok(messages.includes('Asha Owner reordered Ship it in To do'), messages.join(' | '));
});

test('hard case: 80 cards inserted in the same gap keep the right order through the precision fallback', async (t) => {
  const f = await twoProjectFixture(t);
  const first = await f.createCard(f.ownerToken, f.alpha, 'first', 0);
  const last = await f.createCard(f.ownerToken, f.alpha, 'last', 0);
  const expected = ['first'];
  // Every new card is dropped directly before "last". Each insert halves the same gap, which
  // would eventually exhaust floating point precision if the server never compacted the column.
  for (let i = 1; i <= 80; i += 1) {
    const card = await f.createCard(f.ownerToken, f.alpha, `card-${i}`, 1);
    await move(f, card.id, f.alpha.columns[0].id, last.id);
    expected.push(`card-${i}`);
  }
  expected.push('last');
  assert.deepEqual(await titlesIn(f, 0), expected);

  const positions = f.db.prepare('SELECT position FROM cards WHERE column_id = ? ORDER BY position, id')
    .all(f.alpha.columns[0].id).map((row) => row.position);
  assert.equal(new Set(positions).size, positions.length, 'no two cards share a position');
  assert.ok(first && last);
});

test('moving a card with a beforeCardId that is not in the destination column is rejected and changes nothing', async (t) => {
  const f = await twoProjectFixture(t);
  const a = await f.createCard(f.ownerToken, f.alpha, 'Card A', 0);
  const x = await f.createCard(f.ownerToken, f.alpha, 'Card X', 1);
  const response = await f.api.post(`/api/projects/${f.alpha.projectId}/cards/${a.id}/move`)
    .set(f.auth(f.ownerToken)).send({ targetColumnId: f.alpha.columns[2].id, beforeCardId: x.id });
  assert.equal(response.status, 400);
  assert.deepEqual(await titlesIn(f, 0), ['Card A']);
});

test('editing a card logs which fields changed, and a no-op save logs nothing', async (t) => {
  const f = await twoProjectFixture(t);
  const card = await f.createCard(f.ownerToken, f.alpha, 'Task');
  const url = `/api/projects/${f.alpha.projectId}/cards/${card.id}`;
  const countActivity = () => f.db.prepare('SELECT COUNT(*) AS n FROM activity_log WHERE project_id = ?').get(f.alpha.projectId).n;

  const noop = await f.api.patch(url).set(f.auth(f.ownerToken)).send({ title: 'Task', dueDate: null });
  assert.equal(noop.status, 200);
  const baseline = countActivity();
  await f.api.patch(url).set(f.auth(f.ownerToken)).send({ title: 'Task', dueDate: null });
  assert.equal(countActivity(), baseline, 'no activity for a no-op save');

  const edit = await f.api.patch(url).set(f.auth(f.ownerToken)).send({ dueDate: '2030-01-15', labels: ['Bug'] });
  assert.deepEqual(edit.body.changed, ['due date', 'labels']);
  const latest = f.db.prepare('SELECT message FROM activity_log ORDER BY id DESC LIMIT 1').get().message;
  assert.equal(latest, 'Asha Owner updated Task (due date, labels)');
});

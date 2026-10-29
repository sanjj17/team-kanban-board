const test = require('node:test');
const assert = require('node:assert/strict');
const { positionBetween, POSITION_GAP, MIN_GAP } = require('../src/positions');

const cards = (...positions) => positions.map((position, index) => ({ id: index + 1, position }));

test('positionBetween: an empty column starts at the base gap', () => {
  assert.equal(positionBetween([], 0), POSITION_GAP);
});

test('positionBetween: appending adds a gap, prepending subtracts one', () => {
  const items = cards(1000, 2000);
  assert.equal(positionBetween(items, 2), 3000);
  assert.equal(positionBetween(items, 0), 0);
});

test('positionBetween: inserting between two cards uses the midpoint and touches nobody else', () => {
  const items = cards(1000, 2000, 3000);
  assert.equal(positionBetween(items, 1), 1500);
  assert.deepEqual(items.map((item) => item.position), [1000, 2000, 3000]);
});

test('positionBetween: an out-of-range index is clamped instead of throwing', () => {
  const items = cards(1000, 2000);
  assert.equal(positionBetween(items, 99), 3000);
  assert.equal(positionBetween(items, -5), 0);
});

test('positionBetween: when neighbours are too close, the column is compacted and the result still fits between them', () => {
  const items = cards(1000, 1000 + MIN_GAP / 10, 5000);
  const result = positionBetween(items, 1);
  assert.deepEqual(items.map((item) => item.position), [1000, 2000, 3000], 'column was renumbered');
  assert.ok(result > items[0].position && result < items[1].position, `${result} must sit between the first two cards`);
});

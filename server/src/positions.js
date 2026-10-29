const POSITION_GAP = 1000;
const MIN_GAP = 1e-7;

/**
 * Compute a position between two neighbours. Most moves update exactly one row.
 * `items` is already ordered and must not contain the card being moved.
 */
function positionBetween(items, beforeIndex) {
  const index = Math.max(0, Math.min(beforeIndex, items.length));
  const previous = index > 0 ? items[index - 1].position : null;
  const next = index < items.length ? items[index].position : null;

  if (previous === null && next === null) return POSITION_GAP;
  if (previous === null) return next - POSITION_GAP;
  if (next === null) return previous + POSITION_GAP;
  if (next - previous > MIN_GAP) return previous + (next - previous) / 2;

  // Very rare precision fallback: compact only the destination column.
  items.forEach((item, itemIndex) => {
    item.position = (itemIndex + 1) * POSITION_GAP;
  });
  const newPrevious = index > 0 ? items[index - 1].position : null;
  const newNext = index < items.length ? items[index].position : null;
  if (newPrevious === null) return newNext - POSITION_GAP;
  if (newNext === null) return newPrevious + POSITION_GAP;
  return newPrevious + (newNext - newPrevious) / 2;
}

module.exports = { POSITION_GAP, positionBetween };

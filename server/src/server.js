const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createDb } = require('./db');
const { createApp } = require('./app');
const { seedDatabase } = require('./seed');

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.JWT_SECRET) {
  // Refuse to run a public deployment with a guessable signing key.
  console.error('JWT_SECRET must be set when NODE_ENV=production.');
  process.exit(1);
}

const port = Number(process.env.PORT || 4000);
const db = createDb();

// Handy for a hosted demo whose database starts empty: creates the demo users once.
if (process.env.AUTO_SEED === 'true') {
  const result = seedDatabase(db);
  console.log(result.seeded ? 'AUTO_SEED: demo data created.' : 'AUTO_SEED: database already has users, nothing to do.');
}

const app = createApp({
  db,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  // Set TRUST_PROXY=1 when running behind a reverse proxy (Render, Fly, Railway, nginx)
  // so the rate limiter sees the real client IP.
  trustProxy: process.env.TRUST_PROXY === '1',
});

const server = app.listen(port, () => {
  console.log(`Kanban API listening at http://localhost:${port}`);
  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET is not set. This fallback is for local development only; set it in .env.');
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createDb } = require('./db');
const { createApp } = require('./app');

const port = Number(process.env.PORT || 4000);
const db = createDb();
const app = createApp({ db, jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me' });

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

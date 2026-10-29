const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { positionBetween, POSITION_GAP } = require('./positions');

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const labelSchema = z.string().trim().min(1).max(24);
const dueDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Due date must be a real calendar date.')
  .nullable();
const schemas = {
  register: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60),
    email: emailSchema,
    password: z.string().min(8, 'Password must be at least 8 characters.').max(100),
  }).strict(),
  login: z.object({ email: emailSchema, password: z.string().min(1).max(100) }).strict(),
  project: z.object({
    name: z.string().trim().min(2, 'Project name must be at least 2 characters.').max(70),
    description: z.string().trim().max(240).optional().default(''),
  }).strict(),
  invitation: z.object({ email: emailSchema }).strict(),
  empty: z.object({}).strict(),
  column: z.object({ name: z.string().trim().min(2).max(40) }).strict(),
  columnOrder: z.object({ orderedIds: z.array(z.number().int().positive()).min(1).max(30) }).strict(),
  cardCreate: z.object({
    columnId: z.number().int().positive(),
    title: z.string().trim().min(2, 'Task title must be at least 2 characters.').max(120),
    description: z.string().trim().max(2000).optional().default(''),
    assigneeId: z.number().int().positive().nullable().optional().default(null),
    dueDate: dueDateSchema.optional().default(null),
    labels: z.array(labelSchema).max(8).optional().default([]),
  }).strict(),
  cardPatch: z.object({
    title: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    assigneeId: z.number().int().positive().nullable().optional(),
    dueDate: dueDateSchema.optional(),
    labels: z.array(labelSchema).max(8).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update.'),
  move: z.object({
    targetColumnId: z.number().int().positive(),
    beforeCardId: z.number().int().positive().nullable().optional().default(null),
  }).strict(),
  comment: z.object({ body: z.string().trim().min(1, 'Comment cannot be empty.').max(1000) }).strict(),
};

function createApp({ db, jwtSecret = process.env.JWT_SECRET || 'dev-only-change-me' }) {
  if (!db) throw new Error('createApp requires a database connection.');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const statements = {
    userById: db.prepare('SELECT id, name, email FROM users WHERE id = ?'),
    projectRole: db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'),
    projectById: db.prepare('SELECT * FROM projects WHERE id = ?'),
    columnById: db.prepare('SELECT * FROM board_columns WHERE id = ? AND project_id = ?'),
    cardById: db.prepare('SELECT * FROM cards WHERE id = ? AND project_id = ?'),
  };

  function validate(schema, payload, res) {
    const result = schema.safeParse(payload);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      res.status(400).json({
        error: firstIssue?.message || 'Please check the submitted information.',
        details,
      });
      return null;
    }
    return result.data;
  }

  function signToken(user) {
    return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
  }

  function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = statements.userById.get(Number(payload.sub));
      if (!user) return res.status(401).json({ error: 'Your session is no longer valid. Please sign in again.' });
      req.user = user;
      return next();
    } catch (_error) {
      return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
    }
  }

  function requireProjectMember(req, res, next) {
    const projectId = Number(req.params.projectId);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'Project ID is invalid.' });
    }
    const membership = statements.projectRole.get(projectId, req.user.id);
    // Return 404 instead of revealing whether a private project exists.
    if (!membership) return res.status(404).json({ error: 'Project not found.' });
    req.projectId = projectId;
    req.projectRole = membership.role;
    return next();
  }

  function requireOwner(req, res, next) {
    if (req.projectRole !== 'owner') {
      return res.status(403).json({ error: 'Only the project owner can do that.' });
    }
    return next();
  }

  function logActivity(projectId, actorId, message, cardId = null) {
    db.prepare(`INSERT INTO activity_log (project_id, actor_id, message, card_id)
      VALUES (?, ?, ?, ?)`).run(projectId, actorId, message, cardId);
  }

  function cardTitle(cardId) {
    return db.prepare('SELECT title FROM cards WHERE id = ?').get(cardId)?.title || 'a task';
  }

  function memberName(projectId, userId) {
    if (!userId) return null;
    return db.prepare(`SELECT u.name FROM users u
      JOIN project_members pm ON pm.user_id = u.id
      WHERE pm.project_id = ? AND pm.user_id = ?`).get(projectId, userId)?.name || null;
  }

  function validAssignee(projectId, assigneeId) {
    if (assigneeId == null) return true;
    return Boolean(statements.projectRole.get(projectId, assigneeId));
  }

  function shapeCard(card) {
    return {
      ...card,
      labels: JSON.parse(card.labels || '[]'),
    };
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Authentication
  app.post('/api/auth/register', async (req, res, next) => {
    const input = validate(schemas.register, req.body, res);
    if (!input) return;
    try {
      const passwordHash = await bcrypt.hash(input.password, 12);
      const result = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
        .run(input.name, input.email, passwordHash);
      const user = statements.userById.get(result.lastInsertRowid);
      return res.status(201).json({ token: signToken(user), user });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      return next(error);
    }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    const input = validate(schemas.login, req.body, res);
    if (!input) return;
    try {
      const row = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(input.email);
      const passwordMatches = row ? await bcrypt.compare(input.password, row.password_hash) : false;
      if (!row || !passwordMatches) {
        return res.status(401).json({ error: 'Email or password is incorrect.' });
      }
      const user = statements.userById.get(row.id);
      return res.json({ token: signToken(user), user });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

  // Projects
  app.get('/api/projects', authenticate, (req, res) => {
    const projects = db.prepare(`
      SELECT p.id, p.name, p.description, p.owner_id AS ownerId, p.created_at AS createdAt,
        pm.role,
        (SELECT COUNT(*) FROM cards c WHERE c.project_id = p.id) AS cardCount,
        (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) AS memberCount
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE pm.user_id = ?
      ORDER BY p.created_at DESC, p.id DESC
    `).all(req.user.id);
    res.json({ projects });
  });

  app.post('/api/projects', authenticate, (req, res) => {
    const input = validate(schemas.project, req.body, res);
    if (!input) return;
    const createProject = db.transaction(() => {
      const result = db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)')
        .run(input.name, input.description, req.user.id);
      const projectId = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
        .run(projectId, req.user.id, 'owner');
      const insertColumn = db.prepare('INSERT INTO board_columns (project_id, name, position) VALUES (?, ?, ?)');
      ['To do', 'In progress', 'Done'].forEach((name, index) => insertColumn.run(projectId, name, (index + 1) * POSITION_GAP));
      logActivity(projectId, req.user.id, `${req.user.name} created the project ${input.name}`);
      return statements.projectById.get(projectId);
    });
    const project = createProject();
    res.status(201).json({ project });
  });

  app.get('/api/projects/:projectId/board', authenticate, requireProjectMember, (req, res) => {
    const project = statements.projectById.get(req.projectId);
    const members = db.prepare(`SELECT u.id, u.name, u.email, pm.role, pm.joined_at AS joinedAt
      FROM project_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ? ORDER BY CASE pm.role WHEN 'owner' THEN 0 ELSE 1 END, u.name COLLATE NOCASE`)
      .all(req.projectId);
    const columns = db.prepare('SELECT id, name, position FROM board_columns WHERE project_id = ? ORDER BY position, id')
      .all(req.projectId);
    const cards = db.prepare(`SELECT c.id, c.project_id AS projectId, c.column_id AS columnId,
        c.title, c.description, c.assignee_id AS assigneeId, u.name AS assigneeName,
        c.due_date AS dueDate, c.labels, c.position, c.created_by AS createdBy,
        creator.name AS creatorName, c.created_at AS createdAt, c.updated_at AS updatedAt,
        (SELECT COUNT(*) FROM comments cm WHERE cm.card_id = c.id) AS commentCount
      FROM cards c
      LEFT JOIN users u ON u.id = c.assignee_id
      JOIN users creator ON creator.id = c.created_by
      WHERE c.project_id = ? ORDER BY c.position, c.id`).all(req.projectId).map(shapeCard);
    const shapedColumns = columns.map((column) => ({
      ...column,
      cards: cards.filter((card) => card.columnId === column.id),
    }));
    let pendingInvitations = [];
    if (req.projectRole === 'owner') {
      pendingInvitations = db.prepare(`SELECT email, token, expires_at AS expiresAt, created_at AS createdAt
        FROM invitations WHERE project_id = ? AND accepted_at IS NULL AND expires_at > datetime('now')
        ORDER BY created_at DESC`).all(req.projectId);
    }
    res.json({ project, members, columns: shapedColumns, pendingInvitations, role: req.projectRole });
  });

  app.get('/api/projects/:projectId/activity', authenticate, requireProjectMember, (req, res) => {
    const requestedLimit = Number(req.query.limit || 60);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 60;
    const activity = db.prepare(`SELECT a.id, a.message, a.card_id AS cardId, a.created_at AS createdAt,
        u.id AS actorId, u.name AS actorName
      FROM activity_log a JOIN users u ON u.id = a.actor_id
      WHERE a.project_id = ? ORDER BY a.id DESC LIMIT ?`).all(req.projectId, limit);
    res.json({ activity });
  });

  // Invitations and member access
  app.post('/api/projects/:projectId/invitations', authenticate, requireProjectMember, requireOwner, (req, res) => {
    const input = validate(schemas.invitation, req.body, res);
    if (!input) return;
    const email = input.email;
    const existingUser = db.prepare('SELECT id, name, email FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (existingUser) {
      const alreadyMember = statements.projectRole.get(req.projectId, existingUser.id);
      if (alreadyMember) return res.status(409).json({ error: 'That person is already a project member.' });
      db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
        .run(req.projectId, existingUser.id, 'member');
      logActivity(req.projectId, req.user.id, `${req.user.name} added ${existingUser.name} to the project`);
      return res.status(201).json({ added: true, member: existingUser, message: `${existingUser.name} was added to the project.` });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const existingInvite = db.prepare('SELECT id FROM invitations WHERE project_id = ? AND email = ? COLLATE NOCASE').get(req.projectId, email);
    if (existingInvite) {
      db.prepare(`UPDATE invitations SET token = ?, invited_by = ?, expires_at = ?, accepted_at = NULL, created_at = datetime('now') WHERE id = ?`)
        .run(token, req.user.id, expiresAt, existingInvite.id);
    } else {
      db.prepare('INSERT INTO invitations (project_id, email, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(req.projectId, email, token, req.user.id, expiresAt);
    }
    logActivity(req.projectId, req.user.id, `${req.user.name} invited ${email} to the project`);
    return res.status(201).json({
      added: false,
      email,
      token,
      invitePath: `/accept-invite/${token}`,
      message: 'Invite created. Copy the invitation link and share it with this person.',
    });
  });

  app.delete('/api/projects/:projectId/members/:userId', authenticate, requireProjectMember, requireOwner, (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Member ID is invalid.' });
    const membership = statements.projectRole.get(req.projectId, userId);
    if (!membership) return res.status(404).json({ error: 'Member not found.' });
    if (membership.role === 'owner') return res.status(400).json({ error: 'The project owner cannot be removed.' });
    const name = memberName(req.projectId, userId) || 'A member';
    // Clear task assignments first so every assignee remains a member of the same project.
    db.prepare('UPDATE cards SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?').run(req.projectId, userId);
    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.projectId, userId);
    logActivity(req.projectId, req.user.id, `${req.user.name} removed ${name} from the project`);
    res.json({ ok: true });
  });

  app.post('/api/invitations/:token/accept', authenticate, (req, res) => {
    if (!/^[a-f0-9]{48}$/.test(req.params.token)) return res.status(400).json({ error: 'Invitation token is invalid.' });
    const emptyInput = validate(schemas.empty, req.body, res);
    if (!emptyInput) return;
    const invite = db.prepare(`SELECT * FROM invitations WHERE token = ? AND accepted_at IS NULL AND expires_at > datetime('now')`)
      .get(req.params.token);
    if (!invite) return res.status(404).json({ error: 'This invitation is invalid or has expired.' });
    if (invite.email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({ error: `This invitation was sent to ${invite.email}. Sign in with that email to accept it.` });
    }
    const transaction = db.transaction(() => {
      db.prepare(`INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'member')
        ON CONFLICT(project_id, user_id) DO NOTHING`).run(invite.project_id, req.user.id);
      db.prepare('UPDATE invitations SET accepted_at = datetime(\'now\') WHERE id = ?').run(invite.id);
      logActivity(invite.project_id, req.user.id, `${req.user.name} joined the project`);
    });
    transaction();
    res.json({ ok: true, projectId: invite.project_id, message: 'Invitation accepted.' });
  });

  // Board columns — owner-only operations
  app.post('/api/projects/:projectId/columns', authenticate, requireProjectMember, requireOwner, (req, res) => {
    const input = validate(schemas.column, req.body, res);
    if (!input) return;
    const duplicate = db.prepare('SELECT id FROM board_columns WHERE project_id = ? AND name = ? COLLATE NOCASE')
      .get(req.projectId, input.name);
    if (duplicate) return res.status(409).json({ error: 'A column with that name already exists.' });
    const max = db.prepare('SELECT MAX(position) AS maxPosition FROM board_columns WHERE project_id = ?').get(req.projectId).maxPosition || 0;
    const result = db.prepare('INSERT INTO board_columns (project_id, name, position) VALUES (?, ?, ?)')
      .run(req.projectId, input.name, max + POSITION_GAP);
    logActivity(req.projectId, req.user.id, `${req.user.name} added the ${input.name} column`);
    res.status(201).json({ column: { id: Number(result.lastInsertRowid), name: input.name, position: max + POSITION_GAP, cards: [] } });
  });

  app.patch('/api/projects/:projectId/columns/reorder', authenticate, requireProjectMember, requireOwner, (req, res) => {
    const input = validate(schemas.columnOrder, req.body, res);
    if (!input) return;
    const current = db.prepare('SELECT id FROM board_columns WHERE project_id = ? ORDER BY position, id').all(req.projectId).map((row) => row.id);
    const wanted = input.orderedIds;
    if (new Set(wanted).size !== wanted.length || wanted.length !== current.length || current.some((id) => !wanted.includes(id))) {
      return res.status(400).json({ error: 'Column order must contain every project column exactly once.' });
    }
    const update = db.prepare('UPDATE board_columns SET position = ? WHERE id = ? AND project_id = ?');
    const transaction = db.transaction(() => wanted.forEach((id, index) => update.run((index + 1) * POSITION_GAP, id, req.projectId)));
    transaction();
    logActivity(req.projectId, req.user.id, `${req.user.name} reordered the board columns`);
    res.json({ ok: true });
  });

  app.patch('/api/projects/:projectId/columns/:columnId', authenticate, requireProjectMember, requireOwner, (req, res) => {
    const columnId = Number(req.params.columnId);
    if (!Number.isSafeInteger(columnId) || columnId <= 0) return res.status(400).json({ error: 'Column ID is invalid.' });
    const column = statements.columnById.get(columnId, req.projectId);
    if (!column) return res.status(404).json({ error: 'Column not found.' });
    const input = validate(schemas.column, req.body, res);
    if (!input) return;
    const duplicate = db.prepare('SELECT id FROM board_columns WHERE project_id = ? AND name = ? COLLATE NOCASE AND id != ?')
      .get(req.projectId, input.name, columnId);
    if (duplicate) return res.status(409).json({ error: 'A column with that name already exists.' });
    db.prepare('UPDATE board_columns SET name = ? WHERE id = ? AND project_id = ?').run(input.name, columnId, req.projectId);
    logActivity(req.projectId, req.user.id, `${req.user.name} renamed ${column.name} to ${input.name}`);
    res.json({ column: { id: columnId, name: input.name, position: column.position } });
  });

  app.delete('/api/projects/:projectId/columns/:columnId', authenticate, requireProjectMember, requireOwner, (req, res) => {
    const columnId = Number(req.params.columnId);
    if (!Number.isSafeInteger(columnId) || columnId <= 0) return res.status(400).json({ error: 'Column ID is invalid.' });
    const column = statements.columnById.get(columnId, req.projectId);
    if (!column) return res.status(404).json({ error: 'Column not found.' });
    const columnCount = db.prepare('SELECT COUNT(*) AS count FROM board_columns WHERE project_id = ?').get(req.projectId).count;
    if (columnCount <= 1) return res.status(400).json({ error: 'A board must have at least one column.' });
    const cardCount = db.prepare('SELECT COUNT(*) AS count FROM cards WHERE column_id = ?').get(columnId).count;
    if (cardCount > 0) return res.status(400).json({ error: 'Move or delete the cards in this column before deleting it.' });
    db.prepare('DELETE FROM board_columns WHERE id = ? AND project_id = ?').run(columnId, req.projectId);
    logActivity(req.projectId, req.user.id, `${req.user.name} deleted the ${column.name} column`);
    res.json({ ok: true });
  });

  // Cards
  app.post('/api/projects/:projectId/cards', authenticate, requireProjectMember, (req, res) => {
    const input = validate(schemas.cardCreate, req.body, res);
    if (!input) return;
    const column = statements.columnById.get(input.columnId, req.projectId);
    if (!column) return res.status(400).json({ error: 'Choose a column from this project.' });
    if (!validAssignee(req.projectId, input.assigneeId)) return res.status(400).json({ error: 'The assignee must be a member of this project.' });
    const max = db.prepare('SELECT MAX(position) AS maxPosition FROM cards WHERE column_id = ?').get(input.columnId).maxPosition || 0;
    const position = max + POSITION_GAP;
    const result = db.prepare(`INSERT INTO cards
      (project_id, column_id, title, description, assignee_id, due_date, labels, position, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.projectId, input.columnId, input.title, input.description, input.assigneeId,
      input.dueDate, JSON.stringify(input.labels), position, req.user.id,
    );
    const cardId = Number(result.lastInsertRowid);
    logActivity(req.projectId, req.user.id, `${req.user.name} created ${input.title}`, cardId);
    const card = db.prepare(`SELECT c.id, c.project_id AS projectId, c.column_id AS columnId, c.title,
      c.description, c.assignee_id AS assigneeId, u.name AS assigneeName, c.due_date AS dueDate,
      c.labels, c.position, c.created_by AS createdBy, c.created_at AS createdAt,
      c.updated_at AS updatedAt, 0 AS commentCount FROM cards c LEFT JOIN users u ON u.id = c.assignee_id WHERE c.id = ?`).get(cardId);
    res.status(201).json({ card: shapeCard(card) });
  });

  app.patch('/api/projects/:projectId/cards/:cardId', authenticate, requireProjectMember, (req, res) => {
    const cardId = Number(req.params.cardId);
    if (!Number.isSafeInteger(cardId) || cardId <= 0) return res.status(400).json({ error: 'Task ID is invalid.' });
    const card = statements.cardById.get(cardId, req.projectId);
    if (!card) return res.status(404).json({ error: 'Task not found.' });
    const input = validate(schemas.cardPatch, req.body, res);
    if (!input) return;
    if (Object.prototype.hasOwnProperty.call(input, 'assigneeId') && !validAssignee(req.projectId, input.assigneeId)) {
      return res.status(400).json({ error: 'The assignee must be a member of this project.' });
    }
    const updates = [];
    const values = [];
    const fieldMap = { title: 'title', description: 'description', assigneeId: 'assignee_id', dueDate: 'due_date' };
    for (const [key, column] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        updates.push(`${column} = ?`);
        values.push(input[key]);
      }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'labels')) {
      updates.push('labels = ?');
      values.push(JSON.stringify(input.labels));
    }
    updates.push("updated_at = datetime('now')");
    values.push(cardId, req.projectId);
    db.prepare(`UPDATE cards SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`).run(...values);
    const newTitle = input.title || card.title;
    logActivity(req.projectId, req.user.id, `${req.user.name} updated ${newTitle}`, cardId);
    res.json({ ok: true });
  });

  app.post('/api/projects/:projectId/cards/:cardId/move', authenticate, requireProjectMember, (req, res) => {
    const cardId = Number(req.params.cardId);
    if (!Number.isSafeInteger(cardId) || cardId <= 0) return res.status(400).json({ error: 'Task ID is invalid.' });
    const card = statements.cardById.get(cardId, req.projectId);
    if (!card) return res.status(404).json({ error: 'Task not found.' });
    const input = validate(schemas.move, req.body, res);
    if (!input) return;
    const targetColumn = statements.columnById.get(input.targetColumnId, req.projectId);
    if (!targetColumn) return res.status(400).json({ error: 'Choose a destination column from this project.' });
    const oldColumn = statements.columnById.get(card.column_id, req.projectId);
    const destination = db.prepare('SELECT id, position FROM cards WHERE column_id = ? AND id != ? ORDER BY position, id')
      .all(input.targetColumnId, cardId);
    let insertionIndex = destination.length;
    if (input.beforeCardId != null) {
      insertionIndex = destination.findIndex((item) => item.id === input.beforeCardId);
      if (insertionIndex < 0) return res.status(400).json({ error: 'The destination card is not in that column.' });
    }
    const oldPositions = destination.map((item) => item.position);
    const newPosition = positionBetween(destination, insertionIndex);
    // In the extremely rare precision fallback, persist any rebalanced destination neighbours.
    destination.forEach((item, index) => {
      if (item.position !== oldPositions[index]) {
        db.prepare('UPDATE cards SET position = ? WHERE id = ?').run(item.position, item.id);
      }
    });
    db.prepare("UPDATE cards SET column_id = ?, position = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?")
      .run(input.targetColumnId, newPosition, cardId, req.projectId);
    const title = card.title;
    logActivity(req.projectId, req.user.id, `${req.user.name} moved ${title} from ${oldColumn.name} to ${targetColumn.name}`, cardId);
    res.json({ ok: true, cardId, columnId: input.targetColumnId, position: newPosition });
  });

  app.delete('/api/projects/:projectId/cards/:cardId', authenticate, requireProjectMember, (req, res) => {
    const cardId = Number(req.params.cardId);
    if (!Number.isSafeInteger(cardId) || cardId <= 0) return res.status(400).json({ error: 'Task ID is invalid.' });
    const card = statements.cardById.get(cardId, req.projectId);
    if (!card) return res.status(404).json({ error: 'Task not found.' });
    logActivity(req.projectId, req.user.id, `${req.user.name} deleted ${card.title}`);
    db.prepare('DELETE FROM cards WHERE id = ? AND project_id = ?').run(cardId, req.projectId);
    res.json({ ok: true });
  });

  // Comments
  app.get('/api/projects/:projectId/cards/:cardId/comments', authenticate, requireProjectMember, (req, res) => {
    const cardId = Number(req.params.cardId);
    if (!Number.isSafeInteger(cardId) || cardId <= 0) return res.status(400).json({ error: 'Task ID is invalid.' });
    const card = statements.cardById.get(cardId, req.projectId);
    if (!card) return res.status(404).json({ error: 'Task not found.' });
    const comments = db.prepare(`SELECT cm.id, cm.body, cm.created_at AS createdAt, u.id AS userId, u.name AS userName
      FROM comments cm JOIN users u ON u.id = cm.user_id WHERE cm.card_id = ? ORDER BY cm.id ASC`).all(cardId);
    res.json({ comments });
  });

  app.post('/api/projects/:projectId/cards/:cardId/comments', authenticate, requireProjectMember, (req, res) => {
    const cardId = Number(req.params.cardId);
    if (!Number.isSafeInteger(cardId) || cardId <= 0) return res.status(400).json({ error: 'Task ID is invalid.' });
    const card = statements.cardById.get(cardId, req.projectId);
    if (!card) return res.status(404).json({ error: 'Task not found.' });
    const input = validate(schemas.comment, req.body, res);
    if (!input) return;
    const result = db.prepare('INSERT INTO comments (card_id, user_id, body) VALUES (?, ?, ?)')
      .run(cardId, req.user.id, input.body);
    logActivity(req.projectId, req.user.id, `${req.user.name} commented on ${card.title}`, cardId);
    const comment = db.prepare(`SELECT cm.id, cm.body, cm.created_at AS createdAt,
      u.id AS userId, u.name AS userName FROM comments cm JOIN users u ON u.id = cm.user_id WHERE cm.id = ?`)
      .get(Number(result.lastInsertRowid));
    res.status(201).json({ comment });
  });

  app.use((_req, res) => res.status(404).json({ error: 'That endpoint does not exist.' }));
  app.use((error, _req, res, _next) => {
    // Keep stack traces in server logs only, never in API responses.
    console.error(error);
    res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  });

  return app;
}

module.exports = { createApp };

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownUp, ArrowRight, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, Columns3,
  Command, FolderKanban, LayoutGrid, ListFilter, LockKeyhole, LogOut, Mail,
  MessageCircle, MoreHorizontal, Plus, Search,
  Send, Settings2, ShieldCheck, Sparkles, Trash2, UserPlus, Users, X,
} from 'lucide-react';

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const activeToken = options.token ?? localStorage.getItem('kanban-token');
  if (activeToken) headers.Authorization = `Bearer ${activeToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function prettyDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fullDate(value) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(value) {
  if (!value) return 'just now';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(normalized).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return 'recently';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return fullDate(value);
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

const labelColors = {
  Design: 'lilac', Product: 'blue', Engineering: 'mint', Frontend: 'peach',
  Priority: 'rose', Research: 'yellow', Bug: 'rose', Docs: 'blue',
};

function Label({ children }) {
  const color = labelColors[children] || ['blue', 'mint', 'lilac', 'yellow'][String(children).length % 4];
  return <span className={`label-chip ${color}`}>{children}</span>;
}

function Avatar({ name, size = 'normal', title }) {
  const palette = ['avatar-lilac', 'avatar-mint', 'avatar-peach', 'avatar-blue', 'avatar-rose'];
  const sum = String(name || '').split('').reduce((total, letter) => total + letter.charCodeAt(0), 0);
  return <span className={`avatar ${palette[sum % palette.length]} ${size}`} title={title || name}>{initials(name)}</span>;
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);
  if (!toast) return null;
  return <div className={`toast ${toast.type === 'error' ? 'toast-error' : ''}`} role="status">
    {toast.type === 'error' ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
    <span>{toast.message}</span>
    <button aria-label="Dismiss notification" onClick={onClose}><X size={15} /></button>
  </div>;
}

function AuthScreen({ onAuth, toast, onToastClose }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: form });
      onAuth(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-page">
    <div className="auth-left">
      <div className="brand brand-light"><span className="brand-mark"><Command size={20} strokeWidth={2.6} /></span><span>orbit<span className="brand-period">.</span></span></div>
      <div className="auth-story">
        <span className="eyebrow"><Sparkles size={14} /> TEAMWORK, IN MOTION</span>
        <h1>Good work<br />moves <em>forward.</em></h1>
        <p>A calmer place to plan, make progress, and ship great things together.</p>
        <div className="mini-board" aria-hidden="true">
          <div className="mini-board-head"><span>Product Launch</span><span className="mini-dots">•••</span></div>
          <div className="mini-columns">
            <div className="mini-col"><span className="mini-col-title"><i className="dot dot-lilac" /> TO DO <b>2</b></span><div className="mini-task"><i className="mini-line wide" /><i className="mini-line short" /><i className="mini-pill" /></div><div className="mini-task"><i className="mini-line mid" /><i className="mini-line short" /></div></div>
            <div className="mini-col"><span className="mini-col-title"><i className="dot dot-blue" /> IN PROGRESS <b>1</b></span><div className="mini-task mini-task-focus"><i className="mini-line wide" /><i className="mini-line mid" /><i className="mini-pill mini-pill-blue" /></div></div>
            <div className="mini-col"><span className="mini-col-title"><i className="dot dot-mint" /> DONE <b>1</b></span><div className="mini-task"><i className="mini-line wide" /><i className="mini-line short" /><span className="mini-check"><Check size={10} /></span></div></div>
          </div>
        </div>
      </div>
      <div className="auth-foot"><ShieldCheck size={14} /> Your team space. Your momentum.</div>
    </div>
    <div className="auth-right">
      <div className="auth-topnote">{mode === 'login' ? 'New to Orbit?' : 'Already have an account?'} <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}> {mode === 'login' ? 'Create an account' : 'Sign in'}</button></div>
      <div className="auth-form-wrap">
        <div className="mobile-brand brand"><span className="brand-mark"><Command size={19} /></span><span>orbit<span className="brand-period">.</span></span></div>
        <span className="eyebrow eyebrow-muted">YOUR WORKSPACE AWAITS</span>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your workspace login'}</h2>
        <p className="auth-subtitle">{mode === 'login' ? 'Sign in to pick up where your team left off.' : 'Make an account and start moving work forward.'}</p>
        {error && <div className="inline-error"><CircleAlert size={16} />{error}</div>}
        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && <label>Full name<input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sanjana Nagwani" required minLength={2} maxLength={60} /></label>}
          <label>Email address<div className="input-icon"><Mail size={17} /><input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" required /></div></label>
          <label>Password<div className="input-icon"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} required minLength={mode === 'register' ? 8 : 1} maxLength={100} /><button type="button" className="field-action" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button></div></label>
          <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to Orbit' : 'Create account'} <ArrowRight size={17} /></button>
        </form>
        <div className="auth-divider"><span /> <small>OR TRY THE DEMO</small> <span /></div>
        <div className="demo-box"><div className="demo-icon"><Command size={17} /></div><div><strong>Product Launch</strong><p>Explore a pre-filled team board</p><small>asha@example.com · OrbitDemo26!</small></div><button onClick={() => { setForm({ name: '', email: 'asha@example.com', password: 'OrbitDemo26!' }); setMode('login'); setError(''); }} className="demo-fill" type="button">Use demo <ArrowRight size={14} /></button></div>
        <p className="auth-legal">By continuing, you agree to use this demo responsibly. This is a portfolio project, not a production service.</p>
      </div>
    </div>
    <Toast toast={toast} onClose={onToastClose} />
  </div>;
}

function Card({ card, column, onOpen, onDragStart, onDragEnd, onDrop, isDragging }) {
  const isOverdue = card.dueDate && card.dueDate < new Date().toISOString().slice(0, 10) && column.name.toLowerCase() !== 'done';
  return <article className={`task-card ${isDragging ? 'task-dragging' : ''}`} draggable onDragStart={(event) => onDragStart(event, card, column)} onDragEnd={onDragEnd} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, column, card)} onClick={() => onOpen(card, column.id)}>
    <div className="task-topline"><span className="task-grip" aria-label="Drag task"><span /><span /><span /><span /><span /><span /></span><button className="task-menu" aria-label={`Open ${card.title}`} onClick={(event) => { event.stopPropagation(); onOpen(card, column.id); }}><MoreHorizontal size={17} /></button></div>
    <h3>{card.title}</h3>
    {card.description && <p className="task-description">{card.description}</p>}
    {card.labels?.length > 0 && <div className="task-labels">{card.labels.slice(0, 3).map((label) => <Label key={label}>{label}</Label>)}{card.labels.length > 3 && <span className="more-labels">+{card.labels.length - 3}</span>}</div>}
    <div className="task-footer">
      <div className={`task-due ${isOverdue ? 'overdue' : ''}`}>{card.dueDate && <><CalendarDays size={13} /><span>{prettyDate(card.dueDate)}</span></>}{isOverdue && <span className="overdue-mark">!</span>}</div>
      <div className="task-meta"><span className="comment-count" title={`${card.commentCount || 0} comments`}><MessageCircle size={14} />{card.commentCount || 0}</span>{card.assigneeName ? <Avatar name={card.assigneeName} size="small" title={`Assigned to ${card.assigneeName}`} /> : <span className="unassigned-avatar" title="Unassigned">?</span>}</div>
    </div>
  </article>;
}

function ActivityPanel({ activity, onClose }) {
  return <aside className="activity-panel">
    <div className="panel-heading"><div><span className="eyebrow eyebrow-muted">THE PAPER TRAIL</span><h3>Activity</h3></div><button className="icon-button" aria-label="Close activity" onClick={onClose}><X size={18} /></button></div>
    <p className="panel-subtitle">A little history of everything moving.</p>
    <div className="activity-list">
      {activity.length === 0 ? <div className="empty-activity"><Activity size={22} /><p>No activity yet.</p><span>Actions on this board will appear here.</span></div> : activity.map((entry, index) => <div className="activity-entry" key={entry.id}>
        <Avatar name={entry.actorName} size="small" />
        <div className="activity-copy"><p>{entry.message}</p><time>{timeAgo(entry.createdAt)}</time></div>
        {index === 0 && <span className="activity-new-dot" />}
      </div>)}
    </div>
    <div className="activity-panel-foot"><span className="activity-pulse" /> Updates are saved to this project</div>
  </aside>;
}

function ProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await onCreate({ name, description }); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <Modal onClose={onClose}>
    <div className="modal-header"><div className="modal-icon icon-purple"><FolderKanban size={19} /></div><div><h2>New project</h2><p>Give this work a home.</p></div><button className="icon-button modal-close" onClick={onClose}><X size={18} /></button></div>
    {error && <div className="inline-error"><CircleAlert size={15} />{error}</div>}
    <form className="modal-form" onSubmit={submit}>
      <label>Project name<input autoFocus maxLength={70} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website refresh" required minLength={2} /></label>
      <label>Description <span className="label-optional">OPTIONAL</span><textarea maxLength={240} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is your team working toward?" /></label>
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create project'} <ArrowRight size={16} /></button></div>
    </form>
  </Modal>;
}

function Modal({ children, onClose, wide = false }) {
  useEffect(() => {
    function onKey(event) { if (event.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">{children}</section></div>;
}

function CardModal({ card, projectId, defaultColumnId, columns, members, onClose, onSaved, notify }) {
  const [form, setForm] = useState({
    title: card?.title || '', description: card?.description || '',
    assigneeId: card?.assigneeId ?? '', dueDate: card?.dueDate || '',
    labels: (card?.labels || []).join(', '), columnId: defaultColumnId || columns[0]?.id,
  });
  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!card?.id) return;
    api(`/projects/${projectId}/cards/${card.id}/comments`).then((data) => setComments(data.comments)).catch((err) => notify(err.message, 'error'));
  }, [card?.id, projectId, notify]);

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    const payload = {
      title: form.title,
      description: form.description,
      assigneeId: form.assigneeId === '' ? null : Number(form.assigneeId),
      dueDate: form.dueDate || null,
      labels: [...new Set(form.labels.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 8),
    };
    try {
      if (card) await api(`/projects/${projectId}/cards/${card.id}`, { method: 'PATCH', body: payload });
      else await api(`/projects/${projectId}/cards`, { method: 'POST', body: { ...payload, columnId: Number(form.columnId) } });
      if (card && Number(form.columnId) !== card.columnId) {
        await api(`/projects/${projectId}/cards/${card.id}/move`, { method: 'POST', body: { targetColumnId: Number(form.columnId), beforeCardId: null } });
      }
      await onSaved();
      onClose();
      notify(card ? 'Task updated.' : 'Task created.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!commentDraft.trim()) return;
    setCommentBusy(true);
    try {
      const result = await api(`/projects/${projectId}/cards/${card.id}/comments`, { method: 'POST', body: { body: commentDraft } });
      setComments((current) => [...current, result.comment]);
      setCommentDraft('');
      await onSaved(true);
    } catch (err) { notify(err.message, 'error'); }
    finally { setCommentBusy(false); }
  }

  async function deleteCard() {
    try {
      await api(`/projects/${projectId}/cards/${card.id}`, { method: 'DELETE' });
      await onSaved(); onClose(); notify('Task deleted.');
    } catch (err) { setError(err.message); }
  }

  return <Modal onClose={onClose} wide>
    <div className="task-modal-layout">
      <div className="task-modal-main">
        <div className="modal-header task-modal-header"><div className="modal-icon icon-purple"><CheckCircle2 size={19} /></div><div><span className="eyebrow eyebrow-muted">{card ? 'TASK DETAILS' : 'NEW TASK'}</span><h2>{card ? 'Edit task' : 'Add a task'}</h2></div><button className="icon-button modal-close mobile-only" onClick={onClose}><X size={18} /></button></div>
        {error && <div className="inline-error"><CircleAlert size={15} />{error}</div>}
        <form className="modal-form card-form" onSubmit={submit}>
          <label>Task title<input autoFocus maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs to get done?" required minLength={2} /></label>
          <label>Description <span className="label-optional">OPTIONAL</span><textarea rows={4} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Add a little context for your teammates…" /></label>
          <label>{card ? 'Move to column' : 'Column'}<select value={form.columnId} onChange={(e) => setForm({ ...form, columnId: Number(e.target.value) })}>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
          <div className="form-two-col"><label>Assignee<select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label></div>
          <label>Labels <span className="label-optional">COMMA SEPARATED · UP TO 8</span><input value={form.labels} onChange={(e) => setForm({ ...form, labels: e.target.value })} placeholder="Design, Priority" /></label>
          <div className="modal-actions card-modal-actions">{card ? <button type="button" className="danger-quiet" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete task</button> : <span />}
            <div><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : card ? 'Save changes' : 'Create task'} <Check size={16} /></button></div>
          </div>
        </form>
        {confirmDelete && <div className="confirm-delete"><div><strong>Delete this task?</strong><p>This also removes its comments. This action cannot be undone.</p></div><button className="secondary-button" onClick={() => setConfirmDelete(false)}>Keep task</button><button className="danger-button" onClick={deleteCard}>Delete</button></div>}
      </div>
      {card && <div className="comments-side">
        <div className="comments-heading"><div><MessageCircle size={17} /><h3>Discussion</h3></div><button className="icon-button desktop-only" onClick={onClose} aria-label="Close task"><X size={17} /></button></div>
        <p className="comments-intro">Keep the context with the work.</p>
        <div className="comments-list">{comments.length === 0 ? <div className="comments-empty"><div className="comment-empty-icon"><MessageCircle size={19} /></div><strong>Start the conversation</strong><p>Share a question, an update, or a helpful link with your team.</p></div> : comments.map((comment) => <div className="comment" key={comment.id}><Avatar name={comment.userName} size="small" /><div className="comment-body"><div className="comment-byline"><strong>{comment.userName}</strong><time>{timeAgo(comment.createdAt)}</time></div><p>{comment.body}</p></div></div>)}</div>
        <form className="comment-composer" onSubmit={submitComment}><textarea rows={2} maxLength={1000} value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Write a comment…" /><div><span>Be kind, be clear.</span><button className="send-button" disabled={!commentDraft.trim() || commentBusy} aria-label="Send comment"><Send size={15} /></button></div></form>
      </div>}
    </div>
  </Modal>;
}

function TeamModal({ projectId, board, onClose, onRefresh, notify }) {
  const [email, setEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState('');
  async function invite(event) {
    event.preventDefault(); setError(''); setInviteBusy(true); setInviteLink('');
    try {
      const result = await api(`/projects/${projectId}/invitations`, { method: 'POST', body: { email } });
      if (result.invitePath) setInviteLink(`${window.location.origin}${result.invitePath}`);
      else { notify(result.message || 'Member added.'); await onRefresh(); }
      setEmail('');
    } catch (err) { setError(err.message); }
    finally { setInviteBusy(false); }
  }
  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.name} from this project?`)) return;
    try { await api(`/projects/${projectId}/members/${member.id}`, { method: 'DELETE' }); await onRefresh(); notify(`${member.name} was removed.`); }
    catch (err) { notify(err.message, 'error'); }
  }
  return <Modal onClose={onClose}>
    <div className="modal-header"><div className="modal-icon icon-mint"><Users size={19} /></div><div><h2>Team members</h2><p>Good work is a team sport.</p></div><button className="icon-button modal-close" onClick={onClose}><X size={18} /></button></div>
    <div className="team-list">{board.members.map((member) => <div className="team-row" key={member.id}><Avatar name={member.name} /><div className="team-member-info"><strong>{member.name}</strong><span>{member.email}</span></div><span className={`role-pill ${member.role}`}>{member.role}</span>{board.role === 'owner' && member.role !== 'owner' && <button className="member-remove" title={`Remove ${member.name}`} onClick={() => removeMember(member)}><X size={15} /></button>}</div>)}</div>
    {board.role === 'owner' && <>
      <div className="form-divider"><span>INVITE SOMEONE</span></div>
      <form className="invite-form" onSubmit={invite}><label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" required maxLength={254} /></label><button className="primary-button" disabled={inviteBusy}>{inviteBusy ? 'Sending…' : 'Invite'} <UserPlus size={16} /></button></form>
      <p className="form-note">Existing accounts are added immediately. For new accounts, Orbit creates a link you can share.</p>
      {error && <div className="inline-error"><CircleAlert size={15} />{error}</div>}
      {inviteLink && <div className="invite-link-box"><div><strong>Invitation link ready</strong><p>Share this link with the invited person. It expires in 7 days.</p><input readOnly value={inviteLink} onFocus={(e) => e.target.select()} /></div><button className="secondary-button" onClick={() => { navigator.clipboard.writeText(inviteLink).then(() => notify('Invitation link copied.')).catch(() => notify('Select the link and copy it manually.', 'error')); }}><Command size={14} /> Copy link</button></div>}
      {board.pendingInvitations?.length > 0 && <div className="pending-invites"><strong>Pending invitations</strong>{board.pendingInvitations.map((invite) => <div key={invite.token}><Mail size={14} /><span>{invite.email}</span><button title="Copy invitation link" onClick={() => { const link = `${window.location.origin}/accept-invite/${invite.token}`; navigator.clipboard.writeText(link).then(() => notify('Invitation link copied.')).catch(() => window.prompt('Copy invitation link', link)); }}><Command size={14} /></button></div>)}</div>}
    </>}
  </Modal>;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('kanban-token'));
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [board, setBoard] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [toast, setToast] = useState(null);
  const [showActivity, setShowActivity] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [activeCard, setActiveCard] = useState(null);
  const [newCardColumnId, setNewCardColumnId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [filterLabel, setFilterLabel] = useState('all');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [draggingCard, setDraggingCard] = useState(null);
  const [columnsMenu, setColumnsMenu] = useState(false);
  const inviteToken = useMemo(() => window.location.pathname.match(/^\/accept-invite\/([a-f0-9]+)$/)?.[1] || null, []);
  const inviteHandled = useRef(false);
  const notify = useCallback((message, type = 'success') => setToast({ message, type, stamp: Date.now() }), []);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!token) { setUser(null); setAuthReady(true); return; }
    api('/auth/me').then(({ user: currentUser }) => { setUser(currentUser); setAuthReady(true); }).catch(() => {
      localStorage.removeItem('kanban-token'); setToken(null); setUser(null); setAuthReady(true);
    });
  }, [token]);

  const refreshProjects = useCallback(async () => {
    if (!user) return;
    setLoadingProjects(true);
    try {
      const data = await api('/projects');
      setProjects(data.projects);
      setSelectedProjectId((current) => current && data.projects.some((project) => project.id === current) ? current : data.projects[0]?.id ?? null);
    } catch (err) { notify(err.message, 'error'); }
    finally { setLoadingProjects(false); }
  }, [user, notify]);

  const refreshBoard = useCallback(async (quiet = false) => {
    if (!selectedProjectId || !user) { setBoard(null); return; }
    if (!quiet) setLoadingBoard(true);
    try {
      const data = await api(`/projects/${selectedProjectId}/board`);
      setBoard(data);
    } catch (err) { notify(err.message, 'error'); }
    finally { if (!quiet) setLoadingBoard(false); }
  }, [selectedProjectId, user, notify]);

  const refreshActivity = useCallback(async () => {
    if (!selectedProjectId || !user) { setActivity([]); return; }
    try { const data = await api(`/projects/${selectedProjectId}/activity`); setActivity(data.activity); }
    catch (err) { notify(err.message, 'error'); }
  }, [selectedProjectId, user, notify]);

  useEffect(() => { if (user) refreshProjects(); else { setProjects([]); setSelectedProjectId(null); setBoard(null); } }, [user, refreshProjects]);
  useEffect(() => { if (user && selectedProjectId) { refreshBoard(); refreshActivity(); } else setBoard(null); }, [user, selectedProjectId, refreshBoard, refreshActivity]);

  useEffect(() => {
    if (!user || !token || !inviteToken || inviteHandled.current) return;
    inviteHandled.current = true;
    api(`/invitations/${inviteToken}/accept`, { method: 'POST', body: {} }).then(async (result) => {
      window.history.replaceState({}, '', '/');
      setSelectedProjectId(result.projectId);
      notify(result.message || 'Invitation accepted.');
      await refreshProjects();
      await refreshBoard();
    }).catch((err) => { inviteHandled.current = false; notify(err.message, 'error'); });
  }, [user, token, inviteToken, notify, refreshProjects, refreshBoard]);

  function onAuth(result) {
    localStorage.setItem('kanban-token', result.token);
    setToken(result.token);
    setUser(result.user);
  }

  function logout() {
    localStorage.removeItem('kanban-token');
    setToken(null); setUser(null); setBoard(null); setActivity([]); setShowActivity(false); setShowTeam(false);
    notify('You have signed out.');
  }

  async function createProject(input) {
    const result = await api('/projects', { method: 'POST', body: input });
    await refreshProjects();
    setSelectedProjectId(result.project.id);
    notify('Your new project is ready.');
  }

  async function refreshAll() {
    await Promise.all([refreshBoard(true), refreshActivity()]);
  }

  async function moveCard(card, targetColumn, beforeCardId) {
    setDraggingCard(null);
    if (!card || !targetColumn) return;
    try {
      await api(`/projects/${selectedProjectId}/cards/${card.id}/move`, {
        method: 'POST', body: { targetColumnId: targetColumn.id, beforeCardId: beforeCardId ?? null },
      });
      await refreshAll();
    } catch (err) { notify(err.message, 'error'); await refreshBoard(true); }
  }

  function handleCardDrop(event, targetColumn, targetCard = null) {
    event.preventDefault(); event.stopPropagation();
    if (!draggingCard || (targetCard && targetCard.id === draggingCard.card.id)) return;
    let beforeCardId = null;
    if (targetCard) {
      const remaining = targetColumn.cards.filter((card) => card.id !== draggingCard.card.id);
      const targetIndex = remaining.findIndex((card) => card.id === targetCard.id);
      if (targetIndex < 0) { setDraggingCard(null); return; }
      const rect = event.currentTarget.getBoundingClientRect();
      const droppingAfter = event.clientY > rect.top + rect.height / 2;
      beforeCardId = droppingAfter ? (remaining[targetIndex + 1]?.id ?? null) : targetCard.id;
    }
    moveCard(draggingCard.card, targetColumn, beforeCardId);
  }

  const allCards = useMemo(() => (board?.columns || []).flatMap((column) => column.cards.map((card) => ({ ...card, columnName: column.name }))), [board]);
  const allLabels = useMemo(() => [...new Set(allCards.flatMap((card) => card.labels || []))].sort((a, b) => a.localeCompare(b)), [allCards]);
  const overdueCount = useMemo(() => allCards.filter((card) => card.dueDate && card.dueDate < new Date().toISOString().slice(0, 10) && card.columnName.toLowerCase() !== 'done').length, [allCards]);
  const visibleCount = useMemo(() => allCards.filter((card) => {
    const columnIsDone = card.columnName.toLowerCase() === 'done';
    if (search && !`${card.title} ${card.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterAssignee !== 'all' && String(card.assigneeId || '') !== filterAssignee) return false;
    if (filterLabel !== 'all' && !(card.labels || []).includes(filterLabel)) return false;
    if (onlyOverdue && !(card.dueDate && card.dueDate < new Date().toISOString().slice(0, 10) && !columnIsDone)) return false;
    return true;
  }).length, [allCards, search, filterAssignee, filterLabel, onlyOverdue]);

  async function addColumn() {
    const name = window.prompt('Name your new column');
    if (!name || !name.trim()) return;
    try { await api(`/projects/${selectedProjectId}/columns`, { method: 'POST', body: { name: name.trim() } }); await refreshBoard(true); await refreshActivity(); notify('Column added.'); }
    catch (err) { notify(err.message, 'error'); }
  }

  async function renameColumn(column) {
    const name = window.prompt('Rename column', column.name);
    if (!name || !name.trim() || name.trim() === column.name) return;
    try { await api(`/projects/${selectedProjectId}/columns/${column.id}`, { method: 'PATCH', body: { name: name.trim() } }); await refreshAll(); notify('Column renamed.'); }
    catch (err) { notify(err.message, 'error'); }
  }

  async function deleteColumn(column) {
    if (!window.confirm(`Delete the empty “${column.name}” column?`)) return;
    try { await api(`/projects/${selectedProjectId}/columns/${column.id}`, { method: 'DELETE' }); await refreshAll(); notify('Column deleted.'); }
    catch (err) { notify(err.message, 'error'); }
  }

  async function nudgeColumn(index, direction) {
    if (!board) return;
    const ordered = [...board.columns];
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await api(`/projects/${selectedProjectId}/columns/reorder`, { method: 'PATCH', body: { orderedIds: ordered.map((column) => column.id) } });
      await refreshBoard(true);
    } catch (err) { notify(err.message, 'error'); }
  }

  if (!authReady) return <div className="loading-page"><div className="loading-mark"><Command size={23} /></div><span>Getting your workspace ready…</span></div>;
  if (!user) return <AuthScreen onAuth={onAuth} toast={toast} onToastClose={closeToast} />;

  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand brand-sidebar"><span className="brand-mark"><Command size={19} strokeWidth={2.6} /></span><span>orbit<span className="brand-period">.</span></span><span className="workspace-badge">WORKSPACE</span></div>
      <div className="workspace-switcher"><div className="workspace-avatar">O</div><div className="workspace-switch-text"><strong>Orbit Studio</strong><span>Free workspace</span></div><ChevronDown size={15} /></div>
      <nav className="sidebar-nav">
        <div className="nav-section-title">WORKSPACE <button className="tiny-add" onClick={() => setShowProjectModal(true)} title="Create project"><Plus size={14} /></button></div>
        <button className="nav-item active"><LayoutGrid size={17} /><span>Boards</span><span className="nav-count">{projects.length}</span></button>
        <button className="nav-item" onClick={() => setShowActivity(!showActivity)}><Activity size={17} /><span>Activity</span></button>
        <button className="nav-item" onClick={() => setShowTeam(true)}><Users size={17} /><span>People</span><span className="nav-count">{board?.members?.length || 0}</span></button>
        <div className="nav-section-title project-label-title">YOUR PROJECTS <button className="tiny-add" onClick={() => setShowProjectModal(true)} title="Create project"><Plus size={14} /></button></div>
        <div className="project-nav-list">
          {projects.map((project) => <button key={project.id} className={`project-nav-item ${project.id === selectedProjectId ? 'selected' : ''}`} onClick={() => { setSelectedProjectId(project.id); setShowActivity(false); }}><span className={`project-icon project-icon-${project.id % 4}`}><FolderKanban size={15} /></span><span className="project-nav-name">{project.name}</span><span className="project-task-count">{project.cardCount}</span></button>)}
          {projects.length === 0 && !loadingProjects && <p className="empty-project-list">Your first project<br />starts here.</p>}
        </div>
        <button className="new-project-link" onClick={() => setShowProjectModal(true)}><Plus size={15} /> New project</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={15} /></div><div><strong>Small steps add up.</strong><p>Keep moving one card at a time.</p></div></div>
        <div className="sidebar-user"><Avatar name={user.name} /><div className="sidebar-user-info"><strong>{user.name}</strong><span>{user.email}</span></div><button className="sidebar-logout" onClick={logout} title="Sign out"><LogOut size={16} /></button></div>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><span className="crumb-current">Boards</span>{selectedProject && <><ChevronRight size={14} /><strong>{selectedProject.name}</strong></>}</div><div className="topbar-actions"><div className="secure-pill"><span /> All changes saved</div><button className="top-icon-button" onClick={() => setShowActivity(true)} title="Open activity"><Bell size={17} /><i /></button><button className="help-button" onClick={() => window.alert('Tip: drag a task card onto another card or column to move it. Open a card to edit details or add comments. Owners can manage the team and columns.')} title="Quick tips">?<span>Help</span></button></div></header>

      {selectedProject && board ? <>
        <section className="board-intro">
          <div className="board-title-block"><div className="project-kicker"><span className="project-kicker-dot" /> PROJECT BOARD <span className="project-kicker-sep">/</span> {String(board.columns.length).padStart(2, '0')} COLUMNS</div><div className="title-line"><h1>{board.project.name}</h1><span className="project-private"><LockKeyhole size={12} /> Private</span></div><p className="board-description">{board.project.description || 'A shared space to keep the work moving.'}</p></div>
          <div className="board-title-actions"><div className="avatar-stack">{board.members.slice(0, 4).map((member) => <Avatar key={member.id} name={member.name} title={`${member.name} · ${member.role}`} />)}{board.members.length > 4 && <span className="avatar avatar-more">+{board.members.length - 4}</span>}</div><button className="secondary-button invite-short" onClick={() => setShowTeam(true)}><UserPlus size={15} /> Invite</button><span className="title-action-divider" /><button className={`outline-button ${showActivity ? 'outline-button-selected' : ''}`} onClick={() => setShowActivity(!showActivity)}><Activity size={15} /> Activity <span className="activity-live-dot" /></button><button className="primary-button create-task-top" onClick={() => { setNewCardColumnId(board.columns[0]?.id); setActiveCard(null); }}><Plus size={16} /> New task</button></div>
        </section>

        <section className="board-toolbar"><div className="board-filters"><label className="search-box"><Search size={16} /><input aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} /><kbd>⌘ K</kbd></label><span className="toolbar-divider" /><div className="filter-select-wrap"><Users size={15} /><select aria-label="Filter by assignee" value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}><option value="all">All assignees</option>{board.members.map((member) => <option key={member.id} value={String(member.id)}>{member.name}</option>)}</select><ChevronDown size={13} /></div><div className="filter-select-wrap"><ListFilter size={15} /><select aria-label="Filter by label" value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)}><option value="all">All labels</option>{allLabels.map((label) => <option key={label} value={label}>{label}</option>)}</select><ChevronDown size={13} /></div><button className={`overdue-filter ${onlyOverdue ? 'overdue-filter-active' : ''}`} onClick={() => setOnlyOverdue(!onlyOverdue)}><Clock3 size={14} /> Overdue{overdueCount > 0 && <span>{overdueCount}</span>}</button></div><div className="board-toolbar-right"><span className="visible-count">{visibleCount} of {allCards.length} tasks</span><button className={`icon-button ${columnsMenu ? 'icon-button-active' : ''}`} title="Column options" onClick={() => setColumnsMenu(!columnsMenu)}><Settings2 size={17} /></button>{columnsMenu && <div className="columns-popover"><strong>Manage columns</strong><p>Owners can rename or remove empty columns. Use the arrows on each column to reorder.</p><button onClick={() => { setColumnsMenu(false); addColumn(); }}><Plus size={15} /> Add a column</button></div>}</div></section>

        <div className={`board-and-activity ${showActivity ? 'with-activity' : ''}`}>
          <section className="board-scroll-area" aria-label="Kanban board">
            {loadingBoard && <div className="board-loading"><span className="spinner" /> Syncing board…</div>}
            <div className="kanban-board" style={{ '--column-count': board.columns.length }}>
              {board.columns.map((column, index) => {
                const visibleCards = column.cards.filter((card) => {
                  if (search && !`${card.title} ${card.description}`.toLowerCase().includes(search.toLowerCase())) return false;
                  if (filterAssignee !== 'all' && String(card.assigneeId || '') !== filterAssignee) return false;
                  if (filterLabel !== 'all' && !(card.labels || []).includes(filterLabel)) return false;
                  if (onlyOverdue && !(card.dueDate && card.dueDate < new Date().toISOString().slice(0, 10) && column.name.toLowerCase() !== 'done')) return false;
                  return true;
                });
                return <section className="kanban-column" key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleCardDrop(event, column)}>
                  <header className="column-header"><div className="column-title-group"><span className={`column-indicator indicator-${index % 4}`} /><h2>{column.name}</h2><span className="column-count">{visibleCards.length}</span></div><div className="column-actions"><button className="column-icon-action" onClick={() => { setNewCardColumnId(column.id); setActiveCard(null); }} title={`Add task to ${column.name}`}><Plus size={16} /></button>{board.role === 'owner' && <button className="column-icon-action column-menu-button" title="Column options" onClick={() => { const action = window.prompt(`Column “${column.name}”\nType: rename, delete, or cancel`, 'rename'); if (action?.toLowerCase() === 'rename') renameColumn(column); if (action?.toLowerCase() === 'delete') deleteColumn(column); }}><MoreHorizontal size={17} /></button>}</div></header>
                  <div className="column-subhead"><span>{index === 0 ? 'UP NEXT' : index === board.columns.length - 1 ? 'COMPLETED WORK' : 'IN MOTION'}</span>{index === board.columns.length - 1 && <CheckCircle2 size={13} />}</div>
                  <div className={`column-cards ${draggingCard ? 'column-drag-active' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleCardDrop(event, column)}>
                    {visibleCards.map((card) => <Card key={card.id} card={card} column={column} isDragging={draggingCard?.card.id === card.id} onOpen={(item, columnId) => { setActiveCard(item); setNewCardColumnId(columnId); }} onDragStart={(event, item, sourceColumn) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(item.id)); setDraggingCard({ card: item, column: sourceColumn }); }} onDragEnd={() => setDraggingCard(null)} onDrop={handleCardDrop} />)}
                    {visibleCards.length === 0 && <div className={`column-empty ${draggingCard ? 'column-empty-drag' : ''}`}><div className="empty-symbol">{draggingCard ? <ArrowDownUp size={18} /> : index === board.columns.length - 1 ? <CheckCircle2 size={18} /> : <Sparkles size={17} />}</div><span>{draggingCard ? 'Drop to move here' : search || filterAssignee !== 'all' || filterLabel !== 'all' || onlyOverdue ? 'No matching tasks' : 'Nothing here just yet'}</span></div>}
                  </div>
                  <button className="add-card-button" onClick={() => { setNewCardColumnId(column.id); setActiveCard(null); }}><Plus size={15} /> Add a task</button>
                  {board.role === 'owner' && <div className="column-reorder"><button disabled={index === 0} title="Move column left" onClick={() => nudgeColumn(index, -1)}><ChevronLeft size={12} /> Move left</button><button disabled={index === board.columns.length - 1} title="Move column right" onClick={() => nudgeColumn(index, 1)}>Move right <ChevronRight size={12} /></button></div>}
                </section>;
              })}
              {board.role === 'owner' && <button className="add-column-tile" onClick={addColumn}><span><Plus size={17} /></span><strong>Add column</strong><small>Shape your workflow</small></button>}
            </div>
            <div className="board-bottom-note"><span><ShieldCheck size={14} /> Private to this team</span><span>Drag cards to update their status <ArrowRight size={13} /></span></div>
          </section>
          {showActivity && <ActivityPanel activity={activity} onClose={() => setShowActivity(false)} />}
        </div>
      </> : <section className="empty-workspace"><div className="empty-workspace-art"><div className="empty-art-card"><span /><span /><span /></div><div className="empty-art-card empty-art-card-two"><span /><span /></div><div className="empty-art-check"><Check size={24} /></div></div><span className="eyebrow eyebrow-muted">A FRESH START</span><h1>{projects.length ? 'Choose a project to begin' : 'Make room for good work.'}</h1><p>{projects.length ? 'Select a project from the sidebar to open its board.' : 'Create your first project, add your teammates, and turn the big things into small, movable steps.'}</p><button className="primary-button" onClick={() => setShowProjectModal(true)}><Plus size={16} /> Create your first project</button></section>}
    </main>

    {showProjectModal && <ProjectModal onClose={() => setShowProjectModal(false)} onCreate={createProject} />}
    {showTeam && board && <TeamModal projectId={selectedProjectId} board={board} onClose={() => setShowTeam(false)} onRefresh={async () => { await refreshBoard(true); await refreshActivity(); await refreshProjects(); }} notify={notify} />}
    {(activeCard || newCardColumnId) && board && <CardModal key={activeCard?.id || `new-${newCardColumnId}`} card={activeCard} projectId={selectedProjectId} defaultColumnId={newCardColumnId} columns={board.columns} members={board.members} onClose={() => { setActiveCard(null); setNewCardColumnId(null); }} onSaved={async () => { await refreshBoard(true); await refreshActivity(); await refreshProjects(); }} notify={notify} />}
    <Toast toast={toast} onClose={closeToast} />
  </div>;
}

function EyeIcon() { return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>; }
function EyeOffIcon() { return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 3 18 18M10.6 6.2A10.6 10.6 0 0 1 12 6c6.2 0 9.5 6 9.5 6a15.8 15.8 0 0 1-3 3.5M6.2 6.3C3.8 8 2.5 12 2.5 12s3.3 6 9.5 6c1 0 1.9-.2 2.8-.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>; }

export default App;

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const packageJson = require('./package.json');

const APP_USERNAME = process.env.APP_USERNAME || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || 'verhuizen2026';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PORT = process.env.PORT || 3000;

const APP_VERSION = packageJson.version;

// Changelog: bij elke functionele wijziging hier een nieuwe regel bovenaan toevoegen
// en de version in package.json ophogen. Wordt getoond in de app via /api/version.
const CHANGELOG = [
  { version: '0.0.11', wijzigingen: ['Visuele fix: het label "Labels" op de to-do-pagina overlapte met het invoerveld erboven.'] },
  { version: '0.0.10', wijzigingen: ['To-do\'s kunnen nu ook labels met icoon krijgen; deze worden automatisch meegenomen bij het inplannen op de tijdlijn.'] },
  { version: '0.0.9', wijzigingen: ['Nieuwe To-do-pagina: losse taken vastleggen en met één klik inplannen op de tijdlijn.'] },
  { version: '0.0.8', wijzigingen: ['Versiebeheer: het versienummer en de changelog zijn nu zichtbaar in de app voor ingelogde gebruikers.'] },
  { version: '0.0.7', wijzigingen: ['Labels met eigen icoon: aanmaken, bewerken en verwijderen via Beheer, koppelen aan één of meerdere klussen.'] },
  { version: '0.0.6', wijzigingen: ['Personen toevoegen via Beheer en aan klussen koppelen, zichtbaar als gekleurde initialen op de balk.'] },
  { version: '0.0.5', wijzigingen: ['Instelbaar tijdlijnbereik via Beheer (vanaf/tot datum).'] },
  { version: '0.0.4', wijzigingen: ['Hover-tooltip met details en notities; klik op een balk om een klus te bewerken.'] },
  { version: '0.0.3', wijzigingen: ['Gebruikersbeheer met rollen (beheerder/gebruiker), aanpasbare legenda/categorieën, weeknummers bij elke maandag.'] },
  { version: '0.0.2', wijzigingen: ['Eerste versie: inlogpagina, sleepbare tijdlijn, Docker-container.'] }
];

const DATA_DIR = path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PEOPLE_FILE = path.join(DATA_DIR, 'people.json');
const LABELS_FILE = path.join(DATA_DIR, 'labels.json');
const TODOS_FILE = path.join(DATA_DIR, 'todos.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(PEOPLE_FILE)) fs.writeFileSync(PEOPLE_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(LABELS_FILE)) fs.writeFileSync(LABELS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(TODOS_FILE)) fs.writeFileSync(TODOS_FILE, JSON.stringify([], null, 2));

const DEFAULT_SETTINGS = { rangeStart: null, rangeEnd: null };
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
}

const DEFAULT_CATEGORIES = [
  { id: 'verhuizen', naam: 'Verhuizen', kleur: '#1F3A5F' },
  { id: 'klussen', naam: 'Klussen', kleur: '#E3A72E' },
  { id: 'inpakken', naam: 'Inpakken', kleur: '#7C9473' },
  { id: 'administratie', naam: 'Administratie', kleur: '#A85C43' },
  { id: 'overig', naam: 'Overig', kleur: '#8A8578' }
];
if (!fs.existsSync(CATEGORIES_FILE)) {
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(DEFAULT_CATEGORIES, null, 2));
}

// ---------- Wachtwoord hashing (geen extra dependency nodig) ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const suppliedBuffer = crypto.scryptSync(password, salt, 64);
  return hashBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(hashBuffer, suppliedBuffer);
}

if (!fs.existsSync(USERS_FILE)) {
  const initialAdmin = {
    id: crypto.randomUUID(),
    username: APP_USERNAME,
    password: hashPassword(APP_PASSWORD),
    role: 'admin',
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(USERS_FILE, JSON.stringify([initialAdmin], null, 2));
  console.log(`Eerste beheerder aangemaakt: ${APP_USERNAME} (wachtwoord via APP_PASSWORD env var)`);
}

// ---------- Simpele bestandsopslag ----------
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
}
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const readTasks = () => readJSON(TASKS_FILE);
const writeTasks = (t) => writeJSON(TASKS_FILE, t);
const readUsers = () => readJSON(USERS_FILE);
const writeUsers = (u) => writeJSON(USERS_FILE, u);
const readCategories = () => readJSON(CATEGORIES_FILE);
const writeCategories = (c) => writeJSON(CATEGORIES_FILE, c);
const readPeople = () => readJSON(PEOPLE_FILE);
const writePeople = (p) => writeJSON(PEOPLE_FILE, p);
const readLabels = () => readJSON(LABELS_FILE);
const writeLabels = (l) => writeJSON(LABELS_FILE, l);
const readTodos = () => readJSON(TODOS_FILE);
const writeTodos = (t) => writeJSON(TODOS_FILE, t);
const readSettings = () => {
  const s = readJSON(SETTINGS_FILE);
  return Array.isArray(s) ? { ...DEFAULT_SETTINGS } : { ...DEFAULT_SETTINGS, ...s };
};
const writeSettings = (s) => writeJSON(SETTINGS_FILE, s);

function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt };
}

const app = express();
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 14 }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Niet ingelogd' });
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Alleen beheerders mogen dit' });
}

// ---- Auth routes ----
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user || !verifyPassword(password || '', user.password)) {
    return res.status(401).json({ error: 'Gebruikersnaam of wachtwoord klopt niet' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  res.json({ ok: true, role: user.role });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!(req.session && req.session.userId)) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, username: req.session.username, role: req.session.role });
});

app.get('/api/version', requireAuth, (req, res) => {
  res.json({ version: APP_VERSION, changelog: CHANGELOG });
});

// ---- Taken API (admin + gebruiker) ----
app.get('/api/tasks', requireAuth, (req, res) => res.json(readTasks()));

app.post('/api/tasks', requireAuth, (req, res) => {
  const { titel, categorie, start, eind, notities, toegewezenAan, labels } = req.body || {};
  if (!titel || !start || !eind) {
    return res.status(400).json({ error: 'Titel, startdatum en einddatum zijn verplicht' });
  }
  const tasks = readTasks();
  const task = {
    id: crypto.randomUUID(),
    titel: String(titel).slice(0, 200),
    categorie: categorie || 'overig',
    start, eind,
    notities: notities || '',
    toegewezenAan: Array.isArray(toegewezenAan) ? toegewezenAan.filter(x => typeof x === 'string') : [],
    labels: Array.isArray(labels) ? labels.filter(x => typeof x === 'string') : [],
    status: 'open',
    createdBy: req.session.username,
    createdAt: new Date().toISOString()
  };
  tasks.push(task);
  writeTasks(tasks);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', requireAuth, (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Taak niet gevonden' });
  const allowed = ['titel', 'categorie', 'start', 'eind', 'notities', 'status', 'toegewezenAan', 'labels'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if ((key === 'toegewezenAan' || key === 'labels') && !Array.isArray(req.body[key])) continue;
      tasks[idx][key] = req.body[key];
    }
  }
  writeTasks(tasks);
  res.json(tasks[idx]);
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  let tasks = readTasks();
  const before = tasks.length;
  tasks = tasks.filter(t => t.id !== req.params.id);
  if (tasks.length === before) return res.status(404).json({ error: 'Taak niet gevonden' });
  writeTasks(tasks);
  res.json({ ok: true });
});

// ---- Categorieën / legenda (iedereen leest, alleen admin schrijft) ----
app.get('/api/categories', requireAuth, (req, res) => res.json(readCategories()));

app.post('/api/categories', requireAuth, requireAdmin, (req, res) => {
  const { naam, kleur } = req.body || {};
  if (!naam || !kleur || !/^#[0-9a-fA-F]{6}$/.test(kleur)) {
    return res.status(400).json({ error: 'Naam en een geldige kleur (#rrggbb) zijn verplicht' });
  }
  const categories = readCategories();
  const cat = { id: crypto.randomUUID(), naam: String(naam).slice(0, 60), kleur };
  categories.push(cat);
  writeCategories(categories);
  res.status(201).json(cat);
});

app.put('/api/categories/:id', requireAuth, requireAdmin, (req, res) => {
  const categories = readCategories();
  const idx = categories.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Categorie niet gevonden' });
  const { naam, kleur } = req.body || {};
  if (naam !== undefined) categories[idx].naam = String(naam).slice(0, 60);
  if (kleur !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(kleur)) return res.status(400).json({ error: 'Ongeldige kleur' });
    categories[idx].kleur = kleur;
  }
  writeCategories(categories);
  res.json(categories[idx]);
});

app.delete('/api/categories/:id', requireAuth, requireAdmin, (req, res) => {
  let categories = readCategories();
  const before = categories.length;
  categories = categories.filter(c => c.id !== req.params.id);
  if (categories.length === before) return res.status(404).json({ error: 'Categorie niet gevonden' });
  if (categories.length === 0) return res.status(400).json({ error: 'Er moet minstens 1 categorie overblijven' });
  writeCategories(categories);
  res.json({ ok: true });
});

// ---- Personen (voor toewijzing aan klussen; iedereen leest, alleen admin schrijft) ----
app.get('/api/people', requireAuth, (req, res) => res.json(readPeople()));

app.post('/api/people', requireAuth, requireAdmin, (req, res) => {
  const { naam, kleur } = req.body || {};
  if (!naam) return res.status(400).json({ error: 'Naam is verplicht' });
  if (kleur !== undefined && kleur !== '' && !/^#[0-9a-fA-F]{6}$/.test(kleur)) {
    return res.status(400).json({ error: 'Ongeldige kleur' });
  }
  const people = readPeople();
  const person = {
    id: crypto.randomUUID(),
    naam: String(naam).slice(0, 60),
    kleur: kleur || '#1F3A5F'
  };
  people.push(person);
  writePeople(people);
  res.status(201).json(person);
});

app.put('/api/people/:id', requireAuth, requireAdmin, (req, res) => {
  const people = readPeople();
  const idx = people.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Persoon niet gevonden' });
  const { naam, kleur } = req.body || {};
  if (naam !== undefined) people[idx].naam = String(naam).slice(0, 60);
  if (kleur !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(kleur)) return res.status(400).json({ error: 'Ongeldige kleur' });
    people[idx].kleur = kleur;
  }
  writePeople(people);
  res.json(people[idx]);
});

app.delete('/api/people/:id', requireAuth, requireAdmin, (req, res) => {
  let people = readPeople();
  const before = people.length;
  people = people.filter(p => p.id !== req.params.id);
  if (people.length === before) return res.status(404).json({ error: 'Persoon niet gevonden' });
  writePeople(people);

  // Verwijder deze persoon ook uit alle klussen waar hij/zij aan toegewezen was
  const tasks = readTasks();
  let touched = false;
  tasks.forEach(t => {
    if (Array.isArray(t.toegewezenAan) && t.toegewezenAan.includes(req.params.id)) {
      t.toegewezenAan = t.toegewezenAan.filter(id => id !== req.params.id);
      touched = true;
    }
  });
  if (touched) writeTasks(tasks);

  res.json({ ok: true });
});

// ---- Labels (met icoon; iedereen leest, alleen admin schrijft) ----
function limitIcon(s) {
  // Splitst op Unicode-codepoints (niet UTF-16-eenheden), zodat emoji met
  // huidskleur, vlaggen of ZWJ-reeksen (bv. 👨‍👩‍👧) niet middenin afbreken.
  const codepoints = Array.from(String(s || '').trim());
  const joined = codepoints.slice(0, 16).join('');
  return joined || '🏷️';
}

app.get('/api/labels', requireAuth, (req, res) => res.json(readLabels()));

app.post('/api/labels', requireAuth, requireAdmin, (req, res) => {
  const { naam, icoon, kleur } = req.body || {};
  if (!naam) return res.status(400).json({ error: 'Naam is verplicht' });
  if (kleur !== undefined && kleur !== '' && !/^#[0-9a-fA-F]{6}$/.test(kleur)) {
    return res.status(400).json({ error: 'Ongeldige kleur' });
  }
  const labels = readLabels();
  const label = {
    id: crypto.randomUUID(),
    naam: String(naam).slice(0, 40),
    icoon: limitIcon(icoon),
    kleur: kleur || '#1F3A5F'
  };
  labels.push(label);
  writeLabels(labels);
  res.status(201).json(label);
});

app.put('/api/labels/:id', requireAuth, requireAdmin, (req, res) => {
  const labels = readLabels();
  const idx = labels.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Label niet gevonden' });
  const { naam, icoon, kleur } = req.body || {};
  if (naam !== undefined) labels[idx].naam = String(naam).slice(0, 40);
  if (icoon !== undefined) labels[idx].icoon = limitIcon(icoon);
  if (kleur !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(kleur)) return res.status(400).json({ error: 'Ongeldige kleur' });
    labels[idx].kleur = kleur;
  }
  writeLabels(labels);
  res.json(labels[idx]);
});

app.delete('/api/labels/:id', requireAuth, requireAdmin, (req, res) => {
  let labels = readLabels();
  const before = labels.length;
  labels = labels.filter(l => l.id !== req.params.id);
  if (labels.length === before) return res.status(404).json({ error: 'Label niet gevonden' });
  writeLabels(labels);

  // Verwijder dit label ook van alle klussen waar het aan hing
  const tasks = readTasks();
  let touched = false;
  tasks.forEach(t => {
    if (Array.isArray(t.labels) && t.labels.includes(req.params.id)) {
      t.labels = t.labels.filter(id => id !== req.params.id);
      touched = true;
    }
  });
  if (touched) writeTasks(tasks);

  // Verwijder dit label ook van alle to-do's waar het aan hing
  const todos = readTodos();
  let todosTouched = false;
  todos.forEach(t => {
    if (Array.isArray(t.labels) && t.labels.includes(req.params.id)) {
      t.labels = t.labels.filter(id => id !== req.params.id);
      todosTouched = true;
    }
  });
  if (todosTouched) writeTodos(todos);

  res.json({ ok: true });
});

// ---- To-do's (losse takenlijst, admin + gebruiker) ----
app.get('/api/todos', requireAuth, (req, res) => res.json(readTodos()));

app.post('/api/todos', requireAuth, (req, res) => {
  const { tekst, labels } = req.body || {};
  if (!tekst || !String(tekst).trim()) return res.status(400).json({ error: 'Tekst is verplicht' });
  const todos = readTodos();
  const todo = {
    id: crypto.randomUUID(),
    tekst: String(tekst).trim().slice(0, 300),
    labels: Array.isArray(labels) ? labels.filter(x => typeof x === 'string') : [],
    klaar: false,
    taskId: null,
    createdBy: req.session.username,
    createdAt: new Date().toISOString()
  };
  todos.push(todo);
  writeTodos(todos);
  res.status(201).json(todo);
});

app.put('/api/todos/:id', requireAuth, (req, res) => {
  const todos = readTodos();
  const idx = todos.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'To-do niet gevonden' });
  const { tekst, klaar, taskId, labels } = req.body || {};
  if (tekst !== undefined) todos[idx].tekst = String(tekst).trim().slice(0, 300);
  if (klaar !== undefined) todos[idx].klaar = !!klaar;
  if (taskId !== undefined) todos[idx].taskId = taskId;
  if (labels !== undefined && Array.isArray(labels)) todos[idx].labels = labels.filter(x => typeof x === 'string');
  writeTodos(todos);
  res.json(todos[idx]);
});

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  let todos = readTodos();
  const before = todos.length;
  todos = todos.filter(t => t.id !== req.params.id);
  if (todos.length === before) return res.status(404).json({ error: 'To-do niet gevonden' });
  writeTodos(todos);
  res.json({ ok: true });
});

// ---- Tijdlijninstellingen (iedereen leest, alleen admin schrijft) ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get('/api/settings', requireAuth, (req, res) => {
  res.json(readSettings());
});

app.put('/api/settings', requireAuth, requireAdmin, (req, res) => {
  const { rangeStart, rangeEnd } = req.body || {};
  const settings = readSettings();

  for (const [key, val] of [['rangeStart', rangeStart], ['rangeEnd', rangeEnd]]) {
    if (val === undefined) continue;
    if (val === null || val === '') { settings[key] = null; continue; }
    if (!DATE_RE.test(val)) {
      return res.status(400).json({ error: 'Datum moet het formaat JJJJ-MM-DD hebben' });
    }
    settings[key] = val;
  }
  if (settings.rangeStart && settings.rangeEnd && settings.rangeEnd < settings.rangeStart) {
    return res.status(400).json({ error: 'Einddatum ligt voor de startdatum' });
  }
  writeSettings(settings);
  res.json(settings);
});

// ---- Gebruikersbeheer (alleen admin) ----
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  res.json(readUsers().map(publicUser));
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'Gebruikersnaam en een wachtwoord van minstens 6 tekens zijn verplicht' });
  }
  if (!['admin', 'gebruiker'].includes(role)) {
    return res.status(400).json({ error: 'Rol moet admin of gebruiker zijn' });
  }
  const users = readUsers();
  if (users.some(u => u.username.toLowerCase() === String(username).toLowerCase())) {
    return res.status(400).json({ error: 'Deze gebruikersnaam bestaat al' });
  }
  const user = {
    id: crypto.randomUUID(),
    username: String(username).trim().slice(0, 60),
    password: hashPassword(password),
    role,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeUsers(users);
  res.status(201).json(publicUser(user));
});

app.put('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  const { role, password } = req.body || {};
  const admins = users.filter(u => u.role === 'admin');

  if (role !== undefined) {
    if (!['admin', 'gebruiker'].includes(role)) return res.status(400).json({ error: 'Ongeldige rol' });
    if (users[idx].role === 'admin' && role !== 'admin' && admins.length <= 1) {
      return res.status(400).json({ error: 'Er moet minstens 1 beheerder overblijven' });
    }
    users[idx].role = role;
  }
  if (password !== undefined) {
    if (password.length < 6) return res.status(400).json({ error: 'Wachtwoord moet minstens 6 tekens zijn' });
    users[idx].password = hashPassword(password);
  }
  writeUsers(users);
  res.json(publicUser(users[idx]));
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (req.params.id === req.session.userId) {
    return res.status(400).json({ error: 'Je kunt je eigen account niet verwijderen' });
  }
  const users = readUsers();
  const target = users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  const admins = users.filter(u => u.role === 'admin');
  if (target.role === 'admin' && admins.length <= 1) {
    return res.status(400).json({ error: 'Er moet minstens 1 beheerder overblijven' });
  }
  writeUsers(users.filter(u => u.id !== req.params.id));
  res.json({ ok: true });
});

// ---- Pagina's ----
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));

app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/planner');
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/planner', (req, res) => {
  if (!(req.session && req.session.userId)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public/planner.html'));
});

app.get('/todo', (req, res) => {
  if (!(req.session && req.session.userId)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public/todo.html'));
});

app.get('/admin', (req, res) => {
  if (!(req.session && req.session.userId)) return res.redirect('/');
  if (req.session.role !== 'admin') return res.redirect('/planner');
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

app.listen(PORT, () => {
  console.log(`Verhuisplanner draait op poort ${PORT}`);
});

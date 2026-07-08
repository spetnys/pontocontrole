import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const siteUrl = process.env.SITE_URL || 'https://adegaweb.com.br';
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../data');
const staticDir = process.env.STATIC_DIR || path.resolve(__dirname, '../dist');
const storeFile = path.join(dataDir, 'ponto-controle.json');
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const storeBackend = databaseUrl ? 'postgres' : 'file';
const storeId = 'ponto-controle';
const { Pool } = pg;
const dbPool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.DATABASE_POOL_SIZE || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;
let dbReady = false;

const masterUser = String(process.env.MASTER_USER || process.env.ADMIN_USER || 'sheila').trim().toLowerCase();
const masterPassword = String(process.env.MASTER_PASSWORD || process.env.ADMIN_PASSWORD || 'ADMINISTRADOR');
const sessionHours = Number(process.env.SESSION_HOURS || 12);
const sessionCookieName = 'ponto_controle_session';
const cookieSecure = siteUrl.startsWith('https://');
const sessions = new Map();
const evolutionBaseUrl = String(process.env.EVOLUTION_BASE_URL || '').trim().replace(/\/+$/, '');
const evolutionManagerUrl = String(process.env.EVOLUTION_MANAGER_URL || '').trim().replace(/\/+$/, '');
const evolutionGlobalApiKey = String(process.env.EVOLUTION_GLOBAL_API_KEY || process.env.EVOLUTION_API_KEY || '').trim();

const modules = [
  'dashboard',
  'clients',
  'services',
  'resources',
  'activities',
  'agenda',
  'whatsapp',
  'finance',
  'reports',
  'users',
  'settings',
];
const actions = [
  'create',
  'edit',
  'delete',
  'markPaid',
  'attachFiles',
  'managePermissions',
  'inactivateServices',
  'linkServices',
  'changeServiceValues',
  'viewFinancialValues',
];
const activityStatuses = ['backlog', 'planned', 'doing', 'review', 'blocked', 'done'];
const financeStatuses = ['open', 'paid', 'overdue', 'cancelled'];
const agendaEventStatuses = ['scheduled', 'done', 'cancelled'];
const agendaRecurrences = ['none', 'weekly', 'biweekly', 'monthly'];
const servicePeriodicities = ['monthly', 'annual', 'one_time', 'project', 'recurring'];
const clientServiceStatuses = ['active', 'paused', 'cancelled', 'finished'];
const signupApprovalStatuses = ['pending', 'approved', 'rejected'];
const defaultMasterCompanyId = 'master-company-digital-docs';

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

function createId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function cleanText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function slugId(value, fallback = 'item') {
  return cleanText(value, fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || fallback;
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function cleanBoolean(value) {
  return value === true;
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item)).filter(Boolean))];
}

function onlyDigits(value) {
  return cleanText(value).replace(/\D/g, '');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function isPastDue(dueDate) {
  return cleanDate(dueDate) && dueDate < todayDate();
}

function defaultStore() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    settings: {
      defaultTheme: {
        palette: 'clean',
        accent: '#2563eb',
        surface: '#ffffff',
        text: '#111827',
      },
      loginImage: null,
      userTypes: [],
    },
    masterCompanies: [
      {
        id: defaultMasterCompanyId,
        name: 'Digital Docs',
        cnpj: '',
        contactName: '',
        email: '',
        phone: '',
        whatsappInstanceName: '',
        whatsappLastState: '',
        whatsappUpdatedAt: '',
        status: 'active',
        notes: 'Empresa master inicial dos dados já existentes.',
        createdAt: now,
        updatedAt: now,
      },
    ],
    users: [],
    passwordResets: [],
    clients: [],
    services: [],
    clientServices: [],
    resources: [],
    activities: [],
    agendaEvents: [],
    whatsappMessages: [],
    finances: [],
    salesRevenues: [],
  };
}

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function ensureDatabase() {
  if (!dbPool || dbReady) return;
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS app_store (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token text PRIMARY KEY,
      user_id text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await dbPool.query('CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions (user_id)');
  await dbPool.query('DELETE FROM app_sessions WHERE expires_at < now()');
  dbReady = true;
}

function normaliseStore(value) {
  const fallback = defaultStore();
  const store = value && typeof value === 'object' ? value : fallback;
  return {
    version: 1,
    createdAt: cleanText(store.createdAt, fallback.createdAt),
    updatedAt: cleanText(store.updatedAt, new Date().toISOString()),
    settings: store.settings && typeof store.settings === 'object' ? store.settings : fallback.settings,
    masterCompanies: Array.isArray(store.masterCompanies) ? store.masterCompanies : fallback.masterCompanies,
    users: Array.isArray(store.users) ? store.users : [],
    passwordResets: Array.isArray(store.passwordResets) ? store.passwordResets : [],
    clients: Array.isArray(store.clients) ? store.clients : fallback.clients,
    services: Array.isArray(store.services) ? store.services : fallback.services,
    clientServices: Array.isArray(store.clientServices) ? store.clientServices : fallback.clientServices,
    resources: Array.isArray(store.resources) ? store.resources : fallback.resources,
    activities: Array.isArray(store.activities) ? store.activities : fallback.activities,
    agendaEvents: Array.isArray(store.agendaEvents) ? store.agendaEvents : fallback.agendaEvents,
    whatsappMessages: Array.isArray(store.whatsappMessages) ? store.whatsappMessages : fallback.whatsappMessages,
    finances: Array.isArray(store.finances) ? store.finances : fallback.finances,
    salesRevenues: Array.isArray(store.salesRevenues) ? store.salesRevenues : fallback.salesRevenues,
  };
}

function systemUserTypes() {
  return [
    { id: 'team', label: 'Pessoa/equipe', system: true },
    { id: 'client', label: 'Cliente', system: true },
  ];
}

function cleanUserTypeOption(input = {}) {
  const label = cleanText(input.label || input.name).slice(0, 60);
  if (!label) return null;
  const id = slugId(input.id || label, 'tipo-usuario');
  if (['admin', 'master'].includes(id)) return null;
  return {
    id,
    label,
    system: Boolean(input.system && ['team', 'client'].includes(id)),
  };
}

function userTypeOptions(store = {}) {
  const customTypes = Array.isArray(store.settings?.userTypes) ? store.settings.userTypes : [];
  const options = [...systemUserTypes()];
  customTypes.forEach((item) => {
    const option = cleanUserTypeOption(item);
    if (!option || options.some((existing) => existing.id === option.id)) return;
    options.push({ ...option, system: false });
  });
  return options;
}

async function readStore() {
  if (dbPool) {
    await ensureDatabase();
    const result = await dbPool.query('SELECT data FROM app_store WHERE id = $1', [storeId]);
    if (!result.rowCount) {
      const data = defaultStore();
      await writeStore(data);
      return data;
    }
    const data = normaliseStore(result.rows[0].data);
    const normalised = !Array.isArray(result.rows[0].data?.agendaEvents);
    const migrated = ensureTenantMigration(data);
    const financeChanged = ensureCurrentFinanceReceivables(data);
    const postFinanceMigration = ensureTenantMigration(data);
    if (normalised || migrated || financeChanged || postFinanceMigration) {
      return await writeStore(data);
    }
    return data;
  }
  try {
    const parsed = JSON.parse(await fs.readFile(storeFile, 'utf8'));
    const data = normaliseStore(parsed);
    const normalised = !Array.isArray(parsed.agendaEvents);
    const migrated = ensureTenantMigration(data);
    const financeChanged = ensureCurrentFinanceReceivables(data);
    const postFinanceMigration = ensureTenantMigration(data);
    if (normalised || migrated || financeChanged || postFinanceMigration) {
      return await writeStore(data);
    }
    return data;
  } catch {
    const data = defaultStore();
    await writeStore(data);
    return data;
  }
}

async function writeStore(store) {
  const next = normaliseStore({ ...store, updatedAt: new Date().toISOString() });
  ensureTenantMigration(next);
  ensureCurrentFinanceReceivables(next);
  ensureTenantMigration(next);
  if (dbPool) {
    await ensureDatabase();
    await dbPool.query(
      `INSERT INTO app_store (id, data, created_at, updated_at)
       VALUES ($1, $2::jsonb, now(), now())
       ON CONFLICT (id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [storeId, JSON.stringify(next)],
    );
    return next;
  }
  await ensureDataDir();
  const tempFile = `${storeFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(next, null, 2), { mode: 0o600 });
  await fs.rename(tempFile, storeFile);
  await fs.chmod(storeFile, 0o600);
  return next;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(String(password), salt, 64);
  return `scrypt:${salt}:${Buffer.from(hash).toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('scrypt:')) return false;
  const [, salt, hash] = storedHash.split(':');
  const candidate = await scrypt(String(password), salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate));
}

function masterAccount(theme) {
  return {
    id: 'master',
    name: 'Administradora principal',
    email: masterUser,
    role: 'master',
    status: 'active',
    isMaster: true,
    masterCompanyId: '',
    userType: 'admin',
    permissions: {
      modules,
      actions,
      allClients: true,
      clientIds: [],
      multiMasterAccess: true,
      masterCompanyIds: [],
    },
    theme,
  };
}

function publicUser(user) {
  const safeUser = { ...user };
  delete safeUser.passwordHash;
  return safeUser;
}

function publicPasswordReset(reset) {
  return {
    id: reset.id,
    userId: reset.userId,
    userName: reset.userName,
    email: reset.email,
    masterCompanyId: reset.masterCompanyId,
    status: reset.status,
    code: reset.status === 'approved' ? reset.code : '',
    requestedAt: reset.requestedAt,
    reviewedAt: reset.reviewedAt,
    reviewedBy: reset.reviewedBy,
    expiresAt: reset.expiresAt,
    usedAt: reset.usedAt,
    rejectedAt: reset.rejectedAt,
  };
}

function publicSettings(store) {
  const image = store.settings?.loginImage?.dataUrl ? store.settings.loginImage : null;
  const updatedAt = image?.uploadedAt || '';
  return {
    loginImageUrl: image ? `/api/login-image?v=${encodeURIComponent(updatedAt || image.name || 'custom')}` : '/login-ponto-controle.png',
    loginImageName: image?.name || 'login-ponto-controle.png',
    loginImageUpdatedAt: updatedAt,
  };
}

function fileFromDataUrl(file) {
  const dataUrl = cleanText(file?.dataUrl);
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const type = cleanText(match[1], cleanText(file?.type, 'application/octet-stream'));
  const isBase64 = Boolean(match[2]);
  const body = match[3] || '';
  return {
    type,
    buffer: isBase64 ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body)),
  };
}

function isAdminRole(user) {
  const role = cleanText(user?.role).toLowerCase();
  return ['master', 'admin', 'administrador', 'administradora'].includes(role);
}

function cleanMasterCompany(input = {}, existing = {}) {
  const now = new Date().toISOString();
  return {
    id: existing.id || cleanText(input.id, createId('master-company')),
    name: cleanText(input.name, 'Empresa master sem nome').slice(0, 140),
    cnpj: cleanText(input.cnpj).slice(0, 24),
    contactName: cleanText(input.contactName).slice(0, 120),
    email: cleanText(input.email).toLowerCase().slice(0, 160),
    phone: cleanText(input.phone).slice(0, 60),
    whatsappInstanceName: cleanText(input.whatsappInstanceName, existing.whatsappInstanceName || '').slice(0, 80),
    whatsappLastState: cleanText(input.whatsappLastState, existing.whatsappLastState || '').slice(0, 40),
    whatsappUpdatedAt: cleanText(input.whatsappUpdatedAt, existing.whatsappUpdatedAt || '').slice(0, 40),
    status: ['active', 'inactive'].includes(input.status) ? input.status : existing.status || 'active',
    notes: cleanText(input.notes).slice(0, 500),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

function masterCompanyExists(store, masterCompanyId) {
  return (store.masterCompanies || []).some((company) => company.id === masterCompanyId);
}

function effectiveMasterCompanyId(store, user, requestedMasterCompanyId = '') {
  const requested = cleanText(requestedMasterCompanyId);
  if (user?.isMaster) {
    return masterCompanyExists(store, requested) ? requested : defaultMasterCompanyId;
  }
  if (requested && masterCompanyExists(store, requested) && canAccessMasterCompany(user, requested)) {
    return requested;
  }
  return cleanText(user?.masterCompanyId, defaultMasterCompanyId);
}

function userMasterCompanyIds(user) {
  const ids = new Set([cleanText(user?.masterCompanyId, defaultMasterCompanyId)]);
  if (cleanBoolean(user?.permissions?.multiMasterAccess)) {
    cleanList(user?.permissions?.masterCompanyIds).forEach((id) => ids.add(id));
  }
  return [...ids].filter(Boolean);
}

function canAccessMasterCompany(user, masterCompanyId) {
  if (user?.isMaster) return true;
  const target = cleanText(masterCompanyId, defaultMasterCompanyId);
  return userMasterCompanyIds(user).includes(target);
}

function ensureTenantMigration(store) {
  let changed = false;
  const now = new Date().toISOString();
  if (!Array.isArray(store.masterCompanies)) {
    store.masterCompanies = [];
    changed = true;
  }
  if (!store.masterCompanies.some((company) => company.id === defaultMasterCompanyId)) {
    store.masterCompanies.unshift({
      id: defaultMasterCompanyId,
      name: 'Digital Docs',
      cnpj: '',
      contactName: '',
      email: '',
      phone: '',
      whatsappInstanceName: '',
      whatsappLastState: '',
      whatsappUpdatedAt: '',
      status: 'active',
      notes: 'Empresa master inicial dos dados já existentes.',
      createdAt: now,
      updatedAt: now,
    });
    changed = true;
  }

  if (!Array.isArray(store.agendaEvents)) {
    store.agendaEvents = [];
    changed = true;
  }
  if (!Array.isArray(store.whatsappMessages)) {
    store.whatsappMessages = [];
    changed = true;
  }

  const validCompanyIds = new Set(store.masterCompanies.map((company) => company.id));
  store.masterCompanies = store.masterCompanies.map((company) => {
    const next = {
      ...company,
      whatsappInstanceName: cleanText(company.whatsappInstanceName),
      whatsappLastState: cleanText(company.whatsappLastState),
      whatsappUpdatedAt: cleanText(company.whatsappUpdatedAt),
    };
    if (
      company.whatsappInstanceName === next.whatsappInstanceName &&
      company.whatsappLastState === next.whatsappLastState &&
      company.whatsappUpdatedAt === next.whatsappUpdatedAt
    ) {
      return company;
    }
    changed = true;
    return next;
  });
  const companyIdForClient = (clientId) => {
    const client = store.clients?.find((item) => item.id === clientId);
    return validCompanyIds.has(client?.masterCompanyId) ? client.masterCompanyId : defaultMasterCompanyId;
  };
  const companyIdForService = (serviceId) => {
    const service = store.services?.find((item) => item.id === serviceId);
    return validCompanyIds.has(service?.masterCompanyId) ? service.masterCompanyId : defaultMasterCompanyId;
  };

  ['clients', 'services', 'resources'].forEach((collection) => {
    store[collection] = (store[collection] || []).map((item) => {
      if (validCompanyIds.has(item.masterCompanyId)) return item;
      changed = true;
      return { ...item, masterCompanyId: defaultMasterCompanyId, updatedAt: item.updatedAt || now };
    });
  });

  store.clientServices = (store.clientServices || []).map((item) => {
    const masterCompanyId = companyIdForClient(item.clientId) || companyIdForService(item.serviceId);
    const allowedResourceIds = new Set((store.resources || [])
      .filter((resource) => resource.masterCompanyId === masterCompanyId)
      .map((resource) => resource.id));
    const resourceIds = cleanList(item.resourceIds).filter((resourceId) => allowedResourceIds.has(resourceId));
    const ownerResourceId = allowedResourceIds.has(item.ownerResourceId) ? item.ownerResourceId : '';
    if (item.masterCompanyId === masterCompanyId && item.ownerResourceId === ownerResourceId && cleanList(item.resourceIds).join('|') === resourceIds.join('|')) return item;
    changed = true;
    return { ...item, masterCompanyId, ownerResourceId, resourceIds, updatedAt: item.updatedAt || now };
  });

  store.activities = (store.activities || []).map((item) => {
    const masterCompanyId = companyIdForClient(item.clientId);
    const allowedResourceIds = new Set((store.resources || [])
      .filter((resource) => resource.masterCompanyId === masterCompanyId)
      .map((resource) => resource.id));
    const resourceIds = cleanList(item.resourceIds).filter((resourceId) => allowedResourceIds.has(resourceId));
    if (item.masterCompanyId === masterCompanyId && cleanList(item.resourceIds).join('|') === resourceIds.join('|')) return item;
    changed = true;
    return { ...item, masterCompanyId, resourceIds, updatedAt: item.updatedAt || now };
  });

  store.agendaEvents = (store.agendaEvents || []).map((item) => {
    const masterCompanyId = item.clientId ? companyIdForClient(item.clientId) : validCompanyIds.has(item.masterCompanyId) ? item.masterCompanyId : defaultMasterCompanyId;
    const allowedResourceIds = new Set((store.resources || [])
      .filter((resource) => resource.masterCompanyId === masterCompanyId)
      .map((resource) => resource.id));
    const resourceIds = cleanList(item.resourceIds).filter((resourceId) => allowedResourceIds.has(resourceId));
    if (item.masterCompanyId === masterCompanyId && cleanList(item.resourceIds).join('|') === resourceIds.join('|')) return item;
    changed = true;
    return { ...item, masterCompanyId, resourceIds, updatedAt: item.updatedAt || now };
  });

  store.finances = (store.finances || []).map((item) => {
    const masterCompanyId = companyIdForClient(item.clientId);
    if (item.masterCompanyId === masterCompanyId) return item;
    changed = true;
    return { ...item, masterCompanyId, updatedAt: item.updatedAt || now };
  });

  store.whatsappMessages = (store.whatsappMessages || []).map((item) => {
    const masterCompanyId = validCompanyIds.has(item.masterCompanyId) ? item.masterCompanyId : defaultMasterCompanyId;
    if (item.masterCompanyId === masterCompanyId) return item;
    changed = true;
    return { ...item, masterCompanyId };
  });

  store.users = (store.users || []).map((user) => {
    const masterCompanyId = validCompanyIds.has(user.masterCompanyId) ? user.masterCompanyId : defaultMasterCompanyId;
    const userType = cleanText(user.userType, isClientPortalUser(user) ? 'client' : 'team').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60);
    if (user.masterCompanyId === masterCompanyId && user.userType === userType) return user;
    changed = true;
    return { ...user, masterCompanyId, userType, updatedAt: user.updatedAt || now };
  });

  store.services = (store.services || []).map((item) => {
    const masterCompanyId = validCompanyIds.has(item.masterCompanyId) ? item.masterCompanyId : defaultMasterCompanyId;
    const allowedResourceIds = new Set((store.resources || [])
      .filter((resource) => resource.masterCompanyId === masterCompanyId)
      .map((resource) => resource.id));
    const resourceIds = cleanList(item.resourceIds).filter((resourceId) => allowedResourceIds.has(resourceId));
    if (item.masterCompanyId === masterCompanyId && cleanList(item.resourceIds).join('|') === resourceIds.join('|')) return item;
    changed = true;
    return { ...item, masterCompanyId, resourceIds, updatedAt: item.updatedAt || now };
  });

  return changed;
}

function safeTheme(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    palette: cleanText(value.palette, 'clean').slice(0, 40),
    accent: cleanText(value.accent, '#2563eb').slice(0, 24),
    surface: cleanText(value.surface, '#ffffff').slice(0, 24),
    text: cleanText(value.text, '#111827').slice(0, 24),
  };
}

function hasModule(user, moduleName) {
  if (moduleName === 'whatsapp' && user?.id) return true;
  return Boolean(user?.isMaster || isAdminRole(user) || user?.permissions?.modules?.includes(moduleName));
}

function hasAction(user, actionName) {
  return Boolean(user?.isMaster || isAdminRole(user) || user?.permissions?.actions?.includes(actionName));
}

function isSystemAdmin(user) {
  return Boolean(
    user?.isMaster ||
      (hasModule(user, 'users') && hasAction(user, 'managePermissions')) ||
      isAdminRole(user),
  );
}

function isClientPortalUser(user) {
  const role = cleanText(user?.role).toLowerCase();
  return Boolean(user?.userType === 'client' || role === 'cliente' || role === 'client' || role === 'customer' || user?.signupRequestedAt);
}

function canAccessClient(user, clientId, store = null) {
  if (!clientId) return true;
  const client = store?.clients?.find((item) => item.id === clientId);
  if (client && !canAccessMasterCompany(user, client.masterCompanyId)) return false;
  if (user?.isMaster || isAdminRole(user) || user?.permissions?.allClients) return true;
  return user?.permissions?.clientIds?.includes(clientId);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.get('Cookie') || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator === -1) return [part, ''];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function sessionTokenFromRequest(req) {
  const bearerToken = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (bearerToken) return bearerToken;
  return cleanText(parseCookies(req)[sessionCookieName]);
}

function sessionCookie(token, maxAgeSeconds) {
  return [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    cookieSecure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function clearSessionCookie() {
  return [
    `${sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    cookieSecure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

async function saveSession(token, userId, expiresAt) {
  if (dbPool) {
    await ensureDatabase();
    await dbPool.query(
      `INSERT INTO app_sessions (token, user_id, expires_at)
       VALUES ($1, $2, to_timestamp($3 / 1000.0))
       ON CONFLICT (token)
       DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at`,
      [token, userId, expiresAt],
    );
    return;
  }
  sessions.set(token, { token, userId, expiresAt });
}

async function readSession(token) {
  if (!token) return null;
  if (dbPool) {
    await ensureDatabase();
    const result = await dbPool.query(
      'SELECT token, user_id AS "userId", EXTRACT(EPOCH FROM expires_at) * 1000 AS "expiresAt" FROM app_sessions WHERE token = $1',
      [token],
    );
    if (!result.rowCount) return null;
    return { ...result.rows[0], expiresAt: Number(result.rows[0].expiresAt) };
  }
  return sessions.get(token) || null;
}

async function deleteSession(token) {
  if (!token) return;
  if (dbPool) {
    await ensureDatabase();
    await dbPool.query('DELETE FROM app_sessions WHERE token = $1', [token]);
    return;
  }
  sessions.delete(token);
}

async function deleteSessionsForUser(userId) {
  if (dbPool) {
    await ensureDatabase();
    await dbPool.query('DELETE FROM app_sessions WHERE user_id = $1', [userId]);
    return;
  }
  for (const [token, session] of sessions.entries()) {
    if (session.userId === userId) sessions.delete(token);
  }
}

async function requireAuth(req, res, next) {
  const token = sessionTokenFromRequest(req);
  const session = await readSession(token);
  if (!session || session.expiresAt < Date.now()) {
    await deleteSession(token);
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(401).json({ message: 'Entre novamente para continuar.' });
    return;
  }
  req.session = session;
  next();
}

async function attachUser(req, res, next) {
  const store = await readStore();
  const theme = store.settings?.defaultTheme || null;
  if (req.session.userId === 'master') {
    req.user = masterAccount(theme);
    req.store = store;
    next();
    return;
  }
  const user = store.users.find((item) => item.id === req.session.userId && item.status !== 'inactive');
  if (!user) {
    res.status(401).json({ message: 'Usuário não encontrado ou inativo.' });
    return;
  }
  req.user = user;
  req.store = store;
  next();
}

function requireModule(moduleName) {
  return (req, res, next) => {
    if (!hasModule(req.user, moduleName)) {
      res.status(403).json({ message: 'Você não tem acesso a este módulo.' });
      return;
    }
    next();
  };
}

function requireAction(actionName) {
  return (req, res, next) => {
    if (!hasAction(req.user, actionName)) {
      res.status(403).json({ message: 'Você não tem permissão para esta ação.' });
      return;
    }
    next();
  };
}

function requireMaster(req, res, next) {
  if (!isSystemAdmin(req.user)) {
    res.status(403).json({ message: 'Apenas a administradora principal pode acessar esta função.' });
    return;
  }
  next();
}

function requirePlatformAdmin(req, res, next) {
  if (!req.user?.isMaster) {
    res.status(403).json({ message: 'Apenas a administradora principal pode acessar esta função.' });
    return;
  }
  next();
}

function userHasAnyAction(user, actionNames) {
  return Boolean(user?.isMaster || actionNames.some((actionName) => user?.permissions?.actions?.includes(actionName)));
}

function filterMasterCompanies(user, masterCompanies) {
  if (user?.isMaster) return masterCompanies;
  const allowedCompanyIds = new Set(userMasterCompanyIds(user));
  return masterCompanies.filter((company) => allowedCompanyIds.has(company.id));
}

function filterClients(user, clients) {
  const scopedClients = user?.isMaster
    ? clients
    : clients.filter((client) => canAccessMasterCompany(user, client.masterCompanyId));
  if (user?.isMaster || isAdminRole(user) || user?.permissions?.allClients) return scopedClients;
  return scopedClients.filter((client) => user?.permissions?.clientIds?.includes(client.id));
}

function filterClientServices(user, clientServices, clients = null) {
  if (Array.isArray(clients)) {
    const allowedClientIds = new Set(filterClients(user, clients).map((client) => client.id));
    return clientServices.filter((clientService) => allowedClientIds.has(clientService.clientId));
  }
  if (user?.isMaster) return clientServices;
  return clientServices.filter((clientService) => canAccessMasterCompany(user, clientService.masterCompanyId));
}

function filterServices(user, services, clientServices = [], clients = []) {
  const scopedServices = user?.isMaster
    ? services
    : services.filter((service) => canAccessMasterCompany(user, service.masterCompanyId));
  if (user?.isMaster || isAdminRole(user) || user?.permissions?.allClients) return scopedServices;
  const allowedServiceIds = new Set(filterClientServices(user, clientServices, clients).map((clientService) => clientService.serviceId));
  return scopedServices.filter((service) => allowedServiceIds.has(service.id));
}

function filterResources(user, resources) {
  if (user?.isMaster) return resources;
  return resources.filter((resource) => canAccessMasterCompany(user, resource.masterCompanyId));
}

function filterActivities(user, activities, clients = []) {
  const allowedClientIds = new Set(filterClients(user, clients).map((client) => client.id));
  return activities.filter((activity) => (
    canAccessMasterCompany(user, activity.masterCompanyId) &&
    allowedClientIds.has(activity.clientId)
  ));
}

function filterAgendaEvents(user, agendaEvents, clients = []) {
  const scopedEvents = user?.isMaster
    ? agendaEvents
    : agendaEvents.filter((event) => canAccessMasterCompany(user, event.masterCompanyId));
  if (user?.isMaster || isAdminRole(user) || user?.permissions?.allClients) return scopedEvents;
  const allowedClientIds = new Set(filterClients(user, clients).map((client) => client.id));
  return scopedEvents.filter((event) => event.clientId && allowedClientIds.has(event.clientId));
}

function filterFinances(user, finances, clients = []) {
  const allowedClientIds = new Set(filterClients(user, clients).map((client) => client.id));
  return finances.filter((finance) => {
    if (allowedClientIds.has(finance.clientId)) return true;
    return finance.kind === 'expense' && canAccessMasterCompany(user, finance.masterCompanyId);
  });
}

function isEvolutionConfigured() {
  return Boolean(evolutionBaseUrl && evolutionGlobalApiKey);
}

function whatsappPhoneNumber(value = '') {
  const raw = cleanText(value);
  if (!/^\d+$/.test(raw)) return '';
  const digits = onlyDigits(value);
  if (digits.length < 10 || digits.length > 13) return '';
  return digits.length <= 11 ? `55${digits}` : digits;
}

function whatsappTargetId(value = '') {
  const raw = cleanText(value);
  if (raw.includes('@g.us')) return raw;
  return whatsappPhoneNumber(value);
}

function whatsappFallbackUrl(phone, text = '') {
  const number = whatsappPhoneNumber(phone);
  if (!number) return '';
  const query = cleanText(text) ? `?text=${encodeURIComponent(cleanText(text))}` : '';
  return `https://wa.me/${number}${query}`;
}

function slugPart(value) {
  return cleanText(value, 'empresa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42) || 'empresa';
}

function suggestedWhatsappInstanceName(company = {}) {
  return `ponto-controle-${slugPart(company.name || company.id)}`.slice(0, 64);
}

function normaliseEvolutionInstance(raw = {}) {
  const instance = raw.instance && typeof raw.instance === 'object' ? raw.instance : raw;
  const profile = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
  return {
    name: cleanText(instance.instanceName || instance.name || raw.instanceName || raw.name),
    state: cleanText(instance.state || instance.status || instance.connectionStatus || raw.state || raw.status),
    ownerJid: cleanText(instance.ownerJid || instance.owner || raw.ownerJid || raw.owner),
    profileName: cleanText(profile.name || instance.profileName || raw.profileName),
    profilePicUrl: cleanText(profile.picture || profile.profilePicUrl || instance.profilePicUrl || raw.profilePicUrl),
    raw,
  };
}

async function evolutionRequest(pathname, options = {}) {
  if (!isEvolutionConfigured()) {
    const error = new Error('Evolution API não configurada no servidor.');
    error.status = 503;
    throw error;
  }
  const hasBody = options.body !== undefined;
  const response = await fetch(`${evolutionBaseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      apikey: evolutionGlobalApiKey,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');
  if (!response.ok) {
    const message = cleanText(payload?.message || payload?.error || payload?.response?.message || payload, `Falha na Evolution API (${response.status}).`);
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function fetchEvolutionInstanceByName(instanceName) {
  const name = cleanText(instanceName);
  if (!name || !isEvolutionConfigured()) return null;
  const payload = await evolutionRequest(`/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`);
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.instances)
      ? payload.instances
      : Array.isArray(payload?.data)
        ? payload.data
        : payload
          ? [payload]
          : [];
  return candidates
    .map(normaliseEvolutionInstance)
    .find((instance) => !instance.name || instance.name === name) || null;
}

async function fetchEvolutionConnectionState(instanceName) {
  const name = cleanText(instanceName);
  if (!name || !isEvolutionConfigured()) return { state: '', error: '' };
  const payload = await evolutionRequest(`/instance/connectionState/${encodeURIComponent(name)}`);
  const state = cleanText(payload?.instance?.state || payload?.state || payload?.status || payload?.connectionStatus);
  return { state, raw: payload, error: '' };
}

async function ensureEvolutionInstance(company, requestedInstanceName = '') {
  const instanceName = cleanText(requestedInstanceName, company.whatsappInstanceName || suggestedWhatsappInstanceName(company));
  const existing = await fetchEvolutionInstanceByName(instanceName).catch(() => null);
  if (existing) return { instanceName, instance: existing, created: false, payload: null };

  const payload = await evolutionRequest('/instance/create', {
    method: 'POST',
    body: {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      token: crypto.randomBytes(20).toString('hex').toUpperCase(),
      qrcode: false,
      rejectCall: false,
      msgCall: '',
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: false,
      readStatus: false,
      syncFullHistory: true,
    },
  });
  return { instanceName, instance: normaliseEvolutionInstance(payload), created: true, payload };
}

async function configureEvolutionSettings(instanceName) {
  if (!instanceName) return null;
  return evolutionRequest(`/settings/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      rejectCall: false,
      msgCall: '',
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: false,
      readStatus: false,
      syncFullHistory: true,
    },
  }).catch(() => null);
}

function extractEvolutionConnectPayload(payload = {}) {
  const qrcode = payload.qrcode && typeof payload.qrcode === 'object' ? payload.qrcode : {};
  return {
    qrCode: cleanText(payload.base64 || payload.qr || payload.qrcode || qrcode.base64 || qrcode.code || qrcode.qr),
    pairingCode: cleanText(payload.pairingCode || payload.code || qrcode.pairingCode),
    raw: payload,
  };
}

async function connectEvolutionInstance(instanceName) {
  const payload = await evolutionRequest(`/instance/connect/${encodeURIComponent(instanceName)}`, { method: 'GET' });
  return extractEvolutionConnectPayload(payload);
}

async function disconnectEvolutionInstance(instanceName) {
  return evolutionRequest(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
}

async function restartEvolutionInstance(instanceName) {
  return evolutionRequest(`/instance/restart/${encodeURIComponent(instanceName)}`, { method: 'PUT' });
}

async function sendEvolutionTextMessage(instanceName, phone, text) {
  const number = whatsappTargetId(phone);
  if (!number) {
    const error = new Error('Informe um telefone de WhatsApp válido.');
    error.status = 400;
    throw error;
  }
  if (!cleanText(text)) {
    const error = new Error('Informe a mensagem para envio.');
    error.status = 400;
    throw error;
  }
  return evolutionRequest(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { number, text: cleanText(text).slice(0, 4000) },
  });
}

function whatsappMediaType(mimeType = '') {
  const type = cleanText(mimeType).toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'document';
}

async function sendEvolutionMediaMessage(instanceName, phone, attachment, caption = '') {
  const number = whatsappTargetId(phone);
  if (!number) {
    const error = new Error('Informe um telefone de WhatsApp válido.');
    error.status = 400;
    throw error;
  }
  const file = fileFromDataUrl(attachment);
  if (!file?.buffer?.length) {
    const error = new Error('Anexo inválido.');
    error.status = 400;
    throw error;
  }
  if (file.buffer.length > 8 * 1024 * 1024) {
    const error = new Error('Anexo máximo: 8 MB.');
    error.status = 413;
    throw error;
  }
  const fileName = cleanText(attachment?.name, 'arquivo').slice(0, 160);
  return evolutionRequest(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      number,
      mediatype: whatsappMediaType(file.type),
      mimetype: file.type || 'application/octet-stream',
      caption: cleanText(caption).slice(0, 4000),
      media: file.buffer.toString('base64'),
      fileName,
    },
  });
}

function evolutionMessageKey(payload = {}, fallback = {}) {
  const key = payload?.key || payload?.message?.key || payload?.data?.key || payload?.response?.key || {};
  const phone = whatsappPhoneNumber(fallback.phone);
  return {
    id: cleanText(key.id || payload?.id || payload?.messageId || fallback.providerMessageId),
    remoteJid: cleanText(key.remoteJid || fallback.remoteJid, phone ? `${phone}@s.whatsapp.net` : ''),
    fromMe: key.fromMe === undefined ? Boolean(fallback.fromMe) : Boolean(key.fromMe),
    participant: cleanText(key.participant || fallback.participant),
  };
}

async function updateEvolutionMessage(instanceName, message, text) {
  const key = evolutionMessageKey({}, message);
  if (!key.id || !key.remoteJid) {
    const error = new Error('Mensagem sem identificador da Evolution para editar no WhatsApp.');
    error.status = 400;
    throw error;
  }
  return evolutionRequest(`/chat/updateMessage/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      number: Number(whatsappPhoneNumber(message.phone)),
      text: cleanText(text).slice(0, 4000),
      key: {
        remoteJid: key.remoteJid,
        fromMe: key.fromMe,
        id: key.id,
      },
    },
  });
}

async function deleteEvolutionMessageForEveryone(instanceName, message) {
  const key = evolutionMessageKey({}, message);
  if (!key.id || !key.remoteJid) {
    const error = new Error('Mensagem sem identificador da Evolution para apagar no WhatsApp.');
    error.status = 400;
    throw error;
  }
  return evolutionRequest(`/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
    body: {
      id: key.id,
      remoteJid: key.remoteJid,
      fromMe: key.fromMe,
      participant: key.participant,
    },
  });
}

async function fetchEvolutionChats(instanceName) {
  return evolutionRequest(`/chat/findChats/${encodeURIComponent(instanceName)}`, { method: 'POST' });
}

async function fetchEvolutionContacts(instanceName, search = '') {
  const term = cleanText(search);
  return evolutionRequest(`/chat/findContacts/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: { where: term ? { id: term } : {} },
  });
}

async function fetchEvolutionMessages(instanceName, remoteJid = '') {
  return evolutionRequest(`/chat/findMessages/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: remoteJid ? { where: { key: { remoteJid } } } : {},
  });
}

function payloadList(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.contacts)) return payload.contacts;
  if (Array.isArray(payload?.chats)) return payload.chats;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.response)) return payload.response;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (payload && typeof payload === 'object') return [payload];
  return [];
}

function normalizeEvolutionStoredMessage(item = {}) {
  const raw = item.message && typeof item.message === 'object' && !item.key ? item.message : item;
  return normalizeWebhookMessage({
    ...raw,
    key: raw.key || item.key,
    pushName: raw.pushName || raw.pushname || item.pushName || item.pushname || item.name,
  });
}

function normalizeEvolutionContact(item = {}) {
  const raw = item.contact && typeof item.contact === 'object' ? item.contact : item;
  const id = cleanText(raw.id || raw.remoteJid || raw.jid || raw.chatId || raw.number || raw.phone);
  const isGroup = id.includes('@g.us');
  if (isGroup) {
    return {
      id,
      phone: id,
      name: cleanText(raw.name || raw.subject || raw.pushName || raw.pushname, 'Grupo do WhatsApp'),
      profilePicUrl: cleanText(raw.profilePicUrl || raw.profilePictureUrl || raw.picture),
      isBusiness: false,
      isGroup: true,
    };
  }
  const phone = whatsappPhoneNumber(String(id).split('@')[0]) || whatsappPhoneNumber(raw.number || raw.phone);
  if (!phone) return null;
  return {
    id: cleanText(id, `${phone}@s.whatsapp.net`),
    phone,
    name: cleanText(raw.name || raw.pushName || raw.pushname || raw.notify || raw.verifiedName || raw.shortName || raw.subject, phone),
    profilePicUrl: cleanText(raw.profilePicUrl || raw.profilePictureUrl || raw.picture),
    isBusiness: Boolean(raw.isBusiness || raw.businessProfile),
    isGroup: false,
  };
}

function uniqueContacts(contacts = []) {
  const byPhone = new Map();
  contacts.filter(Boolean).forEach((contact) => {
    const current = byPhone.get(contact.phone);
    if (!current || (contact.name && current.name === contact.phone)) byPhone.set(contact.phone, contact);
  });
  return Array.from(byPhone.values());
}

async function configureEvolutionWebhook(instanceName) {
  const siteUrl = cleanText(process.env.SITE_URL, 'https://adegaweb.com.br').replace(/\/+$/, '');
  if (!siteUrl || !instanceName) return null;
  return evolutionRequest(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      webhook: {
        enabled: true,
        url: `${siteUrl}/api/whatsapp/webhook/${encodeURIComponent(instanceName)}`,
        webhookByEvents: false,
        base64: true,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    },
  }).catch(() => null);
}

function extractWebhookText(message = {}, item = {}) {
  if (typeof message === 'string') return message;
  return cleanText(
    message.conversation ||
    message.text ||
    message.body ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    item.text ||
    item.body,
  );
}

function firstNestedString(source, names, depth = 0) {
  if (!source || typeof source !== 'object' || depth > 5) return '';
  for (const name of names) {
    if (typeof source[name] === 'string' && source[name].trim()) return source[name];
  }
  for (const value of Object.values(source)) {
    const found = firstNestedString(value, names, depth + 1);
    if (found) return found;
  }
  return '';
}

function webhookMessageMedia(message = {}, item = {}) {
  const media =
    message.imageMessage ||
    message.videoMessage ||
    message.audioMessage ||
    message.documentMessage ||
    message.stickerMessage ||
    {};
  const mimetype = cleanText(media.mimetype || media.mimeType || item.mimetype || item.mimeType || firstNestedString(item, ['mimetype', 'mimeType']), 'application/octet-stream');
  const name = cleanText(
    media.fileName ||
    media.filename ||
    item.fileName ||
    item.filename ||
    firstNestedString(item, ['fileName', 'filename']),
    mimetype.startsWith('image/') ? 'imagem' : mimetype.startsWith('audio/') ? 'audio' : mimetype.startsWith('video/') ? 'video' : 'arquivo',
  ).slice(0, 160);
  const rawBase64 = cleanText(
    item.base64 ||
    item.media ||
    item.file ||
    media.base64 ||
    firstNestedString(item, ['base64']),
  );
  const url = cleanText(
    item.mediaUrl ||
    item.url ||
    media.url ||
    firstNestedString(item, ['mediaUrl', 'downloadUrl', 'url']),
  );
  if (rawBase64) {
    const dataUrl = rawBase64.startsWith('data:') ? rawBase64 : `data:${mimetype};base64,${rawBase64.replace(/^base64,/i, '')}`;
    const approxSize = Math.floor((dataUrl.split(',')[1] || '').length * 0.75);
    if (approxSize <= 8 * 1024 * 1024) return { name, type: mimetype, dataUrl, size: approxSize };
  }
  if (/^https?:\/\//i.test(url)) return { name, type: mimetype, url };
  return null;
}

function normalizeWebhookMessage(item = {}) {
  const key = item.key || item.message?.key || {};
  const message = item.message?.message || item.message || item;
  const remoteJid = cleanText(key.remoteJid || item.remoteJid || item.chatId || item.from || item.sender);
  if (!remoteJid) return null;
  const isGroup = remoteJid.includes('@g.us');
  const phone = isGroup ? remoteJid : whatsappPhoneNumber(String(remoteJid).split('@')[0]);
  if (!phone) return null;
  const text = extractWebhookText(message, item);
  const filename = cleanText(message.documentMessage?.fileName || item.fileName);
  const attachment = webhookMessageMedia(message, item);
  const direction = key.fromMe || item.fromMe ? 'outbound' : 'inbound';
  return {
    phone,
    text: text || filename || attachment?.name || 'Arquivo recebido',
    attachment,
    targetLabel: direction === 'outbound' && !isGroup ? '' : cleanText(item.subject || item.groupName || item.pushName || item.pushname || item.senderName, isGroup ? 'Grupo do WhatsApp' : ''),
    direction,
    providerMessageId: cleanText(key.id || item.id || item.messageId),
    remoteJid,
    fromMe: Boolean(key.fromMe || item.fromMe),
  };
}

function extractWebhookMessages(payload = {}) {
  const event = cleanText(payload.event || payload.type || payload.eventName).toLowerCase();
  if (event && !event.includes('message')) return [];
  const data = payload.data || payload;
  const items = [];
  if (Array.isArray(data)) items.push(...data);
  if (Array.isArray(data?.messages)) items.push(...data.messages);
  if (Array.isArray(payload.messages)) items.push(...payload.messages);
  if (data?.key || data?.message || data?.remoteJid) items.push(data);
  return items.map(normalizeWebhookMessage).filter(Boolean);
}

function whatsappCompanyForRequest(req, requestedMasterCompanyId = '') {
  const scopedRequest = req.user?.isMaster ? requestedMasterCompanyId : '';
  const masterCompanyId = effectiveMasterCompanyId(req.store, req.user, scopedRequest);
  const company = req.store.masterCompanies.find((item) => item.id === masterCompanyId);
  if (!company || !canAccessMasterCompany(req.user, masterCompanyId)) {
    const error = new Error('Você não tem acesso a esta empresa master.');
    error.status = 403;
    throw error;
  }
  return company;
}

async function whatsappConnectorForCompany(company) {
  const instanceName = cleanText(company.whatsappInstanceName, suggestedWhatsappInstanceName(company));
  const connector = {
    mode: isEvolutionConfigured() ? 'evolution' : 'wa_me',
    evolutionEnabled: isEvolutionConfigured(),
    baseUrl: evolutionBaseUrl,
    managerUrl: evolutionManagerUrl,
    masterCompanyId: company.id,
    masterCompanyName: company.name,
    instanceName,
    suggestedInstanceName: suggestedWhatsappInstanceName(company),
    connected: false,
    state: cleanText(company.whatsappLastState),
    instanceFound: false,
    profileName: '',
    ownerJid: '',
    profilePicUrl: '',
    error: '',
  };

  if (!connector.evolutionEnabled || !instanceName) return connector;
  try {
    const [instance, connection] = await Promise.all([
      fetchEvolutionInstanceByName(instanceName).catch((error) => ({ error: error.message })),
      fetchEvolutionConnectionState(instanceName).catch((error) => ({ state: '', error: error.message })),
    ]);
    if (instance && !instance.error) {
      connector.instanceFound = true;
      connector.profileName = instance.profileName;
      connector.ownerJid = instance.ownerJid;
      connector.profilePicUrl = instance.profilePicUrl;
      connector.state = connection.state || instance.state || connector.state;
    }
    if (connection.error && !connector.error) connector.error = connection.error;
    connector.connected = ['open', 'connected'].includes(cleanText(connector.state).toLowerCase());
  } catch (error) {
    connector.error = error.message || 'Não foi possível consultar a Evolution API.';
  }
  return connector;
}

function filterWhatsappMessages(user, messages, masterCompanyId = '') {
  const scopedMessages = (messages || []).filter((message) =>
    (!masterCompanyId || message.masterCompanyId === masterCompanyId) &&
    !message.deletedAt &&
    canAccessMasterCompany(user, message.masterCompanyId),
  );
  return scopedMessages.slice(0, 80).map((message) => ({
    id: message.id,
    masterCompanyId: message.masterCompanyId,
    phone: message.phone,
    targetLabel: message.targetLabel,
    text: message.text,
    attachment: message.attachment || null,
    direction: message.direction || 'outbound',
    status: message.status,
    source: message.source,
    provider: message.provider,
    providerMessageId: message.providerMessageId,
    remoteJid: message.remoteJid,
    fromMe: Boolean(message.fromMe),
    editedAt: message.editedAt,
    error: message.error,
    createdAt: message.createdAt,
  }));
}

function filterDeletedWhatsappMessages(user, messages, masterCompanyId = '') {
  return (messages || [])
    .filter((message) =>
      (!masterCompanyId || message.masterCompanyId === masterCompanyId) &&
      message.deletedAt &&
      canAccessMasterCompany(user, message.masterCompanyId),
    )
    .slice(0, 80)
    .map((message) => ({
      id: message.id,
      masterCompanyId: message.masterCompanyId,
      phone: message.phone,
      targetLabel: message.targetLabel,
      text: message.text,
      attachment: message.attachment || null,
      direction: message.direction || 'outbound',
      status: message.status,
      source: message.source,
      provider: message.provider,
      providerMessageId: message.providerMessageId,
      remoteJid: message.remoteJid,
      fromMe: Boolean(message.fromMe),
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      error: message.error,
      createdAt: message.createdAt,
    }));
}

function appendWhatsappMessage(store, message) {
  if (!Array.isArray(store.whatsappMessages)) store.whatsappMessages = [];
  const providerMessageId = cleanText(message.providerMessageId).slice(0, 120);
  if (providerMessageId && store.whatsappMessages.some((item) => item.providerMessageId === providerMessageId)) return;
  const phone = whatsappTargetId(message.phone);
  store.whatsappMessages.unshift({
    id: createId('whatsapp-message'),
    masterCompanyId: cleanText(message.masterCompanyId, defaultMasterCompanyId),
    phone,
    targetLabel: cleanText(message.targetLabel).slice(0, 140),
    text: cleanText(message.text).slice(0, 4000),
    attachment: message.attachment || null,
    direction: cleanText(message.direction, 'outbound').slice(0, 20),
    status: cleanText(message.status, 'sent').slice(0, 40),
    source: cleanText(message.source, 'manual').slice(0, 60),
    provider: cleanText(message.provider, 'evolution').slice(0, 40),
    providerMessageId,
    remoteJid: cleanText(message.remoteJid, phone?.includes('@') ? phone : phone ? `${phone}@s.whatsapp.net` : '').slice(0, 160),
    fromMe: message.fromMe === undefined ? cleanText(message.direction, 'outbound') !== 'inbound' : Boolean(message.fromMe),
    error: cleanText(message.error).slice(0, 500),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.whatsappMessages = store.whatsappMessages.slice(0, 300);
}

function updateMasterCompanyWhatsapp(store, masterCompanyId, fields = {}) {
  const index = store.masterCompanies.findIndex((company) => company.id === masterCompanyId);
  if (index < 0) return null;
  store.masterCompanies[index] = {
    ...store.masterCompanies[index],
    ...fields,
    whatsappUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return store.masterCompanies[index];
}

function resourceIdsForMasterCompany(store, resourceIds, masterCompanyId) {
  const allowedResourceIds = new Set((store.resources || [])
    .filter((resource) => resource.masterCompanyId === masterCompanyId)
    .map((resource) => resource.id));
  return cleanList(resourceIds).filter((resourceId) => allowedResourceIds.has(resourceId));
}

function clientIdsForMasterCompany(store, clientIds, masterCompanyId) {
  const allowedClientIds = new Set((store.clients || [])
    .filter((client) => client.masterCompanyId === masterCompanyId)
    .map((client) => client.id));
  return cleanList(clientIds).filter((clientId) => allowedClientIds.has(clientId));
}

function statusForFinance(record) {
  if (record.status === 'paid' || record.status === 'cancelled') return record.status;
  return isPastDue(record.dueDate) ? 'overdue' : 'open';
}

function monthlyEquivalent(record) {
  const quantity = Math.max(1, Math.trunc(cleanNumber(record.quantity, 1)));
  const amount = cleanNumber(record.specificValue ?? record.amount) * quantity;
  if (record.periodicity === 'annual') return amount / 12;
  if (record.periodicity === 'one_time' || record.periodicity === 'project') return 0;
  return amount;
}

function dueDateForMonth(monthKey, dueDay) {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(lastDay, Math.max(1, Math.trunc(cleanNumber(dueDay, 10))));
  return `${monthKey}-${String(day).padStart(2, '0')}`;
}

function addMonthsToMonthKey(monthKey, monthsToAdd) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + monthsToAdd, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function financeForecastMonthKeys(monthCount = 12) {
  const firstMonth = todayDate().slice(0, 7);
  return Array.from({ length: monthCount }, (_, index) => addMonthsToMonthKey(firstMonth, index));
}

function contractAppliesToFinanceMonth(contract, monthKey) {
  if (contract.status !== 'active') return false;
  if (!['monthly', 'recurring'].includes(contract.periodicity)) return false;
  if (contract.startDate && contract.startDate.slice(0, 7) > monthKey) return false;
  if (contract.endDate && contract.endDate.slice(0, 7) < monthKey) return false;
  return monthlyEquivalent(contract) > 0;
}

function expectedFinanceKey(contract, monthKey) {
  return `expected:${contract.id}:${monthKey}`;
}

function financeMonthKey(finance) {
  const fromDueDate = cleanDate(finance.dueDate).slice(0, 7);
  if (fromDueDate) return fromDueDate;
  const expectedKey = cleanText(finance.expectedKey);
  const keyMonth = expectedKey.split(':').pop();
  return /^\d{4}-\d{2}$/.test(keyMonth) ? keyMonth : '';
}

function financeHasAccountingArtifact(finance) {
  return Boolean(finance.invoiceNumber || finance.invoiceFile || finance.boletoNumber || finance.boletoFile);
}

function autoFinanceStillApplies(store, finance) {
  if (!finance.autoGenerated || !finance.clientServiceId) return true;
  const contract = store.clientServices.find((clientService) => clientService.id === finance.clientServiceId);
  if (!contract || contract.clientId !== finance.clientId || contract.serviceId !== finance.serviceId) return false;
  const client = store.clients.find((clientItem) => clientItem.id === contract.clientId);
  if (!client || client.status === 'inactive') return false;
  const monthKey = financeMonthKey(finance);
  return Boolean(monthKey && contractAppliesToFinanceMonth(contract, monthKey));
}

function ensureCurrentFinanceReceivables(store) {
  if (!store || !Array.isArray(store.clientServices)) return false;
  if (!Array.isArray(store.finances)) store.finances = [];
  const monthKeys = financeForecastMonthKeys(12);
  let changed = false;

  store.finances = store.finances.filter((finance) => {
    if (!finance.autoGenerated || finance.status === 'paid' || autoFinanceStillApplies(store, finance)) return true;
    changed = true;
    if (!financeHasAccountingArtifact(finance)) return false;
    finance.status = 'cancelled';
    finance.updatedAt = new Date().toISOString();
    finance.notes = cleanText(
      finance.notes
        ? `${finance.notes} | Previsão automática cancelada porque o serviço contratado não está ativo.`
        : 'Previsão automática cancelada porque o serviço contratado não está ativo.',
    ).slice(0, 500);
    return true;
  });

  store.clientServices.forEach((contract) => {
    if (!store.clients.some((client) => client.id === contract.clientId && client.status !== 'inactive')) return;

    monthKeys.forEach((monthKey) => {
      if (!contractAppliesToFinanceMonth(contract, monthKey)) return;

      const expectedKey = expectedFinanceKey(contract, monthKey);
      const existingIndex = store.finances.findIndex(
        (finance) =>
          (finance.expectedKey === expectedKey && finance.status !== 'cancelled') ||
          (
            finance.clientServiceId === contract.id &&
            finance.dueDate?.slice(0, 7) === monthKey &&
            finance.status !== 'cancelled'
          ),
      );
      const service = store.services.find((item) => item.id === contract.serviceId);
      const expectedFinance = {
        masterCompanyId: contract.masterCompanyId,
        clientId: contract.clientId,
        serviceId: contract.serviceId,
        clientServiceId: contract.id,
        reference: service?.name ? `Recebimento previsto - ${service.name}` : 'Recebimento previsto',
        dueDate: dueDateForMonth(monthKey, contract.dueDay),
        amount: monthlyEquivalent(contract),
        status: 'open',
        expectedKey,
        autoGenerated: true,
      };
      if (existingIndex >= 0) {
        const existing = store.finances[existingIndex];
        if (!existing.autoGenerated || existing.status === 'paid' || existing.status === 'cancelled') return;
        const next = cleanFinance(expectedFinance, existing);
        const shouldUpdate = [
          'masterCompanyId',
          'clientId',
          'serviceId',
          'clientServiceId',
          'reference',
          'dueDate',
          'amount',
          'expectedKey',
        ].some((field) => existing[field] !== next[field]) || !existing.autoGenerated;
        if (!shouldUpdate) return;
        store.finances[existingIndex] = next;
        changed = true;
        return;
      }

      store.finances.push(cleanFinance(expectedFinance));
      changed = true;
    });
  });

  return changed;
}

function reportData({ clients, services = [], clientServices = [], resources, activities, finances }) {
  const visibleFinances = finances.map((record) => ({ ...record, status: statusForFinance(record) }));
  const visibleIncomeFinances = visibleFinances.filter((record) => record.kind !== 'expense');
  const visibleExpenseFinances = visibleFinances.filter((record) => record.kind === 'expense');
  const visibleClientServices = clientServices.filter((clientService) =>
    clients.some((client) => client.id === clientService.clientId),
  );
  const financeTotals = visibleIncomeFinances.reduce(
    (total, record) => {
      const amount = cleanNumber(record.amount);
      total[record.status] = cleanNumber(total[record.status]) + amount;
      total.total += amount;
      return total;
    },
    { open: 0, paid: 0, overdue: 0, cancelled: 0, total: 0, expenses: 0 },
  );
  financeTotals.expenses = visibleExpenseFinances
    .filter((record) => record.status !== 'cancelled')
    .reduce((sum, record) => sum + cleanNumber(record.amount), 0);
  const activeServiceRevenue = visibleClientServices
    .filter((clientService) => clientService.status === 'active')
    .reduce((sum, clientService) => sum + monthlyEquivalent(clientService), 0);
  const activityByStatus = Object.fromEntries(activityStatuses.map((status) => [status, 0]));
  activities.forEach((activity) => {
    activityByStatus[activity.status] = cleanNumber(activityByStatus[activity.status]) + 1;
  });
  const resourceMap = new Map(resources.map((resource) => [resource.id, { ...resource, activityCount: 0 }]));
  activities.forEach((activity) => {
    (activity.resourceIds || []).forEach((resourceId) => {
      const resource = resourceMap.get(resourceId);
      if (resource) resource.activityCount += 1;
    });
  });
  const clientFinancials = clients.map((client) => {
    const records = visibleIncomeFinances.filter((record) => record.clientId === client.id);
    return {
      clientId: client.id,
      name: client.name,
      open: records.filter((record) => record.status === 'open').reduce((sum, record) => sum + cleanNumber(record.amount), 0),
      overdue: records
        .filter((record) => record.status === 'overdue')
        .reduce((sum, record) => sum + cleanNumber(record.amount), 0),
      paid: records.filter((record) => record.status === 'paid').reduce((sum, record) => sum + cleanNumber(record.amount), 0),
    };
  });
  const serviceReports = services.map((service) => {
    const contracts = visibleClientServices.filter((clientService) => clientService.serviceId === service.id);
    const serviceActivities = activities.filter((activity) => activity.serviceId === service.id);
    const serviceFinances = visibleIncomeFinances.filter((record) => record.serviceId === service.id);
    const resourceIds = new Set([...(service.resourceIds || [])]);
    contracts.forEach((contract) => (contract.resourceIds || []).forEach((resourceId) => resourceIds.add(resourceId)));
    serviceActivities.forEach((activity) => (activity.resourceIds || []).forEach((resourceId) => resourceIds.add(resourceId)));
    return {
      serviceId: service.id,
      name: service.name,
      status: service.status,
      category: service.category,
      clientCount: contracts.length,
      activeClientCount: contracts.filter((contract) => contract.status === 'active').length,
      monthlyRevenue: contracts.filter((contract) => contract.status === 'active').reduce((sum, contract) => sum + monthlyEquivalent(contract), 0),
      paidRevenue: serviceFinances.filter((record) => record.status === 'paid').reduce((sum, record) => sum + cleanNumber(record.amount), 0),
      openRevenue: serviceFinances
        .filter((record) => record.status === 'open' || record.status === 'overdue')
        .reduce((sum, record) => sum + cleanNumber(record.amount), 0),
      openActivities: serviceActivities.filter((activity) => activity.status !== 'done').length,
      activityCount: serviceActivities.length,
      resourceCount: resourceIds.size,
      valuesByClient: contracts.map((contract) => ({
        clientId: contract.clientId,
        clientName: clients.find((client) => client.id === contract.clientId)?.name || 'Cliente',
        value: cleanNumber(contract.specificValue) * Math.max(1, Math.trunc(cleanNumber(contract.quantity, 1))),
        quantity: Math.max(1, Math.trunc(cleanNumber(contract.quantity, 1))),
        unitValue: cleanNumber(contract.specificValue),
        status: contract.status,
        periodicity: contract.periodicity,
      })),
    };
  });
  const serviceStatusTotals = Object.fromEntries(clientServiceStatuses.map((status) => [status, 0]));
  visibleClientServices.forEach((contract) => {
    serviceStatusTotals[contract.status] = cleanNumber(serviceStatusTotals[contract.status]) + 1;
  });

  return {
    financeTotals,
    activeServiceRevenue,
    activityByStatus,
    resourceInvolvement: [...resourceMap.values()].sort((a, b) => b.activityCount - a.activityCount),
    clientFinancials,
    serviceReports: serviceReports.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue),
    serviceStatusTotals,
    totals: {
      clients: clients.length,
      services: services.length,
      clientServices: visibleClientServices.length,
      resources: resources.length,
      activities: activities.length,
      finances: finances.length,
    },
  };
}

function safeFile(value) {
  if (!value || typeof value !== 'object') return null;
  const dataUrl = cleanText(value.dataUrl);
  if (dataUrl && dataUrl.length > 7_000_000) {
    const error = new Error('O arquivo enviado é grande demais para este cadastro.');
    error.status = 413;
    throw error;
  }
  return {
    name: cleanText(value.name, 'arquivo').slice(0, 180),
    type: cleanText(value.type, 'application/octet-stream').slice(0, 100),
    dataUrl,
    uploadedAt: cleanText(value.uploadedAt, new Date().toISOString()),
  };
}

function safeLoginImage(value) {
  const file = safeFile(value);
  if (!file || !file.dataUrl) {
    const error = new Error('Envie uma imagem válida para o login.');
    error.status = 400;
    throw error;
  }
  if (!file.type.startsWith('image/') && !file.dataUrl.startsWith('data:image/')) {
    const error = new Error('O arquivo do login precisa ser uma imagem.');
    error.status = 400;
    throw error;
  }
  return file;
}

function safeFiles(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => safeFile(item)).filter(Boolean).slice(0, 40);
}

function cleanClient(input = {}, existing = {}) {
  const now = new Date().toISOString();
  return {
    id: existing.id || cleanText(input.id, createId('client')),
    masterCompanyId: cleanText(input.masterCompanyId, existing.masterCompanyId || defaultMasterCompanyId),
    cnpj: cleanText(input.cnpj).slice(0, 24),
    name: cleanText(input.name, 'Cliente sem nome').slice(0, 140),
    tradeName: cleanText(input.tradeName).slice(0, 140),
    contactName: cleanText(input.contactName).slice(0, 120),
    email: cleanText(input.email).slice(0, 160),
    phone: cleanText(input.phone).slice(0, 60),
    address: cleanText(input.address).slice(0, 220),
    serviceType: cleanText(input.serviceType).slice(0, 120),
    serviceIds: cleanList(input.serviceIds),
    hasContract: cleanBoolean(input.hasContract),
    contractNotes: cleanText(input.contractNotes).slice(0, 300),
    documents: input.documents === undefined ? safeFiles(existing.documents) : safeFiles(input.documents),
    status: ['active', 'paused', 'inactive'].includes(input.status) ? input.status : 'active',
    notes: cleanText(input.notes).slice(0, 500),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

function contractSettingsForClientService(service, input = {}, existing = {}) {
  const values = input && typeof input === 'object' ? input : {};
  return {
    specificValue: Math.max(0, cleanNumber(values.specificValue, existing.specificValue ?? service.baseValue)),
    quantity: Math.max(1, Math.trunc(cleanNumber(values.quantity, existing.quantity || 1))),
    periodicity: servicePeriodicities.includes(values.periodicity)
      ? values.periodicity
      : existing.periodicity || service.suggestedPeriodicity,
    dueDay: Math.min(31, Math.max(1, Math.trunc(cleanNumber(values.dueDay, existing.dueDay || 10)))),
    status: clientServiceStatuses.includes(values.status)
      ? values.status
      : existing.status === 'cancelled'
        ? 'active'
        : existing.status || 'active',
    startDate: values.startDate === undefined ? cleanDate(existing.startDate) : cleanDate(values.startDate),
    endDate: values.endDate === undefined ? cleanDate(existing.endDate) : cleanDate(values.endDate),
  };
}

function syncClientServicesFromClient(store, client, clientServiceValues = {}) {
  const selected = new Set(cleanList(client.serviceIds).filter((serviceId) => store.services.some((service) => service.id === serviceId)));
  client.serviceIds = [...selected];
  store.clientServices = store.clientServices.map((contract) => {
    if (contract.clientId !== client.id) return contract;
    if (selected.has(contract.serviceId)) {
      const service = store.services.find((item) => item.id === contract.serviceId);
      if (!service) return contract;
      const settings = contractSettingsForClientService(service, clientServiceValues?.[contract.serviceId], contract);
      return { ...contract, ...settings, updatedAt: new Date().toISOString() };
    }
    if (!selected.has(contract.serviceId) && contract.status !== 'cancelled' && contract.status !== 'finished') {
      return { ...contract, status: 'cancelled', updatedAt: new Date().toISOString() };
    }
    return contract;
  });
  selected.forEach((serviceId) => {
    const service = store.services.find((item) => item.id === serviceId);
    const exists = store.clientServices.some((contract) => contract.clientId === client.id && contract.serviceId === serviceId);
    if (!service || exists) return;
    const settings = contractSettingsForClientService(service, clientServiceValues?.[serviceId]);
    store.clientServices.push(
      cleanClientService({
        masterCompanyId: client.masterCompanyId,
        clientId: client.id,
        serviceId,
        specificValue: settings.specificValue,
        quantity: settings.quantity,
        periodicity: settings.periodicity,
        dueDay: settings.dueDay,
        status: settings.status,
        startDate: settings.startDate,
        endDate: settings.endDate,
        hasContract: service.requiresContract,
        resourceIds: service.resourceIds,
      }),
    );
  });
}

function syncClientUsersFromClient(store, clientId, linkedUserIds = []) {
  const client = store.clients.find((item) => item.id === clientId);
  if (!client) return;
  const selected = new Set(
    cleanList(linkedUserIds).filter((userId) =>
      store.users.some((user) => {
        const clientIds = cleanList(user.permissions?.clientIds);
        return (
          user.id === userId &&
          isClientPortalUser(user) &&
          user.masterCompanyId === client.masterCompanyId &&
          (clientIds.length === 0 || clientIds.includes(clientId))
        );
      }),
    ),
  );
  const now = new Date().toISOString();

  store.users = store.users.map((user) => {
    if (!isClientPortalUser(user) || user.masterCompanyId !== client.masterCompanyId) return user;

    const permissions = user.permissions || {};
    const previousClientIds = permissions.allClients ? [clientId] : cleanList(permissions.clientIds);
    const linkedToOtherClient = previousClientIds.some((item) => item !== clientId);
    if (linkedToOtherClient && !selected.has(user.id)) return user;

    if (selected.has(user.id)) {
      return {
        ...user,
        permissions: {
          ...permissions,
          modules: [...new Set([...(permissions.modules || []), 'dashboard', 'reports'])].filter((moduleName) => modules.includes(moduleName)),
          allClients: false,
          clientIds: [clientId],
        },
        updatedAt: now,
      };
    }

    return {
      ...user,
      permissions: {
        ...permissions,
        modules: [...new Set([...(permissions.modules || []), 'dashboard', 'reports'])].filter((moduleName) => modules.includes(moduleName)),
        allClients: false,
        clientIds: previousClientIds.filter((item) => item !== clientId),
      },
      updatedAt: now,
    };
  });
}

function cleanResource(input = {}, existing = {}) {
  const now = new Date().toISOString();
  return {
    id: existing.id || cleanText(input.id, createId('resource')),
    masterCompanyId: cleanText(input.masterCompanyId, existing.masterCompanyId || defaultMasterCompanyId),
    name: cleanText(input.name, 'Pessoa sem nome').slice(0, 140),
    role: cleanText(input.role).slice(0, 120),
    email: cleanText(input.email).slice(0, 160),
    whatsapp: cleanText(input.whatsapp).replace(/[^\d+]/g, '').slice(0, 32),
    skills: cleanList(input.skills).slice(0, 20),
    clientIds: cleanList(input.clientIds),
    status: ['active', 'paused', 'inactive'].includes(input.status) ? input.status : 'active',
    notes: cleanText(input.notes).slice(0, 500),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

function cleanService(input = {}, existing = {}) {
  const now = new Date().toISOString();
  const status = ['active', 'inactive'].includes(input.status) ? input.status : 'active';
  const service = {
    id: existing.id || cleanText(input.id, createId('service')),
    masterCompanyId: cleanText(input.masterCompanyId, existing.masterCompanyId || defaultMasterCompanyId),
    name: cleanText(input.name, 'Serviço sem nome').slice(0, 140),
    description: cleanText(input.description).slice(0, 900),
    category: cleanText(input.category).slice(0, 120),
    status,
    baseValue: Math.max(0, cleanNumber(input.baseValue)),
    suggestedPeriodicity: servicePeriodicities.includes(input.suggestedPeriodicity) ? input.suggestedPeriodicity : 'monthly',
    requiresContract: cleanBoolean(input.requiresContract),
    internalNotes: cleanText(input.internalNotes).slice(0, 700),
    defaultActivities: cleanList(input.defaultActivities).slice(0, 30),
    resourceIds: cleanList(input.resourceIds),
    history: Array.isArray(existing.history) ? existing.history.slice(-30) : [],
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
  const changed = existing.id
    ? ['name', 'category', 'status', 'baseValue', 'suggestedPeriodicity', 'requiresContract'].some(
        (field) => existing[field] !== service[field],
      )
    : true;
  if (changed) {
    service.history = [
      ...service.history,
      {
        at: now,
        event: existing.id ? 'Serviço atualizado' : 'Serviço criado',
        status: service.status,
        baseValue: service.baseValue,
      },
    ].slice(-30);
  }
  return service;
}

function cleanClientService(input = {}, existing = {}) {
  const now = new Date().toISOString();
  return {
    id: existing.id || cleanText(input.id, createId('client-service')),
    masterCompanyId: cleanText(input.masterCompanyId, existing.masterCompanyId || defaultMasterCompanyId),
    clientId: cleanText(input.clientId),
    serviceId: cleanText(input.serviceId),
    specificValue: Math.max(0, cleanNumber(input.specificValue, existing.specificValue || 0)),
    quantity: Math.max(1, Math.trunc(cleanNumber(input.quantity, existing.quantity || 1))),
    periodicity: servicePeriodicities.includes(input.periodicity) ? input.periodicity : 'monthly',
    startDate: cleanDate(input.startDate),
    endDate: cleanDate(input.endDate),
    status: clientServiceStatuses.includes(input.status) ? input.status : 'active',
    hasContract: cleanBoolean(input.hasContract),
    contractFile: input.contractFile === undefined ? existing.contractFile || null : safeFile(input.contractFile),
    commercialNotes: cleanText(input.commercialNotes).slice(0, 700),
    specialConditions: cleanText(input.specialConditions).slice(0, 700),
    dueDay: Math.min(31, Math.max(1, Math.trunc(cleanNumber(input.dueDay, 10)))),
    ownerResourceId: cleanText(input.ownerResourceId),
    resourceIds: cleanList(input.resourceIds),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

function cleanActivity(input = {}, existing = {}) {
  const now = new Date().toISOString();
  const status = activityStatuses.includes(input.status) ? input.status : 'backlog';
  return {
    id: existing.id || cleanText(input.id, createId('activity')),
    masterCompanyId: cleanText(input.masterCompanyId, existing.masterCompanyId || defaultMasterCompanyId),
    title: cleanText(input.title, 'Atividade sem título').slice(0, 160),
    description: cleanText(input.description).slice(0, 700),
    clientId: cleanText(input.clientId),
    serviceId: cleanText(input.serviceId),
    clientServiceId: cleanText(input.clientServiceId),
    resourceIds: cleanList(input.resourceIds),
    status,
    priority: ['baixa', 'media', 'alta', 'critica'].includes(input.priority) ? input.priority : 'media',
    startDate: cleanDate(input.startDate),
    dueDate: cleanDate(input.dueDate),
    doneDate: status === 'done' ? cleanDate(input.doneDate) || todayDate() : cleanDate(input.doneDate),
    color: cleanText(input.color, '#2563eb').slice(0, 24),
    tags: cleanList(input.tags).slice(0, 12),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

function cleanAgendaEvent(input = {}, existing = {}) {
  const now = new Date().toISOString();
  const status = agendaEventStatuses.includes(input.status) ? input.status : existing.status || 'scheduled';
  const startDate = cleanDate(input.startDate) || cleanDate(existing.startDate) || todayDate();
  const endDate = cleanDate(input.endDate) || cleanDate(existing.endDate) || startDate;
  return {
    id: existing.id || cleanText(input.id, createId('agenda')),
    masterCompanyId: cleanText(input.masterCompanyId, existing.masterCompanyId || defaultMasterCompanyId),
    title: cleanText(input.title, 'Compromisso sem título').slice(0, 160),
    description: cleanText(input.description).slice(0, 700),
    clientId: cleanText(input.clientId),
    serviceId: cleanText(input.serviceId),
    clientServiceId: cleanText(input.clientServiceId),
    activityId: cleanText(input.activityId),
    resourceIds: cleanList(input.resourceIds),
    startDate,
    startTime: cleanText(input.startTime).slice(0, 5),
    endDate,
    endTime: cleanText(input.endTime).slice(0, 5),
    allDay: cleanBoolean(input.allDay),
    location: cleanText(input.location).slice(0, 180),
    color: cleanText(input.color, existing.color || '#2563eb').slice(0, 24),
    status,
    recurrence: agendaRecurrences.includes(input.recurrence) ? input.recurrence : existing.recurrence || 'none',
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

function cleanFinance(input = {}, existing = {}) {
  const now = new Date().toISOString();
  const status = financeStatuses.includes(input.status) ? input.status : 'open';
  const kind = input.kind === 'expense' ? 'expense' : 'income';
  return {
    id: existing.id || cleanText(input.id, createId('finance')),
    masterCompanyId: cleanText(input.masterCompanyId, existing.masterCompanyId || defaultMasterCompanyId),
    kind,
    clientId: cleanText(input.clientId),
    serviceId: kind === 'income' ? cleanText(input.serviceId) : '',
    clientServiceId: kind === 'income' ? cleanText(input.clientServiceId) : '',
    reference: cleanText(input.reference, kind === 'expense' ? 'Saída' : 'Mensalidade').slice(0, 140),
    dueDate: cleanDate(input.dueDate),
    amount: Math.max(0, cleanNumber(input.amount)),
    status,
    paidAt: status === 'paid' ? cleanDate(input.paidAt) || todayDate() : cleanDate(input.paidAt),
    invoiceNumber: cleanText(input.invoiceNumber).slice(0, 80),
    invoiceFile: input.invoiceFile === undefined ? existing.invoiceFile || null : safeFile(input.invoiceFile),
    boletoNumber: cleanText(input.boletoNumber).slice(0, 80),
    boletoFile: input.boletoFile === undefined ? existing.boletoFile || null : safeFile(input.boletoFile),
    notes: cleanText(input.notes).slice(0, 500),
    expectedKey: cleanText(input.expectedKey, existing.expectedKey || '').slice(0, 180),
    autoGenerated: input.autoGenerated === undefined ? cleanBoolean(existing.autoGenerated) : cleanBoolean(input.autoGenerated),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

async function cleanUser(input = {}, existing = {}) {
  const now = new Date().toISOString();
  const modulesInput = cleanList(input.permissions?.modules).filter((item) => modules.includes(item));
  const actionsInput = cleanList(input.permissions?.actions).filter((item) => actions.includes(item));
  const password = cleanText(input.password);
  const passwordHash = password ? await hashPassword(password) : existing.passwordHash;
  const status = ['active', 'inactive'].includes(input.status) ? input.status : existing.status || 'active';
  const signupRequestedAt = cleanText(input.signupRequestedAt, existing.signupRequestedAt || '').slice(0, 40);
  const approvalInput = cleanText(input.signupApprovalStatus, existing.signupApprovalStatus || '').toLowerCase();
  let signupApprovalStatus = signupApprovalStatuses.includes(approvalInput) ? approvalInput : '';
  if (signupRequestedAt && !signupApprovalStatus) signupApprovalStatus = status === 'active' ? 'approved' : 'pending';
  if (signupRequestedAt && status === 'active' && signupApprovalStatus === 'pending') signupApprovalStatus = 'approved';
  if (!passwordHash) {
    const error = new Error('Informe uma senha para o novo usuário.');
    error.status = 400;
    throw error;
  }
  return {
    id: existing.id || cleanText(input.id, createId('user')),
    masterCompanyId: cleanText(input.masterCompanyId, existing.masterCompanyId || defaultMasterCompanyId),
    userType: cleanText(input.userType, existing.userType || (isClientPortalUser(input) ? 'client' : 'team')).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60),
    name: cleanText(input.name, 'Usuário').slice(0, 120),
    email: cleanText(input.email).toLowerCase().slice(0, 160),
    role: cleanText(input.role, 'operator').slice(0, 60),
    status,
    passwordHash,
    permissions: {
      modules: modulesInput.length ? modulesInput : ['dashboard'],
      actions: actionsInput,
      allClients: cleanBoolean(input.permissions?.allClients),
      clientIds: cleanList(input.permissions?.clientIds),
      multiMasterAccess: cleanBoolean(input.permissions?.multiMasterAccess),
      masterCompanyIds: cleanList(input.permissions?.masterCompanyIds),
    },
    signupCompany: cleanText(input.signupCompany, existing.signupCompany || '').slice(0, 140),
    signupCnpj: cleanText(input.signupCnpj, existing.signupCnpj || '').slice(0, 24),
    signupRequestedAt,
    signupApprovalStatus,
    signupReviewedAt: cleanText(input.signupReviewedAt, existing.signupReviewedAt || '').slice(0, 40),
    signupReviewedBy: cleanText(input.signupReviewedBy, existing.signupReviewedBy || '').slice(0, 80),
    signupRejectionReason: cleanText(input.signupRejectionReason, existing.signupRejectionReason || '').slice(0, 300),
    theme: safeTheme(input.theme) || existing.theme || null,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

function validateClientServiceLink(store, user, item, options = {}) {
  if (options.requireClientService && (!item.clientServiceId || !item.serviceId)) {
    const error = new Error('Selecione um serviço contratado para a atividade.');
    error.status = 400;
    throw error;
  }
  const client = store.clients.find((clientItem) => clientItem.id === item.clientId);
  if (!client || !canAccessClient(user, item.clientId, store)) {
    const error = new Error('Você não tem acesso a este cliente.');
    error.status = 403;
    throw error;
  }
  const service = item.serviceId ? store.services.find((serviceItem) => serviceItem.id === item.serviceId) : null;
  if (item.serviceId && !service) {
    const error = new Error('Serviço não encontrado.');
    error.status = 404;
    throw error;
  }
  if (service && service.masterCompanyId !== client.masterCompanyId) {
    const error = new Error('O serviço não pertence à mesma empresa master do cliente.');
    error.status = 400;
    throw error;
  }
  if (item.clientServiceId) {
    const contract = store.clientServices.find((clientService) => clientService.id === item.clientServiceId);
    if (!contract || contract.clientId !== item.clientId) {
      const error = new Error('Serviço contratado não pertence ao cliente informado.');
      error.status = 400;
      throw error;
    }
    if (item.serviceId && contract.serviceId !== item.serviceId) {
      const error = new Error('O serviço informado não corresponde ao serviço contratado.');
      error.status = 400;
      throw error;
    }
    if (contract.masterCompanyId !== client.masterCompanyId) {
      const error = new Error('O serviço contratado não pertence à mesma empresa master do cliente.');
      error.status = 400;
      throw error;
    }
  }
}

function validateAgendaEvent(store, user, event) {
  if (event.clientId && !canAccessClient(user, event.clientId, store)) {
    const error = new Error('Você não pode criar agenda para este cliente.');
    error.status = 403;
    throw error;
  }
  const client = event.clientId ? store.clients.find((clientItem) => clientItem.id === event.clientId) : null;
  if (event.clientId && !client) {
    const error = new Error('Cliente não encontrado.');
    error.status = 404;
    throw error;
  }
  if (!event.clientId && !canAccessMasterCompany(user, event.masterCompanyId)) {
    const error = new Error('Você não tem acesso a esta empresa master.');
    error.status = 403;
    throw error;
  }
  const masterCompanyId = client?.masterCompanyId || event.masterCompanyId;
  if (event.serviceId) {
    const service = store.services.find((serviceItem) => serviceItem.id === event.serviceId);
    if (!service || service.masterCompanyId !== masterCompanyId) {
      const error = new Error('Serviço não pertence à empresa master da agenda.');
      error.status = 400;
      throw error;
    }
  }
  if (event.clientServiceId) {
    const contract = store.clientServices.find((clientService) => clientService.id === event.clientServiceId);
    if (!contract || contract.masterCompanyId !== masterCompanyId || (event.clientId && contract.clientId !== event.clientId)) {
      const error = new Error('Serviço contratado não pertence ao cliente da agenda.');
      error.status = 400;
      throw error;
    }
    if (event.serviceId && contract.serviceId !== event.serviceId) {
      const error = new Error('O serviço informado não corresponde ao serviço contratado.');
      error.status = 400;
      throw error;
    }
  }
  if (event.activityId) {
    const activity = store.activities.find((activityItem) => activityItem.id === event.activityId);
    if (!activity || activity.masterCompanyId !== masterCompanyId || (event.clientId && activity.clientId !== event.clientId)) {
      const error = new Error('Atividade não pertence ao cliente da agenda.');
      error.status = 400;
      throw error;
    }
  }
}

function agendaDateTimeLabel(event) {
  const date = cleanDate(event.startDate) || todayDate();
  const start = cleanText(event.startTime);
  const end = cleanText(event.endTime);
  if (event.allDay || !start) return `${date} - dia todo`;
  return `${date} ${start}${end ? `-${end}` : ''}`;
}

function activityFromAgendaEvent(event) {
  const dateTime = agendaDateTimeLabel(event);
  const description = [
    `Agendamento criado automaticamente pela agenda.`,
    `Dia e horario: ${dateTime}.`,
    event.location ? `Local: ${event.location}.` : '',
    event.description ? `Descricao da agenda: ${event.description}` : '',
  ].filter(Boolean).join('\n');
  return cleanActivity({
    masterCompanyId: event.masterCompanyId,
    title: event.title,
    description,
    clientId: event.clientId,
    serviceId: event.serviceId,
    clientServiceId: event.clientServiceId,
    resourceIds: event.resourceIds,
    status: 'planned',
    priority: 'media',
    startDate: event.startDate,
    dueDate: event.startDate,
    doneDate: '',
    color: '#7c3aed',
    tags: ['agenda'],
  });
}

function addMonthsDate(date, months) {
  const next = new Date(date.getTime());
  const targetMonth = next.getMonth() + months;
  const targetYear = next.getFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, month + 1, 0).getDate();
  return new Date(targetYear, month, Math.min(next.getDate(), lastDay));
}

function nextAgendaOccurrenceDate(event, activity) {
  const recurrence = cleanText(event.recurrence || 'none');
  if (recurrence === 'none') return '';
  const baseDate = cleanDate(activity?.startDate) || cleanDate(activity?.dueDate) || cleanDate(event.startDate);
  const date = baseDate ? new Date(`${baseDate}T00:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  if (recurrence === 'weekly') return new Date(date.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  if (recurrence === 'biweekly') return new Date(date.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  if (recurrence === 'monthly') return addMonthsDate(date, 1).toISOString().slice(0, 10);
  return '';
}

function activityFromAgendaOccurrence(event, previousActivity) {
  const nextDate = nextAgendaOccurrenceDate(event, previousActivity);
  if (!nextDate) return null;
  return activityFromAgendaEvent({
    ...event,
    startDate: nextDate,
    endDate: nextDate,
    activityId: '',
  });
}

function ensureNextRecurringActivityForCompletedActivity(store, previousActivity) {
  if (previousActivity.status !== 'done') return;
  const agendaIndex = (store.agendaEvents || []).findIndex((event) =>
    event.activityId === previousActivity.id && event.recurrence && event.recurrence !== 'none'
  );
  if (agendaIndex < 0) return;
  const event = store.agendaEvents[agendaIndex];
  if (!event.clientId) return;
  const nextActivity = activityFromAgendaOccurrence(event, previousActivity);
  if (!nextActivity) return;
  store.activities.push(nextActivity);
  store.agendaEvents[agendaIndex] = {
    ...event,
    activityId: nextActivity.id,
    updatedAt: new Date().toISOString(),
  };
}

function ensureActivityForAgendaEvent(store, agendaEvent) {
  if (agendaEvent.activityId || !agendaEvent.clientId) return agendaEvent;
  const activity = activityFromAgendaEvent(agendaEvent);
  store.activities.push(activity);
  return { ...agendaEvent, activityId: activity.id };
}

function bootstrapPayload(user, store) {
  const clientPortal = isClientPortalUser(user);
  const masterCompanies = filterMasterCompanies(user, store.masterCompanies || []);
  const clients =
    clientPortal || hasModule(user, 'clients') || hasModule(user, 'services') || hasModule(user, 'agenda') || hasModule(user, 'whatsapp') || hasModule(user, 'dashboard') || hasModule(user, 'reports')
      ? filterClients(user, store.clients)
      : [];
  const clientServices =
    clientPortal || hasModule(user, 'services') || hasModule(user, 'clients') || hasModule(user, 'agenda') || hasModule(user, 'finance') || hasModule(user, 'dashboard') || hasModule(user, 'reports')
      ? filterClientServices(user, store.clientServices, store.clients)
      : [];
  const services =
    clientPortal || hasModule(user, 'services') || hasModule(user, 'clients') || hasModule(user, 'activities') || hasModule(user, 'agenda') || hasModule(user, 'finance') || hasModule(user, 'dashboard') || hasModule(user, 'reports')
      ? filterServices(user, store.services, store.clientServices, store.clients)
      : [];
  const resources = hasModule(user, 'resources') || hasModule(user, 'activities') || hasModule(user, 'agenda') || hasModule(user, 'whatsapp') || hasModule(user, 'services') ? filterResources(user, store.resources, store.clients) : [];
  const activities =
    clientPortal || hasModule(user, 'activities') || hasModule(user, 'services') || hasModule(user, 'agenda') || hasModule(user, 'dashboard') || hasModule(user, 'reports')
      ? filterActivities(user, store.activities, store.clients)
      : [];
  const agendaEvents =
    hasModule(user, 'agenda') || hasModule(user, 'dashboard')
      ? filterAgendaEvents(user, store.agendaEvents, store.clients)
      : [];
  const finances =
    clientPortal || hasModule(user, 'finance') || hasModule(user, 'dashboard') || (hasModule(user, 'services') && hasAction(user, 'viewFinancialValues'))
      ? filterFinances(user, store.finances, store.clients)
      : [];
  // WhatsApp history can carry media-sized payloads; load it only through /api/whatsapp.
  const whatsappMessages = [];
  const visibleUsers = user.isMaster
    ? [masterAccount(store.settings?.defaultTheme), ...store.users]
    : store.users.filter((item) => canAccessMasterCompany(user, item.masterCompanyId));
  const users = isSystemAdmin(user) ? visibleUsers.map(publicUser) : [];
  const passwordResets = isSystemAdmin(user)
    ? (store.passwordResets || [])
      .filter((reset) => user.isMaster || canAccessMasterCompany(user, reset.masterCompanyId))
      .map(publicPasswordReset)
    : [];
  return {
    user: publicUser(user),
    masterCompanies,
    clients,
    services,
    clientServices,
    resources,
    activities,
    agendaEvents,
    whatsappMessages,
    finances: finances.map((record) => ({ ...record, status: statusForFinance(record) })),
    users,
    passwordResets,
    publicSettings: publicSettings(store),
    reports: hasModule(user, 'reports') || hasModule(user, 'dashboard')
      ? reportData({ clients, services, clientServices, resources, activities, finances })
      : null,
    options: { modules, actions, userTypes: userTypeOptions(store), activityStatuses, financeStatuses, agendaEventStatuses, agendaRecurrences, servicePeriodicities, clientServiceStatuses },
  };
}

function findEntity(store, collection, id) {
  const list = store[collection] || [];
  const index = list.findIndex((item) => item.id === id);
  return { list, index, item: index >= 0 ? list[index] : null };
}

function signupApprovalStatusFor(user) {
  const status = cleanText(user?.signupApprovalStatus).toLowerCase();
  if (signupApprovalStatuses.includes(status)) return status;
  if (!user?.signupRequestedAt) return '';
  return user.status === 'active' ? 'approved' : 'pending';
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'ponto-controle', store: storeBackend });
});

app.get('/api/public-settings', async (_req, res) => {
  const store = await readStore();
  res.set('Cache-Control', 'no-store').json(publicSettings(store));
});

app.get('/api/login-image', async (_req, res) => {
  const store = await readStore();
  const image = store.settings?.loginImage?.dataUrl ? store.settings.loginImage : null;
  const file = image ? fileFromDataUrl(image) : null;
  if (!file) {
    res.redirect(302, '/login-ponto-controle.png');
    return;
  }
  res
    .type(file.type)
    .set('Cache-Control', 'public, max-age=31536000, immutable')
    .send(file.buffer);
});

app.post('/api/session', async (req, res) => {
  const username = cleanText(req.body?.username).toLowerCase();
  const password = String(req.body?.password || '');
  const store = await readStore();
  let user = null;

  if (username === masterUser && password === masterPassword) {
    user = masterAccount(store.settings?.defaultTheme);
  } else {
    const found = store.users.find((item) => item.email.toLowerCase() === username);
    if (found && (await verifyPassword(password, found.passwordHash))) {
      const approvalStatus = signupApprovalStatusFor(found);
      if (approvalStatus === 'pending') {
        res.status(403).json({ message: 'Seu cadastro ainda está pendente de aprovação.' });
        return;
      }
      if (approvalStatus === 'rejected') {
        res.status(403).json({ message: 'Seu cadastro foi rejeitado pela administradora.' });
        return;
      }
      if (found.status === 'inactive') {
        res.status(403).json({ message: 'Usuário inativo.' });
        return;
      }
      user = found;
    }
  }

  if (!user) {
    res.status(401).json({ message: 'Usuário ou senha incorretos.' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  await saveSession(token, user.id, Date.now() + sessionHours * 60 * 60 * 1000);
  res.setHeader('Set-Cookie', sessionCookie(token, Math.round(sessionHours * 60 * 60)));
  res.json({ token, ...bootstrapPayload(user, store) });
});

app.delete('/api/session', async (req, res) => {
  const token = sessionTokenFromRequest(req);
  await deleteSession(token);
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ ok: true });
});

app.post('/api/client-signup', async (req, res) => {
  const store = await readStore();
  const email = cleanText(req.body?.email).toLowerCase();
  const cnpjDigits = onlyDigits(req.body?.cnpj);
  if (!email || !cleanText(req.body?.name) || !cleanText(req.body?.password)) {
    res.status(400).json({ message: 'Informe nome, email e senha.' });
    return;
  }
  if (email === masterUser || store.users.some((user) => user.email.toLowerCase() === email)) {
    res.status(409).json({ message: 'Já existe um usuário com este email.' });
    return;
  }

  const matchedClient = store.clients.find((client) =>
    (cnpjDigits && onlyDigits(client.cnpj) === cnpjDigits) || client.email.toLowerCase() === email,
  );
  try {
    const masterCompanyId = matchedClient?.masterCompanyId || defaultMasterCompanyId;
    const user = await cleanUser({
      masterCompanyId,
      userType: 'client',
      name: req.body.name,
      email,
      password: req.body.password,
      role: 'cliente',
      status: 'inactive',
      signupApprovalStatus: 'pending',
      permissions: {
        modules: ['dashboard', 'reports'],
        actions: [],
        allClients: false,
        clientIds: matchedClient ? [matchedClient.id] : [],
      },
    });
    store.users.push({
      ...user,
      signupCompany: cleanText(req.body?.company).slice(0, 140),
      signupCnpj: cleanText(req.body?.cnpj).slice(0, 24),
      signupRequestedAt: new Date().toISOString(),
      signupApprovalStatus: 'pending',
    });
    await writeStore(store);
    res.status(201).json({ message: 'Cadastro enviado para aprovação da administradora.' });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Não foi possível criar o cadastro.' });
  }
});

app.post('/api/password-reset/request', async (req, res) => {
  const store = await readStore();
  const email = cleanText(req.body?.email).toLowerCase();
  if (!email) {
    res.status(400).json({ message: 'Informe o email cadastrado.' });
    return;
  }

  const user = store.users.find((item) => item.email.toLowerCase() === email && item.status !== 'inactive');
  if (user) {
    const now = new Date().toISOString();
    const existingIndex = (store.passwordResets || []).findIndex(
      (reset) => reset.userId === user.id && ['pending', 'approved'].includes(reset.status) && !reset.usedAt,
    );
    const resetRequest = {
      id: existingIndex >= 0 ? store.passwordResets[existingIndex].id : createId('password-reset'),
      userId: user.id,
      userName: user.name,
      email: user.email,
      masterCompanyId: user.masterCompanyId,
      status: 'pending',
      code: '',
      requestedAt: now,
      reviewedAt: '',
      reviewedBy: '',
      expiresAt: '',
      usedAt: '',
      rejectedAt: '',
      updatedAt: now,
    };
    if (existingIndex >= 0) store.passwordResets[existingIndex] = resetRequest;
    else store.passwordResets.push(resetRequest);
    await writeStore(store);
  }

  res.json({ message: 'Solicitação enviada. Aguarde o código de recuperação informado pela administradora.' });
});

app.post('/api/password-reset/complete', async (req, res) => {
  const store = await readStore();
  const email = cleanText(req.body?.email).toLowerCase();
  const code = cleanText(req.body?.code).toUpperCase();
  const password = cleanText(req.body?.password);
  if (!email || !code || !password) {
    res.status(400).json({ message: 'Informe email, código e nova senha.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ message: 'A nova senha precisa ter pelo menos 6 caracteres.' });
    return;
  }

  const userIndex = store.users.findIndex((item) => item.email.toLowerCase() === email && item.status !== 'inactive');
  if (userIndex < 0) {
    res.status(400).json({ message: 'Código inválido ou expirado.' });
    return;
  }
  const user = store.users[userIndex];
  const now = new Date().toISOString();
  const resetIndex = (store.passwordResets || []).findIndex(
    (reset) =>
      reset.userId === user.id &&
      reset.status === 'approved' &&
      reset.code === code &&
      !reset.usedAt &&
      cleanText(reset.expiresAt) > now,
  );
  if (resetIndex < 0) {
    res.status(400).json({ message: 'Código inválido ou expirado.' });
    return;
  }

  store.users[userIndex] = {
    ...user,
    passwordHash: await hashPassword(password),
    updatedAt: now,
  };
  store.passwordResets[resetIndex] = {
    ...store.passwordResets[resetIndex],
    status: 'used',
    usedAt: now,
    updatedAt: now,
  };
  await deleteSessionsForUser(user.id);
  await writeStore(store);
  res.json({ message: 'Senha alterada. Entre novamente com a nova senha.' });
});

app.post('/api/whatsapp/webhook/:instanceName', async (req, res) => {
  try {
    const instanceName = cleanText(req.params.instanceName);
    const store = await readStore();
    const company = store.masterCompanies.find((item) => cleanText(item.whatsappInstanceName).toLowerCase() === instanceName.toLowerCase());
    if (!company) {
      res.status(404).json({ ok: false, message: 'Instância não encontrada.' });
      return;
    }
    const messages = extractWebhookMessages(req.body);
    messages.forEach((message) => {
      appendWhatsappMessage(store, {
        masterCompanyId: company.id,
        phone: message.phone,
        text: message.text,
        attachment: message.attachment,
        targetLabel: message.targetLabel || message.phone,
        source: 'webhook',
        status: message.direction === 'inbound' ? 'received' : 'sent',
        direction: message.direction,
        providerMessageId: message.providerMessageId,
      });
    });
    updateMasterCompanyWhatsapp(store, company.id, { whatsappLastState: 'open' });
    await writeStore(store);
    res.json({ ok: true, saved: messages.length });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || 'Webhook inválido.' });
  }
});

app.use('/api', requireAuth, attachUser);

app.get('/api/lookups/cnpj/:cnpj', async (req, res) => {
  const cnpj = onlyDigits(req.params.cnpj);
  if (cnpj.length !== 14) {
    res.status(400).json({ message: 'Informe um CNPJ com 14 dígitos.' });
    return;
  }
  try {
    const response = await fetch(`https://open.cnpja.com/office/${cnpj}`, {
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status === 404 ? 404 : 502).json({ message: payload?.message || 'CNPJ não encontrado.' });
      return;
    }
    const address = payload.address || {};
    const phone = Array.isArray(payload.phones) ? payload.phones[0] : null;
    const email = Array.isArray(payload.emails) ? payload.emails[0] : null;
    const company = payload.company || {};
    res.json({
      cnpj,
      name: company.name || '',
      tradeName: payload.alias || '',
      contactName: company.members?.[0]?.person?.name || '',
      email: email?.address || '',
      phone: phone ? `${phone.area || ''}${phone.number || ''}` : '',
      serviceType: payload.mainActivity?.text || '',
      address: [
        [address.street, address.number].filter(Boolean).join(', '),
        address.details,
        address.district,
        [address.city, address.state].filter(Boolean).join(' - '),
        address.zip ? `CEP ${address.zip}` : '',
      ].filter(Boolean).join('\n'),
      status: payload.status?.text || '',
    });
  } catch {
    res.status(502).json({ message: 'Não foi possível consultar o CNPJ.' });
  }
});

app.get('/api/bootstrap', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(bootstrapPayload(req.user, req.store));
});

app.put('/api/me/theme', async (req, res) => {
  const theme = safeTheme(req.body?.theme);
  if (!theme) {
    res.status(400).json({ message: 'Tema inválido.' });
    return;
  }
  const store = req.store;
  if (req.user.isMaster) {
    store.settings = { ...store.settings, defaultTheme: theme };
  } else {
    const { index } = findEntity(store, 'users', req.user.id);
    if (index >= 0) store.users[index] = { ...store.users[index], theme, updatedAt: new Date().toISOString() };
  }
  const saved = await writeStore(store);
  const currentUser = req.user.isMaster ? masterAccount(saved.settings?.defaultTheme) : saved.users.find((u) => u.id === req.user.id);
  res.json(bootstrapPayload(currentUser, saved));
});

app.put('/api/settings/login-image', requirePlatformAdmin, async (req, res) => {
  try {
    const loginImage = safeLoginImage(req.body?.loginImage);
    const store = req.store;
    store.settings = { ...store.settings, loginImage };
    const saved = await writeStore(store);
    const currentUser = req.user.isMaster ? masterAccount(saved.settings?.defaultTheme) : saved.users.find((user) => user.id === req.user.id) || req.user;
    res.json(bootstrapPayload(currentUser, saved));
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Não foi possível salvar a imagem do login.' });
  }
});

app.delete('/api/settings/login-image', requirePlatformAdmin, async (req, res) => {
  const store = req.store;
  store.settings = { ...store.settings, loginImage: null };
  const saved = await writeStore(store);
  const currentUser = req.user.isMaster ? masterAccount(saved.settings?.defaultTheme) : saved.users.find((user) => user.id === req.user.id) || req.user;
  res.json(bootstrapPayload(currentUser, saved));
});

app.post('/api/settings/user-types', requireMaster, async (req, res) => {
  const option = cleanUserTypeOption(req.body || {});
  if (!option) {
    res.status(400).json({ message: 'Informe um nome válido para o tipo de usuário.' });
    return;
  }
  if (systemUserTypes().some((item) => item.id === option.id)) {
    res.status(400).json({ message: 'Este tipo de usuário já existe como tipo do sistema.' });
    return;
  }
  const store = req.store;
  const existingTypes = Array.isArray(store.settings?.userTypes) ? store.settings.userTypes : [];
  if (existingTypes.some((item) => item.id === option.id)) {
    res.status(400).json({ message: 'Este tipo de usuário já existe.' });
    return;
  }
  store.settings = {
    ...store.settings,
    userTypes: [...existingTypes, { id: option.id, label: option.label }],
  };
  const saved = await writeStore(store);
  const currentUser = req.user.isMaster ? masterAccount(saved.settings?.defaultTheme) : saved.users.find((user) => user.id === req.user.id) || req.user;
  res.status(201).json(bootstrapPayload(currentUser, saved));
});

app.delete('/api/settings/user-types/:id', requireMaster, async (req, res) => {
  const id = slugId(req.params.id, '');
  if (!id || systemUserTypes().some((item) => item.id === id)) {
    res.status(400).json({ message: 'Tipos do sistema não podem ser removidos.' });
    return;
  }
  const store = req.store;
  const existingTypes = Array.isArray(store.settings?.userTypes) ? store.settings.userTypes : [];
  store.settings = {
    ...store.settings,
    userTypes: existingTypes.filter((item) => item.id !== id),
  };
  store.users = store.users.map((user) => (
    user.userType === id ? { ...user, userType: 'team', updatedAt: new Date().toISOString() } : user
  ));
  const saved = await writeStore(store);
  const currentUser = req.user.isMaster ? masterAccount(saved.settings?.defaultTheme) : saved.users.find((user) => user.id === req.user.id) || req.user;
  res.json(bootstrapPayload(currentUser, saved));
});

app.get('/api/clients', requireModule('clients'), (req, res) => {
  res.json({ clients: filterClients(req.user, req.store.clients) });
});

app.post('/api/clients', requireModule('clients'), requireAction('create'), async (req, res) => {
  const store = req.store;
  const masterCompanyId = effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId);
  const client = cleanClient({ ...req.body, masterCompanyId });
  store.clients.push(client);
  syncClientServicesFromClient(store, client, req.body?.clientServiceValues);
  if (Array.isArray(req.body?.linkedUserIds) && isSystemAdmin(req.user)) {
    syncClientUsersFromClient(store, client.id, req.body.linkedUserIds);
  }
  const saved = await writeStore(store);
  res.status(201).json(bootstrapPayload(req.user, saved));
});

app.put('/api/clients/:id', requireModule('clients'), requireAction('edit'), async (req, res) => {
  const store = req.store;
  const { index, item } = findEntity(store, 'clients', req.params.id);
  if (!item) {
    res.status(404).json({ message: 'Cliente não encontrado.' });
    return;
  }
  if (!canAccessClient(req.user, item.id, store)) {
    res.status(403).json({ message: 'Você não tem acesso a este cliente.' });
    return;
  }
  const masterCompanyId = req.user.isMaster ? effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId || item.masterCompanyId) : item.masterCompanyId;
  store.clients[index] = cleanClient({ ...req.body, masterCompanyId }, item);
  syncClientServicesFromClient(store, store.clients[index], req.body?.clientServiceValues);
  if (Array.isArray(req.body?.linkedUserIds) && isSystemAdmin(req.user)) {
    syncClientUsersFromClient(store, store.clients[index].id, req.body.linkedUserIds);
  }
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.delete('/api/clients/:id', requireModule('clients'), requireAction('delete'), async (req, res) => {
  if (!canAccessClient(req.user, req.params.id, req.store)) {
    res.status(403).json({ message: 'Você não tem acesso a este cliente.' });
    return;
  }
  const store = req.store;
  store.clients = store.clients.filter((client) => client.id !== req.params.id);
  store.clientServices = store.clientServices.filter((clientService) => clientService.clientId !== req.params.id);
  store.resources = store.resources.map((resource) => ({
    ...resource,
    clientIds: (resource.clientIds || []).filter((clientId) => clientId !== req.params.id),
  }));
  store.activities = store.activities.filter((activity) => activity.clientId !== req.params.id);
  store.agendaEvents = store.agendaEvents.filter((event) => event.clientId !== req.params.id);
  store.finances = store.finances.filter((finance) => finance.clientId !== req.params.id);
  store.salesRevenues = (store.salesRevenues || []).filter((record) => record.clientId !== req.params.id);
  store.users = store.users.map((user) => ({
    ...user,
    permissions: {
      ...user.permissions,
      clientIds: (user.permissions?.clientIds || []).filter((clientId) => clientId !== req.params.id),
    },
  }));
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.get('/api/services', requireModule('services'), (req, res) => {
  res.json({ services: filterServices(req.user, req.store.services, req.store.clientServices, req.store.clients) });
});

app.post('/api/services', requireModule('services'), requireAction('create'), async (req, res) => {
  const store = req.store;
  const masterCompanyId = effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId);
  const service = cleanService({ ...req.body, masterCompanyId });
  service.resourceIds = resourceIdsForMasterCompany(store, service.resourceIds, service.masterCompanyId);
  store.services.push(service);
  const saved = await writeStore(store);
  res.status(201).json(bootstrapPayload(req.user, saved));
});

app.put('/api/services/:id', requireModule('services'), requireAction('edit'), async (req, res) => {
  const store = req.store;
  const { index, item } = findEntity(store, 'services', req.params.id);
  if (!item) {
    res.status(404).json({ message: 'Serviço não encontrado.' });
    return;
  }
  if (!canAccessMasterCompany(req.user, item.masterCompanyId)) {
    res.status(403).json({ message: 'Você não tem acesso a este serviço.' });
    return;
  }
  const masterCompanyId = req.user.isMaster ? effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId || item.masterCompanyId) : item.masterCompanyId;
  const service = cleanService({ ...req.body, masterCompanyId }, item);
  service.resourceIds = resourceIdsForMasterCompany(store, service.resourceIds, service.masterCompanyId);
  if (item.status !== service.status && service.status === 'inactive' && !hasAction(req.user, 'inactivateServices')) {
    res.status(403).json({ message: 'Você não tem permissão para inativar serviços.' });
    return;
  }
  store.services[index] = service;
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.delete('/api/services/:id', requireModule('services'), requireAction('delete'), async (req, res) => {
  const store = req.store;
  const { item } = findEntity(store, 'services', req.params.id);
  if (!item) {
    res.status(404).json({ message: 'Serviço não encontrado.' });
    return;
  }
  if (!canAccessMasterCompany(req.user, item.masterCompanyId)) {
    res.status(403).json({ message: 'Você não tem acesso a este serviço.' });
    return;
  }
  store.services = store.services.filter((service) => service.id !== req.params.id);
  store.clientServices = store.clientServices.filter((clientService) => clientService.serviceId !== req.params.id);
  store.activities = store.activities.map((activity) => (
    activity.serviceId === req.params.id ? { ...activity, serviceId: '', clientServiceId: '' } : activity
  ));
  store.agendaEvents = store.agendaEvents.map((event) => (
    event.serviceId === req.params.id ? { ...event, serviceId: '', clientServiceId: '' } : event
  ));
  store.finances = store.finances.map((finance) => (
    finance.serviceId === req.params.id ? { ...finance, serviceId: '', clientServiceId: '' } : finance
  ));
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.get('/api/client-services', requireModule('services'), (req, res) => {
  res.json({ clientServices: filterClientServices(req.user, req.store.clientServices, req.store.clients) });
});

app.post('/api/client-services', requireModule('services'), async (req, res) => {
  if (!userHasAnyAction(req.user, ['linkServices', 'create'])) {
    res.status(403).json({ message: 'Você não tem permissão para vincular serviços a clientes.' });
    return;
  }
  const store = req.store;
  const clientService = cleanClientService(req.body);
  try {
    validateClientServiceLink(store, req.user, clientService);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
    return;
  }
  if (clientService.specificValue > 0 && !hasAction(req.user, 'changeServiceValues')) {
    res.status(403).json({ message: 'Você não tem permissão para alterar valores de serviços contratados.' });
    return;
  }
  const client = store.clients.find((item) => item.id === clientService.clientId);
  clientService.masterCompanyId = client.masterCompanyId;
  clientService.resourceIds = resourceIdsForMasterCompany(store, clientService.resourceIds, clientService.masterCompanyId);
  if (clientService.ownerResourceId && resourceIdsForMasterCompany(store, [clientService.ownerResourceId], clientService.masterCompanyId).length === 0) {
    clientService.ownerResourceId = '';
  }
  store.clientServices.push(clientService);
  const saved = await writeStore(store);
  res.status(201).json(bootstrapPayload(req.user, saved));
});

app.put('/api/client-services/:id', requireModule('services'), async (req, res) => {
  if (!userHasAnyAction(req.user, ['edit', 'linkServices', 'changeServiceValues'])) {
    res.status(403).json({ message: 'Você não tem permissão para alterar serviços contratados.' });
    return;
  }
  const store = req.store;
  const { index, item } = findEntity(store, 'clientServices', req.params.id);
  if (!item || !canAccessClient(req.user, item.clientId, store)) {
    res.status(404).json({ message: 'Serviço contratado não encontrado.' });
    return;
  }
  const clientService = cleanClientService(req.body, item);
  try {
    validateClientServiceLink(store, req.user, clientService);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
    return;
  }
  const valueChanged =
    cleanNumber(item.specificValue) !== cleanNumber(clientService.specificValue) ||
    Math.max(1, Math.trunc(cleanNumber(item.quantity, 1))) !== Math.max(1, Math.trunc(cleanNumber(clientService.quantity, 1)));
  if (valueChanged && !hasAction(req.user, 'changeServiceValues')) {
    res.status(403).json({ message: 'Você não tem permissão para alterar valores de serviços contratados.' });
    return;
  }
  if ((item.clientId !== clientService.clientId || item.serviceId !== clientService.serviceId) && !hasAction(req.user, 'linkServices')) {
    res.status(403).json({ message: 'Você não tem permissão para mudar o vínculo do serviço.' });
    return;
  }
  const client = store.clients.find((clientItem) => clientItem.id === clientService.clientId);
  clientService.masterCompanyId = client.masterCompanyId;
  clientService.resourceIds = resourceIdsForMasterCompany(store, clientService.resourceIds, clientService.masterCompanyId);
  if (clientService.ownerResourceId && resourceIdsForMasterCompany(store, [clientService.ownerResourceId], clientService.masterCompanyId).length === 0) {
    clientService.ownerResourceId = '';
  }
  store.clientServices[index] = clientService;
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.delete('/api/client-services/:id', requireModule('services'), requireAction('delete'), async (req, res) => {
  const store = req.store;
  const { item } = findEntity(store, 'clientServices', req.params.id);
  if (!item || !canAccessClient(req.user, item.clientId, store)) {
    res.status(404).json({ message: 'Serviço contratado não encontrado.' });
    return;
  }
  store.clientServices = store.clientServices.filter((clientService) => clientService.id !== req.params.id);
  store.activities = store.activities.map((activity) => (
    activity.clientServiceId === req.params.id ? { ...activity, clientServiceId: '' } : activity
  ));
  store.agendaEvents = store.agendaEvents.map((event) => (
    event.clientServiceId === req.params.id ? { ...event, clientServiceId: '' } : event
  ));
  store.finances = store.finances.map((finance) => (
    finance.clientServiceId === req.params.id ? { ...finance, clientServiceId: '' } : finance
  ));
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.get('/api/resources', requireModule('resources'), (req, res) => {
  res.json({ resources: filterResources(req.user, req.store.resources, req.store.clients) });
});

app.post('/api/resources', requireModule('resources'), requireAction('create'), async (req, res) => {
  const store = req.store;
  const masterCompanyId = effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId);
  const resource = cleanResource({ ...req.body, masterCompanyId });
  resource.clientIds = clientIdsForMasterCompany(store, resource.clientIds, masterCompanyId);
  if (!resource.clientIds.every((clientId) => canAccessClient(req.user, clientId, req.store))) {
    res.status(403).json({ message: 'Você não pode vincular esta pessoa a um cliente sem acesso.' });
    return;
  }
  store.resources.push(resource);
  const saved = await writeStore(store);
  res.status(201).json(bootstrapPayload(req.user, saved));
});

app.put('/api/resources/:id', requireModule('resources'), requireAction('edit'), async (req, res) => {
  const store = req.store;
  const { index, item } = findEntity(store, 'resources', req.params.id);
  if (!item) {
    res.status(404).json({ message: 'Pessoa não encontrada.' });
    return;
  }
  if (!canAccessMasterCompany(req.user, item.masterCompanyId)) {
    res.status(403).json({ message: 'Você não tem acesso a esta pessoa.' });
    return;
  }
  const masterCompanyId = req.user.isMaster ? effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId || item.masterCompanyId) : item.masterCompanyId;
  const next = cleanResource({ ...req.body, masterCompanyId }, item);
  next.clientIds = clientIdsForMasterCompany(store, next.clientIds, masterCompanyId);
  if (!next.clientIds.every((clientId) => canAccessClient(req.user, clientId, store))) {
    res.status(403).json({ message: 'Você não pode vincular esta pessoa a um cliente sem acesso.' });
    return;
  }
  store.resources[index] = next;
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.delete('/api/resources/:id', requireModule('resources'), requireAction('delete'), async (req, res) => {
  const store = req.store;
  const { item } = findEntity(store, 'resources', req.params.id);
  if (!item) {
    res.status(404).json({ message: 'Pessoa não encontrada.' });
    return;
  }
  if (!canAccessMasterCompany(req.user, item.masterCompanyId)) {
    res.status(403).json({ message: 'Você não tem acesso a esta pessoa.' });
    return;
  }
  store.resources = store.resources.filter((resource) => resource.id !== req.params.id);
  store.services = store.services.map((service) => ({
    ...service,
    resourceIds: (service.resourceIds || []).filter((resourceId) => resourceId !== req.params.id),
  }));
  store.clientServices = store.clientServices.map((clientService) => ({
    ...clientService,
    ownerResourceId: clientService.ownerResourceId === req.params.id ? '' : clientService.ownerResourceId,
    resourceIds: (clientService.resourceIds || []).filter((resourceId) => resourceId !== req.params.id),
  }));
  store.activities = store.activities.map((activity) => ({
    ...activity,
    resourceIds: (activity.resourceIds || []).filter((resourceId) => resourceId !== req.params.id),
  }));
  store.agendaEvents = store.agendaEvents.map((event) => ({
    ...event,
    resourceIds: (event.resourceIds || []).filter((resourceId) => resourceId !== req.params.id),
  }));
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.get('/api/activities', requireModule('activities'), (req, res) => {
  res.json({ activities: filterActivities(req.user, req.store.activities, req.store.clients) });
});

app.post('/api/activities', requireModule('activities'), requireAction('create'), async (req, res) => {
  const activity = cleanActivity(req.body);
  if (!canAccessClient(req.user, activity.clientId, req.store)) {
    res.status(403).json({ message: 'Você não pode criar atividade para este cliente.' });
    return;
  }
  const store = req.store;
  try {
    validateClientServiceLink(store, req.user, activity, { requireClientService: true });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
    return;
  }
  const client = store.clients.find((item) => item.id === activity.clientId);
  activity.masterCompanyId = client.masterCompanyId;
  activity.resourceIds = resourceIdsForMasterCompany(store, activity.resourceIds, activity.masterCompanyId);
  store.activities.push(activity);
  const saved = await writeStore(store);
  res.status(201).json(bootstrapPayload(req.user, saved));
});

app.put('/api/activities/:id', requireModule('activities'), requireAction('edit'), async (req, res) => {
  const store = req.store;
  const { index, item } = findEntity(store, 'activities', req.params.id);
  if (!item || !canAccessClient(req.user, item.clientId, store)) {
    res.status(404).json({ message: 'Atividade não encontrada.' });
    return;
  }
  const linkedAgenda = (store.agendaEvents || []).find((event) => event.activityId === item.id);
  const activity = cleanActivity(req.body, item);
  if (!canAccessClient(req.user, activity.clientId, store)) {
    res.status(403).json({ message: 'Você não pode mover atividade para este cliente.' });
    return;
  }
  try {
    validateClientServiceLink(store, req.user, activity, { requireClientService: !linkedAgenda });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
    return;
  }
  const client = store.clients.find((clientItem) => clientItem.id === activity.clientId);
  activity.masterCompanyId = client.masterCompanyId;
  activity.resourceIds = resourceIdsForMasterCompany(store, activity.resourceIds, activity.masterCompanyId);
  store.activities[index] = activity;
  ensureNextRecurringActivityForCompletedActivity(store, activity);
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.delete('/api/activities/:id', requireModule('activities'), requireAction('delete'), async (req, res) => {
  const store = req.store;
  const { item } = findEntity(store, 'activities', req.params.id);
  if (!item || !canAccessClient(req.user, item.clientId, store)) {
    res.status(404).json({ message: 'Atividade não encontrada.' });
    return;
  }
  store.activities = store.activities.filter((activity) => activity.id !== req.params.id);
  store.agendaEvents = store.agendaEvents.map((event) => (
    event.activityId === req.params.id ? { ...event, activityId: '' } : event
  ));
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.get('/api/agenda-events', requireModule('agenda'), (req, res) => {
  res.json({ agendaEvents: filterAgendaEvents(req.user, req.store.agendaEvents, req.store.clients) });
});

app.post('/api/agenda-events', requireModule('agenda'), requireAction('create'), async (req, res) => {
  const store = req.store;
  const masterCompanyId = effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId);
  const agendaEvent = cleanAgendaEvent({ ...req.body, masterCompanyId });
  try {
    validateAgendaEvent(store, req.user, agendaEvent);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
    return;
  }
  const client = agendaEvent.clientId ? store.clients.find((item) => item.id === agendaEvent.clientId) : null;
  agendaEvent.masterCompanyId = client?.masterCompanyId || masterCompanyId;
  agendaEvent.resourceIds = resourceIdsForMasterCompany(store, agendaEvent.resourceIds, agendaEvent.masterCompanyId);
  const linkedAgendaEvent = ensureActivityForAgendaEvent(store, agendaEvent);
  store.agendaEvents.push(linkedAgendaEvent);
  const saved = await writeStore(store);
  res.status(201).json(bootstrapPayload(req.user, saved));
});

app.put('/api/agenda-events/:id', requireModule('agenda'), requireAction('edit'), async (req, res) => {
  const store = req.store;
  const { index, item } = findEntity(store, 'agendaEvents', req.params.id);
  if (!item || filterAgendaEvents(req.user, [item], store.clients).length === 0) {
    res.status(404).json({ message: 'Evento da agenda não encontrado.' });
    return;
  }
  const masterCompanyId = req.user.isMaster ? effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId || item.masterCompanyId) : item.masterCompanyId;
  const agendaEvent = cleanAgendaEvent({ ...req.body, masterCompanyId }, item);
  try {
    validateAgendaEvent(store, req.user, agendaEvent);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
    return;
  }
  const client = agendaEvent.clientId ? store.clients.find((clientItem) => clientItem.id === agendaEvent.clientId) : null;
  agendaEvent.masterCompanyId = client?.masterCompanyId || masterCompanyId;
  agendaEvent.resourceIds = resourceIdsForMasterCompany(store, agendaEvent.resourceIds, agendaEvent.masterCompanyId);
  store.agendaEvents[index] = agendaEvent;
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.delete('/api/agenda-events/:id', requireModule('agenda'), async (req, res) => {
  const store = req.store;
  const { item } = findEntity(store, 'agendaEvents', req.params.id);
  if (!item || filterAgendaEvents(req.user, [item], store.clients).length === 0) {
    res.status(404).json({ message: 'Evento da agenda não encontrado.' });
    return;
  }
  store.agendaEvents = store.agendaEvents.filter((event) => event.id !== req.params.id);
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.get('/api/whatsapp', requireModule('whatsapp'), async (req, res) => {
  try {
    const company = whatsappCompanyForRequest(req, req.query?.masterCompanyId);
    const connector = await whatsappConnectorForCompany(company);
    if (connector.instanceName && company.whatsappCallsEnabled !== 'true') {
      await configureEvolutionSettings(connector.instanceName);
      updateMasterCompanyWhatsapp(req.store, company.id, { whatsappCallsEnabled: 'true' });
      await writeStore(req.store);
    }
    if (connector.instanceName && company.whatsappWebhookBase64 !== 'true') {
      await configureEvolutionWebhook(connector.instanceName);
      updateMasterCompanyWhatsapp(req.store, company.id, { whatsappWebhookBase64: 'true' });
      await writeStore(req.store);
    }
    res.json({
      connector,
      messages: filterWhatsappMessages(req.user, req.store.whatsappMessages, company.id),
      deletedMessages: filterDeletedWhatsappMessages(req.user, req.store.whatsappMessages, company.id),
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Não foi possível carregar o WhatsApp.' });
  }
});

app.put('/api/whatsapp/config', requireModule('whatsapp'), requireMaster, async (req, res) => {
  try {
    const store = req.store;
    const company = whatsappCompanyForRequest(req, req.body?.masterCompanyId);
    const instanceName = cleanText(req.body?.instanceName, suggestedWhatsappInstanceName(company))
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
    if (!instanceName) {
      res.status(400).json({ message: 'Informe o nome da instância do WhatsApp.' });
      return;
    }
    const updatedCompany = updateMasterCompanyWhatsapp(store, company.id, { whatsappInstanceName: instanceName });
    const saved = await writeStore(store);
    const connector = await whatsappConnectorForCompany(updatedCompany);
    res.json({
      connector,
      messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
      deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Não foi possível salvar a configuração do WhatsApp.' });
  }
});

app.post('/api/whatsapp/connect', requireModule('whatsapp'), async (req, res) => {
  try {
    const store = req.store;
    const company = whatsappCompanyForRequest(req, req.body?.masterCompanyId);
    const instanceNameInput = cleanText(req.body?.instanceName, company.whatsappInstanceName || suggestedWhatsappInstanceName(company))
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
    const ensured = await ensureEvolutionInstance(company, instanceNameInput);
    await configureEvolutionSettings(ensured.instanceName);
    await configureEvolutionWebhook(ensured.instanceName);
    const connectPayload = await connectEvolutionInstance(ensured.instanceName);
    const state = cleanText(connectPayload.raw?.instance?.state || connectPayload.raw?.state || ensured.instance?.state || 'connecting');
    updateMasterCompanyWhatsapp(store, company.id, {
      whatsappInstanceName: ensured.instanceName,
      whatsappLastState: state,
      whatsappCallsEnabled: 'true',
    });
    const saved = await writeStore(store);
    const updatedCompany = saved.masterCompanies.find((item) => item.id === company.id) || company;
    const connector = await whatsappConnectorForCompany(updatedCompany);
    res.json({
      connector,
      qrCode: connectPayload.qrCode,
      pairingCode: connectPayload.pairingCode,
      raw: connectPayload.raw,
      created: ensured.created,
      messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
      deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    });
  } catch (error) {
    res.status(error.status || 502).json({ message: error.message || 'Não foi possível conectar o WhatsApp.' });
  }
});

app.post('/api/whatsapp/disconnect', requireModule('whatsapp'), requireMaster, async (req, res) => {
  try {
    const store = req.store;
    const company = whatsappCompanyForRequest(req, req.body?.masterCompanyId);
    const instanceName = cleanText(company.whatsappInstanceName);
    if (!instanceName) {
      res.status(400).json({ message: 'Nenhuma instância configurada para esta empresa master.' });
      return;
    }
    await disconnectEvolutionInstance(instanceName);
    updateMasterCompanyWhatsapp(store, company.id, { whatsappLastState: 'close' });
    const saved = await writeStore(store);
    const updatedCompany = saved.masterCompanies.find((item) => item.id === company.id) || company;
    const connector = await whatsappConnectorForCompany(updatedCompany);
    res.json({
      connector,
      messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
      deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    });
  } catch (error) {
    res.status(error.status || 502).json({ message: error.message || 'Não foi possível desconectar o WhatsApp.' });
  }
});

app.post('/api/whatsapp/restart', requireModule('whatsapp'), requireMaster, async (req, res) => {
  try {
    const store = req.store;
    const company = whatsappCompanyForRequest(req, req.body?.masterCompanyId);
    const instanceName = cleanText(company.whatsappInstanceName);
    if (!instanceName) {
      res.status(400).json({ message: 'Nenhuma instância configurada para esta empresa master.' });
      return;
    }
    await restartEvolutionInstance(instanceName);
    updateMasterCompanyWhatsapp(store, company.id, { whatsappLastState: 'restarting' });
    const saved = await writeStore(store);
    const updatedCompany = saved.masterCompanies.find((item) => item.id === company.id) || company;
    const connector = await whatsappConnectorForCompany(updatedCompany);
    res.json({
      connector,
      messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
      deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    });
  } catch (error) {
    res.status(error.status || 502).json({ message: error.message || 'Não foi possível reiniciar o WhatsApp.' });
  }
});

app.post('/api/whatsapp/sync', requireModule('whatsapp'), requireMaster, async (req, res) => {
  try {
    const store = req.store;
    const company = whatsappCompanyForRequest(req, req.body?.masterCompanyId);
    const connector = await whatsappConnectorForCompany(company);
    if (!connector.evolutionEnabled || !connector.instanceName) {
      res.status(400).json({ message: 'Configure e conecte a instância do WhatsApp antes de sincronizar.', connector });
      return;
    }

    const chatsPayload = await fetchEvolutionChats(connector.instanceName);
    const remoteJids = payloadList(chatsPayload)
      .map((chat) => cleanText(chat.id || chat.remoteJid || chat.chatId || chat.key?.remoteJid))
      .filter(Boolean)
      .slice(0, 40);
    let imported = 0;

    for (const remoteJid of remoteJids) {
      const messagesPayload = await fetchEvolutionMessages(connector.instanceName, remoteJid).catch(() => null);
      payloadList(messagesPayload).forEach((item) => {
        const message = normalizeEvolutionStoredMessage(item);
        if (!message) return;
        appendWhatsappMessage(store, {
          masterCompanyId: company.id,
          phone: message.phone,
          text: message.text,
          attachment: message.attachment,
          targetLabel: message.targetLabel || message.phone,
          source: 'sync',
          status: message.direction === 'inbound' ? 'received' : 'sent',
          direction: message.direction,
          providerMessageId: message.providerMessageId,
          remoteJid: message.remoteJid,
          fromMe: message.fromMe,
        });
        imported += 1;
      });
    }

    updateMasterCompanyWhatsapp(store, company.id, { whatsappLastState: connector.state || 'open' });
    const saved = await writeStore(store);
    res.json({
      message: imported ? `Sincronização concluída com ${imported} mensagens encontradas.` : 'Nenhuma mensagem nova foi encontrada na Evolution.',
      connector: await whatsappConnectorForCompany(saved.masterCompanies.find((item) => item.id === company.id) || company),
      messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
      deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    });
  } catch (error) {
    res.status(error.status || 502).json({ message: error.message || 'Não foi possível sincronizar o histórico do WhatsApp.' });
  }
});

app.get('/api/whatsapp/contacts', requireModule('whatsapp'), async (req, res) => {
  try {
    const company = whatsappCompanyForRequest(req, req.query?.masterCompanyId);
    const connector = await whatsappConnectorForCompany(company);
    if (!connector.evolutionEnabled || !connector.instanceName) {
      res.status(400).json({ message: 'Configure e conecte a instância do WhatsApp antes de buscar contatos.', connector });
      return;
    }
    const search = cleanText(req.query?.search).toLowerCase();
    const digits = onlyDigits(search);
    const contactPayloads = [];
    if (digits) {
      contactPayloads.push(await fetchEvolutionContacts(connector.instanceName, `${digits}@s.whatsapp.net`).catch(() => null));
      if (digits.length <= 11) contactPayloads.push(await fetchEvolutionContacts(connector.instanceName, `55${digits}@s.whatsapp.net`).catch(() => null));
    }
    contactPayloads.push(await fetchEvolutionContacts(connector.instanceName, '').catch(() => null));
    const chatsPayload = await fetchEvolutionChats(connector.instanceName).catch(() => null);
    const contacts = uniqueContacts([
      ...contactPayloads.flatMap((payload) => payloadList(payload).map(normalizeEvolutionContact)),
      ...payloadList(chatsPayload).map(normalizeEvolutionContact),
    ])
      .filter(Boolean)
      .filter((contact) => {
        if (!search) return true;
        return `${contact.name} ${contact.phone} ${contact.id}`.toLowerCase().includes(search) || (digits && contact.phone.includes(digits));
      })
      .slice(0, 30);
    res.json({ contacts, connector });
  } catch (error) {
    res.status(error.status || 502).json({ message: error.message || 'Não foi possível buscar contatos do WhatsApp.' });
  }
});

app.put('/api/whatsapp/messages/:id', requireModule('whatsapp'), requireAction('edit'), async (req, res) => {
  try {
    const store = req.store;
    const messageIndex = store.whatsappMessages.findIndex((message) => message.id === req.params.id);
    const message = store.whatsappMessages[messageIndex];
    if (!message || message.deletedAt) {
      res.status(404).json({ message: 'Mensagem não encontrada.' });
      return;
    }
    const company = whatsappCompanyForRequest(req, message.masterCompanyId);
    const text = cleanText(req.body?.text).slice(0, 4000);
    if (!text) {
      res.status(400).json({ message: 'Digite o novo texto da mensagem.' });
      return;
    }
    const editOnWhatsapp = req.body?.editOnWhatsapp === true && message.direction !== 'inbound';
    if (editOnWhatsapp) await updateEvolutionMessage(company.whatsappInstanceName, message, text);
    store.whatsappMessages[messageIndex] = {
      ...message,
      originalText: message.originalText || message.text,
      text,
      status: editOnWhatsapp ? 'edited' : message.status,
      editedAt: new Date().toISOString(),
      editedBy: req.user.id,
      updatedAt: new Date().toISOString(),
    };
    const saved = await writeStore(store);
    res.json({
      message: editOnWhatsapp ? 'Mensagem editada no WhatsApp e no Ponto Controle.' : 'Mensagem editada no Ponto Controle.',
      connector: await whatsappConnectorForCompany(company),
      messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
      deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Não foi possível editar a mensagem.' });
  }
});

app.delete('/api/whatsapp/messages/:id', requireModule('whatsapp'), requireAction('delete'), async (req, res) => {
  try {
    const store = req.store;
    const messageIndex = store.whatsappMessages.findIndex((message) => message.id === req.params.id);
    const message = store.whatsappMessages[messageIndex];
    if (!message) {
      res.status(404).json({ message: 'Mensagem não encontrada.' });
      return;
    }
    const company = whatsappCompanyForRequest(req, message.masterCompanyId);
    const deleteForEveryone = req.query?.scope === 'everyone' && message.direction !== 'inbound';
    if (deleteForEveryone) await deleteEvolutionMessageForEveryone(company.whatsappInstanceName, message);
    store.whatsappMessages[messageIndex] = {
      ...message,
      status: deleteForEveryone ? 'deleted-for-everyone' : message.status,
      deletedAt: new Date().toISOString(),
      deletedBy: req.user.id,
      updatedAt: new Date().toISOString(),
    };
    const saved = await writeStore(store);
    res.json({
      message: deleteForEveryone ? 'Mensagem apagada para todos e enviada para a lixeira.' : 'Mensagem enviada para a lixeira.',
      connector: await whatsappConnectorForCompany(company),
      messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
      deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || 'Não foi possível apagar a mensagem.' });
  }
});

app.post('/api/whatsapp/messages/:id/restore', requireModule('whatsapp'), requireAction('edit'), async (req, res) => {
  const store = req.store;
  const messageIndex = store.whatsappMessages.findIndex((message) => message.id === req.params.id);
  const message = store.whatsappMessages[messageIndex];
  if (!message) {
    res.status(404).json({ message: 'Mensagem não encontrada.' });
    return;
  }
  const company = whatsappCompanyForRequest(req, message.masterCompanyId);
  store.whatsappMessages[messageIndex] = {
    ...message,
    deletedAt: '',
    deletedBy: '',
    restoredAt: new Date().toISOString(),
    restoredBy: req.user.id,
    updatedAt: new Date().toISOString(),
  };
  const saved = await writeStore(store);
  res.json({
    message: 'Mensagem restaurada no Ponto Controle.',
    connector: await whatsappConnectorForCompany(company),
    messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
  });
});

app.delete('/api/whatsapp/conversations/:phone', requireModule('whatsapp'), requireAction('delete'), async (req, res) => {
  const store = req.store;
  const phone = whatsappPhoneNumber(req.params.phone);
  const company = whatsappCompanyForRequest(req, req.query?.masterCompanyId);
  if (!phone) {
    res.status(400).json({ message: 'Conversa inválida.' });
    return;
  }
  const now = new Date().toISOString();
  let changed = 0;
  store.whatsappMessages = store.whatsappMessages.map((message) => {
    if (message.masterCompanyId !== company.id || whatsappPhoneNumber(message.phone) !== phone || message.deletedAt) return message;
    changed += 1;
    return { ...message, deletedAt: now, deletedBy: req.user.id, updatedAt: now };
  });
  const saved = await writeStore(store);
  res.json({
    message: changed ? 'Conversa enviada para a lixeira.' : 'Nenhuma mensagem ativa encontrada nessa conversa.',
    connector: await whatsappConnectorForCompany(company),
    messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
  });
});

app.post('/api/whatsapp/conversations/:phone/restore', requireModule('whatsapp'), requireAction('edit'), async (req, res) => {
  const store = req.store;
  const phone = whatsappPhoneNumber(req.params.phone);
  const company = whatsappCompanyForRequest(req, req.body?.masterCompanyId || req.query?.masterCompanyId);
  if (!phone) {
    res.status(400).json({ message: 'Conversa inválida.' });
    return;
  }
  const now = new Date().toISOString();
  let changed = 0;
  store.whatsappMessages = store.whatsappMessages.map((message) => {
    if (message.masterCompanyId !== company.id || whatsappPhoneNumber(message.phone) !== phone || !message.deletedAt) return message;
    changed += 1;
    return { ...message, deletedAt: '', deletedBy: '', restoredAt: now, restoredBy: req.user.id, updatedAt: now };
  });
  const saved = await writeStore(store);
  res.json({
    message: changed ? 'Conversa restaurada no Ponto Controle.' : 'Nenhuma mensagem da lixeira encontrada nessa conversa.',
    connector: await whatsappConnectorForCompany(company),
    messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
  });
});

app.post('/api/whatsapp/send', requireModule('whatsapp'), async (req, res) => {
  const store = req.store;
  const phone = req.body?.phone;
  const text = cleanText(req.body?.text).slice(0, 4000);
  const attachment = req.body?.attachment && typeof req.body.attachment === 'object' ? req.body.attachment : null;
  const client = cleanText(req.body?.clientId)
    ? store.clients.find((item) => item.id === cleanText(req.body.clientId))
    : null;
  let company;
  try {
    if (client) {
      if (!canAccessClient(req.user, client.id, store)) {
        res.status(403).json({ message: 'Você não tem acesso a este cliente.' });
        return;
      }
      company = whatsappCompanyForRequest(req, client.masterCompanyId);
    } else {
      company = whatsappCompanyForRequest(req, req.body?.masterCompanyId);
    }
    const connector = await whatsappConnectorForCompany(company);
    if (!connector.evolutionEnabled) {
      res.status(503).json({
        message: 'Evolution API não configurada no servidor.',
        fallbackUrl: whatsappFallbackUrl(phone, text),
        connector,
      });
      return;
    }
    if (!connector.instanceName) {
      res.status(400).json({ message: 'Configure a instância do WhatsApp antes de enviar mensagens.', connector });
      return;
    }
    if (!text && !attachment) {
      res.status(400).json({ message: 'Digite uma mensagem ou anexe um arquivo.', connector });
      return;
    }
    const result = attachment
      ? await sendEvolutionMediaMessage(connector.instanceName, phone, attachment, text)
      : await sendEvolutionTextMessage(connector.instanceName, phone, text);
    const logText = text || cleanText(attachment?.name, 'Arquivo enviado');
    const key = evolutionMessageKey(result, { phone, fromMe: true });
    appendWhatsappMessage(store, {
      masterCompanyId: company.id,
      phone,
      text: logText,
      targetLabel: req.body?.targetLabel,
      source: req.body?.source || 'manual',
      status: 'sent',
      providerMessageId: key.id,
      remoteJid: key.remoteJid,
      fromMe: true,
    });
    updateMasterCompanyWhatsapp(store, company.id, {
      whatsappInstanceName: connector.instanceName,
      whatsappLastState: connector.state || 'open',
    });
    const saved = await writeStore(store);
    res.json({
      message: 'Mensagem enviada pelo WhatsApp.',
      result,
      fallbackUrl: whatsappFallbackUrl(phone, text),
      connector: await whatsappConnectorForCompany(saved.masterCompanies.find((item) => item.id === company.id) || company),
      messages: filterWhatsappMessages(req.user, saved.whatsappMessages, company.id),
      deletedMessages: filterDeletedWhatsappMessages(req.user, saved.whatsappMessages, company.id),
    });
  } catch (error) {
    if (company) {
      appendWhatsappMessage(store, {
        masterCompanyId: company.id,
        phone,
        text: text || cleanText(attachment?.name, 'Arquivo enviado'),
        targetLabel: req.body?.targetLabel,
        source: req.body?.source || 'manual',
        status: 'failed',
        error: error.message,
      });
      await writeStore(store).catch(() => null);
    }
    res.status(error.status && error.status < 500 ? error.status : 502).json({
      message: error.message || 'Não foi possível enviar a mensagem pelo WhatsApp.',
      fallbackUrl: whatsappFallbackUrl(phone, text),
    });
  }
});

app.get('/api/finances', requireModule('finance'), (req, res) => {
  res.json({ finances: filterFinances(req.user, req.store.finances, req.store.clients).map((record) => ({ ...record, status: statusForFinance(record) })) });
});

app.post('/api/finances', requireModule('finance'), requireAction('create'), async (req, res) => {
  const finance = cleanFinance(req.body);
  if (finance.kind !== 'expense' && !canAccessClient(req.user, finance.clientId, req.store)) {
    res.status(403).json({ message: 'Você não pode lançar financeiro para este cliente.' });
    return;
  }
  const store = req.store;
  if (finance.kind !== 'expense') {
    try {
      validateClientServiceLink(store, req.user, finance);
    } catch (error) {
      res.status(error.status || 400).json({ message: error.message });
      return;
    }
  }
  const client = store.clients.find((item) => item.id === finance.clientId);
  if (finance.kind !== 'expense' && !client) {
    res.status(400).json({ message: 'Informe o cliente da entrada.' });
    return;
  }
  finance.masterCompanyId = finance.kind === 'expense'
    ? effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId)
    : client.masterCompanyId;
  store.finances.push(finance);
  const saved = await writeStore(store);
  res.status(201).json(bootstrapPayload(req.user, saved));
});

app.put('/api/finances/:id', requireModule('finance'), requireAction('edit'), async (req, res) => {
  const store = req.store;
  const { index, item } = findEntity(store, 'finances', req.params.id);
  if (!item || !canAccessClient(req.user, item.clientId, store)) {
    res.status(404).json({ message: 'Lançamento financeiro não encontrado.' });
    return;
  }
  const finance = cleanFinance(req.body, item);
  if (finance.kind !== 'expense' && !canAccessClient(req.user, finance.clientId, store)) {
    res.status(403).json({ message: 'Você não pode mover financeiro para este cliente.' });
    return;
  }
  if (finance.kind !== 'expense') {
    try {
      validateClientServiceLink(store, req.user, finance);
    } catch (error) {
      res.status(error.status || 400).json({ message: error.message });
      return;
    }
  }
  const client = store.clients.find((clientItem) => clientItem.id === finance.clientId);
  if (finance.kind !== 'expense' && !client) {
    res.status(400).json({ message: 'Informe o cliente da entrada.' });
    return;
  }
  finance.masterCompanyId = finance.kind === 'expense'
    ? effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId || item.masterCompanyId)
    : client.masterCompanyId;
  store.finances[index] = finance;
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.delete('/api/finances/:id', requireModule('finance'), requireAction('delete'), async (req, res) => {
  const store = req.store;
  const { item } = findEntity(store, 'finances', req.params.id);
  if (!item || !canAccessClient(req.user, item.clientId, store)) {
    res.status(404).json({ message: 'Lançamento financeiro não encontrado.' });
    return;
  }
  store.finances = store.finances.filter((finance) => finance.id !== req.params.id);
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.post('/api/finances/:id/pay', requireModule('finance'), requireAction('markPaid'), async (req, res) => {
  const store = req.store;
  const { index, item } = findEntity(store, 'finances', req.params.id);
  if (!item || !canAccessClient(req.user, item.clientId, store)) {
    res.status(404).json({ message: 'Lançamento financeiro não encontrado.' });
    return;
  }
  store.finances[index] = { ...item, status: 'paid', paidAt: cleanDate(req.body?.paidAt) || todayDate(), updatedAt: new Date().toISOString() };
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.post('/api/master-companies', requireMaster, async (req, res) => {
  if (!req.user.isMaster) {
    res.status(403).json({ message: 'Apenas a administradora principal pode criar empresas master.' });
    return;
  }
  const store = req.store;
  if (!cleanText(req.body?.name)) {
    res.status(400).json({ message: 'Informe o nome da empresa master.' });
    return;
  }
  const masterCompany = cleanMasterCompany(req.body);
  if (store.masterCompanies.some((company) => company.name.toLowerCase() === masterCompany.name.toLowerCase())) {
    res.status(409).json({ message: 'Já existe empresa master com este nome.' });
    return;
  }
  store.masterCompanies.push(masterCompany);
  const saved = await writeStore(store);
  res.status(201).json(bootstrapPayload(req.user, saved));
});

app.put('/api/master-companies/:id', requireMaster, async (req, res) => {
  if (!req.user.isMaster) {
    res.status(403).json({ message: 'Apenas a administradora principal pode editar empresas master.' });
    return;
  }
  const store = req.store;
  const { index, item } = findEntity(store, 'masterCompanies', req.params.id);
  if (!item) {
    res.status(404).json({ message: 'Empresa master não encontrada.' });
    return;
  }
  if (!cleanText(req.body?.name)) {
    res.status(400).json({ message: 'Informe o nome da empresa master.' });
    return;
  }
  store.masterCompanies[index] = cleanMasterCompany(req.body, item);
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.get('/api/users', requireMaster, (req, res) => {
  const users = req.user.isMaster
    ? [masterAccount(req.store.settings?.defaultTheme), ...req.store.users]
    : req.store.users.filter((user) => canAccessMasterCompany(req.user, user.masterCompanyId));
  res.json({ users: users.map(publicUser) });
});

app.post('/api/users', requireMaster, async (req, res) => {
  const store = req.store;
  const masterCompanyId = effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId);
  const allowedClientIds = new Set(store.clients.filter((client) => client.masterCompanyId === masterCompanyId).map((client) => client.id));
  const clientIds = cleanList(req.body?.permissions?.clientIds).filter((clientId) => allowedClientIds.has(clientId));
  const user = await cleanUser({
    ...req.body,
    masterCompanyId,
    permissions: {
      ...(req.body?.permissions || {}),
      clientIds,
    },
  });
  if (!user.email) {
    res.status(400).json({ message: 'Informe o email do usuário.' });
    return;
  }
  if (store.users.some((item) => item.email.toLowerCase() === user.email.toLowerCase())) {
    res.status(409).json({ message: 'Já existe usuário com este email.' });
    return;
  }
  store.users.push(user);
  const saved = await writeStore(store);
  res.status(201).json(bootstrapPayload(req.user, saved));
});

app.put('/api/users/:id/signup-approval', requireMaster, async (req, res) => {
  if (req.params.id === 'master') {
    res.status(400).json({ message: 'A senha master não possui cadastro de cliente para aprovação.' });
    return;
  }
  const approvalStatus = cleanText(req.body?.status).toLowerCase();
  if (!['approved', 'rejected'].includes(approvalStatus)) {
    res.status(400).json({ message: 'Informe aprovado ou rejeitado para o cadastro.' });
    return;
  }
  const store = req.store;
  const { index, item } = findEntity(store, 'users', req.params.id);
  if (!item || !item.signupRequestedAt) {
    res.status(404).json({ message: 'Solicitação de cadastro não encontrada.' });
    return;
  }
  if (!canAccessMasterCompany(req.user, item.masterCompanyId)) {
    res.status(403).json({ message: 'Você não tem acesso a este cadastro.' });
    return;
  }
  const now = new Date().toISOString();
  store.users[index] = {
    ...item,
    status: approvalStatus === 'approved' ? 'active' : 'inactive',
    signupApprovalStatus: approvalStatus,
    signupReviewedAt: now,
    signupReviewedBy: req.user.id,
    signupRejectionReason: approvalStatus === 'rejected' ? cleanText(req.body?.reason).slice(0, 300) : '',
    updatedAt: now,
  };
  const saved = await writeStore(store);
  const currentUser = req.user.isMaster ? masterAccount(saved.settings?.defaultTheme) : saved.users.find((user) => user.id === req.user.id) || req.user;
  res.json(bootstrapPayload(currentUser, saved));
});

app.put('/api/password-reset-requests/:id/approve', requireMaster, async (req, res) => {
  const store = req.store;
  const { index, item } = findEntity(store, 'passwordResets', req.params.id);
  if (!item) {
    res.status(404).json({ message: 'Solicitação de recuperação não encontrada.' });
    return;
  }
  if (!canAccessMasterCompany(req.user, item.masterCompanyId)) {
    res.status(403).json({ message: 'Você não tem acesso a esta solicitação.' });
    return;
  }
  const now = new Date();
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  store.passwordResets[index] = {
    ...item,
    status: 'approved',
    code,
    reviewedAt: now.toISOString(),
    reviewedBy: req.user.id,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    rejectedAt: '',
    usedAt: '',
    updatedAt: now.toISOString(),
  };
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.put('/api/password-reset-requests/:id/reject', requireMaster, async (req, res) => {
  const store = req.store;
  const { index, item } = findEntity(store, 'passwordResets', req.params.id);
  if (!item) {
    res.status(404).json({ message: 'Solicitação de recuperação não encontrada.' });
    return;
  }
  if (!canAccessMasterCompany(req.user, item.masterCompanyId)) {
    res.status(403).json({ message: 'Você não tem acesso a esta solicitação.' });
    return;
  }
  const now = new Date().toISOString();
  store.passwordResets[index] = {
    ...item,
    status: 'rejected',
    code: '',
    rejectedAt: now,
    reviewedAt: now,
    reviewedBy: req.user.id,
    expiresAt: '',
    updatedAt: now,
  };
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.put('/api/users/:id', requireMaster, async (req, res) => {
  if (req.params.id === 'master') {
    res.status(400).json({ message: 'A senha master é configurada no ambiente do servidor.' });
    return;
  }
  const store = req.store;
  const { index, item } = findEntity(store, 'users', req.params.id);
  if (!item) {
    res.status(404).json({ message: 'Usuário não encontrado.' });
    return;
  }
  if (!canAccessMasterCompany(req.user, item.masterCompanyId)) {
    res.status(403).json({ message: 'Você não tem acesso a este usuário.' });
    return;
  }
  const masterCompanyId = req.user.isMaster ? effectiveMasterCompanyId(store, req.user, req.body?.masterCompanyId || item.masterCompanyId) : item.masterCompanyId;
  const allowedClientIds = new Set(store.clients.filter((client) => client.masterCompanyId === masterCompanyId).map((client) => client.id));
  const clientIds = cleanList(req.body?.permissions?.clientIds).filter((clientId) => allowedClientIds.has(clientId));
  store.users[index] = await cleanUser({
    ...req.body,
    masterCompanyId,
    permissions: {
      ...(req.body?.permissions || {}),
      clientIds,
    },
  }, item);
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.delete('/api/users/:id', requireMaster, async (req, res) => {
  if (req.params.id === 'master') {
    res.status(400).json({ message: 'A senha master não pode ser removida.' });
    return;
  }
  const store = req.store;
  const { item } = findEntity(store, 'users', req.params.id);
  if (!item || !canAccessMasterCompany(req.user, item.masterCompanyId)) {
    res.status(404).json({ message: 'Usuário não encontrado.' });
    return;
  }
  store.users = store.users.filter((user) => user.id !== req.params.id);
  const saved = await writeStore(store);
  res.json(bootstrapPayload(req.user, saved));
});

app.get('/api/reports', requireModule('reports'), (req, res) => {
  const clients = filterClients(req.user, req.store.clients);
  const clientServices = filterClientServices(req.user, req.store.clientServices, req.store.clients);
  const services = filterServices(req.user, req.store.services, req.store.clientServices, req.store.clients);
  const resources = filterResources(req.user, req.store.resources, req.store.clients);
  const activities = filterActivities(req.user, req.store.activities, req.store.clients);
  const finances = filterFinances(req.user, req.store.finances, req.store.clients);
  res.json({ reports: reportData({ clients, services, clientServices, resources, activities, finances }) });
});

app.get('/sitemap.xml', (_req, res) => {
  const today = todayDate();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(`${siteUrl}/`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  res.type('application/xml').set('Cache-Control', 'no-cache').send(xml);
});

app.get('/robots.txt', (_req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', 'no-cache')
    .send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`);
});

app.use(
  express.static(staticDir, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (/\.(?:png|jpe?g|webp|gif|svg|ico|webmanifest)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ message: 'Endereço não encontrado.' });
    return;
  }
  fs.readFile(path.join(staticDir, 'index.html'), 'utf8')
    .then((html) => res.set('Cache-Control', 'no-cache').send(html))
    .catch(() => res.status(500).send('Nao foi possivel carregar o Ponto Controle.'));
});

await readStore();

app.listen(port, () => {
  console.log(`Ponto Controle listening on ${port}`);
});

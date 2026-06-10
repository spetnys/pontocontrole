import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import tls from "node:tls";
import next from "next";
import { parse as parseUrl } from "node:url";

import {
  DEFAULT_AI_LINKS,
  createDefaultSetupForGabinete,
  createUserWithPassword,
  generateDocumentCode,
  generateTicketCode,
  getRoleLabel,
  initDatabase,
} from "./db/database.js";
import { createSessionToken, hashPassword, verifyPassword } from "./lib/auth.js";
import { WORKSPACE_MODULE_KEYS, normalizeWorkspaceModuleConfig } from "../lib/workspace-modules.js";
import {
  clearCookie,
  notFound,
  parseBody,
  parseCookies,
  parseMultipart,
  readPublicFile,
  redirect,
  sendJson,
  sendHtml,
  serveStatic,
  setCookie,
} from "./lib/http.js";
import {
  buildImportPreviewAnalysis,
  buildImportReport,
  detectContactDuplicateSuggestions,
  importFields,
  parseSpreadsheetFile,
  suggestMapping,
} from "./lib/importer.js";
import {
  formatDate,
  formatPhone,
  getCpfCnpjValidationMessage,
  inferBrazilianAreaCode,
  isValidCnpj,
  isValidCpf,
  nowIso,
  normalizeCpf,
  normalizePhone,
  phoneLookupCandidates,
  parseInteger,
  slugify,
  toInputDate,
} from "./lib/helpers.js";
import { renderAppPage, renderGuestPage } from "./views/layout.js";
import {
  adminGabinetesPage,
  contactDetailPage,
  contactFormPage,
  contactsPage,
  dashboardPage,
  documentDetailPage,
  documentFormPage,
  documentsPage,
  auditPage,
  importsPage,
  loginPage,
  notificationsPage,
  onboardingPage,
  placeholderPage,
  modelTemplatesPage,
  projectFormPage,
  projectsPage,
  registerGabinetePage,
  reportsPage,
  searchPage,
  settingsPage,
  taskFormPage,
  tasksPage,
  ticketDetailPage,
  ticketFormPage,
  ticketsPage,
  usersPage,
} from "./views/pages.js";

const db = initDatabase();
const APP_TIME_ZONE = process.env.TZ || "America/Sao_Paulo";
const APP_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const PORT = Number(process.env.PORT || 3000);
const nextApp = next({
  dev: process.env.NODE_ENV !== "production",
  dir: process.cwd(),
});
await nextApp.prepare();
const nextHandle = nextApp.getRequestHandler();
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const LEGISLATIVE_DAILY_SYNC_MS = 24 * 60 * 60 * 1000;
const LEGISLATIVE_DUE_CHECK_MS = 60 * 60 * 1000;
const LEGISLATIVE_DETAIL_FETCH_LIMIT = Number(process.env.LEGISLATIVE_DETAIL_FETCH_LIMIT || 60);
const SUPPORT_WHATSAPP_PHONE = "5519993696718";
const SUPPORT_WHATSAPP_PRETTY = "+55 19 99369-6718";
const SUPPORT_WHATSAPP_MESSAGE = "Olá, gostaria de conversar sobre o Gabinete360";
const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_PHONE}?text=${encodeURIComponent(SUPPORT_WHATSAPP_MESSAGE)}`;
const PROMPT_REPORT_REVIEW_THRESHOLD = 3;
const PROMPT_REPORT_HIDE_THRESHOLD = 5;
const PROMPT_REPORT_REASONS = new Set([
  "personal_data",
  "unsafe_or_illegal",
  "inappropriate",
  "spam_duplicate",
  "broken",
  "other",
]);
const PROMPT_REPORT_SEVERE_REASONS = new Set(["personal_data", "unsafe_or_illegal"]);
const UI_THEME_MODES = new Set(["light", "dark"]);
const UI_THEME_PALETTES = new Set([
  "azul",
  "ciano",
  "verde",
  "menta",
  "salvia",
  "vermelho",
  "rosa",
  "roxo",
  "lavanda",
  "amarelo",
  "pessego",
  "grafite",
]);
const MODULE_PERMISSION_ACTIONS = ["view", "create", "edit", "delete"];
const WORKSPACE_MODULE_KEY_SET = new Set(WORKSPACE_MODULE_KEYS);
const SUPPORT_EMAIL_ADDRESS = String(process.env.SUPPORT_EMAIL_ADDRESS || "suporte@guiapj.com.br").trim();
const EMAIL_POP_HOST = String(process.env.EMAIL_POP_HOST || "").trim();
const EMAIL_POP_PORT = Number(process.env.EMAIL_POP_PORT || 0);
const EMAIL_POP_SECURE = String(process.env.EMAIL_POP_SECURE || "1").trim() !== "0";
const EMAIL_POP_USERNAME = String(process.env.EMAIL_POP_USERNAME || "").trim();
const EMAIL_POP_PASSWORD = String(process.env.EMAIL_POP_PASSWORD || "").trim();
const EMAIL_SMTP_HOST = String(process.env.EMAIL_SMTP_HOST || "").trim();
const EMAIL_SMTP_PORT = Number(process.env.EMAIL_SMTP_PORT || 0);
const EMAIL_SMTP_SECURE = String(process.env.EMAIL_SMTP_SECURE || "1").trim() !== "0";
const EMAIL_SMTP_USERNAME = String(process.env.EMAIL_SMTP_USERNAME || "").trim();
const EMAIL_SMTP_PASSWORD = String(process.env.EMAIL_SMTP_PASSWORD || "").trim();
const SUPPORT_EMAIL_MAILBOX_READY = Boolean(
  SUPPORT_EMAIL_ADDRESS &&
    EMAIL_POP_HOST &&
    EMAIL_POP_PORT &&
    EMAIL_POP_SECURE &&
    EMAIL_POP_USERNAME &&
    EMAIL_POP_PASSWORD &&
    EMAIL_SMTP_HOST &&
    EMAIL_SMTP_PORT &&
    EMAIL_SMTP_SECURE &&
    EMAIL_SMTP_USERNAME &&
    EMAIL_SMTP_PASSWORD,
);
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_SUMMARY_MODEL = String(process.env.OPENAI_SUMMARY_MODEL || process.env.OPENAI_MODEL || "gpt-5").trim();
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 48;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;
const PASSWORD_RESET_REQUEST_LIMIT = 5;
const PASSWORD_RESET_REQUEST_WINDOW_MS = 1000 * 60 * 15;
const PASSWORD_RESET_REQUEST_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const CONSULTARIO_TOKEN = String(process.env.CONSULTARIO_TOKEN || "").trim();
const CONSULTARIO_BASE_URL = "https://consultar.io/api";
const INVERTEXTO_TOKEN = String(process.env.INVERTEXTO_TOKEN || "").trim();
const INVERTEXTO_BASE_URL = "https://api.invertexto.com";
const RECEITAWS_TOKEN = String(process.env.RECEITAWS_TOKEN || "").trim();
const CNPJBIZ_TOKEN = String(process.env.CNPJBIZ_TOKEN || "").trim();
const GOOGLE_OAUTH_CLIENT_ID = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const GOOGLE_OAUTH_CLIENT_SECRET = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
const GOOGLE_OAUTH_REDIRECT_URI = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim();
const EVOLUTION_BASE_URL = String(process.env.EVOLUTION_BASE_URL || "").trim().replace(/\/+$/, "");
const EVOLUTION_MANAGER_URL = String(process.env.EVOLUTION_MANAGER_URL || "").trim();
const EVOLUTION_GLOBAL_API_KEY = String(process.env.EVOLUTION_GLOBAL_API_KEY || "").trim();
const WHATSAPP_QR_RENEW_INTERVAL_MS = 60 * 1000;
const WHATSAPP_QR_COOLDOWNS = new Map();
const GOOGLE_OAUTH_STATE_COOKIE = "g360_google_oauth_state";
const GOOGLE_OAUTH_PENDING_COOKIE = "g360_google_pending";
const GOOGLE_OAUTH_SCOPES = "openid email profile";
const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SLOW_REQUEST_LOG_MS = Number(process.env.SLOW_REQUEST_LOG_MS || 900);
const LOOKUP_CACHE = {
  ufs: null,
  municipalities: new Map(),
  cep: new Map(),
  cnpj: new Map(),
  cpf: new Map(),
};
const PERSISTENT_UPLOAD_DIR = resolve(process.cwd(), "data", "uploads");
const LEGACY_PUBLIC_UPLOAD_DIR = resolve(process.cwd(), "public", "uploads");
const PUBLIC_UPLOAD_URL_PREFIX = "/uploads";
const PUBLIC_SELF_REGISTER_UPLOAD_DIR = resolve(PERSISTENT_UPLOAD_DIR, "autocadastro");
const PUBLIC_SELF_REGISTER_INTRO_MAX_LENGTH = 280;
const PUBLIC_SELF_REGISTER_NAME_MAX_LENGTH = 60;
const CONTACT_NAME_MAX_LENGTH = 60;
const CONTACT_NICKNAME_MAX_LENGTH = 30;
const GABINETE_NAME_MAX_LENGTH = 120;
const GABINETE_DISPLAY_NAME_MAX_LENGTH = 80;
const PUBLIC_AI_TEXT_RATE_WINDOW_MS = 10 * 60 * 1000;
const PUBLIC_AI_TEXT_RATE_LIMIT = 3;
const DEFAULT_PUBLIC_SELF_REGISTER_INTRO =
  "Explique o que aconteceu e qual ajuda voce precisa.";
const PUBLIC_SELF_REGISTER_FIELD_KEYS = [
  "name",
  "whatsapp",
  "phone",
  "cpf_rg_cns",
  "birth_date",
  "email",
  "profession",
  "referred_by",
  "zip_code",
  "neighborhood",
  "address",
  "number",
  "complement",
  "city",
  "uf",
  "demand_title",
  "demand_category",
  "description",
  "attachment",
  "notes",
];
const PUBLIC_SELF_REGISTER_FIELD_MODES = new Set(["hidden", "optional", "required"]);
const PUBLIC_SELF_REGISTER_EMAIL_VALIDATIONS = new Set(["none", "format"]);
const PUBLIC_SELF_REGISTER_CONFIRMATION_CHANNELS = new Set(["none", "email", "whatsapp"]);
const PUBLIC_SELF_REGISTER_CONTACT_CHANNEL_FIELDS = ["whatsapp", "phone", "email"];
const PUBLIC_SELF_REGISTER_FORCE_HIDDEN_FIELDS = new Set([
  "cpf_rg_cns",
  "birth_date",
  "email",
  "profession",
  "referred_by",
  "demand_category",
  "attachment",
  "notes",
]);
const PUBLIC_SELF_REGISTER_DEFAULT_FIELDS = {
  name: "required",
  phone: "optional",
  whatsapp: "optional",
  cpf_rg_cns: "hidden",
  birth_date: "hidden",
  email: "hidden",
  profession: "hidden",
  referred_by: "hidden",
  zip_code: "optional",
  neighborhood: "optional",
  address: "optional",
  number: "optional",
  complement: "optional",
  city: "optional",
  uf: "optional",
  demand_title: "required",
  demand_category: "hidden",
  description: "optional",
  attachment: "hidden",
  notes: "hidden",
};
const PUBLIC_AI_TEXT_ATTEMPTS = new Map();
const PUBLIC_SELF_REGISTER_ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PUBLIC_SELF_REGISTER_MAX_FILE_BYTES = 10 * 1024 * 1024;
const TICKET_IMAGE_UPLOAD_DIR = resolve(PERSISTENT_UPLOAD_DIR, "atendimentos");
const TICKET_IMAGE_URL_PREFIX = "/uploads/atendimentos";
const TICKET_IMAGE_ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const TICKET_IMAGE_MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024;
const TICKET_IMAGE_MAX_PDF_FILE_BYTES = 10 * 1024 * 1024;
const TICKET_IMAGE_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const TICKET_IMAGE_MAX_FILES = 5;
const FINANCE_RECEIPT_UPLOAD_DIR = resolve(process.cwd(), "data", "uploads", "financeiro");
const FINANCE_RECEIPT_URL_PREFIX = "/finance-receipts";
const FINANCE_RECEIPT_ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const FINANCE_RECEIPT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const STORAGE_DEFAULT_QUOTA_BYTES = Number(process.env.GABINETE360_STORAGE_DEFAULT_QUOTA_BYTES || 1024 * 1024 * 1024);
const STORAGE_WEBDAV_TIMEOUT_MS = Number(process.env.GABINETE360_STORAGE_WEBDAV_TIMEOUT_MS || 8000);
const STORAGE_WEBDAV_UPLOAD_TIMEOUT_MS = Number(process.env.GABINETE360_STORAGE_WEBDAV_UPLOAD_TIMEOUT_MS || 2 * 60 * 60 * 1000);
const PUBLIC_TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WHATSAPP_ATTACHMENT_ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const WHATSAPP_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const BR_UFS_FALLBACK = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapa" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceara" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espirito Santo" },
  { sigla: "GO", nome: "Goias" },
  { sigla: "MA", nome: "Maranhao" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Para" },
  { sigla: "PB", nome: "Paraiba" },
  { sigla: "PR", nome: "Parana" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piaui" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondonia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "Sao Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];
const CONSULTARIO_RAW_RESOURCES = {
  cpf: { path: "/v1/cpf/consultar", params: ["cpf", "data_nascimento"] },
  cnpj: { path: "/v1/cnpj/consultar", params: ["cnpj"] },
  ie: { path: "/v2/ie/consultar", params: ["uf", "cnpj", "cpf"] },
  ie_todas: { path: "/v2/ie/consultar/todas", params: ["cnpj", "cpf"] },
  cep: { path: "/v2/cep/consultar", params: ["cep"] },
  cep_busca: { path: "/v2/cep/buscar", params: ["logradouro", "localidade", "uf"] },
  geocodificacao: { path: "/v2/geocodificacao/consultar", params: ["endereco"] },
  geocodificacao_reversa: {
    path: "/v2/geocodificacao/reversa/consultar",
    params: ["coordenadas"],
  },
  crm: { path: "/v1/crm/consultar", params: ["uf", "numero_registro"] },
  crm_busca: { path: "/v1/crm/buscar", params: ["nome_razao_social"] },
  cro: { path: "/v1/cro/consultar", params: ["uf", "numero_registro", "categoria"] },
  cro_busca: { path: "/v1/cro/buscar", params: ["nome_razao_social", "categoria"] },
  crbm: { path: "/v1/crbm/consultar", params: ["regiao", "numero_registro"] },
  crbm_busca: { path: "/v1/crbm/buscar", params: ["nome_razao_social"] },
  crf: { path: "/v1/crf/consultar", params: ["uf", "cidade", "numero_registro"] },
};
const INVERTEXTO_RAW_RESOURCES = {
  validator: { path: "/v1/validator", params: ["value", "type"] },
  cep: { path: "/v1/cep/:cep", params: [] },
  cnpj: { path: "/v1/cnpj/:cnpj", params: [] },
  email_validator: { path: "/v1/email-validator/:email", params: [] },
  holidays: { path: "/v1/holidays/:year", params: ["state"] },
};
const LOOKUP_PROVIDER_CATALOG = {
  cep: [
    { key: "auto", label: "Automatica", configured: true },
    { key: "brasilapi", label: "BrasilAPI", configured: true },
    { key: "opencep", label: "OpenCEP", configured: true },
    { key: "awesomeapi", label: "AwesomeAPI", configured: true },
    { key: "consultario", label: "Consultar.IO", configured: Boolean(CONSULTARIO_TOKEN) },
  ],
  cnpj: [
    { key: "auto", label: "Automatica", configured: true },
    { key: "brasilapi", label: "BrasilAPI", configured: true },
    { key: "cnpja", label: "CNPJa", configured: true },
    { key: "cnpjws", label: "CNPJ.ws", configured: true },
    { key: "receitaws", label: "ReceitaWS", configured: Boolean(RECEITAWS_TOKEN) },
    { key: "consultario", label: "Consultar.IO", configured: Boolean(CONSULTARIO_TOKEN) },
  ],
  cpf: [
    { key: "auto", label: "Automatica", configured: true },
    { key: "consultario", label: "Consultar.IO", configured: Boolean(CONSULTARIO_TOKEN) },
  ],
};
const LOOKUP_AUTO_ORDER = {
  cep: ["brasilapi", "opencep", "awesomeapi", "consultario"],
  cnpj: ["cnpja", "brasilapi", "cnpjws", "receitaws", "consultario"],
  cpf: ["consultario"],
};

const DOCUMENT_TYPES = [
  "Oficio",
  "Indicacao",
  "Requerimento",
  "Mocao",
  "Projeto de Lei",
  "Emenda",
  "Representacao",
  "Relatorio de Viagem",
  "Requisicao Administrativa",
  "Outro",
];

const DOCUMENT_STATUSES = [
  "Rascunho",
  "Protocolado",
  "Aguardando resposta",
  "Respondido",
  "Encaminhado ao municipe",
  "Concluido",
  "Arquivado",
];

const PERSISTENT_UPLOAD_MIME_TYPES = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function resolveUploadPathFromUrl(pathname, rootDir) {
  const value = String(pathname || "");
  if (!value.startsWith(`${PUBLIC_UPLOAD_URL_PREFIX}/`)) return "";
  const relative = value.slice(PUBLIC_UPLOAD_URL_PREFIX.length + 1);
  if (!relative || relative.includes("\0") || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    return "";
  }
  const targetPath = resolve(rootDir, relative);
  const normalizedRoot = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;
  return targetPath === rootDir || targetPath.startsWith(normalizedRoot) ? targetPath : "";
}

function resolvePersistentUploadPathFromUrl(pathname) {
  return resolveUploadPathFromUrl(pathname, PERSISTENT_UPLOAD_DIR);
}

function resolveLegacyPublicUploadPathFromUrl(pathname) {
  return resolveUploadPathFromUrl(pathname, LEGACY_PUBLIC_UPLOAD_DIR);
}

function servePersistentUpload(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const targetPath = resolvePersistentUploadPathFromUrl(url.pathname);
  if (!targetPath || !existsSync(targetPath)) return false;
  const stats = statSync(targetPath);
  if (stats.isDirectory()) return false;
  const mimeType = PERSISTENT_UPLOAD_MIME_TYPES[extname(targetPath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": mimeType,
    "Content-Length": String(stats.size),
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(targetPath).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  try {
    if (servePersistentUpload(req, res)) {
      return;
    }

    if (serveStatic(req, res)) {
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const ctx = getRequestContext(req, res);
    trackSlowRequest(req, res, pathname, ctx);

    if (pathname === "/" && req.method === "GET") {
      return redirect(res, "/app");
    }

    if (pathname.startsWith("/api/")) {
      return handleApi(req, res, url, pathname, ctx);
    }

    if (req.method === "GET" && (pathname === "/app/app" || pathname.startsWith("/app/app/"))) {
      const normalizedPath = pathname === "/app/app" ? "/app" : `/app/${pathname.slice("/app/app/".length)}`;
      return redirect(res, `${normalizedPath}${url.search}`);
    }

    if (
      (req.method === "GET" || req.method === "HEAD") &&
      (pathname === "/app/autocadastro" || pathname.startsWith("/app/autocadastro/"))
    ) {
      const normalizedPath =
        pathname === "/app/autocadastro" ? "/atendimento" : `/atendimento/${pathname.slice("/app/autocadastro/".length)}`;
      return redirect(res, `${normalizedPath}${url.search}`);
    }

    if ((req.method === "GET" || req.method === "HEAD") && pathname === "/app/ligacoes") {
      return redirect(res, `/app/atendimentos${url.search}`);
    }

    if ((req.method === "GET" || req.method === "HEAD") && pathname === "/app/notas") {
      return redirect(res, `/postit${url.search}`);
    }

    if ((req.method === "GET" || req.method === "HEAD") && (pathname === "/app" || pathname.startsWith("/app/"))) {
      return nextHandle(req, res, parseUrl(req.url ?? "", true));
    }

    if ((req.method === "GET" || req.method === "HEAD") && (pathname === "/autocadastro" || pathname.startsWith("/autocadastro/"))) {
      const normalizedPath = pathname === "/autocadastro" ? "/atendimento" : `/atendimento/${pathname.slice("/autocadastro/".length)}`;
      return redirect(res, `${normalizedPath}${url.search}`);
    }

    if (
      (req.method === "GET" || req.method === "HEAD") &&
      (pathname === "/atendimento-online" ||
        pathname.startsWith("/atendimento-online/") ||
        pathname === "/atendimento-on-line" ||
        pathname.startsWith("/atendimento-on-line/"))
    ) {
      const prefix = pathname.startsWith("/atendimento-on-line") ? "/atendimento-on-line" : "/atendimento-online";
      const normalizedPath = pathname === prefix ? "/atendimento" : `/atendimento/${pathname.slice(`${prefix}/`.length)}`;
      return redirect(res, `${normalizedPath}${url.search}`);
    }

    if ((req.method === "GET" || req.method === "HEAD") && (pathname === "/atendimento" || pathname.startsWith("/atendimento/"))) {
      const originalUrl = req.url;
      const rewrittenUrl = `/app${pathname}${url.search}`;
      req.url = rewrittenUrl;
      try {
        return nextHandle(req, res, parseUrl(rewrittenUrl, true));
      } finally {
        req.url = originalUrl;
      }
    }

    if ((req.method === "GET" || req.method === "HEAD") && (pathname === "/acompanhamento" || pathname.startsWith("/acompanhamento/"))) {
      const originalUrl = req.url;
      const rewrittenUrl = `/app${pathname}${url.search}`;
      req.url = rewrittenUrl;
      try {
        return nextHandle(req, res, parseUrl(rewrittenUrl, true));
      } finally {
        req.url = originalUrl;
      }
    }

    if ((req.method === "GET" || req.method === "HEAD") && (pathname === "/comprovante" || pathname.startsWith("/comprovante/"))) {
      const originalUrl = req.url;
      const rewrittenUrl = `/app${pathname}${url.search}`;
      req.url = rewrittenUrl;
      try {
        return nextHandle(req, res, parseUrl(rewrittenUrl, true));
      } finally {
        req.url = originalUrl;
      }
    }

    if ((req.method === "GET" || req.method === "HEAD") && (pathname === "/compartilhar" || pathname.startsWith("/compartilhar/"))) {
      const originalUrl = req.url;
      const rewrittenUrl = `/app${pathname}${url.search}`;
      req.url = rewrittenUrl;
      try {
        return nextHandle(req, res, parseUrl(rewrittenUrl, true));
      } finally {
        req.url = originalUrl;
      }
    }

    if ((req.method === "GET" || req.method === "HEAD") && pathname === "/postit") {
      const originalUrl = req.url;
      const rewrittenUrl = `/app/postit${url.search}`;
      req.url = rewrittenUrl;
      try {
        return nextHandle(req, res, parseUrl(rewrittenUrl, true));
      } finally {
        req.url = originalUrl;
      }
    }

    const legacySpaRedirects = {
      "/login": "/app",
      "/register": "/app?flow=signup",
      "/forgot-password": "/app/esqueci-senha",
      "/reset-password": "/app/redefinir-senha",
      "/activate-account": "/app/ativar-conta",
      "/dashboard": "/app/dashboard",
      "/atendimentos": "/app/atendimentos",
      "/contatos": "/app/contatos",
      "/notas": "/postit",
      "/usuarios": "/app/equipe",
      "/configuracoes": "/app/configuracoes",
      "/documentos": "/app/documentos",
      "/projetos": "/app/proposituras",
      "/agenda": "/app/tarefas",
      "/arquivos": "/app/arquivos",
      "/ligacoes": "/app/atendimentos",
      "/importacoes": "/app/importacao",
      "/lixeira": "/app/lixeira",
      "/relatorios": "/app/relatorios",
      "/notificacoes": "/app/dashboard",
    };
    if (req.method === "GET" && legacySpaRedirects[pathname]) {
      return redirect(res, legacySpaRedirects[pathname]);
    }

    if (req.method === "GET") {
      const legacyDynamicRedirect = legacyAppRedirectPath(pathname, url.search);
      if (legacyDynamicRedirect) {
        return redirect(res, legacyDynamicRedirect);
      }
    }

    if (pathname === "/login" && req.method === "GET") {
      if (ctx.user) return redirect(res, getPostAuthRedirectPath(ctx.user));
      if (url.search) return redirect(res, `/app${url.search}`);
      return redirect(res, "/app");
    }

    if (pathname === "/login" && req.method === "POST") {
      const body = await parseBody(req);
      const login = String(body.login ?? "").trim();
      const password = String(body.password ?? "");
      const user = db
        .prepare(
          `
            SELECT *
            FROM users
            WHERE status = 'active'
              AND (
                lower(email) = lower(:login)
                OR lower(username) = lower(:login)
              )
          `,
        )
        .get({ login });

      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendHtml(
          res,
          loginPage({
            error: "Credenciais invalidas. Confira usuario/e-mail e senha.",
            values: { login },
          }),
          401,
        );
      }

      issueSessionForUser(req, res, user);
      setFlash(res, "success", "Login realizado com sucesso.");
      return redirect(res, getPostAuthRedirectPath(user));
    }

    if (pathname === "/logout" && req.method === "POST") {
      if (ctx.sessionToken) {
        db.prepare("DELETE FROM sessions WHERE token = :token").run({
          token: ctx.sessionToken,
        });
      }
      clearCookie(res, "session_token");
      clearCookie(res, "active_gabinete_id");
      clearCookie(res, GOOGLE_OAUTH_STATE_COOKIE);
      setFlash(res, "success", "Sessao encerrada.");
      return redirect(res, "/app");
    }

    if (pathname === "/register" && req.method === "GET") {
      if (ctx.user) return redirect(res, getPostAuthRedirectPath(ctx.user));
      return sendHtml(res, registerGabinetePage());
    }

    if (pathname === "/register" && req.method === "POST") {
      if (ctx.user) return redirect(res, getPostAuthRedirectPath(ctx.user));
      const body = await parseBody(req);

      const validationError = validateRegisterForm(body);
      if (validationError) {
        return sendHtml(
          res,
          registerGabinetePage({ error: validationError, values: body }),
          422,
        );
      }

      try {
        const username = uniqueUsernameFromEmail(body.email);
        const location = await resolveGabineteLocationPayload({
          city: body.city,
          uf: body.uf,
        });
        const { gabineteId, userId } = createDefaultSetupForGabinete(
          db,
          {
            name: String(body.name || "").trim().slice(0, GABINETE_NAME_MAX_LENGTH),
            type: body.type,
            parliamentarian_name: String(body.parliamentarian_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
            party: body.party,
            city: location.city,
            city_ibge: location.city_ibge,
            uf: location.uf,
            responsible_name: String(body.responsible_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
            email: body.email,
            phone: body.phone,
            onboarding_completed: 0,
          },
          {
            username,
            name: body.responsible_name,
            email: body.email,
            phone: body.phone,
            password: body.password,
          },
        );

        issueSessionForUser(req, res, { id: userId, role: "gabinete_admin", gabinete_id: gabineteId }, {
          provider: "password",
        });
        setFlash(res, "success", "Gabinete criado com sucesso.");
        return redirect(res, "/app/configuracoes?setup=1");
      } catch (error) {
        return sendHtml(
          res,
          registerGabinetePage({
            error: "Nao foi possivel criar o gabinete. Verifique se o e-mail ja nao esta em uso.",
            values: body,
          }),
          409,
        );
      }
    }

    if (pathname === "/forgot-password" && req.method === "GET") {
      if (url.search) return redirect(res, `/app/esqueci-senha${url.search}`);
      return redirect(res, "/app/esqueci-senha");
    }

    if (!ensureAuthenticated(ctx, res)) return;

    if (pathname === "/switch-gabinete" && req.method === "POST") {
      const body = await parseBody(req);
      if (ctx.user.role !== "super_admin") {
        return redirect(res, "/app/atendimentos");
      }

      const gabineteId = parseInteger(body.gabinete_id);
      const gabinete = db.prepare("SELECT id FROM gabinetes WHERE id = :id").get({
        id: gabineteId,
      });

      if (gabinete) {
        setCookie(res, "active_gabinete_id", String(gabineteId), {
          maxAge: SESSION_TTL_SECONDS,
        });
      }

      return redirect(res, safeInternalRedirectPath(body.return_to) || req.headers.referer || "/app/atendimentos");
    }

    if (pathname === "/onboarding" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const content = onboardingPage({ gabinete });
      return sendHtml(res, renderShell(ctx, "Onboarding", "Primeiros passos", "Configure rapidamente seu gabinete.", pathname, content));
    }

    if (pathname === "/dashboard" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;

      const content = dashboardPage(await buildDashboardData(gabinete.id, { holidayUf: gabinete.uf }));
      return sendHtml(
        res,
        renderShell(
          ctx,
          "Dashboard",
          "Dashboard",
          "Acompanhe o volume, os gargalos e as proximas acoes do gabinete.",
          pathname,
          content,
        ),
      );
    }

    if (pathname === "/atendimentos" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const filters = {
        q: url.searchParams.get("q") ?? "",
        status: url.searchParams.get("status") ?? "",
        channel: url.searchParams.get("channel") ?? "",
        category: url.searchParams.get("category") ?? "",
        assigned_user_id: url.searchParams.get("assigned_user_id") ?? "",
        neighborhood: url.searchParams.get("neighborhood") ?? "",
        city: url.searchParams.get("city") ?? "",
        scope: url.searchParams.get("scope") ?? "all",
        include_archived:
          !url.searchParams.get("scope") || ["all", "closed"].includes(url.searchParams.get("scope")),
      };
      const viewMode = url.searchParams.get("view") || "list";
      const content = ticketsPage({
        tickets: listTickets(gabinete.id, filters),
        statuses: listStatuses(gabinete.id),
        categories: listCategories(gabinete.id),
        channels: listChannels(gabinete.id),
        users: listUsersByGabinete(gabinete.id),
        filters,
        viewMode,
        canEdit: canEditRecords(ctx.user),
      });
      return sendHtml(
        res,
        renderShell(
          ctx,
          "Atendimentos",
          "Atendimentos",
          "Controle central de demandas, status, responsaveis e proximas acoes.",
          pathname,
          content,
        ),
      );
    }

    if (pathname === "/atendimentos/novo" && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const prefillingContact = url.searchParams.get("contact_id")
        ? getScopedContact(gabinete.id, parseInteger(url.searchParams.get("contact_id")))
        : null;

      const content = ticketFormPage({
        ticket: {
          opened_at: toInputDate(new Date().toISOString()),
          channel: "WhatsApp",
          status: listStatuses(gabinete.id)[0]?.name || "Aberto",
          priority: "Normal",
          ...prefillTicketFromContact(prefillingContact),
        },
        contactOptions: listContacts(gabinete.id),
        statuses: listStatuses(gabinete.id),
        categories: listCategories(gabinete.id),
        channels: listChannels(gabinete.id),
        users: listUsersByGabinete(gabinete.id),
      });
      return sendHtml(
        res,
        renderShell(
          ctx,
          "Novo atendimento",
          "Novo atendimento",
          "Cadastre com rapidez e mantenha o historico completo do caso.",
          pathname,
          content,
        ),
      );
    }

    if (pathname === "/atendimentos/novo" && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const body = await parseBody(req);
      const error =
        validateTicketForm({ ...body, _is_final_status: isTicketFinalStatus(gabinete.id, body.status) })
        || validateScopedReferences(gabinete.id, body, [
          { field: "contact_id", table: "contacts", label: "Contato" },
          { field: "assigned_user_id", table: "users", label: "Responsavel" },
        ]);

      if (error) {
        const content = ticketFormPage({
          ticket: body,
          contactOptions: listContacts(gabinete.id),
          statuses: listStatuses(gabinete.id),
          categories: listCategories(gabinete.id),
          channels: listChannels(gabinete.id),
          users: listUsersByGabinete(gabinete.id),
          error,
        });
        return sendHtml(
          res,
          renderShell(ctx, "Novo atendimento", "Novo atendimento", "Preencha os campos obrigatorios.", pathname, content),
          422,
        );
      }

      const contactId = upsertContactFromTicketBody(gabinete.id, body);
      const sequence =
        db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id").get({
          gabinete_id: gabinete.id,
        }).total + 1;
      const number = generateTicketCode(gabinete.id, sequence);
      const timestamp = nowIso();
      const closedAt = isTicketFinalStatus(gabinete.id, body.status) ? body.opened_at : "";
      const assignedUserId =
        scopedReferenceId(gabinete.id, "users", body.assigned_user_id)
        || scopedReferenceId(gabinete.id, "users", ctx.user.id);

      const result = db.prepare(
        `
          INSERT INTO tickets (
            gabinete_id, contact_id, number, opened_at, channel, status, priority, tags,
            demand_title, demand_category, description, current_guidance, assigned_user_id,
            department, external_protocol, internal_due_date, next_action, next_action_date,
            closed_at, result, is_archived, is_favorite, created_at, updated_at
          ) VALUES (
            :gabinete_id, :contact_id, :number, :opened_at, :channel, :status, :priority, :tags,
            :demand_title, :demand_category, :description, :current_guidance, :assigned_user_id,
            :department, :external_protocol, :internal_due_date, :next_action, :next_action_date,
            :closed_at, :result, 0, 0, :created_at, :updated_at
          )
        `,
      ).run({
        gabinete_id: gabinete.id,
        contact_id: contactId,
        number,
        opened_at: body.opened_at,
        channel: body.channel,
        status: body.status,
        priority: body.priority,
        tags: body.tags ?? "",
        demand_title: body.demand_title,
        demand_category: body.demand_category ?? "",
        description: body.description ?? "",
        current_guidance: body.current_guidance ?? "",
        assigned_user_id: assignedUserId,
        department: body.department ?? "",
        external_protocol: body.external_protocol ?? "",
        internal_due_date: body.internal_due_date ?? "",
        next_action: body.next_action ?? "",
        next_action_date: body.next_action_date ?? "",
        closed_at: closedAt,
        result: body.result ?? "",
        created_at: timestamp,
        updated_at: timestamp,
      });

      const ticketId = Number(result.lastInsertRowid);
      insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
        action_type: "Criacao",
        text: String(body.current_guidance || "").trim() || "Atendimento criado.",
        previous_status: "",
        new_status: body.status,
        next_action: body.next_action ?? "",
        next_action_date: body.next_action_date ?? "",
      });
      refreshContactTicketDates(gabinete.id, contactId);
      logAudit(gabinete.id, ctx.user.id, "create", "ticket", ticketId, null, {
        number,
        status: body.status,
        demand_title: body.demand_title,
      });
      createNotificationForEntity(gabinete.id, assignedUserId, {
        title: "Atendimento atribuido",
        message: `Voce recebeu o atendimento ${number}.`,
        kind: "assignment",
        entity_type: "ticket",
        entity_id: ticketId,
      });
      setFlash(res, "success", "Atendimento criado com sucesso.");
      return redirect(res, `/atendimentos/${ticketId}`);
    }

    const ticketDetailMatch = pathname.match(/^\/atendimentos\/(\d+)$/);
    if (ticketDetailMatch && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const ticket = getScopedTicket(gabinete.id, Number(ticketDetailMatch[1]));
      if (!ticket) return notFound(res);
      const content = ticketDetailPage({
        ticket,
        history: getTicketHistory(gabinete.id, ticket.id),
        canEdit: canEditRecords(ctx.user),
      });
      return sendHtml(
        res,
        renderShell(
          ctx,
          `Atendimento ${ticket.number}`,
          "Detalhe do atendimento",
          "Visao completa do caso, com historico e contexto do contato.",
          "/atendimentos",
          content,
        ),
      );
    }

    const ticketEditMatch = pathname.match(/^\/atendimentos\/(\d+)\/editar$/);
    if (ticketEditMatch && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const ticket = getScopedTicket(gabinete.id, Number(ticketEditMatch[1]));
      if (!ticket) return notFound(res);
      const content = ticketFormPage({
        ticket,
        contactOptions: listContacts(gabinete.id),
        statuses: listStatuses(gabinete.id),
        categories: listCategories(gabinete.id),
        channels: listChannels(gabinete.id),
        users: listUsersByGabinete(gabinete.id),
        isEdit: true,
      });
      return sendHtml(
        res,
        renderShell(ctx, "Editar atendimento", "Editar atendimento", "Atualize os dados do caso e registre o andamento.", "/atendimentos", content),
      );
    }

    if (ticketEditMatch && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const ticketId = Number(ticketEditMatch[1]);
      const currentTicket = getScopedTicket(gabinete.id, ticketId);
      if (!currentTicket) return notFound(res);
      const body = await parseBody(req);
      const error =
        validateTicketForm({ ...body, _is_final_status: isTicketFinalStatus(gabinete.id, body.status) })
        || validateScopedReferences(gabinete.id, body, [
          { field: "contact_id", table: "contacts", label: "Contato" },
          { field: "assigned_user_id", table: "users", label: "Responsavel" },
        ]);

      if (error) {
        const content = ticketFormPage({
          ticket: { ...body, id: ticketId },
          contactOptions: listContacts(gabinete.id),
          statuses: listStatuses(gabinete.id),
          categories: listCategories(gabinete.id),
          channels: listChannels(gabinete.id),
          users: listUsersByGabinete(gabinete.id),
          error,
          isEdit: true,
        });
        return sendHtml(
          res,
          renderShell(ctx, "Editar atendimento", "Editar atendimento", "Corrija os campos sinalizados.", "/atendimentos", content),
          422,
        );
      }

      const contactId = upsertContactFromTicketBody(gabinete.id, body);
      const timestamp = nowIso();
      const finalStatus = isTicketFinalStatus(gabinete.id, body.status);
      const closedAt = finalStatus ? body.closed_at || currentTicket.closed_at || currentDate() : "";

      db.prepare(
        `
          UPDATE tickets
          SET contact_id = :contact_id,
              opened_at = :opened_at,
              channel = :channel,
              status = :status,
              priority = :priority,
              tags = :tags,
              demand_title = :demand_title,
              demand_category = :demand_category,
              description = :description,
              current_guidance = :current_guidance,
              assigned_user_id = :assigned_user_id,
              department = :department,
              external_protocol = :external_protocol,
              internal_due_date = :internal_due_date,
              next_action = :next_action,
              next_action_date = :next_action_date,
              closed_at = :closed_at,
              result = :result,
              updated_at = :updated_at
          WHERE id = :id AND gabinete_id = :gabinete_id
        `,
      ).run({
        id: ticketId,
        gabinete_id: gabinete.id,
        contact_id: contactId,
        opened_at: body.opened_at,
        channel: body.channel,
        status: body.status,
        priority: body.priority,
        tags: body.tags ?? "",
        demand_title: body.demand_title,
        demand_category: body.demand_category ?? "",
        description: body.description ?? "",
        current_guidance: body.current_guidance ?? "",
        assigned_user_id: scopedReferenceId(gabinete.id, "users", body.assigned_user_id),
        department: body.department ?? "",
        external_protocol: body.external_protocol ?? "",
        internal_due_date: body.internal_due_date ?? "",
        next_action: body.next_action ?? "",
        next_action_date: body.next_action_date ?? "",
        closed_at: closedAt,
        result: body.result ?? "",
        updated_at: timestamp,
      });

      insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
        action_type: "Atualizacao",
        text: String(body.current_guidance || "").trim() || "Atendimento atualizado.",
        previous_status: currentTicket.status,
        new_status: body.status,
        next_action: body.next_action ?? "",
        next_action_date: body.next_action_date ?? "",
      });
      refreshContactTicketDates(gabinete.id, contactId);
      logAudit(gabinete.id, ctx.user.id, "update", "ticket", ticketId, {
        status: currentTicket.status,
      }, {
        status: body.status,
        demand_title: body.demand_title,
      });
      createNotificationForEntity(gabinete.id, scopedReferenceId(gabinete.id, "users", body.assigned_user_id), {
        title: "Atendimento atualizado",
        message: `O atendimento ${currentTicket.number} recebeu atualizacao importante.`,
        kind: "ticket_update",
        entity_type: "ticket",
        entity_id: ticketId,
      });
      setFlash(res, "success", "Atendimento atualizado com sucesso.");
      return redirect(res, `/atendimentos/${ticketId}`);
    }

    if (pathname === "/contatos" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const filters = {
        q: url.searchParams.get("q") ?? "",
        city: url.searchParams.get("city") ?? "",
        neighborhood: url.searchParams.get("neighborhood") ?? "",
      };
      const content = contactsPage({
        contacts: listContacts(gabinete.id, filters),
        filters,
        canEdit: canEditRecords(ctx.user),
      });
      return sendHtml(
        res,
        renderShell(
          ctx,
          "Contatos",
          "Contatos",
          "CRM simples para municipes, liderancas e recorrencia de demandas.",
          pathname,
          content,
        ),
      );
    }

    if (pathname === "/contatos/novo" && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const content = contactFormPage();
      return sendHtml(
        res,
        renderShell(ctx, "Novo contato", "Novo contato", "Cadastre municipes e centralize o historico do relacionamento.", "/contatos", content),
      );
    }

    if (pathname === "/contatos/novo" && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const body = await parseBody(req);
      const error = validateContactForm(body);
      if (error) {
        return sendHtml(
          res,
          renderShell(ctx, "Novo contato", "Novo contato", "Corrija os campos obrigatorios.", "/contatos", contactFormPage({ contact: body, error })),
          422,
        );
      }

      const id = createContact(gabinete.id, body);
      logAudit(gabinete.id, ctx.user.id, "create", "contact", id, null, {
        name: body.name,
        phone: body.phone,
      });
      setFlash(res, "success", "Contato criado com sucesso.");
      return redirect(res, `/contatos/${id}`);
    }

    const contactDetailMatch = pathname.match(/^\/contatos\/(\d+)$/);
    if (contactDetailMatch && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const contact = getScopedContact(gabinete.id, Number(contactDetailMatch[1]));
      if (!contact) return notFound(res);
      const content = contactDetailPage({
        contact,
        tickets: db
          .prepare(
            `
              SELECT id, number, demand_title, status, opened_at
              FROM tickets
              WHERE gabinete_id = :gabinete_id AND contact_id = :contact_id
              ORDER BY opened_at DESC
            `,
          )
          .all({ gabinete_id: gabinete.id, contact_id: contact.id }),
      });
      return sendHtml(
        res,
        renderShell(ctx, `Contato ${contact.name}`, "Detalhe do contato", "Historico consolidado de relacionamento e atendimentos.", "/contatos", content),
      );
    }

    const contactEditMatch = pathname.match(/^\/contatos\/(\d+)\/editar$/);
    if (contactEditMatch && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const contact = getScopedContact(gabinete.id, Number(contactEditMatch[1]));
      if (!contact) return notFound(res);
      return sendHtml(
        res,
        renderShell(ctx, "Editar contato", "Editar contato", "Atualize os dados do contato.", "/contatos", contactFormPage({ contact, isEdit: true })),
      );
    }

    if (contactEditMatch && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const contactId = Number(contactEditMatch[1]);
      const currentContact = getScopedContact(gabinete.id, contactId);
      if (!currentContact) return notFound(res);
      const body = await parseBody(req);
      const error = validateContactForm(body);
      if (error) {
        return sendHtml(
          res,
          renderShell(ctx, "Editar contato", "Editar contato", "Corrija os campos obrigatorios.", "/contatos", contactFormPage({ contact: { ...body, id: contactId }, error, isEdit: true })),
          422,
        );
      }
      updateContact(gabinete.id, contactId, body);
      logAudit(gabinete.id, ctx.user.id, "update", "contact", contactId, {
        name: currentContact.name,
      }, {
        name: body.name,
        phone: body.phone,
      });
      setFlash(res, "success", "Contato atualizado com sucesso.");
      return redirect(res, `/contatos/${contactId}`);
    }

    if (pathname === "/usuarios" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete && ctx.user.role !== "super_admin") return;
      const content = usersPage({
        users:
          ctx.user.role === "super_admin"
            ? db.prepare("SELECT * FROM users ORDER BY created_at DESC").all()
            : listUsersByGabinete(gabinete.id),
        canManage: canManageUsers(ctx.user),
        isSuperAdmin: ctx.user.role === "super_admin",
      });
      return sendHtml(
        res,
        renderShell(ctx, "Usuarios", "Usuarios", "Gerencie perfis e acessos por gabinete.", pathname, content),
      );
    }

    if (pathname === "/usuarios" && req.method === "POST") {
      if (!canManageUsers(ctx.user)) {
        return redirect(res, "/usuarios");
      }
      const gabinete = requireGabinete(ctx, res);
      const body = await parseBody(req);
      const validationError = validateUserForm(body, ctx.user.role === "super_admin");
      if (validationError) {
        setFlash(res, "error", validationError);
        return redirect(res, "/usuarios");
      }

      try {
        const userId = createUserWithPassword(db, {
          gabinete_id:
            ctx.user.role === "super_admin"
              ? parseInteger(body.gabinete_id, null)
              : gabinete.id,
          username: body.username,
          name: body.name,
          email: body.email,
          phone: body.phone,
          role: body.role,
          password: body.password,
          must_change_password: true,
        });
        logAudit(
          ctx.user.role === "super_admin" ? parseInteger(body.gabinete_id, null) : gabinete.id,
          ctx.user.id,
          "create",
          "user",
          userId,
          null,
          { username: body.username, email: body.email, role: body.role },
        );
        setFlash(res, "success", "Usuario criado com sucesso.");
      } catch (error) {
        setFlash(res, "error", "Nao foi possivel criar o usuario. Verifique e-mail e usuario.");
      }
      return redirect(res, "/usuarios");
    }

    if (pathname === "/configuracoes" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const content = settingsPage({
        gabinete,
        statuses: listStatuses(gabinete.id),
        categories: listCategories(gabinete.id),
        channels: listChannels(gabinete.id),
        templates: listWhatsappTemplates(gabinete.id),
        signatures: listSignatureProfiles(gabinete.id),
        aiLinks: listAiLinks(gabinete.id),
        routingRules: listRoutingRules(gabinete.id),
        documentTemplates: listDocumentTemplates(gabinete.id),
        supportWhatsappUrl: SUPPORT_WHATSAPP_URL,
        canManageSettings: canManageSettings(ctx.user),
      });
      return sendHtml(
        res,
        renderShell(ctx, "Configuracoes", "Configuracoes", "Padroes operacionais e informacoes do gabinete.", pathname, content),
      );
    }

    if (pathname === "/configuracoes/assinaturas" && req.method === "POST") {
      if (!ensureCanManageSettings(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const body = await parseBody(req);
      if (!body.label || !body.signatory_name || !body.signatory_role) {
        setFlash(res, "error", "Informe nome interno, signatario e cargo da assinatura.");
        return redirect(res, "/configuracoes");
      }
      const signatureId = createSignatureProfile(gabinete.id, body);
      logAudit(gabinete.id, ctx.user.id, "create", "signature_profile", signatureId, null, {
        label: body.label,
        signatory_name: body.signatory_name,
      });
      setFlash(res, "success", "Assinatura salva com sucesso.");
      return redirect(res, "/configuracoes");
    }

    if (pathname === "/configuracoes/ia-links" && req.method === "POST") {
      if (!ensureCanManageSettings(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const body = await parseBody(req);
      if (!body.title || !body.url) {
        setFlash(res, "error", "Informe nome e URL do link de IA.");
        return redirect(res, "/configuracoes");
      }
      const aiLinkId = createAiLink(gabinete.id, body);
      logAudit(gabinete.id, ctx.user.id, "create", "ai_link", aiLinkId, null, {
        title: body.title,
        url: body.url,
      });
      setFlash(res, "success", "Link util salvo com sucesso.");
      return redirect(res, "/configuracoes");
    }

    if (pathname === "/modelos" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const filters = {
        q: url.searchParams.get("q") ?? "",
        type: url.searchParams.get("type") ?? "",
        topic: url.searchParams.get("topic") ?? "",
        department: url.searchParams.get("department") ?? "",
      };
      const linkedTicketId = parseInteger(url.searchParams.get("ticket_id"), 0);
      const linkedTicket = linkedTicketId ? getScopedTicket(gabinete.id, linkedTicketId) : null;
      const templates = listDocumentTemplates(gabinete.id, filters);
      const content = modelTemplatesPage({
        templates,
        filters,
        linkedTicket,
        topics: uniqueValues(listDocumentTemplates(gabinete.id).map((item) => item.topic)),
        canEdit: canEditRecords(ctx.user),
      });
      return sendHtml(
        res,
        renderShell(ctx, "Modelos", "Biblioteca de modelos", "Modelos prontos para oficio, requerimento, mocao, legislativo e rotinas de gabinete.", pathname, content),
      );
    }

    if (pathname === "/admin/gabinetes" && req.method === "GET") {
      if (!ensureSuperAdmin(ctx, res)) return;
      const content = adminGabinetesPage({
        gabinetes: db
          .prepare(
            `
              SELECT
                g.*,
                (SELECT COUNT(*) FROM users u WHERE u.gabinete_id = g.id) AS users_count,
                (SELECT COUNT(*) FROM tickets t WHERE t.gabinete_id = g.id) AS tickets_count
              FROM gabinetes g
              ORDER BY g.created_at DESC
            `,
          )
          .all(),
        stats: {
          total_gabinetes: db.prepare("SELECT COUNT(*) AS total FROM gabinetes").get().total,
          active_gabinetes: db.prepare("SELECT COUNT(*) AS total FROM gabinetes WHERE status = 'active'").get().total,
          active_users: db.prepare("SELECT COUNT(*) AS total FROM users WHERE status = 'active'").get().total,
          total_tickets: db.prepare("SELECT COUNT(*) AS total FROM tickets").get().total,
        },
      });
      return sendHtml(
        res,
        renderShell(
          ctx,
          "Administracao Geral",
          "Administracao Geral",
          "Controle de gabinetes, usuarios e operacao global da plataforma.",
          pathname,
          content,
        ),
      );
    }

    if (pathname === "/admin/gabinetes" && req.method === "POST") {
      if (!ensureSuperAdmin(ctx, res)) return;
      const body = await parseBody(req);
      try {
        const location = await resolveGabineteLocationPayload({
          city: body.city,
          uf: body.uf,
        });
        const created = createDefaultSetupForGabinete(
          db,
          {
            name: String(body.name || "").trim().slice(0, GABINETE_NAME_MAX_LENGTH),
            type: body.type,
            parliamentarian_name: String(body.parliamentarian_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
            party: body.party,
            city: location.city,
            city_ibge: location.city_ibge,
            uf: location.uf,
            responsible_name: String(body.responsible_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
            email: body.email,
            phone: body.phone,
            onboarding_completed: 1,
          },
          {
            username: body.username,
            name: body.responsible_name,
            email: body.email,
            phone: body.phone,
            password: body.password,
          },
        );
        logAudit(null, ctx.user.id, "create", "gabinete", created.gabineteId, null, {
          name: body.name,
          city: body.city,
        });
        setFlash(res, "success", "Gabinete criado com sucesso.");
      } catch (error) {
        setFlash(res, "error", "Nao foi possivel criar o gabinete. Verifique usuario e e-mail.");
      }
      return redirect(res, "/admin/gabinetes");
    }

    const gabineteToggleMatch = pathname.match(/^\/admin\/gabinetes\/(\d+)\/toggle$/);
    if (gabineteToggleMatch && req.method === "POST") {
      if (!ensureSuperAdmin(ctx, res)) return;
      const gabineteId = Number(gabineteToggleMatch[1]);
      const current = db.prepare("SELECT status, name FROM gabinetes WHERE id = :id").get({ id: gabineteId });
      db.prepare(
        `
          UPDATE gabinetes
          SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END,
              updated_at = :updated_at
          WHERE id = :id
        `,
      ).run({
        id: gabineteId,
        updated_at: nowIso(),
      });
      logAudit(null, ctx.user.id, "toggle_status", "gabinete", gabineteId, current, {
        status: current?.status === "active" ? "inactive" : "active",
        name: current?.name,
      });
      setFlash(res, "success", "Status do gabinete atualizado.");
      return redirect(res, "/admin/gabinetes");
    }

    if (pathname === "/documentos" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const filters = {
        q: url.searchParams.get("q") ?? "",
        department: url.searchParams.get("department") ?? "",
        type: url.searchParams.get("type") ?? "",
        status: url.searchParams.get("status") ?? "",
      };
      const content = documentsPage({
        documents: listDocuments(gabinete.id, filters),
        filters,
        canEdit: canEditRecords(ctx.user),
      });
      return sendHtml(
        res,
        renderShell(ctx, "Documentos", "Documentos", "Controle prazos, protocolos, proposituras e respostas vinculadas aos atendimentos.", pathname, content),
      );
    }

    if (pathname === "/documentos/novo" && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const signatureProfiles = listSignatureProfiles(gabinete.id);
      const sourceDocumentId = parseInteger(url.searchParams.get("source_document_id"), 0);
      const ticketId = parseInteger(url.searchParams.get("ticket_id"), 0);
      const templateId = parseInteger(url.searchParams.get("template_id"), 0);
      const selectedSignatureId = parseInteger(url.searchParams.get("signature_profile_id"), 0);
      const sourceDocument = sourceDocumentId ? getScopedDocument(gabinete.id, sourceDocumentId) : null;
      const linkedTicket = ticketId
        ? getScopedTicket(gabinete.id, ticketId)
        : sourceDocument?.ticket_id
          ? getScopedTicket(gabinete.id, sourceDocument.ticket_id)
          : null;
      const template = templateId ? getScopedDocumentTemplate(gabinete.id, templateId) : null;
      const selectedSignature = signatureProfiles.find(
        (item) => item.id === (selectedSignatureId || sourceDocument?.signature_profile_id),
      ) || signatureProfiles[0] || null;
      const document = buildDocumentDraft({
        gabinete,
        sourceDocument,
        linkedTicket,
        template,
        signatureProfile: selectedSignature,
      });
      const content = documentFormPage({
        document,
        tickets: listTickets(gabinete.id),
        signatures: signatureProfiles,
        template,
        routingSuggestion: document.routing_hint,
      });
      return sendHtml(
        res,
        renderShell(ctx, "Novo documento", "Novo documento", "Crie ofícios, protocolos, requerimentos, indicações, moções e projetos com controle de prazo.", "/documentos", content),
      );
    }

    if (pathname === "/documentos/novo" && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const body = await parseBody(req);
      const error =
        validateDocumentForm(body)
        || validateScopedReferences(gabinete.id, body, [
          { field: "ticket_id", table: "tickets", label: "Atendimento" },
          { field: "template_id", table: "document_templates", label: "Modelo" },
          { field: "signature_profile_id", table: "signature_profiles", label: "Assinatura" },
        ]);
      if (error) {
        const content = documentFormPage({
          document: body,
          tickets: listTickets(gabinete.id),
          signatures: listSignatureProfiles(gabinete.id),
          template: body.template_id ? getScopedDocumentTemplate(gabinete.id, Number(body.template_id)) : null,
          error,
        });
        return sendHtml(
          res,
          renderShell(ctx, "Novo documento", "Novo documento", "Corrija os campos obrigatorios.", "/documentos", content),
          422,
        );
      }
      const documentId = createDocument(gabinete.id, ctx.user.id, body);
      logAudit(gabinete.id, ctx.user.id, "create", "document", documentId, null, {
        type: body.type,
        internal_number: body.internal_number,
        status: body.status,
      });
      if (body.ticket_id) {
        createNotificationForEntity(gabinete.id, getTicketAssignee(gabinete.id, Number(body.ticket_id)), {
          title: "Documento vinculado ao atendimento",
          message: `Um ${body.type.toLowerCase()} foi registrado para o atendimento selecionado.`,
          kind: "document",
          entity_type: "document",
          entity_id: documentId,
        });
      }
      setFlash(res, "success", "Documento criado com sucesso.");
      return redirect(res, `/documentos/${documentId}`);
    }

    const documentDetailMatch = pathname.match(/^\/documentos\/(\d+)$/);
    if (documentDetailMatch && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const document = getScopedDocument(gabinete.id, Number(documentDetailMatch[1]));
      if (!document) return notFound(res);
      return sendHtml(
        res,
        renderShell(ctx, "Detalhe do documento", "Detalhe do documento", "Visao completa de protocolo, prazo e resposta.", "/documentos", documentDetailPage({ document })),
      );
    }

    const documentDuplicateMatch = pathname.match(/^\/documentos\/(\d+)\/duplicar$/);
    if (documentDuplicateMatch && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      return redirect(res, `/documentos/novo?source_document_id=${documentDuplicateMatch[1]}`);
    }

    const documentEditMatch = pathname.match(/^\/documentos\/(\d+)\/editar$/);
    if (documentEditMatch && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const document = getScopedDocument(gabinete.id, Number(documentEditMatch[1]));
      if (!document) return notFound(res);
      return sendHtml(
        res,
        renderShell(
          ctx,
          "Editar documento",
          "Editar documento",
          "Atualize protocolo, prazo, resposta e resultado.",
          "/documentos",
          documentFormPage({
            document,
            tickets: listTickets(gabinete.id),
            signatures: listSignatureProfiles(gabinete.id),
            template: document.template_id ? getScopedDocumentTemplate(gabinete.id, Number(document.template_id)) : null,
            routingSuggestion: document.routing_hint,
            isEdit: true,
          }),
        ),
      );
    }

    if (documentEditMatch && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const documentId = Number(documentEditMatch[1]);
      const currentDocument = getScopedDocument(gabinete.id, documentId);
      if (!currentDocument) return notFound(res);
      const body = await parseBody(req);
      const error =
        validateDocumentForm(body)
        || validateScopedReferences(gabinete.id, body, [
          { field: "ticket_id", table: "tickets", label: "Atendimento" },
          { field: "template_id", table: "document_templates", label: "Modelo" },
          { field: "signature_profile_id", table: "signature_profiles", label: "Assinatura" },
        ]);
      if (error) {
        return sendHtml(
          res,
          renderShell(
            ctx,
            "Editar documento",
            "Editar documento",
            "Corrija os campos obrigatorios.",
            "/documentos",
            documentFormPage({
              document: { ...body, id: documentId },
              tickets: listTickets(gabinete.id),
              signatures: listSignatureProfiles(gabinete.id),
              template: body.template_id ? getScopedDocumentTemplate(gabinete.id, Number(body.template_id)) : null,
              error,
              isEdit: true,
            }),
          ),
          422,
        );
      }
      updateDocument(gabinete.id, documentId, body);
      logAudit(gabinete.id, ctx.user.id, "update", "document", documentId, {
        status: currentDocument.status,
      }, {
        status: body.status,
        internal_number: body.internal_number,
        template_id: body.template_id || "",
      });
      setFlash(res, "success", "Documento atualizado com sucesso.");
      return redirect(res, `/documentos/${documentId}`);
    }

    if (pathname === "/projetos" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const filters = {
        q: url.searchParams.get("q") ?? "",
        category: url.searchParams.get("category") ?? "",
        status: url.searchParams.get("status") ?? "",
      };
      const content = projectsPage({
        projects: listProjects(gabinete.id, filters),
        filters,
        canEdit: canEditRecords(ctx.user),
      });
      return sendHtml(
        res,
        renderShell(ctx, "Projetos", "Projetos e ideias", "Organize pautas, pesquisas e links uteis do gabinete.", pathname, content),
      );
    }

    if (pathname === "/projetos/novo" && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      return sendHtml(
        res,
        renderShell(ctx, "Novo projeto", "Novo projeto", "Cadastre uma pauta, pesquisa ou proposta legislativa.", "/projetos", projectFormPage({ project: { status: "Ideia" }, users: listUsersByGabinete(gabinete.id) })),
      );
    }

    if (pathname === "/projetos/novo" && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const body = await parseBody(req);
      const error =
        validateProjectForm(body)
        || validateScopedReferences(gabinete.id, body, [
          { field: "responsible_id", table: "users", label: "Responsavel" },
        ]);
      if (error) {
        return sendHtml(
          res,
          renderShell(ctx, "Novo projeto", "Novo projeto", "Corrija os campos obrigatorios.", "/projetos", projectFormPage({ project: body, users: listUsersByGabinete(gabinete.id), error })),
          422,
        );
      }
      const projectId = createProject(gabinete.id, body);
      logAudit(gabinete.id, ctx.user.id, "create", "project", projectId, null, { title: body.title, status: body.status });
      setFlash(res, "success", "Projeto cadastrado com sucesso.");
      return redirect(res, "/projetos");
    }

    const projectEditMatch = pathname.match(/^\/projetos\/(\d+)\/editar$/);
    if (projectEditMatch && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const project = getScopedProject(gabinete.id, Number(projectEditMatch[1]));
      if (!project) return notFound(res);
      return sendHtml(
        res,
        renderShell(ctx, "Editar projeto", "Editar projeto", "Atualize o status e o contexto da pauta.", "/projetos", projectFormPage({ project, users: listUsersByGabinete(gabinete.id), isEdit: true })),
      );
    }

    if (projectEditMatch && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const projectId = Number(projectEditMatch[1]);
      const currentProject = getScopedProject(gabinete.id, projectId);
      if (!currentProject) return notFound(res);
      const body = await parseBody(req);
      const error =
        validateProjectForm(body)
        || validateScopedReferences(gabinete.id, body, [
          { field: "responsible_id", table: "users", label: "Responsavel" },
        ]);
      if (error) {
        return sendHtml(
          res,
          renderShell(ctx, "Editar projeto", "Editar projeto", "Corrija os campos obrigatorios.", "/projetos", projectFormPage({ project: { ...body, id: projectId }, users: listUsersByGabinete(gabinete.id), error, isEdit: true })),
          422,
        );
      }
      updateProject(gabinete.id, projectId, body);
      logAudit(gabinete.id, ctx.user.id, "update", "project", projectId, { status: currentProject.status }, { status: body.status, title: body.title });
      setFlash(res, "success", "Projeto atualizado com sucesso.");
      return redirect(res, "/projetos");
    }

    if (pathname === "/agenda" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const filters = {
        q: url.searchParams.get("q") ?? "",
        responsible_id: url.searchParams.get("responsible_id") ?? "",
        status: url.searchParams.get("status") ?? "",
        scope: url.searchParams.get("scope") ?? "all",
      };
      const content = tasksPage({
        tasks: listTasks(gabinete.id, filters),
        filters,
        users: listUsersByGabinete(gabinete.id),
        counts: taskCounts(gabinete.id),
        canEdit: canEditRecords(ctx.user),
      });
      return sendHtml(
        res,
        renderShell(ctx, "Agenda", "Agenda", "Visualize tarefas do dia, proximas acoes e atrasos operacionais.", pathname, content),
      );
    }

    if (pathname === "/agenda/novo" && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      return sendHtml(
        res,
        renderShell(ctx, "Nova tarefa", "Nova tarefa", "Vincule tarefas a atendimentos, contatos, documentos e projetos.", "/agenda", taskFormPage({
          task: { priority: "Normal", status: "Pendente" },
          users: listUsersByGabinete(gabinete.id),
          tickets: listTickets(gabinete.id),
          contacts: listContacts(gabinete.id),
          documents: listDocuments(gabinete.id),
          projects: listProjects(gabinete.id),
        })),
      );
    }

    if (pathname === "/agenda/novo" && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const body = await parseBody(req);
      const error =
        validateTaskForm(body)
        || validateScopedReferences(gabinete.id, body, [
          { field: "responsible_id", table: "users", label: "Responsavel" },
          { field: "ticket_id", table: "tickets", label: "Atendimento" },
          { field: "contact_id", table: "contacts", label: "Contato" },
          { field: "document_id", table: "documents", label: "Documento" },
          { field: "project_id", table: "projects", label: "Projeto" },
        ]);
      if (error) {
        return sendHtml(
          res,
          renderShell(ctx, "Nova tarefa", "Nova tarefa", "Corrija os campos obrigatorios.", "/agenda", taskFormPage({
            task: body,
            users: listUsersByGabinete(gabinete.id),
            tickets: listTickets(gabinete.id),
            contacts: listContacts(gabinete.id),
            documents: listDocuments(gabinete.id),
            projects: listProjects(gabinete.id),
            error,
          })),
          422,
        );
      }
      const taskId = createTask(gabinete.id, body);
      logAudit(gabinete.id, ctx.user.id, "create", "task", taskId, null, { title: body.title, status: body.status });
      createNotificationForEntity(gabinete.id, nullableInt(body.responsible_id), {
        title: "Nova tarefa na agenda",
        message: `Voce recebeu a tarefa "${body.title}".`,
        kind: "task",
        entity_type: "task",
        entity_id: taskId,
      });
      setFlash(res, "success", "Tarefa criada com sucesso.");
      return redirect(res, "/agenda");
    }

    const taskEditMatch = pathname.match(/^\/agenda\/(\d+)\/editar$/);
    if (taskEditMatch && req.method === "GET") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const task = getScopedTask(gabinete.id, Number(taskEditMatch[1]));
      if (!task) return notFound(res);
      return sendHtml(
        res,
        renderShell(ctx, "Editar tarefa", "Editar tarefa", "Atualize prazo, status e vinculos da agenda.", "/agenda", taskFormPage({
          task,
          users: listUsersByGabinete(gabinete.id),
          tickets: listTickets(gabinete.id),
          contacts: listContacts(gabinete.id),
          documents: listDocuments(gabinete.id),
          projects: listProjects(gabinete.id),
          isEdit: true,
        })),
      );
    }

    if (taskEditMatch && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const taskId = Number(taskEditMatch[1]);
      const currentTask = getScopedTask(gabinete.id, taskId);
      if (!currentTask) return notFound(res);
      const body = await parseBody(req);
      const error =
        validateTaskForm(body)
        || validateScopedReferences(gabinete.id, body, [
          { field: "responsible_id", table: "users", label: "Responsavel" },
          { field: "ticket_id", table: "tickets", label: "Atendimento" },
          { field: "contact_id", table: "contacts", label: "Contato" },
          { field: "document_id", table: "documents", label: "Documento" },
          { field: "project_id", table: "projects", label: "Projeto" },
        ]);
      if (error) {
        return sendHtml(
          res,
          renderShell(ctx, "Editar tarefa", "Editar tarefa", "Corrija os campos obrigatorios.", "/agenda", taskFormPage({
            task: { ...body, id: taskId },
            users: listUsersByGabinete(gabinete.id),
            tickets: listTickets(gabinete.id),
            contacts: listContacts(gabinete.id),
            documents: listDocuments(gabinete.id),
            projects: listProjects(gabinete.id),
            error,
            isEdit: true,
          })),
          422,
        );
      }
      updateTask(gabinete.id, taskId, body);
      logAudit(gabinete.id, ctx.user.id, "update", "task", taskId, { status: currentTask.status }, { status: body.status, title: body.title });
      setFlash(res, "success", "Tarefa atualizada com sucesso.");
      return redirect(res, "/agenda");
    }

    if (pathname === "/relatorios" && req.method === "GET") {
      return redirect(res, "/dashboard");
    }

    if (pathname === "/importacoes" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const previewId = parseInteger(url.searchParams.get("preview"));
      const content = importsPage({
        imports: listImports(gabinete.id),
        preview: previewId ? getImportPreview(gabinete.id, previewId) : null,
      });
      return sendHtml(
        res,
        renderShell(ctx, "Importacoes", "Importacoes", "Migre planilhas CSV ou XLSX com pre-visualizacao e mapeamento manual.", pathname, content),
      );
    }

    if (pathname === "/importacoes/preview" && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const { fields, files } = await parseMultipart(req);
      const file = files[0];
      if (!file) {
        setFlash(res, "error", "Selecione um arquivo CSV ou XLSX.");
        return redirect(res, "/importacoes");
      }
      try {
        const importOptions = buildImportOptions(fields, gabinete);
        const parsed = parseSpreadsheetFile(file.path, file.filename);
        const mapping = suggestMapping(parsed.columns, parsed.rows);
        const stats = {
          ...(parsed.stats || {}),
          ...buildImportPreviewAnalysis(db, gabinete.id, parsed.rows, mapping, importOptions),
        };
        const warnings = [
          ...(parsed.warnings || []),
          ...buildImportAnalysisWarnings(stats),
        ];
        const importId = db.prepare(
          `
            INSERT INTO imports (
              gabinete_id, user_id, source_name, source_type, status, total_rows,
              imported_contacts, imported_tickets, duplicates_count, errors_count,
              summary_json, created_at
            ) VALUES (
              :gabinete_id, :user_id, :source_name, :source_type, 'preview', :total_rows,
              0, 0, 0, 0, :summary_json, :created_at
            )
          `,
        ).run({
          gabinete_id: gabinete.id,
          user_id: ctx.user.id,
          source_name: file.filename,
          source_type: file.type,
          total_rows: parsed.rows.length,
          summary_json: JSON.stringify({
            columns: parsed.columns,
            rows: parsed.rows,
            mapping,
            source_format: parsed.source_format || "spreadsheet",
            source_label: parsed.source_label || "Planilha",
            warnings,
            stats,
            import_options: importOptions,
          }),
          created_at: nowIso(),
        }).lastInsertRowid;
        setFlash(res, "success", "Pre-visualizacao gerada com sucesso.");
        return redirect(res, `/importacoes?preview=${importId}`);
      } catch (error) {
        setFlash(res, "error", `Falha ao ler a planilha: ${error.message}`);
        return redirect(res, "/importacoes");
      }
    }

    if (pathname === "/importacoes/confirm" && req.method === "POST") {
      if (!ensureCanEdit(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const body = await parseBody(req);
      const importId = parseInteger(body.import_id);
      const importRecord = db
        .prepare("SELECT * FROM imports WHERE gabinete_id = :gabinete_id AND id = :id")
        .get({ gabinete_id: gabinete.id, id: importId });
      if (!importRecord) return notFound(res);
      const draft = JSON.parse(importRecord.summary_json || "{}");
      const mapping = {};
      importFields().forEach((field) => {
        mapping[field] = body[`map_${field}`] || draft.mapping?.[field] || "";
      });
      let report;
      db.exec("BEGIN");
      try {
        report = buildImportReport(db, gabinete.id, ctx.user.id, draft.rows || [], mapping, {
          ...(draft.import_options || {}),
          import_id: importId,
        });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        setFlash(res, "error", `Falha na importacao: ${error.message}`);
        return redirect(res, `/importacoes?preview=${importId}`);
      }
      db.prepare(
        `
          UPDATE imports
          SET status = :status,
              imported_contacts = :imported_contacts,
              imported_tickets = :imported_tickets,
              duplicates_count = :duplicates_count,
              errors_count = :errors_count,
              summary_json = :summary_json
          WHERE id = :id AND gabinete_id = :gabinete_id
        `,
      ).run({
        id: importId,
        gabinete_id: gabinete.id,
        status: report.status,
        imported_contacts: report.imported_contacts,
        imported_tickets: report.imported_tickets,
        duplicates_count: report.duplicates_count,
        errors_count: report.errors_count,
        summary_json: JSON.stringify({
          ...report,
          mapping,
          source_format: draft.source_format || "spreadsheet",
          source_label: draft.source_label || "Planilha",
          warnings: draft.warnings || [],
          stats: draft.stats || {},
          import_options: draft.import_options || {},
        }),
      });
      logAudit(gabinete.id, ctx.user.id, "import", "import", importId, null, {
        source_name: importRecord.source_name,
        imported_tickets: report.imported_tickets,
      });
      setFlash(
        res,
        report.errors_count ? "error" : "success",
        `Importacao concluida: ${report.imported_tickets} atendimentos e ${report.imported_contacts} contatos processados.`,
      );
      return redirect(res, "/importacoes");
    }

    if (pathname === "/notificacoes" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      return sendHtml(
        res,
        renderShell(ctx, "Notificacoes", "Notificacoes", "Alertas de atribuicao, prazo e acompanhamento do gabinete.", pathname, notificationsPage({ notifications: listNotifications(gabinete.id, ctx.user) })),
      );
    }

    const notificationReadMatch = pathname.match(/^\/notificacoes\/(\d+)\/read$/);
    if (notificationReadMatch && req.method === "POST") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      db.prepare(
        `
          UPDATE notifications
          SET is_read = 1, read_at = :read_at
          WHERE gabinete_id = :gabinete_id AND id = :id AND user_id = :user_id
        `,
      ).run({
        gabinete_id: gabinete.id,
        id: Number(notificationReadMatch[1]),
        user_id: ctx.user.id,
        read_at: nowIso(),
      });
      return redirect(res, "/notificacoes");
    }

    if (pathname === "/auditoria" && req.method === "GET") {
      if (!ensureAuditAccess(ctx, res)) return;
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      return sendHtml(
        res,
        renderShell(ctx, "Auditoria", "Auditoria", "Historico de acoes sensiveis e operacionais do gabinete.", pathname, auditPage({ entries: listAuditEntries(gabinete.id) })),
      );
    }

    if (pathname === "/export/tickets.csv" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      return sendCsv(res, "tickets.csv", listTickets(gabinete.id), [
        ["numero", "number"],
        ["abertura", "opened_at"],
        ["situacao", "status"],
        ["canal", "channel"],
        ["contato", "contact_name"],
        ["telefone", "contact_phone"],
        ["demanda", "demand_title"],
        ["categoria", "demand_category"],
        ["bairro", "contact_neighborhood"],
        ["cidade", "contact_city"],
        ["atendente", "assigned_user_name"],
        ["fechamento", "closed_at"],
      ]);
    }

    if (pathname === "/export/documents.csv" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      return sendCsv(res, "documents.csv", listDocuments(gabinete.id), [
        ["tipo", "type"],
        ["numero_interno", "internal_number"],
        ["modelo", "template_title"],
        ["numero_camara", "chamber_number"],
        ["status", "status"],
        ["secretaria", "department"],
        ["assunto", "subject_line"],
        ["prazo", "legal_due_date"],
        ["demanda", "demand"],
        ["atendimento", "ticket_number"],
      ]);
    }

    if (pathname === "/export/tasks.csv" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      return sendCsv(res, "tasks.csv", listTasks(gabinete.id), [
        ["titulo", "title"],
        ["descricao", "description"],
        ["responsavel", "responsible_name"],
        ["data_hora", "due_at"],
        ["prioridade", "priority"],
        ["status", "status"],
        ["atendimento", "ticket_number"],
        ["documento", "document_number"],
        ["projeto", "project_title"],
      ]);
    }

    if (pathname === "/search" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const query = String(url.searchParams.get("q") ?? "").trim();
      const content = searchPage({
        query,
        ticketResults: searchTickets(gabinete.id, query),
        contactResults: searchContacts(gabinete.id, query),
      });
      return sendHtml(
        res,
        renderShell(ctx, "Busca global", "Busca global", "Encontre rapidamente atendimentos e contatos por qualquer termo relevante.", pathname, content),
      );
    }

    if (pathname === "/api/contacts/suggest" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const query = String(url.searchParams.get("q") ?? "").trim();
      if (!query) return sendJson(res, []);
      return sendJson(res, searchContacts(gabinete.id, query).slice(0, 5));
    }

    if (pathname === "/api/search" && req.method === "GET") {
      const gabinete = requireGabinete(ctx, res);
      if (!gabinete) return;
      const query = String(url.searchParams.get("q") ?? "").trim();
	    return sendJson(res, { items: buildGlobalSearchResults(gabinete.id, query, ctx) });
    }

    return notFound(res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Erro interno do servidor.");
  }
});

export { server, db };

if (process.env.GABINETE360_NO_LISTEN !== "1") {
  const HOST = process.env.GABINETE360_HOST || "0.0.0.0";
  server.requestTimeout = Number(process.env.GABINETE360_REQUEST_TIMEOUT_MS || 0);
  server.listen(PORT, HOST, () => {
    console.log(`Gabinete360 em http://${HOST}:${PORT}`);
    scheduleLegislativeDailySync();
  });
}

let legislativeDailySyncStarted = false;
let legislativeDailySyncRunning = false;

function scheduleLegislativeDailySync() {
  if (legislativeDailySyncStarted) return;
  legislativeDailySyncStarted = true;
  const firstRun = setTimeout(() => {
    runDueLegislativeConnectorSyncs("startup").catch((error) => {
      console.error("Falha na sincronizacao diaria dos conectores legislativos.", error);
    });
  }, 90_000);
  firstRun.unref?.();
  const interval = setInterval(() => {
    runDueLegislativeConnectorSyncs("daily").catch((error) => {
      console.error("Falha na sincronizacao diaria dos conectores legislativos.", error);
    });
  }, LEGISLATIVE_DUE_CHECK_MS);
  interval.unref?.();
}

async function runDueLegislativeConnectorSyncs(reason = "daily") {
  if (legislativeDailySyncRunning) return { synced: 0, skipped: true };
  legislativeDailySyncRunning = true;
  const cutoff = new Date(Date.now() - LEGISLATIVE_DAILY_SYNC_MS).toISOString();
  try {
    const connectors = db
      .prepare(
        `
          SELECT *
          FROM legislative_connectors
          WHERE active = 1
            AND (
              last_sync_at IS NULL
              OR last_sync_at = ''
              OR last_sync_at <= :cutoff
            )
          ORDER BY COALESCE(last_sync_at, '') ASC, id ASC
          LIMIT 25
        `,
      )
      .all({ cutoff });
    let synced = 0;
    for (const connector of connectors) {
      try {
        await syncLegislativeConnector(Number(connector.gabinete_id), Number(connector.id));
        synced += 1;
      } catch (error) {
        console.error(`Conector legislativo ${connector.id} falhou na sincronizacao ${reason}:`, error?.message || error);
      }
    }
    return { synced, total: connectors.length };
  } finally {
    legislativeDailySyncRunning = false;
  }
}

function getRequestContext(req, res) {
  const cookies = parseCookies(req);
  const sessionToken = cookies.session_token ?? "";
  const flash = consumeFlash(res, cookies);

  if (!sessionToken) {
    return { cookies, flash, sessionToken: "", user: null, gabinete: null, gabineteOptions: [] };
  }

  const sessionUser = db
    .prepare(
      `
        SELECT
          s.id AS session_id,
          s.user_id,
          s.token,
          u.*,
          g.name AS gabinete_name
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN gabinetes g ON g.id = u.gabinete_id
        WHERE s.token = :token AND s.expires_at > :now
      `,
    )
    .get({
      token: sessionToken,
      now: nowIso(),
    });

  if (!sessionUser) {
    clearCookie(res, "session_token");
    return { cookies, flash, sessionToken, user: null, gabinete: null, gabineteOptions: [] };
  }

  db.prepare("UPDATE sessions SET last_active_at = :now WHERE id = :id").run({
    now: nowIso(),
    id: sessionUser.session_id,
  });

  const user = {
    ...sessionUser,
    role_label: getRoleLabel(sessionUser.role),
  };

  let gabinete = null;
  let gabineteOptions = [];

  if (user.role === "super_admin") {
    gabineteOptions = db.prepare("SELECT id, name FROM gabinetes ORDER BY name").all();
    const activeGabineteId = parseInteger(cookies.active_gabinete_id);
    const fallbackGabineteId = gabineteOptions[0]?.id;
    const gabineteId = activeGabineteId || fallbackGabineteId;
    gabinete = gabineteId
      ? db.prepare("SELECT * FROM gabinetes WHERE id = :id").get({ id: gabineteId })
      : null;
  } else if (user.gabinete_id) {
    gabinete = db
      .prepare("SELECT * FROM gabinetes WHERE id = :id")
      .get({ id: user.gabinete_id });
    gabineteOptions = gabinete ? [gabinete] : [];
  }

  if (gabinete) {
    syncOperationalNotifications(gabinete.id);
  }

  return {
    cookies,
    flash,
    sessionToken,
    user,
    gabinete,
    gabineteOptions,
    unreadNotifications: gabinete ? unreadNotificationsCount(gabinete.id, user) : 0,
  };
}

function renderShell(ctx, title, pageTitle, pageSubtitle, activePath, content) {
  return renderAppPage({
    title,
    pageTitle,
    pageSubtitle,
    user: ctx.user,
    gabinete: ctx.gabinete,
    activePath,
    content,
    flash: ctx.flash,
    canCreateTicket: canEditRecords(ctx.user),
    gabineteOptions: ctx.gabineteOptions,
    unreadNotifications: ctx.unreadNotifications,
  });
}

function sendReactApp(res) {
  try {
    return sendHtml(res, readPublicFile("app/index.html"));
  } catch {
    return sendHtml(
      res,
      renderGuestPage({
        title: "Frontend nao compilado",
        eyebrow: "Build pendente",
        heading: "A interface Next.js ainda nao foi compilada.",
        subtitle: "Execute npm run build:web para publicar a interface nova em /app.",
        content: `
          <div class="card-form">
            <div class="inline-alert">Rode <code>npm run build:web</code> dentro do projeto e recarregue esta pagina.</div>
          </div>
        `,
      }),
      503,
    );
  }
}

function isGoogleOauthConfigured() {
  return Boolean(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const protocol = forwardedProto || "http";
  const host = forwardedHost || String(req.headers.host || `127.0.0.1:${PORT}`).trim();
  return `${protocol}://${host}`;
}

function getGoogleOauthRedirectUri(req) {
  return GOOGLE_OAUTH_REDIRECT_URI || `${getRequestOrigin(req)}/api/auth/google/callback`;
}

function encodeGoogleOauthPending(payload) {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

function readGoogleOauthPending(cookies = {}) {
  const raw = String(cookies?.[GOOGLE_OAUTH_PENDING_COOKIE] || "").trim();
  if (!raw) return null;

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    const email = String(decoded?.email || "").trim().toLowerCase();
    if (!email) return null;
    return {
      email,
      name: String(decoded?.name || "").trim(),
      given_name: String(decoded?.given_name || "").trim(),
      family_name: String(decoded?.family_name || "").trim(),
      picture: String(decoded?.picture || "").trim(),
      sub: String(decoded?.sub || "").trim(),
      provider: "google",
    };
  } catch {
    return null;
  }
}

function buildGoogleOauthAuthorizeUrl(req, state) {
  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", GOOGLE_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", getGoogleOauthRedirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function exchangeGoogleOauthCode(code, redirectUri) {
  if (!isGoogleOauthConfigured()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGoogleOauthProfile(accessToken) {
  if (!accessToken) return null;
  return fetchRemoteJson(GOOGLE_OAUTH_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    timeoutMs: 8000,
  });
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.socket?.remoteAddress || "").trim();
}

function recordUserAccess(req, user, provider = "password") {
  if (!user?.id) return;
  const accessAt = nowIso();
  const ipAddress = getClientIp(req);
  db.prepare(
    `
      UPDATE users
      SET last_login_at = :last_login_at,
          last_login_ip = :last_login_ip,
          last_login_provider = :last_login_provider,
          updated_at = :updated_at
      WHERE id = :id
    `,
  ).run({
    id: user.id,
    last_login_at: accessAt,
    last_login_ip: ipAddress || "",
    last_login_provider: provider,
    updated_at: accessAt,
  });

  db.prepare(
    `
      INSERT INTO user_access_log (
        gabinete_id, user_id, provider, ip_address, user_agent, created_at
      ) VALUES (
        :gabinete_id, :user_id, :provider, :ip_address, :user_agent, :created_at
      )
    `,
  ).run({
    gabinete_id: user.gabinete_id ?? null,
    user_id: user.id,
    provider,
    ip_address: ipAddress || "",
    user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
    created_at: accessAt,
  });
}

function getGabineteDefaults(gabineteId) {
  return (
    db
      .prepare(
        `
          SELECT
            COALESCE(default_follow_up_days, 3) AS default_follow_up_days,
            COALESCE(default_document_due_days, 30) AS default_document_due_days,
            COALESCE(default_birthday_notice_days, 7) AS default_birthday_notice_days,
            COALESCE(team_label, 'Meu time') AS team_label
          FROM gabinetes
          WHERE id = :id
        `,
      )
      .get({ id: gabineteId }) || {
      default_follow_up_days: 3,
      default_document_due_days: 30,
      default_birthday_notice_days: 7,
      team_label: "Meu time",
    }
  );
}

function addDays(date, amount) {
  if (!date) return "";
  const base = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return "";
  base.setUTCDate(base.getUTCDate() + amount);
  return currentDateInTimeZone(base);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function hashOpaqueToken(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function buildPublicAppUrl(req, pathname, params = {}) {
  const url = new URL(`/app${pathname}`, getRequestOrigin(req));
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function encodeMimeWord(value) {
  return `=?UTF-8?B?${Buffer.from(String(value || ""), "utf8").toString("base64")}?=`;
}

function toBase64Lines(value) {
  return Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/(.{1,76})/g, "$1\r\n")
    .trim();
}

function normalizeSmtpSecurity(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (["ssl", "tls", "ssl_tls", "smtps"].includes(normalized)) return "ssl_tls";
  if (["starttls", "tls_starttls"].includes(normalized)) return "starttls";
  return "none";
}

function buildSupportSmtpProfile() {
  return {
    host: EMAIL_SMTP_HOST,
    port: EMAIL_SMTP_PORT,
    security: EMAIL_SMTP_SECURE ? "ssl_tls" : "none",
    username: EMAIL_SMTP_USERNAME,
    password: EMAIL_SMTP_PASSWORD,
    fromAddress: SUPPORT_EMAIL_ADDRESS,
    fromName: "Gabinete 360",
    replyTo: SUPPORT_EMAIL_ADDRESS,
  };
}

function isSmtpProfileReady(profile) {
  return Boolean(
    profile?.host &&
      Number(profile?.port || 0) > 0 &&
      profile?.username &&
      profile?.password &&
      profile?.fromAddress &&
      profile?.fromName,
  );
}

function waitForSocketResponse(socket, predicate, label, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => done(new Error(`Timeout ao aguardar ${label}.`)), timeoutMs);

    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      if (predicate(buffer)) done(null, buffer);
    };
    const onError = (error) => done(error);
    const onClose = () => done(new Error(`Conexao encerrada ao aguardar ${label}.`));

    const done = (error, value) => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      if (error) reject(error);
      else resolve(value);
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

async function connectSecureSmtpSocket(host, port) {
  const socket = tls.connect({
    host,
    port,
    servername: host,
    rejectUnauthorized: true,
  });

  await new Promise((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });

  return socket;
}

async function connectPlainSmtpSocket(host, port) {
  const socket = net.connect({
    host,
    port,
  });

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  return socket;
}

async function sendSmtpMail({ to, subject, text, smtp }) {
  const profile = smtp || buildSupportSmtpProfile();
  if (!isSmtpProfileReady(profile)) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }

  const security = normalizeSmtpSecurity(profile.security);
  let socket =
    security === "ssl_tls"
      ? await connectSecureSmtpSocket(profile.host, Number(profile.port))
      : await connectPlainSmtpSocket(profile.host, Number(profile.port));

  await waitForSocketResponse(socket, (data) => /^220/m.test(data), "banner SMTP");

  if (security === "starttls") {
    socket.write("EHLO gabinete.guiapj.com.br\r\n");
    await waitForSocketResponse(socket, (data) => /(?:^|\r\n)250\s/m.test(data), "EHLO SMTP");
    socket.write("STARTTLS\r\n");
    await waitForSocketResponse(socket, (data) => /220\s/m.test(data), "STARTTLS SMTP");

    socket = tls.connect({
      socket,
      servername: profile.host,
      rejectUnauthorized: true,
    });

    await new Promise((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
  }

  socket.write("EHLO gabinete.guiapj.com.br\r\n");
  await waitForSocketResponse(socket, (data) => /(?:^|\r\n)250\s/m.test(data), "EHLO SMTP");
  socket.write("AUTH LOGIN\r\n");
  await waitForSocketResponse(socket, (data) => /334\s/m.test(data), "AUTH LOGIN");
  socket.write(`${Buffer.from(String(profile.username || ""), "utf8").toString("base64")}\r\n`);
  await waitForSocketResponse(socket, (data) => /334\s/m.test(data), "usuario SMTP");
  socket.write(`${Buffer.from(String(profile.password || ""), "utf8").toString("base64")}\r\n`);
  const authResponse = await waitForSocketResponse(
    socket,
    (data) => /235\s/m.test(data) || /535\s/m.test(data),
    "senha SMTP",
  );
  if (!/235\s/m.test(authResponse)) {
    socket.end();
    throw new Error("SMTP_AUTH_FAILED");
  }

  socket.write(`MAIL FROM:<${profile.fromAddress}>\r\n`);
  await waitForSocketResponse(socket, (data) => /250\s/m.test(data), "MAIL FROM");
  socket.write(`RCPT TO:<${to}>\r\n`);
  const rcptResponse = await waitForSocketResponse(
    socket,
    (data) => /250\s/m.test(data) || /550\s/m.test(data) || /551\s/m.test(data),
    "RCPT TO",
  );
  if (!/250\s/m.test(rcptResponse)) {
    socket.end();
    throw new Error("SMTP_RCPT_FAILED");
  }

  socket.write("DATA\r\n");
  await waitForSocketResponse(socket, (data) => /354\s/m.test(data), "DATA SMTP");

  const messageDomain =
    String(profile.fromAddress || "").split("@")[1]?.trim() || "gabinete.guiapj.com.br";

  const message = [
    `From: ${encodeMimeWord(profile.fromName)} <${profile.fromAddress}>`,
    `To: <${to}>`,
    profile.replyTo ? `Reply-To: <${profile.replyTo}>` : null,
    `Subject: ${encodeMimeWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${createSessionToken()}@${messageDomain}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    toBase64Lines(text),
  ]
    .filter((line) => line !== null)
    .join("\r\n");

  socket.write(`${message}\r\n.\r\n`);
  const dataResponse = await waitForSocketResponse(
    socket,
    (data) => /250\s/m.test(data) || /554\s/m.test(data),
    "envio SMTP",
  );
  socket.write("QUIT\r\n");
  socket.end();

  if (!/250\s/m.test(dataResponse)) {
    throw new Error("SMTP_DATA_FAILED");
  }
}

function inferEmailProviderLabel(host) {
  const normalizedHost = String(host || "").trim().toLowerCase();
  if (!normalizedHost) return "Manual";
  if (normalizedHost.includes("hostinger")) return "Hostinger";
  if (normalizedHost.includes("gmail") || normalizedHost.includes("google")) return "Google Workspace";
  if (normalizedHost.includes("outlook") || normalizedHost.includes("office365") || normalizedHost.includes("hotmail")) {
    return "Microsoft 365 / Outlook";
  }
  if (normalizedHost.includes("zoho")) return "Zoho Mail";
  return "Manual";
}

function maskEmailAddress(value) {
  const email = String(value || "").trim();
  if (!email || !email.includes("@")) return "";
  const [localPart, domainPart] = email.split("@");
  if (localPart.length <= 2) return `${localPart[0] || "*"}***@${domainPart}`;
  return `${localPart.slice(0, 2)}***@${domainPart}`;
}

function buildGabineteEmailSettings(gabinete, fallbackTestTo = "") {
  const smtpProfile = {
    host: gabinete?.email_smtp_host || "",
    port: Number(gabinete?.email_smtp_port || 0),
    security: gabinete?.email_smtp_security || "ssl_tls",
    username: gabinete?.email_smtp_username || "",
    password: gabinete?.email_smtp_password || "",
    fromAddress: gabinete?.email_sender_address || "",
    fromName: gabinete?.email_sender_name || "",
  };
  const active = isSmtpProfileReady(smtpProfile) && Boolean(String(gabinete?.email_smtp_verified_at || "").trim());

  return {
    sender_name: gabinete?.email_sender_name || gabinete?.name || "",
    sender_address: gabinete?.email_sender_address || gabinete?.email || "",
    smtp_host: gabinete?.email_smtp_host || "",
    smtp_port: String(gabinete?.email_smtp_port || 465),
    smtp_security: normalizeSmtpSecurity(gabinete?.email_smtp_security || "ssl_tls"),
    smtp_username: gabinete?.email_smtp_username || "",
    configured: active,
    active,
    has_password: Boolean(gabinete?.email_smtp_password),
    provider_label: inferEmailProviderLabel(gabinete?.email_smtp_host || ""),
    masked_sender_address: maskEmailAddress(gabinete?.email_sender_address || gabinete?.email || ""),
    recommended_test_to: fallbackTestTo || gabinete?.email || SUPPORT_EMAIL_ADDRESS,
    verified_at: gabinete?.email_smtp_verified_at || "",
  };
}

function resolveGabineteSmtpProfile(gabinete, body = {}) {
  return {
    host: String(body.smtp_host ?? gabinete?.email_smtp_host ?? "").trim(),
    port: parseInteger(body.smtp_port, Number(gabinete?.email_smtp_port || 0)),
    security: normalizeSmtpSecurity(body.smtp_security ?? gabinete?.email_smtp_security ?? "ssl_tls"),
    username: String(body.smtp_username ?? gabinete?.email_smtp_username ?? "").trim(),
    password: String(body.smtp_password ?? "").trim() || String(gabinete?.email_smtp_password ?? "").trim(),
    fromAddress: String(body.sender_address ?? gabinete?.email_sender_address ?? "").trim().toLowerCase(),
    fromName: String(body.sender_name ?? gabinete?.email_sender_name ?? gabinete?.name ?? "").trim(),
    replyTo: "",
  };
}

function resolveContactIdByEmail(gabineteId, email, fallbackContactId = null) {
  const explicitContactId = nullableInt(fallbackContactId);
  if (explicitContactId) return scopedReferenceId(gabineteId, "contacts", explicitContactId);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  return (
    db
      .prepare(
        `
          SELECT id
          FROM contacts
          WHERE gabinete_id = :gabinete_id
            AND (deleted_at IS NULL OR deleted_at = '')
            AND lower(email) = lower(:email)
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .get({
        gabinete_id: gabineteId,
        email: normalizedEmail,
      })?.id ?? null
  );
}

function buildOperationalEmailDraft(gabineteId, body = {}) {
  const gabinete = getGabineteById(gabineteId);
  const ticket = nullableInt(body.ticket_id) ? getScopedTicket(gabineteId, nullableInt(body.ticket_id)) : null;
  const contact =
    ticket?.contact_id
      ? getScopedContact(gabineteId, ticket.contact_id)
      : nullableInt(body.contact_id)
        ? getScopedContact(gabineteId, nullableInt(body.contact_id))
        : null;
  const to = String(body.to || ticket?.contact_email || contact?.email || "").trim().toLowerCase();

  if (ticket) {
    const subject = String(body.subject || `${ticket.number} · Atualizacao do gabinete`).trim();
    const lines = [
      `Olá${ticket.contact_name ? `, ${ticket.contact_name}` : ""}.`,
      "",
      `Aqui é do ${buildGabineteMessageName(gabinete)}.`,
      `Estamos entrando em contato sobre sua solicitação ${ticket.number}.`,
      ticket.demand_title ? `Assunto: ${ticket.demand_title}.` : "",
      ticket.status ? `Status atual: ${ticket.status}.` : "",
      ticket.current_guidance ? `Andamento: ${ticket.current_guidance}.` : "",
      ticket.next_action
        ? `Próxima ação: ${ticket.next_action}${ticket.next_action_date ? ` em ${ticket.next_action_date}` : ""}.`
        : "",
      "",
      "Se precisar, responda este e-mail.",
    ].filter(Boolean);

    return {
      to,
      subject,
      text: String(body.text || lines.join("\n")).trim(),
      contact,
      ticket,
      context_title: `${ticket.number} · ${ticket.demand_title}`,
      context_note: ticket.status ? `Status atual: ${ticket.status}` : "",
    };
  }

  const subject = String(body.subject || `Contato do gabinete ${gabinete?.name || ""}`).trim();
  const lines = [
    `Olá${contact?.name ? `, ${contact.name}` : ""}.`,
    "",
    `Aqui é do ${buildGabineteMessageName(gabinete)}.`,
    "Estamos entrando em contato por este canal para seguir seu atendimento.",
    "",
    "Se precisar, responda este e-mail.",
  ].filter(Boolean);

  return {
    to,
    subject,
    text: String(body.text || lines.join("\n")).trim(),
    contact,
    ticket: null,
    context_title: contact?.name || "Contato do gabinete",
    context_note: contact?.city ? `${contact.city}${contact.uf ? ` · ${contact.uf}` : ""}` : "",
  };
}

function buildGabineteMessageName(gabinete) {
  const name = String(gabinete?.name || gabinete?.parliamentarian_name || "").trim();
  if (!name) return "gabinete";
  return normalizePlainText(name).startsWith("gabinete") ? name : `gabinete ${name}`;
}

function validateGabineteEmailSettingsForm(body, options = {}) {
  const profile = resolveGabineteSmtpProfile(options.gabinete, body);
  if (!profile.fromName) {
    return "Informe o nome que aparece como remetente.";
  }
  if (!isValidEmail(profile.fromAddress)) {
    return "Informe um e-mail valido para o remetente.";
  }
  if (!profile.host) {
    return "Informe o host SMTP.";
  }
  if (!Number(profile.port)) {
    return "Informe uma porta SMTP valida.";
  }
  if (!profile.username) {
    return "Informe o usuario SMTP.";
  }
  if (!profile.password) {
    return "Informe a senha SMTP.";
  }
  if (options.requireTestTo && !isValidEmail(body.test_to)) {
    return "Informe um e-mail valido para o teste.";
  }
  return "";
}

function issueEmailVerificationToken(userId, gabineteId) {
  const token = createSessionToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString();

  db.prepare(
    `
      UPDATE email_verification_tokens
      SET used_at = :used_at
      WHERE user_id = :user_id
        AND used_at IS NULL
    `,
  ).run({
    user_id: userId,
    used_at: createdAt,
  });

  db.prepare(
    `
      INSERT INTO email_verification_tokens (
        user_id, gabinete_id, token_hash, expires_at, used_at, created_at
      ) VALUES (
        :user_id, :gabinete_id, :token_hash, :expires_at, NULL, :created_at
      )
    `,
  ).run({
    user_id: userId,
    gabinete_id: gabineteId,
    token_hash: hashOpaqueToken(token),
    expires_at: expiresAt,
    created_at: createdAt,
  });

  return { token, expiresAt };
}

function consumeEmailVerificationToken(token) {
  const now = nowIso();
  const row = db
    .prepare(
      `
        SELECT
          evt.id,
          evt.user_id,
          evt.gabinete_id,
          u.email,
          u.name,
          u.status AS user_status,
          g.name AS gabinete_name,
          g.status AS gabinete_status
        FROM email_verification_tokens evt
        JOIN users u ON u.id = evt.user_id
        LEFT JOIN gabinetes g ON g.id = evt.gabinete_id
        WHERE evt.token_hash = :token_hash
          AND evt.used_at IS NULL
          AND evt.expires_at > :now
        LIMIT 1
      `,
    )
    .get({
      token_hash: hashOpaqueToken(token),
      now,
    });

  if (!row) return null;

  db.prepare(
    `
      UPDATE email_verification_tokens
      SET used_at = :used_at
      WHERE id = :id
    `,
  ).run({
    id: row.id,
    used_at: now,
  });

  return row;
}

function issuePasswordResetToken(userId) {
  const token = createSessionToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();

  db.prepare(
    `
      UPDATE password_reset_tokens
      SET used_at = :used_at
      WHERE user_id = :user_id
        AND used_at IS NULL
    `,
  ).run({
    user_id: userId,
    used_at: createdAt,
  });

  db.prepare(
    `
      INSERT INTO password_reset_tokens (
        user_id, token_hash, expires_at, used_at, created_at
      ) VALUES (
        :user_id, :token_hash, :expires_at, NULL, :created_at
      )
    `,
  ).run({
    user_id: userId,
    token_hash: hashOpaqueToken(token),
    expires_at: expiresAt,
    created_at: createdAt,
  });

  return { token, expiresAt };
}

function consumePasswordResetToken(token) {
  const now = nowIso();
  const row = db
    .prepare(
      `
        SELECT
          prt.id,
          prt.user_id,
          u.email,
          u.name,
          u.status
        FROM password_reset_tokens prt
        JOIN users u ON u.id = prt.user_id
        WHERE prt.token_hash = :token_hash
          AND prt.used_at IS NULL
          AND prt.expires_at > :now
        LIMIT 1
      `,
    )
    .get({
      token_hash: hashOpaqueToken(token),
      now,
    });

  if (!row) return null;

  db.prepare(
    `
      UPDATE password_reset_tokens
      SET used_at = :used_at
      WHERE id = :id
    `,
  ).run({
    id: row.id,
    used_at: now,
  });

  return row;
}

function prunePasswordResetRequestAttempts() {
  const cutoff = new Date(Date.now() - PASSWORD_RESET_REQUEST_RETENTION_MS).toISOString();
  db.prepare(
    `
      DELETE FROM password_reset_request_attempts
      WHERE created_at < :cutoff
    `,
  ).run({ cutoff });
}

function getPasswordResetRequestAttemptSummary(email, ipAddress) {
  prunePasswordResetRequestAttempts();
  const windowStart = new Date(Date.now() - PASSWORD_RESET_REQUEST_WINDOW_MS).toISOString();

  const emailCount = Number(
    db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM password_reset_request_attempts
          WHERE email = :email
            AND created_at >= :window_start
        `,
      )
      .get({
        email,
        window_start: windowStart,
      })?.total || 0,
  );

  const ipCount = ipAddress
    ? Number(
        db
          .prepare(
            `
              SELECT COUNT(*) AS total
              FROM password_reset_request_attempts
              WHERE ip_address = :ip_address
                AND created_at >= :window_start
            `,
          )
          .get({
            ip_address: ipAddress,
            window_start: windowStart,
          })?.total || 0,
      )
    : 0;

  return {
    emailCount,
    ipCount,
    limited: emailCount >= PASSWORD_RESET_REQUEST_LIMIT || ipCount >= PASSWORD_RESET_REQUEST_LIMIT,
  };
}

function recordPasswordResetRequestAttempt(email, ipAddress) {
  db.prepare(
    `
      INSERT INTO password_reset_request_attempts (
        email, ip_address, created_at
      ) VALUES (
        :email, :ip_address, :created_at
      )
    `,
  ).run({
    email,
    ip_address: ipAddress || "",
    created_at: nowIso(),
  });
}

async function sendActivationEmail(req, payload) {
  const activationUrl = buildPublicAppUrl(req, "/ativar-conta", { token: payload.token });
  const text = [
    `Olá${payload.name ? `, ${payload.name}` : ""}.`,
    "",
    `Seu cadastro no Gabinete360 para o gabinete ${payload.gabineteName} já foi criado.`,
    "Para ativar sua conta, clique no link abaixo:",
    activationUrl,
    "",
    "Se você não fez esse cadastro, ignore esta mensagem.",
  ].join("\n");

  await sendSmtpMail({
    to: payload.email,
    subject: "Ative sua conta no Gabinete360",
    text,
  });
}

async function sendPasswordResetEmail(req, payload) {
  const resetUrl = buildPublicAppUrl(req, "/redefinir-senha", { token: payload.token });
  const text = [
    `Olá${payload.name ? `, ${payload.name}` : ""}.`,
    "",
    "Recebemos um pedido para redefinir sua senha no Gabinete360.",
    "Use o link abaixo para escolher uma nova senha:",
    resetUrl,
    "",
    "Se você não pediu essa troca, ignore esta mensagem.",
  ].join("\n");

  await sendSmtpMail({
    to: payload.email,
    subject: "Redefina sua senha no Gabinete360",
    text,
  });
}

function issueSessionForUser(req, res, user, options = {}) {
  const token = createSessionToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  db.prepare(
    `
      INSERT INTO sessions (user_id, token, expires_at, last_active_at, created_at)
      VALUES (:user_id, :token, :expires_at, :last_active_at, :created_at)
    `,
  ).run({
    user_id: user.id,
    token,
    expires_at: expiresAt,
    last_active_at: createdAt,
    created_at: createdAt,
  });

  setCookie(res, "session_token", token, { maxAge: SESSION_TTL_SECONDS });

  if (user.role === "super_admin") {
    const preferredGabineteId = parseInteger(options.activeGabineteId, 0);
    const firstGabinete =
      preferredGabineteId > 0
        ? { id: preferredGabineteId }
        : db.prepare("SELECT id FROM gabinetes WHERE status = 'active' ORDER BY name LIMIT 1").get();
    if (firstGabinete) {
      setCookie(res, "active_gabinete_id", String(firstGabinete.id), {
        maxAge: SESSION_TTL_SECONDS,
      });
    }
  } else if (user.gabinete_id) {
    setCookie(res, "active_gabinete_id", String(user.gabinete_id), {
      maxAge: SESSION_TTL_SECONDS,
    });
  }

  recordUserAccess(req, user, options.provider || "password");
  return { token, expiresAt };
}

function getPostAuthRedirectPath(user) {
  if (!user || user.role === "super_admin" || !user.gabinete_id) {
    return "/app/atendimentos";
  }
  const gabinete = db.prepare("SELECT * FROM gabinetes WHERE id = :id").get({ id: user.gabinete_id });
  return gabinete && (!gabinete.onboarding_completed || !hasInstitutionalSetupProfile(gabinete))
    ? "/app/configuracoes?setup=1"
    : "/app/atendimentos";
}

function trackSlowRequest(req, res, pathname, ctx) {
  if (!SLOW_REQUEST_LOG_MS || SLOW_REQUEST_LOG_MS < 1) return;
  const startedAt = performance.now();
  let statusCode = 200;
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function patchedWriteHead(nextStatusCode, ...args) {
    statusCode = Number(nextStatusCode) || statusCode;
    return originalWriteHead(nextStatusCode, ...args);
  };
  res.once("finish", () => {
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs < SLOW_REQUEST_LOG_MS) return;
    console.warn(
      "slow_request",
      JSON.stringify({
        method: req.method,
        path: pathname,
        status: statusCode,
        duration_ms: durationMs,
        user_id: ctx.user?.id || null,
        gabinete_id: ctx.gabinete?.id || null,
      }),
    );
  });
}

function legacyAppRedirectPath(pathname, search = "") {
  const newRecordRedirects = [
    [/^\/atendimentos\/novo$/, "/app/atendimentos"],
    [/^\/contatos\/novo$/, "/app/contatos"],
    [/^\/documentos\/novo$/, "/app/documentos"],
    [/^\/projetos\/novo$/, "/app/proposituras"],
    [/^\/agenda\/novo$/, "/app/tarefas"],
  ];
  for (const [pattern, target] of newRecordRedirects) {
    if (pattern.test(pathname)) return `${target}${search || ""}`;
  }

  const ticketMatch = pathname.match(/^\/atendimentos\/(\d+)(?:\/editar)?$/);
  if (ticketMatch) return `/app/atendimentos?focus=${ticketMatch[1]}`;

  const contactMatch = pathname.match(/^\/contatos\/(\d+)(?:\/editar)?$/);
  if (contactMatch) return `/app/contatos?focus=${contactMatch[1]}`;

  if (/^\/documentos\/\d+(?:\/editar|\/duplicar)?$/.test(pathname)) return "/app/documentos";
  if (/^\/projetos\/\d+\/editar$/.test(pathname)) return "/app/proposituras";
  if (/^\/agenda\/\d+\/editar$/.test(pathname)) return "/app/tarefas";

  return "";
}

function safeInternalRedirectPath(value) {
  const path = String(value || "").trim();
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "";
  if (/[\r\n]/.test(path)) return "";
  return path;
}

function buildSessionPayload(ctx) {
  const workspaceModuleGlobalConfig = normalizeWorkspaceModuleConfig(ctx.gabinete?.workspace_module_config, ctx.gabinete?.type);
  const workspaceModuleConfig = buildEffectiveWorkspaceModuleConfig(ctx.gabinete, ctx.user);
  const moduleAccess = buildUserModuleAccess(ctx.user, ctx.gabinete);
  const modulePreferences = normalizeWorkspaceModulePreferences(ctx.user?.workspace_module_preferences);
  return {
    authenticated: Boolean(ctx.user),
    user: ctx.user
      ? {
          id: ctx.user.id,
          name: ctx.user.name,
          username: ctx.user.username,
          email: ctx.user.email,
          phone: ctx.user.phone,
          avatar_url: ctx.user.avatar_url,
          role: ctx.user.role,
          role_label: ctx.user.role_label,
	          ui_theme_mode: normalizeUiThemeMode(ctx.user.ui_theme_mode || ctx.gabinete?.ui_theme_mode),
	          ui_theme_palette: normalizeUiThemePalette(ctx.user.ui_theme_palette || ctx.gabinete?.ui_theme_palette),
	          ui_sidebar_collapsed: Boolean(ctx.user.ui_sidebar_collapsed),
	          workspace_module_preferences: modulePreferences,
	          module_access: moduleAccess,
	          last_login_at: ctx.user.last_login_at,
          last_login_ip: ctx.user.last_login_ip,
          last_login_provider: ctx.user.last_login_provider,
        }
      : null,
    gabinete: ctx.gabinete
      ? {
          id: ctx.gabinete.id,
          name: ctx.gabinete.name,
          type: ctx.gabinete.type,
          onboarding_completed: Boolean(ctx.gabinete.onboarding_completed),
          parliamentarian_name: ctx.gabinete.parliamentarian_name,
          responsible_name: ctx.gabinete.responsible_name,
          city: ctx.gabinete.city,
          uf: ctx.gabinete.uf,
          slug: ctx.gabinete.slug,
          public_slug: ctx.gabinete.public_slug || ctx.gabinete.slug || "",
          phone: ctx.gabinete.phone,
          default_area_code: ctx.gabinete.default_area_code || "",
          default_follow_up_days: ctx.gabinete.default_follow_up_days,
          default_document_due_days: ctx.gabinete.default_document_due_days,
          default_birthday_notice_days: ctx.gabinete.default_birthday_notice_days,
	          team_label: ctx.gabinete.team_label || "Meu time",
	          workspace_module_config: workspaceModuleConfig,
	          workspace_module_global_config: workspaceModuleGlobalConfig,
	          ui_theme_mode: normalizeUiThemeMode(ctx.gabinete.ui_theme_mode),
          ui_theme_palette: normalizeUiThemePalette(ctx.gabinete.ui_theme_palette),
        }
      : null,
    gabineteOptions: (ctx.gabineteOptions || []).map((item) => ({
      id: item.id,
      name: item.name,
    })),
    authProviders: {
      google: {
        enabled: isGoogleOauthConfigured(),
        start_url: "/api/auth/google/start",
      },
    },
    support: {
      phone: SUPPORT_WHATSAPP_PHONE,
      pretty: SUPPORT_WHATSAPP_PRETTY,
      url: SUPPORT_WHATSAPP_URL,
      email: SUPPORT_EMAIL_ADDRESS,
      mailbox_ready: SUPPORT_EMAIL_MAILBOX_READY,
    },
    unreadNotifications: ctx.unreadNotifications || 0,
  };
}

function isEvolutionConfigured() {
  return Boolean(EVOLUTION_BASE_URL && EVOLUTION_GLOBAL_API_KEY);
}

function buildWhatsappConnectorSummary(gabinete) {
  return {
    mode: gabinete?.whatsapp_provider || (isEvolutionConfigured() ? "evolution" : "wa_me"),
    evolution_enabled: isEvolutionConfigured(),
    instance_name: gabinete?.whatsapp_instance_name || "",
    has_instance_token: Boolean(gabinete?.whatsapp_instance_token),
  };
}

function getWhatsappQrCooldownKey(gabineteId, instanceName) {
  return `${gabineteId}:${instanceName || ""}`;
}

function reserveWhatsappQrCooldown(cooldownKey) {
  const now = Date.now();
  const currentAllowedAt = Number(WHATSAPP_QR_COOLDOWNS.get(cooldownKey) || 0);
  if (currentAllowedAt > now) {
    return {
      allowed: false,
      nextAllowedAt: currentAllowedAt,
      remainingSeconds: Math.max(1, Math.ceil((currentAllowedAt - now) / 1000)),
    };
  }

  const nextAllowedAt = now + WHATSAPP_QR_RENEW_INTERVAL_MS;
  WHATSAPP_QR_COOLDOWNS.set(cooldownKey, nextAllowedAt);
  return {
    allowed: true,
    nextAllowedAt,
    remainingSeconds: Math.ceil(WHATSAPP_QR_RENEW_INTERVAL_MS / 1000),
  };
}

function releaseWhatsappQrCooldown(cooldownKey) {
  WHATSAPP_QR_COOLDOWNS.delete(cooldownKey);
}

function normalizeStorageBytes(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function normalizeWebdavUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return url.endsWith("/") ? url : `${url}/`;
}

function getStoragePasswordEnvName(gabinete) {
  return String(gabinete?.storage_webdav_password_env || `GABINETE360_STORAGE_WEBDAV_PASSWORD_GABINETE_${gabinete?.id || ""}`).trim();
}

function getStorageLocalUsedBytes(gabineteId) {
  const contactFiles = db
    .prepare("SELECT COALESCE(SUM(size_bytes), 0) AS total FROM contact_files WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId }).total;
  const financeReceipts = db
    .prepare(
      `
        SELECT COALESCE(SUM(receipt_file_size), 0) AS total
        FROM finance_entries
        WHERE gabinete_id = :gabinete_id
          AND COALESCE(receipt_file_url, '') <> ''
          AND (deleted_at IS NULL OR deleted_at = '')
      `,
    )
    .get({ gabinete_id: gabineteId }).total;
  return normalizeStorageBytes(contactFiles) + normalizeStorageBytes(financeReceipts);
}

function extractWebdavNumber(xml, tagName) {
  const pattern = new RegExp(`<[^>]*${tagName}[^>]*>\\s*([^<]+)`, "i");
  const match = String(xml || "").match(pattern);
  if (!match) return null;
  const value = Number(String(match[1] || "").trim());
  return Number.isFinite(value) ? value : null;
}

function extractWebdavText(xml, tagName) {
  const pattern = new RegExp(`<[^>]*${tagName}[^>]*>([\\s\\S]*?)<\\/[^>]*${tagName}>`, "i");
  const match = String(xml || "").match(pattern);
  if (!match) return "";
  return String(match[1] || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function normalizeStorageRelativePath(value) {
  const raw = String(value || "").replace(/\\/g, "/").trim();
  const parts = raw
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== "." && item !== "..");
  return parts.join("/");
}

function sanitizeStorageRelativePath(value) {
  const normalized = normalizeStorageRelativePath(value);
  if (!normalized) return "";
  return normalized
    .split("/")
    .map((part) => sanitizeStorageItemName(part))
    .filter(Boolean)
    .join("/");
}

function webdavUrlForPath(baseUrl, relativePath = "") {
  const base = normalizeWebdavUrl(baseUrl);
  const normalizedPath = normalizeStorageRelativePath(relativePath);
  if (!normalizedPath) return base;
  const encoded = normalizedPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}${encoded}/`;
}

function webdavItemUrlForPath(baseUrl, relativePath = "", { directory = false } = {}) {
  const base = normalizeWebdavUrl(baseUrl);
  const normalizedPath = normalizeStorageRelativePath(relativePath);
  if (!normalizedPath) return base;
  const encoded = normalizedPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}${encoded}${directory ? "/" : ""}`;
}

function getWebdavAuthorization(settings) {
  return `Basic ${Buffer.from(`${settings.webdav_username}:${settings.webdav_password}`).toString("base64")}`;
}

function sanitizeStorageItemName(value) {
  const name = String(value || "")
    .normalize("NFC")
    .replace(/[\\/]/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name === "." || name === "..") {
    throw new Error("Informe um nome valido.");
  }
  return name.slice(0, 180).trim();
}

function joinStoragePath(parentPath, itemName) {
  const parent = normalizeStorageRelativePath(parentPath);
  const name = sanitizeStorageItemName(itemName);
  return parent ? `${parent}/${name}` : name;
}

function getStoragePathFileName(relativePath) {
  const normalized = normalizeStorageRelativePath(relativePath);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "arquivo";
}

function getStorageParentPath(relativePath) {
  const normalized = normalizeStorageRelativePath(relativePath);
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function splitStorageName(name) {
  const cleanName = sanitizeStorageItemName(name);
  const dotIndex = cleanName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === cleanName.length - 1) {
    return { base: cleanName, ext: "" };
  }
  return {
    base: cleanName.slice(0, dotIndex),
    ext: cleanName.slice(dotIndex),
  };
}

function contentDispositionAttachment(filename) {
  const fallback = String(filename || "arquivo").replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename || "arquivo")}`;
}

function requireWebdavStorageSettings(gabinete) {
  const settings = buildStorageSettings(gabinete);
  if (!settings.webdav_enabled || !settings.webdav_password_configured) {
    throw new Error("Arquivos avancados ainda nao estao ativos neste gabinete.");
  }
  return settings;
}

async function fetchWebdavItem(settings, method, relativePath, { directory = false, headers = {}, body = undefined } = {}) {
  return fetchWebdavItemWithTimeout(settings, method, relativePath, { directory, headers, body, timeoutMs: STORAGE_WEBDAV_TIMEOUT_MS });
}

async function fetchWebdavItemWithTimeout(
  settings,
  method,
  relativePath,
  { directory = false, headers = {}, body = undefined, timeoutMs = STORAGE_WEBDAV_TIMEOUT_MS } = {},
) {
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const options = {
      method,
      headers: {
        Authorization: getWebdavAuthorization(settings),
        ...headers,
      },
      signal: controller.signal,
    };
    if (body !== undefined) {
      options.body = body;
      if (typeof body?.pipe === "function" || typeof body?.on === "function") {
        options.duplex = "half";
      }
    }
    return await fetch(webdavItemUrlForPath(settings.webdav_url, relativePath, { directory }), options);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function webdavPathExists(settings, relativePath, { directory = false } = {}) {
  const response = await fetchWebdavItem(settings, "HEAD", relativePath, { directory });
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error(`Nextcloud respondeu ${response.status}.`);
}

async function resolveUniqueUploadPath(settings, folderPath, filename) {
  const { base, ext } = splitStorageName(filename);
  for (let index = 0; index < 100; index += 1) {
    const candidateName = index === 0 ? `${base}${ext}` : `${base} (${index + 1})${ext}`;
    const candidatePath = joinStoragePath(folderPath, candidateName);
    if (!(await webdavPathExists(settings, candidatePath))) return candidatePath;
  }
  throw new Error("Ja existem muitos arquivos com esse nome nesta pasta.");
}

async function fetchWebdavQuota({ url, username, password }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_WEBDAV_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "PROPFIND",
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        Depth: "0",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body:
        '<?xml version="1.0" encoding="utf-8" ?>' +
        '<d:propfind xmlns:d="DAV:"><d:prop><d:quota-used-bytes/><d:quota-available-bytes/></d:prop></d:propfind>',
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Nextcloud respondeu ${response.status}.`);
    }
    const used = extractWebdavNumber(text, "quota-used-bytes");
    const available = extractWebdavNumber(text, "quota-available-bytes");
    if (used === null) {
      throw new Error("Nextcloud nao retornou a cota usada.");
    }
    return {
      used_bytes: normalizeStorageBytes(used),
      available_bytes: available === null || available < 0 ? null : normalizeStorageBytes(available),
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseWebdavDirectory(xml, settings, relativePath = "") {
  const basePath = new URL(settings.webdav_url).pathname;
  const currentPath = normalizeStorageRelativePath(relativePath);
  const responses = String(xml || "").match(/<d:response>[\s\S]*?<\/d:response>/g) || [];
  return responses
    .map((response) => {
      const href = extractWebdavText(response, "href");
      if (!href) return null;
      let pathName = "";
      try {
        pathName = decodeURIComponent(new URL(href, settings.webdav_url).pathname);
      } catch {
        pathName = decodeURIComponent(href.split("?")[0] || "");
      }
      if (!pathName.startsWith(basePath)) return null;
      const relative = normalizeStorageRelativePath(pathName.slice(basePath.length));
      if (relative === currentPath) return null;
      if (currentPath && !relative.startsWith(`${currentPath}/`)) return null;
      const childPart = currentPath ? relative.slice(currentPath.length + 1) : relative;
      if (!childPart || childPart.includes("/")) return null;
      const isDirectory = /<[^>]*resourcetype[^>]*>[\s\S]*?<[^>]*collection\s*\/>[\s\S]*?<\/[^>]*resourcetype>/i.test(response);
      const size = extractWebdavNumber(response, "getcontentlength");
      return {
        id: `webdav:${relative}`,
        name: childPart,
        path: relative,
        kind: isDirectory ? "folder" : "file",
        size_bytes: isDirectory ? null : normalizeStorageBytes(size),
        mime_type: extractWebdavText(response, "getcontenttype"),
        modified_at: extractWebdavText(response, "getlastmodified"),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    });
}

async function fetchWebdavDirectory(settings, relativePath = "") {
  const targetUrl = webdavUrlForPath(settings.webdav_url, relativePath);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_WEBDAV_TIMEOUT_MS);
  try {
    const response = await fetch(targetUrl, {
      method: "PROPFIND",
      headers: {
        Authorization: `Basic ${Buffer.from(`${settings.webdav_username}:${settings.webdav_password}`).toString("base64")}`,
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body:
        '<?xml version="1.0" encoding="utf-8" ?>' +
        '<d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/><d:getcontentlength/><d:getcontenttype/><d:resourcetype/><d:getetag/><d:quota-used-bytes/><d:quota-available-bytes/></d:prop></d:propfind>',
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Nextcloud respondeu ${response.status}.`);
    }
    return {
      path: normalizeStorageRelativePath(relativePath),
      items: parseWebdavDirectory(text, settings, relativePath),
      quota: {
        used_bytes: extractWebdavNumber(text, "quota-used-bytes"),
        available_bytes: extractWebdavNumber(text, "quota-available-bytes"),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function listLocalStorageFiles(gabineteId, limit = 200) {
  const contactFiles = db
    .prepare(
      `
        SELECT
          cf.id,
          cf.original_name AS name,
          cf.mime_type,
          cf.size_bytes,
          cf.created_at AS modified_at,
          cf.file_url,
          c.name AS contact_name
        FROM contact_files cf
        LEFT JOIN contacts c ON c.id = cf.contact_id AND c.gabinete_id = cf.gabinete_id
        WHERE cf.gabinete_id = :gabinete_id
        ORDER BY cf.created_at DESC, cf.id DESC
        LIMIT :limit
      `,
    )
    .all({ gabinete_id: gabineteId, limit })
    .map((item) => ({
      id: `contact-file:${item.id}`,
      name: item.name || "Arquivo",
      path: item.file_url || "",
      kind: "file",
      size_bytes: normalizeStorageBytes(item.size_bytes),
      mime_type: item.mime_type || "",
      modified_at: item.modified_at || "",
      context: item.contact_name ? `Contato: ${item.contact_name}` : "Anexo",
    }));

  const financeFiles = db
    .prepare(
      `
        SELECT
          id,
          COALESCE(NULLIF(receipt_file_name, ''), title, 'Comprovante') AS name,
          receipt_file_type AS mime_type,
          receipt_file_size AS size_bytes,
          updated_at AS modified_at,
          receipt_file_url AS file_url,
          title
        FROM finance_entries
        WHERE gabinete_id = :gabinete_id
          AND COALESCE(receipt_file_url, '') <> ''
          AND (deleted_at IS NULL OR deleted_at = '')
        ORDER BY updated_at DESC, id DESC
        LIMIT :limit
      `,
    )
    .all({ gabinete_id: gabineteId, limit })
    .map((item) => ({
      id: `finance-file:${item.id}`,
      name: item.name || "Comprovante",
      path: item.file_url || "",
      kind: "file",
      size_bytes: normalizeStorageBytes(item.size_bytes),
      mime_type: item.mime_type || "",
      modified_at: item.modified_at || "",
      context: item.title ? `Financeiro: ${item.title}` : "Comprovante financeiro",
    }));

  return [...contactFiles, ...financeFiles]
    .sort((a, b) => String(b.modified_at || "").localeCompare(String(a.modified_at || "")))
    .slice(0, limit);
}

function buildStorageSettings(gabinete) {
  const quotaBytes = normalizeStorageBytes(gabinete?.storage_quota_bytes, STORAGE_DEFAULT_QUOTA_BYTES) || STORAGE_DEFAULT_QUOTA_BYTES;
  const webdavUrl = normalizeWebdavUrl(gabinete?.storage_webdav_url);
  const webdavUsername = String(gabinete?.storage_webdav_username || "").trim();
  const passwordEnv = getStoragePasswordEnvName(gabinete);
  const webdavPassword = passwordEnv ? String(process.env[passwordEnv] || "") : "";
  const webdavEnabled = Boolean(Number(gabinete?.storage_webdav_enabled || 0) && webdavUrl && webdavUsername);
  return {
    quota_bytes: quotaBytes,
    provider: String(gabinete?.storage_provider || (webdavEnabled ? "nextcloud" : "local")).trim() || "local",
    plan_label: String(gabinete?.storage_plan_label || (webdavEnabled ? "Avancado" : "Básico")).trim(),
    webdav_enabled: webdavEnabled,
    webdav_url: webdavUrl,
    webdav_username: webdavUsername,
    webdav_password: webdavPassword,
    webdav_password_configured: Boolean(webdavPassword),
    webdav_public_url: String(gabinete?.storage_webdav_public_url || "").trim(),
    webdav_root_label: String(gabinete?.storage_webdav_root_label || "Arquivos do gabinete").trim(),
  };
}

async function buildStoragePayload(gabinete) {
  const settings = buildStorageSettings(gabinete);
  const localUsedBytes = getStorageLocalUsedBytes(gabinete.id);
  let usedBytes = localUsedBytes;
  let availableBytes = Math.max(0, settings.quota_bytes - usedBytes);
  let quotaBytes = settings.quota_bytes;
  let source = "local";
  let error = "";

  if (settings.webdav_enabled) {
    source = "configured";
    if (!settings.webdav_password_configured) {
      error = "Nextcloud configurado, mas falta a senha de aplicativo no servidor.";
    } else {
      try {
        const quota = await fetchWebdavQuota({
          url: settings.webdav_url,
          username: settings.webdav_username,
          password: settings.webdav_password,
        });
        usedBytes = quota.used_bytes;
        availableBytes = quota.available_bytes;
        quotaBytes = quota.available_bytes === null ? Math.max(settings.quota_bytes, usedBytes) : usedBytes + quota.available_bytes;
        source = "nextcloud";
      } catch (quotaError) {
        error = `Nao foi possivel consultar o Nextcloud agora. ${quotaError?.message || ""}`.trim();
      }
    }
  }

  const percent = quotaBytes > 0 ? Math.min(100, Math.max(0, (usedBytes / quotaBytes) * 100)) : 0;
  const upgradeUrl = `https://wa.me/${SUPPORT_WHATSAPP_PHONE}?text=${encodeURIComponent("Olá, quero ativar mais espaço de arquivos no Gabinete360.")}`;

  return {
    plan: {
      label: settings.plan_label || (settings.webdav_enabled ? "Avancado" : "Básico"),
      kind: settings.webdav_enabled ? "advanced" : "basic",
      quota_bytes: quotaBytes,
      webdav_enabled: settings.webdav_enabled && settings.webdav_password_configured,
      upgrade_available: !settings.webdav_enabled,
    },
    usage: {
      used_bytes: usedBytes,
      available_bytes: availableBytes,
      quota_bytes: quotaBytes,
      percent,
      source,
      checked_at: nowIso(),
      ...(error ? { error } : {}),
    },
    nextcloud: settings.webdav_enabled
      ? {
          web_url: settings.webdav_public_url,
          password_configured: settings.webdav_password_configured,
          root_label: settings.webdav_root_label,
        }
      : null,
    upgrade: {
      label: "Pedir ao suporte",
      url: upgradeUrl,
    },
  };
}

async function buildStorageFilesPayload(gabinete, relativePath = "") {
  const settings = buildStorageSettings(gabinete);
  const storage = await buildStoragePayload(gabinete);
  const normalizedPath = normalizeStorageRelativePath(relativePath);
  const breadcrumbs = normalizedPath
    ? normalizedPath.split("/").reduce(
        (items, part, index, parts) => [
          ...items,
          {
            label: part,
            path: parts.slice(0, index + 1).join("/"),
          },
        ],
        [{ label: "Arquivos", path: "" }],
      )
    : [{ label: "Arquivos", path: "" }];

  if (settings.webdav_enabled && settings.webdav_password_configured) {
    const directory = await fetchWebdavDirectory(settings, normalizedPath);
    return {
      ...storage,
      mode: "nextcloud",
      path: directory.path,
      breadcrumbs,
      items: directory.items,
    };
  }

  return {
    ...storage,
    mode: "local",
    path: "",
    breadcrumbs,
    items: listLocalStorageFiles(gabinete.id),
  };
}

async function ensureWebdavFolderPath(settings, folderPath) {
  const normalized = sanitizeStorageRelativePath(folderPath);
  if (!normalized) return;
  const parts = normalized.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    const currentPath = parts.slice(0, index + 1).join("/");
    if (await webdavPathExists(settings, currentPath, { directory: true })) continue;
    const response = await fetchWebdavItem(settings, "MKCOL", currentPath, { directory: true });
    if (!response.ok && response.status !== 405 && response.status !== 409) {
      throw new Error(`Nao foi possivel criar a pasta ${parts[index]}. Nextcloud respondeu ${response.status}.`);
    }
  }
}

async function assertStorageUploadFits(settings, sizeBytes) {
  const size = normalizeStorageBytes(sizeBytes);
  if (size <= 0) throw new Error("Arquivo vazio.");
  const quota = await fetchWebdavQuota({
    url: settings.webdav_url,
    username: settings.webdav_username,
    password: settings.webdav_password,
  });
  if (quota.available_bytes !== null && size > quota.available_bytes) {
    const error = new Error("Nao ha espaco livre suficiente neste gabinete.");
    error.status = 413;
    throw error;
  }
}

async function uploadStorageFileStream(gabinete, req, url) {
  const settings = requireWebdavStorageSettings(gabinete);
  const targetPath = sanitizeStorageRelativePath(url.searchParams.get("path") || "");
  const overwrite = url.searchParams.get("overwrite") === "1";
  const sizeBytes = normalizeStorageBytes(req.headers["content-length"]);
  if (!targetPath) throw new Error("Informe o nome do arquivo.");
  await assertStorageUploadFits(settings, sizeBytes);

  const parentPath = getStorageParentPath(targetPath);
  await ensureWebdavFolderPath(settings, parentPath);
  if (!overwrite && (await webdavPathExists(settings, targetPath))) {
    const error = new Error("Ja existe um arquivo com esse nome.");
    error.status = 409;
    throw error;
  }

  const response = await fetchWebdavItemWithTimeout(settings, "PUT", targetPath, {
    timeoutMs: STORAGE_WEBDAV_UPLOAD_TIMEOUT_MS,
    headers: {
      "Content-Type": String(req.headers["content-type"] || "application/octet-stream"),
      "Content-Length": String(sizeBytes),
    },
    body: req,
  });
  if (!response.ok) {
    throw new Error(`Nextcloud respondeu ${response.status}.`);
  }
  return {
    uploaded_count: 1,
    item: {
      name: getStoragePathFileName(targetPath),
      path: targetPath,
      size_bytes: sizeBytes,
      overwritten: overwrite,
    },
  };
}

async function uploadStorageFiles(gabinete, req) {
  const settings = requireWebdavStorageSettings(gabinete);
  const { fields, files } = await parseMultipart(req, "/tmp");
  const folderPath = normalizeStorageRelativePath(fields.path || "");
  if (!files.length) throw new Error("Escolha pelo menos 1 arquivo.");
  const totalBytes = files.reduce((total, file) => total + normalizeStorageBytes(file.size), 0);
  await assertStorageUploadFits(settings, totalBytes);

  const uploaded = [];
  for (const file of files) {
    try {
      if (normalizeStorageBytes(file.size) <= 0) throw new Error("Arquivo vazio.");
      const targetPath = await resolveUniqueUploadPath(settings, folderPath, file.filename || "arquivo");
      const body = readFileSync(file.path);
      const response = await fetchWebdavItem(settings, "PUT", targetPath, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "Content-Length": String(body.length),
        },
        body,
      });
      if (!response.ok) {
        throw new Error(`Nextcloud respondeu ${response.status}.`);
      }
      uploaded.push({
        name: getStoragePathFileName(targetPath),
        path: targetPath,
        size_bytes: normalizeStorageBytes(file.size),
      });
    } finally {
      if (file.path && existsSync(file.path)) {
        try {
          unlinkSync(file.path);
        } catch {}
      }
    }
  }

  return { uploaded_count: uploaded.length, items: uploaded };
}

async function createStorageFolder(gabinete, payload) {
  const settings = requireWebdavStorageSettings(gabinete);
  const parentPath = normalizeStorageRelativePath(payload?.path || "");
  const folderPath = joinStoragePath(parentPath, payload?.name || "");
  if (await webdavPathExists(settings, folderPath, { directory: true })) {
    throw new Error("Ja existe uma pasta com esse nome.");
  }
  const response = await fetchWebdavItem(settings, "MKCOL", folderPath, { directory: true });
  if (!response.ok) {
    throw new Error(`Nao foi possivel criar a pasta. Nextcloud respondeu ${response.status}.`);
  }
  return { ok: true, path: folderPath };
}

async function renameStorageItem(gabinete, payload) {
  const settings = requireWebdavStorageSettings(gabinete);
  const currentPath = normalizeStorageRelativePath(payload?.path || "");
  const kind = payload?.kind === "folder" ? "folder" : "file";
  const overwrite = Boolean(payload?.overwrite);
  if (!currentPath) throw new Error("Escolha o arquivo ou pasta.");
  const parentPath = getStorageParentPath(currentPath);
  const nextPath = joinStoragePath(parentPath, payload?.name || "");
  if (nextPath === currentPath) return { ok: true, path: currentPath };
  if (!overwrite && (await webdavPathExists(settings, nextPath, { directory: kind === "folder" }))) {
    const error = new Error("Ja existe um item com esse nome.");
    error.status = 409;
    throw error;
  }
  const response = await fetchWebdavItem(settings, "MOVE", currentPath, {
    directory: kind === "folder",
    headers: {
      Destination: webdavItemUrlForPath(settings.webdav_url, nextPath, { directory: kind === "folder" }),
      Overwrite: overwrite ? "T" : "F",
    },
  });
  if (!response.ok) {
    throw new Error(`Nao foi possivel renomear. Nextcloud respondeu ${response.status}.`);
  }
  return { ok: true, path: nextPath };
}

async function deleteStorageItem(gabinete, payload) {
  const settings = requireWebdavStorageSettings(gabinete);
  const itemPath = normalizeStorageRelativePath(payload?.path || "");
  const kind = payload?.kind === "folder" ? "folder" : "file";
  if (!itemPath) throw new Error("Escolha o arquivo ou pasta.");
  const response = await fetchWebdavItem(settings, "DELETE", itemPath, { directory: kind === "folder" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Nao foi possivel apagar. Nextcloud respondeu ${response.status}.`);
  }
  return { ok: true, deleted_path: itemPath };
}

function ensureApiAuthenticated(ctx, res) {
  if (!ctx.user) {
    sendJson(res, { error: "Sessao expirada. Entre novamente." }, 401);
    return false;
  }
  return true;
}

function defaultUserModuleAccess(user) {
  const canWrite = canEditRecords(user);
  return WORKSPACE_MODULE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = {
      module_key: key,
      can_view: Boolean(user),
      can_create: canWrite,
      can_edit: canWrite,
      can_delete: canWrite,
    };
    return accumulator;
  }, {});
}

function emptyUserModuleAccess() {
  return WORKSPACE_MODULE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = {
      module_key: key,
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
    };
    return accumulator;
  }, {});
}

function getUserModulePermissionRows(gabineteId, userId) {
  if (!gabineteId || !userId) return [];
  return db
    .prepare(
      `
        SELECT module_key, can_view, can_create, can_edit, can_delete
        FROM user_module_permissions
        WHERE gabinete_id = :gabinete_id AND user_id = :user_id
      `,
    )
    .all({ gabinete_id: gabineteId, user_id: userId });
}

function buildUserModuleAccess(user, gabinete) {
  if (!user || !gabinete) return emptyUserModuleAccess();
  if (["super_admin", "gabinete_admin"].includes(user.role)) return defaultUserModuleAccess(user);

  const rows = getUserModulePermissionRows(gabinete.id, user.id);
  if (!rows.length) return defaultUserModuleAccess(user);

  const access = emptyUserModuleAccess();
  rows.forEach((row) => {
    if (!WORKSPACE_MODULE_KEY_SET.has(row.module_key)) return;
    access[row.module_key] = {
      module_key: row.module_key,
      can_view: Boolean(row.can_view),
      can_create: Boolean(row.can_create),
      can_edit: Boolean(row.can_edit),
      can_delete: Boolean(row.can_delete),
    };
  });
  return access;
}

function parseWorkspaceModulePreferences(value) {
  let source = null;
  if (value && typeof value === "object") {
    source = value;
  } else if (String(value || "").trim()) {
    try {
      source = JSON.parse(String(value));
    } catch {
      source = null;
    }
  }

  return WORKSPACE_MODULE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = typeof source?.[key] === "boolean" ? source[key] : true;
    return accumulator;
  }, {});
}

function normalizeWorkspaceModulePreferences(value) {
  let source = value && typeof value === "object" ? value : null;
  if (!source && String(value || "").trim()) {
    try {
      source = JSON.parse(String(value));
    } catch {
      source = null;
    }
  }
  const preferences = parseWorkspaceModulePreferences(source);
  const order = Array.isArray(source?.order) ? source.order : [];
  return {
    ...preferences,
    order: order.filter((key) => WORKSPACE_MODULE_KEY_SET.has(key)),
  };
}

function buildEffectiveWorkspaceModuleConfig(gabinete, user) {
  const globalConfig = normalizeWorkspaceModuleConfig(gabinete?.workspace_module_config, gabinete?.type);
  const moduleAccess = buildUserModuleAccess(user, gabinete);
  const preferences = parseWorkspaceModulePreferences(user?.workspace_module_preferences);
  return WORKSPACE_MODULE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = Boolean(globalConfig[key]) && Boolean(moduleAccess[key]?.can_view) && Boolean(preferences[key]);
    return accumulator;
  }, { ...globalConfig, order: Array.isArray(globalConfig.order) ? globalConfig.order : WORKSPACE_MODULE_KEYS });
}

function canAccessModule(ctx, moduleKey, action = "view") {
  if (!ctx?.user || !ctx.gabinete) return false;
  if (moduleKey === "admin") return canManageUsers(ctx.user);
  if (!WORKSPACE_MODULE_KEY_SET.has(moduleKey)) return true;
  const globalConfig = normalizeWorkspaceModuleConfig(ctx.gabinete.workspace_module_config, ctx.gabinete.type);
  if (!globalConfig[moduleKey]) return false;
  if (["super_admin", "gabinete_admin"].includes(ctx.user.role)) return true;
  const access = buildUserModuleAccess(ctx.user, ctx.gabinete)[moduleKey];
  if (!access?.can_view) return false;
  if (action === "view") return true;
  if (!canEditRecords(ctx.user)) return false;
  if (action === "create") return Boolean(access.can_create);
  if (action === "delete") return Boolean(access.can_delete);
  return Boolean(access.can_edit);
}

function ensureApiModuleAccess(ctx, res, moduleKey, action = "view") {
  if (!ensureApiAuthenticated(ctx, res)) return false;
  if (!canAccessModule(ctx, moduleKey, action)) {
    sendJson(res, { error: "Seu usuario nao tem acesso a este modulo." }, 403);
    return false;
  }
  return true;
}

function apiPermissionAction(method) {
  if (method === "GET") return "view";
  if (method === "POST") return "create";
  if (method === "DELETE") return "delete";
  return "edit";
}

function getApiModuleRequirement(pathname, method) {
  if (!pathname.startsWith("/api/")) return null;
  if (
    pathname === "/api/session"
    || pathname.startsWith("/api/auth/")
    || pathname.startsWith("/api/public/")
    || pathname.startsWith("/api/me")
    || pathname.startsWith("/api/lookups/")
    || pathname.startsWith("/api/notifications")
    || pathname.startsWith("/api/whatsapp/webhook/")
  ) {
    return null;
  }

  if (pathname === "/api/dashboard" || pathname === "/api/holidays") {
    return { module: "dashboard", action: "view" };
  }
  if (pathname.startsWith("/api/whatsapp")) return { module: "whatsapp", action: apiPermissionAction(method) };
  if (pathname.startsWith("/api/tickets") || pathname.startsWith("/api/email") || pathname.startsWith("/api/calls")) {
    return { module: "tickets", action: apiPermissionAction(method) };
  }
  if (pathname.startsWith("/api/contacts")) return { module: "contacts", action: apiPermissionAction(method) };
  if (pathname.startsWith("/api/documents")) return { module: "documents", action: apiPermissionAction(method) };
  if (pathname.startsWith("/api/projects") || pathname.startsWith("/api/legislative-connectors")) {
    return { module: "projects", action: apiPermissionAction(method) };
  }
  if (pathname.startsWith("/api/notes") || pathname.startsWith("/api/ai-links")) {
    return { module: "notes", action: apiPermissionAction(method) };
  }
  if (pathname.startsWith("/api/tasks")) return { module: "tasks", action: apiPermissionAction(method) };
  if (pathname.startsWith("/api/finance")) return { module: "finance", action: apiPermissionAction(method) };
  if (pathname.startsWith("/api/storage")) return { module: "files", action: apiPermissionAction(method) };
  if (
    pathname.startsWith("/api/settings")
    || pathname.startsWith("/api/users")
    || pathname.startsWith("/api/backup")
    || pathname.startsWith("/api/imports")
    || pathname.startsWith("/api/trash")
    || pathname.startsWith("/api/reports")
    || pathname === "/api/switch-gabinete"
  ) {
    return { module: "admin", action: apiPermissionAction(method) };
  }
  return null;
}

function ensureApiCanEdit(ctx, res) {
  if (!ensureApiAuthenticated(ctx, res)) return false;
  if (!canEditRecords(ctx.user)) {
    sendJson(res, { error: "Seu perfil possui acesso apenas de leitura." }, 403);
    return false;
  }
  return true;
}

function ensureApiCanManageUsers(ctx, res) {
  if (!ensureApiAuthenticated(ctx, res)) return false;
  if (!canManageUsers(ctx.user)) {
    sendJson(res, { error: "Apenas administradores podem gerenciar usuarios." }, 403);
    return false;
  }
  return true;
}

function requireApiGabinete(ctx, res) {
  if (!ensureApiAuthenticated(ctx, res)) return null;
  if (!ctx.gabinete) {
    sendJson(res, { error: "Nenhum gabinete ativo para esta sessao." }, 403);
    return null;
  }
  return ctx.gabinete;
}

function listDemandTitleStats(gabineteId) {
  return db.prepare(
    `
      SELECT
        MIN(TRIM(demand_title)) AS title,
        COUNT(*) AS total
      FROM tickets
      WHERE gabinete_id = :gabinete_id
        AND COALESCE(is_archived, 0) = 0
        AND TRIM(COALESCE(demand_title, '')) <> ''
      GROUP BY lower(TRIM(demand_title))
      ORDER BY total DESC, title COLLATE NOCASE
      LIMIT 120
    `,
  ).all({ gabinete_id: gabineteId }).map((item) => ({
    title: item.title,
    total: Number(item.total || 0),
  }));
}

function buildApiLookups(gabineteId) {
  return {
    statuses: listStatuses(gabineteId),
    channels: listChannels(gabineteId),
    categories: listCategories(gabineteId),
    demand_titles: listDemandTitleStats(gabineteId),
    users: listUsersByGabinete(gabineteId).map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      role_label: getRoleLabel(item.role),
    })),
    contacts: listContacts(gabineteId)
      .slice(0, 500)
      .map((item) => ({
        id: item.id,
        name: item.name,
        nickname: item.nickname,
        phone: item.phone,
        whatsapp: item.whatsapp,
        cpf_rg_cns: item.cpf_rg_cns,
        birth_date: item.birth_date,
        email: item.email,
        profession: item.profession,
        register_kind: item.register_kind,
        contact_type: item.contact_type,
        segment: item.segment,
        gender: item.gender,
        is_leader: Boolean(item.is_leader),
        is_authority: Boolean(item.is_authority),
        referred_by: item.referred_by,
        company_legal_name: item.company_legal_name,
        foundation_date: item.foundation_date,
        employee_count: item.employee_count,
        has_pet: Boolean(item.has_pet),
        address: item.address,
        number: item.number,
        complement: item.complement,
        neighborhood: item.neighborhood,
        zip_code: item.zip_code,
        city: item.city,
        uf: item.uf,
        social_instagram: item.social_instagram,
        social_facebook: item.social_facebook,
        social_x: item.social_x,
        social_youtube: item.social_youtube,
        geo_lat: item.geo_lat,
        geo_lng: item.geo_lng,
      })),
    tickets: listTickets(gabineteId)
      .slice(0, 500)
      .map((item) => ({
        id: item.id,
        number: item.number,
        demand_title: item.demand_title,
        contact_name: item.contact_name,
        contact_nickname: item.contact_nickname,
      })),
    document_templates: listDocumentTemplates(gabineteId).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      topic: item.topic,
      variant_name: item.variant_name,
    })),
    signature_profiles: listSignatureProfiles(gabineteId).map((item) => ({
      id: item.id,
      label: item.label,
      signatory_name: item.signatory_name,
      signatory_role: item.signatory_role,
    })),
    whatsapp_templates: listWhatsappTemplates(gabineteId).map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      kind: item.kind,
      active: Boolean(item.active),
    })),
    documents: listDocuments(gabineteId)
      .slice(0, 500)
      .map((item) => ({
        id: item.id,
        internal_number: item.internal_number,
        subject_line: item.subject_line,
      })),
    projects: listProjects(gabineteId)
      .slice(0, 500)
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
      })),
    finance_entries: listFinanceEntries(gabineteId)
      .slice(0, 300)
      .map((item) => ({
        id: item.id,
        title: item.title,
        entry_type: item.entry_type,
        entry_date: item.entry_date,
      })),
  };
}

function withStatusColors(items, gabineteId) {
  const statuses = listStatuses(gabineteId);
  const colorMap = new Map(statuses.map((item) => [item.name, item.color]));
  return items.map((item) => ({
    ...item,
    status_color: colorMap.get(item.status) || "#2563eb",
  }));
}

async function handleApi(req, res, url, pathname, ctx) {
  if (pathname === "/api/session" && req.method === "GET") {
    return sendJson(res, buildSessionPayload(ctx));
  }

  const apiModuleRequirement = getApiModuleRequirement(pathname, req.method);
  if (
    apiModuleRequirement
    && !ensureApiModuleAccess(ctx, res, apiModuleRequirement.module, apiModuleRequirement.action)
  ) {
    return;
  }

  if (pathname === "/api/search" && req.method === "GET") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    const query = String(url.searchParams.get("q") ?? "").trim();
    return sendJson(res, { items: buildGlobalSearchResults(gabinete.id, query) });
  }

  if (pathname === "/api/storage" && req.method === "GET") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    return sendJson(res, await buildStoragePayload(gabinete));
  }

  if (pathname === "/api/storage/files" && req.method === "GET") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    try {
      return sendJson(res, await buildStorageFilesPayload(gabinete, url.searchParams.get("path") || ""));
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel listar os arquivos." }, 422);
    }
  }

  if (pathname === "/api/storage/files/download" && req.method === "GET") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    try {
      const settings = requireWebdavStorageSettings(gabinete);
      const filePath = normalizeStorageRelativePath(url.searchParams.get("path") || "");
      if (!filePath) return sendJson(res, { error: "Escolha o arquivo." }, 422);
      const response = await fetchWebdavItem(settings, "GET", filePath);
      if (!response.ok) {
        return sendJson(res, { error: `Nao foi possivel baixar. Nextcloud respondeu ${response.status}.` }, 422);
      }
      const filename = getStoragePathFileName(filePath);
      res.writeHead(200, {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": contentDispositionAttachment(filename),
        ...(response.headers.get("content-length") ? { "Content-Length": response.headers.get("content-length") } : {}),
      });
      if (response.body) {
        Readable.fromWeb(response.body).pipe(res);
      } else {
        res.end(Buffer.from(await response.arrayBuffer()));
      }
      return;
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel baixar o arquivo." }, 422);
    }
  }

  if (pathname === "/api/storage/files/upload" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    try {
      return sendJson(res, await uploadStorageFiles(gabinete, req), 201);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel enviar os arquivos." }, Number(error?.status || 422));
    }
  }

  if (pathname === "/api/storage/files/upload-one" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    try {
      return sendJson(res, await uploadStorageFileStream(gabinete, req, url), 201);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel enviar o arquivo." }, Number(error?.status || 422));
    }
  }

  if (pathname === "/api/storage/folders" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    try {
      return sendJson(res, await createStorageFolder(gabinete, await parseBody(req)), 201);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel criar a pasta." }, 422);
    }
  }

  if (pathname === "/api/storage/files" && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    try {
      return sendJson(res, await renameStorageItem(gabinete, await parseBody(req)));
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel renomear." }, Number(error?.status || 422));
    }
  }

  if (pathname === "/api/storage/files" && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    try {
      return sendJson(res, await deleteStorageItem(gabinete, await parseBody(req)));
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel apagar." }, 422);
    }
  }

  if (pathname === "/api/trash/summary" && req.method === "GET") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    return sendJson(res, buildTrashSummary(gabinete.id));
  }

  if (pathname === "/api/trash" && req.method === "GET") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    return sendJson(res, {
      items: listTrashItems(gabinete.id, {
        type: url.searchParams.get("type") || "",
        q: url.searchParams.get("q") || "",
      }),
      summary: buildTrashSummary(gabinete.id),
      types: Object.entries(TRASH_DEFINITIONS).map(([value, definition]) => ({
        value,
        label: definition.plural_label,
      })),
    });
  }

  if (pathname === "/api/trash/restore" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    const body = await parseBody(req);
    const items = normalizeTrashItems(body);
    if (!items.length) return sendJson(res, { error: "Selecione pelo menos 1 item da lixeira." }, 422);
    const grouped = groupTrashItemsByType(items);
    const mode = String(body.mode || "").trim();
    const conflicts = detectTrashRestoreConflicts(gabinete.id, grouped);
    if (conflicts.length && !["force", "merge"].includes(mode)) {
      return sendJson(res, { error: "Existem conflitos para restaurar.", conflicts }, 409);
    }
    const result = restoreTrashItems(gabinete.id, grouped, { mode });
    logAudit(gabinete.id, ctx.user.id, mode === "merge" ? "merge_restore" : "restore", "trash", null, null, {
      items,
      conflicts,
      ...result,
    });
    return sendJson(res, { ...result, conflicts: conflicts.length ? conflicts : [] });
  }

  if (pathname === "/api/trash/permanent-delete" && req.method === "POST") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    if (ctx.user?.role !== "super_admin") return sendJson(res, { error: "Apenas o suporte pode apagar definitivamente." }, 403);
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    const body = await parseBody(req);
    if (String(body.confirmation || "") !== "EXCLUIR") {
      return sendJson(res, { error: "Digite EXCLUIR para confirmar." }, 422);
    }
    const items = normalizeTrashItems(body);
    if (!items.length) return sendJson(res, { error: "Selecione pelo menos 1 item da lixeira." }, 422);
    const grouped = groupTrashItemsByType(items);
    if (grouped.contacts?.length) {
      const ticketCount = countTicketsForContacts(gabinete.id, grouped.contacts);
      if (ticketCount > 0) {
        return sendJson(res, {
          error: `${ticketCount} atendimento(s) estao ligados aos contatos selecionados. Restaure, junte ou mantenha na lixeira.`,
        }, 422);
      }
    }
    const deletedCount = Object.entries(grouped).reduce((sum, [type, ids]) => sum + permanentlyDeleteRows(gabinete.id, type, ids), 0);
    logAudit(gabinete.id, ctx.user.id, "permanent_delete", "trash", null, null, {
      items,
      deleted_count: deletedCount,
    });
    return sendJson(res, { deleted_count: deletedCount });
  }

  if (pathname === "/api/trash/empty-expired" && req.method === "POST") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    if (ctx.user?.role !== "super_admin") return sendJson(res, { error: "Apenas o suporte pode limpar itens vencidos definitivamente." }, 403);
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    const now = nowIso();
    const items = Object.entries(TRASH_DEFINITIONS).flatMap(([type, definition]) =>
      db
        .prepare(
          `
            SELECT id
            FROM ${definition.table}
            WHERE gabinete_id = :gabinete_id
              AND ${deletedRowWhere()}
              AND purge_after IS NOT NULL
              AND purge_after != ''
              AND purge_after <= :now
          `,
        )
        .all({ gabinete_id: gabinete.id, now })
        .map((row) => ({ type, id: row.id })),
    );
    const grouped = groupTrashItemsByType(items);
    const deletedCount = Object.entries(grouped).reduce((sum, [type, ids]) => sum + permanentlyDeleteRows(gabinete.id, type, ids), 0);
    logAudit(gabinete.id, ctx.user.id, "empty_expired", "trash", null, null, { deleted_count: deletedCount });
    return sendJson(res, { deleted_count: deletedCount });
  }

  if (pathname === "/api/trash/empty-all" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    const body = await parseBody(req);
    if (String(body.confirmation || "") !== "LIMPAR") {
      return sendJson(res, { error: "Digite LIMPAR para confirmar." }, 422);
    }
    const items = Object.entries(TRASH_DEFINITIONS).flatMap(([type, definition]) =>
      db
        .prepare(`SELECT id FROM ${definition.table} WHERE gabinete_id = :gabinete_id AND ${userVisibleTrashRowWhere()}`)
        .all({ gabinete_id: gabinete.id, trash_visible_cutoff: trashVisibleCutoff() })
        .map((row) => ({ type, id: row.id })),
    );
    const grouped = groupTrashItemsByType(items);
    const hiddenCount = Object.entries(grouped).reduce((sum, [type, ids]) => sum + hideRowsFromTrash(gabinete.id, type, ids, ctx.user.id), 0);
    logAudit(gabinete.id, ctx.user.id, "empty_all", "trash", null, null, {
      hidden_count: hiddenCount,
      visible_days: TRASH_VISIBLE_DAYS,
      technical_retention_days: TRASH_RETENTION_DAYS,
    });
    return sendJson(res, {
      hidden_count: hiddenCount,
      retention_days: TRASH_VISIBLE_DAYS,
      message: "A lixeira foi limpa.",
    });
  }

  if (pathname === "/api/notifications" && req.method === "GET") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    const includeRead = url.searchParams.get("include_read") === "1";
    return sendJson(res, {
      items: listNotifications(gabinete.id, ctx.user)
        .filter((item) => includeRead || !item.is_read)
        .slice(0, 30)
        .map((item) => ({
          id: item.id,
          title: item.title,
          message: item.message,
          kind: item.kind,
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          is_read: Boolean(item.is_read),
          created_at: item.created_at,
          read_at: item.read_at || null,
        })),
    });
  }

  if (pathname === "/api/notifications/read-all" && req.method === "POST") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const gabinete = requireGabinete(ctx, res);
    if (!gabinete) return;
    const result = db.prepare(
      `
        UPDATE notifications
        SET is_read = 1, read_at = :read_at
        WHERE gabinete_id = :gabinete_id
          AND is_read = 0
          AND user_id = :user_id
      `,
    ).run({
      gabinete_id: gabinete.id,
      user_id: ctx.user.id,
      read_at: nowIso(),
    });
    return sendJson(res, { ok: true, read_count: result.changes || 0 });
  }

  if (pathname === "/api/auth/google/pending" && req.method === "GET") {
    const pendingGoogle = readGoogleOauthPending(ctx.cookies);
    if (!pendingGoogle) {
      return sendJson(res, { error: "Nenhum cadastro pendente com Google encontrado." }, 404);
    }

    return sendJson(res, { pending: pendingGoogle });
  }

  if (pathname === "/api/me" && req.method === "GET") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    return sendJson(res, {
      user: {
        id: ctx.user.id,
        name: ctx.user.name,
        username: ctx.user.username,
        email: ctx.user.email,
        phone: ctx.user.phone,
        role: ctx.user.role,
        role_label: ctx.user.role_label,
        ui_theme_mode: normalizeUiThemeMode(ctx.user.ui_theme_mode || ctx.gabinete?.ui_theme_mode),
        ui_theme_palette: normalizeUiThemePalette(ctx.user.ui_theme_palette || ctx.gabinete?.ui_theme_palette),
        ui_sidebar_collapsed: Boolean(ctx.user.ui_sidebar_collapsed),
      },
    });
  }

  if (pathname === "/api/me" && req.method === "PATCH") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const body = await parseBody(req);
    const error = validateOwnProfileForm(body);
    if (error) return sendJson(res, { error }, 422);

    const duplicateUsername = db
      .prepare(
        `
          SELECT id
          FROM users
          WHERE lower(username) = lower(:username)
            AND id <> :id
          LIMIT 1
        `,
      )
      .get({
        username: body.username,
        id: ctx.user.id,
      });
    if (duplicateUsername) {
      return sendJson(res, { error: "Este usuario ja esta em uso." }, 409);
    }

    const duplicateEmail = db
      .prepare(
        `
          SELECT id
          FROM users
          WHERE lower(email) = lower(:email)
            AND id <> :id
          LIMIT 1
        `,
      )
      .get({
        email: body.email,
        id: ctx.user.id,
      });
    if (duplicateEmail) {
      return sendJson(res, { error: "Este e-mail ja esta em uso." }, 409);
    }

    if (body.new_password) {
      if (!verifyPassword(body.current_password, ctx.user.password_hash)) {
        return sendJson(res, { error: "A senha atual nao confere." }, 422);
      }
    }

    const passwordHash = body.new_password ? hashPassword(body.new_password) : ctx.user.password_hash;
    const { notes: _notes, ...updatePayload } = payload;
    db.prepare(
      `
        UPDATE users
        SET name = :name,
            username = :username,
            email = :email,
            phone = :phone,
            password_hash = :password_hash,
            must_change_password = CASE WHEN :password_changed = 1 THEN 0 ELSE must_change_password END,
            password_changed_at = CASE WHEN :password_changed = 1 THEN :password_changed_at ELSE password_changed_at END,
            updated_at = :updated_at
        WHERE id = :id
      `,
    ).run({
      id: ctx.user.id,
      name: body.name,
      username: body.username,
      email: body.email,
      phone: normalizePhone(body.phone),
      password_hash: passwordHash,
      password_changed: body.new_password ? 1 : 0,
      password_changed_at: body.new_password ? nowIso() : "",
      updated_at: nowIso(),
    });

    logAudit(ctx.gabinete?.id ?? ctx.user.gabinete_id ?? null, ctx.user.id, "update", "self_profile", ctx.user.id, {
      name: ctx.user.name,
      username: ctx.user.username,
      email: ctx.user.email,
      phone: ctx.user.phone,
    }, {
      name: body.name,
      username: body.username,
      email: body.email,
      phone: normalizePhone(body.phone),
      password_changed: Boolean(body.new_password),
    });

    return sendJson(res, { ok: true });
  }

  if (pathname === "/api/me/theme" && req.method === "PATCH") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const body = await parseBody(req);
    const requestedThemeMode = String(body.ui_theme_mode || "").trim().toLowerCase();
    const requestedThemePalette = String(body.ui_theme_palette || "").trim().toLowerCase();
    if (!UI_THEME_MODES.has(requestedThemeMode)) {
      return sendJson(res, { error: "Escolha um modo de tema valido." }, 422);
    }
    if (!UI_THEME_PALETTES.has(requestedThemePalette)) {
      return sendJson(res, { error: "Escolha uma paleta valida." }, 422);
    }

    const previous = {
      ui_theme_mode: ctx.user.ui_theme_mode || "",
      ui_theme_palette: ctx.user.ui_theme_palette || "",
    };
    db.prepare(
      `
        UPDATE users
        SET ui_theme_mode = :ui_theme_mode,
            ui_theme_palette = :ui_theme_palette,
            updated_at = :updated_at
        WHERE id = :id
      `,
    ).run({
      id: ctx.user.id,
      ui_theme_mode: normalizeUiThemeMode(requestedThemeMode),
      ui_theme_palette: normalizeUiThemePalette(requestedThemePalette),
      updated_at: nowIso(),
    });

    logAudit(ctx.gabinete?.id ?? ctx.user.gabinete_id ?? null, ctx.user.id, "update", "theme_preference", ctx.user.id, previous, {
      ui_theme_mode: requestedThemeMode,
      ui_theme_palette: requestedThemePalette,
    });

    return sendJson(res, { ok: true });
  }

	  if (pathname === "/api/me/navigation" && req.method === "PATCH") {
	    if (!ensureApiAuthenticated(ctx, res)) return;
	    const body = await parseBody(req);
	    const nextSidebarCollapsed = parseBooleanLike(body.ui_sidebar_collapsed, Boolean(ctx.user.ui_sidebar_collapsed));
	    const nextModulePreferences = body.workspace_module_preferences === undefined
	      ? normalizeWorkspaceModulePreferences(ctx.user.workspace_module_preferences)
	      : normalizeWorkspaceModulePreferences(body.workspace_module_preferences);
	    const previous = {
	      ui_sidebar_collapsed: Boolean(ctx.user.ui_sidebar_collapsed),
	      workspace_module_preferences: normalizeWorkspaceModulePreferences(ctx.user.workspace_module_preferences),
	    };

	    db.prepare(
	      `
	        UPDATE users
	        SET ui_sidebar_collapsed = :ui_sidebar_collapsed,
	            workspace_module_preferences = :workspace_module_preferences,
	            updated_at = :updated_at
	        WHERE id = :id
	      `,
	    ).run({
	      id: ctx.user.id,
	      ui_sidebar_collapsed: nextSidebarCollapsed ? 1 : 0,
	      workspace_module_preferences: JSON.stringify(nextModulePreferences),
	      updated_at: nowIso(),
	    });

    logAudit(
      ctx.gabinete?.id ?? ctx.user.gabinete_id ?? null,
      ctx.user.id,
      "update",
	      "navigation_preference",
	      ctx.user.id,
	      previous,
	      {
	        ui_sidebar_collapsed: nextSidebarCollapsed,
	        workspace_module_preferences: nextModulePreferences,
	      },
	    );

	    return sendJson(res, {
	      ok: true,
	      user: {
	        ui_sidebar_collapsed: nextSidebarCollapsed,
	        workspace_module_preferences: nextModulePreferences,
	      },
	    });
	  }

  if (pathname === "/api/auth/google/start" && req.method === "GET") {
    if (ctx.user) {
      return redirect(res, getPostAuthRedirectPath(ctx.user));
    }
    if (!isGoogleOauthConfigured()) {
      return redirect(
        res,
        "/app?oauth_error=Google%20ainda%20nao%20esta%20configurado%20neste%20ambiente.",
      );
    }

    clearCookie(res, GOOGLE_OAUTH_PENDING_COOKIE);
    const state = createSessionToken();
    setCookie(res, GOOGLE_OAUTH_STATE_COOKIE, state, { maxAge: 60 * 10 });
    return redirect(res, buildGoogleOauthAuthorizeUrl(req, state));
  }

  if (pathname === "/api/auth/google/callback" && req.method === "GET") {
    const providerError = String(url.searchParams.get("error") || "").trim();
    const code = String(url.searchParams.get("code") || "").trim();
    const returnedState = String(url.searchParams.get("state") || "").trim();
    const expectedState = String(ctx.cookies?.[GOOGLE_OAUTH_STATE_COOKIE] || "").trim();

    if (returnedState.startsWith("avancasp_")) {
      const relayUrl = new URL("https://avancasp.guiapj.com.br/auth/google/callback");
      for (const [key, value] of url.searchParams.entries()) {
        relayUrl.searchParams.set(key, value);
      }
      return redirect(res, relayUrl.toString());
    }

    clearCookie(res, GOOGLE_OAUTH_STATE_COOKIE);

    if (!isGoogleOauthConfigured()) {
      return redirect(
        res,
        "/app?oauth_error=Google%20ainda%20nao%20esta%20configurado%20neste%20ambiente.",
      );
    }

    if (providerError) {
      return redirect(
        res,
        `/app?oauth_error=${encodeURIComponent("O login com Google foi cancelado ou negado.")}`,
      );
    }

    if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
      return redirect(
        res,
        `/app?oauth_error=${encodeURIComponent("Nao foi possivel validar o retorno do Google.")}`,
      );
    }

    const tokenPayload = await exchangeGoogleOauthCode(code, getGoogleOauthRedirectUri(req));
    if (!tokenPayload?.access_token) {
      return redirect(
        res,
        `/app?oauth_error=${encodeURIComponent("Falha ao concluir a autenticacao com Google.")}`,
      );
    }

    const profile = await fetchGoogleOauthProfile(tokenPayload.access_token);
    const email = String(profile?.email || "").trim();
    const emailVerified = Boolean(profile?.email_verified || profile?.verified_email);

    if (!email || !emailVerified) {
      return redirect(
        res,
        `/app?oauth_error=${encodeURIComponent("Sua conta Google precisa ter e-mail verificado.")}`,
      );
    }

    const user = db
      .prepare(
        `
          SELECT *
          FROM users
          WHERE status = 'active'
            AND lower(email) = lower(:email)
          LIMIT 1
        `,
      )
      .get({ email });

    if (!user) {
      const normalizedEmail = email.toLowerCase();
      const googleName = String(profile?.name || profile?.given_name || "").trim() || "Responsavel";

      try {
        const username = uniqueUsernameFromEmail(normalizedEmail);
        const generatedPassword = `${createSessionToken()}Aa1!`;
        const { gabineteId, userId } = createDefaultSetupForGabinete(
          db,
          {
            name: "Meu Gabinete",
            type: "Gabinete",
            responsible_name: googleName,
            email: normalizedEmail,
            onboarding_completed: 0,
          },
          {
            username,
            name: googleName,
            email: normalizedEmail,
            password: generatedPassword,
          },
        );

        if (profile?.picture) {
          db.prepare(
            `
              UPDATE users
              SET avatar_url = :avatar_url,
                  updated_at = :updated_at
              WHERE id = :id
            `,
          ).run({
            id: userId,
            avatar_url: profile.picture,
            updated_at: nowIso(),
          });
        }

        issueSessionForUser(
          req,
          res,
          { id: userId, role: "gabinete_admin", gabinete_id: gabineteId },
          { provider: "google" },
        );
        clearCookie(res, GOOGLE_OAUTH_PENDING_COOKIE);
        return redirect(res, "/app/configuracoes?setup=1");
      } catch {
        const fallbackUser = db
          .prepare(
            `
              SELECT *
              FROM users
              WHERE status = 'active'
                AND lower(email) = lower(:email)
              LIMIT 1
            `,
          )
          .get({ email: normalizedEmail });

        if (fallbackUser) {
          issueSessionForUser(req, res, fallbackUser, { provider: "google" });
          clearCookie(res, GOOGLE_OAUTH_PENDING_COOKIE);
          return redirect(res, getPostAuthRedirectPath(fallbackUser));
        }

        return redirect(
          res,
          `/app?oauth_error=${encodeURIComponent("Nao foi possivel preparar seu gabinete com Google.")}`,
        );
      }
    }

    if (profile?.picture && profile.picture !== user.avatar_url) {
      db.prepare(
        `
          UPDATE users
          SET avatar_url = :avatar_url,
              updated_at = :updated_at
          WHERE id = :id
        `,
      ).run({
        id: user.id,
        avatar_url: profile.picture,
        updated_at: nowIso(),
      });
      user.avatar_url = profile.picture;
    }

    issueSessionForUser(req, res, user, { provider: "google" });
    clearCookie(res, GOOGLE_OAUTH_PENDING_COOKIE);
    return redirect(res, getPostAuthRedirectPath(user));
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await parseBody(req);
    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "");
    const user = db
      .prepare(
        `
          SELECT *
          FROM users
          WHERE lower(email) = lower(:login)
             OR lower(username) = lower(:login)
        `,
      )
      .get({ login });

    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendJson(
        res,
        { error: "Credenciais invalidas. Confira usuario/e-mail e senha." },
        401,
      );
    }

    if (user.status === "pending_activation") {
      return sendJson(
        res,
        { error: "Sua conta ainda nao foi ativada. Verifique o e-mail enviado pelo Gabinete360." },
        403,
      );
    }

    if (user.status !== "active") {
      return sendJson(
        res,
        { error: "Sua conta nao esta disponivel para acesso no momento." },
        403,
      );
    }

    issueSessionForUser(req, res, user);
    return sendJson(res, { ok: true });
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    if (ctx.sessionToken) {
      db.prepare("DELETE FROM sessions WHERE token = :token").run({
        token: ctx.sessionToken,
      });
    }
    clearCookie(res, "session_token");
    clearCookie(res, "active_gabinete_id");
    clearCookie(res, GOOGLE_OAUTH_STATE_COOKIE);
    clearCookie(res, GOOGLE_OAUTH_PENDING_COOKIE);
    return sendJson(res, { ok: true });
  }

  if (pathname === "/api/auth/register/google" && req.method === "POST") {
    const pendingGoogle = readGoogleOauthPending(ctx.cookies);
    if (!pendingGoogle) {
      return sendJson(res, { error: "Sua confirmacao com Google expirou. Tente novamente." }, 401);
    }

    const body = await parseBody(req);
    const validationError = validateGoogleRegisterForm(body);
    if (validationError) {
      return sendJson(res, { error: validationError }, 422);
    }

    try {
      const username = uniqueUsernameFromEmail(pendingGoogle.email);
      const location = await resolveGabineteLocationPayload({
        city: body.city,
        uf: body.uf,
      });
      const generatedPassword = `${createSessionToken()}Aa1!`;
      const { gabineteId, userId } = createDefaultSetupForGabinete(
        db,
        {
          name: String(body.name || "").trim().slice(0, GABINETE_NAME_MAX_LENGTH),
          type: body.type,
          parliamentarian_name: String(body.parliamentarian_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
          party: body.party,
          city: location.city,
          city_ibge: location.city_ibge,
          uf: location.uf,
          responsible_name: String(body.responsible_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
          email: pendingGoogle.email,
          phone: body.phone,
          onboarding_completed: 0,
        },
        {
          username,
          name: body.responsible_name,
          email: pendingGoogle.email,
          phone: body.phone,
          password: generatedPassword,
        },
      );

      if (pendingGoogle.picture) {
        db.prepare(
          `
            UPDATE users
            SET avatar_url = :avatar_url,
                updated_at = :updated_at
            WHERE id = :id
          `,
        ).run({
          id: userId,
          avatar_url: pendingGoogle.picture,
          updated_at: nowIso(),
        });
      }

      issueSessionForUser(req, res, { id: userId, role: "gabinete_admin", gabinete_id: gabineteId }, {
        provider: "google",
      });
      clearCookie(res, GOOGLE_OAUTH_PENDING_COOKIE);
      return sendJson(res, { ok: true }, 201);
    } catch {
      return sendJson(
        res,
        { error: "Nao foi possivel criar o gabinete com Google. Verifique se o e-mail ja nao esta em uso." },
        409,
      );
    }
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    const body = await parseBody(req);
    const validationError = validateRegisterForm(body);
    if (validationError) {
      return sendJson(res, { error: validationError }, 422);
    }

    let created = null;

    try {
      const username = uniqueUsernameFromEmail(body.email);
      const location = await resolveGabineteLocationPayload({
        city: body.city,
        uf: body.uf,
      });
      created = createDefaultSetupForGabinete(
        db,
        {
          name: String(body.name || "").trim().slice(0, GABINETE_NAME_MAX_LENGTH),
          type: body.type,
          parliamentarian_name: String(body.parliamentarian_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
          party: body.party,
          city: location.city,
          city_ibge: location.city_ibge,
          uf: location.uf,
          responsible_name: String(body.responsible_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
          email: body.email,
          phone: body.phone,
          onboarding_completed: 0,
          status: "pending_activation",
        },
        {
          username,
          name: body.responsible_name,
          email: body.email,
          phone: body.phone,
          password: body.password,
          status: "pending_activation",
        },
      );

      const verification = issueEmailVerificationToken(created.userId, created.gabineteId);
      await sendActivationEmail(req, {
        email: String(body.email).trim().toLowerCase(),
        name: body.responsible_name,
        gabineteName: body.name,
        token: verification.token,
      });

      return sendJson(
        res,
        {
          ok: true,
          message: "Cadastro recebido. Enviamos um link para ativar sua conta por e-mail.",
        },
        201,
      );
    } catch (error) {
      if (created?.gabineteId) {
        db.prepare("DELETE FROM gabinetes WHERE id = :id").run({ id: created.gabineteId });
      }
      if (String(error?.message || "").startsWith("SMTP_")) {
        return sendJson(
          res,
          { error: "Nao foi possivel enviar o e-mail de ativacao agora. Tente novamente em instantes." },
          502,
        );
      }
      return sendJson(
        res,
        { error: "Nao foi possivel criar o gabinete. Verifique o e-mail informado." },
        409,
      );
    }
  }

  if (pathname === "/api/auth/email-activation/confirm" && req.method === "POST") {
    const body = await parseBody(req);
    const token = String(body.token ?? "").trim();
    if (!token) {
      return sendJson(res, { error: "Link de ativacao invalido." }, 422);
    }

    const activation = consumeEmailVerificationToken(token);
    if (!activation) {
      return sendJson(res, { error: "Este link de ativacao esta invalido ou expirou." }, 410);
    }

    const updatedAt = nowIso();
    db.exec("BEGIN");
    try {
      db.prepare(
        `
          UPDATE users
          SET status = 'active',
              updated_at = :updated_at
          WHERE id = :id
        `,
      ).run({
        id: activation.user_id,
        updated_at: updatedAt,
      });

      if (activation.gabinete_id) {
        db.prepare(
          `
            UPDATE gabinetes
            SET status = 'active',
                updated_at = :updated_at
            WHERE id = :id
          `,
        ).run({
          id: activation.gabinete_id,
          updated_at: updatedAt,
        });
      }

      db.exec("COMMIT");
      return sendJson(res, { ok: true });
    } catch {
      db.exec("ROLLBACK");
      return sendJson(res, { error: "Nao foi possivel ativar sua conta agora." }, 500);
    }
  }

  if (pathname === "/api/auth/password-reset/request" && req.method === "POST") {
    const body = await parseBody(req);
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return sendJson(res, { error: "Informe um e-mail valido." }, 422);
    }

    const ipAddress = getClientIp(req);
    const resetAttemptSummary = getPasswordResetRequestAttemptSummary(email, ipAddress);
    if (resetAttemptSummary.limited) {
      return sendJson(
        res,
        {
          error: `Por seguranca, bloqueamos novos pedidos de redefinicao apos ${PASSWORD_RESET_REQUEST_LIMIT} tentativas em 15 minutos. Pare de tentar novamente agora e entre em contato com o suporte pelo WhatsApp ${SUPPORT_WHATSAPP_PRETTY}.`,
        },
        429,
      );
    }

    recordPasswordResetRequestAttempt(email, ipAddress);

    const user = db
      .prepare(
        `
          SELECT id, email, name, status
          FROM users
          WHERE lower(email) = lower(:email)
          LIMIT 1
        `,
      )
      .get({ email });

    if (user?.status === "active") {
      try {
        const reset = issuePasswordResetToken(user.id);
        await sendPasswordResetEmail(req, {
          email: user.email,
          name: user.name,
          token: reset.token,
        });
      } catch {
        return sendJson(
          res,
          { error: "Nao foi possivel enviar o e-mail de redefinicao agora. Tente novamente em instantes." },
          502,
        );
      }
    }

    return sendJson(res, {
      ok: true,
      message: "Se encontrarmos uma conta ativa para esse e-mail, enviaremos um link de redefinicao.",
    });
  }

  if (pathname === "/api/auth/password-reset/confirm" && req.method === "POST") {
    const body = await parseBody(req);
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");
    const passwordConfirmation = String(body.password_confirmation ?? "");

    if (!token) {
      return sendJson(res, { error: "Link de redefinicao invalido." }, 422);
    }
    if (!password) {
      return sendJson(res, { error: "Informe a nova senha." }, 422);
    }
    if (password !== passwordConfirmation) {
      return sendJson(res, { error: "A confirmacao de senha nao confere." }, 422);
    }

    const reset = consumePasswordResetToken(token);
    if (!reset || reset.status !== "active") {
      return sendJson(res, { error: "Este link de redefinicao esta invalido ou expirou." }, 410);
    }

    const updatedAt = nowIso();
    db.exec("BEGIN");
    try {
      db.prepare(
        `
          UPDATE users
          SET password_hash = :password_hash,
              must_change_password = 0,
              password_changed_at = :password_changed_at,
              updated_at = :updated_at
          WHERE id = :id
        `,
      ).run({
        id: reset.user_id,
        password_hash: hashPassword(password),
        password_changed_at: updatedAt,
        updated_at: updatedAt,
      });

      db.prepare("DELETE FROM sessions WHERE user_id = :user_id").run({
        user_id: reset.user_id,
      });

      db.exec("COMMIT");
      return sendJson(res, { ok: true });
    } catch {
      db.exec("ROLLBACK");
      return sendJson(res, { error: "Nao foi possivel redefinir sua senha agora." }, 500);
    }
  }

  const publicGabineteMatch = pathname.match(/^\/api\/public\/gabinete\/([a-z0-9-]+)$/);
  if (publicGabineteMatch && req.method === "GET") {
    const gabinetePublic = db
      .prepare(
        `
          SELECT id, name, type, parliamentarian_name, city, uf, zip_code, address, address_number, address_complement, neighborhood,
            public_slug, slug, logo_url, email, phone,
            public_self_register_intro, public_self_register_config
          FROM gabinetes
          WHERE status = 'active'
            AND (
              lower(public_slug) = lower(:slug)
              OR lower(slug) = lower(:slug)
            )
          LIMIT 1
        `,
      )
      .get({ slug: publicGabineteMatch[1] });
    if (!gabinetePublic) {
      return sendJson(res, { error: "Gabinete publico nao encontrado." }, 404);
    }
    return sendJson(res, {
      gabinete: {
        ...gabinetePublic,
        public_self_register_intro: normalizePublicSelfRegisterIntro(gabinetePublic.public_self_register_intro),
        public_self_register_config: normalizePublicSelfRegisterConfig(gabinetePublic.public_self_register_config),
      },
    });
  }

	  const publicGabineteConfigMatch = pathname.match(/^\/api\/public\/gabinete\/([a-z0-9-]+)\/form-config$/);
	  if (publicGabineteConfigMatch && req.method === "PATCH") {
	    if (!ensureApiAuthenticated(ctx, res)) return;
	    if (!canManageUsers(ctx.user)) {
	      return sendJson(res, { error: "Apenas administradores podem editar esta pagina publica." }, 403);
	    }
	    const gabinetePublic = db
      .prepare(
        `
          SELECT id, name, type, parliamentarian_name, city, uf, zip_code, address, address_number, address_complement, neighborhood,
            logo_url, email, phone,
            public_self_register_intro, public_self_register_config
          FROM gabinetes
          WHERE status = 'active'
            AND (
              lower(public_slug) = lower(:slug)
              OR lower(slug) = lower(:slug)
            )
          LIMIT 1
        `,
      )
      .get({ slug: publicGabineteConfigMatch[1] });
    if (!gabinetePublic) {
      return sendJson(res, { error: "Gabinete publico nao encontrado." }, 404);
    }
    if (Number(ctx.gabinete?.id || 0) !== Number(gabinetePublic.id)) {
      return sendJson(res, { error: "Voce nao pode editar esta pagina publica." }, 403);
    }
    const body = await parseBody(req);
    const nextConfig = normalizePublicSelfRegisterConfig(
      body.public_self_register_config === undefined
        ? gabinetePublic.public_self_register_config
        : body.public_self_register_config,
    );
    const error = validatePublicSelfRegisterConfig(nextConfig);
    if (error) return sendJson(res, { error }, 422);
    const nextName =
      body.name === undefined
        ? String(gabinetePublic.name || "").trim().slice(0, GABINETE_NAME_MAX_LENGTH)
        : String(body.name || "").trim().slice(0, GABINETE_NAME_MAX_LENGTH);
    if (!nextName) return sendJson(res, { error: "Informe o nome do gabinete." }, 422);
    const nextType = body.type === undefined ? String(gabinetePublic.type || "").trim() : String(body.type || "").trim().slice(0, 80);
    const nextParliamentarianName =
      body.parliamentarian_name === undefined
        ? String(gabinetePublic.parliamentarian_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH)
        : String(body.parliamentarian_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH);
    const nextCity = body.city === undefined ? String(gabinetePublic.city || "").trim() : String(body.city || "").trim().slice(0, 120);
    const nextUf = body.uf === undefined ? String(gabinetePublic.uf || "").trim() : String(body.uf || "").trim().toUpperCase().slice(0, 2);
    const nextZipCode =
      body.zip_code === undefined
        ? String(gabinetePublic.zip_code || "").trim()
        : String(body.zip_code || "").replace(/\D/g, "").slice(0, 8);
    const nextAddress =
      body.address === undefined ? String(gabinetePublic.address || "").trim() : String(body.address || "").trim().slice(0, 180);
    const nextAddressNumber =
      body.address_number === undefined
        ? String(gabinetePublic.address_number || "").trim()
        : String(body.address_number || "").trim().slice(0, 30);
    const nextAddressComplement =
      body.address_complement === undefined
        ? String(gabinetePublic.address_complement || "").trim()
        : String(body.address_complement || "").trim().slice(0, 120);
    const nextNeighborhood =
      body.neighborhood === undefined
        ? String(gabinetePublic.neighborhood || "").trim()
        : String(body.neighborhood || "").trim().slice(0, 120);
    const nextLogoUrl =
      body.logo_url === undefined
        ? String(gabinetePublic.logo_url || "").trim()
        : normalizeOptionalHttpUrl(body.logo_url, 600);
    if (body.logo_url !== undefined && String(body.logo_url || "").trim() && !nextLogoUrl) {
      return sendJson(res, { error: "Informe um link de foto valido, começando por http:// ou https://." }, 422);
    }
    const nextEmail =
      body.email === undefined
        ? String(gabinetePublic.email || "").trim().toLowerCase()
        : String(body.email || "").trim().toLowerCase().slice(0, 160);
    if (nextEmail && !isValidEmail(nextEmail)) {
      return sendJson(res, { error: "Informe um e-mail publico valido." }, 422);
    }
    const nextPhone =
      body.phone === undefined
        ? normalizePhone(gabinetePublic.phone || "")
        : normalizePhone(body.phone || "");
    const nextIntro =
      body.public_self_register_intro === undefined
        ? normalizePublicSelfRegisterIntro(gabinetePublic.public_self_register_intro)
        : normalizePublicSelfRegisterIntro(body.public_self_register_intro);
    db.prepare(
      `
        UPDATE gabinetes
        SET name = :name,
            type = :type,
            parliamentarian_name = :parliamentarian_name,
            city = :city,
            uf = :uf,
            zip_code = :zip_code,
            address = :address,
            address_number = :address_number,
            address_complement = :address_complement,
            neighborhood = :neighborhood,
            logo_url = :logo_url,
            email = :email,
            phone = :phone,
            public_self_register_intro = :public_self_register_intro,
            public_self_register_config = :public_self_register_config,
            updated_at = :updated_at
        WHERE id = :id
      `,
    ).run({
      id: gabinetePublic.id,
      name: nextName,
      type: nextType,
      parliamentarian_name: nextParliamentarianName,
      city: nextCity,
      uf: nextUf,
      zip_code: nextZipCode,
      address: nextAddress,
      address_number: nextAddressNumber,
      address_complement: nextAddressComplement,
      neighborhood: nextNeighborhood,
      logo_url: nextLogoUrl,
      email: nextEmail,
      phone: nextPhone,
      public_self_register_intro: nextIntro,
      public_self_register_config: JSON.stringify(nextConfig),
      updated_at: nowIso(),
    });
    const nextGabinete = {
      id: gabinetePublic.id,
      name: nextName,
      type: nextType,
      parliamentarian_name: nextParliamentarianName,
      city: nextCity,
      uf: nextUf,
      zip_code: nextZipCode,
      address: nextAddress,
      address_number: nextAddressNumber,
      address_complement: nextAddressComplement,
      neighborhood: nextNeighborhood,
      logo_url: nextLogoUrl,
      email: nextEmail,
      phone: nextPhone,
      public_self_register_intro: nextIntro,
      public_self_register_config: nextConfig,
    };
    logAudit(gabinetePublic.id, ctx.user.id, "update", "public_form", gabinetePublic.id, null, nextGabinete);
    return sendJson(res, {
      gabinete: nextGabinete,
      public_self_register_config: nextConfig,
      public_self_register_intro: nextIntro,
      logo_url: nextLogoUrl,
      email: nextEmail,
      phone: nextPhone,
    });
  }

  const publicAiTextMatch = pathname.match(/^\/api\/public\/gabinete\/([a-z0-9-]+)\/ai\/summarize$/);
  if (publicAiTextMatch && req.method === "POST") {
    const gabinetePublic = getActivePublicGabineteBySlug(publicAiTextMatch[1]);
    if (!gabinetePublic) {
      return sendJson(res, { error: "Gabinete publico nao encontrado." }, 404);
    }
    if (!OPENAI_API_KEY) return sendJson(res, { error: "IA ainda nao configurada no servidor." }, 503);
    const body = await parseBody(req);
    if (String(body.field || "").trim() !== "description") {
      return sendJson(res, { error: "A IA do formulario publico so pode ser usada na descrição." }, 422);
    }
    const values = body.values && typeof body.values === "object" ? body.values : body;
    const publicSelfRegisterConfig = normalizePublicSelfRegisterConfig(gabinetePublic.public_self_register_config);
    const anonymousRequested = publicSelfRegisterConfig.allow_anonymous && Boolean(toFlag(body.is_anonymous ?? values.is_anonymous));
    const prerequisiteError = validatePublicDescriptionAiPrerequisites(publicSelfRegisterConfig, values, {
      anonymous: anonymousRequested,
    });
    if (prerequisiteError) return sendJson(res, { error: prerequisiteError }, 422);
    const text = String(body.text || "").trim();
    if (text.length < 30) return sendJson(res, { error: "Escreva pelo menos 30 caracteres para usar IA." }, 422);
    if (text.length > 3000) return sendJson(res, { error: "O texto pode ter no maximo 3000 caracteres." }, 422);
    if (isPublicAiTextRateLimited(req, publicAiTextMatch[1])) {
      return sendJson(res, { error: "Limite de 3 usos de IA atingido nesta descrição." }, 429);
    }
    try {
      const summary = await summarizeTextWithOpenAi(text, body.context || "descricao do pedido publico");
      logAudit(gabinetePublic.id, ctx.user?.id || null, "improve_text", "public_ai", 0, null, {
        slug: publicAiTextMatch[1],
        length: text.length,
      });
      return sendJson(res, { summary });
    } catch (error) {
      return sendJson(res, { error: "Nao foi possivel melhorar o texto agora." }, 502);
    }
  }

  const publicCepLookupMatch = pathname.match(/^\/api\/public\/lookups\/cep\/(\d{5}-?\d{3})$/);
  if (publicCepLookupMatch && req.method === "GET") {
    const result = await lookupCepData(publicCepLookupMatch[1], "auto");
    if (!result) {
      return sendJson(res, { error: "CEP nao encontrado." }, 404);
    }
    return sendJson(res, result);
  }

  const publicCnpjLookupMatch = pathname.match(/^\/api\/public\/lookups\/cnpj\/(\d{14})$/);
  if (publicCnpjLookupMatch && req.method === "GET") {
    const result = await lookupCnpjData(publicCnpjLookupMatch[1], "auto");
    if (!result) {
      return sendJson(res, { error: "CNPJ nao encontrado." }, 404);
    }
    return sendJson(res, result);
  }

  const publicTrackingMatch = pathname.match(/^\/api\/public\/acompanhamento\/([A-Za-z0-9-]+)$/);
  if (publicTrackingMatch && req.method === "GET") {
    const record = getPublicTrackingRecord(publicTrackingMatch[1]);
    if (!record) {
      return sendJson(res, { error: "Acompanhamento nao encontrado." }, 404);
    }
    if (Number(record.public_tracking_failed_attempts || 0) >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS) {
      blockPublicTrackingAfterFailedAttempts(record);
      return sendJson(res, { error: "Este link foi bloqueado por tentativas erradas." }, 410);
    }
    return sendJson(res, {
      requires_code: true,
      tracking: serializePublicTracking(record, { includeUpdates: false }),
    });
  }

  const publicTrackingAccessMatch = pathname.match(/^\/api\/public\/acompanhamento\/([A-Za-z0-9-]+)\/acessar$/);
  if (publicTrackingAccessMatch && req.method === "POST") {
    const record = getPublicTrackingRecord(publicTrackingAccessMatch[1]);
    if (!record) {
      return sendJson(res, { error: "Acompanhamento nao encontrado." }, 404);
    }
    if (Number(record.public_tracking_failed_attempts || 0) >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS) {
      blockPublicTrackingAfterFailedAttempts(record);
      return sendJson(res, { error: "Este link foi bloqueado por tentativas erradas." }, 410);
    }
    const body = await parseBody(req);
    const accessCode = String(body.access_code || "").replace(/\D/g, "");
    const allowed = verifyPassword(accessCode, record.public_tracking_secret_hash);
    logPublicTrackingAccess(record, req, allowed);
    if (!allowed) {
      const failedCount = registerPublicTrackingFailedAttempt(record);
      return sendJson(
        res,
        { error: failedPasswordResponseMessage(failedCount) },
        failedCount >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS ? 410 : 403,
      );
    }
    db.prepare(
      `
        UPDATE tickets
        SET public_tracking_failed_attempts = 0,
            public_updated_at = :updated_at
        WHERE id = :ticket_id
      `,
    ).run({
      ticket_id: record.id,
      updated_at: nowIso(),
    });
    return sendJson(res, {
      ok: true,
      tracking: serializePublicTracking(record, { includeUpdates: true }),
    });
  }

  const publicFinanceShareMatch = pathname.match(/^\/api\/public\/comprovante\/([A-Za-z0-9-]+)$/);
  if (publicFinanceShareMatch && req.method === "GET") {
    const record = getPublicFinanceShareRecord(publicFinanceShareMatch[1]);
    if (!record) {
      return sendJson(res, { error: "Comprovante nao encontrado." }, 404);
    }
    const unavailable = getFinanceShareUnavailableReason(record);
    if (unavailable) return sendJson(res, { error: unavailable.error }, unavailable.status);
    return sendJson(res, {
      requires_code: true,
      share: serializePublicFinanceShare(record, { includeEntry: false }),
    });
  }

  const publicFinanceShareAccessMatch = pathname.match(/^\/api\/public\/comprovante\/([A-Za-z0-9-]+)\/acessar$/);
  if (publicFinanceShareAccessMatch && req.method === "POST") {
    const record = getPublicFinanceShareRecord(publicFinanceShareAccessMatch[1]);
    if (!record) {
      return sendJson(res, { error: "Comprovante nao encontrado." }, 404);
    }
    const unavailable = getFinanceShareUnavailableReason(record);
    if (unavailable) return sendJson(res, { error: unavailable.error }, unavailable.status);
    const body = await parseBody(req);
    const accessCode = String(body.access_code || "").replace(/\D/g, "");
    if (!verifyPassword(accessCode, record.public_share_secret_hash)) {
      const failedCount = registerFinanceShareFailedAttempt(record);
      return sendJson(
        res,
        { error: failedPasswordResponseMessage(failedCount) },
        failedCount >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS ? 410 : 403,
      );
    }
    const access = registerFinanceShareAccess(record);
    return sendJson(res, {
      ok: true,
      share: serializePublicFinanceShare(record, { includeEntry: true, access }),
    });
  }

  const publicEntityShareMatch = pathname.match(/^\/api\/public\/compartilhar\/([A-Za-z0-9-]+)$/);
  if (publicEntityShareMatch && req.method === "GET") {
    const record = getPublicEntityShareRecord(publicEntityShareMatch[1]);
    if (!record) {
      return sendJson(res, { error: "Link nao encontrado." }, 404);
    }
    const unavailable = getEntityShareUnavailableReason(record);
    if (unavailable) return sendJson(res, { error: unavailable.error }, unavailable.status);
    return sendJson(res, {
      requires_code: true,
      share: serializePublicEntityShare(record, { includeEntity: false }),
    });
  }

  const publicEntityShareAccessMatch = pathname.match(/^\/api\/public\/compartilhar\/([A-Za-z0-9-]+)\/acessar$/);
  if (publicEntityShareAccessMatch && req.method === "POST") {
    const record = getPublicEntityShareRecord(publicEntityShareAccessMatch[1]);
    if (!record) {
      return sendJson(res, { error: "Link nao encontrado." }, 404);
    }
    const unavailable = getEntityShareUnavailableReason(record);
    if (unavailable) return sendJson(res, { error: unavailable.error }, unavailable.status);
    const body = await parseBody(req);
    const accessCode = String(body.access_code || "").replace(/\D/g, "");
    if (!verifyPassword(accessCode, record.secret_hash)) {
      const failedCount = registerEntityShareFailedAttempt(record);
      return sendJson(
        res,
        { error: failedPasswordResponseMessage(failedCount) },
        failedCount >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS ? 410 : 403,
      );
    }
    const access = registerEntityShareAccess(record);
    return sendJson(res, {
      ok: true,
      share: serializePublicEntityShare(record, { includeEntity: true, access }),
    });
  }

  if (publicEntityShareMatch && req.method === "PATCH") {
    const record = getPublicEntityShareRecord(publicEntityShareMatch[1]);
    if (!record) {
      return sendJson(res, { error: "Link nao encontrado." }, 404);
    }
    const unavailable = getEntityShareUnavailableReason(record, { allowConsumed: true });
    if (unavailable) return sendJson(res, { error: unavailable.error }, unavailable.status);
    const sharedEntityType = normalizePublicEntityType(record.entity_type);
    const shareConfig = getPublicEntityShareConfig(sharedEntityType);
    if (!shareConfig?.editable || record.access_level !== "edit") {
      return sendJson(res, { error: "Este link permite apenas visualizacao." }, 403);
    }
    const body = await parseBody(req);
    const accessCode = String(body.access_code || "").replace(/\D/g, "");
    if (!verifyPassword(accessCode, record.secret_hash)) {
      const failedCount = registerEntityShareFailedAttempt(record);
      return sendJson(
        res,
        { error: failedPasswordResponseMessage(failedCount) },
        failedCount >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS ? 410 : 403,
      );
    }
    try {
      if (sharedEntityType === "contact") updatePublicSharedContact(record, body.contact || body);
      else if (sharedEntityType === "note") updatePublicSharedNote(record, body.note || body);
      else throw new Error("Tipo de compartilhamento nao permite edicao.");
      const updatedRecord = getPublicEntityShareRecord(publicEntityShareMatch[1]);
      return sendJson(res, {
        ok: true,
        share: serializePublicEntityShare(updatedRecord || record, { includeEntity: true }),
      });
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel salvar o registro." }, 422);
    }
  }

  const publicContactLookupMatch = pathname.match(/^\/api\/public\/gabinete\/([a-z0-9-]+)\/contact-lookup$/);
  if (publicContactLookupMatch && req.method === "GET") {
    const gabinetePublic = getActivePublicGabineteBySlug(publicContactLookupMatch[1]);
    if (!gabinetePublic) {
      return sendJson(res, { error: "Gabinete publico nao encontrado." }, 404);
    }
    const documentValue = normalizeCpf(url.searchParams.get("document") || "");
    const whatsappValue = normalizePhone(url.searchParams.get("whatsapp") || "");
    const documentError = documentValue ? getCpfCnpjValidationMessage(documentValue) : "";
    if (documentError || (!documentValue && whatsappValue.length < 10)) {
      return sendJson(res, { contact: null });
    }
    const contact = findPublicSelfRegisterContact(gabinetePublic.id, {
      cpf_rg_cns: documentValue,
      whatsapp: whatsappValue,
    });
    return sendJson(res, { contact: serializePublicSelfRegisterContact(contact) });
  }

  const publicSelfRegisterMatch = pathname.match(/^\/api\/public\/gabinete\/([a-z0-9-]+)\/autocadastro$/);
  if (publicSelfRegisterMatch && req.method === "POST") {
    const gabinetePublic = getActivePublicGabineteBySlug(publicSelfRegisterMatch[1]);
    if (!gabinetePublic) {
      return sendJson(res, { error: "Gabinete publico nao encontrado." }, 404);
    }

    const contentType = String(req.headers["content-type"] || "");
    const parsed = contentType.includes("multipart/form-data")
      ? await parseMultipart(req, "/tmp")
      : { fields: await parseBody(req), files: [] };
    const body = parsed.fields || {};
    const files = Array.isArray(parsed.files) ? parsed.files : [];
    const publicSelfRegisterConfig = normalizePublicSelfRegisterConfig(gabinetePublic.public_self_register_config);
    const anonymousRequested = publicSelfRegisterConfig.allow_anonymous && Boolean(toFlag(body.is_anonymous));
    const validation = validatePublicSelfRegisterSubmission(publicSelfRegisterConfig, body, files, {
      anonymous: anonymousRequested,
    });
    if (!validation.ok) {
      cleanupParsedFiles(files);
      return sendJson(res, { error: validation.errors[0] || "Revise os dados do atendimento online." }, 422);
    }
    if (files.length > 1) {
      cleanupParsedFiles(files);
      return sendJson(res, { error: "Envie apenas 1 arquivo nesta etapa." }, 422);
    }
    const values = validation.values;
    const normalizedDescription = values.description;
    const demandTitle = values.demand_title
      || normalizedDescription.split(/\n|\./).map((item) => item.trim()).find(Boolean)
      || "";
    const finalDemandTitle = demandTitle.slice(0, 120);
    const contactType = values.cpf_rg_cns.length === 14 || values.contact_type === "company" ? "company" : "person";
    const ticketDescription = normalizedDescription || values.notes;

    let contactId = 0;
    let ticketId = 0;
    let storedFile = null;
    let publicTracking = null;
    db.exec("BEGIN");
    try {
      if (!anonymousRequested) {
        const existingContact = findPublicSelfRegisterContact(gabinetePublic.id, {
          cpf_rg_cns: values.cpf_rg_cns,
          whatsapp: values.whatsapp,
          phone: values.phone,
        });
        if (existingContact) {
          contactId = Number(existingContact.id);
          const existingContactType = existingContact.contact_type || contactType;
          updateContact(
            gabinetePublic.id,
            contactId,
            buildPublicSelfRegisterContactPayload(existingContact, values, body, existingContactType),
          );
        } else {
          contactId = createContact(gabinetePublic.id, {
            name: values.name,
            contact_type: contactType,
            segment: contactType === "company" ? "empresa" : "municipe",
            phone: values.phone,
            whatsapp: values.whatsapp,
            cpf_rg_cns: values.cpf_rg_cns,
            birth_date: contactType === "person" ? values.birth_date : "",
            email: values.email,
            profession: values.profession,
            referred_by: values.referred_by || "Atendimento online",
            address: values.address,
            number: values.number,
            complement: values.complement,
            neighborhood: values.neighborhood,
            zip_code: values.zip_code,
            city: values.city,
            uf: values.uf,
            notes: values.notes,
            company_legal_name: body.company_legal_name || "",
            photo_url: body.photo_url || "",
          });
        }

        if (files[0]) {
          storedFile = storePublicSelfRegisterFile(gabinetePublic, contactId, files[0]);
          if (storedFile) {
            createContactFile(gabinetePublic.id, contactId, storedFile);
          }
        }
      }

      if (finalDemandTitle || ticketDescription) {
        const sequence =
          db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id").get({
            gabinete_id: gabinetePublic.id,
          }).total + 1;
        const number = generateTicketCode(gabinetePublic.id, sequence);
        const openedAt = currentDate();
        const followUpDays = parseInteger(gabinetePublic.default_follow_up_days, 3) || 3;
        const initialStatus = listStatuses(gabinetePublic.id)[0]?.name || "Aberto";
        const ticketResult = db.prepare(
          `
            INSERT INTO tickets (
              gabinete_id, contact_id, number, opened_at, channel, status, priority, tags,
              demand_title, demand_category, description, current_guidance, assigned_user_id,
              department, external_protocol, internal_due_date, dependency_note, follow_up_days,
              next_action, next_action_date, closed_at, result, closure_confirmed, geo_lat, geo_lng,
              is_archived, is_favorite, created_at, updated_at
            ) VALUES (
              :gabinete_id, :contact_id, :number, :opened_at, :channel, :status, :priority, :tags,
              :demand_title, :demand_category, :description, :current_guidance, NULL,
              '', '', '', '', :follow_up_days,
              :next_action, :next_action_date, '', '', 0, '', '',
              0, 0, :created_at, :updated_at
            )
          `,
        ).run({
          gabinete_id: gabinetePublic.id,
          contact_id: contactId || null,
          number,
          opened_at: openedAt,
          channel: "Atendimento online",
          status: initialStatus,
          priority: "Normal",
          tags: anonymousRequested ? "atendimento-online,anonimo" : "atendimento-online",
          demand_title: finalDemandTitle || (anonymousRequested ? "Manifestacao anonima" : "Nova solicitacao recebida"),
          demand_category: values.demand_category || "",
          description: ticketDescription,
          current_guidance: anonymousRequested ? "Pedido anonimo recebido pelo atendimento online." : "Pedido recebido pelo atendimento online.",
          follow_up_days: followUpDays,
          next_action: anonymousRequested ? "Analisar pedido anonimo" : "Dar retorno ao municipe",
          next_action_date: addDays(openedAt, followUpDays),
          created_at: nowIso(),
          updated_at: nowIso(),
        });
        ticketId = Number(ticketResult.lastInsertRowid);
        publicTracking = enableTicketPublicTracking(gabinetePublic.id, ticketId, null);
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      if (storedFile?.file_url) {
        deletePublicUploadUrls([storedFile.file_url]);
      }
      cleanupParsedFiles(files);
      return sendJson(res, { error: error?.message || "Nao foi possivel concluir o atendimento online." }, 422);
    }

    const targetUsers = db
      .prepare(
        `
          SELECT id
          FROM users
          WHERE gabinete_id = :gabinete_id
            AND status = 'active'
            AND role IN ('gabinete_admin', 'advisor')
        `,
      )
      .all({ gabinete_id: gabinetePublic.id });
    targetUsers.forEach((user) => {
      createNotificationForEntity(gabinetePublic.id, user.id, {
        title: "Novo atendimento online",
        message: anonymousRequested
          ? "Uma manifestacao anonima entrou pelo atendimento online."
          : `${values.name} entrou na base publica do gabinete.`,
        kind: "public_signup",
        entity_type: anonymousRequested ? "ticket" : "contact",
        entity_id: anonymousRequested ? ticketId || null : contactId,
      });
    });

    const confirmationDelivery = await deliverPublicSelfRegisterConfirmation({
      gabinete: gabinetePublic,
      request: req,
      config: publicSelfRegisterConfig,
      values,
      contactId,
      ticketId,
      tracking: publicTracking
        ? {
            ...serializeTicketPublicTracking(publicTracking, req, publicTracking.access_code),
            demand_title: publicTracking.demand_title,
          }
        : null,
      anonymous: anonymousRequested,
      notifyUsers: targetUsers,
    });

    logAudit(gabinetePublic.id, null, "create", "public_self_register", anonymousRequested ? ticketId : contactId, null, {
      name: anonymousRequested ? "anonimo" : values.name,
      demand_title: finalDemandTitle,
      has_file: Boolean(storedFile),
      anonymous: anonymousRequested,
      confirmation_channel: publicSelfRegisterConfig.confirmation_channel,
    });
    cleanupParsedFiles(files);
    return sendJson(
      res,
      {
        ok: true,
        tracking: publicTracking
          ? {
              ...serializeTicketPublicTracking(publicTracking, req, publicTracking.access_code),
              demand_title: publicTracking.demand_title,
            }
          : null,
        delivery: confirmationDelivery,
      },
      201,
    );
  }

  const whatsappWebhookMatch = pathname.match(/^\/api\/whatsapp\/webhook\/([a-z0-9-]+)$/);
  if (whatsappWebhookMatch && req.method === "POST") {
    const body = await parseBody(req);
    try {
      const result = await handleWhatsappWebhookPayload(whatsappWebhookMatch[1], body);
      return sendJson(res, result);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Webhook do WhatsApp nao processado." }, 422);
    }
  }

  if (pathname === "/api/switch-gabinete" && req.method === "POST") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    if (ctx.user.role !== "super_admin") {
      return sendJson(res, { error: "Apenas o administrador geral pode trocar de gabinete." }, 403);
    }

    const body = await parseBody(req);
    const gabineteId = parseInteger(body.gabinete_id);
    const gabinete = db.prepare("SELECT id FROM gabinetes WHERE id = :id").get({ id: gabineteId });

    if (!gabinete) {
      return sendJson(res, { error: "Gabinete nao encontrado." }, 404);
    }

    setCookie(res, "active_gabinete_id", String(gabineteId), {
      maxAge: SESSION_TTL_SECONDS,
    });

    return sendJson(res, { ok: true });
  }

  const gabinete = requireApiGabinete(ctx, res);
  if (!gabinete) return;

  if (pathname === "/api/lookups/ufs" && req.method === "GET") {
    return sendJson(res, { items: await listBrazilUfs() });
  }

  if (pathname === "/api/lookups/providers" && req.method === "GET") {
    return sendJson(res, buildLookupProviderStatus(gabinete.id, ctx.user.id));
  }

  if (pathname === "/api/lookups/preferences" && req.method === "POST") {
    const body = await parseBody(req);
    const kind = String(body.kind ?? "").trim().toLowerCase();
    if (!LOOKUP_PROVIDER_CATALOG[kind]) {
      return sendJson(res, { error: "Tipo de fonte nao suportado." }, 422);
    }
    const preferredProvider = saveLookupPreference(
      gabinete.id,
      ctx.user.id,
      kind,
      body.provider,
    );
    return sendJson(res, {
      kind,
      preferred_provider: preferredProvider,
      options: listLookupOptions(kind),
      automatic_sources: (LOOKUP_AUTO_ORDER[kind] || [])
        .map((providerKey) => listLookupOptions(kind).find((item) => item.key === providerKey))
        .filter(Boolean)
        .map((item) => item.label),
    });
  }

  const municipalitiesMatch = pathname.match(/^\/api\/lookups\/municipios\/([A-Za-z]{2})$/);
  if (municipalitiesMatch && req.method === "GET") {
    return sendJson(res, {
      items: await listMunicipalitiesByUf(municipalitiesMatch[1]),
    });
  }

  const cepLookupMatch = pathname.match(/^\/api\/lookups\/cep\/(\d{5}-?\d{3})$/);
  if (cepLookupMatch && req.method === "GET") {
    const provider = resolveLookupProvider(gabinete.id, ctx.user.id, "cep", url.searchParams.get("provider"));
    const result = await lookupCepData(cepLookupMatch[1], provider);
    if (!result) {
      return sendJson(res, { error: "CEP nao encontrado nas fontes configuradas." }, 404);
    }
    return sendJson(res, result);
  }

  const cnpjLookupMatch = pathname.match(/^\/api\/lookups\/cnpj\/(\d{14})$/);
  if (cnpjLookupMatch && req.method === "GET") {
    const provider = resolveLookupProvider(gabinete.id, ctx.user.id, "cnpj", url.searchParams.get("provider"));
    const result = await lookupCnpjData(cnpjLookupMatch[1], provider);
    if (!result) {
      return sendJson(res, { error: "CNPJ nao encontrado." }, 404);
    }
    return sendJson(res, result);
  }

  const cpfLookupMatch = pathname.match(/^\/api\/lookups\/cpf\/(\d{11})$/);
  if (cpfLookupMatch && req.method === "GET") {
    const birthDate = normalizeBirthDate(url.searchParams.get("birth_date"));
    if (!birthDate) {
      return sendJson(res, { error: "Informe a data de nascimento no formato AAAA-MM-DD." }, 422);
    }
    if (!hasConfiguredLookupProvider("cpf")) {
      return sendJson(
        res,
        { error: "A consulta de CPF depende de token configurado para o provedor externo." },
        503,
      );
    }
    const provider = resolveLookupProvider(gabinete.id, ctx.user.id, "cpf", url.searchParams.get("provider"));
    const result = await lookupCpfData(cpfLookupMatch[1], birthDate, provider);
    if (!result) {
      return sendJson(res, { error: "CPF nao encontrado ou nao validado com os dados informados." }, 404);
    }
    return sendJson(res, result);
  }

  const cnpjaLookupMatch = pathname.match(/^\/api\/lookups\/cnpja\/cnpj\/(\d{14})$/);
  if (cnpjaLookupMatch && req.method === "GET") {
    const result = await lookupCnpjaOffice(cnpjaLookupMatch[1]);
    if (!result) {
      return sendJson(res, { error: "CNPJ nao encontrado na CNPJa." }, 404);
    }
    return sendJson(res, { source: "CNPJa", data: result });
  }

  const consultarioRawMatch = pathname.match(/^\/api\/lookups\/consultario\/([a-z_]+)$/);
  if (consultarioRawMatch && req.method === "GET") {
    if (!CONSULTARIO_TOKEN) {
      return sendJson(
        res,
        { error: "Consultar.IO nao esta configurada neste ambiente." },
        503,
      );
    }
    const resource = consultarioRawMatch[1];
    const spec = CONSULTARIO_RAW_RESOURCES[resource];
    if (!spec) return sendJson(res, { error: "Recurso Consultar.IO nao suportado." }, 404);
    const payload = await fetchConsultarIoJson(spec.path, collectSearchParams(url, spec.params));
    if (!payload) {
      return sendJson(res, { error: "Nao foi possivel consultar o provedor externo." }, 502);
    }
    return sendJson(res, { source: "Consultar.IO", resource, data: payload });
  }

  const invertextoCepMatch = pathname.match(/^\/api\/lookups\/invertexto\/cep\/(\d{5}-?\d{3})$/);
  if (invertextoCepMatch && req.method === "GET") {
    if (!INVERTEXTO_TOKEN) {
      return sendJson(res, { error: "Invertexto nao esta configurada neste ambiente." }, 503);
    }
    const payload = await fetchInvertextoJson(`/v1/cep/${normalizeCep(invertextoCepMatch[1])}`);
    if (!payload) {
      return sendJson(res, { error: "Falha ao consultar CEP na Invertexto." }, 502);
    }
    return sendJson(res, { source: "Invertexto", resource: "cep", data: payload });
  }

  const invertextoCnpjMatch = pathname.match(/^\/api\/lookups\/invertexto\/cnpj\/(\d{14})$/);
  if (invertextoCnpjMatch && req.method === "GET") {
    if (!INVERTEXTO_TOKEN) {
      return sendJson(res, { error: "Invertexto nao esta configurada neste ambiente." }, 503);
    }
    const payload = await fetchInvertextoJson(`/v1/cnpj/${invertextoCnpjMatch[1]}`);
    if (!payload) {
      return sendJson(res, { error: "Falha ao consultar CNPJ na Invertexto." }, 502);
    }
    return sendJson(res, { source: "Invertexto", resource: "cnpj", data: payload });
  }

  const receitawsCnpjMatch = pathname.match(/^\/api\/lookups\/receitaws\/cnpj\/(\d{14})$/);
  if (receitawsCnpjMatch && req.method === "GET") {
    if (!RECEITAWS_TOKEN) {
      return sendJson(res, { error: "ReceitaWS nao esta configurada neste ambiente." }, 503);
    }
    const payload = await fetchReceitaWsCnpj(receitawsCnpjMatch[1]);
    if (!payload) {
      return sendJson(res, { error: "Falha ao consultar CNPJ na ReceitaWS." }, 502);
    }
    return sendJson(res, { source: "ReceitaWS", resource: "cnpj", data: payload });
  }

  const invertextoEmailMatch = pathname.match(/^\/api\/lookups\/invertexto\/email\/(.+)$/);
  if (invertextoEmailMatch && req.method === "GET") {
    if (!INVERTEXTO_TOKEN) {
      return sendJson(res, { error: "Invertexto nao esta configurada neste ambiente." }, 503);
    }
    const payload = await fetchInvertextoJson(`/v1/email-validator/${encodeURIComponent(invertextoEmailMatch[1])}`);
    if (!payload) {
      return sendJson(res, { error: "Falha ao validar e-mail na Invertexto." }, 502);
    }
    return sendJson(res, { source: "Invertexto", resource: "email_validator", data: payload });
  }

  const invertextoHolidaysMatch = pathname.match(/^\/api\/lookups\/invertexto\/holidays\/(\d{4})$/);
  if (invertextoHolidaysMatch && req.method === "GET") {
    if (!INVERTEXTO_TOKEN) {
      return sendJson(res, { error: "Invertexto nao esta configurada neste ambiente." }, 503);
    }
    const payload = await fetchInvertextoJson(
      `/v1/holidays/${invertextoHolidaysMatch[1]}`,
      collectSearchParams(url, ["state"]),
    );
    if (!payload) {
      return sendJson(res, { error: "Falha ao consultar feriados na Invertexto." }, 502);
    }
    return sendJson(res, { source: "Invertexto", resource: "holidays", data: payload });
  }

  if (pathname === "/api/lookups/invertexto/validator" && req.method === "GET") {
    if (!INVERTEXTO_TOKEN) {
      return sendJson(res, { error: "Invertexto nao esta configurada neste ambiente." }, 503);
    }
    const payload = await fetchInvertextoJson(
      "/v1/validator",
      collectSearchParams(url, ["value", "type"]),
    );
    if (!payload) {
      return sendJson(res, { error: "Falha ao validar documento na Invertexto." }, 502);
    }
    return sendJson(res, { source: "Invertexto", resource: "validator", data: payload });
  }

  if (pathname === "/api/whatsapp" && req.method === "GET") {
    return sendJson(res, {
      connector: await resolveWhatsappConnectorState(gabinete),
      support: {
        phone: SUPPORT_WHATSAPP_PHONE,
        pretty: SUPPORT_WHATSAPP_PRETTY,
        url: SUPPORT_WHATSAPP_URL,
        email: SUPPORT_EMAIL_ADDRESS,
        mailbox_ready: SUPPORT_EMAIL_MAILBOX_READY,
      },
      lookups: buildWhatsappLookups(gabinete.id),
      threads: listWhatsappThreads(gabinete.id, {
        q: url.searchParams.get("q") || "",
      }),
      recent_messages: listWhatsappMessages(gabinete.id, {
        q: url.searchParams.get("q") || "",
        limit: url.searchParams.get("limit") || 60,
      }),
    });
  }

  if (pathname === "/api/whatsapp/threads" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    try {
      const thread = saveWhatsappThread(gabinete.id, ctx.user.id, body);
      logAudit(gabinete.id, ctx.user.id, "update", "whatsapp_thread", thread.id, null, {
        remote_phone: thread.remote_phone,
        assigned_user_id: thread.assigned_user_id,
        contact_id: thread.contact_id,
        ticket_id: thread.ticket_id,
        is_monitored: Boolean(thread.is_monitored),
      });
      return sendJson(res, { ok: true, thread });
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel atualizar a conversa." }, 422);
    }
  }

  if (pathname === "/api/whatsapp/threads/read" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const number = normalizePhone(body.number);
    if (!number) {
      return sendJson(res, { error: "Conversa nao encontrada." }, 422);
    }
    db.prepare(
      `
        UPDATE whatsapp_threads
        SET unread_count = 0,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id
          AND remote_phone = :remote_phone
      `,
    ).run({
      gabinete_id: gabinete.id,
      remote_phone: number,
      updated_at: nowIso(),
    });
    return sendJson(res, { ok: true });
  }

  if (pathname === "/api/whatsapp/threads/ticket" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const number = normalizePhone(body.number);
    if (!number) {
      return sendJson(res, { error: "Informe um numero valido para criar o atendimento." }, 422);
    }

    try {
      const ticket = createTicketFromWhatsappThread(gabinete, ctx.user, {
        number,
        contact_id: body.contact_id,
        assigned_user_id: body.assigned_user_id,
        title: body.title,
        remote_name: body.remote_name,
      });
      const thread = saveWhatsappThread(gabinete.id, ctx.user.id, {
        number,
        contact_id: ticket.contact_id,
        ticket_id: ticket.id,
        assigned_user_id: ticket.assigned_user_id,
        is_monitored: true,
      });
      logAudit(gabinete.id, ctx.user.id, "create", "ticket", ticket.id, null, {
        number: ticket.number,
        source: "whatsapp_crm",
      });
      return sendJson(res, { ok: true, ticket, thread }, 201);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel criar o atendimento." }, 422);
    }
  }

  if (pathname === "/api/whatsapp/config" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    const body = await parseBody(req);
    const currentGabinete = getGabineteById(gabinete.id);
    const nextProvider =
      body.provider === "wa_me"
        ? "wa_me"
        : isEvolutionConfigured()
          ? "evolution"
          : "wa_me";
    const nextInstanceName = sanitizeEvolutionInstanceName(
      body.instance_name || currentGabinete?.whatsapp_instance_name || "",
      currentGabinete,
    );
    const updated = saveGabineteWhatsappConfig(gabinete.id, {
      whatsapp_provider: nextProvider,
      whatsapp_instance_name: nextInstanceName,
      whatsapp_instance_token: currentGabinete?.whatsapp_instance_token || "",
    });
    logAudit(gabinete.id, ctx.user.id, "update", "whatsapp_connector", gabinete.id, currentGabinete, {
      whatsapp_provider: nextProvider,
      whatsapp_instance_name: nextInstanceName,
    });
    return sendJson(res, { connector: await resolveWhatsappConnectorState(updated) });
  }

  if (pathname === "/api/whatsapp/instance" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    if (!isEvolutionConfigured()) {
      return sendJson(res, { error: "O WhatsApp do sistema ainda nao esta pronto neste ambiente." }, 503);
    }
    const body = await parseBody(req);
    const currentGabinete = getGabineteById(gabinete.id);
    const mode = body.mode === "attach" ? "attach" : "create";
    const instanceName = sanitizeEvolutionInstanceName(
      body.instance_name || currentGabinete?.whatsapp_instance_name || "",
      currentGabinete,
    );
    if (!instanceName) {
      return sendJson(res, { error: "Nao foi possivel preparar a conexao deste gabinete." }, 422);
    }

    let instance = null;
    if (mode === "attach") {
      instance = await fetchEvolutionInstanceByName(instanceName);
      if (!instance) {
        return sendJson(res, { error: "Essa linha de WhatsApp nao foi encontrada." }, 404);
      }
    } else {
      const creation = await createEvolutionInstance(currentGabinete, instanceName);
      if (!creation?.instance?.instanceName && !creation?.instanceName) {
        return sendJson(res, { error: "Nao foi possivel preparar o WhatsApp agora." }, 502);
      }
      instance = {
        ...normalizeEvolutionInstance(creation),
        name: creation?.instance?.instanceName || instanceName,
        token: creation?.hash?.apikey || creation?.instance?.apikey || creation?.token || "",
      };
    }

    const updated = saveGabineteWhatsappConfig(gabinete.id, {
      whatsapp_provider: "evolution",
      whatsapp_instance_name: instanceName,
      whatsapp_instance_token: instance?.token || currentGabinete?.whatsapp_instance_token || "",
    });
    await configureEvolutionWebhook(instanceName, getRequestOrigin(req));
    logAudit(gabinete.id, ctx.user.id, mode === "attach" ? "attach" : "create", "whatsapp_connector", gabinete.id, null, {
      instance_name: instanceName,
      mode,
    });
    return sendJson(
      res,
      {
        connector: await resolveWhatsappConnectorState(updated),
        instance: {
          name: instanceName,
          status: instance?.status || "created",
        },
      },
      mode === "create" ? 201 : 200,
    );
  }

  if (pathname === "/api/whatsapp/connect" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    if (!isEvolutionConfigured()) {
      return sendJson(res, { error: "O WhatsApp do sistema ainda nao esta pronto neste ambiente." }, 503);
    }
    const currentGabinete = getGabineteById(gabinete.id);
    const preferredInstanceName = sanitizeEvolutionInstanceName(
      currentGabinete?.whatsapp_instance_name || buildDefaultEvolutionInstanceName(currentGabinete),
      currentGabinete,
    );
    if (!preferredInstanceName) {
      return sendJson(res, { error: "Nao foi possivel preparar a conexao do WhatsApp deste gabinete." }, 422);
    }

    let instance = await fetchEvolutionInstanceByName(preferredInstanceName);
    let createdNow = false;
    if (!instance) {
      const creation = await createEvolutionInstance(currentGabinete, preferredInstanceName);
      if (!creation?.instance?.instanceName && !creation?.instanceName) {
        return sendJson(res, { error: "Nao foi possivel preparar a conexao do WhatsApp agora." }, 502);
      }
      createdNow = true;
      instance = {
        ...normalizeEvolutionInstance(creation),
        name: creation?.instance?.instanceName || preferredInstanceName,
        token: creation?.hash?.apikey || creation?.instance?.apikey || creation?.token || "",
      };
    }

    const updatedGabinete = saveGabineteWhatsappConfig(gabinete.id, {
      whatsapp_provider: "evolution",
      whatsapp_instance_name: preferredInstanceName,
      whatsapp_instance_token: instance?.token || currentGabinete?.whatsapp_instance_token || "",
    });

    const cooldownKey = getWhatsappQrCooldownKey(gabinete.id, preferredInstanceName);
    const cooldown = reserveWhatsappQrCooldown(cooldownKey);
    if (!cooldown.allowed) {
      res.setHeader("Retry-After", String(cooldown.remainingSeconds));
      return sendJson(
        res,
        {
          error: "Aguarde 1 minuto para gerar outro QR Code.",
          retry_after_seconds: cooldown.remainingSeconds,
          qr_next_allowed_at: new Date(cooldown.nextAllowedAt).toISOString(),
        },
        429,
      );
    }

    let connection = null;
    try {
      connection = await connectEvolutionInstance(preferredInstanceName);
    } catch (error) {
      releaseWhatsappQrCooldown(cooldownKey);
      throw error;
    }
    if (!connection) {
      releaseWhatsappQrCooldown(cooldownKey);
      return sendJson(res, { error: "Nao foi possivel gerar o codigo de conexao." }, 502);
    }
    await configureEvolutionWebhook(preferredInstanceName, getRequestOrigin(req));
    logAudit(gabinete.id, ctx.user.id, "connect", "whatsapp_connector", gabinete.id, null, {
      instance_name: preferredInstanceName,
      created_now: createdNow,
    });
    return sendJson(res, {
      connector: await resolveWhatsappConnectorState(updatedGabinete),
      connection: {
        pairing_code: connection.pairingCode || "",
        qr_payload: connection.code || "",
        attempts: connection.count || 0,
      },
      qr_next_allowed_at: new Date(cooldown.nextAllowedAt).toISOString(),
      qr_retry_after_seconds: cooldown.remainingSeconds,
    });
  }

  if (pathname === "/api/whatsapp/disconnect" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    if (!isEvolutionConfigured()) {
      return sendJson(res, { error: "O WhatsApp do sistema ainda nao esta pronto neste ambiente." }, 503);
    }
    const currentGabinete = getGabineteById(gabinete.id);
    const instanceName = currentGabinete?.whatsapp_instance_name || "";
    if (!instanceName) {
      return sendJson(res, { error: "Ainda nao existe uma linha conectada neste gabinete." }, 422);
    }
    const result = await logoutEvolutionInstance(instanceName);
    if (!result) {
      return sendJson(res, { error: "Nao foi possivel desconectar a linha agora." }, 502);
    }
    logAudit(gabinete.id, ctx.user.id, "disconnect", "whatsapp_connector", gabinete.id, null, {
      instance_name: instanceName,
    });
    return sendJson(res, {
      ok: true,
      connector: await resolveWhatsappConnectorState(currentGabinete),
      result,
    });
  }

  if (pathname === "/api/whatsapp/restart" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    if (!isEvolutionConfigured()) {
      return sendJson(res, { error: "O WhatsApp do sistema ainda nao esta pronto neste ambiente." }, 503);
    }
    const currentGabinete = getGabineteById(gabinete.id);
    const instanceName = currentGabinete?.whatsapp_instance_name || "";
    if (!instanceName) {
      return sendJson(res, { error: "Conecte primeiro o WhatsApp do gabinete." }, 422);
    }
    const result = await restartEvolutionInstance(instanceName);
    if (!result) {
      return sendJson(res, { error: "Nao foi possivel reiniciar a conexao agora." }, 502);
    }
    return sendJson(res, {
      ok: true,
      connector: await resolveWhatsappConnectorState(currentGabinete),
      result,
    });
  }

  if (pathname === "/api/whatsapp/send" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const contentType = String(req.headers["content-type"] || "");
    const parsed = contentType.includes("multipart/form-data")
      ? await parseMultipart(req, "/tmp")
      : { fields: await parseBody(req), files: [] };
    const body = parsed.fields || {};
    const files = Array.isArray(parsed.files) ? parsed.files : [];
    const currentGabinete = getGabineteById(gabinete.id);
    const providerMode = currentGabinete?.whatsapp_provider || (isEvolutionConfigured() ? "evolution" : "wa_me");
    const draft = resolveWhatsappSendDraft(gabinete.id, body);
    const attachment = files[0] || null;

    if (files.length > 1) {
      cleanupParsedFiles(files);
      return sendJson(res, { error: "Envie apenas 1 arquivo por mensagem." }, 422);
    }

    if (attachment) {
      const attachmentError = validateWhatsappAttachment(attachment);
      if (attachmentError) {
        cleanupParsedFiles(files);
        return sendJson(res, { error: attachmentError }, 422);
      }
    }

    if (!draft.text && !attachment) {
      cleanupParsedFiles(files);
      return sendJson(res, { error: "Escreva a mensagem ou escolha um arquivo antes de enviar." }, 422);
    }

    if (!draft.number) {
      cleanupParsedFiles(files);
      return sendJson(res, { error: "Informe um numero valido para o envio." }, 422);
    }

    if (providerMode === "wa_me" || !isEvolutionConfigured() || !currentGabinete?.whatsapp_instance_name) {
      if (attachment) {
        cleanupParsedFiles(files);
        return sendJson(res, { error: "Para enviar arquivo, conecte o WhatsApp do gabinete pelo QR Code." }, 422);
      }
      const thread = saveWhatsappThread(gabinete.id, ctx.user.id, {
        number: draft.number,
        contact_id: draft.contact?.id || body.contact_id,
        ticket_id: draft.ticket?.id || body.ticket_id,
        assigned_user_id: body.assigned_user_id,
        is_monitored: Object.prototype.hasOwnProperty.call(body, "monitor_conversation")
          ? body.monitor_conversation
          : true,
        last_message_text: draft.text,
      });
      return sendJson(res, {
        mode: "wa_me",
        thread,
        url: buildWhatsappLink(draft.number, draft.text),
        error:
          providerMode === "wa_me"
            ? ""
            : "O WhatsApp ainda nao esta conectado. Abrimos o WhatsApp Web como alternativa.",
      });
    }

    const delivery = attachment
      ? await sendEvolutionMediaMessage(
          currentGabinete.whatsapp_instance_name,
          currentGabinete.whatsapp_instance_token,
          draft.number,
          attachment,
          draft.text,
        )
      : await sendEvolutionTextMessage(
          currentGabinete.whatsapp_instance_name,
          currentGabinete.whatsapp_instance_token,
          draft.number,
          draft.text,
        );

    if (!delivery) {
      cleanupParsedFiles(files);
      return sendJson(res, { error: "Falha ao enviar pelo WhatsApp do gabinete." }, 502);
    }

    const logId = createWhatsappMessageLog(
      gabinete.id,
      ctx.user.id,
      {
        contact_id: draft.contact?.id || body.contact_id,
        ticket_id: draft.ticket?.id || body.ticket_id,
        template_id: draft.template?.id || body.template_id,
        provider: "evolution",
        direction: "outbound",
        instance_name: currentGabinete.whatsapp_instance_name,
        number: draft.number,
        remote_jid: delivery?.key?.remoteJid || "",
        text: draft.text || attachment?.filename || "Arquivo enviado",
        message_type: attachment ? inferWhatsappAttachmentType(attachment) : "text",
        mime_type: attachment?.type || "",
        provider_message_id: delivery?.key?.id || "",
        provider_status: delivery?.status || "PENDING",
      },
      delivery,
    );
    const thread = saveWhatsappThread(gabinete.id, ctx.user.id, {
      number: draft.number,
      contact_id: draft.contact?.id || body.contact_id,
      ticket_id: draft.ticket?.id || body.ticket_id,
      assigned_user_id: body.assigned_user_id,
      is_monitored: Object.prototype.hasOwnProperty.call(body, "monitor_conversation")
        ? body.monitor_conversation
        : true,
      last_message_at: nowIso(),
      last_message_text: draft.text || attachment?.filename || "Arquivo enviado",
    });

    if (draft.ticket?.id) {
      insertTicketHistory(gabinete.id, draft.ticket.id, ctx.user.id, {
        action_type: "WhatsApp",
        text: `Mensagem enviada ao contato ${draft.ticket.contact_name || draft.number}.`,
        previous_status: "",
        new_status: draft.ticket.status,
        next_action: draft.ticket.next_action,
        next_action_date: draft.ticket.next_action_date,
      });
    }

    logAudit(gabinete.id, ctx.user.id, "send", "whatsapp_message", logId, null, {
      ticket_id: draft.ticket?.id || null,
      contact_id: draft.contact?.id || null,
      template_id: draft.template?.id || null,
      remote_phone: draft.number,
    });

    cleanupParsedFiles(files);
    return sendJson(res, {
      ok: true,
      message_id: logId,
      thread,
      delivery,
      connector: await resolveWhatsappConnectorState(currentGabinete),
    });
  }

  if (pathname === "/api/email/draft" && req.method === "GET") {
    const draft = buildOperationalEmailDraft(gabinete.id, {
      contact_id: url.searchParams.get("contact_id") || "",
      ticket_id: url.searchParams.get("ticket_id") || "",
      to: url.searchParams.get("to") || "",
    });
    const currentGabinete = getGabineteById(gabinete.id);
    const emailSettings = buildGabineteEmailSettings(currentGabinete, ctx.user?.email || gabinete.email || "");

    return sendJson(res, {
      draft: {
        ...draft,
        configured: emailSettings.configured,
        from_name: emailSettings.sender_name,
        from_address: emailSettings.sender_address,
        reply_to: emailSettings.reply_to,
      },
    });
  }

  if (pathname === "/api/email/send" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const currentGabinete = getGabineteById(gabinete.id);
    const emailSettings = buildGabineteEmailSettings(currentGabinete, ctx.user?.email || gabinete.email || "");
    if (!emailSettings.configured) {
      return sendJson(res, { error: "Configure primeiro o e-mail do gabinete em Configuracoes." }, 422);
    }

    const draft = buildOperationalEmailDraft(gabinete.id, body);
    const to = String(body.to ?? draft.to).trim().toLowerCase();
    const subject = String(body.subject ?? draft.subject).trim();
    const text = String(body.text ?? draft.text).trim();

    if (!isValidEmail(to)) {
      return sendJson(res, { error: "Informe um e-mail valido para o destinatario." }, 422);
    }
    if (!subject) {
      return sendJson(res, { error: "Informe o assunto do e-mail." }, 422);
    }
    if (!text) {
      return sendJson(res, { error: "Escreva a mensagem antes de enviar." }, 422);
    }

    const smtpProfile = resolveGabineteSmtpProfile(currentGabinete);

    try {
      await sendSmtpMail({
        to,
        subject,
        text,
        smtp: smtpProfile,
      });
    } catch {
      return sendJson(
        res,
        { error: "Nao foi possivel enviar o e-mail com a configuracao atual do gabinete." },
        502,
      );
    }

    const logId = createEmailMessageLog(
      gabinete.id,
      ctx.user.id,
      {
        contact_id: draft.contact?.id || body.contact_id,
        ticket_id: draft.ticket?.id || body.ticket_id,
        provider: "smtp",
        direction: "outbound",
        to,
        subject,
        text,
        provider_status: "SENT",
      },
      {
        remote_email: to,
        subject,
        sent_at: nowIso(),
      },
    );

    if (draft.ticket?.id) {
      insertTicketHistory(gabinete.id, draft.ticket.id, ctx.user.id, {
        action_type: "E-mail",
        text: `E-mail enviado para ${to}.`,
        previous_status: "",
        new_status: draft.ticket.status,
        next_action: draft.ticket.next_action,
        next_action_date: draft.ticket.next_action_date,
      });
    }

    logAudit(gabinete.id, ctx.user.id, "send", "email_message", logId, null, {
      ticket_id: draft.ticket?.id || null,
      contact_id: draft.contact?.id || null,
      remote_email: to,
      subject,
    });

    return sendJson(res, { ok: true, message_id: logId });
  }

  if (pathname === "/api/dashboard" && req.method === "GET") {
    const holidayUf = String(url.searchParams.get("holiday_uf") || gabinete.uf || "SP").toUpperCase();
    return sendJson(res, {
      ...(await buildDashboardData(gabinete.id, { holidayUf })),
      meta: {
        contact_count: db.prepare("SELECT COUNT(*) AS total FROM contacts WHERE gabinete_id = :gabinete_id AND (deleted_at IS NULL OR deleted_at = '')").get({ gabinete_id: gabinete.id }).total,
        ticket_count: db.prepare(`SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}`).get({ gabinete_id: gabinete.id }).total,
        user_count: db.prepare("SELECT COUNT(*) AS total FROM users WHERE gabinete_id = :gabinete_id").get({ gabinete_id: gabinete.id }).total,
        document_count: db.prepare(`SELECT COUNT(*) AS total FROM documents WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}`).get({ gabinete_id: gabinete.id }).total,
        project_count: db.prepare(`SELECT COUNT(*) AS total FROM projects WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}`).get({ gabinete_id: gabinete.id }).total,
        task_count: db.prepare(`SELECT COUNT(*) AS total FROM tasks WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}`).get({ gabinete_id: gabinete.id }).total,
      },
    });
  }

  if (pathname === "/api/holidays" && req.method === "GET") {
    const selectedUf = String(url.searchParams.get("uf") || gabinete.uf || "SP").toUpperCase();
    const gabineteLocation = getGabineteHolidayLocation(gabinete.id);
    const useGabineteCity = !selectedUf || selectedUf === String(gabineteLocation.uf || "").toUpperCase();
    const requestedCity = String(url.searchParams.get("city") || "").trim();
    const requestedCityIbge = String(url.searchParams.get("city_ibge") || "").trim();
    const context = await hydrateHolidayContext({
      selected_uf: selectedUf,
      selected_uf_label: getUfName(selectedUf),
      selected_city: useGabineteCity
        ? String(requestedCity || gabineteLocation.city || "").trim()
        : requestedCity,
      selected_city_ibge: useGabineteCity
        ? String(
          requestedCity
            ? requestedCityIbge
            : (requestedCityIbge || gabineteLocation.city_ibge || ""),
        ).trim()
        : requestedCityIbge,
    }, {
      persistGabineteId: useGabineteCity && !requestedCity ? gabinete.id : 0,
    });
    const year = parseInteger(url.searchParams.get("year"), 0);
    const currentYear = Number(currentDate().slice(0, 4));
    await ensureMunicipalHolidayCatalogForContext(
      context,
      year > 0 ? [year] : [currentYear, currentYear + 1],
    );
    const items = getHolidayCatalogForContext(context, { year });

    return sendJson(res, {
      items,
      context,
      meta: {
        total: items.length,
        national_count: items.filter((item) => item.scope === "national").length,
        state_count: items.filter((item) => item.scope === "state").length,
        municipal_count: items.filter((item) => item.scope === "municipal").length,
        validated_count: items.filter((item) =>
          ["official", "provider_law", "provider_verified", "municipal_law", "municipal_provider"].includes(
            item.validation_status,
          ),
        ).length,
      },
    });
  }

  if (pathname === "/api/contacts" && req.method === "GET") {
    const trash = url.searchParams.get("trash") === "1" || url.searchParams.get("scope") === "trash";
    const result = listContactsResult(gabinete.id, {
      q: url.searchParams.get("q") ?? "",
      scope: trash ? "" : (url.searchParams.get("scope") ?? ""),
      register_kind: url.searchParams.get("register_kind") ?? "",
      segment: url.searchParams.get("segment") ?? "",
      contact_type: url.searchParams.get("contact_type") ?? "",
      initial: url.searchParams.get("initial") ?? "",
      limit: url.searchParams.get("limit") ?? "",
      offset: url.searchParams.get("offset") ?? "",
      trash,
    });
    return sendJson(res, result);
  }

  if (pathname === "/api/contacts" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const error = validateContactForm(body);
    if (error) return sendJson(res, { error }, 422);
    const contactId = createContact(gabinete.id, body);
    logAudit(gabinete.id, ctx.user.id, "create", "contact", contactId, null, {
      name: body.name,
      phone: body.phone,
    });
    return sendJson(res, { contact: getScopedContact(gabinete.id, contactId) }, 201);
  }

  if (pathname === "/api/contacts/tags" && req.method === "GET") {
    const rows = db
      .prepare(
        `
          SELECT tags
          FROM contacts
          WHERE gabinete_id = :gabinete_id
            AND ${activeRowWhere()}
        `,
      )
      .all({ gabinete_id: gabinete.id });
    const tagCounts = new Map();
    rows.forEach((row) => {
      splitCommaValues(row.tags).forEach((tag) => {
        const key = normalizeTextKey(tag);
        const current = tagCounts.get(key) || { name: tag, total: 0 };
        current.total += 1;
        if (tag.length < current.name.length) current.name = tag;
        tagCounts.set(key, current);
      });
    });
    const items = [...tagCounts.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
    return sendJson(res, { items });
  }

  if (pathname === "/api/contacts/tags" && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const from = String(body.from || "").trim();
    const to = String(body.to || "").trim().replace(/,/g, " ").slice(0, 60);
    if (!from) return sendJson(res, { error: "Escolha a etiqueta atual." }, 422);
    if (!to) return sendJson(res, { error: "Informe o novo nome da etiqueta." }, 422);
    const fromKey = normalizeTextKey(from);
    const toKey = normalizeTextKey(to);
    if (!fromKey) return sendJson(res, { error: "Escolha uma etiqueta valida." }, 422);
    const rows = db
      .prepare(
        `
          SELECT id, tags
          FROM contacts
          WHERE gabinete_id = :gabinete_id
            AND ${activeRowWhere()}
            AND tags IS NOT NULL
            AND tags != ''
        `,
      )
      .all({ gabinete_id: gabinete.id });
    const update = db.prepare(
      `
        UPDATE contacts
        SET tags = :tags,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    );
    const timestamp = nowIso();
    let updatedCount = 0;
    rows.forEach((row) => {
      const tags = splitCommaValues(row.tags);
      if (!tags.some((tag) => normalizeTextKey(tag) === fromKey)) return;
      const seen = new Set();
      const renamed = [];
      tags.forEach((tag) => {
        const next = normalizeTextKey(tag) === fromKey ? to : tag;
        const key = normalizeTextKey(next);
        if (!key || seen.has(key)) return;
        seen.add(key);
        renamed.push(next);
      });
      update.run({
        gabinete_id: gabinete.id,
        id: row.id,
        tags: renamed.join(","),
        updated_at: timestamp,
      });
      updatedCount += 1;
    });
    logAudit(gabinete.id, ctx.user.id, "rename", "contact_tag", null, { from }, {
      from,
      to,
      merged_with_existing: fromKey !== toKey && rows.some((row) => splitCommaValues(row.tags).some((tag) => normalizeTextKey(tag) === toKey)),
      updated_count: updatedCount,
    });
    return sendJson(res, { updated_count: updatedCount, from, to });
  }

  if (pathname === "/api/contacts/tags" && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const tag = String(body.tag || "").trim();
    const mode = String(body.mode || "remove_tag").trim().toLowerCase();
    if (!tag) return sendJson(res, { error: "Escolha a etiqueta." }, 422);
    if (!["remove_tag", "trash_contacts"].includes(mode)) {
      return sendJson(res, { error: "Escolha o que fazer com a etiqueta." }, 422);
    }
    const tagKey = normalizeTextKey(tag);
    if (!tagKey) return sendJson(res, { error: "Escolha uma etiqueta valida." }, 422);
    const rows = db
      .prepare(
        `
          SELECT id, tags
          FROM contacts
          WHERE gabinete_id = :gabinete_id
            AND ${activeRowWhere()}
            AND tags IS NOT NULL
            AND tags != ''
        `,
      )
      .all({ gabinete_id: gabinete.id });
    const matchedRows = rows.filter((row) => splitCommaValues(row.tags).some((item) => normalizeTextKey(item) === tagKey));
    if (mode === "trash_contacts") {
      const contactIds = matchedRows.map((row) => Number(row.id)).filter(Boolean);
      if (!contactIds.length) return sendJson(res, { error: "Nenhum contato encontrado com essa etiqueta." }, 404);
      const movedCount = moveContactsToTrash(gabinete.id, contactIds, ctx.user.id);
      logAudit(gabinete.id, ctx.user.id, "move_to_trash", "contact_tag", null, { tag }, {
        tag,
        mode,
        contact_ids: contactIds,
        moved_count: movedCount,
      });
      return sendJson(res, { moved_count: movedCount, contact_ids: contactIds, tag, mode });
    }
    const update = db.prepare(
      `
        UPDATE contacts
        SET tags = :tags,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    );
    const timestamp = nowIso();
    const contactIds = [];
    matchedRows.forEach((row) => {
      const tags = splitCommaValues(row.tags);
      const nextTags = tags.filter((item) => normalizeTextKey(item) !== tagKey);
      update.run({
        gabinete_id: gabinete.id,
        id: row.id,
        tags: nextTags.join(","),
        updated_at: timestamp,
      });
      contactIds.push(row.id);
    });
    logAudit(gabinete.id, ctx.user.id, "delete", "contact_tag", null, { tag }, {
      tag,
      mode,
      updated_count: contactIds.length,
    });
    return sendJson(res, { updated_count: contactIds.length, contact_ids: contactIds, tag, mode });
  }

  if (pathname === "/api/contacts/bulk/tags" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const ids = normalizeBulkIds(body.ids);
    const tag = String(body.tag || "").trim().replace(/,/g, " ").slice(0, 60);
    if (!ids.length) return sendJson(res, { error: "Selecione pelo menos 1 contato." }, 422);
    if (!tag) return sendJson(res, { error: "Informe a etiqueta ou grupo." }, 422);
    const contacts = listScopedContactsByIds(gabinete.id, ids);
    const timestamp = nowIso();
    contacts.forEach((contact) => {
      db.prepare(
        `
          UPDATE contacts
          SET tags = :tags,
              updated_at = :updated_at
          WHERE gabinete_id = :gabinete_id AND id = :id
        `,
      ).run({
        gabinete_id: gabinete.id,
        id: contact.id,
        tags: mergeCommaValues(contact.tags, tag),
        updated_at: timestamp,
      });
    });
    logAudit(gabinete.id, ctx.user.id, "bulk_update", "contacts", null, null, {
      action: "add_tag",
      tag,
      contact_ids: contacts.map((contact) => contact.id),
    });
    return sendJson(res, { updated_count: contacts.length, tag });
  }

  if ((pathname === "/api/contacts/bulk/trash" || pathname === "/api/contacts/bulk/delete") && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const ids = normalizeBulkIds(body.ids);
    if (!ids.length) return sendJson(res, { error: "Selecione pelo menos 1 contato." }, 422);
    const contacts = listScopedContactsByIds(gabinete.id, ids);
    if (!contacts.length) return sendJson(res, { error: "Nenhum contato encontrado para mover." }, 404);
    const movedCount = moveContactsToTrash(gabinete.id, contacts.map((contact) => contact.id), ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "contacts", null, contacts, {
      contact_ids: contacts.map((contact) => contact.id),
      moved_count: movedCount,
    });
    return sendJson(res, { moved_count: movedCount });
  }

  if (pathname === "/api/contacts/bulk/restore" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const ids = normalizeBulkIds(body.ids);
    if (!ids.length) return sendJson(res, { error: "Selecione pelo menos 1 contato." }, 422);
    const contacts = listScopedContactsByIds(gabinete.id, ids, { deletedOnly: true });
    if (!contacts.length) return sendJson(res, { error: "Nenhum contato encontrado na lixeira." }, 404);
    const result = restoreTrashItems(gabinete.id, { contacts: contacts.map((contact) => contact.id) }, { mode: "merge" });
    logAudit(gabinete.id, ctx.user.id, "restore", "contacts", null, contacts, {
      contact_ids: contacts.map((contact) => contact.id),
      restored_count: result.restored_count,
      merged_count: result.merged_count,
    });
    return sendJson(res, result);
  }

  if (pathname === "/api/contacts/bulk/permanent-delete" && req.method === "POST") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    if (ctx.user?.role !== "super_admin") return sendJson(res, { error: "Apenas o suporte pode apagar definitivamente." }, 403);
    const body = await parseBody(req);
    const ids = normalizeBulkIds(body.ids);
    if (String(body.confirmation || "") !== "EXCLUIR") {
      return sendJson(res, { error: "Digite EXCLUIR para confirmar." }, 422);
    }
    if (!ids.length) return sendJson(res, { error: "Selecione pelo menos 1 contato." }, 422);
    const contacts = listScopedContactsByIds(gabinete.id, ids, { deletedOnly: true });
    if (!contacts.length) return sendJson(res, { error: "Nenhum contato encontrado na lixeira." }, 404);
    const ticketCount = countTicketsForContacts(gabinete.id, contacts.map((contact) => contact.id));
    if (ticketCount > 0) {
      return sendJson(res, {
        error: `${ticketCount} atendimento(s) estao ligados aos contatos selecionados. Restaure ou mantenha na lixeira; nao apague definitivamente contato com historico.`,
      }, 422);
    }
    const placeholders = contacts.map((_, index) => `:id${index}`).join(", ");
    const params = Object.fromEntries(contacts.map((contact, index) => [`id${index}`, contact.id]));
    const result = db.prepare(
      `DELETE FROM contacts WHERE gabinete_id = :gabinete_id AND id IN (${placeholders})`,
    ).run({ gabinete_id: gabinete.id, ...params });
    logAudit(gabinete.id, ctx.user.id, "permanent_delete", "contacts", null, contacts, {
      contact_ids: contacts.map((contact) => contact.id),
      deleted_count: result.changes || 0,
    });
    return sendJson(res, { deleted_count: result.changes || 0 });
  }

  const contactMatch = pathname.match(/^\/api\/contacts\/(\d+)$/);
  if (contactMatch && req.method === "GET") {
    const contact = getScopedContact(gabinete.id, Number(contactMatch[1]));
    if (!contact) return sendJson(res, { error: "Contato nao encontrado." }, 404);
    const tickets = db
      .prepare(
        `
          SELECT id, number, demand_title, status, opened_at, closed_at
          FROM tickets
          WHERE gabinete_id = :gabinete_id AND contact_id = :contact_id
          ORDER BY opened_at DESC
        `,
      )
      .all({ gabinete_id: gabinete.id, contact_id: contact.id });
    const recurringDemands = db
      .prepare(
        `
          SELECT demand_title AS title, COUNT(*) AS total
          FROM tickets
          WHERE gabinete_id = :gabinete_id AND contact_id = :contact_id
          GROUP BY demand_title
          HAVING COUNT(*) > 1
          ORDER BY total DESC, demand_title ASC
          LIMIT 5
        `,
      )
      .all({ gabinete_id: gabinete.id, contact_id: contact.id });
    const summary = {
      total_tickets: tickets.length,
      open_tickets: tickets.filter((item) => !item.closed_at).length,
      closed_tickets: tickets.filter((item) => item.closed_at).length,
      recurring_demands: recurringDemands,
    };
    const callLogs = listCallLogs(gabinete.id, { contact_id: contact.id }).slice(0, 8);
    return sendJson(res, {
      contact,
      tickets,
      summary,
      call_logs: callLogs,
      contact_files: listContactFiles(gabinete.id, contact.id, 12),
      email_messages: listEmailMessages(gabinete.id, { contact_id: contact.id, limit: 8 }),
    });
  }

  if (contactMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const contactId = Number(contactMatch[1]);
    const contact = getScopedContact(gabinete.id, contactId);
    if (!contact) return sendJson(res, { error: "Contato nao encontrado." }, 404);
    const body = await parseBody(req);
    const error = validateContactForm(body);
    if (error) return sendJson(res, { error }, 422);
    updateContact(gabinete.id, contactId, body);
    logAudit(gabinete.id, ctx.user.id, "update", "contact", contactId, contact, body);
    return sendJson(res, { contact: getScopedContact(gabinete.id, contactId) });
  }

  if (pathname === "/api/tickets" && req.method === "GET") {
    const loadAllTickets = toFlag(url.searchParams.get("all")) === 1;
    const rawLimit = parseInteger(url.searchParams.get("limit"), TICKET_PAGE_DEFAULT_LIMIT);
    const limit = loadAllTickets ? 0 : Math.min(TICKET_PAGE_MAX_LIMIT, Math.max(1, rawLimit || TICKET_PAGE_DEFAULT_LIMIT));
    const offset = loadAllTickets ? 0 : Math.max(0, parseInteger(url.searchParams.get("offset"), 0));
    const ticketFilters = {
      q: url.searchParams.get("q") ?? "",
      status: url.searchParams.get("status") ?? "",
      channel: url.searchParams.get("channel") ?? "",
      scope: url.searchParams.get("scope") ?? "",
      assigned_user_id: url.searchParams.get("assigned_user_id") ?? "",
      category: url.searchParams.get("category") ?? "",
      public_tracking: url.searchParams.get("online") === "1" || url.searchParams.get("public_tracking") === "1" ? "1" : "",
      include_archived: url.searchParams.get("scope") === "archived",
    };
    const statusCounts = listTicketStatusCounts(gabinete.id, ticketFilters);
    const publicTrackingCount = countTickets(gabinete.id, {
      ...ticketFilters,
      status: "",
      public_tracking: "1",
    });
    const result = listTicketsResult(gabinete.id, {
      ...ticketFilters,
      limit,
      offset,
    });
    return sendJson(res, {
      items: withStatusColors(
        result.items,
        gabinete.id,
      ),
      total: result.total,
      loaded: result.loaded,
      limit: result.limit,
      offset: result.offset,
      next_offset: result.next_offset,
      has_more: result.has_more,
      status_counts: statusCounts,
      total_count: statusCounts.reduce((total, item) => total + Number(item.total || 0), 0),
      public_tracking_count: publicTrackingCount,
      lookups: buildApiLookups(gabinete.id),
    });
  }

  if (pathname === "/api/tickets" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = ensureTicketLookupValues(gabinete.id, await parseBody(req));
    let ticketImageUploads = [];
    try {
      ticketImageUploads = prepareTicketImageUploads(body.ticket_images);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel anexar os arquivos." }, 422);
    }
    const error =
        validateTicketForm({ ...body, _is_final_status: isTicketFinalStatus(gabinete.id, body.status) })
      || validateScopedReferences(gabinete.id, body, [
        { field: "contact_id", table: "contacts", label: "Contato" },
        { field: "assigned_user_id", table: "users", label: "Responsavel" },
      ]);
    if (error) return sendJson(res, { error }, 422);

    const contactId = upsertContactFromTicketBody(gabinete.id, body);
    const followUpPlan = resolveTicketFollowUpPlan(gabinete.id, body);
    const sequence =
      db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id").get({
        gabinete_id: gabinete.id,
      }).total + 1;
    const number = generateTicketCode(gabinete.id, sequence);
    const timestamp = nowIso();
    const finalStatus = isTicketFinalStatus(gabinete.id, body.status);
    const closedAt = finalStatus ? (body.closed_at || followUpPlan.openedAt) : "";
    const assignedUserId =
      scopedReferenceId(gabinete.id, "users", body.assigned_user_id)
      || scopedReferenceId(gabinete.id, "users", ctx.user.id);

    const result = db.prepare(
      `
        INSERT INTO tickets (
          gabinete_id, contact_id, number, opened_at, channel, status, priority, tags,
          demand_title, demand_category, description, current_guidance, assigned_user_id,
          department, external_protocol, internal_due_date, dependency_note, follow_up_days,
          next_action, next_action_date, closed_at, result, closure_confirmed, support_link, geo_lat, geo_lng,
          is_archived, is_favorite, created_at, updated_at
        ) VALUES (
          :gabinete_id, :contact_id, :number, :opened_at, :channel, :status, :priority, :tags,
          :demand_title, :demand_category, :description, :current_guidance, :assigned_user_id,
          :department, :external_protocol, :internal_due_date, :dependency_note, :follow_up_days,
          :next_action, :next_action_date, :closed_at, :result, :closure_confirmed, :support_link, :geo_lat, :geo_lng,
          0, 0, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabinete.id,
      contact_id: contactId,
      number,
      opened_at: followUpPlan.openedAt,
      channel: body.channel,
      status: body.status,
      priority: body.priority || "Normal",
      tags: body.tags ?? "",
      demand_title: body.demand_title,
      demand_category: body.demand_category ?? "",
      description: body.description ?? "",
      current_guidance: body.current_guidance ?? "",
      assigned_user_id: assignedUserId,
      department: body.department ?? "",
      external_protocol: body.external_protocol ?? "",
      internal_due_date: body.internal_due_date ?? "",
      dependency_note: body.dependency_note ?? "",
      follow_up_days: followUpPlan.followUpDays,
      next_action: followUpPlan.nextAction,
      next_action_date: followUpPlan.nextActionDate,
      closed_at: closedAt,
      result: body.result ?? "",
      closure_confirmed: finalStatus ? toFlag(body.closure_confirmed) : 0,
      support_link: body.support_link ?? "",
      geo_lat: body.geo_lat ?? "",
      geo_lng: body.geo_lng ?? "",
      created_at: timestamp,
      updated_at: timestamp,
    });

    const ticketId = Number(result.lastInsertRowid);
    try {
      storeTicketImageUploads(gabinete.id, contactId, ticketId, ticketImageUploads);
    } catch (error) {
      try {
        deleteTicket(gabinete.id, ticketId);
      } catch {}
      return sendJson(res, { error: error?.message || "Nao foi possivel guardar os anexos." }, 422);
    }
    insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
      action_type: "Criacao",
      text: finalStatus && String(body.result || "").trim()
        ? `Orientacao final: ${String(body.result || "").trim()}`
        : "Atendimento criado.",
      previous_status: "",
      new_status: body.status,
      next_action: followUpPlan.nextAction,
      next_action_date: followUpPlan.nextActionDate,
    });
    refreshContactTicketDates(gabinete.id, contactId);
    logAudit(gabinete.id, ctx.user.id, "create", "ticket", ticketId, null, {
      number,
      status: body.status,
      demand_title: body.demand_title,
    });
    createNotificationForEntity(gabinete.id, assignedUserId, {
      title: "Atendimento atribuido",
      message: `Voce recebeu o atendimento ${number}.`,
      kind: "assignment",
      entity_type: "ticket",
      entity_id: ticketId,
    });

    return sendJson(res, { ticket: getScopedTicket(gabinete.id, ticketId) }, 201);
  }

  if (pathname === "/api/tickets/bulk/delete" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const ids = normalizeBulkIds(body.ids);
    if (!ids.length) return sendJson(res, { error: "Selecione pelo menos 1 atendimento." }, 422);
    const tickets = listScopedTicketsByIds(gabinete.id, ids);
    if (!tickets.length) return sendJson(res, { error: "Nenhum atendimento encontrado para exclusao." }, 404);
    const deletedCount = moveRowsToTrash(gabinete.id, "tickets", tickets.map((ticket) => ticket.id), ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "ticket", null, tickets, {
      ticket_ids: tickets.map((ticket) => ticket.id),
      deleted_count: deletedCount,
    });
    return sendJson(res, { deleted_count: deletedCount, moved_count: deletedCount });
  }

  if (pathname === "/api/tickets/bulk/finalize" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const ids = normalizeBulkIds(body.ids);
    const resultText = String(body.result || "").trim().slice(0, 1600);
    const closedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(body.closed_at || ""))
      ? String(body.closed_at)
      : currentDate();
    if (!ids.length) return sendJson(res, { error: "Selecione pelo menos 1 atendimento." }, 422);
    if (!resultText) return sendJson(res, { error: "Informe a orientacao final para encerrar os atendimentos." }, 422);
    const tickets = listScopedTicketsByIds(gabinete.id, ids);
    if (!tickets.length) return sendJson(res, { error: "Nenhum atendimento encontrado para finalizar." }, 404);

    const finalStatus =
      listStatuses(gabinete.id).find((item) => normalizePlainText(item.name) === "finalizado")
      || listStatuses(gabinete.id).find((item) => item.is_final)
      || { name: "Finalizado" };
    const ticketsToFinalize = tickets.filter((ticket) => !ticket.closed_at && !isTicketFinalStatus(gabinete.id, ticket.status));
    const skippedClosedCount = tickets.length - ticketsToFinalize.length;
    const timestamp = nowIso();

    try {
      db.exec("BEGIN");
      ticketsToFinalize.forEach((ticket) => {
        db.prepare(
          `
            UPDATE tickets
            SET status = :status,
                closed_at = :closed_at,
                result = :result,
                closure_confirmed = 1,
                next_action = '',
                next_action_date = '',
                updated_at = :updated_at
            WHERE gabinete_id = :gabinete_id AND id = :id
          `,
        ).run({
          gabinete_id: gabinete.id,
          id: ticket.id,
          status: finalStatus.name,
          closed_at: closedAt,
          result: resultText,
          updated_at: timestamp,
        });
        insertTicketHistory(gabinete.id, ticket.id, ctx.user.id, {
          action_type: "Orientacao final",
          text: `Orientacao final: ${resultText}`,
          previous_status: ticket.status,
          new_status: finalStatus.name,
          next_action: "",
          next_action_date: "",
        });
      });
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      return sendJson(res, { error: error?.message || "Nao foi possivel finalizar os atendimentos." }, 422);
    }

    logAudit(gabinete.id, ctx.user.id, "bulk_finalize", "ticket", null, ticketsToFinalize, {
      ticket_ids: ticketsToFinalize.map((ticket) => ticket.id),
      finalized_count: ticketsToFinalize.length,
      skipped_closed_count: skippedClosedCount,
      closed_at: closedAt,
    });
    return sendJson(res, {
      finalized_count: ticketsToFinalize.length,
      skipped_closed_count: skippedClosedCount,
      status: finalStatus.name,
      closed_at: closedAt,
    });
  }

  const ticketNotesMatch = pathname.match(/^\/api\/tickets\/(\d+)\/notes$/);
  if (ticketNotesMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketNotesMatch[1]);
    const ticket = getScopedTicket(gabinete.id, ticketId);
    if (!ticket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);

    const body = await parseBody(req);
    const message = String(body.message || "").trim().slice(0, 1200);
    if (!message) {
      return sendJson(res, { error: "Escreva a nota antes de salvar." }, 422);
    }

    const publishOnline = toFlag(body.publish_online) === 1;
    if (publishOnline && (!ticket.public_tracking_enabled || !ticket.public_tracking_code)) {
      return sendJson(res, { error: "Ative o acompanhamento publico antes de publicar a nota online." }, 422);
    }

    const publicStatus = String(body.public_status || publicStatusFromTicket(ticket)).trim().slice(0, 80);
    const ticketWasClosed = Boolean(ticket.closed_at) || isTicketFinalStatus(gabinete.id, ticket.status);
    try {
      const timestamp = nowIso();
      db.exec("BEGIN");
      if (publishOnline) {
        createTicketPublicUpdate(gabinete.id, ticketId, ctx.user.id, {
          public_status: publicStatus,
          message,
          channel: "portal",
        });
      }
      db.prepare(
        `
          UPDATE tickets
          SET updated_at = :updated_at
          WHERE gabinete_id = :gabinete_id AND id = :ticket_id
        `,
      ).run({
        gabinete_id: gabinete.id,
        ticket_id: ticketId,
        updated_at: timestamp,
      });
      insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
        action_type: publishOnline ? "Nota publica" : "Nota interna",
        text: message,
        previous_status: ticket.status,
        new_status: ticket.status,
        next_action: ticket.next_action,
        next_action_date: ticket.next_action_date,
        is_internal: publishOnline ? 0 : 1,
        public_visible: publishOnline ? 1 : 0,
        public_visible_by: ctx.user.id,
      });
      logAudit(gabinete.id, ctx.user.id, "create", "ticket_note", ticketId, null, {
        publish_online: publishOnline,
        public_status: publishOnline ? publicStatus : "",
      });
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      return sendJson(res, { error: error?.message || "Nao foi possivel registrar a nota." }, 422);
    }

    const updatedTicket = getScopedTicket(gabinete.id, ticketId);
    return sendJson(res, {
      ticket: updatedTicket,
      history: getTicketHistory(gabinete.id, ticketId),
      public_updates: listTicketPublicUpdates(gabinete.id, ticketId),
      tracking: serializeTicketPublicTracking(updatedTicket, req),
      ticket_was_closed: ticketWasClosed,
    });
  }

  const ticketHistoryMatch = pathname.match(/^\/api\/tickets\/(\d+)\/history\/(\d+)$/);
  if (ticketHistoryMatch && (req.method === "PATCH" || req.method === "DELETE")) {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketHistoryMatch[1]);
    const historyId = Number(ticketHistoryMatch[2]);
    const ticket = getScopedTicket(gabinete.id, ticketId);
    if (!ticket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);

    const historyItem = db
      .prepare(
        `
          SELECT *
          FROM ticket_history
          WHERE gabinete_id = :gabinete_id AND ticket_id = :ticket_id AND id = :id
        `,
      )
      .get({
        gabinete_id: gabinete.id,
        ticket_id: ticketId,
        id: historyId,
      });
    if (!historyItem) return sendJson(res, { error: "Registro nao encontrado." }, 404);
    const normalizedAction = normalizePlainText(historyItem.action_type || "");
    const isNoteHistory = normalizedAction.includes("nota");

    if (req.method === "DELETE") {
      try {
        db.exec("BEGIN");
        const publicUpdate = findTicketPublicUpdateForHistory(gabinete.id, historyItem);
        if (publicUpdate) {
          moveRowsToTrash(gabinete.id, "ticket_public_updates", [publicUpdate.id], ctx.user.id, "Nota apagada no atendimento.");
        }
        moveRowsToTrash(gabinete.id, "ticket_history", [historyId], ctx.user.id, "Nota apagada no atendimento.");
        db.prepare(
          `
            UPDATE tickets
            SET updated_at = :updated_at
            WHERE gabinete_id = :gabinete_id AND id = :ticket_id
          `,
        ).run({
          gabinete_id: gabinete.id,
          ticket_id: ticketId,
          updated_at: nowIso(),
        });
        logAudit(gabinete.id, ctx.user.id, "delete", isNoteHistory ? "ticket_note" : "ticket_history", historyId, historyItem, null);
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {}
        return sendJson(res, { error: error?.message || "Nao foi possivel excluir a nota." }, 422);
      }

      const updatedTicket = getScopedTicket(gabinete.id, ticketId);
      return sendJson(res, {
        ticket: updatedTicket,
        history: getTicketHistory(gabinete.id, ticketId),
        public_updates: listTicketPublicUpdates(gabinete.id, ticketId),
        tracking: serializeTicketPublicTracking(updatedTicket, req),
      });
    }

    const body = await parseBody(req);
    const hasText = Object.prototype.hasOwnProperty.call(body, "text");
    const hasVisibility = Object.prototype.hasOwnProperty.call(body, "visibility");
    if (hasText && !isNoteHistory) {
      return sendJson(res, { error: "Apenas notas podem ter o texto editado por aqui." }, 422);
    }
    const nextText = hasText ? String(body.text || "").trim().slice(0, 1200) : String(historyItem.text || "");
    if (hasText && !nextText) {
      return sendJson(res, { error: "Escreva a nota antes de salvar." }, 422);
    }
    const currentVisibility = normalizedAction.includes("public") || toFlag(historyItem.public_visible) === 1 ? "public" : "internal";
    const nextVisibility = hasVisibility
      ? body.visibility === "public"
        ? "public"
        : "internal"
      : currentVisibility;
    if (nextVisibility === "public" && (!ticket.public_tracking_enabled || !ticket.public_tracking_code)) {
      return sendJson(res, { error: "Ative o acompanhamento publico antes de publicar este item online." }, 422);
    }
    const publicStatus = String(body.public_status || publicStatusFromTicket(ticket)).trim().slice(0, 80);
    const publicMessage = ticketHistoryPublicMessage(historyItem, nextText);
    if (nextVisibility === "public" && !publicMessage) {
      return sendJson(res, { error: "Este item nao tem texto para publicar online." }, 422);
    }

    try {
      db.exec("BEGIN");
      const publicUpdate = findTicketPublicUpdateForHistory(gabinete.id, historyItem);
      if (nextVisibility === "public") {
        if (publicUpdate) {
          const timestamp = nowIso();
          db.prepare(
            `
              UPDATE ticket_public_updates
              SET message = :message,
                  public_status = :public_status
              WHERE gabinete_id = :gabinete_id AND id = :id
            `,
          ).run({
            gabinete_id: gabinete.id,
            id: publicUpdate.id,
            message: publicMessage,
            public_status: publicStatus,
          });
          db.prepare(
            `
              UPDATE tickets
              SET public_status = COALESCE(NULLIF(:public_status, ''), public_status),
                  public_last_update_at = :public_last_update_at,
                  public_updated_at = :public_updated_at,
                  updated_at = :updated_at
              WHERE gabinete_id = :gabinete_id AND id = :ticket_id
            `,
          ).run({
            gabinete_id: gabinete.id,
            ticket_id: ticketId,
            public_status: publicStatus,
            public_last_update_at: timestamp,
            public_updated_at: timestamp,
            updated_at: timestamp,
          });
        } else {
          createTicketPublicUpdate(gabinete.id, ticketId, ctx.user.id, {
            public_status: publicStatus,
            message: publicMessage,
            channel: "portal",
            source_type: "ticket_history",
            source_id: historyId,
          });
        }
      } else if (publicUpdate) {
        db.prepare("DELETE FROM ticket_public_updates WHERE gabinete_id = :gabinete_id AND id = :id").run({
          gabinete_id: gabinete.id,
          id: publicUpdate.id,
        });
      }

      db.prepare(
        `
          UPDATE ticket_history
          SET action_type = :action_type,
              text = :text,
              is_internal = :is_internal,
              public_visible = :public_visible,
              public_visible_at = :public_visible_at,
              public_visible_by = :public_visible_by
          WHERE gabinete_id = :gabinete_id AND ticket_id = :ticket_id AND id = :id
        `,
      ).run({
        gabinete_id: gabinete.id,
        ticket_id: ticketId,
        id: historyId,
        action_type: isNoteHistory ? (nextVisibility === "public" ? "Nota publica" : "Nota interna") : historyItem.action_type,
        text: nextText,
        is_internal: nextVisibility === "public" ? 0 : 1,
        public_visible: nextVisibility === "public" ? 1 : 0,
        public_visible_at: nextVisibility === "public" ? nowIso() : "",
        public_visible_by: nextVisibility === "public" ? ctx.user.id : null,
      });
      db.prepare(
        `
          UPDATE tickets
          SET updated_at = :updated_at
          WHERE gabinete_id = :gabinete_id AND id = :ticket_id
        `,
      ).run({
        gabinete_id: gabinete.id,
        ticket_id: ticketId,
        updated_at: nowIso(),
      });
      logAudit(gabinete.id, ctx.user.id, "update", "ticket_note", historyId, historyItem, {
        visibility: nextVisibility,
        text_changed: hasText,
      });
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      return sendJson(res, { error: error?.message || "Nao foi possivel atualizar a nota." }, 422);
    }

    const updatedTicket = getScopedTicket(gabinete.id, ticketId);
    return sendJson(res, {
      ticket: updatedTicket,
      history: getTicketHistory(gabinete.id, ticketId),
      public_updates: listTicketPublicUpdates(gabinete.id, ticketId),
      tracking: serializeTicketPublicTracking(updatedTicket, req),
    });
  }

  const ticketPublicTrackingEnableMatch = pathname.match(/^\/api\/tickets\/(\d+)\/public-tracking\/enable$/);
  if (ticketPublicTrackingEnableMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketPublicTrackingEnableMatch[1]);
    try {
      const ticket = enableTicketPublicTracking(gabinete.id, ticketId, ctx.user.id);
      insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
        action_type: "Acompanhamento publico",
        text: "Acompanhamento publico ativado.",
        previous_status: "",
        new_status: ticket.status,
        next_action: ticket.next_action,
        next_action_date: ticket.next_action_date,
      });
      logAudit(gabinete.id, ctx.user.id, "enable", "public_tracking", ticketId, null, {
        public_tracking_code: ticket.public_tracking_code,
      });
      return sendJson(res, {
        ticket: getScopedTicket(gabinete.id, ticketId),
        tracking: serializeTicketPublicTracking(ticket, req, ticket.access_code),
        public_updates: listTicketPublicUpdates(gabinete.id, ticketId),
      });
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel ativar o acompanhamento." }, 422);
    }
  }

  const ticketPublicTrackingSecretMatch = pathname.match(/^\/api\/tickets\/(\d+)\/public-tracking\/senha$/);
  if (ticketPublicTrackingSecretMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketPublicTrackingSecretMatch[1]);
    const ticket = getScopedTicket(gabinete.id, ticketId);
    if (!ticket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);
    if (!ticket.public_tracking_enabled || !ticket.public_tracking_code) {
      return sendJson(res, { error: "Ative o acompanhamento publico antes de gerar senha." }, 422);
    }
    if (Number(ticket.public_tracking_secret_generation_count || 0) >= PUBLIC_SHARE_MAX_GENERATIONS) {
      return sendJson(res, { error: `Limite de ${PUBLIC_SHARE_MAX_GENERATIONS} geracoes de senha atingido para este atendimento.` }, 422);
    }
    const accessCode = generatePublicTrackingAccessCode();
    db.prepare(
      `
        UPDATE tickets
        SET public_tracking_secret_hash = :public_tracking_secret_hash,
            public_tracking_secret_hint = :public_tracking_secret_hint,
            public_updated_at = :public_updated_at,
            public_tracking_failed_attempts = 0,
            public_tracking_secret_generation_count = COALESCE(public_tracking_secret_generation_count, 0) + 1,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :ticket_id
      `,
    ).run({
      gabinete_id: gabinete.id,
      ticket_id: ticketId,
      public_tracking_secret_hash: hashPassword(accessCode),
      public_tracking_secret_hint: `final ${accessCode.slice(-2)}`,
      public_updated_at: nowIso(),
      updated_at: nowIso(),
    });
    insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
      action_type: "Acompanhamento publico",
      text: "Nova senha de acompanhamento gerada.",
      previous_status: "",
      new_status: ticket.status,
      next_action: ticket.next_action,
      next_action_date: ticket.next_action_date,
    });
    logAudit(gabinete.id, ctx.user.id, "rotate_secret", "public_tracking", ticketId, null, {
      public_tracking_code: ticket.public_tracking_code,
    });
    const updatedTicket = getScopedTicket(gabinete.id, ticketId);
    return sendJson(res, {
      ticket: updatedTicket,
      tracking: serializeTicketPublicTracking(updatedTicket, req, accessCode),
      public_updates: listTicketPublicUpdates(gabinete.id, ticketId),
    });
  }

  const ticketPublicTrackingMatch = pathname.match(/^\/api\/tickets\/(\d+)\/public-tracking$/);
  if (ticketPublicTrackingMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketPublicTrackingMatch[1]);
    const ticket = getScopedTicket(gabinete.id, ticketId);
    if (!ticket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);
    const body = await parseBody(req);
    const enabled = body.enabled === undefined ? Boolean(ticket.public_tracking_enabled) : toFlag(body.enabled);
    const publicStatus = String(body.public_status || ticket.public_status || "").trim().slice(0, 80);
    db.prepare(
      `
        UPDATE tickets
        SET public_tracking_enabled = :public_tracking_enabled,
            public_status = :public_status,
            public_updated_at = :public_updated_at,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :ticket_id
      `,
    ).run({
      gabinete_id: gabinete.id,
      ticket_id: ticketId,
      public_tracking_enabled: enabled,
      public_status: publicStatus,
      public_updated_at: nowIso(),
      updated_at: nowIso(),
    });
    if (Boolean(ticket.public_tracking_enabled) !== Boolean(enabled)) {
      insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
        action_type: "Acompanhamento publico",
        text: enabled ? "Acompanhamento publico ativado." : "Acompanhamento publico desativado.",
        previous_status: "",
        new_status: ticket.status,
        next_action: ticket.next_action,
        next_action_date: ticket.next_action_date,
      });
    }
    logAudit(gabinete.id, ctx.user.id, "update", "public_tracking", ticketId, ticket, {
      enabled,
      public_status: publicStatus,
    });
    const updatedTicket = getScopedTicket(gabinete.id, ticketId);
    return sendJson(res, {
      ticket: updatedTicket,
      history: getTicketHistory(gabinete.id, ticketId),
      tracking: serializeTicketPublicTracking(updatedTicket, req),
      public_updates: listTicketPublicUpdates(gabinete.id, ticketId),
    });
  }

  const ticketPublicUpdatesMatch = pathname.match(/^\/api\/tickets\/(\d+)\/public-updates$/);
  if (ticketPublicUpdatesMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketPublicUpdatesMatch[1]);
    const ticket = getScopedTicket(gabinete.id, ticketId);
    if (!ticket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);
    if (!ticket.public_tracking_enabled || !ticket.public_tracking_code) {
      return sendJson(res, { error: "Ative o acompanhamento publico antes de publicar atualizacao." }, 422);
    }
    const body = await parseBody(req);
    try {
      createTicketPublicUpdate(gabinete.id, ticketId, ctx.user.id, {
        public_status: body.public_status || publicStatusFromTicket(ticket),
        message: body.message,
        channel: "portal",
      });
      insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
        action_type: "Atualizacao publica",
        text: String(body.message || "").trim(),
        previous_status: "",
        new_status: body.public_status || ticket.status,
        next_action: ticket.next_action,
        next_action_date: ticket.next_action_date,
      });
      logAudit(gabinete.id, ctx.user.id, "publish", "ticket_public_update", ticketId, null, {
        public_status: body.public_status || "",
      });
      const updatedTicket = getScopedTicket(gabinete.id, ticketId);
      return sendJson(res, {
        ticket: updatedTicket,
        tracking: serializeTicketPublicTracking(updatedTicket, req),
        public_updates: listTicketPublicUpdates(gabinete.id, ticketId),
      });
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel publicar a atualizacao." }, 422);
    }
  }

  const ticketArchiveMatch = pathname.match(/^\/api\/tickets\/(\d+)\/archive$/);
  if (ticketArchiveMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketArchiveMatch[1]);
    const currentTicket = getScopedTicket(gabinete.id, ticketId);
    if (!currentTicket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);
    const body = await parseBody(req);
    const archived = toFlag(body.archived ?? true);
    archiveTicket(gabinete.id, ticketId, archived);
    insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
      action_type: archived ? "Arquivamento" : "Reativacao",
      text: archived ? "Atendimento arquivado." : "Atendimento reativado.",
      previous_status: currentTicket.status,
      new_status: currentTicket.status,
      next_action: currentTicket.next_action,
      next_action_date: currentTicket.next_action_date,
    });
    logAudit(gabinete.id, ctx.user.id, archived ? "archive" : "unarchive", "ticket", ticketId, currentTicket, { archived });
    return sendJson(res, { ticket: getScopedTicket(gabinete.id, ticketId) });
  }

  const ticketFilesMatch = pathname.match(/^\/api\/tickets\/(\d+)\/files$/);
  if (ticketFilesMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketFilesMatch[1]);
    const currentTicket = getScopedTicket(gabinete.id, ticketId);
    if (!currentTicket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);
    const ticketWasClosed = Boolean(currentTicket.closed_at) || isTicketFinalStatus(gabinete.id, currentTicket.status);

    const body = await parseBody(req);
    let uploads = [];
    try {
      uploads = prepareTicketImageUploads(body.ticket_images || body.files || []);
      storeTicketImageUploads(gabinete.id, currentTicket.contact_id, ticketId, uploads);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel guardar os anexos." }, 422);
    }

    if (uploads.length) {
      const timestamp = nowIso();
      insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
        action_type: "Anexo",
        text: uploads.length === 1 ? "Anexo adicionado." : `${uploads.length} anexos adicionados.`,
        previous_status: currentTicket.status,
        new_status: currentTicket.status,
        next_action: currentTicket.next_action,
        next_action_date: currentTicket.next_action_date,
      });
      db.prepare("UPDATE tickets SET updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND id = :id")
        .run({ gabinete_id: gabinete.id, id: ticketId, updated_at: timestamp });
    }

    logAudit(gabinete.id, ctx.user.id, "upload_files", "ticket", ticketId, currentTicket, {
      count: uploads.length,
    });
    const updatedTicket = getScopedTicket(gabinete.id, ticketId);
    return sendJson(res, {
      ticket: updatedTicket,
      history: getTicketHistory(gabinete.id, ticketId),
      files: listTicketFiles(gabinete.id, ticketId, TICKET_IMAGE_MAX_FILES),
      ticket_was_closed: uploads.length ? ticketWasClosed : false,
    });
  }

  const ticketFileVisibilityMatch = pathname.match(/^\/api\/tickets\/(\d+)\/files\/(\d+)$/);
  if (ticketFileVisibilityMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketFileVisibilityMatch[1]);
    const fileId = Number(ticketFileVisibilityMatch[2]);
    const ticket = getScopedTicket(gabinete.id, ticketId);
    if (!ticket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);
    const file = db
      .prepare(
        `
          SELECT *
          FROM contact_files
          WHERE gabinete_id = :gabinete_id
            AND id = :id
            AND source = :source
          LIMIT 1
        `,
      )
      .get({
        gabinete_id: gabinete.id,
        id: fileId,
        source: `ticket:${ticketId}`,
      });
    if (!file) return sendJson(res, { error: "Anexo nao encontrado." }, 404);

    const body = await parseBody(req);
    const publicVisible = toFlag(body.public_visible ?? body.online ?? body.visible);
    if (publicVisible && (!ticket.public_tracking_enabled || !ticket.public_tracking_code)) {
      return sendJson(res, { error: "Ative o acompanhamento publico antes de publicar o anexo online." }, 422);
    }

    const timestamp = nowIso();
    try {
      db.exec("BEGIN");
      db.prepare(
        `
          UPDATE contact_files
          SET public_visible = :public_visible,
              public_visible_at = CASE WHEN :public_visible = 1 THEN :public_visible_at ELSE '' END,
              public_visible_by = CASE WHEN :public_visible = 1 THEN :public_visible_by ELSE NULL END
          WHERE gabinete_id = :gabinete_id AND id = :id
        `,
      ).run({
        gabinete_id: gabinete.id,
        id: fileId,
        public_visible: publicVisible ? 1 : 0,
        public_visible_at: timestamp,
        public_visible_by: ctx.user.id,
      });
      db.prepare(
        `
          UPDATE tickets
          SET public_last_update_at = CASE
                WHEN :public_visible = 1 THEN :public_last_update_at
                ELSE public_last_update_at
              END,
              public_updated_at = CASE
                WHEN :has_public_tracking = 1 THEN :updated_at
                ELSE public_updated_at
              END,
              updated_at = :updated_at
          WHERE gabinete_id = :gabinete_id AND id = :ticket_id
        `,
      ).run({
        gabinete_id: gabinete.id,
        ticket_id: ticketId,
        public_visible: publicVisible ? 1 : 0,
        public_last_update_at: timestamp,
        has_public_tracking: ticket.public_tracking_enabled ? 1 : 0,
        updated_at: timestamp,
      });
      logAudit(gabinete.id, ctx.user.id, "update", "ticket_file", fileId, file, {
        public_visible: publicVisible ? 1 : 0,
      });
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      return sendJson(res, { error: error?.message || "Nao foi possivel atualizar o anexo." }, 422);
    }

    const updatedTicket = getScopedTicket(gabinete.id, ticketId);
    return sendJson(res, {
      ticket: updatedTicket,
      files: listTicketFiles(gabinete.id, ticketId, TICKET_IMAGE_MAX_FILES),
      public_updates: listTicketPublicUpdates(gabinete.id, ticketId),
      tracking: serializeTicketPublicTracking(updatedTicket, req),
    });
  }

  const ticketMatch = pathname.match(/^\/api\/tickets\/(\d+)$/);
  if (ticketMatch && req.method === "GET") {
    const ticket = getScopedTicket(gabinete.id, Number(ticketMatch[1]));
    if (!ticket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);
    const publicTracking = serializeTicketPublicTracking(ticket, req);
    return sendJson(res, {
      ticket: withStatusColors([ticket], gabinete.id)[0],
      history: getTicketHistory(gabinete.id, ticket.id),
      public_updates: listTicketPublicUpdates(gabinete.id, ticket.id),
      public_tracking: publicTracking,
      tracking: publicTracking,
      documents: listDocuments(gabinete.id, { q: ticket.number }).filter((item) => item.ticket_id === ticket.id),
      files: listTicketFiles(gabinete.id, ticket.id, TICKET_IMAGE_MAX_FILES),
      tasks: listTasks(gabinete.id).filter((item) => item.ticket_id === ticket.id).slice(0, 20),
      call_logs: listCallLogs(gabinete.id, { ticket_id: ticket.id }).slice(0, 20),
      email_messages: listEmailMessages(gabinete.id, { ticket_id: ticket.id, limit: 8 }),
    });
  }

  if (ticketMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketMatch[1]);
    const currentTicket = getScopedTicket(gabinete.id, ticketId);
    if (!currentTicket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);

    const body = ensureTicketLookupValues(gabinete.id, await parseBody(req));
    let ticketImageUploads = [];
    try {
      ticketImageUploads = prepareTicketImageUploads(body.ticket_images);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel anexar os arquivos." }, 422);
    }
    const error =
        validateTicketForm({ ...body, _is_final_status: isTicketFinalStatus(gabinete.id, body.status) })
      || validateScopedReferences(gabinete.id, body, [
        { field: "contact_id", table: "contacts", label: "Contato" },
        { field: "assigned_user_id", table: "users", label: "Responsavel" },
      ]);
    if (error) return sendJson(res, { error }, 422);

    const contactId = upsertContactFromTicketBody(gabinete.id, body);
    const finalStatus = isTicketFinalStatus(gabinete.id, body.status);
    const followUpPlan = resolveTicketFollowUpPlan(gabinete.id, body, currentTicket);
    const closedAt = finalStatus ? body.closed_at || currentTicket.closed_at || currentDate() : "";
    const wasFinalStatus = Boolean(currentTicket.closed_at) || isTicketFinalStatus(gabinete.id, currentTicket.status);
    const statusChanged = normalizePlainText(currentTicket.status) !== normalizePlainText(body.status);
    const reopenNote = String(body.reopen_note || "").trim().slice(0, 1200);
    const reopenDate = String(body.reopen_date || "").trim().slice(0, 10);
    const reopenHistoryCreatedAt =
      wasFinalStatus && !finalStatus && statusChanged && /^\d{4}-\d{2}-\d{2}$/.test(reopenDate)
        ? `${reopenDate}T12:00:00`
        : undefined;

    db.prepare(
      `
        UPDATE tickets
        SET contact_id = :contact_id,
          opened_at = :opened_at,
            channel = :channel,
            status = :status,
            priority = :priority,
            tags = :tags,
            demand_title = :demand_title,
            demand_category = :demand_category,
            description = :description,
            current_guidance = :current_guidance,
            assigned_user_id = :assigned_user_id,
            department = :department,
            external_protocol = :external_protocol,
            internal_due_date = :internal_due_date,
            dependency_note = :dependency_note,
            follow_up_days = :follow_up_days,
            next_action = :next_action,
            next_action_date = :next_action_date,
            closed_at = :closed_at,
            result = :result,
            closure_confirmed = :closure_confirmed,
            support_link = :support_link,
            geo_lat = :geo_lat,
            geo_lng = :geo_lng,
            updated_at = :updated_at
        WHERE id = :id AND gabinete_id = :gabinete_id
      `,
    ).run({
      id: ticketId,
      gabinete_id: gabinete.id,
      contact_id: contactId,
      opened_at: followUpPlan.openedAt,
      channel: body.channel,
      status: body.status,
      priority: body.priority || "Normal",
      tags: body.tags ?? "",
      demand_title: body.demand_title,
      demand_category: body.demand_category ?? "",
      description: body.description ?? "",
      current_guidance: body.current_guidance ?? "",
      assigned_user_id: scopedReferenceId(gabinete.id, "users", body.assigned_user_id),
      department: body.department ?? "",
      external_protocol: body.external_protocol ?? "",
      internal_due_date: body.internal_due_date ?? "",
      dependency_note: body.dependency_note ?? "",
      follow_up_days: followUpPlan.followUpDays,
      next_action: followUpPlan.nextAction,
      next_action_date: followUpPlan.nextActionDate,
      closed_at: closedAt,
      result: body.result ?? "",
      closure_confirmed: finalStatus ? toFlag(body.closure_confirmed) : 0,
      support_link: body.support_link ?? "",
      geo_lat: body.geo_lat ?? "",
      geo_lng: body.geo_lng ?? "",
      updated_at: nowIso(),
    });

    insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
      action_type: finalStatus && String(body.result || "").trim()
        ? "Orientacao final"
        : wasFinalStatus && !finalStatus && statusChanged
          ? "Reabertura"
          : statusChanged
            ? "Status alterado"
            : "Atualizacao",
      text: finalStatus && String(body.result || "").trim()
        ? `Orientacao final: ${String(body.result || "").trim()}`
        : wasFinalStatus && !finalStatus && statusChanged
          ? (reopenNote || "Atendimento aberto novamente.")
          : statusChanged
            ? `Status alterado de ${currentTicket.status || "sem status"} para ${body.status || "sem status"}.`
            : "Atendimento atualizado.",
      previous_status: currentTicket.status,
      new_status: body.status,
      next_action: followUpPlan.nextAction,
      next_action_date: followUpPlan.nextActionDate,
      created_at: reopenHistoryCreatedAt,
    });
    refreshContactTicketDates(gabinete.id, contactId);
    logAudit(gabinete.id, ctx.user.id, "update", "ticket", ticketId, currentTicket, body);
    try {
      storeTicketImageUploads(gabinete.id, contactId, ticketId, ticketImageUploads);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel guardar os anexos." }, 422);
    }

    return sendJson(res, { ticket: getScopedTicket(gabinete.id, ticketId) });
  }

  if (ticketMatch && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const ticketId = Number(ticketMatch[1]);
    const currentTicket = getScopedTicket(gabinete.id, ticketId);
    if (!currentTicket) return sendJson(res, { error: "Atendimento nao encontrado." }, 404);

    const movedCount = moveRowsToTrash(gabinete.id, "tickets", [ticketId], ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "ticket", ticketId, currentTicket, null);
    return sendJson(res, { ok: true, moved_count: movedCount });
  }

  const entityShareMatch = pathname.match(/^\/api\/share\/([a-z-]+)\/(\d+)$/);
  if (entityShareMatch && req.method === "GET") {
    const entityType = normalizePublicEntityType(entityShareMatch[1]);
    const entityId = Number(entityShareMatch[2]);
    if (!entityType) return sendJson(res, { error: "Tipo de compartilhamento invalido." }, 404);
    const entity = getScopedShareEntity(gabinete.id, entityType, entityId);
    if (!entity) return sendJson(res, { error: "Registro nao encontrado." }, 404);
    return sendJson(res, {
      share: serializeInternalEntityShare(getEntityShareByEntity(gabinete.id, entityType, entityId), req),
    });
  }

  const entityShareEnableMatch = pathname.match(/^\/api\/share\/([a-z-]+)\/(\d+)\/enable$/);
  if (entityShareEnableMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entityType = normalizePublicEntityType(entityShareEnableMatch[1]);
    const entityId = Number(entityShareEnableMatch[2]);
    if (!entityType) return sendJson(res, { error: "Tipo de compartilhamento invalido." }, 404);
    const body = await parseBody(req);
    try {
      const share = enableEntityPublicShare(gabinete.id, entityType, entityId, ctx.user.id, body);
      logAudit(gabinete.id, ctx.user.id, "enable", `${entityType}_public_share`, entityId, null, {
        share_code: share.share_code,
        mode: share.share_mode,
        access_level: share.access_level,
      });
      return sendJson(res, { share: serializeInternalEntityShare(share, req, share.access_code) });
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel criar o link." }, 422);
    }
  }

  const entityShareNewLinkMatch = pathname.match(/^\/api\/share\/([a-z-]+)\/(\d+)\/novo-link$/);
  if (entityShareNewLinkMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entityType = normalizePublicEntityType(entityShareNewLinkMatch[1]);
    const entityId = Number(entityShareNewLinkMatch[2]);
    if (!entityType) return sendJson(res, { error: "Tipo de compartilhamento invalido." }, 404);
    const body = await parseBody(req);
    try {
      const share = enableEntityPublicShare(gabinete.id, entityType, entityId, ctx.user.id, { ...body, regenerate: true });
      logAudit(gabinete.id, ctx.user.id, "new_link", `${entityType}_public_share`, entityId, null, {
        share_code: share.share_code,
        mode: share.share_mode,
        access_level: share.access_level,
      });
      return sendJson(res, { share: serializeInternalEntityShare(share, req, share.access_code) });
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel gerar novo link." }, 422);
    }
  }

  const entityShareSecretMatch = pathname.match(/^\/api\/share\/([a-z-]+)\/(\d+)\/senha$/);
  if (entityShareSecretMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entityType = normalizePublicEntityType(entityShareSecretMatch[1]);
    const entityId = Number(entityShareSecretMatch[2]);
    if (!entityType) return sendJson(res, { error: "Tipo de compartilhamento invalido." }, 404);
    const share = getEntityShareByEntity(gabinete.id, entityType, entityId);
    if (!share?.enabled || !share.share_code) {
      return sendJson(res, { error: "Crie o link antes de gerar uma nova senha." }, 422);
    }
    if (Number(share.secret_generation_count || 0) >= PUBLIC_SHARE_MAX_GENERATIONS) {
      return sendJson(res, { error: `Limite de ${PUBLIC_SHARE_MAX_GENERATIONS} geracoes de senha atingido para este registro.` }, 422);
    }
    const accessCode = generatePublicTrackingAccessCode();
    db.prepare(
      `
        UPDATE public_entity_shares
        SET secret_hash = :secret_hash,
            secret_hint = :secret_hint,
            failed_access_count = 0,
            secret_generation_count = COALESCE(secret_generation_count, 0) + 1,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    ).run({
      gabinete_id: gabinete.id,
      id: share.id,
      secret_hash: hashPassword(accessCode),
      secret_hint: `final ${accessCode.slice(-2)}`,
      updated_at: nowIso(),
    });
    const updatedShare = getEntityShareByEntity(gabinete.id, entityType, entityId);
    logAudit(gabinete.id, ctx.user.id, "rotate_secret", `${entityType}_public_share`, entityId, null, {
      share_code: updatedShare.share_code,
    });
    return sendJson(res, { share: serializeInternalEntityShare(updatedShare, req, accessCode) });
  }

  if (entityShareMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entityType = normalizePublicEntityType(entityShareMatch[1]);
    const entityId = Number(entityShareMatch[2]);
    if (!entityType) return sendJson(res, { error: "Tipo de compartilhamento invalido." }, 404);
    const share = getEntityShareByEntity(gabinete.id, entityType, entityId);
    if (!share) return sendJson(res, { error: "Link nao encontrado." }, 404);
    const body = await parseBody(req);
    const enabled = body.enabled === undefined ? Boolean(share.enabled) : toFlag(body.enabled);
    db.prepare(
      `
        UPDATE public_entity_shares
        SET enabled = :enabled,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    ).run({
      gabinete_id: gabinete.id,
      id: share.id,
      enabled,
      updated_at: nowIso(),
    });
    const updatedShare = getEntityShareByEntity(gabinete.id, entityType, entityId);
    logAudit(gabinete.id, ctx.user.id, "update", `${entityType}_public_share`, entityId, share, { enabled });
    return sendJson(res, {
      share: serializeInternalEntityShare(updatedShare, req),
    });
  }

	  if (pathname === "/api/users" && req.method === "GET") {
	    if (!ensureApiCanManageUsers(ctx, res)) return;
	    return sendJson(res, {
	      items: listUsersByGabinete(gabinete.id).map((item) => {
	        const moduleAccess = buildUserModuleAccess(item, gabinete);
	        return {
	          id: item.id,
	          name: item.name,
	          username: item.username,
	          email: item.email,
	          phone: item.phone,
	          avatar_url: item.avatar_url,
	          role: item.role,
	          role_label: getRoleLabel(item.role),
	          module_access: moduleAccess,
	          workspace_module_preferences: normalizeWorkspaceModulePreferences(item.workspace_module_preferences),
	          last_login_at: item.last_login_at,
	          last_login_ip: item.last_login_ip,
	          last_login_provider: item.last_login_provider,
	        };
	      }),
	      default_gabinete_id: gabinete.id,
	    });
	  }

  if (pathname === "/api/users" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    const body = await parseBody(req);
    const targetGabineteId = ctx.user.role === "super_admin"
      ? parseInteger(body.gabinete_id, gabinete.id)
      : gabinete.id;
    const error = validateUserForm(
      { ...body, gabinete_id: targetGabineteId },
      ctx.user.role === "super_admin",
    );
    if (error) return sendJson(res, { error }, 422);
    if (!getGabineteById(targetGabineteId)) {
      return sendJson(res, { error: "Gabinete do novo usuario nao encontrado." }, 404);
    }

	    try {
	      const userId = createUserWithPassword(db, {
	        gabinete_id: targetGabineteId,
	        name: body.name,
        username: body.username,
        email: body.email,
        phone: body.phone,
	        role: body.role,
	        password: body.password,
	      });
	      const modulePermissions = normalizeUserModulePermissionPayload(body.module_permissions || body.module_access, body.role);
	      saveUserModulePermissions(targetGabineteId, userId, modulePermissions);
	      logAudit(gabinete.id, ctx.user.id, "create", "user", userId, null, {
	        name: body.name,
	        email: body.email,
	        role: body.role,
	        module_permissions: modulePermissions,
	      });
      return sendJson(res, { ok: true }, 201);
    } catch {
      return sendJson(
        res,
        { error: "Nao foi possivel criar o usuario. Verifique se usuario ou e-mail ja existem." },
        409,
      );
    }
  }

  if (pathname === "/api/calls" && req.method === "GET") {
    return sendJson(res, {
      items: listCallLogs(gabinete.id, {
        q: url.searchParams.get("q") ?? "",
        contact_id: url.searchParams.get("contact_id") ?? "",
        ticket_id: url.searchParams.get("ticket_id") ?? "",
      }),
      lookups: buildApiLookups(gabinete.id),
    });
  }

  if (pathname === "/api/calls" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const error =
      validateCallLogForm(body)
      || validateScopedReferences(gabinete.id, body, [
        { field: "contact_id", table: "contacts", label: "Contato" },
        { field: "ticket_id", table: "tickets", label: "Atendimento" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    const callLogId = createCallLog(gabinete.id, ctx.user.id, body);
    const callLog = getScopedCallLog(gabinete.id, callLogId);
    if (callLog?.ticket_id) {
      insertTicketHistory(gabinete.id, callLog.ticket_id, ctx.user.id, {
        action_type: "Ligação",
        text: buildCallLogHistoryText(callLog),
        previous_status: "",
        new_status: "",
        next_action: "",
        next_action_date: "",
      });
    }
    logAudit(gabinete.id, ctx.user.id, "create", "call_log", callLogId, null, body);
    return sendJson(res, { call_log: callLog }, 201);
  }

  const callLogMatch = pathname.match(/^\/api\/calls\/(\d+)$/);
  if (callLogMatch && req.method === "GET") {
    const callLog = getScopedCallLog(gabinete.id, Number(callLogMatch[1]));
    if (!callLog) return sendJson(res, { error: "Ligação não encontrada." }, 404);
    return sendJson(res, { call_log: callLog });
  }

  if (callLogMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const callLogId = Number(callLogMatch[1]);
    const current = getScopedCallLog(gabinete.id, callLogId);
    if (!current) return sendJson(res, { error: "Ligação não encontrada." }, 404);
    const body = await parseBody(req);
    const error =
      validateCallLogForm(body)
      || validateScopedReferences(gabinete.id, body, [
        { field: "contact_id", table: "contacts", label: "Contato" },
        { field: "ticket_id", table: "tickets", label: "Atendimento" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    updateCallLog(gabinete.id, callLogId, body);
    logAudit(gabinete.id, ctx.user.id, "update", "call_log", callLogId, current, body);
    return sendJson(res, { call_log: getScopedCallLog(gabinete.id, callLogId) });
  }

  if (callLogMatch && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const callLogId = Number(callLogMatch[1]);
    const current = getScopedCallLog(gabinete.id, callLogId);
    if (!current) return sendJson(res, { error: "Ligação não encontrada." }, 404);
    const movedCount = moveRowsToTrash(gabinete.id, "call_logs", [callLogId], ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "call_log", callLogId, current, null);
    return sendJson(res, { ok: true, moved_count: movedCount });
  }

  if (pathname === "/api/documents/draft" && req.method === "GET") {
    const linkedTicket = nullableInt(url.searchParams.get("ticket_id"))
      ? getScopedTicket(gabinete.id, Number(url.searchParams.get("ticket_id")))
      : null;
    const sourceDocument = nullableInt(url.searchParams.get("source_document_id"))
      ? getScopedDocument(gabinete.id, Number(url.searchParams.get("source_document_id")))
      : null;
    const template = nullableInt(url.searchParams.get("template_id"))
      ? getScopedDocumentTemplate(gabinete.id, Number(url.searchParams.get("template_id")))
      : null;
    const signatureProfile = listSignatureProfiles(gabinete.id)[0] || null;
    return sendJson(res, {
      draft: buildDocumentDraft({
        gabinete,
        linkedTicket,
        sourceDocument,
        template,
        signatureProfile,
      }),
    });
  }

  if (pathname === "/api/documents" && req.method === "GET") {
    return sendJson(res, {
      items: listDocuments(gabinete.id, {
        q: url.searchParams.get("q") ?? "",
        type: url.searchParams.get("type") ?? "",
        status: url.searchParams.get("status") ?? "",
        department: url.searchParams.get("department") ?? "",
      }),
      lookups: buildApiLookups(gabinete.id),
    });
  }

  if (pathname === "/api/documents" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const error =
      validateDocumentForm(body)
      || validateScopedReferences(gabinete.id, body, [
        { field: "ticket_id", table: "tickets", label: "Atendimento" },
        { field: "template_id", table: "document_templates", label: "Modelo" },
        { field: "signature_profile_id", table: "signature_profiles", label: "Assinatura" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    const documentId = createDocument(gabinete.id, ctx.user.id, body);
    logAudit(gabinete.id, ctx.user.id, "create", "document", documentId, null, body);
    return sendJson(res, { document: getScopedDocument(gabinete.id, documentId) }, 201);
  }

  const documentMatch = pathname.match(/^\/api\/documents\/(\d+)$/);
  if (documentMatch && req.method === "GET") {
    const documentId = Number(documentMatch[1]);
    const document = getScopedDocument(gabinete.id, documentId);
    if (!document) return sendJson(res, { error: "Documento nao encontrado." }, 404);
    return sendJson(res, { document });
  }

  if (documentMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const documentId = Number(documentMatch[1]);
    const current = getScopedDocument(gabinete.id, documentId);
    if (!current) return sendJson(res, { error: "Documento nao encontrado." }, 404);
    const body = await parseBody(req);
    const error =
      validateDocumentForm(body)
      || validateScopedReferences(gabinete.id, body, [
        { field: "ticket_id", table: "tickets", label: "Atendimento" },
        { field: "template_id", table: "document_templates", label: "Modelo" },
        { field: "signature_profile_id", table: "signature_profiles", label: "Assinatura" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    updateDocument(gabinete.id, documentId, body);
    logAudit(gabinete.id, ctx.user.id, "update", "document", documentId, current, body);
    return sendJson(res, { document: getScopedDocument(gabinete.id, documentId) });
  }

  if (documentMatch && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const documentId = Number(documentMatch[1]);
    const current = getScopedDocument(gabinete.id, documentId);
    if (!current) return sendJson(res, { error: "Documento nao encontrado." }, 404);
    const movedCount = moveRowsToTrash(gabinete.id, "documents", [documentId], ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "document", documentId, current, null);
    return sendJson(res, { ok: true, moved_count: movedCount });
  }

  if (pathname === "/api/legislative-connectors" && req.method === "GET") {
    return sendJson(res, {
      items: listLegislativeConnectors(gabinete.id),
      providers: Object.entries(LEGISLATIVE_PROVIDER_LABELS).map(([value, label]) => ({ value, label })),
    });
  }

  if (pathname === "/api/legislative-connectors" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    try {
      const connectorId = createLegislativeConnector(gabinete.id, body);
      logAudit(gabinete.id, ctx.user.id, "create", "legislative_connector", connectorId, null, body);
      return sendJson(res, { connector: getScopedLegislativeConnector(gabinete.id, connectorId) }, 201);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel criar o conector." }, 422);
    }
  }

  const legislativeConnectorSyncMatch = pathname.match(/^\/api\/legislative-connectors\/(\d+)\/sync$/);
  if (legislativeConnectorSyncMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    try {
      const result = await syncLegislativeConnector(gabinete.id, Number(legislativeConnectorSyncMatch[1]));
      logAudit(gabinete.id, ctx.user.id, "sync", "legislative_connector", Number(legislativeConnectorSyncMatch[1]), null, result);
      return sendJson(res, result);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel sincronizar este conector." }, 422);
    }
  }

  const legislativeConnectorMatch = pathname.match(/^\/api\/legislative-connectors\/(\d+)$/);
  if (legislativeConnectorMatch && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const connectorId = Number(legislativeConnectorMatch[1]);
    const current = getScopedLegislativeConnector(gabinete.id, connectorId);
    if (!current) return sendJson(res, { error: "Conector nao encontrado." }, 404);
    const movedCount = moveRowsToTrash(gabinete.id, "legislative_connectors", [connectorId], ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "legislative_connector", connectorId, current, null);
    return sendJson(res, { ok: true, moved_count: movedCount });
  }

  if (pathname === "/api/projects" && req.method === "GET") {
    return sendJson(res, {
      items: listProjects(gabinete.id, {
        q: url.searchParams.get("q") ?? "",
        category: url.searchParams.get("category") ?? "",
        status: url.searchParams.get("status") ?? "",
      }),
      lookups: buildApiLookups(gabinete.id),
      connectors: listLegislativeConnectors(gabinete.id),
    });
  }

  if (pathname === "/api/projects" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const error =
      validateProjectForm(body)
      || validateScopedReferences(gabinete.id, body, [
        { field: "responsible_id", table: "users", label: "Responsavel" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    const projectId = createProject(gabinete.id, body);
    logAudit(gabinete.id, ctx.user.id, "create", "project", projectId, null, body);
    return sendJson(res, { project: getScopedProject(gabinete.id, projectId) }, 201);
  }

  const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && req.method === "GET") {
    const project = getScopedProject(gabinete.id, Number(projectMatch[1]));
    if (!project) return sendJson(res, { error: "Propositura nao encontrada." }, 404);
    return sendJson(res, { project });
  }

  if (projectMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const projectId = Number(projectMatch[1]);
    const current = getScopedProject(gabinete.id, projectId);
    if (!current) return sendJson(res, { error: "Propositura nao encontrada." }, 404);
    const body = await parseBody(req);
    const error =
      validateProjectForm(body)
      || validateScopedReferences(gabinete.id, body, [
        { field: "responsible_id", table: "users", label: "Responsavel" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    updateProject(gabinete.id, projectId, body);
    logAudit(gabinete.id, ctx.user.id, "update", "project", projectId, current, body);
    return sendJson(res, { project: getScopedProject(gabinete.id, projectId) });
  }

  const projectDocumentMatch = pathname.match(/^\/api\/projects\/(\d+)\/document$/);
  if (projectDocumentMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const projectId = Number(projectDocumentMatch[1]);
    const project = getScopedProject(gabinete.id, projectId);
    if (!project) return sendJson(res, { error: "Item de atuacao nao encontrado." }, 404);
    const documentId = buildDocumentFromProject(gabinete, ctx.user.id, project);
    logAudit(gabinete.id, ctx.user.id, "create_from_project", "document", documentId, null, { project_id: projectId });
    return sendJson(res, { document: getScopedDocument(gabinete.id, documentId), project: getScopedProject(gabinete.id, projectId) }, 201);
  }

  if (projectMatch && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const projectId = Number(projectMatch[1]);
    const current = getScopedProject(gabinete.id, projectId);
    if (!current) return sendJson(res, { error: "Propositura nao encontrada." }, 404);
    const movedCount = moveRowsToTrash(gabinete.id, "projects", [projectId], ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "project", projectId, current, null);
    return sendJson(res, { ok: true, moved_count: movedCount });
  }

  if (pathname === "/api/notes" && req.method === "GET") {
    return sendJson(res, {
      items: listNotes(gabinete.id, {
        q: url.searchParams.get("q") ?? "",
        scope: url.searchParams.get("scope") ?? "",
        document_id: url.searchParams.get("document_id") ?? "",
        task_id: url.searchParams.get("task_id") ?? "",
      }),
      lookups: buildApiLookups(gabinete.id),
      counts: noteCounts(gabinete.id),
    });
  }

  if (pathname === "/api/notes" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const error =
      validateNoteForm(body)
      || validateScopedReferences(gabinete.id, body, [
        { field: "contact_id", table: "contacts", label: "Contato" },
        { field: "ticket_id", table: "tickets", label: "Atendimento" },
        { field: "document_id", table: "documents", label: "Documento" },
        { field: "project_id", table: "projects", label: "Projeto" },
        { field: "finance_entry_id", table: "finance_entries", label: "Lancamento financeiro" },
        { field: "task_id", table: "tasks", label: "Tarefa" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    const noteId = createNote(gabinete.id, body, ctx.user.id);
    const note = getScopedNote(gabinete.id, noteId);
    logAudit(gabinete.id, ctx.user.id, "create", "note", noteId, null, body);
    return sendJson(res, { note }, 201);
  }

  const noteTaskMatch = pathname.match(/^\/api\/notes\/(\d+)\/task$/);
  if (noteTaskMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const noteId = Number(noteTaskMatch[1]);
    const current = getScopedNote(gabinete.id, noteId);
    if (!current) return sendJson(res, { error: "Nota nao encontrada." }, 404);
    const body = await parseBody(req);
    const candidate = {
      title: body.title || current.subject,
      description: body.description ?? current.body ?? "",
      responsible_id: body.responsible_id || "",
      ticket_id: body.ticket_id || current.ticket_id || "",
      contact_id: body.contact_id || current.contact_id || "",
      document_id: body.document_id || current.document_id || "",
	      project_id: body.project_id || current.project_id || "",
	      note_id: current.id,
	      tags: body.tags ?? current.tags ?? "",
	      due_at: body.due_at || `${addDays(currentDate(), 1)}T09:00`,
      priority: body.priority || "Normal",
      status: body.status || "Pendente",
    };
    const error =
      validateTaskForm(candidate)
      || validateScopedReferences(gabinete.id, candidate, [
        { field: "responsible_id", table: "users", label: "Responsavel" },
        { field: "ticket_id", table: "tickets", label: "Atendimento" },
        { field: "contact_id", table: "contacts", label: "Contato" },
        { field: "document_id", table: "documents", label: "Documento" },
        { field: "project_id", table: "projects", label: "Projeto" },
        { field: "note_id", table: "notes", label: "Nota" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    const taskId = createTaskFromNote(gabinete.id, noteId, candidate, ctx.user.id);
    const task = getScopedTask(gabinete.id, taskId);
    logAudit(gabinete.id, ctx.user.id, "create_task", "note", noteId, current, candidate);
    return sendJson(res, { note: getScopedNote(gabinete.id, noteId), task }, 201);
  }

  const noteMatch = pathname.match(/^\/api\/notes\/(\d+)$/);
  if (noteMatch && req.method === "GET") {
    const note = getScopedNote(gabinete.id, Number(noteMatch[1]));
    if (!note) return sendJson(res, { error: "Nota nao encontrada." }, 404);
    return sendJson(res, { note });
  }

  if (noteMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const noteId = Number(noteMatch[1]);
    const current = getScopedNote(gabinete.id, noteId);
    if (!current) return sendJson(res, { error: "Nota nao encontrada." }, 404);
    const body = await parseBody(req);
    const error =
      validateNoteForm({ ...current, ...body })
      || validateScopedReferences(gabinete.id, { ...current, ...body }, [
        { field: "contact_id", table: "contacts", label: "Contato" },
        { field: "ticket_id", table: "tickets", label: "Atendimento" },
        { field: "document_id", table: "documents", label: "Documento" },
        { field: "project_id", table: "projects", label: "Projeto" },
        { field: "finance_entry_id", table: "finance_entries", label: "Lancamento financeiro" },
        { field: "task_id", table: "tasks", label: "Tarefa" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    updateNote(gabinete.id, noteId, body, ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "update", "note", noteId, current, body);
    return sendJson(res, { note: getScopedNote(gabinete.id, noteId) });
  }

  if (noteMatch && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const noteId = Number(noteMatch[1]);
    const current = getScopedNote(gabinete.id, noteId);
    if (!current) return sendJson(res, { error: "Nota nao encontrada." }, 404);
    const movedCount = moveRowsToTrash(gabinete.id, "notes", [noteId], ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "note", noteId, current, null);
    return sendJson(res, { ok: true, moved_count: movedCount });
  }

  if (pathname === "/api/tasks" && req.method === "GET") {
    return sendJson(res, {
      items: listTasks(gabinete.id, {
        q: url.searchParams.get("q") ?? "",
        scope: url.searchParams.get("scope") ?? "",
        responsible_id: url.searchParams.get("responsible_id") ?? "",
        status: url.searchParams.get("status") ?? "",
      }),
      lookups: buildApiLookups(gabinete.id),
      counts: taskCounts(gabinete.id),
    });
  }

  if (pathname === "/api/tasks" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const error =
      validateTaskForm(body)
      || validateScopedReferences(gabinete.id, body, [
        { field: "responsible_id", table: "users", label: "Responsavel" },
        { field: "ticket_id", table: "tickets", label: "Atendimento" },
        { field: "contact_id", table: "contacts", label: "Contato" },
        { field: "document_id", table: "documents", label: "Documento" },
        { field: "project_id", table: "projects", label: "Projeto" },
        { field: "note_id", table: "notes", label: "Nota" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    const taskId = createTask(gabinete.id, body);
    const task = getScopedTask(gabinete.id, taskId);
    if (task?.ticket_id) {
      insertTicketHistory(gabinete.id, task.ticket_id, ctx.user.id, {
        action_type: "Tarefa",
        text: `Tarefa criada: ${task.title}`,
        previous_status: "",
        new_status: task.status || "",
        next_action: task.title || "",
        next_action_date: task.due_at || "",
      });
    }
    logAudit(gabinete.id, ctx.user.id, "create", "task", taskId, null, body);
    return sendJson(res, { task }, 201);
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch && req.method === "GET") {
    const task = getScopedTask(gabinete.id, Number(taskMatch[1]));
    if (!task) return sendJson(res, { error: "Tarefa nao encontrada." }, 404);
    return sendJson(res, { task, notes: listNotes(gabinete.id, { task_id: task.id }) });
  }

  const taskTicketMatch = pathname.match(/^\/api\/tasks\/(\d+)\/ticket$/);
  if (taskTicketMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const taskId = Number(taskTicketMatch[1]);
    const task = getScopedTask(gabinete.id, taskId);
    if (!task) return sendJson(res, { error: "Tarefa nao encontrada." }, 404);
    if (task.ticket_id) {
      return sendJson(res, { task, ticket: getScopedTicket(gabinete.id, task.ticket_id) });
    }

    const contactId = scopedReferenceId(gabinete.id, "contacts", task.contact_id);
    if (!contactId) {
      return sendJson(res, { error: "Vincule um contato a tarefa antes de virar atendimento." }, 422);
    }

    const sequence =
      db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id").get({
        gabinete_id: gabinete.id,
      }).total + 1;
    const number = generateTicketCode(gabinete.id, sequence);
    const timestamp = nowIso();
    const status = listStatuses(gabinete.id)[0]?.name || "Aberto";
    const channel = listChannels(gabinete.id).find((item) => item.name === "WhatsApp")?.name || listChannels(gabinete.id)[0]?.name || "Outro";
    const category = listCategories(gabinete.id)[0]?.name || "";
    const assignedUserId = scopedReferenceId(gabinete.id, "users", task.responsible_id) || scopedReferenceId(gabinete.id, "users", ctx.user.id);

    const result = db.prepare(
      `
        INSERT INTO tickets (
          gabinete_id, contact_id, number, opened_at, channel, status, priority, tags,
          demand_title, demand_category, description, current_guidance, assigned_user_id,
          department, external_protocol, internal_due_date, dependency_note, follow_up_days,
          next_action, next_action_date, closed_at, result, closure_confirmed, is_archived,
          is_favorite, created_at, updated_at
        ) VALUES (
          :gabinete_id, :contact_id, :number, :opened_at, :channel, :status, :priority, :tags,
          :demand_title, :demand_category, :description, :current_guidance, :assigned_user_id,
          :department, :external_protocol, :internal_due_date, :dependency_note, :follow_up_days,
          :next_action, :next_action_date, '', '', 0, 0, 0, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabinete.id,
      contact_id: contactId,
      number,
      opened_at: currentDate(),
      channel,
      status,
      priority: task.priority || "Normal",
      tags: task.tags || "",
      demand_title: task.title,
      demand_category: category,
      description: task.description || "",
      current_guidance: "",
      assigned_user_id: assignedUserId,
      department: "",
      external_protocol: "",
      internal_due_date: "",
      dependency_note: "",
      follow_up_days: Number(gabinete.default_follow_up_days || 3),
      next_action: task.title || "",
      next_action_date: task.due_at || "",
      created_at: timestamp,
      updated_at: timestamp,
    });

    const ticketId = Number(result.lastInsertRowid);
    updateTask(gabinete.id, taskId, { ...task, ticket_id: ticketId });
    insertTicketHistory(gabinete.id, ticketId, ctx.user.id, {
      action_type: "Criacao",
      text: `Atendimento criado a partir da tarefa: ${task.title}`,
      previous_status: "",
      new_status: status,
      next_action: task.title || "",
      next_action_date: task.due_at || "",
    });
    refreshContactTicketDates(gabinete.id, contactId);
    logAudit(gabinete.id, ctx.user.id, "create_from_task", "ticket", ticketId, null, { task_id: taskId });
    return sendJson(res, { task: getScopedTask(gabinete.id, taskId), ticket: getScopedTicket(gabinete.id, ticketId) }, 201);
  }

  if (taskMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const taskId = Number(taskMatch[1]);
    const current = getScopedTask(gabinete.id, taskId);
    if (!current) return sendJson(res, { error: "Tarefa nao encontrada." }, 404);
    const body = await parseBody(req);
    const error =
      validateTaskForm(body)
      || validateScopedReferences(gabinete.id, body, [
        { field: "responsible_id", table: "users", label: "Responsavel" },
        { field: "ticket_id", table: "tickets", label: "Atendimento" },
        { field: "contact_id", table: "contacts", label: "Contato" },
        { field: "document_id", table: "documents", label: "Documento" },
        { field: "project_id", table: "projects", label: "Projeto" },
        { field: "note_id", table: "notes", label: "Nota" },
      ]);
    if (error) return sendJson(res, { error }, 422);
    updateTask(gabinete.id, taskId, body);
    logAudit(gabinete.id, ctx.user.id, "update", "task", taskId, current, body);
    return sendJson(res, { task: getScopedTask(gabinete.id, taskId) });
  }

  if (taskMatch && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const taskId = Number(taskMatch[1]);
    const current = getScopedTask(gabinete.id, taskId);
    if (!current) return sendJson(res, { error: "Tarefa nao encontrada." }, 404);
    const movedCount = moveRowsToTrash(gabinete.id, "tasks", [taskId], ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "task", taskId, current, null);
    return sendJson(res, { ok: true, moved_count: movedCount });
  }

  if (pathname === "/api/finance" && req.method === "GET") {
    const items = listFinanceEntries(gabinete.id, {
      q: url.searchParams.get("q") ?? "",
      entry_type: url.searchParams.get("entry_type") ?? "",
      status: url.searchParams.get("status") ?? "",
    });
    return sendJson(res, {
      items,
      summary: {
        income_cents: items
          .filter((item) => item.entry_type === "entrada")
          .reduce((total, item) => total + Number(item.amount_cents || 0), 0),
        expense_cents: items
          .filter((item) => item.entry_type === "saida")
          .reduce((total, item) => total + Number(item.amount_cents || 0), 0),
      },
    });
  }

  if (pathname === "/api/finance" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const error = validateFinanceEntryForm(body);
    if (error) return sendJson(res, { error }, 422);
    let receiptUpload = null;
    try {
      receiptUpload = prepareFinanceReceiptUpload(body.receipt_file || body.receipt_file_payload);
    } catch (uploadError) {
      return sendJson(res, { error: uploadError.message || "Comprovante invalido." }, 422);
    }
    const entryIds = createFinanceEntries(gabinete.id, ctx.user.id, body);
    const entryId = entryIds[0];
    if (receiptUpload) {
      storeFinanceReceiptUpload(gabinete.id, entryId, receiptUpload);
    }
    logAudit(gabinete.id, ctx.user.id, "create", "finance_entry", entryId, null, {
      ...sanitizeFinanceAuditBody(body),
      created_count: entryIds.length,
      receipt_attached: Boolean(receiptUpload),
    });
    const entry = getScopedFinanceEntry(gabinete.id, entryId);
    return sendJson(res, { entry, share: serializeFinanceShare(entry, req), created_count: entryIds.length }, 201);
  }

  const financeMatch = pathname.match(/^\/api\/finance\/(\d+)$/);
  if (financeMatch && req.method === "GET") {
    const entry = getScopedFinanceEntry(gabinete.id, Number(financeMatch[1]));
    if (!entry) return sendJson(res, { error: "Lancamento nao encontrado." }, 404);
    return sendJson(res, { entry, share: serializeFinanceShare(entry, req) });
  }

  const financeReceiptMatch = pathname.match(/^\/api\/finance\/(\d+)\/receipt$/);
  if (financeReceiptMatch && req.method === "GET") {
    const entry = getScopedFinanceEntry(gabinete.id, Number(financeReceiptMatch[1]));
    if (!entry) return sendJson(res, { error: "Lancamento nao encontrado." }, 404);
    const receiptFile = readFinanceReceiptFile(entry);
    if (!receiptFile) return sendJson(res, { error: "Comprovante nao encontrado." }, 404);
    res.writeHead(200, {
      "Content-Type": receiptFile.mime_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(receiptFile.file_name)}`,
      "Cache-Control": "private, max-age=60",
    });
    return res.end(receiptFile.buffer);
  }

  if (financeMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entryId = Number(financeMatch[1]);
    const current = getScopedFinanceEntry(gabinete.id, entryId);
    if (!current) return sendJson(res, { error: "Lancamento nao encontrado." }, 404);
    const body = await parseBody(req);
    const error = validateFinanceEntryForm(body);
    if (error) return sendJson(res, { error }, 422);
    let receiptUpload = null;
    try {
      receiptUpload = prepareFinanceReceiptUpload(body.receipt_file || body.receipt_file_payload);
    } catch (uploadError) {
      return sendJson(res, { error: uploadError.message || "Comprovante invalido." }, 422);
    }
    updateFinanceEntry(gabinete.id, entryId, body);
    if (receiptUpload) {
      storeFinanceReceiptUpload(gabinete.id, entryId, receiptUpload);
    } else if (toFlag(body.receipt_remove) === 1) {
      deleteFinanceReceipt(gabinete.id, entryId);
    }
    logAudit(gabinete.id, ctx.user.id, "update", "finance_entry", entryId, current, sanitizeFinanceAuditBody(body));
    const updatedEntry = getScopedFinanceEntry(gabinete.id, entryId);
    return sendJson(res, { entry: updatedEntry, share: serializeFinanceShare(updatedEntry, req) });
  }

  if (financeMatch && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entryId = Number(financeMatch[1]);
    const current = getScopedFinanceEntry(gabinete.id, entryId);
    if (!current) return sendJson(res, { error: "Lancamento nao encontrado." }, 404);
    const movedCount = moveRowsToTrash(gabinete.id, "finance_entries", [entryId], ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "finance_entry", entryId, current, null);
    return sendJson(res, { ok: true, moved_count: movedCount });
  }

  const financeShareEnableMatch = pathname.match(/^\/api\/finance\/(\d+)\/share\/enable$/);
  if (financeShareEnableMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entryId = Number(financeShareEnableMatch[1]);
    const body = await parseBody(req);
    try {
      const entry = enableFinancePublicShare(gabinete.id, entryId, body);
      logAudit(gabinete.id, ctx.user.id, "enable", "finance_public_share", entryId, null, {
        public_share_code: entry.public_share_code,
        mode: entry.public_share_mode,
        one_time: entry.public_share_one_time,
      });
      return sendJson(res, {
        entry: getScopedFinanceEntry(gabinete.id, entryId),
        share: serializeFinanceShare(entry, req, entry.access_code),
      });
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel ativar o compartilhamento." }, 422);
    }
  }

  const financeShareNewLinkMatch = pathname.match(/^\/api\/finance\/(\d+)\/share\/novo-link$/);
  if (financeShareNewLinkMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entryId = Number(financeShareNewLinkMatch[1]);
    const body = await parseBody(req);
    try {
      const entry = enableFinancePublicShare(gabinete.id, entryId, { ...body, regenerate: true });
      logAudit(gabinete.id, ctx.user.id, "new_link", "finance_public_share", entryId, null, {
        public_share_code: entry.public_share_code,
        mode: entry.public_share_mode,
        one_time: entry.public_share_one_time,
      });
      return sendJson(res, {
        entry: getScopedFinanceEntry(gabinete.id, entryId),
        share: serializeFinanceShare(entry, req, entry.access_code),
      });
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel gerar novo link." }, 422);
    }
  }

  const financeShareSecretMatch = pathname.match(/^\/api\/finance\/(\d+)\/share\/senha$/);
  if (financeShareSecretMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entryId = Number(financeShareSecretMatch[1]);
    const entry = getScopedFinanceEntry(gabinete.id, entryId);
    if (!entry) return sendJson(res, { error: "Lancamento nao encontrado." }, 404);
    if (!entry.public_share_enabled || !entry.public_share_code) {
      return sendJson(res, { error: "Ative o link antes de gerar nova senha." }, 422);
    }
    if (Number(entry.public_share_secret_generation_count || 0) >= PUBLIC_SHARE_MAX_GENERATIONS) {
      return sendJson(res, { error: `Limite de ${PUBLIC_SHARE_MAX_GENERATIONS} geracoes de senha atingido para este lancamento.` }, 422);
    }
    const accessCode = generatePublicTrackingAccessCode();
    db.prepare(
      `
        UPDATE finance_entries
        SET public_share_secret_hash = :public_share_secret_hash,
            public_share_secret_hint = :public_share_secret_hint,
            public_share_updated_at = :public_share_updated_at,
            public_share_failed_attempts = 0,
            public_share_secret_generation_count = COALESCE(public_share_secret_generation_count, 0) + 1,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :entry_id
      `,
    ).run({
      gabinete_id: gabinete.id,
      entry_id: entryId,
      public_share_secret_hash: hashPassword(accessCode),
      public_share_secret_hint: `final ${accessCode.slice(-2)}`,
      public_share_updated_at: nowIso(),
      updated_at: nowIso(),
    });
    logAudit(gabinete.id, ctx.user.id, "rotate_secret", "finance_public_share", entryId, null, {
      public_share_code: entry.public_share_code,
    });
    const updatedEntry = getScopedFinanceEntry(gabinete.id, entryId);
    return sendJson(res, {
      entry: updatedEntry,
      share: serializeFinanceShare(updatedEntry, req, accessCode),
    });
  }

  const financeShareMatch = pathname.match(/^\/api\/finance\/(\d+)\/share$/);
  if (financeShareMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const entryId = Number(financeShareMatch[1]);
    const entry = getScopedFinanceEntry(gabinete.id, entryId);
    if (!entry) return sendJson(res, { error: "Lancamento nao encontrado." }, 404);
    const body = await parseBody(req);
    const enabled = body.enabled === undefined ? Boolean(entry.public_share_enabled) : toFlag(body.enabled);
    db.prepare(
      `
        UPDATE finance_entries
        SET public_share_enabled = :public_share_enabled,
            public_share_updated_at = :public_share_updated_at,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :entry_id
      `,
    ).run({
      gabinete_id: gabinete.id,
      entry_id: entryId,
      public_share_enabled: enabled,
      public_share_updated_at: nowIso(),
      updated_at: nowIso(),
    });
    logAudit(gabinete.id, ctx.user.id, "update", "finance_public_share", entryId, entry, { enabled });
    const updatedEntry = getScopedFinanceEntry(gabinete.id, entryId);
    return sendJson(res, {
      entry: updatedEntry,
      share: serializeFinanceShare(updatedEntry, req),
    });
  }

  if (pathname === "/api/ai-links" && req.method === "GET") {
    return sendJson(res, { items: listAiLinks(gabinete.id, ctx.user.id) });
  }

  if (pathname === "/api/ai-links" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const error = validateAiLinkForm(body);
    if (error) return sendJson(res, { error }, 422);
    const aiLinkId = createAiLink(gabinete.id, body);
    logAudit(gabinete.id, ctx.user.id, "create", "ai_link", aiLinkId, null, body);
    return sendJson(res, { ai_link: getScopedAiLink(gabinete.id, aiLinkId) }, 201);
  }

  if (pathname === "/api/ai/summarize" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const text = String(body.text || "").trim();
    if (text.length < 30) return sendJson(res, { error: "Escreva um pouco mais antes de melhorar com IA." }, 422);
    if (text.length > 12000) return sendJson(res, { error: "Texto grande demais para melhorar agora." }, 422);
    if (!OPENAI_API_KEY) return sendJson(res, { error: "IA ainda nao configurada no servidor." }, 503);
    try {
      const summary = await summarizeTextWithOpenAi(text, body.context || "pedido");
      logAudit(gabinete.id, ctx.user.id, "improve_text", "ai", 0, null, { context: body.context || "pedido" });
      return sendJson(res, { summary });
    } catch (error) {
      console.error("openai_summarize_failed", error);
      return sendJson(res, { error: "Nao foi possivel melhorar com IA agora." }, 502);
    }
  }

  const aiPromptRatingMatch = pathname.match(/^\/api\/ai-links\/(\d+)\/rating$/);
  if (aiPromptRatingMatch && req.method === "POST") {
    const aiLinkId = Number(aiPromptRatingMatch[1]);
    const prompt = getSharedAiPromptForFeedback(gabinete.id, aiLinkId);
    if (!prompt) return sendJson(res, { error: "Prompt compartilhado nao encontrado." }, 404);
    const body = await parseBody(req);
    const rating = parseInteger(body.rating, 0);
    if (rating < 1 || rating > 5) return sendJson(res, { error: "Escolha uma nota de 1 a 5." }, 422);
    const summary = upsertAiPromptRating(gabinete.id, ctx.user.id, aiLinkId, rating);
    logAudit(gabinete.id, ctx.user.id, "rate", "ai_prompt", aiLinkId, null, { rating });
    return sendJson(res, { feedback: summary });
  }

  const aiPromptReportMatch = pathname.match(/^\/api\/ai-links\/(\d+)\/report$/);
  if (aiPromptReportMatch && req.method === "POST") {
    const aiLinkId = Number(aiPromptReportMatch[1]);
    const prompt = getSharedAiPromptForFeedback(gabinete.id, aiLinkId);
    if (!prompt) return sendJson(res, { error: "Prompt compartilhado nao encontrado." }, 404);
    const body = await parseBody(req);
    const error = validateAiPromptReportForm(body);
    if (error) return sendJson(res, { error }, 422);
    const result = reportAiPrompt(gabinete.id, ctx.user.id, aiLinkId, body);
    logAudit(gabinete.id, ctx.user.id, "report", "ai_prompt", aiLinkId, null, {
      reason: result.reason,
      moderation_status: result.moderation_status,
      report_count: result.report_count,
    });
    return sendJson(res, { report: result }, 201);
  }

  const aiLinkMatch = pathname.match(/^\/api\/ai-links\/(\d+)$/);
  if (aiLinkMatch && req.method === "GET") {
    const aiLink = getScopedAiLink(gabinete.id, Number(aiLinkMatch[1]));
    if (!aiLink) return sendJson(res, { error: "Atalho de IA nao encontrado." }, 404);
    return sendJson(res, { ai_link: aiLink });
  }

  if (aiLinkMatch && req.method === "PATCH") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const aiLinkId = Number(aiLinkMatch[1]);
    const current = getScopedAiLink(gabinete.id, aiLinkId);
    if (!current) return sendJson(res, { error: "Atalho de IA nao encontrado." }, 404);
    const body = await parseBody(req);
    const error = validateAiLinkForm(body);
    if (error) return sendJson(res, { error }, 422);
    updateAiLink(gabinete.id, aiLinkId, body);
    logAudit(gabinete.id, ctx.user.id, "update", "ai_link", aiLinkId, current, body);
    return sendJson(res, { ai_link: getScopedAiLink(gabinete.id, aiLinkId) });
  }

  if (aiLinkMatch && req.method === "DELETE") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const aiLinkId = Number(aiLinkMatch[1]);
    const current = getScopedAiLink(gabinete.id, aiLinkId);
    if (!current) return sendJson(res, { error: "Atalho de IA nao encontrado." }, 404);
    const movedCount = moveRowsToTrash(gabinete.id, "ai_links", [aiLinkId], ctx.user.id);
    logAudit(gabinete.id, ctx.user.id, "move_to_trash", "ai_link", aiLinkId, current, null);
    return sendJson(res, { ok: true, moved_count: movedCount });
  }

  if (pathname === "/api/reports" && req.method === "GET") {
    const financeItems = listFinanceEntries(gabinete.id);
    return sendJson(res, {
      ...buildReportsData(gabinete.id),
      birthdays: buildBirthdaySummary(gabinete.id, currentDate()),
      tasks: taskCounts(gabinete.id),
      finance: {
        income_cents: financeItems
          .filter((item) => item.entry_type === "entrada")
          .reduce((total, item) => total + Number(item.amount_cents || 0), 0),
        expense_cents: financeItems
          .filter((item) => item.entry_type === "saida")
          .reduce((total, item) => total + Number(item.amount_cents || 0), 0),
        balance_cents: financeItems.reduce(
          (total, item) => total + (item.entry_type === "entrada" ? Number(item.amount_cents || 0) : -Number(item.amount_cents || 0)),
          0,
        ),
      },
    });
  }

  if (pathname === "/api/settings" && req.method === "GET") {
    if (!ensureApiAuthenticated(ctx, res)) return;
    const publicSelfRegisterConfig = normalizePublicSelfRegisterConfig(gabinete.public_self_register_config);
    const workspaceModuleConfig = normalizeWorkspaceModuleConfig(gabinete.workspace_module_config, gabinete.type);
    const setupMetrics = {
      contact_count: db
        .prepare("SELECT COUNT(*) AS total FROM contacts WHERE gabinete_id = :gabinete_id AND (deleted_at IS NULL OR deleted_at = '')")
        .get({ gabinete_id: gabinete.id }).total,
      team_count: db
        .prepare("SELECT COUNT(*) AS total FROM users WHERE gabinete_id = :gabinete_id")
        .get({ gabinete_id: gabinete.id }).total,
    };
    return sendJson(res, {
      gabinete: {
        id: gabinete.id,
        slug: gabinete.slug,
        name: gabinete.name,
        logo_url: gabinete.logo_url,
        type: gabinete.type,
        onboarding_completed: Boolean(gabinete.onboarding_completed),
        parliamentarian_name: gabinete.parliamentarian_name,
        party: gabinete.party,
        city: gabinete.city,
        city_ibge: gabinete.city_ibge,
        uf: gabinete.uf,
        zip_code: gabinete.zip_code || "",
        address: gabinete.address || "",
        address_number: gabinete.address_number || "",
        address_complement: gabinete.address_complement || "",
        neighborhood: gabinete.neighborhood || "",
        responsible_name: gabinete.responsible_name,
        phone: gabinete.phone,
        email: gabinete.email,
        public_slug: gabinete.public_slug,
        public_self_register_intro: normalizePublicSelfRegisterIntro(gabinete.public_self_register_intro),
        public_self_register_config: publicSelfRegisterConfig,
        whatsapp_provider: gabinete.whatsapp_provider || (isEvolutionConfigured() ? "evolution" : "wa_me"),
        whatsapp_instance_name: gabinete.whatsapp_instance_name || "",
        default_area_code: gabinete.default_area_code || "",
        default_follow_up_days: gabinete.default_follow_up_days,
        default_document_due_days: gabinete.default_document_due_days,
        default_birthday_notice_days: gabinete.default_birthday_notice_days,
        team_label: gabinete.team_label,
        workspace_module_config: workspaceModuleConfig,
        ui_theme_mode: normalizeUiThemeMode(gabinete.ui_theme_mode),
        ui_theme_palette: normalizeUiThemePalette(gabinete.ui_theme_palette),
      },
      lookup_preferences: getLookupPreferences(gabinete.id, ctx.user.id),
      statuses: listStatuses(gabinete.id),
      categories: listCategories(gabinete.id),
      channels: listChannels(gabinete.id),
      whatsapp_templates: listWhatsappTemplates(gabinete.id),
      signature_profiles: listSignatureProfiles(gabinete.id),
      ai_links: listAiLinks(gabinete.id),
      routing_rules: listRoutingRules(gabinete.id),
      team: listUsersByGabinete(gabinete.id).map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        phone: item.phone,
        role: item.role,
        role_label: getRoleLabel(item.role),
        last_login_at: item.last_login_at,
        last_login_ip: item.last_login_ip,
        last_login_provider: item.last_login_provider,
      })),
      support: {
        phone: SUPPORT_WHATSAPP_PHONE,
        pretty: SUPPORT_WHATSAPP_PRETTY,
        url: SUPPORT_WHATSAPP_URL,
        email: SUPPORT_EMAIL_ADDRESS,
        mailbox_ready: SUPPORT_EMAIL_MAILBOX_READY,
      },
      email_settings: buildGabineteEmailSettings(gabinete, ctx.user?.email || gabinete.email || ""),
      whatsapp_connector: await resolveWhatsappConnectorState(gabinete),
      setup_metrics: setupMetrics,
    });
  }

  if (pathname === "/api/settings" && req.method === "PATCH") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    const body = await parseBody(req);
    const error = validateSettingsForm(body);
    if (error) return sendJson(res, { error }, 422);
    const publicSelfRegisterConfig = normalizePublicSelfRegisterConfig(body.public_self_register_config);
    const workspaceModuleConfig = normalizeWorkspaceModuleConfig(body.workspace_module_config, body.type || gabinete.type);
    const location = await resolveGabineteLocationPayload({
      city: body.city,
      uf: body.uf,
      city_ibge: gabinete.city_ibge,
    });
    const currentWhatsappConnector = await resolveWhatsappConnectorState(gabinete);
    const currentEmailSettings = buildGabineteEmailSettings(gabinete, ctx.user?.email || gabinete.email || "");
    const previous = {
      name: gabinete.name,
      logo_url: gabinete.logo_url,
      type: gabinete.type,
      responsible_name: gabinete.responsible_name,
      city: gabinete.city,
      uf: gabinete.uf,
      zip_code: gabinete.zip_code || "",
      address: gabinete.address || "",
      address_number: gabinete.address_number || "",
      address_complement: gabinete.address_complement || "",
      neighborhood: gabinete.neighborhood || "",
      onboarding_completed: Boolean(gabinete.onboarding_completed),
      public_slug: gabinete.public_slug,
      public_self_register_intro: gabinete.public_self_register_intro,
      public_self_register_config: normalizePublicSelfRegisterConfig(gabinete.public_self_register_config),
      workspace_module_config: normalizeWorkspaceModuleConfig(gabinete.workspace_module_config, gabinete.type),
      whatsapp_provider: gabinete.whatsapp_provider,
      team_label: gabinete.team_label,
      ui_theme_mode: gabinete.ui_theme_mode,
      ui_theme_palette: gabinete.ui_theme_palette,
      default_follow_up_days: gabinete.default_follow_up_days,
      default_document_due_days: gabinete.default_document_due_days,
      default_birthday_notice_days: gabinete.default_birthday_notice_days,
      default_area_code: gabinete.default_area_code,
    };
    const publicSlug = normalizePublicSlug(body.public_slug ?? "");
    const publicSlugConflict = db
      .prepare(
        `
          SELECT id, name
          FROM gabinetes
          WHERE id != :id
            AND (
              lower(slug) = lower(:public_slug)
              OR lower(public_slug) = lower(:public_slug)
            )
          LIMIT 1
        `,
      )
      .get({ id: gabinete.id, public_slug: publicSlug });
    if (publicSlugConflict) {
      return sendJson(res, { error: "Esse final de link publico ja esta em uso por outro gabinete." }, 409);
    }
    if (publicSelfRegisterConfig.confirmation_channel === "email" && !currentEmailSettings.configured) {
      return sendJson(res, { error: "Para confirmar por e-mail, configure e teste primeiro o e-mail do gabinete." }, 422);
    }
    if (publicSelfRegisterConfig.confirmation_channel === "whatsapp" && body.whatsapp_provider === "wa_me") {
      return sendJson(res, { error: "A confirmacao por WhatsApp precisa do modo WhatsApp conectado, nao apenas WhatsApp Web." }, 422);
    }
    if (publicSelfRegisterConfig.confirmation_channel === "whatsapp" && !currentWhatsappConnector.connected) {
      return sendJson(res, { error: "Para confirmar por WhatsApp, conecte primeiro a linha do gabinete pelo QR Code." }, 422);
    }
    const nextGabinetePatch = {
      id: gabinete.id,
      name: String(body.name || gabinete.name || "").trim().slice(0, GABINETE_NAME_MAX_LENGTH),
      logo_url: body.logo_url ?? "",
      type: body.type || gabinete.type,
      parliamentarian_name: String(body.parliamentarian_name || body.responsible_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
      party: body.party ?? "",
      city: location.city || gabinete.city,
      city_ibge: location.city_ibge || gabinete.city_ibge || "",
      uf: location.uf || gabinete.uf,
      zip_code: String(body.zip_code || "").replace(/\D/g, "").slice(0, 8),
      address: String(body.address || "").trim().slice(0, 180),
      address_number: String(body.address_number || "").trim().slice(0, 30),
      address_complement: String(body.address_complement || "").trim().slice(0, 80),
      neighborhood: String(body.neighborhood || "").trim().slice(0, 120),
      responsible_name: String(body.parliamentarian_name || body.responsible_name || "").trim().slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH),
      phone: normalizePhone(body.phone),
      email: body.email ?? "",
      public_slug: publicSlug,
      public_self_register_intro: normalizePublicSelfRegisterIntro(body.public_self_register_intro),
      public_self_register_config: JSON.stringify(publicSelfRegisterConfig),
      workspace_module_config: JSON.stringify(workspaceModuleConfig),
      whatsapp_provider:
        body.whatsapp_provider === "wa_me"
          ? "wa_me"
          : isEvolutionConfigured()
            ? "evolution"
            : "wa_me",
      default_area_code:
        normalizeDefaultAreaCode(body.default_area_code)
        || inferBrazilianAreaCode(body.phone)
        || gabinete.default_area_code
        || "",
      default_follow_up_days: parseInteger(body.default_follow_up_days, gabinete.default_follow_up_days),
      default_document_due_days: parseInteger(body.default_document_due_days, gabinete.default_document_due_days),
      default_birthday_notice_days: parseInteger(
        body.default_birthday_notice_days,
        gabinete.default_birthday_notice_days,
      ),
      team_label: body.team_label || "Meu time",
      ui_theme_mode: normalizeUiThemeMode(body.ui_theme_mode),
      ui_theme_palette: normalizeUiThemePalette(body.ui_theme_palette),
      updated_at: nowIso(),
    };
    const nextOnboardingCompleted =
      gabinete.onboarding_completed
      || Boolean(body.onboarding_completed)
      || hasInstitutionalSetupProfile(nextGabinetePatch)
        ? 1
        : 0;
    db.prepare(
      `
        UPDATE gabinetes
        SET name = :name,
            logo_url = :logo_url,
            type = :type,
            parliamentarian_name = :parliamentarian_name,
            party = :party,
            city = :city,
            city_ibge = :city_ibge,
            uf = :uf,
            zip_code = :zip_code,
            address = :address,
            address_number = :address_number,
            address_complement = :address_complement,
            neighborhood = :neighborhood,
            responsible_name = :responsible_name,
            phone = :phone,
            email = :email,
            onboarding_completed = :onboarding_completed,
            public_slug = :public_slug,
            public_self_register_intro = :public_self_register_intro,
            public_self_register_config = :public_self_register_config,
            workspace_module_config = :workspace_module_config,
            whatsapp_provider = :whatsapp_provider,
            default_area_code = :default_area_code,
            default_follow_up_days = :default_follow_up_days,
            default_document_due_days = :default_document_due_days,
            default_birthday_notice_days = :default_birthday_notice_days,
            team_label = :team_label,
            ui_theme_mode = :ui_theme_mode,
            ui_theme_palette = :ui_theme_palette,
            updated_at = :updated_at
        WHERE id = :id
      `,
    ).run({
      ...nextGabinetePatch,
      onboarding_completed: nextOnboardingCompleted,
    });
    logAudit(gabinete.id, ctx.user.id, "update", "settings", gabinete.id, previous, body);
    return sendJson(res, { ok: true });
  }

  if (pathname === "/api/settings/lists" && req.method === "PATCH") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    const body = await parseBody(req);
    const previous = {
      statuses: listStatuses(gabinete.id),
      categories: listCategories(gabinete.id),
      channels: listChannels(gabinete.id),
    };
    try {
      replaceSettingsLists(gabinete.id, body);
    } catch (error) {
      return sendJson(res, { error: error?.message || "Nao foi possivel salvar as listas." }, 422);
    }
    const next = {
      statuses: listStatuses(gabinete.id),
      categories: listCategories(gabinete.id),
      channels: listChannels(gabinete.id),
    };
    logAudit(gabinete.id, ctx.user.id, "update", "settings_lists", gabinete.id, previous, next);
    return sendJson(res, { ok: true, ...next });
  }

  if (pathname === "/api/settings/default-area-code" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const defaultAreaCode = normalizeDefaultAreaCode(body.default_area_code);
    if (!defaultAreaCode) {
      return sendJson(res, { error: "Informe um DDD com 2 digitos." }, 422);
    }
    const previous = { default_area_code: gabinete.default_area_code || "" };
    db.prepare(
      `
        UPDATE gabinetes
        SET default_area_code = :default_area_code,
            updated_at = :updated_at
        WHERE id = :id
      `,
    ).run({
      id: gabinete.id,
      default_area_code: defaultAreaCode,
      updated_at: nowIso(),
    });
    logAudit(gabinete.id, ctx.user.id, "update", "settings", gabinete.id, previous, { default_area_code: defaultAreaCode });
    return sendJson(res, { ok: true, default_area_code: defaultAreaCode });
  }

  if (pathname === "/api/settings/email" && req.method === "PATCH") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    const body = await parseBody(req);
    const error = validateGabineteEmailSettingsForm(body, { gabinete });
    if (error) return sendJson(res, { error }, 422);

    const smtpProfile = resolveGabineteSmtpProfile(gabinete, body);
    const previous = buildGabineteEmailSettings(gabinete, ctx.user?.email || gabinete.email || "");
    const updatedAt = nowIso();
    const nextGabinete = {
      ...gabinete,
      email_sender_name: smtpProfile.fromName,
      email_sender_address: smtpProfile.fromAddress,
      email_reply_to: "",
      email_smtp_host: smtpProfile.host,
      email_smtp_port: smtpProfile.port,
      email_smtp_security: smtpProfile.security,
      email_smtp_username: smtpProfile.username,
      email_smtp_password: smtpProfile.password,
      email_smtp_verified_at: "",
    };

    db.prepare(
      `
        UPDATE gabinetes
        SET email_sender_name = :email_sender_name,
            email_sender_address = :email_sender_address,
            email_reply_to = :email_reply_to,
            email_smtp_host = :email_smtp_host,
            email_smtp_port = :email_smtp_port,
            email_smtp_security = :email_smtp_security,
            email_smtp_username = :email_smtp_username,
            email_smtp_password = :email_smtp_password,
            email_smtp_verified_at = :email_smtp_verified_at,
            updated_at = :updated_at
        WHERE id = :id
      `,
    ).run({
      id: gabinete.id,
      email_sender_name: nextGabinete.email_sender_name,
      email_sender_address: nextGabinete.email_sender_address,
      email_reply_to: nextGabinete.email_reply_to,
      email_smtp_host: nextGabinete.email_smtp_host,
      email_smtp_port: nextGabinete.email_smtp_port,
      email_smtp_security: nextGabinete.email_smtp_security,
      email_smtp_username: nextGabinete.email_smtp_username,
      email_smtp_password: nextGabinete.email_smtp_password,
      email_smtp_verified_at: nextGabinete.email_smtp_verified_at,
      updated_at,
    });

    logAudit(
      gabinete.id,
      ctx.user.id,
      "update",
      "settings_email",
      gabinete.id,
      previous,
      {
        ...buildGabineteEmailSettings(nextGabinete, ctx.user?.email || gabinete.email || ""),
        has_password: Boolean(smtpProfile.password),
      },
    );

    return sendJson(res, {
      ok: true,
      email_settings: buildGabineteEmailSettings(nextGabinete, ctx.user?.email || gabinete.email || ""),
    });
  }

  if (pathname === "/api/settings/email/test" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    const body = await parseBody(req);
    const error = validateGabineteEmailSettingsForm(body, { gabinete, requireTestTo: true });
    if (error) return sendJson(res, { error }, 422);

    const smtpProfile = resolveGabineteSmtpProfile(gabinete, body);
    const testTo = String(body.test_to ?? "").trim().toLowerCase();
    try {
      await sendSmtpMail({
        to: testTo,
        subject: "Teste de configuracao de e-mail do gabinete",
        text: [
          `Ola${ctx.user?.name ? `, ${ctx.user.name}` : ""}.`,
          "",
          `Este e um teste da configuracao de e-mail do gabinete ${gabinete.name}.`,
          `Remetente configurado: ${smtpProfile.fromName} <${smtpProfile.fromAddress}>`,
          `Servidor SMTP: ${smtpProfile.host}:${smtpProfile.port}`,
          "",
          "Se esta mensagem chegou, a configuracao esta pronta para uso.",
        ].join("\n"),
        smtp: smtpProfile,
      });

      const updatedAt = nowIso();
      const nextGabinete = {
        ...gabinete,
        email_sender_name: smtpProfile.fromName,
        email_sender_address: smtpProfile.fromAddress,
        email_reply_to: "",
        email_smtp_host: smtpProfile.host,
        email_smtp_port: smtpProfile.port,
        email_smtp_security: smtpProfile.security,
        email_smtp_username: smtpProfile.username,
        email_smtp_password: smtpProfile.password,
        email_smtp_verified_at: updatedAt,
      };

      db.prepare(
        `
          UPDATE gabinetes
          SET email_sender_name = :email_sender_name,
              email_sender_address = :email_sender_address,
              email_reply_to = :email_reply_to,
              email_smtp_host = :email_smtp_host,
              email_smtp_port = :email_smtp_port,
              email_smtp_security = :email_smtp_security,
              email_smtp_username = :email_smtp_username,
              email_smtp_password = :email_smtp_password,
              email_smtp_verified_at = :email_smtp_verified_at,
              updated_at = :updated_at
          WHERE id = :id
        `,
      ).run({
        id: gabinete.id,
        email_sender_name: nextGabinete.email_sender_name,
        email_sender_address: nextGabinete.email_sender_address,
        email_reply_to: nextGabinete.email_reply_to,
        email_smtp_host: nextGabinete.email_smtp_host,
        email_smtp_port: nextGabinete.email_smtp_port,
        email_smtp_security: nextGabinete.email_smtp_security,
        email_smtp_username: nextGabinete.email_smtp_username,
        email_smtp_password: nextGabinete.email_smtp_password,
        email_smtp_verified_at: nextGabinete.email_smtp_verified_at,
        updated_at,
      });

      logAudit(
        gabinete.id,
        ctx.user.id,
        "verify",
        "settings_email",
        gabinete.id,
        buildGabineteEmailSettings(gabinete, ctx.user?.email || gabinete.email || ""),
        buildGabineteEmailSettings(nextGabinete, ctx.user?.email || gabinete.email || ""),
      );

      return sendJson(res, {
        ok: true,
        message: `Teste enviado para ${testTo}. Configuracao ativada automaticamente.`,
        email_settings: buildGabineteEmailSettings(nextGabinete, ctx.user?.email || gabinete.email || ""),
      });
    } catch (smtpError) {
      return sendJson(
        res,
        { error: "Nao foi possivel enviar o teste com essa configuracao. Revise host, porta, seguranca, usuario e senha." },
        502,
      );
    }
  }

  if (pathname === "/api/backup/export" && req.method === "GET") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    return sendJson(res, exportGabineteBackup(gabinete.id));
  }

  if (pathname === "/api/backup/restore" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    const body = await parseBody(req);
    try {
      restoreGabineteBackup(gabinete.id, body);
      logAudit(gabinete.id, ctx.user.id, "restore", "backup", gabinete.id, null, {
        imported_at: nowIso(),
        source: body?.meta?.gabinete?.name || "backup",
      });
      return sendJson(res, { ok: true });
    } catch (error) {
      return sendJson(res, { error: error.message || "Falha ao restaurar backup." }, 422);
    }
  }

  if (pathname === "/api/backup/purge" && req.method === "POST") {
    if (!ensureApiCanManageUsers(ctx, res)) return;
    const body = await parseBody(req);
    if (String(body.confirmation || "") !== "EXCLUIR") {
      return sendJson(res, { error: "Digite EXCLUIR para confirmar." }, 422);
    }

    const mode = body.mode === "account" ? "account" : "data";
    try {
      if (mode === "account") {
        deleteGabineteAccount(gabinete.id);
        clearCookie(res, "session_token");
        clearCookie(res, "active_gabinete_id");
        return sendJson(res, {
          account_deleted: true,
          message: "Conta do gabinete excluida.",
        });
      }

      const result = purgeGabineteOperationalData(gabinete.id);
      logAudit(gabinete.id, ctx.user.id, "delete", "gabinete_data", gabinete.id, null, {
        confirmation: "EXCLUIR",
        deleted: result,
      });
      return sendJson(res, {
        account_deleted: false,
        message: "Dados do gabinete excluidos.",
        deleted: result,
      });
    } catch (error) {
      return sendJson(res, { error: error.message || "Falha ao excluir dados." }, 422);
    }
  }

  if (pathname === "/api/imports" && req.method === "GET") {
    return sendJson(res, {
      items: listImports(gabinete.id),
      merge_suggestions: listContactMergeSuggestions(gabinete.id),
      fields: importFields(),
    });
  }

  if (pathname === "/api/imports/detect-duplicates" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const result = detectContactDuplicateSuggestions(db, gabinete.id, buildImportOptions({}, gabinete));
    logAudit(gabinete.id, ctx.user.id, "detect_duplicates", "contact", gabinete.id, null, result);
    return sendJson(res, { ok: true, result, merge_suggestions: listContactMergeSuggestions(gabinete.id) });
  }

  if (pathname === "/api/imports/merge-suggestions/merge-all" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const suggestions = listContactMergeSuggestions(gabinete.id, "pending", { limit: 0 }).filter((item) => item.confidence === "auto");
    const merged = [];
    const errors = [];
    suggestions.forEach((item) => {
      try {
        merged.push(mergeContactSuggestion(gabinete.id, item.id, ctx.user.id));
      } catch (error) {
        errors.push({ id: item.id, error: error.message || "Falha ao mesclar." });
      }
    });
    return sendJson(res, {
      ok: true,
      merged_count: merged.length,
      errors_count: errors.length,
      errors,
      merge_suggestions: listContactMergeSuggestions(gabinete.id),
    });
  }

  const mergeSuggestionActionMatch = pathname.match(/^\/api\/imports\/merge-suggestions\/(\d+)\/(merge|ignore)$/);
  if (mergeSuggestionActionMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const suggestionId = Number(mergeSuggestionActionMatch[1]);
    const action = mergeSuggestionActionMatch[2];
    try {
      const result = action === "merge"
        ? mergeContactSuggestion(gabinete.id, suggestionId, ctx.user.id)
        : ignoreContactMergeSuggestion(gabinete.id, suggestionId, ctx.user.id);
      return sendJson(res, { ok: true, result });
    } catch (error) {
      return sendJson(res, { error: error.message || "Nao foi possivel revisar esse conflito." }, 422);
    }
  }

  if (pathname === "/api/imports/template.csv" && req.method === "GET") {
    return sendCsv(
      res,
      "gabinete360-modelo-importacao.csv",
      buildImportTemplateRows(),
      [
        ["Nome", "name"],
        ["Tipo de contato", "contact_type"],
        ["Segmento", "segment"],
        ["Telefone", "phone"],
        ["WhatsApp", "whatsapp"],
        ["CPF/CNPJ", "cpf_rg_cns"],
        ["Nascimento", "birth_date"],
        ["Email", "email"],
        ["Profissao", "profession"],
        ["Demanda", "demand_title"],
        ["Descrição", "description"],
        ["Orientacao / Andamento", "guidance"],
        ["Fechamento / Resolucao", "result"],
        ["Atendente", "assigned_user"],
        ["Endereco", "address"],
        ["Numero", "number"],
        ["Bairro", "neighborhood"],
        ["CEP", "zip_code"],
        ["Cidade", "city"],
        ["UF", "uf"],
        ["Abertura", "opened_at"],
        ["Data de fechamento", "closed_at"],
        ["Status", "status"],
      ],
    );
  }

  if (pathname === "/api/imports/preview" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const { fields, files } = await parseMultipart(req);
    const file = files[0];
    if (!file) {
      return sendJson(res, { error: "Selecione um arquivo CSV ou XLSX." }, 422);
    }

    try {
      const importOptions = buildImportOptions(fields, gabinete);
      const parsed = parseSpreadsheetFile(file.path, file.filename);
      const mapping = suggestMapping(parsed.columns, parsed.rows);
      const stats = {
        ...(parsed.stats || {}),
        ...buildImportPreviewAnalysis(db, gabinete.id, parsed.rows, mapping, importOptions),
      };
      const warnings = [
        ...(parsed.warnings || []),
        ...buildImportAnalysisWarnings(stats),
      ];
      const importId = db.prepare(
        `
          INSERT INTO imports (
            gabinete_id, user_id, source_name, source_type, status, total_rows,
            imported_contacts, imported_tickets, duplicates_count, errors_count,
            summary_json, created_at
          ) VALUES (
            :gabinete_id, :user_id, :source_name, :source_type, 'preview', :total_rows,
            0, 0, 0, 0, :summary_json, :created_at
          )
        `,
      ).run({
        gabinete_id: gabinete.id,
        user_id: ctx.user.id,
        source_name: file.filename,
        source_type: file.type,
        total_rows: parsed.rows.length,
        summary_json: JSON.stringify({
          columns: parsed.columns,
          rows: parsed.rows,
          mapping,
          source_format: parsed.source_format || "spreadsheet",
          source_label: parsed.source_label || "Planilha",
          warnings,
          stats,
          import_options: importOptions,
        }),
        created_at: nowIso(),
      }).lastInsertRowid;

      return sendJson(res, {
        preview: {
          id: Number(importId),
          source_name: file.filename,
          total_rows: parsed.rows.length,
          columns: parsed.columns,
          rows: parsed.rows,
          mapping,
          source_format: parsed.source_format || "spreadsheet",
          source_label: parsed.source_label || "Planilha",
          warnings,
          stats,
          import_options: importOptions,
        },
        fields: importFields(),
      });
    } catch (error) {
      return sendJson(res, { error: `Falha ao ler a planilha: ${error.message}` }, 422);
    }
  }

  if (pathname === "/api/imports/confirm" && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const body = await parseBody(req);
    const importId = parseInteger(body.import_id);
    const importRecord = db
      .prepare("SELECT * FROM imports WHERE gabinete_id = :gabinete_id AND id = :id")
      .get({ gabinete_id: gabinete.id, id: importId });
    if (!importRecord) return sendJson(res, { error: "Preview nao encontrado." }, 404);
    if (importRecord.status !== "preview") {
      return sendJson(res, { error: "Esta simulacao ja foi processada." }, 422);
    }

    const draft = JSON.parse(importRecord.summary_json || "{}");
    const mapping = {};
    importFields().forEach((field) => {
      mapping[field] = body.mapping?.[field] || draft.mapping?.[field] || "";
    });

    let report;
    db.exec("BEGIN");
    try {
      report = buildImportReport(db, gabinete.id, ctx.user.id, draft.rows || [], mapping, {
        ...(draft.import_options || {}),
        import_id: importId,
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      return sendJson(res, { error: `Falha na importacao: ${error.message}` }, 422);
    }

    const confirmedAt = report.created_at || nowIso();
    const undoStatus = hasUndoableImportPayload(report) ? "available" : "not_available";
    db.prepare(
      `
        UPDATE imports
        SET status = :status,
            imported_contacts = :imported_contacts,
            imported_tickets = :imported_tickets,
            duplicates_count = :duplicates_count,
            errors_count = :errors_count,
            summary_json = :summary_json,
            confirmed_at = :confirmed_at,
            undo_status = :undo_status,
            undo_reason = :undo_reason
        WHERE id = :id AND gabinete_id = :gabinete_id
      `,
    ).run({
      id: importId,
      gabinete_id: gabinete.id,
      status: report.status,
      imported_contacts: report.imported_contacts,
      imported_tickets: report.imported_tickets,
      duplicates_count: report.duplicates_count,
      errors_count: report.errors_count,
      confirmed_at: confirmedAt,
      undo_status: undoStatus,
      undo_reason: undoStatus === "available" ? "" : "Nada novo foi criado ou atualizado nesta importacao.",
      summary_json: JSON.stringify({
        ...report,
        undo: {
          status: undoStatus,
          reason: undoStatus === "available" ? "" : "Nada novo foi criado ou atualizado nesta importacao.",
        },
        mapping,
        source_format: draft.source_format || "spreadsheet",
        source_label: draft.source_label || "Planilha",
        warnings: draft.warnings || [],
        stats: draft.stats || {},
        import_options: draft.import_options || {},
      }),
    });

    logAudit(gabinete.id, ctx.user.id, "import", "import", importId, null, {
      source_name: importRecord.source_name,
      imported_tickets: report.imported_tickets,
    });

    const savedImport = db
      .prepare("SELECT * FROM imports WHERE gabinete_id = :gabinete_id AND id = :id")
      .get({ gabinete_id: gabinete.id, id: importId });
    return sendJson(res, { report, import: decorateImportListItem(gabinete.id, savedImport) });
  }

  const undoImportMatch = pathname.match(/^\/api\/imports\/(\d+)\/undo$/);
  if (undoImportMatch && req.method === "POST") {
    if (!ensureApiCanEdit(ctx, res)) return;
    const importId = Number(undoImportMatch[1]);
    const importRecord = db
      .prepare("SELECT * FROM imports WHERE gabinete_id = :gabinete_id AND id = :id")
      .get({ gabinete_id: gabinete.id, id: importId });
    if (!importRecord) return sendJson(res, { error: "Importacao nao encontrada." }, 404);
    const analysis = analyzeImportUndo(gabinete.id, importRecord);
    if (!analysis.can_undo) {
      db.prepare(
        `
          UPDATE imports
          SET undo_status = CASE WHEN undo_status = 'available' THEN 'blocked' ELSE undo_status END,
              undo_reason = :undo_reason
          WHERE gabinete_id = :gabinete_id AND id = :id
        `,
      ).run({
        gabinete_id: gabinete.id,
        id: importId,
        undo_reason: analysis.reason,
      });
      return sendJson(res, { error: analysis.reason, analysis }, 422);
    }

    let result;
    db.exec("BEGIN");
    try {
      result = undoImport(gabinete.id, importRecord, ctx.user.id, analysis);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      return sendJson(res, { error: error.message || "Nao foi possivel desfazer esta importacao." }, 422);
    }

    logAudit(gabinete.id, ctx.user.id, "undo", "import", importId, importRecord, result);
    return sendJson(res, {
      ok: true,
      result,
      items: listImports(gabinete.id),
      merge_suggestions: listContactMergeSuggestions(gabinete.id),
    });
  }

  return sendJson(res, { error: "Rota da API nao encontrada." }, 404);
}

function ensureAuthenticated(ctx, res) {
  if (!ctx.user) {
    return redirect(res, "/app"), false;
  }
  return true;
}

function ensureSuperAdmin(ctx, res) {
  if (ctx.user?.role !== "super_admin") {
    redirect(res, "/app/dashboard");
    return false;
  }
  return true;
}

function ensureAuditAccess(ctx, res) {
  if (!ctx.user || !["super_admin", "gabinete_admin"].includes(ctx.user.role)) {
    setFlash(res, "error", "Apenas administradores podem acessar a auditoria.");
    redirect(res, "/app/dashboard");
    return false;
  }
  return true;
}

function ensureCanEdit(ctx, res) {
  if (!canEditRecords(ctx.user)) {
    setFlash(res, "error", "Seu perfil possui acesso apenas de leitura.");
    redirect(res, "/app/dashboard");
    return false;
  }
  return true;
}

function ensureCanManageSettings(ctx, res) {
  if (!canManageSettings(ctx.user)) {
    setFlash(res, "error", "Apenas administradores podem alterar configuracoes do gabinete.");
    redirect(res, "/app/configuracoes");
    return false;
  }
  return true;
}

function requireGabinete(ctx, res) {
  if (!ctx.gabinete) {
    setFlash(res, "error", "Nenhum gabinete disponivel para esta sessao.");
    redirect(res, "/app/dashboard");
    return null;
  }
  return ctx.gabinete;
}

function canEditRecords(user) {
  return user && user.role !== "viewer";
}

function canManageUsers(user) {
  return user && (user.role === "super_admin" || user.role === "gabinete_admin");
}

function canManageSettings(user) {
  return canManageUsers(user);
}

function setFlash(res, type, message) {
  setCookie(res, "flash", JSON.stringify({ type, message }), {
    maxAge: 10,
    httpOnly: false,
  });
}

function consumeFlash(res, cookies) {
  const value = cookies.flash;
  if (!value) return null;
  clearCookie(res, "flash");
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function listStatuses(gabineteId) {
  return db
    .prepare(
      `
        SELECT *
        FROM status_custom
        WHERE gabinete_id = :gabinete_id AND active = 1
        ORDER BY sort_order, name
      `,
    )
    .all({ gabinete_id: gabineteId });
}

function listCategories(gabineteId) {
  return db
    .prepare(
      `
        SELECT *
        FROM categories
        WHERE gabinete_id = :gabinete_id AND active = 1
        ORDER BY name
      `,
    )
    .all({ gabinete_id: gabineteId });
}

function listChannels(gabineteId) {
  return db
    .prepare(
      `
        SELECT *
        FROM channels
        WHERE gabinete_id = :gabinete_id AND active = 1
        ORDER BY name
      `,
    )
    .all({ gabinete_id: gabineteId });
}

const SETTINGS_LIST_COLORS = [
  "#2563eb",
  "#0f766e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#64748b",
  "#16a34a",
];

function normalizeSettingsListItems(items, options = {}) {
  const max = options.max || 40;
  const seen = new Set();
  const normalized = [];

  if (!Array.isArray(items)) return normalized;

  items.slice(0, max).forEach((item, index) => {
    const name = String(item?.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name) return;
    const key = normalizeTextKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({
      id: parseInteger(item?.id, 0),
      name,
      color: /^#[0-9a-f]{6}$/i.test(String(item?.color || ""))
        ? String(item.color)
        : SETTINGS_LIST_COLORS[index % SETTINGS_LIST_COLORS.length],
      sort_order: index + 1,
      is_final: Boolean(toFlag(item?.is_final)),
    });
  });

  return normalized;
}

function replaceSettingsLists(gabineteId, payload = {}) {
  const updatedAt = nowIso();
  const statuses = normalizeSettingsListItems(payload.statuses);
  const categories = normalizeSettingsListItems(payload.categories);
  const channels = normalizeSettingsListItems(payload.channels);

  if (!statuses.length) throw new Error("Mantenha pelo menos um status.");
  if (!categories.length) throw new Error("Mantenha pelo menos uma categoria.");
  if (!channels.length) throw new Error("Mantenha pelo menos um canal.");

  let transactionOpen = false;
  db.exec("BEGIN");
  transactionOpen = true;
  try {
    db.prepare("UPDATE status_custom SET active = 0, updated_at = :updated_at WHERE gabinete_id = :gabinete_id").run({
      gabinete_id: gabineteId,
      updated_at: updatedAt,
    });
    db.prepare("UPDATE categories SET active = 0, updated_at = :updated_at WHERE gabinete_id = :gabinete_id").run({
      gabinete_id: gabineteId,
      updated_at: updatedAt,
    });
    db.prepare("UPDATE channels SET active = 0, updated_at = :updated_at WHERE gabinete_id = :gabinete_id").run({
      gabinete_id: gabineteId,
      updated_at: updatedAt,
    });

    statuses.forEach((item) => {
      const current = item.id
        ? db.prepare("SELECT id FROM status_custom WHERE gabinete_id = :gabinete_id AND id = :id").get({
            gabinete_id: gabineteId,
            id: item.id,
          })
        : null;
      if (current) {
        db.prepare(
          `
            UPDATE status_custom
            SET name = :name,
                color = :color,
                sort_order = :sort_order,
                is_final = :is_final,
                active = 1,
                updated_at = :updated_at
            WHERE gabinete_id = :gabinete_id AND id = :id
          `,
        ).run({
          ...item,
          is_final: item.is_final ? 1 : 0,
          gabinete_id: gabineteId,
          updated_at: updatedAt,
        });
      } else {
        db.prepare(
          `
            INSERT INTO status_custom (gabinete_id, name, color, sort_order, is_final, active, created_at, updated_at)
            VALUES (:gabinete_id, :name, :color, :sort_order, :is_final, 1, :created_at, :updated_at)
          `,
        ).run({
          gabinete_id: gabineteId,
          name: item.name,
          color: item.color,
          sort_order: item.sort_order,
          is_final: item.is_final ? 1 : 0,
          created_at: updatedAt,
          updated_at: updatedAt,
        });
      }
    });

    categories.forEach((item) => {
      const current = item.id
        ? db.prepare("SELECT id FROM categories WHERE gabinete_id = :gabinete_id AND id = :id").get({
            gabinete_id: gabineteId,
            id: item.id,
          })
        : null;
      if (current) {
        db.prepare(
          `
            UPDATE categories
            SET name = :name,
                color = :color,
                active = 1,
                updated_at = :updated_at
            WHERE gabinete_id = :gabinete_id AND id = :id
          `,
        ).run({
          id: item.id,
          gabinete_id: gabineteId,
          name: item.name,
          color: item.color,
          updated_at: updatedAt,
        });
      } else {
        db.prepare(
          `
            INSERT INTO categories (gabinete_id, name, color, active, created_at, updated_at)
            VALUES (:gabinete_id, :name, :color, 1, :created_at, :updated_at)
          `,
        ).run({
          gabinete_id: gabineteId,
          name: item.name,
          color: item.color,
          created_at: updatedAt,
          updated_at: updatedAt,
        });
      }
    });

    channels.forEach((item) => {
      const current = item.id
        ? db.prepare("SELECT id FROM channels WHERE gabinete_id = :gabinete_id AND id = :id").get({
            gabinete_id: gabineteId,
            id: item.id,
          })
        : null;
      if (current) {
        db.prepare(
          `
            UPDATE channels
            SET name = :name,
                active = 1,
                updated_at = :updated_at
            WHERE gabinete_id = :gabinete_id AND id = :id
          `,
        ).run({
          id: item.id,
          gabinete_id: gabineteId,
          name: item.name,
          updated_at: updatedAt,
        });
      } else {
        db.prepare(
          `
            INSERT INTO channels (gabinete_id, name, active, created_at, updated_at)
            VALUES (:gabinete_id, :name, 1, :created_at, :updated_at)
          `,
        ).run({
          gabinete_id: gabineteId,
          name: item.name,
          created_at: updatedAt,
          updated_at: updatedAt,
        });
      }
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function inferFinalStatusFlag(name, fallback = false) {
  const normalized = normalizeTextKey(name);
  return fallback
    || [
      "finalizado",
      "fechado",
      "encerrado",
      "resolvido",
      "concluido",
      "oficio encaminhado",
      "indicacao requerimento",
    ].some((word) => normalized.includes(word));
}

function ensureStatusValue(gabineteId, name, options = {}) {
  const label = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!label) return "";
  const key = normalizeTextKey(label);
  const existing = db
    .prepare("SELECT id, name FROM status_custom WHERE gabinete_id = :gabinete_id")
    .all({ gabinete_id: gabineteId })
    .find((item) => normalizeTextKey(item.name) === key);
  const updatedAt = nowIso();
  if (existing) {
    db.prepare("UPDATE status_custom SET active = 1, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND id = :id")
      .run({ gabinete_id: gabineteId, id: existing.id, updated_at: updatedAt });
    return existing.name;
  }
  const nextOrder = (db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM status_custom WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId })?.next_order) || 1;
  db.prepare(
    `
      INSERT INTO status_custom (gabinete_id, name, color, sort_order, is_final, active, created_at, updated_at)
      VALUES (:gabinete_id, :name, :color, :sort_order, :is_final, 1, :created_at, :updated_at)
    `,
  ).run({
    gabinete_id: gabineteId,
    name: label,
    color: options.color || SETTINGS_LIST_COLORS[(nextOrder - 1) % SETTINGS_LIST_COLORS.length],
    sort_order: nextOrder,
    is_final: inferFinalStatusFlag(label, toFlag(options.is_final) === 1) ? 1 : 0,
    created_at: updatedAt,
    updated_at: updatedAt,
  });
  return label;
}

function ensureChannelValue(gabineteId, name) {
  const label = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!label) return "";
  const key = normalizeTextKey(label);
  const existing = db
    .prepare("SELECT id, name FROM channels WHERE gabinete_id = :gabinete_id")
    .all({ gabinete_id: gabineteId })
    .find((item) => normalizeTextKey(item.name) === key);
  const updatedAt = nowIso();
  if (existing) {
    db.prepare("UPDATE channels SET active = 1, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND id = :id")
      .run({ gabinete_id: gabineteId, id: existing.id, updated_at: updatedAt });
    return existing.name;
  }
  db.prepare(
    "INSERT INTO channels (gabinete_id, name, active, created_at, updated_at) VALUES (:gabinete_id, :name, 1, :created_at, :updated_at)",
  ).run({ gabinete_id: gabineteId, name: label, created_at: updatedAt, updated_at: updatedAt });
  return label;
}

function ensureCategoryValue(gabineteId, name, options = {}) {
  const label = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!label) return "";
  const key = normalizeTextKey(label);
  const existing = db
    .prepare("SELECT id, name FROM categories WHERE gabinete_id = :gabinete_id")
    .all({ gabinete_id: gabineteId })
    .find((item) => normalizeTextKey(item.name) === key);
  const updatedAt = nowIso();
  if (existing) {
    db.prepare("UPDATE categories SET active = 1, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND id = :id")
      .run({ gabinete_id: gabineteId, id: existing.id, updated_at: updatedAt });
    return existing.name;
  }
  db.prepare(
    "INSERT INTO categories (gabinete_id, name, color, active, created_at, updated_at) VALUES (:gabinete_id, :name, :color, 1, :created_at, :updated_at)",
  ).run({
    gabinete_id: gabineteId,
    name: label,
    color: options.color || SETTINGS_LIST_COLORS[0],
    created_at: updatedAt,
    updated_at: updatedAt,
  });
  return label;
}

function ensureTicketLookupValues(gabineteId, body = {}) {
  const channel = ensureChannelValue(gabineteId, body.channel);
  const status = ensureStatusValue(gabineteId, body.status, { is_final: body.status_is_final });
  const demandCategory = ensureCategoryValue(gabineteId, body.demand_category);
  if (channel) body.channel = channel;
  if (status) body.status = status;
  if (demandCategory) body.demand_category = demandCategory;
  return body;
}

function listWhatsappTemplates(gabineteId) {
  return db
    .prepare(
      `
        SELECT *
        FROM whatsapp_templates
        WHERE gabinete_id = :gabinete_id AND active = 1
        ORDER BY title
      `,
    )
    .all({ gabinete_id: gabineteId });
}

function getScopedWhatsappTemplate(gabineteId, templateId) {
  return db
    .prepare(
      `
        SELECT *
        FROM whatsapp_templates
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    )
    .get({ gabinete_id: gabineteId, id: templateId });
}

function getGabineteById(gabineteId) {
  return db.prepare("SELECT * FROM gabinetes WHERE id = :id").get({ id: gabineteId }) || null;
}

function buildDefaultEvolutionInstanceName(gabinete) {
  const emailLocal = String(gabinete?.email || "")
    .trim()
    .toLowerCase()
    .split("@")[0];
  const segments = [
    slugify(emailLocal),
    slugify(gabinete?.responsible_name || ""),
    slugify(gabinete?.public_slug || gabinete?.slug || gabinete?.city || gabinete?.name || "gabinete"),
  ].filter(Boolean);
  const base = [...new Set(segments)].join("-") || "gabinete";
  const suffix = gabinete?.id ? `-${gabinete.id}` : "";
  return `g360-${base}${suffix}`.replace(/-+/g, "-").slice(0, 60);
}

function sanitizeEvolutionInstanceName(value, gabinete = null) {
  const normalized = slugify(value || "").replace(/-+/g, "-").slice(0, 60);
  if (normalized) return normalized;
  return gabinete ? buildDefaultEvolutionInstanceName(gabinete) : "";
}

function buildWhatsappLink(phone, text = "") {
  const digits = normalizePhone(phone);
  if (!digits) return "";
  const target = digits.length <= 11 ? `55${digits}` : digits;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${target}${query}`;
}

function normalizePublicTrackingCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
}

function randomTrackingChunk(length = 6) {
  const bytes = randomBytes(length);
  return [...bytes]
    .map((byte) => PUBLIC_TRACKING_ALPHABET[byte % PUBLIC_TRACKING_ALPHABET.length])
    .join("");
}

function generatePublicTrackingCode() {
  const year = currentDate().slice(0, 4) || String(new Date().getFullYear());
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `GAB-${year}-${randomTrackingChunk(6)}`;
    const existing = db
      .prepare("SELECT id FROM tickets WHERE public_tracking_code = :code")
      .get({ code });
    if (!existing) return code;
  }
  return `GAB-${year}-${createSessionToken().slice(0, 8).toUpperCase()}`;
}

function generatePublicTrackingAccessCode() {
  const value = randomBytes(4).readUInt32BE(0) % 900000;
  return String(value + 100000);
}

function publicStatusFromTicket(ticket = {}) {
  if (ticket.public_status) return ticket.public_status;
  if (ticket.closed_at) return "Concluido pelo gabinete";
  const normalized = normalizePlainText(ticket.status || "");
  if (normalized.includes("aguard")) return "Em acompanhamento";
  if (normalized.includes("protocol")) return "Protocolado";
  if (normalized.includes("final") || normalized.includes("resol")) return "Concluido pelo gabinete";
  return "Recebido pelo gabinete";
}

function buildPublicTrackingUrl(req, code) {
  const origin = String(process.env.GABINETE360_PUBLIC_URL || getRequestOrigin(req)).replace(/\/+$/, "");
  return `${origin}/acompanhamento/${encodeURIComponent(code)}`;
}

function generateFinanceShareCode() {
  const year = currentDate().slice(0, 4) || String(new Date().getFullYear());
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `FIN-${year}-${randomTrackingChunk(6)}`;
    const existing = db
      .prepare("SELECT id FROM finance_entries WHERE public_share_code = :code")
      .get({ code });
    if (!existing) return code;
  }
  return `FIN-${year}-${createSessionToken().slice(0, 8).toUpperCase()}`;
}

function buildFinanceShareUrl(req, code) {
  const origin = String(process.env.GABINETE360_PUBLIC_URL || getRequestOrigin(req)).replace(/\/+$/, "");
  return `${origin}/comprovante/${encodeURIComponent(code)}`;
}

function normalizeFinanceShareOptions(body = {}) {
  const rawMode = String(body.mode || body.public_share_mode || body.share_mode || "").trim().toLowerCase();
  const mode = ["temporary", "temporario", "temporário", "timed", "one_time", "unico", "único"].includes(rawMode)
    ? "temporary"
    : "normal";
  const viewSeconds = mode === "temporary"
    ? Math.min(300, Math.max(5, parseInteger(body.view_seconds ?? body.public_share_view_seconds, 10) || 10))
    : 0;
  return {
    mode,
    view_seconds: viewSeconds,
    one_time: mode === "temporary" ? toFlag(body.one_time ?? body.public_share_one_time ?? true) : 0,
  };
}

const PUBLIC_SHARE_MAX_GENERATIONS = 5;
const PUBLIC_SHARE_MAX_FAILED_ATTEMPTS = 3;

function assertPublicShareGenerationAllowed(currentCount, label) {
  if (Number(currentCount || 0) >= PUBLIC_SHARE_MAX_GENERATIONS) {
    throw new Error(`Limite de ${PUBLIC_SHARE_MAX_GENERATIONS} geracoes de ${label} atingido para este registro.`);
  }
}

function failedPasswordResponseMessage(nextCount) {
  if (nextCount >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS) {
    return "Senha incorreta. O link foi bloqueado apos 3 tentativas erradas.";
  }
  const remaining = PUBLIC_SHARE_MAX_FAILED_ATTEMPTS - nextCount;
  return `Senha de acesso nao confere. Restam ${remaining} tentativa(s).`;
}

function addSecondsToIso(value, seconds) {
  const base = value ? new Date(value) : new Date();
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(safeBase.getTime() + Number(seconds || 0) * 1000).toISOString();
}

function getFinanceShareExpiresAt(record) {
  if (String(record?.public_share_mode || "normal") !== "temporary") return "";
  const viewSeconds = Math.min(300, Math.max(5, Number(record.public_share_view_seconds || 10)));
  if (record.public_share_expires_at) return record.public_share_expires_at;
  if (record.public_share_opened_at) return addSecondsToIso(record.public_share_opened_at, viewSeconds);
  return "";
}

function expireFinanceShare(record) {
  if (!record?.id) return;
  const timestamp = nowIso();
  db.prepare(
    `
      UPDATE finance_entries
      SET public_share_enabled = 0,
          public_share_code = '',
          public_share_secret_hash = '',
          public_share_secret_hint = '',
          public_share_consumed_at = COALESCE(NULLIF(public_share_consumed_at, ''), :timestamp),
          public_share_updated_at = :timestamp,
          updated_at = :timestamp
      WHERE id = :entry_id
    `,
  ).run({
    entry_id: record.id,
    timestamp,
  });
}

function getFinanceShareUnavailableReason(record) {
  if (!record?.public_share_enabled || !record.public_share_code) {
    return { status: 404, error: "Comprovante nao encontrado." };
  }
  if (Number(record.public_share_failed_attempts || 0) >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS) {
    expireFinanceShare(record);
    return { status: 410, error: "Este link foi bloqueado por tentativas erradas." };
  }
  const expiresAtValue = getFinanceShareExpiresAt(record);
  if (expiresAtValue) {
    const expiresAt = new Date(expiresAtValue);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      expireFinanceShare(record);
      return { status: 410, error: "Este link expirou." };
    }
  }
  if (String(record.public_share_mode || "normal") === "temporary" && toFlag(record.public_share_one_time) === 1 && record.public_share_consumed_at) {
    return { status: 410, error: "Este link ja foi visualizado." };
  }
  return null;
}

function registerFinanceShareAccess(record) {
  const mode = String(record.public_share_mode || "normal") === "temporary" ? "temporary" : "normal";
  const viewSeconds = mode === "temporary" ? Math.min(300, Math.max(5, Number(record.public_share_view_seconds || 10))) : 0;
  const openedAt = nowIso();
  const firstOpenedAt = mode === "temporary" && record.public_share_opened_at ? record.public_share_opened_at : openedAt;
  const viewUntil = viewSeconds ? getFinanceShareExpiresAt(record) || addSecondsToIso(firstOpenedAt, viewSeconds) : "";
  db.prepare(
    `
      UPDATE finance_entries
      SET public_share_opened_at = CASE
            WHEN :keep_opened_at = 1 THEN public_share_opened_at
            ELSE :public_share_opened_at
          END,
          public_share_expires_at = :public_share_expires_at,
          public_share_consumed_at = CASE
            WHEN :consume = 1 THEN :public_share_opened_at
            ELSE public_share_consumed_at
          END,
          public_share_failed_attempts = 0,
          public_share_access_count = COALESCE(public_share_access_count, 0) + 1
      WHERE id = :entry_id
    `,
  ).run({
    entry_id: record.id,
    public_share_opened_at: openedAt,
    public_share_expires_at: viewUntil,
    keep_opened_at: mode === "temporary" && record.public_share_opened_at ? 1 : 0,
    consume: mode === "temporary" && toFlag(record.public_share_one_time) === 1 ? 1 : 0,
  });
  return {
    opened_at: firstOpenedAt,
    view_seconds: viewSeconds,
    view_until: viewUntil,
  };
}

function registerFinanceShareFailedAttempt(record) {
  const nextCount = Number(record?.public_share_failed_attempts || 0) + 1;
  db.prepare(
    `
      UPDATE finance_entries
      SET public_share_failed_attempts = :failed_attempts,
          public_share_updated_at = :updated_at,
          updated_at = :updated_at
      WHERE id = :entry_id
    `,
  ).run({
    entry_id: record.id,
    failed_attempts: nextCount,
    updated_at: nowIso(),
  });
  if (nextCount >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS) {
    expireFinanceShare(record);
  }
  return nextCount;
}

function serializeFinanceShare(entry, req, accessCode = "") {
  if (entry?.public_share_enabled && entry.public_share_code) {
    const expiresAtValue = getFinanceShareExpiresAt(entry);
    const expiresAt = expiresAtValue ? new Date(expiresAtValue) : null;
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      expireFinanceShare(entry);
      return {
        enabled: false,
        code: "",
        url: "",
        access_code: accessCode,
        secret_hint: "",
        updated_at: nowIso(),
        mode: "normal",
        view_seconds: 10,
        one_time: false,
        opened_at: "",
        consumed_at: "",
      };
    }
  }
  if (!entry?.public_share_code) {
    return {
      enabled: false,
      code: "",
      url: "",
      access_code: accessCode,
      secret_hint: "",
      updated_at: "",
      mode: "normal",
      view_seconds: 10,
      one_time: false,
      opened_at: "",
      consumed_at: "",
    };
  }
  const mode = String(entry.public_share_mode || "normal") === "temporary" ? "temporary" : "normal";
  return {
    enabled: Boolean(entry.public_share_enabled),
    code: entry.public_share_code,
    url: buildFinanceShareUrl(req, entry.public_share_code),
    access_code: accessCode,
    secret_hint: entry.public_share_secret_hint || "",
    updated_at: entry.public_share_updated_at || entry.updated_at || "",
    mode,
    view_seconds: mode === "temporary" ? Math.min(300, Math.max(5, Number(entry.public_share_view_seconds || 10))) : 10,
    one_time: Boolean(entry.public_share_one_time),
    opened_at: entry.public_share_opened_at || "",
    consumed_at: entry.public_share_consumed_at || "",
  };
}

function enableFinancePublicShare(gabineteId, entryId, options = {}) {
  const entry = getScopedFinanceEntry(gabineteId, entryId);
  if (!entry) throw new Error("Lancamento nao encontrado.");

  const shareOptions = normalizeFinanceShareOptions(options);
  const regenerate = Boolean(options.regenerate);
  const accessCode = generatePublicTrackingAccessCode();
  const timestamp = nowIso();
  const existingCode = normalizePublicTrackingCode(entry.public_share_code);
  const generatesLink = regenerate || !existingCode || !entry.public_share_enabled;
  assertPublicShareGenerationAllowed(entry.public_share_secret_generation_count, "senha");
  if (generatesLink) assertPublicShareGenerationAllowed(entry.public_share_link_generation_count, "link");
  const code = generatesLink ? generateFinanceShareCode() : existingCode;

  db.prepare(
    `
      UPDATE finance_entries
      SET public_share_enabled = 1,
          public_share_code = :public_share_code,
          public_share_secret_hash = :public_share_secret_hash,
          public_share_secret_hint = :public_share_secret_hint,
          public_share_created_at = :public_share_created_at,
          public_share_updated_at = :public_share_updated_at,
          public_share_mode = :public_share_mode,
          public_share_view_seconds = :public_share_view_seconds,
          public_share_one_time = :public_share_one_time,
          public_share_expires_at = '',
          public_share_opened_at = '',
          public_share_consumed_at = '',
          public_share_access_count = 0,
          public_share_failed_attempts = 0,
          public_share_link_generation_count = COALESCE(public_share_link_generation_count, 0) + :public_share_link_increment,
          public_share_secret_generation_count = COALESCE(public_share_secret_generation_count, 0) + 1,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :entry_id
    `,
  ).run({
    gabinete_id: gabineteId,
    entry_id: entryId,
    public_share_code: code,
    public_share_secret_hash: hashPassword(accessCode),
    public_share_secret_hint: `final ${accessCode.slice(-2)}`,
    public_share_created_at: regenerate || !entry.public_share_created_at ? timestamp : entry.public_share_created_at,
    public_share_updated_at: timestamp,
    public_share_mode: shareOptions.mode,
    public_share_view_seconds: shareOptions.mode === "temporary" ? shareOptions.view_seconds : 0,
    public_share_one_time: shareOptions.one_time,
    public_share_link_increment: generatesLink ? 1 : 0,
    updated_at: timestamp,
  });

  return {
    ...getScopedFinanceEntry(gabineteId, entryId),
    access_code: accessCode,
  };
}

function getPublicFinanceShareRecord(code) {
  return db
    .prepare(
      `
        SELECT
          fe.*,
          g.name AS gabinete_name,
          g.type AS gabinete_type,
          g.city AS gabinete_city,
          g.uf AS gabinete_uf,
          g.logo_url AS gabinete_logo_url
        FROM finance_entries fe
        JOIN gabinetes g ON g.id = fe.gabinete_id
        WHERE fe.public_share_enabled = 1
          AND ${activeRowWhere("fe")}
          AND g.status = 'active'
          AND upper(fe.public_share_code) = upper(:code)
        LIMIT 1
      `,
    )
    .get({ code: normalizePublicTrackingCode(code) });
}

function serializePublicFinanceShare(record, options = {}) {
  const gabinete = {
    name: record.gabinete_name,
    type: record.gabinete_type,
    city: record.gabinete_city,
    uf: record.gabinete_uf,
    logo_url: record.gabinete_logo_url,
  };
  const mode = String(record.public_share_mode || "normal") === "temporary" ? "temporary" : "normal";
  const viewSeconds = mode === "temporary" ? Math.min(300, Math.max(5, Number(record.public_share_view_seconds || 10))) : 0;
  const access = options.access || {};
  if (!options.includeEntry) {
    return {
      code: record.public_share_code,
      mode,
      one_time: Boolean(record.public_share_one_time),
      view_seconds: viewSeconds,
      gabinete,
    };
  }
  const receiptFile = readFinanceReceiptFile(record);
  return {
    code: record.public_share_code,
    mode,
    one_time: Boolean(record.public_share_one_time),
    view_seconds: viewSeconds,
    view_until: access.view_until || "",
    opened_at: access.opened_at || record.public_share_opened_at || "",
    title: record.title,
    entry_type: record.entry_type,
    category: record.category || "",
    description: record.description || "",
    amount_cents: Number(record.amount_cents || 0),
    entry_date: record.entry_date,
    person: record.status || "",
    notes: record.notes || "",
    created_at: record.created_at,
    updated_at: record.updated_at,
    gabinete,
    receipt: receiptFile
      ? {
          data_url: `data:${receiptFile.mime_type};base64,${receiptFile.buffer.toString("base64")}`,
          name: receiptFile.file_name,
          type: receiptFile.mime_type,
          size: Number(record.receipt_file_size || 0),
        }
      : null,
  };
}

const PUBLIC_ENTITY_SHARE_CONFIG = {
  ticket: { label: "Atendimento", prefix: "ATD" },
  contact: { label: "Contato", prefix: "CTT", editable: true },
  document: { label: "Documento", prefix: "DOC" },
  project: { label: "Propositura", prefix: "PRO" },
  note: { label: "Nota", prefix: "NOTA", editable: true },
};

function normalizePublicEntityType(value) {
  const normalized = normalizePlainText(value || "").replaceAll(" ", "_").replaceAll("-", "_");
  if (["ticket", "tickets", "atendimento", "atendimentos"].includes(normalized)) return "ticket";
  if (["contact", "contacts", "contato", "contatos"].includes(normalized)) return "contact";
  if (["document", "documents", "documento", "documentos", "oficio", "oficios"].includes(normalized)) return "document";
  if (["project", "projects", "projeto", "projetos", "propositura", "proposituras"].includes(normalized)) return "project";
  if (["note", "notes", "nota", "notas", "anotacao", "anotacoes", "anotacao_interna"].includes(normalized)) return "note";
  return "";
}

function getPublicEntityShareConfig(entityType) {
  return PUBLIC_ENTITY_SHARE_CONFIG[normalizePublicEntityType(entityType)] || null;
}

function buildPublicEntityShareUrl(req, code) {
  const origin = String(process.env.GABINETE360_PUBLIC_URL || getRequestOrigin(req)).replace(/\/+$/, "");
  return `${origin}/compartilhar/${encodeURIComponent(code)}`;
}

function generatePublicEntityShareCode(entityType) {
  const config = getPublicEntityShareConfig(entityType);
  const prefix = config?.prefix || "GAB";
  const year = currentDate().slice(0, 4) || String(new Date().getFullYear());
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `${prefix}-${year}-${randomTrackingChunk(6)}`;
    const existing = db
      .prepare("SELECT id FROM public_entity_shares WHERE upper(share_code) = upper(:code)")
      .get({ code });
    if (!existing) return code;
  }
  return `${prefix}-${year}-${createSessionToken().slice(0, 8).toUpperCase()}`;
}

function normalizeEntityShareOptions(body = {}, entityType = "") {
  const rawMode = String(body.mode || body.share_mode || "").trim().toLowerCase();
  const mode = ["temporary", "temporario", "temporário", "timed", "one_time", "unico", "único"].includes(rawMode)
    ? "temporary"
    : "normal";
  const viewSeconds = mode === "temporary"
    ? Math.min(300, Math.max(5, parseInteger(body.view_seconds, 10) || 10))
    : 0;
  const rawAccess = String(body.access_level || body.permission || "").trim().toLowerCase();
  const shareConfig = getPublicEntityShareConfig(entityType);
  const hasEditAccess = (shareConfig?.editable || false) && ["edit", "editar", "edicao", "edição"].includes(rawAccess);
  const accessLevel = hasEditAccess
    ? "edit"
    : "view";
  return {
    access_level: accessLevel,
    mode,
    view_seconds: viewSeconds,
    one_time: mode === "temporary" ? toFlag(body.one_time ?? true) : 0,
  };
}

function getScopedShareEntity(gabineteId, entityType, entityId) {
  const type = normalizePublicEntityType(entityType);
  if (type === "ticket") return getScopedTicket(gabineteId, entityId);
  if (type === "contact") {
    const contact = getScopedContact(gabineteId, entityId);
    return contact && !contact.deleted_at ? contact : null;
  }
  if (type === "document") return getScopedDocument(gabineteId, entityId);
  if (type === "project") return getScopedProject(gabineteId, entityId);
  if (type === "note") return getScopedNote(gabineteId, entityId);
  return null;
}

function getEntityShareByEntity(gabineteId, entityType, entityId) {
  const type = normalizePublicEntityType(entityType);
  if (!type || !entityId) return null;
  return db
    .prepare(
      `
        SELECT *
        FROM public_entity_shares
        WHERE gabinete_id = :gabinete_id
          AND entity_type = :entity_type
          AND entity_id = :entity_id
        ORDER BY enabled DESC, updated_at DESC, id DESC
        LIMIT 1
      `,
    )
    .get({ gabinete_id: gabineteId, entity_type: type, entity_id: entityId });
}

function getEntityShareExpiresAt(record) {
  if (String(record?.share_mode || "normal") !== "temporary") return "";
  const viewSeconds = Math.min(300, Math.max(5, Number(record.view_seconds || 10)));
  if (record.expires_at) return record.expires_at;
  if (record.opened_at) return addSecondsToIso(record.opened_at, viewSeconds);
  return "";
}

function expireEntityShare(record) {
  if (!record?.id) return;
  const timestamp = nowIso();
  db.prepare(
    `
      UPDATE public_entity_shares
      SET enabled = 0,
          share_code = '',
          secret_hash = '',
          secret_hint = '',
          consumed_at = COALESCE(NULLIF(consumed_at, ''), :timestamp),
          updated_at = :timestamp
      WHERE id = :share_id
    `,
  ).run({
    share_id: record.id,
    timestamp,
  });
}

function getEntityShareUnavailableReason(record, options = {}) {
  if (!record?.enabled || !record.share_code) {
    return { status: 404, error: "Link nao encontrado." };
  }
  if (Number(record.failed_access_count || 0) >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS) {
    expireEntityShare(record);
    return { status: 410, error: "Este link foi bloqueado por tentativas erradas." };
  }
  const expiresAtValue = getEntityShareExpiresAt(record);
  if (expiresAtValue) {
    const expiresAt = new Date(expiresAtValue);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      expireEntityShare(record);
      return { status: 410, error: "Este link expirou." };
    }
  }
  if (!options.allowConsumed && String(record.share_mode || "normal") === "temporary" && toFlag(record.one_time) === 1 && record.consumed_at) {
    return { status: 410, error: "Este link ja foi visualizado." };
  }
  return null;
}

function registerEntityShareAccess(record) {
  const mode = String(record.share_mode || "normal") === "temporary" ? "temporary" : "normal";
  const viewSeconds = mode === "temporary" ? Math.min(300, Math.max(5, Number(record.view_seconds || 10))) : 0;
  const openedAt = nowIso();
  const firstOpenedAt = mode === "temporary" && record.opened_at ? record.opened_at : openedAt;
  const viewUntil = viewSeconds ? getEntityShareExpiresAt(record) || addSecondsToIso(firstOpenedAt, viewSeconds) : "";
  db.prepare(
    `
      UPDATE public_entity_shares
      SET opened_at = CASE
            WHEN :keep_opened_at = 1 THEN opened_at
            ELSE :opened_at
          END,
          expires_at = :expires_at,
          consumed_at = CASE
            WHEN :consume = 1 THEN :opened_at
            ELSE consumed_at
          END,
          failed_access_count = 0,
          access_count = COALESCE(access_count, 0) + 1
      WHERE id = :share_id
    `,
  ).run({
    share_id: record.id,
    opened_at: openedAt,
    expires_at: viewUntil,
    keep_opened_at: mode === "temporary" && record.opened_at ? 1 : 0,
    consume: mode === "temporary" && toFlag(record.one_time) === 1 ? 1 : 0,
  });
  return {
    opened_at: firstOpenedAt,
    view_seconds: viewSeconds,
    view_until: viewUntil,
  };
}

function registerEntityShareFailedAttempt(record) {
  const nextCount = Number(record?.failed_access_count || 0) + 1;
  db.prepare(
    `
      UPDATE public_entity_shares
      SET failed_access_count = :failed_attempts,
          updated_at = :updated_at
      WHERE id = :share_id
    `,
  ).run({
    share_id: record.id,
    failed_attempts: nextCount,
    updated_at: nowIso(),
  });
  if (nextCount >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS) {
    expireEntityShare(record);
  }
  return nextCount;
}

function serializeInternalEntityShare(share, req, accessCode = "") {
  if (share?.enabled && share.share_code) {
    const unavailable = getEntityShareUnavailableReason(share);
    if (unavailable) {
      return {
        enabled: false,
        code: "",
        url: "",
        access_code: accessCode,
        secret_hint: "",
        mode: "normal",
        view_seconds: 10,
        one_time: false,
        access_level: "view",
        opened_at: "",
        consumed_at: "",
      };
    }
  }
  if (!share?.share_code) {
    return {
      enabled: false,
      code: "",
      url: "",
      access_code: accessCode,
      secret_hint: "",
      mode: "normal",
      view_seconds: 10,
      one_time: false,
      access_level: "view",
      opened_at: "",
      consumed_at: "",
    };
  }
  const mode = String(share.share_mode || "normal") === "temporary" ? "temporary" : "normal";
  return {
    enabled: Boolean(share.enabled),
    code: share.share_code,
    url: buildPublicEntityShareUrl(req, share.share_code),
    access_code: accessCode,
    secret_hint: share.secret_hint || "",
    updated_at: share.updated_at || "",
    mode,
    view_seconds: mode === "temporary" ? Math.min(300, Math.max(5, Number(share.view_seconds || 10))) : 10,
    one_time: Boolean(share.one_time),
    access_level: share.access_level === "edit" ? "edit" : "view",
    opened_at: share.opened_at || "",
    consumed_at: share.consumed_at || "",
  };
}

function enableEntityPublicShare(gabineteId, entityType, entityId, userId = null, options = {}) {
  const type = normalizePublicEntityType(entityType);
  const config = getPublicEntityShareConfig(type);
  if (!config) throw new Error("Tipo de compartilhamento invalido.");
  const entity = getScopedShareEntity(gabineteId, type, entityId);
  if (!entity) throw new Error("Registro nao encontrado.");

  const shareOptions = normalizeEntityShareOptions(options, type);
  const currentShare = getEntityShareByEntity(gabineteId, type, entityId);
  const regenerate = Boolean(options.regenerate);
  const accessCode = generatePublicTrackingAccessCode();
  const timestamp = nowIso();
  const existingCode = normalizePublicTrackingCode(currentShare?.share_code || "");
  const generatesLink = regenerate || !existingCode || !currentShare?.enabled;
  assertPublicShareGenerationAllowed(currentShare?.secret_generation_count || 0, "senha");
  if (generatesLink) assertPublicShareGenerationAllowed(currentShare?.link_generation_count || 0, "link");
  const code = generatesLink ? generatePublicEntityShareCode(type) : existingCode;

  if (currentShare?.id) {
    db.prepare(
      `
        UPDATE public_entity_shares
        SET enabled = 1,
            share_code = :share_code,
            secret_hash = :secret_hash,
            secret_hint = :secret_hint,
            access_level = :access_level,
            share_mode = :share_mode,
            view_seconds = :view_seconds,
            one_time = :one_time,
            expires_at = '',
            opened_at = '',
            consumed_at = '',
            access_count = 0,
            failed_access_count = 0,
            link_generation_count = COALESCE(link_generation_count, 0) + :link_generation_increment,
            secret_generation_count = COALESCE(secret_generation_count, 0) + 1,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    ).run({
      id: currentShare.id,
      gabinete_id: gabineteId,
      share_code: code,
      secret_hash: hashPassword(accessCode),
      secret_hint: `final ${accessCode.slice(-2)}`,
      access_level: shareOptions.access_level,
      share_mode: shareOptions.mode,
      view_seconds: shareOptions.mode === "temporary" ? shareOptions.view_seconds : 0,
      one_time: shareOptions.one_time,
      link_generation_increment: generatesLink ? 1 : 0,
      updated_at: timestamp,
    });
  } else {
    db.prepare(
      `
        INSERT INTO public_entity_shares (
          gabinete_id, entity_type, entity_id, enabled, share_code, secret_hash,
          secret_hint, access_level, share_mode, view_seconds, one_time,
          expires_at, opened_at, consumed_at, access_count, link_generation_count,
          secret_generation_count, failed_access_count, created_by,
          created_at, updated_at
        ) VALUES (
          :gabinete_id, :entity_type, :entity_id, 1, :share_code, :secret_hash,
          :secret_hint, :access_level, :share_mode, :view_seconds, :one_time,
          '', '', '', 0, 1, 1, 0, :created_by, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      entity_type: type,
      entity_id: entityId,
      share_code: code,
      secret_hash: hashPassword(accessCode),
      secret_hint: `final ${accessCode.slice(-2)}`,
      access_level: shareOptions.access_level,
      share_mode: shareOptions.mode,
      view_seconds: shareOptions.mode === "temporary" ? shareOptions.view_seconds : 0,
      one_time: shareOptions.one_time,
      created_by: userId || null,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  return {
    ...getEntityShareByEntity(gabineteId, type, entityId),
    access_code: accessCode,
  };
}

function getPublicEntityShareRecord(code) {
  return db
    .prepare(
      `
        SELECT
          s.*,
          g.name AS gabinete_name,
          g.type AS gabinete_type,
          g.city AS gabinete_city,
          g.uf AS gabinete_uf,
          g.logo_url AS gabinete_logo_url
        FROM public_entity_shares s
        JOIN gabinetes g ON g.id = s.gabinete_id
        WHERE s.enabled = 1
          AND g.status = 'active'
          AND upper(s.share_code) = upper(:code)
        LIMIT 1
      `,
    )
    .get({ code: normalizePublicTrackingCode(code) });
}

function entityShareTitle(entityType, entity = {}) {
  if (entityType === "ticket") return entity.demand_title || entity.number || "Atendimento";
  if (entityType === "contact") return entity.name || "Contato";
  if (entityType === "document") return entity.subject_line || entity.internal_number || "Documento";
  if (entityType === "project") return entity.title || "Propositura";
  if (entityType === "note") return entity.subject || "Nota";
  return "Compartilhamento";
}

function serializeEntitySharePayload(entityType, entity = {}) {
  if (entityType === "ticket") {
    return {
      number: entity.number || "",
      title: entity.demand_title || "",
      status: entity.status || "",
      opened_at: entity.opened_at || "",
      contact_name: entity.contact_name || "",
      contact_phone: entity.contact_whatsapp || entity.contact_phone || "",
      category: entity.demand_category || "",
      department: entity.department || "",
      external_protocol: entity.external_protocol || "",
      description: entity.description || "",
      current_guidance: entity.current_guidance || "",
      next_action: entity.next_action || "",
      next_action_date: entity.next_action_date || "",
      result: entity.result || "",
    };
  }
  if (entityType === "contact") {
    return {
      name: entity.name || "",
      register_kind: entity.register_kind || "",
      segment: entity.segment || "",
      phone: entity.phone || "",
      whatsapp: entity.whatsapp || "",
      email: entity.email || "",
      profession: entity.profession || "",
      company_legal_name: entity.company_legal_name || "",
      cpf_rg_cns: entity.cpf_rg_cns || "",
      address: entity.address || "",
      number: entity.number || "",
      complement: entity.complement || "",
      neighborhood: entity.neighborhood || "",
      zip_code: entity.zip_code || "",
      city: entity.city || "",
      uf: entity.uf || "",
      notes: entity.notes || "",
      tags: entity.tags || "",
      updated_at: entity.updated_at || "",
    };
  }
  if (entityType === "document") {
    return {
      type: entity.type || "",
      internal_number: entity.internal_number || "",
      subject_line: entity.subject_line || "",
      status: entity.status || "",
      protocol_date: entity.protocol_date || "",
      department: entity.department || "",
      addressed_to: entity.addressed_to || "",
      legal_due_date: entity.legal_due_date || "",
      demand: entity.demand || "",
      summary_request: entity.summary_request || "",
      generated_text: entity.generated_text || "",
      summary_response: entity.summary_response || "",
      progress_note: entity.progress_note || "",
      result: entity.result || "",
      next_action: entity.next_action || "",
      next_action_date: entity.next_action_date || "",
      notes: entity.notes || "",
      attachment_url: entity.attachment_url || "",
      ticket_number: entity.ticket_number || "",
    };
  }
  if (entityType === "project") {
    return {
      title: entity.title || "",
      description: entity.description || "",
      responsible_name: entity.responsible_name || "",
      status: entity.status || "",
      external_link: entity.external_link || "",
      category: entity.category || "",
      notes: entity.notes || "",
      updated_at: entity.updated_at || "",
    };
  }
  if (entityType === "note") {
    return {
      subject: entity.subject || "",
      body: entity.body || "",
      tags: entity.tags || "",
      color: entity.color || "",
      contact_name: entity.contact_name || "",
      ticket_number: entity.ticket_number || "",
      document_number: entity.document_number || "",
      project_title: entity.project_title || "",
      updated_at: entity.updated_at || "",
    };
  }
  return {};
}

function serializePublicEntityShare(record, options = {}) {
  const type = normalizePublicEntityType(record.entity_type);
  const config = getPublicEntityShareConfig(type) || { label: "Compartilhamento" };
  const mode = String(record.share_mode || "normal") === "temporary" ? "temporary" : "normal";
  const viewSeconds = mode === "temporary" ? Math.min(300, Math.max(5, Number(record.view_seconds || 10))) : 0;
  const access = options.access || {};
  const entity = options.includeEntity ? getScopedShareEntity(record.gabinete_id, type, record.entity_id) : null;
  return {
    code: record.share_code,
    entity_type: type,
    entity_label: config.label,
    access_level: record.access_level === "edit" ? "edit" : "view",
    title: entity ? entityShareTitle(type, entity) : "",
    mode,
    one_time: Boolean(record.one_time),
    view_seconds: viewSeconds,
    view_until: access.view_until || "",
    opened_at: access.opened_at || record.opened_at || "",
    gabinete: {
      name: record.gabinete_name,
      type: record.gabinete_type,
      city: record.gabinete_city,
      uf: record.gabinete_uf,
      logo_url: record.gabinete_logo_url,
    },
    data: entity ? serializeEntitySharePayload(type, entity) : null,
  };
}

function updatePublicSharedContact(record, body = {}) {
  const current = getScopedContact(record.gabinete_id, record.entity_id);
  if (!current || current.deleted_at) throw new Error("Contato nao encontrado.");
  const allowed = {
    name: String(body.name ?? current.name).trim(),
    phone: body.phone ?? current.phone,
    whatsapp: body.whatsapp ?? current.whatsapp,
    email: body.email ?? current.email,
    profession: body.profession ?? current.profession,
    company_legal_name: body.company_legal_name ?? current.company_legal_name,
    address: body.address ?? current.address,
    number: body.number ?? current.number,
    complement: body.complement ?? current.complement,
    neighborhood: body.neighborhood ?? current.neighborhood,
    zip_code: body.zip_code ?? current.zip_code,
    city: body.city ?? current.city,
    uf: body.uf ?? current.uf,
    notes: body.notes ?? current.notes,
  };
  const next = {
    ...current,
    ...allowed,
  };
  const error = validateContactForm(next);
  if (error) throw new Error(error);
  updateContact(record.gabinete_id, record.entity_id, next);
}

function updatePublicSharedNote(record, body = {}) {
  const current = getScopedNote(record.gabinete_id, record.entity_id);
  if (!current) throw new Error("Nota nao encontrada.");
  const next = { ...current, ...(body || {}) };
  const error =
    validateNoteForm(next) ||
    validateScopedReferences(record.gabinete_id, next, [
      { field: "contact_id", table: "contacts", label: "Contato" },
      { field: "ticket_id", table: "tickets", label: "Atendimento" },
      { field: "document_id", table: "documents", label: "Documento" },
      { field: "project_id", table: "projects", label: "Projeto" },
      { field: "finance_entry_id", table: "finance_entries", label: "Lancamento financeiro" },
    ]);
  if (error) throw new Error(error);
  updateNote(record.gabinete_id, record.entity_id, next, null);
}

function listTicketPublicUpdates(gabineteId, ticketId) {
  return db
    .prepare(
      `
        SELECT u.*, users.name AS user_name
        FROM ticket_public_updates u
        LEFT JOIN users ON users.id = u.user_id AND (users.gabinete_id = u.gabinete_id OR users.role = 'super_admin')
        WHERE u.gabinete_id = :gabinete_id AND u.ticket_id = :ticket_id
          AND ${activeRowWhere("u")}
        ORDER BY u.created_at DESC, u.id DESC
      `,
    )
    .all({ gabinete_id: gabineteId, ticket_id: ticketId });
}

function findTicketPublicUpdateForHistory(gabineteId, historyItem = {}) {
  const sourceUpdate = db
    .prepare(
      `
        SELECT *
        FROM ticket_public_updates
        WHERE gabinete_id = :gabinete_id
          AND ticket_id = :ticket_id
          AND ${activeRowWhere()}
          AND source_type = 'ticket_history'
          AND source_id = :source_id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      gabinete_id: gabineteId,
      ticket_id: historyItem.ticket_id,
      source_id: historyItem.id,
    });
  if (sourceUpdate) return sourceUpdate;

  const message = String(historyItem.text || "").trim();
  if (!message) return null;
  return db
    .prepare(
      `
        SELECT *
        FROM ticket_public_updates
        WHERE gabinete_id = :gabinete_id
          AND ticket_id = :ticket_id
          AND ${activeRowWhere()}
          AND message = :message
          AND COALESCE(user_id, 0) = COALESCE(:user_id, 0)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
    )
    .get({
      gabinete_id: gabineteId,
      ticket_id: historyItem.ticket_id,
      user_id: historyItem.user_id || null,
      message,
    });
}

function ticketHistoryPublicMessage(historyItem = {}, fallbackText = "") {
  const text = String(fallbackText || historyItem.text || "").trim();
  const normalizedText = normalizePlainText(text)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalizedText.startsWith("orientacao final")) {
    return text.replace(/^Orientacao final:\s*/i, "").replace(/^Orientação final:\s*/i, "").trim();
  }
  if (normalizePlainText(historyItem.action_type || "") === "reabertura" && text) return text;
  return text;
}

function latestTicketNoteText(gabineteId, ticketId) {
  const item = db
    .prepare(
      `
        SELECT text
        FROM ticket_history
        WHERE gabinete_id = :gabinete_id
          AND ticket_id = :ticket_id
          AND lower(action_type) LIKE '%nota%'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
    )
    .get({ gabinete_id: gabineteId, ticket_id: ticketId });
  return item?.text || "";
}

function createTicketPublicUpdate(gabineteId, ticketId, userId, body = {}) {
  const message = String(body.message || "").trim().slice(0, 1200);
  if (!message) {
    throw new Error("Escreva a atualizacao publica antes de publicar.");
  }
  const publicStatus = String(body.public_status || "").trim().slice(0, 80);
  const timestamp = nowIso();
  const result = db
    .prepare(
      `
        INSERT INTO ticket_public_updates (
          gabinete_id, ticket_id, user_id, public_status, message, channel,
          source_type, source_id, created_at
        ) VALUES (
          :gabinete_id, :ticket_id, :user_id, :public_status, :message, :channel,
          :source_type, :source_id, :created_at
        )
      `,
    )
    .run({
      gabinete_id: gabineteId,
      ticket_id: ticketId,
      user_id: userId || null,
      public_status: publicStatus,
      message,
      channel: body.channel || "portal",
      source_type: body.source_type || "",
      source_id: nullableInt(body.source_id),
      created_at: timestamp,
    });

  db.prepare(
    `
      UPDATE tickets
      SET public_status = COALESCE(NULLIF(:public_status, ''), public_status),
          public_last_update_at = :public_last_update_at,
          public_updated_at = :public_updated_at,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :ticket_id
    `,
  ).run({
    gabinete_id: gabineteId,
    ticket_id: ticketId,
    public_status: publicStatus,
    public_last_update_at: timestamp,
    public_updated_at: timestamp,
    updated_at: timestamp,
  });

  return Number(result.lastInsertRowid);
}

function enableTicketPublicTracking(gabineteId, ticketId, userId = null) {
  const ticket = getScopedTicket(gabineteId, ticketId);
  if (!ticket) throw new Error("Atendimento nao encontrado.");

  const accessCode = generatePublicTrackingAccessCode();
  const timestamp = nowIso();
  const existingCode = normalizePublicTrackingCode(ticket.public_tracking_code);
  const generatesLink = !existingCode || !ticket.public_tracking_enabled;
  assertPublicShareGenerationAllowed(ticket.public_tracking_secret_generation_count, "senha");
  if (generatesLink) assertPublicShareGenerationAllowed(ticket.public_tracking_link_generation_count, "link");
  const code = generatesLink ? generatePublicTrackingCode() : existingCode;
  const publicStatus = publicStatusFromTicket(ticket);

  db.prepare(
    `
      UPDATE tickets
      SET public_tracking_enabled = 1,
          public_tracking_code = :public_tracking_code,
          public_tracking_secret_hash = :public_tracking_secret_hash,
          public_tracking_secret_hint = :public_tracking_secret_hint,
          public_status = COALESCE(NULLIF(public_status, ''), :public_status),
          public_created_at = COALESCE(NULLIF(public_created_at, ''), :public_created_at),
          public_updated_at = :public_updated_at,
          public_tracking_failed_attempts = 0,
          public_tracking_link_generation_count = COALESCE(public_tracking_link_generation_count, 0) + :public_tracking_link_increment,
          public_tracking_secret_generation_count = COALESCE(public_tracking_secret_generation_count, 0) + 1,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :ticket_id
    `,
  ).run({
    gabinete_id: gabineteId,
    ticket_id: ticketId,
    public_tracking_code: code,
    public_tracking_secret_hash: hashPassword(accessCode),
    public_tracking_secret_hint: `final ${accessCode.slice(-2)}`,
    public_status: publicStatus,
    public_created_at: timestamp,
    public_updated_at: timestamp,
    public_tracking_link_increment: generatesLink ? 1 : 0,
    updated_at: timestamp,
  });

  const existingUpdates = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM ticket_public_updates
        WHERE gabinete_id = :gabinete_id AND ticket_id = :ticket_id
      `,
    )
    .get({ gabinete_id: gabineteId, ticket_id: ticketId }).total;
  if (!existingUpdates) {
    createTicketPublicUpdate(gabineteId, ticketId, userId, {
      public_status: publicStatus,
      message: "Solicitacao recebida pelo gabinete. A equipe vai registrar os encaminhamentos por aqui quando houver novidade.",
      channel: "portal",
    });
  }

  return {
    ...getScopedTicket(gabineteId, ticketId),
    access_code: accessCode,
  };
}

function getPublicTrackingRecord(code) {
  return db
    .prepare(
      `
        SELECT
          t.*,
          g.name AS gabinete_name,
          g.type AS gabinete_type,
          g.city AS gabinete_city,
          g.uf AS gabinete_uf,
          g.logo_url AS gabinete_logo_url
        FROM tickets t
        JOIN gabinetes g ON g.id = t.gabinete_id
        WHERE t.public_tracking_enabled = 1
          AND ${activeRowWhere("t")}
          AND g.status = 'active'
          AND upper(t.public_tracking_code) = upper(:code)
        LIMIT 1
      `,
    )
    .get({ code: normalizePublicTrackingCode(code) });
}

function logPublicTrackingAccess(record, req, success) {
  db.prepare(
    `
      INSERT INTO ticket_public_access_logs (
        gabinete_id, ticket_id, public_tracking_code, success, ip_address, user_agent, created_at
      ) VALUES (
        :gabinete_id, :ticket_id, :public_tracking_code, :success, :ip_address, :user_agent, :created_at
      )
    `,
  ).run({
    gabinete_id: record?.gabinete_id || null,
    ticket_id: record?.id || null,
    public_tracking_code: normalizePublicTrackingCode(record?.public_tracking_code || ""),
    success: success ? 1 : 0,
    ip_address: getClientIp(req),
    user_agent: String(req.headers["user-agent"] || "").slice(0, 240),
    created_at: nowIso(),
  });
}

function blockPublicTrackingAfterFailedAttempts(record) {
  const timestamp = nowIso();
  db.prepare(
    `
      UPDATE tickets
      SET public_tracking_enabled = 0,
          public_tracking_code = '',
          public_tracking_secret_hash = '',
          public_tracking_secret_hint = '',
          public_updated_at = :updated_at,
          updated_at = :updated_at
      WHERE id = :ticket_id
    `,
  ).run({
    ticket_id: record.id,
    updated_at: timestamp,
  });
}

function registerPublicTrackingFailedAttempt(record) {
  const nextCount = Number(record?.public_tracking_failed_attempts || 0) + 1;
  db.prepare(
    `
      UPDATE tickets
      SET public_tracking_failed_attempts = :failed_attempts,
          public_updated_at = :updated_at,
          updated_at = :updated_at
      WHERE id = :ticket_id
    `,
  ).run({
    ticket_id: record.id,
    failed_attempts: nextCount,
    updated_at: nowIso(),
  });
  if (nextCount >= PUBLIC_SHARE_MAX_FAILED_ATTEMPTS) {
    blockPublicTrackingAfterFailedAttempts(record);
  }
  return nextCount;
}

function serializePublicTracking(record, options = {}) {
  const updates = options.includeUpdates
    ? listTicketPublicUpdates(record.gabinete_id, record.id)
        .slice()
        .reverse()
        .map((item) => ({
          id: item.id,
          public_status: item.public_status || "",
          message: item.message,
          channel: item.channel,
          created_at: item.created_at,
        }))
    : [];
  const attachments = options.includeUpdates
    ? listPublicTicketFiles(record.gabinete_id, record.id).map((item) => ({
        id: item.id,
        name: item.original_name || "Arquivo",
        url: item.file_url,
        mime_type: item.mime_type,
        size_bytes: Number(item.size_bytes || 0),
        created_at: item.public_visible_at || item.created_at,
      }))
    : [];
  return {
    code: record.public_tracking_code,
    demand_title: record.demand_title,
    public_status: publicStatusFromTicket(record),
    opened_at: record.opened_at,
    public_last_update_at: record.public_last_update_at || record.public_updated_at || record.updated_at,
    closed_at: record.closed_at || "",
    gabinete: {
      name: record.gabinete_name,
      type: record.gabinete_type,
      city: record.gabinete_city,
      uf: record.gabinete_uf,
      logo_url: record.gabinete_logo_url,
    },
    updates,
    attachments,
  };
}

function serializeTicketPublicTracking(ticket, req, accessCode = "") {
  if (!ticket?.public_tracking_code) {
    return {
      enabled: false,
      code: "",
      url: "",
      access_code: accessCode,
      secret_hint: "",
      public_status: publicStatusFromTicket(ticket),
      public_last_update_at: "",
    };
  }
  return {
    enabled: Boolean(ticket.public_tracking_enabled),
    code: ticket.public_tracking_code,
    url: buildPublicTrackingUrl(req, ticket.public_tracking_code),
    access_code: accessCode,
    secret_hint: ticket.public_tracking_secret_hint || "",
    public_status: publicStatusFromTicket(ticket),
    public_last_update_at: ticket.public_last_update_at || ticket.public_updated_at || "",
  };
}

function normalizeEvolutionInstance(payload) {
  if (!payload) return null;
  const raw = payload.instance && typeof payload.instance === "object" ? payload.instance : payload;
  const integration = raw.integration && typeof raw.integration === "object" ? raw.integration : {};
  return {
    id: raw.instanceId || raw.id || "",
    name: raw.instanceName || raw.name || "",
    token: raw.apikey || raw.token || integration.apikey || integration.token || "",
    owner_jid: raw.owner || raw.ownerJid || "",
    profile_name: raw.profileName || "",
    profile_pic_url: raw.profilePictureUrl || raw.profilePicUrl || "",
    profile_status: raw.profileStatus || "",
    status: raw.status || raw.connectionStatus || "",
    integration: typeof raw.integration === "string" ? raw.integration : integration.integration || "",
    server_url: raw.serverUrl || "",
    disconnection_reason_code: raw.disconnectionReasonCode || "",
    disconnection_at: raw.disconnectionAt || "",
    raw: payload,
  };
}

async function fetchEvolutionJson(pathname, options = {}) {
  if (!isEvolutionConfigured()) return null;
  const baseUrl = `${EVOLUTION_BASE_URL}${pathname}`;
  return fetchRemoteJson(baseUrl, {
    method: options.method || "GET",
    timeoutMs: options.timeoutMs ?? 12000,
    headers: {
      apikey: options.apikey || EVOLUTION_GLOBAL_API_KEY,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function fetchEvolutionInstanceByName(instanceName) {
  if (!instanceName) return null;
  const url = new URL("/instance/fetchInstances", EVOLUTION_BASE_URL);
  url.searchParams.set("instanceName", instanceName);
  const payload = await fetchEvolutionJson(url.pathname + url.search, { timeoutMs: 12000 });
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.response)
      ? payload.response
      : Array.isArray(payload?.instances)
        ? payload.instances
        : payload
          ? [payload]
          : [];
  const found = items
    .map((item) => normalizeEvolutionInstance(item))
    .find((item) => item?.name === instanceName);
  return found || null;
}

async function fetchEvolutionConnectionState(instanceName) {
  if (!instanceName) return null;
  return fetchEvolutionJson(`/instance/connectionState/${encodeURIComponent(instanceName)}`, {
    timeoutMs: 12000,
  });
}

async function createEvolutionInstance(gabinete, instanceName) {
  const safeName = sanitizeEvolutionInstanceName(instanceName, gabinete);
  if (!safeName) return null;
  return fetchEvolutionJson("/instance/create", {
    method: "POST",
    body: {
      instanceName: safeName,
      integration: "WHATSAPP-BAILEYS",
      token: createSessionToken().toUpperCase(),
      qrcode: false,
      rejectCall: true,
      msgCall: "No momento nao atendemos ligacoes por este numero. Responda por mensagem.",
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
    },
    timeoutMs: 15000,
  });
}

async function connectEvolutionInstance(instanceName, phone = "") {
  const url = new URL(`/instance/connect/${encodeURIComponent(instanceName)}`, EVOLUTION_BASE_URL);
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    url.searchParams.set("number", normalizedPhone.length <= 11 ? `55${normalizedPhone}` : normalizedPhone);
  }
  return fetchEvolutionJson(url.pathname + url.search, { timeoutMs: 15000 });
}

async function logoutEvolutionInstance(instanceName) {
  return fetchEvolutionJson(`/instance/logout/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
    timeoutMs: 15000,
  });
}

async function restartEvolutionInstance(instanceName) {
  return fetchEvolutionJson(`/instance/restart/${encodeURIComponent(instanceName)}`, {
    method: "PUT",
    timeoutMs: 15000,
  });
}

async function sendEvolutionTextMessage(instanceName, instanceToken, phone, text) {
  const normalizedPhone = normalizePhone(phone);
  if (!instanceName || !normalizedPhone || !text) return null;
  return fetchEvolutionJson(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    apikey: instanceToken || EVOLUTION_GLOBAL_API_KEY,
    body: {
      number: normalizedPhone.length <= 11 ? `55${normalizedPhone}` : normalizedPhone,
      text,
    },
    timeoutMs: 15000,
  });
}

async function sendEvolutionMediaMessage(instanceName, instanceToken, phone, file, caption = "") {
  const normalizedPhone = normalizePhone(phone);
  if (!instanceName || !normalizedPhone || !file?.path) return null;
  const buffer = readFileSync(file.path);
  return fetchEvolutionJson(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    apikey: instanceToken || EVOLUTION_GLOBAL_API_KEY,
    body: {
      number: normalizedPhone.length <= 11 ? `55${normalizedPhone}` : normalizedPhone,
      mediatype: inferWhatsappAttachmentType(file),
      mimetype: String(file.type || "application/octet-stream").toLowerCase(),
      caption: String(caption || "").trim(),
      media: buffer.toString("base64"),
      fileName: file.filename || "arquivo",
    },
    timeoutMs: 30000,
  });
}

async function configureEvolutionWebhook(instanceName, requestOrigin = "") {
  if (!instanceName || !isEvolutionConfigured()) return null;
  const origin = String(process.env.GABINETE360_PUBLIC_URL || requestOrigin || "").replace(/\/+$/, "");
  if (!origin || origin.includes("127.0.0.1") || origin.includes("localhost")) return null;
  return fetchEvolutionJson(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: {
      webhook: {
        enabled: true,
        url: `${origin}/api/whatsapp/webhook/${encodeURIComponent(instanceName)}`,
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      },
    },
    timeoutMs: 12000,
  }).catch(() => null);
}

function validateWhatsappAttachment(file) {
  if (!WHATSAPP_ATTACHMENT_ALLOWED_FILE_TYPES.has(String(file.type || "").toLowerCase())) {
    return "Envie PDF, JPG, PNG ou WEBP.";
  }
  if (Number(file.size || 0) <= 0 || Number(file.size || 0) > WHATSAPP_ATTACHMENT_MAX_FILE_BYTES) {
    return "O arquivo pode ter no maximo 10 MB.";
  }
  return "";
}

function inferWhatsappAttachmentType(fileOrMessage) {
  const type = String(fileOrMessage?.type || fileOrMessage?.mime_type || fileOrMessage?.mimetype || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "document";
}

function saveGabineteWhatsappConfig(gabineteId, payload = {}) {
  db.prepare(
    `
      UPDATE gabinetes
      SET whatsapp_provider = :whatsapp_provider,
          whatsapp_instance_name = :whatsapp_instance_name,
          whatsapp_instance_token = :whatsapp_instance_token,
          updated_at = :updated_at
      WHERE id = :id
    `,
  ).run({
    id: gabineteId,
    whatsapp_provider:
      payload.whatsapp_provider === "wa_me"
        ? "wa_me"
        : isEvolutionConfigured()
          ? "evolution"
          : "wa_me",
    whatsapp_instance_name: payload.whatsapp_instance_name || "",
    whatsapp_instance_token: payload.whatsapp_instance_token || "",
    updated_at: nowIso(),
  });
  return getGabineteById(gabineteId);
}

async function resolveWhatsappConnectorState(gabinete) {
  const summary = buildWhatsappConnectorSummary(gabinete);
  const currentGabinete = gabinete?.id ? getGabineteById(gabinete.id) : gabinete;
  const instanceName = currentGabinete?.whatsapp_instance_name || "";
  const providerMode = currentGabinete?.whatsapp_provider || summary.mode;
  const response = {
    ...summary,
    mode: providerMode,
    suggested_instance_name: buildDefaultEvolutionInstanceName(currentGabinete || gabinete || {}),
    wa_me_fallback: true,
    state: providerMode === "wa_me" ? "browser" : "not_configured",
    connected: false,
    instance_found: false,
    owner_jid: "",
    profile_name: "",
    profile_pic_url: "",
    profile_status: "",
    disconnection_reason_code: "",
    disconnection_at: "",
  };

  if (!isEvolutionConfigured() || !instanceName) {
    return response;
  }

  const [instance, connection] = await Promise.all([
    fetchEvolutionInstanceByName(instanceName),
    fetchEvolutionConnectionState(instanceName),
  ]);

  if (instance?.token && instance.token !== currentGabinete?.whatsapp_instance_token) {
    saveGabineteWhatsappConfig(currentGabinete.id, {
      whatsapp_provider: providerMode,
      whatsapp_instance_name: instanceName,
      whatsapp_instance_token: instance.token,
    });
  }

  const state = connection?.instance?.state || instance?.status || "pending";
  return {
    ...response,
    instance_name: instanceName,
    instance_found: Boolean(instance),
    connected: state === "open",
    state,
    owner_jid: instance?.owner_jid || "",
    profile_name: instance?.profile_name || "",
    profile_pic_url: instance?.profile_pic_url || "",
    profile_status: instance?.profile_status || "",
    disconnection_reason_code: instance?.disconnection_reason_code || "",
    disconnection_at: instance?.disconnection_at || "",
    server_url: instance?.server_url || "",
  };
}

function buildPublicSelfRegisterConfirmationText(gabinete, tracking) {
  const lines = [
    `Recebemos sua solicitacao no ${String(gabinete?.name || "Gabinete").trim()}.`,
  ];

  if (tracking?.code) {
    lines.push(`Protocolo: ${tracking.code}`);
  }
  if (tracking?.access_code) {
    lines.push(`Codigo de acesso: ${tracking.access_code}`);
  }
  if (tracking?.url) {
    lines.push(`Acompanhe em: ${tracking.url}`);
  } else {
    lines.push("A equipe do gabinete vai analisar e organizar o retorno.");
  }

  return lines.filter(Boolean).join("\n");
}

function extractEvolutionConnectionUpdate(payload = {}, fallbackInstanceName = "") {
  const event = String(payload.event || payload.type || payload.eventName || "").trim().toLowerCase();
  if (event && !event.includes("connection")) return null;

  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const instanceObject = data.instance && typeof data.instance === "object" ? data.instance : null;
  const instanceName = String(
    payload.instance ||
      payload.instanceName ||
      data.instanceName ||
      (typeof data.instance === "string" ? data.instance : "") ||
      instanceObject?.instanceName ||
      instanceObject?.name ||
      fallbackInstanceName ||
      "",
  ).trim();
  const state = String(
    data.state ||
      data.connectionStatus ||
      data.status ||
      data.connection?.state ||
      data.connection?.status ||
      instanceObject?.state ||
      instanceObject?.status ||
      "",
  )
    .trim()
    .toLowerCase();
  const reason = String(
    data.reason ||
      data.reasonCode ||
      data.disconnectionReasonCode ||
      data.disconnectReason ||
      data.lastDisconnectReason ||
      data.connection?.reason ||
      data.connection?.reasonCode ||
      instanceObject?.disconnectionReasonCode ||
      "",
  ).trim();
  const disconnectedAt = String(
    data.disconnectionAt || data.timestamp || data.dateTime || data.eventDate || instanceObject?.disconnectionAt || "",
  ).trim();

  if (!instanceName && !state && !reason) {
    return null;
  }

  return {
    instance_name: instanceName,
    state,
    reason,
    disconnected_at: disconnectedAt,
    connected: state === "open" || state === "connected",
  };
}

function looksLikeWhatsappDisconnection(update) {
  if (!update) return false;
  if (update.connected) return false;
  if (update.reason) return true;
  return [
    "close",
    "closed",
    "disconnect",
    "disconnected",
    "logout",
    "error",
    "timeout",
    "refused",
    "conflict",
    "offline",
  ].some((fragment) => String(update.state || "").includes(fragment));
}

function formatWhatsappConnectionReason(reason) {
  const normalized = String(reason || "")
    .trim()
    .replace(/[_-]+/g, " ");
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

function notifyWhatsappConnectionIssue(gabinete, update) {
  if (!gabinete?.id || !looksLikeWhatsappDisconnection(update)) return;

  const targetUsers = db
    .prepare(
      `
        SELECT id
        FROM users
        WHERE gabinete_id = :gabinete_id
          AND status = 'active'
          AND role IN ('gabinete_admin', 'advisor')
      `,
    )
    .all({ gabinete_id: gabinete.id });
  if (!targetUsers.length) return;

  const publicConfig = normalizePublicSelfRegisterConfig(gabinete.public_self_register_config);
  const reason = formatWhatsappConnectionReason(update.reason);
  const details = [];
  if (reason) {
    details.push(`Motivo informado: ${reason}.`);
  }
  if (publicConfig.confirmation_channel === "whatsapp") {
    details.push("Enquanto a linha estiver offline, as confirmacoes automaticas do atendimento online ficam bloqueadas.");
  }

  targetUsers.forEach((user) => {
    createNotificationForEntity(gabinete.id, user.id, {
      title: "WhatsApp desconectado",
      message: [
        "A linha conectada do WhatsApp do gabinete ficou offline.",
        details.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
      kind: "whatsapp_connection_issue",
      entity_type: "whatsapp_connector",
      entity_id: gabinete.id,
    });
  });
}

function notifyPublicConfirmationFailure(gabineteId, users, payload) {
  users.forEach((user) => {
    createNotificationForEntity(gabineteId, user.id, {
      title: "Confirmacao automatica bloqueada",
      message: payload.message,
      kind: "public_confirmation_failed",
      entity_type: payload.entity_type,
      entity_id: payload.entity_id ?? null,
    });
  });
}

async function deliverPublicSelfRegisterConfirmation({
  gabinete,
  request,
  config,
  values,
  tracking,
  anonymous,
  notifyUsers,
  contactId,
  ticketId,
}) {
  const normalizedConfig = normalizePublicSelfRegisterConfig(config);
  const entityType = ticketId ? "ticket" : "contact";
  const entityId = ticketId || contactId || null;

  if (anonymous || normalizedConfig.confirmation_channel === "none") {
    return { channel: "none", status: anonymous ? "anonymous" : "disabled" };
  }

  const currentGabinete = getGabineteById(gabinete.id);
  const text = buildPublicSelfRegisterConfirmationText(currentGabinete || gabinete, tracking);

  if (normalizedConfig.confirmation_channel === "email") {
    if (!values.email) {
      return { channel: "email", status: "skipped", reason: "missing_recipient" };
    }

    const emailSettings = buildGabineteEmailSettings(currentGabinete, values.email);
    if (!emailSettings.configured) {
      notifyPublicConfirmationFailure(gabinete.id, notifyUsers, {
        entity_type: entityType,
        entity_id: entityId,
        message: "A confirmacao por e-mail nao saiu porque o e-mail do gabinete nao esta configurado ou testado.",
      });
      return { channel: "email", status: "blocked", reason: "not_configured" };
    }

    try {
      await sendSmtpMail({
        to: values.email,
        subject: `Protocolo do atendimento - ${currentGabinete?.name || "Gabinete360"}`,
        text,
        smtp: resolveGabineteSmtpProfile(currentGabinete),
      });
      return { channel: "email", status: "sent", recipient: maskEmailAddress(values.email) };
    } catch {
      notifyPublicConfirmationFailure(gabinete.id, notifyUsers, {
        entity_type: entityType,
        entity_id: entityId,
        message: `A confirmacao por e-mail para ${values.email} falhou com a configuracao atual do gabinete.`,
      });
      return { channel: "email", status: "failed", reason: "smtp_error" };
    }
  }

  if (normalizedConfig.confirmation_channel === "whatsapp") {
    if (!values.whatsapp) {
      return { channel: "whatsapp", status: "skipped", reason: "missing_recipient" };
    }

    const connector = await resolveWhatsappConnectorState(currentGabinete);
    if (!connector.connected || !currentGabinete?.whatsapp_instance_name) {
      notifyPublicConfirmationFailure(gabinete.id, notifyUsers, {
        entity_type: entityType,
        entity_id: entityId,
        message: "A confirmacao por WhatsApp nao saiu porque a linha do gabinete esta desconectada.",
      });
      return { channel: "whatsapp", status: "blocked", reason: "connector_disconnected" };
    }

    const delivery = await sendEvolutionTextMessage(
      currentGabinete.whatsapp_instance_name,
      currentGabinete.whatsapp_instance_token,
      values.whatsapp,
      text,
    );

    if (!delivery) {
      notifyPublicConfirmationFailure(gabinete.id, notifyUsers, {
        entity_type: entityType,
        entity_id: entityId,
        message: `A confirmacao por WhatsApp para ${formatPhone(values.whatsapp)} falhou na linha conectada do gabinete.`,
      });
      return { channel: "whatsapp", status: "failed", reason: "send_error" };
    }

    return {
      channel: "whatsapp",
      status: "sent",
      recipient: formatPhone(values.whatsapp),
    };
  }

  return { channel: "none", status: "disabled" };
}

function listWhatsappMessages(gabineteId, filters = {}) {
  return db
    .prepare(
      `
        SELECT
          wm.*,
          c.name AS contact_name,
          t.number AS ticket_number,
          u.name AS user_name,
          tpl.title AS template_title
        FROM whatsapp_messages wm
        LEFT JOIN contacts c ON c.id = wm.contact_id AND c.gabinete_id = wm.gabinete_id
        LEFT JOIN tickets t ON t.id = wm.ticket_id AND t.gabinete_id = wm.gabinete_id
        LEFT JOIN users u ON u.id = wm.user_id AND u.gabinete_id = wm.gabinete_id
        LEFT JOIN whatsapp_templates tpl ON tpl.id = wm.template_id AND tpl.gabinete_id = wm.gabinete_id
        WHERE wm.gabinete_id = :gabinete_id
          AND (
            :q = '%%'
            OR wm.remote_phone LIKE :q
            OR wm.message_text LIKE :q
            OR c.name LIKE :q
            OR t.number LIKE :q
          )
        ORDER BY wm.created_at DESC
        LIMIT :limit
      `,
    )
    .all({
      gabinete_id: gabineteId,
      q: `%${filters.q ?? ""}%`,
      limit: Math.min(200, Math.max(1, parseInteger(filters.limit, 60))),
    });
}

function listWhatsappThreads(gabineteId, filters = {}) {
  return db
    .prepare(
      `
        SELECT
          wt.*,
          c.name AS contact_name,
          t.number AS ticket_number,
          t.demand_title AS ticket_title,
          u.name AS assigned_user_name
        FROM whatsapp_threads wt
        LEFT JOIN contacts c ON c.id = wt.contact_id AND c.gabinete_id = wt.gabinete_id
        LEFT JOIN tickets t ON t.id = wt.ticket_id AND t.gabinete_id = wt.gabinete_id
        LEFT JOIN users u ON u.id = wt.assigned_user_id AND u.gabinete_id = wt.gabinete_id
        WHERE wt.gabinete_id = :gabinete_id
          AND (
            :q = '%%'
            OR wt.remote_phone LIKE :q
            OR c.name LIKE :q
            OR t.number LIKE :q
            OR t.demand_title LIKE :q
            OR u.name LIKE :q
          )
        ORDER BY COALESCE(wt.last_message_at, wt.updated_at, wt.created_at) DESC
      `,
    )
    .all({
      gabinete_id: gabineteId,
      q: `%${filters.q ?? ""}%`,
    });
}

function parseBooleanLike(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "sim", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "nao", "não", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function createTicketFromWhatsappThread(gabinete, user, body = {}) {
  const number = normalizePhone(body.number);
  if (!number) {
    throw new Error("Numero invalido para criar atendimento.");
  }
  if (nullableInt(body.contact_id) && !scopedReferenceId(gabinete.id, "contacts", body.contact_id)) {
    throw new Error("Contato nao pertence a este gabinete ou nao foi encontrado.");
  }
  if (nullableInt(body.assigned_user_id) && !scopedReferenceId(gabinete.id, "users", body.assigned_user_id)) {
    throw new Error("Responsavel nao pertence a este gabinete ou nao foi encontrado.");
  }

  const existingContactId = resolveContactIdByPhone(gabinete.id, number, nullableInt(body.contact_id));
  const contactId =
    existingContactId ||
    createContact(gabinete.id, {
      name: String(body.remote_name || "").trim() || `Contato WhatsApp ${formatPhone(number)}`,
      phone: number,
      whatsapp: number,
      segment: "municipe",
      referred_by: "WhatsApp",
      notes: "Contato criado automaticamente a partir do WhatsApp CRM.",
    });
  const sequence =
    db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id").get({
      gabinete_id: gabinete.id,
    }).total + 1;
  const openedAt = currentDate();
  const followUpDays = parseInteger(gabinete.default_follow_up_days, 3);
  const status = listStatuses(gabinete.id)[0]?.name || "Aberto";
  const channel = listChannels(gabinete.id).find((item) => item.name === "WhatsApp")?.name || listChannels(gabinete.id)[0]?.name || "WhatsApp";
  const result = db.prepare(
    `
      INSERT INTO tickets (
        gabinete_id, contact_id, number, opened_at, channel, status, priority, tags,
        demand_title, demand_category, description, current_guidance, assigned_user_id,
        department, external_protocol, internal_due_date, dependency_note, follow_up_days,
        next_action, next_action_date, closed_at, result, closure_confirmed, is_archived,
        is_favorite, created_at, updated_at
      ) VALUES (
        :gabinete_id, :contact_id, :number, :opened_at, :channel, :status, :priority, :tags,
        :demand_title, :demand_category, :description, :current_guidance, :assigned_user_id,
        :department, :external_protocol, :internal_due_date, :dependency_note, :follow_up_days,
        :next_action, :next_action_date, '', '', 0, 0, 0, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabinete.id,
    contact_id: contactId,
    number: generateTicketCode(gabinete.id, sequence),
    opened_at: openedAt,
    channel,
    status,
    priority: "Normal",
    tags: "WhatsApp CRM",
    demand_title: String(body.title || "").trim() || "Atendimento via WhatsApp",
    demand_category: listCategories(gabinete.id)[0]?.name || "",
    description: "Atendimento criado a partir de conversa no WhatsApp CRM.",
    current_guidance: "Acompanhar conversa e organizar retorno.",
    assigned_user_id: scopedReferenceId(gabinete.id, "users", body.assigned_user_id)
      || scopedReferenceId(gabinete.id, "users", user?.id),
    department: "",
    external_protocol: "",
    internal_due_date: "",
    dependency_note: "",
    follow_up_days: followUpDays,
    next_action: "Dar retorno pelo WhatsApp",
    next_action_date: addDays(openedAt, followUpDays),
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  const ticketId = Number(result.lastInsertRowid);
  insertTicketHistory(gabinete.id, ticketId, user.id, {
    action_type: "Criacao",
    text: "Atendimento criado pelo WhatsApp CRM.",
    previous_status: "",
    new_status: status,
    next_action: "Dar retorno pelo WhatsApp",
    next_action_date: addDays(openedAt, followUpDays),
  });
  refreshContactTicketDates(gabinete.id, contactId);
  return getScopedTicket(gabinete.id, ticketId);
}

function saveWhatsappThread(gabineteId, userId, body = {}) {
  const requestedTicketId = nullableInt(body.ticket_id);
  const requestedContactId = nullableInt(body.contact_id);
  const requestedAssigneeId = nullableInt(body.assigned_user_id);
  const ticket = requestedTicketId ? getScopedTicket(gabineteId, requestedTicketId) : null;
  if (requestedTicketId && !ticket) {
    throw new Error("Atendimento nao pertence a este gabinete ou nao foi encontrado.");
  }
  const scopedContactId = requestedContactId ? scopedReferenceId(gabineteId, "contacts", requestedContactId) : null;
  if (requestedContactId && !scopedContactId) {
    throw new Error("Contato nao pertence a este gabinete ou nao foi encontrado.");
  }
  const scopedAssigneeId = requestedAssigneeId ? scopedReferenceId(gabineteId, "users", requestedAssigneeId) : null;
  if (requestedAssigneeId && !scopedAssigneeId) {
    throw new Error("Responsavel nao pertence a este gabinete ou nao foi encontrado.");
  }
  const fallbackContactId = ticket?.contact_id || scopedContactId || null;
  const number = normalizePhone(body.number || ticket?.contact_whatsapp || ticket?.contact_phone || "");
  if (!number) {
    throw new Error("Informe um numero valido para monitorar a conversa.");
  }

  const existing = db
    .prepare(
      `
        SELECT *
        FROM whatsapp_threads
        WHERE gabinete_id = :gabinete_id
          AND remote_phone = :remote_phone
        LIMIT 1
      `,
    )
    .get({
      gabinete_id: gabineteId,
      remote_phone: number,
    });

  const now = nowIso();
  const payload = {
    gabinete_id: gabineteId,
    remote_phone: number,
    remote_name: String(body.remote_name || existing?.remote_name || "").trim(),
    contact_id: resolveContactIdByPhone(gabineteId, number, fallbackContactId),
    ticket_id: ticket?.id || null,
    assigned_user_id: scopedAssigneeId,
    is_monitored: parseBooleanLike(
      body.is_monitored ?? body.monitor_conversation,
      existing ? Boolean(existing.is_monitored) : true,
    )
      ? 1
      : 0,
    last_message_at: String(body.last_message_at || existing?.last_message_at || "").trim(),
    last_message_text: String(body.last_message_text || existing?.last_message_text || "").trim(),
    unread_count:
      Number(existing?.unread_count || 0) +
      Math.max(0, parseInteger(body.unread_increment, 0)),
    created_by: existing?.created_by || userId || null,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  if (existing) {
    db.prepare(
      `
        UPDATE whatsapp_threads
        SET contact_id = :contact_id,
            remote_name = :remote_name,
            ticket_id = :ticket_id,
            assigned_user_id = :assigned_user_id,
            is_monitored = :is_monitored,
            last_message_at = :last_message_at,
            last_message_text = :last_message_text,
            unread_count = :unread_count,
            updated_at = :updated_at
        WHERE id = :id AND gabinete_id = :gabinete_id
      `,
    ).run({
      id: existing.id,
      gabinete_id: gabineteId,
      contact_id: payload.contact_id,
      remote_name: payload.remote_name,
      ticket_id: payload.ticket_id,
      assigned_user_id: payload.assigned_user_id,
      is_monitored: payload.is_monitored,
      last_message_at: payload.last_message_at,
      last_message_text: payload.last_message_text,
      unread_count: payload.unread_count,
      updated_at: payload.updated_at,
    });
  } else {
    db.prepare(
      `
        INSERT INTO whatsapp_threads (
          gabinete_id, remote_phone, remote_name, contact_id, ticket_id, assigned_user_id,
          is_monitored, last_message_at, last_message_text, unread_count, created_by, created_at, updated_at
        ) VALUES (
          :gabinete_id, :remote_phone, :remote_name, :contact_id, :ticket_id, :assigned_user_id,
          :is_monitored, :last_message_at, :last_message_text, :unread_count, :created_by, :created_at, :updated_at
        )
      `,
    ).run(payload);
  }

  return db
    .prepare(
      `
        SELECT
          wt.*,
          c.name AS contact_name,
          t.number AS ticket_number,
          t.demand_title AS ticket_title,
          u.name AS assigned_user_name
        FROM whatsapp_threads wt
        LEFT JOIN contacts c ON c.id = wt.contact_id AND c.gabinete_id = wt.gabinete_id
        LEFT JOIN tickets t ON t.id = wt.ticket_id AND t.gabinete_id = wt.gabinete_id
        LEFT JOIN users u ON u.id = wt.assigned_user_id AND u.gabinete_id = wt.gabinete_id
        WHERE wt.gabinete_id = :gabinete_id
          AND wt.remote_phone = :remote_phone
        LIMIT 1
      `,
    )
    .get({
      gabinete_id: gabineteId,
      remote_phone: number,
    });
}

function createWhatsappMessageLog(gabineteId, userId, body, providerPayload = null) {
  const contactId = resolveContactIdByPhone(gabineteId, body.number, body.contact_id);
  const result = db.prepare(
    `
      INSERT INTO whatsapp_messages (
        gabinete_id, contact_id, ticket_id, user_id, template_id, provider, direction,
        instance_name, remote_phone, remote_name, remote_jid, message_type, message_text,
        attachment_url, mime_type, provider_message_id, provider_status, provider_payload,
        created_at, updated_at
      ) VALUES (
        :gabinete_id, :contact_id, :ticket_id, :user_id, :template_id, :provider, :direction,
        :instance_name, :remote_phone, :remote_name, :remote_jid, :message_type, :message_text,
        :attachment_url, :mime_type, :provider_message_id, :provider_status, :provider_payload,
        :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    contact_id: contactId,
    ticket_id: scopedReferenceId(gabineteId, "tickets", body.ticket_id),
    user_id: userId,
    template_id: scopedReferenceId(gabineteId, "whatsapp_templates", body.template_id),
    provider: body.provider || "evolution",
    direction: body.direction || "outbound",
    instance_name: body.instance_name || "",
    remote_phone: normalizePhone(body.number),
    remote_name: body.remote_name || "",
    remote_jid: body.remote_jid || "",
    message_type: body.message_type || "text",
    message_text: body.text,
    attachment_url: body.attachment_url || "",
    mime_type: body.mime_type || "",
    provider_message_id: body.provider_message_id || "",
    provider_status: body.provider_status || "",
    provider_payload: providerPayload ? JSON.stringify(providerPayload) : "",
    created_at: body.created_at || nowIso(),
    updated_at: body.updated_at || body.created_at || nowIso(),
  });
  return Number(result.lastInsertRowid);
}

async function handleWhatsappWebhookPayload(instanceName, payload = {}) {
  const gabinete = db
    .prepare(
      `
        SELECT *
        FROM gabinetes
        WHERE lower(whatsapp_instance_name) = lower(:instance_name)
        LIMIT 1
      `,
    )
    .get({ instance_name: instanceName });
  if (!gabinete) {
    throw new Error("Linha do WhatsApp nao encontrada.");
  }

  const connectionUpdate = extractEvolutionConnectionUpdate(payload, instanceName);
  if (connectionUpdate) {
    notifyWhatsappConnectionIssue(gabinete, connectionUpdate);
  }

  const messages = extractEvolutionWebhookMessages(payload, instanceName);
  let saved = 0;
  let ignored = 0;

  for (const message of messages) {
    if (!message.remote_phone || (!message.text && !message.attachment_url)) {
      ignored += 1;
      continue;
    }
    if (message.provider_message_id && hasWhatsappProviderMessage(gabinete.id, instanceName, message.provider_message_id)) {
      ignored += 1;
      continue;
    }

    const contactId = ensureWhatsappContactFromMessage(gabinete.id, message);
    const logId = createWhatsappMessageLog(
      gabinete.id,
      null,
      {
        contact_id: contactId,
        ticket_id: "",
        template_id: "",
        provider: "evolution",
        direction: message.direction,
        instance_name: instanceName,
        number: message.remote_phone,
        remote_name: message.remote_name,
        remote_jid: message.remote_jid,
        text: message.text || "Arquivo recebido",
        message_type: message.message_type,
        attachment_url: message.attachment_url,
        mime_type: message.mime_type,
        provider_message_id: message.provider_message_id,
        provider_status: message.provider_status || "RECEIVED",
        created_at: message.created_at,
        updated_at: message.created_at,
      },
      payload,
    );
    const thread = saveWhatsappThread(gabinete.id, null, {
      number: message.remote_phone,
      remote_name: message.remote_name,
      contact_id: contactId,
      is_monitored: true,
      last_message_at: message.created_at,
      last_message_text: message.text || "Arquivo recebido",
      unread_increment: message.direction === "inbound" ? 1 : 0,
    });

    if (message.direction === "inbound") {
      notifyWhatsappInbound(gabinete.id, thread, message);
    }
    saved += 1;
  }

  return { ok: true, saved, ignored };
}

function hasWhatsappProviderMessage(gabineteId, instanceName, providerMessageId) {
  if (!providerMessageId) return false;
  return Boolean(
    db
      .prepare(
        `
          SELECT id
          FROM whatsapp_messages
          WHERE gabinete_id = :gabinete_id
            AND instance_name = :instance_name
            AND provider_message_id = :provider_message_id
          LIMIT 1
        `,
      )
      .get({
        gabinete_id: gabineteId,
        instance_name: instanceName,
        provider_message_id: providerMessageId,
      }),
  );
}

function extractEvolutionWebhookMessages(payload = {}, fallbackInstanceName = "") {
  const event = String(payload.event || payload.type || payload.eventName || "").toLowerCase();
  if (event && !event.includes("message")) return [];

  const data = payload.data ?? payload;
  const candidates = [];
  if (Array.isArray(data)) candidates.push(...data);
  if (Array.isArray(data?.messages)) candidates.push(...data.messages);
  if (Array.isArray(data?.message)) candidates.push(...data.message);
  if (Array.isArray(payload.messages)) candidates.push(...payload.messages);
  if (data?.key || data?.message || data?.remoteJid || data?.body || data?.text) candidates.push(data);

  return candidates
    .map((item) => normalizeEvolutionWebhookMessage(item, payload, fallbackInstanceName))
    .filter(Boolean);
}

function normalizeEvolutionWebhookMessage(item = {}, payload = {}, fallbackInstanceName = "") {
  const key = item.key || item.message?.key || {};
  const message = item.message?.message || item.message || item;
  const remoteJid = key.remoteJid || item.remoteJid || item.chatId || item.from || item.sender || "";
  if (!remoteJid || String(remoteJid).includes("@g.us")) return null;
  const remotePhone = normalizePhone(String(remoteJid).split("@")[0]);
  if (!remotePhone) return null;

  const fromMe = Boolean(key.fromMe || item.fromMe);
  const text = extractWhatsappMessageText(message, item);
  const media = extractWhatsappMediaInfo(message);
  return {
    instance_name: payload.instance || payload.instanceName || fallbackInstanceName,
    direction: fromMe ? "outbound" : "inbound",
    remote_phone: remotePhone,
    remote_name: String(item.pushName || item.pushname || item.senderName || item.participantName || "").trim(),
    remote_jid: remoteJid,
    text: text || media.caption || media.label || "",
    message_type: media.type || inferWhatsappMessageType(item.messageType || item.type || ""),
    attachment_url: media.url || "",
    mime_type: media.mime_type || "",
    provider_message_id: key.id || item.id || item.messageId || "",
    provider_status: item.status || item.messageStubType || "",
    created_at: normalizeWhatsappTimestamp(item.messageTimestamp || item.timestamp || item.dateTime),
  };
}

function extractWhatsappMessageText(message = {}, item = {}) {
  if (typeof message === "string") return message.trim();
  return String(
    message.conversation ||
      message.text ||
      message.body ||
      message.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      message.videoMessage?.caption ||
      message.documentMessage?.caption ||
      item.text ||
      item.body ||
      "",
  ).trim();
}

function extractWhatsappMediaInfo(message = {}) {
  const image = message.imageMessage;
  const document = message.documentMessage;
  const video = message.videoMessage;
  const audio = message.audioMessage;
  if (image) {
    return { type: "image", url: image.url || "", mime_type: image.mimetype || "", caption: image.caption || "", label: "Imagem recebida" };
  }
  if (document) {
    return {
      type: "document",
      url: document.url || "",
      mime_type: document.mimetype || "",
      caption: document.caption || "",
      label: document.fileName || "Documento recebido",
    };
  }
  if (video) {
    return { type: "video", url: video.url || "", mime_type: video.mimetype || "", caption: video.caption || "", label: "Video recebido" };
  }
  if (audio) {
    return { type: "audio", url: audio.url || "", mime_type: audio.mimetype || "", caption: "", label: "Audio recebido" };
  }
  return { type: inferWhatsappMessageType(""), url: "", mime_type: "", caption: "", label: "" };
}

function inferWhatsappMessageType(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("image")) return "image";
  if (normalized.includes("document")) return "document";
  if (normalized.includes("video")) return "video";
  if (normalized.includes("audio")) return "audio";
  return "text";
}

function normalizeWhatsappTimestamp(value) {
  if (!value) return nowIso();
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric > 100000000000 ? numeric : numeric * 1000).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString();
}

function ensureWhatsappContactFromMessage(gabineteId, message) {
  const existingId = resolveContactIdByPhone(gabineteId, message.remote_phone, null);
  if (existingId) return existingId;
  const name = message.remote_name || `Contato WhatsApp ${formatPhone(message.remote_phone)}`;
  return createContact(gabineteId, {
    name,
    phone: message.remote_phone,
    whatsapp: message.remote_phone,
    segment: "municipe",
    referred_by: "WhatsApp",
    notes: "Contato criado automaticamente a partir de conversa recebida pelo WhatsApp.",
  });
}

function notifyWhatsappInbound(gabineteId, thread, message) {
  const title = "Nova mensagem no WhatsApp";
  const sender = thread.contact_name || message.remote_name || formatPhone(message.remote_phone);
  const text = message.text || "Arquivo recebido";
  const targets = thread.assigned_user_id
    ? [{ id: thread.assigned_user_id }]
    : db
        .prepare(
          `
            SELECT id
            FROM users
            WHERE gabinete_id = :gabinete_id
              AND status = 'active'
              AND role IN ('gabinete_admin', 'advisor')
          `,
        )
        .all({ gabinete_id: gabineteId });
  targets.forEach((user) => {
    createNotificationForEntity(gabineteId, user.id, {
      title,
      message: `${sender}: ${text.slice(0, 120)}`,
      kind: "whatsapp_message",
      entity_type: "whatsapp_thread",
      entity_id: thread.id,
    });
  });
}

function listEmailMessages(gabineteId, filters = {}) {
  return db
    .prepare(
      `
        SELECT
          em.*,
          c.name AS contact_name,
          t.number AS ticket_number,
          u.name AS user_name
        FROM email_messages em
        LEFT JOIN contacts c ON c.id = em.contact_id AND c.gabinete_id = em.gabinete_id
        LEFT JOIN tickets t ON t.id = em.ticket_id AND t.gabinete_id = em.gabinete_id
        LEFT JOIN users u ON u.id = em.user_id AND u.gabinete_id = em.gabinete_id
        WHERE em.gabinete_id = :gabinete_id
          AND (:contact_id = 0 OR em.contact_id = :contact_id)
          AND (:ticket_id = 0 OR em.ticket_id = :ticket_id)
          AND (
            :q = '%%'
            OR em.remote_email LIKE :q
            OR em.subject LIKE :q
            OR em.message_text LIKE :q
            OR c.name LIKE :q
            OR t.number LIKE :q
          )
        ORDER BY em.created_at DESC
        LIMIT :limit
      `,
    )
    .all({
      gabinete_id: gabineteId,
      contact_id: parseInteger(filters.contact_id, 0),
      ticket_id: parseInteger(filters.ticket_id, 0),
      q: `%${filters.q ?? ""}%`,
      limit: Math.min(200, Math.max(1, parseInteger(filters.limit, 20))),
    });
}

function createEmailMessageLog(gabineteId, userId, body, providerPayload = null) {
  const contactId = resolveContactIdByEmail(gabineteId, body.to, body.contact_id);
  const result = db.prepare(
    `
      INSERT INTO email_messages (
        gabinete_id, contact_id, ticket_id, user_id, provider, direction,
        remote_email, subject, message_text, provider_status, provider_payload,
        created_at, updated_at
      ) VALUES (
        :gabinete_id, :contact_id, :ticket_id, :user_id, :provider, :direction,
        :remote_email, :subject, :message_text, :provider_status, :provider_payload,
        :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    contact_id: contactId,
    ticket_id: scopedReferenceId(gabineteId, "tickets", body.ticket_id),
    user_id: userId,
    provider: body.provider || "smtp",
    direction: body.direction || "outbound",
    remote_email: String(body.to || "").trim().toLowerCase(),
    subject: body.subject,
    message_text: body.text,
    provider_status: body.provider_status || "SENT",
    provider_payload: providerPayload ? JSON.stringify(providerPayload) : "",
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return Number(result.lastInsertRowid);
}

function buildWhatsappLookups(gabineteId) {
  return {
    users: listUsersByGabinete(gabineteId).map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      role_label: getRoleLabel(item.role),
    })),
    contacts: listContacts(gabineteId)
      .slice(0, 500)
      .map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        whatsapp: item.whatsapp,
        segment: item.segment,
      })),
    tickets: listTickets(gabineteId)
      .slice(0, 500)
      .map((item) => ({
        id: item.id,
        number: item.number,
        demand_title: item.demand_title,
        contact_name: item.contact_name,
        contact_phone: item.contact_phone,
        contact_whatsapp: item.contact_whatsapp,
      })),
    templates: listWhatsappTemplates(gabineteId).map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      kind: item.kind,
    })),
  };
}

function resolveWhatsappSendDraft(gabineteId, body = {}) {
  const contact = nullableInt(body.contact_id) ? getScopedContact(gabineteId, nullableInt(body.contact_id)) : null;
  const ticket = nullableInt(body.ticket_id) ? getScopedTicket(gabineteId, nullableInt(body.ticket_id)) : null;
  const template = nullableInt(body.template_id) ? getScopedWhatsappTemplate(gabineteId, nullableInt(body.template_id)) : null;
  const text = String(body.text || template?.body || "").trim();
  const number = normalizePhone(
    body.number || contact?.whatsapp || contact?.phone || ticket?.contact_whatsapp || ticket?.contact_phone,
  );
  return { contact, ticket, template, text, number };
}

function listSignatureProfiles(gabineteId) {
  return db
    .prepare(
      `
        SELECT *
        FROM signature_profiles
        WHERE gabinete_id = :gabinete_id AND active = 1
        ORDER BY created_at
      `,
    )
    .all({ gabinete_id: gabineteId });
}

function listAiLinks(gabineteId, userId = null) {
  ensureDefaultAiLinks(gabineteId);
  return db
    .prepare(
      `
        SELECT
          ai_links.*,
          COALESCE(rating_summary.rating_count, 0) AS rating_count,
          COALESCE(rating_summary.rating_average, 0) AS rating_average,
          viewer_rating.rating AS viewer_rating,
          CASE WHEN viewer_report.id IS NULL THEN 0 ELSE 1 END AS viewer_reported
        FROM ai_links
        LEFT JOIN (
          SELECT ai_link_id, COUNT(*) AS rating_count, ROUND(AVG(rating), 1) AS rating_average
          FROM ai_prompt_ratings
          GROUP BY ai_link_id
        ) rating_summary ON rating_summary.ai_link_id = ai_links.id
        LEFT JOIN ai_prompt_ratings viewer_rating
          ON viewer_rating.ai_link_id = ai_links.id
          AND viewer_rating.user_id = :user_id
        LEFT JOIN ai_prompt_reports viewer_report
          ON viewer_report.ai_link_id = ai_links.id
          AND viewer_report.user_id = :user_id
          AND viewer_report.status != 'dismissed'
        WHERE ai_links.active = 1
          AND ${activeRowWhere("ai_links")}
          AND (
            ai_links.gabinete_id = :gabinete_id
            OR (
              ai_links.kind = 'prompt'
              AND ai_links.visibility = 'shared'
              AND ai_links.moderation_status IN ('published', 'needs_review')
            )
          )
        ORDER BY
          CASE WHEN ai_links.gabinete_id = :gabinete_id THEN 0 ELSE 1 END,
          ai_links.sort_order,
          ai_links.title
      `,
    )
    .all({ gabinete_id: gabineteId, user_id: userId ?? 0 });
}

function getSharedAiPromptForFeedback(gabineteId, aiLinkId) {
  return db
    .prepare(
      `
        SELECT *
        FROM ai_links
        WHERE id = :id
          AND active = 1
          AND ${activeRowWhere()}
          AND kind = 'prompt'
          AND visibility = 'shared'
          AND gabinete_id != :gabinete_id
          AND moderation_status IN ('published', 'needs_review')
      `,
    )
    .get({ id: aiLinkId, gabinete_id: gabineteId });
}

function upsertAiPromptRating(gabineteId, userId, aiLinkId, rating) {
  const timestamp = nowIso();
  db.prepare(
    `
      INSERT INTO ai_prompt_ratings (
        ai_link_id, gabinete_id, user_id, rating, created_at, updated_at
      ) VALUES (
        :ai_link_id, :gabinete_id, :user_id, :rating, :created_at, :updated_at
      )
      ON CONFLICT(ai_link_id, user_id) DO UPDATE SET
        rating = excluded.rating,
        updated_at = excluded.updated_at
    `,
  ).run({
    ai_link_id: aiLinkId,
    gabinete_id: gabineteId,
    user_id: userId,
    rating,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return getAiPromptFeedbackSummary(aiLinkId, userId);
}

function reportAiPrompt(gabineteId, userId, aiLinkId, body) {
  const timestamp = nowIso();
  const reason = normalizeAiPromptReportReason(body.reason);
  const details = String(body.details || "").trim().slice(0, 600);
  db.prepare(
    `
      INSERT INTO ai_prompt_reports (
        ai_link_id, gabinete_id, user_id, reason, details, status, created_at, updated_at
      ) VALUES (
        :ai_link_id, :gabinete_id, :user_id, :reason, :details, 'open', :created_at, :updated_at
      )
      ON CONFLICT(ai_link_id, user_id) DO UPDATE SET
        reason = excluded.reason,
        details = excluded.details,
        status = 'open',
        updated_at = excluded.updated_at,
        reviewed_at = NULL
    `,
  ).run({
    ai_link_id: aiLinkId,
    gabinete_id: gabineteId,
    user_id: userId,
    reason,
    details,
    created_at: timestamp,
    updated_at: timestamp,
  });

  const reportCount = countActiveAiPromptReports(aiLinkId);
  const current = db
    .prepare("SELECT moderation_status, moderation_reason FROM ai_links WHERE id = :id")
    .get({ id: aiLinkId });
  let moderationStatus = current?.moderation_status || "published";
  let moderationReason = current?.moderation_reason || "";

  if (PROMPT_REPORT_SEVERE_REASONS.has(reason)) {
    moderationStatus = "under_review";
    moderationReason = "Denuncia grave: revisao obrigatoria.";
  } else if (reportCount >= PROMPT_REPORT_HIDE_THRESHOLD) {
    moderationStatus = "under_review";
    moderationReason = `Oculto temporariamente por ${reportCount} denuncias distintas.`;
  } else if (reportCount >= PROMPT_REPORT_REVIEW_THRESHOLD && moderationStatus === "published") {
    moderationStatus = "needs_review";
    moderationReason = `Revisao recomendada por ${reportCount} denuncias distintas.`;
  }

  db.prepare(
    `
      UPDATE ai_links
      SET report_count = :report_count,
          moderation_status = :moderation_status,
          moderation_reason = :moderation_reason,
          moderated_at = CASE
            WHEN moderation_status != :moderation_status THEN :moderated_at
            ELSE moderated_at
          END,
          updated_at = :updated_at
      WHERE id = :id
    `,
  ).run({
    id: aiLinkId,
    report_count: reportCount,
    moderation_status: moderationStatus,
    moderation_reason: moderationReason,
    moderated_at: timestamp,
    updated_at: timestamp,
  });

  return {
    ...getAiPromptFeedbackSummary(aiLinkId, userId),
    reason,
    moderation_status: moderationStatus,
    moderation_reason: moderationReason,
    report_count: reportCount,
  };
}

function getAiPromptFeedbackSummary(aiLinkId, userId) {
  const rating = db
    .prepare(
      `
        SELECT COUNT(*) AS rating_count, COALESCE(ROUND(AVG(rating), 1), 0) AS rating_average
        FROM ai_prompt_ratings
        WHERE ai_link_id = :ai_link_id
      `,
    )
    .get({ ai_link_id: aiLinkId });
  const viewerRating = db
    .prepare("SELECT rating FROM ai_prompt_ratings WHERE ai_link_id = :ai_link_id AND user_id = :user_id")
    .get({ ai_link_id: aiLinkId, user_id: userId });
  const report = db
    .prepare("SELECT id FROM ai_prompt_reports WHERE ai_link_id = :ai_link_id AND user_id = :user_id AND status != 'dismissed'")
    .get({ ai_link_id: aiLinkId, user_id: userId });
  const moderation = db
    .prepare("SELECT report_count, moderation_status, moderation_reason FROM ai_links WHERE id = :id")
    .get({ id: aiLinkId });
  return {
    rating_count: Number(rating?.rating_count || 0),
    rating_average: Number(rating?.rating_average || 0),
    viewer_rating: Number(viewerRating?.rating || 0),
    viewer_reported: report ? 1 : 0,
    report_count: Number(moderation?.report_count || 0),
    moderation_status: moderation?.moderation_status || "published",
    moderation_reason: moderation?.moderation_reason || "",
  };
}

function countActiveAiPromptReports(aiLinkId) {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM ai_prompt_reports
        WHERE ai_link_id = :ai_link_id
          AND status != 'dismissed'
      `,
    )
    .get({ ai_link_id: aiLinkId });
  return Number(row?.total || 0);
}

function ensureDefaultAiLinks(gabineteId) {
  const existingTitles = new Set(
    db
      .prepare("SELECT lower(title) AS title FROM ai_links WHERE gabinete_id = :gabinete_id")
      .all({ gabinete_id: gabineteId })
      .map((item) => item.title),
  );

  const insert = db.prepare(
    `
      INSERT INTO ai_links (
        gabinete_id, title, url, description, kind, category, visibility, is_builtin, sort_order, active, created_at, updated_at
      ) VALUES (
        :gabinete_id, :title, :url, :description, :kind, :category, 'builtin', 1, :sort_order, 1, :created_at, :updated_at
      )
    `,
  );
  const timestamp = nowIso();
  DEFAULT_AI_LINKS.forEach((item) => {
    if (existingTitles.has(String(item.title || "").toLowerCase())) return;
    insert.run({
      gabinete_id: gabineteId,
      title: item.title,
      url: item.url,
      description: item.description || "",
      kind: item.kind || "principal",
      category: item.category || "",
      sort_order: item.sort_order || 999,
      created_at: timestamp,
      updated_at: timestamp,
    });
  });
}

function listRoutingRules(gabineteId) {
  return db
    .prepare(
      `
        SELECT *
        FROM routing_rules
        WHERE gabinete_id = :gabinete_id AND active = 1
        ORDER BY priority DESC, topic, recommended_department
      `,
    )
    .all({ gabinete_id: gabineteId });
}

function listDocumentTemplates(gabineteId, filters = {}) {
  return db
    .prepare(
      `
        SELECT *
        FROM document_templates
        WHERE gabinete_id = :gabinete_id
          AND active = 1
          AND (
            :q = '%%'
            OR title LIKE :q
            OR topic LIKE :q
            OR variant_name LIKE :q
            OR recommended_department LIKE :q
            OR tags LIKE :q
            OR use_case LIKE :q
          )
          AND (:type = '' OR type = :type)
          AND (:topic = '' OR topic = :topic)
          AND (:department = '%%' OR recommended_department LIKE :department)
        ORDER BY topic, title, variant_name
      `,
    )
    .all({
      gabinete_id: gabineteId,
      q: `%${filters.q ?? ""}%`,
      type: filters.type ?? "",
      topic: filters.topic ?? "",
      department: `%${filters.department ?? ""}%`,
    });
}

function getScopedDocumentTemplate(gabineteId, templateId) {
  return db
    .prepare(
      `
        SELECT *
        FROM document_templates
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    )
    .get({ gabinete_id: gabineteId, id: templateId });
}

function listUsersByGabinete(gabineteId) {
  return db
    .prepare(
      `
        SELECT *
        FROM users
        WHERE gabinete_id = :gabinete_id
        ORDER BY role, name
      `,
    )
    .all({ gabinete_id: gabineteId });
}

function normalizeUserModulePermissionPayload(value, role = "advisor") {
  if (["super_admin", "gabinete_admin"].includes(role)) return null;
  if (!value || typeof value !== "object") return null;
  const hasAnyModule = WORKSPACE_MODULE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
  if (!hasAnyModule) return null;

  const roleCanWrite = role !== "viewer";
  return WORKSPACE_MODULE_KEYS.reduce((accumulator, key) => {
    const raw = value[key];
    const enabled = typeof raw === "object" ? Boolean(raw.can_view ?? raw.enabled) : Boolean(raw);
    accumulator[key] = {
      module_key: key,
      can_view: enabled,
      can_create: enabled && roleCanWrite && Boolean(typeof raw === "object" ? raw.can_create ?? raw.enabled ?? true : true),
      can_edit: enabled && roleCanWrite && Boolean(typeof raw === "object" ? raw.can_edit ?? raw.enabled ?? true : true),
      can_delete: enabled && roleCanWrite && Boolean(typeof raw === "object" ? raw.can_delete ?? raw.enabled ?? true : true),
    };
    return accumulator;
  }, {});
}

function saveUserModulePermissions(gabineteId, userId, permissions) {
  if (!gabineteId || !userId || !permissions) return;
  const timestamp = nowIso();
  const insert = db.prepare(
    `
      INSERT INTO user_module_permissions (
        gabinete_id, user_id, module_key, can_view, can_create, can_edit, can_delete, created_at, updated_at
      ) VALUES (
        :gabinete_id, :user_id, :module_key, :can_view, :can_create, :can_edit, :can_delete, :created_at, :updated_at
      )
      ON CONFLICT(gabinete_id, user_id, module_key) DO UPDATE SET
        can_view = excluded.can_view,
        can_create = excluded.can_create,
        can_edit = excluded.can_edit,
        can_delete = excluded.can_delete,
        updated_at = excluded.updated_at
    `,
  );
  WORKSPACE_MODULE_KEYS.forEach((key) => {
    const row = permissions[key];
    if (!row?.can_view) return;
    insert.run({
      gabinete_id: gabineteId,
      user_id: userId,
      module_key: key,
      can_view: row.can_view ? 1 : 0,
      can_create: row.can_create ? 1 : 0,
      can_edit: row.can_edit ? 1 : 0,
      can_delete: row.can_delete ? 1 : 0,
      created_at: timestamp,
      updated_at: timestamp,
    });
  });
}

const CONTACT_PAGE_MAX_LIMIT = 1000;
const TICKET_PAGE_DEFAULT_LIMIT = 100;
const TICKET_PAGE_MAX_LIMIT = 1000;
const CONTACT_INITIAL_GROUPS = {
  A: ["A", "a", "Á", "á", "À", "à", "Â", "â", "Ã", "ã", "Ä", "ä"],
  B: ["B", "b"],
  C: ["C", "c", "Ç", "ç"],
  D: ["D", "d"],
  E: ["E", "e", "É", "é", "È", "è", "Ê", "ê", "Ë", "ë"],
  F: ["F", "f"],
  G: ["G", "g"],
  H: ["H", "h"],
  I: ["I", "i", "Í", "í", "Ì", "ì", "Î", "î", "Ï", "ï"],
  J: ["J", "j"],
  K: ["K", "k"],
  L: ["L", "l"],
  M: ["M", "m"],
  N: ["N", "n"],
  O: ["O", "o", "Ó", "ó", "Ò", "ò", "Ô", "ô", "Õ", "õ", "Ö", "ö"],
  P: ["P", "p"],
  Q: ["Q", "q"],
  R: ["R", "r"],
  S: ["S", "s"],
  T: ["T", "t"],
  U: ["U", "u", "Ú", "ú", "Ù", "ù", "Û", "û", "Ü", "ü"],
  V: ["V", "v"],
  W: ["W", "w"],
  X: ["X", "x"],
  Y: ["Y", "y"],
  Z: ["Z", "z"],
};

function normalizeContactInitial(value = "") {
  const raw = String(value || "").trim();
  if (!raw || ["all", "todos", "todas"].includes(raw.toLowerCase())) return "";
  if (raw === "#") return "#";
  const normalized = normalizeSearchText(raw).slice(0, 1).toUpperCase();
  return /^[A-Z]$/.test(normalized) ? normalized : "";
}

function contactInitialToken(contact = {}) {
  const value = String(contact.nickname || contact.name || "").trim();
  const normalized = normalizeSearchText(value).slice(0, 1).toUpperCase();
  return /^[A-Z]$/.test(normalized) ? normalized : "#";
}

function contactInitialSql(initial, params) {
  const normalized = normalizeContactInitial(initial);
  if (!normalized) return "";
  const expression = "SUBSTR(TRIM(COALESCE(NULLIF(c.nickname, ''), NULLIF(c.name, ''), '')), 1, 1)";
  if (normalized === "#") {
    const chars = Object.values(CONTACT_INITIAL_GROUPS).flat();
    const placeholders = chars.map((char, index) => {
      const key = `initial_any_${index}`;
      params[key] = char;
      return `:${key}`;
    });
    return `(${expression} = '' OR ${expression} NOT IN (${placeholders.join(", ")}))`;
  }
  const chars = CONTACT_INITIAL_GROUPS[normalized] || [normalized, normalized.toLowerCase()];
  const placeholders = chars.map((char, index) => {
    const key = `initial_${index}`;
    params[key] = char;
    return `:${key}`;
  });
  return `${expression} IN (${placeholders.join(", ")})`;
}

function contactBaseWhereSql(gabineteId, filters = {}, params = {}) {
  const trash = filters.trash ? 1 : 0;
  Object.assign(params, {
    gabinete_id: gabineteId,
    trash,
    city: `%${filters.city ?? ""}%`,
    neighborhood: `%${filters.neighborhood ?? ""}%`,
    register_kind: filters.register_kind ?? "",
    segment: filters.segment ?? "",
    contact_type: filters.contact_type ?? "",
  });
  const clauses = [
    "c.gabinete_id = :gabinete_id",
    `(
      (:trash = 1 AND c.deleted_at IS NOT NULL AND c.deleted_at != '')
      OR (:trash = 0 AND (c.deleted_at IS NULL OR c.deleted_at = ''))
    )`,
    "c.city LIKE :city",
    "c.neighborhood LIKE :neighborhood",
    "(:register_kind = '' OR c.register_kind = :register_kind)",
    "(:segment = '' OR c.segment = :segment)",
    "(:contact_type = '' OR c.contact_type = :contact_type)",
  ];
  if (filters.scope === "no_phone") {
    clauses.push("TRIM(COALESCE(c.whatsapp, '')) = '' AND TRIM(COALESCE(c.phone, '')) = ''");
  } else if (filters.scope === "has_tickets") {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM tickets ticket_scope
        WHERE ticket_scope.gabinete_id = c.gabinete_id
          AND ticket_scope.contact_id = c.id
          AND ${activeRowWhere("ticket_scope")}
      )
    `);
  }
  const initialSql = contactInitialSql(filters.initial, params);
  if (initialSql) clauses.push(initialSql);
  return clauses.join("\n          AND ");
}

function contactListSelectSql() {
  return `
    SELECT
      c.*,
      COUNT(t.id) AS total_tickets,
      SUM(CASE WHEN t.id IS NOT NULL AND (t.closed_at IS NULL OR t.closed_at = '') THEN 1 ELSE 0 END) AS open_tickets,
      MAX(t.opened_at) AS last_ticket_opened_at
    FROM contacts c
    LEFT JOIN tickets t
      ON t.gabinete_id = c.gabinete_id
      AND t.contact_id = c.id
      AND ${activeRowWhere("t")}
  `;
}

function filterContactsInMemory(gabineteId, rows = [], filters = {}) {
  const normalizedQuery = normalizeSearchText(filters.q ?? "");
  const digitQuery = normalizePhone(filters.q ?? "");
  const phoneQueryCandidates = phoneLookupCandidates(filters.q ?? "");
  const initial = normalizeContactInitial(filters.initial);
  let filtered = rows.filter((contact) => {
    if (initial && contactInitialToken(contact) !== initial) return false;
    const haystack = [
      contact.name,
      contact.nickname,
      contact.company_legal_name,
      contact.email,
      contact.profession,
      contact.segment,
      contact.gender,
      contact.referred_by,
      contact.neighborhood,
      contact.city,
      contact.tags,
      contact.notes,
      contact.address,
      contact.cpf_rg_cns,
      contact.social_instagram,
      contact.social_facebook,
      contact.social_x,
      contact.social_youtube,
    ]
      .map((item) => normalizeSearchText(item))
      .join(" ");

    const contactPhoneCandidates = [contact.phone, contact.whatsapp]
      .flatMap((item) => phoneLookupCandidates(item));
    const phoneHaystack = [...contactPhoneCandidates, normalizePhone(contact.cpf_rg_cns)].join(" ");

    return (!normalizedQuery && !digitQuery)
      || haystack.includes(normalizedQuery)
      || (digitQuery && phoneHaystack.includes(digitQuery))
      || (phoneQueryCandidates.length > 0 && phoneQueryCandidates.some((candidate) => contactPhoneCandidates.includes(candidate)));
  });

  if (filters.scope === "birthday_today") {
    const ids = new Set(buildBirthdaySummary(gabineteId).today.map((item) => item.id));
    filtered = filtered.filter((contact) => ids.has(contact.id));
  } else if (filters.scope === "birthday_week") {
    const ids = new Set(buildBirthdaySummary(gabineteId).week.map((item) => item.id));
    filtered = filtered.filter((contact) => ids.has(contact.id));
  } else if (filters.scope === "birthday_month") {
    const ids = new Set(buildBirthdaySummary(gabineteId).month.map((item) => item.id));
    filtered = filtered.filter((contact) => ids.has(contact.id));
  } else if (filters.scope === "no_phone") {
    filtered = filtered.filter((contact) => !normalizePhone(contact.whatsapp) && !normalizePhone(contact.phone));
  } else if (filters.scope === "leaders") {
    filtered = filtered.filter((contact) => Boolean(contact.is_leader));
  } else if (filters.scope === "authorities") {
    filtered = filtered.filter((contact) => Boolean(contact.is_authority));
  }

  return filtered;
}

function listContactsResult(gabineteId, filters = {}) {
  const rawLimit = parseInteger(filters.limit, 0);
  const limit = rawLimit > 0 ? Math.min(CONTACT_PAGE_MAX_LIMIT, Math.max(1, rawLimit)) : 0;
  const offset = Math.max(0, parseInteger(filters.offset, 0));
  const needsMemoryFilter = Boolean(normalizeSearchText(filters.q ?? "") || normalizePhone(filters.q ?? ""))
    || ["birthday_today", "birthday_week", "birthday_month", "leaders", "authorities"].includes(filters.scope || "");

  const params = {};
  const whereSql = contactBaseWhereSql(gabineteId, needsMemoryFilter ? { ...filters, initial: "" } : filters, params);

  if (needsMemoryFilter) {
    const rows = db
      .prepare(
        `
          ${contactListSelectSql()}
          WHERE ${whereSql}
          GROUP BY c.id
          ORDER BY c.updated_at DESC
        `,
      )
      .all(params);
    const filtered = filterContactsInMemory(gabineteId, rows, filters);
    const total = filtered.length;
    const items = limit ? filtered.slice(offset, offset + limit) : filtered;
    return {
      items,
      total,
      loaded: Math.min(offset + items.length, total),
      limit,
      offset,
      next_offset: Math.min(offset + items.length, total),
      has_more: limit ? offset + items.length < total : false,
    };
  }

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM contacts c WHERE ${whereSql}`)
    .get(params).total || 0;
  const pageParams = { ...params };
  let pageSql = "";
  if (limit) {
    pageParams.limit = limit;
    pageParams.offset = offset;
    pageSql = "LIMIT :limit OFFSET :offset";
  }
  const items = db
    .prepare(
      `
        ${contactListSelectSql()}
        WHERE ${whereSql}
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        ${pageSql}
      `,
    )
    .all(pageParams);
  return {
    items,
    total,
    loaded: Math.min(offset + items.length, total),
    limit,
    offset,
    next_offset: Math.min(offset + items.length, total),
    has_more: limit ? offset + items.length < total : false,
  };
}

function listContacts(gabineteId, filters = {}) {
  return listContactsResult(gabineteId, filters).items;
}

function normalizeBulkIds(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => parseInteger(item, 0))
        .filter((item) => item > 0),
    ),
  ].slice(0, 1000);
}

const TRASH_VISIBLE_DAYS = 30;
const TRASH_RETENTION_DAYS = 365;
const TRASH_DEFINITIONS = {
  contacts: {
    label: "Contato",
    plural_label: "Contatos",
    table: "contacts",
    has_updated_at: true,
    title_sql: "COALESCE(NULLIF(nickname, ''), NULLIF(name, ''), 'Contato')",
    subtitle_sql: "TRIM(COALESCE(NULLIF(whatsapp, ''), NULLIF(phone, ''), ''))",
  },
  tickets: {
    label: "Atendimento",
    plural_label: "Atendimentos",
    table: "tickets",
    has_updated_at: true,
    title_sql: "COALESCE(NULLIF(demand_title, ''), NULLIF(number, ''), 'Atendimento')",
    subtitle_sql: "TRIM(COALESCE(NULLIF(number, ''), '') || CASE WHEN status IS NOT NULL AND status != '' THEN ' · ' || status ELSE '' END)",
  },
  documents: {
    label: "Documento",
    plural_label: "Documentos",
    table: "documents",
    has_updated_at: true,
    title_sql: "COALESCE(NULLIF(subject_line, ''), NULLIF(demand, ''), NULLIF(internal_number, ''), 'Documento')",
    subtitle_sql: "TRIM(COALESCE(NULLIF(internal_number, ''), '') || CASE WHEN status IS NOT NULL AND status != '' THEN ' · ' || status ELSE '' END)",
  },
  projects: {
    label: "Atuação",
    plural_label: "Atuação",
    table: "projects",
    has_updated_at: true,
    title_sql: "COALESCE(NULLIF(title, ''), NULLIF(source_subject, ''), 'Item de atuação')",
    subtitle_sql: "TRIM(COALESCE(NULLIF(source_number, ''), NULLIF(source_protocol, ''), NULLIF(category, ''), ''))",
  },
  legislative_connectors: {
    label: "Conector",
    plural_label: "Conectores",
    table: "legislative_connectors",
    has_updated_at: true,
    deactivate_on_trash: true,
    title_sql: "COALESCE(NULLIF(name, ''), NULLIF(source_url, ''), 'Conector')",
    subtitle_sql: "TRIM(COALESCE(NULLIF(provider, ''), '') || CASE WHEN source_url IS NOT NULL AND source_url != '' THEN ' · ' || source_url ELSE '' END)",
  },
  notes: {
    label: "Post-it",
    plural_label: "Post-its",
    table: "notes",
    has_updated_at: true,
    title_sql: "COALESCE(NULLIF(subject, ''), 'Post-it')",
    subtitle_sql: "SUBSTR(COALESCE(NULLIF(body, ''), ''), 1, 120)",
  },
  tasks: {
    label: "Tarefa",
    plural_label: "Tarefas",
    table: "tasks",
    has_updated_at: true,
    title_sql: "COALESCE(NULLIF(title, ''), 'Tarefa')",
    subtitle_sql: "TRIM(COALESCE(NULLIF(status, ''), '') || CASE WHEN due_at IS NOT NULL AND due_at != '' THEN ' · ' || due_at ELSE '' END)",
  },
  call_logs: {
    label: "Registro de ligação",
    plural_label: "Registros de ligação",
    table: "call_logs",
    has_updated_at: true,
    title_sql: "COALESCE(NULLIF(subject, ''), 'Registro de ligação')",
    subtitle_sql: "TRIM(COALESCE(NULLIF(phone, ''), '') || CASE WHEN call_at IS NOT NULL AND call_at != '' THEN ' · ' || call_at ELSE '' END)",
  },
  finance_entries: {
    label: "Lançamento financeiro",
    plural_label: "Financeiro",
    table: "finance_entries",
    has_updated_at: true,
    title_sql: "COALESCE(NULLIF(title, ''), 'Lançamento financeiro')",
    subtitle_sql: "TRIM(COALESCE(NULLIF(entry_type, ''), '') || CASE WHEN entry_date IS NOT NULL AND entry_date != '' THEN ' · ' || entry_date ELSE '' END)",
  },
  ai_links: {
    label: "Atalho de IA",
    plural_label: "Atalhos de IA",
    table: "ai_links",
    has_updated_at: true,
    deactivate_on_trash: true,
    title_sql: "COALESCE(NULLIF(title, ''), 'Atalho de IA')",
    subtitle_sql: "COALESCE(NULLIF(url, ''), '')",
  },
  ticket_history: {
    label: "Nota de atendimento",
    plural_label: "Notas de atendimento",
    table: "ticket_history",
    has_updated_at: false,
    title_sql: "COALESCE(NULLIF(action_type, ''), 'Nota de atendimento')",
    subtitle_sql: "SUBSTR(COALESCE(NULLIF(text, ''), ''), 1, 120)",
  },
  ticket_public_updates: {
    label: "Atualização pública",
    plural_label: "Atualizações públicas",
    table: "ticket_public_updates",
    has_updated_at: false,
    title_sql: "COALESCE(NULLIF(public_status, ''), 'Atualização pública')",
    subtitle_sql: "SUBSTR(COALESCE(NULLIF(message, ''), ''), 1, 120)",
  },
};

function activeRowWhere(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return `(${prefix}deleted_at IS NULL OR ${prefix}deleted_at = '')`;
}

function deletedRowWhere(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return `(${prefix}deleted_at IS NOT NULL AND ${prefix}deleted_at != '')`;
}

function visibleTrashRowWhere(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return `(${prefix}deleted_at IS NOT NULL AND ${prefix}deleted_at != '' AND (${prefix}trash_hidden_at IS NULL OR ${prefix}trash_hidden_at = ''))`;
}

function userVisibleTrashRowWhere(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return `(${prefix}deleted_at IS NOT NULL AND ${prefix}deleted_at != '' AND (${prefix}trash_hidden_at IS NULL OR ${prefix}trash_hidden_at = '') AND ${prefix}deleted_at >= :trash_visible_cutoff)`;
}

function trashDefinition(type) {
  const normalized = String(type || "").trim();
  return TRASH_DEFINITIONS[normalized] || null;
}

function trashPurgeAfter(deletedAt = new Date()) {
  const date = deletedAt instanceof Date ? deletedAt : new Date(deletedAt || Date.now());
  return new Date(date.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function trashVisibleUntil(deletedAt = new Date()) {
  const date = deletedAt instanceof Date ? deletedAt : new Date(deletedAt || Date.now());
  return new Date(date.getTime() + TRASH_VISIBLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function trashVisibleCutoff(referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate || Date.now());
  return new Date(date.getTime() - TRASH_VISIBLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeTrashItems(body = {}) {
  if (Array.isArray(body.items)) {
    return body.items
      .map((item) => ({
        type: String(item?.type || "").trim(),
        id: parseInteger(item?.id, 0),
      }))
      .filter((item) => trashDefinition(item.type) && item.id > 0)
      .slice(0, 1000);
  }
  const type = String(body.type || "").trim();
  const ids = normalizeBulkIds(body.ids || (body.id ? [body.id] : []));
  if (!trashDefinition(type) || !ids.length) return [];
  return ids.map((id) => ({ type, id }));
}

function groupTrashItemsByType(items = []) {
  return items.reduce((groups, item) => {
    if (!trashDefinition(item.type)) return groups;
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push(item.id);
    return groups;
  }, {});
}

function listDeletedRowsByIds(gabineteId, type, ids = []) {
  const definition = trashDefinition(type);
  if (!definition || !ids.length) return [];
  const placeholders = ids.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
  return db
    .prepare(
      `
        SELECT *
        FROM ${definition.table}
        WHERE gabinete_id = :gabinete_id
          AND id IN (${placeholders})
          AND ${deletedRowWhere()}
      `,
    )
    .all({ gabinete_id: gabineteId, ...params });
}

function moveRowsToTrash(gabineteId, type, ids = [], userId = null, reason = "") {
  const definition = trashDefinition(type);
  const uniqueIds = normalizeBulkIds(ids);
  if (!definition || !uniqueIds.length) return 0;
  const placeholders = uniqueIds.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(uniqueIds.map((id, index) => [`id${index}`, id]));
  const deletedAt = nowIso();
  const setParts = [
    "deleted_at = :deleted_at",
    "deleted_by = :deleted_by",
    "delete_reason = :delete_reason",
    "purge_after = :purge_after",
  ];
  if (definition.deactivate_on_trash) setParts.push("active = 0");
  if (definition.has_updated_at) setParts.push("updated_at = :updated_at");
  const result = db
    .prepare(
      `
        UPDATE ${definition.table}
        SET ${setParts.join(",\n            ")}
        WHERE gabinete_id = :gabinete_id
          AND id IN (${placeholders})
          AND ${activeRowWhere()}
      `,
    )
    .run({
      gabinete_id: gabineteId,
      deleted_at: deletedAt,
      deleted_by: userId ?? null,
      delete_reason: String(reason || "").trim().slice(0, 240),
      purge_after: trashPurgeAfter(deletedAt),
      updated_at: deletedAt,
      ...params,
    });
  return result.changes || 0;
}

function restoreRowsFromTrash(gabineteId, type, ids = []) {
  const definition = trashDefinition(type);
  const uniqueIds = normalizeBulkIds(ids);
  if (!definition || !uniqueIds.length) return 0;
  const placeholders = uniqueIds.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(uniqueIds.map((id, index) => [`id${index}`, id]));
  const setParts = [
    "deleted_at = ''",
    "deleted_by = NULL",
    "delete_reason = ''",
    "purge_after = ''",
    "trash_hidden_at = ''",
    "trash_hidden_by = NULL",
  ];
  if (definition.deactivate_on_trash) setParts.push("active = 1");
  if (definition.has_updated_at) setParts.push("updated_at = :updated_at");
  const result = db
    .prepare(
      `
        UPDATE ${definition.table}
        SET ${setParts.join(",\n            ")}
        WHERE gabinete_id = :gabinete_id
          AND id IN (${placeholders})
          AND ${deletedRowWhere()}
      `,
    )
    .run({
      gabinete_id: gabineteId,
      updated_at: nowIso(),
      ...params,
    });
  return result.changes || 0;
}

function permanentlyDeleteRows(gabineteId, type, ids = []) {
  const definition = trashDefinition(type);
  const uniqueIds = normalizeBulkIds(ids);
  if (!definition || !uniqueIds.length) return 0;
  if (type === "contacts") return permanentlyDeleteContacts(gabineteId, uniqueIds);
  if (type === "tickets") return deleteTickets(gabineteId, uniqueIds);
  if (type === "documents") {
    uniqueIds.forEach((id) => deleteDocument(gabineteId, id));
    return uniqueIds.length;
  }
  if (type === "projects") {
    uniqueIds.forEach((id) => deleteProject(gabineteId, id));
    return uniqueIds.length;
  }
  if (type === "notes") {
    uniqueIds.forEach((id) => deleteNote(gabineteId, id));
    return uniqueIds.length;
  }
  if (type === "tasks") {
    uniqueIds.forEach((id) => deleteTask(gabineteId, id));
    return uniqueIds.length;
  }
  if (type === "call_logs") {
    uniqueIds.forEach((id) => deleteCallLog(gabineteId, id));
    return uniqueIds.length;
  }
  if (type === "finance_entries") {
    uniqueIds.forEach((id) => deleteFinanceEntry(gabineteId, id));
    return uniqueIds.length;
  }
  const placeholders = uniqueIds.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(uniqueIds.map((id, index) => [`id${index}`, id]));
  const result = db
    .prepare(
      `
        DELETE FROM ${definition.table}
        WHERE gabinete_id = :gabinete_id
          AND id IN (${placeholders})
          AND ${deletedRowWhere()}
      `,
    )
    .run({ gabinete_id: gabineteId, ...params });
  return result.changes || 0;
}

function hideRowsFromTrash(gabineteId, type, ids = [], userId = null) {
  const definition = trashDefinition(type);
  const uniqueIds = normalizeBulkIds(ids);
  if (!definition || !uniqueIds.length) return 0;
  const placeholders = uniqueIds.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(uniqueIds.map((id, index) => [`id${index}`, id]));
  const timestamp = nowIso();
  const result = db
    .prepare(
      `
        UPDATE ${definition.table}
        SET trash_hidden_at = :trash_hidden_at,
            trash_hidden_by = :trash_hidden_by
        WHERE gabinete_id = :gabinete_id
          AND id IN (${placeholders})
          AND ${visibleTrashRowWhere()}
      `,
    )
    .run({
      gabinete_id: gabineteId,
      trash_hidden_at: timestamp,
      trash_hidden_by: userId ?? null,
      ...params,
    });
  return result.changes || 0;
}

function listScopedContactsByIds(gabineteId, ids = [], options = {}) {
  if (!ids.length) return [];
  const placeholders = ids.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
  const deletedWhere = options.includeDeleted
    ? ""
    : options.deletedOnly
      ? "AND deleted_at IS NOT NULL AND deleted_at != ''"
      : "AND (deleted_at IS NULL OR deleted_at = '')";
  return db.prepare(
    `
      SELECT *
      FROM contacts
      WHERE gabinete_id = :gabinete_id
        AND id IN (${placeholders})
        ${deletedWhere}
      ORDER BY name ASC, id ASC
    `,
  ).all({ gabinete_id: gabineteId, ...params });
}

function moveContactsToTrash(gabineteId, ids = [], userId = null) {
  return moveRowsToTrash(gabineteId, "contacts", ids, userId);
}

function restoreContactsFromTrash(gabineteId, ids = []) {
  return restoreRowsFromTrash(gabineteId, "contacts", ids);
}

function countTicketsForContacts(gabineteId, ids = []) {
  if (!ids.length) return 0;
  const placeholders = ids.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
  return db.prepare(
    `SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id AND contact_id IN (${placeholders})`,
  ).get({ gabinete_id: gabineteId, ...params }).total || 0;
}

function permanentlyDeleteContacts(gabineteId, ids = []) {
  const uniqueIds = normalizeBulkIds(ids);
  if (!uniqueIds.length) return 0;
  const placeholders = uniqueIds.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(uniqueIds.map((id, index) => [`id${index}`, id]));
  return db
    .prepare(
      `
        DELETE FROM contacts
        WHERE gabinete_id = :gabinete_id
          AND id IN (${placeholders})
          AND ${deletedRowWhere()}
          AND NOT EXISTS (
            SELECT 1
            FROM tickets t
            WHERE t.gabinete_id = contacts.gabinete_id
              AND t.contact_id = contacts.id
          )
      `,
    )
    .run({ gabinete_id: gabineteId, ...params }).changes || 0;
}

function buildTrashSummary(gabineteId) {
  const trash_visible_cutoff = trashVisibleCutoff();
  const byType = Object.fromEntries(
    Object.entries(TRASH_DEFINITIONS).map(([type, definition]) => {
      const row = db
        .prepare(`SELECT COUNT(*) AS total FROM ${definition.table} WHERE gabinete_id = :gabinete_id AND ${userVisibleTrashRowWhere()}`)
        .get({ gabinete_id: gabineteId, trash_visible_cutoff }) || {};
      return [type, Number(row.total || 0)];
    }),
  );
  const total = Object.values(byType).reduce((sum, value) => sum + Number(value || 0), 0);
  const expired = Object.entries(TRASH_DEFINITIONS).reduce((sum, [, definition]) => {
    const row = db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM ${definition.table}
          WHERE gabinete_id = :gabinete_id
            AND ${deletedRowWhere()}
            AND purge_after IS NOT NULL
            AND purge_after != ''
            AND purge_after <= :now
        `,
      )
      .get({ gabinete_id: gabineteId, now: nowIso() }) || {};
    return sum + Number(row.total || 0);
  }, 0);
  return { total, expired, by_type: byType };
}

function listTrashItems(gabineteId, filters = {}) {
  const requestedType = String(filters.type || "").trim();
  const types = trashDefinition(requestedType) ? [requestedType] : Object.keys(TRASH_DEFINITIONS);
  const trash_visible_cutoff = trashVisibleCutoff();
  const rows = types.flatMap((type) => {
    const definition = trashDefinition(type);
    if (!definition) return [];
    return db
      .prepare(
        `
          SELECT
            :type AS type,
            :type_label AS type_label,
            :plural_label AS plural_label,
            id,
            ${definition.title_sql} AS title,
            ${definition.subtitle_sql} AS subtitle,
            deleted_at,
            delete_reason,
            purge_after
          FROM ${definition.table}
          WHERE gabinete_id = :gabinete_id
            AND ${userVisibleTrashRowWhere()}
        `,
      )
      .all({
        gabinete_id: gabineteId,
        trash_visible_cutoff,
        type,
        type_label: definition.label,
        plural_label: definition.plural_label,
      });
  });
  const normalizedQuery = normalizeSearchText(filters.q || "");
  const filtered = normalizedQuery
    ? rows.filter((item) => normalizeSearchText([item.type_label, item.title, item.subtitle].join(" ")).includes(normalizedQuery))
    : rows;
  const now = Date.now();
  return filtered
    .map((item) => {
      const visibleTime = new Date(trashVisibleUntil(item.deleted_at)).getTime();
      const purgeTime = item.purge_after ? new Date(item.purge_after).getTime() : 0;
      const daysRemaining = visibleTime ? Math.max(0, Math.ceil((visibleTime - now) / (24 * 60 * 60 * 1000))) : TRASH_VISIBLE_DAYS;
      return {
        ...item,
        title: item.title || item.type_label,
        subtitle: item.subtitle || "",
        days_remaining: daysRemaining,
        expired: purgeTime ? purgeTime <= now : false,
      };
    })
    .sort((left, right) => String(right.deleted_at || "").localeCompare(String(left.deleted_at || "")))
    .slice(0, 1000);
}

function findActiveContactRestoreConflict(gabineteId, contact) {
  const phoneCandidates = [contact.phone, contact.whatsapp]
    .map((item) => normalizePhone(item))
    .filter(Boolean);
  const document = normalizeCpf(contact.cpf_rg_cns);
  const clauses = [];
  const params = { gabinete_id: gabineteId, id: contact.id };
  phoneCandidates.forEach((phone, index) => {
    clauses.push(`phone = :phone${index} OR whatsapp = :phone${index}`);
    params[`phone${index}`] = phone;
  });
  if (document) {
    clauses.push("cpf_rg_cns = :document");
    params.document = document;
  }
  if (!clauses.length) return null;
  return db
    .prepare(
      `
        SELECT id, name, nickname, phone, whatsapp, cpf_rg_cns
        FROM contacts
        WHERE gabinete_id = :gabinete_id
          AND id != :id
          AND ${activeRowWhere()}
          AND (${clauses.map((clause) => `(${clause})`).join(" OR ")})
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
    )
    .get(params) || null;
}

function findActiveRestoreConflicts(gabineteId, type, row) {
  const conflicts = [];
  function addConflict(kind, message, target = null, canMerge = false) {
    conflicts.push({
      kind,
      message,
      target_id: target?.id || null,
      target_title: target?.title || target?.name || target?.nickname || target?.number || target?.internal_number || "",
      can_merge: canMerge,
    });
  }

  if (type === "contacts") {
    const duplicate = findActiveContactRestoreConflict(gabineteId, row);
    if (duplicate) addConflict("duplicate", "Ja existe contato ativo com o mesmo WhatsApp, telefone ou documento.", duplicate, true);
  } else if (type === "tickets") {
    const contact = db.prepare(`SELECT id, name FROM contacts WHERE gabinete_id = :gabinete_id AND id = :id AND ${deletedRowWhere()}`).get({
      gabinete_id: gabineteId,
      id: row.contact_id,
    });
    if (contact) addConflict("dependency", "O contato vinculado a este atendimento tambem esta na lixeira.", contact);
    if (row.number) {
      const duplicate = db.prepare(`SELECT id, number AS title FROM tickets WHERE gabinete_id = :gabinete_id AND id != :id AND number = :number AND ${activeRowWhere()} LIMIT 1`).get({
        gabinete_id: gabineteId,
        id: row.id,
        number: row.number,
      });
      if (duplicate) addConflict("duplicate", "Ja existe atendimento ativo com o mesmo protocolo.", duplicate);
    }
  } else if (type === "documents") {
    if (row.ticket_id) {
      const ticket = db.prepare(`SELECT id, demand_title AS title FROM tickets WHERE gabinete_id = :gabinete_id AND id = :id AND ${deletedRowWhere()}`).get({
        gabinete_id: gabineteId,
        id: row.ticket_id,
      });
      if (ticket) addConflict("dependency", "O atendimento vinculado a este documento esta na lixeira.", ticket);
    }
    const duplicate = db.prepare(`SELECT id, internal_number AS title FROM documents WHERE gabinete_id = :gabinete_id AND id != :id AND internal_number = :internal_number AND ${activeRowWhere()} LIMIT 1`).get({
      gabinete_id: gabineteId,
      id: row.id,
      internal_number: row.internal_number,
    });
    if (duplicate) addConflict("duplicate", "Ja existe documento ativo com o mesmo numero interno.", duplicate);
  } else if (type === "projects") {
    const conditions = [];
    const params = { gabinete_id: gabineteId, id: row.id };
    if (row.source_key) {
      conditions.push("source_key = :source_key");
      params.source_key = row.source_key;
    }
    if (row.source_external_id) {
      conditions.push("source_external_id = :source_external_id");
      params.source_external_id = row.source_external_id;
    }
    if (row.source_url) {
      conditions.push("source_url = :source_url");
      params.source_url = row.source_url;
    }
    if (conditions.length) {
      const duplicate = db.prepare(
        `
          SELECT id, title
          FROM projects
          WHERE gabinete_id = :gabinete_id
            AND id != :id
            AND ${activeRowWhere()}
            AND (${conditions.join(" OR ")})
          LIMIT 1
        `,
      ).get(params);
      if (duplicate) addConflict("duplicate", "Ja existe item de atuacao ativo com a mesma origem.", duplicate);
    }
  } else if (type === "legislative_connectors") {
    const duplicate = db.prepare(`SELECT id, name AS title FROM legislative_connectors WHERE gabinete_id = :gabinete_id AND id != :id AND source_url = :source_url AND ${activeRowWhere()} LIMIT 1`).get({
      gabinete_id: gabineteId,
      id: row.id,
      source_url: row.source_url,
    });
    if (duplicate) addConflict("duplicate", "Ja existe conector ativo com o mesmo link.", duplicate);
  } else if (type === "tasks") {
    ["ticket_id", "contact_id", "document_id", "project_id", "note_id"].forEach((field) => {
      if (!row[field]) return;
      const tableByField = {
        ticket_id: "tickets",
        contact_id: "contacts",
        document_id: "documents",
        project_id: "projects",
        note_id: "notes",
      };
      const table = tableByField[field];
      const dependency = db.prepare(`SELECT id FROM ${table} WHERE gabinete_id = :gabinete_id AND id = :id AND ${deletedRowWhere()} LIMIT 1`).get({
        gabinete_id: gabineteId,
        id: row[field],
      });
      if (dependency) addConflict("dependency", "A tarefa esta ligada a outro registro que tambem esta na lixeira.", dependency);
    });
  } else if (type === "finance_entries") {
    const duplicate = db.prepare(
      `
        SELECT id, title
        FROM finance_entries
        WHERE gabinete_id = :gabinete_id
          AND id != :id
          AND ${activeRowWhere()}
          AND title = :title
          AND entry_date = :entry_date
          AND amount_cents = :amount_cents
        LIMIT 1
      `,
    ).get({
      gabinete_id: gabineteId,
      id: row.id,
      title: row.title,
      entry_date: row.entry_date,
      amount_cents: row.amount_cents,
    });
    if (duplicate) addConflict("duplicate", "Ja existe lancamento ativo com o mesmo titulo, data e valor.", duplicate);
  } else if (type === "ai_links") {
    const duplicate = db.prepare(`SELECT id, title FROM ai_links WHERE gabinete_id = :gabinete_id AND id != :id AND url = :url AND ${activeRowWhere()} LIMIT 1`).get({
      gabinete_id: gabineteId,
      id: row.id,
      url: row.url,
    });
    if (duplicate) addConflict("duplicate", "Ja existe atalho de IA ativo com o mesmo link.", duplicate);
  }

  return conflicts;
}

function detectTrashRestoreConflicts(gabineteId, groupedItems = {}) {
  return Object.entries(groupedItems).flatMap(([type, ids]) =>
    listDeletedRowsByIds(gabineteId, type, ids).flatMap((row) => {
      const conflicts = findActiveRestoreConflicts(gabineteId, type, row);
      if (!conflicts.length) return [];
      const definition = trashDefinition(type);
      return [{
        type,
        id: row.id,
        type_label: definition?.label || type,
        title: row.name || row.nickname || row.demand_title || row.title || row.subject_line || row.subject || row.internal_number || `#${row.id}`,
        conflicts,
      }];
    }),
  );
}

const CONTACT_MERGE_FILL_FIELDS = [
  "name",
  "nickname",
  "contact_type",
  "register_kind",
  "segment",
  "gender",
  "phone",
  "whatsapp",
  "cpf_rg_cns",
  "birth_date",
  "birth_month",
  "birth_day",
  "birth_year",
  "birth_date_precision",
  "email",
  "photo_url",
  "profession",
  "referred_by",
  "company_legal_name",
  "foundation_date",
  "employee_count",
  "address",
  "number",
  "complement",
  "neighborhood",
  "zip_code",
  "city",
  "uf",
  "social_instagram",
  "social_facebook",
  "social_x",
  "social_youtube",
  "geo_lat",
  "geo_lng",
];

function mergeDeletedContactIntoActive(gabineteId, deletedContact, targetContactId) {
  const target = db
    .prepare(`SELECT * FROM contacts WHERE gabinete_id = :gabinete_id AND id = :id AND ${activeRowWhere()}`)
    .get({ gabinete_id: gabineteId, id: targetContactId });
  if (!target || !deletedContact?.id) return false;
  const next = { ...target };
  CONTACT_MERGE_FILL_FIELDS.forEach((field) => {
    if ((next[field] === null || next[field] === undefined || next[field] === "") && deletedContact[field] !== undefined && deletedContact[field] !== null && deletedContact[field] !== "") {
      next[field] = deletedContact[field];
    }
  });
  next.notes = mergeTextBlocks(target.notes, deletedContact.notes, `Contato restaurado e juntado em ${new Date().toLocaleDateString("pt-BR")}.`);
  next.tags = mergeCommaValues(target.tags, deletedContact.tags);
  next.is_leader = toFlag(target.is_leader) || toFlag(deletedContact.is_leader);
  next.is_authority = toFlag(target.is_authority) || toFlag(deletedContact.is_authority);
  next.has_pet = toFlag(target.has_pet) || toFlag(deletedContact.has_pet);

  db.prepare(
    `
      UPDATE contacts
      SET name = :name,
          nickname = :nickname,
          contact_type = :contact_type,
          register_kind = :register_kind,
          segment = :segment,
          gender = :gender,
          is_leader = :is_leader,
          is_authority = :is_authority,
          phone = :phone,
          whatsapp = :whatsapp,
          cpf_rg_cns = :cpf_rg_cns,
          birth_date = :birth_date,
          birth_month = :birth_month,
          birth_day = :birth_day,
          birth_year = :birth_year,
          birth_date_precision = :birth_date_precision,
          email = :email,
          photo_url = :photo_url,
          profession = :profession,
          referred_by = :referred_by,
          company_legal_name = :company_legal_name,
          foundation_date = :foundation_date,
          employee_count = :employee_count,
          has_pet = :has_pet,
          address = :address,
          number = :number,
          complement = :complement,
          neighborhood = :neighborhood,
          zip_code = :zip_code,
          city = :city,
          uf = :uf,
          social_instagram = :social_instagram,
          social_facebook = :social_facebook,
          social_x = :social_x,
          social_youtube = :social_youtube,
          geo_lat = :geo_lat,
          geo_lng = :geo_lng,
          notes = :notes,
          tags = :tags,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    ...next,
    gabinete_id: gabineteId,
    id: target.id,
    updated_at: nowIso(),
  });

  [
    ["tickets", "contact_id"],
    ["notes", "contact_id"],
    ["tasks", "contact_id"],
    ["call_logs", "contact_id"],
    ["whatsapp_messages", "contact_id"],
    ["whatsapp_threads", "contact_id"],
    ["email_messages", "contact_id"],
    ["contact_files", "contact_id"],
  ].forEach(([table, field]) => {
    db.prepare(`UPDATE ${table} SET ${field} = :target_id WHERE gabinete_id = :gabinete_id AND ${field} = :source_id`).run({
      gabinete_id: gabineteId,
      source_id: deletedContact.id,
      target_id: target.id,
    });
  });
  db.prepare("DELETE FROM contacts WHERE gabinete_id = :gabinete_id AND id = :id AND deleted_at IS NOT NULL AND deleted_at != ''").run({
    gabinete_id: gabineteId,
    id: deletedContact.id,
  });
  refreshContactTicketDates(gabineteId, target.id);
  return true;
}

function restoreTrashItems(gabineteId, groupedItems = {}, options = {}) {
  let restoredCount = 0;
  let mergedCount = 0;
  Object.entries(groupedItems).forEach(([type, ids]) => {
    const rows = listDeletedRowsByIds(gabineteId, type, ids);
    if (type === "contacts" && options.mode === "merge") {
      const remaining = [];
      rows.forEach((contact) => {
        const duplicate = findActiveContactRestoreConflict(gabineteId, contact);
        if (duplicate && mergeDeletedContactIntoActive(gabineteId, contact, duplicate.id)) {
          mergedCount += 1;
        } else {
          remaining.push(contact.id);
        }
      });
      restoredCount += restoreRowsFromTrash(gabineteId, type, remaining);
      return;
    }
    restoredCount += restoreRowsFromTrash(gabineteId, type, rows.map((row) => row.id));
  });
  return { restored_count: restoredCount, merged_count: mergedCount };
}

function ticketNeedsMemorySearch(filters = {}) {
  return Boolean(normalizeSearchText(filters.q ?? "") || normalizePhone(filters.q ?? ""));
}

function ticketBaseWhereSql(gabineteId, filters = {}, params = {}) {
  Object.assign(params, {
    gabinete_id: gabineteId,
    status: filters.status ?? "",
    channel: filters.channel ?? "",
    category: filters.category ?? "",
    assigned_user_id: filters.assigned_user_id ?? "",
    neighborhood: `%${filters.neighborhood ?? ""}%`,
    city: `%${filters.city ?? ""}%`,
  });

  const clauses = [
    "t.gabinete_id = :gabinete_id",
    activeRowWhere("t"),
    "(:status = '' OR t.status = :status)",
    "(:channel = '' OR t.channel = :channel)",
    "(:category = '' OR t.demand_category = :category)",
    "(:assigned_user_id = '' OR t.assigned_user_id = :assigned_user_id)",
    "c.neighborhood LIKE :neighborhood",
    "c.city LIKE :city",
  ];

  if (filters.scope === "archived") {
    clauses.push("t.is_archived = 1");
  } else if (!filters.include_archived) {
    clauses.push("COALESCE(t.is_archived, 0) = 0");
  }

  if (filters.public_tracking === "1") {
    clauses.push("COALESCE(t.public_tracking_enabled, 0) = 1");
  }

  if (filters.scope === "open") {
    clauses.push("(t.closed_at IS NULL OR t.closed_at = '')");
  } else if (filters.scope === "closed") {
    clauses.push("t.closed_at IS NOT NULL AND t.closed_at <> ''");
  } else if (filters.scope === "online") {
    clauses.push("t.channel = 'Atendimento online'");
  } else if (filters.scope === "stalled") {
    clauses.push("(t.closed_at IS NULL OR t.closed_at = '') AND (julianday('now') - julianday(substr(t.updated_at, 1, 10))) >= 7");
  } else if (filters.scope === "reminders") {
    clauses.push(`
      t.next_action IS NOT NULL
      AND t.next_action <> ''
      AND (
        t.next_action_date = :today
        OR (
          t.next_action_date IS NOT NULL
          AND t.next_action_date <> ''
          AND t.next_action_date < :today
          AND (t.closed_at IS NULL OR t.closed_at = '')
        )
      )
    `);
    params.today = currentDate();
  }

  return clauses.join("\n      AND ");
}

function ticketListSelectSql() {
  return `
    SELECT
      t.*,
      c.name AS contact_name,
      c.nickname AS contact_nickname,
      c.phone AS contact_phone,
      c.whatsapp AS contact_whatsapp,
      c.cpf_rg_cns AS contact_cpf,
      c.birth_date AS contact_birth_date,
      c.email AS contact_email,
      c.profession AS contact_profession,
      c.address AS contact_address,
      c.number AS contact_number,
      c.complement AS contact_complement,
      c.neighborhood AS contact_neighborhood,
      c.zip_code AS contact_zip_code,
      c.city AS contact_city,
      c.uf AS contact_uf,
      u.name AS assigned_user_name
    FROM tickets t
    JOIN contacts c ON c.id = t.contact_id AND c.gabinete_id = t.gabinete_id
    LEFT JOIN users u ON u.id = t.assigned_user_id AND u.gabinete_id = t.gabinete_id
  `;
}

function listTickets(gabineteId, filters = {}) {
  const params = {};
  const whereSql = ticketBaseWhereSql(gabineteId, filters, params);
  const normalizedQuery = normalizeSearchText(filters.q ?? "");
  const digitQuery = normalizePhone(filters.q ?? "");
  const phoneQueryCandidates = phoneLookupCandidates(filters.q ?? "");
  const needsMemorySearch = Boolean(normalizedQuery || digitQuery);
  const rawLimit = parseInteger(filters.limit, 0);
  const limit = !needsMemorySearch && rawLimit > 0 ? Math.min(TICKET_PAGE_MAX_LIMIT, Math.max(1, rawLimit)) : 0;
  const offset = limit ? Math.max(0, parseInteger(filters.offset, 0)) : 0;
  const pageParams = { ...params };
  let pageSql = "";
  if (limit) {
    pageParams.limit = limit;
    pageParams.offset = offset;
    pageSql = "LIMIT :limit OFFSET :offset";
  }

  const rows = db
    .prepare(
      `
        ${ticketListSelectSql()}
        WHERE ${whereSql}
        ORDER BY t.updated_at DESC
        ${pageSql}
      `,
    )
    .all(pageParams);

  if (!normalizedQuery && !digitQuery) {
    return rows;
  }

  const matches = rows.map((ticket) => {
    const tagMatches = String(ticket.tags || "")
      .split(/[,;]/)
      .map((item) => normalizeSearchText(item))
      .filter(Boolean)
      .some((item) => item === normalizedQuery);
    const topicHaystack = [
      ticket.number,
      ticket.opened_at,
      ticket.demand_title,
      ticket.demand_category,
      ticket.tags,
      ticket.department,
      ticket.external_protocol,
      ticket.contact_neighborhood,
      ticket.contact_city,
      ticket.status,
      ticket.channel,
      ticket.priority,
    ]
      .map((item) => normalizeSearchText(item))
      .join(" ");
    const contactHaystack = [
      ticket.contact_name,
      ticket.contact_nickname,
      ticket.contact_email,
    ]
      .map((item) => normalizeSearchText(item))
      .join(" ");
    const contactPhoneCandidates = [ticket.contact_phone, ticket.contact_whatsapp]
      .flatMap((item) => phoneLookupCandidates(item));
    const digitHaystack = [
      ticket.number,
      ticket.contact_cpf,
      ...contactPhoneCandidates,
    ]
      .map((item) => normalizePhone(item))
      .join(" ");
    const digitMatches = Boolean(digitQuery && digitHaystack.includes(digitQuery))
      || (phoneQueryCandidates.length > 0 && phoneQueryCandidates.some((candidate) => contactPhoneCandidates.includes(candidate)));

    return {
      ticket,
      tagMatches,
      topicMatches: textMatchesSearch(topicHaystack, normalizedQuery),
      contactMatches: textMatchesSearch(contactHaystack, normalizedQuery),
      digitMatches,
    };
  });
  const hasTagMatches = matches.some((item) => item.tagMatches);
  const hasTopicMatches = matches.some((item) => item.topicMatches);

  return matches
    .filter((item) => (
      hasTagMatches
        ? item.tagMatches || item.digitMatches
        : hasTopicMatches
        ? item.topicMatches || item.digitMatches
        : item.topicMatches || item.contactMatches || item.digitMatches
    ))
    .map((item) => item.ticket);
}

function countTickets(gabineteId, filters = {}) {
  if (ticketNeedsMemorySearch(filters)) return listTickets(gabineteId, filters).length;
  const params = {};
  const whereSql = ticketBaseWhereSql(gabineteId, filters, params);
  return db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM tickets t
        JOIN contacts c ON c.id = t.contact_id AND c.gabinete_id = t.gabinete_id
        WHERE ${whereSql}
      `,
    )
    .get(params).total || 0;
}

function listTicketsResult(gabineteId, filters = {}) {
  const rawLimit = parseInteger(filters.limit, 0);
  const limit = rawLimit > 0 ? Math.min(TICKET_PAGE_MAX_LIMIT, Math.max(1, rawLimit)) : 0;
  const offset = Math.max(0, parseInteger(filters.offset, 0));
  if (ticketNeedsMemorySearch(filters)) {
    const filtered = listTickets(gabineteId, filters);
    const total = filtered.length;
    const items = limit ? filtered.slice(offset, offset + limit) : filtered;
    return {
      items,
      total,
      loaded: Math.min(offset + items.length, total),
      limit,
      offset,
      next_offset: Math.min(offset + items.length, total),
      has_more: limit ? offset + items.length < total : false,
    };
  }
  const total = countTickets(gabineteId, filters);
  const items = listTickets(gabineteId, { ...filters, limit, offset });
  return {
    items,
    total,
    loaded: Math.min(offset + items.length, total),
    limit,
    offset,
    next_offset: Math.min(offset + items.length, total),
    has_more: limit ? offset + items.length < total : false,
  };
}

function listTicketStatusCounts(gabineteId, filters = {}) {
  const statuses = listStatuses(gabineteId);
  const statusOrder = new Map(statuses.map((item, index) => [normalizeSearchText(item.name).trim(), index]));
  const counts = new Map();
  if (ticketNeedsMemorySearch(filters)) {
    const tickets = listTickets(gabineteId, { ...filters, status: "" });
    tickets.forEach((ticket) => {
      const name = String(ticket.status || "Sem status").trim() || "Sem status";
      counts.set(name, (counts.get(name) || 0) + 1);
    });
  } else {
    const params = {};
    const whereSql = ticketBaseWhereSql(gabineteId, { ...filters, status: "" }, params);
    db
      .prepare(
        `
          SELECT COALESCE(NULLIF(t.status, ''), 'Sem status') AS name, COUNT(*) AS total
          FROM tickets t
          JOIN contacts c ON c.id = t.contact_id AND c.gabinete_id = t.gabinete_id
          WHERE ${whereSql}
          GROUP BY COALESCE(NULLIF(t.status, ''), 'Sem status')
        `,
      )
      .all(params)
      .forEach((row) => {
        counts.set(String(row.name || "Sem status"), Number(row.total || 0));
      });
  }
  return Array.from(counts, ([name, total]) => ({ name, total }))
    .sort((left, right) => {
      const leftOrder = statusOrder.get(normalizeSearchText(left.name).trim()) ?? 9999;
      const rightOrder = statusOrder.get(normalizeSearchText(right.name).trim()) ?? 9999;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      if (right.total !== left.total) return right.total - left.total;
      return String(left.name).localeCompare(String(right.name), "pt-BR");
    });
}

function getScopedTicket(gabineteId, ticketId) {
  return db
    .prepare(
      `
        SELECT
          t.*,
          c.name AS contact_name,
          c.nickname AS contact_nickname,
          c.phone AS contact_phone,
          c.whatsapp AS contact_whatsapp,
          c.cpf_rg_cns AS contact_cpf,
          c.birth_date AS contact_birth_date,
          c.email AS contact_email,
          c.profession AS contact_profession,
          c.address AS contact_address,
          c.number AS contact_number,
          c.complement AS contact_complement,
          c.neighborhood AS contact_neighborhood,
          c.zip_code AS contact_zip_code,
          c.city AS contact_city,
          c.uf AS contact_uf,
          u.name AS assigned_user_name
        FROM tickets t
          JOIN contacts c ON c.id = t.contact_id AND c.gabinete_id = t.gabinete_id
          LEFT JOIN users u ON u.id = t.assigned_user_id AND u.gabinete_id = t.gabinete_id
        WHERE t.gabinete_id = :gabinete_id AND t.id = :ticket_id
          AND ${activeRowWhere("t")}
      `,
    )
    .get({
      gabinete_id: gabineteId,
      ticket_id: ticketId,
    });
}

function listScopedTicketsByIds(gabineteId, ids = [], options = {}) {
  if (!ids.length) return [];
  const placeholders = ids.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
  const deletedWhere = options.includeDeleted
    ? ""
    : options.deletedOnly
      ? `AND ${deletedRowWhere()}`
      : `AND ${activeRowWhere()}`;
  return db.prepare(
    `
      SELECT
        id,
        number,
        status,
        demand_title,
        closed_at
      FROM tickets
      WHERE gabinete_id = :gabinete_id
        AND id IN (${placeholders})
        ${deletedWhere}
      ORDER BY id ASC
    `,
  ).all({ gabinete_id: gabineteId, ...params });
}

function getScopedContact(gabineteId, contactId) {
  return db
    .prepare("SELECT * FROM contacts WHERE gabinete_id = :gabinete_id AND id = :id")
    .get({
      gabinete_id: gabineteId,
      id: contactId,
    });
}

function getTicketHistory(gabineteId, ticketId) {
  return db
    .prepare(
      `
        SELECT h.*, u.name AS user_name
        FROM ticket_history h
        LEFT JOIN users u ON u.id = h.user_id AND (u.gabinete_id = h.gabinete_id OR u.role = 'super_admin')
        WHERE h.gabinete_id = :gabinete_id AND h.ticket_id = :ticket_id
          AND ${activeRowWhere("h")}
        ORDER BY h.created_at DESC, h.id DESC
      `,
    )
    .all({
      gabinete_id: gabineteId,
      ticket_id: ticketId,
    });
}

async function buildDashboardData(gabineteId, options = {}) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = currentDate();
  const holidayContext = await hydrateHolidayContext(
    getHolidayCatalogContext(gabineteId, options.holidayUf),
    { persistGabineteId: gabineteId },
  );
  const currentYear = Number(today.slice(0, 4));
  await ensureMunicipalHolidayCatalogForContext(holidayContext, [currentYear, currentYear + 1]);
  const birthdaySummary = buildBirthdaySummary(gabineteId, today);
  const holidayCoverage = getHolidayCoverageWindow(today);
  const holidayNotice = getUpcomingHolidayNotice(today, holidayContext);
  const holidayWindowItems = getHolidayCatalogForContext(holidayContext, { fromDate: holidayCoverage.start }).filter(
    (item) => item.date >= holidayCoverage.start && item.date <= holidayCoverage.end,
  );
  const nextActions = db
    .prepare(
      `
        SELECT t.id, t.next_action, t.next_action_date, t.priority, c.name AS contact_name
        FROM tickets t
        JOIN contacts c ON c.id = t.contact_id AND c.gabinete_id = t.gabinete_id
        WHERE t.gabinete_id = :gabinete_id
          AND ${activeRowWhere("t")}
          AND t.next_action IS NOT NULL AND t.next_action <> ''
        ORDER BY t.next_action_date ASC
        LIMIT 5
      `,
    )
    .all({ gabinete_id: gabineteId });
  const todayReminders = db
    .prepare(
      `
        SELECT
          t.id,
          t.number,
          t.next_action,
          t.next_action_date,
          t.priority,
          t.status,
          c.name AS contact_name
        FROM tickets t
        JOIN contacts c ON c.id = t.contact_id AND c.gabinete_id = t.gabinete_id
        WHERE t.gabinete_id = :gabinete_id
          AND ${activeRowWhere("t")}
          AND t.next_action IS NOT NULL AND t.next_action <> ''
          AND (
            t.next_action_date = :today
            OR (
              t.next_action_date IS NOT NULL AND t.next_action_date <> ''
              AND t.next_action_date < :today
              AND (t.closed_at IS NULL OR t.closed_at = '')
            )
          )
        ORDER BY
          CASE WHEN t.next_action_date = :today THEN 0 ELSE 1 END,
          t.next_action_date ASC,
          t.updated_at DESC
        LIMIT 6
      `,
    )
    .all({ gabinete_id: gabineteId, today });
  const quickTasks = db
    .prepare(
      `
        SELECT id, title, due_at, priority, status
        FROM tasks
        WHERE gabinete_id = :gabinete_id
          AND ${activeRowWhere()}
          AND due_at IS NOT NULL AND due_at <> ''
          AND substr(due_at, 1, 10) BETWEEN :start AND :end
          AND status NOT IN ('Concluida', 'Arquivada', 'Cancelada')
        ORDER BY due_at ASC, priority DESC
        LIMIT 20
      `,
    )
    .all({ gabinete_id: gabineteId, start: holidayCoverage.start, end: holidayCoverage.end });
  const documentDueLimit = addDays(today, 3);
  const dueDocuments = db
    .prepare(
      `
        SELECT id, internal_number, type, subject_line, status, legal_due_date
        FROM documents
        WHERE gabinete_id = :gabinete_id
          AND ${activeRowWhere()}
          AND legal_due_date IS NOT NULL AND legal_due_date <> ''
          AND legal_due_date <= :limit_date
          AND status NOT IN ('Concluido', 'Arquivado')
        ORDER BY
          CASE WHEN legal_due_date < :today THEN 0 ELSE 1 END,
          legal_due_date ASC,
          updated_at DESC
        LIMIT 5
      `,
    )
    .all({ gabinete_id: gabineteId, today, limit_date: documentDueLimit });
  const stats = {
    open_count: db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM tickets
          WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND (closed_at IS NULL OR closed_at = '')
        `,
      )
      .get({ gabinete_id: gabineteId }).total,
    closed_count: db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM tickets
          WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND closed_at IS NOT NULL AND closed_at <> ''
        `,
      )
      .get({ gabinete_id: gabineteId }).total,
    waiting_return_count: countByStatus(gabineteId, "Aguardando retorno"),
    waiting_service_count: countByStatus(gabineteId, "Aguardando servico"),
    documents_sent_count: countByStatus(gabineteId, "Oficio encaminhado"),
    stalled_count: db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM tickets
          WHERE gabinete_id = :gabinete_id
            AND ${activeRowWhere()}
            AND (closed_at IS NULL OR closed_at = '')
            AND (julianday('now') - julianday(substr(updated_at, 1, 10))) >= 7
        `,
      )
      .get({ gabinete_id: gabineteId }).total,
    month_new_count: db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM tickets
          WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND substr(opened_at, 1, 7) = :month
        `,
      )
      .get({ gabinete_id: gabineteId, month: currentMonth }).total,
    avg_resolution_days:
      Math.round(
        db
          .prepare(
            `
              SELECT COALESCE(AVG(julianday(closed_at) - julianday(opened_at)), 0) AS avg_days
              FROM tickets
              WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND closed_at IS NOT NULL AND closed_at <> ''
            `,
          )
          .get({ gabinete_id: gabineteId }).avg_days,
      ) || 0,
    today_reminders_count: db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM tickets
          WHERE gabinete_id = :gabinete_id
            AND ${activeRowWhere()}
            AND next_action IS NOT NULL AND next_action <> ''
            AND (
              next_action_date = :today
              OR (
                next_action_date IS NOT NULL AND next_action_date <> ''
                AND next_action_date < :today
                AND (closed_at IS NULL OR closed_at = '')
              )
            )
        `,
      )
      .get({ gabinete_id: gabineteId, today }).total,
    online_tickets_count: db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM tickets
          WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND channel = 'Atendimento online'
        `,
      )
      .get({ gabinete_id: gabineteId }).total,
    online_open_tickets_count: db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM tickets
          WHERE gabinete_id = :gabinete_id
            AND ${activeRowWhere()}
            AND channel = 'Atendimento online'
            AND (closed_at IS NULL OR closed_at = '')
        `,
      )
      .get({ gabinete_id: gabineteId }).total,
    documents_due_count: db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM documents
          WHERE gabinete_id = :gabinete_id
            AND ${activeRowWhere()}
            AND legal_due_date IS NOT NULL AND legal_due_date <> ''
            AND legal_due_date <= :limit_date
            AND status NOT IN ('Concluido', 'Arquivado')
        `,
      )
      .get({ gabinete_id: gabineteId, limit_date: documentDueLimit }).total,
    tasks_today_count: taskCounts(gabineteId).today,
    tasks_overdue_count: taskCounts(gabineteId).overdue,
  };

  return {
    holidayNotice,
    holidayContext,
    quickCalendarDays: buildQuickCalendarDays({
      start: holidayCoverage.start,
      end: holidayCoverage.end,
      today,
      holidays: holidayWindowItems,
      reminders: todayReminders,
      nextActions,
      tasks: quickTasks,
      birthdays: birthdaySummary.week,
    }),
    birthdays: birthdaySummary,
    stats: {
      ...stats,
      open_delta: stats.open_count,
      closed_delta: stats.closed_count,
      birthdays_today_count: birthdaySummary.today.length,
      birthdays_week_count: birthdaySummary.week.length,
      birthdays_month_count: birthdaySummary.month.length,
    },
    statusChart: aggregateChart(
      `
        SELECT status AS label, COUNT(*) AS total
        FROM tickets
        WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}
        GROUP BY status
        ORDER BY total DESC
        LIMIT 6
      `,
      gabineteId,
    ),
    channelChart: aggregateChart(
      `
        SELECT channel AS label, COUNT(*) AS total
        FROM tickets
        WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}
        GROUP BY channel
        ORDER BY total DESC
        LIMIT 6
      `,
      gabineteId,
    ),
    categoryChart: aggregateChart(
      `
        SELECT COALESCE(demand_category, 'Sem categoria') AS label, COUNT(*) AS total
        FROM tickets
        WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}
        GROUP BY demand_category
        ORDER BY total DESC
        LIMIT 6
      `,
      gabineteId,
    ),
    assigneeChart: aggregateChart(
      `
        SELECT COALESCE(u.name, 'Sem responsavel') AS label, COUNT(*) AS total
        FROM tickets t
        LEFT JOIN users u ON u.id = t.assigned_user_id AND u.gabinete_id = t.gabinete_id
        WHERE t.gabinete_id = :gabinete_id
          AND ${activeRowWhere("t")}
        GROUP BY u.name
        ORDER BY total DESC
        LIMIT 6
      `,
      gabineteId,
    ),
    recentTickets: db
      .prepare(
        `
          SELECT t.id, t.number, t.demand_title, t.status, t.opened_at, c.name AS contact_name
          FROM tickets t
          JOIN contacts c ON c.id = t.contact_id AND c.gabinete_id = t.gabinete_id
          WHERE t.gabinete_id = :gabinete_id
            AND ${activeRowWhere("t")}
          ORDER BY t.created_at DESC
          LIMIT 5
        `,
      )
      .all({ gabinete_id: gabineteId }),
    stalledTickets: db
      .prepare(
        `
          SELECT t.id, t.status, t.demand_title, t.opened_at, t.closed_at, c.name AS contact_name
          FROM tickets t
          JOIN contacts c ON c.id = t.contact_id AND c.gabinete_id = t.gabinete_id
          WHERE t.gabinete_id = :gabinete_id
            AND ${activeRowWhere("t")}
            AND (t.closed_at IS NULL OR t.closed_at = '')
            AND (julianday('now') - julianday(substr(t.updated_at, 1, 10))) >= 7
          ORDER BY t.updated_at ASC
          LIMIT 5
        `,
      )
      .all({ gabinete_id: gabineteId }),
    nextActions,
    todayReminders,
    recurringDemands: aggregateChart(
      `
        SELECT COALESCE(demand_category, demand_title, 'Sem categoria') AS label, COUNT(*) AS total
        FROM tickets
        WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}
        GROUP BY COALESCE(demand_category, demand_title, 'Sem categoria')
        ORDER BY total DESC
        LIMIT 5
      `,
      gabineteId,
    ),
    recentCalls: listCallLogs(gabineteId, {}).slice(0, 5),
    dueDocuments,
    taskSummary: taskCounts(gabineteId),
  };
}

function aggregateChart(sql, gabineteId) {
  return db.prepare(sql).all({ gabinete_id: gabineteId });
}

function countByStatus(gabineteId, status) {
  return db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM tickets
        WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND status = :status
      `,
    )
    .get({
      gabinete_id: gabineteId,
      status,
    }).total;
}

function validateRegisterForm(body) {
  if (!body.name || !body.responsible_name || !body.email || !body.password) {
    return "Preencha os campos obrigatorios do cadastro do gabinete.";
  }
  if (!isValidEmail(body.email)) {
    return "Informe um e-mail valido para ativacao da conta.";
  }
  if (body.password !== body.password_confirmation) {
    return "A confirmacao de senha nao confere.";
  }
  return "";
}

function validateGoogleRegisterForm(body) {
  if (!body.name || !body.responsible_name) {
    return "Preencha nome do gabinete e nome do responsavel.";
  }
  return "";
}

function validateTicketForm(body) {
  if (!body.opened_at || !body.channel || !body.status || !body.priority || !body.demand_title) {
    return "Preencha abertura, tipo de entrada, status, prioridade e assunto.";
  }
  if (!body.contact_id && !body.contact_name) {
    return "Selecione um contato existente ou informe o nome do municipe.";
  }
  const documentError = getCpfCnpjValidationMessage(body.contact_cpf, { allowOtherDocuments: true });
  if (documentError) return documentError;
  if (body._is_final_status && !String(body.result || "").trim()) {
    return "Informe a orientacao final para encerrar o atendimento.";
  }
  return "";
}

function validateContactForm(body) {
  if (!body.name) {
    return "O nome do contato e obrigatorio.";
  }
  const documentError = getCpfCnpjValidationMessage(body.cpf_rg_cns);
  if (documentError) return documentError;
  if (body.email && !isValidEmail(body.email)) {
    return "Informe um e-mail valido.";
  }
  return "";
}

function defaultSegmentForRegisterKind(registerKind) {
  if (registerKind === "leadership") return "lideranca";
  if (registerKind === "entity") return "empresa";
  if (registerKind === "public_agency") return "autoridade";
  return "municipe";
}

function normalizeContactRegisterKind(value, body = {}) {
  const normalized = normalizePlainText(value).replaceAll(" ", "_");
  if (["person", "pessoa"].includes(normalized)) return "person";
  if (["leadership", "lideranca"].includes(normalized)) return "leadership";
  if (["entity", "entidade"].includes(normalized)) return "entity";
  if (["public_agency", "orgao_publico", "orgao"].includes(normalized)) return "public_agency";

  const contactType = body.contact_type === "company" ? "company" : "person";
  if (toFlag(body.is_authority) && contactType === "company") return "public_agency";
  if (toFlag(body.is_leader)) return "leadership";
  if (contactType === "company") return "entity";
  return "person";
}

function resolveContactClassification(body = {}) {
  const registerKind = normalizeContactRegisterKind(body.register_kind, body);
  const contactType = registerKind === "entity" || registerKind === "public_agency" ? "company" : "person";
  const rawSegment = String(body.segment ?? "").trim();
  const shouldReplaceSegment =
    !rawSegment
    || rawSegment === "municipe"
    || (registerKind === "public_agency" && rawSegment === "empresa");
  const segment = shouldReplaceSegment ? defaultSegmentForRegisterKind(registerKind) : rawSegment;

  return {
    register_kind: registerKind,
    contact_type: contactType,
    segment,
    is_leader: registerKind === "leadership" ? 1 : 0,
    is_authority: registerKind === "public_agency" ? 1 : 0,
  };
}

function validateUserForm(body, isSuperAdmin) {
  if (!body.name || !body.username || !body.email || !body.password || !body.role) {
    return "Preencha nome, usuario, e-mail, senha e perfil.";
  }
  if (isSuperAdmin && !body.gabinete_id) {
    return "Informe o gabinete do novo usuario.";
  }
  return "";
}

function validateOwnProfileForm(body) {
  if (!body.name || !body.username || !body.email) {
    return "Preencha nome, usuario e e-mail.";
  }

  if (body.new_password || body.confirm_new_password || body.current_password) {
    if (!body.current_password) {
      return "Informe a senha atual para definir uma nova senha.";
    }
    if (!body.new_password) {
      return "Informe a nova senha.";
    }
    if (body.new_password !== body.confirm_new_password) {
      return "A confirmacao da nova senha nao confere.";
    }
  }

  return "";
}

function uniqueUsernameFromEmail(email) {
  const base = slugify(String(email).split("@")[0]).replaceAll("-", "");
  let candidate = base || "usuario";
  let suffix = 2;
  while (
    db.prepare("SELECT id FROM users WHERE lower(username) = lower(:username)").get({
      username: candidate,
    })
  ) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createSignatureProfile(gabineteId, body) {
  const result = db.prepare(
    `
      INSERT INTO signature_profiles (
        gabinete_id, label, signatory_name, signatory_role, closing_text,
        footer_text, file_url, active, created_at, updated_at
      ) VALUES (
        :gabinete_id, :label, :signatory_name, :signatory_role, :closing_text,
        :footer_text, :file_url, 1, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    label: body.label,
    signatory_name: body.signatory_name,
    signatory_role: body.signatory_role,
    closing_text: body.closing_text ?? "",
    footer_text: body.footer_text ?? "",
    file_url: body.file_url ?? "",
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return Number(result.lastInsertRowid);
}

function createAiLink(gabineteId, body) {
  const result = db.prepare(
    `
      INSERT INTO ai_links (
        gabinete_id, title, url, description, kind, category, visibility, is_builtin, sort_order, active, created_at, updated_at
      ) VALUES (
        :gabinete_id, :title, :url, :description, :kind, :category, :visibility, 0, :sort_order, 1, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    title: String(body.title || "").trim(),
    url: normalizeAiLinkUrl(body),
    description: body.description ?? "",
    kind: normalizeAiLinkKind(body.kind),
    category: String(body.category || "").trim(),
    visibility: normalizeAiLinkVisibility(body.visibility),
    sort_order: parseInteger(body.sort_order, 900),
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return Number(result.lastInsertRowid);
}

function getScopedAiLink(gabineteId, aiLinkId) {
  return db
    .prepare(`SELECT * FROM ai_links WHERE gabinete_id = :gabinete_id AND id = :id AND ${activeRowWhere()}`)
    .get({ gabinete_id: gabineteId, id: aiLinkId });
}

function updateAiLink(gabineteId, aiLinkId, body) {
  db.prepare(
    `
      UPDATE ai_links
      SET title = :title,
          url = :url,
          description = :description,
          kind = :kind,
          category = :category,
          visibility = :visibility,
          sort_order = :sort_order,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    id: aiLinkId,
    gabinete_id: gabineteId,
    title: String(body.title || "").trim(),
    url: normalizeAiLinkUrl(body),
    description: body.description ?? "",
    kind: normalizeAiLinkKind(body.kind),
    category: String(body.category || "").trim(),
    visibility: normalizeAiLinkVisibility(body.visibility),
    sort_order: parseInteger(body.sort_order, 900),
    updated_at: nowIso(),
  });
}

function deleteAiLink(gabineteId, aiLinkId) {
  db.prepare(
    "UPDATE ai_links SET active = 0, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND id = :id",
  ).run({ gabinete_id: gabineteId, id: aiLinkId, updated_at: nowIso() });
}

function normalizeContactBirthdayInput(body = {}) {
  const rawDate = String(body.birth_date || "").trim();
  const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const rawYear = parseInteger(body.birth_year, 0) || (dateMatch ? parseInteger(dateMatch[1], 0) : 0);
  const rawMonth = parseInteger(body.birth_month, 0) || (dateMatch ? parseInteger(dateMatch[2], 0) : 0);
  const rawDay = parseInteger(body.birth_day, 0) || (dateMatch ? parseInteger(dateMatch[3], 0) : 0);
  const validMonthDay = rawMonth >= 1 && rawMonth <= 12 && rawDay >= 1 && rawDay <= 31;
  const maxDay = rawMonth === 2 ? 29 : [4, 6, 9, 11].includes(rawMonth) ? 30 : 31;
  if (!validMonthDay || rawDay > maxDay) {
    return { birth_date: "", birth_month: null, birth_day: null, birth_year: null, birth_date_precision: "" };
  }
  const validYear = rawYear >= 1900 && rawYear <= new Date().getFullYear();
  const month = String(rawMonth).padStart(2, "0");
  const day = String(rawDay).padStart(2, "0");
  return {
    birth_date: validYear ? `${rawYear}-${month}-${day}` : "",
    birth_month: rawMonth,
    birth_day: rawDay,
    birth_year: validYear ? rawYear : null,
    birth_date_precision: validYear ? "full" : "month_day",
  };
}

function createContact(gabineteId, body) {
  const timestamp = nowIso();
  const birthday = normalizeContactBirthdayInput(body);
  const classification = resolveContactClassification(body);
  const nameMaxLength = classification.contact_type === "company" ? GABINETE_NAME_MAX_LENGTH : CONTACT_NAME_MAX_LENGTH;
  const result = db.prepare(
    `
      INSERT INTO contacts (
        gabinete_id, name, nickname, contact_type, register_kind, segment, gender, is_leader, is_authority,
        phone, whatsapp, cpf_rg_cns, birth_date, birth_month, birth_day, birth_year,
        birth_date_precision, email, photo_url, profession, referred_by,
        company_legal_name, foundation_date, employee_count, has_pet, address, number,
        complement, neighborhood, zip_code, city, uf, social_instagram, social_facebook,
        social_x, social_youtube, geo_lat, geo_lng, notes, tags, first_ticket_at,
        last_ticket_at, created_at, updated_at
      ) VALUES (
        :gabinete_id, :name, :nickname, :contact_type, :register_kind, :segment, :gender, :is_leader, :is_authority,
        :phone, :whatsapp, :cpf_rg_cns, :birth_date, :birth_month, :birth_day, :birth_year,
        :birth_date_precision, :email, :photo_url, :profession, :referred_by,
        :company_legal_name, :foundation_date, :employee_count, :has_pet, :address, :number,
        :complement, :neighborhood, :zip_code, :city, :uf, :social_instagram, :social_facebook,
        :social_x, :social_youtube, :geo_lat, :geo_lng, :notes, :tags, :first_ticket_at,
        :last_ticket_at, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    name: String(body.name ?? "").trim().slice(0, nameMaxLength),
    nickname: String(body.nickname ?? "").trim().slice(0, CONTACT_NICKNAME_MAX_LENGTH),
    contact_type: classification.contact_type,
    register_kind: classification.register_kind,
    segment: classification.segment,
    gender: body.gender ?? "",
    is_leader: classification.is_leader,
    is_authority: classification.is_authority,
    phone: normalizePhone(body.phone),
    whatsapp: normalizePhone(body.whatsapp),
    cpf_rg_cns: normalizeCpf(body.cpf_rg_cns),
    birth_date: birthday.birth_date,
    birth_month: birthday.birth_month,
    birth_day: birthday.birth_day,
    birth_year: birthday.birth_year,
    birth_date_precision: birthday.birth_date_precision,
    email: body.email ?? "",
    photo_url: body.photo_url ?? "",
    profession: body.profession ?? "",
    referred_by: body.referred_by ?? "",
    company_legal_name: body.company_legal_name ?? "",
    foundation_date: body.foundation_date ?? "",
    employee_count: nullableInt(body.employee_count),
    has_pet: toFlag(body.has_pet),
    address: body.address ?? "",
    number: body.number ?? "",
    complement: body.complement ?? "",
    neighborhood: body.neighborhood ?? "",
    zip_code: body.zip_code ?? "",
    city: body.city ?? "",
    uf: body.uf ?? "",
    social_instagram: body.social_instagram ?? "",
    social_facebook: body.social_facebook ?? "",
    social_x: body.social_x ?? "",
    social_youtube: body.social_youtube ?? "",
    geo_lat: body.geo_lat ?? "",
    geo_lng: body.geo_lng ?? "",
    notes: body.notes ?? "",
    tags: body.tags ?? "",
    first_ticket_at: body.first_ticket_at ?? "",
    last_ticket_at: body.last_ticket_at ?? "",
    created_at: timestamp,
    updated_at: timestamp,
  });
  return Number(result.lastInsertRowid);
}

function listContactFiles(gabineteId, contactId, limit = 12) {
  return db
    .prepare(
      `
        SELECT
          id, original_name, stored_name, file_url, mime_type, size_bytes, source,
          COALESCE(public_visible, 0) AS public_visible,
          public_visible_at,
          public_visible_by,
          created_at
        FROM contact_files
        WHERE gabinete_id = :gabinete_id AND contact_id = :contact_id
        ORDER BY created_at DESC, id DESC
        LIMIT :limit
      `,
    )
    .all({
      gabinete_id: gabineteId,
      contact_id: contactId,
      limit,
    });
}

function listTicketFiles(gabineteId, ticketId, limit = 12) {
  return db
    .prepare(
      `
        SELECT
          id, original_name, stored_name, file_url, mime_type, size_bytes, source,
          COALESCE(public_visible, 0) AS public_visible,
          public_visible_at,
          public_visible_by,
          created_at
        FROM contact_files
        WHERE gabinete_id = :gabinete_id AND source = :source
        ORDER BY created_at DESC, id DESC
        LIMIT :limit
      `,
    )
    .all({
      gabinete_id: gabineteId,
      source: `ticket:${ticketId}`,
      limit,
    });
}

function listPublicTicketFiles(gabineteId, ticketId) {
  return db
    .prepare(
      `
        SELECT
          id, original_name, file_url, mime_type, size_bytes, created_at, public_visible_at
        FROM contact_files
        WHERE gabinete_id = :gabinete_id
          AND source = :source
          AND COALESCE(public_visible, 0) = 1
        ORDER BY COALESCE(public_visible_at, created_at) DESC, id DESC
      `,
    )
    .all({
      gabinete_id: gabineteId,
      source: `ticket:${ticketId}`,
    });
}

function createContactFile(gabineteId, contactId, file) {
  const result = db.prepare(
    `
      INSERT INTO contact_files (
        gabinete_id, contact_id, original_name, stored_name, file_url, mime_type, size_bytes, source,
        public_visible, public_visible_at, public_visible_by, created_at
      ) VALUES (
        :gabinete_id, :contact_id, :original_name, :stored_name, :file_url, :mime_type, :size_bytes, :source,
        :public_visible, :public_visible_at, :public_visible_by, :created_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    contact_id: contactId,
    original_name: file.original_name,
    stored_name: file.stored_name,
    file_url: file.file_url,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    source: file.source || "manual",
    public_visible: toFlag(file.public_visible) === 1 ? 1 : 0,
    public_visible_at: file.public_visible_at || "",
    public_visible_by: nullableInt(file.public_visible_by),
    created_at: nowIso(),
  });
  return Number(result.lastInsertRowid);
}

function ticketImageExtensionForMime(mimeType) {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return "";
}

function prepareTicketImageUpload(payload = null) {
  if (!payload || !String(payload.data_url || "").trim()) return null;
  const dataUrl = String(payload.data_url || "");
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    throw new Error("Nao foi possivel ler o arquivo anexado.");
  }

  const originalName = String(payload.name || "arquivo").trim().slice(0, 180) || "arquivo";
  const declaredType = String(payload.type || match[1] || "").toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  const inferredType = inferFinanceReceiptMimeType(buffer);
  const mimeType = inferredType || declaredType;

  if (!TICKET_IMAGE_ALLOWED_FILE_TYPES.has(mimeType)) {
    throw new Error("Anexe apenas PDF, JPG, PNG ou WEBP.");
  }
  if (!inferredType) {
    throw new Error("O arquivo anexado precisa ser um PDF ou imagem valida.");
  }
  const maxBytes = mimeType === "application/pdf" ? TICKET_IMAGE_MAX_PDF_FILE_BYTES : TICKET_IMAGE_MAX_IMAGE_FILE_BYTES;
  if (buffer.length <= 0 || buffer.length > maxBytes) {
    throw new Error(mimeType === "application/pdf" ? "PDF pode ter no maximo 10 MB." : "Imagem pode ter no maximo 5 MB.");
  }

  return {
    original_name: originalName,
    mime_type: mimeType,
    size_bytes: buffer.length,
    extension: ticketImageExtensionForMime(mimeType),
    buffer,
  };
}

function prepareTicketImageUploads(payloads = []) {
  const items = Array.isArray(payloads) ? payloads.filter(Boolean) : [];
  if (items.length > TICKET_IMAGE_MAX_FILES) {
    throw new Error(`Anexe no maximo ${TICKET_IMAGE_MAX_FILES} arquivos por atendimento.`);
  }
  const uploads = items.map((item) => prepareTicketImageUpload(item)).filter(Boolean);
  const totalBytes = uploads.reduce((total, upload) => total + Number(upload.size_bytes || 0), 0);
  if (totalBytes > TICKET_IMAGE_MAX_TOTAL_BYTES) {
    throw new Error("Os anexos do atendimento podem ter no maximo 25 MB no total.");
  }
  return uploads;
}

function storeTicketImageUploads(gabineteId, contactId, ticketId, uploads = []) {
  if (!uploads.length) return [];
  const existingTotal = db
    .prepare(
      "SELECT COUNT(*) AS total FROM contact_files WHERE gabinete_id = :gabinete_id AND source = :source",
    )
    .get({ gabinete_id: gabineteId, source: `ticket:${ticketId}` })?.total || 0;
  if (existingTotal + uploads.length > TICKET_IMAGE_MAX_FILES) {
    throw new Error(`O atendimento pode ter no maximo ${TICKET_IMAGE_MAX_FILES} anexos.`);
  }
  const existingBytes = db
    .prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM contact_files WHERE gabinete_id = :gabinete_id AND source = :source",
    )
    .get({ gabinete_id: gabineteId, source: `ticket:${ticketId}` })?.total || 0;
  const uploadBytes = uploads.reduce((total, upload) => total + Number(upload.size_bytes || 0), 0);
  if (existingBytes + uploadBytes > TICKET_IMAGE_MAX_TOTAL_BYTES) {
    throw new Error("Os anexos do atendimento podem ter no maximo 25 MB no total.");
  }

  mkdirSync(TICKET_IMAGE_UPLOAD_DIR, { recursive: true });
  return uploads.map((upload) => {
    const rawName = String(upload.original_name || "arquivo").replace(/\.[^.]+$/, "");
    const baseName = slugify(rawName).slice(0, 42) || "arquivo";
    const storedName = `${gabineteId}-${ticketId}-${Date.now()}-${randomBytes(3).toString("hex")}-${baseName}${upload.extension}`;
    const targetPath = resolve(TICKET_IMAGE_UPLOAD_DIR, storedName);
    writeFileSync(targetPath, upload.buffer);
    const file = {
      original_name: upload.original_name,
      stored_name: storedName,
      file_url: `${TICKET_IMAGE_URL_PREFIX}/${storedName}`,
      mime_type: upload.mime_type,
      size_bytes: upload.size_bytes,
      source: `ticket:${ticketId}`,
    };
    return {
      id: createContactFile(gabineteId, contactId, file),
      ...file,
    };
  });
}

function storePublicSelfRegisterFile(gabinete, contactId, file) {
  if (!file?.filename || !file?.path) return null;
  if (!PUBLIC_SELF_REGISTER_ALLOWED_FILE_TYPES.has(String(file.type || "").toLowerCase())) {
    throw new Error("Envie um arquivo em PDF, JPG, PNG ou WEBP.");
  }
  if (Number(file.size || 0) <= 0 || Number(file.size || 0) > PUBLIC_SELF_REGISTER_MAX_FILE_BYTES) {
    throw new Error("O arquivo pode ter no maximo 10 MB.");
  }

  mkdirSync(PUBLIC_SELF_REGISTER_UPLOAD_DIR, { recursive: true });
  const extension = extname(String(file.filename || "")).toLowerCase() || ".bin";
  const baseName = slugify(String(file.filename || "").replace(/\.[^.]+$/, "")).slice(0, 42) || "arquivo";
  const storedName = `${gabinete.id}-${contactId}-${Date.now()}-${baseName}${extension}`;
  const targetPath = resolve(PUBLIC_SELF_REGISTER_UPLOAD_DIR, storedName);

  try {
    renameSync(file.path, targetPath);
  } catch {
    try {
      unlinkSync(file.path);
    } catch {}
    throw new Error("Nao foi possivel guardar o arquivo enviado.");
  }

  return {
    original_name: file.filename,
    stored_name: storedName,
    file_url: `/uploads/autocadastro/${storedName}`,
    mime_type: String(file.type || "application/octet-stream").toLowerCase(),
    size_bytes: Number(file.size || 0),
    source: "autocadastro_publico",
  };
}

function cleanupParsedFiles(files = []) {
  files.forEach((file) => {
    if (file?.path && existsSync(file.path)) {
      try {
        unlinkSync(file.path);
      } catch {}
    }
  });
}

function updateContact(gabineteId, contactId, body) {
  const birthday = normalizeContactBirthdayInput(body);
  const classification = resolveContactClassification(body);
  const nameMaxLength = classification.contact_type === "company" ? GABINETE_NAME_MAX_LENGTH : CONTACT_NAME_MAX_LENGTH;
  db.prepare(
    `
      UPDATE contacts
      SET name = :name,
          nickname = CASE WHEN :nickname_provided = 1 THEN :nickname ELSE nickname END,
          contact_type = :contact_type,
          register_kind = :register_kind,
          segment = :segment,
          gender = :gender,
          is_leader = :is_leader,
          is_authority = :is_authority,
          phone = :phone,
          whatsapp = :whatsapp,
          cpf_rg_cns = :cpf_rg_cns,
          birth_date = :birth_date,
          birth_month = :birth_month,
          birth_day = :birth_day,
          birth_year = :birth_year,
          birth_date_precision = :birth_date_precision,
          email = :email,
          photo_url = :photo_url,
          profession = :profession,
          referred_by = :referred_by,
          company_legal_name = :company_legal_name,
          foundation_date = :foundation_date,
          employee_count = :employee_count,
          has_pet = :has_pet,
          address = :address,
          number = :number,
          complement = :complement,
          neighborhood = :neighborhood,
          zip_code = :zip_code,
          city = :city,
          uf = :uf,
          social_instagram = :social_instagram,
          social_facebook = :social_facebook,
          social_x = :social_x,
          social_youtube = :social_youtube,
          geo_lat = :geo_lat,
          geo_lng = :geo_lng,
          notes = :notes,
          tags = :tags,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    id: contactId,
    gabinete_id: gabineteId,
    name: String(body.name ?? "").trim().slice(0, nameMaxLength),
    nickname_provided: Object.prototype.hasOwnProperty.call(body, "nickname") ? 1 : 0,
    nickname: String(body.nickname ?? "").trim().slice(0, CONTACT_NICKNAME_MAX_LENGTH),
    contact_type: classification.contact_type,
    register_kind: classification.register_kind,
    segment: classification.segment,
    gender: body.gender ?? "",
    is_leader: classification.is_leader,
    is_authority: classification.is_authority,
    phone: normalizePhone(body.phone),
    whatsapp: normalizePhone(body.whatsapp),
    cpf_rg_cns: normalizeCpf(body.cpf_rg_cns),
    birth_date: birthday.birth_date,
    birth_month: birthday.birth_month,
    birth_day: birthday.birth_day,
    birth_year: birthday.birth_year,
    birth_date_precision: birthday.birth_date_precision,
    email: body.email ?? "",
    photo_url: body.photo_url ?? "",
    profession: body.profession ?? "",
    referred_by: body.referred_by ?? "",
    company_legal_name: body.company_legal_name ?? "",
    foundation_date: body.foundation_date ?? "",
    employee_count: nullableInt(body.employee_count),
    has_pet: toFlag(body.has_pet),
    address: body.address ?? "",
    number: body.number ?? "",
    complement: body.complement ?? "",
    neighborhood: body.neighborhood ?? "",
    zip_code: body.zip_code ?? "",
    city: body.city ?? "",
    uf: body.uf ?? "",
    social_instagram: body.social_instagram ?? "",
    social_facebook: body.social_facebook ?? "",
    social_x: body.social_x ?? "",
    social_youtube: body.social_youtube ?? "",
    geo_lat: body.geo_lat ?? "",
    geo_lng: body.geo_lng ?? "",
    notes: body.notes ?? "",
    tags: body.tags ?? "",
    updated_at: nowIso(),
  });
}

function findContactDuplicateFromTicketBody(gabineteId, body) {
  const normalizedCpfValue = normalizeCpf(body.contact_cpf);
  const phoneCandidates = [
    ...new Set(
      [
        ...phoneLookupCandidates(body.contact_phone),
        ...phoneLookupCandidates(body.contact_whatsapp),
      ].filter(Boolean),
    ),
  ];
  const params = {
    gabinete_id: gabineteId,
    cpf: normalizedCpfValue,
  };
  let phoneClause = "";
  if (phoneCandidates.length) {
    const placeholders = phoneCandidates.map((_, index) => `:phone${index}`).join(", ");
    phoneCandidates.forEach((candidate, index) => {
      params[`phone${index}`] = candidate;
    });
    phoneClause = `OR phone IN (${placeholders}) OR whatsapp IN (${placeholders})`;
  }

  if (!normalizedCpfValue && !phoneCandidates.length) return null;

  return db
    .prepare(
      `
        SELECT *
        FROM contacts
        WHERE gabinete_id = :gabinete_id
          AND (deleted_at IS NULL OR deleted_at = '')
          AND (
            (:cpf <> '' AND cpf_rg_cns = :cpf)
            ${phoneClause}
          )
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(params);
}

function upsertContactFromTicketBody(gabineteId, body) {
  if (body.contact_id) {
    const existing = getScopedContact(gabineteId, Number(body.contact_id));
    if (existing) {
      updateContact(gabineteId, existing.id, {
        ...existing,
        name: body.contact_name || existing.name,
        nickname: Object.prototype.hasOwnProperty.call(body, "contact_nickname")
          ? String(body.contact_nickname || "").trim()
          : existing.nickname,
        register_kind: body.contact_register_kind || existing.register_kind,
        contact_type: body.contact_type || existing.contact_type,
        segment: body.contact_segment || existing.segment,
        gender: body.contact_gender || existing.gender,
        is_leader: body.contact_is_leader ?? existing.is_leader,
        is_authority: body.contact_is_authority ?? existing.is_authority,
        phone: body.contact_phone || existing.phone,
        whatsapp: body.contact_whatsapp || existing.whatsapp,
        cpf_rg_cns: body.contact_cpf || existing.cpf_rg_cns,
        birth_date: body.contact_birth_date || existing.birth_date,
        email: body.contact_email || existing.email,
        photo_url: body.contact_photo_url || existing.photo_url,
        profession: body.contact_profession || existing.profession,
        referred_by: body.contact_referred_by || existing.referred_by,
        company_legal_name: body.contact_company_legal_name || existing.company_legal_name,
        foundation_date: body.contact_foundation_date || existing.foundation_date,
        employee_count: body.contact_employee_count || existing.employee_count,
        has_pet: body.contact_has_pet ?? existing.has_pet,
        address: body.contact_address || existing.address,
        number: body.contact_number || existing.number,
        complement: body.contact_complement || existing.complement,
        neighborhood: body.contact_neighborhood || existing.neighborhood,
        zip_code: body.contact_zip_code || existing.zip_code,
        city: body.contact_city || existing.city,
        uf: body.contact_uf || existing.uf,
        social_instagram: body.contact_social_instagram || existing.social_instagram,
        social_facebook: body.contact_social_facebook || existing.social_facebook,
        social_x: body.contact_social_x || existing.social_x,
        social_youtube: body.contact_social_youtube || existing.social_youtube,
        geo_lat: body.contact_geo_lat || existing.geo_lat,
        geo_lng: body.contact_geo_lng || existing.geo_lng,
      });
      return existing.id;
    }
  }

  const duplicate = findContactDuplicateFromTicketBody(gabineteId, body);

  if (duplicate) {
    updateContact(gabineteId, duplicate.id, {
      ...duplicate,
      name: body.contact_name || duplicate.name,
      nickname: Object.prototype.hasOwnProperty.call(body, "contact_nickname")
        ? String(body.contact_nickname || "").trim()
        : duplicate.nickname,
      register_kind: body.contact_register_kind || duplicate.register_kind,
      contact_type: body.contact_type || duplicate.contact_type,
      segment: body.contact_segment || duplicate.segment,
      gender: body.contact_gender || duplicate.gender,
      is_leader: body.contact_is_leader ?? duplicate.is_leader,
      is_authority: body.contact_is_authority ?? duplicate.is_authority,
      phone: body.contact_phone || duplicate.phone,
      whatsapp: body.contact_whatsapp || duplicate.whatsapp,
      cpf_rg_cns: body.contact_cpf || duplicate.cpf_rg_cns,
      birth_date: body.contact_birth_date || duplicate.birth_date,
      email: body.contact_email || duplicate.email,
      photo_url: body.contact_photo_url || duplicate.photo_url,
      profession: body.contact_profession || duplicate.profession,
      referred_by: body.contact_referred_by || duplicate.referred_by,
      company_legal_name: body.contact_company_legal_name || duplicate.company_legal_name,
      foundation_date: body.contact_foundation_date || duplicate.foundation_date,
      employee_count: body.contact_employee_count || duplicate.employee_count,
      has_pet: body.contact_has_pet ?? duplicate.has_pet,
      address: body.contact_address || duplicate.address,
      number: body.contact_number || duplicate.number,
      complement: body.contact_complement || duplicate.complement,
      neighborhood: body.contact_neighborhood || duplicate.neighborhood,
      zip_code: body.contact_zip_code || duplicate.zip_code,
      city: body.contact_city || duplicate.city,
      uf: body.contact_uf || duplicate.uf,
      social_instagram: body.contact_social_instagram || duplicate.social_instagram,
      social_facebook: body.contact_social_facebook || duplicate.social_facebook,
      social_x: body.contact_social_x || duplicate.social_x,
      social_youtube: body.contact_social_youtube || duplicate.social_youtube,
      geo_lat: body.contact_geo_lat || duplicate.geo_lat,
      geo_lng: body.contact_geo_lng || duplicate.geo_lng,
    });
    return duplicate.id;
  }

  return createContact(gabineteId, {
    name: body.contact_name,
    nickname: body.contact_nickname,
    register_kind: body.contact_register_kind || "",
    contact_type: body.contact_type || "person",
    segment: body.contact_segment || "municipe",
    gender: body.contact_gender || "",
    is_leader: body.contact_is_leader ?? 0,
    is_authority: body.contact_is_authority ?? 0,
    phone: body.contact_phone,
    whatsapp: body.contact_whatsapp,
    cpf_rg_cns: body.contact_cpf,
    birth_date: body.contact_birth_date,
    email: body.contact_email,
    photo_url: body.contact_photo_url,
    profession: body.contact_profession,
    referred_by: body.contact_referred_by,
    company_legal_name: body.contact_company_legal_name,
    foundation_date: body.contact_foundation_date,
    employee_count: body.contact_employee_count,
    has_pet: body.contact_has_pet ?? 0,
    address: body.contact_address,
    number: body.contact_number,
    complement: body.contact_complement,
    neighborhood: body.contact_neighborhood,
    zip_code: body.contact_zip_code,
    city: body.contact_city,
    uf: body.contact_uf,
    social_instagram: body.contact_social_instagram,
    social_facebook: body.contact_social_facebook,
    social_x: body.contact_social_x,
    social_youtube: body.contact_social_youtube,
    geo_lat: body.contact_geo_lat,
    geo_lng: body.contact_geo_lng,
    notes: "",
    tags: "",
  });
}

function insertTicketHistory(gabineteId, ticketId, userId, item) {
  db.prepare(
    `
      INSERT INTO ticket_history (
        gabinete_id, ticket_id, user_id, action_type, text, previous_status,
        new_status, next_action, next_action_date, is_internal,
        public_visible, public_visible_at, public_visible_by, created_at
      ) VALUES (
        :gabinete_id, :ticket_id, :user_id, :action_type, :text, :previous_status,
        :new_status, :next_action, :next_action_date, :is_internal,
        :public_visible, :public_visible_at, :public_visible_by, :created_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    ticket_id: ticketId,
    user_id: userId,
    action_type: item.action_type,
    text: item.text,
    previous_status: item.previous_status,
    new_status: item.new_status,
    next_action: item.next_action,
    next_action_date: item.next_action_date,
    is_internal: item.is_internal === undefined ? 0 : toFlag(item.is_internal),
    public_visible: toFlag(item.public_visible) === 1 ? 1 : 0,
    public_visible_at: toFlag(item.public_visible) === 1 ? (item.public_visible_at || nowIso()) : "",
    public_visible_by: toFlag(item.public_visible) === 1 ? (nullableInt(item.public_visible_by) || userId || null) : null,
    created_at: item.created_at || nowIso(),
  });
}

function refreshContactTicketDates(gabineteId, contactId) {
  const info = db
    .prepare(
      `
        SELECT MIN(opened_at) AS first_date, MAX(opened_at) AS last_date
        FROM tickets
        WHERE gabinete_id = :gabinete_id AND contact_id = :contact_id
      `,
    )
    .get({ gabinete_id: gabineteId, contact_id: contactId });

  db.prepare(
    `
      UPDATE contacts
      SET first_ticket_at = :first_date,
          last_ticket_at = :last_date,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    gabinete_id: gabineteId,
    id: contactId,
    first_date: info.first_date ?? "",
    last_date: info.last_date ?? "",
    updated_at: nowIso(),
  });
}

function searchTickets(gabineteId, query) {
  if (!query) return [];
  return listTickets(gabineteId, { q: query }).slice(0, 10);
}

function searchContacts(gabineteId, query) {
  if (!query) return [];
  return listContacts(gabineteId, { q: query }).slice(0, 10);
}

function buildSearchHref(path, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function searchMeta(...values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(" · ");
}

function buildGlobalSearchResults(gabineteId, query, ctx = null) {
  const term = String(query || "").trim();
  const normalized = normalizeSearchText(term);
  const digits = normalizePhone(term);
  if (normalized.length < 2 && digits.length < 3) return [];

  const items = [];
  if (!ctx || canAccessModule(ctx, "tickets", "view")) {
    searchTickets(gabineteId, term).slice(0, 5).forEach((ticket) => {
      items.push({
        type: "ticket",
        label: "Atendimento",
        title: ticket.demand_title || ticket.number || "Atendimento",
        meta: searchMeta(ticket.number, ticket.contact_nickname || ticket.contact_name, ticket.status),
        href: buildSearchHref("/atendimentos", { focus: ticket.id, q: ticket.number || term }),
      });
    });
  }
  if (!ctx || canAccessModule(ctx, "contacts", "view")) {
    searchContacts(gabineteId, term).slice(0, 5).forEach((contact) => {
      items.push({
        type: "contact",
        label: "Contato",
        title: contact.nickname || contact.name || "Contato",
        meta: searchMeta(contact.nickname ? contact.name : "", contact.phone || contact.whatsapp, contact.email, contact.neighborhood || contact.city),
        href: buildSearchHref("/contatos", { focus: contact.id, q: contact.nickname || contact.name || term }),
      });
    });
  }
  if (!ctx || canAccessModule(ctx, "notes", "view")) {
    listNotes(gabineteId, { q: term }).slice(0, 4).forEach((note) => {
      items.push({
        type: "note",
        label: "Post-it",
        title: note.subject || "Post-it",
        meta: searchMeta(note.updated_at ? String(note.updated_at).slice(0, 10) : ""),
        href: buildSearchHref("/postit", { q: note.subject || term }),
      });
    });
  }
  if (!ctx || canAccessModule(ctx, "tasks", "view")) {
    listTasks(gabineteId, { q: term }).slice(0, 4).forEach((task) => {
      items.push({
        type: "task",
        label: "Tarefa",
        title: task.title || "Tarefa",
        meta: searchMeta(task.status, task.responsible_name, task.due_at ? String(task.due_at).slice(0, 10) : ""),
        href: buildSearchHref("/tarefas", { q: task.title || term }),
      });
    });
  }
  if (!ctx || canAccessModule(ctx, "documents", "view")) {
    listDocuments(gabineteId, { q: term }).slice(0, 3).forEach((document) => {
      items.push({
        type: "document",
        label: "Documento",
        title: document.subject_line || document.internal_number || "Documento",
        meta: searchMeta(document.internal_number, document.type, document.status),
        href: buildSearchHref("/documentos", { q: document.internal_number || document.subject_line || term }),
      });
    });
  }
  if (!ctx || canAccessModule(ctx, "projects", "view")) {
    listProjects(gabineteId, { q: term }).slice(0, 3).forEach((project) => {
      items.push({
        type: "project",
        label: "Propositura",
        title: project.title || "Propositura",
        meta: searchMeta(project.status, project.category, project.responsible_name),
        href: buildSearchHref("/proposituras", { q: project.title || term }),
      });
    });
  }
  if (!ctx || canAccessModule(ctx, "finance", "view")) {
    listFinanceEntries(gabineteId, { q: term }).slice(0, 3).forEach((entry) => {
      items.push({
        type: "finance",
        label: "Financeiro",
        title: entry.title || "Lancamento",
        meta: searchMeta(entry.entry_type, entry.payment_status || entry.status, entry.counterparty, entry.entry_date),
        href: buildSearchHref("/financeiro", { q: entry.title || term }),
      });
    });
  }

  return items.slice(0, 18);
}

function isFinalStatus(gabineteId, statusName) {
  const status = db
    .prepare(
      `
        SELECT is_final
        FROM status_custom
        WHERE gabinete_id = :gabinete_id AND name = :name
      `,
    )
    .get({
      gabinete_id: gabineteId,
      name: statusName,
    });
  return Boolean(status?.is_final);
}

function inferFinalStatusName(statusName) {
  const normalized = normalizeTextKey(statusName);
  return [
    "resolvido",
    "resolucao",
    "concluido",
    "finalizado",
    "fechado",
    "encerrado",
    "oficio encaminhado",
    "indicacao requerimento",
  ].some((item) => normalized.includes(item));
}

function isTicketFinalStatus(gabineteId, statusName) {
  return isFinalStatus(gabineteId, statusName) || inferFinalStatusName(statusName);
}

function nullableInt(value) {
  const parsed = parseInteger(value, 0);
  return parsed > 0 ? parsed : null;
}

const SCOPED_REFERENCE_TABLES = {
  contacts: "contacts",
  document_templates: "document_templates",
  documents: "documents",
  finance_entries: "finance_entries",
  notes: "notes",
  projects: "projects",
  signature_profiles: "signature_profiles",
  tasks: "tasks",
  tickets: "tickets",
  users: "users",
  whatsapp_templates: "whatsapp_templates",
};

function scopedReferenceId(gabineteId, tableKey, value) {
  const id = nullableInt(value);
  if (!id) return null;
  const table = SCOPED_REFERENCE_TABLES[tableKey];
  if (!table) return null;
  const deletedWhere = trashDefinition(tableKey) ? `AND ${activeRowWhere()}` : "";
  const row = db
    .prepare(`SELECT id FROM ${table} WHERE gabinete_id = :gabinete_id AND id = :id ${deletedWhere} LIMIT 1`)
    .get({ gabinete_id: gabineteId, id });
  return row ? id : null;
}

function validateScopedReferences(gabineteId, body = {}, specs = []) {
  for (const spec of specs) {
    const id = nullableInt(body[spec.field]);
    if (id && !scopedReferenceId(gabineteId, spec.table, id)) {
      return `${spec.label} nao pertence a este gabinete ou nao foi encontrado.`;
    }
  }
  return "";
}

function toFlag(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value > 0 ? 1 : 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "on", "yes", "sim"].includes(normalized) ? 1 : 0;
}

function resolveFollowUpDays(gabineteId, value) {
  const parsed = parseInteger(value, 0);
  if (parsed > 0) return parsed;
  return parseInteger(getGabineteDefaults(gabineteId).default_follow_up_days, 3) || 3;
}

function resolveTicketFollowUpPlan(gabineteId, body = {}, currentTicket = null) {
  const openedAt = body.opened_at || currentTicket?.opened_at || currentDate();
  const followUpDays = resolveFollowUpDays(gabineteId, body.follow_up_days ?? currentTicket?.follow_up_days);
  const isFinal = isTicketFinalStatus(gabineteId, body.status || currentTicket?.status);
  const hasNextAction = Object.prototype.hasOwnProperty.call(body, "next_action");
  const hasNextActionDate = Object.prototype.hasOwnProperty.call(body, "next_action_date");
  const nextActionFallback = hasNextActionDate && String(body.next_action_date || "").trim()
    ? "Retorno"
    : "Dar retorno ao municipe";
  let nextAction = String(
    hasNextAction ? body.next_action : currentTicket?.next_action ?? (isFinal ? "" : nextActionFallback),
  ).trim();
  const nextActionDate = String(
    hasNextActionDate
      ? body.next_action_date
      : currentTicket?.next_action_date || (isFinal ? "" : addDays(openedAt, followUpDays)),
  ).trim();
  if (!nextAction && nextActionDate && !isFinal) nextAction = "Retorno";

  return {
    openedAt,
    followUpDays,
    nextAction: isFinal ? "" : nextAction,
    nextActionDate: isFinal || !nextAction ? "" : nextActionDate,
  };
}

function normalizeMoneyToCents(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const numeric = Number.parseFloat(normalized);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function currentDate() {
  return currentDateInTimeZone(new Date());
}

function currentDateInTimeZone(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = APP_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function addMonthsClamped(dateValue, amount) {
  const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateValue || currentDate();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetMonthIndex = month - 1 + Number(amount || 0);
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(normalizedMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function daysUntilDate(fromDate, targetDate) {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${targetDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function formatHolidayDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatHolidayWeekday(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatHolidayHumanDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(`${date}T12:00:00Z`));
}

const PT_BR_MONTHS = {
  janeiro: "01",
  fevereiro: "02",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

function getUfName(uf) {
  return BR_UFS_FALLBACK.find((item) => item.sigla === uf)?.nome || uf;
}

function getGabineteHolidayLocation(gabineteId) {
  const gabinete = db
    .prepare("SELECT city, city_ibge, uf FROM gabinetes WHERE id = :id")
    .get({ id: gabineteId });

  return {
    city: gabinete?.city || "",
    city_ibge: gabinete?.city_ibge || "",
    uf: gabinete?.uf || "",
  };
}

function parsePortugueseHolidayDate(label) {
  const normalized = normalizePlainText(label);
  const match = normalized.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (!match) return "";
  const [, day, monthName, year] = match;
  const month = PT_BR_MONTHS[monthName] || "";
  if (!month) return "";
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function parseMunicipalHolidaysFromIferiadosHtml(html, options = {}) {
  const matches = html.matchAll(
    /holiday-card_title[^>]*>([^<]+)<\/div>[\s\S]*?holiday-type-tag_[^>]*>([^<]+)<\/div>[\s\S]*?<div>([^<]+)<\/div><\/div><\/div>/g,
  );

  return Array.from(matches)
    .map((match) => {
      const name = String(match[1] || "").trim();
      const typeLabel = String(match[2] || "").trim();
      const humanDate = String(match[3] || "").trim();
      const date = parsePortugueseHolidayDate(humanDate);
      return {
        name,
        typeLabel,
        date,
      };
    })
    .filter((item) => item.date && normalizePlainText(item.typeLabel).includes("feriado municipal"))
    .map((item) => ({
      scope: "municipal",
      kind: "holiday",
      date: item.date,
      year: Number(item.date.slice(0, 4)),
      name: item.name,
      uf: String(options.uf || "").toUpperCase(),
      city_name: options.cityName || "",
      city_ibge: options.cityIbge || "",
      legal_basis: "",
      source_name: "iFeriados",
      source_url: options.sourceUrl || "",
      validation_status: "municipal_provider",
      notes: "Catalogo municipal sincronizado automaticamente de fonte publica e salvo no sistema.",
    }));
}

function upsertHolidayRow(row) {
  const dedupeKey = [
    row.scope || "",
    row.kind || "holiday",
    row.date || "",
    row.uf || "",
    row.city_ibge || "",
    row.city_name || "",
    row.name || "",
  ].join("|");
  const timestamp = nowIso();

  db.prepare(
    `
      INSERT INTO holidays (
        scope, kind, date, year, name, uf, city_name, city_ibge, legal_basis,
        source_name, source_url, validation_status, notes, dedupe_key, created_at, updated_at
      ) VALUES (
        :scope, :kind, :date, :year, :name, :uf, :city_name, :city_ibge, :legal_basis,
        :source_name, :source_url, :validation_status, :notes, :dedupe_key, :created_at, :updated_at
      )
      ON CONFLICT(dedupe_key) DO UPDATE SET
        legal_basis = excluded.legal_basis,
        source_name = excluded.source_name,
        source_url = excluded.source_url,
        validation_status = excluded.validation_status,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `,
  ).run({
    ...row,
    dedupe_key: dedupeKey,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

async function syncMunicipalHolidayCatalogForCity(options = {}) {
  const uf = normalizeUf(options.uf);
  const cityName = String(options.cityName || options.city_name || "").trim();
  const cityIbge = String(options.cityIbge || options.city_ibge || "").trim();
  const year = parseInteger(options.year, 0);
  if (!uf || !cityName || year < 2024) return [];

  const slug = slugify(cityName);
  const sourceUrl = `https://www.iferiados.com.br/feriados/${year}/regionais/${uf.toLowerCase()}/${slug}`;
  const html = await fetchRemoteText(sourceUrl, { timeoutMs: 7000 });
  if (!html || !html.includes("Feriados Estaduais e Municipais")) {
    return [];
  }

  const rows = parseMunicipalHolidaysFromIferiadosHtml(html, {
    uf,
    cityName,
    cityIbge,
    sourceUrl,
  });

  if (!rows.length) {
    return [];
  }

  db.exec("BEGIN");
  try {
    rows.forEach(upsertHolidayRow);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return rows;
}

async function ensureMunicipalHolidayCatalogForContext(context, years = []) {
  const uf = normalizeUf(context?.selected_uf || "");
  const cityName = String(context?.selected_city || "").trim();
  const cityIbge = String(context?.selected_city_ibge || "").trim();
  if (!uf || !cityName) return;

  for (const rawYear of years) {
    const year = parseInteger(rawYear, 0);
    if (year < 2024) continue;

    const existing = db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM holidays
          WHERE scope = 'municipal'
            AND year = :year
            AND uf = :uf
            AND (
              (:city_ibge <> '' AND city_ibge = :city_ibge)
              OR (:city_ibge = '' AND lower(city_name) = lower(:city_name))
            )
        `,
      )
      .get({
        year,
        uf,
        city_ibge: cityIbge,
        city_name: cityName,
      });

    if (Number(existing?.total || 0) > 0) {
      continue;
    }

    await syncMunicipalHolidayCatalogForCity({
      uf,
      city_name: cityName,
      city_ibge: cityIbge,
      year,
    });
  }
}

function listHolidayCatalog(options = {}) {
  const kind = String(options.kind || "holiday").trim() || "holiday";
  const uf = String(options.uf || "").toUpperCase();
  const cityName = String(options.cityName || options.city_name || "").trim();
  const cityIbge = String(options.cityIbge || options.city_ibge || "").trim();
  const year = parseInteger(options.year, 0);
  const fromDate = String(options.fromDate || options.from_date || "").trim();
  const clauses = ["kind = :kind"];
  const params = { kind };

  if (year > 0) {
    clauses.push("year = :year");
    params.year = year;
  }

  if (fromDate) {
    clauses.push("date >= :from_date");
    params.from_date = fromDate;
  }

  const scopeClauses = ["scope = 'national'"];
  if (uf) {
    scopeClauses.push("(scope = 'state' AND uf = :uf)");
    params.uf = uf;
  }
  if (cityIbge) {
    scopeClauses.push("(scope = 'municipal' AND city_ibge = :city_ibge)");
    params.city_ibge = cityIbge;
  } else if (cityName && uf) {
    scopeClauses.push("(scope = 'municipal' AND uf = :uf AND lower(city_name) = lower(:city_name))");
    params.city_name = cityName;
  }
  clauses.push(`(${scopeClauses.join(" OR ")})`);

  return db
    .prepare(
      `
        SELECT
          scope,
          kind,
          date,
          year,
          name,
          uf,
          city_name,
          city_ibge,
          legal_basis,
          source_name,
          source_url,
          validation_status,
          notes
        FROM holidays
        WHERE ${clauses.join(" AND ")}
        ORDER BY date ASC, scope ASC, name ASC
      `,
    )
    .all(params);
}

function getHolidayCatalogContext(gabineteId, selectedUf = "") {
  const gabineteLocation = getGabineteHolidayLocation(gabineteId);
  const gabineteUf = String(gabineteLocation.uf || "").toUpperCase();
  const resolvedUf = String(selectedUf || gabineteUf || "SP").toUpperCase();
  const useMunicipalBase = !resolvedUf || resolvedUf === gabineteUf;

  return {
    selected_uf: resolvedUf,
    selected_uf_label: getUfName(resolvedUf),
    selected_city: useMunicipalBase ? gabineteLocation.city || "" : "",
    selected_city_ibge: useMunicipalBase ? gabineteLocation.city_ibge || "" : "",
    gabinete_uf: gabineteUf,
  };
}

async function hydrateHolidayContext(context = {}, options = {}) {
  const selectedUf = normalizeUf(context.selected_uf || context.gabinete_uf || "SP") || "SP";
  const selectedCity = String(context.selected_city || "").trim();
  const selectedCityIbge = String(context.selected_city_ibge || "").trim();
  let resolvedCity = selectedCity;
  let resolvedCityIbge = selectedCityIbge;

  if (selectedUf && selectedCity && !selectedCityIbge) {
    const municipality = await resolveMunicipalityByName(selectedUf, selectedCity);
    if (municipality) {
      resolvedCity = municipality.nome || selectedCity;
      resolvedCityIbge = municipality.ibge || "";
    }
  }

  const persistGabineteId = parseInteger(options.persistGabineteId, 0);
  if (persistGabineteId > 0 && resolvedCity && resolvedCityIbge && resolvedCityIbge !== selectedCityIbge) {
    db.prepare(
      `
        UPDATE gabinetes
        SET city = :city,
            city_ibge = :city_ibge,
            uf = :uf,
            updated_at = :updated_at
        WHERE id = :id
      `,
    ).run({
      id: persistGabineteId,
      city: resolvedCity,
      city_ibge: resolvedCityIbge,
      uf: selectedUf,
      updated_at: nowIso(),
    });
  }

  return {
    ...context,
    selected_uf: selectedUf,
    selected_uf_label: getUfName(selectedUf),
    selected_city: resolvedCity,
    selected_city_ibge: resolvedCityIbge,
    gabinete_uf: normalizeUf(context.gabinete_uf || selectedUf) || selectedUf,
  };
}

function getHolidayCatalogForContext(context, options = {}) {
  return listHolidayCatalog({
    kind: "holiday",
    uf: context.selected_uf,
    city_name: context.selected_city,
    city_ibge: context.selected_city_ibge,
    year: options.year || 0,
    from_date: options.fromDate || "",
  });
}

function getUpcomingHolidayNotice(referenceDate = currentDate(), context = {}) {
  const coverage = getHolidayCoverageWindow(referenceDate);
  const nextHoliday = getHolidayCatalogForContext(context, { fromDate: coverage.start }).find(
    (item) => item.date >= referenceDate && item.date <= coverage.end,
  );
  if (!nextHoliday) return null;

  const daysUntil = daysUntilDate(referenceDate, nextHoliday.date);
  if (daysUntil < 0) return null;

  const scopeLabel =
    nextHoliday.scope === "state"
      ? `estadual de ${getUfName(nextHoliday.uf)}`
      : nextHoliday.scope === "municipal"
        ? `municipal de ${nextHoliday.city_name}`
        : "nacional";
  const weekdayLabel = formatHolidayWeekday(nextHoliday.date);
  const humanDateLabel = formatHolidayHumanDate(nextHoliday.date);
  const nextWeekStart = addDays(coverage.start, 7);
  const periodLabel =
    daysUntil === 0
      ? "hoje"
      : daysUntil === 1
        ? "amanha"
        : nextHoliday.date >= nextWeekStart
          ? "na proxima semana"
          : "nesta semana";
  const holidayKindLabel = `feriado ${scopeLabel}`;
  const holidayKindTitle = `Feriado ${scopeLabel}`;

  return {
    name: nextHoliday.name,
    date: nextHoliday.date,
    date_label: formatHolidayDate(nextHoliday.date),
    date_human_label: humanDateLabel,
    weekday_label: weekdayLabel,
    period_label: periodLabel,
    scope_label: scopeLabel,
    days_until: daysUntil,
    scope: nextHoliday.scope,
    uf: nextHoliday.uf || "",
    city_name: nextHoliday.city_name || "",
    legal_basis: nextHoliday.legal_basis || "",
    source_name: nextHoliday.source_name || "",
    source_url: nextHoliday.source_url || "",
    validation_status: nextHoliday.validation_status || "",
    coverage_start: coverage.start,
    coverage_end: coverage.end,
    title:
      daysUntil === 0
        ? `Hoje: ${humanDateLabel}. ${holidayKindTitle}: ${nextHoliday.name}.`
        : `${nextHoliday.name} cai ${periodLabel}: ${humanDateLabel} (${holidayKindLabel}).`,
    message:
      daysUntil === 0
        ? "Revise compromissos, prazos e retornos de hoje."
        : "Revise compromissos, prazos e retornos antes dessa data.",
  };
}

function getHolidayCoverageWindow(referenceDate = currentDate()) {
  const base = new Date(`${referenceDate}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    return { start: referenceDate, end: addDays(referenceDate, 13) };
  }
  const daysSinceMonday = (base.getUTCDay() + 6) % 7;
  const start = addDays(referenceDate, -daysSinceMonday);
  return {
    start,
    end: addDays(start, 13),
  };
}

function buildQuickCalendarDays(options = {}) {
  const start = options.start || currentDate();
  const end = options.end || addDays(start, 13);
  const today = options.today || currentDate();
  const eventsByDate = new Map();
  const seen = new Set();

  function addEvent(date, event) {
    const eventDate = normalizeQuickCalendarDate(date);
    if (!eventDate || eventDate < start || eventDate > end) return;
    const key = `${eventDate}:${event.kind}:${event.id || event.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    const events = eventsByDate.get(eventDate) || [];
    events.push(event);
    eventsByDate.set(eventDate, events);
  }

  (options.holidays || []).forEach((holiday) => {
    addEvent(holiday.date, {
      id: holiday.id || holiday.name,
      kind: "Feriado",
      title: holiday.name,
      meta: holiday.scope === "municipal" ? "Municipal" : holiday.scope === "state" ? "Estadual" : "Nacional",
      tone: "orange",
    });
  });

  (options.reminders || []).forEach((item) => {
    addEvent(item.next_action_date || today, {
      id: item.id,
      kind: "Retorno",
      title: item.next_action,
      meta: item.contact_name || item.status || "",
      href: `/atendimentos?focus=${item.id}`,
      tone: "rose",
    });
  });

  (options.nextActions || []).forEach((item) => {
    addEvent(item.next_action_date, {
      id: item.id,
      kind: "Agenda",
      title: item.next_action,
      meta: item.contact_name || item.priority || "",
      href: `/atendimentos?focus=${item.id}`,
      tone: "amber",
    });
  });

  (options.tasks || []).forEach((task) => {
    addEvent(task.due_at, {
      id: task.id,
      kind: "Tarefa",
      title: task.title,
      meta: task.status || "",
      priority: task.priority || "Normal",
      href: "/tarefas",
      tone: quickCalendarDeadlineTone(task.due_at, task.status, today),
    });
  });

  (options.birthdays || []).forEach((contact) => {
    addEvent(contact.next_birthday, {
      id: contact.id,
      kind: "Aniversario",
      title: contact.name,
      meta: [contact.city, contact.uf].filter(Boolean).join(" / "),
      href: `/contatos?focus=${contact.id}`,
      tone: "violet",
    });
  });

  const days = [];
  for (let date = start; date && date <= end; date = addDays(date, 1)) {
    days.push({
      date,
      date_label: formatHolidayDate(date),
      weekday_label: formatHolidayWeekday(date),
      is_today: date === today,
      events: eventsByDate.get(date) || [],
    });
  }
  return days;
}

function normalizeQuickCalendarDate(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function quickCalendarDeadlineTone(value, status = "", today = currentDate()) {
  if (["Concluida", "Arquivada", "Cancelada"].includes(status)) return "slate";
  const target = normalizeQuickCalendarDate(value);
  if (!target) return "slate";
  const targetDate = new Date(`${target}T12:00:00Z`);
  const todayDate = new Date(`${normalizeQuickCalendarDate(today)}T12:00:00Z`);
  if (Number.isNaN(targetDate.getTime()) || Number.isNaN(todayDate.getTime())) return "slate";
  const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "red";
  if (diffDays <= 2) return "amber";
  return "green";
}

function buildBirthdaySummary(gabineteId, referenceDate = currentDate()) {
  const contacts = db
    .prepare(
      `
        SELECT id, name, phone, whatsapp, city, uf, neighborhood,
          birth_date, birth_month, birth_day, birth_year, birth_date_precision
        FROM contacts
        WHERE gabinete_id = :gabinete_id
          AND (deleted_at IS NULL OR deleted_at = '')
          AND (
            (birth_date IS NOT NULL AND birth_date <> '')
            OR (birth_month IS NOT NULL AND birth_day IS NOT NULL)
          )
      `,
    )
    .all({ gabinete_id: gabineteId });

  const currentYear = Number(referenceDate.slice(0, 4));
  const referenceMonth = referenceDate.slice(5, 7);
  const entries = contacts
    .map((contact) => {
      const birthday = normalizeContactBirthdayParts(contact);
      if (!birthday) return null;
      const monthDay = `${birthday.month}-${birthday.day}`;
      let nextBirthday = `${currentYear}-${monthDay}`;
      if (nextBirthday < referenceDate) {
        nextBirthday = `${currentYear + 1}-${monthDay}`;
      }
      return {
        ...contact,
        birth_date: birthday.display_date,
        birth_month: Number(birthday.month),
        birth_day: Number(birthday.day),
        next_birthday: nextBirthday,
        days_until: daysUntilDate(referenceDate, nextBirthday),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.days_until !== b.days_until) return a.days_until - b.days_until;
      return String(a.name).localeCompare(String(b.name), "pt-BR");
    });

  return {
    known_total: entries.length,
    today: entries.filter((item) => item.days_until === 0).slice(0, 8),
    week: entries.filter((item) => item.days_until >= 0 && item.days_until <= 7).slice(0, 8),
    month: entries
      .filter((item) => String(item.birth_month).padStart(2, "0") === referenceMonth)
      .sort((a, b) => String(a.birth_day).padStart(2, "0").localeCompare(String(b.birth_day).padStart(2, "0")))
      .slice(0, 12),
  };
}

function normalizeContactBirthdayParts(contact) {
  const rawDate = String(contact.birth_date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return {
      month: rawDate.slice(5, 7),
      day: rawDate.slice(8, 10),
      display_date: rawDate,
    };
  }

  const month = Number(contact.birth_month || 0);
  const day = Number(contact.birth_day || 0);
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return {
    month: String(month).padStart(2, "0"),
    day: String(day).padStart(2, "0"),
    display_date: `0000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function prefillTicketFromContact(contact) {
  if (!contact) return {};
  return {
    contact_id: contact.id,
    contact_name: contact.name,
    contact_phone: contact.phone,
    contact_whatsapp: contact.whatsapp,
    contact_cpf: contact.cpf_rg_cns,
    contact_birth_date: formatDateValue(contact.birth_date),
    contact_email: contact.email,
    contact_profession: contact.profession,
    contact_address: contact.address,
    contact_number: contact.number,
    contact_complement: contact.complement,
    contact_neighborhood: contact.neighborhood,
    contact_zip_code: contact.zip_code,
    contact_city: contact.city,
    contact_uf: contact.uf,
  };
}

function formatDateValue(value) {
  return value ? toInputDate(value) : "";
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textMatchesSearch(textHaystack, normalizedQuery) {
  if (!normalizedQuery) return false;
  if (String(textHaystack || "").includes(normalizedQuery)) return true;
  const tokens = String(normalizedQuery || "").split(/\s+/).filter(Boolean);
  return tokens.length > 1 && tokens.every((token) => String(textHaystack || "").includes(token));
}

function humanizePlaceholder(name) {
  const labels = {
    gabinete_nome: "nome do gabinete",
    gabinete_tipo: "tipo do gabinete",
    parlamentar_nome: "nome do parlamentar",
    responsavel_gabinete: "responsavel do gabinete",
    cidade_gabinete: "cidade do gabinete",
    uf_gabinete: "UF do gabinete",
    reclamante_nome: "nome do municipe",
    telefone_referencia: "telefone do contato",
    cpf_rg_cns: "CPF/CNPJ",
    endereco_completo: "endereco completo",
    bairro: "bairro",
    cidade_contato: "cidade do contato",
    uf_contato: "UF do contato",
    demanda_titulo: "assunto do pedido",
    demanda_categoria: "categoria do pedido",
    descricao_demanda: "descrição do pedido",
    atendimento_numero: "numero do atendimento",
    protocolo_externo: "protocolo externo",
    secretaria_sugerida: "secretaria sugerida",
    destinatario_padrao: "destinatario",
    proxima_acao_documento: "proxima acao",
    data_atual: "data atual",
    cidade_data_atual: "cidade e data",
  };
  return labels[name] ?? name.replaceAll("_", " ");
}

function extractPlaceholders(...templates) {
  const found = new Set();
  templates
    .filter(Boolean)
    .forEach((template) => {
      String(template).replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, name) => {
        found.add(name);
        return _;
      });
    });
  return [...found];
}

function renderTemplateString(template, data) {
  return String(template ?? "").replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, name) => {
    const value = data[name];
    return value ? String(value) : `[preencher: ${humanizePlaceholder(name)}]`;
  });
}

function buildAddressLabel(ticket) {
  const street = [ticket?.contact_address, ticket?.contact_number].filter(Boolean).join(", ");
  const complement = ticket?.contact_complement ? ` - ${ticket.contact_complement}` : "";
  const locality = [ticket?.contact_neighborhood, ticket?.contact_city, ticket?.contact_uf]
    .filter(Boolean)
    .join(" / ");
  return [street ? `${street}${complement}` : "", locality].filter(Boolean).join(" - ");
}

function findRoutingSuggestion(gabineteId, values = []) {
  const rules = listRoutingRules(gabineteId);
  const normalizedText = normalizeSearchText(values.filter(Boolean).join(" "));
  let bestMatch = null;
  let bestScore = 0;

  rules.forEach((rule) => {
    let score = 0;
    const topic = normalizeSearchText(rule.topic);
    if (topic && normalizedText.includes(topic)) {
      score += 50;
    }
    const keywords = String(rule.keywords ?? "")
      .split(",")
      .map((item) => normalizeSearchText(item.trim()))
      .filter(Boolean);
    keywords.forEach((keyword) => {
      if (normalizedText.includes(keyword)) {
        score += 10;
      }
    });
    score += Number(rule.priority || 0);
    if (score > bestScore) {
      bestMatch = rule;
      bestScore = score;
    }
  });

  return bestScore > 0 ? bestMatch : null;
}

function buildDocumentDraft({ gabinete, sourceDocument = null, linkedTicket = null, template = null, signatureProfile = null }) {
  const documentsCount = db
    .prepare("SELECT COUNT(*) AS total FROM documents WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabinete.id }).total;

  const routingSuggestion = findRoutingSuggestion(gabinete.id, [
    template?.topic,
    template?.tags,
    linkedTicket?.demand_category,
    linkedTicket?.demand_title,
    linkedTicket?.description,
    sourceDocument?.demand,
    sourceDocument?.subject_line,
  ]);

  const templateLike = template ?? sourceDocument ?? {};
  const context = {
    gabinete_nome: gabinete.name,
    gabinete_tipo: gabinete.type,
    parlamentar_nome: gabinete.parliamentarian_name || gabinete.name,
    responsavel_gabinete: gabinete.responsible_name || gabinete.parliamentarian_name || gabinete.name,
    cidade_gabinete: gabinete.city || "",
    uf_gabinete: gabinete.uf || "",
    reclamante_nome: linkedTicket?.contact_name || "",
    telefone_referencia: linkedTicket?.contact_whatsapp || linkedTicket?.contact_phone || "",
    cpf_rg_cns: linkedTicket?.contact_cpf || "",
    endereco_completo: buildAddressLabel(linkedTicket),
    bairro: linkedTicket?.contact_neighborhood || "",
    cidade_contato: linkedTicket?.contact_city || "",
    uf_contato: linkedTicket?.contact_uf || "",
    demanda_titulo: linkedTicket?.demand_title || sourceDocument?.demand || template?.title || "",
    demanda_categoria: linkedTicket?.demand_category || template?.topic || "",
    descricao_demanda:
      linkedTicket?.description || sourceDocument?.summary_request || sourceDocument?.generated_text || "",
    atendimento_numero: linkedTicket?.number || "",
    protocolo_externo: linkedTicket?.external_protocol || "",
    secretaria_sugerida:
      linkedTicket?.department || template?.recommended_department || routingSuggestion?.recommended_department || "",
    destinatario_padrao:
      template?.target_authority || routingSuggestion?.target_authority || sourceDocument?.addressed_to || "",
    proxima_acao_documento:
      linkedTicket?.next_action || sourceDocument?.next_action || "",
    data_atual: formatDate(currentDate()),
    cidade_data_atual: [gabinete.city, formatDate(currentDate())].filter(Boolean).join(", "),
  };

  const renderedSubject = template?.subject_template
    ? renderTemplateString(template.subject_template, context)
    : sourceDocument?.subject_line || "";
  const renderedSummary = template?.summary_template
    ? renderTemplateString(template.summary_template, context)
    : sourceDocument?.summary_request || "";
  const renderedBody = template?.body_template
    ? renderTemplateString(template.body_template, context)
    : sourceDocument?.generated_text || "";

  const routingHint = [
    template?.via_strategy || routingSuggestion?.via_strategy || sourceDocument?.routing_hint || "",
    routingSuggestion?.notes || "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ticket_id: linkedTicket?.id || sourceDocument?.ticket_id || "",
    template_id: template?.id || sourceDocument?.template_id || "",
    type: template?.type || sourceDocument?.type || "Ofício",
    internal_number: generateDocumentCode(gabinete.id, documentsCount + 1),
    chamber_number: "",
    protocol_date: currentDate(),
    department:
      linkedTicket?.department
      || template?.recommended_department
      || routingSuggestion?.recommended_department
      || sourceDocument?.department
      || "",
    subject_line: renderedSubject,
    addressed_to:
      template?.target_authority
      || routingSuggestion?.target_authority
      || sourceDocument?.addressed_to
      || "",
    routing_hint: routingHint,
    legal_due_date: linkedTicket?.internal_due_date || sourceDocument?.legal_due_date || "",
    status: project.status || "Protocolado",
    demand: linkedTicket?.demand_title || sourceDocument?.demand || template?.topic || "",
    summary_request: renderedSummary,
    summary_response: "",
    response_received_at: "",
    generated_text: renderedBody,
    progress_note: sourceDocument?.progress_note || "",
    result: "",
    next_action: linkedTicket?.next_action || sourceDocument?.next_action || "",
    next_action_date: linkedTicket?.next_action_date || sourceDocument?.next_action_date || "",
    notes: sourceDocument?.notes || template?.use_case || "",
    attachment_url: project.source_attachment_url || "",
    signature_profile_id: signatureProfile?.id || sourceDocument?.signature_profile_id || "",
    signature_label: signatureProfile?.label || sourceDocument?.signature_label || "",
    template_title: template?.title || sourceDocument?.template_title || "",
    template_variant_name: template?.variant_name || sourceDocument?.template_variant_name || "",
    template_placeholders: extractPlaceholders(
      templateLike.subject_template,
      templateLike.summary_template,
      templateLike.body_template,
    ),
  };
}

function validateDocumentForm(body) {
  if (!body.type || !body.internal_number || !body.status) {
    return "Tipo, numero interno e status sao obrigatorios.";
  }
  return "";
}

function validateProjectForm(body) {
  if (!body.title || !body.status) {
    return "Titulo e status do projeto sao obrigatorios.";
  }
  return "";
}

function validateNoteForm(body) {
  if (!String(body.subject || "").trim()) {
    return "Assunto da nota e obrigatorio.";
  }
  if (String(body.subject || "").trim().length > 160) {
    return "Assunto da nota deve ter ate 160 caracteres.";
  }
  if (String(body.body || "").length > 6000) {
    return "Anotacao deve ter ate 6000 caracteres.";
  }
  return "";
}

function validateTaskForm(body) {
  if (!body.title || !body.due_at || !body.priority || !body.status) {
    return "Titulo, data/hora, prioridade e status sao obrigatorios.";
  }
  return "";
}

function normalizeEntityTags(value) {
  return String(value || "")
    .split(/[,;]/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 8)
    .join(", ");
}

function validateCallLogForm(body) {
  if (!body.phone || !body.subject || !body.call_at) {
    return "Número, assunto e data/hora da ligação são obrigatórios.";
  }
  return "";
}

function validateFinanceEntryForm(body) {
  if (!body.entry_type || !body.title || !body.entry_date) {
    return "Tipo, titulo e data do lancamento sao obrigatorios.";
  }
  if (normalizeMoneyToCents(body.amount) <= 0) {
    return "Informe um valor valido para o lancamento.";
  }
  const repeatMonths = financeRepeatTotal(body);
  if (repeatMonths < 1 || repeatMonths > 60) {
    return "Informe uma recorrencia entre 1 e 60 meses.";
  }
  return "";
}

async function summarizeTextWithOpenAi(text, context = "pedido") {
  const maxOutputTokens = Math.min(4000, Math.max(700, Math.ceil(String(text || "").length / 3) + 250));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_SUMMARY_MODEL,
      store: false,
      max_output_tokens: maxOutputTokens,
      instructions:
        [
          "Voce ajuda equipes de gabinete a revisar textos operacionais sem resumir.",
          "Reescreva em portugues do Brasil com correcao gramatical, pontuacao, concordancia, clareza e coerencia.",
          "Nao resuma, nao encurte e nao transforme o texto em sinopse. A versao revisada deve manter todas as ideias, detalhes e informacoes do original.",
          "Preserve rigorosamente fatos, nomes, datas, horarios, valores, locais, pedidos, status, pendencias, justificativas, etapas e proximos passos.",
          "Nao remova repeticoes se elas puderem carregar contexto, enfase, historico ou detalhe operacional. So corrija redundancias obvias sem perda de informacao.",
          "Use o contexto informado apenas para ajustar termos e coerencia do campo, sem acrescentar dados novos.",
          "Se o texto original for vago, mantenha a vagueza; apenas corrija a escrita. Nao crie acao, promessa, providencia, orgao, fundamento legal ou encaminhamento.",
          "Se houver documento oficial, preserve o tom institucional e nao mude o sentido politico, juridico ou administrativo.",
          "Retorne apenas a versao revisada, sem markdown, sem titulo e sem explicacoes adicionais.",
        ].join(" "),
      input: [
        `Contexto: ${String(context || "pedido").slice(0, 1200)}`,
        "Revise o texto abaixo para o campo indicado.",
        "Corrija a escrita e deixe o texto mais coerente, mas nao resuma e nao retire informacoes.",
        "Se houver pedido, problema, local, urgencia, andamento, pendencia, valor, data, horario ou proxima acao, preserve esses elementos.",
        "",
        text,
      ].join("\n"),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI ${response.status}`);
  }

  const outputText = String(payload.output_text || "").trim();
  if (outputText) return outputText;

  const content = payload.output
    ?.flatMap((item) => item.content || [])
    ?.map((item) => item.text || "")
    ?.join("\n")
    ?.trim();
  if (content) return content;

  throw new Error("Resposta sem texto.");
}

function validateAiLinkForm(body) {
  const kind = normalizeAiLinkKind(body.kind);
  if (!String(body.title || "").trim()) {
    return "Informe o nome do atalho de IA.";
  }
  if (kind !== "prompt" && !String(body.url || "").trim()) {
    return "Informe o link do atalho de IA.";
  }
  if (kind === "prompt") {
    if (!String(body.description || "").trim()) {
      return "Escreva o texto do prompt.";
    }
    const blockedData = detectPromptPersonalData(body);
    if (blockedData.length) {
      return `Nao salve dados pessoais em prompts. Remova ${blockedData.join(", ")} e use marcadores como [telefone removido] ou [nome da pessoa].`;
    }
  }
  return "";
}

function validateAiPromptReportForm(body) {
  const reason = normalizeAiPromptReportReason(body.reason);
  if (!PROMPT_REPORT_REASONS.has(reason)) {
    return "Escolha um motivo para a denuncia.";
  }
  const details = String(body.details || "").trim();
  if (details.length > 600) {
    return "Resumo da denuncia deve ter ate 600 caracteres.";
  }
  const blockedData = detectPromptPersonalData({ description: details });
  if (blockedData.length) {
    return `Nao cole dados pessoais na denuncia. Informe apenas o tipo de problema, sem ${blockedData.join(", ")}.`;
  }
  return "";
}

function detectPromptPersonalData(body) {
  const text = [body.title, body.category, body.description].filter(Boolean).join("\n");
  const findings = new Set();
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
    findings.add("e-mail");
  }
  if (/(wa\.me\/|api\.whatsapp|whatsapp:\s*\+?\d)/i.test(text) || containsLikelyPhone(text)) {
    findings.add("telefone/WhatsApp");
  }
  if (containsLikelyDocument(text)) {
    findings.add("CPF/CNPJ/documento");
  }
  return Array.from(findings);
}

function containsLikelyPhone(text) {
  const candidates = String(text || "").match(/\+?\d[\d\s().-]{8,}\d/g) || [];
  return candidates.some((candidate) => {
    const digits = normalizePhone(candidate);
    const local = digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
    if (local.length === 10) return /^[1-9]{2}[2-5]\d{7}$/.test(local);
    if (local.length === 11) return /^[1-9]{2}9\d{8}$/.test(local);
    return false;
  });
}

function containsLikelyDocument(text) {
  const candidates = String(text || "").match(/\d[\d.\-/\s]{9,}\d/g) || [];
  return candidates.some((candidate) => {
    const digits = normalizeCpf(candidate);
    if (digits.length === 11) return isValidCpf(digits) || /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(candidate);
    if (digits.length === 14) return isValidCnpj(digits) || /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(candidate);
    return false;
  });
}

function normalizeOptionalHttpUrl(value, maxLength = 600) {
  const raw = String(value || "").trim().slice(0, maxLength);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizePublicPersonName(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PUBLIC_SELF_REGISTER_NAME_MAX_LENGTH);
}

function isValidPublicPersonName(value) {
  const name = String(value || "").trim();
  return name.length >= 2 && /^[\p{L}\s]+$/u.test(name);
}

function isPublicAiTextRateLimited(req, slug) {
  const now = Date.now();
  const key = `${String(slug || "").toLowerCase()}:${getClientIp(req)}`;
  const attempts = (PUBLIC_AI_TEXT_ATTEMPTS.get(key) || []).filter(
    (timestamp) => now - timestamp < PUBLIC_AI_TEXT_RATE_WINDOW_MS,
  );
  if (attempts.length >= PUBLIC_AI_TEXT_RATE_LIMIT) {
    PUBLIC_AI_TEXT_ATTEMPTS.set(key, attempts);
    return true;
  }
  attempts.push(now);
  PUBLIC_AI_TEXT_ATTEMPTS.set(key, attempts);
  if (PUBLIC_AI_TEXT_ATTEMPTS.size > 1000) {
    for (const [candidateKey, candidateAttempts] of PUBLIC_AI_TEXT_ATTEMPTS.entries()) {
      const fresh = candidateAttempts.filter((timestamp) => now - timestamp < PUBLIC_AI_TEXT_RATE_WINDOW_MS);
      if (fresh.length) PUBLIC_AI_TEXT_ATTEMPTS.set(candidateKey, fresh);
      else PUBLIC_AI_TEXT_ATTEMPTS.delete(candidateKey);
    }
  }
  return false;
}

function normalizeAiLinkKind(value) {
  const kind = String(value || "link").trim().toLowerCase();
  return ["principal", "agent", "prompt", "link"].includes(kind) ? kind : "link";
}

function normalizeAiPromptReportReason(value) {
  const reason = String(value || "").trim().toLowerCase();
  return PROMPT_REPORT_REASONS.has(reason) ? reason : "";
}

function normalizeAiLinkVisibility(value) {
  const visibility = String(value || "private").trim().toLowerCase();
  return visibility === "shared" ? "shared" : "private";
}

function normalizeAiLinkUrl(body) {
  const kind = normalizeAiLinkKind(body.kind);
  const url = String(body.url || "").trim();
  if (kind === "prompt" && !url) return "";
  return url;
}

function validateSettingsForm(body) {
  const followUpDays = parseInteger(body.default_follow_up_days, 0);
  const documentDueDays = parseInteger(body.default_document_due_days, 0);
  const birthdayNoticeDays = parseInteger(body.default_birthday_notice_days, 0);
  const publicSlug = normalizePublicSlug(body.public_slug || "");
  const publicConfig = normalizePublicSelfRegisterConfig(body.public_self_register_config);

  if (followUpDays <= 0 || documentDueDays <= 0 || birthdayNoticeDays < 0) {
    return "Revise os prazos padrao do gabinete.";
  }

  if (publicSlug.length < 3) {
    return "O final do link publico precisa ter pelo menos 3 caracteres.";
  }

  if (body.email && !isValidEmail(body.email)) {
    return "Informe um e-mail valido para o gabinete.";
  }

  if (body.whatsapp_provider && !["evolution", "wa_me"].includes(String(body.whatsapp_provider))) {
    return "Escolha um modo valido para o canal de WhatsApp.";
  }

  const requestedThemeMode = String(body.ui_theme_mode || "light").trim().toLowerCase();
  const requestedThemePalette = String(body.ui_theme_palette || "azul").trim().toLowerCase();

  if (!UI_THEME_MODES.has(requestedThemeMode)) {
    return "Escolha um modo de tema valido.";
  }

  if (!UI_THEME_PALETTES.has(requestedThemePalette)) {
    return "Escolha uma paleta valida.";
  }

  if (String(body.default_area_code || "").trim() && !normalizeDefaultAreaCode(body.default_area_code)) {
    return "Informe o DDD padrao com 2 digitos.";
  }

  if (String(body.public_self_register_intro || "").trim().length > PUBLIC_SELF_REGISTER_INTRO_MAX_LENGTH) {
    return `A mensagem do atendimento online pode ter no maximo ${PUBLIC_SELF_REGISTER_INTRO_MAX_LENGTH} caracteres.`;
  }

  const publicConfigError = validatePublicSelfRegisterConfig(publicConfig);
  if (publicConfigError) {
    return publicConfigError;
  }

  return "";
}

function hasInstitutionalSetupProfile(gabinete) {
  const personName = String(gabinete?.parliamentarian_name || gabinete?.responsible_name || "").trim();
  return Boolean(
    String(gabinete?.name || "").trim()
    && personName
    && String(gabinete?.city || "").trim()
    && String(gabinete?.uf || "").trim(),
  );
}

function normalizePublicSelfRegisterFieldMode(value, fallback = "optional") {
  const mode = String(value || fallback).trim().toLowerCase();
  return PUBLIC_SELF_REGISTER_FIELD_MODES.has(mode) ? mode : fallback;
}

function buildDefaultPublicSelfRegisterConfig() {
  return {
    allow_anonymous: false,
    require_contact_channel: true,
    email_validation: "format",
    confirmation_channel: "none",
    fields: { ...PUBLIC_SELF_REGISTER_DEFAULT_FIELDS },
  };
}

function normalizePublicSelfRegisterConfig(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }

  const defaults = buildDefaultPublicSelfRegisterConfig();
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const sourceFields = source.fields && typeof source.fields === "object" ? source.fields : {};
  const fields = Object.fromEntries(
    PUBLIC_SELF_REGISTER_FIELD_KEYS.map((key) => [
      key,
      PUBLIC_SELF_REGISTER_FORCE_HIDDEN_FIELDS.has(key)
        ? "hidden"
        : normalizePublicSelfRegisterFieldMode(sourceFields[key], defaults.fields[key] || "optional"),
    ]),
  );

  return {
    allow_anonymous: false,
    require_contact_channel: source.require_contact_channel === undefined ? true : Boolean(toFlag(source.require_contact_channel)),
    email_validation: defaults.email_validation,
    confirmation_channel: "none",
    fields,
  };
}

function getPublicSelfRegisterFieldMode(config, field) {
  return normalizePublicSelfRegisterConfig(config).fields[field] || PUBLIC_SELF_REGISTER_DEFAULT_FIELDS[field] || "optional";
}

function isPublicSelfRegisterFieldVisible(config, field) {
  return getPublicSelfRegisterFieldMode(config, field) !== "hidden";
}

function isPublicSelfRegisterFieldRequired(config, field) {
  return getPublicSelfRegisterFieldMode(config, field) === "required";
}

function validatePublicSelfRegisterConfig(config) {
  const normalized = normalizePublicSelfRegisterConfig(config);
  const { fields } = normalized;

  if (fields.name !== "required") {
    return "O nome precisa continuar obrigatorio no atendimento identificado.";
  }

  if (!isPublicSelfRegisterFieldVisible(normalized, "demand_title") && !isPublicSelfRegisterFieldVisible(normalized, "description")) {
    return "Deixe visível pelo menos Assunto ou Detalhes.";
  }

  if (!isPublicSelfRegisterFieldRequired(normalized, "demand_title") && !isPublicSelfRegisterFieldRequired(normalized, "description")) {
    return "Assunto ou Detalhes precisa ficar obrigatório.";
  }

  if (
    normalized.require_contact_channel
    && !PUBLIC_SELF_REGISTER_CONTACT_CHANNEL_FIELDS.some((field) => isPublicSelfRegisterFieldVisible(normalized, field))
  ) {
    return "Se o gabinete exige retorno, deixe visivel pelo menos WhatsApp ou telefone.";
  }

  if (normalized.confirmation_channel === "email" && !isPublicSelfRegisterFieldVisible(normalized, "email")) {
    return "Para confirmar por e-mail, o campo de e-mail precisa ficar visivel.";
  }

  if (normalized.confirmation_channel === "whatsapp" && !isPublicSelfRegisterFieldVisible(normalized, "whatsapp")) {
    return "Para confirmar por WhatsApp, o campo WhatsApp precisa ficar visivel.";
  }

  return "";
}

function sanitizePublicSelfRegisterBody(body, config, options = {}) {
  const normalizedConfig = normalizePublicSelfRegisterConfig(config);
  const anonymous = Boolean(options.anonymous);
  const contactType = String(body.contact_type || "person").trim().toLowerCase() === "company" ? "company" : "person";
  const result = {
    name: contactType === "company"
      ? String(body.name || "").trim().slice(0, GABINETE_NAME_MAX_LENGTH)
      : normalizePublicPersonName(body.name),
    whatsapp: normalizePhone(body.whatsapp),
    phone: normalizePhone(body.phone),
    cpf_rg_cns: normalizeCpf(body.cpf_rg_cns),
    birth_date: String(body.birth_date || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    profession: String(body.profession || "").trim(),
    referred_by: String(body.referred_by || "").trim(),
    zip_code: String(body.zip_code || "").trim(),
    neighborhood: String(body.neighborhood || "").trim(),
    address: String(body.address || "").trim(),
    number: String(body.number || "").trim(),
    complement: String(body.complement || "").trim(),
    city: String(body.city || "").trim(),
    uf: String(body.uf || "").trim().toUpperCase().slice(0, 2),
    demand_title: String(body.demand_title || "").trim().slice(0, 120),
    demand_category: String(body.demand_category || "").trim().slice(0, 80),
    description: String(body.description || "").trim(),
    notes: String(body.notes || "").trim(),
    is_anonymous: anonymous,
    contact_type: contactType,
  };

  if (anonymous) {
    result.name = "";
    result.whatsapp = "";
    result.phone = "";
    result.cpf_rg_cns = "";
    result.birth_date = "";
    result.email = "";
    result.profession = "";
    result.referred_by = "";
    result.zip_code = "";
    result.neighborhood = "";
    result.address = "";
    result.number = "";
    result.complement = "";
    result.city = "";
    result.uf = "";
  }

  PUBLIC_SELF_REGISTER_FIELD_KEYS.forEach((field) => {
    if (!isPublicSelfRegisterFieldVisible(normalizedConfig, field)) {
      if (field === "attachment") return;
      if (field in result) {
        result[field] = "";
      }
    }
  });

  return result;
}

function getActivePublicGabineteBySlug(slug) {
  return db
    .prepare(
      `
        SELECT *
        FROM gabinetes
        WHERE status = 'active'
          AND (
            lower(public_slug) = lower(:slug)
            OR lower(slug) = lower(:slug)
          )
        LIMIT 1
      `,
    )
    .get({ slug });
}

function findPublicSelfRegisterContact(gabineteId, values = {}) {
  const documentValue = normalizeCpf(values.cpf_rg_cns || values.document || "");
  const whatsappValue = normalizePhone(values.whatsapp || "");
  const phoneValue = normalizePhone(values.phone || "");
  if (!documentValue && whatsappValue.length < 10 && phoneValue.length < 10) return null;
  return db
    .prepare(
      `
        SELECT *
        FROM contacts
        WHERE gabinete_id = :gabinete_id
          AND (
            (:document <> '' AND cpf_rg_cns = :document)
            OR (:whatsapp <> '' AND (whatsapp = :whatsapp OR phone = :whatsapp))
            OR (:phone <> '' AND (phone = :phone OR whatsapp = :phone))
          )
        ORDER BY
          CASE
            WHEN :document <> '' AND cpf_rg_cns = :document THEN 0
            WHEN :whatsapp <> '' AND whatsapp = :whatsapp THEN 1
            WHEN :phone <> '' AND phone = :phone THEN 2
            ELSE 3
          END,
          updated_at DESC
        LIMIT 1
      `,
    )
    .get({
      gabinete_id: gabineteId,
      document: documentValue,
      whatsapp: whatsappValue,
      phone: phoneValue,
    });
}

function serializePublicSelfRegisterContact(contact) {
  if (!contact) return null;
  const whatsapp = contact.whatsapp || (isLikelyMobilePhone(contact.phone) ? contact.phone : "");
  return {
    name: contact.name || "",
    contact_type: contact.contact_type || "person",
    phone: contact.phone || "",
    whatsapp,
    cpf_rg_cns: contact.cpf_rg_cns || "",
    birth_date: contact.birth_date || "",
    email: contact.email || "",
    profession: contact.profession || "",
    referred_by: contact.referred_by || "",
    company_legal_name: contact.company_legal_name || "",
    zip_code: contact.zip_code || "",
    neighborhood: contact.neighborhood || "",
    address: contact.address || "",
    number: contact.number || "",
    complement: contact.complement || "",
    city: contact.city || "",
    uf: contact.uf || "",
  };
}

function isLikelyMobilePhone(value) {
  const digits = normalizePhone(value);
  const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  return national.length === 11 && national[2] === "9";
}

function preferSubmittedValue(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback || "";
}

function mergePublicSelfRegisterContactNotes(existingNotes = "", newNotes = "") {
  const current = String(existingNotes || "").trim();
  const next = String(newNotes || "").trim();
  if (!current) return next;
  if (!next || current.includes(next)) return current;
  return `${current}\n\n${next}`.slice(0, 4000);
}

function buildPublicSelfRegisterContactPayload(existing, values, body, contactType) {
  return {
    ...existing,
    name: preferSubmittedValue(values.name, existing.name),
    contact_type: contactType || existing.contact_type || "person",
    register_kind: existing.register_kind || "",
    segment: existing.segment || (contactType === "company" ? "empresa" : "municipe"),
    phone: preferSubmittedValue(values.phone, existing.phone),
    whatsapp: preferSubmittedValue(values.whatsapp, existing.whatsapp),
    cpf_rg_cns: preferSubmittedValue(values.cpf_rg_cns, existing.cpf_rg_cns),
    birth_date: contactType === "person" ? preferSubmittedValue(values.birth_date, existing.birth_date) : "",
    email: preferSubmittedValue(values.email, existing.email),
    profession: preferSubmittedValue(values.profession, existing.profession),
    referred_by: preferSubmittedValue(values.referred_by, existing.referred_by || "Atendimento online"),
    company_legal_name: preferSubmittedValue(body.company_legal_name, existing.company_legal_name),
    address: preferSubmittedValue(values.address, existing.address),
    number: preferSubmittedValue(values.number, existing.number),
    complement: preferSubmittedValue(values.complement, existing.complement),
    neighborhood: preferSubmittedValue(values.neighborhood, existing.neighborhood),
    zip_code: preferSubmittedValue(values.zip_code, existing.zip_code),
    city: preferSubmittedValue(values.city, existing.city),
    uf: preferSubmittedValue(values.uf, existing.uf),
    notes: mergePublicSelfRegisterContactNotes(existing.notes, values.notes),
    photo_url: preferSubmittedValue(body.photo_url, existing.photo_url),
  };
}

function validatePublicDescriptionAiPrerequisites(config, body, options = {}) {
  const normalized = normalizePublicSelfRegisterConfig(config);
  const anonymous = Boolean(options.anonymous);
  const values = sanitizePublicSelfRegisterBody(body, normalized, { anonymous });

  if (!anonymous) {
    if (
      normalized.require_contact_channel
      && !PUBLIC_SELF_REGISTER_CONTACT_CHANNEL_FIELDS.some((field) => String(values[field] || "").trim())
    ) {
      return "Preencha os campos obrigatorios antes de usar IA.";
    }
    if (values.contact_type !== "company" && values.name && !isValidPublicPersonName(values.name)) {
      return "Revise o nome antes de usar IA.";
    }
  }

  for (const field of PUBLIC_SELF_REGISTER_FIELD_KEYS) {
    if (field === "description" || field === "attachment" || field === "notes") continue;
    if (!isPublicSelfRegisterFieldRequired(normalized, field)) continue;
    if (!String(values[field] || "").trim()) {
      return "Preencha os campos obrigatorios antes de usar IA.";
    }
  }

  return "";
}

function validatePublicSelfRegisterSubmission(config, body, files = [], options = {}) {
  const normalized = normalizePublicSelfRegisterConfig(config);
  const anonymous = Boolean(options.anonymous);
  const values = sanitizePublicSelfRegisterBody(body, normalized, { anonymous });
  const errors = [];

  if (anonymous && files.length) {
    errors.push("Envio anonimo ainda nao aceita anexo. Retire o arquivo para continuar.");
  }

  const documentError = values.cpf_rg_cns ? getCpfCnpjValidationMessage(values.cpf_rg_cns) : "";
  if (documentError) {
    errors.push(documentError);
  }

  if (!anonymous) {
    if (normalized.confirmation_channel === "email" && !values.email) {
      errors.push("Para confirmar por e-mail, informe um e-mail de retorno.");
    }

    if (normalized.confirmation_channel === "whatsapp" && !values.whatsapp) {
      errors.push("Para confirmar por WhatsApp, informe um WhatsApp de retorno.");
    }

    if (normalized.confirmation_channel === "email" && values.email && !isValidEmail(values.email)) {
      errors.push("Informe um e-mail valido para usar a confirmacao automatica.");
    }

    if (normalized.email_validation === "format" && values.email && !isValidEmail(values.email)) {
      errors.push("Informe um e-mail valido para retorno.");
    }

    if (values.contact_type !== "company" && values.name && !isValidPublicPersonName(values.name)) {
      errors.push("Informe o nome usando apenas letras e espaços.");
    }

    PUBLIC_SELF_REGISTER_FIELD_KEYS.forEach((field) => {
      if (!isPublicSelfRegisterFieldRequired(normalized, field)) return;
      if (field === "attachment") {
        if (!files.length) {
          errors.push("Anexe um arquivo para concluir o atendimento online.");
        }
        return;
      }
      if (!String(values[field] || "").trim()) {
        errors.push(publicSelfRegisterRequiredFieldMessage(field));
      }
    });

    if (
      normalized.require_contact_channel
      && !PUBLIC_SELF_REGISTER_CONTACT_CHANNEL_FIELDS.some((field) => String(values[field] || "").trim())
    ) {
      errors.push("Informe pelo menos um canal de retorno: WhatsApp ou telefone.");
    }
  } else {
    if (!String(values.demand_title || "").trim() && !String(values.description || "").trim()) {
      errors.push("Informe o assunto ou descreva o pedido.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    values,
    config: normalized,
  };
}

function publicSelfRegisterRequiredFieldMessage(field) {
  const labels = {
    name: "Informe o nome para continuar.",
    whatsapp: "Informe o WhatsApp para retorno.",
    phone: "Informe um telefone para retorno.",
    cpf_rg_cns: "Informe CPF ou CNPJ.",
    birth_date: "Informe a data de nascimento.",
    email: "Informe um e-mail para retorno.",
    profession: "Informe a profissao ou atividade principal.",
    referred_by: "Informe quem indicou voce.",
    zip_code: "Informe o CEP.",
    neighborhood: "Informe o bairro.",
    address: "Informe o endereco.",
    number: "Informe o numero.",
    complement: "Informe o complemento.",
    city: "Informe a cidade.",
    uf: "Informe a UF.",
    demand_title: "Informe o assunto do pedido.",
    demand_category: "Escolha a area principal do pedido.",
    description: "Conte o que aconteceu.",
    notes: "Preencha as observacoes finais.",
  };
  return labels[field] || "Preencha os campos obrigatorios do atendimento online.";
}

function normalizeUiThemeMode(value) {
  const mode = String(value || "light").trim().toLowerCase();
  return UI_THEME_MODES.has(mode) ? mode : "light";
}

function normalizeUiThemePalette(value) {
  const palette = String(value || "azul").trim().toLowerCase();
  return UI_THEME_PALETTES.has(palette) ? palette : "azul";
}

function normalizeDefaultAreaCode(value) {
  const digits = normalizePhone(value).slice(0, 2);
  return digits.length === 2 ? digits : "";
}

function normalizePublicSlug(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

function normalizePublicSelfRegisterIntro(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return (normalized || DEFAULT_PUBLIC_SELF_REGISTER_INTRO).slice(0, PUBLIC_SELF_REGISTER_INTRO_MAX_LENGTH);
}

function listDocuments(gabineteId, filters = {}) {
  let sql = `
    SELECT
      d.*,
      t.number AS ticket_number,
      tpl.title AS template_title,
      tpl.variant_name AS template_variant_name,
      sp.label AS signature_label
    FROM documents d
    LEFT JOIN tickets t ON t.id = d.ticket_id AND t.gabinete_id = d.gabinete_id
    LEFT JOIN document_templates tpl ON tpl.id = d.template_id AND tpl.gabinete_id = d.gabinete_id
    LEFT JOIN signature_profiles sp ON sp.id = d.signature_profile_id AND sp.gabinete_id = d.gabinete_id
    WHERE d.gabinete_id = :gabinete_id
      AND ${activeRowWhere("d")}
      AND (
        :q = '%%'
        OR d.internal_number LIKE :q
        OR d.demand LIKE :q
        OR d.department LIKE :q
        OR d.subject_line LIKE :q
        OR tpl.title LIKE :q
        OR tpl.variant_name LIKE :q
      )
      AND (:department = '%%' OR d.department LIKE :department)
      AND (:type = '' OR d.type = :type)
      AND (:status = '' OR d.status = :status)
    ORDER BY d.updated_at DESC
  `;
  return db.prepare(sql).all({
    gabinete_id: gabineteId,
    q: `%${filters.q ?? ""}%`,
    department: `%${filters.department ?? ""}%`,
    type: filters.type ?? "",
    status: filters.status ?? "",
  });
}

function getScopedDocument(gabineteId, documentId) {
  return db
    .prepare(
      `
        SELECT
          d.*,
          t.number AS ticket_number,
          tpl.title AS template_title,
          tpl.variant_name AS template_variant_name,
          sp.label AS signature_label,
          sp.signatory_name,
          sp.signatory_role,
          sp.closing_text,
          sp.footer_text,
          sp.file_url AS signature_file_url
        FROM documents d
        LEFT JOIN tickets t ON t.id = d.ticket_id AND t.gabinete_id = d.gabinete_id
        LEFT JOIN document_templates tpl ON tpl.id = d.template_id AND tpl.gabinete_id = d.gabinete_id
        LEFT JOIN signature_profiles sp ON sp.id = d.signature_profile_id AND sp.gabinete_id = d.gabinete_id
        WHERE d.gabinete_id = :gabinete_id AND d.id = :id
          AND ${activeRowWhere("d")}
      `,
    )
    .get({ gabinete_id: gabineteId, id: documentId });
}

function createDocument(gabineteId, userId, body) {
  const result = db.prepare(
    `
      INSERT INTO documents (
        gabinete_id, ticket_id, template_id, type, internal_number, chamber_number, protocol_date,
        department, subject_line, addressed_to, routing_hint, legal_due_date, status, demand,
        summary_request, summary_response, response_received_at, generated_text, progress_note, result,
        next_action, next_action_date, notes, attachment_url, signature_profile_id,
        created_by, created_at, updated_at
      ) VALUES (
        :gabinete_id, :ticket_id, :template_id, :type, :internal_number, :chamber_number, :protocol_date,
        :department, :subject_line, :addressed_to, :routing_hint, :legal_due_date, :status, :demand,
        :summary_request, :summary_response, :response_received_at, :generated_text, :progress_note, :result,
        :next_action, :next_action_date, :notes, :attachment_url, :signature_profile_id,
        :created_by, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    ticket_id: scopedReferenceId(gabineteId, "tickets", body.ticket_id),
    template_id: scopedReferenceId(gabineteId, "document_templates", body.template_id),
    type: body.type,
    internal_number: body.internal_number,
    chamber_number: body.chamber_number ?? "",
    protocol_date: body.protocol_date ?? "",
    department: body.department ?? "",
    subject_line: body.subject_line ?? "",
    addressed_to: body.addressed_to ?? "",
    routing_hint: body.routing_hint ?? "",
    legal_due_date: body.legal_due_date ?? "",
    status: body.status,
    demand: body.demand ?? "",
    summary_request: body.summary_request ?? "",
    summary_response: body.summary_response ?? "",
    response_received_at: body.response_received_at ?? "",
    generated_text: body.generated_text ?? "",
    progress_note: body.progress_note ?? "",
    result: body.result ?? "",
    next_action: body.next_action ?? "",
    next_action_date: body.next_action_date ?? "",
    notes: body.notes ?? "",
    attachment_url: body.attachment_url ?? "",
    signature_profile_id: scopedReferenceId(gabineteId, "signature_profiles", body.signature_profile_id),
    created_by: userId,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return Number(result.lastInsertRowid);
}

function updateDocument(gabineteId, documentId, body) {
  db.prepare(
    `
      UPDATE documents
      SET ticket_id = :ticket_id,
          template_id = :template_id,
          type = :type,
          internal_number = :internal_number,
          chamber_number = :chamber_number,
          protocol_date = :protocol_date,
          department = :department,
          subject_line = :subject_line,
          addressed_to = :addressed_to,
          routing_hint = :routing_hint,
          legal_due_date = :legal_due_date,
          status = :status,
          demand = :demand,
          summary_request = :summary_request,
          summary_response = :summary_response,
          response_received_at = :response_received_at,
          generated_text = :generated_text,
          progress_note = :progress_note,
          result = :result,
          next_action = :next_action,
          next_action_date = :next_action_date,
          notes = :notes,
          attachment_url = :attachment_url,
          signature_profile_id = :signature_profile_id,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    id: documentId,
    gabinete_id: gabineteId,
    ticket_id: scopedReferenceId(gabineteId, "tickets", body.ticket_id),
    template_id: scopedReferenceId(gabineteId, "document_templates", body.template_id),
    type: body.type,
    internal_number: body.internal_number,
    chamber_number: body.chamber_number ?? "",
    protocol_date: body.protocol_date ?? "",
    department: body.department ?? "",
    subject_line: body.subject_line ?? "",
    addressed_to: body.addressed_to ?? "",
    routing_hint: body.routing_hint ?? "",
    legal_due_date: body.legal_due_date ?? "",
    status: body.status,
    demand: body.demand ?? "",
    summary_request: body.summary_request ?? "",
    summary_response: body.summary_response ?? "",
    response_received_at: body.response_received_at ?? "",
    generated_text: body.generated_text ?? "",
    progress_note: body.progress_note ?? "",
    result: body.result ?? "",
    next_action: body.next_action ?? "",
    next_action_date: body.next_action_date ?? "",
    notes: body.notes ?? "",
    attachment_url: body.attachment_url ?? "",
    signature_profile_id: scopedReferenceId(gabineteId, "signature_profiles", body.signature_profile_id),
    updated_at: nowIso(),
  });
}

function archiveTicket(gabineteId, ticketId, archived = 1) {
  db.prepare(
    `
      UPDATE tickets
      SET is_archived = :is_archived,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    gabinete_id: gabineteId,
    id: ticketId,
    is_archived: archived ? 1 : 0,
    updated_at: nowIso(),
  });
}

function deleteTickets(gabineteId, ids = []) {
  if (!ids.length) return 0;
  const placeholders = ids.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
  const deleteParams = { ...params, gabinete_id: gabineteId };
  const updateParams = { ...deleteParams, updated_at: nowIso() };
  const sourcePlaceholders = ids.map((_, index) => `:source${index}`).join(", ");
  const sourceParams = Object.fromEntries(ids.map((id, index) => [`source${index}`, `ticket:${id}`]));
  const uploadUrls = db
    .prepare(
      `
        SELECT file_url AS url
        FROM contact_files
        WHERE gabinete_id = :gabinete_id AND source IN (${sourcePlaceholders})
      `,
    )
    .all({ gabinete_id: gabineteId, ...sourceParams })
    .map((item) => String(item.url || "").trim())
    .filter(Boolean);

  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM ticket_public_updates WHERE gabinete_id = :gabinete_id AND ticket_id IN (${placeholders})`).run(deleteParams);
    db.prepare(`DELETE FROM ticket_public_access_logs WHERE gabinete_id = :gabinete_id AND ticket_id IN (${placeholders})`).run(deleteParams);
    db.prepare(`DELETE FROM ticket_history WHERE gabinete_id = :gabinete_id AND ticket_id IN (${placeholders})`).run(deleteParams);
    db.prepare(`DELETE FROM contact_files WHERE gabinete_id = :gabinete_id AND source IN (${sourcePlaceholders})`).run({
      gabinete_id: gabineteId,
      ...sourceParams,
    });
    db.prepare(
      `UPDATE documents SET ticket_id = NULL, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND ticket_id IN (${placeholders})`,
    ).run(updateParams);
    db.prepare(
      `UPDATE tasks SET ticket_id = NULL, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND ticket_id IN (${placeholders})`,
    ).run(updateParams);
    db.prepare(
      `UPDATE call_logs SET ticket_id = NULL, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND ticket_id IN (${placeholders})`,
    ).run(updateParams);
    db.prepare(
      `UPDATE whatsapp_messages SET ticket_id = NULL, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND ticket_id IN (${placeholders})`,
    ).run(updateParams);
    db.prepare(
      `UPDATE whatsapp_threads SET ticket_id = NULL, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND ticket_id IN (${placeholders})`,
    ).run(updateParams);
    db.prepare(
      `UPDATE email_messages SET ticket_id = NULL, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND ticket_id IN (${placeholders})`,
    ).run(updateParams);
    db.prepare(
      `
        DELETE FROM notifications
        WHERE gabinete_id = :gabinete_id
          AND entity_type = 'ticket'
          AND entity_id IN (${placeholders})
      `,
    ).run(deleteParams);
    db.prepare(
      `
        DELETE FROM favorites
        WHERE gabinete_id = :gabinete_id
          AND entity_type = 'ticket'
          AND entity_id IN (${placeholders})
      `,
    ).run(deleteParams);
    const result = db
      .prepare(`DELETE FROM tickets WHERE gabinete_id = :gabinete_id AND id IN (${placeholders})`)
      .run(deleteParams);
    db.exec("COMMIT");
    deletePublicUploadUrls(uploadUrls);
    return result.changes || 0;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

function deleteTicket(gabineteId, ticketId) {
  return deleteTickets(gabineteId, [ticketId]);
}

function deleteDocument(gabineteId, documentId) {
  db.prepare("UPDATE tasks SET document_id = NULL, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND document_id = :document_id")
    .run({ gabinete_id: gabineteId, document_id: documentId, updated_at: nowIso() });
  db.prepare("DELETE FROM documents WHERE gabinete_id = :gabinete_id AND id = :id")
    .run({ gabinete_id: gabineteId, id: documentId });
}

function listProjects(gabineteId, filters = {}) {
  return db
    .prepare(
      `
        SELECT p.*, u.name AS responsible_name
    FROM projects p
    LEFT JOIN users u ON u.id = p.responsible_id AND u.gabinete_id = p.gabinete_id
    WHERE p.gabinete_id = :gabinete_id
      AND ${activeRowWhere("p")}
      AND (
            :q = '%%'
            OR p.title LIKE :q
            OR p.description LIKE :q
            OR p.category LIKE :q
            OR p.source_number LIKE :q
            OR p.source_protocol LIKE :q
            OR p.source_subject LIKE :q
            OR p.source_response LIKE :q
          )
          AND (:category = '%%' OR p.category LIKE :category)
          AND (:status = '' OR p.status = :status)
        ORDER BY p.updated_at DESC
      `,
    )
    .all({
      gabinete_id: gabineteId,
      q: `%${filters.q ?? ""}%`,
      category: `%${filters.category ?? ""}%`,
      status: filters.status ?? "",
    });
}

function getScopedProject(gabineteId, projectId) {
  return db
    .prepare(
      `
        SELECT p.*, u.name AS responsible_name
        FROM projects p
        LEFT JOIN users u ON u.id = p.responsible_id AND u.gabinete_id = p.gabinete_id
        WHERE p.gabinete_id = :gabinete_id AND p.id = :id
          AND ${activeRowWhere("p")}
      `,
    )
    .get({ gabinete_id: gabineteId, id: projectId });
}

function createProject(gabineteId, body) {
  const result = db.prepare(
    `
      INSERT INTO projects (
        gabinete_id, title, description, responsible_id, status, external_link,
        category, notes, created_at, updated_at
      ) VALUES (
        :gabinete_id, :title, :description, :responsible_id, :status, :external_link,
        :category, :notes, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    title: body.title,
    description: body.description ?? "",
    responsible_id: scopedReferenceId(gabineteId, "users", body.responsible_id),
    status: body.status,
    external_link: body.external_link ?? "",
    category: body.category ?? "",
    notes: body.notes ?? "",
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return Number(result.lastInsertRowid);
}

function updateProject(gabineteId, projectId, body) {
  db.prepare(
    `
      UPDATE projects
      SET title = :title,
          description = :description,
          responsible_id = :responsible_id,
          status = :status,
          external_link = :external_link,
          category = :category,
          notes = :notes,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    id: projectId,
    gabinete_id: gabineteId,
    title: body.title,
    description: body.description ?? "",
    responsible_id: scopedReferenceId(gabineteId, "users", body.responsible_id),
    status: body.status,
    external_link: body.external_link ?? "",
    category: body.category ?? "",
    notes: body.notes ?? "",
    updated_at: nowIso(),
  });
}

function deleteProject(gabineteId, projectId) {
  db.prepare("UPDATE tasks SET project_id = NULL, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND project_id = :project_id")
    .run({ gabinete_id: gabineteId, project_id: projectId, updated_at: nowIso() });
  db.prepare("DELETE FROM projects WHERE gabinete_id = :gabinete_id AND id = :id")
    .run({ gabinete_id: gabineteId, id: projectId });
}

const LEGISLATIVE_PROVIDER_LABELS = {
  siscam: "Siscam",
  sapl: "SAPL",
  legislativo_web: "Legislativo Web",
  legisoft: "Legisoft",
  generic: "Portal legislativo",
};

function normalizeLegislativeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString();
  } catch {
    return "";
  }
}

function detectLegislativeProvider(value) {
  const normalized = normalizeLegislativeUrl(value);
  if (!normalized) return "generic";
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return "generic";
  }
  const signature = `${parsed.hostname} ${parsed.pathname}`.toLowerCase();
  if (signature.includes("siscam")) return "siscam";
  if (signature.includes("sapl") || signature.includes(".leg.br/materia") || signature.includes("/materia/")) return "sapl";
  if (signature.includes("legisoft")) return "legisoft";
  if (signature.includes("legislativo") || signature.includes("webline") || signature.includes("spl.")) return "legislativo_web";
  return "generic";
}

function legislativeProviderLabel(provider) {
  return LEGISLATIVE_PROVIDER_LABELS[provider] || LEGISLATIVE_PROVIDER_LABELS.generic;
}

function inferLegislativeConnectorName(provider, sourceUrl) {
  const label = legislativeProviderLabel(provider);
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    return `${label} · ${host}`;
  } catch {
    return label;
  }
}

function createLegislativeConnector(gabineteId, body) {
  const sourceUrl = normalizeLegislativeUrl(body.url || body.source_url);
  if (!sourceUrl) throw new Error("Informe um link valido do vereador, gabinete ou portal legislativo.");
  const provider = detectLegislativeProvider(sourceUrl);
  const timestamp = nowIso();
  const existing = db
    .prepare(
      `
        SELECT *
        FROM legislative_connectors
        WHERE gabinete_id = :gabinete_id
          AND source_url = :source_url
        LIMIT 1
      `,
    )
    .get({ gabinete_id: gabineteId, source_url: sourceUrl });
  if (existing) {
    db.prepare(
      `
        UPDATE legislative_connectors
        SET provider = :provider,
            name = :name,
            active = 1,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    ).run({
      gabinete_id: gabineteId,
      id: existing.id,
      provider,
      name: String(body.name || existing.name || inferLegislativeConnectorName(provider, sourceUrl)).trim(),
      updated_at: timestamp,
    });
    return Number(existing.id);
  }
  const parsed = new URL(sourceUrl);
  const result = db.prepare(
    `
      INSERT INTO legislative_connectors (
        gabinete_id, provider, name, source_url, profile_url, base_url,
        external_ref, active, last_sync_at, last_error, item_count, created_at, updated_at
      ) VALUES (
        :gabinete_id, :provider, :name, :source_url, :profile_url, :base_url,
        :external_ref, 1, '', '', 0, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    provider,
    name: String(body.name || inferLegislativeConnectorName(provider, sourceUrl)).trim(),
    source_url: sourceUrl,
    profile_url: sourceUrl,
    base_url: `${parsed.protocol}//${parsed.host}`,
    external_ref: inferLegislativeExternalRef(provider, sourceUrl),
    created_at: timestamp,
    updated_at: timestamp,
  });
  return Number(result.lastInsertRowid);
}

function inferLegislativeExternalRef(provider, sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    if (provider === "siscam") {
      const match = parsed.pathname.match(/\/Vereadores\/(?:Vereador|Proposituras)\/(\d+)/i);
      if (match) return match[1];
    }
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop();
    return lastSegment || parsed.hostname;
  } catch {
    return "";
  }
}

function listLegislativeConnectors(gabineteId) {
  return db
    .prepare(
      `
        SELECT *
        FROM legislative_connectors
        WHERE gabinete_id = :gabinete_id
          AND active = 1
          AND ${activeRowWhere()}
        ORDER BY updated_at DESC, id DESC
      `,
    )
    .all({ gabinete_id: gabineteId })
    .map((item) => ({
      ...item,
      provider_label: legislativeProviderLabel(item.provider),
    }));
}

function getScopedLegislativeConnector(gabineteId, connectorId) {
  return db
    .prepare(`SELECT * FROM legislative_connectors WHERE gabinete_id = :gabinete_id AND id = :id AND active = 1 AND ${activeRowWhere()}`)
    .get({ gabinete_id: gabineteId, id: connectorId });
}

async function syncLegislativeConnector(gabineteId, connectorId) {
  const connector = getScopedLegislativeConnector(gabineteId, connectorId);
  if (!connector) throw new Error("Conector nao encontrado.");
  const timestamp = nowIso();
  try {
    const items = await fetchLegislativeItems(connector);
    if (!items.length) {
      throw new Error("Nao encontrei documentos nesse link. Cole a pagina do vereador, gabinete ou lista de proposituras do portal.");
    }
    let created = 0;
    let updated = 0;
    items.forEach((item) => {
      const result = upsertLegislativeProject(gabineteId, connector, item, timestamp);
      if (result === "created") created += 1;
      if (result === "updated") updated += 1;
    });
    db.prepare(
      `
        UPDATE legislative_connectors
        SET last_sync_at = :last_sync_at,
            last_error = '',
            item_count = :item_count,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    ).run({
      gabinete_id: gabineteId,
      id: connectorId,
      last_sync_at: timestamp,
      item_count: items.length,
      updated_at: timestamp,
    });
    return { imported: created, updated, total: items.length };
  } catch (error) {
    db.prepare(
      `
        UPDATE legislative_connectors
        SET last_error = :last_error,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    ).run({
      gabinete_id: gabineteId,
      id: connectorId,
      last_error: error?.message || "Falha ao sincronizar.",
      updated_at: timestamp,
    });
    throw error;
  }
}

async function fetchLegislativeItems(connector) {
  const html = await fetchPublicHtml(connector.source_url);
  if (connector.provider === "siscam") {
    return fetchSiscamItems(connector, html);
  }
  if (connector.provider === "sapl") {
    return parseSaplLegislativeItems(html, connector.source_url);
  }
  if (connector.provider === "legislativo_web") {
    return parseLegislativoWebItems(html, connector.source_url);
  }
  if (connector.provider === "legisoft") {
    return parseLegisoftItems(html, connector.source_url);
  }
  return parseGenericLegislativeItems(html, connector.source_url, connector.provider);
}

async function fetchPublicHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          "accept": "text/html,application/xhtml+xml",
          "user-agent": "Gabinete360/1.0 (+https://gabinete.guiapj.com.br)",
        },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("O portal demorou para responder. A sincronizacao diaria tentara novamente.");
      }
      throw new Error("Nao foi possivel acessar o portal agora. Confira o link ou tente novamente mais tarde.");
    }
    if (!response.ok) throw new Error(`Portal retornou HTTP ${response.status}.`);
    const text = await response.text();
    if (!text.trim()) throw new Error("Portal retornou pagina vazia.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSiscamItems(connector, overviewHtml) {
  const typeLinks = extractSiscamTypeLinks(overviewHtml, connector.source_url);
  const pages = typeLinks.length ? typeLinks : [{ url: connector.source_url, category: "Proposituras" }];
  const items = [];
  for (const page of pages.slice(0, 30)) {
    const html = page.url === connector.source_url ? overviewHtml : await fetchPublicHtml(page.url);
    items.push(...parseSiscamItems(html, page.url, page.category));
    if (items.length >= 1200) break;
  }
  const deduped = dedupeLegislativeItems(items).slice(0, 1200);
  const enriched = [];
  for (const item of deduped) {
    if (enriched.length >= LEGISLATIVE_DETAIL_FETCH_LIMIT || !item.source_url) {
      enriched.push(item);
      continue;
    }
    try {
      const detailHtml = await fetchPublicHtml(item.source_url);
      enriched.push(mergeLegislativeItemDetail(item, parseSiscamDocumentDetail(detailHtml, item.source_url)));
    } catch (error) {
      enriched.push({
        ...item,
        raw: {
          ...(item.raw || {}),
          detail_error: error?.message || "Nao foi possivel ler o detalhe.",
        },
      });
    }
  }
  return enriched;
}

function extractSiscamTypeLinks(html, sourceUrl) {
  const links = [];
  const seen = new Set();
  const pattern = /<a\b([^>]*?)href=["']([^"']*\/Vereadores\/Proposituras\/[^"']*documento=\d+[^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const url = resolvePublicUrl(sourceUrl, decodeHtml(match[2]));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const attrs = `${match[1]} ${match[3]}`;
    const title = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1] || stripHtml(match[4]);
    links.push({
      url,
      category: decodeHtml(title || "Proposituras"),
    });
  }
  return links;
}

function parseSiscamItems(html, pageUrl, category) {
  const items = [];
  const blockPattern = /<p\b[^>]*class=["'][^"']*data-list-item[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = blockPattern.exec(html))) {
    const block = match[1];
    const anchor = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a\b[^>]*title=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const href = anchor[1]?.startsWith("/") || /^https?:/i.test(anchor[1] || "") ? anchor[1] : anchor[2];
    const titleValue = anchor[2]?.startsWith("/") || /^https?:/i.test(anchor[2] || "") ? anchor[1] : anchor[2];
    const sourceUrl = resolvePublicUrl(pageUrl, decodeHtml(href || ""));
    if (!sourceUrl) continue;
    if (!/\/Documentos\/Documento\/\d+/i.test(sourceUrl)) continue;
    const rawText = stripHtml(block).replace(/\s+/g, " ").trim();
    const dateMatch = rawText.match(/(\d{2}\/\d{2}\/\d{4})/);
    const date = dateMatch ? normalizeBrazilianDate(dateMatch[1]) : "";
    const description = rawText
      .replace(stripHtml(anchor[3] || ""), "")
      .replace(dateMatch?.[1] || "", "")
      .replace(/^[-\s]+/, "")
      .trim();
    const title = decodeHtml(titleValue || stripHtml(anchor[3] || "") || "Documento legislativo").trim();
    const numberMatch = title.match(/(?:N[ºo]\s*)?([\d.]+\/\d{4})/i) || rawText.match(/(?:N[ºo]\s*)?([\d.]+\/\d{4})/i);
    const yearMatch = numberMatch?.[1]?.match(/\/(\d{4})$/);
    items.push({
      title,
      category: decodeHtml(category || inferLegislativeCategory(title)),
      description,
      source_url: sourceUrl,
      external_id: sourceUrl.match(/\/Documento\/(\d+)/i)?.[1] || sourceUrl,
      source_number: numberMatch?.[1] || title,
      source_year: yearMatch?.[1] || "",
      source_date: date,
      status: "Protocolado",
      raw: { rawText },
    });
  }
  return items;
}

function parseSiscamDocumentDetail(html, pageUrl) {
  const visibleText = stripHtml(html);
  const title = stripHtml(html.match(/<h3\b[^>]*class=["'][^"']*page-header[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "")
    || decodeHtml(html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] || "")
    || "";
  const subject = extractSiscamLabeledValue(html, "Assunto");
  const status = extractSiscamLabeledValue(html, "Situação") || extractSiscamLabeledValue(html, "Situacao");
  const responseInfo = extractSiscamResponseInfo(html, pageUrl);
  const tracking = extractSiscamTrackingSummary(html);
  const attachmentUrl = extractSiscamAttachmentUrl(html, pageUrl);
  const sourceDate = normalizeBrazilianDate(extractSiscamLabeledValue(html, "Data")) || extractBestBrazilianDate(visibleText);
  const numberMatch = title.match(/(?:N[ºo]\s*)?([\d.]+\/\d{4})/i) || visibleText.match(/(?:N[ºo]\s*)?([\d.]+\/\d{4})/i);
  const yearMatch = numberMatch?.[1]?.match(/\/(\d{4})$/);
  const sourceStatus = status || "";
  return {
    title,
    description: subject,
    category: inferLegislativeCategory(title),
    source_number: numberMatch?.[1] || "",
    source_year: yearMatch?.[1] || "",
    source_date: sourceDate,
    source_protocol: extractSiscamLabeledValue(html, "Protocolo"),
    source_author: extractSiscamLabeledValue(html, "Autoria"),
    source_subject: subject,
    source_status: sourceStatus,
    source_stage: responseInfo.text ? "Respondido" : sourceStatus,
    source_response: responseInfo.text,
    source_response_url: responseInfo.url,
    source_attachment_url: attachmentUrl,
    source_tracking: tracking,
    status: mapLegislativeWorkflowStatus(responseInfo.text ? "Respondido" : sourceStatus),
    raw: {
      title,
      sourceStatus,
      tracking,
      attachmentUrl,
      response: responseInfo.text,
    },
  };
}

function mergeLegislativeItemDetail(item, detail) {
  const merged = {
    ...item,
    ...Object.fromEntries(Object.entries(detail || {}).filter(([, value]) => value !== "" && value !== null && value !== undefined)),
    raw: {
      ...(item.raw || {}),
      detail: detail?.raw || {},
    },
  };
  if (!merged.description && item.description) merged.description = item.description;
  if (item.category) merged.category = item.category;
  if (!merged.source_number && item.source_number) merged.source_number = item.source_number;
  if (!merged.source_year && item.source_year) merged.source_year = item.source_year;
  if (!merged.source_date && item.source_date) merged.source_date = item.source_date;
  return merged;
}

function extractSiscamLabeledValue(html, label) {
  const escapedLabel = String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<strong>\\s*${escapedLabel}\\s*:?\\s*<\\/strong>\\s*([\\s\\S]*?)<\\/p>`, "i");
  return stripHtml(html.match(pattern)?.[1] || "");
}

function extractSiscamAttachmentUrl(html, pageUrl) {
  const match = html.match(/<a\b[^>]*href=["']([^"']*(?:\/arquivo\?Id=\d+|\/Arquivos\/[^"']+|\.pdf(?:\?[^"']*)?))["'][^>]*>/i);
  return match ? resolvePublicUrl(pageUrl, decodeHtml(match[1])) : "";
}

function extractSiscamResponseInfo(html, pageUrl) {
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const text = stripHtml(match[2]);
    const signature = `${match[1]} ${text}`.toLowerCase();
    if (!/(resposta|respondido|retorno|of[ií]cio resposta)/i.test(signature)) continue;
    return {
      text: text || "Resposta localizada no portal.",
      url: resolvePublicUrl(pageUrl, decodeHtml(match[1] || "")),
    };
  }
  const visibleText = stripHtml(html);
  const responseSentence = visibleText.match(/[^.]{0,80}(?:resposta|respondido|retorno)[^.]{0,160}\.?/i)?.[0] || "";
  return {
    text: responseSentence.trim(),
    url: "",
  };
}

function extractSiscamTrackingSummary(html) {
  const sectionMatch = html.match(/<h3>\s*Tramita(?:ç|&ccedil;)ões\s*<\/h3>([\s\S]*?)(?:<h3>|<div class=["']table-responsive|<\/div>\s*<p class=["']text-center)/i);
  const source = sectionMatch?.[1] || "";
  if (!source) return "";
  const blocks = [...source.matchAll(/<div\b[^>]*class=["'][^"']*data-list-item[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)]
    .map((item) => stripHtml(item[1]))
    .filter(Boolean)
    .slice(0, 5);
  return blocks.join(" | ").slice(0, 1000);
}

function parseSaplLegislativeItems(html, sourceUrl) {
  return parseGenericLegislativeItems(html, sourceUrl, "sapl").map((item) => ({
    ...item,
    raw: { ...(item.raw || {}), parser: "sapl" },
  }));
}

function parseLegislativoWebItems(html, sourceUrl) {
  return parseGenericLegislativeItems(html, sourceUrl, "legislativo_web").map((item) => ({
    ...item,
    raw: { ...(item.raw || {}), parser: "legislativo_web" },
  }));
}

function parseLegisoftItems(html, sourceUrl) {
  return parseGenericLegislativeItems(html, sourceUrl, "legisoft").map((item) => ({
    ...item,
    raw: { ...(item.raw || {}), parser: "legisoft" },
  }));
}

function parseGenericLegislativeItems(html, sourceUrl, provider) {
  const items = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const href = decodeHtml(match[1] || "");
    const title = stripHtml(match[2]).replace(/\s+/g, " ").trim();
    const signature = `${href} ${title}`.toLowerCase();
    if (!title || title.length < 4) continue;
    if (!/(documento|materia|mat[eé]ria|proposit|proposi[cç][aã]o|requerimento|indica[cç][aã]o|mo[cç][aã]o|projeto|of[ií]cio|pauta)/i.test(signature)) continue;
    const itemUrl = resolvePublicUrl(sourceUrl, href);
    if (!itemUrl || seen.has(itemUrl)) continue;
    seen.add(itemUrl);
    const numberMatch = title.match(/(?:N[ºo]\s*)?([\d.]+\/\d{4})/i);
    const yearMatch = numberMatch?.[1]?.match(/\/(\d{4})$/);
    items.push({
      title,
      category: inferLegislativeCategory(title),
      description: "",
      source_url: itemUrl,
      external_id: itemUrl,
      source_number: numberMatch?.[1] || "",
      source_year: yearMatch?.[1] || "",
      source_date: "",
      status: "Importado",
      raw: { provider },
    });
    if (items.length >= 250) break;
  }
  return dedupeLegislativeItems(items);
}

function dedupeLegislativeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.source_key || item.external_id || item.source_url || item.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function upsertLegislativeProject(gabineteId, connector, item, timestamp) {
  const externalId = String(item.external_id || item.source_url || "").trim();
  if (!externalId) return "skipped";
  const sourceKey = buildLegislativeSourceKey(connector.provider, item);
  const existing = db
    .prepare(
      `
        SELECT id
        FROM projects
        WHERE gabinete_id = :gabinete_id
          AND (
            (source_provider = :source_provider AND source_external_id = :source_external_id)
            OR (:source_key <> '' AND source_key = :source_key)
            OR (:source_number <> '' AND source_year <> '' AND COALESCE(source_provider, '') = '' AND source_number = :source_number AND source_year = :source_year AND LOWER(COALESCE(category, '')) = LOWER(:category))
            OR (:title <> '' AND COALESCE(source_provider, '') = '' AND LOWER(TRIM(title)) = LOWER(:title))
            OR source_url = :source_url
            OR external_link = :source_url
          )
        LIMIT 1
      `,
    )
    .get({
      gabinete_id: gabineteId,
      source_provider: connector.provider,
      source_external_id: externalId,
      source_key: sourceKey,
      category: item.category || legislativeProviderLabel(connector.provider),
      title: String(item.title || "Item legislativo").trim().slice(0, 220),
      source_number: item.source_number || "",
      source_year: item.source_year || "",
      source_url: item.source_url,
    });
  const payload = {
    gabinete_id: gabineteId,
    title: String(item.title || "Item legislativo").trim().slice(0, 220),
    description: String(item.description || "").trim(),
    status: item.status || "Protocolado",
    external_link: item.source_url || "",
    category: item.category || legislativeProviderLabel(connector.provider),
    notes: "",
    source_connector_id: connector.id,
    source_provider: connector.provider,
    source_external_id: externalId,
    source_key: sourceKey,
    source_number: item.source_number || "",
    source_year: item.source_year || "",
    source_date: item.source_date || "",
    source_protocol: item.source_protocol || "",
    source_author: item.source_author || "",
    source_subject: item.source_subject || "",
    source_status: item.source_status || "",
    source_stage: item.source_stage || "",
    source_response: item.source_response || "",
    source_response_url: item.source_response_url || "",
    source_attachment_url: item.source_attachment_url || "",
    source_tracking: item.source_tracking || "",
    source_url: item.source_url || "",
    source_raw_json: JSON.stringify(item.raw || item),
    source_detail_synced_at: item.source_status || item.source_tracking || item.source_response ? timestamp : "",
    last_synced_at: timestamp,
    updated_at: timestamp,
  };
  if (existing) {
    const { notes: _notes, ...updatePayload } = payload;
    db.prepare(
      `
        UPDATE projects
        SET title = :title,
            description = :description,
            status = CASE WHEN status = 'Arquivado' THEN status ELSE :status END,
            external_link = :external_link,
            category = :category,
            source_connector_id = :source_connector_id,
            source_provider = :source_provider,
            source_external_id = :source_external_id,
            source_key = :source_key,
            source_number = :source_number,
            source_year = :source_year,
            source_date = :source_date,
            source_protocol = :source_protocol,
            source_author = :source_author,
            source_subject = :source_subject,
            source_status = :source_status,
            source_stage = :source_stage,
            source_response = :source_response,
            source_response_url = :source_response_url,
            source_attachment_url = :source_attachment_url,
            source_tracking = :source_tracking,
            source_url = :source_url,
            source_raw_json = :source_raw_json,
            source_detail_synced_at = COALESCE(NULLIF(:source_detail_synced_at, ''), source_detail_synced_at),
            last_synced_at = :last_synced_at,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    ).run({ ...updatePayload, id: existing.id });
    return "updated";
  }
  db.prepare(
    `
      INSERT INTO projects (
        gabinete_id, title, description, responsible_id, status, external_link,
        category, notes, source_connector_id, source_provider, source_external_id,
        source_key, source_number, source_year, source_date, source_protocol,
        source_author, source_subject, source_status, source_stage, source_response,
        source_response_url, source_attachment_url, source_tracking, source_url,
        source_raw_json, generated_document_id, source_detail_synced_at,
        last_synced_at, created_at, updated_at
      ) VALUES (
        :gabinete_id, :title, :description, NULL, :status, :external_link,
        :category, :notes, :source_connector_id, :source_provider, :source_external_id,
        :source_key, :source_number, :source_year, :source_date, :source_protocol,
        :source_author, :source_subject, :source_status, :source_stage, :source_response,
        :source_response_url, :source_attachment_url, :source_tracking, :source_url,
        :source_raw_json, NULL, :source_detail_synced_at,
        :last_synced_at, :created_at, :updated_at
      )
    `,
  ).run({ ...payload, created_at: timestamp });
  return "created";
}

function buildLegislativeSourceKey(provider, item) {
  const externalId = String(item.external_id || "").trim();
  const documentId = externalId.match(/^\d+$/)?.[0]
    || String(item.source_url || "").match(/\/Documentos\/Documento\/(\d+)/i)?.[1]
    || String(item.external_id || item.source_url || "").match(/(?:Documento|documento|materia|mat[eé]ria)[/:=]+(\d+)/i)?.[1]
    || "";
  if (documentId) return `${provider}:id:${documentId}`;
  const number = normalizePlainText(item.source_number || "").replace(/\s+/g, "");
  const year = String(item.source_year || item.source_number?.match(/\/(\d{4})$/)?.[1] || "").trim();
  if (number && year) return `${provider}:${number}:${year}`;
  return `${provider}:url:${normalizeLegislativeUrl(item.source_url || "") || String(item.title || "").slice(0, 120)}`;
}

function buildDocumentFromProject(gabinete, userId, project) {
  const documentsCount = db
    .prepare("SELECT COUNT(*) AS total FROM documents WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabinete.id }).total;
  const documentType = documentTypeFromProjectCategory(project.category || project.title);
  const generatedText = [
    project.description || project.title,
    project.source_response ? `\nResposta/retorno do portal: ${project.source_response}` : "",
    project.source_tracking ? `\nTramitação: ${project.source_tracking}` : "",
    project.source_url || project.external_link ? `\nFonte: ${project.source_url || project.external_link}` : "",
  ].filter(Boolean).join("\n");
  const documentId = createDocument(gabinete.id, userId, {
    ticket_id: "",
    template_id: "",
    type: documentType,
    internal_number: generateDocumentCode(gabinete.id, documentsCount + 1),
    chamber_number: project.source_number || "",
    protocol_date: project.source_date || currentDate(),
    department: "",
    subject_line: project.title || "",
    addressed_to: "",
    routing_hint: "",
    legal_due_date: "",
    status: "Rascunho",
    demand: project.title || "",
    summary_request: project.description || "",
    summary_response: project.source_response || "",
    response_received_at: project.source_response ? currentDate() : "",
    generated_text: generatedText,
    progress_note: "",
    result: "",
    next_action: "",
    next_action_date: "",
    notes: `Criado a partir de ${project.source_provider || "portal legislativo"}${project.source_url ? `: ${project.source_url}` : ""}`,
    attachment_url: "",
    signature_profile_id: "",
  });
  db.prepare(
    `
      UPDATE projects
      SET generated_document_id = :generated_document_id,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    gabinete_id: gabinete.id,
    id: project.id,
    generated_document_id: documentId,
    updated_at: nowIso(),
  });
  return documentId;
}

function documentTypeFromProjectCategory(value) {
  const normalized = normalizePlainText(value || "");
  if (normalized.includes("indic")) return "Indicação";
  if (normalized.includes("requer")) return "Requerimento";
  if (normalized.includes("mocao") || normalized.includes("moção")) return "Moção";
  if (normalized.includes("projeto")) return "Projeto";
  if (normalized.includes("oficio")) return "Ofício";
  return "Documento";
}

function inferLegislativeCategory(value) {
  const normalized = normalizePlainText(value || "");
  if (normalized.includes("indic")) return "Indicação";
  if (normalized.includes("requer")) return "Requerimento";
  if (normalized.includes("mocao") || normalized.includes("moção")) return "Moção";
  if (normalized.includes("projeto")) return "Projeto";
  if (normalized.includes("oficio")) return "Ofício";
  return "Documento";
}

function resolvePublicUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function normalizeBrazilianDate(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  const numericYear = Number(year);
  const currentYear = Number(currentDate().slice(0, 4)) || new Date().getFullYear();
  if (numericYear < 1900 || numericYear > currentYear + 5) return "";
  return `${year}-${month}-${day}`;
}

function extractBestBrazilianDate(value) {
  const matches = [...String(value || "").matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)];
  for (const match of matches) {
    const normalized = normalizeBrazilianDate(match[1]);
    if (normalized) return normalized;
  }
  return "";
}

function mapLegislativeWorkflowStatus(value) {
  const normalized = normalizePlainText(value || "");
  if (normalized.includes("respond") || normalized.includes("resposta")) return "Respondido";
  if (normalized.includes("arquiv")) return "Arquivado";
  if (normalized.includes("aprov")) return "Aprovado";
  if (normalized.includes("retir")) return "Retirado";
  if (normalized.includes("tramit") || normalized.includes("andamento")) return "Em tramitacao";
  if (normalized.includes("protocol")) return "Protocolado";
  return "Protocolado";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeNoteColor(value) {
  const normalized = normalizePlainText(value || "").replaceAll(" ", "_");
  const colorMap = {
    yellow: ["yellow", "amarelo", "sol"],
    cream: ["cream", "creme"],
    sand: ["sand", "areia"],
    amber: ["amber", "ambar"],
    peach: ["peach", "pessego"],
    apricot: ["apricot", "damasco"],
    orange: ["orange", "laranja"],
    coral: ["coral"],
    salmon: ["salmon", "salmao"],
    red: ["red", "vermelho"],
    rose: ["rose", "rosa"],
    pink: ["pink"],
    fuchsia: ["fuchsia", "fucsia"],
    lilac: ["lilac", "lilas"],
    purple: ["purple", "roxo"],
    violet: ["violet", "violeta"],
    indigo: ["indigo"],
    blue: ["blue", "azul"],
    sky: ["sky", "ceu"],
    cyan: ["cyan", "ciano"],
    aqua: ["aqua"],
    teal: ["teal", "verde_agua", "turquesa"],
    mint: ["mint", "menta"],
    green: ["green", "verde"],
    lime: ["lime", "lima"],
    olive: ["olive", "oliva"],
    sage: ["sage"],
    moss: ["moss", "musgo"],
    clay: ["clay", "argila"],
    cocoa: ["cocoa", "cacau"],
    slate: ["slate", "cinza"],
    graphite: ["graphite", "grafite"],
  };
  for (const [color, aliases] of Object.entries(colorMap)) {
    if (aliases.includes(normalized)) return color;
  }
  return "yellow";
}

function normalizeNoteTags(value) {
  return normalizeEntityTags(value);
}

function noteSelectSql() {
  return `
    SELECT
      n.*,
      c.name AS contact_name,
      t.number AS ticket_number,
      t.demand_title AS ticket_title,
      d.internal_number AS document_number,
      d.subject_line AS document_title,
      p.title AS project_title,
      fe.title AS finance_title,
      tk.title AS task_title,
      tk.status AS task_status,
      u.name AS updated_by_name
    FROM notes n
    LEFT JOIN contacts c ON c.id = n.contact_id AND c.gabinete_id = n.gabinete_id
    LEFT JOIN tickets t ON t.id = n.ticket_id AND t.gabinete_id = n.gabinete_id
    LEFT JOIN documents d ON d.id = n.document_id AND d.gabinete_id = n.gabinete_id
    LEFT JOIN projects p ON p.id = n.project_id AND p.gabinete_id = n.gabinete_id
    LEFT JOIN finance_entries fe ON fe.id = n.finance_entry_id AND fe.gabinete_id = n.gabinete_id
    LEFT JOIN tasks tk ON tk.id = n.task_id AND tk.gabinete_id = n.gabinete_id
    LEFT JOIN users u ON u.id = n.updated_by AND (u.gabinete_id = n.gabinete_id OR u.role = 'super_admin')
  `;
}

function listNotes(gabineteId, filters = {}) {
  let sql = `
    ${noteSelectSql()}
    WHERE n.gabinete_id = :gabinete_id
      AND ${activeRowWhere("n")}
  `;
  const params = {
    gabinete_id: gabineteId,
  };
  if (filters.scope === "archived") {
    sql += " AND n.is_archived = 1";
  } else {
    sql += " AND COALESCE(n.is_archived, 0) = 0";
  }
  if (filters.scope === "pinned") {
    sql += " AND n.is_pinned = 1";
  }
  if (filters.q) {
    params.q = `%${filters.q}%`;
    sql += `
      AND (
        n.subject LIKE :q
        OR n.body LIKE :q
        OR n.tags LIKE :q
        OR c.name LIKE :q
        OR t.number LIKE :q
        OR t.demand_title LIKE :q
        OR d.internal_number LIKE :q
        OR d.subject_line LIKE :q
        OR p.title LIKE :q
        OR fe.title LIKE :q
        OR tk.title LIKE :q
      )
    `;
  }
  if (nullableInt(filters.task_id)) {
    params.task_id = Number(filters.task_id);
    sql += " AND n.task_id = :task_id";
  } else if (nullableInt(filters.document_id)) {
    params.document_id = Number(filters.document_id);
    sql += " AND n.document_id = :document_id";
  } else {
    sql += `
      AND n.contact_id IS NULL
      AND n.ticket_id IS NULL
      AND n.document_id IS NULL
      AND n.project_id IS NULL
      AND n.finance_entry_id IS NULL
      AND n.task_id IS NULL
    `;
  }
  sql += " ORDER BY n.is_pinned DESC, n.updated_at DESC";
  return db.prepare(sql).all(params);
}

function noteCounts(gabineteId) {
  const row = db
    .prepare(
      `
        SELECT
          SUM(CASE WHEN COALESCE(is_archived, 0) = 0 THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN COALESCE(is_archived, 0) = 0 AND COALESCE(is_pinned, 0) = 1 THEN 1 ELSE 0 END) AS pinned,
          SUM(CASE WHEN COALESCE(is_archived, 0) = 1 THEN 1 ELSE 0 END) AS archived
        FROM notes
        WHERE gabinete_id = :gabinete_id
          AND ${activeRowWhere()}
          AND contact_id IS NULL
          AND ticket_id IS NULL
          AND document_id IS NULL
          AND project_id IS NULL
          AND finance_entry_id IS NULL
          AND task_id IS NULL
      `,
    )
    .get({ gabinete_id: gabineteId }) || {};
  return {
    active: Number(row.active || 0),
    pinned: Number(row.pinned || 0),
    archived: Number(row.archived || 0),
  };
}

function getScopedNote(gabineteId, noteId) {
  return db
    .prepare(
      `
        ${noteSelectSql()}
        WHERE n.gabinete_id = :gabinete_id AND n.id = :id
          AND ${activeRowWhere("n")}
        LIMIT 1
      `,
    )
    .get({ gabinete_id: gabineteId, id: noteId });
}

function notePayload(gabineteId, body = {}, userId = null) {
  return {
    subject: String(body.subject || "").trim().slice(0, 160),
    body: String(body.body || "").trim().slice(0, 6000),
    tags: normalizeNoteTags(body.tags),
    color: normalizeNoteColor(body.color),
    is_pinned: toFlag(body.is_pinned),
    is_archived: toFlag(body.is_archived),
    contact_id: scopedReferenceId(gabineteId, "contacts", body.contact_id),
    ticket_id: scopedReferenceId(gabineteId, "tickets", body.ticket_id),
    document_id: scopedReferenceId(gabineteId, "documents", body.document_id),
    project_id: scopedReferenceId(gabineteId, "projects", body.project_id),
    finance_entry_id: scopedReferenceId(gabineteId, "finance_entries", body.finance_entry_id),
    task_id: scopedReferenceId(gabineteId, "tasks", body.task_id),
    updated_by: userId || null,
  };
}

function createNote(gabineteId, body, userId = null) {
  const payload = notePayload(gabineteId, body, userId);
  const timestamp = nowIso();
  const result = db.prepare(
    `
      INSERT INTO notes (
        gabinete_id, subject, body, tags, color, is_pinned, is_archived,
        contact_id, ticket_id, document_id, project_id, finance_entry_id,
        task_id, created_by, updated_by, archived_at, created_at, updated_at
      ) VALUES (
        :gabinete_id, :subject, :body, :tags, :color, :is_pinned, :is_archived,
        :contact_id, :ticket_id, :document_id, :project_id, :finance_entry_id,
        :task_id, :created_by, :updated_by, :archived_at, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    ...payload,
    created_by: userId || null,
    archived_at: payload.is_archived ? timestamp : "",
    created_at: timestamp,
    updated_at: timestamp,
  });
  return Number(result.lastInsertRowid);
}

function updateNote(gabineteId, noteId, body, userId = null) {
  const current = getScopedNote(gabineteId, noteId);
  if (!current) return;
  const payload = notePayload(gabineteId, { ...current, ...body }, userId);
  db.prepare(
    `
      UPDATE notes
      SET subject = :subject,
          body = :body,
          tags = :tags,
          color = :color,
          is_pinned = :is_pinned,
          is_archived = :is_archived,
          contact_id = :contact_id,
          ticket_id = :ticket_id,
          document_id = :document_id,
          project_id = :project_id,
          finance_entry_id = :finance_entry_id,
          task_id = :task_id,
          updated_by = :updated_by,
          archived_at = :archived_at,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    id: noteId,
    gabinete_id: gabineteId,
    ...payload,
    archived_at: payload.is_archived ? current.archived_at || nowIso() : "",
    updated_at: nowIso(),
  });
}

function deleteNote(gabineteId, noteId) {
  db.prepare("DELETE FROM public_entity_shares WHERE gabinete_id = :gabinete_id AND entity_type = 'note' AND entity_id = :note_id")
    .run({ gabinete_id: gabineteId, note_id: noteId });
  db.prepare("UPDATE tasks SET note_id = NULL, updated_at = :updated_at WHERE gabinete_id = :gabinete_id AND note_id = :note_id")
    .run({ gabinete_id: gabineteId, note_id: noteId, updated_at: nowIso() });
  db.prepare("DELETE FROM notes WHERE gabinete_id = :gabinete_id AND id = :id")
    .run({ gabinete_id: gabineteId, id: noteId });
}

function createTaskFromNote(gabineteId, noteId, body = {}, userId = null) {
  const note = getScopedNote(gabineteId, noteId);
  if (!note) throw new Error("Nota nao encontrada.");
  const taskId = createTask(gabineteId, {
    title: body.title || note.subject,
    description: body.description ?? note.body ?? "",
    responsible_id: body.responsible_id || "",
    ticket_id: body.ticket_id || note.ticket_id || "",
    contact_id: body.contact_id || note.contact_id || "",
    document_id: body.document_id || note.document_id || "",
    project_id: body.project_id || note.project_id || "",
    note_id: note.id,
    due_at: body.due_at || `${addDays(currentDate(), 1)}T09:00`,
    priority: body.priority || "Normal",
    status: body.status || "Pendente",
  });
  db.prepare(
    `
      UPDATE notes
      SET task_id = :task_id,
          updated_by = :updated_by,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    gabinete_id: gabineteId,
    id: noteId,
    task_id: taskId,
    updated_by: userId || null,
    updated_at: nowIso(),
  });
  return taskId;
}

function listTasks(gabineteId, filters = {}) {
  let sql = `
    SELECT
      tk.*,
      u.name AS responsible_name,
      t.number AS ticket_number,
      c.name AS contact_name,
      d.internal_number AS document_number,
      p.title AS project_title,
      n.subject AS note_subject
    FROM tasks tk
    LEFT JOIN users u ON u.id = tk.responsible_id AND u.gabinete_id = tk.gabinete_id
    LEFT JOIN tickets t ON t.id = tk.ticket_id AND t.gabinete_id = tk.gabinete_id
    LEFT JOIN contacts c ON c.id = tk.contact_id AND c.gabinete_id = tk.gabinete_id
    LEFT JOIN documents d ON d.id = tk.document_id AND d.gabinete_id = tk.gabinete_id
    LEFT JOIN projects p ON p.id = tk.project_id AND p.gabinete_id = tk.gabinete_id
    LEFT JOIN notes n ON n.id = tk.note_id AND n.gabinete_id = tk.gabinete_id
    WHERE tk.gabinete_id = :gabinete_id
      AND ${activeRowWhere("tk")}
	      AND (:q = '%%' OR tk.title LIKE :q OR tk.description LIKE :q OR tk.tags LIKE :q)
      AND (:responsible_id = '' OR tk.responsible_id = :responsible_id)
      AND (:status = '' OR tk.status = :status)
  `;
  const params = {
    gabinete_id: gabineteId,
    q: `%${filters.q ?? ""}%`,
    responsible_id: filters.responsible_id ?? "",
    status: filters.status ?? "",
  };
  if (filters.scope === "archived") {
    sql += " AND tk.status = 'Arquivada'";
  } else if (!["Arquivada", "Cancelada"].includes(filters.status)) {
    sql += " AND tk.status NOT IN ('Arquivada', 'Cancelada')";
  }
  if (filters.scope === "today") {
    sql += " AND substr(tk.due_at, 1, 10) = :today";
    params.today = currentDate();
  } else if (filters.scope === "next7") {
    sql += " AND substr(tk.due_at, 1, 10) BETWEEN :today AND :next7";
    params.today = currentDate();
    params.next7 = addDays(currentDate(), 6);
  } else if (filters.scope === "overdue") {
    sql += " AND tk.due_at < :now AND tk.status NOT IN ('Concluida', 'Arquivada', 'Cancelada')";
    params.now = new Date().toISOString();
  }
  sql += `
    ORDER BY
      CASE WHEN tk.status = 'Concluida' THEN 1 ELSE 0 END ASC,
      CASE WHEN tk.status = 'Concluida' THEN tk.updated_at ELSE '' END DESC,
      tk.due_at ASC,
      tk.updated_at DESC
  `;
  return db.prepare(sql).all(params);
}

function getScopedTask(gabineteId, taskId) {
  return db
    .prepare(
      `
        SELECT
          tk.*,
          u.name AS responsible_name,
          t.number AS ticket_number,
          c.name AS contact_name,
          d.internal_number AS document_number,
          p.title AS project_title,
          n.subject AS note_subject
        FROM tasks tk
        LEFT JOIN users u ON u.id = tk.responsible_id AND u.gabinete_id = tk.gabinete_id
        LEFT JOIN tickets t ON t.id = tk.ticket_id AND t.gabinete_id = tk.gabinete_id
        LEFT JOIN contacts c ON c.id = tk.contact_id AND c.gabinete_id = tk.gabinete_id
        LEFT JOIN documents d ON d.id = tk.document_id AND d.gabinete_id = tk.gabinete_id
        LEFT JOIN projects p ON p.id = tk.project_id AND p.gabinete_id = tk.gabinete_id
        LEFT JOIN notes n ON n.id = tk.note_id AND n.gabinete_id = tk.gabinete_id
        WHERE tk.gabinete_id = :gabinete_id AND tk.id = :id
          AND ${activeRowWhere("tk")}
      `,
    )
    .get({ gabinete_id: gabineteId, id: taskId });
}

function createTask(gabineteId, body) {
  const dueAt = body.due_at?.includes("T") && body.due_at.length === 16
    ? `${body.due_at}:00Z`
    : body.due_at;
  const result = db.prepare(
    `
      INSERT INTO tasks (
        gabinete_id, title, description, responsible_id, ticket_id, contact_id,
	        document_id, project_id, note_id, tags, due_at, priority, status, created_at, updated_at
	      ) VALUES (
	        :gabinete_id, :title, :description, :responsible_id, :ticket_id, :contact_id,
	        :document_id, :project_id, :note_id, :tags, :due_at, :priority, :status, :created_at, :updated_at
	      )
    `,
  ).run({
    gabinete_id: gabineteId,
    title: body.title,
    description: body.description ?? "",
    responsible_id: scopedReferenceId(gabineteId, "users", body.responsible_id),
    ticket_id: scopedReferenceId(gabineteId, "tickets", body.ticket_id),
    contact_id: scopedReferenceId(gabineteId, "contacts", body.contact_id),
	    document_id: scopedReferenceId(gabineteId, "documents", body.document_id),
	    project_id: scopedReferenceId(gabineteId, "projects", body.project_id),
	    note_id: scopedReferenceId(gabineteId, "notes", body.note_id),
	    tags: normalizeEntityTags(body.tags),
	    due_at: dueAt,
    priority: body.priority,
    status: body.status,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return Number(result.lastInsertRowid);
}

function updateTask(gabineteId, taskId, body) {
  const dueAt = body.due_at?.includes("T") && body.due_at.length === 16
    ? `${body.due_at}:00Z`
    : body.due_at;
  db.prepare(
    `
      UPDATE tasks
      SET title = :title,
          description = :description,
          responsible_id = :responsible_id,
          ticket_id = :ticket_id,
          contact_id = :contact_id,
	          document_id = :document_id,
	          project_id = :project_id,
	          note_id = :note_id,
	          tags = :tags,
	          due_at = :due_at,
          priority = :priority,
          status = :status,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    id: taskId,
    gabinete_id: gabineteId,
    title: body.title,
    description: body.description ?? "",
    responsible_id: scopedReferenceId(gabineteId, "users", body.responsible_id),
    ticket_id: scopedReferenceId(gabineteId, "tickets", body.ticket_id),
    contact_id: scopedReferenceId(gabineteId, "contacts", body.contact_id),
	    document_id: scopedReferenceId(gabineteId, "documents", body.document_id),
	    project_id: scopedReferenceId(gabineteId, "projects", body.project_id),
	    note_id: scopedReferenceId(gabineteId, "notes", body.note_id),
	    tags: normalizeEntityTags(body.tags),
    due_at: dueAt,
    priority: body.priority,
    status: body.status,
    updated_at: nowIso(),
  });
}

function deleteTask(gabineteId, taskId) {
  db.prepare("DELETE FROM tasks WHERE gabinete_id = :gabinete_id AND id = :id")
    .run({ gabinete_id: gabineteId, id: taskId });
}

function resolveContactIdByPhone(gabineteId, phone, fallbackContactId = null) {
  const explicitContactId = nullableInt(fallbackContactId);
  if (explicitContactId) return scopedReferenceId(gabineteId, "contacts", explicitContactId);
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;
  return (
    db
      .prepare(
        `
          SELECT id
          FROM contacts
          WHERE gabinete_id = :gabinete_id
            AND (deleted_at IS NULL OR deleted_at = '')
            AND (phone = :phone OR whatsapp = :phone)
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      )
      .get({
        gabinete_id: gabineteId,
        phone: normalizedPhone,
      })?.id ?? null
  );
}

function listCallLogs(gabineteId, filters = {}) {
  return db
    .prepare(
      `
        SELECT
          cl.*,
          c.name AS contact_name,
          t.number AS ticket_number,
          t.demand_title AS ticket_title,
          u.name AS created_by_name
        FROM call_logs cl
        LEFT JOIN contacts c ON c.id = cl.contact_id AND c.gabinete_id = cl.gabinete_id
        LEFT JOIN tickets t ON t.id = cl.ticket_id AND t.gabinete_id = cl.gabinete_id
        LEFT JOIN users u ON u.id = cl.created_by AND u.gabinete_id = cl.gabinete_id
        WHERE cl.gabinete_id = :gabinete_id
          AND ${activeRowWhere("cl")}
          AND (:contact_id = 0 OR cl.contact_id = :contact_id)
          AND (:ticket_id = 0 OR cl.ticket_id = :ticket_id)
          AND (
            :q = '%%'
            OR cl.phone LIKE :q
            OR cl.subject LIKE :q
            OR cl.notes LIKE :q
            OR cl.outcome LIKE :q
            OR c.name LIKE :q
            OR t.number LIKE :q
            OR t.demand_title LIKE :q
          )
        ORDER BY cl.call_at DESC, cl.updated_at DESC
      `,
    )
    .all({
      gabinete_id: gabineteId,
      q: `%${filters.q ?? ""}%`,
      contact_id: nullableInt(filters.contact_id) || 0,
      ticket_id: nullableInt(filters.ticket_id) || 0,
    });
}

function getScopedCallLog(gabineteId, callLogId) {
  return db
    .prepare(
      `
        SELECT
          cl.*,
          c.name AS contact_name,
          t.number AS ticket_number,
          t.demand_title AS ticket_title,
          u.name AS created_by_name
        FROM call_logs cl
        LEFT JOIN contacts c ON c.id = cl.contact_id AND c.gabinete_id = cl.gabinete_id
        LEFT JOIN tickets t ON t.id = cl.ticket_id AND t.gabinete_id = cl.gabinete_id
        LEFT JOIN users u ON u.id = cl.created_by AND u.gabinete_id = cl.gabinete_id
        WHERE cl.gabinete_id = :gabinete_id AND cl.id = :id
          AND ${activeRowWhere("cl")}
      `,
    )
    .get({ gabinete_id: gabineteId, id: callLogId });
}

function createCallLog(gabineteId, userId, body) {
  const ticketId = scopedReferenceId(gabineteId, "tickets", body.ticket_id);
  const linkedTicket = ticketId ? getScopedTicket(gabineteId, ticketId) : null;
  const contactId = resolveContactIdByPhone(gabineteId, body.phone, body.contact_id || linkedTicket?.contact_id);
  const result = db.prepare(
    `
      INSERT INTO call_logs (
        gabinete_id, contact_id, ticket_id, phone, subject, notes, outcome, call_at,
        created_by, created_at, updated_at
      ) VALUES (
        :gabinete_id, :contact_id, :ticket_id, :phone, :subject, :notes, :outcome, :call_at,
        :created_by, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    contact_id: contactId,
    ticket_id: ticketId,
    phone: normalizePhone(body.phone),
    subject: body.subject,
    notes: body.notes ?? "",
    outcome: body.outcome ?? "",
    call_at: body.call_at?.includes("T") && body.call_at.length === 16 ? `${body.call_at}:00Z` : body.call_at,
    created_by: userId,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return Number(result.lastInsertRowid);
}

function updateCallLog(gabineteId, callLogId, body) {
  const ticketId = scopedReferenceId(gabineteId, "tickets", body.ticket_id);
  const linkedTicket = ticketId ? getScopedTicket(gabineteId, ticketId) : null;
  const contactId = resolveContactIdByPhone(gabineteId, body.phone, body.contact_id || linkedTicket?.contact_id);
  db.prepare(
    `
      UPDATE call_logs
      SET contact_id = :contact_id,
          ticket_id = :ticket_id,
          phone = :phone,
          subject = :subject,
          notes = :notes,
          outcome = :outcome,
          call_at = :call_at,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    id: callLogId,
    gabinete_id: gabineteId,
    contact_id: contactId,
    ticket_id: ticketId,
    phone: normalizePhone(body.phone),
    subject: body.subject,
    notes: body.notes ?? "",
    outcome: body.outcome ?? "",
    call_at: body.call_at?.includes("T") && body.call_at.length === 16 ? `${body.call_at}:00Z` : body.call_at,
    updated_at: nowIso(),
  });
}

function deleteCallLog(gabineteId, callLogId) {
  db.prepare("DELETE FROM call_logs WHERE gabinete_id = :gabinete_id AND id = :id")
    .run({ gabinete_id: gabineteId, id: callLogId });
}

function buildCallLogHistoryText(callLog) {
  return [
    `Ligação registrada: ${callLog.subject}`,
    callLog.outcome ? `Desfecho: ${callLog.outcome}` : "",
    callLog.notes ? `Observações: ${callLog.notes}` : "",
  ].filter(Boolean).join("\n");
}

function financeReceiptExtensionForMime(mimeType) {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return "";
}

function inferFinanceReceiptMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return "";
  if (buffer.subarray(0, 4).toString("utf-8") === "%PDF") return "application/pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("utf-8") === "RIFF" && buffer.subarray(8, 12).toString("utf-8") === "WEBP") {
    return "image/webp";
  }
  return "";
}

function prepareFinanceReceiptUpload(payload = null) {
  if (!payload || !String(payload.data_url || "").trim()) return null;
  const dataUrl = String(payload.data_url || "");
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    throw new Error("Nao foi possivel ler o comprovante anexado.");
  }

  const originalName = String(payload.name || "comprovante").trim().slice(0, 180) || "comprovante";
  const declaredType = String(payload.type || match[1] || "").toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  const inferredType = inferFinanceReceiptMimeType(buffer);
  const mimeType = inferredType || declaredType;

  if (!FINANCE_RECEIPT_ALLOWED_FILE_TYPES.has(mimeType)) {
    throw new Error("Anexe um PDF, JPG, PNG ou WEBP.");
  }
  if (!inferredType) {
    throw new Error("O comprovante precisa ser um PDF ou imagem valido.");
  }
  if (buffer.length <= 0 || buffer.length > FINANCE_RECEIPT_MAX_FILE_BYTES) {
    throw new Error("O comprovante pode ter no maximo 5 MB.");
  }

  return {
    original_name: originalName,
    mime_type: mimeType,
    size_bytes: buffer.length,
    extension: financeReceiptExtensionForMime(mimeType),
    buffer,
  };
}

function storeFinanceReceiptUpload(gabineteId, entryId, upload) {
  if (!upload) return null;
  const entry = getScopedFinanceEntry(gabineteId, entryId);
  if (!entry) throw new Error("Lancamento nao encontrado.");

  mkdirSync(FINANCE_RECEIPT_UPLOAD_DIR, { recursive: true });
  const rawName = String(upload.original_name || entry.title || "comprovante").replace(/\.[^.]+$/, "");
  const baseName = slugify(rawName).slice(0, 42) || "comprovante";
  const storedName = `${gabineteId}-${entryId}-${Date.now()}-${baseName}${upload.extension}`;
  const targetPath = resolve(FINANCE_RECEIPT_UPLOAD_DIR, storedName);
  writeFileSync(targetPath, upload.buffer);

  if (entry.receipt_file_url) {
    deletePublicUploadUrls([entry.receipt_file_url]);
  }

  const receipt = {
    file_url: `${FINANCE_RECEIPT_URL_PREFIX}/${storedName}`,
    file_name: upload.original_name,
    file_type: upload.mime_type,
    file_size: upload.size_bytes,
  };

  db.prepare(
    `
      UPDATE finance_entries
      SET receipt_file_url = :receipt_file_url,
          receipt_file_name = :receipt_file_name,
          receipt_file_type = :receipt_file_type,
          receipt_file_size = :receipt_file_size,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    gabinete_id: gabineteId,
    id: entryId,
    receipt_file_url: receipt.file_url,
    receipt_file_name: receipt.file_name,
    receipt_file_type: receipt.file_type,
    receipt_file_size: receipt.file_size,
    updated_at: nowIso(),
  });

  return receipt;
}

function resolveFinanceReceiptPathFromUrl(url) {
  const value = String(url || "").trim();
  if (!value.startsWith(`${FINANCE_RECEIPT_URL_PREFIX}/`)) return "";
  const storedName = value.slice(FINANCE_RECEIPT_URL_PREFIX.length + 1).replace(/[^a-zA-Z0-9._-]/g, "");
  if (!storedName) return "";
  const targetPath = resolve(FINANCE_RECEIPT_UPLOAD_DIR, storedName);
  return targetPath.startsWith(FINANCE_RECEIPT_UPLOAD_DIR) ? targetPath : "";
}

function readFinanceReceiptFile(entry) {
  if (!entry?.receipt_file_url) return null;
  const filePath = resolveFinanceReceiptPathFromUrl(entry.receipt_file_url);
  if (!filePath || !existsSync(filePath)) return null;
  return {
    buffer: readFileSync(filePath),
    mime_type: entry.receipt_file_type || "application/octet-stream",
    file_name: entry.receipt_file_name || "comprovante",
  };
}

function deleteFinanceReceipt(gabineteId, entryId) {
  const entry = getScopedFinanceEntry(gabineteId, entryId);
  if (!entry) return;
  if (entry.receipt_file_url) {
    deletePublicUploadUrls([entry.receipt_file_url]);
  }
  db.prepare(
    `
      UPDATE finance_entries
      SET receipt_file_url = '',
          receipt_file_name = '',
          receipt_file_type = '',
          receipt_file_size = 0,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    gabinete_id: gabineteId,
    id: entryId,
    updated_at: nowIso(),
  });
}

function sanitizeFinanceAuditBody(body = {}) {
  const { receipt_file, receipt_file_payload, ...rest } = body;
  const receipt = receipt_file || receipt_file_payload;
  if (!receipt) return rest;
  return {
    ...rest,
    receipt_file: {
      name: receipt.name || "",
      type: receipt.type || "",
      size: receipt.size || 0,
    },
  };
}

function listFinanceEntries(gabineteId, filters = {}) {
  return db
    .prepare(
      `
        SELECT
          fe.*,
          u.name AS created_by_name
        FROM finance_entries fe
        LEFT JOIN users u ON u.id = fe.created_by AND u.gabinete_id = fe.gabinete_id
        WHERE fe.gabinete_id = :gabinete_id
          AND ${activeRowWhere("fe")}
          AND (
            :q = '%%'
            OR fe.title LIKE :q
            OR fe.category LIKE :q
            OR fe.description LIKE :q
            OR fe.payment_status LIKE :q
            OR fe.counterparty LIKE :q
            OR fe.status LIKE :q
          )
          AND (:entry_type = '' OR fe.entry_type = :entry_type)
          AND (:status = '' OR fe.payment_status = :status OR fe.status = :status)
        ORDER BY fe.entry_date DESC, fe.updated_at DESC
      `,
    )
    .all({
      gabinete_id: gabineteId,
      q: `%${filters.q ?? ""}%`,
      entry_type: filters.entry_type ?? "",
      status: filters.status ?? "",
    });
}

const FINANCE_PAYMENT_STATUS_NAMES = new Set(["Previsto", "Pago", "Cancelado"]);

function normalizeFinancePaymentStatus(value) {
  const status = String(value || "").trim();
  return FINANCE_PAYMENT_STATUS_NAMES.has(status) ? status : "Pago";
}

function normalizeFinanceCounterparty(body = {}) {
  const direct = String(body.counterparty ?? "").trim();
  if (direct) return direct;
  const legacy = String(body.status ?? "").trim();
  if (!legacy || legacy === "Registrado" || FINANCE_PAYMENT_STATUS_NAMES.has(legacy)) return "";
  return legacy;
}

function getScopedFinanceEntry(gabineteId, entryId) {
  return db
    .prepare(
      `
        SELECT
          fe.*,
          u.name AS created_by_name
        FROM finance_entries fe
        LEFT JOIN users u ON u.id = fe.created_by AND u.gabinete_id = fe.gabinete_id
        WHERE fe.gabinete_id = :gabinete_id AND fe.id = :id
          AND ${activeRowWhere("fe")}
      `,
    )
    .get({ gabinete_id: gabineteId, id: entryId });
}

function financeRepeatTotal(body) {
  const enabled = body.repeat_enabled === true || body.repeat_enabled === "1" || body.repeat_enabled === "true";
  if (!enabled) return 1;
  return Math.max(1, parseInteger(body.repeat_months, 1));
}

function createFinanceEntries(gabineteId, userId, body) {
  const total = financeRepeatTotal(body);
  const groupId = total > 1 ? `fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : "";
  const ids = [];

  for (let index = 0; index < total; index += 1) {
    ids.push(
      createFinanceEntry(gabineteId, userId, {
        ...body,
        entry_date: addMonthsClamped(body.entry_date || currentDate(), index),
        recurrence_group_id: groupId,
        recurrence_index: index + 1,
        recurrence_total: total,
      }),
    );
  }

  return ids;
}

function createFinanceEntry(gabineteId, userId, body) {
  const paymentStatus = normalizeFinancePaymentStatus(body.payment_status ?? body.status);
  const counterparty = normalizeFinanceCounterparty(body);
  const result = db.prepare(
    `
      INSERT INTO finance_entries (
        gabinete_id, entry_type, title, category, description, amount_cents,
        entry_date, status, payment_status, counterparty, notes, recurrence_group_id, recurrence_index, recurrence_total,
        created_by, created_at, updated_at
      ) VALUES (
        :gabinete_id, :entry_type, :title, :category, :description, :amount_cents,
        :entry_date, :status, :payment_status, :counterparty, :notes, :recurrence_group_id, :recurrence_index, :recurrence_total,
        :created_by, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    entry_type: body.entry_type,
    title: body.title,
    category: body.category ?? "",
    description: body.description ?? "",
    amount_cents: normalizeMoneyToCents(body.amount ?? body.amount_cents),
    entry_date: body.entry_date ?? currentDate(),
    status: paymentStatus,
    payment_status: paymentStatus,
    counterparty,
    notes: body.notes ?? "",
    recurrence_group_id: body.recurrence_group_id ?? "",
    recurrence_index: parseInteger(body.recurrence_index, 1) || 1,
    recurrence_total: parseInteger(body.recurrence_total, 1) || 1,
    created_by: userId,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return Number(result.lastInsertRowid);
}

function updateFinanceEntry(gabineteId, entryId, body) {
  const paymentStatus = normalizeFinancePaymentStatus(body.payment_status ?? body.status);
  const counterparty = normalizeFinanceCounterparty(body);
  db.prepare(
    `
      UPDATE finance_entries
      SET entry_type = :entry_type,
          title = :title,
          category = :category,
          description = :description,
          amount_cents = :amount_cents,
          entry_date = :entry_date,
          status = :status,
          payment_status = :payment_status,
          counterparty = :counterparty,
          notes = :notes,
          recurrence_group_id = :recurrence_group_id,
          recurrence_index = :recurrence_index,
          recurrence_total = :recurrence_total,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    id: entryId,
    gabinete_id: gabineteId,
    entry_type: body.entry_type,
    title: body.title,
    category: body.category ?? "",
    description: body.description ?? "",
    amount_cents: normalizeMoneyToCents(body.amount ?? body.amount_cents),
    entry_date: body.entry_date ?? currentDate(),
    status: paymentStatus,
    payment_status: paymentStatus,
    counterparty,
    notes: body.notes ?? "",
    recurrence_group_id: body.recurrence_group_id ?? "",
    recurrence_index: parseInteger(body.recurrence_index, 1) || 1,
    recurrence_total: parseInteger(body.recurrence_total, 1) || 1,
    updated_at: nowIso(),
  });
}

function deleteFinanceEntry(gabineteId, entryId) {
  const current = db
    .prepare("SELECT * FROM finance_entries WHERE gabinete_id = :gabinete_id AND id = :id")
    .get({ gabinete_id: gabineteId, id: entryId });
  if (current?.receipt_file_url) {
    deletePublicUploadUrls([current.receipt_file_url]);
  }
  db.prepare("DELETE FROM finance_entries WHERE gabinete_id = :gabinete_id AND id = :id")
    .run({ gabinete_id: gabineteId, id: entryId });
}

function taskCounts(gabineteId) {
  return {
    today: db
      .prepare(`SELECT COUNT(*) AS total FROM tasks WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND substr(due_at, 1, 10) = :today AND status <> 'Arquivada'`)
      .get({ gabinete_id: gabineteId, today: currentDate() }).total,
    next7: db
      .prepare(`SELECT COUNT(*) AS total FROM tasks WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND substr(due_at, 1, 10) BETWEEN :today AND :next7 AND status <> 'Arquivada'`)
      .get({
        gabinete_id: gabineteId,
        today: currentDate(),
        next7: addDays(currentDate(), 6),
      }).total,
    overdue: db
      .prepare(`SELECT COUNT(*) AS total FROM tasks WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND due_at < :now AND status NOT IN ('Concluida', 'Arquivada', 'Cancelada')`)
      .get({ gabinete_id: gabineteId, now: new Date().toISOString() }).total,
    done: db
      .prepare(`SELECT COUNT(*) AS total FROM tasks WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND status = 'Concluida'`)
      .get({ gabinete_id: gabineteId }).total,
  };
}

function buildReportsData(gabineteId) {
  return {
    stats: {
      total_tickets: db.prepare(`SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}`).get({ gabinete_id: gabineteId }).total,
      pending_tickets: db.prepare(`SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND (closed_at IS NULL OR closed_at = '')`).get({ gabinete_id: gabineteId }).total,
      closed_tickets: db.prepare(`SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND closed_at <> ''`).get({ gabinete_id: gabineteId }).total,
      avg_resolution_days:
        Math.round(
          db.prepare(`SELECT COALESCE(AVG(julianday(closed_at) - julianday(opened_at)), 0) AS avg_days FROM tickets WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()} AND closed_at <> ''`).get({ gabinete_id: gabineteId }).avg_days,
        ) || 0,
    },
    statusChart: aggregateChart(`
      SELECT status AS label, COUNT(*) AS total
      FROM tickets
      WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}
      GROUP BY status
      ORDER BY total DESC
      LIMIT 8
    `, gabineteId),
    categoryChart: aggregateChart(`
      SELECT COALESCE(demand_category, 'Sem categoria') AS label, COUNT(*) AS total
      FROM tickets
      WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}
      GROUP BY COALESCE(demand_category, 'Sem categoria')
      ORDER BY total DESC
      LIMIT 8
    `, gabineteId),
    neighborhoodChart: aggregateChart(`
      SELECT COALESCE(c.neighborhood, 'Sem bairro') AS label, COUNT(*) AS total
      FROM tickets t
      JOIN contacts c ON c.id = t.contact_id AND c.gabinete_id = t.gabinete_id
      WHERE t.gabinete_id = :gabinete_id
        AND ${activeRowWhere("t")}
      GROUP BY COALESCE(c.neighborhood, 'Sem bairro')
      ORDER BY total DESC
      LIMIT 8
    `, gabineteId),
    assigneeChart: aggregateChart(`
      SELECT COALESCE(u.name, 'Sem responsavel') AS label, COUNT(*) AS total
      FROM tickets t
      LEFT JOIN users u ON u.id = t.assigned_user_id AND u.gabinete_id = t.gabinete_id
      WHERE t.gabinete_id = :gabinete_id
        AND ${activeRowWhere("t")}
      GROUP BY COALESCE(u.name, 'Sem responsavel')
      ORDER BY total DESC
      LIMIT 8
    `, gabineteId),
    documentsChart: aggregateChart(`
      SELECT status AS label, COUNT(*) AS total
      FROM documents
      WHERE gabinete_id = :gabinete_id AND ${activeRowWhere()}
      GROUP BY status
      ORDER BY total DESC
      LIMIT 8
    `, gabineteId),
    exportBase: "/export",
  };
}

function listImports(gabineteId) {
  const rows = db
    .prepare(
      `
        SELECT *
        FROM imports
        WHERE gabinete_id = :gabinete_id
        ORDER BY created_at DESC
      `,
    )
    .all({ gabinete_id: gabineteId });
  return rows.map((row) => decorateImportListItem(gabineteId, row));
}

function decorateImportListItem(gabineteId, row) {
  if (!row) return null;
  const summary = parseJsonObject(row.summary_json);
  const analysis = row.undo_status === "available"
    ? analyzeImportUndo(gabineteId, row, { shallow: true })
    : { can_undo: false, reason: row.undo_reason || "" };
  return {
    ...row,
    source_label: summary.source_label || "",
    stats: summary.stats || {},
    created_contacts: parseInteger(summary.created_contacts, 0),
    updated_contacts: parseInteger(summary.updated_contacts, 0),
    skipped_rows: parseInteger(summary.skipped_rows, 0),
    merge_conflicts_count: parseInteger(summary.merge_conflicts_count, row.duplicates_count || 0),
    can_undo: Boolean(analysis.can_undo),
    undo_reason: analysis.reason || row.undo_reason || "",
  };
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hasUndoableImportPayload(report = {}) {
  return Boolean(
    Number(report.imported_tickets || 0) ||
      Number(report.created_contacts || 0) ||
      Number(report.updated_contacts || 0) ||
      Number(report.merge_conflicts_count || 0),
  );
}

const CONTACT_RESTORE_FIELDS = [
  "name",
  "contact_type",
  "register_kind",
  "segment",
  "gender",
  "is_leader",
  "is_authority",
  "phone",
  "whatsapp",
  "cpf_rg_cns",
  "birth_date",
  "birth_month",
  "birth_day",
  "birth_year",
  "birth_date_precision",
  "email",
  "photo_url",
  "profession",
  "referred_by",
  "company_legal_name",
  "foundation_date",
  "employee_count",
  "has_pet",
  "address",
  "number",
  "complement",
  "neighborhood",
  "zip_code",
  "city",
  "uf",
  "social_instagram",
  "social_facebook",
  "social_x",
  "social_youtube",
  "geo_lat",
  "geo_lng",
  "notes",
  "tags",
  "first_ticket_at",
  "last_ticket_at",
  "deleted_at",
  "deleted_by",
  "import_id",
  "created_at",
  "updated_at",
];

function analyzeImportUndo(gabineteId, importRecord, options = {}) {
  const reason = (text) => ({ can_undo: false, reason: text });
  if (!importRecord) return reason("Importacao nao encontrada.");
  if (!["completed", "completed_with_errors"].includes(importRecord.status)) {
    if (importRecord.status === "undone") return reason("Esta importacao ja foi desfeita.");
    return reason("So e possivel desfazer uma importacao ja concluida.");
  }
  if (importRecord.undo_status !== "available") {
    return reason(importRecord.undo_reason || "Esta importacao nao esta disponivel para desfazer.");
  }

  const latest = db.prepare(
    `
      SELECT id
      FROM imports
      WHERE gabinete_id = :gabinete_id
        AND status IN ('completed', 'completed_with_errors')
        AND COALESCE(undo_status, '') <> 'undone'
      ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC
      LIMIT 1
    `,
  ).get({ gabinete_id: gabineteId });
  if (latest?.id && Number(latest.id) !== Number(importRecord.id)) {
    return reason("So a ultima importacao concluida pode ser desfeita.");
  }

  const confirmedAt = importRecord.confirmed_at || parseJsonObject(importRecord.summary_json).created_at || importRecord.created_at;
  const laterAudit = db.prepare(
    `
      SELECT action, entity_type, entity_id, created_at
      FROM audit_log
      WHERE gabinete_id = :gabinete_id
        AND created_at > :confirmed_at
        AND NOT (action = 'import' AND entity_type = 'import' AND entity_id = :import_id)
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
  ).get({
    gabinete_id: gabineteId,
    confirmed_at: confirmedAt,
    import_id: importRecord.id,
  });
  if (laterAudit) {
    return reason("Nao da para desfazer porque houve outra alteracao depois da importacao.");
  }

  const importId = Number(importRecord.id);
  const importedTickets = db.prepare(
    "SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id AND import_id = :import_id",
  ).get({ gabinete_id: gabineteId, import_id: importId }).total;
  const changedTickets = db.prepare(
    `
      SELECT COUNT(*) AS total
      FROM tickets
      WHERE gabinete_id = :gabinete_id
        AND import_id = :import_id
        AND updated_at <> :confirmed_at
    `,
  ).get({ gabinete_id: gabineteId, import_id: importId, confirmed_at: confirmedAt }).total;
  if (changedTickets) return reason("Nao da para desfazer porque um atendimento importado foi alterado.");

  const extraHistory = db.prepare(
    `
      SELECT COUNT(*) AS total
      FROM ticket_history h
      JOIN tickets t ON t.id = h.ticket_id AND t.gabinete_id = h.gabinete_id
      WHERE h.gabinete_id = :gabinete_id
        AND t.import_id = :import_id
        AND COALESCE(h.import_id, 0) <> :import_id
    `,
  ).get({ gabinete_id: gabineteId, import_id: importId }).total;
  if (extraHistory) return reason("Nao da para desfazer porque um atendimento importado recebeu historico novo.");

  if (!options.shallow) {
    const linkedToImportedTicket = [
      ["notes", "nota"],
      ["tasks", "tarefa"],
      ["call_logs", "ligacao"],
      ["documents", "documento"],
      ["whatsapp_messages", "mensagem de WhatsApp"],
      ["email_messages", "e-mail"],
    ].find(([table]) => {
      const count = db.prepare(
        `
          SELECT COUNT(*) AS total
          FROM ${table} item
          JOIN tickets t ON t.id = item.ticket_id AND t.gabinete_id = item.gabinete_id
          WHERE item.gabinete_id = :gabinete_id
            AND t.import_id = :import_id
        `,
      ).get({ gabinete_id: gabineteId, import_id: importId }).total;
      return count > 0;
    });
    if (linkedToImportedTicket) {
      return reason(`Nao da para desfazer porque um atendimento importado ja recebeu ${linkedToImportedTicket[1]}.`);
    }
  }

  const changedContacts = db.prepare(
    `
      SELECT COUNT(*) AS total
      FROM import_contact_snapshots s
      JOIN contacts c ON c.id = s.contact_id AND c.gabinete_id = s.gabinete_id
      WHERE s.gabinete_id = :gabinete_id
        AND s.import_id = :import_id
        AND c.updated_at <> s.created_at
    `,
  ).get({ gabinete_id: gabineteId, import_id: importId }).total;
  if (changedContacts) return reason("Nao da para desfazer porque um contato atualizado pela importacao foi alterado depois.");

  const changedCreatedContacts = db.prepare(
    `
      SELECT COUNT(*) AS total
      FROM contacts
      WHERE gabinete_id = :gabinete_id
        AND import_id = :import_id
        AND updated_at <> created_at
    `,
  ).get({ gabinete_id: gabineteId, import_id: importId }).total;
  if (changedCreatedContacts) return reason("Nao da para desfazer porque um contato criado pela importacao foi alterado.");

  const reviewedSuggestions = db.prepare(
    `
      SELECT COUNT(*) AS total
      FROM contact_merge_suggestions
      WHERE gabinete_id = :gabinete_id
        AND import_id = :import_id
        AND status <> 'pending'
    `,
  ).get({ gabinete_id: gabineteId, import_id: importId }).total;
  if (reviewedSuggestions) return reason("Nao da para desfazer porque uma duplicidade desta importacao ja foi revisada.");

  if (!options.shallow) {
    const linkedToImportedContact = [
      ["tickets", "atendimento", "AND COALESCE(item.import_id, 0) <> :import_id"],
      ["notes", "nota", ""],
      ["tasks", "tarefa", ""],
      ["call_logs", "ligacao", ""],
      ["whatsapp_messages", "mensagem de WhatsApp", ""],
      ["email_messages", "e-mail", ""],
      ["contact_files", "arquivo", ""],
    ].find(([table, , extra]) => {
      const count = db.prepare(
        `
          SELECT COUNT(*) AS total
          FROM ${table} item
          JOIN contacts c ON c.id = item.contact_id AND c.gabinete_id = item.gabinete_id
          WHERE item.gabinete_id = :gabinete_id
            AND c.import_id = :import_id
            ${extra}
        `,
      ).get({ gabinete_id: gabineteId, import_id: importId }).total;
      return count > 0;
    });
    if (linkedToImportedContact) {
      return reason(`Nao da para desfazer porque um contato importado ja recebeu ${linkedToImportedContact[1]}.`);
    }
  }

  const createdContacts = db.prepare(
    "SELECT COUNT(*) AS total FROM contacts WHERE gabinete_id = :gabinete_id AND import_id = :import_id",
  ).get({ gabinete_id: gabineteId, import_id: importId }).total;
  const updatedContacts = db.prepare(
    "SELECT COUNT(*) AS total FROM import_contact_snapshots WHERE gabinete_id = :gabinete_id AND import_id = :import_id",
  ).get({ gabinete_id: gabineteId, import_id: importId }).total;

  return {
    can_undo: true,
    reason: "",
    confirmed_at: confirmedAt,
    imported_tickets: importedTickets,
    created_contacts: createdContacts,
    updated_contacts: updatedContacts,
  };
}

function undoImport(gabineteId, importRecord, userId, analysis) {
  const importId = Number(importRecord.id);
  const timestamp = nowIso();
  const snapshots = db.prepare(
    "SELECT * FROM import_contact_snapshots WHERE gabinete_id = :gabinete_id AND import_id = :import_id ORDER BY id DESC",
  ).all({ gabinete_id: gabineteId, import_id: importId });

  db.prepare("DELETE FROM contact_merge_suggestions WHERE gabinete_id = :gabinete_id AND import_id = :import_id").run({
    gabinete_id: gabineteId,
    import_id: importId,
  });
  db.prepare("DELETE FROM ticket_history WHERE gabinete_id = :gabinete_id AND import_id = :import_id").run({
    gabinete_id: gabineteId,
    import_id: importId,
  });
  const deletedTickets = db.prepare("DELETE FROM tickets WHERE gabinete_id = :gabinete_id AND import_id = :import_id").run({
    gabinete_id: gabineteId,
    import_id: importId,
  }).changes;

  snapshots.forEach((snapshotRow) => {
    const snapshot = parseJsonObject(snapshotRow.snapshot_json);
    restoreContactFromSnapshot(gabineteId, snapshotRow.contact_id, snapshot);
  });

  const deletedContacts = db.prepare("DELETE FROM contacts WHERE gabinete_id = :gabinete_id AND import_id = :import_id").run({
    gabinete_id: gabineteId,
    import_id: importId,
  }).changes;
  db.prepare("DELETE FROM import_contact_snapshots WHERE gabinete_id = :gabinete_id AND import_id = :import_id").run({
    gabinete_id: gabineteId,
    import_id: importId,
  });

  const result = {
    status: "undone",
    deleted_tickets: deletedTickets,
    deleted_contacts: deletedContacts,
    restored_contacts: snapshots.length,
    undone_at: timestamp,
  };

  const summary = parseJsonObject(importRecord.summary_json);
  db.prepare(
    `
      UPDATE imports
      SET status = 'undone',
          undo_status = 'undone',
          undo_reason = '',
          undone_at = :undone_at,
          undone_by = :undone_by,
          undo_summary_json = :undo_summary_json,
          summary_json = :summary_json
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    gabinete_id: gabineteId,
    id: importId,
    undone_at: timestamp,
    undone_by: userId || null,
    undo_summary_json: JSON.stringify(result),
    summary_json: JSON.stringify({
      ...summary,
      undo: result,
    }),
  });

  return {
    ...result,
    analysis,
  };
}

function restoreContactFromSnapshot(gabineteId, contactId, snapshot) {
  if (!snapshot?.id) throw new Error("Snapshot de contato invalido.");
  const assignments = CONTACT_RESTORE_FIELDS.map((field) => `${field} = :${field}`).join(",\n          ");
  const payload = { gabinete_id: gabineteId, id: contactId };
  CONTACT_RESTORE_FIELDS.forEach((field) => {
    payload[field] = Object.prototype.hasOwnProperty.call(snapshot, field) ? snapshot[field] : null;
  });
  db.prepare(
    `
      UPDATE contacts
      SET ${assignments}
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run(payload);
}

function listContactMergeSuggestions(gabineteId, status = "pending", options = {}) {
  const limit = Math.max(0, parseInteger(options.limit, 0));
  const limitClause = limit > 0 ? "LIMIT :limit" : "";
  const params = { gabinete_id: gabineteId, status };
  if (limit > 0) params.limit = limit;
  return db.prepare(
    `
      SELECT
        cms.*,
        ec.name AS existing_contact_name,
        ec.phone AS existing_contact_phone,
        ec.whatsapp AS existing_contact_whatsapp,
        ec.email AS existing_contact_email,
        ic.name AS imported_contact_name,
        ic.phone AS imported_contact_phone,
        ic.whatsapp AS imported_contact_whatsapp,
        ic.email AS imported_contact_email,
        i.source_name AS import_source_name
      FROM contact_merge_suggestions cms
      JOIN contacts ec ON ec.id = cms.existing_contact_id AND ec.gabinete_id = cms.gabinete_id
      JOIN contacts ic ON ic.id = cms.imported_contact_id AND ic.gabinete_id = cms.gabinete_id
      LEFT JOIN imports i ON i.id = cms.import_id AND i.gabinete_id = cms.gabinete_id
      WHERE cms.gabinete_id = :gabinete_id
        AND cms.status = :status
        AND (ec.deleted_at IS NULL OR ec.deleted_at = '')
        AND (ic.deleted_at IS NULL OR ic.deleted_at = '')
      ORDER BY
        CASE cms.confidence WHEN 'auto' THEN 1 WHEN 'strong' THEN 2 ELSE 3 END,
        cms.match_score DESC,
        cms.created_at DESC,
        cms.id DESC
      ${limitClause}
    `,
  ).all(params);
}

function getContactMergeSuggestion(gabineteId, suggestionId) {
  return db.prepare(
    `
      SELECT *
      FROM contact_merge_suggestions
      WHERE gabinete_id = :gabinete_id
        AND id = :id
        AND status = 'pending'
    `,
  ).get({ gabinete_id: gabineteId, id: suggestionId });
}

function ignoreContactMergeSuggestion(gabineteId, suggestionId, userId) {
  const suggestion = getContactMergeSuggestion(gabineteId, suggestionId);
  if (!suggestion) throw new Error("Conflito nao encontrado ou ja revisado.");
  const timestamp = nowIso();
  db.prepare(
    `
      UPDATE contact_merge_suggestions
      SET status = 'ignored',
          resolved_at = :resolved_at,
          resolved_by = :resolved_by,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({
    gabinete_id: gabineteId,
    id: suggestionId,
    resolved_at: timestamp,
    resolved_by: userId,
    updated_at: timestamp,
  });
  logAudit(gabineteId, userId, "ignore", "contact_merge_suggestion", suggestionId, suggestion, { status: "ignored" });
  return { status: "ignored" };
}

function mergeContactSuggestion(gabineteId, suggestionId, userId) {
  const suggestion = getContactMergeSuggestion(gabineteId, suggestionId);
  if (!suggestion) throw new Error("Conflito nao encontrado ou ja revisado.");
  const target = getScopedContact(gabineteId, suggestion.existing_contact_id);
  const source = getScopedContact(gabineteId, suggestion.imported_contact_id);
  if (!target || !source) throw new Error("Um dos contatos desse conflito nao existe mais.");
  const timestamp = nowIso();
  db.exec("BEGIN");
  try {
    const merged = buildMergedContactPayload(target, source, timestamp);
    updateMergedContact(gabineteId, target.id, merged);
    reassignContactReferences(gabineteId, source.id, target.id);
    db.prepare("DELETE FROM contacts WHERE gabinete_id = :gabinete_id AND id = :id").run({
      gabinete_id: gabineteId,
      id: source.id,
    });
    db.prepare(
      `
        UPDATE contact_merge_suggestions
        SET status = 'merged',
            resolved_at = :resolved_at,
            resolved_by = :resolved_by,
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id AND id = :id
      `,
    ).run({
      gabinete_id: gabineteId,
      id: suggestionId,
      resolved_at: timestamp,
      resolved_by: userId,
      updated_at: timestamp,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  logAudit(gabineteId, userId, "merge", "contact_merge_suggestion", suggestionId, suggestion, {
    target_contact_id: target.id,
    removed_contact_id: source.id,
  });
  return { status: "merged", target_contact_id: target.id };
}

function buildMergedContactPayload(target, source, timestamp) {
  const fill = (field) => firstNonBlank(target[field], source[field]);
  const sourceSummary = [
    `Contato mesclado: ${source.name}`,
    source.phone ? `Telefone: ${formatPhone(source.phone)}` : "",
    source.email ? `E-mail: ${source.email}` : "",
  ].filter(Boolean).join("\n");
  return {
    name: fill("name"),
    contact_type: fill("contact_type") || "person",
    segment: fill("segment") || "municipe",
    gender: fill("gender"),
    is_leader: Boolean(target.is_leader || source.is_leader) ? 1 : 0,
    is_authority: Boolean(target.is_authority || source.is_authority) ? 1 : 0,
    phone: fill("phone"),
    whatsapp: fill("whatsapp"),
    cpf_rg_cns: fill("cpf_rg_cns"),
    birth_date: fill("birth_date"),
    birth_month: target.birth_month || source.birth_month || null,
    birth_day: target.birth_day || source.birth_day || null,
    birth_year: target.birth_year || source.birth_year || null,
    birth_date_precision: fill("birth_date_precision"),
    email: fill("email"),
    photo_url: fill("photo_url"),
    profession: fill("profession"),
    referred_by: fill("referred_by"),
    company_legal_name: fill("company_legal_name"),
    foundation_date: fill("foundation_date"),
    employee_count: target.employee_count || source.employee_count || null,
    has_pet: Boolean(target.has_pet || source.has_pet) ? 1 : 0,
    address: fill("address"),
    number: fill("number"),
    complement: fill("complement"),
    neighborhood: fill("neighborhood"),
    zip_code: fill("zip_code"),
    city: fill("city"),
    uf: fill("uf"),
    social_instagram: fill("social_instagram"),
    social_facebook: fill("social_facebook"),
    social_x: fill("social_x"),
    social_youtube: fill("social_youtube"),
    geo_lat: fill("geo_lat"),
    geo_lng: fill("geo_lng"),
    notes: mergeTextValues(target.notes, source.notes, sourceSummary),
    tags: mergeCommaValues(target.tags, source.tags),
    first_ticket_at: fill("first_ticket_at"),
    last_ticket_at: fill("last_ticket_at"),
    updated_at: timestamp,
  };
}

function updateMergedContact(gabineteId, contactId, body) {
  db.prepare(
    `
      UPDATE contacts
      SET name = :name,
          contact_type = :contact_type,
          segment = :segment,
          gender = :gender,
          is_leader = :is_leader,
          is_authority = :is_authority,
          phone = :phone,
          whatsapp = :whatsapp,
          cpf_rg_cns = :cpf_rg_cns,
          birth_date = :birth_date,
          birth_month = :birth_month,
          birth_day = :birth_day,
          birth_year = :birth_year,
          birth_date_precision = :birth_date_precision,
          email = :email,
          photo_url = :photo_url,
          profession = :profession,
          referred_by = :referred_by,
          company_legal_name = :company_legal_name,
          foundation_date = :foundation_date,
          employee_count = :employee_count,
          has_pet = :has_pet,
          address = :address,
          number = :number,
          complement = :complement,
          neighborhood = :neighborhood,
          zip_code = :zip_code,
          city = :city,
          uf = :uf,
          social_instagram = :social_instagram,
          social_facebook = :social_facebook,
          social_x = :social_x,
          social_youtube = :social_youtube,
          geo_lat = :geo_lat,
          geo_lng = :geo_lng,
          notes = :notes,
          tags = :tags,
          first_ticket_at = :first_ticket_at,
          last_ticket_at = :last_ticket_at,
          updated_at = :updated_at
      WHERE gabinete_id = :gabinete_id AND id = :id
    `,
  ).run({ ...body, gabinete_id: gabineteId, id: contactId });
}

function reassignContactReferences(gabineteId, sourceContactId, targetContactId) {
  [
    "contact_files",
    "tickets",
    "tasks",
    "call_logs",
    "whatsapp_messages",
    "whatsapp_threads",
    "email_messages",
  ].forEach((table) => {
    db.prepare(
      `UPDATE ${table} SET contact_id = :target_contact_id WHERE gabinete_id = :gabinete_id AND contact_id = :source_contact_id`,
    ).run({
      gabinete_id: gabineteId,
      source_contact_id: sourceContactId,
      target_contact_id: targetContactId,
    });
  });
}

function firstNonBlank(...values) {
  return values.find((value) => String(value ?? "").trim() !== "") ?? "";
}

function mergeTextValues(...values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeTextKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n\n");
}

function mergeCommaValues(...values) {
  const seen = new Set();
  const result = [];
  values
    .flatMap(splitCommaValues)
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      const key = normalizeTextKey(value);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(value);
    });
  return result.join(",");
}

function splitCommaValues(value) {
  return String(value || "")
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTextKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildImportOptions(fields = {}, gabinete = {}) {
  const defaultAreaCode = normalizeDefaultAreaCode(fields.default_area_code)
    || normalizeDefaultAreaCode(gabinete.default_area_code)
    || inferBrazilianAreaCode(gabinete.phone || "");
  return {
    default_country_code: "55",
    default_area_code: defaultAreaCode,
  };
}

function buildImportAnalysisWarnings(stats = {}) {
  const warnings = [];
  if (stats.legacy_mobile_phones_estimate) {
    warnings.push(
      `${stats.legacy_mobile_phones_estimate} telefone(s) local(is) de 8 digitos com inicio 6, 7, 8 ou 9 foram tratados como celular antigo e receberam o nono digito.`,
    );
  }
  if (stats.invalid_phones_estimate) {
    warnings.push(
      `${stats.invalid_phones_estimate} telefone(s) nao seguiram a regra brasileira de fixo/celular e ficaram para revisao.`,
    );
  }
  if (stats.merge_conflicts_estimate) {
    warnings.push(
      `${stats.merge_conflicts_estimate} contato(s) cairam na regra de revisao de duplicidade; serao importados separados e ficarao no Mesclar e corrigir.`,
    );
  }
  if (stats.invalid_documents_estimate) {
    warnings.push(
      `${stats.invalid_documents_estimate} CPF/CNPJ invalido(s) foram ignorados para nao salvar documento errado.`,
    );
  }
  return warnings;
}

function storedLocalUrlPathname(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) {
    try {
      return new URL(raw, "http://gabinete360.local").pathname;
    } catch {
      return "";
    }
  }
  try {
    return new URL(raw).pathname;
  } catch {
    return "";
  }
}

function resolveBackupUploadFile(url, options = {}) {
  const requireSource = options.requireSource !== false;
  const includeMissing = Boolean(options.includeMissing);
  const pathname = storedLocalUrlPathname(url);
  if (!pathname) return null;

  if (pathname.startsWith(`${PUBLIC_UPLOAD_URL_PREFIX}/`)) {
    const persistentPath = resolvePersistentUploadPathFromUrl(pathname);
    const legacyPath = resolveLegacyPublicUploadPathFromUrl(pathname);
    const sourcePath = persistentPath && existsSync(persistentPath) ? persistentPath : legacyPath;
    if (requireSource && (!sourcePath || !existsSync(sourcePath))) {
      return includeMissing
        ? {
            url: String(url || "").trim(),
            pathname,
            source_path: sourcePath || persistentPath || legacyPath || "",
            restore_path: persistentPath,
            missing: true,
          }
        : null;
    }
    return {
      url: String(url || "").trim(),
      pathname,
      source_path: sourcePath,
      restore_path: persistentPath,
    };
  }

  if (pathname.startsWith(`${FINANCE_RECEIPT_URL_PREFIX}/`)) {
    const targetPath = resolveFinanceReceiptPathFromUrl(pathname);
    if (requireSource && (!targetPath || !existsSync(targetPath))) {
      return includeMissing
        ? {
            url: String(url || "").trim(),
            pathname,
            source_path: targetPath || "",
            restore_path: targetPath,
            missing: true,
          }
        : null;
    }
    return {
      url: String(url || "").trim(),
      pathname,
      source_path: targetPath,
      restore_path: targetPath,
    };
  }

  return null;
}

function collectBackupLocalFileUrls(gabineteId, gabinete, data) {
  const urls = new Set();
  const add = (value) => {
    const normalized = String(value || "").trim();
    if (normalized) urls.add(normalized);
  };

  add(gabinete?.logo_url);
  (Array.isArray(data.contact_files) ? data.contact_files : []).forEach((row) => add(row.file_url));
  (Array.isArray(data.documents) ? data.documents : []).forEach((row) => add(row.attachment_url));
  (Array.isArray(data.whatsapp_messages) ? data.whatsapp_messages : []).forEach((row) => add(row.attachment_url));
  (Array.isArray(data.finance_entries) ? data.finance_entries : []).forEach((row) => add(row.receipt_file_url));
  (Array.isArray(data.signature_profiles) ? data.signature_profiles : []).forEach((row) => add(row.file_url));

  collectGabineteUploadUrls(gabineteId, { includeStructure: true }).forEach(add);
  return [...urls];
}

function exportGabineteBackupFiles(gabineteId, gabinete, data) {
  const files = [];
  const missingFiles = [];
  const seenPaths = new Set();
  collectBackupLocalFileUrls(gabineteId, gabinete, data).forEach((url) => {
    const resolvedFile = resolveBackupUploadFile(url, { includeMissing: true });
    if (!resolvedFile) return;
    if (resolvedFile.missing) {
      missingFiles.push({
        url: resolvedFile.url,
        pathname: resolvedFile.pathname,
      });
      return;
    }
    if (seenPaths.has(resolvedFile.restore_path)) return;
    const stats = statSync(resolvedFile.source_path);
    if (stats.isDirectory()) return;
    const buffer = readFileSync(resolvedFile.source_path);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    seenPaths.add(resolvedFile.restore_path);
    files.push({
      url: resolvedFile.url,
      pathname: resolvedFile.pathname,
      mime_type: PERSISTENT_UPLOAD_MIME_TYPES[extname(resolvedFile.source_path).toLowerCase()] || "application/octet-stream",
      size_bytes: buffer.length,
      sha256,
      content_base64: buffer.toString("base64"),
    });
  });
  return { files, missing_files: missingFiles };
}

function exportGabineteBackup(gabineteId) {
  const gabinete = db
    .prepare(
      `
        SELECT
          id, slug, public_slug, name, type, parliamentarian_name, party, city, city_ibge, uf,
          zip_code, address, address_number, address_complement, neighborhood,
          responsible_name, phone, email, logo_url,
          public_self_register_intro, public_self_register_config,
          email_sender_name, email_sender_address, email_reply_to,
          email_smtp_host, email_smtp_port, email_smtp_security, email_smtp_username, email_smtp_password,
          email_smtp_verified_at,
          whatsapp_provider, whatsapp_instance_name, whatsapp_instance_token,
          default_follow_up_days, default_document_due_days,
          default_birthday_notice_days, default_area_code, team_label
        FROM gabinetes
        WHERE id = :id
      `,
    )
    .get({ id: gabineteId });

  const tables = {
    status_custom: "SELECT * FROM status_custom WHERE gabinete_id = :gabinete_id ORDER BY sort_order, id",
    categories: "SELECT * FROM categories WHERE gabinete_id = :gabinete_id ORDER BY name, id",
    channels: "SELECT * FROM channels WHERE gabinete_id = :gabinete_id ORDER BY name, id",
    whatsapp_templates:
      "SELECT * FROM whatsapp_templates WHERE gabinete_id = :gabinete_id ORDER BY kind, id",
    document_templates:
      "SELECT * FROM document_templates WHERE gabinete_id = :gabinete_id ORDER BY title, variant_name, id",
    signature_profiles:
      "SELECT * FROM signature_profiles WHERE gabinete_id = :gabinete_id ORDER BY label, id",
    ai_links: "SELECT * FROM ai_links WHERE gabinete_id = :gabinete_id ORDER BY title, id",
    routing_rules: "SELECT * FROM routing_rules WHERE gabinete_id = :gabinete_id ORDER BY priority DESC, id",
    imports: "SELECT * FROM imports WHERE gabinete_id = :gabinete_id ORDER BY id",
    import_contact_snapshots: "SELECT * FROM import_contact_snapshots WHERE gabinete_id = :gabinete_id ORDER BY id",
    contacts: "SELECT * FROM contacts WHERE gabinete_id = :gabinete_id ORDER BY id",
    contact_files: "SELECT * FROM contact_files WHERE gabinete_id = :gabinete_id ORDER BY id",
    contact_merge_suggestions: "SELECT * FROM contact_merge_suggestions WHERE gabinete_id = :gabinete_id ORDER BY id",
    tickets: "SELECT * FROM tickets WHERE gabinete_id = :gabinete_id ORDER BY id",
    ticket_history: "SELECT * FROM ticket_history WHERE gabinete_id = :gabinete_id ORDER BY id",
    ticket_public_updates: "SELECT * FROM ticket_public_updates WHERE gabinete_id = :gabinete_id ORDER BY id",
    ticket_public_access_logs: "SELECT * FROM ticket_public_access_logs WHERE gabinete_id = :gabinete_id ORDER BY id",
    documents: "SELECT * FROM documents WHERE gabinete_id = :gabinete_id ORDER BY id",
    legislative_connectors: "SELECT * FROM legislative_connectors WHERE gabinete_id = :gabinete_id ORDER BY id",
    projects: "SELECT * FROM projects WHERE gabinete_id = :gabinete_id ORDER BY id",
    notes: "SELECT * FROM notes WHERE gabinete_id = :gabinete_id ORDER BY id",
    tasks: "SELECT * FROM tasks WHERE gabinete_id = :gabinete_id ORDER BY id",
    call_logs: "SELECT * FROM call_logs WHERE gabinete_id = :gabinete_id ORDER BY id",
    whatsapp_messages: "SELECT * FROM whatsapp_messages WHERE gabinete_id = :gabinete_id ORDER BY id",
    email_messages: "SELECT * FROM email_messages WHERE gabinete_id = :gabinete_id ORDER BY id",
    finance_entries: "SELECT * FROM finance_entries WHERE gabinete_id = :gabinete_id ORDER BY id",
  };

  const data = Object.fromEntries(
    Object.entries(tables).map(([name, sql]) => [
      name,
      db.prepare(sql).all({ gabinete_id: gabineteId }),
    ]),
  );
  const { files, missing_files: missingFiles } = exportGabineteBackupFiles(gabineteId, gabinete, data);
  const filesTotalBytes = files.reduce((total, file) => total + Number(file.size_bytes || 0), 0);

  return {
    meta: {
      version: 2,
      exported_at: nowIso(),
      gabinete,
      tables: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0])),
      files: {
        count: files.length,
        total_bytes: filesTotalBytes,
        missing_count: missingFiles.length,
        missing: missingFiles,
      },
    },
    data,
    files,
  };
}

function prepareGabineteBackupFiles(backup) {
  const files = Array.isArray(backup.files) ? backup.files : [];
  const prepared = [];
  const seenTargets = new Map();
  files.forEach((file) => {
    const resolvedFile = resolveBackupUploadFile(file?.pathname || file?.url, { requireSource: false });
    const pathname = storedLocalUrlPathname(file?.pathname || file?.url);
    const targetPath =
      resolvedFile?.restore_path
      || (pathname.startsWith(`${PUBLIC_UPLOAD_URL_PREFIX}/`) ? resolvePersistentUploadPathFromUrl(pathname) : "")
      || (pathname.startsWith(`${FINANCE_RECEIPT_URL_PREFIX}/`) ? resolveFinanceReceiptPathFromUrl(pathname) : "");
    if (!targetPath) {
      throw new Error("Backup contem arquivo com caminho invalido.");
    }
    const buffer = Buffer.from(String(file?.content_base64 || ""), "base64");
    const expectedSize = Number(file?.size_bytes || 0);
    if (expectedSize && buffer.length !== expectedSize) {
      throw new Error("Backup contem arquivo corrompido ou incompleto.");
    }
    const expectedHash = String(file?.sha256 || file?.hash_sha256 || "").trim().toLowerCase();
    const actualHash = createHash("sha256").update(buffer).digest("hex");
    if (expectedHash && expectedHash !== actualHash) {
      throw new Error("Backup contem arquivo com hash invalido.");
    }
    const previous = seenTargets.get(targetPath);
    if (previous && previous.sha256 !== actualHash) {
      throw new Error("Backup contem arquivos duplicados com conteudos diferentes.");
    }
    if (previous) return;
    seenTargets.set(targetPath, { sha256: actualHash });
    prepared.push({
      target_path: targetPath,
      buffer,
      sha256: actualHash,
      size_bytes: buffer.length,
    });
  });
  return prepared;
}

function stageGabineteBackupFiles(preparedFiles = []) {
  const staged = [];
  try {
    preparedFiles.forEach((file) => {
      mkdirSync(dirname(file.target_path), { recursive: true });
      const tempPath = `${file.target_path}.restore-${Date.now()}-${randomBytes(4).toString("hex")}.tmp`;
      writeFileSync(tempPath, file.buffer);
      staged.push({ ...file, temp_path: tempPath });
    });
    return staged;
  } catch (error) {
    staged.forEach((file) => {
      try {
        if (file.temp_path && existsSync(file.temp_path)) unlinkSync(file.temp_path);
      } catch {}
    });
    throw error;
  }
}

function commitStagedGabineteBackupFiles(stagedFiles = []) {
  try {
    stagedFiles.forEach((file) => {
      renameSync(file.temp_path, file.target_path);
    });
  } finally {
    stagedFiles.forEach((file) => {
      try {
        if (file.temp_path && existsSync(file.temp_path)) unlinkSync(file.temp_path);
      } catch {}
    });
  }
}

const BACKUP_USER_REFERENCE_COLUMNS = new Set([
  "user_id",
  "assigned_user_id",
  "created_by",
  "updated_by",
  "deleted_by",
  "trash_hidden_by",
  "public_visible_by",
  "responsible_id",
  "undone_by",
  "resolved_by",
]);

function backupTableColumnSet(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
}

function backupValidUserIds(gabineteId) {
  return new Set(
    db.prepare("SELECT id FROM users WHERE gabinete_id = :gabinete_id OR role = 'super_admin'")
      .all({ gabinete_id: gabineteId })
      .map((row) => Number(row.id)),
  );
}

function sanitizeBackupRowForInsert(table, row, gabineteId, context) {
  const tableColumns = context.table_columns.get(table) || backupTableColumnSet(table);
  context.table_columns.set(table, tableColumns);
  const nextRow = {};
  Object.entries(row || {}).forEach(([column, value]) => {
    if (tableColumns.has(column)) nextRow[column] = value;
  });
  if (tableColumns.has("gabinete_id")) nextRow.gabinete_id = gabineteId;
  if (table === "notes" && tableColumns.has("task_id")) nextRow.task_id = null;
  BACKUP_USER_REFERENCE_COLUMNS.forEach((column) => {
    if (!Object.prototype.hasOwnProperty.call(nextRow, column)) return;
    const value = Number(nextRow[column] || 0);
    if (value > 0 && !context.valid_user_ids.has(value)) nextRow[column] = null;
  });
  return nextRow;
}

function insertBackupRow(table, row) {
  const columns = Object.keys(row || {});
  if (!columns.length) return;
  const placeholders = columns.map((column) => `:${column}`).join(", ");
  db.prepare(
    `
      INSERT INTO ${table} (${columns.join(", ")})
      VALUES (${placeholders})
    `,
  ).run(row);
}

function restoreGabineteBackup(gabineteId, payload) {
  const backup = payload?.data ? payload : null;
  if (!backup?.data || !backup?.meta?.gabinete) {
    throw new Error("Arquivo de backup invalido.");
  }

  const preparedFiles = prepareGabineteBackupFiles(backup);
  const stagedFiles = stageGabineteBackupFiles(preparedFiles);

  const gabineteMeta = backup.meta.gabinete;
  const restoreContext = {
    table_columns: new Map(),
    valid_user_ids: backupValidUserIds(gabineteId),
  };
  const restoreOrder = [
    "status_custom",
    "categories",
    "channels",
    "whatsapp_templates",
    "document_templates",
    "signature_profiles",
    "ai_links",
    "routing_rules",
    "imports",
    "contacts",
    "import_contact_snapshots",
    "contact_files",
    "contact_merge_suggestions",
    "tickets",
    "ticket_history",
    "ticket_public_updates",
    "ticket_public_access_logs",
    "documents",
    "legislative_connectors",
    "projects",
    "notes",
    "tasks",
    "call_logs",
    "whatsapp_messages",
    "email_messages",
    "finance_entries",
  ];
  const clearOrder = [
    "ticket_public_access_logs",
    "ticket_public_updates",
    "ticket_history",
    "tasks",
    "notes",
    "call_logs",
    "whatsapp_messages",
    "email_messages",
    "finance_entries",
    "documents",
    "tickets",
    "legislative_connectors",
    "contact_merge_suggestions",
    "import_contact_snapshots",
    "contact_files",
    "imports",
    "projects",
    "contacts",
    "status_custom",
    "categories",
    "channels",
    "whatsapp_templates",
    "document_templates",
    "signature_profiles",
    "ai_links",
    "routing_rules",
  ];

  db.exec("BEGIN");
  try {
    clearOrder.forEach((table) => {
      db.prepare(`DELETE FROM ${table} WHERE gabinete_id = :gabinete_id`).run({
        gabinete_id: gabineteId,
      });
    });

    db.prepare(
      `
        UPDATE gabinetes
        SET name = :name,
            type = :type,
            parliamentarian_name = :parliamentarian_name,
            party = :party,
            city = :city,
            city_ibge = :city_ibge,
            uf = :uf,
            zip_code = :zip_code,
            address = :address,
            address_number = :address_number,
            address_complement = :address_complement,
            neighborhood = :neighborhood,
            responsible_name = :responsible_name,
            phone = :phone,
            email = :email,
            logo_url = :logo_url,
            public_slug = :public_slug,
            public_self_register_intro = :public_self_register_intro,
            public_self_register_config = :public_self_register_config,
            email_sender_name = :email_sender_name,
            email_sender_address = :email_sender_address,
            email_reply_to = :email_reply_to,
            email_smtp_host = :email_smtp_host,
            email_smtp_port = :email_smtp_port,
            email_smtp_security = :email_smtp_security,
            email_smtp_username = :email_smtp_username,
            email_smtp_password = :email_smtp_password,
            email_smtp_verified_at = :email_smtp_verified_at,
            whatsapp_provider = :whatsapp_provider,
            whatsapp_instance_name = :whatsapp_instance_name,
            whatsapp_instance_token = :whatsapp_instance_token,
            default_follow_up_days = :default_follow_up_days,
            default_document_due_days = :default_document_due_days,
            default_birthday_notice_days = :default_birthday_notice_days,
            default_area_code = :default_area_code,
            team_label = :team_label,
            updated_at = :updated_at
        WHERE id = :id
      `,
    ).run({
      id: gabineteId,
      name: gabineteMeta.name,
      type: gabineteMeta.type,
      parliamentarian_name: gabineteMeta.parliamentarian_name ?? "",
      party: gabineteMeta.party ?? "",
      city: gabineteMeta.city ?? "",
      city_ibge: gabineteMeta.city_ibge ?? "",
      uf: gabineteMeta.uf ?? "",
      zip_code: gabineteMeta.zip_code ?? "",
      address: gabineteMeta.address ?? "",
      address_number: gabineteMeta.address_number ?? "",
      address_complement: gabineteMeta.address_complement ?? "",
      neighborhood: gabineteMeta.neighborhood ?? "",
      responsible_name: gabineteMeta.responsible_name ?? "",
      phone: gabineteMeta.phone ?? "",
      email: gabineteMeta.email ?? "",
      logo_url: gabineteMeta.logo_url ?? "",
      public_slug: gabineteMeta.public_slug ?? "",
      public_self_register_intro: gabineteMeta.public_self_register_intro ?? "",
      public_self_register_config: gabineteMeta.public_self_register_config ?? "",
      email_sender_name: gabineteMeta.email_sender_name ?? "",
      email_sender_address: gabineteMeta.email_sender_address ?? "",
      email_reply_to: gabineteMeta.email_reply_to ?? "",
      email_smtp_host: gabineteMeta.email_smtp_host ?? "",
      email_smtp_port: gabineteMeta.email_smtp_port ?? 465,
      email_smtp_security: normalizeSmtpSecurity(gabineteMeta.email_smtp_security ?? "ssl_tls"),
      email_smtp_username: gabineteMeta.email_smtp_username ?? "",
      email_smtp_password: gabineteMeta.email_smtp_password ?? "",
      email_smtp_verified_at: gabineteMeta.email_smtp_verified_at ?? "",
      whatsapp_provider: gabineteMeta.whatsapp_provider ?? (isEvolutionConfigured() ? "evolution" : "wa_me"),
      whatsapp_instance_name: gabineteMeta.whatsapp_instance_name ?? "",
      whatsapp_instance_token: gabineteMeta.whatsapp_instance_token ?? "",
      default_follow_up_days: gabineteMeta.default_follow_up_days ?? 3,
      default_document_due_days: gabineteMeta.default_document_due_days ?? 30,
      default_birthday_notice_days: gabineteMeta.default_birthday_notice_days ?? 7,
      default_area_code: normalizeDefaultAreaCode(gabineteMeta.default_area_code) || inferBrazilianAreaCode(gabineteMeta.phone || ""),
      team_label: gabineteMeta.team_label ?? "Meu time",
      updated_at: nowIso(),
    });

    restoreOrder.forEach((table) => {
      const rows = Array.isArray(backup.data?.[table]) ? backup.data[table] : [];
      rows.forEach((row) => {
        insertBackupRow(table, sanitizeBackupRowForInsert(table, row, gabineteId, restoreContext));
      });
    });

    db.exec("COMMIT");
    transactionOpen = false;
    commitStagedGabineteBackupFiles(stagedFiles);
  } catch (error) {
    if (transactionOpen) db.exec("ROLLBACK");
    stagedFiles.forEach((file) => {
      try {
        if (file.temp_path && existsSync(file.temp_path)) unlinkSync(file.temp_path);
      } catch {}
    });
    throw error;
  }
}

const GABINETE_OPERATIONAL_PURGE_TABLES = [
  "ticket_public_access_logs",
  "ticket_public_updates",
  "ticket_history",
  "tasks",
  "notes",
  "call_logs",
  "whatsapp_messages",
  "whatsapp_threads",
  "email_messages",
  "finance_entries",
  "documents",
  "tickets",
  "contact_merge_suggestions",
  "contact_files",
  "imports",
  "projects",
  "contacts",
  "saved_filters",
  "favorites",
  "notifications",
  "audit_log",
];

function purgeGabineteOperationalData(gabineteId) {
  const uploadUrls = collectGabineteUploadUrls(gabineteId, { includeStructure: false });
  const deleted = {};
  db.exec("BEGIN");
  try {
    GABINETE_OPERATIONAL_PURGE_TABLES.forEach((table) => {
      const result = db.prepare(`DELETE FROM ${table} WHERE gabinete_id = :gabinete_id`).run({
        gabinete_id: gabineteId,
      });
      deleted[table] = result.changes || 0;
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  deletePublicUploadUrls(uploadUrls);
  return deleted;
}

function deleteGabineteAccount(gabineteId) {
  const uploadUrls = collectGabineteUploadUrls(gabineteId, { includeStructure: true });
  const users = db.prepare("SELECT email FROM users WHERE gabinete_id = :gabinete_id").all({ gabinete_id: gabineteId });
  db.exec("BEGIN");
  try {
    users.forEach((user) => {
      if (user.email) {
        db.prepare("DELETE FROM password_reset_request_attempts WHERE lower(email) = lower(:email)").run({
          email: user.email,
        });
      }
    });
    const result = db.prepare("DELETE FROM gabinetes WHERE id = :gabinete_id").run({
      gabinete_id: gabineteId,
    });
    if (!result.changes) throw new Error("Gabinete nao encontrado para exclusao.");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  deletePublicUploadUrls(uploadUrls);
}

function collectGabineteUploadUrls(gabineteId, options = {}) {
  const queries = [
    "SELECT file_url AS url FROM contact_files WHERE gabinete_id = :gabinete_id",
    "SELECT attachment_url AS url FROM documents WHERE gabinete_id = :gabinete_id",
    "SELECT attachment_url AS url FROM whatsapp_messages WHERE gabinete_id = :gabinete_id",
    "SELECT receipt_file_url AS url FROM finance_entries WHERE gabinete_id = :gabinete_id",
  ];
  if (options.includeStructure) {
    queries.push("SELECT file_url AS url FROM signature_profiles WHERE gabinete_id = :gabinete_id");
  }
  return [
    ...new Set(
      queries
        .flatMap((sql) => db.prepare(sql).all({ gabinete_id: gabineteId }))
        .map((row) => String(row.url || "").trim())
        .filter(Boolean),
    ),
  ];
}

function deletePublicUploadUrls(urls = []) {
  urls.forEach((url) => {
    const value = String(url || "");
    const candidatePaths = [];
    if (value.startsWith("/uploads/")) {
      candidatePaths.push(resolvePersistentUploadPathFromUrl(value));
      candidatePaths.push(resolveLegacyPublicUploadPathFromUrl(value));
    } else if (value.startsWith(`${FINANCE_RECEIPT_URL_PREFIX}/`)) {
      candidatePaths.push(resolveFinanceReceiptPathFromUrl(value));
    }
    candidatePaths
      .filter(Boolean)
      .forEach((targetPath) => {
        if (!existsSync(targetPath)) return;
        try {
          unlinkSync(targetPath);
        } catch {}
      });
  });
}

function getImportPreview(gabineteId, importId) {
  const importRecord = db
    .prepare("SELECT * FROM imports WHERE gabinete_id = :gabinete_id AND id = :id")
    .get({ gabinete_id: gabineteId, id: importId });
  if (!importRecord) return null;
  const payload = JSON.parse(importRecord.summary_json || "{}");
  const labels = {
    ticket_number: "Nº do atendimento",
    opened_at: "Abertura",
    channel: "Canal",
    status: "Status",
    name: "Nome",
    phone: "Telefone",
    whatsapp: "WhatsApp",
    demand_title: "Demanda",
    description: "Descrição",
    guidance: "Orientacao / Andamento",
    result: "Fechamento / Resolucao",
    assigned_user: "Atendente",
    birth_date: "DN",
    cpf_rg_cns: "CPF/CNPJ",
    email: "E-mail",
    profession: "Profissao",
    address: "Endereco",
    number: "Numero",
    neighborhood: "Bairro",
    zip_code: "CEP",
    city: "Cidade",
    uf: "UF",
    closed_at: "Data de fechamento",
  };
  return {
    import: importRecord,
    columns: payload.columns || [],
    rows: (payload.rows || []).slice(0, 5),
    mapping: payload.mapping || {},
    fields: importFields().map((name) => ({ name, label: labels[name] || name })),
  };
}

function listNotifications(gabineteId, user) {
  const rows = db.prepare(
    `
      SELECT *
      FROM notifications
      WHERE gabinete_id = :gabinete_id AND user_id = :user_id
      ORDER BY is_read, created_at DESC
    `,
  ).all({
    gabinete_id: gabineteId,
    user_id: user.id,
  });
  return compactNotificationRows(rows);
}

function compactNotificationRows(rows) {
  const compactKinds = new Set(["task_overdue", "ticket_due", "document_due", "birthday_notice"]);
  const seen = new Set();
  return rows.filter((row) => {
    if (!compactKinds.has(row.kind)) return true;
    const key = `${row.kind}:${row.entity_type}:${row.entity_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function listAuditEntries(gabineteId) {
  return db
    .prepare(
      `
        SELECT a.*, u.name AS user_name
        FROM audit_log a
        LEFT JOIN users u ON u.id = a.user_id AND (u.gabinete_id = a.gabinete_id OR u.role = 'super_admin')
        WHERE a.gabinete_id = :gabinete_id OR (:gabinete_id IS NULL AND a.gabinete_id IS NULL)
        ORDER BY a.created_at DESC
        LIMIT 200
      `,
    )
    .all({ gabinete_id: gabineteId });
}

function unreadNotificationsCount(gabineteId, user) {
  if (!user || !gabineteId) return 0;
  return db
    .prepare("SELECT COUNT(*) AS total FROM notifications WHERE gabinete_id = :gabinete_id AND user_id = :user_id AND is_read = 0")
    .get({ gabinete_id: gabineteId, user_id: user.id }).total;
}

function getTicketAssignee(gabineteId, ticketId) {
  return db
    .prepare("SELECT assigned_user_id FROM tickets WHERE gabinete_id = :gabinete_id AND id = :id")
    .get({ gabinete_id: gabineteId, id: ticketId })?.assigned_user_id ?? null;
}

function createNotificationForEntity(gabineteId, userId, payload) {
  if (!userId) return;
  if (!scopedReferenceId(gabineteId, "users", userId)) return;
  const suppressAfterReadKinds = new Set(["task_overdue", "ticket_due", "document_due"]);
  const seasonalSuppressKinds = new Set(["birthday_notice"]);
  const duplicateReadClause = suppressAfterReadKinds.has(payload.kind)
    ? ""
    : seasonalSuppressKinds.has(payload.kind)
      ? "AND created_at >= :created_since"
      : "AND is_read = 0";
  const duplicateParams = {
    gabinete_id: gabineteId,
    user_id: userId,
    kind: payload.kind,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
  };
  if (seasonalSuppressKinds.has(payload.kind)) {
    duplicateParams.created_since = addDays(currentDate(), -30);
  }
  const exists = db
    .prepare(
      `
        SELECT id
        FROM notifications
        WHERE gabinete_id = :gabinete_id
          AND user_id = :user_id
          AND kind = :kind
          AND entity_type = :entity_type
          AND entity_id = :entity_id
          ${duplicateReadClause}
        LIMIT 1
      `,
    )
    .get(duplicateParams);

  if (exists) return;

  db.prepare(
    `
      INSERT INTO notifications (
        gabinete_id, user_id, title, message, kind, entity_type, entity_id, is_read, created_at
      ) VALUES (
        :gabinete_id, :user_id, :title, :message, :kind, :entity_type, :entity_id, 0, :created_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    user_id: userId,
    title: payload.title,
    message: payload.message,
    kind: payload.kind,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id ?? null,
    created_at: nowIso(),
  });
}

function syncOperationalNotifications(gabineteId) {
  const gabineteDefaults = getGabineteDefaults(gabineteId);
  const overdueTasks = db
    .prepare(
      `
        SELECT id, title, responsible_id
        FROM tasks
        WHERE gabinete_id = :gabinete_id
          AND due_at < :now
          AND status NOT IN ('Concluida', 'Arquivada', 'Cancelada')
          AND responsible_id IS NOT NULL
      `,
    )
    .all({ gabinete_id: gabineteId, now: new Date().toISOString() });
  overdueTasks.forEach((task) => {
    createNotificationForEntity(gabineteId, task.responsible_id, {
      title: "Tarefa atrasada",
      message: `A tarefa "${task.title}" esta atrasada e precisa de atualizacao.`,
      kind: "task_overdue",
      entity_type: "task",
      entity_id: task.id,
    });
  });

  const staleTickets = db
    .prepare(
      `
        SELECT id, number, assigned_user_id
        FROM tickets
        WHERE gabinete_id = :gabinete_id
          AND (closed_at IS NULL OR closed_at = '')
          AND assigned_user_id IS NOT NULL
          AND next_action_date <> ''
          AND next_action_date <= :today
      `,
    )
    .all({ gabinete_id: gabineteId, today: currentDate() });
  staleTickets.forEach((ticket) => {
    createNotificationForEntity(gabineteId, ticket.assigned_user_id, {
      title: "Prazo de atendimento vencendo",
      message: `O atendimento ${ticket.number} exige retorno ou atualizacao.`,
      kind: "ticket_due",
      entity_type: "ticket",
      entity_id: ticket.id,
    });
  });

  const dueDocuments = db
    .prepare(
      `
        SELECT id, internal_number, created_by
        FROM documents
        WHERE gabinete_id = :gabinete_id
          AND legal_due_date <> ''
          AND legal_due_date <= :limit_date
          AND status NOT IN ('Concluido', 'Arquivado')
          AND created_by IS NOT NULL
      `,
    )
    .all({
      gabinete_id: gabineteId,
      limit_date: addDays(currentDate(), 3),
    });
  dueDocuments.forEach((document) => {
    createNotificationForEntity(gabineteId, document.created_by, {
      title: "Documento proximo do vencimento",
      message: `O documento ${document.internal_number} esta proximo do prazo limite.`,
      kind: "document_due",
      entity_type: "document",
      entity_id: document.id,
    });
  });

  const birthdayNoticeDays = parseInteger(gabineteDefaults.default_birthday_notice_days, 7);
  if (birthdayNoticeDays >= 0) {
    const users = db
      .prepare(
        `
          SELECT id
          FROM users
          WHERE gabinete_id = :gabinete_id AND status = 'active'
        `,
      )
      .all({ gabinete_id: gabineteId });
    const birthdays = buildBirthdaySummary(gabineteId, currentDate()).week.filter(
      (item) => item.days_until >= 0 && item.days_until <= birthdayNoticeDays,
    );
    birthdays.forEach((contact) => {
      users.forEach((user) => {
        createNotificationForEntity(gabineteId, user.id, {
          title: contact.days_until === 0 ? "Aniversario hoje" : "Aniversario proximo",
          message:
            contact.days_until === 0
              ? `${contact.name} faz aniversario hoje. Vale lembrar do retorno do gabinete.`
              : `${contact.name} faz aniversario em ${contact.days_until} dia${contact.days_until === 1 ? "" : "s"}.`,
          kind: "birthday_notice",
          entity_type: "contact",
          entity_id: contact.id,
        });
      });
    });
  }
}

function logAudit(gabineteId, userId, action, entityType, entityId, previousData, newData) {
  db.prepare(
    `
      INSERT INTO audit_log (
        gabinete_id, user_id, action, entity_type, entity_id, previous_data, new_data, created_at
      ) VALUES (
        :gabinete_id, :user_id, :action, :entity_type, :entity_id, :previous_data, :new_data, :created_at
      )
    `,
  ).run({
    gabinete_id: gabineteId ?? null,
    user_id: userId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    previous_data: previousData ? JSON.stringify(previousData) : "",
    new_data: newData ? JSON.stringify(newData) : "",
    created_at: nowIso(),
  });
}

function buildImportTemplateRows() {
  return [
    {
      name: "Marina Duarte",
      contact_type: "person",
      segment: "municipe",
      phone: "19991234567",
      whatsapp: "19991234567",
      cpf_rg_cns: "12345678900",
      birth_date: "1988-07-12",
      email: "marina.duarte@email.com",
      profession: "Comerciante",
      demand_title: "Iluminacao publica em rua escura",
      description: "Poste apagado ha varios dias em frente ao numero 250.",
      guidance: "Moradora pediu retorno por WhatsApp assim que houver vistoria.",
      assigned_user: "Equipe de atendimento",
      address: "Rua das Acacias",
      number: "250",
      neighborhood: "Jardim Europa",
      zip_code: "13500-000",
      city: "Rio Claro",
      uf: "SP",
      opened_at: currentDate(),
      status: "Aberto",
    },
    {
      name: "Padaria Ponto Quente",
      contact_type: "company",
      segment: "apoiador",
      phone: "1933345566",
      whatsapp: "19999887766",
      cpf_rg_cns: "06990590000123",
      birth_date: "",
      email: "contato@pontoquente.com.br",
      profession: "Panificadora",
      demand_title: "Tapa-buraco em cruzamento",
      description: "Buraco profundo em esquina com fluxo de onibus e clientes da regiao.",
      guidance: "Solicitacao urgente por risco de acidente e prejuizo no acesso.",
      assigned_user: "Equipe externa",
      address: "Avenida Brasil",
      number: "980",
      neighborhood: "Centro",
      zip_code: "01001-000",
      city: "Sao Paulo",
      uf: "SP",
      opened_at: currentDate(),
      status: "Aguardando servico",
    },
  ];
}

async function fetchRemoteJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
      body: options.body,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRemoteText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: options.accept || "text/html,application/xhtml+xml",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) return "";
    return response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUf(value) {
  return String(value ?? "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
}

function normalizePlainText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCep(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

function formatCep(value) {
  const digits = normalizeCep(value);
  if (digits.length !== 8) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalizeBirthDate(value) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeLooseDate(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const brMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  return toInputDate(normalized);
}

function buildPhoneNumber(ddd, phone) {
  const digits = `${ddd ?? ""}${phone ?? ""}`.replace(/\D/g, "");
  return digits ? formatPhone(digits) : "";
}

function collectSearchParams(url, keys) {
  const params = {};
  keys.forEach((key) => {
    const value = url.searchParams.get(key);
    if (value !== null && String(value).trim() !== "") {
      params[key] = String(value).trim();
    }
  });
  return params;
}

function listLookupOptions(kind) {
  const items = LOOKUP_PROVIDER_CATALOG[kind] || [];
  return items.filter((item) => item.key === "auto" || item.configured);
}

function hasConfiguredLookupProvider(kind) {
  return listLookupOptions(kind).some((item) => item.key !== "auto");
}

function normalizeLookupProvider(kind, provider) {
  const normalized = String(provider ?? "auto").trim().toLowerCase() || "auto";
  const options = listLookupOptions(kind);
  return options.some((item) => item.key === normalized) ? normalized : "auto";
}

function getLookupPreferenceRows(gabineteId, userId) {
  return db.prepare(
    `
      SELECT lookup_kind, preferred_provider
      FROM lookup_preferences
      WHERE gabinete_id = :gabinete_id AND user_id = :user_id
    `,
  ).all({
    gabinete_id: gabineteId,
    user_id: userId,
  });
}

function getLookupPreferences(gabineteId, userId) {
  const rowMap = new Map(
    getLookupPreferenceRows(gabineteId, userId).map((item) => [item.lookup_kind, item.preferred_provider]),
  );
  return Object.fromEntries(
    Object.keys(LOOKUP_PROVIDER_CATALOG).map((kind) => {
      const preferredProvider = normalizeLookupProvider(kind, rowMap.get(kind) || "auto");
      return [
        kind,
        {
          preferred_provider: preferredProvider,
          options: listLookupOptions(kind),
          automatic_sources: LOOKUP_AUTO_ORDER[kind]
            .map((providerKey) => listLookupOptions(kind).find((item) => item.key === providerKey))
            .filter(Boolean)
            .map((item) => item.label),
        },
      ];
    }),
  );
}

function saveLookupPreference(gabineteId, userId, kind, provider) {
  const preferredProvider = normalizeLookupProvider(kind, provider);
  const timestamp = nowIso();
  db.prepare(
    `
      INSERT INTO lookup_preferences (
        gabinete_id, user_id, lookup_kind, preferred_provider, created_at, updated_at
      ) VALUES (
        :gabinete_id, :user_id, :lookup_kind, :preferred_provider, :created_at, :updated_at
      )
      ON CONFLICT(gabinete_id, user_id, lookup_kind) DO UPDATE SET
        preferred_provider = excluded.preferred_provider,
        updated_at = excluded.updated_at
    `,
  ).run({
    gabinete_id: gabineteId,
    user_id: userId,
    lookup_kind: kind,
    preferred_provider: preferredProvider,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return preferredProvider;
}

function resolveLookupProvider(gabineteId, userId, kind, requestedProvider) {
  const requested = String(requestedProvider ?? "").trim().toLowerCase();
  if (requested) {
    return normalizeLookupProvider(kind, requested);
  }
  return getLookupPreferences(gabineteId, userId)[kind]?.preferred_provider || "auto";
}

function buildLookupProviderStatus(gabineteId, userId) {
  const kinds = getLookupPreferences(gabineteId, userId);
  return {
    kinds,
    normalized: Object.fromEntries(
      Object.entries(kinds).map(([kind, data]) => [kind, data.automatic_sources]),
    ),
    raw: {
      consultario: {
        configured: Boolean(CONSULTARIO_TOKEN),
        resources: Object.keys(CONSULTARIO_RAW_RESOURCES),
      },
      invertexto: {
        configured: Boolean(INVERTEXTO_TOKEN),
        resources: Object.keys(INVERTEXTO_RAW_RESOURCES),
      },
      receitaws: {
        configured: Boolean(RECEITAWS_TOKEN),
        resources: ["cnpj"],
      },
      cnpjbiz: {
        configured: Boolean(CNPJBIZ_TOKEN),
        resources: [],
        status: "aguardando mapeamento de endpoint oficial",
      },
      cnpja: {
        configured: true,
        resources: ["cnpj"],
      },
    },
  };
}

async function fetchConsultarIoJson(pathname, params = {}) {
  if (!CONSULTARIO_TOKEN) return null;
  const url = new URL(`${CONSULTARIO_BASE_URL}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value).trim());
    }
  });
  return fetchRemoteJson(url.toString(), {
    headers: {
      Authorization: `Token ${CONSULTARIO_TOKEN}`,
    },
    timeoutMs: 7000,
  });
}

async function fetchInvertextoJson(pathname, params = {}) {
  if (!INVERTEXTO_TOKEN) return null;
  const url = new URL(`${INVERTEXTO_BASE_URL}${pathname}`);
  url.searchParams.set("token", INVERTEXTO_TOKEN);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value).trim());
    }
  });
  return fetchRemoteJson(url.toString(), { timeoutMs: 7000 });
}

async function fetchReceitaWsCnpj(rawCnpj) {
  const cnpj = String(rawCnpj ?? "").replace(/\D/g, "").slice(0, 14);
  if (cnpj.length !== 14 || !RECEITAWS_TOKEN) return null;
  const url = new URL(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`);
  url.searchParams.set("token", RECEITAWS_TOKEN);
  return fetchRemoteJson(url.toString(), { timeoutMs: 7000 });
}

async function lookupCnpjaOffice(rawCnpj) {
  const cnpj = String(rawCnpj ?? "").replace(/\D/g, "").slice(0, 14);
  if (cnpj.length !== 14) return null;
  return fetchRemoteJson(`https://open.cnpja.com/office/${cnpj}`, {
    timeoutMs: 7000,
  });
}

async function listBrazilUfs() {
  if (LOOKUP_CACHE.ufs) return LOOKUP_CACHE.ufs;
  const payload = await fetchRemoteJson("https://brasilapi.com.br/api/ibge/uf/v1");
  LOOKUP_CACHE.ufs = Array.isArray(payload) && payload.length
    ? payload.map((item) => ({
        sigla: item.sigla,
        nome: item.nome,
      }))
    : BR_UFS_FALLBACK;
  return LOOKUP_CACHE.ufs;
}

async function listMunicipalitiesByUf(uf) {
  const normalizedUf = normalizeUf(uf);
  if (!normalizedUf) return [];
  if (LOOKUP_CACHE.municipalities.has(normalizedUf)) {
    return LOOKUP_CACHE.municipalities.get(normalizedUf);
  }
  const payload = await fetchRemoteJson(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${normalizedUf}/municipios`,
  );
  let items = Array.isArray(payload)
    ? payload.map((item) => ({
        ibge: String(item.id || ""),
        nome: item.nome,
      }))
    : [];

  if (!items.length) {
    const fallback = await fetchRemoteJson(
      `https://brasilapi.com.br/api/ibge/municipios/v1/${normalizedUf}`,
    );
    items = Array.isArray(fallback)
      ? fallback.map((item) => ({
          ibge: "",
          nome: item.nome,
        }))
      : [];
  }
  LOOKUP_CACHE.municipalities.set(normalizedUf, items);
  return items;
}

async function resolveMunicipalityByName(uf, cityName) {
  const normalizedUf = normalizeUf(uf);
  const normalizedCity = normalizePlainText(cityName);
  if (!normalizedUf || !normalizedCity) {
    return null;
  }

  const items = await listMunicipalitiesByUf(normalizedUf);
  const exact = items.find((item) => normalizePlainText(item.nome) === normalizedCity);
  if (exact) {
    return {
      ibge: exact.ibge || "",
      nome: exact.nome,
      uf: normalizedUf,
    };
  }

  const loose = items.find((item) => normalizePlainText(item.nome).includes(normalizedCity));
  if (!loose) return null;

  return {
    ibge: loose.ibge || "",
    nome: loose.nome,
    uf: normalizedUf,
  };
}

async function resolveGabineteLocationPayload(input = {}) {
  const rawUf = normalizeUf(input.uf || "");
  const rawCity = String(input.city || "").trim();
  const fallbackCityIbge = String(input.city_ibge || "").trim();
  const municipality = await resolveMunicipalityByName(rawUf, rawCity);

  return {
    city: municipality?.nome || rawCity,
    city_ibge: municipality?.ibge || fallbackCityIbge,
    uf: municipality?.uf || rawUf,
  };
}

async function lookupCepViaBrasilApi(cep) {
  const payload = await fetchRemoteJson(`https://brasilapi.com.br/api/cep/v1/${cep}`);
  if (!payload?.cep) return null;
  return {
    source: "BrasilAPI",
    cep: formatCep(payload.cep),
    address: payload.street || "",
    neighborhood: payload.neighborhood || "",
    city: payload.city || "",
    uf: payload.state || "",
    service: payload.service || "brasilapi",
  };
}

async function lookupCepViaOpenCep(cep) {
  const payload = await fetchRemoteJson(`https://opencep.com/v1/${cep}.json`);
  if (!payload?.cep) return null;
  return {
    source: "OpenCEP",
    cep: payload.cep,
    address: payload.logradouro || "",
    neighborhood: payload.bairro || "",
    city: payload.localidade || "",
    uf: payload.uf || "",
    service: "opencep",
  };
}

async function lookupCepViaAwesomeApi(cep) {
  const payload = await fetchRemoteJson(`https://cep.awesomeapi.com.br/json/${cep}`);
  if (!payload?.cep) return null;
  return {
    source: "AwesomeAPI",
    cep: formatCep(payload.cep),
    address: payload.address || "",
    neighborhood: payload.district || "",
    city: payload.city || "",
    uf: payload.state || "",
    service: "awesomeapi",
  };
}

async function lookupCepViaConsultarIo(cep) {
  const payload = await fetchConsultarIoJson("/v2/cep/consultar", { cep });
  if (!payload?.cep) return null;
  return {
    source: "Consultar.IO",
    cep: payload.cep_formatado || formatCep(payload.cep),
    address: payload.logradouro || "",
    neighborhood: payload.bairro || "",
    city: payload.localidade || "",
    uf: payload.uf || "",
    service: "consultario",
  };
}

async function lookupCepByProvider(cep, provider) {
  switch (provider) {
    case "brasilapi":
      return lookupCepViaBrasilApi(cep);
    case "opencep":
      return lookupCepViaOpenCep(cep);
    case "awesomeapi":
      return lookupCepViaAwesomeApi(cep);
    case "consultario":
      return lookupCepViaConsultarIo(cep);
    default:
      return null;
  }
}

async function lookupCepData(rawCep, provider = "auto") {
  const cep = normalizeCep(rawCep);
  if (cep.length !== 8) return null;
  const normalizedProvider = normalizeLookupProvider("cep", provider);
  const cacheKey = `${normalizedProvider}:${cep}`;
  if (LOOKUP_CACHE.cep.has(cacheKey)) return LOOKUP_CACHE.cep.get(cacheKey);

  const providers = normalizedProvider === "auto"
    ? LOOKUP_AUTO_ORDER.cep.filter((item) => normalizeLookupProvider("cep", item) !== "auto")
    : [normalizedProvider];

  for (const item of providers) {
    const result = await lookupCepByProvider(cep, item);
    if (result) {
      LOOKUP_CACHE.cep.set(cacheKey, result);
      return result;
    }
  }
  return null;
}

async function lookupCnpjViaBrasilApi(cnpj) {
  const payload = await fetchRemoteJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!payload?.cnpj) return null;
  return {
    source: "BrasilAPI",
    cnpj: payload.cnpj,
    razao_social: payload.razao_social || "",
    nome_fantasia: payload.nome_fantasia || "",
    email: payload.email || "",
    telefone: formatPhone(payload.ddd_telefone_1 || payload.ddd_telefone_2 || ""),
    cep: formatCep(payload.cep || ""),
    address: [payload.descricao_tipo_de_logradouro, payload.logradouro, payload.numero]
      .filter(Boolean)
      .join(" "),
    neighborhood: payload.bairro || "",
    city: payload.municipio || "",
    uf: payload.uf || "",
    situacao: payload.descricao_situacao_cadastral || "",
    atividade_principal: payload.cnae_fiscal_descricao || "",
    foundation_date: normalizeLooseDate(payload.data_inicio_atividade || payload.inicio_atividade),
    employee_count: nullableInt(payload.employee_count || payload.quantidade_funcionarios),
  };
}

async function lookupCnpjViaCnpja(cnpj) {
  const payload = await lookupCnpjaOffice(cnpj);
  if (!payload?.taxId && !payload?.company?.name) return null;
  return {
    source: "CNPJa",
    cnpj: payload.taxId || cnpj,
    razao_social: payload.company?.name || "",
    nome_fantasia: payload.alias || "",
    email: Array.isArray(payload.emails) && payload.emails.length ? payload.emails[0].address || "" : "",
    telefone: Array.isArray(payload.phones) && payload.phones.length
      ? buildPhoneNumber(payload.phones[0].area, payload.phones[0].number)
      : "",
    cep: formatCep(payload.address?.zip || ""),
    address: [payload.address?.street, payload.address?.number].filter(Boolean).join(" "),
    neighborhood: payload.address?.district || "",
    city: payload.address?.city || "",
    uf: payload.address?.state || "",
    situacao: payload.status?.text || "",
    atividade_principal: payload.mainActivity?.text || "",
    foundation_date: normalizeLooseDate(
      payload.company?.founded || payload.founded || payload.opened_on || payload.foundingDate,
    ),
    employee_count: nullableInt(
      payload.company?.employees || payload.employee_count || payload.quantidade_funcionarios,
    ),
  };
}

async function lookupCnpjViaCnpjWs(cnpj) {
  const payload = await fetchRemoteJson(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
    timeoutMs: 7000,
  });
  if (!payload?.estabelecimento?.cnpj && !payload?.razao_social) return null;
  const establishment = payload.estabelecimento || {};
  return {
    source: "CNPJ.ws",
    cnpj: establishment.cnpj || cnpj,
    razao_social: payload.razao_social || "",
    nome_fantasia: establishment.nome_fantasia || "",
    email: establishment.email || "",
    telefone: buildPhoneNumber(establishment.ddd1, establishment.telefone1)
      || buildPhoneNumber(establishment.ddd2, establishment.telefone2),
    cep: formatCep(establishment.cep || ""),
    address: [establishment.tipo_logradouro, establishment.logradouro, establishment.numero]
      .filter(Boolean)
      .join(" "),
    neighborhood: establishment.bairro || "",
    city: establishment.cidade?.nome || "",
    uf: establishment.estado?.sigla || "",
    situacao: establishment.situacao_cadastral || "",
    atividade_principal: establishment.atividade_principal?.descricao || "",
    foundation_date: normalizeLooseDate(
      establishment.data_inicio_atividade || payload.data_inicio_atividade,
    ),
    employee_count: nullableInt(
      establishment.employee_count || payload.employee_count || payload.quantidade_funcionarios,
    ),
  };
}

async function lookupCnpjViaReceitaWs(cnpj) {
  const payload = await fetchReceitaWsCnpj(cnpj);
  if (!payload?.nome && !payload?.cnpj) return null;
  return {
    source: "ReceitaWS",
    cnpj: payload.cnpj || cnpj,
    razao_social: payload.nome || "",
    nome_fantasia: payload.fantasia || "",
    email: payload.email || "",
    telefone: formatPhone(payload.telefone || ""),
    cep: formatCep(payload.cep || ""),
    address: [payload.logradouro, payload.numero].filter(Boolean).join(" "),
    neighborhood: payload.bairro || "",
    city: payload.municipio || "",
    uf: payload.uf || "",
    situacao: payload.situacao || "",
    atividade_principal: Array.isArray(payload.atividade_principal)
      ? payload.atividade_principal[0]?.text || ""
      : "",
    foundation_date: normalizeLooseDate(payload.abertura || payload.data_inicio_atividade),
    employee_count: nullableInt(payload.employee_count || payload.quantidade_funcionarios),
  };
}

async function lookupCnpjViaConsultarIo(cnpj) {
  const payload = await fetchConsultarIoJson("/v1/cnpj/consultar", { cnpj });
  if (!payload?.cnpj) return null;
  return {
    source: "Consultar.IO",
    cnpj: payload.cnpj,
    razao_social: payload.razao_social || "",
    nome_fantasia: payload.nome_fantasia || "",
    email: payload.email || "",
    telefone: buildPhoneNumber(payload.ddd1, payload.telefone1)
      || buildPhoneNumber(payload.ddd2, payload.telefone2),
    cep: formatCep(payload.cep || ""),
    address: [payload.tipo_logradouro, payload.logradouro, payload.numero]
      .filter(Boolean)
      .join(" "),
    neighborhood: payload.bairro || "",
    city: payload.municipio_descricao || "",
    uf: payload.uf || "",
    situacao: payload.situacao_cadastral_descricao || "",
    atividade_principal: payload.cnae_principal_descricao || "",
    foundation_date: normalizeLooseDate(
      payload.data_inicio_atividade || payload.abertura || payload.foundation_date,
    ),
    employee_count: nullableInt(payload.employee_count || payload.quantidade_funcionarios),
  };
}

async function lookupCnpjByProvider(cnpj, provider) {
  switch (provider) {
    case "brasilapi":
      return lookupCnpjViaBrasilApi(cnpj);
    case "cnpja":
      return lookupCnpjViaCnpja(cnpj);
    case "cnpjws":
      return lookupCnpjViaCnpjWs(cnpj);
    case "receitaws":
      return lookupCnpjViaReceitaWs(cnpj);
    case "consultario":
      return lookupCnpjViaConsultarIo(cnpj);
    default:
      return null;
  }
}

async function lookupCnpjData(rawCnpj, provider = "auto") {
  const cnpj = String(rawCnpj ?? "").replace(/\D/g, "").slice(0, 14);
  if (cnpj.length !== 14) return null;
  const normalizedProvider = normalizeLookupProvider("cnpj", provider);
  const cacheKey = `${normalizedProvider}:${cnpj}`;
  if (LOOKUP_CACHE.cnpj.has(cacheKey)) return LOOKUP_CACHE.cnpj.get(cacheKey);

  const providers = normalizedProvider === "auto"
    ? LOOKUP_AUTO_ORDER.cnpj.filter((item) => normalizeLookupProvider("cnpj", item) !== "auto")
    : [normalizedProvider];

  for (const item of providers) {
    const result = await lookupCnpjByProvider(cnpj, item);
    if (result) {
      LOOKUP_CACHE.cnpj.set(cacheKey, result);
      return result;
    }
  }
  return null;
}

async function lookupCpfViaConsultarIo(cpf, birthDate) {
  const payload = await fetchConsultarIoJson("/v1/cpf/consultar", {
    cpf,
    data_nascimento: birthDate,
  });
  if (!payload?.cpf) return null;
  return {
    source: "Consultar.IO",
    cpf: payload.cpf,
    name: payload.nome || "",
    birth_date: payload.data_nascimento || birthDate,
    situation: payload.situacao || "",
    issued_at: [payload.data_emissao, payload.hora_emissao].filter(Boolean).join(" "),
    qr_code_url: payload.qrcode_url || "",
  };
}

async function lookupCpfByProvider(cpf, birthDate, provider) {
  switch (provider) {
    case "consultario":
      return lookupCpfViaConsultarIo(cpf, birthDate);
    default:
      return null;
  }
}

async function lookupCpfData(rawCpf, rawBirthDate, provider = "auto") {
  const cpf = String(rawCpf ?? "").replace(/\D/g, "").slice(0, 11);
  const birthDate = normalizeBirthDate(rawBirthDate);
  if (cpf.length !== 11 || !birthDate) return null;
  const normalizedProvider = normalizeLookupProvider("cpf", provider);
  const cacheKey = `${normalizedProvider}:${cpf}:${birthDate}`;
  if (LOOKUP_CACHE.cpf.has(cacheKey)) return LOOKUP_CACHE.cpf.get(cacheKey);

  const providers = normalizedProvider === "auto"
    ? LOOKUP_AUTO_ORDER.cpf.filter((item) => normalizeLookupProvider("cpf", item) !== "auto")
    : [normalizedProvider];

  for (const item of providers) {
    const result = await lookupCpfByProvider(cpf, birthDate, item);
    if (result) {
      LOOKUP_CACHE.cpf.set(cacheKey, result);
      return result;
    }
  }
  return null;
}

function sendCsv(res, filename, rows, columns) {
  const header = columns.map(([label]) => label).join(",");
  const body = rows
    .map((row) => columns.map(([, key]) => csvEscape(row[key])).join(","))
    .join("\n");
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  res.end(`${header}\n${body}`);
}

function csvEscape(value) {
  const normalized = String(value ?? "");
  if (normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}

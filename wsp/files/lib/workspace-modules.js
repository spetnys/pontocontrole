export const WORKSPACE_MODULE_KEYS = [
  "dashboard",
  "tickets",
  "contacts",
  "notes",
  "tasks",
  "whatsapp",
  "documents",
  "projects",
  "files",
  "finance",
];
export const MAIN_WORKSPACE_MODULE_KEYS = [
  "dashboard",
  "tickets",
  "contacts",
  "tasks",
  "notes",
  "whatsapp",
  "files",
];
export const DEFAULT_WORKSPACE_MODULE_ORDER = [
  ...MAIN_WORKSPACE_MODULE_KEYS,
  "documents",
  "projects",
  "finance",
];

export const WORKSPACE_MODULE_DEFINITIONS = [
  {
    key: "dashboard",
    href: "/dashboard",
    section: "operacao",
    label: "Dashboard",
    description: "Resumo do dia, feriados, lembretes e sinais principais.",
  },
  {
    key: "tickets",
    href: "/atendimentos",
    section: "operacao",
    label: "Atendimentos",
    description: "Entrada principal das demandas e retornos da equipe.",
  },
  {
    key: "contacts",
    href: "/contatos",
    section: "operacao",
    label: "Contatos",
    description: "Base de pessoas, entidades e historico de relacionamento.",
  },
  {
    key: "notes",
    href: "/postit",
    section: "operacao",
    label: "Post-it",
    description: "Lembretes soltos, ideias rapidas e recados simples.",
  },
  {
    key: "tasks",
    href: "/tarefas",
    section: "operacao",
    label: "Tarefas",
    description: "Pendencias, prazos e responsaveis da rotina.",
  },
  {
    key: "whatsapp",
    href: "/whatsapp-crm",
    section: "operacao",
    label: "WhatsApp",
    description: "Conectar a linha, acompanhar conversas e responder por dentro do gabinete.",
    onboarding_label: "Usar WhatsApp no gabinete",
  },
  {
    key: "documents",
    href: "/documentos",
    section: "institucional",
    label: "Documentos",
    ouvidoria_label: "Protocolos",
    description: "Ofícios, protocolos, requerimentos, indicações, moções, projetos e respostas formais.",
    ouvidoria_description: "Centralizar protocolos, encaminhamentos e respostas formais da ouvidoria.",
    onboarding_label: "Controlar ofícios, protocolos e requerimentos",
  },
  {
    key: "projects",
    href: "/atuacao",
    section: "institucional",
    label: "Atuação",
    description: "Siscam, SAPL e outros portais legislativos ligados ao mandato.",
    onboarding_label: "Acompanhar atuação legislativa",
  },
  {
    key: "files",
    href: "/arquivos",
    section: "institucional",
    label: "Arquivos",
    description: "Espaço do gabinete para anexos, documentos de apoio e integração com Nextcloud.",
    onboarding_label: "Organizar arquivos do gabinete",
  },
  {
    key: "finance",
    href: "/financeiro",
    section: "institucional",
    label: "Financeiro",
    description: "Controlar entradas, saídas e saldo operacional do gabinete.",
    onboarding_label: "Controlar entradas e saídas",
  },
];

export function isOuvidoriaWorkspaceProfile(type) {
  return /ouvidoria/i.test(String(type || ""));
}

export function buildDefaultWorkspaceModuleConfig(type) {
  const base = {
    dashboard: true,
    tickets: true,
    contacts: true,
    notes: true,
    tasks: true,
    whatsapp: true,
    finance: false,
    documents: false,
    projects: false,
    files: true,
    order: [...DEFAULT_WORKSPACE_MODULE_ORDER],
  };

  if (isOuvidoriaWorkspaceProfile(type)) {
    return {
      ...base,
      finance: false,
      projects: false,
    };
  }

  return base;
}

export function normalizeWorkspaceModuleOrder(source) {
  const rawOrder = Array.isArray(source?.order) ? source.order : DEFAULT_WORKSPACE_MODULE_ORDER;
  const seen = new Set();
  const order = rawOrder.filter((key) => {
    if (!WORKSPACE_MODULE_KEYS.includes(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  WORKSPACE_MODULE_KEYS.forEach((key) => {
    if (!seen.has(key)) order.push(key);
  });
  return order;
}

export function normalizeWorkspaceModuleConfig(value, type) {
  const defaults = buildDefaultWorkspaceModuleConfig(type);
  const source = typeof value === "string" ? safeParseWorkspaceModuleConfig(value) : value;

  if (!source || typeof source !== "object") {
    return defaults;
  }

  return WORKSPACE_MODULE_KEYS.reduce((accumulator, key) => {
    if (typeof source[key] === "boolean") {
      accumulator[key] = source[key];
    }
    return accumulator;
  }, { ...defaults, order: normalizeWorkspaceModuleOrder(source) });
}

export function getWorkspaceModuleDefinition(key, type) {
  const definition = WORKSPACE_MODULE_DEFINITIONS.find((item) => item.key === key);
  if (!definition) return null;

  if (definition.key === "documents" && isOuvidoriaWorkspaceProfile(type)) {
    return {
      ...definition,
      label: definition.ouvidoria_label || definition.label,
      description: definition.ouvidoria_description || definition.description,
    };
  }

  return definition;
}

function safeParseWorkspaceModuleConfig(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

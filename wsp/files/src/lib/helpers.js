export function nowIso() {
  return new Date().toISOString();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "gabinete";
}

export function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function phoneLookupCandidates(value) {
  const digits = normalizePhone(value);
  const candidates = new Set();
  const add = (item) => {
    const normalized = normalizePhone(item);
    if (normalized) candidates.add(normalized);
  };

  add(digits);

  const local = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
  add(local);

  if (local.length === 10) {
    add(`${local.slice(0, 2)}9${local.slice(2)}`);
  }

  if (local.length === 11 && local[2] === "9") {
    add(`${local.slice(0, 2)}${local.slice(3)}`);
    add(`${local.slice(0, 2)}9${local.slice(2)}`);
  }

  if (local.length === 12 && local.slice(2, 4) === "99") {
    add(`${local.slice(0, 2)}${local.slice(3)}`);
  }

  return [...candidates];
}

export function inferBrazilianAreaCode(value) {
  const digits = normalizePhone(value);
  if (digits.length === 2) return digits;
  const local = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
  return local.length >= 10 ? local.slice(0, 2) : "";
}

export function normalizeCpf(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidCpf(value) {
  const digits = normalizeCpf(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (base, factor) => {
    let total = 0;
    for (const digit of base) {
      total += Number(digit) * factor;
      factor -= 1;
    }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const first = calcDigit(digits.slice(0, 9), 10);
  const second = calcDigit(digits.slice(0, 10), 11);
  return first === Number(digits[9]) && second === Number(digits[10]);
}

export function isValidCnpj(value) {
  const digits = normalizeCpf(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (base, factors) => {
    const total = base.split("").reduce((sum, digit, index) => sum + Number(digit) * factors[index], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calcDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calcDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(digits[12]) && second === Number(digits[13]);
}

export function getCpfCnpjValidationMessage(value, options = {}) {
  const digits = normalizeCpf(value);
  if (!digits) return "";
  if (digits.length === 11) return isValidCpf(digits) ? "" : "CPF invalido. Revise os numeros informados.";
  if (digits.length === 14) return isValidCnpj(digits) ? "" : "CNPJ invalido. Revise os numeros informados.";
  if (options.allowOtherDocuments) {
    if (digits.length === 12 || digits.length === 13) return "CNPJ incompleto. Revise os numeros informados.";
    return "";
  }
  return "Informe um CPF com 11 numeros ou CNPJ com 14 numeros.";
}

export function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDate(value) {
  if (!value) return "Sem data";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function formatPhone(value) {
  const digits = normalizePhone(value);
  if (!digits) return "Sem telefone";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const local = digits.slice(2);
    if (local.length === 11) {
      return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    }
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export function toInputDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function joinNonEmpty(values, separator = " • ") {
  return values.filter(Boolean).join(separator);
}

export function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.set(key, String(value));
    }
  });
  const result = search.toString();
  return result ? `?${result}` : "";
}

export function daysOpen(openedAt, closedAt) {
  const start = new Date(`${openedAt}T00:00:00Z`);
  const end = closedAt ? new Date(`${closedAt}T00:00:00Z`) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

export function initials(name) {
  return String(name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "G";
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function parseFormArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function pick(obj, keys) {
  return keys.reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {});
}

export function statusTone(status) {
  const map = {
    Novo: "blue",
    "Em analise": "teal",
    "Aguardando retorno": "amber",
    "Aguardando servico": "rose",
    "Oficio encaminhado": "violet",
    "Indicacao / Requerimento": "pink",
    "Aguardando pagamento": "orange",
    Finalizado: "green",
    Cancelado: "slate",
    Rascunho: "slate",
    Protocolado: "blue",
    "Aguardando resposta": "amber",
    Respondido: "teal",
    "Encaminhado ao municipe": "violet",
    Concluido: "green",
    Arquivado: "slate",
    Pendente: "amber",
    "Em andamento": "blue",
    Concluida: "green",
  };

  return map[status] ?? "slate";
}

export function priorityTone(priority) {
  const map = {
    Baixa: "slate",
    Normal: "blue",
    Alta: "amber",
    Urgente: "red",
  };

  return map[priority] ?? "slate";
}

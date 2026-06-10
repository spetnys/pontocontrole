import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function phoneLookupCandidates(value: unknown) {
  const digits = onlyDigits(value);
  const candidates = new Set<string>();
  const add = (item: unknown) => {
    const normalized = onlyDigits(item);
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

  return Array.from(candidates);
}

export function slugify(value: unknown) {
  return (
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "gabinete"
  );
}

export function formatPhoneInput(value: unknown) {
  let digits = onlyDigits(value).slice(0, 13);

  if (!digits) return "";
  if (digits.length > 11 && digits.startsWith("55")) {
    const local = normalizeBrazilianPhoneDisplayDigits(digits.slice(2));
    if (local.length <= 10) {
      return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}${local.length > 6 ? `-${local.slice(6)}` : ""}`;
    }
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}${local.length > 7 ? `-${local.slice(7)}` : ""}`;
  }
  digits = normalizeBrazilianPhoneDisplayDigits(digits);
  if (digits.length <= 10) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatPhoneDisplay(value: unknown) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return formatPhoneInput(digits);
}

function normalizeBrazilianPhoneDisplayDigits(digits: string) {
  if (digits.length === 12 && digits.slice(2, 4) === "99") {
    return `${digits.slice(0, 2)}${digits.slice(3)}`;
  }
  return digits;
}

export function formatCpfCnpjInput(value: unknown) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function formatCepInput(value: unknown) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function isValidCpf(value: unknown) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (base: string, factor: number) => {
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

export function isValidCnpj(value: unknown) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (base: string, factors: number[]) => {
    const total = base.split("").reduce((sum, digit, index) => sum + Number(digit) * factors[index], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calcDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calcDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(digits[12]) && second === Number(digits[13]);
}

export function getCpfCnpjValidationMessage(
  value: unknown,
  options: { allowOtherDocuments?: boolean } = {},
) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  if (digits.length === 11) return isValidCpf(digits) ? "" : "CPF invalido. Revise os numeros informados.";
  if (digits.length === 14) return isValidCnpj(digits) ? "" : "CNPJ invalido. Revise os numeros informados.";
  if (options.allowOtherDocuments) {
    if (digits.length === 12 || digits.length === 13) return "CNPJ incompleto. Revise os numeros informados.";
    return "";
  }
  return "Informe um CPF com 11 numeros ou CNPJ com 14 numeros.";
}

export function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textMatchesSearch(textHaystack: string, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  if (textHaystack.includes(normalizedQuery)) return true;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return tokens.length > 1 && tokens.every((token) => textHaystack.includes(token));
}

export function matchesSearchQuery(
  haystack: { text?: unknown[]; digits?: unknown[]; phoneDigits?: unknown[] },
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);
  const digitQuery = onlyDigits(query);
  if (!normalizedQuery && !digitQuery) return true;

  const textHaystack = (haystack.text || []).map((item) => normalizeSearchText(item)).join(" ");
  const digitHaystack = (haystack.digits || []).map((item) => onlyDigits(item)).filter(Boolean);
  const phoneHaystack = (haystack.phoneDigits || []).flatMap((item) => phoneLookupCandidates(item));
  const digitCandidates = [...digitHaystack, ...phoneHaystack];
  const queryPhoneCandidates = phoneLookupCandidates(query);

  return textMatchesSearch(textHaystack, normalizedQuery)
    || (!!digitQuery && digitCandidates.some((item) => item.includes(digitQuery)))
    || queryPhoneCandidates.some((candidate) => phoneHaystack.includes(candidate));
}

export function buildWhatsAppUrl(value: unknown, message = "") {
  const digits = onlyDigits(value);
  if (!digits) return "";
  const phone = digits.length <= 11 ? `55${digits}` : digits;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${phone}${query}`;
}

export function joinParts(...values: unknown[]) {
  return values.filter(Boolean).join(" · ") || "Nao informado";
}

export function currentDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

export function dayPeriodLabel(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function daysOpen(openedAt: string, closedAt = "") {
  if (!openedAt) return 0;
  const start = new Date(`${openedAt}T00:00:00`);
  const end = closedAt ? new Date(`${closedAt}T00:00:00`) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

export function buildAppPath(path: string, params: Record<string, unknown> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function getNextBirthdayDate(birthDate: string, referenceDate = new Date()) {
  const raw = String(birthDate || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(raw) &&
    !/^--\d{2}-\d{2}$/.test(raw)
  ) {
    return null;
  }
  const month = Number(raw.startsWith("--") ? raw.slice(2, 4) : raw.slice(5, 7));
  const day = Number(raw.startsWith("--") ? raw.slice(5, 7) : raw.slice(8, 10));
  const year = referenceDate.getFullYear();
  let next = new Date(year, month - 1, day);
  next.setHours(0, 0, 0, 0);
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  if (next < today) {
    next = new Date(year + 1, month - 1, day);
    next.setHours(0, 0, 0, 0);
  }
  return next;
}

export function daysUntilBirthday(birthDate: string, referenceDate = new Date()) {
  const nextBirthday = getNextBirthdayDate(birthDate, referenceDate);
  if (!nextBirthday) return Number.POSITIVE_INFINITY;
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  return Math.round((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatCurrencyBRLFromCents(value: unknown) {
  const amount = Number(value || 0) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

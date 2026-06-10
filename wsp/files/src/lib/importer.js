import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { generateTicketCode } from "../db/database.js";
import { isValidCnpj, isValidCpf, normalizeCpf, normalizePhone, nowIso, toInputDate } from "./helpers.js";

const IMPORT_FIELDS = [
  "ticket_number",
  "opened_at",
  "channel",
  "status",
  "contact_type",
  "segment",
  "name",
  "phone",
  "whatsapp",
  "demand_title",
  "description",
  "guidance",
  "result",
  "assigned_user",
  "birth_date",
  "birth_month",
  "birth_day",
  "birth_year",
  "birth_date_precision",
  "cpf_rg_cns",
  "email",
  "profession",
  "company_legal_name",
  "notes",
  "tags",
  "address",
  "number",
  "neighborhood",
  "zip_code",
  "city",
  "uf",
  "closed_at",
];

const HEADER_ALIASES = {
  ticket_number: ["n°", "nº", "numero", "ref. gabinete", "ref gabinete"],
  opened_at: ["abertura", "data abertura", "data de abertura", "data"],
  channel: ["canal", "origem"],
  status: ["status", "situacao"],
  contact_type: ["tipo de contato", "tipo contato", "contact type"],
  segment: ["segmento", "classificacao", "classificação"],
  name: ["nome", "municip", "municipe", "contato", "name", "full name", "given name", "organization 1 - name"],
  phone: ["telefone", "fone", "celular", "phone 1 - value", "phone 2 - value", "phone 3 - value", "mobile phone", "primary phone"],
  whatsapp: ["zap", "whatsapp", "phone 1 - value", "phone 2 - value", "phone 3 - value"],
  demand_title: ["demanda", "titulo", "resumo", "solicitacao"],
  description: ["descricao", "descrição"],
  guidance: ["orientacao", "orientação / andamento", "andamento", "observacao", "obs"],
  result: ["fechamento", "resolucao", "resolução", "resultado", "solucao", "solução"],
  assigned_user: ["atendente", "assessor", "responsavel", "responsável"],
  birth_date: ["dn", "data nascimento", "nascimento", "birthday"],
  birth_month: ["mes aniversario", "mês aniversario", "birth month"],
  birth_day: ["dia aniversario", "birth day"],
  birth_year: ["ano nascimento", "birth year"],
  birth_date_precision: ["precisao nascimento", "birth precision"],
  cpf_rg_cns: ["cpf/rg/cns", "cpf rg cns", "cpf/cnpj", "cpf", "cnpj", "documento"],
  email: ["e-mail", "email", "e-mail 1 - value", "e-mail 2 - value", "email 1 - value", "email 2 - value"],
  profession: ["profissao", "profissão", "occupation", "company"],
  company_legal_name: ["razao social", "razão social", "empresa", "organization name", "organization 1 - name"],
  notes: ["observacoes do contato", "observacoes contato", "contact notes", "gabinete360 observacoes"],
  tags: ["tags", "labels", "etiquetas", "grupos"],
  address: ["endereco", "endereço", "logradouro", "address 1 - street", "address 1 - formatted"],
  number: ["numero endereco", "número", "address 1 - street 2"],
  neighborhood: ["bairro"],
  zip_code: ["cep", "address 1 - postal code", "postal code"],
  city: ["cidade", "cidade/uf", "cidades", "address 1 - city", "city"],
  uf: ["uf", "estado", "address 1 - region", "state"],
  closed_at: ["data fechamento", "data de fechamento", "fechado em", "encerramento"],
};

const BRAZIL_CARRIER_CODES = new Set([
  "12", "14", "15", "16", "17", "21", "23", "25", "26", "31", "32", "34", "35", "36",
  "41", "43", "45", "46", "53", "54", "56", "61", "62", "63", "65", "71", "72", "73",
  "74", "75", "76", "77", "81", "84", "85", "86", "87", "88", "89", "91", "95", "96", "99",
]);

const IDENTITY_REVIEW_MEDIUM_SCORE = 55;
const IDENTITY_REVIEW_STRONG_SCORE = 75;
const IDENTITY_AUTO_SCORE = 95;
const IDENTITY_AMBIGUITY_GAP = 10;

export function parseSpreadsheetFile(filePath, originalName = filePath) {
  const extension = extname(originalName).toLowerCase();

  if (extension === ".csv") {
    const text = readFileSync(filePath, "utf-8");
    return enhanceParsedSpreadsheet(parseCsv(text));
  }

  if (extension === ".xlsx") {
    return enhanceParsedSpreadsheet(parseXlsxWithPython(filePath));
  }

  throw new Error("Formato nao suportado. Use CSV ou XLSX.");
}

const KNOWN_CHANNELS = ["whatsapp", "presencial", "telefone", "e-mail", "email", "rede social", "oficio", "outro"];

const GOOGLE_CONTACTS_SOURCE = "google_contacts";

const GOOGLE_CONTACTS_COLUMNS = {
  contact_type: "Gabinete360 Tipo",
  segment: "Gabinete360 Segmento",
  name: "Gabinete360 Nome",
  phone: "Gabinete360 Telefone",
  whatsapp: "Gabinete360 WhatsApp",
  birth_date: "Gabinete360 Aniversario",
  birth_month: "Gabinete360 Mes Aniversario",
  birth_day: "Gabinete360 Dia Aniversario",
  birth_year: "Gabinete360 Ano Nascimento",
  birth_date_precision: "Gabinete360 Precisao Aniversario",
  email: "Gabinete360 Email",
  profession: "Gabinete360 Profissao",
  company_legal_name: "Gabinete360 Empresa",
  notes: "Gabinete360 Observacoes",
  tags: "Gabinete360 Etiquetas",
  address: "Gabinete360 Endereco",
  number: "Gabinete360 Numero",
  neighborhood: "Gabinete360 Bairro",
  city: "Gabinete360 Cidade",
  uf: "Gabinete360 UF",
  zip_code: "Gabinete360 CEP",
};

const GOOGLE_CONTACTS_PHONE_LOOKUP_KEY = "__gabinete360_phone_lookup";
const GOOGLE_CONTACTS_EMAIL_LOOKUP_KEY = "__gabinete360_email_lookup";

const GOOGLE_CONTACTS_MAPPING = Object.fromEntries(
  Object.entries(GOOGLE_CONTACTS_COLUMNS).filter(([field]) => IMPORT_FIELDS.includes(field)),
);

const BRAZILIAN_UF_BY_NAME = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function enhanceParsedSpreadsheet(parsed) {
  if (isGoogleContactsExport(parsed.columns)) {
    return normalizeGoogleContactsExport(parsed);
  }
  return {
    columns: parsed.columns,
    rows: parsed.rows,
    source_format: "spreadsheet",
    source_label: "Planilha",
    warnings: [],
    stats: {
      total_rows: parsed.rows.length,
      columns: parsed.columns.length,
    },
  };
}

function isGoogleContactsExport(columns = []) {
  const normalized = new Set(columns.map((column) => normalizeHeader(column)));
  if (normalized.has(normalizeHeader(GOOGLE_CONTACTS_COLUMNS.name))) return true;

  const strongSignals = [
    "first name",
    "middle name",
    "last name",
    "file as",
    "organization name",
    "birthday",
    "phone 1 value",
    "e mail 1 value",
    "address 1 formatted",
    "given name",
    "family name",
    "organization 1 name",
  ];
  const score = strongSignals.filter((signal) => normalized.has(normalizeHeader(signal))).length;
  const hasPhone = [...normalized].some((column) => /^phone \d+ value$/.test(column));
  const hasEmail = [...normalized].some((column) => /^e mail \d+ value$/.test(column));
  const hasNameParts =
    normalized.has("first name") ||
    normalized.has("given name") ||
    normalized.has("last name") ||
    normalized.has("family name") ||
    normalized.has("file as");

  return score >= 3 || (hasNameParts && (hasPhone || hasEmail));
}

function normalizeGoogleContactsExport(parsed) {
  const warnings = [];
  const stats = {
    total_rows: parsed.rows.length,
    contacts_detected: 0,
    phones_detected: 0,
    emails_detected: 0,
    birthdays_full: 0,
    birthdays_partial: 0,
    birthdays_invalid: 0,
  };

  const rows = parsed.rows
    .map((row, index) => normalizeGoogleContactRow(row, index + 2, warnings, stats))
    .filter((row) => hasAnyValue(row));

  return {
    columns: Object.values(GOOGLE_CONTACTS_COLUMNS),
    rows,
    source_format: GOOGLE_CONTACTS_SOURCE,
    source_label: "Google Contacts",
    warnings: warnings.slice(0, 80),
    stats: {
      ...stats,
      rows_ready: rows.length,
      warnings_count: warnings.length,
    },
  };
}

function normalizeGoogleContactRow(row, lineNumber, warnings, stats) {
  const personName = joinClean([
    readGoogleValue(row, "Name Prefix"),
    readGoogleValue(row, "First Name", "Given Name"),
    readGoogleValue(row, "Middle Name", "Additional Name"),
    readGoogleValue(row, "Last Name", "Family Name"),
    readGoogleValue(row, "Name Suffix"),
  ]);
  const fileAs = readGoogleValue(row, "File As", "Name");
  const organizationName = readGoogleValue(row, "Organization Name", "Organization 1 - Name");
  const organizationTitle = readGoogleValue(row, "Organization Title", "Organization 1 - Title");
  const organizationDepartment = readGoogleValue(row, "Organization Department", "Organization 1 - Department");
  const phones = collectGooglePairs(row, "Phone");
  const emails = collectGooglePairs(row, "E-mail");
  const addresses = collectGoogleAddresses(row);
  const websites = collectGooglePairs(row, "Website");
  const customFields = collectGooglePairs(row, "Custom Field");
  const mainPhone = selectBestPhone(phones);
  const whatsappPhone = selectWhatsappPhone(phones, mainPhone);
  const mainEmail = selectBestEmail(emails);
  const birthday = parseGoogleBirthday(readGoogleValue(row, "Birthday"));
  const labels = normalizeGoogleLabels(readGoogleValue(row, "Labels", "Group Membership"));
  const primaryAddress = addresses[0] || {};
  const contactType = personName || fileAs ? "person" : organizationName ? "company" : "person";
  const fallbackName = personName || fileAs || organizationName || mainEmail?.value || mainPhone?.value || "";
  const name = fallbackName || `Contato linha ${lineNumber}`;

  if (!fallbackName) {
    warnings.push(`Linha ${lineNumber}: contato sem nome, telefone ou e-mail; foi criado nome temporario.`);
  }
  if (birthday.invalid) {
    stats.birthdays_invalid += 1;
    warnings.push(`Linha ${lineNumber}: aniversario ignorado porque nao parece uma data valida.`);
  } else if (birthday.precision === "full") {
    stats.birthdays_full += 1;
  } else if (birthday.precision === "month_day") {
    stats.birthdays_partial += 1;
  }

  if (mainPhone?.value) stats.phones_detected += 1;
  if (mainEmail?.value) stats.emails_detected += 1;
  if (fallbackName || mainPhone?.value || mainEmail?.value) stats.contacts_detected += 1;

  const notes = buildGoogleContactNotes({
    sourceNotes: readGoogleValue(row, "Notes"),
    organizationName,
    organizationTitle,
    organizationDepartment,
    phones,
    mainPhone,
    whatsappPhone,
    emails,
    mainEmail,
    addresses,
    websites,
    customFields,
    birthdayRaw: readGoogleValue(row, "Birthday"),
    birthday,
  });

  return {
    [GOOGLE_CONTACTS_COLUMNS.contact_type]: contactType,
    [GOOGLE_CONTACTS_COLUMNS.segment]: contactType === "company" ? "empresa" : "municipe",
    [GOOGLE_CONTACTS_COLUMNS.name]: name,
    [GOOGLE_CONTACTS_COLUMNS.phone]: mainPhone?.value || "",
    [GOOGLE_CONTACTS_COLUMNS.whatsapp]: whatsappPhone?.value || mainPhone?.value || "",
    [GOOGLE_CONTACTS_COLUMNS.birth_date]: birthday.fullDate || "",
    [GOOGLE_CONTACTS_COLUMNS.birth_month]: birthday.month ? String(birthday.month).padStart(2, "0") : "",
    [GOOGLE_CONTACTS_COLUMNS.birth_day]: birthday.day ? String(birthday.day).padStart(2, "0") : "",
    [GOOGLE_CONTACTS_COLUMNS.birth_year]: birthday.year ? String(birthday.year) : "",
    [GOOGLE_CONTACTS_COLUMNS.birth_date_precision]: birthday.precision || "",
    [GOOGLE_CONTACTS_COLUMNS.email]: mainEmail?.value || "",
    [GOOGLE_CONTACTS_COLUMNS.profession]: joinClean([organizationTitle, organizationDepartment]),
    [GOOGLE_CONTACTS_COLUMNS.company_legal_name]: organizationName,
    [GOOGLE_CONTACTS_COLUMNS.notes]: notes,
    [GOOGLE_CONTACTS_COLUMNS.tags]: labels.join(", "),
    [GOOGLE_CONTACTS_COLUMNS.address]: primaryAddress.street || primaryAddress.formatted || "",
    [GOOGLE_CONTACTS_COLUMNS.number]: "",
    [GOOGLE_CONTACTS_COLUMNS.neighborhood]: primaryAddress.extended || "",
    [GOOGLE_CONTACTS_COLUMNS.zip_code]: primaryAddress.postalCode || "",
    [GOOGLE_CONTACTS_COLUMNS.city]: primaryAddress.city || "",
    [GOOGLE_CONTACTS_COLUMNS.uf]: normalizeBrazilianUf(primaryAddress.region),
    [GOOGLE_CONTACTS_PHONE_LOOKUP_KEY]: phones.map((phone) => phone.value).join(" | "),
    [GOOGLE_CONTACTS_EMAIL_LOOKUP_KEY]: emails.map((email) => email.value).join(" | "),
  };
}

function readGoogleValue(row, ...keys) {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function collectGooglePairs(row, prefix) {
  const pairs = [];
  const pattern = new RegExp(`^${escapeRegExp(prefix)} (\\d+) - (Label|Value)$`, "i");
  Object.keys(row).forEach((key) => {
    const match = key.match(pattern);
    if (!match) return;
    const index = Number(match[1]);
    const kind = match[2].toLowerCase();
    if (!pairs[index]) pairs[index] = { label: "", value: "" };
    pairs[index][kind] = String(row[key] ?? "").trim();
  });
  return pairs.filter((pair) => pair && pair.value);
}

function collectGoogleAddresses(row) {
  const addresses = [];
  Object.keys(row).forEach((key) => {
    const match = key.match(/^Address (\d+) - (.+)$/i);
    if (!match) return;
    const index = Number(match[1]);
    const field = normalizeHeader(match[2]).replaceAll(" ", "_");
    if (!addresses[index]) addresses[index] = {};
    addresses[index][field] = String(row[key] ?? "").trim();
  });
  return addresses
    .filter(Boolean)
    .map((address) => ({
      label: address.label || "",
      formatted: address.formatted || "",
      street: address.street || address.formatted || "",
      city: address.city || "",
      region: address.region || "",
      postalCode: address.postal_code || "",
      country: address.country || "",
      extended: address.extended_address || "",
    }))
    .filter((address) => Object.values(address).some(Boolean));
}

function selectBestPhone(phones) {
  return (
    phones.find((phone) => isMobileLabel(phone.label)) ||
    phones.find((phone) => phone.value) ||
    null
  );
}

function selectWhatsappPhone(phones, fallback) {
  return phones.find((phone) => /whats|zap/i.test(phone.label || "")) || fallback || null;
}

function selectBestEmail(emails) {
  return emails.find((email) => isValidEmail(email.value)) || emails[0] || null;
}

function parseGoogleBirthday(value) {
  const raw = String(value || "").trim();
  if (!raw) return {};

  let year = 0;
  let month = 0;
  let day = 0;
  let precision = "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    year = Number(raw.slice(0, 4));
    month = Number(raw.slice(5, 7));
    day = Number(raw.slice(8, 10));
    precision = "full";
  } else if (/^--\d{2}-\d{2}$/.test(raw)) {
    month = Number(raw.slice(2, 4));
    day = Number(raw.slice(5, 7));
    precision = "month_day";
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [first, second, third] = raw.split("/").map(Number);
    year = third;
    if (first > 12) {
      day = first;
      month = second;
    } else if (second > 12) {
      month = first;
      day = second;
    } else {
      day = first;
      month = second;
    }
    precision = "full";
  } else if (/^\d{1,2}\/\d{1,2}$/.test(raw)) {
    const [first, second] = raw.split("/").map(Number);
    day = first;
    month = second;
    precision = "month_day";
  } else if (/^\d+(\.\d+)?$/.test(raw)) {
    const date = normalizeDate(raw);
    if (date) {
      year = Number(date.slice(0, 4));
      month = Number(date.slice(5, 7));
      day = Number(date.slice(8, 10));
      precision = "full";
    }
  }

  if (!isValidMonthDay(month, day) || (precision === "full" && year < 1800)) {
    return { invalid: true, raw };
  }

  return {
    raw,
    year: precision === "full" ? year : 0,
    month,
    day,
    precision,
    fullDate: precision === "full" ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "",
  };
}

function buildGoogleContactNotes(data) {
  const blocks = [];
  if (data.sourceNotes) blocks.push(data.sourceNotes);
  const orgLine = joinClean([data.organizationName, data.organizationTitle, data.organizationDepartment], " - ");
  if (orgLine) blocks.push(`Organizacao no Google: ${orgLine}`);

  const extraPhones = data.phones
    .filter((phone) => phone.value !== data.mainPhone?.value && phone.value !== data.whatsappPhone?.value)
    .map((phone) => `${phone.label || "Telefone"}: ${phone.value}`);
  if (extraPhones.length) blocks.push(`Telefones extras: ${extraPhones.join("; ")}`);

  const extraEmails = data.emails
    .filter((email) => email.value !== data.mainEmail?.value)
    .map((email) => `${email.label || "E-mail"}: ${email.value}`);
  if (extraEmails.length) blocks.push(`E-mails extras: ${extraEmails.join("; ")}`);

  if (data.addresses.length > 1) {
    const extraAddresses = data.addresses.slice(1).map((address) =>
      joinClean([address.label, address.formatted || address.street, address.city, address.region, address.postalCode], " - "),
    );
    blocks.push(`Enderecos extras: ${extraAddresses.filter(Boolean).join("; ")}`);
  }

  const websites = data.websites.map((item) => `${item.label || "Site"}: ${item.value}`);
  if (websites.length) blocks.push(`Sites: ${websites.join("; ")}`);

  const customFields = data.customFields.map((item) => `${item.label || "Campo"}: ${item.value}`);
  if (customFields.length) blocks.push(`Campos personalizados: ${customFields.join("; ")}`);

  if (data.birthday?.invalid && data.birthdayRaw) {
    blocks.push(`Aniversario no Google ignorado: ${data.birthdayRaw}`);
  }

  return uniqueTextBlocks(blocks).join("\n\n");
}

function normalizeGoogleLabels(value) {
  return uniqueTextBlocks(
    String(value || "")
      .split(/\s*:::\s*|[,;]/)
      .map((item) => item.replace(/^\*+\s*/, "").trim())
      .filter(Boolean),
  );
}

function normalizeBrazilianUf(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return BRAZILIAN_UF_BY_NAME[normalizeHeader(raw)] || raw;
}

function isMobileLabel(value) {
  return /(mobile|celular|movel|móvel|whats|zap|telemovel|telemóvel)/i.test(String(value || ""));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidMonthDay(month, day) {
  return Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function hasAnyValue(row) {
  return Object.values(row).some((value) => String(value || "").trim());
}

function joinClean(values, separator = " ") {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(separator);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function suggestMapping(columns, rows = []) {
  if (isGoogleContactsExport(columns)) {
    return Object.fromEntries(
      Object.entries(GOOGLE_CONTACTS_MAPPING).filter(([, column]) => columns.includes(column)),
    );
  }

  const result = {};
  const firstRow = rows[0] || {};
  columns.forEach((column) => {
    const normalized = normalizeHeader(column);
    const field = bestFieldMatch(normalized);
    if (field && !result[field]) {
      result[field] = column;
    }
    if (!field && !normalized && !result.channel) {
      const sample = normalizeHeader(firstRow[column] || "");
      if (KNOWN_CHANNELS.some((item) => sample === normalizeHeader(item))) {
        result.channel = column;
      }
    }
  });
  return result;
}

export function importFields() {
  return IMPORT_FIELDS;
}

export function buildImportReport(db, gabineteId, userId, rows, mapping, options = {}) {
  const timestamp = nowIso();
  const importOptions = normalizeImportOptions(options);
  const importId = parseInteger(options.import_id || options.importId);
  const users = db
    .prepare("SELECT id, name, username FROM users WHERE gabinete_id = :gabinete_id")
    .all({ gabinete_id: gabineteId });
  const statusRows = db
    .prepare("SELECT name, is_final FROM status_custom WHERE gabinete_id = :gabinete_id")
    .all({ gabinete_id: gabineteId });
  const defaultStatus = statusRows.find((row) => normalizeHeader(row.name) === "aberto")?.name
    || statusRows.find((row) => normalizeHeader(row.name) === "novo")?.name
    || statusRows[0]?.name
    || "Aberto";
  const defaultFinalStatus = statusRows.find((status) => normalizeHeader(status.name) === "finalizado")?.name
    || statusRows.find((status) => status.is_final)?.name
    || "";
  const defaultChannel = db
    .prepare("SELECT name FROM channels WHERE gabinete_id = :gabinete_id ORDER BY name LIMIT 1")
    .get({ gabinete_id: gabineteId })?.name || "WhatsApp";
  const importingUserId = parseInteger(userId, null);
  const openedAtFallback = timestamp.slice(0, 10);

  let createdContacts = 0;
  let updatedContacts = 0;
  let createdTickets = 0;
  let duplicatesCount = 0;
  let mergeConflictsCount = 0;
  let skippedRows = 0;
  const errors = [];
  const preview = [];
  const mergeConflicts = [];
  const createdContactIds = new Set();
  const updatedContactIds = new Set();
  const createdTicketIds = new Set();
  const createdHistoryIds = new Set();

  rows.forEach((row, index) => {
    const mapped = mapRow(row, mapping);
    const hasContactSignal = hasImportContactSignal(mapped);
    const hasTicketSignal = hasImportTicketSignal(mapped);
    const hasAnySignal = hasContactSignal || hasTicketSignal;

    if (!hasAnySignal) {
      skippedRows += 1;
      return;
    }

    if (!mapped.name) {
      errors.push(`Linha ${index + 2}: nome do contato e obrigatorio.`);
      return;
    }

    const contact = findOrCreateContact(db, gabineteId, mapped, timestamp, { ...importOptions, import_id: importId });
    if (contact.created) createdContacts += 1;
    if (contact.updated) updatedContacts += 1;
    if (contact.created) createdContactIds.add(contact.id);
    if (contact.updated) updatedContactIds.add(contact.id);
    if (contact.duplicate) duplicatesCount += 1;
    if (contact.merge_conflict) {
      mergeConflictsCount += 1;
      mergeConflicts.push(contact.merge_conflict);
    }

    if (!hasTicketSignal) {
      preview.push({
        line: index + 2,
        contact_name: mapped.name,
        demand_title: "Importacao de contato",
        status: "Contato",
        duplicate: contact.duplicate,
      });
      return;
    }

    const sequence =
      db.prepare("SELECT COUNT(*) AS total FROM tickets WHERE gabinete_id = :gabinete_id").get({
        gabinete_id: gabineteId,
      }).total + 1;
    const providedNumber = normalizeImportTicketNumber(mapped.ticket_number);
    if (providedNumber) {
      const existingTicket = db.prepare(
        "SELECT id FROM tickets WHERE gabinete_id = :gabinete_id AND number = :number",
      ).get({
        gabinete_id: gabineteId,
        number: providedNumber,
      });
      if (existingTicket) {
        duplicatesCount += 1;
        preview.push({
          line: index + 2,
          contact_name: mapped.name,
          demand_title: mapped.demand_title,
          status: "Atendimento ja existia",
          duplicate: true,
        });
        return;
      }
    }
    const assignedUser = matchUser(users, mapped.assigned_user);
    const matchedStatus = matchStatus(statusRows, mapped.status) || defaultStatus;
    const formalStatus = inferImportedFormalTicketStatus(mapped, statusRows);
    const normalizedDemand = normalizeImportedTicketDemand(mapped);
    const ticketDemandTitle = normalizedDemand.title;
    const statusBeforeClose = formalStatus || matchedStatus;
    const shouldClose = shouldCloseImportedTicket(mapped, statusRows, statusBeforeClose);
    const normalizedStatus = shouldClose
      ? resolveImportedClosedStatus(statusRows, statusBeforeClose, {
          defaultFinalStatus,
          defaultStatus,
          preferredFinalStatus: formalStatus,
        })
      : statusBeforeClose;
    const openedAt = normalizeDate(mapped.opened_at) || openedAtFallback;
    const closedAt = shouldClose ? (normalizeDate(mapped.closed_at) || openedAt) : "";
    const resultText = resolveImportedTicketResult(mapped, shouldClose);
    const historyText = mapped.guidance || "Atendimento importado da planilha.";
    const ticketTags = normalizeImportTags(mapped.tags || "");

    const ticketInsert = db.prepare(
      `
        INSERT INTO tickets (
          gabinete_id, contact_id, number, opened_at, channel, status, priority, tags,
          demand_title, demand_category, description, current_guidance, assigned_user_id,
          department, external_protocol, internal_due_date, next_action, next_action_date,
          closed_at, result, import_id, is_archived, is_favorite, created_at, updated_at
        ) VALUES (
          :gabinete_id, :contact_id, :number, :opened_at, :channel, :status, :priority, :tags,
          :demand_title, :demand_category, :description, :current_guidance, :assigned_user_id,
          :department, :external_protocol, :internal_due_date, :next_action, :next_action_date,
          :closed_at, :result, :import_id, 0, 0, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      contact_id: contact.id,
      number: providedNumber || generateTicketCode(gabineteId, sequence),
      opened_at: openedAt,
      channel: mapped.channel || defaultChannel,
      status: normalizedStatus,
      priority: inferImportedPriority(mapped.status),
      tags: ticketTags,
      demand_title: ticketDemandTitle,
      demand_category: inferCategory(ticketDemandTitle),
      description: normalizedDemand.description,
      current_guidance: mapped.guidance || "",
      assigned_user_id: assignedUser?.id ?? importingUserId ?? null,
      department: "",
      external_protocol: "",
      internal_due_date: "",
      next_action: "",
      next_action_date: "",
      closed_at: closedAt,
      result: resultText,
      import_id: importId || null,
      created_at: timestamp,
      updated_at: timestamp,
    });

    createdTickets += 1;
    const ticketId = Number(ticketInsert.lastInsertRowid);
    createdTicketIds.add(ticketId);
    db.prepare(
      `
        INSERT INTO ticket_history (
          gabinete_id, ticket_id, user_id, action_type, text, previous_status,
          new_status, next_action, next_action_date, is_internal, import_id, created_at
        ) VALUES (
          :gabinete_id, :ticket_id, :user_id, 'Nota interna', :text, '',
          :new_status, :next_action, :next_action_date, 1, :import_id, :created_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      ticket_id: ticketId,
      user_id: importingUserId || userId,
      text: historyText,
      new_status: normalizedStatus,
      next_action: "",
      next_action_date: "",
      import_id: importId || null,
      created_at: timestamp,
    });
    const historyRow = db.prepare("SELECT last_insert_rowid() AS id").get();
    if (historyRow?.id) createdHistoryIds.add(Number(historyRow.id));

    preview.push({
      line: index + 2,
      contact_name: mapped.name,
      demand_title: ticketDemandTitle,
      status: normalizedStatus,
      duplicate: contact.duplicate,
    });
  });

  return {
    status: errors.length ? "completed_with_errors" : "completed",
    total_rows: rows.length,
    imported_contacts: createdContacts + updatedContacts,
    created_contacts: createdContacts,
    updated_contacts: updatedContacts,
    imported_tickets: createdTickets,
    duplicates_count: duplicatesCount,
    merge_conflicts_count: mergeConflictsCount,
    skipped_rows: skippedRows,
    errors_count: errors.length,
    errors,
    preview,
    merge_conflicts: mergeConflicts.slice(0, 50),
    created_contact_ids: [...createdContactIds],
    updated_contact_ids: [...updatedContactIds],
    created_ticket_ids: [...createdTicketIds],
    created_history_ids: [...createdHistoryIds],
    created_at: timestamp,
  };
}

export function buildImportPreviewAnalysis(db, gabineteId, rows, mapping, options = {}) {
  const importOptions = normalizeImportOptions(options);
  const statusRows = db
    .prepare("SELECT name, is_final FROM status_custom WHERE gabinete_id = :gabinete_id")
    .all({ gabinete_id: gabineteId });
  const defaultStatus = statusRows.find((row) => normalizeHeader(row.name) === "aberto")?.name
    || statusRows.find((row) => normalizeHeader(row.name) === "novo")?.name
    || statusRows[0]?.name
    || "Aberto";
  const defaultFinalStatus = statusRows.find((status) => normalizeHeader(status.name) === "finalizado")?.name
    || statusRows.find((status) => status.is_final)?.name
    || "";
  let rowsWithContact = 0;
  let rowsWithTicket = 0;
  let newTickets = 0;
  let existingTickets = 0;
  let duplicateTicketsInFile = 0;
  let closedTickets = 0;
  let existingMatches = 0;
  let newContacts = 0;
  let fileDuplicates = 0;
  let mergeConflicts = 0;
  let fixedPhones = 0;
  let mobilePhones = 0;
  let legacyMobilePhones = 0;
  let invalidPhones = 0;
  let invalidDocuments = 0;
  const seenKeys = new Set();
  const seenTicketNumbers = new Set();

  rows.forEach((row) => {
    const mapped = mapRow(row, mapping);
    const hasContactSignal = hasImportContactSignal(mapped);
    const hasTicketSignal = hasImportTicketSignal(mapped);
    const hasAnySignal = hasContactSignal || hasTicketSignal;

    if (!hasAnySignal) return;

    if (!mapped.name) return;

    if (hasTicketSignal) {
      rowsWithTicket += 1;
      const providedNumber = normalizeImportTicketNumber(mapped.ticket_number);
      if (providedNumber) {
        const existingTicket = db.prepare(
          "SELECT id FROM tickets WHERE gabinete_id = :gabinete_id AND number = :number",
        ).get({ gabinete_id: gabineteId, number: providedNumber });
        if (existingTicket) {
          existingTickets += 1;
        } else if (seenTicketNumbers.has(providedNumber)) {
          duplicateTicketsInFile += 1;
        } else {
          seenTicketNumbers.add(providedNumber);
          newTickets += 1;
        }
      } else {
        newTickets += 1;
      }
      const normalizedStatus = matchStatus(statusRows, mapped.status) || defaultStatus;
      const formalStatus = inferImportedFormalTicketStatus(mapped, statusRows);
      const statusBeforeClose = formalStatus || normalizedStatus;
      const shouldClose = shouldCloseImportedTicket(mapped, statusRows, statusBeforeClose);
      const resolvedStatus = shouldClose
        ? resolveImportedClosedStatus(statusRows, statusBeforeClose, {
            defaultFinalStatus,
            defaultStatus,
            preferredFinalStatus: formalStatus,
          })
        : statusBeforeClose;
      if (isFinalStatus(statusRows, resolvedStatus)) closedTickets += 1;
    }
    if (!hasContactSignal) return;

    rowsWithContact += 1;
    const phoneInsight = analyzeMappedImportPhone(mapped, importOptions);
    if (phoneInsight.kind === "fixed") fixedPhones += 1;
    if (phoneInsight.kind === "mobile") mobilePhones += 1;
    if (phoneInsight.kind === "legacy_mobile") legacyMobilePhones += 1;
    if (phoneInsight.kind === "invalid") invalidPhones += 1;
    if (hasInvalidCpfCnpj(mapped.cpf_rg_cns)) invalidDocuments += 1;

    const duplicate = findDuplicateContact(db, gabineteId, mapped, {}, importOptions);
    if (duplicate) {
      existingMatches += 1;
      if (shouldCreateMergeSuggestion(duplicate, mapped)) {
        mergeConflicts += 1;
        newContacts += 1;
      }
      return;
    }

    const key = buildImportIdentityKey(mapped, importOptions);
    if (key && seenKeys.has(key)) {
      fileDuplicates += 1;
      return;
    }
    if (key) seenKeys.add(key);
    newContacts += 1;
  });

  return {
    contact_rows: rowsWithContact,
    ticket_rows: rowsWithTicket,
    new_tickets_estimate: newTickets,
    existing_tickets_estimate: existingTickets,
    file_ticket_duplicates_estimate: duplicateTicketsInFile,
    closed_tickets_estimate: closedTickets,
    internal_notes_estimate: newTickets,
    existing_matches: existingMatches,
    new_contacts_estimate: newContacts,
    file_duplicates_estimate: fileDuplicates,
    merge_conflicts_estimate: mergeConflicts,
    fixed_phones_estimate: fixedPhones,
    mobile_phones_estimate: mobilePhones,
    legacy_mobile_phones_estimate: legacyMobilePhones,
    invalid_phones_estimate: invalidPhones,
    invalid_documents_estimate: invalidDocuments,
  };
}

export function detectContactDuplicateSuggestions(db, gabineteId, options = {}) {
  const importOptions = normalizeImportOptions(options);
  const timestamp = nowIso();
  const contacts = db
    .prepare("SELECT * FROM contacts WHERE gabinete_id = :gabinete_id AND (deleted_at IS NULL OR deleted_at = '') ORDER BY id")
    .all({ gabinete_id: gabineteId });
  const existingSuggestionPairs = loadExistingSuggestionPairKeys(db, gabineteId);
  const pairs = buildExistingContactCandidatePairs(contacts, importOptions);
  let created = 0;
  let autoConfidence = 0;
  let strongConfidence = 0;
  let mediumConfidence = 0;

  pairs.forEach(([leftId, rightId]) => {
    if (created >= 200) return;
    const pairKey = buildPairKey(leftId, rightId);
    if (existingSuggestionPairs.has(pairKey)) return;
    const left = contacts.find((contact) => contact.id === leftId);
    const right = contacts.find((contact) => contact.id === rightId);
    if (!left || !right) return;

    const { target, source } = chooseMergeDirection(left, right);
    const sourceMapped = contactToImportMapped(source);
    const identity = buildImportIdentityData(sourceMapped, {
      phone: source.phone,
      whatsapp: source.whatsapp,
      cpf: source.cpf_rg_cns,
      email: source.email,
      birthday: extractContactBirthday(source),
    }, importOptions);
    const scored = scoreIdentityCandidate(target, sourceMapped, identity, importOptions);
    const decision = classifyIdentityDecision(scored, null);
    if (decision === "separate" || scored.score < IDENTITY_REVIEW_MEDIUM_SCORE) return;

    const confidence = decision === "auto"
      ? "auto"
      : (scored.score >= IDENTITY_REVIEW_STRONG_SCORE ? "strong" : "medium");
    insertContactMergeSuggestion(db, gabineteId, null, target, {
      id: source.id,
      name: source.name,
      match_kind: scored.matchKind,
      match_value: scored.matchValue,
      match_score: scored.score,
      confidence,
      reasons: [...scored.reasons, "Detectado na varredura de duplicados"],
      timestamp,
    });
    existingSuggestionPairs.add(pairKey);
    created += 1;
    if (confidence === "auto") autoConfidence += 1;
    else if (confidence === "strong") strongConfidence += 1;
    else mediumConfidence += 1;
  });

  return {
    contacts_scanned: contacts.length,
    candidate_pairs: pairs.length,
    created_suggestions: created,
    auto_confidence: autoConfidence,
    strong_confidence: strongConfidence,
    medium_confidence: mediumConfidence,
  };
}

function hasImportContactSignal(mapped) {
  return Boolean(
    mapped.name || mapped.phone || mapped.whatsapp || mapped.email || mapped.cpf_rg_cns || mapped.address || mapped.notes,
  );
}

function hasImportTicketSignal(mapped) {
  return Boolean(
    mapped.demand_title ||
    mapped.description ||
    mapped.guidance ||
    mapped.result ||
    mapped.opened_at ||
    mapped.closed_at ||
    mapped.status,
  );
}

function normalizeImportedSubjectKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanImportedSubject(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const IMPORTED_DEMAND_TITLE_ALIASES = new Map([
  ["mato", "Corte de mato"],
  ["cortar mato", "Corte de mato"],
  ["corte mato", "Corte de mato"],
  ["limpeza de mato", "Corte de mato"],
  ["curriculo para encaminhamento", "Currículo para encaminhamento"],
  ["curriculos para encaminhamento", "Currículo para encaminhamento"],
  ["entrar em contato", "Retorno ao munícipe"],
  ["retornar contato", "Retorno ao munícipe"],
  ["retorno ao municipe", "Retorno ao munícipe"],
  ["ligar para municipe", "Retorno ao munícipe"],
  ["mandar whatsapp", "Retorno ao munícipe"],
  ["falar com municipe", "Retorno ao munícipe"],
  ["contato com assessoria", "Contato com assessoria"],
  ["entrar em contato com assessoria", "Contato com assessoria"],
  ["falar com assessoria", "Contato com assessoria"],
  ["instalacao da lombada", "Instalação de Lombada"],
  ["instalacao de lombada", "Instalação de Lombada"],
  ["vaga em escola publica", "Vaga em escola"],
  ["vaga em escola municipal", "Vaga em escola"],
  ["vaga escolar", "Vaga em escola"],
  ["vaga na escola", "Vaga em escola"],
  ["vaga em escola", "Vaga em escola"],
  ["vaga na creche", "Vaga em creche"],
  ["vaga em creche", "Vaga em creche"],
  ["cadastro habitacao", "Cadastro na Habitação"],
  ["cadastro na habitacao", "Cadastro na Habitação"],
  ["vaga santa casa", "Vaga na Santa Casa"],
  ["vaga na santa casa", "Vaga na Santa Casa"],
  ["limpeza em terreno", "Limpeza de Terreno"],
  ["limpeza de terreno", "Limpeza de Terreno"],
  ["limpeza em praca", "Limpeza de Praça"],
  ["limpeza de praca", "Limpeza de Praça"],
  ["lampada de poste queimada", "Lâmpada de poste queimada"],
  ["lampadas de postes queimadas", "Lâmpada de poste queimada"],
  ["agendamento de ortopedista traumatologista", "Agendamento de Ortopedista"],
  ["vaga em escola periodo integral", "Vaga em período integral"],
  ["vaga em periodo integral", "Vaga em período integral"],
  ["periodo integral para crianca", "Vaga em período integral"],
  ["periodo integral para criancas", "Vaga em período integral"],
  ["tapa buraco", "Reparo asfáltico"],
  ["tapar buraco", "Reparo asfáltico"],
  ["reparacao asfaltica", "Reparo asfáltico"],
  ["reparo asfaltico", "Reparo asfáltico"],
  ["reparo asfaltico buracos", "Reparo asfáltico"],
  ["agendamento de exames de sangue e urina", "Agendamento de exames"],
]);

function firstImportedDescriptionLine(description) {
  return String(description || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function appendImportedSubjectOrigin(description, origin) {
  const cleanOrigin = cleanImportedSubject(origin);
  if (!cleanOrigin) return String(description || "");
  const current = String(description || "").trim();
  if (normalizeImportedSubjectKey(current).includes(normalizeImportedSubjectKey(cleanOrigin))) {
    return current;
  }
  return `${current}${current ? "\n\n" : ""}Origem do atendimento: ${cleanOrigin}`;
}

function normalizeImportedTicketDemand(mapped = {}) {
  const rawTitle = inferImportedTicketTitle(mapped);
  let title = cleanImportedSubject(rawTitle);
  let description = String(mapped.description || "");
  const eventMatch = title.match(/^(.+?)\s*\(([^)]*\d{1,2}\/\d{1,2}\/\d{4}[^)]*)\)\s*$/);
  if (eventMatch) {
    title = cleanImportedSubject(eventMatch[1]);
    description = appendImportedSubjectOrigin(description, eventMatch[2]);
  }

  const firstLine = firstImportedDescriptionLine(description).replace(/[.;:]+$/, "").trim();
  const firstLineKey = normalizeImportedSubjectKey(firstLine);
  const titleKey = normalizeImportedSubjectKey(title);
  if (
    ["atendimento odontologico", "assessoria juridica"].includes(titleKey)
    && ["atendimento odontologico", "assessoria juridica"].includes(firstLineKey)
  ) {
    title = firstLine;
  }

  title = IMPORTED_DEMAND_TITLE_ALIASES.get(normalizeImportedSubjectKey(title)) || title;
  return {
    title: cleanImportedSubject(title || "Atendimento importado da planilha").slice(0, 140),
    description,
  };
}

function inferImportedTicketTitle(mapped) {
  const titleCandidate = [
    mapped.demand_title,
    mapped.description,
    mapped.guidance,
    mapped.result,
    mapped.status,
  ].find((value) => String(value || "").trim());
  return String(titleCandidate || "Atendimento importado da planilha").slice(0, 140);
}

function shouldCloseImportedTicket(mapped, statusRows, resolvedStatus) {
  const hasFinalSignal = isFinalStatus(statusRows, resolvedStatus);
  return Boolean(mapped.closed_at || mapped.result) || hasFinalSignal;
}

function inferImportedFormalTicketStatus(mapped, statusRows = []) {
  const normalizedStatus = normalizeHeader(mapped.status || "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const formalSource = [
    mapped.guidance,
    mapped.result,
    mapped.current_guidance,
  ].filter(Boolean).join(" ");
  const hasFormalOfficeLetter =
    normalizedStatus.includes("oficio encaminhado")
    || /\b(?:of[ií]cios?\s+)?of\.?\s*g\.?\s*v\.?\s*(?:n[º°o.]?\s*)?\d+/i.test(formalSource)
    || /\bof[ií]cios?\b[^.\n]{0,80}\b(?:protocolad|encaminhad|enviad)/i.test(formalSource);
  if (hasFormalOfficeLetter) {
    return statusRows.find((status) => {
      const key = normalizeHeader(status.name);
      return key.includes("oficio") && key.includes("encaminhado");
    })?.name || "";
  }
  const hasFormalLegislativeRequest =
    normalizedStatus.includes("indicacao requerimento")
    || /\b(?:indica[cç][aã]o|requerimentos?)\s+n[º°o.]?\s*\d+/i.test(formalSource);
  if (hasFormalLegislativeRequest) {
    return statusRows.find((status) => {
      const key = normalizeHeader(status.name);
      return key.includes("indicacao") && key.includes("requerimento");
    })?.name || "";
  }
  return "";
}

function resolveImportedClosedStatus(statusRows, statusBeforeClose, options = {}) {
  const preferredFinalStatus = options.preferredFinalStatus || "";
  if (preferredFinalStatus && isFinalStatus(statusRows, preferredFinalStatus)) {
    return preferredFinalStatus;
  }
  if (statusBeforeClose && isFinalStatus(statusRows, statusBeforeClose)) {
    return statusBeforeClose;
  }
  return options.defaultFinalStatus || statusBeforeClose || options.defaultStatus || "Finalizado";
}

function parseCsv(text) {
  const rows = [];
  const cleanText = String(text ?? "").replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(cleanText);
  const records = parseCsvRecords(cleanText, delimiter);
  if (!records.length) return { columns: [], rows: [] };
  const columns = records[0].map((column) => String(column ?? "").trim());
  for (const values of records.slice(1)) {
    const row = {};
    columns.forEach((column, index) => {
      row[column] = values[index] ?? "";
    });
    rows.push(row);
  }
  return { columns, rows };
}

function detectCsvDelimiter(text) {
  const commaCount = countDelimiterInFirstRecord(text, ",");
  const semicolonCount = countDelimiterInFirstRecord(text, ";");
  return semicolonCount > commaCount ? ";" : ",";
}

function countDelimiterInFirstRecord(text, delimiter) {
  let count = 0;
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      break;
    }
    if (char === delimiter && !quoted) {
      count += 1;
    }
  }

  return count;
}

function parseCsvRecords(text, delimiter = ",") {
  const records = [];
  let record = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      record.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      record.push(value.trim());
      if (record.some((item) => item !== "")) {
        records.push(record);
      }
      record = [];
      value = "";
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    value += char;
  }

  if (value !== "" || record.length) {
    record.push(value.trim());
    if (record.some((item) => item !== "")) {
      records.push(record);
    }
  }

  return records;
}

function parseXlsxWithPython(filePath) {
  const script = `
import json, re, zipfile, xml.etree.ElementTree as ET, sys
path = sys.argv[1]
ns = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
cell_ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
def column_index(ref):
    letters = ''.join(re.findall(r'[A-Z]+', ref or ''))
    if not letters:
        return None
    total = 0
    for char in letters:
        total = total * 26 + (ord(char) - 64)
    return total - 1
def read_cell(cell, shared):
    cell_type = cell.attrib.get('t')
    if cell_type == 'inlineStr':
        return ''.join(t.text or '' for t in cell.iter(cell_ns + 't'))
    v = cell.find(cell_ns + 'v')
    if v is None:
        return ''
    value = v.text or ''
    if cell_type == 's' and value:
        return shared[int(value)]
    return value
with zipfile.ZipFile(path) as z:
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    sheets = [(s.attrib.get('name'), s.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')) for s in wb.find('a:sheets', ns)]
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    relmap = {r.attrib['Id']: r.attrib['Target'] for r in rels}
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root:
            texts = []
            for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'):
                texts.append(t.text or '')
            shared.append(''.join(texts))
    target = 'xl/' + relmap[sheets[0][1]]
    root = ET.fromstring(z.read(target))
    rows = root.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData')
    parsed = []
    columns = []
    for idx, row in enumerate(rows):
        values_by_col = {}
        for cell in row:
            col_idx = column_index(cell.attrib.get('r'))
            if col_idx is None:
                col_idx = len(values_by_col)
            values_by_col[col_idx] = read_cell(cell, shared)
        if idx == 0:
            max_col = max(values_by_col.keys()) if values_by_col else -1
            columns = [values_by_col.get(col_idx, '') for col_idx in range(max_col + 1)]
        else:
            payload = {}
            for col_idx, column in enumerate(columns):
                payload[column] = values_by_col.get(col_idx, '')
            parsed.append(payload)
    print(json.dumps({'columns': columns, 'rows': parsed}, ensure_ascii=False))
`;
  const output = execFileSync("python3", ["-c", script, filePath], {
    encoding: "utf-8",
  });
  return JSON.parse(output);
}

function mapRow(row, mapping) {
  const mapped = IMPORT_FIELDS.reduce((acc, field) => {
    acc[field] = mapping[field] ? String(row[mapping[field]] ?? "").trim() : "";
    return acc;
  }, {});
  mapped._phone_lookup = String(row[GOOGLE_CONTACTS_PHONE_LOOKUP_KEY] ?? "").trim();
  mapped._email_lookup = String(row[GOOGLE_CONTACTS_EMAIL_LOOKUP_KEY] ?? "").trim();
  return mapped;
}

function normalizeHeader(header) {
  return String(header ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bestFieldMatch(normalizedHeader) {
  if (!normalizedHeader) return "";

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalizedHeader)) {
      return field;
    }
  }

  let best = "";
  let bestLength = 0;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeHeader(alias);
      if (
        normalizedAlias.length >= 4 &&
        (normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader)) &&
        normalizedAlias.length > bestLength
      ) {
        best = field;
        bestLength = normalizedAlias.length;
      }
    });
  }
  return best;
}

function findOrCreateContact(db, gabineteId, mapped, timestamp, options = {}) {
  const phone = normalizeImportedPhone(mapped.phone || mapped.whatsapp, options);
  const whatsapp = normalizeImportedPhone(mapped.whatsapp, options) || phone;
  const cpf = normalizeImportDocument(mapped.cpf_rg_cns);
  const email = normalizeEmail(mapped.email);
  const birthday = parseImportBirthday(mapped);
  const contactType = mapped.contact_type === "company" ? "company" : "person";
  const segment = mapped.segment || (contactType === "company" ? "empresa" : "municipe");
  const notes = buildContactNotes(mapped, { phone, whatsapp });
  const tags = normalizeImportTags(mapped.tags || "");
  const duplicate = findDuplicateContact(db, gabineteId, mapped, { phone, whatsapp, cpf, email, birthday }, options);

  if (duplicate) {
    if (shouldCreateMergeSuggestion(duplicate, mapped)) {
      const createdId = insertImportedContact(db, gabineteId, mapped, {
        importId: options.import_id,
        contactType,
        segment,
        phone,
        whatsapp,
        cpf,
        birthday,
        email,
        notes,
        tags,
        timestamp,
      });
      const suggestion = insertContactMergeSuggestion(db, gabineteId, options.import_id, duplicate, {
        id: createdId,
        name: mapped.name,
        match_kind: duplicate._match_kind || "phone",
        match_value: duplicate._match_value || phone || whatsapp || email || cpf || "",
        match_score: duplicate._identity_score || 0,
        confidence: duplicate._identity_confidence || "medium",
        reasons: duplicate._identity_reasons || [],
        timestamp,
      });
      return { id: createdId, created: true, updated: false, duplicate: false, merge_conflict: suggestion };
    }

    const additionalNotes = buildAdditionalImportNotes(duplicate, {
      name: mapped.name,
      phone,
      whatsapp,
      cpf_rg_cns: cpf,
      birth_date: birthday.fullDate,
      birth_month: birthday.month || null,
      birth_day: birthday.day || null,
      birth_year: birthday.year || null,
      birth_date_precision: birthday.precision || "",
      email,
      profession: mapped.profession || "",
      company_legal_name: mapped.company_legal_name || "",
      address: mapped.address || "",
      number: mapped.number || "",
      neighborhood: mapped.neighborhood || "",
      zip_code: mapped.zip_code || "",
      city: mapped.city || "",
      uf: mapped.uf || "",
    });
    const mergedNotes = mergeTextBlocks(duplicate.notes, notes, additionalNotes);
    const mergedTags = mergeTags(duplicate.tags, tags);
  const hasNewData = duplicateWouldChange(duplicate, {
      name: mapped.name,
      contact_type: contactType,
      segment,
      phone,
      whatsapp,
      cpf_rg_cns: cpf,
      birth_date: birthday.fullDate,
      birth_month: birthday.month || null,
      birth_day: birthday.day || null,
      birth_year: birthday.year || null,
      birth_date_precision: birthday.precision || "",
      email,
      profession: mapped.profession || "",
      company_legal_name: mapped.company_legal_name || "",
      notes: mergedNotes,
      tags: mergedTags,
      address: mapped.address || "",
      number: mapped.number || "",
      neighborhood: mapped.neighborhood || "",
      zip_code: mapped.zip_code || "",
      city: mapped.city || "",
      uf: mapped.uf || "",
    });

    if (!hasNewData) {
      return { id: duplicate.id, created: false, updated: false, duplicate: true, unchanged: true };
    }

    insertImportContactSnapshot(db, gabineteId, options.import_id, duplicate, timestamp);
    db.prepare(
      `
        UPDATE contacts
        SET name = COALESCE(NULLIF(name, ''), NULLIF(:name, ''), name),
            contact_type = COALESCE(NULLIF(contact_type, ''), NULLIF(:contact_type, ''), contact_type),
            segment = COALESCE(NULLIF(segment, ''), NULLIF(:segment, ''), segment),
            phone = COALESCE(NULLIF(phone, ''), NULLIF(:phone, ''), phone),
            whatsapp = COALESCE(NULLIF(whatsapp, ''), NULLIF(:whatsapp, ''), whatsapp),
            cpf_rg_cns = COALESCE(NULLIF(cpf_rg_cns, ''), NULLIF(:cpf_rg_cns, ''), cpf_rg_cns),
            birth_date = COALESCE(NULLIF(birth_date, ''), NULLIF(:birth_date, ''), birth_date),
            birth_month = CASE WHEN birth_month IS NULL OR birth_month = 0 THEN :birth_month ELSE birth_month END,
            birth_day = CASE WHEN birth_day IS NULL OR birth_day = 0 THEN :birth_day ELSE birth_day END,
            birth_year = CASE WHEN birth_year IS NULL OR birth_year = 0 THEN :birth_year ELSE birth_year END,
            birth_date_precision = COALESCE(NULLIF(birth_date_precision, ''), NULLIF(:birth_date_precision, ''), birth_date_precision),
            email = COALESCE(NULLIF(email, ''), NULLIF(:email, ''), email),
            profession = COALESCE(NULLIF(profession, ''), NULLIF(:profession, ''), profession),
            company_legal_name = COALESCE(NULLIF(company_legal_name, ''), NULLIF(:company_legal_name, ''), company_legal_name),
            notes = :notes,
            tags = :tags,
            address = COALESCE(NULLIF(address, ''), NULLIF(:address, ''), address),
            number = COALESCE(NULLIF(number, ''), NULLIF(:number, ''), number),
            neighborhood = COALESCE(NULLIF(neighborhood, ''), NULLIF(:neighborhood, ''), neighborhood),
            zip_code = COALESCE(NULLIF(zip_code, ''), NULLIF(:zip_code, ''), zip_code),
            city = COALESCE(NULLIF(city, ''), NULLIF(:city, ''), city),
            uf = COALESCE(NULLIF(uf, ''), NULLIF(:uf, ''), uf),
            updated_at = :updated_at
        WHERE id = :id
      `,
    ).run({
      id: duplicate.id,
      name: mapped.name,
      contact_type: contactType,
      segment,
      phone,
      whatsapp,
      cpf_rg_cns: cpf,
      birth_date: birthday.fullDate,
      birth_month: birthday.month || null,
      birth_day: birthday.day || null,
      birth_year: birthday.year || null,
      birth_date_precision: birthday.precision || "",
      email,
      profession: mapped.profession || "",
      company_legal_name: mapped.company_legal_name || "",
      notes: mergedNotes,
      tags: mergedTags,
      address: mapped.address || "",
      number: mapped.number || "",
      neighborhood: mapped.neighborhood || "",
      zip_code: mapped.zip_code || "",
      city: mapped.city || "",
      uf: mapped.uf || "",
      updated_at: timestamp,
    });
    return { id: duplicate.id, created: false, updated: true, duplicate: true };
  }

  const createdId = insertImportedContact(db, gabineteId, mapped, {
    importId: options.import_id,
    contactType,
    segment,
    phone,
    whatsapp,
    cpf,
    birthday,
    email,
    notes,
    tags,
    timestamp,
  });
  return { id: createdId, created: true, updated: false, duplicate: false };
}

function insertImportedContact(db, gabineteId, mapped, normalized) {
  const created = db.prepare(
    `
      INSERT INTO contacts (
        gabinete_id, name, contact_type, segment, phone, whatsapp, cpf_rg_cns,
        birth_date, birth_month, birth_day, birth_year, birth_date_precision,
        email, profession, company_legal_name, address, number, complement,
        neighborhood, zip_code, city, uf, notes, tags,
        first_ticket_at, last_ticket_at, import_id, created_at, updated_at
      ) VALUES (
        :gabinete_id, :name, :contact_type, :segment, :phone, :whatsapp, :cpf_rg_cns,
        :birth_date, :birth_month, :birth_day, :birth_year, :birth_date_precision,
        :email, :profession, :company_legal_name, :address, :number, '',
        :neighborhood, :zip_code, :city, :uf, :notes, :tags,
        '', '', :import_id, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    name: mapped.name,
    contact_type: normalized.contactType,
    segment: normalized.segment,
    phone: normalized.phone,
    whatsapp: normalized.whatsapp,
    cpf_rg_cns: normalized.cpf,
    birth_date: normalized.birthday.fullDate,
    birth_month: normalized.birthday.month || null,
    birth_day: normalized.birthday.day || null,
    birth_year: normalized.birthday.year || null,
    birth_date_precision: normalized.birthday.precision || "",
    email: normalized.email,
    profession: mapped.profession || "",
    company_legal_name: mapped.company_legal_name || "",
    address: mapped.address || "",
    number: mapped.number || "",
    neighborhood: mapped.neighborhood || "",
    zip_code: mapped.zip_code || "",
    city: mapped.city || "",
    uf: mapped.uf || "",
    notes: normalized.notes || "Contato importado de planilha.",
    tags: normalized.tags,
    import_id: parseInteger(normalized.importId, 0) || null,
    created_at: normalized.timestamp,
    updated_at: normalized.timestamp,
  });
  return Number(created.lastInsertRowid);
}

function insertImportContactSnapshot(db, gabineteId, importId, contact, timestamp) {
  const normalizedImportId = parseInteger(importId, 0);
  if (!normalizedImportId || !contact?.id) return;
  db.prepare(
    `
      INSERT OR IGNORE INTO import_contact_snapshots (
        gabinete_id, import_id, contact_id, snapshot_json, created_at
      ) VALUES (
        :gabinete_id, :import_id, :contact_id, :snapshot_json, :created_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    import_id: normalizedImportId,
    contact_id: contact.id,
    snapshot_json: JSON.stringify(contact),
    created_at: timestamp,
  });
}

function findDuplicateContact(db, gabineteId, mapped, normalized = {}, options = {}) {
  const identity = buildImportIdentityData(mapped, normalized, options);
  const scored = findIdentityCandidates(db, gabineteId, identity, options)
    .map((candidate) => scoreIdentityCandidate(candidate, mapped, identity, options))
    .filter((candidate) => candidate.score >= IDENTITY_REVIEW_MEDIUM_SCORE || candidate.hasStrongIdentifier)
    .sort((a, b) => b.score - a.score || a.contact.id - b.contact.id);
  if (!scored.length) return null;

  const top = scored[0];
  const second = scored[1] || null;
  const decision = classifyIdentityDecision(top, second);
  if (decision === "separate") return null;

  return decorateIdentityMatch(top.contact, top, decision);
}

function buildImportIdentityData(mapped, normalized = {}, options = {}) {
  const phoneCandidates = buildPhoneLookupValues(mapped, options, normalized.phone, normalized.whatsapp);
  const emailCandidates = buildEmailLookupValues(mapped, normalized.email);
  const storedDocument = normalized.cpf ?? normalizeImportDocument(mapped.cpf_rg_cns);
  const identityDocument = normalizeIdentityDocument(storedDocument);
  const birthday = normalized.birthday || parseImportBirthday(mapped);
  return {
    phoneCandidates,
    emailCandidates,
    storedDocument,
    identityDocument,
    birthday,
    nameKey: normalizeNameForComparison(mapped.name),
    nameTokens: tokenizeName(mapped.name),
    addressKey: normalizeAddressForComparison(mapped),
    cityKey: normalizeComparableText(mapped.city),
    neighborhoodKey: normalizeComparableText(mapped.neighborhood),
    hasPhone: phoneCandidates.length > 0,
    hasEmail: emailCandidates.length > 0,
    hasDocument: Boolean(identityDocument),
  };
}

function findIdentityCandidates(db, gabineteId, identity, options = {}) {
  const conditions = [];
  const params = { gabinete_id: gabineteId };

  if (identity.phoneCandidates.length) {
    const placeholders = identity.phoneCandidates.map((value, index) => {
      const key = `phone_${index}`;
      params[key] = value;
      return `:${key}`;
    });
    conditions.push(`(phone IN (${placeholders.join(", ")}) OR whatsapp IN (${placeholders.join(", ")}))`);
  }

  if (identity.identityDocument) {
    params.cpf = identity.identityDocument;
    conditions.push("cpf_rg_cns = :cpf");
  }

  if (identity.emailCandidates.length) {
    const placeholders = identity.emailCandidates.map((value, index) => {
      const key = `email_${index}`;
      params[key] = value;
      return `:${key}`;
    });
    conditions.push(`lower(email) IN (${placeholders.join(", ")})`);
  }

  if (identity.birthday.month && identity.birthday.day) {
    params.birth_month = identity.birthday.month;
    params.birth_day = identity.birthday.day;
    params.birth_mmdd = `${String(identity.birthday.month).padStart(2, "0")}-${String(identity.birthday.day).padStart(2, "0")}`;
    conditions.push("((birth_month = :birth_month AND birth_day = :birth_day) OR substr(birth_date, 6, 5) = :birth_mmdd)");
  }

  if (identity.cityKey && identity.neighborhoodKey) {
    params.city_key = identity.cityKey;
    params.neighborhood_key = identity.neighborhoodKey;
    conditions.push("(lower(city) = :city_key AND lower(neighborhood) = :neighborhood_key)");
  }

  if (!conditions.length) return [];

  return db
    .prepare(
      `
        SELECT *
        FROM contacts
        WHERE gabinete_id = :gabinete_id
          AND (deleted_at IS NULL OR deleted_at = '')
          AND (${conditions.join(" OR ")})
        ORDER BY updated_at DESC, id DESC
        LIMIT 120
      `,
    )
    .all(params);
}

function scoreIdentityCandidate(existing, mapped, identity, options = {}) {
  let score = 0;
  const reasons = [];
  const flags = {
    hasStrongIdentifier: false,
    hasDocumentMatch: false,
    hasPhoneMatch: false,
    hasEmailMatch: false,
    hasHardConflict: false,
    hasSoftConflict: false,
    namesCompatible: false,
    exactNameBirthday: false,
    oneRecordPoor: false,
  };
  let matchKind = "identity";
  let matchValue = "";

  const existingDocument = normalizeIdentityDocument(existing.cpf_rg_cns);
  if (identity.identityDocument && existingDocument) {
    if (identity.identityDocument === existingDocument) {
      score += 100;
      flags.hasStrongIdentifier = true;
      flags.hasDocumentMatch = true;
      matchKind = "cpf";
      matchValue = identity.identityDocument;
      reasons.push("CPF/CNPJ igual");
    } else {
      flags.hasHardConflict = true;
      reasons.push("CPF/CNPJ diferente");
    }
  }

  const existingPhoneVariants = new Set([
    ...phoneLookupVariants(existing.phone, options),
    ...phoneLookupVariants(existing.whatsapp, options),
  ]);
  const matchedPhone = identity.phoneCandidates.find((value) => existingPhoneVariants.has(value));
  if (matchedPhone) {
    const phoneScore = isLikelyFixedPhone(matchedPhone) ? 60 : 75;
    score += phoneScore;
    flags.hasStrongIdentifier = true;
    flags.hasPhoneMatch = true;
    if (!flags.hasDocumentMatch) {
      matchKind = "phone";
      matchValue = matchedPhone;
    }
    reasons.push(phoneScore === 60 ? "Telefone fixo igual" : "Celular/WhatsApp igual");
  }

  const existingEmail = normalizeEmail(existing.email);
  const matchedEmail = identity.emailCandidates.find((value) => value === existingEmail);
  if (matchedEmail) {
    score += 80;
    flags.hasStrongIdentifier = true;
    flags.hasEmailMatch = true;
    if (!flags.hasDocumentMatch && !flags.hasPhoneMatch) {
      matchKind = "email";
      matchValue = matchedEmail;
    }
    reasons.push("E-mail igual");
  }

  const name = compareContactNames(existing.name, mapped.name);
  if (name.level === "exact") {
    score += 40;
    flags.namesCompatible = true;
    reasons.push("Nome igual");
  } else if (name.level === "compatible") {
    score += 32;
    flags.namesCompatible = true;
    reasons.push("Nome compativel");
  } else if (name.level === "similar") {
    score += 25;
    flags.namesCompatible = true;
    reasons.push("Nome parecido");
  } else if (name.level === "different") {
    if (flags.hasStrongIdentifier) {
      flags.hasSoftConflict = true;
      reasons.push("Nome diferente, exige revisao");
    } else {
      score -= 35;
      reasons.push("Nome diferente");
    }
  }

  const birthday = compareBirthdays(extractContactBirthday(existing), identity.birthday);
  if (birthday.level === "full") {
    score += 35;
    reasons.push("Aniversario completo igual");
  } else if (birthday.level === "partial") {
    score += 25;
    reasons.push("Dia e mes de aniversario iguais");
  } else if (birthday.level === "conflict") {
    flags.hasSoftConflict = true;
    score -= flags.hasStrongIdentifier ? 0 : 50;
    reasons.push("Aniversario conflitante");
  }

  const existingAddressKey = normalizeAddressForComparison(existing);
  if (identity.addressKey && existingAddressKey && identity.addressKey === existingAddressKey) {
    score += 25;
    reasons.push("Endereco forte igual");
  } else if (
    identity.cityKey &&
    identity.neighborhoodKey &&
    identity.cityKey === normalizeComparableText(existing.city) &&
    identity.neighborhoodKey === normalizeComparableText(existing.neighborhood)
  ) {
    score += 8;
    reasons.push("Bairro/cidade iguais");
  }

  flags.exactNameBirthday = name.level === "exact" && ["full", "partial"].includes(birthday.level);
  flags.oneRecordPoor = oneRecordCompletesTheOther(existing, identity);
  if (flags.oneRecordPoor && flags.exactNameBirthday) {
    score += 15;
    reasons.push("Um cadastro pobre completa o outro");
  }

  if (!matchValue && flags.exactNameBirthday) {
    matchKind = birthday.level === "full" ? "name_birthday" : "name_birthday_partial";
    matchValue = `${identity.nameKey}|${birthday.value}`;
  }

  return {
    contact: existing,
    score: Math.max(0, score),
    matchKind,
    matchValue,
    reasons,
    ...flags,
  };
}

function shouldCreateMergeSuggestion(existing, mapped) {
  return existing._identity_decision === "suggest";
}

function classifyIdentityDecision(top, second) {
  if (!top || top.hasHardConflict) return "separate";

  const ambiguous = second && second.score >= IDENTITY_REVIEW_MEDIUM_SCORE && second.score >= top.score - IDENTITY_AMBIGUITY_GAP;
  if (ambiguous) {
    top.reasons.push("Ha outro candidato parecido; revisao obrigatoria");
    return "suggest";
  }

  if (top.hasDocumentMatch && !top.hasHardConflict) return "auto";

  if ((top.hasPhoneMatch || top.hasEmailMatch) && top.namesCompatible && !top.hasSoftConflict) {
    return "auto";
  }

  if (top.exactNameBirthday && top.oneRecordPoor && !top.hasSoftConflict) {
    return "auto";
  }

  if (top.score >= IDENTITY_AUTO_SCORE && !top.hasSoftConflict) return "auto";
  if (top.score >= IDENTITY_REVIEW_MEDIUM_SCORE) return "suggest";
  return "separate";
}

function decorateIdentityMatch(contact, scored, decision) {
  return {
    ...contact,
    _match_kind: scored.matchKind,
    _match_value: scored.matchValue,
    _identity_score: scored.score,
    _identity_confidence: decision === "auto" ? "auto" : (scored.score >= IDENTITY_REVIEW_STRONG_SCORE ? "strong" : "medium"),
    _identity_reasons: scored.reasons,
    _identity_decision: decision,
  };
}

function normalizeNameForComparison(value) {
  return normalizeHeader(value)
    .split(" ")
    .filter((token) => token && !["de", "da", "do", "das", "dos", "e"].includes(token))
    .join(" ");
}

function tokenizeName(value) {
  return normalizeNameForComparison(value).split(" ").filter(Boolean);
}

function compareContactNames(existingName, incomingName) {
  const existing = normalizeNameForComparison(existingName);
  const incoming = normalizeNameForComparison(incomingName);
  if (!existing || !incoming) return { level: "unknown" };
  if (existing === incoming) return { level: "exact" };

  const existingTokens = tokenizeName(existingName);
  const incomingTokens = tokenizeName(incomingName);
  if (isTokenSubset(existingTokens, incomingTokens) || isTokenSubset(incomingTokens, existingTokens)) {
    return { level: "compatible" };
  }
  if (nameSimilarity(existing, incoming) >= 0.88 || tokenOverlap(existingTokens, incomingTokens) >= 0.67) {
    return { level: "similar" };
  }
  return { level: "different" };
}

function isTokenSubset(a, b) {
  if (!a.length || !b.length) return false;
  const larger = new Set(b);
  return a.every((token) => larger.has(token));
}

function tokenOverlap(a, b) {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  const shared = a.filter((token) => bSet.has(token)).length;
  return shared / Math.max(a.length, b.length);
}

function nameSimilarity(a, b) {
  const maxLength = Math.max(a.length, b.length);
  if (!maxLength) return 0;
  return (maxLength - levenshteinDistance(a, b)) / maxLength;
}

function levenshteinDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = temp;
    }
  }
  return previous[b.length];
}

function normalizeIdentityDocument(value) {
  const digits = normalizeImportDigits(value);
  if (![11, 14].includes(digits.length)) return "";
  if (digits.length === 11) return isValidCpf(digits) ? digits : "";
  if (digits.length === 14) return isValidCnpj(digits) ? digits : "";
  return digits;
}

function hasInvalidCpfCnpj(value) {
  const digits = normalizeImportDigits(value);
  if (!digits) return false;
  if (digits.length === 11) return !isValidCpf(digits);
  if (digits.length === 14) return !isValidCnpj(digits);
  if (digits.length === 12 || digits.length === 13) return true;
  return false;
}

function normalizeImportDocument(value) {
  const digits = normalizeImportDigits(value);
  if (digits.length === 11 && isValidCpf(digits)) return digits;
  if (digits.length === 14 && isValidCnpj(digits)) return digits;
  return String(value || "").trim();
}

function extractContactBirthday(contact = {}) {
  const fullDate = normalizeDate(contact.birth_date);
  const month = parseInteger(contact.birth_month) || (fullDate ? Number(fullDate.slice(5, 7)) : 0);
  const day = parseInteger(contact.birth_day) || (fullDate ? Number(fullDate.slice(8, 10)) : 0);
  const year = parseInteger(contact.birth_year) || (fullDate ? Number(fullDate.slice(0, 4)) : 0);
  return {
    fullDate,
    month,
    day,
    year,
    precision: contact.birth_date_precision || (fullDate ? "full" : (month && day ? "month_day" : "")),
  };
}

function compareBirthdays(existing, incoming) {
  if (!existing?.month || !existing?.day || !incoming?.month || !incoming?.day) return { level: "unknown", value: "" };
  if (existing.month !== incoming.month || existing.day !== incoming.day) return { level: "conflict", value: "" };
  if (existing.fullDate && incoming.fullDate) {
    return existing.fullDate === incoming.fullDate
      ? { level: "full", value: existing.fullDate }
      : { level: "conflict", value: "" };
  }
  if (existing.year && incoming.year && existing.year !== incoming.year) return { level: "conflict", value: "" };
  return {
    level: existing.year && incoming.year ? "full" : "partial",
    value: `${String(existing.month).padStart(2, "0")}-${String(existing.day).padStart(2, "0")}`,
  };
}

function normalizeAddressForComparison(value = {}) {
  return [
    value.address,
    value.number,
    value.neighborhood,
    value.city,
    value.uf,
    normalizePhone(value.zip_code || ""),
  ].map(normalizeComparableText).filter(Boolean).join("|");
}

function oneRecordCompletesTheOther(existing, identity) {
  const existingHasStrongData = Boolean(
    existing.phone || existing.whatsapp || existing.email || normalizeIdentityDocument(existing.cpf_rg_cns),
  );
  const incomingHasStrongData = Boolean(identity.hasPhone || identity.hasEmail || identity.hasDocument);
  return existingHasStrongData !== incomingHasStrongData;
}

function isLikelyFixedPhone(value) {
  const digits = normalizePhone(value);
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  const subscriber = local.length >= 10 ? local.slice(2) : local;
  return subscriber.length === 8 && /^[2-5]/.test(subscriber);
}

function loadExistingSuggestionPairKeys(db, gabineteId) {
  const rows = db
    .prepare(
      `
        SELECT existing_contact_id, imported_contact_id
        FROM contact_merge_suggestions
        WHERE gabinete_id = :gabinete_id
          AND status IN ('pending', 'ignored')
      `,
    )
    .all({ gabinete_id: gabineteId });
  return new Set(rows.map((row) => buildPairKey(row.existing_contact_id, row.imported_contact_id)));
}

function buildExistingContactCandidatePairs(contacts, options = {}) {
  const blocks = new Map();
  contacts.forEach((contact) => {
    buildContactBlockingKeys(contact, options).forEach((key) => {
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push(contact.id);
    });
  });

  const pairs = new Set();
  blocks.forEach((ids) => {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length < 2 || uniqueIds.length > 80) return;
    for (let i = 0; i < uniqueIds.length; i += 1) {
      for (let j = i + 1; j < uniqueIds.length; j += 1) {
        pairs.add(buildPairKey(uniqueIds[i], uniqueIds[j]));
      }
    }
  });

  return [...pairs].map((key) => key.split(":").map(Number));
}

function buildContactBlockingKeys(contact, options = {}) {
  const mapped = contactToImportMapped(contact);
  const identity = buildImportIdentityData(mapped, {
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    cpf: contact.cpf_rg_cns,
    email: contact.email,
    birthday: extractContactBirthday(contact),
  }, options);
  const keys = [];
  if (identity.identityDocument) keys.push(`doc:${identity.identityDocument}`);
  identity.emailCandidates.forEach((email) => keys.push(`email:${email}`));
  identity.phoneCandidates.slice(0, 8).forEach((phone) => keys.push(`phone:${phone}`));
  if (identity.nameKey && identity.birthday.month && identity.birthday.day) {
    keys.push(`name_birth:${identity.nameKey}:${identity.birthday.month}:${identity.birthday.day}`);
  }
  if (identity.nameKey && identity.cityKey && identity.neighborhoodKey) {
    keys.push(`name_place:${identity.nameKey}:${identity.cityKey}:${identity.neighborhoodKey}`);
  }
  return uniqueTextBlocks(keys);
}

function buildPairKey(a, b) {
  const first = Number(a);
  const second = Number(b);
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function chooseMergeDirection(left, right) {
  const leftScore = contactCompletenessScore(left);
  const rightScore = contactCompletenessScore(right);
  if (leftScore !== rightScore) {
    return leftScore > rightScore ? { target: left, source: right } : { target: right, source: left };
  }
  return left.id < right.id ? { target: left, source: right } : { target: right, source: left };
}

function contactCompletenessScore(contact) {
  return [
    contact.phone,
    contact.whatsapp,
    contact.email,
    contact.cpf_rg_cns,
    contact.birth_date || (contact.birth_month && contact.birth_day ? "birthday" : ""),
    contact.address,
    contact.neighborhood,
    contact.city,
    contact.notes,
  ].filter((value) => String(value ?? "").trim() !== "").length;
}

function contactToImportMapped(contact = {}) {
  return {
    name: contact.name || "",
    phone: contact.phone || "",
    whatsapp: contact.whatsapp || "",
    cpf_rg_cns: contact.cpf_rg_cns || "",
    birth_date: contact.birth_date || "",
    birth_month: contact.birth_month || "",
    birth_day: contact.birth_day || "",
    birth_year: contact.birth_year || "",
    birth_date_precision: contact.birth_date_precision || "",
    email: contact.email || "",
    profession: contact.profession || "",
    company_legal_name: contact.company_legal_name || "",
    address: contact.address || "",
    number: contact.number || "",
    neighborhood: contact.neighborhood || "",
    zip_code: contact.zip_code || "",
    city: contact.city || "",
    uf: contact.uf || "",
    notes: contact.notes || "",
    tags: contact.tags || "",
  };
}

function insertContactMergeSuggestion(db, gabineteId, importId, existing, imported) {
  const inserted = db.prepare(
    `
      INSERT INTO contact_merge_suggestions (
        gabinete_id, import_id, existing_contact_id, imported_contact_id,
        match_kind, match_value, existing_name, imported_name,
        match_score, confidence, reasons_json, status, created_at, updated_at
      ) VALUES (
        :gabinete_id, :import_id, :existing_contact_id, :imported_contact_id,
        :match_kind, :match_value, :existing_name, :imported_name,
        :match_score, :confidence, :reasons_json, 'pending', :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: gabineteId,
    import_id: importId || null,
    existing_contact_id: existing.id,
    imported_contact_id: imported.id,
    match_kind: imported.match_kind || "phone",
    match_value: imported.match_value || "",
    existing_name: existing.name || "",
    imported_name: imported.name || "",
    match_score: Number(imported.match_score || 0),
    confidence: imported.confidence || "medium",
    reasons_json: JSON.stringify(imported.reasons || []),
    created_at: imported.timestamp,
    updated_at: imported.timestamp,
  });
  return {
    id: Number(inserted.lastInsertRowid),
    existing_contact_id: existing.id,
    imported_contact_id: imported.id,
    match_kind: imported.match_kind || "phone",
    match_value: imported.match_value || "",
    existing_name: existing.name || "",
    imported_name: imported.name || "",
    match_score: Number(imported.match_score || 0),
    confidence: imported.confidence || "medium",
    reasons: imported.reasons || [],
  };
}

function buildImportIdentityKey(mapped, options = {}) {
  const phone = buildPhoneLookupValues(mapped, options)[0];
  if (phone) return `phone:${phone}`;
  const cpf = normalizeImportDocument(mapped.cpf_rg_cns);
  if (cpf) return `cpf:${cpf}`;
  const email = buildEmailLookupValues(mapped)[0];
  if (email) return `email:${email}`;
  return "";
}

function buildPhoneLookupValues(mapped, options = {}, ...extraValues) {
  return uniqueTextBlocks([
    mapped.phone,
    mapped.whatsapp,
    mapped._phone_lookup,
    ...extraValues,
  ].flatMap(splitLookupValues).flatMap((value) => phoneLookupVariants(value, options)));
}

function buildEmailLookupValues(mapped, ...extraValues) {
  return uniqueTextBlocks([
    mapped.email,
    mapped._email_lookup,
    ...extraValues,
  ].flatMap(splitLookupValues).map(normalizeEmail).filter(Boolean));
}

function splitLookupValues(value) {
  return String(value || "")
    .split(/\s*\|\s*|[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeImportedPhone(value, options = {}) {
  const normalized = normalizeBrazilianPhoneForImport(value, options);
  return normalized.canonical || "";
}

function phoneLookupVariants(value, options = {}) {
  return normalizeBrazilianPhoneForImport(value, options).variants;
}

function normalizeBrazilianPhoneForImport(value, options = {}) {
  const raw = normalizeImportDigits(value);
  if (!raw) return { canonical: "", variants: [], kind: "" };

  const countryCode = options.default_country_code || "55";
  const candidates = buildBrazilianPhoneCandidates(raw, countryCode);
  const variants = new Set(candidates);
  let canonical = "";
  let kind = "";

  candidates.forEach((candidate) => {
    const local = stripBrazilCountryCode(candidate, countryCode);
    variants.add(local);
    if (local !== candidate) variants.add(candidate);

    const normalizedLocal = normalizeBrazilianLocalPhone(local, options.default_area_code);
    normalizedLocal.variants.forEach((item) => {
      variants.add(item);
      if (item.length === 10 || item.length === 11) variants.add(`${countryCode}${item}`);
    });

    if (!canonical && normalizedLocal.local) {
      canonical = `${countryCode}${normalizedLocal.local}`;
      kind = normalizedLocal.kind;
    }
  });

  if (canonical) variants.add(canonical);
  return {
    canonical,
    kind,
    variants: uniqueTextBlocks([...variants].filter(Boolean)),
  };
}

function normalizeImportDigits(value) {
  const normalizedNumber = normalizeImportNumericText(value);
  return normalizePhone(normalizedNumber || value);
}

function normalizeImportNumericText(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.replace(",", ".");
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(normalized)) {
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && Number.isSafeInteger(Math.round(parsed))) {
      return String(Math.round(parsed));
    }
  }
  if (/^\d+\.0+$/.test(normalized)) {
    return normalized.slice(0, normalized.indexOf("."));
  }
  return "";
}

function normalizeImportTicketNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return (normalizeImportNumericText(raw) || raw).replace(/\s+/g, " ").slice(0, 80);
}

function resolveImportedTicketResult(mapped = {}, isClosed = false) {
  const explicitResult = String(mapped.result || "").trim();
  if (explicitResult) return explicitResult;
  const guidance = String(mapped.guidance || "").trim();
  if (isClosed && guidance) return guidance;
  if (isClosed) return "Atendimento finalizado na planilha importada.";
  return "";
}

function buildBrazilianPhoneCandidates(raw, countryCode = "55") {
  const digits = String(raw || "");
  const candidates = new Set([digits]);
  if (digits.startsWith("0")) candidates.add(digits.slice(1));

  const withoutCountry = stripBrazilCountryCode(digits, countryCode);
  candidates.add(withoutCountry);
  if (withoutCountry.startsWith("0")) candidates.add(withoutCountry.slice(1));

  [
    digits,
    withoutCountry,
    digits.startsWith("0") ? digits.slice(1) : "",
    withoutCountry.startsWith("0") ? withoutCountry.slice(1) : "",
  ].filter(Boolean).forEach((candidate) => {
    const withoutCarrier = stripBrazilCarrierPrefix(candidate);
    if (withoutCarrier && withoutCarrier !== candidate) candidates.add(withoutCarrier);
  });

  return uniqueTextBlocks([...candidates].filter(Boolean));
}

function stripBrazilCarrierPrefix(digits) {
  const raw = String(digits || "");
  if (!raw.startsWith("0")) return raw;
  const noLeadingZero = raw.slice(1);
  if (noLeadingZero.length === 12 || noLeadingZero.length === 13) {
    const carrier = noLeadingZero.slice(0, 2);
    const areaCode = noLeadingZero.slice(2, 4);
    const subscriber = noLeadingZero.slice(4);
    if (isKnownBrazilCarrierCode(carrier) && isPlausibleBrazilAreaCode(areaCode) && (subscriber.length === 8 || subscriber.length === 9)) {
      return `${areaCode}${subscriber}`;
    }
  }
  return raw;
}

function isKnownBrazilCarrierCode(value) {
  return BRAZIL_CARRIER_CODES.has(String(value || ""));
}

function isPlausibleBrazilAreaCode(value) {
  return /^[1-9][1-9]$/.test(String(value || ""));
}

function normalizeBrazilianLocalPhone(digits, defaultAreaCode = "") {
  const raw = String(digits || "");
  const variants = new Set([raw]);

  if ((raw.length === 8 || raw.length === 9) && defaultAreaCode) {
    const subscriber = normalizeBrazilianSubscriber(raw);
    if (subscriber.value) {
      const local = `${defaultAreaCode}${subscriber.value}`;
      variants.add(local);
      return { local, kind: subscriber.kind, variants: [...variants] };
    }
    return { local: "", kind: "invalid", variants: [...variants] };
  }

  if (raw.length === 10 || raw.length === 11) {
    const areaCode = raw.slice(0, 2);
    const subscriber = normalizeBrazilianSubscriber(raw.slice(2));
    if (subscriber.value) {
      const local = `${areaCode}${subscriber.value}`;
      variants.add(local);
      return { local, kind: subscriber.kind, variants: [...variants] };
    }
  }

  return { local: "", kind: raw ? "invalid" : "", variants: [...variants] };
}

function analyzeMappedImportPhone(mapped, options = {}) {
  const value = splitLookupValues([mapped.phone, mapped.whatsapp, mapped._phone_lookup].join(" | "))[0];
  if (!value) return { kind: "" };
  const normalized = normalizeBrazilianPhoneForImport(value, options);
  return { kind: normalized.kind || "invalid" };
}

function normalizeBrazilianSubscriber(value) {
  const subscriber = String(value || "");
  if (subscriber.length === 8) {
    if (/^[2-5]/.test(subscriber)) return { value: subscriber, kind: "fixed" };
    if (/^[6-9]/.test(subscriber)) return { value: `9${subscriber}`, kind: "legacy_mobile" };
    return { value: "", kind: "invalid" };
  }
  if (subscriber.length === 9) {
    return subscriber.startsWith("9")
      ? { value: subscriber, kind: "mobile" }
      : { value: "", kind: "invalid" };
  }
  return { value: "", kind: "invalid" };
}

function stripBrazilCountryCode(digits, countryCode = "55") {
  const raw = String(digits || "");
  if ((raw.length === 12 || raw.length === 13) && raw.startsWith(countryCode)) {
    return raw.slice(countryCode.length);
  }
  return raw;
}

function normalizeImportOptions(options = {}) {
  const defaultAreaCode = normalizePhone(options.default_area_code || options.defaultAreaCode || "").slice(0, 2);
  return {
    default_area_code: defaultAreaCode.length === 2 ? defaultAreaCode : "",
    default_country_code: normalizePhone(options.default_country_code || options.defaultCountryCode || "55") || "55",
  };
}

function duplicateWouldChange(existing, incoming) {
  const fillOnlyFields = [
    "name",
    "contact_type",
    "segment",
    "phone",
    "whatsapp",
    "cpf_rg_cns",
    "birth_date",
    "birth_month",
    "birth_day",
    "birth_year",
    "birth_date_precision",
    "email",
    "profession",
    "company_legal_name",
    "address",
    "number",
    "neighborhood",
    "zip_code",
    "city",
    "uf",
  ];
  if (fillOnlyFields.some((field) => isBlank(existing[field]) && !isBlank(incoming[field]))) return true;
  if (normalizeComparableText(existing.notes) !== normalizeComparableText(incoming.notes)) return true;
  if (normalizeComparableText(existing.tags) !== normalizeComparableText(incoming.tags)) return true;
  return false;
}

function buildAdditionalImportNotes(existing, incoming) {
  const additions = [];
  addIfDifferent(additions, "Nome no arquivo", existing.name, incoming.name);
  addPhoneIfDifferent(additions, "Telefone no arquivo", existing.phone, incoming.phone);
  addPhoneIfDifferent(additions, "WhatsApp no arquivo", existing.whatsapp, incoming.whatsapp);
  addIfDifferent(additions, "E-mail no arquivo", existing.email, incoming.email, normalizeEmail);
  addIfDifferent(additions, "Profissao no arquivo", existing.profession, incoming.profession);
  addIfDifferent(additions, "Empresa no arquivo", existing.company_legal_name, incoming.company_legal_name);
  addIfDifferent(additions, "Endereco no arquivo", existing.address, incoming.address);
  addIfDifferent(additions, "Numero no arquivo", existing.number, incoming.number);
  addIfDifferent(additions, "Bairro no arquivo", existing.neighborhood, incoming.neighborhood);
  addIfDifferent(additions, "CEP no arquivo", existing.zip_code, incoming.zip_code, normalizePhone);
  addIfDifferent(additions, "Cidade no arquivo", existing.city, incoming.city);
  addIfDifferent(additions, "UF no arquivo", existing.uf, incoming.uf);

  const existingBirthday = existing.birth_date || (
    existing.birth_month && existing.birth_day ? `${existing.birth_month}/${existing.birth_day}` : ""
  );
  const incomingBirthday = incoming.birth_date || (
    incoming.birth_month && incoming.birth_day ? `${incoming.birth_month}/${incoming.birth_day}` : ""
  );
  addIfDifferent(additions, "Aniversario no arquivo", existingBirthday, incomingBirthday);

  return additions.length ? `Dados adicionais da importacao:\n${additions.join("\n")}` : "";
}

function addIfDifferent(additions, label, existing, incoming, normalizer = normalizeComparableText) {
  if (isBlank(incoming) || isBlank(existing)) return;
  if (normalizer(existing) === normalizer(incoming)) return;
  additions.push(`- ${label}: ${incoming}`);
}

function addPhoneIfDifferent(additions, label, existing, incoming) {
  if (isBlank(incoming) || isBlank(existing)) return;
  const existingVariants = new Set(phoneLookupVariants(existing));
  if (phoneLookupVariants(incoming).some((value) => existingVariants.has(value))) return;
  additions.push(`- ${label}: ${incoming}`);
}

function isBlank(value) {
  return String(value ?? "").trim() === "";
}

function normalizeComparableText(value) {
  return normalizeHeader(String(value || "").replace(/\s+/g, " "));
}

function normalizeDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const number = Number(raw);
    if (number > 20000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(epoch.getTime() + number * 24 * 60 * 60 * 1000);
      return toInputDate(date.toISOString());
    }
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return toInputDate(date.toISOString());
}

function parseImportBirthday(mapped) {
  const fullDate = normalizeDate(mapped.birth_date);
  const monthFromField = parseInteger(mapped.birth_month);
  const dayFromField = parseInteger(mapped.birth_day);
  const yearFromField = parseInteger(mapped.birth_year);

  if (fullDate) {
    return {
      fullDate,
      year: Number(fullDate.slice(0, 4)),
      month: Number(fullDate.slice(5, 7)),
      day: Number(fullDate.slice(8, 10)),
      precision: "full",
    };
  }

  if (isValidMonthDay(monthFromField, dayFromField)) {
    const normalizedMonth = String(monthFromField).padStart(2, "0");
    const normalizedDay = String(dayFromField).padStart(2, "0");
    return {
      fullDate: yearFromField ? `${yearFromField}-${normalizedMonth}-${normalizedDay}` : "",
      year: yearFromField || 0,
      month: monthFromField,
      day: dayFromField,
      precision: mapped.birth_date_precision || (yearFromField ? "full" : "month_day"),
    };
  }

  return {
    fullDate: "",
    year: 0,
    month: 0,
    day: 0,
    precision: "",
  };
}

function buildContactNotes(mapped, normalized = {}) {
  return uniqueTextBlocks([
    mapped.notes,
    mapped.guidance ? `Historico importado: ${mapped.guidance}` : "",
    mapped.phone && !normalized.phone ? `Telefone para revisao: ${mapped.phone}` : "",
    mapped.whatsapp && mapped.whatsapp !== mapped.phone && !normalized.whatsapp
      ? `WhatsApp para revisao: ${mapped.whatsapp}`
      : "",
  ]).join("\n\n");
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return isValidEmail(email) ? email : "";
}

function normalizeImportTags(value) {
  const tags = uniqueTextBlocks(
    String(value || "")
      .split(/[,;]/)
      .map((item) => normalizeTag(item))
      .filter(Boolean),
  );
  return tags.join(",");
}

function normalizeTag(value) {
  return String(value || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

function mergeTextBlocks(...blocks) {
  return uniqueTextBlocks(blocks).join("\n\n");
}

function mergeTags(existing, incoming) {
  return uniqueTextBlocks(
    [existing, incoming]
      .flatMap((value) => String(value || "").split(/[,;]/))
      .map((item) => normalizeTag(item))
      .filter(Boolean),
  ).join(",");
}

function uniqueTextBlocks(values) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const text = String(value || "").trim();
    if (!text) return;
    const key = normalizeHeader(text);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
}

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function matchUser(users, value) {
  if (!value) return null;
  const normalized = normalizeHeader(value);
  return (
    users.find((user) => normalizeHeader(user.name) === normalized) ||
    users.find((user) => normalizeHeader(user.username) === normalized) ||
    users.find((user) => normalizeHeader(user.name).includes(normalized))
  );
}

function matchStatus(statusRows, value) {
  if (!value) return "";
  const normalized = normalizeHeader(value);
  return (
    statusRows.find((status) => normalizeHeader(status.name) === normalized)?.name ||
    statusRows.find((status) => normalizeHeader(status.name).includes(normalized))?.name ||
    (normalized === "aberto" ? statusRows.find((status) => normalizeHeader(status.name) === "novo")?.name : "") ||
    (normalized.includes("solucao") ? (
      statusRows.find((status) => normalizeHeader(status.name).includes("aguardando servico"))?.name ||
      statusRows.find((status) => normalizeHeader(status.name).includes("aguardando retorno"))?.name
    ) : "") ||
    (normalized.includes("urgente") ? statusRows.find((status) => normalizeHeader(status.name) === "novo")?.name : "") ||
    ""
  );
}

function inferImportedPriority(value) {
  return normalizeHeader(value).includes("urgente") ? "Urgente" : "Normal";
}

function isFinalStatus(statusRows, statusName) {
  return Boolean(statusRows.find((status) => status.name === statusName)?.is_final);
}

function inferCategory(title) {
  const normalized = normalizeHeader(title);
  if (normalized.includes("arvore") || normalized.includes("poda")) return "Poda de arvore";
  if (normalized.includes("asfalto") || normalized.includes("buraco") || normalized.includes("valeta")) return "Obras";
  if (normalized.includes("luz") || normalized.includes("ilumin")) return "Iluminacao publica";
  if (normalized.includes("saude") || normalized.includes("consulta") || normalized.includes("remedio")) return "Saude";
  if (normalized.includes("emprego") || normalized.includes("curriculo")) return "Emprego";
  return "Outros";
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Copy,
  CheckCircle2,
  EyeOff,
  ExternalLink,
  FileText,
  KeyRound,
  Info,
  MapPin,
  MessageCircle,
  NotebookPen,
  Paperclip,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  X,
} from "lucide-react";

import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { AppEmptyState, AppListSkeleton } from "@/components/workspace/primitives";
import {
  ActionCluster,
  Field,
  SectionCard,
  TimelineList,
} from "@/components/workspace/data-ui";
import { useMunicipalityOptions, useUfOptions } from "@/hooks/use-lookups";
import { fetchJson } from "@/lib/api";
import { showTrashUndoToast } from "@/lib/trash-undo";
import {
  buildWhatsAppUrl,
  cn,
  currentDate,
  formatCepInput,
  formatCpfCnpjInput,
  getCpfCnpjValidationMessage,
  formatPhoneDisplay,
  formatPhoneInput,
  matchesSearchQuery,
  normalizeSearchText,
  onlyDigits,
} from "@/lib/utils";

const CREATE_NEW_OPTION = "__create_new__";
const TICKET_ATTACHMENT_ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const TICKET_ATTACHMENT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const TICKET_ATTACHMENT_MAX_FILES = 5;
const TICKET_ATTACHMENT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TICKET_ATTACHMENT_MAX_PDF_BYTES = 10 * 1024 * 1024;
const TICKET_ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const CONTACT_NAME_MAX_LENGTH = 60;
const CONTACT_NICKNAME_MAX_LENGTH = 30;
const AI_TEXT_MIN_LENGTH = 30;
const TICKET_LOAD_LIMIT = 100;
const TICKET_LOAD_ALL_CONFIRM_LIMIT = 1000;
const DEFAULT_TICKET_RETURN_ACTION = "Retorno";
const DEMAND_TITLE_ALIASES: Record<string, string> = {
  mato: "Corte de mato",
  "cortar mato": "Corte de mato",
  "corte mato": "Corte de mato",
  "limpeza de mato": "Corte de mato",
  "entrar em contato": "Retorno ao munícipe",
  "retornar contato": "Retorno ao munícipe",
  "retorno ao municipe": "Retorno ao munícipe",
  "ligar para municipe": "Retorno ao munícipe",
  "mandar whatsapp": "Retorno ao munícipe",
  "falar com municipe": "Retorno ao munícipe",
  "contato com assessoria": "Contato com assessoria",
  "entrar em contato com assessoria": "Contato com assessoria",
  "falar com assessoria": "Contato com assessoria",
  "curriculo para encaminhamento": "Currículo para encaminhamento",
  "curriculos para encaminhamento": "Currículo para encaminhamento",
  "lampadas de postes queimadas": "Lâmpada de poste queimada",
  "lampada de poste queimada": "Lâmpada de poste queimada",
  "tapa buraco": "Reparo asfáltico",
  "tapar buraco": "Reparo asfáltico",
  "reparacao asfaltica": "Reparo asfáltico",
  "reparo asfaltico": "Reparo asfáltico",
  "vaga em escola publica": "Vaga em escola",
  "vaga em escola municipal": "Vaga em escola",
  "vaga escolar": "Vaga em escola",
  "vaga na escola": "Vaga em escola",
  "vaga em escola": "Vaga em escola",
  "vaga na creche": "Vaga em creche",
  "vaga em creche": "Vaga em creche",
  "vaga em periodo integral": "Vaga em período integral",
  "periodo integral para crianca": "Vaga em período integral",
  "periodo integral para criancas": "Vaga em período integral",
};
const RIO_CLARO_DEMAND_TITLE_SUGGESTIONS = [
  "Reparo asfáltico",
  "Tapa-buraco",
  "Poço de visita",
  "Alteamento de poço de visita",
  "Reparo em valeta",
  "Nivelamento asfáltico",
  "Recapeamento",
  "Limpeza de área pública",
  "Corte de mato",
  "Retirada de lixo / entulho",
  "Poda de árvore",
  "Remoção de árvore seca",
  "Iluminação pública",
  "Troca de lâmpada",
  "Sinalização de solo",
  "Faixa de pedestres",
  "Placa de sinalização",
  "Redutor de velocidade / lombada",
  "Fiscalização de trânsito",
  "Boca de lobo / bueiro",
  "Galeria de águas pluviais",
  "Vazamento de água",
  "Esgoto / mau cheiro",
  "Limpeza de praça",
  "Manutenção de área de lazer",
  "Calçada danificada",
  "Acessibilidade / rampa",
  "Ponto de ônibus",
  "Abrigo de ônibus",
  "Manutenção em escola / creche",
  "Retorno ao munícipe",
  "Contato com assessoria",
  "Contato com órgão público",
  "Atendimento Odontológico",
  "Assessoria Jurídica",
  "Currículo para encaminhamento",
  "Vaga em escola",
  "Vaga em creche",
  "Vaga em período integral",
];
const PRIMARY_TICKET_STATUS_NAMES = ["Aberto", "Aguardando retorno", "Aguardando servico", "Finalizado"];
const PUBLIC_STATUS_OPTIONS = [
  "Recebido pelo gabinete",
  "Em acompanhamento",
  "Protocolado",
  "Concluido pelo gabinete",
];

const EMPTY_TICKET = {
  id: "",
  opened_at: currentDate(),
  channel: "WhatsApp",
  channel_other: "",
  status: "Aberto",
  status_other: "",
  status_other_is_final: false,
  priority: "Normal",
  tags: "",
  demand_title: "",
  demand_category: "",
  description: "",
  current_guidance: "",
  assigned_user_id: "",
  department: "",
  external_protocol: "",
  internal_due_date: "",
  dependency_note: "",
  follow_up_days: "3",
  next_action: "",
  next_action_date: "",
  result: "",
  final_document_number: "",
  closure_confirmed: false,
  support_link: "",
  geo_lat: "",
  geo_lng: "",
  contact_id: "",
  contact_type: "person",
  contact_segment: "municipe",
  contact_name: "",
  contact_nickname: "",
  contact_company_legal_name: "",
  contact_phone: "",
  contact_whatsapp: "",
  contact_cpf: "",
  contact_birth_date: "",
  contact_foundation_date: "",
  contact_email: "",
  contact_profession: "",
  contact_referred_by: "",
  contact_address: "",
  contact_number: "",
  contact_complement: "",
  contact_neighborhood: "",
  contact_zip_code: "",
  contact_city: "",
  contact_uf: "",
  ticket_images: [],
};

function openNativeDatePicker(event: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try {
    input.showPicker?.();
  } catch {}
}

function nextTicketTaskInputValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function newTicketTaskDraft(defaults: Record<string, any> = {}) {
  return {
    title: "",
    description: "",
    responsible_id: "",
    due_at: nextTicketTaskInputValue(),
    priority: "Normal",
    status: "Pendente",
    ...defaults,
  };
}

function normalizeStatusLabel(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeOptionKey(value: string) {
  return normalizeStatusLabel(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function gabineteMessageName(gabinete: any) {
  const name = String(gabinete?.name || gabinete?.parliamentarian_name || "").trim();
  if (!name) return "gabinete";
  return normalizeSearchText(name).startsWith("gabinete") ? name : `gabinete ${name}`;
}

function canonicalTicketStatusName(value: string) {
  return normalizeStatusLabel(value).trim() === "novo" ? "Aberto" : String(value || "");
}

function ticketStatusDisplayName(value: string) {
  const label = canonicalTicketStatusName(value);
  const normalized = normalizeStatusLabel(label).trim();
  const displayNames: Record<string, string> = {
    "aguardando servico": "Aguardando serviço",
    "concluido": "Finalizado",
    "fechado": "Finalizado",
  };
  return displayNames[normalized] || label;
}

function ticketStatusMatches(ticketStatus: string, selectedStatus: string) {
  if (!selectedStatus) return true;
  return normalizeStatusLabel(canonicalTicketStatusName(ticketStatus)).trim() === normalizeStatusLabel(canonicalTicketStatusName(selectedStatus)).trim();
}

function buildCompactTicketStatusOptions(statusOptions: any[] = [], currentStatus = "") {
  const byName = new Map(statusOptions.map((item: any) => [normalizeStatusLabel(item.name).trim(), item]));
  const options = PRIMARY_TICKET_STATUS_NAMES.map((name) => byName.get(normalizeStatusLabel(name).trim()) || { name, is_final: inferFinalStatusLabel(name) });
  statusOptions.forEach((item: any) => {
    const key = normalizeStatusLabel(item.name).trim();
    if (!options.some((option: any) => normalizeStatusLabel(option.name).trim() === key)) {
      options.push(item);
    }
  });
  const current = String(currentStatus || "").trim();
  if (current && !options.some((item: any) => ticketStatusMatches(item.name, current))) {
    options.push(byName.get(normalizeStatusLabel(current).trim()) || { name: current, is_final: inferFinalStatusLabel(current) });
  }
  return options;
}

function canonicalDemandTitle(value: string) {
  const normalized = normalizeStatusLabel(value).trim();
  return DEMAND_TITLE_ALIASES[normalized] || String(value || "").trim().replace(/\s+/g, " ");
}

function formatTicketAttachmentSize(value: number) {
  const mb = Number(value || 0) / 1024 / 1024;
  if (mb >= 1) return `${Math.round(mb * 10) / 10} MB`;
  return `${Math.max(1, Math.round(Number(value || 0) / 1024))} KB`;
}

function isTicketAttachmentImage(file: any) {
  return String(file?.mime_type || file?.type || "").toLowerCase().startsWith("image/");
}

function ticketAttachmentBytes(file: any) {
  return Number(file?.size_bytes || file?.size || 0) || 0;
}

function ticketAttachmentRulesLabel() {
  return `Fotos 5 MB · PDF 10 MB · total ${formatTicketAttachmentSize(TICKET_ATTACHMENT_MAX_TOTAL_BYTES)}`;
}

function splitEtiquetas(value: unknown) {
  return String(value || "")
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function ticketHasExactEtiqueta(ticket: any, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;
  return splitEtiquetas(ticket.tags).some((item) => normalizeSearchText(item) === normalizedQuery);
}

function ticketTopicSearchFields(ticket: any) {
  return {
    text: [
      ticket.number,
      ticket.opened_at,
      ticket.demand_title,
      ticket.demand_category,
      ticket.tags,
      ticket.status,
      ticket.channel,
      ticket.contact_neighborhood,
      ticket.contact_city,
      ticket.external_protocol,
      ticket.department,
      ticket.priority,
    ],
    digits: [ticket.number],
  };
}

function ticketPersonSearchFields(ticket: any) {
  const topicFields = ticketTopicSearchFields(ticket);
  return {
    text: [
      ...(topicFields.text || []),
      ticket.contact_name,
      ticket.contact_nickname,
      ticket.contact_email,
    ],
    digits: [ticket.number, ticket.contact_cpf],
    phoneDigits: [ticket.contact_phone, ticket.contact_whatsapp],
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function statusHistoryChanged(item: any) {
  return Boolean(item?.new_status)
    && normalizeStatusLabel(item?.previous_status || "") !== normalizeStatusLabel(item?.new_status || "");
}

function isReopenHistory(item: any) {
  return statusHistoryChanged(item)
    && inferFinalStatusLabel(item?.previous_status || "")
    && !inferFinalStatusLabel(item?.new_status || "");
}

function formatTicketHistoryAction(value: string, text = "", item: any = null) {
  const raw = String(value || "").trim();
  const normalized = normalizeStatusLabel(raw);
  const normalizedText = normalizeStatusLabel(text).trim();
  if (normalizedText.startsWith("orientacao final")) return "Orientação final";
  if (normalized === "orientacao final") return "Orientação final";
  if (normalized === "reabertura") return "Reabertura";
  if (normalized === ["status", "alterado"].join(" ")) return "Status alterado";
  if (normalized === "atualizacao" && statusHistoryChanged(item)) {
    if (isReopenHistory(item)) return "Reabertura";
    if (inferFinalStatusLabel(item?.new_status || "")) return "Orientação final";
    return "Status alterado";
  }
  if (normalized === "criacao") return "Criação";
  if (normalized === "atualizacao") return "Atualização";
  if (normalized === ["atualizacao", "publica"].join(" ")) return "Atualização pública";
  if (normalized === ["acompanhamento", "publico"].join(" ")) return "Acompanhamento público";
  if (normalized === "arquivamento") return "Atualização";
  if (normalized === "reativacao") return "Reativação";
  if (normalized === ["nota", "publica"].join(" ")) return "Nota pública";
  if (normalized === ["nota", "interna"].join(" ")) return "Nota interna";
  if (normalized === "tarefa") return "Tarefa";
  if (normalized === "ligacao") return "Ligação";
  return raw || "Nota";
}

function formatTicketHistoryText(item: any) {
  const text = String(item?.text || "").trim();
  const normalizedText = normalizeStatusLabel(text)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const previousStatus = String(item?.previous_status || "").trim();
  const newStatus = String(item?.new_status || "").trim();
  if (normalizedText.startsWith("orientacao final")) {
    return text.replace(/^Orientacao final:\s*/i, "").replace(/^Orientação final:\s*/i, "");
  }
  if (statusHistoryChanged(item) && (!text || normalizedText === "atendimento atualizado")) {
    if (isReopenHistory(item)) return "Atendimento aberto novamente.";
    return `Status alterado de ${previousStatus ? ticketStatusDisplayName(previousStatus) : "sem status"} para ${newStatus ? ticketStatusDisplayName(newStatus) : "sem status"}.`;
  }
  return text
    .replace(/Aguardando servico/g, "Aguardando serviço")
    .replace(/aguardando servico/g, "aguardando serviço")
    .replace(/Concluido/g, "Finalizado")
    .replace(/concluido/g, "finalizado")
    .replace(/Acompanhamento publico/g, "Acompanhamento público")
    .replace(/acompanhamento publico/g, "acompanhamento público");
}

function isTicketCreationHistory(item: any) {
  return normalizeStatusLabel(item?.action_type || "").trim() === "criacao";
}

function isPlainTicketCreationHistory(item: any) {
  if (!isTicketCreationHistory(item)) return false;
  const text = normalizeStatusLabel(item?.text || "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !text || text === "atendimento criado" || text === "atendimento criado pelo whatsapp crm";
}

function isTicketNoteHistory(item: any) {
  return normalizeStatusLabel(item?.action_type || "").includes("nota");
}

function isTicketAttachmentHistory(item: any) {
  return normalizeStatusLabel(item?.action_type || "").trim() === "anexo";
}

function isFinalGuidanceHistory(item: any) {
  const normalizedAction = normalizeStatusLabel(item?.action_type || "").trim();
  const normalizedText = normalizeStatusLabel(item?.text || "").trim();
  return normalizedAction === "orientacao final" || normalizedText.startsWith("orientacao final");
}

function isTicketNotesTimelineItem(item: any) {
  if (isPlainTicketCreationHistory(item) || isTicketAttachmentHistory(item)) return false;
  return isTicketNoteHistory(item) || isFinalGuidanceHistory(item) || isReopenHistory(item);
}

function ticketHistoryMeta(item: any) {
  if (normalizeStatusLabel(item?.action_type || "") === "reabertura") {
    return `Reaberto em ${formatDateInputDisplay(item?.created_at || "")}`;
  }
  return formatTicketDateTime(item?.created_at || "");
}

function isAwaitingStatusName(value: string) {
  return normalizeStatusLabel(value).includes("aguardando");
}

function isDefaultReturnAction(value: string) {
  return normalizeStatusLabel(value) === normalizeStatusLabel(DEFAULT_TICKET_RETURN_ACTION);
}

function isResolutionStatusName(value: string) {
  const normalized = normalizeOptionKey(value);
  return [
    "resolvido",
    "resolucao",
    "concluido",
    "finalizado",
    "oficio encaminhado",
    "indicacao requerimento",
  ].some((item) => normalized.includes(item));
}

function inferFinalStatusLabel(value: string) {
  const normalized = normalizeOptionKey(value);
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

function isFormalFinalStatusName(value: string) {
  const normalized = normalizeOptionKey(value);
  return normalized.includes("oficio encaminhado") || normalized.includes("indicacao requerimento");
}

function ticketFinalizeDocumentLabel(status: string) {
  const normalized = normalizeOptionKey(status);
  if (normalized.includes("oficio")) return "Número do ofício";
  return "Número da indicação/requerimento";
}

function ticketFinalizeDocumentPlaceholder(status: string) {
  const normalized = normalizeOptionKey(status);
  if (normalized.includes("oficio")) return "Ex.: OF.G.V. Nº 12/2026";
  return "Ex.: Requerimento Nº 261/2025";
}

function buildTicketFinalizeResult(status: string, documentNumber: string, text: string) {
  const cleanText = String(text || "").trim();
  const cleanNumber = String(documentNumber || "").trim();
  if (!isFormalFinalStatusName(status) || !cleanNumber) return cleanText;
  return `${ticketFinalizeDocumentLabel(status)}: ${cleanNumber}\n\n${cleanText}`;
}

function formatPedidoNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function getPedidoCountLabel(total: number) {
  return `${formatPedidoNumber(total)} ${total === 1 ? "pedido" : "pedidos"}`;
}

function getTicketLoadLabel(loaded: number, total: number) {
  if (!total) return "0 pedidos carregados";
  if (loaded < total) return `${formatPedidoNumber(loaded)} de ${formatPedidoNumber(total)} pedidos carregados`;
  return `${getPedidoCountLabel(total)} carregados`;
}

function aiTextLength(value: unknown) {
  return String(value || "").trim().length;
}

function aiTextReady(value: unknown) {
  return aiTextLength(value) >= AI_TEXT_MIN_LENGTH;
}

function aiTextCounterLabel(value: unknown) {
  const length = aiTextLength(value);
  return length >= AI_TEXT_MIN_LENGTH
    ? `${length} caracteres · IA liberada`
    : `${length}/${AI_TEXT_MIN_LENGTH} caracteres para usar IA`;
}

function aiTextCounterClass(value: unknown) {
  return aiTextReady(value) ? "text-sky-700" : "text-slate-400";
}

function formatTicketDate(value: string) {
  if (!value) return "Data não informada";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(parsed);
}

function openingDateParts(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return { day: "--", month: "", label: "Selecionar data" };
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return { day: match[3], month: match[2], label: value };
  return {
    day: match[3],
    month: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(parsed).replace(".", ""),
    label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(parsed),
  };
}

function formatDateInputDisplay(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || "Sem retorno";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatTicketDateTime(value: string) {
  if (!value) return "Data não informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function buildTicketPreview(ticket: any) {
  const base = String(ticket.description || ticket.result || ticket.dependency_note || "").trim();
  if (!base) return "";
  return base.length > 140 ? `${base.slice(0, 137).trim()}...` : base;
}

function reminderToneClass(ticket: any) {
  if (!ticket.next_action_date) return "border-slate-200 bg-slate-50 text-slate-600";
  const today = currentDate();
  if (ticket.next_action_date < today) return "border-rose-200 bg-rose-50 text-rose-700";
  if (ticket.next_action_date === today) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-orange-200 bg-orange-50 text-orange-700";
}

function ticketListState(ticket: any) {
  const statusLabel = ticketStatusDisplayName(ticket.status || (ticket.closed_at ? "Finalizado" : "Aberto"));
  if (ticket.closed_at) {
    return {
      label: statusLabel,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (ticket.next_action_date && ticket.next_action_date <= currentDate()) {
    return {
      label: statusLabel,
      className: reminderToneClass(ticket),
    };
  }
  return {
    label: statusLabel,
    className: "border-orange-200 bg-orange-50 text-orange-700",
  };
}

function ticketAddress(ticket: any) {
  const cityUf = [ticket.contact_city, ticket.contact_uf].filter(Boolean).join(" / ");
  return [
    [ticket.contact_address, ticket.contact_number].filter(Boolean).join(", "),
    ticket.contact_complement,
    ticket.contact_neighborhood,
    cityUf,
    formatCepInput(ticket.contact_zip_code || ""),
  ].filter(Boolean);
}

function ticketMapUrl(ticket: any) {
  const address = ticketAddress(ticket).join(", ");
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
}

function contactDisplayName(contact: any) {
  return String(contact?.contact_nickname || contact?.nickname || contact?.contact_name || contact?.name || "").trim();
}

function isStatusFinal(status: any) {
  return Boolean(status?.is_final);
}

function selectedTicketPayload(ticket: any, patch: Record<string, any>, defaultFollowUpDays: number | string = 3) {
  return {
    opened_at: ticket.opened_at || currentDate(),
    channel: ticket.channel || "WhatsApp",
    status: canonicalTicketStatusName(ticket.status || "Aberto"),
    priority: ticket.priority || "Normal",
    tags: ticket.tags || "",
    demand_title: ticket.demand_title || "",
    demand_category: ticket.demand_category || "",
    description: ticket.description || "",
    current_guidance: ticket.current_guidance || "",
    assigned_user_id: ticket.assigned_user_id ? String(ticket.assigned_user_id) : "",
    department: ticket.department || "",
    external_protocol: ticket.external_protocol || "",
    internal_due_date: ticket.internal_due_date || "",
    dependency_note: ticket.dependency_note || "",
    follow_up_days: String(ticket.follow_up_days || defaultFollowUpDays || 3),
    next_action: ticket.next_action || "",
    next_action_date: ticket.next_action_date || "",
    result: ticket.result || "",
    closure_confirmed: Boolean(ticket.closure_confirmed),
    support_link: ticket.support_link || "",
    geo_lat: ticket.geo_lat || "",
    geo_lng: ticket.geo_lng || "",
    contact_id: ticket.contact_id ? String(ticket.contact_id) : "",
    contact_type: ticket.contact_type || "person",
    contact_segment: ticket.contact_segment || "municipe",
    contact_name: ticket.contact_name || "",
    contact_nickname: ticket.contact_nickname || "",
    contact_company_legal_name: ticket.contact_company_legal_name || "",
    contact_phone: ticket.contact_phone || "",
    contact_whatsapp: ticket.contact_whatsapp || "",
    contact_cpf: ticket.contact_cpf || "",
    contact_birth_date: ticket.contact_birth_date || "",
    contact_foundation_date: ticket.contact_foundation_date || "",
    contact_email: ticket.contact_email || "",
    contact_profession: ticket.contact_profession || "",
    contact_referred_by: ticket.contact_referred_by || "",
    contact_address: ticket.contact_address || "",
    contact_number: ticket.contact_number || "",
    contact_complement: ticket.contact_complement || "",
    contact_neighborhood: ticket.contact_neighborhood || "",
    contact_zip_code: ticket.contact_zip_code || "",
    contact_city: ticket.contact_city || "",
    contact_uf: ticket.contact_uf || "",
    ...patch,
  };
}

export function TicketsScreen() {
  const { session, showToast } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<any>({ items: [], lookups: null });
  const [loading, setLoading] = useState(true);
  const [loadingMoreTickets, setLoadingMoreTickets] = useState(false);
  const [ticketLoadMeta, setTicketLoadMeta] = useState({ total: 0, loaded: 0, nextOffset: 0, hasMore: false });
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = useState(() => canonicalTicketStatusName(searchParams.get("status") ?? ""));
  const [onlineOnly, setOnlineOnly] = useState(() => searchParams.get("online") === "1");
  const [selected, setSelected] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<number>>(() => new Set());
  const lastSelectionAnchorRef = useRef<number | null>(null);
  const contactSuggestRequestRef = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [deletingTicket, setDeletingTicket] = useState(false);
  const [bulkDeletingTicket, setBulkDeletingTicket] = useState(false);
  const [bulkFinalizingTicket, setBulkFinalizingTicket] = useState(false);
  const [bulkFinalizeOpen, setBulkFinalizeOpen] = useState(false);
  const [bulkFinalizeDate, setBulkFinalizeDate] = useState(() => currentDate());
  const [bulkFinalizeText, setBulkFinalizeText] = useState("");
  const [bulkFinalizeSuggestion, setBulkFinalizeSuggestion] = useState("");
  const [bulkFinalizeSummaryBusy, setBulkFinalizeSummaryBusy] = useState(false);
  const [quickSaving, setQuickSaving] = useState("");
  const [publicTrackingBusy, setPublicTrackingBusy] = useState("");
  const [publicSecret, setPublicSecret] = useState("");
  const [ticketNoteOpen, setTicketNoteOpen] = useState(false);
  const [ticketNoteText, setTicketNoteText] = useState("");
  const [ticketNotePublishOnline, setTicketNotePublishOnline] = useState(false);
  const [ticketNotePublicStatus, setTicketNotePublicStatus] = useState("");
  const [ticketNoteSaving, setTicketNoteSaving] = useState(false);
  const [ticketNoteSummaryBusy, setTicketNoteSummaryBusy] = useState(false);
  const [ticketNoteSummarySuggestion, setTicketNoteSummarySuggestion] = useState("");
  const [editingTicketNoteId, setEditingTicketNoteId] = useState<number | null>(null);
  const [editingTicketNoteText, setEditingTicketNoteText] = useState("");
  const [editingTicketNoteSaving, setEditingTicketNoteSaving] = useState(false);
  const [deletingTicketNoteId, setDeletingTicketNoteId] = useState<number | null>(null);
  const [ticketNoteVisibilitySavingId, setTicketNoteVisibilitySavingId] = useState<number | null>(null);
  const [ticketAttachmentSaving, setTicketAttachmentSaving] = useState(false);
  const [ticketAttachmentVisibilitySavingId, setTicketAttachmentVisibilitySavingId] = useState<number | null>(null);
  const [ticketPublicPanelOpen, setTicketPublicPanelOpen] = useState(false);
  const [ticketExtraPanelOpen, setTicketExtraPanelOpen] = useState(false);
  const [ticketFinalizeStatus, setTicketFinalizeStatus] = useState("");
  const [ticketFinalizeDocumentNumber, setTicketFinalizeDocumentNumber] = useState("");
  const [ticketFinalizeText, setTicketFinalizeText] = useState("");
  const [ticketFinalizeSuggestion, setTicketFinalizeSuggestion] = useState("");
  const [ticketFinalizeSummaryBusy, setTicketFinalizeSummaryBusy] = useState(false);
  const [ticketReopenStatus, setTicketReopenStatus] = useState("");
  const [ticketReopenDate, setTicketReopenDate] = useState(() => currentDate());
  const [ticketReopenText, setTicketReopenText] = useState("");
  const [ticketReopenSuggestion, setTicketReopenSuggestion] = useState("");
  const [ticketReopenSummaryBusy, setTicketReopenSummaryBusy] = useState(false);
  const [ticketTaskOpen, setTicketTaskOpen] = useState(false);
  const [ticketTaskSubmitting, setTicketTaskSubmitting] = useState(false);
  const [ticketTaskForm, setTicketTaskForm] = useState<any>(() => newTicketTaskDraft());
  const [dirtyQuickTextareas, setDirtyQuickTextareas] = useState<Set<string>>(() => new Set());
  const [demandTitleFocused, setDemandTitleFocused] = useState(false);
  const [documentLookupBusy, setDocumentLookupBusy] = useState(false);
  const [showAdvancedTicketFields, setShowAdvancedTicketFields] = useState(false);
  const [ticketSummaryBusy, setTicketSummaryBusy] = useState(false);
  const [ticketSummaryBusyField, setTicketSummaryBusyField] = useState("");
  const [ticketSummarySuggestionField, setTicketSummarySuggestionField] = useState("");
  const [ticketSummarySuggestion, setTicketSummarySuggestion] = useState("");
  const [ticketTaskSummaryBusy, setTicketTaskSummaryBusy] = useState(false);
  const [ticketTaskSummarySuggestion, setTicketTaskSummarySuggestion] = useState("");
  const [form, setForm] = useState<any>(EMPTY_TICKET);
  const [contactSuggestions, setContactSuggestions] = useState<any[]>([]);
  const [contactSuggestBusy, setContactSuggestBusy] = useState(false);
  const searchParamsKey = searchParams.toString();
  const loadTicketsRequestRef = useRef(0);
  const ticketAutoLoadRef = useRef<HTMLDivElement | null>(null);
  const ufOptions = useUfOptions();
  const cityOptions = useMunicipalityOptions(form.contact_uf);
  const contactSuggestionTerm = useMemo(() => {
    const phoneDigits = onlyDigits(form.contact_whatsapp);
    if (phoneDigits.length >= 4) return form.contact_whatsapp;
    return String(form.contact_name || "").trim();
  }, [form.contact_name, form.contact_whatsapp]);
  const contactDocumentDigits = onlyDigits(form.contact_cpf);
  const contactDocumentError = getCpfCnpjValidationMessage(form.contact_cpf, { allowOtherDocuments: true });
  const contactDocumentActionLabel = documentLookupBusy
    ? "..."
    : contactDocumentDigits.length === 11
      ? "Validar CPF"
      : contactDocumentDigits.length === 14
        ? "Completar CNPJ"
        : "Verificar";
  const statusOptions = data.lookups?.statuses || [];
  const channelOptions = data.lookups?.channels || [];
  const visibleChannelOptions = channelOptions.filter((item: any) => {
    const name = String(item?.name || "").trim();
    if (!name) return false;
    if (normalizeOptionKey(name) !== "outro") return true;
    return form.id && form.channel === name;
  });
  const selectedStatusName = form.status === CREATE_NEW_OPTION ? String(form.status_other || "").trim() : form.status;
  const compactStatusOptions = buildCompactTicketStatusOptions(statusOptions, selected?.ticket?.status || selectedStatusName || status);
  const statusFilterOptions = useMemo(() => {
    const counts = Array.isArray(data.status_counts) ? data.status_counts : [];
    const byKey = new Map<string, any>();
    statusOptions.forEach((item: any) => {
      const key = normalizeStatusLabel(item.name).trim();
      byKey.set(key, { ...item, total: 0 });
    });
    counts.forEach((item: any) => {
      const name = String(item?.name || "").trim();
      if (!name) return;
      const key = normalizeStatusLabel(name).trim();
      byKey.set(key, {
        ...(byKey.get(key) || { name, is_final: inferFinalStatusLabel(name) }),
        name: byKey.get(key)?.name || name,
        total: Number(item?.total || 0),
      });
    });
    const selectedKey = normalizeStatusLabel(status).trim();
    return Array.from(byKey.values()).filter((item: any) => Number(item.total || 0) > 0 || normalizeStatusLabel(item.name).trim() === selectedKey);
  }, [data.status_counts, status, statusOptions]);
  const totalTicketCount = Number(data.total_count ?? (Array.isArray(data.items) ? data.items.length : 0));
  const onlineTicketCount = Number(data.public_tracking_count || 0);
  const showOnlineQuickFilter = onlineTicketCount > 0 || onlineOnly;
  const quickStatusFilters = useMemo(() => {
    const byKey = new Map(statusFilterOptions.map((item: any) => [normalizeStatusLabel(item.name).trim(), item]));
    const ordered = PRIMARY_TICKET_STATUS_NAMES
      .map((name) => byKey.get(normalizeStatusLabel(name).trim()))
      .filter(Boolean);
    statusFilterOptions.forEach((item: any) => {
      const key = normalizeStatusLabel(item.name).trim();
      if (!ordered.some((option: any) => normalizeStatusLabel(option.name).trim() === key)) ordered.push(item);
    });
    return ordered.slice(0, 8);
  }, [statusFilterOptions]);
  const quickEtiquetaFilters = useMemo(() => {
    const counts = new Map<string, { label: string; total: number }>();
    (data.items || []).forEach((ticket: any) => {
      splitEtiquetas(ticket.tags).forEach((tag) => {
        const key = normalizeSearchText(tag);
        if (!key) return;
        const current = counts.get(key) || { label: tag, total: 0 };
        current.total += 1;
        counts.set(key, current);
      });
    });
    return Array.from(counts.values())
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"))
      .slice(0, 6);
  }, [data.items]);
  const selectedStatusLookup = statusOptions.find((item: any) => item.name === selectedStatusName);
  const selectedStatusIsFinal =
    form.status === CREATE_NEW_OPTION
      ? Boolean(form.status_other_is_final)
      : Boolean(selectedStatusLookup?.is_final) || inferFinalStatusLabel(selectedStatusName);
  const selectedChannelName = form.channel === CREATE_NEW_OPTION ? String(form.channel_other || "").trim() : form.channel;
  const ticketAttachments = Array.isArray(form.ticket_images) ? form.ticket_images : [];

  const syncQueryState = useCallback(
    (nextQuery: string, nextStatus: string, nextOnlineOnly: boolean) => {
      const params = new URLSearchParams();
      if (nextQuery) params.set("q", nextQuery);
      if (nextStatus) params.set("status", nextStatus);
      if (nextOnlineOnly) params.set("online", "1");
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    },
    [pathname, router],
  );

  const loadTickets = useCallback(async (overrides: {
    q?: string;
    status?: string;
    onlineOnly?: boolean;
    offset?: number;
    append?: boolean;
    all?: boolean;
    limit?: number;
  } = {}) => {
    const requestId = loadTicketsRequestRef.current + 1;
    loadTicketsRequestRef.current = requestId;
    const append = Boolean(overrides.append);
    if (append) setLoadingMoreTickets(true);
    else {
      setLoading(true);
      setLoadingMoreTickets(false);
    }
    try {
      const params = new URLSearchParams();
      const nextQuery = overrides.q ?? query;
      const nextStatus = canonicalTicketStatusName(overrides.status ?? status);
      const nextOnlineOnly = overrides.onlineOnly ?? onlineOnly;
      if (nextQuery) params.set("q", nextQuery);
      if (nextStatus) params.set("status", nextStatus);
      if (nextOnlineOnly) params.set("online", "1");
      if (overrides.all) {
        params.set("all", "1");
      } else {
        params.set("limit", String(overrides.limit || TICKET_LOAD_LIMIT));
        params.set("offset", String(append ? Math.max(0, Number(overrides.offset || 0)) : 0));
      }
      const payload = await fetchJson(`/api/tickets${params.toString() ? `?${params.toString()}` : ""}`);
      if (requestId === loadTicketsRequestRef.current) {
        setData((current: any) => {
          if (!append) return payload;
          const existingIds = new Set((current.items || []).map((ticket: any) => ticket.id));
          const nextItems = (payload.items || []).filter((ticket: any) => !existingIds.has(ticket.id));
          return {
            ...payload,
            items: [...(current.items || []), ...nextItems],
          };
        });
        setTicketLoadMeta({
          total: Number(payload.total ?? payload.total_count ?? 0),
          loaded: Number(payload.loaded ?? (payload.items || []).length),
          nextOffset: Number(payload.next_offset ?? 0),
          hasMore: Boolean(payload.has_more),
        });
      }
    } finally {
      if (requestId === loadTicketsRequestRef.current) {
        if (append) setLoadingMoreTickets(false);
        else {
          setLoading(false);
          setLoadingMoreTickets(false);
        }
      }
    }
  }, [onlineOnly, query, status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadTickets();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadTickets, session.gabinete?.id]);

  const loadMoreTickets = useCallback(async (options: { auto?: boolean } = {}) => {
    if (loading || loadingMoreTickets || !ticketLoadMeta.hasMore) return;
    if (options.auto && selectedTicketIds.size > 0) return;
    await loadTickets({
      append: true,
      offset: ticketLoadMeta.nextOffset,
      limit: TICKET_LOAD_LIMIT,
    });
  }, [
    loadTickets,
    loading,
    loadingMoreTickets,
    selectedTicketIds.size,
    ticketLoadMeta.hasMore,
    ticketLoadMeta.nextOffset,
  ]);

  const loadAllTickets = useCallback(async () => {
    const total = Number(ticketLoadMeta.total || 0);
    if (
      total > TICKET_LOAD_ALL_CONFIRM_LIMIT
      && !window.confirm(`Carregar ${formatPedidoNumber(total)} pedidos de uma vez pode deixar a tela lenta. Continuar?`)
    ) {
      return;
    }
    await loadTickets({ all: true });
  }, [loadTickets, ticketLoadMeta.total]);

  useEffect(() => {
    const node = ticketAutoLoadRef.current;
    if (!node || loading || loadingMoreTickets || !ticketLoadMeta.hasMore || selectedTicketIds.size > 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreTickets({ auto: true });
        }
      },
      { rootMargin: "560px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    loadMoreTickets,
    loading,
    loadingMoreTickets,
    selectedTicketIds.size,
    ticketLoadMeta.hasMore,
    ticketLoadMeta.nextOffset,
  ]);

  useEffect(() => {
    const term = String(contactSuggestionTerm || "").trim();
    const digits = onlyDigits(term);
    const canSearch = panelOpen && !form.id && !form.contact_id && (term.length >= 2 || digits.length >= 4);
    const requestId = ++contactSuggestRequestRef.current;
    if (!canSearch) {
      setContactSuggestions([]);
      setContactSuggestBusy(false);
      return;
    }
    setContactSuggestBusy(true);
    const handle = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("q", term);
        params.set("limit", "6");
        const payload = await fetchJson<{ items: any[] }>(`/api/contacts?${params.toString()}`);
        if (requestId !== contactSuggestRequestRef.current) return;
        setContactSuggestions(payload.items || []);
      } catch {
        if (requestId === contactSuggestRequestRef.current) setContactSuggestions([]);
      } finally {
        if (requestId === contactSuggestRequestRef.current) setContactSuggestBusy(false);
      }
    }, 220);
    return () => window.clearTimeout(handle);
  }, [contactSuggestionTerm, form.contact_id, form.id, panelOpen]);

  useEffect(() => {
    setSelected(null);
    setPanelOpen(false);
    setShowAdvancedTicketFields(false);
    setForm(EMPTY_TICKET);
    setPublicSecret("");
    setTicketNoteOpen(false);
    setTicketNoteText("");
    setTicketNotePublishOnline(false);
    setTicketNotePublicStatus("");
    setTicketNoteSaving(false);
    setEditingTicketNoteId(null);
    setEditingTicketNoteText("");
    setEditingTicketNoteSaving(false);
    setDeletingTicketNoteId(null);
    setTicketNoteVisibilitySavingId(null);
    setTicketAttachmentSaving(false);
    setTicketAttachmentVisibilitySavingId(null);
    setTicketPublicPanelOpen(false);
    setTicketExtraPanelOpen(false);
    setTicketTaskOpen(false);
    setTicketTaskSubmitting(false);
    setTicketTaskForm(newTicketTaskDraft());
    setDirtyQuickTextareas(new Set());
    setTicketSummarySuggestion("");
    setTicketSummarySuggestionField("");
    setTicketSummaryBusyField("");
    setTicketSummaryBusy(false);
    setTicketTaskSummaryBusy(false);
    setTicketTaskSummarySuggestion("");
    setTicketFinalizeStatus("");
    setTicketFinalizeDocumentNumber("");
    setTicketFinalizeText("");
    setTicketFinalizeSuggestion("");
    setTicketFinalizeSummaryBusy(false);
    setTicketReopenStatus("");
    setTicketReopenText("");
    setTicketReopenSuggestion("");
    setTicketReopenSummaryBusy(false);
    setSelectedTicketIds(new Set());
    setBulkFinalizeOpen(false);
    setBulkFinalizeDate(currentDate());
    setBulkFinalizeText("");
    setBulkFinalizeSuggestion("");
    setBulkFinalizeSummaryBusy(false);
    setContactSuggestions([]);
    setContactSuggestBusy(false);
  }, [session.gabinete?.id]);

  useEffect(() => {
    setSelectedTicketIds((current) => {
      const validIds = new Set((data.items || []).map((ticket: any) => ticket.id));
      if (lastSelectionAnchorRef.current && !validIds.has(lastSelectionAnchorRef.current)) {
        lastSelectionAnchorRef.current = null;
      }
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [data.items]);

  useEffect(() => {
    const tracking = selected?.tracking || selected?.public_tracking || null;
    setPublicSecret("");
    setTicketNoteOpen(false);
    setTicketNoteText("");
    setTicketNotePublishOnline(false);
    setTicketNotePublicStatus(tracking?.public_status || "Em acompanhamento");
    setEditingTicketNoteId(null);
    setEditingTicketNoteText("");
    setEditingTicketNoteSaving(false);
    setDeletingTicketNoteId(null);
    setTicketNoteVisibilitySavingId(null);
    setTicketAttachmentSaving(false);
    setTicketAttachmentVisibilitySavingId(null);
    setTicketPublicPanelOpen(false);
    setTicketExtraPanelOpen(false);
    setTicketFinalizeStatus("");
    setTicketFinalizeDocumentNumber("");
    setTicketFinalizeText("");
    setTicketFinalizeSuggestion("");
    setTicketFinalizeSummaryBusy(false);
    setTicketReopenStatus("");
    setTicketReopenText("");
    setTicketReopenSuggestion("");
    setTicketReopenSummaryBusy(false);
    setTicketTaskOpen(false);
    setTicketTaskForm(newTicketTaskDraft());
    setTicketTaskSummarySuggestion("");
    setTicketTaskSummaryBusy(false);
    setDirtyQuickTextareas(new Set());
  }, [selected?.ticket?.id]);

  useEffect(() => {
    const nextQuery = searchParams.get("q") ?? "";
    const nextStatus = canonicalTicketStatusName(searchParams.get("status") ?? "");
    const nextOnlineOnly = searchParams.get("online") === "1";
    setQuery(nextQuery);
    setStatus(nextStatus);
    setOnlineOnly(nextOnlineOnly);
  }, [searchParamsKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      syncQueryState(query, status, onlineOnly);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [onlineOnly, query, status, syncQueryState]);

  useEffect(() => {
    const focusId = Number(searchParams.get("focus") || 0);
    if (!focusId) return;
    openTicket(focusId).catch(() => {});
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    startCreate("quick");
  }, [searchParamsKey]);

  async function openTicket(ticketId: number) {
    const payload = await fetchJson(`/api/tickets/${ticketId}`);
    setSelected(payload);
  }

  const ticketDetailHasPendingWork = Boolean(
    selected && (
      quickSaving
      || publicTrackingBusy
      || ticketNoteSaving
      || ticketNoteSummaryBusy
      || editingTicketNoteSaving
      || deletingTicketNoteId
      || ticketNoteVisibilitySavingId
      || ticketAttachmentSaving
      || ticketAttachmentVisibilitySavingId
      || ticketFinalizeSummaryBusy
      || ticketReopenSummaryBusy
      || ticketTaskSubmitting
      || ticketTaskSummaryBusy
      || dirtyQuickTextareas.size > 0
      || (ticketNoteOpen && (ticketNoteText.trim() || ticketNoteSummarySuggestion.trim()))
      || (editingTicketNoteId !== null && editingTicketNoteText.trim())
      || ticketFinalizeStatus
      || ticketFinalizeText.trim()
      || ticketFinalizeSuggestion.trim()
      || ticketReopenStatus
      || ticketReopenText.trim()
      || ticketReopenSuggestion.trim()
      || (ticketTaskOpen && (String(ticketTaskForm.title || "").trim() || String(ticketTaskForm.description || "").trim()))
      || ticketTaskSummarySuggestion.trim()
    ),
  );

  function setQuickTextareaDraftState(key: string, dirty: boolean) {
    setDirtyQuickTextareas((current) => {
      const hasKey = current.has(key);
      if (dirty === hasKey) return current;
      const next = new Set(current);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function closeTicketDetailForListChange() {
    if (!selected) return true;
    if (
      ticketDetailHasPendingWork
      && !window.confirm("Existe texto ou gravação em andamento neste atendimento. Sair e aplicar o filtro?")
    ) {
      return false;
    }
    setSelected(null);
    setTicketPublicPanelOpen(false);
    setTicketExtraPanelOpen(false);
    return true;
  }

  function applyTicketListFilters({
    nextQuery,
    nextStatus,
    nextOnlineOnly,
  }: {
    nextQuery?: string;
    nextStatus?: string;
    nextOnlineOnly?: boolean;
  }) {
    if (!closeTicketDetailForListChange()) return;
    if (nextStatus !== undefined) setStatus(nextStatus);
    if (nextQuery !== undefined) setQuery(nextQuery);
    if (nextOnlineOnly !== undefined) setOnlineOnly(nextOnlineOnly);
  }

  function startCreate(mode: "quick" | "complete" = "quick") {
    const followUpDays = String(session.gabinete?.default_follow_up_days || 3);
    const openedAt = currentDate();
    const defaultChannel =
      (data.lookups?.channels || []).find((item: any) => normalizeStatusLabel(item.name).includes("whatsapp"))?.name
      || "WhatsApp";
    setSelected(null);
    setForm({
      ...EMPTY_TICKET,
      opened_at: openedAt,
      status: "Aberto",
      channel: defaultChannel,
      priority: "Normal",
      assigned_user_id: "",
      demand_category: "",
      follow_up_days: followUpDays,
      next_action_date: "",
    });
    setDemandTitleFocused(false);
    setTicketSummarySuggestion("");
    setTicketSummarySuggestionField("");
    setContactSuggestions([]);
    setContactSuggestBusy(false);
    setShowAdvancedTicketFields(mode === "complete");
    setPanelOpen(true);
  }

  function applyContactSuggestion(contact: any) {
    setForm((current: any) => ({
      ...current,
      contact_id: contact.id,
      contact_type: contact.contact_type || current.contact_type,
      contact_segment: contact.segment || current.contact_segment,
      contact_name: contact.name || current.contact_name,
      contact_phone: formatPhoneInput(contact.phone || contact.whatsapp || current.contact_phone),
      contact_whatsapp: formatPhoneInput(contact.whatsapp || contact.phone || current.contact_whatsapp),
      contact_cpf: contact.cpf_rg_cns || current.contact_cpf,
      contact_birth_date: contact.birth_date || current.contact_birth_date,
      contact_address: contact.address || current.contact_address,
      contact_number: contact.number || current.contact_number,
      contact_complement: contact.complement || current.contact_complement,
      contact_neighborhood: contact.neighborhood || current.contact_neighborhood,
      contact_zip_code: formatCepInput(contact.zip_code || current.contact_zip_code),
      contact_city: contact.city || current.contact_city,
      contact_uf: contact.uf || current.contact_uf,
    }));
    setContactSuggestions([]);
    setContactSuggestBusy(false);
  }

  async function startEdit(ticketId: number) {
    const payload = await fetchJson(`/api/tickets/${ticketId}`);
    setForm({
      ...EMPTY_TICKET,
      ...payload.ticket,
      closure_confirmed: Boolean(payload.ticket.closure_confirmed),
      follow_up_days: String(payload.ticket.follow_up_days || session.gabinete?.default_follow_up_days || 3),
      contact_phone: formatPhoneInput(payload.ticket.contact_phone || ""),
      contact_whatsapp: formatPhoneInput(payload.ticket.contact_whatsapp || ""),
      contact_cpf: payload.ticket.contact_cpf || "",
      contact_zip_code: formatCepInput(payload.ticket.contact_zip_code || ""),
      contact_type: payload.ticket.contact_type || "person",
      contact_segment: payload.ticket.contact_segment || "municipe",
      contact_company_legal_name: payload.ticket.contact_company_legal_name || "",
      contact_foundation_date: payload.ticket.contact_foundation_date || "",
      contact_referred_by: payload.ticket.contact_referred_by || "",
    });
    setDemandTitleFocused(false);
    setTicketSummarySuggestion("");
    setTicketSummarySuggestionField("");
    setContactSuggestions([]);
    setContactSuggestBusy(false);
    setShowAdvancedTicketFields(true);
    setPanelOpen(true);
  }

  async function handleTicketCepLookup() {
    const cep = onlyDigits(form.contact_zip_code);
    if (cep.length !== 8) {
      showToast("error", "Informe um CEP valido com 8 numeros.");
      return;
    }
    try {
      const payload = await fetchJson(`/api/lookups/cep/${cep}`);
      setForm((current: any) => ({
        ...current,
        contact_zip_code: formatCepInput(payload.cep || cep),
        contact_address: payload.address || current.contact_address,
        contact_neighborhood: payload.neighborhood || current.contact_neighborhood,
        contact_city: payload.city || current.contact_city,
        contact_uf: payload.uf || current.contact_uf,
      }));
      showToast("success", `Endereco preenchido via ${payload.source}.`);
    } catch (error: any) {
      showToast("error", error.message);
    }
  }

  function clearTicketAddressFields() {
    setForm((current: any) => ({
      ...current,
      contact_zip_code: "",
      contact_address: "",
      contact_number: "",
      contact_complement: "",
      contact_neighborhood: "",
      contact_city: "",
      contact_uf: "",
    }));
  }

  function handleTicketCepChange(value: string) {
    const formatted = formatCepInput(value);
    if (!onlyDigits(formatted)) {
      clearTicketAddressFields();
      return;
    }
    setForm((current: any) => ({ ...current, contact_zip_code: formatted }));
  }

  async function prepareTicketAttachments(files: File[], currentAttachments: any[] = []) {
    if (currentAttachments.length + files.length > TICKET_ATTACHMENT_MAX_FILES) {
      showToast("error", `Anexe no maximo ${TICKET_ATTACHMENT_MAX_FILES} arquivos por atendimento.`);
      return null;
    }

    const nextFilesSize = files.reduce((total, file) => total + Number(file.size || 0), 0);
    const currentSize = currentAttachments.reduce((total, file) => total + ticketAttachmentBytes(file), 0);
    if (currentSize + nextFilesSize > TICKET_ATTACHMENT_MAX_TOTAL_BYTES) {
      showToast("error", `Os anexos do atendimento podem ter no maximo ${formatTicketAttachmentSize(TICKET_ATTACHMENT_MAX_TOTAL_BYTES)} no total.`);
      return null;
    }

    const preparedAttachments = [];
    for (const file of files) {
      const fileType = String(file.type || "").toLowerCase();
      if (!TICKET_ATTACHMENT_ALLOWED_TYPES.has(fileType)) {
        showToast("error", "Use PDF, JPG, PNG ou WEBP.");
        return null;
      }
      const maxBytes = fileType === "application/pdf" ? TICKET_ATTACHMENT_MAX_PDF_BYTES : TICKET_ATTACHMENT_MAX_IMAGE_BYTES;
      if (file.size <= 0 || file.size > maxBytes) {
        showToast("error", fileType === "application/pdf" ? "PDF pode ter no maximo 10 MB." : "Imagem pode ter no maximo 5 MB.");
        return null;
      }
      preparedAttachments.push({
        name: file.name,
        type: file.type,
        size: file.size,
        data_url: await readFileAsDataUrl(file),
      });
    }

    return preparedAttachments;
  }

  async function handleTicketAttachmentsChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const currentAttachments = Array.isArray(form.ticket_images) ? form.ticket_images : [];
    const preparedAttachments = await prepareTicketAttachments(files, currentAttachments);
    if (!preparedAttachments) return;

    setForm((current: any) => ({
      ...current,
      ticket_images: [...(Array.isArray(current.ticket_images) ? current.ticket_images : []), ...preparedAttachments],
    }));
  }

  function removeTicketAttachment(index: number) {
    setForm((current: any) => ({
      ...current,
      ticket_images: (Array.isArray(current.ticket_images) ? current.ticket_images : []).filter((_: any, itemIndex: number) => itemIndex !== index),
    }));
  }

  async function handleSelectedTicketAttachmentsChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected?.ticket?.id || !files.length) return;

    const currentAttachments = Array.isArray(selected.files) ? selected.files : [];
    const preparedAttachments = await prepareTicketAttachments(files, currentAttachments);
    if (!preparedAttachments) return;

    setTicketAttachmentSaving(true);
    try {
      const payload = await fetchJson(`/api/tickets/${selected.ticket.id}/files`, {
        method: "POST",
        body: JSON.stringify({ ticket_images: preparedAttachments }),
      });
      applyTicketPayload(payload);
      showToast(
        "success",
        payload.ticket_was_closed
          ? "Anexo adicionado. Atendimento continua finalizado."
          : preparedAttachments.length === 1 ? "Anexo adicionado." : "Anexos adicionados.",
      );
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setTicketAttachmentSaving(false);
    }
  }

  async function handleChangeTicketAttachmentVisibility(file: any, nextOnline: boolean) {
    const ticketId = Number(selected?.ticket?.id || 0);
    const fileId = Number(file?.id || 0);
    if (!ticketId || !fileId) return;
    if (nextOnline && !selectedTracking?.enabled) {
      showToast("error", "Ative o acompanhamento publico antes de publicar o anexo online.");
      return;
    }
    setTicketAttachmentVisibilitySavingId(fileId);
    try {
      const payload = await fetchJson(`/api/tickets/${ticketId}/files/${fileId}`, {
        method: "PATCH",
        body: JSON.stringify({ public_visible: nextOnline ? 1 : 0 }),
      });
      applyTicketPayload(payload);
      showToast("success", nextOnline ? "Anexo publicado online." : "Anexo interno.");
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setTicketAttachmentVisibilitySavingId(null);
    }
  }

  async function handleTicketDocumentLookup() {
    const document = onlyDigits(form.contact_cpf);
    const documentError = getCpfCnpjValidationMessage(document);
    if (documentError || ![11, 14].includes(document.length)) {
      showToast("error", documentError || "Informe um CPF ou CNPJ valido para completar os dados do contato.");
      return;
    }

    setDocumentLookupBusy(true);
    try {
      if (document.length === 11) {
        setForm((current: any) => ({
          ...current,
          contact_type: "person",
          contact_cpf: formatCpfCnpjInput(document),
        }));
        showToast("success", "CPF valido.");
        return;
      }

      const payload = await fetchJson(`/api/lookups/cnpj/${document}`);
      setForm((current: any) => ({
        ...current,
        contact_type: "company",
        contact_segment: current.contact_segment === "municipe" ? "empresa" : current.contact_segment,
        contact_name: payload.nome_fantasia || payload.razao_social || current.contact_name,
        contact_company_legal_name: payload.razao_social || current.contact_company_legal_name,
        contact_phone: payload.telefone ? formatPhoneInput(payload.telefone) : current.contact_phone,
        contact_whatsapp: payload.telefone ? formatPhoneInput(payload.telefone) : current.contact_whatsapp,
        contact_cpf: formatCpfCnpjInput(payload.cnpj || document),
        contact_email: payload.email || current.contact_email,
        contact_profession: payload.atividade_principal || current.contact_profession,
        contact_foundation_date: payload.foundation_date || current.contact_foundation_date,
        contact_address: payload.address || current.contact_address,
        contact_neighborhood: payload.neighborhood || current.contact_neighborhood,
        contact_zip_code: formatCepInput(payload.cep || current.contact_zip_code),
        contact_city: payload.city || current.contact_city,
        contact_uf: payload.uf || current.contact_uf,
      }));
      showToast("success", `Contato preenchido com dados de ${payload.source}.`);
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setDocumentLookupBusy(false);
    }
  }

  async function summarizeTicketText(text: string, context = "texto de atendimento") {
    const trimmed = String(text || "").trim();
    if (trimmed.length < AI_TEXT_MIN_LENGTH) {
      showToast("error", `Escreva pelo menos ${AI_TEXT_MIN_LENGTH} caracteres para usar a IA.`);
      return "";
    }
    try {
      const payload = await fetchJson<{ summary: string }>("/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({
          context,
          text: trimmed,
        }),
      });
      const summary = String(payload.summary || "").trim();
      if (!summary) {
        showToast("error", "A IA não retornou uma sugestão.");
        return "";
      }
      showToast("success", "Sugestao gerada.");
      return summary;
    } catch (error: any) {
      showToast("error", error.message);
      return "";
    }
  }

  async function handleSummarizeTicketField(field: string) {
    setTicketSummaryBusy(true);
    setTicketSummaryBusyField(field);
    try {
      const summary = await summarizeTicketText(form[field]);
      if (summary) {
        setTicketSummarySuggestion(summary);
        setTicketSummarySuggestionField(field);
      }
    } finally {
      setTicketSummaryBusy(false);
      setTicketSummaryBusyField("");
    }
  }

  async function handleSummarizeTicketFinalizeText() {
    setTicketFinalizeSummaryBusy(true);
    try {
      const summary = await summarizeTicketText(ticketFinalizeText, buildSelectedTicketAiContext("orientação final de atendimento"));
      if (summary) {
        setTicketFinalizeSuggestion(summary);
      }
    } finally {
      setTicketFinalizeSummaryBusy(false);
    }
  }

  async function handleSummarizeBulkFinalizeText() {
    setBulkFinalizeSummaryBusy(true);
    try {
      const summary = await summarizeTicketText(
        bulkFinalizeText,
        `${selectedTicketIds.size} atendimentos selecionados\norientação final em lote`,
      );
      if (summary) setBulkFinalizeSuggestion(summary);
    } finally {
      setBulkFinalizeSummaryBusy(false);
    }
  }

  async function handleSummarizeTicketReopenText() {
    setTicketReopenSummaryBusy(true);
    try {
      const summary = await summarizeTicketText(ticketReopenText, buildSelectedTicketAiContext("motivo de reabertura de atendimento"));
      if (summary) {
        setTicketReopenSuggestion(summary);
      }
    } finally {
      setTicketReopenSummaryBusy(false);
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const documentError = getCpfCnpjValidationMessage(form.contact_cpf, { allowOtherDocuments: true });
    if (documentError) {
      showToast("error", documentError);
      setSubmitting(false);
      return;
    }
    const channelName = selectedChannelName;
    const isEditingTicket = Boolean(form.id);
    const statusName = isEditingTicket ? selectedStatusName : "Aberto";
    const statusIsFinal = isEditingTicket ? selectedStatusIsFinal : false;
    if (!channelName) {
      showToast("error", "Informe o tipo de entrada.");
      setSubmitting(false);
      return;
    }
    if (!statusName) {
      showToast("error", "Informe o status.");
      setSubmitting(false);
      return;
    }
    if (statusIsFinal && !String(form.result || "").trim()) {
      showToast("error", "Informe a orientação final para encerrar o atendimento.");
      setSubmitting(false);
      return;
    }
    try {
      const payload = {
        ...form,
        channel: channelName,
        status: statusName,
        status_is_final: statusIsFinal,
        demand_title: canonicalDemandTitle(form.demand_title),
        result: statusIsFinal ? buildTicketFinalizeResult(statusName, form.final_document_number, form.result) : "",
        closure_confirmed: statusIsFinal ? true : false,
        contact_phone: form.contact_phone,
        contact_whatsapp: form.contact_whatsapp,
      };
      const editedTicketId = Number(form.id || 0);
      if (editedTicketId) {
        await fetchJson(`/api/tickets/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        showToast("success", "Atendimento atualizado.");
      } else {
        await fetchJson("/api/tickets", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("success", "Atendimento adicionado.");
      }
      setPanelOpen(false);
      setShowAdvancedTicketFields(false);
      setTicketSummarySuggestion("");
      setTicketSummarySuggestionField("");
      setForm(EMPTY_TICKET);
      await loadTickets();
      if (editedTicketId && selected?.ticket?.id === editedTicketId) {
        await openTicket(editedTicketId);
      }
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteTicket(target?: any) {
    const ticketId = Number(target?.id || form.id || selected?.ticket?.id || 0);
    if (!ticketId || deletingTicket) return;
    const label = target?.demand_title || form.demand_title || selected?.ticket?.demand_title || "este atendimento";
    const confirmed = window.confirm(
      `Excluir ${label}?\n\nO atendimento vai para a lixeira por 30 dias.`,
    );
    if (!confirmed) return;

    setDeletingTicket(true);
    try {
      await fetchJson(`/api/tickets/${ticketId}`, { method: "DELETE" });
      showTrashUndoToast({
        showToast,
        message: "1 atendimento apagado.",
        items: [{ type: "tickets", id: ticketId }],
        onRestored: loadTickets,
      });
      setSelectedTicketIds((current) => {
        const next = new Set(current);
        next.delete(ticketId);
        return next;
      });
      setPanelOpen(false);
      setShowAdvancedTicketFields(false);
      if (selected?.ticket?.id === ticketId) setSelected(null);
      setTicketSummarySuggestion("");
      setTicketSummarySuggestionField("");
      setForm(EMPTY_TICKET);
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setDeletingTicket(false);
    }
  }

  async function handleQuickUpdate(patch: Record<string, any>, savingKey = "quick") {
    if (!selected?.ticket?.id) return;
    setQuickSaving(savingKey);
    try {
      const payload = selectedTicketPayload(
        selected.ticket,
        patch,
        session.gabinete?.default_follow_up_days || 3,
      );
      await fetchJson(`/api/tickets/${selected.ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showToast("success", "Salvo.");
      setTicketFinalizeStatus("");
      setTicketFinalizeDocumentNumber("");
      setTicketFinalizeText("");
      setTicketFinalizeSuggestion("");
      setTicketFinalizeSummaryBusy(false);
      setTicketReopenStatus("");
      setTicketReopenDate(currentDate());
      setTicketReopenText("");
      setTicketReopenSuggestion("");
      setTicketReopenSummaryBusy(false);
      await loadTickets();
      await openTicket(selected.ticket.id);
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setQuickSaving("");
    }
  }

  async function handleQuickCepUpdate(value: string) {
    const digits = onlyDigits(value);
    if (!digits) {
      await handleQuickUpdate(
        {
          contact_zip_code: "",
          contact_address: "",
          contact_neighborhood: "",
          contact_city: "",
          contact_uf: "",
        },
        "cep",
      );
      return;
    }
    if (digits.length !== 8) {
      showToast("error", "Informe um CEP valido com 8 numeros.");
      return;
    }
    try {
      const payload = await fetchJson(`/api/lookups/cep/${digits}`);
      await handleQuickUpdate(
        {
          contact_zip_code: formatCepInput(payload.cep || digits),
          contact_address: payload.address || selected?.ticket?.contact_address || "",
          contact_neighborhood: payload.neighborhood || selected?.ticket?.contact_neighborhood || "",
          contact_city: payload.city || selected?.ticket?.contact_city || "",
          contact_uf: payload.uf || selected?.ticket?.contact_uf || "",
        },
        "cep",
      );
    } catch (error: any) {
      showToast("error", error.message);
    }
  }

  async function handleAddTicketTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.ticket?.id) return;
    if (!String(ticketTaskForm.title || "").trim()) {
      showToast("error", "Informe o titulo da tarefa.");
      return;
    }
    setTicketTaskSubmitting(true);
    try {
      await fetchJson("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          ...ticketTaskForm,
          ticket_id: selected.ticket.id,
          contact_id: selected.ticket.contact_id || "",
        }),
      });
      showToast("success", "Tarefa adicionada ao atendimento.");
      setTicketTaskOpen(false);
      setTicketTaskForm(newTicketTaskDraft());
      setTicketTaskSummarySuggestion("");
      await loadTickets();
      await openTicket(selected.ticket.id);
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setTicketTaskSubmitting(false);
    }
  }

  async function handleSummarizeTicketTaskDescription() {
    setTicketTaskSummaryBusy(true);
    try {
      const summary = await summarizeTicketText(ticketTaskForm.description, buildSelectedTicketAiContext("descrição de tarefa vinculada a atendimento"));
      if (summary) setTicketTaskSummarySuggestion(summary);
    } finally {
      setTicketTaskSummaryBusy(false);
    }
  }

  function applyTicketPayload(payload: any) {
    const tracking = payload.tracking || payload.public_tracking;
    setSelected((current: any) => ({
      ...current,
      ...payload,
      ticket: payload.ticket || current?.ticket,
      history: payload.history || current?.history || [],
      documents: payload.documents || current?.documents || [],
      tasks: payload.tasks || current?.tasks || [],
      call_logs: payload.call_logs || current?.call_logs || [],
      email_messages: payload.email_messages || current?.email_messages || [],
      public_tracking: tracking || current?.public_tracking || null,
      tracking: tracking || current?.tracking || null,
      public_updates: payload.public_updates || current?.public_updates || [],
    }));
  }

  function buildPublicTrackingMessage(accessCode = publicSecret) {
    const tracking = selected?.tracking || selected?.public_tracking || null;
    if (!tracking?.url) return "";
    const displayName = contactDisplayName(selected.ticket);
    const gabineteName = gabineteMessageName(session.gabinete);
    return [
      `Olá, ${displayName || "tudo bem"}.`,
      `Aqui é do ${gabineteName}.`,
      "Você pode acompanhar seu atendimento pelo link abaixo:",
      tracking.url,
      accessCode ? `Senha de acesso: ${accessCode}` : "",
      "O link mostra apenas as atualizações públicas do atendimento.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function copyText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast("success", `${label} copiado.`);
    } catch {
      showToast("error", "Nao foi possivel copiar automaticamente.");
    }
  }

  function openTicketNoteComposer() {
    setTicketNoteOpen(true);
    window.setTimeout(() => {
      document.getElementById("ticket-notes-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  async function handleEnablePublicTracking() {
    if (!selected?.ticket?.id) return;
    setPublicTrackingBusy("enable");
    try {
      const payload = await fetchJson(`/api/tickets/${selected.ticket.id}/public-tracking/enable`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      applyTicketPayload(payload);
      setPublicSecret(payload.tracking?.access_code || "");
      setTicketNotePublicStatus(payload.tracking?.public_status || "Recebido pelo gabinete");
      showToast("success", "Acompanhamento público ativado.");
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setPublicTrackingBusy("");
    }
  }

  async function handleRotatePublicSecret() {
    if (!selected?.ticket?.id) return;
    setPublicTrackingBusy("secret");
    try {
      const payload = await fetchJson(`/api/tickets/${selected.ticket.id}/public-tracking/senha`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      applyTicketPayload(payload);
      setPublicSecret(payload.tracking?.access_code || "");
      showToast("success", "Nova senha gerada.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setPublicTrackingBusy("");
    }
  }

  async function handleDisablePublicTracking() {
    if (!selected?.ticket?.id) return;
    const confirmed = window.confirm(
      "Desativar o protocolo público deste atendimento?\n\nO link deixa de abrir para a pessoa. As notas já registradas continuam no histórico.",
    );
    if (!confirmed) return;
    setPublicTrackingBusy("disable");
    try {
      const payload = await fetchJson(`/api/tickets/${selected.ticket.id}/public-tracking`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: false,
          public_status: selectedTracking?.public_status || "Em acompanhamento",
        }),
      });
      applyTicketPayload(payload);
      setPublicSecret("");
      setTicketNotePublishOnline(false);
      setTicketNotePublicStatus(payload.tracking?.public_status || "Em acompanhamento");
      showToast("success", "Protocolo público desativado.");
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setPublicTrackingBusy("");
    }
  }

  async function handleAddTicketNote() {
    if (!selected?.ticket?.id) return;
    const message = ticketNoteText.trim();
    if (!message) {
      showToast("error", "Escreva a nota antes de salvar.");
      return;
    }
    const tracking = selected?.tracking || selected?.public_tracking || null;
    const publishOnline = ticketNotePublishOnline && Boolean(tracking?.enabled);
    setTicketNoteSaving(true);
    try {
      const payload = await fetchJson(`/api/tickets/${selected.ticket.id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          message,
          publish_online: publishOnline,
          public_status: ticketNotePublicStatus || tracking?.public_status || "Em acompanhamento",
        }),
      });
      applyTicketPayload(payload);
      setTicketNoteText("");
      setTicketNotePublishOnline(false);
      setTicketNoteOpen(false);
      setTicketNotePublicStatus(payload.tracking?.public_status || ticketNotePublicStatus || "Em acompanhamento");
      showToast(
        "success",
        payload.ticket_was_closed
          ? "Nota registrada. Atendimento continua finalizado."
          : publishOnline
            ? "Nota registrada e publicada."
            : "Nota registrada.",
      );
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setTicketNoteSaving(false);
    }
  }

  async function handleSummarizeTicketNote() {
    setTicketNoteSummaryBusy(true);
    try {
      const summary = await summarizeTicketText(
        ticketNoteText,
        buildSelectedTicketAiContext("nota curta de atendimento"),
      );
      if (summary) setTicketNoteSummarySuggestion(summary);
    } finally {
      setTicketNoteSummaryBusy(false);
    }
  }

  function buildSelectedTicketAiContext(purpose: string) {
    const ticket = selected?.ticket || {};
    return [
      purpose,
      ticket.demand_title ? `Assunto: ${ticket.demand_title}` : "",
      ticket.status ? `Status atual: ${ticket.status}` : "",
      ticket.contact_name ? `Pessoa: ${ticket.contact_name}` : "",
      ticket.contact_neighborhood ? `Bairro: ${ticket.contact_neighborhood}` : "",
      ticket.description ? `Descrição do pedido: ${ticket.description}` : "",
      ticket.result ? `Orientação anterior: ${ticket.result}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1200);
  }

  function startEditTicketNote(item: any) {
    setEditingTicketNoteId(Number(item.id));
    setEditingTicketNoteText(String(item.text || ""));
  }

  async function handleSaveTicketHistoryNote(item: any) {
    if (!selected?.ticket?.id) return;
    const message = editingTicketNoteText.trim();
    if (!message) {
      showToast("error", "Escreva a nota antes de salvar.");
      return;
    }
    setEditingTicketNoteSaving(true);
    try {
      const payload = await fetchJson(`/api/tickets/${selected.ticket.id}/history/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ text: message }),
      });
      applyTicketPayload(payload);
      setEditingTicketNoteId(null);
      setEditingTicketNoteText("");
      showToast("success", "Nota atualizada.");
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setEditingTicketNoteSaving(false);
    }
  }

  async function handleDeleteTicketHistoryNote(item: any) {
    if (!selected?.ticket?.id) return;
    const isNoteHistory = normalizeStatusLabel(item?.action_type || "").includes("nota");
    const confirmed = window.confirm(isNoteHistory ? "Excluir esta nota do atendimento?" : "Excluir este registro do histórico?");
    if (!confirmed) return;
    setDeletingTicketNoteId(Number(item.id));
    try {
      const payload = await fetchJson(`/api/tickets/${selected.ticket.id}/history/${item.id}`, {
        method: "DELETE",
      });
      applyTicketPayload(payload);
      if (editingTicketNoteId === Number(item.id)) {
        setEditingTicketNoteId(null);
        setEditingTicketNoteText("");
      }
      showToast("success", isNoteHistory ? "Nota excluída." : "Registro excluído.");
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setDeletingTicketNoteId(null);
    }
  }

  async function handleChangeTicketHistoryNoteVisibility(item: any, visibility: string) {
    if (!selected?.ticket?.id) return;
    const normalizedVisibility = visibility === "public" ? "public" : "internal";
    setTicketNoteVisibilitySavingId(Number(item.id));
    try {
      const payload = await fetchJson(`/api/tickets/${selected.ticket.id}/history/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          visibility: normalizedVisibility,
          public_status: ticketNotePublicStatus || selectedTracking?.public_status || "Em acompanhamento",
        }),
      });
      applyTicketPayload(payload);
      setTicketNotePublicStatus(payload.tracking?.public_status || ticketNotePublicStatus || "Em acompanhamento");
      showToast("success", normalizedVisibility === "public" ? "Item publicado online." : "Item interno.");
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setTicketNoteVisibilitySavingId(null);
    }
  }

  async function handleSendPublicTracking(channel: "whatsapp" | "email") {
    if (!selected?.ticket?.id) return;
    if (!publicSecret) {
      showToast("error", "Gere uma nova senha antes de enviar o acompanhamento.");
      return;
    }
    const text = buildPublicTrackingMessage(publicSecret);
    if (!text) return;
    setPublicTrackingBusy(channel);
    try {
      if (channel === "whatsapp") {
        const phone = selected.ticket.contact_whatsapp || selected.ticket.contact_phone || "";
        const payload = await fetchJson("/api/whatsapp/send", {
          method: "POST",
          body: JSON.stringify({
            contact_id: selected.ticket.contact_id || "",
            ticket_id: selected.ticket.id,
            number: phone,
            text,
          }),
        });
        if (payload.mode === "wa_me" && payload.url) {
          window.open(payload.url, "_blank", "noopener,noreferrer");
          showToast("success", "Abrindo o WhatsApp para envio.");
        } else {
          showToast("success", "Acompanhamento enviado por WhatsApp.");
        }
        return;
      }
      await fetchJson("/api/email/send", {
        method: "POST",
        body: JSON.stringify({
	          contact_id: selected.ticket.contact_id || "",
	          ticket_id: selected.ticket.id,
	          to: selected.ticket.contact_email || "",
	          subject: "Acompanhamento da sua solicitação",
	          text,
	        }),
      });
      showToast("success", "Acompanhamento enviado por e-mail.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setPublicTrackingBusy("");
    }
  }

  function toggleTicketSelection(ticketId: number, checked: boolean, shiftKey = false) {
    const visibleIds = visibleTickets.map((ticket) => ticket.id);
    const anchorId = lastSelectionAnchorRef.current;
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      const anchorIndex = anchorId ? visibleIds.indexOf(anchorId) : -1;
      const ticketIndex = visibleIds.indexOf(ticketId);

      if (shiftKey && anchorIndex >= 0 && ticketIndex >= 0) {
        const [start, end] = anchorIndex < ticketIndex ? [anchorIndex, ticketIndex] : [ticketIndex, anchorIndex];
        visibleIds.slice(start, end + 1).forEach((id) => {
          if (checked) next.add(id);
          else next.delete(id);
        });
      } else if (checked) {
        next.add(ticketId);
      } else {
        next.delete(ticketId);
      }
      return next;
    });
    lastSelectionAnchorRef.current = ticketId;
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      visibleTickets.forEach((ticket) => {
        if (checked) next.add(ticket.id);
        else next.delete(ticket.id);
      });
      return next;
    });
  }

  async function handleBulkDeleteTickets() {
    if (!selectedTicketIds.size) return;
    const confirmed = window.confirm(
      `Excluir ${selectedTicketIds.size} atendimento(s)?\n\nEles vao para a lixeira por 30 dias.`,
    );
    if (!confirmed) return;
    const ids = [...selectedTicketIds];
    setBulkDeletingTicket(true);
    try {
      const payload = await fetchJson<{ deleted_count: number }>("/api/tickets/bulk/delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      showTrashUndoToast({
        showToast,
        message: `${payload.deleted_count || 0} atendimento(s) apagado(s).`,
        items: ids.map((id) => ({ type: "tickets", id })),
        onRestored: loadTickets,
      });
      setSelectedTicketIds(new Set());
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBulkDeletingTicket(false);
    }
  }

  function openBulkFinalize() {
    if (!selectedTicketIds.size) return;
    setBulkFinalizeDate(currentDate());
    setBulkFinalizeText("");
    setBulkFinalizeSuggestion("");
    setBulkFinalizeOpen(true);
  }

  async function handleBulkFinalizeTickets(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const result = bulkFinalizeText.trim();
    if (!result) {
      showToast("error", "Informe a orientação final para encerrar os atendimentos.");
      return;
    }
    const ids = [...selectedTicketIds];
    if (!ids.length) return;
    setBulkFinalizingTicket(true);
    try {
      const payload = await fetchJson<{ finalized_count: number; skipped_closed_count: number }>("/api/tickets/bulk/finalize", {
        method: "POST",
        body: JSON.stringify({
          ids,
          result,
          closed_at: bulkFinalizeDate || currentDate(),
        }),
      });
      const finalized = payload.finalized_count || 0;
      const skipped = payload.skipped_closed_count || 0;
      showToast(
        "success",
        skipped
          ? `${finalized} atendimento(s) finalizado(s). ${skipped} ja estavam encerrado(s).`
          : `${finalized} atendimento(s) finalizado(s).`,
      );
      setSelectedTicketIds(new Set());
      setBulkFinalizeOpen(false);
      setBulkFinalizeText("");
      setBulkFinalizeSuggestion("");
      await loadTickets();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBulkFinalizingTicket(false);
    }
  }

  const visibleTickets = useMemo(() => {
    const hasTagMatches = Boolean(normalizeSearchText(query))
      && data.items.some((ticket: any) => ticketHasExactEtiqueta(ticket, query));
    const hasTopicMatches = Boolean(normalizeSearchText(query))
      && data.items.some((ticket: any) => matchesSearchQuery(ticketTopicSearchFields(ticket), query));
    return data.items.filter((ticket: any) => {
        if (ticket.is_archived) return false;

        const matchesText = hasTagMatches
          ? ticketHasExactEtiqueta(ticket, query)
          : hasTopicMatches
          ? matchesSearchQuery(ticketTopicSearchFields(ticket), query)
          : matchesSearchQuery(ticketPersonSearchFields(ticket), query);

        if (!matchesText) return false;
        if (!ticketStatusMatches(ticket.status, status)) return false;
        if (onlineOnly && !ticket.public_tracking_enabled) return false;
        return true;
      });
    },
    [data.items, onlineOnly, query, status],
  );
  const allVisibleSelected = visibleTickets.length > 0 && visibleTickets.every((ticket) => selectedTicketIds.has(ticket.id));
  const selectedTickets = (data.items || []).filter((ticket: any) => selectedTicketIds.has(ticket.id));
  const ticketLoadTotal = Number(ticketLoadMeta.total || data.total || totalTicketCount || visibleTickets.length || 0);
  const ticketLoadedCount = Math.min(
    Number(ticketLoadMeta.loaded || visibleTickets.length || 0),
    ticketLoadTotal || Number(ticketLoadMeta.loaded || visibleTickets.length || 0),
  );
  const ticketLoadLabel = getTicketLoadLabel(ticketLoadedCount, ticketLoadTotal);
  const finalStatusOptions = data.lookups?.statuses || [];
  const selectedOpenTickets = selectedTickets.filter((ticket: any) => {
    const lookup = finalStatusOptions.find((item: any) => item.name === canonicalTicketStatusName(ticket.status || ""));
    return !ticket.closed_at && !isStatusFinal(lookup) && !isResolutionStatusName(ticket.status || "");
  });

  const selectedAddressLines = selected ? ticketAddress(selected.ticket) : [];
  const selectedMapUrl = selected ? ticketMapUrl(selected.ticket) : "";
  const selectedIsAwaitingStatus = selected ? isAwaitingStatusName(selected.ticket.status || "") : false;
  const selectedTicketStatusLookup = selected
    ? (data.lookups?.statuses || []).find((item: any) => item.name === canonicalTicketStatusName(selected.ticket.status || ""))
    : null;
  const selectedIsResolutionStatus = selected
    ? Boolean(selected.ticket.closed_at)
      || isStatusFinal(selectedTicketStatusLookup)
      || isResolutionStatusName(selected.ticket.status || "")
    : false;
  const selectedTracking = selected?.tracking || selected?.public_tracking || null;
  const selectedPublicTrackingEnabled = Boolean(selectedTracking?.enabled);
  const selectedTrackingUrl = selectedTracking?.url || "";
  const selectedContactPhone = selected?.ticket?.contact_whatsapp || selected?.ticket?.contact_phone || "";
  const selectedTicketAttachments = Array.isArray(selected?.files) ? selected.files : [];
  const ticketFinalizeDate = selected?.ticket?.closed_at || currentDate();
  const selectedFinalGuidance = String(selected?.ticket?.result || "").trim();
  const selectedVisibleHistory = useMemo(
    () => [...(selected?.history || [])]
      .filter((item: any) => !isPlainTicketCreationHistory(item))
      .sort((left: any, right: any) => {
        const leftTime = Date.parse(String(left?.created_at || ""));
        const rightTime = Date.parse(String(right?.created_at || ""));
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
        return Number(right?.id || 0) - Number(left?.id || 0);
      }),
    [selected?.history],
  );
  const selectedRecentNotes = selectedVisibleHistory
    .filter((item: any) => isTicketNoteHistory(item))
    .slice(0, 2);
  const selectedNotesHistory = selectedVisibleHistory.filter((item: any) => isTicketNotesTimelineItem(item));
  const selectedHasSidePanel = Boolean(
    selected && (ticketPublicPanelOpen || ticketExtraPanelOpen || selected.email_messages?.length),
  );
  const demandTitleSuggestions = useMemo(() => {
    const suggestions = new Map<string, { title: string; total: number; source: "base" | "rio-claro" }>();
    RIO_CLARO_DEMAND_TITLE_SUGGESTIONS.forEach((title) => {
      const canonical = canonicalDemandTitle(title);
      suggestions.set(normalizeStatusLabel(canonical), { title: canonical, total: 0, source: "rio-claro" });
    });
    (data.lookups?.demand_titles || []).forEach((item: any) => {
      const title = canonicalDemandTitle(item.title || "");
      if (!title) return;
      const key = normalizeStatusLabel(title);
      const total = Number(item.total || 0);
      const existing = suggestions.get(key);
      if (existing) {
        existing.total += total;
        existing.source = "base";
      } else {
        suggestions.set(key, { title, total, source: "base" });
      }
    });
    return Array.from(suggestions.values())
      .sort((a, b) => b.total - a.total || Number(a.source === "rio-claro") - Number(b.source === "rio-claro") || a.title.localeCompare(b.title, "pt-BR"))
      .slice(0, 60);
  }, [data.lookups?.demand_titles]);
  const filteredDemandTitleSuggestions = useMemo(() => {
    const term = normalizeStatusLabel(form.demand_title);
    const items = demandTitleSuggestions
      .filter((item) => {
        const title = normalizeStatusLabel(item.title);
        if (title === term) return false;
        return term ? title.includes(term) : item.total > 0 || item.source === "rio-claro";
      })
      .slice(0, 8);
    const typed = canonicalDemandTitle(form.demand_title);
    if (typed && term && !demandTitleSuggestions.some((item) => normalizeStatusLabel(item.title) === normalizeStatusLabel(typed))) {
      return [{ title: typed, total: 0, source: "base" as const }, ...items].slice(0, 8);
    }
    return items;
  }, [demandTitleSuggestions, form.demand_title]);
  const showDemandTitleSuggestions = demandTitleFocused && filteredDemandTitleSuggestions.length > 0;
  const hasContactAddressDraft = [
    form.contact_address,
    form.contact_number,
    form.contact_complement,
    form.contact_neighborhood,
    form.contact_city,
    form.contact_uf,
  ].some((value) => String(value || "").trim());

  function renderAiTextareaField(field: string, label: string, options: { rows?: number; hint?: string; buttonLabel?: string } = {}) {
    const rows = options.rows || 4;
    const htmlId = `ticket-${field.replace(/_/g, "-")}`;
    const activeSuggestion = ticketSummarySuggestionField === field ? ticketSummarySuggestion : "";
    const buttonLabel = options.buttonLabel || "Melhorar com IA";
    const readyForAi = aiTextReady(form[field]);
    return (
      <div className="col-span-full space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor={htmlId}>
            {label}
          </label>
          <Button
            className="rounded-full"
            disabled={ticketSummaryBusy || !readyForAi}
            onClick={() => handleSummarizeTicketField(field)}
            size="sm"
            type="button"
            variant={readyForAi ? "default" : "secondary"}
          >
            <Sparkles className="size-4" />
            {ticketSummaryBusy && ticketSummaryBusyField === field ? "Melhorando..." : buttonLabel}
          </Button>
        </div>
        {options.hint ? <p className="text-xs leading-5 text-slate-400">{options.hint}</p> : null}
        <Textarea
          className={field === "description" ? "min-h-[190px] leading-6" : ""}
          id={htmlId}
          rows={rows}
          value={form[field] || ""}
          onChange={(event) => {
            setForm((current: any) => ({ ...current, [field]: event.target.value }));
            if (ticketSummarySuggestionField === field) {
              setTicketSummarySuggestion("");
              setTicketSummarySuggestionField("");
            }
          }}
        />
        <p className={`text-xs font-medium ${aiTextCounterClass(form[field])}`}>{aiTextCounterLabel(form[field])}</p>
        {activeSuggestion ? (
          <div className="rounded-[20px] border border-sky-100 bg-sky-50/70 p-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-950">Sugestao de melhoria</p>
            <p className="mt-1 leading-6">{activeSuggestion}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                className="rounded-full"
                onClick={() => {
                  setForm((current: any) => ({ ...current, [field]: activeSuggestion }));
                  setTicketSummarySuggestion("");
                  setTicketSummarySuggestionField("");
                }}
                size="sm"
                type="button"
              >
                Aplicar
              </Button>
              <Button
                className="rounded-full"
                onClick={() => {
                  setTicketSummarySuggestion("");
                  setTicketSummarySuggestionField("");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3 rounded-[30px] border border-white/90 bg-white/88 p-4 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.22)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_190px]">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200/80 bg-white px-4 py-2 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.25)]">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              className="h-8 min-w-0 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="Buscar por pessoa, telefone, assunto, bairro ou protocolo"
              value={query}
              onChange={(event) => applyTicketListFilters({ nextQuery: event.target.value })}
            />
          </div>
          <select
            className="h-11 min-w-0 rounded-full border border-slate-200/80 bg-white px-4 text-sm text-slate-700 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.25)] outline-none"
            value={status}
            onChange={(event) => applyTicketListFilters({ nextStatus: event.target.value })}
          >
            <option value="">Todos os status ({totalTicketCount})</option>
            {statusFilterOptions.map((item: any) => (
              <option key={item.name} value={item.name}>
                {ticketStatusDisplayName(item.name)} ({Number(item.total || 0)})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              className={cn(
                "h-9 rounded-full border px-3 text-xs font-semibold transition",
                !status && !query && !onlineOnly
                  ? "border-orange-200 bg-orange-50 text-orange-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:text-orange-700",
              )}
              onClick={() => {
                applyTicketListFilters({
                  nextStatus: "",
                  nextQuery: "",
                  nextOnlineOnly: false,
                });
              }}
              type="button"
            >
              Todos ({totalTicketCount})
            </button>
            {quickStatusFilters.map((item: any) => {
              const active = ticketStatusMatches(status, item.name);
              return (
                <button
                  className={cn(
                    "h-9 rounded-full border px-3 text-xs font-semibold transition",
                    active
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:text-orange-700",
                  )}
                  key={item.name}
                  onClick={() => applyTicketListFilters({ nextStatus: active ? "" : item.name })}
                  type="button"
                >
                  {ticketStatusDisplayName(item.name)} ({Number(item.total || 0)})
                </button>
              );
            })}
            {showOnlineQuickFilter ? (
              <button
                className={cn(
                  "h-9 rounded-full border px-3 text-xs font-semibold transition",
                  onlineOnly
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-sky-700",
                )}
                onClick={() => applyTicketListFilters({ nextOnlineOnly: !onlineOnly })}
                type="button"
              >
                Online ({onlineTicketCount})
              </button>
            ) : null}
            {quickEtiquetaFilters.map((item) => {
              const active = normalizeSearchText(query) === normalizeSearchText(item.label);
              return (
                <button
                  className={cn(
                    "h-9 rounded-full border px-3 text-xs font-semibold transition",
                    active
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-sky-700",
                  )}
                  key={item.label}
                  onClick={() => applyTicketListFilters({ nextQuery: active ? "" : item.label })}
                  type="button"
                >
                  <Tag className="mr-1 inline size-3" />
                  {item.label} ({item.total})
                </button>
              );
            })}
          </div>
          <Button className="h-11 rounded-full px-5" onClick={() => startCreate("quick")} type="button">
            <Plus className="size-4" />
            Adicionar atendimento
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
          <span className="group relative inline-flex min-h-8 items-center gap-1.5 rounded-full bg-slate-50 px-3 text-slate-600">
            <Info className="size-3.5 text-sky-600" />
            {ticketLoadLabel}
            {loadingMoreTickets ? " · carregando..." : ""}
            <span className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-30 hidden w-64 rounded-2xl bg-slate-950 px-3 py-2 text-left text-[11px] font-medium leading-4 text-white shadow-xl group-hover:block">
              A lista carrega mais pedidos automaticamente quando voce chega perto do fim.
            </span>
          </span>
          {ticketLoadMeta.hasMore ? (
            <>
              <Button disabled={loadingMoreTickets} onClick={() => void loadMoreTickets()} size="sm" type="button" variant="secondary">
                Carregar mais
              </Button>
              <Button disabled={loading || loadingMoreTickets} onClick={() => void loadAllTickets()} size="sm" type="button" variant="ghost">
                Carregar todos
              </Button>
            </>
          ) : null}
          {selectedTicketIds.size > 0 && ticketLoadMeta.hasMore ? (
            <span className="text-orange-700">Carregamento automatico pausado durante a selecao.</span>
          ) : null}
        </div>
      </div>

      {selected ? (
        <div className="space-y-5">
          <div className={`grid gap-4 ${selectedHasSidePanel ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
            <div className="space-y-4">
              <div className="flex items-center justify-start">
                <Button
                  className="rounded-full border-orange-200 bg-orange-50 px-4 text-orange-700 shadow-none hover:border-orange-300 hover:bg-orange-100"
                  onClick={() => setSelected(null)}
                  type="button"
                  variant="secondary"
                >
                  <ArrowLeft className="size-4" />
                  Voltar aos pedidos
                </Button>
              </div>
	              <SectionCard
                  density="compact"
                  header={
                    <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                        <h2 className="min-w-[96px] max-w-full truncate text-lg font-semibold tracking-tight text-slate-950 sm:max-w-[260px]">
                          {selected.ticket.demand_title || "Atendimento"}
                        </h2>
                        {selected.ticket.contact_id ? (
                          <Link
                            className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-slate-100 bg-slate-50/80 py-1.5 pl-1.5 pr-3 text-left transition hover:border-orange-200 hover:bg-orange-50/80 sm:max-w-[360px]"
                            href={`/contatos?focus=${selected.ticket.contact_id}`}
                          >
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#fdba74,#fb923c)] text-xs font-semibold text-white">
                              {(contactDisplayName(selected.ticket) || "C").slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-950">
                                {contactDisplayName(selected.ticket) || "Contato ainda não identificado"}
                              </span>
                              {selected.ticket.contact_phone || selected.ticket.contact_whatsapp ? (
                                <span className="block truncate text-xs font-medium text-slate-500">
                                  {formatPhoneDisplay(selected.ticket.contact_whatsapp || selected.ticket.contact_phone)}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        ) : (
                          <div className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-slate-100 bg-slate-50/80 py-1.5 pl-1.5 pr-3 text-left sm:max-w-[360px]">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#fdba74,#fb923c)] text-xs font-semibold text-white">
                              {(contactDisplayName(selected.ticket) || "C").slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-950">
                                {contactDisplayName(selected.ticket) || "Contato ainda não identificado"}
                              </span>
                              {selected.ticket.contact_phone || selected.ticket.contact_whatsapp ? (
                                <span className="block truncate text-xs font-medium text-slate-500">
                                  {formatPhoneDisplay(selected.ticket.contact_whatsapp || selected.ticket.contact_phone)}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        )}
                        <QuickSelect
                          compact
                          disabled={Boolean(quickSaving)}
                          label="Status"
                          onChange={(value) => {
                            const nextStatus = (data.lookups?.statuses || []).find((item: any) => item.name === value);
                            const nextIsFinal = isStatusFinal(nextStatus) || isResolutionStatusName(value);
                            if (nextIsFinal && !selectedIsResolutionStatus) {
                              setTicketFinalizeStatus(value);
                              setTicketFinalizeDocumentNumber("");
                              setTicketFinalizeText(String(selected.ticket.result || ""));
                              setTicketReopenStatus("");
                              return;
                            }
                            if (selectedIsResolutionStatus && !nextIsFinal) {
                              setTicketReopenStatus(value);
                              setTicketReopenDate(currentDate());
                              setTicketReopenText("");
                              setTicketReopenSuggestion("");
                              setTicketFinalizeStatus("");
                              setTicketFinalizeDocumentNumber("");
                              return;
                            }
                            handleQuickUpdate(
                              {
                                status: value,
                                closure_confirmed: nextIsFinal ? true : false,
                              },
                              "status",
                            );
                          }}
                          options={compactStatusOptions.map((item: any) => ({ label: ticketStatusDisplayName(item.name), value: item.name }))}
                          value={selected.ticket.status}
                        />
	                        {selectedIsAwaitingStatus || selected.ticket.next_action_date ? (
	                          <QuickDate
                            compact
                            disabled={Boolean(quickSaving)}
                            label="Próximo retorno"
                            onChange={(value) => handleQuickUpdate(
                              {
                                next_action: selected.ticket.next_action || DEFAULT_TICKET_RETURN_ACTION,
                                next_action_date: value,
                              },
                              "retorno",
                            )}
                            onClear={() => handleQuickUpdate(
                              {
                                ...(isDefaultReturnAction(selected.ticket.next_action || "") ? { next_action: "" } : {}),
                                next_action_date: "",
                              },
                              "retorno",
                            )}
	                            value={selected.ticket.next_action_date || ""}
	                          />
	                        ) : null}
                        <QuickTagInput
                          disabled={Boolean(quickSaving)}
                          onPick={(value) => applyTicketListFilters({ nextQuery: value })}
                          onSave={(value) => handleQuickUpdate({ tags: value }, "etiquetas")}
                          value={selected.ticket.tags || ""}
                        />
	                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <Button
                        className={selectedTracking?.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}
                        aria-label={selectedTracking?.enabled ? "Acompanhamento online" : "Compartilhar atendimento"}
                        onClick={() => setTicketPublicPanelOpen((current) => !current)}
                        size="icon"
                        title={selectedTracking?.enabled ? "Acompanhamento online" : "Compartilhar atendimento"}
                        type="button"
                        variant="secondary"
                      >
                        <Share2 className="size-4" />
                      </Button>
                      {selectedAddressLines.length || selected.ticket.external_protocol || selected.ticket.support_link ? (
                        <Button
                          aria-label={ticketExtraPanelOpen ? "Ocultar dados extras" : "Ver dados extras"}
                          onClick={() => setTicketExtraPanelOpen((current) => !current)}
                          size="icon"
                          title={ticketExtraPanelOpen ? "Ocultar dados extras" : "Ver dados extras"}
                          type="button"
                          variant="secondary"
                        >
                          <Info className="size-4" />
                        </Button>
                      ) : null}
                      <ActionCluster
                        onEdit={() => startEdit(selected.ticket.id)}
                        whatsappHref={buildWhatsAppUrl(
                          selected.ticket.contact_whatsapp || selected.ticket.contact_phone,
                          `Olá, ${contactDisplayName(selected.ticket) || "tudo bem"}. Aqui é do ${gabineteMessageName(session.gabinete)} sobre sua solicitação.`,
                        )}
                      />
                      <Button
                        aria-label="Adicionar nota"
                        className="border-sky-100 bg-white/80 text-sky-700 shadow-none hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
                        disabled={ticketNoteSaving}
                        onClick={openTicketNoteComposer}
                        size="icon"
                        title="Adicionar nota"
                        type="button"
                        variant="secondary"
                      >
                        <NotebookPen className="size-4" />
                      </Button>
                      <label
                        aria-label="Anexar arquivo"
                        className={`grid size-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 ${
                          ticketAttachmentSaving || selectedTicketAttachments.length >= TICKET_ATTACHMENT_MAX_FILES
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer"
                        }`}
                        title={selectedTicketAttachments.length >= TICKET_ATTACHMENT_MAX_FILES ? "Limite de anexos atingido" : "Anexar PDF ou imagem"}
                      >
                        <Paperclip className="size-4" />
                        <input
                          accept={TICKET_ATTACHMENT_ACCEPT}
                          className="hidden"
                          disabled={ticketAttachmentSaving || selectedTicketAttachments.length >= TICKET_ATTACHMENT_MAX_FILES}
                          multiple
                          onChange={handleSelectedTicketAttachmentsChange}
                          type="file"
                        />
                      </label>
                      <Button
                        aria-label="Excluir atendimento"
                        className="border-rose-100 bg-white/80 text-rose-600 shadow-none hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                        disabled={deletingTicket}
                        onClick={() => handleDeleteTicket(selected.ticket)}
                        size="icon"
                        title="Excluir atendimento"
                        type="button"
                        variant="secondary"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    </div>
                  }
	              >
                <div className="space-y-3">
                  {ticketFinalizeStatus ? (
                    <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/70 p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-emerald-950">Orientação final</p>
                        <p className="text-sm leading-6 text-emerald-900/80">
                          Para finalizar como {ticketFinalizeStatus}, registre o que foi orientado ou combinado com a pessoa.
                        </p>
                      </div>
                      <Field className="mt-3" label="Data de fechamento">
                        <Input
                          type="date"
                          value={ticketFinalizeDate}
                          onChange={(event) =>
                            setSelected((current: any) =>
                              current
                                ? {
                                    ...current,
                                    ticket: {
                                      ...current.ticket,
                                      closed_at: event.target.value,
                                    },
                                  }
                                : current,
                            )
                          }
                        />
                      </Field>
                      {isFormalFinalStatusName(ticketFinalizeStatus) ? (
                        <Field className="mt-3" label={ticketFinalizeDocumentLabel(ticketFinalizeStatus)}>
                          <Input
                            onChange={(event) => setTicketFinalizeDocumentNumber(event.target.value.slice(0, 80))}
                            placeholder={ticketFinalizeDocumentPlaceholder(ticketFinalizeStatus)}
                            value={ticketFinalizeDocumentNumber}
                          />
                        </Field>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-emerald-950">Texto da orientação</span>
                        <Button
                          className="rounded-full"
                          disabled={ticketFinalizeSummaryBusy || !aiTextReady(ticketFinalizeText)}
                          onClick={handleSummarizeTicketFinalizeText}
                          size="sm"
                          type="button"
                          variant={aiTextReady(ticketFinalizeText) ? "default" : "secondary"}
                        >
                          <Sparkles className="size-4" />
                          {ticketFinalizeSummaryBusy ? "Melhorando..." : "Melhorar com IA"}
                        </Button>
                      </div>
                      <Textarea
                        className="mt-2"
                        maxLength={1600}
                        onChange={(event) => {
                          setTicketFinalizeText(event.target.value);
                          setTicketFinalizeSuggestion("");
                        }}
                        placeholder="Ex.: Orientado a aguardar retorno da secretaria; protocolo encaminhado; pedido concluído..."
                        rows={3}
                        value={ticketFinalizeText}
                      />
                      <p className={`mt-1 text-xs font-medium ${aiTextCounterClass(ticketFinalizeText)}`}>{aiTextCounterLabel(ticketFinalizeText)}</p>
                      {ticketFinalizeSuggestion ? (
                        <div className="mt-3 rounded-[18px] border border-sky-100 bg-white/80 p-3 text-sm text-slate-700">
                          <p className="font-semibold text-slate-950">Sugestão da IA</p>
                          <p className="mt-1 leading-6">{ticketFinalizeSuggestion}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              className="rounded-full"
                              onClick={() => {
                                setTicketFinalizeText(ticketFinalizeSuggestion);
                                setTicketFinalizeSuggestion("");
                              }}
                              size="sm"
                              type="button"
                            >
                              Usar sugestão
                            </Button>
                            <Button className="rounded-full" onClick={() => setTicketFinalizeSuggestion("")} size="sm" type="button" variant="ghost">
                              Descartar
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                          disabled={Boolean(quickSaving)}
                          onClick={() => {
                            setTicketFinalizeStatus("");
                            setTicketFinalizeDocumentNumber("");
                            setTicketFinalizeText("");
                            setTicketFinalizeSuggestion("");
                          }}
                          type="button"
                          variant="ghost"
                        >
                          Cancelar
                        </Button>
                        <Button
                          disabled={Boolean(quickSaving)}
                          onClick={() => {
                            const finalText = ticketFinalizeText.trim();
                            if (!finalText) {
                              showToast("error", "Informe a orientação final para encerrar o atendimento.");
                              return;
                            }
                            void handleQuickUpdate(
                              {
                                status: ticketFinalizeStatus,
                                result: buildTicketFinalizeResult(ticketFinalizeStatus, ticketFinalizeDocumentNumber, finalText),
                                closed_at: ticketFinalizeDate,
                                closure_confirmed: true,
                              },
                              "status",
                            );
                          }}
                          type="button"
                        >
                          {quickSaving === "status" ? "Finalizando..." : "Finalizar atendimento"}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {ticketReopenStatus ? (
                    <div className="rounded-[18px] border border-amber-100 bg-amber-50/70 p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-amber-950">Reabrir atendimento</p>
                        <p className="text-sm leading-6 text-amber-900/80">
                          Registre por que o atendimento voltou para {ticketReopenStatus}.
                        </p>
                      </div>
                      <div className="mt-3 max-w-xs">
                        <Field label="Data da reabertura">
                          <Input
                            type="date"
                            value={ticketReopenDate}
                            onChange={(event) => setTicketReopenDate(event.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-amber-950">Motivo</span>
                        <Button
                          className="rounded-full"
                          disabled={ticketReopenSummaryBusy || !aiTextReady(ticketReopenText)}
                          onClick={handleSummarizeTicketReopenText}
                          size="sm"
                          type="button"
                          variant={aiTextReady(ticketReopenText) ? "default" : "secondary"}
                        >
                          <Sparkles className="size-4" />
                          {ticketReopenSummaryBusy ? "Melhorando..." : "Melhorar com IA"}
                        </Button>
                      </div>
                      <Textarea
                        className="mt-2"
                        maxLength={1200}
                        onChange={(event) => {
                          setTicketReopenText(event.target.value);
                          setTicketReopenSuggestion("");
                        }}
                        placeholder="Ex.: Morador trouxe nova informação; serviço não foi concluído; pedido voltou para acompanhamento..."
                        rows={3}
                        value={ticketReopenText}
                      />
                      <p className={`mt-1 text-xs font-medium ${aiTextCounterClass(ticketReopenText)}`}>{aiTextCounterLabel(ticketReopenText)}</p>
                      {ticketReopenSuggestion ? (
                        <div className="mt-3 rounded-[18px] border border-sky-100 bg-white/80 p-3 text-sm text-slate-700">
                          <p className="font-semibold text-slate-950">Sugestão da IA</p>
                          <p className="mt-1 leading-6">{ticketReopenSuggestion}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              className="rounded-full"
                              onClick={() => {
                                setTicketReopenText(ticketReopenSuggestion);
                                setTicketReopenSuggestion("");
                              }}
                              size="sm"
                              type="button"
                            >
                              Usar sugestão
                            </Button>
                            <Button className="rounded-full" onClick={() => setTicketReopenSuggestion("")} size="sm" type="button" variant="ghost">
                              Descartar
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                          disabled={Boolean(quickSaving)}
                          onClick={() => {
                            setTicketReopenStatus("");
                            setTicketReopenDate(currentDate());
                            setTicketReopenText("");
                            setTicketReopenSuggestion("");
                          }}
                          type="button"
                          variant="ghost"
                        >
                          Cancelar
                        </Button>
                        <Button
                          disabled={Boolean(quickSaving)}
                          onClick={() => {
                            const reopenText = ticketReopenText.trim();
                            if (!reopenText) {
                              showToast("error", "Informe o motivo da reabertura.");
                              return;
                            }
                            void handleQuickUpdate(
                              {
                                status: ticketReopenStatus,
                                result: "",
                                closed_at: "",
                                closure_confirmed: false,
                                reopen_date: ticketReopenDate || currentDate(),
                                reopen_note: reopenText,
                              },
                              "status",
                            );
                          }}
                          type="button"
                        >
                          {quickSaving === "status" ? "Reabrindo..." : "Reabrir atendimento"}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {selectedRecentNotes.length ? (
                    <div className="rounded-[18px] border border-sky-100 bg-sky-50/55 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Últimas notas</p>
                        <Button
                          onClick={openTicketNoteComposer}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          <Plus className="size-4" />
                          Adicionar
                        </Button>
                      </div>
                      <div className="mt-2 space-y-2">
                        {selectedRecentNotes.map((item: any) => (
                          <div className="rounded-2xl bg-white/85 px-3 py-2" key={`recent-note-${item.id}`}>
                            <p className="text-xs font-semibold text-slate-500">{ticketHistoryMeta(item)}</p>
                            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-5 text-slate-700">{formatTicketHistoryText(item)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedFinalGuidance && !selectedIsResolutionStatus ? (
                    <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/60 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Orientação final anterior</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">{selectedFinalGuidance}</p>
                    </div>
                  ) : null}

                  <QuickTextarea
                    disabled={Boolean(quickSaving)}
                    onDraftStateChange={(dirty) => setQuickTextareaDraftState("description", dirty)}
                    label="Descrição"
                    onSummarize={summarizeTicketText}
                    onSave={(value) => handleQuickUpdate({ description: value }, "descricao")}
                    placeholder="Explique o pedido principal em linguagem simples."
                    value={selected.ticket.description || ""}
                  />
                  {selectedIsAwaitingStatus ? (
                    <QuickTextarea
                      disabled={Boolean(quickSaving)}
                      onDraftStateChange={(dirty) => setQuickTextareaDraftState("dependency", dirty)}
                      label="Aguardando"
                      onSummarize={summarizeTicketText}
                      summarizeLabel="Melhorar com IA"
                      onSave={(value) => handleQuickUpdate({ dependency_note: value }, "dependencia")}
                      placeholder="Se o caso depende de resposta, serviço, documento ou pessoa, registre aqui."
                      value={selected.ticket.dependency_note || ""}
                    />
                  ) : null}
                  {selectedIsResolutionStatus ? (
                    <QuickTextarea
                      actionLabel="Atualizar orientação"
                      disabled={Boolean(quickSaving)}
                      onDraftStateChange={(dirty) => setQuickTextareaDraftState("result", dirty)}
                      label="Orientação final"
                      onSummarize={summarizeTicketText}
                      summarizeLabel="Melhorar com IA"
                      onSave={(value) => handleQuickUpdate({ result: value, closure_confirmed: true }, "resolucao")}
                      placeholder="Quando encerrar, escreva o que foi orientado, encaminhado ou combinado com a pessoa."
                      value={selected.ticket.result || ""}
                    />
                  ) : null}
                </div>
              </SectionCard>

              <div id="ticket-notes-section">
              <SectionCard
                action={
                  !ticketNoteOpen ? (
                    <Button
                      disabled={ticketNoteSaving}
                      onClick={openTicketNoteComposer}
                      size="sm"
                      type="button"
                    >
                      <Plus className="size-4" />
                      Adicionar nota
                    </Button>
                  ) : null
                }
                title="Notas e orientação"
              >
                <div className="space-y-3">
                  {ticketNoteOpen ? (
                    <div className="space-y-2 rounded-[18px] border border-slate-100 bg-slate-50/75 p-3">
                      <Textarea
                        autoFocus
                        maxLength={1200}
                        onChange={(event) => {
                          setTicketNoteText(event.target.value);
                          setTicketNoteSummarySuggestion("");
                        }}
                        placeholder="Nota do atendimento: registre o que foi feito, combinado ou encaminhado agora."
                        rows={3}
                        value={ticketNoteText}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`text-xs font-medium ${aiTextCounterClass(ticketNoteText)}`}>
                          {aiTextCounterLabel(ticketNoteText)} · {ticketNoteText.length}/1200
                        </span>
                        <Button
                          className="rounded-full"
                          disabled={ticketNoteSaving || ticketNoteSummaryBusy || !aiTextReady(ticketNoteText)}
                          onClick={handleSummarizeTicketNote}
                          size="sm"
                          type="button"
                          variant={aiTextReady(ticketNoteText) ? "default" : "secondary"}
                        >
                          <Sparkles className="size-4" />
                          {ticketNoteSummaryBusy ? "Melhorando..." : "Melhorar com IA"}
                        </Button>
                      </div>

                      {ticketNoteSummarySuggestion ? (
                        <div className="rounded-[16px] border border-orange-100 bg-orange-50/80 p-3 text-sm leading-6 text-orange-950">
                          <p className="font-semibold text-slate-950">Sugestão da IA</p>
                          <p className="mt-1 whitespace-pre-wrap">{ticketNoteSummarySuggestion}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              onClick={() => {
                                setTicketNoteText(ticketNoteSummarySuggestion);
                                setTicketNoteSummarySuggestion("");
                              }}
                              size="sm"
                              type="button"
                            >
                              Usar texto
                            </Button>
                            <Button onClick={() => setTicketNoteSummarySuggestion("")} size="sm" type="button" variant="ghost">
                              Descartar
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {selectedPublicTrackingEnabled ? (
                      <div className="rounded-[18px] border border-slate-100 bg-white px-3 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-950">Onde esta nota aparece</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Marque online apenas quando esta nota puder aparecer no acompanhamento público.
                            </p>
                          </div>
                          <button
                            aria-pressed={ticketNotePublishOnline}
                            className={cn(
                              "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-2.5 pr-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
                              ticketNotePublishOnline
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-sky-700",
                            )}
                            onClick={() => setTicketNotePublishOnline((current) => !current)}
                            type="button"
                          >
                            <span className={cn(
                              "relative inline-flex h-5 w-9 items-center rounded-full transition",
                              ticketNotePublishOnline ? "bg-sky-600" : "bg-slate-300",
                            )}>
                              <span className={cn(
                                "absolute size-4 rounded-full bg-white shadow-sm transition",
                                ticketNotePublishOnline ? "left-4" : "left-0.5",
                              )} />
                            </span>
                            Online
                          </button>
                        </div>
                        {ticketNotePublishOnline ? (
                          <div className="mt-3">
                            <Field label="Status no acompanhamento">
                              <Input
                                className="h-10 rounded-full bg-slate-50"
                                maxLength={80}
                                onChange={(event) => setTicketNotePublicStatus(event.target.value)}
                                placeholder="Ex.: Em acompanhamento"
                                value={ticketNotePublicStatus}
                              />
                            </Field>
                          </div>
                        ) : null}
                      </div>
                      ) : null}

                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                          disabled={ticketNoteSaving || ticketNoteSummaryBusy}
                          onClick={() => {
                            setTicketNoteOpen(false);
                            setTicketNoteText("");
                            setTicketNoteSummarySuggestion("");
                            setTicketNotePublishOnline(false);
                          }}
                          type="button"
                          variant="ghost"
                        >
                          Cancelar
                        </Button>
                        <Button disabled={ticketNoteSaving || ticketNoteSummaryBusy} onClick={handleAddTicketNote} type="button">
                          <Send className="size-4" />
                          {ticketNoteSaving ? "Registrando..." : "Registrar nota"}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {selectedNotesHistory.length ? (
                      selectedNotesHistory.map((item: any, index: number) => {
                        const normalizedAction = normalizeStatusLabel(item.action_type || "");
                        const actionLabel = formatTicketHistoryAction(item.action_type || "", item.text || "", item);
                        const isNoteHistory = isTicketNoteHistory(item);
                        const isPublicHistory = Boolean(Number(item.public_visible || 0)) || normalizedAction.includes("public");
                        const isPublishableHistory = isTicketNotesTimelineItem(item);
                        const isEditingNote = editingTicketNoteId === Number(item.id);
                        const isDeletingNote = deletingTicketNoteId === Number(item.id);
                        const isSavingVisibility = ticketNoteVisibilitySavingId === Number(item.id);
                        const zebraClass = index % 2 === 0
                          ? "border-slate-200 bg-white"
                          : "border-slate-200 bg-slate-100/80";
                        return (
                          <div className={`rounded-[18px] border px-3 py-3 ${zebraClass}`} key={item.id}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">{actionLabel}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {ticketHistoryMeta(item)}
                                </p>
                              </div>
                              {selectedPublicTrackingEnabled && isPublishableHistory ? (
                                <button
                                  aria-label={isPublicHistory ? "Tirar item do acompanhamento online" : "Publicar item no acompanhamento online"}
                                  aria-pressed={isPublicHistory}
                                  className={cn(
                                    "inline-flex h-8 items-center gap-2 rounded-full border px-2 pr-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-45",
                                    isPublicHistory
                                      ? "border-sky-200 bg-sky-50 text-sky-700"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-sky-700",
                                  )}
                                  disabled={isSavingVisibility}
                                  onClick={() => handleChangeTicketHistoryNoteVisibility(item, isPublicHistory ? "internal" : "public")}
                                  type="button"
                                >
                                  <span className={cn(
                                    "relative inline-flex h-4 w-7 items-center rounded-full transition",
                                    isPublicHistory ? "bg-sky-600" : "bg-slate-300",
                                  )}>
                                    <span className={cn(
                                      "absolute size-3 rounded-full bg-white shadow-sm transition",
                                      isPublicHistory ? "left-3.5" : "left-0.5",
                                    )} />
                                  </span>
                                  Online
                                </button>
                              ) : null}
                            </div>
                            {isEditingNote ? (
                              <div className="mt-3 space-y-3">
                                <Textarea
                                  disabled={editingTicketNoteSaving}
                                  maxLength={1200}
                                  onChange={(event) => setEditingTicketNoteText(event.target.value)}
                                  rows={4}
                                  value={editingTicketNoteText}
                                />
                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                  <Button
                                    disabled={editingTicketNoteSaving}
                                    onClick={() => {
                                      setEditingTicketNoteId(null);
                                      setEditingTicketNoteText("");
                                    }}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    disabled={editingTicketNoteSaving}
                                    onClick={() => handleSaveTicketHistoryNote(item)}
                                    size="sm"
                                    type="button"
                                  >
                                    {editingTicketNoteSaving ? "Atualizando..." : "Atualizar nota"}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {formatTicketHistoryText(item) ? (
                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{formatTicketHistoryText(item)}</p>
                                ) : null}
                                <div className="mt-2 flex flex-wrap justify-end gap-2">
                                  {isNoteHistory ? (
                                    <Button
                                      disabled={editingTicketNoteSaving || isDeletingNote}
                                      onClick={() => startEditTicketNote(item)}
                                      size="sm"
                                      type="button"
                                      variant="ghost"
                                    >
                                      Editar
                                    </Button>
                                  ) : null}
                                  {isNoteHistory ? (
                                    <Button
                                      className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                      disabled={editingTicketNoteSaving || isDeletingNote}
                                      onClick={() => handleDeleteTicketHistoryNote(item)}
                                      size="sm"
                                      type="button"
                                      variant="ghost"
                                    >
                                      <Trash2 className="size-4" />
                                      {isDeletingNote ? "Excluindo..." : "Excluir"}
                                    </Button>
                                  ) : null}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[18px] bg-slate-50/80 px-3 py-4 text-sm text-slate-500">
                        Nenhuma nota ou orientação ainda.
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>
              </div>

              {selected.documents?.length ? (
                <SectionCard title="Documentos">
                  <TimelineList
                    items={selected.documents.map((item: any) => ({
                      title: item.subject_line || item.internal_number,
                      meta: `${item.type} · ${item.status}`,
                      note: item.internal_number,
                    }))}
                  />
                </SectionCard>
              ) : null}

              {selected.tasks?.length ? (
                <SectionCard
                  action={
                    <Button asChild size="sm" type="button" variant="secondary">
                      <Link href="/tarefas">
                        Abrir em Tarefas
                      </Link>
                    </Button>
                  }
                  title="Pendências"
                >
                  <div className="space-y-2">
                    {selected.tasks.map((item: any) => (
                      <div className="flex flex-col gap-1 rounded-[18px] border border-slate-100 bg-slate-50/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
                          {item.due_at ? <p className="text-xs text-slate-500">{formatTicketDateTime(item.due_at)}</p> : null}
                        </div>
                        <Badge variant={item.status === "Concluida" ? "success" : "neutral"}>{item.status || "Pendente"}</Badge>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : null}

              <SectionCard
                action={
                  <label
                    className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                      ticketAttachmentSaving || selectedTicketAttachments.length >= TICKET_ATTACHMENT_MAX_FILES
                        ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                        : "cursor-pointer border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:text-sky-700"
                    }`}
                  >
                    <Paperclip className="size-4" />
                    {ticketAttachmentSaving ? "Anexando..." : "Anexar"}
                    <input
                      accept={TICKET_ATTACHMENT_ACCEPT}
                      className="hidden"
                      disabled={ticketAttachmentSaving || selectedTicketAttachments.length >= TICKET_ATTACHMENT_MAX_FILES}
                      multiple
                      onChange={handleSelectedTicketAttachmentsChange}
                      type="file"
                    />
                  </label>
                }
                title="Anexos"
              >
                <p className="text-xs text-slate-400">
                  {selectedTicketAttachments.length}/{TICKET_ATTACHMENT_MAX_FILES} · PDF, JPG, PNG ou WEBP · {ticketAttachmentRulesLabel()}
                </p>
                {selectedTicketAttachments.length ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {selectedTicketAttachments.map((file: any) => {
                      const isOnline = Boolean(Number(file.public_visible || 0));
                      const isSaving = ticketAttachmentVisibilitySavingId === Number(file.id || 0);
                      return (
                        <div
                          className="group flex min-w-0 items-center gap-3 rounded-[18px] border border-slate-100 bg-slate-50/80 p-2 transition hover:border-sky-100 hover:bg-sky-50/70"
                          key={file.id || file.file_url}
                        >
                          <a
                            className="flex min-w-0 flex-1 items-center gap-3"
                            href={file.file_url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {isTicketAttachmentImage(file) ? (
                              <img
                                alt={file.original_name || "Imagem do atendimento"}
                                className="size-14 shrink-0 rounded-2xl object-cover"
                                src={file.file_url}
                              />
                            ) : (
                              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                                <FileText className="size-5" />
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-800">
                                {file.original_name || "Arquivo"}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {formatTicketAttachmentSize(ticketAttachmentBytes(file)) || (isTicketAttachmentImage(file) ? "Imagem" : "Documento")}
                              </span>
                            </span>
                          </a>
                          {selectedPublicTrackingEnabled ? (
                            <button
                              aria-label={isOnline ? "Tirar anexo do acompanhamento online" : "Publicar anexo no acompanhamento online"}
                              aria-pressed={isOnline}
                              className={cn(
                                "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-2 pr-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-45",
                                isOnline
                                  ? "border-sky-200 bg-sky-50 text-sky-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-sky-700",
                              )}
                              disabled={isSaving}
                              onClick={() => handleChangeTicketAttachmentVisibility(file, !isOnline)}
                              type="button"
                            >
                              <span className={cn(
                                "relative inline-flex h-4 w-7 items-center rounded-full transition",
                                isOnline ? "bg-sky-600" : "bg-slate-300",
                              )}>
                                <span className={cn(
                                  "absolute size-3 rounded-full bg-white shadow-sm transition",
                                  isOnline ? "left-3.5" : "left-0.5",
                                )} />
                              </span>
                              Online
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-[18px] bg-slate-50/80 px-3 py-4 text-sm text-slate-500">
                    Nenhum anexo neste atendimento.
                  </div>
                )}
              </SectionCard>

            </div>

            {selectedHasSidePanel ? (
            <div className="space-y-4">
              {ticketPublicPanelOpen ? (
              <SectionCard
                action={
                  <Button
                    onClick={() => setTicketPublicPanelOpen(false)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X className="size-4" />
                    Fechar
                  </Button>
                }
                title="Acompanhamento público"
              >
                {!selectedTracking?.enabled ? (
                  <div className="flex items-center justify-between gap-3 rounded-[18px] border border-sky-100 bg-sky-50/70 px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">Desligado</p>
                      <p className="truncate text-xs text-slate-600">Protocolo online só quando precisar.</p>
                    </div>
                    <Button
                      className="shrink-0 rounded-full"
                      disabled={publicTrackingBusy === "enable"}
                      onClick={handleEnablePublicTracking}
                      size="sm"
                      type="button"
                    >
                      <ShieldCheck className="size-4" />
                      {publicTrackingBusy === "enable" ? "Ativando..." : "Ativar"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-[20px] border border-sky-100 bg-sky-50/70 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Protocolo online</p>
                          <p className="mt-1 truncate text-base font-semibold text-slate-950">{selectedTracking.code}</p>
                          <p className="mt-1 truncate text-xs text-slate-600">{selectedTracking.public_status || "Recebido pelo gabinete"}</p>
                        </div>
                        <Button
                          className="shrink-0"
                          onClick={() => copyText(selectedTrackingUrl, "Link")}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          <Copy className="size-4" />
                          Copiar link
                        </Button>
                      </div>
                      <div className="mt-3 rounded-2xl border border-white bg-white/85 px-3 py-2">
                        <p className="truncate text-xs font-medium text-slate-500">{selectedTrackingUrl}</p>
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-950">Mensagem para enviar</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            disabled={!publicSecret}
                            onClick={() => copyText(buildPublicTrackingMessage(publicSecret), "Mensagem")}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            <Copy className="size-4" />
                            Copiar mensagem
                          </Button>
                          <Button
                            disabled={!selectedContactPhone || !publicSecret || publicTrackingBusy === "whatsapp"}
                            onClick={() => handleSendPublicTracking("whatsapp")}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            <MessageCircle className="size-4" />
                            Abrir WhatsApp
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                        {publicSecret
                          ? buildPublicTrackingMessage(publicSecret)
                          : "Gere uma nova senha para copiar a mensagem completa com link e senha."}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-amber-100 bg-amber-50/70 px-2.5 py-2 text-xs text-slate-700">
                        <KeyRound className="size-4 shrink-0 text-amber-700" />
                        <span className="min-w-0 flex-1 truncate">
                          {publicSecret
                            ? `Senha: ${publicSecret}`
                            : `Senha oculta${selectedTracking.secret_hint ? ` (${selectedTracking.secret_hint})` : ""}`}
                        </span>
                        <Button
                          disabled={publicTrackingBusy === "secret"}
                          onClick={handleRotatePublicSecret}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {publicTrackingBusy === "secret" ? "Gerando..." : "Nova senha"}
                        </Button>
                        <Button
                          disabled={!publicSecret}
                          onClick={() => copyText(publicSecret, "Senha")}
                          size="sm"
                          title="Copiar senha"
                          type="button"
                          variant="secondary"
                        >
                          <Copy className="size-4" />
                          Senha
                        </Button>
                      </div>
                    </div>

                    <Button
                      className="border-rose-200 bg-white text-rose-700 shadow-none hover:border-rose-300 hover:bg-rose-50"
                      disabled={publicTrackingBusy === "disable"}
                      onClick={handleDisablePublicTracking}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <EyeOff className="size-4" />
                      {publicTrackingBusy === "disable" ? "Desativando..." : "Desativar acompanhamento"}
                    </Button>

                    {(selected.public_updates || []).length ? (
                      <div className="divide-y divide-slate-100 overflow-hidden rounded-[18px] border border-slate-200 bg-white">
                        {(selected.public_updates || []).slice(0, 3).map((item: any) => (
                          <div className="px-3 py-2.5" key={item.id}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-950">
                                {item.public_status || selectedTracking.public_status || "Atualização"}
                              </p>
                              <p className="text-xs text-slate-500">{formatTicketDateTime(item.created_at)}</p>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{item.message}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </SectionCard>
              ) : null}

              {ticketExtraPanelOpen && selectedAddressLines.length ? (
                <SectionCard title="Local do pedido">
                  <div className="space-y-4">
                  <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-1 size-4 shrink-0 text-orange-600" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">Endereco</p>
                        {selectedAddressLines.length ? (
                          <div className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                            {selectedAddressLines.map((line) => (
                              <p key={line}>{line}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm leading-6 text-slate-500">Sem endereco informado.</p>
                        )}
                      </div>
                    </div>
                    {selectedMapUrl ? (
                      <Button asChild className="mt-4 rounded-full" type="button" variant="secondary">
                        <a href={selectedMapUrl} rel="noreferrer" target="_blank">
                          <ExternalLink className="size-4" />
                          Abrir no mapa
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  <QuickInput
                    disabled={Boolean(quickSaving)}
                    label="Editar CEP"
                    onSave={(value) => {
                      void handleQuickCepUpdate(value);
                    }}
                    placeholder="00000-000"
                    value={formatCepInput(selected.ticket.contact_zip_code || "")}
                  />
                  </div>
                </SectionCard>
              ) : null}

              {ticketExtraPanelOpen && (selected.ticket.external_protocol || selected.ticket.support_link) ? (
                <SectionCard title="Referências">
                  <div className="space-y-4">
                  <QuickInput
                    disabled={Boolean(quickSaving)}
                    label="Codigo interno do Gabinete"
                    onSave={(value) => handleQuickUpdate({ external_protocol: value }, "codigo")}
                    placeholder="Ex.: protocolo da prefeitura, controle interno ou codigo do gabinete."
                    value={selected.ticket.external_protocol || ""}
                  />
                  <QuickInput
                    disabled={Boolean(quickSaving)}
                    label="Link de apoio"
                    onSave={(value) => handleQuickUpdate({ support_link: value }, "link")}
                    placeholder="Cole aqui mapa, Street View, Drive, protocolo ou estudo externo."
                    value={selected.ticket.support_link || ""}
                  />
                  {selected.ticket.support_link ? (
                    <Button asChild className="w-full rounded-full" type="button" variant="secondary">
                      <a href={selected.ticket.support_link} rel="noreferrer" target="_blank">
                        <ExternalLink className="size-4" />
                        Abrir link complementar
                      </a>
                    </Button>
                  ) : null}
                </div>
              </SectionCard>
              ) : null}

              {selected.email_messages?.length ? (
                <SectionCard title="E-mails">
                  <TimelineList
                    items={selected.email_messages.map((item: any) => ({
                      title: item.subject,
                      meta: `${item.remote_email} · ${item.created_at.slice(0, 16).replace("T", " ")}`,
                      note: item.user_name || "Gabinete",
                    }))}
                  />
                </SectionCard>
              ) : null}
            </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {selectedTicketIds.size ? (
            <div className="flex flex-col gap-3 rounded-[28px] border border-orange-100 bg-orange-50/70 p-4 shadow-[0_18px_50px_-42px_rgba(249,115,22,0.25)] md:flex-row md:items-center md:justify-between">
              <div>
                <strong className="text-sm text-orange-950">{selectedTicketIds.size} pedido(s) selecionado(s)</strong>
                <p className="mt-1 text-xs leading-5 text-orange-800">Aplique a ação e mantenha foco na lista.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                  disabled={bulkFinalizingTicket || selectedOpenTickets.length === 0}
                  onClick={openBulkFinalize}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <CheckCircle2 className="size-4" />
                  Finalizar
                </Button>
                <Button
                  className="border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100"
                  disabled={bulkDeletingTicket}
                  onClick={handleBulkDeleteTickets}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Trash2 className="size-4" />
                  Excluir
                </Button>
                <Button onClick={() => setSelectedTicketIds(new Set())} size="sm" type="button" variant="ghost">
                  Limpar selecao
                </Button>
              </div>
            </div>
          ) : null}
	          <SectionCard
	            action={
	              visibleTickets.length ? (
	                <label className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
	                  <input
	                    aria-label="Selecionar pedidos carregados"
	                    checked={allVisibleSelected}
	                    onChange={(event) => toggleVisibleSelection(event.target.checked)}
	                    type="checkbox"
	                  />
	                  Selecionar carregados
	                </label>
	              ) : null
	            }
	            title={ticketLoadLabel}
	          >
            {loading ? (
              <AppListSkeleton rows={8} />
            ) : visibleTickets.length ? (
              <>
	              <div className="overflow-hidden rounded-[22px] border border-slate-100 bg-white">
	                <div className="divide-y divide-slate-100">
                  {visibleTickets.map((ticket: any, index: number) => {
                    const contactPhone = ticket.contact_whatsapp || ticket.contact_phone || "";
                    const preview = buildTicketPreview(ticket);
                    const ticketLabel = ticket.demand_title || contactDisplayName(ticket) || "pedido";
                    const rowState = ticketListState(ticket);
                    const rowMeta = [
                      contactDisplayName(ticket) || "Contato não identificado",
                      contactPhone ? formatPhoneDisplay(contactPhone) : "",
                      ticket.contact_neighborhood || ticket.contact_city || "",
                    ].filter(Boolean);
                    return (
                      <article
                        className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-3.5 text-left transition hover:bg-orange-50/55 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-4 ${
                          index % 2 === 0 ? "bg-white" : "bg-slate-50/65"
                        }`}
                        data-testid="ticket-list-row"
                        key={ticket.id}
                      >
                        <input
                          aria-label={`Selecionar ${ticketLabel}`}
                          checked={selectedTicketIds.has(ticket.id)}
                          className="mt-1 size-4 shrink-0 sm:mt-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            toggleTicketSelection(ticket.id, !selectedTicketIds.has(ticket.id), event.shiftKey);
                          }}
                          readOnly
                          type="checkbox"
                        />
                        <button
                          className="min-w-0 text-left"
                          onClick={(event) => {
                            if (event.shiftKey) {
                              toggleTicketSelection(ticket.id, !selectedTicketIds.has(ticket.id), true);
                              return;
                            }
                            openTicket(ticket.id);
                          }}
                          type="button"
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="min-w-0 truncate text-base font-semibold leading-6 text-slate-950" data-testid="ticket-list-title">
                              {ticket.demand_title || "Assunto não informado"}
                            </span>
                            <span
                              className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:hidden ${rowState.className}`}
                            >
                              {rowState.label}
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-[13px] font-medium leading-5 text-slate-600 sm:text-sm">
                            {rowMeta.join(" · ")}
                          </span>
                          {preview ? (
                            <span className="mt-1 block line-clamp-2 text-sm leading-5 text-slate-700 sm:line-clamp-1">
                              {preview}
                            </span>
                          ) : null}
                        </button>
                        <div className="col-start-2 flex shrink-0 items-center justify-end gap-1.5 sm:col-auto sm:justify-start">
                          <span
                            className={`hidden whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex ${rowState.className}`}
                          >
                            {rowState.label}
                          </span>
                          <button
                            aria-label={`Abrir ${ticketLabel}`}
                            className="grid size-9 place-items-center rounded-full bg-white text-slate-300 shadow-sm ring-1 ring-slate-100 transition hover:text-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-100"
                            onClick={() => openTicket(ticket.id)}
                            title="Abrir"
                            type="button"
                          >
                            <ChevronRight className="size-4" />
                          </button>
	                          <button
	                            aria-label={`Excluir ${ticketLabel}`}
                            className="grid size-9 place-items-center rounded-full bg-white text-rose-500 shadow-sm ring-1 ring-rose-100 transition hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:opacity-50"
                            disabled={deletingTicket}
                            onClick={() => handleDeleteTicket(ticket)}
                            title="Excluir"
                            type="button"
                          >
	                            <Trash2 className="size-4" />
	                          </button>
	                        </div>
                        <EtiquetaChips className="col-start-2 sm:col-start-2 sm:col-span-1" value={ticket.tags} onPick={setQuery} />
	                      </article>
                    );
                  })}
	                </div>
	              </div>
                <div
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500"
                  ref={ticketAutoLoadRef}
                >
                  <span>
                    {ticketLoadLabel}
                    {loadingMoreTickets ? " · carregando mais..." : ""}
                    {selectedTicketIds.size > 0 && ticketLoadMeta.hasMore ? " · automatico pausado durante a selecao" : ""}
                  </span>
                  {ticketLoadMeta.hasMore ? (
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={loadingMoreTickets} onClick={() => void loadMoreTickets()} size="sm" type="button" variant="secondary">
                        Carregar mais
                      </Button>
                      <Button disabled={loading || loadingMoreTickets} onClick={() => void loadAllTickets()} size="sm" type="button" variant="ghost">
                        Carregar todos
                      </Button>
                    </div>
                  ) : (
                    <span>Todos os pedidos deste filtro estao na tela.</span>
                  )}
                </div>
              </>
            ) : (
              <AppEmptyState
                text={
	                  query || status
	                    ? "Ajuste o termo ou status."
	                    : "A base ainda não tem casos ativos."
	                }
	                title={query || status ? "Nada encontrado" : "Nenhum atendimento"}
              />
            )}
          </SectionCard>
	        </>
	      )}

      <Sheet
        onOpenChange={(open) => {
          setBulkFinalizeOpen(open);
          if (!open) {
            setBulkFinalizeText("");
            setBulkFinalizeSuggestion("");
            setBulkFinalizeSummaryBusy(false);
          }
        }}
        open={bulkFinalizeOpen}
      >
        <SheetContent className="w-[min(520px,calc(100vw-1rem))] rounded-[28px]">
          <SheetHeader>
            <SheetTitle>Finalizar em lote</SheetTitle>
            <SheetDescription>
              {selectedOpenTickets.length} de {selectedTicketIds.size} selecionado(s) ainda estão abertos.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <form className="space-y-4" onSubmit={(event) => void handleBulkFinalizeTickets(event)}>
              <Field label="Data de fechamento">
                <Input
                  max={currentDate()}
                  onChange={(event) => setBulkFinalizeDate(event.target.value)}
                  type="date"
                  value={bulkFinalizeDate}
                />
              </Field>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">Orientação final</span>
                  <Button
                    className="rounded-full"
                    disabled={bulkFinalizeSummaryBusy || !aiTextReady(bulkFinalizeText)}
                    onClick={handleSummarizeBulkFinalizeText}
                    size="sm"
                    type="button"
                    variant={aiTextReady(bulkFinalizeText) ? "default" : "secondary"}
                  >
                    <Sparkles className="size-4" />
                    {bulkFinalizeSummaryBusy ? "Melhorando..." : "Melhorar com IA"}
                  </Button>
                </div>
                <Textarea
                  className="mt-2"
                  maxLength={1600}
                  onChange={(event) => {
                    setBulkFinalizeText(event.target.value);
                    setBulkFinalizeSuggestion("");
                  }}
                  placeholder="Ex.: Pedido encerrado conforme retorno informado ao munícipe."
                  rows={4}
                  value={bulkFinalizeText}
                />
                <p className={`mt-1 text-xs font-medium ${aiTextCounterClass(bulkFinalizeText)}`}>{aiTextCounterLabel(bulkFinalizeText)}</p>
              </div>
              {bulkFinalizeSuggestion ? (
                <div className="rounded-[18px] border border-sky-100 bg-sky-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">Sugestão da IA</p>
                  <p className="mt-1 leading-6">{bulkFinalizeSuggestion}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className="rounded-full"
                      onClick={() => {
                        setBulkFinalizeText(bulkFinalizeSuggestion);
                        setBulkFinalizeSuggestion("");
                      }}
                      size="sm"
                      type="button"
                    >
                      Usar sugestão
                    </Button>
                    <Button className="rounded-full" onClick={() => setBulkFinalizeSuggestion("")} size="sm" type="button" variant="ghost">
                      Descartar
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button disabled={bulkFinalizingTicket} onClick={() => setBulkFinalizeOpen(false)} type="button" variant="ghost">
                  Cancelar
                </Button>
                <Button disabled={bulkFinalizingTicket || !bulkFinalizeText.trim() || selectedOpenTickets.length === 0} type="submit">
                  {bulkFinalizingTicket ? "Finalizando..." : "Finalizar selecionados"}
                </Button>
              </div>
            </form>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet
        onOpenChange={(open) => {
          setPanelOpen(open);
          if (!open) {
            setShowAdvancedTicketFields(false);
            setTicketSummarySuggestion("");
            setTicketSummarySuggestionField("");
          }
        }}
        open={panelOpen}
      >
        <SheetContent className="inset-x-auto inset-y-auto bottom-auto left-1/2 right-auto top-4 max-h-[calc(100vh-2rem)] w-[min(920px,calc(100vw-1rem))] -translate-x-1/2 overflow-hidden rounded-[28px] sm:top-6 sm:max-h-[calc(100vh-3rem)]">
          <SheetHeader className="px-5 py-5 md:px-6">
            <SheetTitle>{form.id ? "Editar atendimento" : "Adicionar atendimento"}</SheetTitle>
            <SheetDescription className="sr-only">
              Formulário de atendimento com contato, pedido, andamento e dados complementares.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="overflow-x-hidden px-5 py-5 md:px-6">
            <form className="grid min-w-0 grid-cols-1 gap-4 overflow-x-hidden md:grid-cols-12" onSubmit={handleSave}>
              <div
                className={cn(
                  "col-span-full grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]",
                  form.id ? "lg:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)]" : "lg:grid-cols-[96px_minmax(0,1fr)]",
                )}
              >
                <OpeningDatePicker
                  value={form.opened_at}
                  onChange={(value) => setForm((current: any) => ({ ...current, opened_at: value }))}
                />
                <Field label="Tipo de entrada">
                <div className="space-y-2">
                  <select
                    className="h-11 w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    value={form.channel}
                    onChange={(event) =>
                      setForm((current: any) => ({
                        ...current,
                        channel: event.target.value,
                        channel_other: event.target.value === CREATE_NEW_OPTION ? current.channel_other : "",
                      }))
                    }
                  >
                    {visibleChannelOptions.map((item: any) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                    <option value={CREATE_NEW_OPTION}>Novo tipo...</option>
                  </select>
                  {form.channel === CREATE_NEW_OPTION ? (
                    <Input
                      autoFocus
                      placeholder="Criar tipo de entrada"
                      value={form.channel_other || ""}
                      onChange={(event) => setForm((current: any) => ({ ...current, channel_other: event.target.value }))}
                    />
                  ) : null}
                </div>
                </Field>
                {form.id ? (
                <Field className="sm:col-span-2 lg:col-span-1" label="Status">
                <div className="space-y-2">
                  <select
                    className="h-11 w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    value={form.status}
                    onChange={(event) =>
                      setForm((current: any) => ({
                        ...current,
                        status: event.target.value,
                        final_document_number: "",
                        status_other: event.target.value === CREATE_NEW_OPTION ? current.status_other : "",
                        status_other_is_final:
                          event.target.value === CREATE_NEW_OPTION ? current.status_other_is_final : false,
                      }))
                    }
                  >
                    {compactStatusOptions.map((item: any) => (
                      <option key={item.name} value={item.name}>
                        {ticketStatusDisplayName(item.name)}
                      </option>
                    ))}
                    <option value={CREATE_NEW_OPTION}>Outro...</option>
                  </select>
                  {form.status === CREATE_NEW_OPTION ? (
                    <div className="space-y-2">
                      <Input
                        autoFocus
                        placeholder="Criar status"
                        value={form.status_other || ""}
                        onChange={(event) =>
                          setForm((current: any) => ({
                            ...current,
                            status_other: event.target.value,
                            status_other_is_final: current.status_other_is_final || inferFinalStatusLabel(event.target.value),
                          }))
                        }
                      />
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                        <input
                          checked={Boolean(form.status_other_is_final)}
                          onChange={(event) => setForm((current: any) => ({ ...current, status_other_is_final: event.target.checked }))}
                          type="checkbox"
                        />
                        Encerra o atendimento
                      </label>
                    </div>
                  ) : null}
                </div>
                </Field>
                ) : null}
              </div>
              <Field className="md:col-span-4" label="Apelido">
                <Input
                  maxLength={CONTACT_NICKNAME_MAX_LENGTH}
                  placeholder="Ex.: Seu Zé"
                  value={form.contact_nickname || ""}
                  onChange={(event) =>
                    setForm((current: any) => ({ ...current, contact_nickname: event.target.value.slice(0, CONTACT_NICKNAME_MAX_LENGTH) }))
                  }
                />
              </Field>
              <Field className="md:col-span-4" label="Nome">
                <Input
                  maxLength={CONTACT_NAME_MAX_LENGTH}
                  required={!form.contact_id}
                  placeholder="Nome da pessoa"
                  value={form.contact_name}
                  onChange={(event) =>
                    setForm((current: any) => ({ ...current, contact_id: "", contact_name: event.target.value.slice(0, CONTACT_NAME_MAX_LENGTH) }))
                  }
                />
              </Field>
              <Field className="md:col-span-4" label="WhatsApp">
                <Input
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="(19) 99999-9999"
                  type="tel"
                  value={form.contact_whatsapp}
                  onChange={(event) => {
                    const nextValue = formatPhoneInput(event.target.value);
                    setForm((current: any) => ({ ...current, contact_id: "", contact_whatsapp: nextValue }));
                  }}
                />
              </Field>
              {!form.id && (contactSuggestBusy || contactSuggestions.length) ? (
                <div className="col-span-full rounded-[20px] border border-sky-100 bg-sky-50/70 p-2">
                  {contactSuggestBusy ? (
                    <div className="px-3 py-2 text-sm font-medium text-sky-700">Procurando contato...</div>
                  ) : (
                    <div className="grid gap-1">
                      {contactSuggestions.map((contact) => {
                        const phoneLabel = formatPhoneDisplay(contact.whatsapp || contact.phone || "");
                        const meta = [phoneLabel, contact.neighborhood, contact.city].filter(Boolean).join(" · ");
                        return (
                          <button
                            className="flex min-w-0 flex-col rounded-[16px] px-3 py-2 text-left transition hover:bg-white"
                            key={contact.id}
                            onClick={() => applyContactSuggestion(contact)}
                            type="button"
                          >
                            <span className="truncate text-sm font-semibold text-slate-950">{contact.nickname || contact.name}</span>
                            <span className="mt-0.5 truncate text-xs text-slate-500">{meta || contact.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
              <Field className="col-span-full" label="Demanda">
                <div className="relative">
                  <Input
                    autoComplete="off"
                    placeholder="Ex.: Poda de árvore"
                    required
                    value={form.demand_title}
                    onBlur={() =>
                      window.setTimeout(() => {
                        setDemandTitleFocused(false);
                        setForm((current: any) => ({ ...current, demand_title: canonicalDemandTitle(current.demand_title) }));
                      }, 120)
                    }
                    onChange={(event) => {
                      setDemandTitleFocused(true);
                      setForm((current: any) => ({ ...current, demand_title: event.target.value }));
                    }}
                    onFocus={() => setDemandTitleFocused(true)}
                  />
                  {showDemandTitleSuggestions ? (
                    <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-[22px] border border-slate-100 bg-white p-2 shadow-xl shadow-slate-950/10">
                      {filteredDemandTitleSuggestions.map((item) => (
                        <button
                          className="flex w-full items-center justify-between gap-3 rounded-[18px] px-3 py-2.5 text-left transition hover:bg-slate-50"
                          key={normalizeStatusLabel(item.title)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setForm((current: any) => ({ ...current, demand_title: item.title }));
                            setDemandTitleFocused(false);
                          }}
                          type="button"
                        >
                          <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{item.title}</span>
                          {item.total ? (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                              {`${item.total} ${item.total === 1 ? "uso" : "usos"}`}
                            </span>
                          ) : item.source === "base" ? (
                            <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                              Adicionar
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>
              {renderAiTextareaField("description", "Descrição", { rows: 8 })}
              {selectedStatusIsFinal ? (
                <>
                  {isFormalFinalStatusName(selectedStatusName) ? (
                    <Field className="col-span-full" label={ticketFinalizeDocumentLabel(selectedStatusName)}>
                      <Input
                        onChange={(event) => setForm((current: any) => ({ ...current, final_document_number: event.target.value.slice(0, 80) }))}
                        placeholder={ticketFinalizeDocumentPlaceholder(selectedStatusName)}
                        value={form.final_document_number || ""}
                      />
                    </Field>
                  ) : null}
                  {renderAiTextareaField("result", "Orientação final", {
                    rows: 3,
                    buttonLabel: "Melhorar com IA",
                  })}
                </>
              ) : null}
              <Field className="col-span-full" label="Anexos">
                <div className="space-y-3 rounded-[20px] border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
                        ticketAttachments.length >= TICKET_ATTACHMENT_MAX_FILES
                          ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                          : "cursor-pointer border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:text-sky-700"
                      }`}
                    >
                      <Paperclip className="size-4" />
                      Anexar PDF ou imagem
                      <input
                        accept={TICKET_ATTACHMENT_ACCEPT}
                        className="hidden"
                        disabled={ticketAttachments.length >= TICKET_ATTACHMENT_MAX_FILES}
                        multiple
                        onChange={handleTicketAttachmentsChange}
                        type="file"
                      />
                    </label>
                    <span className="text-xs text-slate-400">
                      {ticketAttachments.length}/{TICKET_ATTACHMENT_MAX_FILES} · PDF, JPG, PNG ou WEBP · {ticketAttachmentRulesLabel()}
                    </span>
                  </div>
                  {ticketAttachments.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ticketAttachments.map((file: any, index: number) => (
                        <div
                          className="flex min-w-0 items-center justify-between gap-3 rounded-[18px] border border-slate-100 bg-white px-3 py-2"
                          key={`${file.name}-${file.size}-${index}`}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600">
                              {isTicketAttachmentImage(file) ? <Paperclip className="size-4" /> : <FileText className="size-4" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-800">{file.name || "Arquivo"}</span>
                              <span className="block text-xs text-slate-400">{formatTicketAttachmentSize(ticketAttachmentBytes(file))}</span>
                            </span>
                          </span>
                          <button
                            className="grid size-9 shrink-0 place-items-center rounded-full text-rose-600 transition hover:bg-rose-50"
                            onClick={() => removeTicketAttachment(index)}
                            title="Remover anexo"
                            type="button"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>

              <div className="col-span-full flex justify-start pt-1">
                <Button
                  className="rounded-full"
                  onClick={() => setShowAdvancedTicketFields((current) => !current)}
                  type="button"
                  variant="secondary"
                >
                  {showAdvancedTicketFields ? "Mostrar menos" : "Mais dados"}
                </Button>
              </div>

              {showAdvancedTicketFields ? (
                <>
                  <Field className="md:col-span-4" label="Data de nascimento">
                    <Input
                      type="date"
                      value={form.contact_birth_date || ""}
                      onChange={(event) => setForm((current: any) => ({ ...current, contact_birth_date: event.target.value }))}
                    />
                  </Field>
                  <Field className="md:col-span-8" label="Documento">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={form.contact_cpf} onChange={(event) => setForm((current: any) => ({ ...current, contact_cpf: event.target.value }))} />
                      <Button className="shrink-0" disabled={documentLookupBusy} onClick={handleTicketDocumentLookup} type="button" variant="secondary">
                        <Wand2 className="size-4" />
                        {contactDocumentActionLabel}
                      </Button>
                    </div>
                    {contactDocumentError ? (
                      <p className="mt-2 text-xs font-medium text-red-600">{contactDocumentError}</p>
                    ) : null}
                  </Field>
                  <Field className="md:col-span-4" label="CEP">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={form.contact_zip_code} onChange={(event) => handleTicketCepChange(event.target.value)} />
                      <Button className="shrink-0" onClick={handleTicketCepLookup} type="button" variant="secondary">
                        Buscar CEP
                      </Button>
                    </div>
                  </Field>
                  {hasContactAddressDraft ? (
                    <>
                      <Field className="col-span-full" label="Endereço">
                        <Input value={form.contact_address} onChange={(event) => setForm((current: any) => ({ ...current, contact_address: event.target.value }))} />
                      </Field>
                      <Field label="Número">
                        <Input
                          placeholder="Ex.: 250"
                          value={form.contact_number}
                          onChange={(event) => setForm((current: any) => ({ ...current, contact_number: event.target.value }))}
                        />
                      </Field>
                      <Field label="Complemento">
                        <Input
                          placeholder="Ex.: apto 33"
                          value={form.contact_complement}
                          onChange={(event) => setForm((current: any) => ({ ...current, contact_complement: event.target.value }))}
                        />
                      </Field>
                      <Field label="Bairro">
                        <Input value={form.contact_neighborhood} onChange={(event) => setForm((current: any) => ({ ...current, contact_neighborhood: event.target.value }))} />
                      </Field>
                      <Field label="Cidade">
                        <>
                          <Input list="ticket-city-options" value={form.contact_city} onChange={(event) => setForm((current: any) => ({ ...current, contact_city: event.target.value }))} />
                          <datalist id="ticket-city-options">
                            {cityOptions.map((item) => (
                              <option key={item.nome} value={item.nome} />
                            ))}
                          </datalist>
                        </>
                      </Field>
                      <Field label="UF">
                        <select className="h-11 w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" value={form.contact_uf} onChange={(event) => setForm((current: any) => ({ ...current, contact_uf: event.target.value, contact_city: "" }))}>
                          <option value="">Selecionar</option>
                          {ufOptions.map((item) => (
                            <option key={item.sigla} value={item.sigla}>
                              {item.sigla} · {item.nome}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  ) : null}
                  <Field className="col-span-full" label="Etiquetas">
                    <Input
                      placeholder="Ex.: Elias, urgente"
                      value={form.tags || ""}
                      onChange={(event) => setForm((current: any) => ({ ...current, tags: event.target.value }))}
                    />
                  </Field>
                </>
              ) : null}

	              <div className="col-span-full flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
	                {form.id ? (
	                  <div className="flex flex-wrap gap-2">
	                    <Button
	                      className="border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100"
	                      disabled={deletingTicket || submitting}
	                      onClick={handleDeleteTicket}
	                      type="button"
	                      variant="secondary"
	                    >
	                      <Trash2 className="size-4" />
	                      {deletingTicket ? "Excluindo..." : "Excluir atendimento"}
	                    </Button>
	                  </div>
	                ) : (
	                  <span />
	                )}
	                <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
	                  <Button
	                    disabled={deletingTicket}
	                    onClick={() => {
	                      setPanelOpen(false);
	                      setShowAdvancedTicketFields(false);
	                    }}
	                    type="button"
	                    variant="ghost"
	                  >
	                    Cancelar
	                  </Button>
	                  <Button disabled={submitting || deletingTicket} type="submit">
	                    {submitting ? (form.id ? "Atualizando..." : "Adicionando...") : form.id ? "Atualizar atendimento" : "Adicionar atendimento"}
	                  </Button>
	                </div>
	              </div>
            </form>
          </SheetBody>
        </SheetContent>
	      </Sheet>

    </div>
  );
}

function taskTimelineDeadlineTone(value: string, status = ""): "green" | "amber" | "red" | "slate" {
  if (["Concluida", "Arquivada", "Cancelada"].includes(status)) return "slate";
  if (!value) return "slate";
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "slate";
  const diffMs = target.getTime() - Date.now();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffMs < 0) return "red";
  if (diffDays <= 2) return "amber";
  return "green";
}

function taskTimelinePriorityTone(priority = ""): "slate" | "sky" | "amber" | "rose" | "emerald" {
  if (priority === "Urgente") return "rose";
  if (priority === "Alta") return "amber";
  if (priority === "Normal") return "sky";
  return "slate";
}

function EtiquetaChips({ value, onPick, className = "" }: { value: unknown; onPick?: (value: string) => void; className?: string }) {
  const items = splitEtiquetas(value);
  if (!items.length) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {items.map((item) => (
        <button
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-orange-200 hover:text-orange-700"
          key={item}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPick?.(item);
          }}
          title={`Filtrar etiqueta ${item}`}
          type="button"
        >
          <Tag className="size-3" />
          {item}
        </button>
      ))}
    </span>
  );
}

function QuickTagInput({
  value,
  onSave,
  onPick,
  disabled,
}: {
  value: string;
  onSave: (value: string) => void;
  onPick?: (value: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const tags = splitEtiquetas(value);

  useEffect(() => {
    if (!editing) setDraft(value || "");
  }, [editing, value]);

  if (!editing) {
    return (
      <div className="flex min-h-[44px] min-w-[150px] flex-wrap items-center gap-1.5 rounded-[18px] border border-sky-100 bg-sky-50/45 px-2.5 py-1.5">
        <span className="w-full text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">Etiquetas</span>
        {tags.length ? (
          <EtiquetaChips value={value} onPick={onPick} />
        ) : (
          <span className="text-xs font-semibold text-slate-500">Sem etiqueta</span>
        )}
        <button
          className="rounded-full border border-sky-100 bg-white px-2 py-1 text-[11px] font-semibold text-sky-700 transition hover:border-sky-200 hover:bg-sky-50 disabled:opacity-50"
          disabled={disabled}
          onClick={() => setEditing(true)}
          type="button"
        >
          Editar
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-[220px] rounded-[18px] border border-sky-100 bg-sky-50/45 px-2.5 py-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">Etiquetas</span>
      <div className="mt-1 flex gap-1.5">
        <Input
          className="h-8 rounded-full bg-white px-2.5 text-xs"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ex.: saúde, Elias"
          value={draft}
        />
        <Button
          disabled={disabled}
          onClick={() => {
            onSave(draft.trim());
            setEditing(false);
          }}
          size="sm"
          type="button"
        >
          Salvar
        </Button>
        <Button
          disabled={disabled}
          onClick={() => {
            setDraft(value || "");
            setEditing(false);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function OpeningDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parts = openingDateParts(value);
  return (
    <label className="block min-w-0 space-y-2">
      <span className="block text-sm font-medium text-slate-600">Data abertura</span>
      <span className="relative block">
        <span
          aria-hidden="true"
          className="flex h-20 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40"
        >
          <span className="grid size-14 place-items-center rounded-2xl border border-orange-100 bg-orange-50 text-orange-700">
            <CalendarDays className="size-4" />
            <span className="-mt-1 text-xl font-bold leading-none tabular-nums">{parts.day}</span>
            <span className="-mt-1 text-[10px] font-semibold uppercase leading-none">{parts.month}</span>
          </span>
        </span>
        <input
          aria-label={`Abertura: ${parts.label}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onClick={openNativeDatePicker}
          onChange={(event) => onChange(event.target.value)}
          required
          type="date"
          value={value || ""}
        />
      </span>
    </label>
  );
}

function QuickSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  compact = false,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <label className={cn("block rounded-[18px] border border-orange-100 bg-orange-50/45", compact ? "min-w-[150px] px-2.5 py-1.5" : "px-3 py-2.5")}>
      <span className={cn("block font-semibold uppercase text-orange-700", compact ? "text-[10px] tracking-[0.16em]" : "text-[11px] tracking-[0.2em]")}>{label}</span>
      <select
        className={cn(
          "w-full rounded-full border border-orange-100 bg-white text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100 disabled:opacity-60",
          compact ? "mt-1 h-8 px-2.5" : "mt-1.5 h-9 px-3",
        )}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value || ""}
      >
        {options.map((item) => (
          <option key={`${label}-${item.value}`} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuickDate({
  label,
  value,
  onChange,
  onClear,
  disabled,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("block rounded-[18px] border border-orange-100 bg-orange-50/45", compact ? "min-w-[154px] px-2.5 py-1.5" : "px-3 py-2.5")}>
      <span className={cn("block font-semibold uppercase text-orange-700", compact ? "text-[10px] tracking-[0.16em]" : "text-[11px] tracking-[0.2em]")}>{label}</span>
      <div className={cn("relative", compact ? "mt-1" : "mt-1.5")}>
        <div className={cn("flex items-center justify-between gap-2 rounded-full border border-orange-100 bg-white text-sm font-semibold text-slate-900", compact ? "h-8 px-2.5" : "h-9 px-3")}>
          <span className={value ? "tabular-nums" : "text-slate-400"}>{value ? formatDateInputDisplay(value) : "Sem retorno"}</span>
          <CalendarDays className="size-4 shrink-0 text-orange-700" />
        </div>
        <input
          aria-label={`${label}: ${value ? formatDateInputDisplay(value) : "selecionar data"}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          disabled={disabled}
          onClick={openNativeDatePicker}
          onChange={(event) => onChange(event.target.value)}
          onFocus={openNativeDatePicker}
          type="date"
          value={value || ""}
        />
      </div>
      {value && onClear ? (
        <button
          className={cn("font-semibold text-orange-700 underline-offset-4 transition hover:text-orange-900 hover:underline disabled:opacity-50", compact ? "mt-1 text-[11px]" : "mt-2 text-xs")}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            onClear();
          }}
          type="button"
        >
          Remover retorno
        </button>
      ) : null}
    </div>
  );
}

function QuickTextarea({
  label,
  value,
  placeholder,
  onSave,
  onSummarize,
  onDraftStateChange,
  summarizeLabel = "Melhorar com IA",
  actionLabel = "Atualizar",
  disabled,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
  onSummarize?: (value: string) => Promise<string>;
  onDraftStateChange?: (dirty: boolean) => void;
  summarizeLabel?: string;
  actionLabel?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value || "");
  const [suggestion, setSuggestion] = useState("");
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    setDraft(value || "");
    setSuggestion("");
  }, [value]);

  const changed = draft !== (value || "");
  const readyForAi = aiTextReady(draft);

  useEffect(() => {
    onDraftStateChange?.(Boolean(changed || suggestion || summarizing));
  }, [changed, onDraftStateChange, suggestion, summarizing]);

  async function handleSummarizeDraft() {
    if (!onSummarize) return;
    setSummarizing(true);
    try {
      const summary = await onSummarize(draft);
      if (summary) setSuggestion(summary);
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="rounded-[18px] border border-slate-100 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {onSummarize ? (
            <Button
              className="rounded-full"
              disabled={disabled || summarizing || !readyForAi}
              onClick={handleSummarizeDraft}
              size="sm"
              type="button"
              variant={readyForAi ? "default" : "secondary"}
            >
              <Sparkles className="size-4" />
              {summarizing ? "Melhorando..." : summarizeLabel}
            </Button>
          ) : null}
          <Button
            className="rounded-full"
            disabled={disabled || !changed}
            onClick={() => onSave(draft.trim())}
            size="sm"
            type="button"
            variant={changed ? "default" : "secondary"}
          >
            {disabled ? "Atualizando..." : actionLabel}
          </Button>
        </div>
      </div>
      <Textarea
        className={cn(
          "mt-2 rounded-[14px] border-slate-200 bg-slate-50/70 text-sm leading-6",
          label === "Descrição" ? "min-h-[180px]" : "min-h-[96px]",
        )}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          setSuggestion("");
        }}
        placeholder={placeholder}
        value={draft}
      />
      {onSummarize ? <p className={`mt-1 text-xs font-medium ${aiTextCounterClass(draft)}`}>{aiTextCounterLabel(draft)}</p> : null}
      {suggestion ? (
        <div className="mt-2 rounded-[16px] border border-sky-100 bg-sky-50/70 p-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">Sugestao de melhoria</p>
          <p className="mt-1 leading-6">{suggestion}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className="rounded-full"
              onClick={() => {
                setDraft(suggestion);
                setSuggestion("");
              }}
              size="sm"
              type="button"
            >
              Aplicar
            </Button>
            <Button className="rounded-full" onClick={() => setSuggestion("")} size="sm" type="button" variant="ghost">
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuickInput({
  label,
  value,
  placeholder,
  onSave,
  disabled,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (value: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  const changed = draft !== (value || "");

  return (
    <div className="rounded-[18px] border border-slate-100 bg-slate-50/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          className="h-11 rounded-full bg-white"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          value={draft}
        />
        <Button
          className="rounded-full"
          disabled={disabled || !changed}
          onClick={() => onSave(draft.trim())}
          type="button"
        >
          {disabled ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>
    </div>
  );
}

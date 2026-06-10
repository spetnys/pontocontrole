"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CloudUpload,
  Download,
  ExternalLink,
  FileUp,
  Link2,
  Mail,
  MapPin,
  MessageSquareText,
  Navigation,
  Plus,
  QrCode,
  RefreshCcw,
  Save,
  Send,
  Server,
  Trash2,
  Users2,
} from "lucide-react";

import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { AppEmptyState, AppListSkeleton } from "@/components/workspace/primitives";
import { Field, KeyValueGrid, SectionCard, TimelineList } from "@/components/workspace/data-ui";
import { fetchJson } from "@/lib/api";
import {
  DEFAULT_PUBLIC_SELF_REGISTER_CONFIG,
  normalizePublicSelfRegisterConfig,
  PUBLIC_SELF_REGISTER_CONFIRMATION_OPTIONS,
  PUBLIC_SELF_REGISTER_FIELD_GROUPS,
  PUBLIC_SELF_REGISTER_FIELD_LABELS,
  PUBLIC_SELF_REGISTER_FIELD_OPTIONS,
  type PublicSelfRegisterFieldKey,
  type PublicSelfRegisterFieldMode,
} from "@/lib/public-self-register";
import {
  MAIN_WORKSPACE_MODULE_KEYS,
  WORKSPACE_MODULE_DEFINITIONS,
  buildDefaultWorkspaceModuleConfig,
  getWorkspaceModuleDefinition,
  normalizeWorkspaceModuleConfig,
} from "@/lib/workspace-modules";
import { formatCepInput, formatPhoneInput, onlyDigits } from "@/lib/utils";

const SELECT_CLASS_NAME =
  "h-11 w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-sm outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100";
const PUBLIC_SELF_REGISTER_INTRO_MAX_LENGTH = 280;
const GABINETE_NAME_MAX_LENGTH = 120;
const GABINETE_DISPLAY_NAME_MAX_LENGTH = 80;
const DEFAULT_PUBLIC_SELF_REGISTER_INTRO =
  "Explique o que aconteceu e qual ajuda voce precisa.";
const WORKSPACE_MODULE_SETTINGS_ORDER = MAIN_WORKSPACE_MODULE_KEYS;
const ADVANCED_SETTINGS_SECTION_KEYS = new Set(["routine", "menu", "admin", "lists"]);
const PUBLIC_FORM_MAIN_FIELDS: PublicSelfRegisterFieldKey[] = [
  "name",
  "whatsapp",
  "phone",
  "demand_title",
  "description",
  "zip_code",
  "number",
  "complement",
];

function buildLeanPublicSelfRegisterConfig(value: any) {
  return {
    ...normalizePublicSelfRegisterConfig(value),
    allow_anonymous: false,
    require_contact_channel: true,
    confirmation_channel: "none",
    fields: {
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
    } satisfies Record<PublicSelfRegisterFieldKey, PublicSelfRegisterFieldMode>,
  };
}

function formatPublicSlugDraft(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60);
}

function serializeSettingsForm(value: any) {
  return JSON.stringify(value || {});
}

function getSettingsAutosaveBlocker(value: any) {
  const publicSlug = formatPublicSlugDraft(value?.public_slug || "");
  const email = String(value?.email || "").trim();
  const defaultFollowUpDays = Number(value?.default_follow_up_days || 0);
  const defaultDocumentDueDays = Number(value?.default_document_due_days || 0);
  const defaultBirthdayNoticeDays = Number(value?.default_birthday_notice_days || 0);
  const defaultAreaCode = String(value?.default_area_code || "").trim();

  if (publicSlug.length < 3) return "Digite pelo menos 3 caracteres no link publico.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Informe um e-mail valido para salvar automaticamente.";
  if (defaultFollowUpDays <= 0 || defaultDocumentDueDays <= 0 || defaultBirthdayNoticeDays < 0) {
    return "Revise os prazos padrao para salvar automaticamente.";
  }
  if (defaultAreaCode && !/^\d{2}$/.test(defaultAreaCode)) return "Informe o DDD padrao com 2 digitos.";
  if (String(value?.public_self_register_intro || "").trim().length > PUBLIC_SELF_REGISTER_INTRO_MAX_LENGTH) {
    return "Reduza a mensagem do atendimento online para salvar automaticamente.";
  }

  return "";
}

function buildGabineteAddressLine(value: any) {
  return [
    [value?.address, value?.address_number].filter(Boolean).join(", "),
    value?.address_complement,
    value?.neighborhood,
    [value?.city, value?.uf].filter(Boolean).join(" - "),
    value?.zip_code ? `CEP ${String(value.zip_code).replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "",
  ]
    .filter((item) => String(item || "").trim())
    .join(" · ");
}

function buildWazeUrl(addressLine: string) {
  const query = String(addressLine || "").trim();
  return query ? `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes` : "";
}

const EMAIL_PROVIDER_PRESETS = [
  {
    key: "hostinger",
    label: "Hostinger",
    description: "Entrada comum para caixas do proprio gabinete.",
    smtp_host: "smtp.hostinger.com",
    smtp_port: "465",
    smtp_security: "ssl_tls",
  },
  {
    key: "google",
    label: "Google",
    description: "Google Workspace ou Gmail corporativo.",
    smtp_host: "smtp.gmail.com",
    smtp_port: "587",
    smtp_security: "starttls",
  },
  {
    key: "outlook",
    label: "Outlook",
    description: "Microsoft 365 e contas Outlook.",
    smtp_host: "smtp.office365.com",
    smtp_port: "587",
    smtp_security: "starttls",
  },
  {
    key: "manual",
    label: "Manual",
    description: "Quando o provedor pede host, porta e seguranca proprios.",
    smtp_host: "",
    smtp_port: "465",
    smtp_security: "ssl_tls",
  },
];

const DEFAULT_EMAIL_FORM = {
  sender_name: "",
  sender_address: "",
  smtp_host: "",
  smtp_port: "465",
  smtp_security: "ssl_tls",
  smtp_username: "",
  smtp_password: "",
  test_to: "",
};

const GABINETE_TYPE_OPTIONS = [
  "Vereador",
  "Presidente da Camara",
  "Mesa Diretora",
  "Deputado Estadual",
  "Deputado Distrital",
  "Deputado Estadual ou Distrital",
  "Deputado Federal",
  "Senador",
  "Prefeito",
  "Vice-Prefeito",
  "Prefeitura / Secretaria",
  "Ouvidoria",
  "Secretario Municipal",
  "Secretario Estadual",
  "Procurador Municipal",
  "Procurador Estadual",
  "Assessoria Parlamentar",
  "Chefe de Gabinete",
  "Gabinete Legislativo",
  "Gabinete Executivo",
  "Procuradoria Publica",
  "Autarquia Publica",
  "Fundacao Publica",
  "Empresa Publica ou Estatal",
  "Consorcio Intermunicipal",
  "Partido Politico",
  "Diretorio Partidario",
  "Lideranca Politica",
  "Pre-candidato",
  "Coordenacao de Campanha",
  "Conselho Municipal",
  "Associacao",
  "Sindicato",
  "ONG ou Instituto",
  "Outro",
];

const BRAZIL_UF_FALLBACK = [
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

function buildEmailForm(payload: any, gabinete: any, fallbackEmail = "") {
  return {
    sender_name: payload?.sender_name || gabinete?.name || "",
    sender_address: payload?.sender_address || gabinete?.email || "",
    smtp_host: payload?.smtp_host || "",
    smtp_port: String(payload?.smtp_port || "465"),
    smtp_security: payload?.smtp_security || "ssl_tls",
    smtp_username: payload?.smtp_username || "",
    smtp_password: "",
    test_to: payload?.recommended_test_to || fallbackEmail || gabinete?.email || "",
  };
}

function hasInstitutionalSetupGap(gabinete: any) {
  if (!gabinete) return false;
  const personName = String(gabinete.parliamentarian_name || gabinete.responsible_name || "").trim();
  return (
    !String(gabinete.name || "").trim()
    || !personName
    || !String(gabinete.city || "").trim()
    || !String(gabinete.uf || "").trim()
  );
}

function getEmailStatusLabel(settings: any) {
  return settings?.configured ? "Pronto para enviar" : "Falta testar para ativar";
}

function getPublicSelfRegisterFieldEditorHint(field: PublicSelfRegisterFieldKey, config: any) {
  const normalized = normalizePublicSelfRegisterConfig(config);

  if (field === "name") {
    return "No envio identificado, precisa ficar obrigatorio.";
  }
  if (field === "email" && normalized.confirmation_channel === "email") {
    return "Com confirmacao por e-mail ativa, o campo precisa ficar visivel.";
  }
  if (field === "whatsapp" && normalized.confirmation_channel === "whatsapp") {
    return "Com confirmacao por WhatsApp ativa, o campo precisa ficar visivel.";
  }
  if (
    (field === "demand_title" || field === "description")
    && normalized.fields.demand_title !== "required"
    && normalized.fields.description !== "required"
  ) {
    return "Assunto ou Detalhes precisa ficar obrigatório.";
  }
  if (
    (field === "demand_title" || field === "description")
    && normalized.fields.demand_title === "hidden"
    && normalized.fields.description === "hidden"
  ) {
    return "Assunto ou Detalhes precisa ficar visível.";
  }
  return "";
}

function getPublicSelfRegisterFieldEditorOptions(field: PublicSelfRegisterFieldKey, config: any) {
  const normalized = normalizePublicSelfRegisterConfig(config);
  return PUBLIC_SELF_REGISTER_FIELD_OPTIONS.map((option) => {
    let disabled = false;

    if (field === "name" && option.value !== "required") {
      disabled = true;
    }
    if (field === "email" && normalized.confirmation_channel === "email" && option.value === "hidden") {
      disabled = true;
    }
    if (field === "whatsapp" && normalized.confirmation_channel === "whatsapp" && option.value === "hidden") {
      disabled = true;
    }

    return {
      ...option,
      disabled,
    };
  });
}

function normalizeAutocompleteText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getAutocompleteMatches(options: string[], value: string, minChars: number, limit: number) {
  const term = normalizeAutocompleteText(value);
  if (term.length < minChars) return [];

  return options
    .map((option) => ({ option, normalized: normalizeAutocompleteText(option) }))
    .filter((item) => item.normalized.includes(term))
    .sort((a, b) => {
      const aStarts = a.normalized.startsWith(term);
      const bStarts = b.normalized.startsWith(term);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.option.localeCompare(b.option, "pt-BR");
    })
    .slice(0, limit)
    .map((item) => item.option);
}

function AutocompleteInput({
  disabled,
  limit = 6,
  minChars = 2,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  limit?: number;
  minChars?: number;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  value: string;
}) {
  const [focused, setFocused] = useState(false);
  const matches = useMemo(() => getAutocompleteMatches(options, value, minChars, limit), [limit, minChars, options, value]);
  const showMatches = focused && !disabled && matches.length > 0;

  return (
    <div className="relative">
      <Input
        disabled={disabled}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !matches.length) return;
          event.preventDefault();
          onChange(matches[0]);
          setFocused(false);
        }}
        placeholder={placeholder}
        value={value}
      />
      {showMatches ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_24px_72px_-36px_rgba(15,23,42,0.35)]">
          {matches.map((item) => (
            <button
              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              key={item}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(item);
                setFocused(false);
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SettingSwitch({
  checked,
  description,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      className="group flex w-full items-center justify-between gap-4 rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 text-left shadow-[0_18px_44px_-38px_rgba(15,23,42,0.18)] transition hover:border-orange-200 hover:bg-orange-50/30 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className="min-w-0">
        <strong className="block text-sm text-slate-950">{label}</strong>
        <span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={`text-xs font-semibold ${checked ? "text-emerald-700" : "text-slate-500"}`}>
          {checked ? "Ligado" : "Desligado"}
        </span>
        <span className={`relative h-7 w-12 rounded-full p-1 transition ${checked ? "bg-emerald-500" : "bg-slate-300"}`}>
          <span className={`block size-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
        </span>
      </span>
    </button>
  );
}

function SegmentedChoice({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  value: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            className={`min-h-10 rounded-xl px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
              active
                ? "bg-white text-orange-700 shadow-[0_10px_26px_-20px_rgba(249,115,22,0.45)]"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
            }`}
            disabled={disabled || option.disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingsDisclosure({
  action,
  children,
  description,
  open,
  onToggle,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  description?: string;
  open: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_54px_-42px_rgba(15,23,42,0.18)]">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <button className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left" onClick={onToggle} type="button">
          <span className="min-w-0">
            <strong className="block text-base text-slate-950">{title}</strong>
            {description ? <span className="mt-1 block text-sm leading-6 text-slate-500">{description}</span> : null}
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            {open ? "Ocultar" : "Editar"}
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </span>
        </button>
        {action ? <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{action}</div> : null}
      </div>
      {open ? <div className="border-t border-slate-100 px-4 py-5 sm:px-5">{children}</div> : null}
    </section>
  );
}

function EditableSettingsList({
  items,
  kind,
  onAdd,
  onColorChange,
  onRemove,
  onToggleFinal,
  onUpdate,
  title,
}: {
  items: any[];
  kind: "statuses" | "categories" | "channels";
  onAdd: (kind: "statuses" | "categories" | "channels") => void;
  onColorChange?: (kind: "statuses" | "categories", id: any, value: string) => void;
  onRemove: (kind: "statuses" | "categories" | "channels", id: any) => void;
  onToggleFinal?: (id: any, value: boolean) => void;
  onUpdate: (kind: "statuses" | "categories" | "channels", id: any, value: string) => void;
  title: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm text-slate-900">{title}</strong>
        <button
          className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-orange-200 hover:text-orange-700"
          onClick={() => onAdd(kind)}
          title={`Adicionar ${title.toLowerCase()}`}
          type="button"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div className="grid gap-2 rounded-[18px] border border-white bg-white p-2 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.2)]" key={item.id}>
            <div className="flex items-center gap-2">
              {kind !== "channels" ? (
                <input
                  aria-label={`Cor de ${item.name || title}`}
                  className="size-10 shrink-0 cursor-pointer rounded-2xl border border-slate-200 bg-white p-1"
                  onChange={(event) => onColorChange?.(kind, item.id, event.target.value)}
                  title="Cor"
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(String(item.color || "")) ? item.color : "#2563eb"}
                />
              ) : null}
              <Input
                aria-label={title}
                value={item.name || ""}
                onChange={(event) => onUpdate(kind, item.id, event.target.value)}
              />
              <button
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100"
                onClick={() => onRemove(kind, item.id)}
                title="Remover"
                type="button"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {kind === "statuses" ? (
              <button
                className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  item.is_final
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:border-emerald-200 hover:text-emerald-700"
                }`}
                onClick={() => onToggleFinal?.(item.id, !item.is_final)}
                type="button"
              >
                {item.is_final ? "Encerra atendimento" : "Em andamento"}
              </button>
            ) : null}
          </div>
        ))}
        {!items.length ? <p className="text-sm text-slate-500">Adicione pelo menos um item.</p> : null}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, showToast, refreshSession } = useApp();
  const setupAutoOpenedRef = useRef(false);
  const onboardingBodyRef = useRef<HTMLDivElement | null>(null);
  const autosaveReadyRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const latestFormRef = useRef<any>(null);
  const latestSerializedFormRef = useRef("");
  const lastSavedFormRef = useRef("");
  const lastCepLookupRef = useRef("");
  const cepLookupRequestRef = useRef(0);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"idle" | "pending" | "saving" | "saved" | "blocked" | "error">("idle");
  const [autosaveMessage, setAutosaveMessage] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [purging, setPurging] = useState(false);
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [dangerSheetOpen, setDangerSheetOpen] = useState(false);
  const [dangerMode, setDangerMode] = useState<"data" | "account">("data");
  const [dangerPhrase, setDangerPhrase] = useState("");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingStage, setOnboardingStage] = useState<"core" | "activation">("core");
  const [onboardingConnectWhatsappNow, setOnboardingConnectWhatsappNow] = useState(false);
  const [onboardingWhatsappBusy, setOnboardingWhatsappBusy] = useState("");
  const [onboardingPairingResult, setOnboardingPairingResult] = useState<any>(null);
  const [onboardingQrImageSrc, setOnboardingQrImageSrc] = useState("");
  const [moduleSavingKey, setModuleSavingKey] = useState("");
  const [publicOptionSavingKey, setPublicOptionSavingKey] = useState("");
  const [publicFormMoreOpen, setPublicFormMoreOpen] = useState(false);
  const [listSaving, setListSaving] = useState(false);
  const [expandedSettingsSections, setExpandedSettingsSections] = useState<Set<string>>(() => new Set());
  const [emailTesting, setEmailTesting] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [cepFeedback, setCepFeedback] = useState("");
  const [ufOptions, setUfOptions] = useState(BRAZIL_UF_FALLBACK);
  const [cityOptions, setCityOptions] = useState<any[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [form, setForm] = useState<any>({
    name: "",
    logo_url: "",
    type: "",
    parliamentarian_name: "",
    party: "",
    city: "",
    uf: "",
    zip_code: "",
    address: "",
    address_number: "",
    address_complement: "",
    neighborhood: "",
    responsible_name: "",
    phone: "",
    email: "",
    public_slug: "",
    public_self_register_intro: DEFAULT_PUBLIC_SELF_REGISTER_INTRO,
    public_self_register_config: DEFAULT_PUBLIC_SELF_REGISTER_CONFIG,
    whatsapp_provider: "evolution",
    default_area_code: "",
    default_follow_up_days: "3",
    default_document_due_days: "30",
    default_birthday_notice_days: "7",
    team_label: "Meu time",
    workspace_module_config: normalizeWorkspaceModuleConfig(null, ""),
    ui_theme_mode: "light",
    ui_theme_palette: "azul",
  });
  const [emailForm, setEmailForm] = useState<any>(DEFAULT_EMAIL_FORM);
  const workspaceModuleConfig = normalizeWorkspaceModuleConfig(form.workspace_module_config, form.type);
  const cityAutocompleteOptions = useMemo(
    () => cityOptions.map((item: any) => String(item?.nome || "").trim()).filter(Boolean),
    [cityOptions],
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    autosaveReadyRef.current = false;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    if (autosaveSavedTimerRef.current) clearTimeout(autosaveSavedTimerRef.current);
    try {
      const payload = await fetchJson("/api/settings");
      const nextForm = {
        ...payload.gabinete,
        public_slug: payload.gabinete.public_slug || payload.gabinete.slug || "",
        public_self_register_intro: payload.gabinete.public_self_register_intro || DEFAULT_PUBLIC_SELF_REGISTER_INTRO,
        public_self_register_config: normalizePublicSelfRegisterConfig(payload.gabinete.public_self_register_config),
        workspace_module_config: normalizeWorkspaceModuleConfig(payload.gabinete.workspace_module_config, payload.gabinete.type),
        default_follow_up_days: String(payload.gabinete.default_follow_up_days || 3),
        default_document_due_days: String(payload.gabinete.default_document_due_days || 30),
        default_birthday_notice_days: String(payload.gabinete.default_birthday_notice_days ?? 7),
        default_area_code: String(payload.gabinete.default_area_code || ""),
        whatsapp_provider: payload.gabinete.whatsapp_provider || "evolution",
        ui_theme_mode: payload.gabinete.ui_theme_mode || "light",
        ui_theme_palette: payload.gabinete.ui_theme_palette || "azul",
      };
      const serialized = serializeSettingsForm(nextForm);
      lastSavedFormRef.current = serialized;
      latestSerializedFormRef.current = serialized;
      latestFormRef.current = nextForm;
      lastCepLookupRef.current = "";
      setCepFeedback("");
      setData(payload);
      setForm(nextForm);
      setEmailForm(buildEmailForm(payload.email_settings, payload.gabinete, session.user?.email || ""));
      setAutosaveState("idle");
      setAutosaveMessage("");
      autosaveReadyRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [session.user?.email]);

  const loadUfOptions = useCallback(async () => {
    try {
      const payload = await fetchJson<{ items?: { sigla: string; nome: string }[] }>("/api/lookups/ufs");
      if (payload.items?.length) {
        setUfOptions(payload.items);
      }
    } catch {
      setUfOptions(BRAZIL_UF_FALLBACK);
    }
  }, []);

  const loadCitiesForUf = useCallback(async (uf: string) => {
    const normalizedUf = String(uf || "").trim().toUpperCase();
    if (!normalizedUf) {
      setCityOptions([]);
      return;
    }
    setLoadingCities(true);
    try {
      const payload = await fetchJson<{ items?: { ibge: string; nome: string }[] }>(`/api/lookups/municipios/${normalizedUf}`);
      setCityOptions(payload.items || []);
    } catch {
      setCityOptions([]);
    } finally {
      setLoadingCities(false);
    }
  }, []);

  const loadWhatsappConnectorStatus = useCallback(async () => {
    const payload = await fetchJson<{ connector?: any }>("/api/whatsapp");
    setData((current: any) =>
      current
        ? {
            ...current,
            whatsapp_connector: payload.connector || current.whatsapp_connector,
          }
        : current,
    );
    return payload.connector;
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings, session.gabinete?.id]);

  useEffect(() => {
    loadUfOptions();
  }, [loadUfOptions]);

  useEffect(() => {
    if (!form.uf) {
      setCityOptions([]);
      return;
    }
    loadCitiesForUf(form.uf);
  }, [form.uf, loadCitiesForUf]);

  useEffect(() => {
    setupAutoOpenedRef.current = false;
    setOnboardingOpen(false);
    setOnboardingStage("core");
    setOnboardingConnectWhatsappNow(false);
    setOnboardingPairingResult(null);
    setOnboardingQrImageSrc("");
  }, [session.gabinete?.id]);

  useEffect(() => {
    let cancelled = false;
    const source = String(onboardingPairingResult?.qr_payload || "").trim();
    if (!source) {
      setOnboardingQrImageSrc("");
      return;
    }
    QRCode.toDataURL(source, {
      width: 280,
      margin: 1,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((value) => {
        if (!cancelled) setOnboardingQrImageSrc(value);
      })
      .catch(() => {
        if (!cancelled) setOnboardingQrImageSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [onboardingPairingResult?.qr_payload]);

  useEffect(() => {
    if (!data?.whatsapp_connector?.connected) return;
    setOnboardingPairingResult(null);
    setOnboardingQrImageSrc("");
  }, [data?.whatsapp_connector?.connected]);

  useEffect(() => {
    if (!onboardingOpen || !onboardingConnectWhatsappNow || !workspaceModuleConfig.whatsapp) return;
    if (data?.whatsapp_connector?.connected) return;
    const intervalId = window.setInterval(() => {
      loadWhatsappConnectorStatus();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [data?.whatsapp_connector?.connected, loadWhatsappConnectorStatus, onboardingConnectWhatsappNow, onboardingOpen, workspaceModuleConfig.whatsapp]);

  const emailStatusLabel = getEmailStatusLabel(data?.email_settings);
  const workspaceModuleOrder = (Array.isArray(workspaceModuleConfig.order) ? workspaceModuleConfig.order : WORKSPACE_MODULE_SETTINGS_ORDER)
    .filter((key: string) => MAIN_WORKSPACE_MODULE_KEYS.includes(key));
  const workspaceModuleCards = workspaceModuleOrder.map((key: string) => {
    const item = WORKSPACE_MODULE_DEFINITIONS.find((definition) => definition.key === key);
    if (!item) return null;
    const resolvedItem = getWorkspaceModuleDefinition(item.key, form.type) || item;
    return {
      ...resolvedItem,
      enabled: Boolean(workspaceModuleConfig[item.key as keyof typeof workspaceModuleConfig]),
    };
  }).filter(Boolean);
  const enabledWorkspaceModules = workspaceModuleCards.filter((item: any) => item.enabled);
	const publicSelfRegisterConfig = normalizePublicSelfRegisterConfig(form.public_self_register_config);
  const publicFormEditorGroups = useMemo(
    () =>
      PUBLIC_SELF_REGISTER_FIELD_GROUPS.map((group) => ({
        ...group,
        fields: group.fields.filter((field) => publicFormMoreOpen || PUBLIC_FORM_MAIN_FIELDS.includes(field)),
      })).filter((group) => group.fields.length),
    [publicFormMoreOpen],
  );
  const publicVisibleFieldLabels = useMemo(
    () => {
      const fields = publicSelfRegisterConfig.fields;
      const hasAddressFields = ["zip_code", "neighborhood", "address", "number", "complement", "city", "uf"].some(
        (field) => fields[field as PublicSelfRegisterFieldKey] !== "hidden",
      );
      return [
        fields.name !== "hidden" ? "Nome" : "",
        fields.phone !== "hidden" ? "Telefone" : "",
        fields.whatsapp !== "hidden" ? "WhatsApp" : "",
        fields.demand_title !== "hidden" ? "Assunto" : "",
        fields.description !== "hidden" ? "Detalhes" : "",
        hasAddressFields ? "Endereço pelo CEP" : "",
      ].filter(Boolean);
    },
    [publicSelfRegisterConfig],
  );
  const gabineteAddressLine = buildGabineteAddressLine(form);
  const gabineteWazeUrl = buildWazeUrl(gabineteAddressLine);
  const gabineteZipDigits = onlyDigits(form.zip_code || "");
  const hasGabineteAddressDetails = Boolean(
    [form.address, form.address_number, form.address_complement, form.neighborhood].some((item) => String(item || "").trim())
      || (gabineteZipDigits.length === 8 && !/^0+$/.test(gabineteZipDigits)),
  );
  const showGabineteAddressFields = isSettingsSectionOpen("address");
  const canManageSettings = session.user?.role === "gabinete_admin" || session.user?.role === "super_admin";
  const setupRequested = searchParams.get("setup") === "1";
  const onboardingHasGap = hasInstitutionalSetupGap(data?.gabinete);
  const onboardingWhatsappConnector = data?.whatsapp_connector || {};
  const onboardingWhatsappStatusLabel = onboardingWhatsappConnector.connected
    ? "Linha conectada"
    : onboardingWhatsappConnector.instance_found
      ? "Aguardando leitura do QR Code"
      : "Pronto para gerar o primeiro QR Code";
  const onboardingWhatsappStatusVariant = onboardingWhatsappConnector.connected
    ? "success"
    : onboardingWhatsappConnector.instance_found
      ? "warning"
      : "info";
  const onboardingWhatsappConnectLabel = onboardingWhatsappConnector.connected
    ? "Gerar novo QR Code"
    : onboardingWhatsappConnector.instance_found
      ? "Reconectar e gerar QR Code"
      : "Gerar QR Code";
  const setupMetrics = data?.setup_metrics || {};
  const registrationPath = form.public_slug ? `/atendimento/${form.public_slug}` : "";
  const registrationUrl =
    registrationPath && typeof window !== "undefined" ? `${window.location.origin}${registrationPath}` : registrationPath;
  const whatsappModeLabel =
    (data?.whatsapp_connector?.mode || form.whatsapp_provider) === "wa_me"
      ? "Abrir no WhatsApp Web"
      : "WhatsApp conectado";
  const onboardingBlockerMessage =
    !String(form.name || "").trim()
      ? "Informe o nome."
      : !String(form.parliamentarian_name || form.responsible_name || "").trim()
        ? "Informe o titular."
        : !String(form.uf || "").trim()
          ? "Escolha o estado."
          : !String(form.city || "").trim()
            ? "Informe a cidade."
            : "";
  const onboardingCanAdvance = !onboardingBlockerMessage;
  const activationChecklistItems = useMemo(() => {
    const items = [
      {
        key: "contacts",
        label: "Trazer os primeiros contatos",
        description: "Importe uma planilha ou cadastre os primeiros contatos.",
        done: Number(setupMetrics.contact_count || 0) > 0,
        actionLabel: Number(setupMetrics.contact_count || 0) > 0 ? "Abrir importacao" : "Importar contatos",
        href: "/importacao",
        icon: CloudUpload,
      },
      {
        key: "team",
        label: "Trazer a equipe para dentro",
        description: "Convide quem vai atender junto.",
        done: Number(setupMetrics.team_count || data?.team?.length || 0) > 1,
        actionLabel: Number(setupMetrics.team_count || data?.team?.length || 0) > 1 ? "Gerenciar equipe" : "Convidar equipe",
        href: "/equipe",
        icon: Users2,
      },
    ];

    if (workspaceModuleConfig.whatsapp) {
      items.splice(1, 0, {
        key: "whatsapp",
        label: "Conectar o WhatsApp do gabinete",
        description: "Gere o QR Code e conecte a linha do gabinete.",
        done: Boolean(data?.whatsapp_connector?.connected),
        actionLabel: data?.whatsapp_connector?.connected ? "Abrir WhatsApp" : "Conectar agora",
        href: "/whatsapp",
        icon: MessageSquareText,
      });
    }

    return items;
  }, [
    data?.team?.length,
    data?.whatsapp_connector?.connected,
    setupMetrics.contact_count,
    setupMetrics.team_count,
    workspaceModuleConfig.whatsapp,
  ]);
  const activationCompletedCount = activationChecklistItems.filter((item) => item.done).length;
  const activationPendingItems = activationChecklistItems.filter((item) => !item.done);
  const activationProgressPercent = activationChecklistItems.length ? (activationCompletedCount / activationChecklistItems.length) * 100 : 100;
  const activationHasPendingItems = activationPendingItems.length > 0;
  const autosaveStatusText =
    autosaveState === "saving"
      ? "Salvando..."
      : autosaveState === "pending"
        ? "Alteração pendente."
        : autosaveState === "saved"
          ? "Salvo"
          : autosaveState === "blocked"
            ? autosaveMessage || "Falta revisar um campo."
            : autosaveState === "error"
              ? autosaveMessage || "Não foi possível salvar."
              : "Salvo";
  const autosaveStatusTone =
    autosaveState === "error"
      ? "text-rose-600"
      : autosaveState === "blocked"
        ? "text-amber-700"
        : autosaveState === "saved"
          ? "text-emerald-700"
          : "text-slate-500";

  useEffect(() => {
    latestFormRef.current = form;
    latestSerializedFormRef.current = serializeSettingsForm(form);
  }, [form]);

  const runAutosave = useCallback(async () => {
    if (!autosaveReadyRef.current || !canManageSettings) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    const nextForm = latestFormRef.current;
    const nextSerialized = latestSerializedFormRef.current;
    if (!nextForm || !nextSerialized || nextSerialized === lastSavedFormRef.current) return;

    const blocker = getSettingsAutosaveBlocker(nextForm);
    if (blocker) {
      setAutosaveState("blocked");
      setAutosaveMessage(blocker);
      return;
    }

    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true;
      setAutosaveState("pending");
      return;
    }

    autosaveInFlightRef.current = true;
    autosaveQueuedRef.current = false;
    setAutosaveState("saving");
    setAutosaveMessage("");

    try {
      await fetchJson("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(nextForm),
      });
      lastSavedFormRef.current = nextSerialized;
      setData((current: any) =>
        current
          ? {
              ...current,
              gabinete: {
                ...current.gabinete,
                ...nextForm,
              },
            }
          : current,
      );
      await refreshSession();

      if (latestSerializedFormRef.current === nextSerialized) {
        setAutosaveState("saved");
        setAutosaveMessage("");
        if (autosaveSavedTimerRef.current) clearTimeout(autosaveSavedTimerRef.current);
        autosaveSavedTimerRef.current = setTimeout(() => {
          setAutosaveState((current) => (current === "saved" ? "idle" : current));
        }, 1800);
      } else {
        setAutosaveState("pending");
      }
    } catch (error: any) {
      if (latestSerializedFormRef.current === nextSerialized) {
        setAutosaveState("error");
        setAutosaveMessage(error.message || "Nao foi possivel salvar automaticamente.");
      }
    } finally {
      autosaveInFlightRef.current = false;
      if (autosaveQueuedRef.current || latestSerializedFormRef.current !== lastSavedFormRef.current) {
        autosaveQueuedRef.current = false;
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = setTimeout(() => {
          void runAutosave();
        }, 500);
      }
    }
  }, [canManageSettings, refreshSession]);

  const scheduleAutosave = useCallback(
    (delay = 900) => {
      if (!autosaveReadyRef.current || !canManageSettings) return;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      const blocker = getSettingsAutosaveBlocker(latestFormRef.current);
      if (blocker) {
        setAutosaveState("blocked");
        setAutosaveMessage(blocker);
        return;
      }
      setAutosaveState((current) => (current === "saving" ? current : "pending"));
      setAutosaveMessage("");
      autosaveTimerRef.current = setTimeout(() => {
        void runAutosave();
      }, delay);
    },
    [canManageSettings, runAutosave],
  );

  useEffect(() => {
    if (!autosaveReadyRef.current || !canManageSettings || loading || !data) return;
    if (latestSerializedFormRef.current === lastSavedFormRef.current) return;
    scheduleAutosave();
  }, [canManageSettings, data, form, loading, scheduleAutosave]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (autosaveSavedTimerRef.current) clearTimeout(autosaveSavedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!setupRequested || !canManageSettings || !data?.gabinete) return;
    if (setupAutoOpenedRef.current) return;
    setupAutoOpenedRef.current = true;
    window.scrollTo({ top: 0, behavior: "auto" });
    setOnboardingStage("core");
    setOnboardingConnectWhatsappNow(Boolean(data?.whatsapp_connector?.connected));
    setOnboardingPairingResult(null);
    setOnboardingQrImageSrc("");
    setOnboardingOpen(true);
  }, [
    canManageSettings,
    data?.gabinete,
    data?.whatsapp_connector?.connected,
    onboardingHasGap,
    setupRequested,
  ]);

  useEffect(() => {
    if (!setupRequested) setupAutoOpenedRef.current = false;
  }, [setupRequested]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (!section) return;
    openSettingsSection(section);
  }, [searchParams]);

  useEffect(() => {
    if (!onboardingOpen) return;
    window.requestAnimationFrame(() => {
      onboardingBodyRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [onboardingOpen, onboardingStage]);

  function openEmailSheet() {
    setEmailForm(buildEmailForm(data?.email_settings, data?.gabinete, session.user?.email || ""));
    setEmailSheetOpen(true);
  }

  function handleOnboardingOpenChange(open: boolean) {
    setOnboardingOpen(open);
    if (!open) {
      setOnboardingStage("core");
      setOnboardingConnectWhatsappNow(false);
      setOnboardingPairingResult(null);
      setOnboardingQrImageSrc("");
    }
  }

  function updateForm(key: string, value: string) {
    setForm((current: any) => ({ ...current, [key]: value }));
  }

  function updateGabinetePersonName(value: string) {
    const nextValue = value.slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH);
    setForm((current: any) => ({
      ...current,
      parliamentarian_name: nextValue,
      responsible_name: nextValue,
    }));
  }

  function isSettingsSectionOpen(key: string) {
    return expandedSettingsSections.has(key);
  }

  function toggleSettingsSection(key: string) {
    setExpandedSettingsSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openSettingsSection(key: string) {
    setExpandedSettingsSections((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      if (ADVANCED_SETTINGS_SECTION_KEYS.has(key)) next.add("advanced");
      next.add(key);
      return next;
    });
  }

  async function handleSettingsCepLookup(rawCep = form.zip_code) {
    const cep = onlyDigits(rawCep);
    if (cep.length !== 8) {
      setCepFeedback("");
      return;
    }
    if (lastCepLookupRef.current === cep) return;
    const requestId = cepLookupRequestRef.current + 1;
    cepLookupRequestRef.current = requestId;
    setCepBusy(true);
    setCepFeedback("Buscando endereco...");
    try {
      const payload = await fetchJson(`/api/lookups/cep/${cep}`);
      if (cepLookupRequestRef.current !== requestId) return;
      lastCepLookupRef.current = cep;
      setForm((current: any) => ({
        ...current,
        zip_code: formatCepInput(payload.cep || cep),
        address: payload.address || current.address,
        neighborhood: payload.neighborhood || current.neighborhood,
        city: payload.city || current.city,
        uf: payload.uf || current.uf,
      }));
      setCepFeedback(`Endereco preenchido via ${payload.source || "CEP"}.`);
    } catch (error: any) {
      if (cepLookupRequestRef.current !== requestId) return;
      lastCepLookupRef.current = "";
      setCepFeedback(error.message || "CEP nao encontrado.");
    } finally {
      if (cepLookupRequestRef.current === requestId) setCepBusy(false);
    }
  }

  function handleSettingsCepChange(value: string) {
    const nextValue = formatCepInput(value);
    const cep = onlyDigits(nextValue);
    setForm((current: any) => ({ ...current, zip_code: nextValue }));
    if (cep.length < 8) {
      setCepFeedback("");
      return;
    }
    void handleSettingsCepLookup(cep);
  }

  function updateSettingsListItem(kind: "statuses" | "categories" | "channels", id: any, value: string) {
    setData((current: any) =>
      current
        ? {
            ...current,
            [kind]: (current[kind] || []).map((item: any) => (item.id === id ? { ...item, name: value } : item)),
          }
        : current,
    );
  }

  function updateSettingsListColor(kind: "statuses" | "categories", id: any, value: string) {
    setData((current: any) =>
      current
        ? {
            ...current,
            [kind]: (current[kind] || []).map((item: any) => (item.id === id ? { ...item, color: value } : item)),
          }
        : current,
    );
  }

  function addSettingsListItem(kind: "statuses" | "categories" | "channels") {
    const label = kind === "statuses" ? "Novo status" : kind === "categories" ? "Nova categoria" : "Novo canal";
    setData((current: any) =>
      current
        ? {
            ...current,
            [kind]: [
              ...(current[kind] || []),
              {
                id: `draft-${kind}-${Date.now()}`,
                name: label,
                color: "#2563eb",
                is_final: false,
              },
            ],
          }
        : current,
    );
  }

  function removeSettingsListItem(kind: "statuses" | "categories" | "channels", id: any) {
    setData((current: any) =>
      current
        ? {
            ...current,
            [kind]: (current[kind] || []).filter((item: any) => item.id !== id),
          }
        : current,
    );
  }

  function toggleStatusFinal(id: any, value: boolean) {
    setData((current: any) =>
      current
        ? {
            ...current,
            statuses: (current.statuses || []).map((item: any) => (item.id === id ? { ...item, is_final: value ? 1 : 0 } : item)),
          }
        : current,
    );
  }

  function selectOnboardingGabineteType(type: string) {
    setForm((current: any) => ({
      ...current,
      type,
    }));
  }

  async function updateWorkspaceModuleConfig(key: string, enabled: boolean) {
    const previousForm = form;
    const nextForm = {
      ...form,
      workspace_module_config: {
        ...normalizeWorkspaceModuleConfig(form.workspace_module_config, form.type),
        [key]: enabled,
      },
    };

    setForm(nextForm);
    if (key === "whatsapp" && !enabled) {
      setOnboardingConnectWhatsappNow(false);
      setOnboardingPairingResult(null);
      setOnboardingQrImageSrc("");
    }
    setModuleSavingKey(key);
    try {
      await persistSettings(nextForm, enabled ? "Modulo exibido no menu." : "Modulo ocultado do menu.", { reload: false });
    } catch (error: any) {
      setForm(previousForm);
      showToast("error", error.message);
    } finally {
      setModuleSavingKey("");
    }
  }

  async function moveWorkspaceModule(key: string, direction: -1 | 1) {
    const currentConfig = normalizeWorkspaceModuleConfig(form.workspace_module_config, form.type);
    const order = Array.isArray(currentConfig.order) ? [...currentConfig.order] : [...WORKSPACE_MODULE_SETTINGS_ORDER];
    const currentIndex = order.indexOf(key);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    const previousForm = form;
    const [item] = order.splice(currentIndex, 1);
    order.splice(nextIndex, 0, item);
    const nextForm = {
      ...form,
      workspace_module_config: {
        ...currentConfig,
        order,
      },
    };

    setForm(nextForm);
    setModuleSavingKey(key);
    try {
      await persistSettings(nextForm, "Ordem do menu atualizada.", { reload: false });
    } catch (error: any) {
      setForm(previousForm);
      showToast("error", error.message);
    } finally {
      setModuleSavingKey("");
    }
  }

  async function restoreWorkspaceModuleConfig() {
    const previousForm = form;
    const nextForm = {
      ...form,
      workspace_module_config: buildDefaultWorkspaceModuleConfig(form.type),
    };

    setForm(nextForm);
    setModuleSavingKey("default");
    try {
      await persistSettings(nextForm, "Menu padrao restaurado.", { reload: false });
    } catch (error: any) {
      setForm(previousForm);
      showToast("error", error.message);
    } finally {
      setModuleSavingKey("");
    }
  }

  async function updatePublicSelfRegisterBooleanOption(
    key: "require_contact_channel",
    value: boolean,
  ) {
    const previousForm = form;
    const nextConfig = {
      ...normalizePublicSelfRegisterConfig(form.public_self_register_config),
      [key]: value,
    };
    const nextForm = {
      ...form,
      public_self_register_config: nextConfig,
    };

    setForm(nextForm);
    setPublicOptionSavingKey(key);
    try {
      await persistSettings(nextForm, "Retorno minimo atualizado.", { reload: false });
    } catch (error: any) {
      setForm(previousForm);
      showToast("error", error.message);
    } finally {
      setPublicOptionSavingKey("");
    }
  }

  function updatePublicSelfRegisterField(field: PublicSelfRegisterFieldKey, value: PublicSelfRegisterFieldMode) {
    setForm((current: any) => {
      const currentConfig = normalizePublicSelfRegisterConfig(current.public_self_register_config);
      return {
        ...current,
        public_self_register_config: {
          ...currentConfig,
          fields: {
            ...currentConfig.fields,
            [field]: value,
          },
        },
      };
    });
  }

  async function applyLeanPublicSelfRegisterConfig() {
    const previousForm = form;
    const nextForm = {
      ...form,
      public_self_register_config: buildLeanPublicSelfRegisterConfig(form.public_self_register_config),
    };

    setForm(nextForm);
    setPublicOptionSavingKey("lean");
    try {
      await persistSettings(nextForm, "Formulario enxuto aplicado.", { reload: false });
    } catch (error: any) {
      setForm(previousForm);
      showToast("error", error.message);
    } finally {
      setPublicOptionSavingKey("");
    }
  }

  function updatePublicSlug(value: string) {
    setForm((current: any) => ({ ...current, public_slug: formatPublicSlugDraft(value) }));
  }

  function updateEmailForm(key: string, value: string) {
    setEmailForm((current: any) => ({ ...current, [key]: value }));
  }

  function applyEmailPreset(preset: (typeof EMAIL_PROVIDER_PRESETS)[number]) {
    setEmailForm((current: any) => ({
      ...current,
      smtp_host: preset.smtp_host,
      smtp_port: preset.smtp_port,
      smtp_security: preset.smtp_security,
    }));
  }

  async function persistSettings(nextForm: any, successMessage: string, options: { reload?: boolean } = {}) {
    await fetchJson("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(nextForm),
    });
    lastSavedFormRef.current = serializeSettingsForm(nextForm);
    latestFormRef.current = nextForm;
    latestSerializedFormRef.current = lastSavedFormRef.current;
    setAutosaveState("saved");
    setAutosaveMessage("");
    if (options.reload === false) {
      setData((current: any) =>
        current
          ? {
              ...current,
              gabinete: {
                ...current.gabinete,
                ...nextForm,
              },
            }
          : current,
      );
    } else {
      await loadSettings();
    }
    await refreshSession();
    if (successMessage) {
      showToast("success", successMessage);
    }
  }

  async function handleSaveSettingsLists() {
    setListSaving(true);
    try {
      const payload = {
        statuses: data.statuses || [],
        categories: data.categories || [],
        channels: data.channels || [],
      };
      const result = await fetchJson("/api/settings/lists", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setData((current: any) =>
        current
          ? {
              ...current,
              statuses: result.statuses || current.statuses,
              categories: result.categories || current.categories,
              channels: result.channels || current.channels,
            }
          : current,
      );
      showToast("success", "Listas atualizadas.");
    } catch (error: any) {
      showToast("error", error.message || "Nao foi possivel salvar as listas.");
    } finally {
      setListSaving(false);
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await persistSettings(form, "Configuracoes atualizadas.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setSaving(false);
    }
  }

  function handleSettingsFormBlur(event: React.FocusEvent<HTMLFormElement>) {
    const target = event.target as HTMLElement;
    if (!["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    scheduleAutosave(0);
  }

  async function handleOnboardingSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onboardingStage === "core" && onboardingBlockerMessage) {
      showToast("error", onboardingBlockerMessage);
      return;
    }
    setOnboardingSaving(true);
    try {
      await persistSettings(
        {
          ...form,
          onboarding_completed: true,
        },
        "",
      );
      setOnboardingOpen(false);
      router.replace("/dashboard");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setOnboardingSaving(false);
    }
  }

  async function copyRegistrationLink() {
    if (!registrationUrl) {
      showToast("error", "Defina primeiro o link publico do atendimento.");
      return;
    }
    try {
      await navigator.clipboard.writeText(registrationUrl);
      showToast("success", "Link publico copiado.");
    } catch {
      showToast("error", "Nao foi possivel copiar o link.");
    }
  }

  async function handleOnboardingWhatsappConnect() {
    setOnboardingWhatsappBusy("connect");
    try {
      const payload = await fetchJson<{ connector?: any; connection?: any }>("/api/whatsapp/connect", {
        method: "POST",
      });
      setOnboardingPairingResult(payload.connection || null);
      setData((current: any) =>
        current
          ? {
              ...current,
              whatsapp_connector: payload.connector || current.whatsapp_connector,
            }
          : current,
      );
      setForm((current: any) => ({
        ...current,
        whatsapp_provider: "evolution",
        workspace_module_config: {
          ...normalizeWorkspaceModuleConfig(current.workspace_module_config, current.type),
          whatsapp: true,
        },
      }));
      showToast("success", "QR Code gerado para conectar a linha.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setOnboardingWhatsappBusy("");
    }
  }

  async function handleOnboardingWhatsappRefresh() {
    setOnboardingWhatsappBusy("refresh");
    try {
      await loadWhatsappConnectorStatus();
      showToast("success", "Status do WhatsApp atualizado.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setOnboardingWhatsappBusy("");
    }
  }

  async function handleBackupExport() {
    try {
      const payload = await fetchJson("/api/backup/export");
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `gabinete360-backup-${payload.meta?.gabinete?.slug || "gabinete"}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const fileCount = Number(payload.meta?.files?.count || 0);
      const missingCount = Number(payload.meta?.files?.missing_count || 0);
      if (missingCount > 0) {
        showToast("error", `Backup baixado, mas ${missingCount} arquivo(s) referenciado(s) nao foram encontrados no servidor.`);
      } else {
        showToast("success", fileCount ? `Backup baixado com ${fileCount} arquivo(s).` : "Backup baixado.");
      }
    } catch (error: any) {
      showToast("error", error.message);
    }
  }

  async function handleBackupRestore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await fetchJson("/api/backup/restore", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadSettings();
      showToast("success", "Backup restaurado.");
    } catch (error: any) {
      showToast("error", error.message || "Falha ao restaurar backup.");
    } finally {
      setRestoring(false);
      event.target.value = "";
    }
  }

  async function handlePurgeData() {
    if (dangerPhrase !== "EXCLUIR") {
      showToast("error", "Digite EXCLUIR para confirmar.");
      return;
    }
    setPurging(true);
    try {
      const payload = await fetchJson<{ account_deleted?: boolean; message?: string }>("/api/backup/purge", {
        method: "POST",
        body: JSON.stringify({
          confirmation: dangerPhrase,
          mode: dangerMode,
        }),
      });
      showToast("success", payload.message || "Dados excluidos.");
      setDangerSheetOpen(false);
      setDangerPhrase("");
      setDangerMode("data");
      if (payload.account_deleted) {
        await refreshSession();
        window.location.assign("/app");
        return;
      }
      await loadSettings();
      await refreshSession();
    } catch (error: any) {
      showToast("error", error.message || "Falha ao apagar dados.");
    } finally {
      setPurging(false);
    }
  }

  async function handleEmailTest(source: "saved" | "draft" = "draft") {
    setEmailTesting(true);
    try {
      const payloadToTest =
        source === "saved" ? buildEmailForm(data?.email_settings, data?.gabinete, session.user?.email || "") : emailForm;
      const payload = await fetchJson<{ message?: string; email_settings?: any }>("/api/settings/email/test", {
        method: "POST",
        body: JSON.stringify(payloadToTest),
      });
      if (payload.email_settings) {
        setData((current: any) =>
          current
            ? {
                ...current,
                email_settings: payload.email_settings,
              }
            : current,
        );
      }
      await loadSettings();
      if (source === "draft") {
        setEmailSheetOpen(false);
      }
      showToast("success", payload.message || "Teste enviado e envio ativado.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setEmailTesting(false);
    }
  }

  if (loading || !data) {
    return <AppListSkeleton rows={10} />;
  }

  return (
    <div className="space-y-8">
      <form className="space-y-4" onBlurCapture={handleSettingsFormBlur} onSubmit={handleSave}>
        <div className="sticky top-28 z-30 rounded-[24px] border border-orange-100/80 bg-white/95 px-4 py-3 shadow-[0_18px_54px_-38px_rgba(249,115,22,0.28)] backdrop-blur-xl md:top-32">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Configurações</p>
              <p className={`text-xs leading-5 ${autosaveStatusTone}`}>{autosaveStatusText}</p>
            </div>
          </div>
        </div>

        <SectionCard title="Gabinete">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Nome público">
              <Input
                maxLength={GABINETE_NAME_MAX_LENGTH}
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value.slice(0, GABINETE_NAME_MAX_LENGTH))}
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                inputMode="tel"
                value={form.phone}
                onBlur={() => updateForm("phone", formatPhoneInput(form.phone))}
                onChange={(event) => updateForm("phone", event.target.value)}
              />
            </Field>
            <Field label="Estado">
              <select
                className={SELECT_CLASS_NAME}
                value={form.uf}
                onChange={(event) =>
                  setForm((current: any) => ({
                    ...current,
                    uf: event.target.value,
                    city: current.uf === event.target.value ? current.city : "",
                  }))
                }
              >
                <option value="">Escolher estado</option>
                {ufOptions.map((item) => (
                  <option key={item.sigla} value={item.sigla}>
                    {item.sigla} · {item.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              hint={form.uf ? (loadingCities ? "Carregando cidades..." : "Digite pelo menos 2 letras para sugerir.") : "Escolha primeiro o estado."}
              label="Cidade"
            >
              <AutocompleteInput
                disabled={!form.uf}
                onChange={(value) => updateForm("city", value)}
                options={cityAutocompleteOptions}
                placeholder={form.uf ? "Digite a cidade" : "Escolha o estado primeiro"}
                value={form.city}
              />
            </Field>
          </div>

          <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MapPin className="size-4 text-orange-600" />
                  Endereço do gabinete
                </div>
                <p className="mt-1 break-words text-sm leading-6 text-slate-500">
                  {hasGabineteAddressDetails && gabineteAddressLine
                    ? gabineteAddressLine
                    : "Use apenas se houver atendimento presencial."}
                </p>
              </div>
              <Button className="shrink-0" onClick={() => toggleSettingsSection("address")} type="button" variant="secondary">
                {showGabineteAddressFields ? "Ocultar CEP" : hasGabineteAddressDetails ? "Editar CEP" : "Adicionar CEP"}
              </Button>
            </div>
          </div>
          {showGabineteAddressFields ? (
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <Field hint={cepBusy || cepFeedback ? cepFeedback || "Buscando endereço..." : undefined} label="CEP">
                <Input
                  inputMode="numeric"
                  placeholder="00000-000"
                  value={form.zip_code || ""}
                  onBlur={() => handleSettingsCepLookup()}
                  onChange={(event) => handleSettingsCepChange(event.target.value)}
                />
              </Field>
              <Field className="md:col-span-2" label="Endereço">
                <Input value={form.address || ""} onChange={(event) => updateForm("address", event.target.value)} />
              </Field>
              <Field label="Número">
                <Input value={form.address_number || ""} onChange={(event) => updateForm("address_number", event.target.value)} />
              </Field>
              <Field label="Complemento">
                <Input value={form.address_complement || ""} onChange={(event) => updateForm("address_complement", event.target.value)} />
              </Field>
              <Field label="Bairro">
                <Input value={form.neighborhood || ""} onChange={(event) => updateForm("neighborhood", event.target.value)} />
              </Field>
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                {gabineteWazeUrl ? (
                  <Button asChild className="shrink-0" type="button" variant="secondary">
                    <a href={gabineteWazeUrl} rel="noreferrer" target="_blank">
                      <Navigation className="size-4" />
                      Abrir no Waze
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Página pública">
          <div className="space-y-5">
            <div>
              <div className="flex min-w-0 items-center gap-3">
                <Link2 className="size-5 text-orange-600" />
                <div className="min-w-0">
                  <strong className="block text-slate-950">Link para atendimento</strong>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                  <div className="flex flex-col lg:flex-row lg:items-center">
                    <span className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500 lg:border-b-0 lg:border-r">
                      {typeof window !== "undefined" ? `${window.location.origin}/atendimento/` : "/atendimento/"}
                    </span>
                    <input
                      className="h-12 min-w-0 flex-1 bg-white px-4 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                      onChange={(event) => updatePublicSlug(event.target.value)}
                      placeholder="gabinete"
                      value={form.public_slug || ""}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3 rounded-[20px] border border-orange-100 bg-orange-50/70 px-4 py-3 text-sm leading-6 text-orange-900 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {registrationUrl ? (
                    <span className="break-all font-semibold">{registrationUrl}</span>
                  ) : (
                    "Digite pelo menos 3 caracteres para formar o link público."
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {registrationUrl ? (
                    <Button asChild type="button" variant="secondary">
                      <a href={registrationUrl} rel="noreferrer" target="_blank">
                        <ExternalLink className="size-4" />
                        Abrir
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {registrationUrl ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3">
                <span className="text-sm font-medium text-slate-600">
                  Edite foto, texto e campos diretamente na página pública.
                </span>
                <Button asChild type="button" variant="secondary">
                  <a href={registrationUrl} rel="noreferrer" target="_blank">
                    <ExternalLink className="size-4" />
                    Editar página
                  </a>
                </Button>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SettingsDisclosure
          action={
            isSettingsSectionOpen("lists") ? (
              <Button disabled={listSaving || !canManageSettings} onClick={handleSaveSettingsLists} type="button">
                <Save className="size-4" />
                {listSaving ? "Salvando..." : "Salvar listas"}
              </Button>
            ) : null
          }
          open={isSettingsSectionOpen("lists")}
          onToggle={() => toggleSettingsSection("lists")}
          title="Listas"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <EditableSettingsList
              items={data.statuses || []}
              kind="statuses"
              onAdd={addSettingsListItem}
              onColorChange={updateSettingsListColor}
              onRemove={removeSettingsListItem}
              onToggleFinal={toggleStatusFinal}
              onUpdate={updateSettingsListItem}
              title="Status"
            />
            <EditableSettingsList
              items={data.categories || []}
              kind="categories"
              onAdd={addSettingsListItem}
              onColorChange={updateSettingsListColor}
              onRemove={removeSettingsListItem}
              onUpdate={updateSettingsListItem}
              title="Categorias"
            />
            <EditableSettingsList
              items={data.channels || []}
              kind="channels"
              onAdd={addSettingsListItem}
              onRemove={removeSettingsListItem}
              onUpdate={updateSettingsListItem}
              title="Tipos de entrada"
            />
          </div>
        </SettingsDisclosure>

        <SectionCard title="Backup / Lixeira">
          <div className="flex flex-wrap gap-3">
            <Button asChild type="button" variant="secondary">
              <Link href="/importacao">
                <FileUp className="size-4" />
                Importar contatos e atendimentos
              </Link>
            </Button>
            <Button asChild type="button" variant="secondary">
              <Link href="/lixeira">
                <Trash2 className="size-4" />
                Abrir lixeira
              </Link>
            </Button>
            <Button onClick={handleBackupExport} type="button">
              <Download className="size-4" />
              Baixar backup
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
              <CloudUpload className="size-4" />
              {restoring ? "Restaurando..." : "Restaurar backup"}
              <input className="hidden" accept="application/json" disabled={restoring} onChange={handleBackupRestore} type="file" />
            </label>
            <Button
              className="border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100"
              onClick={() => {
                setDangerMode("data");
                setDangerPhrase("");
                setDangerSheetOpen(true);
              }}
              type="button"
              variant="secondary"
            >
              <Trash2 className="size-4" />
              Excluir dados
            </Button>
            <Button
              className="border-red-200 bg-red-600 text-white shadow-[0_18px_40px_-22px_rgba(220,38,38,0.55)] hover:border-red-700 hover:bg-red-700"
              onClick={() => {
                setDangerMode("account");
                setDangerPhrase("");
                setDangerSheetOpen(true);
              }}
              type="button"
              variant="secondary"
            >
              <Trash2 className="size-4" />
              Excluir conta
            </Button>
          </div>
        </SectionCard>

        <SettingsDisclosure
          open={isSettingsSectionOpen("advanced")}
          onToggle={() => toggleSettingsSection("advanced")}
          title="Avançado"
        >
          <div className="space-y-4">
            <SettingsDisclosure
              open={isSettingsSectionOpen("routine")}
              onToggle={() => toggleSettingsSection("routine")}
              title="Rotina e canais"
            >
              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionCard title="Prazos e lembretes">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Retorno padrao (dias)">
                <Input
                  value={form.default_follow_up_days}
                  onChange={(event) => updateForm("default_follow_up_days", event.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              </Field>
              <Field label="Prazo padrao de documento (dias)">
                <Input
                  value={form.default_document_due_days}
                  onChange={(event) => updateForm("default_document_due_days", event.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              </Field>
              <Field label="Aviso de aniversario">
                <Input
                  value={form.default_birthday_notice_days}
                  onChange={(event) => updateForm("default_birthday_notice_days", event.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="WhatsApp">
            <div className="space-y-5">
              <Field label="Modo de envio">
                <select
                  className={SELECT_CLASS_NAME}
                  value={form.whatsapp_provider}
                  onChange={(event) => updateForm("whatsapp_provider", event.target.value)}
                >
                  <option value="evolution">WhatsApp conectado</option>
                  <option value="wa_me">Abrir no WhatsApp Web</option>
                </select>
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                  Modo atual: {whatsappModeLabel}
                </div>
                <Button asChild type="button" variant="secondary">
                  <Link href="/whatsapp">
                    <MessageSquareText className="size-4" />
                    Abrir WhatsApp
                  </Link>
                </Button>
              </div>
            </div>
          </SectionCard>
              </div>
            </SettingsDisclosure>

            <SettingsDisclosure
              action={
                isSettingsSectionOpen("menu") ? (
            <Button
              disabled={!canManageSettings || Boolean(moduleSavingKey)}
              onClick={() => void restoreWorkspaceModuleConfig()}
              type="button"
              variant="secondary"
            >
              <RefreshCcw className="size-4" />
              Restaurar padrao
            </Button>
                ) : null
              }
              description="Ajuste os atalhos só quando a equipe quiser mudar o menu lateral."
              open={isSettingsSectionOpen("menu")}
              onToggle={() => toggleSettingsSection("menu")}
              title="Menu do sistema"
            >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-orange-100 bg-orange-50/50 px-4 py-3">
              <p className="text-sm font-semibold text-orange-950">Ordem atual do menu</p>
              <p className="text-sm text-orange-900">
                {enabledWorkspaceModules.length} de {workspaceModuleCards.length} atalhos visiveis
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {workspaceModuleCards.map((item: any, index: number) => (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2" key={item.key}>
                  <SettingSwitch
                    checked={item.enabled}
                    description={item.description}
                    disabled={!canManageSettings || Boolean(moduleSavingKey)}
                    label={moduleSavingKey === item.key ? `Salvando ${item.label}...` : item.label}
                    onChange={(checked) => void updateWorkspaceModuleConfig(item.key, checked)}
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      className="inline-flex size-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-orange-200 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!canManageSettings || Boolean(moduleSavingKey) || index === 0}
                      onClick={() => void moveWorkspaceModule(item.key, -1)}
                      title="Subir no menu"
                      type="button"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      className="inline-flex size-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-orange-200 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!canManageSettings || Boolean(moduleSavingKey) || index === workspaceModuleCards.length - 1}
                      onClick={() => void moveWorkspaceModule(item.key, 1)}
                      title="Descer no menu"
                      type="button"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!canManageSettings ? (
              <p className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Apenas administradores podem alterar os modulos do menu.
              </p>
            ) : null}
          </div>
            </SettingsDisclosure>

            <SettingsDisclosure
              description="E-mail de envio e equipe ficam separados da rotina principal."
              open={isSettingsSectionOpen("admin")}
              onToggle={() => toggleSettingsSection("admin")}
              title="Administração"
            >
          <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
            <SectionCard
            action={
              <Button onClick={openEmailSheet} type="button">
                <Mail className="size-4" />
                Configurar e testar
              </Button>
            }
            className="max-w-[calc(100vw-2.5rem)] xl:max-w-none"
            description="Configure a conta que vai enviar mensagens oficiais pelo sistema."
            title="Envio de e-mail"
          >
            <KeyValueGrid
              items={[
                { label: "Status", value: emailStatusLabel },
                {
                  label: "Remetente",
                  value: data.email_settings?.masked_sender_address || form.email || "Vai usar o e-mail principal acima",
                },
                {
                  label: "Servidor",
                  value: data.email_settings?.provider_label || "Escolha o provedor dentro da configuracao",
                },
              ]}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              {data.email_settings?.configured ? (
                <Button
                  className="h-12 px-5"
                  disabled={emailTesting}
                  onClick={() => handleEmailTest("saved")}
                  type="button"
                  variant="secondary"
                >
                  <Send className="size-4" />
                  {emailTesting ? "Enviando..." : "Receber novo teste"}
                </Button>
              ) : null}
            </div>
          </SectionCard>

          {data.team?.length > 1 ? (
            <SectionCard
              action={
                <Button asChild type="button" variant="secondary">
                  <Link href="/equipe">
                    Gerenciar usuários
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              }
              className="max-w-[calc(100vw-2.5rem)] xl:max-w-none"
              description="Aparece aqui quando houver mais de uma pessoa usando o sistema."
              title="Equipe"
            >
              <TimelineList
                items={data.team.map((item: any) => ({
                  title: item.name,
                  meta: `${item.role_label} · ${item.email}`,
                  note: item.last_login_at
                    ? `Último login ${item.last_login_at.slice(0, 16).replace("T", " ")} · ${item.last_login_provider || "senha"}`
                    : "Ainda sem login",
                }))}
              />
            </SectionCard>
          ) : null}
          </div>
            </SettingsDisclosure>

          </div>
        </SettingsDisclosure>
      </form>

      <Sheet onOpenChange={handleOnboardingOpenChange} open={onboardingOpen}>
        <SheetContent className={onboardingStage === "core" ? "w-[min(560px,calc(100vw-1rem))]" : "w-[min(880px,calc(100vw-1rem))]"}>
          <SheetHeader>
            <SheetTitle>{onboardingStage === "core" ? "Configurar gabinete" : "Organizar rotina"}</SheetTitle>
            <SheetDescription>
              {onboardingStage === "core" ? "So os dados principais." : "Faça só o que estiver faltando."}
            </SheetDescription>
          </SheetHeader>
          <SheetBody ref={onboardingBodyRef} className="px-5 py-5 sm:px-7 sm:py-6">
            <form className="space-y-6" onSubmit={handleOnboardingSave}>
              {onboardingStage === "core" ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Nome do gabinete">
                    <Input
                      autoFocus
                      maxLength={GABINETE_NAME_MAX_LENGTH}
                      placeholder="Nome que aparece no sistema"
                      value={form.name}
                      onChange={(event) => updateForm("name", event.target.value.slice(0, GABINETE_NAME_MAX_LENGTH))}
                    />
                  </Field>
                  <Field label="Titular / autoridade">
                    <Input
                      maxLength={GABINETE_DISPLAY_NAME_MAX_LENGTH}
                      placeholder="Nome da pessoa representada"
                      value={form.parliamentarian_name || form.responsible_name || ""}
                      onChange={(event) => updateGabinetePersonName(event.target.value.slice(0, GABINETE_DISPLAY_NAME_MAX_LENGTH))}
                    />
                  </Field>
                  <Field label="Estado">
                    <select
                      className={SELECT_CLASS_NAME}
                      value={form.uf}
                      onChange={(event) =>
                        setForm((current: any) => ({
                          ...current,
                          uf: event.target.value,
                          city: current.uf === event.target.value ? current.city : "",
                        }))
                      }
                    >
                      <option value="">Escolher estado</option>
                      {ufOptions.map((item) => (
                        <option key={item.sigla} value={item.sigla}>
                          {item.sigla} · {item.nome}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cidade">
                    <AutocompleteInput
                      disabled={!form.uf}
                      onChange={(value) => updateForm("city", value)}
                      options={cityAutocompleteOptions}
                      placeholder={form.uf ? "Digite a cidade" : "Escolha o estado primeiro"}
                      value={form.city}
                    />
                  </Field>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-950">Organizar rotina</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">O gabinete ja esta pronto. Faça só o que faltar.</p>
                      </div>
                      <Badge variant={activationHasPendingItems ? "warning" : "success"}>
                        {activationCompletedCount}/{activationChecklistItems.length}
                      </Badge>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${activationProgressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {activationChecklistItems.map((item) => {
                      const Icon = item.icon;
                      const isWhatsappTask = item.key === "whatsapp";
                      return (
                        <div
                          className={`flex flex-col gap-3 rounded-[20px] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                            item.done ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white"
                          }`}
                          key={item.key}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`grid size-10 shrink-0 place-items-center rounded-[16px] ${item.done ? "bg-white text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
                              {item.done ? <CheckCircle2 className="size-5" /> : <Icon className="size-5" />}
                            </span>
                            <div className="min-w-0">
                              <strong className="block text-sm text-slate-950">{item.label}</strong>
                              <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-2">
                            {isWhatsappTask && !item.done ? (
                              <Button className="w-full sm:w-auto" onClick={() => setOnboardingConnectWhatsappNow(true)} type="button" variant="secondary">
                                Conectar agora
                              </Button>
                            ) : (
                              <Button asChild className="w-full sm:w-auto" type="button" variant="secondary">
                                <Link href={item.href}>{item.actionLabel}</Link>
                              </Button>
                            )}
                            {isWhatsappTask && item.done ? (
                              <Button asChild type="button" variant="ghost">
                                <Link href="/whatsapp-crm">Abrir conversas</Link>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-[20px] border border-sky-100 bg-sky-50/70 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <strong className="block text-sm text-slate-950">Página pública</strong>
                        <p className="mt-1 break-all text-sm leading-6 text-slate-600">
                          {registrationUrl || "Defina o final do link publico antes de divulgar."}
                        </p>
                      </div>
                      <Badge variant={registrationUrl ? "success" : "warning"}>{registrationUrl ? "Link pronto" : "Falta revisar"}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {registrationUrl ? (
                        <>
                          <Button asChild type="button" variant="secondary">
                            <a href={registrationUrl} rel="noreferrer" target="_blank">
                              <ExternalLink className="size-4" />
                              Abrir pagina publica
                            </a>
                          </Button>
                          <Button onClick={copyRegistrationLink} type="button" variant="secondary">
                            <Link2 className="size-4" />
                            Copiar link
                          </Button>
                        </>
                      ) : null}
                      <Button onClick={() => setOnboardingStage("core")} type="button" variant="ghost">
                        Revisar dados
                      </Button>
                    </div>
                  </div>

                  {workspaceModuleConfig.whatsapp && onboardingConnectWhatsappNow ? (
                    <div className="space-y-4 rounded-[28px] border border-emerald-100 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(255,255,255,0.98))] p-5 shadow-[0_18px_44px_-36px_rgba(16,185,129,0.18)]">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <strong className="block text-base text-slate-950">Conectar o WhatsApp agora</strong>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                            Se o celular estiver por perto, gere o QR Code aqui. Se nao estiver, feche esta etapa e volte depois sem perder nada.
                          </p>
                        </div>
                        <Badge variant={onboardingWhatsappStatusVariant as any}>{onboardingWhatsappStatusLabel}</Badge>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button disabled={onboardingWhatsappBusy === "connect"} onClick={handleOnboardingWhatsappConnect} type="button">
                          <QrCode className="size-4" />
                          {onboardingWhatsappBusy === "connect" ? "Gerando..." : onboardingWhatsappConnectLabel}
                        </Button>
                        <Button
                          disabled={onboardingWhatsappBusy === "refresh"}
                          onClick={handleOnboardingWhatsappRefresh}
                          type="button"
                          variant="secondary"
                        >
                          <RefreshCcw className="size-4" />
                          {onboardingWhatsappBusy === "refresh" ? "Atualizando..." : "Atualizar status"}
                        </Button>
                        <Button onClick={() => setOnboardingConnectWhatsappNow(false)} type="button" variant="ghost">
                          Fechar por agora
                        </Button>
                      </div>

                      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                        <div className="rounded-[26px] border border-white/80 bg-white/92 p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.18)]">
                          <p className="text-sm font-semibold text-slate-950">Como conectar</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            No celular, abra o WhatsApp, entre em aparelhos conectados e leia o QR Code. Se a linha ja estiver ativa, o sistema mostra isso aqui.
                          </p>
                          <div className="mt-4 flex flex-col gap-3">
                            <Button asChild type="button" variant="ghost">
                              <Link href="/whatsapp">Abrir tela completa do WhatsApp</Link>
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-[28px] border border-slate-100 bg-white/95 p-5 shadow-[0_24px_72px_-42px_rgba(15,23,42,0.22)]">
                          <strong className="block text-slate-950">QR Code da linha</strong>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            O QR aparece assim que voce tocar em <strong className="text-slate-900">{onboardingWhatsappConnectLabel}</strong>.
                          </p>

                          <div className="mt-5 flex min-h-[260px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50/70 p-6">
                            {onboardingWhatsappConnector.connected ? (
                              <div className="space-y-3 text-center">
                                <Badge variant="success">Conectado</Badge>
                                <p className="text-sm leading-6 text-slate-600">A linha ja esta pronta para uso no gabinete.</p>
                              </div>
                            ) : onboardingQrImageSrc ? (
                              <img alt="QR Code do WhatsApp do gabinete" className="h-auto w-full max-w-[240px]" src={onboardingQrImageSrc} />
                            ) : (
                              <div className="space-y-3 text-center">
                                <QrCode className="mx-auto size-10 text-slate-300" />
                                <p className="text-sm leading-6 text-slate-500">Gere o QR Code quando o celular estiver por perto.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <div
                className={`sticky bottom-0 -mx-5 flex flex-col gap-3 border-t border-slate-100 bg-white/95 px-5 pt-4 pb-2 backdrop-blur-xl sm:-mx-7 sm:px-7 sm:flex-row sm:items-center ${
                  onboardingStage === "core" && onboardingBlockerMessage ? "sm:justify-between" : "sm:justify-end"
                }`}
              >
                {onboardingStage === "core" && onboardingBlockerMessage ? (
                  <p className="text-sm font-medium text-rose-600">{onboardingBlockerMessage}</p>
                ) : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                  {onboardingStage === "activation" ? (
                    <Button onClick={() => handleOnboardingOpenChange(false)} type="button" variant="ghost">
                      Fechar
                    </Button>
                  ) : null}
                  {onboardingStage === "activation" ? (
                    <Button onClick={() => setOnboardingStage("core")} type="button" variant="secondary">
                      Revisar dados
                    </Button>
                  ) : (
                    <Button disabled={!onboardingCanAdvance || onboardingSaving} type="submit">
                      {onboardingSaving ? "Salvando..." : "Salvar e continuar"}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet onOpenChange={setDangerSheetOpen} open={dangerSheetOpen}>
        <SheetContent className="w-[min(520px,calc(100vw-1.5rem))] rounded-[36px] border-red-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(254,242,242,0.96))] shadow-[0_40px_120px_-34px_rgba(127,29,29,0.28)]">
          <SheetHeader className="space-y-3 border-b border-red-100 px-6 py-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-red-700">
              <AlertTriangle className="size-3.5" />
              Acao permanente
            </div>
            <SheetTitle className="text-[1.75rem] tracking-[-0.04em]">
              {dangerMode === "account" ? "Excluir conta do gabinete" : "Excluir dados"}
            </SheetTitle>
            <SheetDescription>
              Esta acao nao tem desfazer. Baixe um backup antes se houver qualquer chance de precisar recuperar.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-5 px-6 py-6">
            <div className="rounded-[28px] border border-red-100 bg-white/90 p-5 text-sm leading-6 text-slate-600">
              <strong className="block text-base text-slate-950">
                {dangerMode === "account" ? "O que sera excluido" : "O que sera excluido"}
              </strong>
              <p className="mt-2">
                {dangerMode === "account"
                  ? "Gabinete, usuarios, sessoes, configuracoes, contatos, atendimentos, documentos, mensagens, tarefas, financeiro, notificacoes e arquivos enviados."
                  : "Contatos, atendimentos, documentos, importacoes, mensagens, tarefas, financeiro, notificacoes e arquivos enviados. A conta, usuarios e configuracoes ficam ativos."}
              </p>
            </div>

            <label className="flex items-start gap-3 rounded-[24px] border border-red-100 bg-red-50/70 p-4 text-sm leading-6 text-red-900">
              <input
                checked={dangerMode === "account"}
                className="mt-1"
                onChange={(event) => setDangerMode(event.target.checked ? "account" : "data")}
                type="checkbox"
              />
              <span>
                <strong className="block">Excluir tambem a conta do gabinete</strong>
                Remove usuarios, sessoes, configuracoes e o gabinete inteiro. Depois disso sera necessario criar um novo acesso.
              </span>
            </label>

            <Field label="Digite EXCLUIR para confirmar">
              <Input
                autoComplete="off"
                value={dangerPhrase}
                onChange={(event) => setDangerPhrase(event.target.value)}
              />
            </Field>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button onClick={() => setDangerSheetOpen(false)} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button
                className="bg-red-600 text-white shadow-[0_18px_40px_-22px_rgba(220,38,38,0.75)] hover:bg-red-700"
                disabled={purging || dangerPhrase !== "EXCLUIR"}
                onClick={handlePurgeData}
                type="button"
              >
                <Trash2 className="size-4" />
                {purging ? "Excluindo..." : dangerMode === "account" ? "Excluir conta" : "Excluir dados"}
              </Button>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet onOpenChange={setEmailSheetOpen} open={emailSheetOpen}>
        <SheetContent className="w-[min(460px,calc(100vw-1.5rem))] rounded-[36px] border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(255,250,246,0.97))] shadow-[0_40px_120px_-34px_rgba(15,23,42,0.32)]">
          <SheetHeader className="space-y-3 border-b border-slate-200/80 px-6 py-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">
              <Mail className="size-3.5" />
              E-mail do Gabinete
            </div>
            <SheetTitle className="text-[1.75rem] tracking-[-0.04em]">Configurar e testar envio</SheetTitle>
            <SheetDescription>
              O e-mail principal do Gabinete ja fica salvo acima. Aqui voce conecta a caixa que vai mandar mensagens em nome do mandato.
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5 px-6 py-6">
            <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.28)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="text-slate-950">Resumo rapido</strong>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    So ativa depois que o teste passa. Se o teste chegar, o envio ja fica pronto para uso.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  {emailStatusLabel}
                </span>
              </div>
            </div>

            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                handleEmailTest("draft");
              }}
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Server className="size-4 text-orange-600" />
                  Escolha o provedor
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EMAIL_PROVIDER_PRESETS.map((preset) => (
                    <button
                      className={`rounded-[24px] border px-4 py-4 text-left transition ${
                        emailForm.smtp_host === preset.smtp_host && emailForm.smtp_security === preset.smtp_security
                          ? "border-orange-300 bg-orange-50 shadow-[0_12px_30px_-24px_rgba(249,115,22,0.35)]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      key={preset.key}
                      onClick={() => applyEmailPreset(preset)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-slate-900">{preset.label}</strong>
                        <ChevronRight className="size-4 text-slate-400" />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{preset.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.28)]">
                <div>
                  <strong className="text-slate-950">Como o Gabinete aparece</strong>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Esse nome e esse e-mail vao aparecer para quem receber a mensagem.</p>
                </div>
                <Field label="Nome do remetente">
                  <Input value={emailForm.sender_name} onChange={(event) => updateEmailForm("sender_name", event.target.value)} />
                </Field>
                <Field label="E-mail do remetente">
                  <Input type="email" value={emailForm.sender_address} onChange={(event) => updateEmailForm("sender_address", event.target.value)} />
                </Field>
              </div>

              <div className="space-y-4 rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.28)]">
                <div>
                  <strong className="text-slate-950">Ligacao com o servidor</strong>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Se o provedor estiver certo, normalmente voce so confirma host, porta e seguranca.</p>
                </div>
                <Field label="Host SMTP">
                  <Input placeholder="smtp.hostinger.com" value={emailForm.smtp_host} onChange={(event) => updateEmailForm("smtp_host", event.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Porta">
                    <Input value={emailForm.smtp_port} onChange={(event) => updateEmailForm("smtp_port", event.target.value.replace(/\D/g, "").slice(0, 5))} />
                  </Field>
                  <Field label="Seguranca">
                    <select
                      className={SELECT_CLASS_NAME}
                      value={emailForm.smtp_security}
                      onChange={(event) => updateEmailForm("smtp_security", event.target.value)}
                    >
                      <option value="ssl_tls">SSL / TLS</option>
                      <option value="starttls">STARTTLS</option>
                      <option value="none">Sem criptografia</option>
                    </select>
                  </Field>
                </div>
              </div>

              <div className="space-y-4 rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.28)]">
                <div>
                  <strong className="text-slate-950">Login da conta</strong>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Aqui entra o usuario SMTP e a senha da conta que vai mandar os e-mails.</p>
                </div>
                <Field label="Usuario SMTP">
                  <Input value={emailForm.smtp_username} onChange={(event) => updateEmailForm("smtp_username", event.target.value)} />
                </Field>
                <Field
                  hint={data.email_settings?.has_password ? "Se deixar vazio, a senha atual continua guardada." : "A senha precisa entrar aqui para o primeiro teste."}
                  label="Senha SMTP"
                >
                  <Input
                    placeholder={data.email_settings?.has_password ? "Senha ja salva" : "Digite a senha"}
                    type="password"
                    value={emailForm.smtp_password}
                    onChange={(event) => updateEmailForm("smtp_password", event.target.value)}
                  />
                </Field>
              </div>

              <div className="space-y-4 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(240,253,250,0.9),rgba(255,255,255,0.94))] p-4 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.28)]">
                <div>
                  <strong className="text-slate-950">Teste rapido</strong>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Se este e-mail chegar, a configuracao fica ativa automaticamente.</p>
                </div>
                <Field label="Enviar teste para">
                  <Input type="email" value={emailForm.test_to} onChange={(event) => updateEmailForm("test_to", event.target.value)} />
                </Field>
                <Button className="h-12 w-full text-base" disabled={emailTesting} type="submit">
                  <Send className="size-4" />
                  {emailTesting ? "Enviando teste..." : "Testar e ativar envio"}
                </Button>
              </div>
            </form>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}

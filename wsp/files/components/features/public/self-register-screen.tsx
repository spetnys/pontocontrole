"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, FileUp, Mail, MapPin, MessageCircle, Navigation, Send, ShieldCheck, Sparkles } from "lucide-react";

import { GridBackground } from "@/components/aceternity/grid-background";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/components/providers/app-provider";
import { fetchJson } from "@/lib/api";
import {
  normalizePublicSelfRegisterConfig,
  isPublicSelfRegisterFieldRequired,
  isPublicSelfRegisterFieldVisible,
  PUBLIC_SELF_REGISTER_FIELD_LABELS,
  PUBLIC_SELF_REGISTER_FIELD_KEYS,
  PUBLIC_SELF_REGISTER_ADDRESS_FIELDS,
  PUBLIC_SELF_REGISTER_DEMAND_FIELDS,
  PUBLIC_SELF_REGISTER_IDENTITY_FIELDS,
  type PublicSelfRegisterFieldKey,
  type PublicSelfRegisterFieldMode,
} from "@/lib/public-self-register";
import {
  formatCepInput,
  formatCpfCnpjInput,
  formatPhoneDisplay,
  formatPhoneInput,
  buildWhatsAppUrl,
  getCpfCnpjValidationMessage,
  onlyDigits,
} from "@/lib/utils";

const PUBLIC_SELF_REGISTER_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
const PUBLIC_PERSON_NAME_MAX_LENGTH = 60;
const PUBLIC_GABINETE_NAME_MAX_LENGTH = 120;
const PUBLIC_DISPLAY_NAME_MAX_LENGTH = 80;
const PUBLIC_COMPANY_NAME_MAX_LENGTH = 120;
const PUBLIC_AI_TEXT_MIN_LENGTH = 30;
const PUBLIC_DESCRIPTION_AI_MAX_USES = 3;
const DEFAULT_PUBLIC_SELF_REGISTER_INTRO =
  "Explique o que aconteceu e qual ajuda voce precisa.";
const DEMAND_SUGGESTIONS = [
  { title: "Iluminacao publica", category: "Iluminacao publica" },
  { title: "Saude", category: "Saude" },
  { title: "Obras e manutencao", category: "Obras" },
  { title: "Educacao", category: "Educacao" },
  { title: "Limpeza urbana", category: "Limpeza urbana" },
  { title: "Orientacao ou informacao", category: "Outro" },
];
const DEMAND_CATEGORY_OPTIONS = [
  "Saude",
  "Educacao",
  "Obras",
  "Iluminacao publica",
  "Limpeza urbana",
  "Transporte",
  "Assistencia social",
  "Habitacao",
  "Seguranca",
  "Outro",
];
const PUBLIC_FORM_OWNER_FIELDS: PublicSelfRegisterFieldKey[] = [
  "name",
  "phone",
  "whatsapp",
  "zip_code",
  "number",
  "complement",
  "demand_title",
  "description",
];
const PUBLIC_FORM_OWNER_MODES: Array<{ value: PublicSelfRegisterFieldMode; label: string }> = [
  { value: "hidden", label: "Não pedir" },
  { value: "optional", label: "Opcional" },
  { value: "required", label: "Obrigatório" },
];

function normalizePublicPersonNameInput(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, PUBLIC_PERSON_NAME_MAX_LENGTH);
}

function requiredLabel(label: string, required: boolean) {
  return required ? `${label} (Obrigatório)` : label;
}

function formatPublicPhoneDisplay(value: unknown) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  const local = digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  return formatPhoneDisplay(local);
}

function isLikelyMobilePhone(value: unknown) {
  const digits = onlyDigits(value);
  const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  return national.length === 11 && national[2] === "9";
}

function buildGabineteAddressLine(gabinete: any) {
  return [
    [gabinete?.address, gabinete?.address_number].filter(Boolean).join(", "),
    gabinete?.address_complement,
    gabinete?.neighborhood,
    [gabinete?.city, gabinete?.uf].filter(Boolean).join(" - "),
    gabinete?.zip_code ? `CEP ${String(gabinete.zip_code).replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "",
  ]
    .filter((item) => String(item || "").trim())
    .join(" · ");
}

const EMPTY_PUBLIC_FORM = {
  name: "",
  phone: "",
  whatsapp: "",
  cpf_rg_cns: "",
  birth_date: "",
  email: "",
  profession: "",
  referred_by: "",
  address: "",
  number: "",
  complement: "",
  neighborhood: "",
  zip_code: "",
  city: "",
  uf: "",
  demand_title: "",
  demand_category: "",
  description: "",
  notes: "",
  company_legal_name: "",
  photo_url: "",
  contact_type: "person",
};

export function PublicSelfRegisterScreen({ slug }: { slug: string }) {
  const { session, showToast } = useApp();
  const [gabinete, setGabinete] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_PUBLIC_FORM);
  const [feedback, setFeedback] = useState<string>("");
  const [tracking, setTracking] = useState<any>(null);
  const [cepFeedback, setCepFeedback] = useState<string>("");
  const [documentFeedback, setDocumentFeedback] = useState<string>("");
  const [contactLookupBusy, setContactLookupBusy] = useState(false);
  const [contactLookupFeedback, setContactLookupFeedback] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [editorSavingKey, setEditorSavingKey] = useState("");
  const [descriptionAiBusy, setDescriptionAiBusy] = useState(false);
  const [descriptionAiUses, setDescriptionAiUses] = useState(0);
  const [showComplementaryFields, setShowComplementaryFields] = useState(false);
  const [publicPageDraft, setPublicPageDraft] = useState({
    parliamentarian_name: "",
    name: "",
    type: "",
    city: "",
    uf: "",
    logo_url: "",
    email: "",
    phone: "",
    zip_code: "",
    address: "",
    address_number: "",
    address_complement: "",
    neighborhood: "",
    public_self_register_intro: DEFAULT_PUBLIC_SELF_REGISTER_INTRO,
  });
  const lastCepLookupRef = useRef("");
  const lastDocumentLookupRef = useRef("");
  const lastContactLookupRef = useRef("");

  useEffect(() => {
    let active = true;
    fetchJson(`/api/public/gabinete/${slug}`)
      .then((payload) => {
        if (active) setGabinete(payload.gabinete);
      })
      .catch(() => {
        if (active) setGabinete(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const publicConfig = useMemo(
    () => normalizePublicSelfRegisterConfig(gabinete?.public_self_register_config),
    [gabinete?.public_self_register_config],
  );
  const canEditPublicPage = Boolean(
    session.authenticated
      && gabinete?.id
      && Number(session.gabinete?.id || 0) === Number(gabinete.id),
  );

  useEffect(() => {
    if (!publicConfig.allow_anonymous) {
      setAnonymousMode(false);
    }
  }, [publicConfig.allow_anonymous]);

  useEffect(() => {
    if (!gabinete) return;
    setPublicPageDraft({
      parliamentarian_name: String(gabinete.parliamentarian_name || ""),
      name: String(gabinete.name || ""),
      type: String(gabinete.type || ""),
      city: String(gabinete.city || ""),
      uf: String(gabinete.uf || ""),
      logo_url: String(gabinete.logo_url || ""),
      email: String(gabinete.email || ""),
      phone: formatPhoneInput(gabinete.phone || ""),
      zip_code: formatCepInput(gabinete.zip_code || ""),
      address: String(gabinete.address || ""),
      address_number: String(gabinete.address_number || ""),
      address_complement: String(gabinete.address_complement || ""),
      neighborhood: String(gabinete.neighborhood || ""),
      public_self_register_intro: String(gabinete.public_self_register_intro || DEFAULT_PUBLIC_SELF_REGISTER_INTRO),
    });
  }, [
    gabinete?.id,
    gabinete?.parliamentarian_name,
    gabinete?.name,
    gabinete?.type,
    gabinete?.city,
    gabinete?.uf,
    gabinete?.logo_url,
    gabinete?.email,
    gabinete?.phone,
    gabinete?.zip_code,
    gabinete?.address,
    gabinete?.address_number,
    gabinete?.address_complement,
    gabinete?.neighborhood,
    gabinete?.public_self_register_intro,
  ]);

  const documentDigits = onlyDigits(form.cpf_rg_cns);
  const isCompany = documentDigits.length === 14 || form.contact_type === "company";
  const leadName = String(gabinete?.parliamentarian_name || gabinete?.name || "o Gabinete").trim();
  const gabineteName = String(gabinete?.name || "").trim();
  const title =
    gabinete?.parliamentarian_name
      ? `Fale com ${gabinete.parliamentarian_name}`
      : gabinete?.name
        ? `Fale com ${gabinete.name}`
        : "Fale com o Gabinete";
  const subtitle = useMemo(
    () =>
      [
        gabinete?.parliamentarian_name && gabineteName && normalizeCardText(gabinete?.parliamentarian_name) !== normalizeCardText(gabineteName)
          ? gabineteName
          : "",
        /^outro$/i.test(String(gabinete?.type || "").trim()) ? "" : gabinete?.type,
        gabinete?.city,
        gabinete?.uf,
      ]
        .filter(Boolean)
        .join(" · "),
    [gabinete, gabineteName],
  );
  const gabineteAddressLine = useMemo(() => buildGabineteAddressLine(gabinete), [gabinete]);
  const gabineteWazeUrl = gabineteAddressLine
    ? `https://waze.com/ul?q=${encodeURIComponent(gabineteAddressLine)}&navigate=yes`
    : "";
  const publicIntro = String(gabinete?.public_self_register_intro || DEFAULT_PUBLIC_SELF_REGISTER_INTRO).trim();
  const publicEmail = String(gabinete?.email || "").trim();
  const publicPhoneDisplay = formatPublicPhoneDisplay(gabinete?.phone || "");
  const publicPhoneUrl = buildWhatsAppUrl(gabinete?.phone || "");
  const descriptionAiReady = String(form.description || "").trim().length >= PUBLIC_AI_TEXT_MIN_LENGTH;
  const hasAddressFields = !anonymousMode && Array.from(PUBLIC_SELF_REGISTER_ADDRESS_FIELDS).some((item) => fieldVisible(item));
  const showAddressDetails = Boolean(
    onlyDigits(form.zip_code).length
      || form.address
      || form.neighborhood
      || form.city
      || form.uf,
  );
  const hasRequiredAddressFields = Array.from(PUBLIC_SELF_REGISTER_ADDRESS_FIELDS).some((item) => fieldRequired(item));
  const showPublicAddressFields = hasAddressFields && (showComplementaryFields || hasRequiredAddressFields || showAddressDetails);
  const gabineteInitials = useMemo(() => {
    const source = String(gabinete?.parliamentarian_name || gabinete?.name || "Gabinete");
    return source
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item[0]?.toUpperCase() || "")
      .join("");
  }, [gabinete]);

  function fieldVisible(key: keyof typeof EMPTY_PUBLIC_FORM | "attachment") {
    const visibleByConfig = isPublicSelfRegisterFieldVisible(publicConfig, key as any);
    if (!visibleByConfig) return false;
    if (!anonymousMode) return true;
    if (PUBLIC_SELF_REGISTER_DEMAND_FIELDS.has(key as any)) {
      return key !== "attachment";
    }
    if (PUBLIC_SELF_REGISTER_IDENTITY_FIELDS.has(key as any) || PUBLIC_SELF_REGISTER_ADDRESS_FIELDS.has(key as any)) {
      return false;
    }
    return false;
  }

  function fieldRequired(key: keyof typeof EMPTY_PUBLIC_FORM | "attachment") {
    if (!fieldVisible(key)) return false;
    if (anonymousMode) {
      return isPublicSelfRegisterFieldRequired(publicConfig, key as any);
    }
    if (publicConfig.confirmation_channel === "email" && key === "email") return true;
    if (publicConfig.confirmation_channel === "whatsapp" && key === "whatsapp") return true;
    return isPublicSelfRegisterFieldRequired(publicConfig, key as any);
  }

  function hasDescriptionAiPrerequisites() {
    const fieldsToCheck = PUBLIC_SELF_REGISTER_FIELD_KEYS.filter((field) => !["description", "attachment", "notes"].includes(field));
    for (const field of fieldsToCheck) {
      if (!fieldVisible(field) || !fieldRequired(field)) continue;
      const value = form[field as keyof typeof EMPTY_PUBLIC_FORM];
      if (["phone", "whatsapp", "cpf_rg_cns", "zip_code"].includes(field)) {
        if (!onlyDigits(value)) return false;
      } else if (!String(value || "").trim()) {
        return false;
      }
    }
    if (!anonymousMode && publicConfig.require_contact_channel && !onlyDigits(form.phone) && !onlyDigits(form.whatsapp)) return false;
    return true;
  }

  const descriptionAiPrerequisitesReady = hasDescriptionAiPrerequisites();
  const descriptionAiRemainingUses = Math.max(0, PUBLIC_DESCRIPTION_AI_MAX_USES - descriptionAiUses);
  const descriptionAiCanRun = descriptionAiReady && descriptionAiPrerequisitesReady && descriptionAiRemainingUses > 0;

  async function updatePublicFormFieldMode(field: PublicSelfRegisterFieldKey, mode: PublicSelfRegisterFieldMode) {
    if (!canEditPublicPage || editorSavingKey) return;
    const nextConfig = {
      ...publicConfig,
      allow_anonymous: false,
      confirmation_channel: "none",
      fields: {
        ...publicConfig.fields,
        [field]: mode,
      },
    };
    setGabinete((current: any) => current ? { ...current, public_self_register_config: nextConfig } : current);
    setEditorSavingKey(`${field}:${mode}`);
    try {
      const payload = await fetchJson<{ public_self_register_config: any }>(`/api/public/gabinete/${slug}/form-config`, {
        method: "PATCH",
        body: JSON.stringify({ public_self_register_config: nextConfig }),
      });
      setGabinete((current: any) =>
        current ? { ...current, public_self_register_config: payload.public_self_register_config || nextConfig } : current,
      );
      showToast("success", "Página pública atualizada.");
    } catch (error: any) {
      showToast("error", error.message || "Nao foi possivel salvar a pagina publica.");
      setGabinete((current: any) => current ? { ...current, public_self_register_config: publicConfig } : current);
    } finally {
      setEditorSavingKey("");
    }
  }

  async function updatePublicPageData(patch: Record<string, unknown>, savingKey: string) {
    if (!canEditPublicPage || editorSavingKey) return;
    setEditorSavingKey(savingKey);
    try {
      const payload = await fetchJson<{ gabinete?: any; public_self_register_config?: any }>(`/api/public/gabinete/${slug}/form-config`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setGabinete((current: any) =>
        current
          ? {
              ...current,
              ...(payload.gabinete || {}),
              public_self_register_config: payload.public_self_register_config || current.public_self_register_config,
            }
          : current,
      );
      showToast("success", "Página pública atualizada.");
    } catch (error: any) {
      showToast("error", error.message || "Nao foi possivel salvar a pagina publica.");
    } finally {
      setEditorSavingKey("");
    }
  }

  function applyDemandSuggestion(item: { title: string; category: string }) {
    setForm((current) => ({
      ...current,
      demand_title: item.title,
      demand_category: item.category || current.demand_category,
    }));
  }

  async function handleImproveDescription() {
    if (!descriptionAiCanRun || descriptionAiBusy) return;
    setDescriptionAiBusy(true);
    try {
      const payload = await fetchJson<{ summary: string }>(`/api/public/gabinete/${slug}/ai/summarize`, {
        method: "POST",
        body: JSON.stringify({
          field: "description",
          text: form.description,
          values: form,
          is_anonymous: anonymousMode ? "1" : "0",
          context: "descricao do pedido no formulario publico de atendimento",
        }),
      });
      setForm((current) => ({ ...current, description: payload.summary || current.description }));
      setDescriptionAiUses((current) => Math.min(PUBLIC_DESCRIPTION_AI_MAX_USES, current + 1));
      showToast("success", "Texto melhorado com IA.");
    } catch (error: any) {
      showToast("error", error.message || "Nao foi possivel melhorar o texto agora.");
    } finally {
      setDescriptionAiBusy(false);
    }
  }

  async function handleCepLookup() {
    const cep = onlyDigits(form.zip_code);
    if (cep.length !== 8 || lastCepLookupRef.current === cep) return;
    setCepBusy(true);
    setCepFeedback("");
    try {
      const payload = await fetchJson(`/api/public/lookups/cep/${cep}`);
      lastCepLookupRef.current = cep;
      setForm((current) => ({
        ...current,
        zip_code: formatCepInput(payload.cep || cep),
        address: payload.address || current.address,
        neighborhood: payload.neighborhood || current.neighborhood,
        city: payload.city || current.city,
        uf: payload.uf || current.uf,
      }));
      setCepFeedback("Endereco preenchido automaticamente.");
    } catch (error: any) {
      setCepFeedback(error.message);
    } finally {
      setCepBusy(false);
    }
  }

  function applyExistingContact(contact: any) {
    setForm((current) => ({
      ...current,
      contact_type: contact.contact_type || current.contact_type,
      name: contact.name || current.name,
      company_legal_name: contact.company_legal_name || current.company_legal_name,
      phone: contact.phone ? formatPhoneInput(contact.phone) : current.phone,
      whatsapp: contact.whatsapp
        ? formatPhoneInput(contact.whatsapp)
        : isLikelyMobilePhone(contact.phone)
          ? formatPhoneInput(contact.phone)
          : current.whatsapp,
      cpf_rg_cns: contact.cpf_rg_cns ? formatCpfCnpjInput(contact.cpf_rg_cns) : current.cpf_rg_cns,
      birth_date: contact.birth_date || current.birth_date,
      email: contact.email || current.email,
      profession: contact.profession || current.profession,
      referred_by: contact.referred_by || current.referred_by,
      address: contact.address || current.address,
      number: contact.number || current.number,
      complement: contact.complement || current.complement,
      neighborhood: contact.neighborhood || current.neighborhood,
      zip_code: contact.zip_code ? formatCepInput(contact.zip_code) : current.zip_code,
      city: contact.city || current.city,
      uf: contact.uf || current.uf,
    }));
  }

  async function lookupExistingContact(source: "document" | "whatsapp") {
    if (anonymousMode || !gabinete) return false;
    const document = onlyDigits(form.cpf_rg_cns);
    const whatsapp = onlyDigits(form.whatsapp);
    const params = new URLSearchParams();

    if (source === "document") {
      if (![11, 14].includes(document.length)) return false;
      const documentError = getCpfCnpjValidationMessage(document);
      if (documentError) {
        setDocumentFeedback(documentError);
        return false;
      }
      params.set("document", document);
    } else {
      if (whatsapp.length < 10) return false;
      params.set("whatsapp", whatsapp);
    }

    const lookupKey = `${source}:${params.toString()}`;
    if (lastContactLookupRef.current === lookupKey) return false;
    lastContactLookupRef.current = lookupKey;
    setContactLookupBusy(true);
    setContactLookupFeedback("");

    try {
      const payload = await fetchJson<{ contact?: any }>(`/api/public/gabinete/${slug}/contact-lookup?${params.toString()}`);
      if (!payload.contact) return false;
      applyExistingContact(payload.contact);
      setContactLookupFeedback("Encontramos seu cadastro neste gabinete e preenchemos os dados que ja estavam salvos.");
      return true;
    } catch {
      return false;
    } finally {
      setContactLookupBusy(false);
    }
  }

  async function handleDocumentLookup() {
    const digits = onlyDigits(form.cpf_rg_cns);
    if (!digits || lastDocumentLookupRef.current === digits) return;
    setDocumentFeedback("");
    const documentError = getCpfCnpjValidationMessage(digits);
    if (documentError) {
      setDocumentFeedback(documentError);
      return;
    }

    const foundExisting = await lookupExistingContact("document");
    if (foundExisting) {
      lastDocumentLookupRef.current = digits;
      return;
    }

    if (digits.length === 11) {
      lastDocumentLookupRef.current = digits;
      setForm((current) => ({ ...current, contact_type: "person" }));
      setDocumentFeedback("CPF valido.");
      return;
    }

    setDocumentBusy(true);
    try {
      const payload = await fetchJson(`/api/public/lookups/cnpj/${digits}`);
      lastDocumentLookupRef.current = digits;
      setForm((current) => ({
        ...current,
        contact_type: "company",
        name: payload.nome_fantasia || payload.razao_social || current.name,
        company_legal_name: payload.razao_social || current.company_legal_name,
        phone: payload.telefone ? formatPhoneInput(payload.telefone) : current.phone,
        whatsapp: payload.telefone ? formatPhoneInput(payload.telefone) : current.whatsapp,
        cpf_rg_cns: formatCpfCnpjInput(payload.cnpj || digits),
        email: payload.email || current.email,
        profession: payload.atividade_principal || current.profession,
        address: payload.address || current.address,
        neighborhood: payload.neighborhood || current.neighborhood,
        zip_code: formatCepInput(payload.cep || current.zip_code),
        city: payload.city || current.city,
        uf: payload.uf || current.uf,
        birth_date: "",
      }));
      setDocumentFeedback(`Dados da empresa preenchidos automaticamente via ${payload.source}.`);
    } catch (error: any) {
      setDocumentFeedback(error.message);
    } finally {
      setDocumentBusy(false);
    }
  }

  async function handleWhatsappLookup() {
    const digits = onlyDigits(form.whatsapp);
    if (digits.length < 10) return;
    await lookupExistingContact("whatsapp");
  }

  function handleAttachmentChange(file: File | null) {
    if (!file) {
      setAttachment(null);
      return;
    }
    if (file.size > PUBLIC_SELF_REGISTER_FILE_LIMIT_BYTES) {
      setFeedback("O arquivo pode ter no maximo 10 MB.");
      setAttachment(null);
      setFileInputKey((current) => current + 1);
      return;
    }
    setAttachment(file);
  }

  async function copyTrackingText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copiado. Guarde essas informacoes para acompanhar sua solicitacao.`);
    } catch {
      setFeedback("Nao foi possivel copiar automaticamente. Anote o protocolo e o codigo de acesso.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback("");
    setTracking(null);

    const digits = onlyDigits(form.cpf_rg_cns);
    const documentError = getCpfCnpjValidationMessage(digits);
    if (documentError) {
      setSubmitting(false);
      setDocumentFeedback(documentError);
      return;
    }

    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        body.append(key, String(value));
      });
      body.append("is_anonymous", anonymousMode ? "1" : "0");
      if (attachment) {
        body.append("attachment", attachment);
      }
      const payload = await fetchJson<{
        tracking?: any;
        delivery?: { channel?: string; status?: string };
      }>(`/api/public/gabinete/${slug}/autocadastro`, {
        method: "POST",
        body,
      });
      setTracking(payload.tracking || null);
      const confirmationMessage =
        payload.delivery?.status === "sent" && payload.delivery?.channel === "email"
          ? " A confirmacao tambem foi enviada por e-mail."
          : payload.delivery?.status === "sent" && payload.delivery?.channel === "whatsapp"
            ? " A confirmacao tambem foi enviada por WhatsApp."
            : "";
      setFeedback(
        payload.tracking
          ? `Recebemos sua solicitacao. Guarde o protocolo e o codigo de acesso para acompanhar o andamento.${confirmationMessage}`
          : `Recebemos sua solicitacao. Agora a equipe do gabinete ja consegue ver seus dados e organizar o retorno.${confirmationMessage}`,
      );
      setForm(EMPTY_PUBLIC_FORM);
      setAnonymousMode(false);
      setShowComplementaryFields(false);
      setAttachment(null);
      setCepFeedback("");
      setDocumentFeedback("");
      setContactLookupFeedback("");
      setDescriptionAiUses(0);
      lastCepLookupRef.current = "";
      lastDocumentLookupRef.current = "";
      lastContactLookupRef.current = "";
      setFileInputKey((current) => current + 1);
    } catch (error: any) {
      setFeedback(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="public-mobile-type relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fffaf5_0%,#f8fafc_100%)]">
      <GridBackground />
      <Spotlight className="-left-12 top-0 h-[24rem] w-[24rem]" color="rgba(249,115,22,0.14)" />
      <Spotlight className="right-[-8rem] top-[-4rem] h-[28rem] w-[28rem]" color="rgba(251,146,60,0.12)" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 lg:px-6">
        <div className="rounded-[40px] border border-white/80 bg-white/92 p-5 shadow-[0_35px_120px_-56px_rgba(15,23,42,0.38)] backdrop-blur-2xl md:p-8">
          <div className="rounded-[34px] border border-orange-100/80 bg-[linear-gradient(145deg,rgba(255,247,237,0.98),rgba(255,255,255,0.96)_58%,rgba(254,215,170,0.46)_100%)] p-7 text-slate-950 shadow-[0_34px_100px_-58px_rgba(249,115,22,0.32)] md:p-8">
	            <div className="flex flex-wrap items-start justify-between gap-4">
	              <div>
	                <h1 className="text-3xl font-semibold leading-tight md:text-4xl">{title}</h1>
	              </div>
	            </div>

            {loading ? (
              <div className="mt-7 rounded-[28px] border border-orange-100 bg-white/72 px-5 py-4 text-sm text-slate-600">
                Carregando o Gabinete...
              </div>
            ) : gabinete ? (
              <div className="mt-7 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[28px] border border-orange-100 bg-white/72 p-5 backdrop-blur-xl">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    {gabinete.logo_url ? (
                      <div className="shrink-0 overflow-hidden rounded-[28px] border border-orange-100 bg-white p-1 shadow-[0_18px_46px_-34px_rgba(15,23,42,0.45)]">
                        <img
                          alt={gabinete.name}
                          className="h-28 w-28 rounded-[23px] bg-white object-cover object-[50%_35%] sm:h-32 sm:w-32"
                          loading="eager"
                          referrerPolicy="no-referrer"
                          src={gabinete.logo_url}
                        />
                      </div>
                    ) : (
                      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[28px] border border-orange-100 bg-white text-2xl font-semibold text-orange-700 sm:h-32 sm:w-32">
                        {gabineteInitials}
                      </div>
	                    )}
	                    <div className="min-w-0">
	                      <strong className="block text-xl">{leadName}</strong>
                      <p className="mt-1 text-sm text-slate-600">{subtitle || "Atendimento publico do gabinete"}</p>
                      {publicEmail || publicPhoneDisplay ? (
                        <div className="mt-3 flex flex-wrap gap-2 text-sm">
                          {publicEmail ? (
                            <a
                              className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-white px-3 py-1.5 font-medium text-slate-600 transition hover:border-orange-200 hover:text-orange-700"
                              href={`mailto:${publicEmail}`}
                            >
                              <Mail className="size-3.5" />
                              {publicEmail}
                            </a>
                          ) : null}
                          {publicPhoneDisplay && publicPhoneUrl ? (
                            <a
                              className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 font-medium text-slate-600 transition hover:border-emerald-200 hover:text-emerald-700"
                              href={publicPhoneUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <MessageCircle className="size-3.5" />
                              WhatsApp {publicPhoneDisplay}
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      {gabineteAddressLine ? (
                        <div className="mt-4 flex flex-col gap-3 rounded-[20px] border border-orange-100 bg-white/80 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                          <span className="flex min-w-0 items-start gap-2">
                            <MapPin className="mt-0.5 size-4 shrink-0 text-orange-600" />
                            <span className="break-words">{gabineteAddressLine}</span>
                          </span>
                          <a
                            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                            href={gabineteWazeUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <Navigation className="size-3.5" />
                            Waze
                          </a>
                        </div>
                      ) : null}
                      {canEditPublicPage ? (
                        <div className="mt-5 grid gap-3 rounded-[22px] border border-orange-100 bg-white/80 p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Nome exibido">
                              <Input
                                maxLength={PUBLIC_DISPLAY_NAME_MAX_LENGTH}
                                value={publicPageDraft.parliamentarian_name}
                                onChange={(event) =>
                                  setPublicPageDraft((current) => ({
                                    ...current,
                                    parliamentarian_name: event.target.value.slice(0, PUBLIC_DISPLAY_NAME_MAX_LENGTH),
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Nome do gabinete">
                              <Input
                                maxLength={PUBLIC_GABINETE_NAME_MAX_LENGTH}
                                value={publicPageDraft.name}
                                onChange={(event) =>
                                  setPublicPageDraft((current) => ({
                                    ...current,
                                    name: event.target.value.slice(0, PUBLIC_GABINETE_NAME_MAX_LENGTH),
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Tipo">
                              <Input
                                value={publicPageDraft.type}
                                onChange={(event) => setPublicPageDraft((current) => ({ ...current, type: event.target.value }))}
                              />
                            </Field>
                            <div className="grid grid-cols-[1fr_5rem] gap-3">
                              <Field label="Cidade">
                                <Input
                                  value={publicPageDraft.city}
                                  onChange={(event) => setPublicPageDraft((current) => ({ ...current, city: event.target.value }))}
                                />
                              </Field>
                              <Field label="UF">
                                <Input
                                  maxLength={2}
                                  value={publicPageDraft.uf}
                                  onChange={(event) => setPublicPageDraft((current) => ({ ...current, uf: event.target.value.toUpperCase().slice(0, 2) }))}
                                />
                              </Field>
                            </div>
                            <Field label="E-mail público">
                              <Input
                                value={publicPageDraft.email}
                                onChange={(event) => setPublicPageDraft((current) => ({ ...current, email: event.target.value }))}
                              />
                            </Field>
                            <Field label="WhatsApp público">
                              <Input
                                value={publicPageDraft.phone}
                                onChange={(event) => setPublicPageDraft((current) => ({ ...current, phone: formatPhoneInput(event.target.value) }))}
                              />
                            </Field>
                            <Field className="md:col-span-2" label="Link da foto">
                              <Input
                                value={publicPageDraft.logo_url}
                                onChange={(event) => setPublicPageDraft((current) => ({ ...current, logo_url: event.target.value }))}
                              />
                            </Field>
                            <Field label="CEP">
                              <Input
                                value={publicPageDraft.zip_code}
                                onChange={(event) => setPublicPageDraft((current) => ({ ...current, zip_code: formatCepInput(event.target.value) }))}
                              />
                            </Field>
                            <Field label="Rua">
                              <Input
                                value={publicPageDraft.address}
                                onChange={(event) => setPublicPageDraft((current) => ({ ...current, address: event.target.value }))}
                              />
                            </Field>
                            <Field label="Número">
                              <Input
                                value={publicPageDraft.address_number}
                                onChange={(event) => setPublicPageDraft((current) => ({ ...current, address_number: event.target.value }))}
                              />
                            </Field>
                            <Field label="Complemento">
                              <Input
                                value={publicPageDraft.address_complement}
                                onChange={(event) => setPublicPageDraft((current) => ({ ...current, address_complement: event.target.value }))}
                              />
                            </Field>
                            <Field className="md:col-span-2" label="Bairro">
                              <Input
                                value={publicPageDraft.neighborhood}
                                onChange={(event) => setPublicPageDraft((current) => ({ ...current, neighborhood: event.target.value }))}
                              />
                            </Field>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              disabled={Boolean(editorSavingKey)}
                              onClick={() =>
                                updatePublicPageData(
                                  {
                                    parliamentarian_name: publicPageDraft.parliamentarian_name,
                                    name: publicPageDraft.name,
                                    type: publicPageDraft.type,
                                    city: publicPageDraft.city,
                                    uf: publicPageDraft.uf,
                                    logo_url: publicPageDraft.logo_url,
                                    email: publicPageDraft.email,
                                    phone: publicPageDraft.phone,
                                    zip_code: publicPageDraft.zip_code,
                                    address: publicPageDraft.address,
                                    address_number: publicPageDraft.address_number,
                                    address_complement: publicPageDraft.address_complement,
                                    neighborhood: publicPageDraft.neighborhood,
                                  },
                                  "public-profile",
                                )
                              }
                              type="button"
                              variant="secondary"
                            >
                              {editorSavingKey === "public-profile" ? "Salvando..." : "Atualizar dados"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-orange-100 bg-white/72 p-5 backdrop-blur-xl">
                  {canEditPublicPage ? (
                    <div className="space-y-3">
                      <Field label="Mensagem inicial">
                        <Textarea
                          maxLength={280}
                          rows={5}
                          value={publicPageDraft.public_self_register_intro}
                          onChange={(event) =>
                            setPublicPageDraft((current) => ({ ...current, public_self_register_intro: event.target.value }))
                          }
                        />
                      </Field>
                      <div className="flex justify-end">
                        <Button
                          disabled={Boolean(editorSavingKey)}
                          onClick={() =>
                            updatePublicPageData(
                              { public_self_register_intro: publicPageDraft.public_self_register_intro },
                              "public-intro",
                            )
                          }
                          type="button"
                          variant="secondary"
                        >
                          {editorSavingKey === "public-intro" ? "Salvando..." : "Atualizar mensagem"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-base leading-7 text-slate-700">{publicIntro}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-7 rounded-[28px] border border-orange-100 bg-white/72 px-5 py-4 text-sm text-slate-600">
                Este link publico nao foi encontrado.
              </div>
            )}
          </div>

          <form className="mt-6 grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
              {canEditPublicPage ? (
                <div className="md:col-span-2 rounded-[28px] border border-orange-200 bg-orange-50/80 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-orange-950">Campos do formulário</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-700">
                      Salva ao clicar
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {PUBLIC_FORM_OWNER_FIELDS.map((field) => (
                      <div className="rounded-[20px] border border-orange-100 bg-white p-3" key={field}>
                        <p className="text-sm font-semibold text-slate-800">{PUBLIC_SELF_REGISTER_FIELD_LABELS[field]}</p>
                        <div className="mt-3 grid grid-cols-3 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
                          {PUBLIC_FORM_OWNER_MODES.map((mode) => {
                            const active = publicConfig.fields[field] === mode.value;
                            return (
                              <button
                                className={`h-9 rounded-full px-2 text-xs font-semibold transition ${
                                  active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-white hover:text-slate-900"
                                }`}
                                disabled={Boolean(editorSavingKey)}
                                key={mode.value}
                                onClick={() => updatePublicFormFieldMode(field, mode.value)}
                                type="button"
                              >
                                {editorSavingKey === `${field}:${mode.value}` ? "..." : mode.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {publicConfig.allow_anonymous ? (
                <div className="md:col-span-2 rounded-[24px] border border-sky-200 bg-sky-50/75 px-4 py-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Modo de envio</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Voce pode se identificar ou enviar de forma anonima. No envio anonimo o sistema abre acompanhamento sem criar contato comum na base.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className={!anonymousMode ? "border-orange-200 bg-orange-50 text-orange-700" : ""}
                        onClick={() => setAnonymousMode(false)}
                        type="button"
                        variant="secondary"
                      >
                        Identificado
                      </Button>
                      <Button
                        className={anonymousMode ? "border-orange-200 bg-orange-50 text-orange-700" : ""}
                        onClick={() => setAnonymousMode(true)}
                        type="button"
                        variant="secondary"
                      >
                        Anonimo
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {!anonymousMode && (
                <>
                  <div className="md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Seus dados</p>
                  </div>

                  {fieldVisible("name") ? (
                    <Field label={requiredLabel(isCompany ? "Nome da empresa" : "Nome", fieldRequired("name"))}>
                      <Input
                        maxLength={PUBLIC_PERSON_NAME_MAX_LENGTH}
                        required={fieldRequired("name")}
                        value={form.name}
                        onBlur={() => setForm((current) => ({ ...current, name: current.name.trim() }))}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            name: isCompany ? event.target.value.slice(0, PUBLIC_COMPANY_NAME_MAX_LENGTH) : normalizePublicPersonNameInput(event.target.value),
                          }))
                        }
                      />
                    </Field>
                  ) : null}
                  {fieldVisible("phone") ? (
                    <Field label={requiredLabel("Telefone", fieldRequired("phone"))}>
                      <Input
                        required={fieldRequired("phone")}
                        value={form.phone}
                        onChange={(event) => setForm((current) => ({ ...current, phone: formatPhoneInput(event.target.value) }))}
                      />
                    </Field>
                  ) : null}
                  {fieldVisible("whatsapp") ? (
                    <Field hint={contactLookupBusy ? "Conferindo cadastro existente..." : undefined} label={requiredLabel("WhatsApp", fieldRequired("whatsapp"))}>
                      <Input
                        required={fieldRequired("whatsapp")}
                        value={form.whatsapp}
                        onBlur={handleWhatsappLookup}
                        onChange={(event) => {
                          setContactLookupFeedback("");
                          setForm((current) => ({ ...current, whatsapp: formatPhoneInput(event.target.value) }));
                        }}
                      />
                    </Field>
                  ) : null}
                  {contactLookupFeedback ? (
                    <div className="md:col-span-2 rounded-[20px] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800">
                      {contactLookupFeedback}
                    </div>
                  ) : null}
                </>
              )}

              <div className="md:col-span-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Pedido</p>
              </div>
              {fieldVisible("demand_title") ? (
                <Field className="md:col-span-2" label={requiredLabel("Assunto do pedido", fieldRequired("demand_title"))}>
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {DEMAND_SUGGESTIONS.map((item) => (
                        <button
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                          key={item.title}
                          onClick={() => applyDemandSuggestion(item)}
                          type="button"
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                    <Input
                      list="public-demand-options"
                      placeholder="Digite ou escolha"
                      required={fieldRequired("demand_title")}
                      value={form.demand_title}
                      onChange={(event) => setForm((current) => ({ ...current, demand_title: event.target.value }))}
                    />
                    <datalist id="public-demand-options">
                      {DEMAND_SUGGESTIONS.map((item) => (
                        <option key={item.title} value={item.title} />
                      ))}
                    </datalist>
                  </>
                </Field>
              ) : null}
              {fieldVisible("demand_category") ? (
                <Field label={requiredLabel("Area principal", fieldRequired("demand_category"))}>
                  <select
                    className="h-11 w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-sm outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                    required={fieldRequired("demand_category")}
                    value={form.demand_category}
                    onChange={(event) => setForm((current) => ({ ...current, demand_category: event.target.value }))}
                  >
                    <option value="">Escolher se quiser</option>
                    {DEMAND_CATEGORY_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {fieldVisible("description") ? (
                <Field className="md:col-span-2" label={requiredLabel("Detalhes do pedido", fieldRequired("description"))}>
                  <div className="space-y-3">
                    <Textarea
                      required={fieldRequired("description")}
                      rows={5}
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className={`text-xs ${descriptionAiCanRun ? "text-sky-700" : "text-slate-400"}`}>
                        {descriptionAiRemainingUses
                          ? `${descriptionAiRemainingUses} uso(s) de IA restante(s)`
                          : "Limite de IA usado"}
                      </span>
                      <Button
                        className={descriptionAiCanRun ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100" : ""}
                        disabled={!descriptionAiCanRun || descriptionAiBusy}
                        onClick={handleImproveDescription}
                        type="button"
                        variant="secondary"
                      >
                        <Sparkles className="size-4" />
                        {descriptionAiBusy ? "Melhorando..." : "Melhorar com IA"}
                      </Button>
                    </div>
                  </div>
                </Field>
              ) : null}

              {!anonymousMode && hasAddressFields ? (
                <div className="md:col-span-2 flex justify-start">
                  <Button
                    className="rounded-full"
                    onClick={() => setShowComplementaryFields((current) => !current)}
                    type="button"
                    variant="secondary"
                  >
                    {showPublicAddressFields ? "Ocultar endereço" : "Adicionar endereço"}
                  </Button>
                </div>
              ) : null}

              {showPublicAddressFields ? (
                <>
                  {hasAddressFields && fieldVisible("zip_code") ? (
                    <Field hint={cepBusy ? "Buscando endereco..." : undefined} label={requiredLabel("CEP", fieldRequired("zip_code"))}>
                      <Input
                        required={fieldRequired("zip_code")}
                        value={form.zip_code}
                        onBlur={handleCepLookup}
                        onChange={(event) => {
                          const zipCode = formatCepInput(event.target.value);
                          setCepFeedback("");
                          if (!onlyDigits(zipCode)) {
                            lastCepLookupRef.current = "";
                            setForm((current) => ({
                              ...current,
                              zip_code: "",
                              address: "",
                              number: "",
                              complement: "",
                              neighborhood: "",
                              city: "",
                              uf: "",
                            }));
                            return;
                          }
                          setForm((current) => ({
                            ...current,
                            zip_code: zipCode,
                          }));
                        }}
                      />
                    </Field>
                  ) : null}
                  {hasAddressFields && showAddressDetails && fieldVisible("neighborhood") ? (
                    <Field label={requiredLabel("Bairro", fieldRequired("neighborhood"))}>
                      <Input
                        required={fieldRequired("neighborhood")}
                        value={form.neighborhood}
                        onChange={(event) => setForm((current) => ({ ...current, neighborhood: event.target.value }))}
                      />
                    </Field>
                  ) : null}
                  {hasAddressFields && showAddressDetails && fieldVisible("address") ? (
                    <Field className="md:col-span-2" label={requiredLabel("Endereco", fieldRequired("address"))}>
                      <Input
                        required={fieldRequired("address")}
                        value={form.address}
                        onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                      />
                    </Field>
                  ) : null}
                  {hasAddressFields && showAddressDetails && fieldVisible("number") ? (
                    <Field label={requiredLabel("Numero", fieldRequired("number"))}>
                      <Input
                        required={fieldRequired("number")}
                        value={form.number}
                        onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))}
                      />
                    </Field>
                  ) : null}
                  {hasAddressFields && showAddressDetails && fieldVisible("complement") ? (
                    <Field label={requiredLabel("Complemento", fieldRequired("complement"))}>
                      <Input
                        required={fieldRequired("complement")}
                        value={form.complement}
                        onChange={(event) => setForm((current) => ({ ...current, complement: event.target.value }))}
                      />
                    </Field>
                  ) : null}
                  {hasAddressFields && showAddressDetails && fieldVisible("city") ? (
                    <Field label={requiredLabel("Cidade", fieldRequired("city"))}>
                      <Input
                        required={fieldRequired("city")}
                        value={form.city}
                        onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                      />
                    </Field>
                  ) : null}
                  {hasAddressFields && showAddressDetails && fieldVisible("uf") ? (
                    <Field label={requiredLabel("UF", fieldRequired("uf"))}>
                      <Input
                        required={fieldRequired("uf")}
                        value={form.uf}
                        onChange={(event) => setForm((current) => ({ ...current, uf: event.target.value }))}
                      />
                    </Field>
                  ) : null}
                  {cepFeedback ? (
                    <div className="md:col-span-2 rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                      {cepFeedback}
                    </div>
                  ) : null}
                </>
              ) : null}

              {!anonymousMode && fieldVisible("attachment") ? (
                <Field className="md:col-span-2" hint="Opcional. PDF, JPG, PNG ou WEBP com ate 10 MB." label={requiredLabel("Anexo", fieldRequired("attachment"))}>
                  <div className="space-y-3">
                    <Input
                      key={fileInputKey}
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(event) => handleAttachmentChange(event.target.files?.[0] || null)}
                      required={fieldRequired("attachment")}
                      type="file"
                    />
                    <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
                      {attachment ? (
                        <span>
                          <strong className="text-slate-900">{attachment.name}</strong> · {(attachment.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                      ) : (
                        "Anexe 1 arquivo para ajudar no atendimento. O limite total desta etapa e de 10 MB."
                      )}
                    </div>
                  </div>
                </Field>
              ) : null}
              {fieldVisible("notes") ? (
                <Field className="md:col-span-2" label={requiredLabel("Observacoes finais", fieldRequired("notes"))}>
                  <Textarea
                    required={fieldRequired("notes")}
                    rows={4}
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </Field>
              ) : null}

              {anonymousMode && publicConfig.confirmation_channel !== "none" ? (
                <div className="md:col-span-2 rounded-[20px] border border-sky-200 bg-sky-50/75 px-4 py-3 text-sm leading-6 text-sky-900">
                  No envio anonimo, a confirmacao automatica nao vai para WhatsApp. O protocolo aparece na tela ao final.
                </div>
              ) : null}

              {feedback ? (
                <div className="md:col-span-2 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                  {feedback}
                </div>
              ) : null}

              {tracking ? (
                <div className="md:col-span-2 rounded-[28px] border border-emerald-200 bg-emerald-50/75 p-5 text-slate-800">
                  <div className="flex items-start gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-emerald-700">
                      <ShieldCheck className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-950">Acompanhamento liberado</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Use estes dados para consultar o andamento publico da sua solicitacao.
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-[20px] bg-white/82 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Protocolo</p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">{tracking.code}</p>
                        </div>
                        <div className="rounded-[20px] bg-white/82 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Codigo de acesso</p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">{tracking.access_code}</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-[20px] bg-white/82 px-4 py-3 text-sm text-slate-600">
                        <p className="break-all">{tracking.url}</p>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button onClick={() => copyTrackingText(tracking.url, "Link")} type="button" variant="secondary">
                          <Copy className="size-4" />
                          Copiar link
                        </Button>
                        <Button
                          onClick={() =>
                            copyTrackingText(
                              `Protocolo: ${tracking.code}\nCodigo de acesso: ${tracking.access_code}\n${tracking.url}`,
                              "Dados de acompanhamento",
                            )
                          }
                          type="button"
                          variant="secondary"
                        >
                          <Copy className="size-4" />
                          Copiar tudo
                        </Button>
                        <Button asChild type="button" variant="secondary">
                          <a href={tracking.url} rel="noreferrer" target="_blank">
                            <ExternalLink className="size-4" />
                            Abrir
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="md:col-span-2 flex justify-end">
                <Button disabled={loading || !gabinete || submitting} size="lg" type="submit">
                  {submitting ? <FileUp className="size-4" /> : <Send className="size-4" />}
                  {submitting ? "Enviando..." : "Enviar minha solicitacao"}
                </Button>
              </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-2 ${className || ""}`}>
      <span className="block text-sm font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <small className="block text-xs leading-5 text-slate-400">{hint}</small> : null}
    </label>
  );
}

function normalizeCardText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

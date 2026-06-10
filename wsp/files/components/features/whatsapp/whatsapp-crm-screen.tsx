"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  ArrowUpRight,
  CheckCheck,
  FileText,
  LogOut,
  MoreVertical,
  Paperclip,
  Phone,
  Power,
  QrCode,
  RefreshCcw,
  Search,
  Send,
  UserRound,
  X,
} from "lucide-react";

import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { AppListSkeleton } from "@/components/workspace/primitives";
import { fetchJson } from "@/lib/api";
import { buildAppPath, formatPhoneDisplay, formatPhoneInput, matchesSearchQuery, onlyDigits } from "@/lib/utils";

const EMPTY_FORM = {
  contact_id: "",
  ticket_id: "",
  template_id: "",
  assigned_user_id: "",
  number: "",
  text: "",
  is_monitored: true,
};

const WHATSAPP_QR_RENEW_INTERVAL_MS = 60_000;
const WHATSAPP_CONNECTOR_STATUS_POLL_MS = 60_000;

function getConversationName(item: any) {
  return item.contact_name || item.remote_name || formatPhoneDisplay(item.remote_phone);
}

function getConversationInitials(item: any) {
  const source = String(item.contact_name || item.remote_name || item.remote_phone || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "");
  return source.join("") || "WA";
}

function formatConversationTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace("T", " ");
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBubbleTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function wallpaperStyle() {
  return {
    backgroundColor: "#efeae2",
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.26) 1px, transparent 1px), radial-gradient(rgba(0,0,0,0.02) 1px, transparent 1px)",
    backgroundPosition: "0 0, 12px 12px",
    backgroundSize: "24px 24px",
  } as const;
}

export function WhatsAppCrmScreen() {
  const searchParams = useSearchParams();
  const { session, showToast } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPhone, setSelectedPhone] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [wideLayout, setWideLayout] = useState(false);
  const [pairingResult, setPairingResult] = useState<any>(null);
  const [qrImageSrc, setQrImageSrc] = useState("");
  const [qrCooldownSeconds, setQrCooldownSeconds] = useState(0);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [quickTicketTitle, setQuickTicketTitle] = useState("Atendimento via WhatsApp");
  const queryAppliedRef = useRef(false);
  const autoConnectAttemptedRef = useRef(false);
  const nextQrAllowedAtRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadWhatsapp = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const payload = await fetchJson("/api/whatsapp?limit=200");
      setData(payload);
    } finally {
      if (!options.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWhatsapp();
  }, [loadWhatsapp, session.gabinete?.id]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const sync = () => setWideLayout(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const source = String(pairingResult?.qr_payload || "").trim();
    if (!source) {
      setQrImageSrc("");
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
        if (!cancelled) setQrImageSrc(value);
      })
      .catch(() => {
        if (!cancelled) setQrImageSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [pairingResult?.qr_payload]);

  useEffect(() => {
    if (data?.connector?.connected) {
      setPairingResult(null);
      setQrImageSrc("");
      nextQrAllowedAtRef.current = 0;
      setQrCooldownSeconds(0);
    }
  }, [data?.connector?.connected]);

  useEffect(() => {
    if (!qrCooldownSeconds) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextQrAllowedAtRef.current - Date.now()) / 1000));
      setQrCooldownSeconds(remaining);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [qrCooldownSeconds]);

  const syncContact = useCallback(
    (contactId: string, source = data?.lookups?.contacts || []) => {
      const contact = source.find((item: any) => String(item.id) === String(contactId));
      if (!contact) return;
      setForm((current: any) => ({
        ...current,
        contact_id: String(contact.id),
        number: formatPhoneInput(contact.whatsapp || contact.phone || current.number || ""),
      }));
    },
    [data?.lookups?.contacts],
  );

  const syncTicket = useCallback(
    (ticketId: string, source = data?.lookups?.tickets || []) => {
      const ticket = source.find((item: any) => String(item.id) === String(ticketId));
      if (!ticket) return;
      setForm((current: any) => ({
        ...current,
        ticket_id: String(ticket.id),
        number: formatPhoneInput(ticket.contact_whatsapp || ticket.contact_phone || current.number || ""),
      }));
    },
    [data?.lookups?.tickets],
  );

  const syncTemplate = useCallback(
    (templateId: string, source = data?.lookups?.templates || []) => {
      const template = source.find((item: any) => String(item.id) === String(templateId));
      if (!template) return;
      setForm((current: any) => ({
        ...current,
        template_id: String(template.id),
        text: template.body || current.text,
      }));
    },
    [data?.lookups?.templates],
  );

  const conversations = useMemo(() => {
    const map = new Map<string, any>();

    (data?.threads || []).forEach((thread: any) => {
      const key = onlyDigits(thread.remote_phone);
      if (!key) return;
      map.set(key, {
        ...thread,
        remote_phone: key,
        message_count: 0,
        remote_name: thread.remote_name || "",
        last_message_text: thread.last_message_text || "",
        last_message_direction: "",
        last_message_at: thread.last_message_at || "",
        is_monitored: Boolean(thread.is_monitored),
        unread_count: Number(thread.unread_count || 0),
      });
    });

    (data?.recent_messages || []).forEach((message: any) => {
      const key = onlyDigits(message.remote_phone);
      if (!key) return;
      const current = map.get(key) || {
        id: null,
        remote_phone: key,
        contact_id: message.contact_id || "",
        ticket_id: message.ticket_id || "",
        assigned_user_id: "",
        assigned_user_name: "",
        contact_name: message.contact_name || "",
        remote_name: message.remote_name || "",
        ticket_number: message.ticket_number || "",
        ticket_title: "",
        is_monitored: false,
        unread_count: 0,
        message_count: 0,
        last_message_text: "",
        last_message_direction: "",
        last_message_at: "",
        created_at: message.created_at || "",
        updated_at: message.updated_at || message.created_at || "",
      };
      const currentLast = String(current.last_message_at || "");
      const nextLast = String(message.created_at || "");
      const isNewer = !currentLast || nextLast >= currentLast;
      map.set(key, {
        ...current,
        remote_phone: key,
        contact_id: current.contact_id || message.contact_id || "",
        ticket_id: current.ticket_id || message.ticket_id || "",
        contact_name: current.contact_name || message.contact_name || "",
        remote_name: current.remote_name || message.remote_name || "",
        ticket_number: current.ticket_number || message.ticket_number || "",
        message_count: Number(current.message_count || 0) + 1,
        last_message_text: isNewer ? message.message_text || "" : current.last_message_text,
        last_message_direction: isNewer ? message.direction || "" : current.last_message_direction,
        last_message_at: isNewer ? nextLast : currentLast,
        updated_at: isNewer ? nextLast : current.updated_at,
      });
    });

    return Array.from(map.values())
      .filter((item) =>
        matchesSearchQuery(
          {
            text: [
              item.contact_name,
              item.ticket_number,
              item.ticket_title,
              item.last_message_text,
              item.assigned_user_name,
            ],
            digits: [item.remote_phone],
          },
          query,
        ),
      )
      .sort((left, right) => String(right.last_message_at || right.updated_at || "").localeCompare(String(left.last_message_at || left.updated_at || "")));
  }, [data?.recent_messages, data?.threads, query]);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.remote_phone === selectedPhone) || null,
    [conversations, selectedPhone],
  );

  const selectedMessages = useMemo(
    () =>
      [...(data?.recent_messages || [])]
        .filter((item: any) => onlyDigits(item.remote_phone) === selectedPhone)
        .sort((left: any, right: any) => String(left.created_at || "").localeCompare(String(right.created_at || ""))),
    [data?.recent_messages, selectedPhone],
  );

  const selectedContact = useMemo(
    () =>
      (data?.lookups?.contacts || []).find((item: any) => String(item.id) === String(form.contact_id || selectedConversation?.contact_id || "")) || null,
    [data?.lookups?.contacts, form.contact_id, selectedConversation?.contact_id],
  );

  const selectedTicket = useMemo(
    () =>
      (data?.lookups?.tickets || []).find((item: any) => String(item.id) === String(form.ticket_id || selectedConversation?.ticket_id || "")) || null,
    [data?.lookups?.tickets, form.ticket_id, selectedConversation?.ticket_id],
  );

  useEffect(() => {
    if (!conversations.length) {
      setSelectedPhone("");
      return;
    }
    if (!selectedPhone || !conversations.some((item) => item.remote_phone === selectedPhone)) {
      setSelectedPhone(conversations[0].remote_phone);
    }
  }, [conversations, selectedPhone]);

  useEffect(() => {
    if (!selectedConversation) return;
    setForm((current: any) => ({
      ...current,
      contact_id: selectedConversation.contact_id ? String(selectedConversation.contact_id) : "",
      ticket_id: selectedConversation.ticket_id ? String(selectedConversation.ticket_id) : "",
      assigned_user_id: selectedConversation.assigned_user_id ? String(selectedConversation.assigned_user_id) : "",
      number: formatPhoneInput(selectedConversation.remote_phone || ""),
      is_monitored: Boolean(selectedConversation.is_monitored),
    }));
    setQuickTicketTitle(selectedConversation.ticket_title || "Atendimento via WhatsApp");
  }, [selectedConversation]);

  useEffect(() => {
    if (!selectedPhone || selectedConversation) return;
    setForm((current: any) => ({
      ...current,
      number: formatPhoneInput(selectedPhone),
      contact_id: "",
      ticket_id: "",
      assigned_user_id: "",
      is_monitored: true,
    }));
    setQuickTicketTitle("Atendimento via WhatsApp");
  }, [selectedConversation, selectedPhone]);

  useEffect(() => {
    if (!selectedConversation?.remote_phone || !selectedConversation.unread_count) return;
    fetchJson("/api/whatsapp/threads/read", {
      method: "POST",
      body: JSON.stringify({ number: selectedConversation.remote_phone }),
    })
      .then(() => {
        setData((current: any) =>
          current
            ? {
                ...current,
                threads: (current.threads || []).map((thread: any) =>
                  onlyDigits(thread.remote_phone) === selectedConversation.remote_phone
                    ? { ...thread, unread_count: 0 }
                    : thread,
                ),
              }
            : current,
        );
      })
      .catch(() => {});
  }, [selectedConversation?.remote_phone, selectedConversation?.unread_count]);

  useEffect(() => {
    if (!data || queryAppliedRef.current) return;
    const ticketId = searchParams.get("ticket_id");
    const contactId = searchParams.get("contact_id");
    const templateId = searchParams.get("template_id");

    if (ticketId) {
      syncTicket(ticketId, data.lookups?.tickets || []);
    } else if (contactId) {
      syncContact(contactId, data.lookups?.contacts || []);
    }
    if (templateId) {
      syncTemplate(templateId, data.lookups?.templates || []);
    }
    queryAppliedRef.current = true;
  }, [data, searchParams, syncContact, syncTemplate, syncTicket]);

  async function handleSaveConversation() {
    setBusy("save");
    try {
      const payload = await fetchJson("/api/whatsapp/threads", {
        method: "POST",
        body: JSON.stringify({
          number: form.number,
          contact_id: form.contact_id,
          ticket_id: form.ticket_id,
          assigned_user_id: form.assigned_user_id,
          is_monitored: form.is_monitored,
        }),
      });
      showToast("success", "Atendimento atualizado.");
      await loadWhatsapp();
      setSelectedPhone(onlyDigits(payload.thread?.remote_phone || form.number));
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleToggleMonitoring() {
    const number = onlyDigits(form.number || selectedConversation?.remote_phone || selectedPhone || "");
    if (!number) {
      showToast("error", "Escolha uma conversa primeiro.");
      return;
    }
    const nextMonitored = !form.is_monitored;
    setBusy("monitor");
    try {
      const payload = await fetchJson("/api/whatsapp/threads", {
        method: "POST",
        body: JSON.stringify({
          number,
          contact_id: form.contact_id,
          ticket_id: form.ticket_id,
          assigned_user_id: form.assigned_user_id,
          is_monitored: nextMonitored,
        }),
      });
      setForm((current: any) => ({ ...current, is_monitored: nextMonitored }));
      await loadWhatsapp();
      setSelectedPhone(onlyDigits(payload.thread?.remote_phone || number));
      showToast("success", nextMonitored ? "Conversa em acompanhamento." : "Monitoria removida.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCreateTicketFromConversation() {
    const number = onlyDigits(form.number || selectedConversation?.remote_phone || selectedPhone || "");
    if (!number) {
      showToast("error", "Escolha uma conversa primeiro.");
      return;
    }
    setBusy("create-ticket");
    try {
      const payload = await fetchJson("/api/whatsapp/threads/ticket", {
        method: "POST",
        body: JSON.stringify({
          number,
          contact_id: form.contact_id,
          assigned_user_id: form.assigned_user_id,
          remote_name: selectedConversation?.remote_name || selectedConversation?.contact_name || "",
          title: quickTicketTitle,
        }),
      });
      setForm((current: any) => ({
        ...current,
        ticket_id: String(payload.ticket?.id || ""),
        contact_id: String(payload.ticket?.contact_id || current.contact_id || ""),
        assigned_user_id: String(payload.ticket?.assigned_user_id || current.assigned_user_id || ""),
        is_monitored: true,
      }));
      await loadWhatsapp();
      setSelectedPhone(number);
      showToast("success", "Atendimento criado e vinculado.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  function handleStartConversation(number: string) {
    const normalized = onlyDigits(number);
    if (!normalized) return;
    setSelectedPhone(normalized);
    setForm((current: any) => ({
      ...current,
      number: formatPhoneInput(normalized),
      contact_id: "",
      ticket_id: "",
      assigned_user_id: "",
      is_monitored: true,
    }));
    setQuery("");
  }

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("send");
    try {
      if (!String(form.text || "").trim() && !attachment) {
        showToast("error", "Digite uma mensagem ou escolha um arquivo.");
        setBusy("");
        return;
      }
      const body = attachment ? new FormData() : null;
      const fields = {
        contact_id: form.contact_id,
        ticket_id: form.ticket_id,
        template_id: form.template_id,
        assigned_user_id: form.assigned_user_id,
        monitor_conversation: form.is_monitored ? "1" : "0",
        number: form.number,
        text: form.text,
      };
      if (body) {
        Object.entries(fields).forEach(([key, value]) => body.append(key, String(value || "")));
        body.append("attachment", attachment);
      }
      const payload = await fetchJson("/api/whatsapp/send", {
        method: "POST",
        body: body || JSON.stringify(fields),
      });
      if (payload.mode === "wa_me" && payload.url) {
        window.open(payload.url, "_blank", "noopener,noreferrer");
        showToast("success", "Abrindo o WhatsApp Web para concluir o envio.");
      } else {
        showToast("success", "Mensagem enviada.");
      }
      setForm((current: any) => ({
        ...current,
        template_id: "",
        text: "",
      }));
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadWhatsapp();
      setSelectedPhone(onlyDigits(payload.thread?.remote_phone || form.number));
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleConnect(silent = false) {
    const remainingSeconds = Math.max(0, Math.ceil((nextQrAllowedAtRef.current - Date.now()) / 1000));
    if (remainingSeconds > 0) {
      setQrCooldownSeconds(remainingSeconds);
      if (!silent) showToast("error", "Aguarde 1 minuto para gerar outro QR Code.");
      return;
    }
    setBusy("connect");
    try {
      const payload = await fetchJson("/api/whatsapp/connect", {
        method: "POST",
      });
      setPairingResult(payload.connection || null);
      setData((current: any) => ({ ...current, connector: payload.connector }));
      const serverNextAllowedAt = Date.parse(String(payload.qr_next_allowed_at || ""));
      nextQrAllowedAtRef.current = Number.isFinite(serverNextAllowedAt)
        ? Math.max(serverNextAllowedAt, Date.now() + WHATSAPP_QR_RENEW_INTERVAL_MS)
        : Date.now() + WHATSAPP_QR_RENEW_INTERVAL_MS;
      setQrCooldownSeconds(Math.ceil(WHATSAPP_QR_RENEW_INTERVAL_MS / 1000));
      if (!silent) showToast("success", "QR Code gerado para conectar a linha.");
    } catch (error: any) {
      const retryAfterSeconds = Number(error.retryAfterSeconds || error.payload?.retry_after_seconds || 0);
      if (retryAfterSeconds > 0) {
        const serverNextAllowedAt = Date.parse(String(error.payload?.qr_next_allowed_at || ""));
        nextQrAllowedAtRef.current = Number.isFinite(serverNextAllowedAt) ? serverNextAllowedAt : Date.now() + retryAfterSeconds * 1000;
        setQrCooldownSeconds(Math.max(1, retryAfterSeconds));
      }
      if (!silent) showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    autoConnectAttemptedRef.current = false;
  }, [session.gabinete?.id]);

  useEffect(() => {
    const connectorState = data?.connector;
    if (!connectorState || autoConnectAttemptedRef.current || busy) return;
    if (connectorState.connected || connectorState.mode !== "evolution" || connectorState.evolution_enabled === false) return;
    autoConnectAttemptedRef.current = true;
    handleConnect(true).catch(() => {});
  }, [busy, data?.connector, session.gabinete?.id]);

  async function handleRefreshConnector() {
    setBusy("refresh");
    try {
      await loadWhatsapp({ silent: true });
      showToast("success", "Status atualizado.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleDisconnect() {
    setBusy("disconnect");
    try {
      const payload = await fetchJson("/api/whatsapp/disconnect", {
        method: "POST",
      });
      setPairingResult(null);
      setQrImageSrc("");
      setData((current: any) => ({ ...current, connector: payload.connector }));
      showToast("success", "Linha desconectada.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleRestart() {
    setBusy("restart");
    try {
      const payload = await fetchJson("/api/whatsapp/restart", {
        method: "POST",
      });
      setData((current: any) => ({ ...current, connector: payload.connector }));
      showToast("success", "Conexao reiniciada.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCreateContactFromConversation() {
    const number = onlyDigits(form.number || selectedConversation?.remote_phone || "");
    if (!number) {
      showToast("error", "Nao existe numero suficiente para criar o contato.");
      return;
    }
    setBusy("create-contact");
    try {
      const contactPayload = await fetchJson("/api/contacts", {
        method: "POST",
        body: JSON.stringify({
          name: deriveContactName(selectedConversation, number),
          phone: number,
          whatsapp: number,
          segment: "municipe",
        }),
      });
      const createdContact = contactPayload.contact;
      setForm((current: any) => ({
        ...current,
        contact_id: String(createdContact.id),
        number: formatPhoneInput(number),
      }));
      await fetchJson("/api/whatsapp/threads", {
        method: "POST",
        body: JSON.stringify({
          number,
          contact_id: createdContact.id,
          ticket_id: form.ticket_id,
          assigned_user_id: form.assigned_user_id,
          is_monitored: form.is_monitored,
        }),
      });
      await loadWhatsapp();
      setSelectedPhone(number);
      showToast("success", "Contato criado a partir da conversa.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  const connector = data?.connector || {};
  const connectButtonLabel = connector.connected
    ? "Gerar QR Code"
    : connector.instance_found
      ? "Reconectar e gerar QR Code"
      : "Gerar QR Code";
  const connectActionLabel = qrCooldownSeconds > 0 ? "Aguarde 1 min" : connectButtonLabel;
  const showQrPanel = Boolean(data) && (!connector.connected || Boolean(qrImageSrc));

  useEffect(() => {
    if (!showQrPanel || connector.connected || !connector.instance_name) return;
    const timer = window.setInterval(() => {
      loadWhatsapp({ silent: true }).catch(() => {});
    }, WHATSAPP_CONNECTOR_STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [connector.connected, connector.instance_name, loadWhatsapp, showQrPanel]);

  useEffect(() => {
    if (!showQrPanel || connector.connected || busy === "connect") return;
    const timer = window.setInterval(() => {
      handleConnect(true).catch(() => {});
    }, WHATSAPP_QR_RENEW_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [busy, connector.connected, session.gabinete?.id, showQrPanel]);

  if (loading || !data) {
    return <AppListSkeleton rows={10} />;
  }

  const queryDigits = onlyDigits(query);
  const canStartConversation =
    queryDigits.length >= 10 && !conversations.some((item) => item.remote_phone === queryDigits);
  const activePhone = onlyDigits(form.number || selectedConversation?.remote_phone || selectedPhone || "");
  const activeConversationName = selectedConversation
    ? getConversationName(selectedConversation)
    : selectedPhone
      ? formatPhoneDisplay(selectedPhone)
      : "Escolha uma conversa";
  const activeConversationSubtitle = selectedConversation
    ? `${formatPhoneDisplay(selectedConversation.remote_phone)}${selectedConversation.assigned_user_name ? ` · ${selectedConversation.assigned_user_name}` : ""}`
    : selectedPhone
      ? "Nova conversa"
      : "Selecione uma conversa do lado.";

  if (showQrPanel) {
    return (
      <WhatsAppPairingScreen
        busy={busy}
        connectButtonLabel={connectActionLabel}
        connectDisabled={qrCooldownSeconds > 0}
        onConnect={() => handleConnect()}
        qrImageSrc={qrImageSrc}
      />
    );
  }

  return (
    <div className="space-y-0">
      <div className="overflow-hidden rounded-[18px] border border-[#d1d7db] bg-[#e9edef] shadow-[0_24px_70px_-50px_rgba(15,23,42,0.28)]">
        <div className={`grid min-h-[780px] ${detailsOpen ? "xl:grid-cols-[390px_minmax(0,1fr)_360px]" : "xl:grid-cols-[410px_minmax(0,1fr)]"}`}>
          <aside className="border-b border-slate-200 bg-white xl:border-b-0 xl:border-r">
            <div className="border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-[#dfe5e7] text-sm font-semibold text-[#54656f]">
                    {(session.user?.name || "G").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong className="block text-sm text-[#111b21]">WhatsApp</strong>
                    <p className="text-xs text-[#667781]">
                      {connector.connected ? "Conectado" : "Aguardando conexão"}
                      {conversations.length ? ` · ${conversations.length} conversa${conversations.length === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[#54656f]">
                  <HeaderIconButton
                    disabled={busy === "connect" || qrCooldownSeconds > 0}
                    onClick={() => handleConnect()}
                    title={connectActionLabel}
                  >
                    <QrCode className="size-4" />
                  </HeaderIconButton>
                  <HeaderIconButton
                    disabled={busy === "refresh"}
                    onClick={handleRefreshConnector}
                    title="Atualizar"
                  >
                    <RefreshCcw className="size-4" />
                  </HeaderIconButton>
                  <HeaderIconButton
                    disabled={busy === "disconnect" || !connector.instance_name}
                    onClick={handleDisconnect}
                    title="Desconectar"
                  >
                    <LogOut className="size-4" />
                  </HeaderIconButton>
                  <HeaderIconButton
                    disabled={busy === "restart" || !connector.instance_name}
                    onClick={handleRestart}
                    title="Reconectar"
                  >
                    <Power className="size-4" />
                  </HeaderIconButton>
                </div>
              </div>
            </div>
            <div className="border-b border-[#eef1f3] bg-white px-3 py-2.5">
              <div className="flex items-center gap-3 rounded-lg bg-[#f0f2f5] px-3 py-2.5">
                <Search className="size-4 text-[#54656f]" />
                <input
                  className="w-full bg-transparent text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Pesquisar ou começar uma nova conversa"
                  value={query}
                />
              </div>
            </div>

            <div className="max-h-[698px] overflow-y-auto bg-white">
              {canStartConversation ? (
                <button
                  className="w-full border-b border-[#f0f2f5] bg-white px-3 py-3 text-left transition hover:bg-[#f5f6f6]"
                  onClick={() => handleStartConversation(queryDigits)}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid size-12 place-items-center rounded-full bg-[#d9fdd3] text-sm font-semibold text-[#0a6c56]">
                      +
                    </div>
                    <div>
                      <strong className="block text-sm font-medium text-[#111b21]">Conversar com {formatPhoneDisplay(queryDigits)}</strong>
                      <span className="text-xs text-[#667781]">Criar conversa com este número</span>
                    </div>
                  </div>
                </button>
              ) : null}
              {conversations.length ? (
                conversations.map((item) => {
                  const active = item.remote_phone === selectedPhone;
                  return (
                    <button
                      className={`w-full border-b border-[#f0f2f5] px-3 py-3 text-left transition ${
                        active ? "bg-[#f0f2f5]" : "bg-white hover:bg-[#f5f6f6]"
                      }`}
                      key={item.remote_phone}
                      onClick={() => setSelectedPhone(item.remote_phone)}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-sm font-semibold text-[#54656f]">
                          {getConversationInitials(item)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <strong className="truncate text-sm font-medium text-[#111b21]">{getConversationName(item)}</strong>
                            <span className="shrink-0 text-[11px] text-[#667781]">
                              {formatConversationTime(item.last_message_at || item.updated_at || "")}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-[#667781]">
                            {item.is_monitored ? <span className="rounded-full bg-[#d9fdd3] px-2 py-0.5 text-[#0a6c56]">acompanhando</span> : null}
                            {item.ticket_number ? <span>{item.ticket_number}</span> : null}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm text-[#667781]">
                              {item.last_message_text || formatPhoneDisplay(item.remote_phone)}
                            </p>
                            {item.unread_count ? (
                              <span className="grid min-w-5 place-items-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-white">
                                {item.unread_count}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-6">
                  <div className="rounded-2xl bg-[#f7f8f8] px-4 py-10 text-center text-sm leading-6 text-[#667781]">
                    Nenhuma conversa ainda.
                  </div>
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-h-[760px] flex-col">
            <div className="border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-sm font-semibold text-[#54656f]">
                    {selectedConversation ? getConversationInitials(selectedConversation) : selectedPhone ? "WA" : "WA"}
                  </div>
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-[#111b21]">{activeConversationName}</strong>
                    <p className="truncate text-xs text-[#667781]">{activeConversationSubtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[#54656f]">
                  {activePhone ? (
                    <button
                      className={`hidden rounded-full px-3 py-2 text-xs font-semibold transition sm:inline-flex ${
                        form.is_monitored
                          ? "bg-[#d9fdd3] text-[#0a6c56] hover:bg-[#c7f6c0]"
                          : "bg-white text-[#54656f] hover:bg-[#e9edef]"
                      }`}
                      disabled={busy === "monitor"}
                      onClick={handleToggleMonitoring}
                      type="button"
                    >
                      {form.is_monitored ? "Monitorando" : "Monitorar"}
                    </button>
                  ) : null}
                  <HeaderIconButton disabled={!activePhone} onClick={() => setDetailsOpen(true)} title="Dados da conversa">
                    <UserRound className="size-4" />
                  </HeaderIconButton>
                  {selectedTicket ? (
                    <HeaderIconButton asChild title="Abrir atendimento">
                      <Link href={buildAppPath("/atendimentos", { focus: selectedTicket.id })}>
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </HeaderIconButton>
                  ) : null}
                  <HeaderIconButton title="Mais ações">
                    <MoreVertical className="size-4" />
                  </HeaderIconButton>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6" style={wallpaperStyle()}>
              {showQrPanel ? (
                <div className="flex min-h-[520px] items-center justify-center">
                  <div className="w-full max-w-[420px] rounded-[18px] border border-[#d1d7db] bg-white px-6 py-7 text-center shadow-[0_18px_40px_-28px_rgba(15,23,42,0.18)]">
                    <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#d9fdd3] text-[#0a6c56]">
                      <QrCode className="size-6" />
                    </div>
                    <h2 className="mt-4 text-xl font-semibold text-[#111b21]">Use o WhatsApp no computador</h2>
                    <p className="mt-2 text-sm leading-6 text-[#667781]">
                      Abra o WhatsApp no celular, entre em aparelhos conectados e leia o QR Code.
                    </p>
                    <div className="mt-5 flex min-h-[300px] items-center justify-center rounded-[16px] border border-dashed border-[#d1d7db] bg-[#f8f9fa] p-4">
                      {qrImageSrc ? (
                        <img alt="QR Code do WhatsApp do gabinete" className="h-auto w-full max-w-[260px]" src={qrImageSrc} />
                      ) : (
                        <div className="text-sm leading-6 text-[#667781]">
                          Toque em <strong className="text-[#111b21]">{connectActionLabel}</strong> para gerar o QR Code.
                        </div>
                      )}
                    </div>
                    {pairingResult?.pairing_code ? (
                      <div className="mt-4 rounded-[16px] bg-[#111b21] px-4 py-4 text-center text-white">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">Codigo de pareamento</p>
                        <strong className="mt-2 block text-2xl tracking-[0.18em]">{pairingResult.pairing_code}</strong>
                      </div>
                    ) : null}
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <Button className="h-10 rounded-full bg-[#00a884] px-4 text-sm text-white shadow-none hover:bg-[#008f72]" disabled={busy === "connect" || qrCooldownSeconds > 0} onClick={() => handleConnect()} type="button">
                        <QrCode className="size-4" />
                        {busy === "connect" ? "Gerando..." : connectActionLabel}
                      </Button>
                      <Button className="h-10 rounded-full px-4 text-sm" disabled={busy === "refresh"} onClick={handleRefreshConnector} type="button" variant="secondary">
                        <RefreshCcw className="size-4" />
                        Atualizar
                      </Button>
                      <Button className="h-10 rounded-full px-4 text-sm" disabled={busy === "restart" || !connector.instance_name} onClick={handleRestart} type="button" variant="secondary">
                        <Power className="size-4" />
                        Reconectar
                      </Button>
                      <Button className="h-10 rounded-full px-4 text-sm" disabled={busy === "disconnect" || !connector.instance_name} onClick={handleDisconnect} type="button" variant="secondary">
                        <LogOut className="size-4" />
                        Desconectar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : selectedPhone ? (
                selectedMessages.length ? (
                  <div className="space-y-3">
                    {selectedMessages.map((item: any) => {
                      const outbound = item.direction === "outbound";
                      return (
                        <div className={`flex ${outbound ? "justify-end" : "justify-start"}`} key={item.id}>
                          <div
                            className={`max-w-[82%] rounded-[10px] px-3.5 py-2.5 shadow-[0_1px_0_rgba(11,20,26,0.08)] md:max-w-[72%] ${
                              outbound ? "bg-[#d9fdd3] text-[#111b21]" : "bg-white text-[#111b21]"
                            }`}
                          >
                            {item.message_type && item.message_type !== "text" ? (
                              <div className="mb-2 flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-sm font-medium">
                                <Paperclip className="size-4" />
                                {item.message_type === "image" ? "Imagem" : item.message_type === "audio" ? "Audio" : "Arquivo"}
                              </div>
                            ) : null}
                            <p className="text-[14px] leading-6">{item.message_text}</p>
                            <div className="mt-1.5 flex items-center justify-end gap-1 text-[11px] text-[#667781]">
                              <span>{formatBubbleTime(item.created_at)}</span>
                              {outbound ? <CheckCheck className="size-3.5 text-[#53bdeb]" /> : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[360px] items-center justify-center">
                    <div className="rounded-[16px] bg-white/75 px-6 py-5 text-center text-sm leading-6 text-[#667781] shadow-[0_8px_24px_-20px_rgba(15,23,42,0.18)]">
                      Escreva a primeira mensagem para iniciar esta conversa.
                    </div>
                  </div>
                )
              ) : (
                <div className="flex h-full min-h-[360px] items-center justify-center">
                  <div className="rounded-[16px] bg-white/75 px-6 py-5 text-center text-sm leading-6 text-[#667781] shadow-[0_8px_24px_-20px_rgba(15,23,42,0.18)]">
                    Escolha uma conversa para começar.
                  </div>
                </div>
              )}
            </div>

            {!showQrPanel ? (
            <form className="border-t border-[#d1d7db] bg-[#f0f2f5] p-3" onSubmit={handleSend}>
              {attachment ? (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm text-[#54656f]">
                  <div className="flex min-w-0 items-center gap-2">
                    <Paperclip className="size-4 shrink-0" />
                    <span className="truncate">{attachment.name}</span>
                  </div>
                  <button
                    className="grid size-7 place-items-center rounded-full hover:bg-[#f0f2f5]"
                    onClick={() => {
                      setAttachment(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : null}

              <div className="flex items-end gap-3">
                <input
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(event) => setAttachment(event.target.files?.[0] || null)}
                  ref={fileInputRef}
                  type="file"
                />
                <Button
                  className="size-12 rounded-full bg-transparent p-0 text-[#54656f] shadow-none hover:bg-[#e9edef]"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  variant="ghost"
                >
                  <Paperclip className="size-5" />
                </Button>
                <Textarea
                  className="min-h-[56px] rounded-[12px] border-[#d1d7db] bg-white"
                  onChange={(event) => setForm((current: any) => ({ ...current, text: event.target.value }))}
                  placeholder="Digite uma mensagem"
                  rows={2}
                  value={form.text}
                />
                <Button
                  className="size-12 rounded-full bg-[#00a884] p-0 text-white shadow-none hover:bg-[#008f72]"
                  disabled={busy === "send" || !activePhone}
                  type="submit"
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </form>
            ) : null}
          </section>

          {detailsOpen ? (
            <aside className="hidden min-h-[760px] flex-col border-l border-[#d1d7db] bg-white xl:flex">
              <div className="flex items-center justify-between border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
                <div>
                  <strong className="block text-sm text-[#111b21]">Dados da conversa</strong>
                  <span className="text-xs text-[#667781]">{activePhone ? formatPhoneDisplay(activePhone) : "Sem conversa selecionada"}</span>
                </div>
                <button
                  className="grid size-9 place-items-center rounded-full text-[#54656f] hover:bg-[#e9edef]"
                  onClick={() => setDetailsOpen(false)}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <div className="rounded-[18px] bg-[#f7f8f8] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#667781]">Contato</p>
                  <strong className="mt-2 block text-sm text-[#111b21]">
                    {selectedContact?.name || selectedConversation?.contact_name || activeConversationName}
                  </strong>
                  {activePhone ? <p className="mt-1 text-sm text-[#667781]">{formatPhoneDisplay(activePhone)}</p> : null}
                  {!selectedContact && activePhone ? (
                    <Button
                      className="mt-3 h-9 rounded-full px-3 text-xs"
                      disabled={busy === "create-contact"}
                      onClick={handleCreateContactFromConversation}
                      type="button"
                      variant="secondary"
                    >
                      <UserRound className="size-3.5" />
                      {busy === "create-contact" ? "Criando..." : "Criar contato"}
                    </Button>
                  ) : null}
                </div>

                <label className="space-y-2">
                  <span className="block text-sm font-medium text-[#54656f]">Responsável</span>
                  <select
                    className="h-11 w-full rounded-xl border border-[#d1d7db] bg-white px-3 text-sm outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#d9fdd3]"
                    onChange={(event) => setForm((current: any) => ({ ...current, assigned_user_id: event.target.value }))}
                    value={form.assigned_user_id}
                  >
                    <option value="">Escolher depois</option>
                    {(data.lookups?.users || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="block text-sm font-medium text-[#54656f]">Atendimento</span>
                  <select
                    className="h-11 w-full rounded-xl border border-[#d1d7db] bg-white px-3 text-sm outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#d9fdd3]"
                    onChange={(event) => syncTicket(event.target.value)}
                    value={form.ticket_id}
                  >
                    <option value="">Selecionar atendimento</option>
                    {(data.lookups?.tickets || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.number} · {item.demand_title}
                      </option>
                    ))}
                  </select>
                </label>

                {!selectedTicket ? (
                  <div className="rounded-[18px] border border-[#d9fdd3] bg-[#f7fff7] p-4">
                    <p className="text-sm font-semibold text-[#111b21]">Criar atendimento</p>
                    <Input
                      className="mt-3"
                      onChange={(event) => setQuickTicketTitle(event.target.value)}
                      placeholder="Ex.: Pedido de poda de arvore"
                      value={quickTicketTitle}
                    />
                    <Button
                      className="mt-3 h-10 rounded-full bg-[#00a884] px-4 text-sm text-white shadow-none hover:bg-[#008f72]"
                      disabled={busy === "create-ticket" || !activePhone}
                      onClick={handleCreateTicketFromConversation}
                      type="button"
                    >
                      <FileText className="size-4" />
                      {busy === "create-ticket" ? "Criando..." : "Criar"}
                    </Button>
                  </div>
                ) : (
                  <Button asChild className="h-10 rounded-full px-4 text-sm" type="button" variant="secondary">
                    <Link href={buildAppPath("/atendimentos", { focus: selectedTicket.id })}>
                      <FileText className="size-4" />
                      Abrir atendimento
                    </Link>
                  </Button>
                )}

                <div className="rounded-[18px] bg-[#f7f8f8] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#667781]">Monitoria</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className={`h-10 rounded-full px-4 text-sm shadow-none ${
                        form.is_monitored
                          ? "bg-[#d9fdd3] text-[#0a6c56] hover:bg-[#c7f6c0]"
                          : "bg-white text-[#54656f] hover:bg-[#e9edef]"
                      }`}
                      disabled={!activePhone || busy === "monitor"}
                      onClick={handleToggleMonitoring}
                      type="button"
                      variant="secondary"
                    >
                      {form.is_monitored ? "Parar monitoria" : "Monitorar conversa"}
                    </Button>
                    <Button
                      className="h-10 rounded-full px-4 text-sm"
                      disabled={busy === "save" || !activePhone}
                      onClick={handleSaveConversation}
                      type="button"
                      variant="secondary"
                    >
                      {busy === "save" ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      <Sheet onOpenChange={setDetailsOpen} open={detailsOpen && !wideLayout}>
        <SheetContent className="w-[min(520px,calc(100vw-2rem))]">
          <SheetHeader>
            <Badge variant="info" className="w-fit">
              Atendimento
            </Badge>
            <SheetTitle>Detalhes desta conversa</SheetTitle>
            <SheetDescription>
              Escolha quem acompanha, ligue ao contato e ao atendimento quando fizer sentido.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
              <div className="space-y-5">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Contato</p>
                  <strong className="mt-2 block text-base text-slate-950">
                    {selectedContact?.name || selectedConversation?.contact_name || "Sem contato vinculado"}
                  </strong>
                  <p className="mt-1 text-sm text-slate-500">{formatPhoneDisplay(form.number || selectedConversation?.remote_phone || selectedPhone || "")}</p>
                  {!selectedContact && activePhone ? (
                    <div className="mt-3">
                      <Button
                        className="h-9 rounded-full px-3 text-xs"
                        disabled={busy === "create-contact"}
                        onClick={handleCreateContactFromConversation}
                        type="button"
                        variant="secondary"
                      >
                        <UserRound className="size-3.5" />
                        {busy === "create-contact" ? "Criando..." : "Criar contato com nome e numero"}
                      </Button>
                    </div>
                  ) : null}
                  {selectedContact ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild className="h-9 rounded-full px-3 text-xs" type="button" variant="secondary">
                        <Link href={buildAppPath("/contatos", { focus: selectedContact.id })}>
                        <UserRound className="size-3.5" />
                        Abrir contato
                      </Link>
                    </Button>
                    {(selectedContact.phone || selectedContact.whatsapp) ? (
                      <Button asChild className="h-9 rounded-full px-3 text-xs" type="button" variant="ghost">
                        <a href={`tel:${onlyDigits(selectedContact.phone || selectedContact.whatsapp)}`}>
                          <Phone className="size-3.5" />
                          Ligar
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <label className="space-y-2">
                  <span className="block text-sm font-medium text-slate-600">Responsável</span>
                  <select
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#d9fdd3]"
                    onChange={(event) => setForm((current: any) => ({ ...current, assigned_user_id: event.target.value }))}
                    value={form.assigned_user_id}
                  >
                    <option value="">Selecionar responsável</option>
                    {(data.lookups?.users || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="block text-sm font-medium text-slate-600">Atendimento vinculado</span>
                  <select
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#d9fdd3]"
                    onChange={(event) => syncTicket(event.target.value)}
                    value={form.ticket_id}
                  >
                    <option value="">Selecionar atendimento</option>
                    {(data.lookups?.tickets || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                      {item.number} · {item.demand_title}
                      </option>
                    ))}
                  </select>
                </label>

                {!selectedTicket ? (
                  <div className="rounded-[22px] border border-[#d9fdd3] bg-[#f7fff7] p-4">
                    <p className="text-sm font-semibold text-[#111b21]">Criar atendimento desta conversa</p>
                    <p className="mt-1 text-xs leading-5 text-[#667781]">
                      Use quando a conversa virou uma solicitação que precisa acompanhamento.
                    </p>
                    <Input
                      className="mt-3"
                      onChange={(event) => setQuickTicketTitle(event.target.value)}
                      placeholder="Ex.: Pedido de poda de arvore"
                      value={quickTicketTitle}
                    />
                    <Button
                      className="mt-3 h-10 rounded-full bg-[#00a884] px-4 text-sm text-white shadow-none hover:bg-[#008f72]"
                      disabled={busy === "create-ticket" || !activePhone}
                      onClick={handleCreateTicketFromConversation}
                      type="button"
                    >
                      <FileText className="size-4" />
                      {busy === "create-ticket" ? "Criando..." : "Criar atendimento"}
                    </Button>
                  </div>
                ) : null}

                <label className="space-y-2">
                  <span className="block text-sm font-medium text-slate-600">Contato da base</span>
                  <select
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-[#00a884] focus:ring-4 focus:ring-[#d9fdd3]"
                    onChange={(event) => syncContact(event.target.value)}
                    value={form.contact_id}
                  >
                    <option value="">Selecionar contato</option>
                    {(data.lookups?.contacts || []).map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Acompanhamento</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className={`h-10 rounded-full px-4 text-sm shadow-none ${
                      form.is_monitored
                        ? "bg-[#d9fdd3] text-[#0a6c56] hover:bg-[#c7f6c0]"
                        : "bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                    onClick={() => setForm((current: any) => ({ ...current, is_monitored: !current.is_monitored }))}
                    type="button"
                    variant="secondary"
                  >
                    {form.is_monitored ? "Acompanhando" : "Parar de acompanhar"}
                  </Button>
                  <Button
                    className="h-10 rounded-full px-4 text-sm"
                    disabled={busy === "save"}
                    onClick={handleSaveConversation}
                    type="button"
                    variant="secondary"
                  >
                    {busy === "save" ? "Salvando..." : "Salvar atendimento"}
                  </Button>
                </div>
              </div>

              {selectedTicket ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Caso</p>
                  <strong className="mt-2 block text-sm text-slate-950">{selectedTicket.number}</strong>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{selectedTicket.demand_title}</p>
                  <div className="mt-3">
                    <Button asChild className="h-9 rounded-full px-3 text-xs" type="button" variant="ghost">
                      <Link href={buildAppPath("/atendimentos", { focus: selectedTicket.id })}>
                        <FileText className="size-3.5" />
                        Ver caso completo
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WhatsAppPairingScreen({
  busy,
  connectButtonLabel,
  connectDisabled,
  onConnect,
  qrImageSrc,
}: {
  busy: string;
  connectButtonLabel: string;
  connectDisabled?: boolean;
  onConnect: () => void;
  qrImageSrc: string;
}) {
  return (
    <div className="min-h-[780px] overflow-hidden rounded-[18px] border border-[#d1d7db] bg-white shadow-[0_24px_70px_-50px_rgba(15,23,42,0.28)]">
      <section className="flex min-h-[780px] items-center justify-center px-6 py-10">
        <div className="w-full max-w-[760px]">
          <h1 className="text-3xl font-light text-[#41525d]">Escaneie para entrar</h1>
          <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,1fr)_260px] md:items-start">
            <ol className="space-y-5 text-base leading-7 text-[#3b4a54]">
              <li>1. Use a camera do seu celular para escanear o QR code.</li>
              <li>2. Toque no link para abrir o WhatsApp.</li>
              <li>3. Escaneie o QR code novamente para acessar sua conta.</li>
            </ol>

            <div className="flex min-h-[260px] items-center justify-center rounded-sm bg-white p-2">
              {qrImageSrc ? (
                <img alt="QR Code do WhatsApp" className="h-auto w-full max-w-[260px]" src={qrImageSrc} />
              ) : (
                <button
                  className="flex size-[260px] flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-[#d1d7db] bg-[#f7f8f8] px-5 text-center text-sm leading-6 text-[#667781]"
                  disabled={busy === "connect" || connectDisabled}
                  onClick={onConnect}
                  type="button"
                >
                  {busy === "connect" ? (
                    <span className="size-8 animate-spin rounded-full border-2 border-[#008069] border-t-transparent" />
                  ) : (
                    <QrCode className="size-9 text-[#008069]" />
                  )}
                  <span>{busy === "connect" ? "Carregando QR Code..." : connectButtonLabel}</span>
                </button>
              )}
            </div>
          </div>
          <p className="mt-8 text-sm leading-6 text-[#667781]">
            O QR Code atualiza sozinho a cada 1 minuto enquanto a linha ainda nao estiver conectada.
          </p>
        </div>
      </section>
    </div>
  );
}

function deriveContactName(conversation: any, number: string) {
  const candidate = String(conversation?.contact_name || "").trim();
  if (candidate) return candidate;
  return `Contato WhatsApp ${formatPhoneDisplay(number)}`;
}

function HeaderIconButton({
  children,
  onClick,
  disabled,
  asChild = false,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  asChild?: boolean;
  title?: string;
}) {
  return (
    <Button
      asChild={asChild}
      className="size-10 rounded-full bg-transparent p-0 text-[#54656f] shadow-none hover:bg-[#e9edef]"
      disabled={disabled}
      onClick={onClick}
      size="icon"
      title={title}
      type="button"
      variant="ghost"
    >
      {asChild ? children : <span className="inline-flex items-center justify-center">{children}</span>}
    </Button>
  );
}

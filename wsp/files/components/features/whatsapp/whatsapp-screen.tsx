"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { LogOut, Power, QrCode, RefreshCcw, Smartphone } from "lucide-react";

import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppListSkeleton } from "@/components/workspace/primitives";
import { SectionCard } from "@/components/workspace/data-ui";
import { fetchJson } from "@/lib/api";
import { formatPhoneDisplay } from "@/lib/utils";

export function WhatsAppScreen() {
  const { session, showToast } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [pairingResult, setPairingResult] = useState<any>(null);
  const [qrImageSrc, setQrImageSrc] = useState("");

  const loadWhatsapp = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchJson("/api/whatsapp");
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWhatsapp();
  }, [loadWhatsapp, session.gabinete?.id]);

  useEffect(() => {
    let cancelled = false;
    const source = String(pairingResult?.qr_payload || "").trim();
    if (!source) {
      setQrImageSrc("");
      return;
    }
    QRCode.toDataURL(source, {
      width: 360,
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

  async function handleConnect() {
    setBusy("connect");
    try {
      const payload = await fetchJson("/api/whatsapp/connect", {
        method: "POST",
      });
      setPairingResult(payload.connection);
      setData((current: any) => ({ ...current, connector: payload.connector }));
      showToast("success", "QR Code gerado para conectar a linha.");
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

  async function handleRefresh() {
    setBusy("refresh");
    try {
      await loadWhatsapp();
      showToast("success", "Status atualizado.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setBusy("");
    }
  }

  if (loading || !data) {
    return <AppListSkeleton rows={8} />;
  }

  const connector = data.connector || {};
  const statusVariant = connector.connected ? "success" : connector.instance_found ? "warning" : "info";
  const statusLabel = connector.connected
    ? "Linha conectada"
    : connector.instance_found
      ? "Aguardando leitura do QR Code"
      : "Pronto para gerar o primeiro QR Code";
  const connectButtonLabel = connector.connected
    ? "Gerar novo QR Code"
    : connector.instance_found
      ? "Reconectar e gerar QR Code"
      : "Gerar QR Code";
  const ownerPhone = connector.owner_jid
    ? formatPhoneDisplay(String(connector.owner_jid).replace("@s.whatsapp.net", ""))
    : "";
  const phoneName = connector.profile_name || "";
  const connectionMeta = connector.connected
    ? [phoneName, ownerPhone].filter(Boolean).join(" · ")
    : connector.instance_found
      ? "Leia o QR Code no celular para concluir a conexao."
      : "Toque em gerar QR Code para iniciar a conexao.";

  return (
    <div className="space-y-8">
      <SectionCard
        title="Conexao da linha"
      >
        <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="space-y-5">
            <div className="rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(247,250,252,0.96))] p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.22)]">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <Badge variant={statusVariant as any}>{statusLabel}</Badge>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-slate-950">Tudo certo para conectar o aparelho</h3>
                    <p className="text-sm leading-6 text-slate-600">{connectionMeta}</p>
                  </div>
                </div>
                <div className="flex size-12 items-center justify-center rounded-[20px] bg-orange-50 text-orange-600">
                  <Smartphone className="size-5" />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button className="h-14 justify-start rounded-[22px] text-left" disabled={busy === "connect"} onClick={handleConnect} type="button">
                <QrCode className="size-4" />
                {busy === "connect" ? "Gerando..." : connectButtonLabel}
              </Button>
              <Button className="h-14 justify-start rounded-[22px] text-left" disabled={busy === "refresh"} onClick={handleRefresh} type="button" variant="secondary">
                <RefreshCcw className="size-4" />
                {busy === "refresh" ? "Atualizando..." : "Atualizar"}
              </Button>
              <Button
                className="h-14 justify-start rounded-[22px] text-left"
                disabled={busy === "disconnect" || !connector.instance_name}
                onClick={handleDisconnect}
                type="button"
                variant="secondary"
              >
                <LogOut className="size-4" />
                {busy === "disconnect" ? "Desconectando..." : "Desconectar"}
              </Button>
              <Button className="h-14 justify-start rounded-[22px] text-left" disabled={busy === "restart" || !connector.instance_name} onClick={handleRestart} type="button" variant="ghost">
                <Power className="size-4" />
                {busy === "restart" ? "Reiniciando..." : "Reiniciar"}
              </Button>
            </div>

            <div className="rounded-[28px] border border-slate-100 bg-slate-50/80 p-5">
              <strong className="block text-sm text-slate-950">Como fazer</strong>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                No celular, abra o WhatsApp, entre em aparelhos conectados e leia o QR Code. Se trocar o aparelho, desconecte antes e gere um novo codigo.
              </p>
            </div>

            <div className="rounded-[28px] border border-orange-100 bg-orange-50/70 p-5">
              <strong className="block text-sm text-slate-950">Conversa e monitoria</strong>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                A parte de conversa, responsavel e acompanhamento da equipe agora fica em <strong className="text-slate-900">WhatsApp</strong>.
              </p>
              <div className="mt-4">
                <Button asChild type="button" variant="secondary">
                  <Link href="/whatsapp-crm">Abrir WhatsApp</Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(240,249,255,0.94))] p-5 shadow-[0_24px_72px_-42px_rgba(15,23,42,0.28)]">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Smartphone className="size-5" />
              </div>
              <div>
                <strong className="block text-slate-950">QR Code do aparelho</strong>
                <p className="text-sm text-slate-500">WhatsApp &gt; Configuracoes &gt; Aparelhos conectados &gt; Conectar aparelho.</p>
              </div>
            </div>
            <div className="mt-5 flex min-h-[360px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white p-5">
              {qrImageSrc ? (
                <img alt="QR Code do WhatsApp do gabinete" className="h-auto w-full max-w-[320px]" src={qrImageSrc} />
              ) : (
                <div className="max-w-sm text-center text-sm leading-6 text-slate-500">
                  O QR Code aparece aqui assim que voce tocar em <strong className="text-slate-900">{connectButtonLabel}</strong>.
                </div>
              )}
            </div>
            {pairingResult?.pairing_code ? (
              <div className="mt-4 rounded-[24px] bg-slate-950 px-4 py-4 text-center text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">Codigo de pareamento</p>
                <strong className="mt-2 block text-2xl tracking-[0.18em]">{pairingResult.pairing_code}</strong>
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

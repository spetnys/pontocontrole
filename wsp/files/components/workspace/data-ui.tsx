"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Mail, Pencil, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricTile({
  title,
  value,
  tone = "sky",
  href,
  density = "regular",
}: {
  title: string;
  value: React.ReactNode;
  tone?: "sky" | "emerald" | "amber" | "rose" | "violet" | "slate" | "teal";
  href?: string;
  density?: "regular" | "compact";
}) {
  const toneClasses = {
    sky: "from-sky-500/18 via-sky-500/6 to-transparent border-sky-200/80 text-sky-700",
    emerald: "from-emerald-500/18 via-emerald-500/6 to-transparent border-emerald-200/80 text-emerald-700",
    amber: "from-amber-500/18 via-amber-500/6 to-transparent border-amber-200/80 text-amber-700",
    rose: "from-rose-500/18 via-rose-500/6 to-transparent border-rose-200/80 text-rose-700",
    violet: "from-violet-500/18 via-violet-500/6 to-transparent border-violet-200/80 text-violet-700",
    slate: "from-slate-500/14 via-slate-500/5 to-transparent border-slate-200/80 text-slate-700",
    teal: "from-teal-500/18 via-teal-500/6 to-transparent border-teal-200/80 text-teal-700",
  };

  const content = (
    <motion.div
      className={cn(
        "ui-metric-tile relative overflow-hidden border bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,251,255,0.88))]",
        density === "compact"
          ? "rounded-[20px] p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)]"
          : "rounded-[28px] p-5 shadow-[0_24px_60px_-34px_rgba(15,23,42,0.24)]",
        toneClasses[tone],
      )}
      whileHover={{ y: density === "compact" ? -2 : -4 }}
    >
      <div className="ui-metric-tile-glow absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.85),transparent_30%)]" />
      <div className={cn("relative z-10 flex items-end justify-between", density === "compact" ? "gap-3" : "gap-4")}>
        <div>
          <p className={cn("font-semibold uppercase text-slate-400", density === "compact" ? "text-[11px] tracking-[0.16em]" : "text-xs tracking-[0.24em]")}>{title}</p>
          <strong className={cn("block font-semibold tracking-tight text-slate-950", density === "compact" ? "mt-2 text-2xl" : "mt-4 text-3xl")}>{value}</strong>
        </div>
        {href ? (
          <div className={cn("ui-metric-tile-arrow grid place-items-center bg-white/80 text-slate-500", density === "compact" ? "size-9 rounded-xl" : "size-11 rounded-2xl")}>
            <ArrowRight className={density === "compact" ? "size-3.5" : "size-4"} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export function SectionCard({
  title,
  description,
  children,
  action,
  header,
  className,
  density = "regular",
}: {
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
  density?: "regular" | "compact";
}) {
  return (
    <Card className={cn(density === "compact" ? "rounded-[24px]" : "rounded-[32px]", className)}>
      <CardHeader className={cn("flex flex-row items-start justify-between gap-4", density === "compact" ? "!p-4 !pb-3" : undefined)}>
        {header ? (
          header
        ) : (
          <>
            <div className="min-w-0 flex-1 space-y-2">
              <CardTitle className={density === "compact" ? "text-base" : undefined}>{title}</CardTitle>
              {description ? <CardDescription className={density === "compact" ? "text-xs leading-5" : undefined}>{description}</CardDescription> : null}
            </div>
            {action}
          </>
        )}
      </CardHeader>
      <CardContent className={density === "compact" ? "!p-4 !pt-0" : undefined}>{children}</CardContent>
    </Card>
  );
}

export function TimelineList({
  items,
}: {
  items: {
    title: string;
    meta: string;
    note?: string;
    href?: string;
    tone?: "green" | "amber" | "red" | "slate";
    badges?: { label: string; tone?: "slate" | "sky" | "amber" | "rose" | "emerald" }[];
  }[];
}) {
  if (!items.length) {
    return <div className="ui-timeline-empty rounded-[26px] bg-slate-50/80 px-4 py-6 text-sm text-slate-500">Nada por aqui ainda.</div>;
  }
  const toneClasses = {
    green: {
      card: "border-emerald-100 bg-emerald-50/45 hover:border-emerald-200 hover:bg-emerald-50/70",
      dot: "bg-emerald-500",
    },
    amber: {
      card: "border-amber-100 bg-amber-50/55 hover:border-amber-200 hover:bg-amber-50/80",
      dot: "bg-amber-500",
    },
    red: {
      card: "border-rose-100 bg-rose-50/55 hover:border-rose-200 hover:bg-rose-50/80",
      dot: "bg-rose-500",
    },
    slate: {
      card: "border-slate-100 bg-slate-50/70 hover:border-slate-200 hover:bg-white",
      dot: "bg-[linear-gradient(135deg,var(--brand-600),var(--brand-400))]",
    },
  };
  const badgeToneClasses = {
    slate: "border-slate-200 bg-white text-slate-600",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const tone = toneClasses[item.tone || "slate"];
        const line = (
          <div className={cn("ui-timeline-row flex gap-3 rounded-[24px] border px-4 py-4 transition", tone.card)}>
            <div className={cn("mt-1 size-3 rounded-full", tone.dot)} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-words font-medium text-slate-900">{item.title}</p>
              <p className="mt-1 truncate text-sm text-slate-500">{item.meta}</p>
              {item.note ? <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-400">{item.note}</p> : null}
              {item.badges?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.badges.map((badge) => (
                    <span
                      className={cn(
                        "inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                        badgeToneClasses[badge.tone || "slate"],
                      )}
                      key={`${item.title}-${badge.label}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {item.href ? <ArrowRight className="mt-1 size-4 text-slate-400" /> : null}
          </div>
        );
        return item.href ? (
          <Link href={item.href} key={`${item.title}-${index}`}>
            {line}
          </Link>
        ) : (
          <div key={`${item.title}-${index}`}>{line}</div>
        );
      })}
    </div>
  );
}

export function MiniChart({
  items,
}: {
  items: { label: string; total: number; href?: string }[];
}) {
  const max = Math.max(...items.map((item) => Number(item.total || 0)), 1);
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const row = (
          <div className="ui-mini-chart-row space-y-2 rounded-[24px] border border-slate-100 bg-slate-50/70 px-4 py-4 transition hover:border-slate-200 hover:bg-white">
            <div className="flex items-center justify-between gap-4">
              <strong className="text-sm font-medium text-slate-800">{item.label}</strong>
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{item.total}</span>
            </div>
            <div className="ui-mini-chart-track h-2 overflow-hidden rounded-full bg-slate-200/70">
              <motion.div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand-600),var(--brand-400))]"
                initial={{ width: 0 }}
                animate={{ width: `${(Number(item.total || 0) / max) * 100}%` }}
              />
            </div>
          </div>
        );
        return item.href ? (
          <Link href={item.href} key={item.label}>
            {row}
          </Link>
        ) : (
          <div key={item.label}>{row}</div>
        );
      })}
    </div>
  );
}

export function DataTable({
  rows,
}: {
  columns: string[];
  rows: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white/80">
      <div className="divide-y divide-slate-100">{rows}</div>
    </div>
  );
}

export function DataRow({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50/80 md:grid-cols-[1.1fr_1fr_1.3fr_0.9fr_0.8fr_auto] md:items-center"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function StatusBadge({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
      style={{
        backgroundColor: `${color || "#dbeafe"}22`,
        color: color || "#2563eb",
      }}
    >
      {label}
    </span>
  );
}

export function KeyValueGrid({
  items,
}: {
  items: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4" key={item.label}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
          <div className="mt-3 text-sm font-medium leading-6 text-slate-900">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Field({
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
    <label className={cn("min-w-0 space-y-2", className)}>
      <span className="block text-sm font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <small className="block text-xs leading-5 text-slate-400">{hint}</small> : null}
    </label>
  );
}

export function ActionCluster({
  phoneHref,
  whatsappHref,
  onEmail,
  onEdit,
}: {
  phoneHref?: string;
  whatsappHref?: string;
  onEmail?: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {onEmail ? (
        <Button aria-label="Enviar e-mail" onClick={onEmail} size="icon" title="Enviar e-mail" type="button" variant="secondary">
          <Mail className="size-4" />
        </Button>
      ) : null}
      {whatsappHref ? (
        <Button asChild className="border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700" size="icon" variant="secondary">
          <a aria-label="Abrir WhatsApp" href={whatsappHref} rel="noreferrer" target="_blank" title="Abrir WhatsApp">
            <WhatsAppMark className="size-4" />
          </a>
        </Button>
      ) : null}
      {phoneHref ? (
        <Button asChild size="icon" variant="ghost">
          <a aria-label="Ligar" href={phoneHref} title="Ligar">
            <Phone className="size-4" />
          </a>
        </Button>
      ) : null}
      {onEdit ? (
        <Button aria-label="Editar" onClick={onEdit} size="icon" title="Editar" type="button" variant="ghost">
          <Pencil className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function WhatsAppMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden className={className} viewBox="0 0 1219.547 1225.016">
      <path
        d="M462.273 349.294c-11.234-24.977-23.062-25.477-33.75-25.914-8.742-.375-18.75-.352-28.742-.352-10 0-26.25 3.758-39.992 18.766-13.75 15.008-52.5 51.289-52.5 125.078 0 73.797 53.75 145.102 61.242 155.117 7.5 10 103.758 166.266 256.203 226.383 126.695 49.961 152.477 40.023 179.977 37.523s88.734-36.273 101.234-71.297c12.5-35.016 12.5-65.031 8.75-71.305-3.75-6.25-13.75-10-28.75-17.5s-88.734-43.789-102.484-48.789-23.75-7.5-33.75 7.516c-10 15-38.727 48.773-47.477 58.773-8.75 10.023-17.5 11.273-32.5 3.773-15-7.523-63.305-23.344-120.609-74.438-44.586-39.75-74.688-88.844-83.438-103.859-8.75-15-.938-23.125 6.586-30.602 6.734-6.719 15-17.508 22.5-26.266 7.484-8.758 9.984-15.008 14.984-25.008 5-10.016 2.5-18.773-1.25-26.273s-32.898-81.67-46.234-111.326z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        d="M1036.898 176.091C923.562 62.677 772.859.185 612.297.114 281.43.114 12.172 269.286 12.039 600.137 12 705.896 39.633 809.13 92.156 900.13L7 1211.067l318.203-83.438c87.672 47.812 186.383 73.008 286.836 73.047h.255.003c330.812 0 600.109-269.219 600.25-600.055.055-160.343-62.328-311.108-175.649-424.53zm-424.601 923.242h-.195c-89.539-.047-177.344-24.086-253.93-69.531l-18.227-10.805-188.828 49.508 50.414-184.039-11.875-18.867c-49.945-79.414-76.312-171.188-76.273-265.422.109-274.992 223.906-498.711 499.102-498.711 133.266.055 258.516 52 352.719 146.266 94.195 94.266 146.031 219.578 145.992 352.852-.118 274.999-223.923 498.749-498.899 498.749z"
        fill="currentColor"
      />
    </svg>
  );
}

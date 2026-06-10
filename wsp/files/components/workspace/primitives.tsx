"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

import { GridBackground } from "@/components/aceternity/grid-background";
import { Spotlight } from "@/components/aceternity/spotlight";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AppLoadingScreen({ label }: { label: string }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <GridBackground />
      <Spotlight className="-left-20 top-0 h-80 w-80" />
      <Spotlight className="-right-24 bottom-0 h-96 w-96" color="rgba(13,148,136,0.24)" />
      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <div className="size-20 rounded-[28px] border border-white/80 bg-white/90 shadow-[0_30px_80px_-32px_rgba(15,23,42,0.32)]" />
        <div className="space-y-2">
          <p className="brand-wordmark text-xs font-semibold uppercase tracking-[0.36em] text-sky-700">Gabinete360</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

export function AppEmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-sky-100 bg-[linear-gradient(180deg,rgba(248,251,255,0.98),rgba(241,247,255,0.92))] px-6 py-14 text-center shadow-[0_20px_60px_-40px_rgba(37,99,235,0.18)]">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.25)]">
        <Sparkles className="size-5" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{text}</p>
      {action ? (
        <Link
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--brand-600),var(--brand-500))] px-4 py-2 text-sm font-medium text-white shadow-[0_18px_48px_-28px_rgba(21,87,229,0.45)]"
          href={action.href}
        >
          {action.label}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

export function AppPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        {eyebrow ? (
          <Badge variant="info" className="w-fit bg-sky-50/80">
            {eyebrow}
          </Badge>
        ) : null}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-950 md:text-4xl">{title}</h1>
          {description ? <p className="max-w-3xl text-sm leading-7 text-slate-500 md:text-base">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function AppPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-5">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AppListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton className="h-18 w-full rounded-[26px]" key={index} />
      ))}
    </div>
  );
}

export function AppDashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-48 w-full rounded-[36px]" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton className="h-36 rounded-[28px]" key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-80 rounded-[28px]" key={index} />
        ))}
      </div>
    </div>
  );
}

export function AppSectionCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={cn(
        "rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.28)] backdrop-blur-xl",
        className,
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {children}
    </motion.div>
  );
}

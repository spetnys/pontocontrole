"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  Bell,
  ArrowUp,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ContactRound,
  CircleUserRound,
  Coffee,
  FileText,
  FolderOpen,
  Headset,
  Heart,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  MoreHorizontal,
  Moon,
  NotebookText,
  Palette,
  Plus,
  Settings2,
  CheckSquare,
  Sun,
  Sunset,
  Trash2,
  X,
} from "lucide-react";

import { GridBackground } from "@/components/aceternity/grid-background";
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
import { Separator } from "@/components/ui/separator";
import { AppLoadingScreen } from "@/components/workspace/primitives";
import { useNow } from "@/hooks/use-now";
import { fetchJson } from "@/lib/api";
import {
  MAIN_WORKSPACE_MODULE_KEYS,
  WORKSPACE_MODULE_DEFINITIONS,
  WORKSPACE_MODULE_KEYS,
  getWorkspaceModuleDefinition,
  normalizeWorkspaceModuleConfig,
} from "@/lib/workspace-modules";
import { buildAppPath, currentDate, formatPhoneInput } from "@/lib/utils";

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  kind: string;
  entity_type: string;
  entity_id: number | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

type HolidayHighlight = {
  id: string;
  title: string;
  scope: string;
  dateLabel: string;
  relativeLabel: string;
};

type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  key: string;
  items: NavItem[];
};

const THEME_MODE_OPTIONS = [
  { value: "light", label: "Claro", description: "Tela clara para uso diario.", icon: Sun },
  { value: "dark", label: "Escuro", description: "Menos brilho para ambientes de baixa luz.", icon: Moon },
];

const THEME_PALETTE_OPTIONS = [
  { value: "azul", label: "Azul", color: "#60a5fa" },
  { value: "ciano", label: "Ciano", color: "#22d3ee" },
  { value: "verde", label: "Verde", color: "#4ade80" },
  { value: "menta", label: "Menta", color: "#5eead4" },
  { value: "salvia", label: "Salvia", color: "#95c3ab" },
  { value: "vermelho", label: "Coral", color: "#f87171" },
  { value: "rosa", label: "Rosa", color: "#f472b6" },
  { value: "roxo", label: "Lilas", color: "#a78bfa" },
  { value: "lavanda", label: "Lavanda", color: "#a5b4fc" },
  { value: "amarelo", label: "Areia", color: "#fbbf24" },
  { value: "pessego", label: "Pessego", color: "#fb923c" },
  { value: "grafite", label: "Grafite", color: "#94a3b8" },
];

function matchesNavPath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/whatsapp-crm" && (pathname === "/whatsapp" || pathname.startsWith("/whatsapp/"))) {
    return true;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isOuvidoriaProfile(type: unknown) {
  return /ouvidoria/i.test(String(type || ""));
}

function buildHolidayHighlights(items: any[], today: string): HolidayHighlight[] {
  const start = parseShellDate(today);
  const end = addShellDays(start, 6);
  const seen = new Set<string>();

  return (items || [])
    .filter((item) => {
      const date = String(item?.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      const parsed = parseShellDate(date);
      return parsed >= start && parsed <= end;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || holidayScopeWeight(a.scope) - holidayScopeWeight(b.scope))
    .flatMap((item) => {
      const date = String(item.date);
      const title = String(item.name || "Feriado").trim();
      const scope = holidayScopeLabel(item.scope);
      const key = `${date}:${title}:${scope}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        id: key,
        title,
        scope,
        dateLabel: formatShellHolidayDate(date),
        relativeLabel: relativeShellHolidayLabel(date, today),
      }];
    });
}

function parseShellDate(value: string) {
  const [year, month, day] = String(value || currentDate())
    .slice(0, 10)
    .split("-")
    .map((part) => Number(part));
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
}

function addShellDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function relativeShellHolidayLabel(date: string, today: string) {
  const diff = Math.round((parseShellDate(date).getTime() - parseShellDate(today).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return "Esta semana";
}

function formatShellHolidayDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  }).format(parseShellDate(date)).replace("-feira", "");
}

function holidayScopeLabel(scope: unknown) {
  if (scope === "municipal") return "municipal";
  if (scope === "state") return "estadual";
  return "nacional";
}

function holidayScopeWeight(scope: unknown) {
  if (scope === "national") return 0;
  if (scope === "state") return 1;
  if (scope === "municipal") return 2;
  return 3;
}

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const now = useNow();
  const { session, refreshSession, showToast } = useApp();
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [menuPreferenceSaving, setMenuPreferenceSaving] = useState("");
  const [themeDraft, setThemeDraft] = useState({
    ui_theme_mode: "light",
    ui_theme_palette: "azul",
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => Boolean(session.user?.ui_sidebar_collapsed));
  const [sidebarPreferenceSaving, setSidebarPreferenceSaving] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showSupportFab, setShowSupportFab] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsClearing, setNotificationsClearing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationBadgeOverride, setNotificationBadgeOverride] = useState<number | null>(null);
  const [trashSummary, setTrashSummary] = useState<{ total: number; expired: number }>({ total: 0, expired: 0 });
  const [holidayHighlights, setHolidayHighlights] = useState<HolidayHighlight[]>([]);
  const [defaultAreaCodeOpen, setDefaultAreaCodeOpen] = useState(false);
  const [defaultAreaCodeSaving, setDefaultAreaCodeSaving] = useState(false);
  const [defaultAreaCodeValue, setDefaultAreaCodeValue] = useState("");
  const [defaultAreaCodePromptedGabineteId, setDefaultAreaCodePromptedGabineteId] = useState<number | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    current_password: "",
    new_password: "",
    confirm_new_password: "",
  });
  const userFirstName = getFirstName(session.user?.name);
  const greetingName = getGreetingName(session.user?.name);
  const greetingContextKey = now ? buildGreetingContextKey(now, session.user?.id || userFirstName) : "";
  const [headerGreeting, setHeaderGreeting] = useState("Boas-vindas");
  const ouvidoriaProfile = isOuvidoriaProfile(session.gabinete?.type);
  const canManageWorkspace = session.user?.role === "super_admin" || session.user?.role === "gabinete_admin";
  const workspaceModuleConfig = useMemo(
    () => normalizeWorkspaceModuleConfig(session.gabinete?.workspace_module_config, session.gabinete?.type),
    [session.gabinete?.type, session.gabinete?.workspace_module_config],
  );
  const workspaceModuleGlobalConfig = useMemo(
    () => normalizeWorkspaceModuleConfig(session.gabinete?.workspace_module_global_config || session.gabinete?.workspace_module_config, session.gabinete?.type),
    [session.gabinete?.type, session.gabinete?.workspace_module_config, session.gabinete?.workspace_module_global_config],
  );
  const workspaceModulePreferences = useMemo(
    () => {
      const source = session.user?.workspace_module_preferences || {};
      return WORKSPACE_MODULE_KEYS.reduce((accumulator: Record<string, boolean>, key: string) => {
        accumulator[key] = typeof source[key] === "boolean" ? source[key] : true;
        return accumulator;
      }, {});
    },
    [session.user?.workspace_module_preferences],
  );
  const sessionThemeMode = normalizeThemeMode(session.user?.ui_theme_mode || session.gabinete?.ui_theme_mode);
  const sessionThemePalette = normalizeThemePalette(session.user?.ui_theme_palette || session.gabinete?.ui_theme_palette);
  const hiddenModulePaths = useMemo(
    () =>
      [
        !workspaceModuleConfig.dashboard ? ["/dashboard"] : [],
        !workspaceModuleConfig.tickets ? ["/atendimentos"] : [],
        !workspaceModuleConfig.contacts ? ["/contatos", "/importacao"] : [],
        !workspaceModuleConfig.notes ? ["/postit", "/notas"] : [],
        !workspaceModuleConfig.tasks ? ["/tarefas"] : [],
        !workspaceModuleConfig.whatsapp ? ["/whatsapp-crm", "/whatsapp"] : [],
	        !workspaceModuleConfig.finance ? ["/financeiro"] : [],
	        !workspaceModuleConfig.documents ? ["/documentos"] : [],
	        !workspaceModuleConfig.projects ? ["/atuacao", "/proposituras"] : [],
	        !workspaceModuleConfig.files ? ["/arquivos"] : [],
	        !canManageWorkspace ? ["/configuracoes", "/lixeira"] : [],
	        ["/ia"],
	      ].flat(),
	    [canManageWorkspace, workspaceModuleConfig],
	  );

  useEffect(() => {
    if (!session.loading && !session.authenticated) {
      router.replace("/");
    }
  }, [router, session.authenticated, session.loading]);

  useEffect(() => {
    if (!hiddenModulePaths.length) return;
    if (hiddenModulePaths.some((item) => matchesNavPath(pathname, item))) {
      const fallbackPath = [
        "/dashboard",
        "/atendimentos",
        "/contatos",
        "/postit",
        "/tarefas",
        "/whatsapp-crm",
        "/documentos",
        "/atuacao",
        "/arquivos",
        "/financeiro",
	      ].find((item) => !hiddenModulePaths.includes(item)) || (canManageWorkspace ? "/configuracoes" : "/dashboard");
	      router.replace(fallbackPath);
	    }
	  }, [canManageWorkspace, hiddenModulePaths, pathname, router]);

  useEffect(() => {
    if (!greetingContextKey) return;
    setHeaderGreeting(pickHeaderGreeting(greetingContextKey));
  }, [greetingContextKey]);

  useEffect(() => {
    setThemeDraft({
      ui_theme_mode: sessionThemeMode,
      ui_theme_palette: sessionThemePalette,
    });
  }, [sessionThemeMode, sessionThemePalette]);

  useEffect(() => {
    if (!session.authenticated) {
      document.documentElement.removeAttribute("data-app-theme-mode");
      document.documentElement.removeAttribute("data-app-theme-palette");
      return;
    }
    document.documentElement.dataset.appThemeMode = normalizeThemeMode(themeDraft.ui_theme_mode);
    document.documentElement.dataset.appThemePalette = normalizeThemePalette(themeDraft.ui_theme_palette);
    return () => {
      document.documentElement.removeAttribute("data-app-theme-mode");
      document.documentElement.removeAttribute("data-app-theme-palette");
    };
  }, [session.authenticated, themeDraft.ui_theme_mode, themeDraft.ui_theme_palette]);

  useEffect(() => {
    setProfileForm({
      name: session.user?.name || "",
      username: session.user?.username || "",
      email: session.user?.email || "",
      phone: formatPhoneInput(session.user?.phone || ""),
      current_password: "",
      new_password: "",
      confirm_new_password: "",
    });
  }, [session.user?.email, session.user?.id, session.user?.name, session.user?.phone, session.user?.username]);

  useEffect(() => {
    function handleScroll() {
      setShowBackToTop(window.scrollY > 720);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const nextCollapsed = Boolean(session.user?.ui_sidebar_collapsed);
    setSidebarCollapsed(nextCollapsed);
  }, [session.user?.id, session.user?.ui_sidebar_collapsed]);

  useEffect(() => {
    if (notificationsOpen || notificationBadgeOverride === null) return;
    if (notificationBadgeOverride !== (session.unreadNotifications || 0)) {
      setNotificationBadgeOverride(null);
    }
  }, [notificationBadgeOverride, notificationsOpen, session.unreadNotifications]);

  useEffect(() => {
	    if (!session.authenticated || !session.gabinete?.id || !canManageWorkspace) {
	      setTrashSummary({ total: 0, expired: 0 });
	      return;
	    }
    let active = true;
    fetchJson<{ total?: number; expired?: number }>("/api/trash/summary")
      .then((payload) => {
        if (!active) return;
        setTrashSummary({
          total: Number(payload.total || 0),
          expired: Number(payload.expired || 0),
        });
      })
      .catch(() => {
        if (active) setTrashSummary({ total: 0, expired: 0 });
      });
    return () => {
      active = false;
    };
	  }, [canManageWorkspace, pathname, session.authenticated, session.gabinete?.id]);

  useEffect(() => {
    if (!session.authenticated) {
      setHolidayHighlights([]);
      return;
    }

    let active = true;
    const today = currentDate();
    const year = Number(today.slice(0, 4)) || new Date().getFullYear();
    const requests = [fetchJson(`/api/holidays?year=${year}`)];
    if (today.slice(5, 7) === "12") {
      requests.push(fetchJson(`/api/holidays?year=${year + 1}`));
    }

    Promise.all(requests)
      .then((payloads) => {
        if (!active) return;
        const items = payloads.flatMap((payload) => payload?.items || []);
        setHolidayHighlights(buildHolidayHighlights(items, today));
      })
      .catch(() => {
        if (active) setHolidayHighlights([]);
      });

    return () => {
      active = false;
    };
  }, [session.authenticated, session.gabinete?.id, session.gabinete?.uf]);

  useEffect(() => {
    const gabineteId = Number(session.gabinete?.id || 0);
	    const canSetDefaultAreaCode = session.authenticated && canManageWorkspace;
    if (!canSetDefaultAreaCode || !gabineteId || session.gabinete?.default_area_code) return;
    if (defaultAreaCodePromptedGabineteId === gabineteId) return;
    const digits = String(session.gabinete?.phone || "").replace(/\D/g, "");
    const localDigits = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
    setDefaultAreaCodeValue(localDigits.length >= 10 ? localDigits.slice(0, 2) : "");
    setDefaultAreaCodePromptedGabineteId(gabineteId);
    setDefaultAreaCodeOpen(true);
  }, [
    defaultAreaCodePromptedGabineteId,
    session.authenticated,
    session.gabinete?.default_area_code,
    session.gabinete?.id,
    session.gabinete?.phone,
	    canManageWorkspace,
  ]);

  const navItems = useMemo<NavItem[]>(
    () => {
      const order = Array.isArray(workspaceModuleConfig.order) ? workspaceModuleConfig.order : [];
      const orderIndex = new Map<string, number>(order.map((key: string, index: number) => [key, index]));
      return [
        { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { key: "tickets", label: "Atendimentos", href: "/atendimentos", icon: ClipboardList },
        { key: "contacts", label: "Contatos", href: "/contatos", icon: ContactRound },
        { key: "notes", label: "Post-it", href: "/postit", icon: NotebookText },
        { key: "whatsapp", label: "WhatsApp", href: "/whatsapp-crm", icon: MessageSquareText },
        { key: "tasks", label: "Tarefas", href: "/tarefas", icon: CheckSquare },
        { key: "documents", label: ouvidoriaProfile ? "Protocolos" : "Documentos", href: "/documentos", icon: FileText },
        { key: "projects", label: "Atuação", href: "/atuacao", icon: FileText },
        { key: "files", label: "Arquivos", href: "/arquivos", icon: FolderOpen },
        { key: "finance", label: "Financeiro", href: "/financeiro", icon: Banknote },
        ...(canManageWorkspace ? [{ key: "settings", label: "Configurações", href: "/configuracoes", icon: Settings2 }] : []),
      ]
        .filter((item) => item.key === "settings" || MAIN_WORKSPACE_MODULE_KEYS.includes(item.key))
        .filter((item) => !hiddenModulePaths.includes(item.href))
        .sort((a, b) => (orderIndex.get(a.key) ?? 99) - (orderIndex.get(b.key) ?? 99));
    },
    [canManageWorkspace, hiddenModulePaths, ouvidoriaProfile, workspaceModuleConfig.order],
  );
  const navSections = useMemo<NavSection[]>(
    () =>
      navItems.length
        ? [
            {
              key: "menu",
              items: navItems,
            },
          ]
        : [],
	    [navItems],
	  );
  const menuPreferenceItems = useMemo(
    () => {
      const order = Array.isArray(workspaceModuleGlobalConfig.order) ? workspaceModuleGlobalConfig.order : WORKSPACE_MODULE_KEYS;
      return order
        .filter((key: string) => MAIN_WORKSPACE_MODULE_KEYS.includes(key))
        .map((key: string) => getWorkspaceModuleDefinition(key, session.gabinete?.type) || WORKSPACE_MODULE_DEFINITIONS.find((item) => item.key === key))
        .filter((item: any) => {
          if (!item?.key || !workspaceModuleGlobalConfig[item.key]) return false;
          return Boolean(session.user?.module_access?.[item.key]?.can_view);
        });
    },
    [session.gabinete?.type, session.user?.module_access, workspaceModuleGlobalConfig],
  );
  const currentNav = useMemo(
    () =>
      canManageWorkspace && matchesNavPath(pathname, "/configuracoes")
        ? { key: "settings", label: "Configuracoes", href: "/configuracoes", icon: Settings2 }
        : canManageWorkspace && matchesNavPath(pathname, "/lixeira")
          ? { key: "trash", label: "Lixeira", href: "/lixeira", icon: Trash2 }
        : navItems.find((item) => matchesNavPath(pathname, item.href)) || navItems[0],
    [canManageWorkspace, navItems, pathname],
  );
  const settingsIsOpen = canManageWorkspace && matchesNavPath(pathname, "/configuracoes");
  const helpIsOpen = matchesNavPath(pathname, "/guia");
  const trashIsOpen = canManageWorkspace && matchesNavPath(pathname, "/lixeira");
  const settingsToggleHref = settingsIsOpen ? navItems[0]?.href || "/configuracoes" : "/configuracoes";
  const settingsToggleLabel = settingsIsOpen ? `Voltar para ${navItems[0]?.label || "o sistema"}` : "Configuracoes";
  const mobilePrimaryTabs = useMemo<NavItem[]>(() => {
    const preferredHrefs = ["/dashboard", "/atendimentos", "/contatos", "/whatsapp-crm", "/postit", "/tarefas", "/documentos", "/atuacao", "/arquivos", "/financeiro"];
    return preferredHrefs
      .map((href) => navItems.find((item) => item.href === href))
      .filter(Boolean)
      .slice(0, 4)
      .map((item) => ({
        ...(item as NavItem),
        label:
          item?.href === "/dashboard"
            ? "Hoje"
            : item?.href === "/atendimentos"
              ? "Atend."
              : item?.href === "/whatsapp-crm"
                ? "WhatsApp"
                : item?.label || "",
      }));
  }, [navItems]);
  const mobilePrimaryTabHrefs = useMemo(() => mobilePrimaryTabs.map((item) => item.href), [mobilePrimaryTabs]);
  const mobileMoreItems = useMemo(
    () => navItems.filter((item) => !mobilePrimaryTabHrefs.includes(item.href)),
    [mobilePrimaryTabHrefs, navItems],
  );
  const mobileCurrentTitle = useMemo(() => {
    if (matchesNavPath(pathname, "/dashboard")) return "Hoje";
    if (matchesNavPath(pathname, "/configuracoes")) return "Configuracoes";
    if (matchesNavPath(pathname, "/lixeira")) return "Lixeira";
    if (matchesNavPath(pathname, "/guia")) return "Ajuda";
    return currentNav?.label || "Gabinete360";
  }, [currentNav?.label, pathname]);
  const mobileMoreActive =
    mobileNavOpen
    || settingsIsOpen
    || helpIsOpen
    || trashIsOpen
    || !mobilePrimaryTabHrefs.some((href) => matchesNavPath(pathname, href));

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const setSupportFabVisible = useCallback((visible: boolean) => {
    setShowSupportFab(visible);
  }, []);

  const setDesktopSidebarCollapsed = useCallback(
    async (collapsed: boolean) => {
      const previous = sidebarCollapsed;
      setSidebarCollapsed(collapsed);
      setSidebarPreferenceSaving(true);
      try {
        await fetchJson("/api/me/navigation", {
          method: "PATCH",
          body: JSON.stringify({ ui_sidebar_collapsed: collapsed }),
        });
        await refreshSession();
      } catch (error: any) {
        setSidebarCollapsed(previous);
        showToast("error", error.message);
      } finally {
        setSidebarPreferenceSaving(false);
      }
    },
    [refreshSession, showToast, sidebarCollapsed],
  );

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await fetchJson("/api/auth/logout", { method: "POST" });
      showToast("success", "Voce saiu do Gabinete360.", { title: "Sessao encerrada", duration: 2500 });
      await refreshSession();
      router.replace("/");
    } catch (error: any) {
      showToast("error", error.message || "Nao foi possivel sair agora.");
    } finally {
      setLogoutPending(false);
    }
  }

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    try {
      await fetchJson("/api/me", {
        method: "PATCH",
        body: JSON.stringify(profileForm),
      });
      await refreshSession();
      showToast("success", "Perfil atualizado.");
      setProfileOpen(false);
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleSaveThemePreference(nextTheme: { ui_theme_mode: string; ui_theme_palette: string }) {
    const normalizedTheme = {
      ui_theme_mode: normalizeThemeMode(nextTheme.ui_theme_mode),
      ui_theme_palette: normalizeThemePalette(nextTheme.ui_theme_palette),
    };
    setThemeDraft(normalizedTheme);
    setThemeSaving(true);
    try {
      await fetchJson("/api/me/theme", {
        method: "PATCH",
        body: JSON.stringify(normalizedTheme),
      });
      await refreshSession();
      showToast("success", "Tema atualizado.");
    } catch (error: any) {
      setThemeDraft({
        ui_theme_mode: sessionThemeMode,
        ui_theme_palette: sessionThemePalette,
      });
      showToast("error", error.message);
    } finally {
      setThemeSaving(false);
    }
  }

  async function handleToggleMenuPreference(moduleKey: string, visible: boolean) {
    if (menuPreferenceSaving) return;
    const availableKeys = menuPreferenceItems.map((item: any) => item.key);
    if (!visible && availableKeys.filter((key: string) => key !== moduleKey && workspaceModulePreferences[key]).length === 0) {
      showToast("error", "Deixe pelo menos um modulo visivel no seu menu.");
      return;
    }

    const nextPreferences = WORKSPACE_MODULE_KEYS.reduce((accumulator: Record<string, boolean>, key: string) => {
      accumulator[key] = key === moduleKey ? visible : Boolean(workspaceModulePreferences[key]);
      return accumulator;
    }, {});

    setMenuPreferenceSaving(moduleKey);
    try {
      await fetchJson("/api/me/navigation", {
        method: "PATCH",
        body: JSON.stringify({
          ui_sidebar_collapsed: sidebarCollapsed,
          workspace_module_preferences: {
            ...nextPreferences,
            order: Array.isArray(workspaceModuleGlobalConfig.order) ? workspaceModuleGlobalConfig.order : WORKSPACE_MODULE_KEYS,
          },
        }),
      });
      await refreshSession();
      showToast("success", "Menu atualizado.");
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setMenuPreferenceSaving("");
    }
  }

  async function loadNotifications() {
    setNotificationsLoading(true);
    try {
      const payload = await fetchJson<{ items: NotificationItem[] }>("/api/notifications");
      const items = payload.items || [];
      const unreadCount = items.filter((item) => !item.is_read).length;
      setNotifications(items);
      setNotificationBadgeOverride(unreadCount);
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function handleOpenNotifications() {
    if (notificationsOpen) {
      setNotificationsOpen(false);
      return;
    }
    setNotificationsOpen(true);
    await loadNotifications();
  }

  async function handleAcknowledgeNotifications() {
    const hasUnread = notifications.some((item) => !item.is_read) || Boolean(notificationBadgeOverride ?? session.unreadNotifications);
    if (!hasUnread) {
      return;
    }
    setNotificationsClearing(true);
    try {
      await fetchJson("/api/notifications/read-all", { method: "POST" });
      setNotifications([]);
      setNotificationBadgeOverride(0);
      showToast("success", "Notificacoes limpas.");
      await refreshSession();
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setNotificationsClearing(false);
    }
  }

  async function handleSaveDefaultAreaCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = defaultAreaCodeValue.replace(/\D/g, "").slice(0, 2);
    if (value.length !== 2) {
      showToast("error", "Informe um DDD com 2 digitos.");
      return;
    }
    setDefaultAreaCodeSaving(true);
    try {
      await fetchJson("/api/settings/default-area-code", {
        method: "POST",
        body: JSON.stringify({ default_area_code: value }),
      });
      await refreshSession();
      showToast("success", "DDD padrao salvo.");
      setDefaultAreaCodeOpen(false);
    } catch (error: any) {
      showToast("error", error.message);
    } finally {
      setDefaultAreaCodeSaving(false);
    }
  }

  async function handleNotificationClick(item: NotificationItem) {
    if (!item.is_read) {
      await handleAcknowledgeNotifications();
    }
    setNotificationsOpen(false);
    router.push(resolveNotificationHref(item));
  }

  if (session.loading || !session.authenticated) {
    return <AppLoadingScreen label="Costurando o painel do gabinete..." />;
  }

  const unreadNotificationCount = notificationBadgeOverride ?? session.unreadNotifications ?? 0;
  const notificationsActionLabel = unreadNotificationCount ? `Avisos (${unreadNotificationCount})` : "Avisos";
  const firstHolidayHighlight = holidayHighlights[0] || null;
  const extraHolidayHighlights = Math.max(0, holidayHighlights.length - 1);
  const greetingText = greetingName ? `${headerGreeting}, ${greetingName}.` : `${headerGreeting}.`;
  const greetingPeriodKey = now ? greetingPeriod(now) : "";
  const GreetingIcon = greetingIconForPeriod(greetingPeriodKey);
  const unreadPanelCount = notificationsOpen
    ? notifications.filter((item) => !item.is_read).length
    : unreadNotificationCount;
  const dateLabel = now
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
      }).format(now)
    : "--";
  const timeOnlyLabel = now
    ? new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(now)
    : "--:--";
  const sidebarShellClass = `ui-sidebar-shell rounded-[34px] border border-orange-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(255,250,246,0.97))] shadow-[0_30px_100px_-48px_rgba(249,115,22,0.12)] backdrop-blur-xl transition-all ${
    sidebarCollapsed ? "px-3 py-4" : "p-6"
  }`;
  const navItemClass = (active: boolean) =>
    `ui-sidebar-nav-item group flex items-center rounded-[22px] transition ${
      active
        ? "ui-sidebar-nav-item-active border border-orange-200/80 bg-[linear-gradient(135deg,rgba(255,247,237,0.98),rgba(255,237,213,0.95))] text-orange-700 shadow-[0_18px_44px_-34px_rgba(249,115,22,0.18)]"
        : "border border-transparent text-slate-700 hover:bg-[linear-gradient(135deg,rgba(255,248,241,0.98),rgba(255,255,255,0.98))] hover:text-[#f97316]"
    } ${sidebarCollapsed ? "justify-center px-2 py-3" : "justify-start px-4 py-3.5"}`;
  const navIconClass = (active: boolean) =>
    `ui-sidebar-nav-icon grid ${sidebarCollapsed ? "size-11 rounded-[20px]" : "size-10 rounded-2xl"} place-items-center ${
      active ? "bg-white/90 text-orange-700 shadow-[0_10px_30px_-22px_rgba(249,115,22,0.18)]" : "bg-orange-50/80 text-orange-700 group-hover:bg-orange-100 group-hover:text-[#ea580c]"
    }`;
  const themeMode = normalizeThemeMode(themeDraft.ui_theme_mode);
  const themePalette = normalizeThemePalette(themeDraft.ui_theme_palette);
  const ThemeButtonIcon = themeMode === "dark" ? Moon : Palette;
  const sidebarToggleLabel = sidebarCollapsed ? "Expandir menu" : "Colapsar menu";
  const topbarActionButtonClass = "size-11 rounded-[16px] text-slate-700 [&_svg]:!size-5 md:size-12 md:rounded-[18px]";

  return (
    <div className="app-theme relative min-h-screen overflow-x-hidden" data-theme-mode={themeMode} data-theme-palette={themePalette}>
      <GridBackground />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1720px] gap-6 px-4 py-4 xl:px-6">
        <aside className={`hidden shrink-0 transition-[width] duration-200 xl:block ${sidebarCollapsed ? "w-[112px]" : "w-[312px]"}`}>
          <div className="sticky top-4 space-y-4">
            <div className={sidebarShellClass}>
              <div className={`mb-4 flex ${sidebarCollapsed ? "flex-col items-center gap-2.5" : "items-center justify-between gap-3"}`}>
                {sidebarCollapsed ? (
                  <div
                    aria-label="Gabinete360"
                    className="grid size-11 place-items-center rounded-[20px] border border-orange-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,247,237,0.98))] shadow-[0_12px_32px_-24px_rgba(249,115,22,0.26)]"
                    title="Gabinete360"
                  >
                    <span className="brand-wordmark text-base font-black tracking-tight text-[#0b5ed7]">G</span>
                  </div>
                ) : (
                  <div className="brand-wordmark text-2xl font-bold tracking-tight text-slate-800">
                    <span className="text-[#0b5ed7]">Gabinete</span>
                    <span className="text-[#f97316]">360</span>
                  </div>
                )}
                <button
                  aria-label={sidebarToggleLabel}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-orange-100/80 bg-white/90 text-orange-700 shadow-[0_10px_30px_-24px_rgba(249,115,22,0.24)] transition hover:border-orange-200 hover:text-[#ea580c]"
                  disabled={sidebarPreferenceSaving}
                  onClick={() => void setDesktopSidebarCollapsed(!sidebarCollapsed)}
                  type="button"
                >
                  {sidebarCollapsed ? <ChevronRight className="size-5" /> : <ChevronLeft className="size-4" />}
                </button>
              </div>

              <nav className="space-y-4">
                {navSections.map((section, sectionIndex) => (
                  <div className="space-y-2" key={section.key}>
                    {sectionIndex > 0 ? <div className={sidebarCollapsed ? "mx-auto h-px w-10 rounded-full bg-slate-200/90" : "mx-3 h-px rounded-full bg-slate-200/80"} /> : null}
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = matchesNavPath(pathname, item.href);
                      const link = (
                        <Link
                          aria-label={item.label}
                          className={navItemClass(active)}
                          href={item.href}
                          key={item.href}
                          title={sidebarCollapsed ? item.label : undefined}
                        >
                          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}>
                            <div className={navIconClass(active)}>
                              <Icon className={sidebarCollapsed ? "size-5" : "size-4"} />
                            </div>
                            {!sidebarCollapsed ? <span className="font-medium">{item.label}</span> : null}
                          </div>
                        </Link>
                      );
                      return link;
                    })}
                  </div>
                ))}
              </nav>
            </div>

          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="ui-main-shell rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(247,250,255,0.82))] p-3 pb-28 shadow-[0_40px_120px_-48px_rgba(37,99,235,0.18)] backdrop-blur-2xl md:rounded-[36px] md:p-5">
            <div className="ui-topbar-shell sticky top-3 z-40 mb-3 flex flex-col gap-2 rounded-[20px] border border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,251,255,0.94))] p-2 shadow-[0_14px_44px_-36px_rgba(37,99,235,0.16)] backdrop-blur-2xl md:top-4 md:mb-4 md:rounded-[22px] md:p-2.5">
	              <div className="hidden items-center justify-between gap-3 md:flex">
	                <div className="flex min-w-0 flex-1 items-center gap-3">
	                  <Button className="xl:hidden" size="icon" variant="secondary" onClick={() => setMobileNavOpen(true)}>
	                    <MoreHorizontal className="size-4" />
	                  </Button>

	                  <div className="min-w-0 flex-1">
	                    <div className="flex min-w-0 items-center gap-3">
	                      <span
	                        aria-hidden="true"
	                        className={`grid size-8 shrink-0 place-items-center rounded-2xl border ${greetingIconToneClass(greetingPeriodKey)}`}
                      >
                        <GreetingIcon className="size-4" />
                      </span>
                      <h1 className="min-w-0 truncate text-lg font-semibold text-slate-950 xl:text-xl">
                        {greetingText}
                      </h1>
	                    </div>
	                  </div>
	                </div>

	                <div className="items-center gap-2 md:flex">
	                  <div className="ui-topbar-today flex min-h-10 items-center gap-2 rounded-full border border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,253,245,0.94))] px-2.5 py-1 text-right shadow-[0_8px_24px_-22px_rgba(16,185,129,0.16)]">
	                    <span className="whitespace-nowrap text-xs font-semibold text-slate-900">{dateLabel}</span>
                    <span className="whitespace-nowrap text-[11px] font-medium text-slate-500">{timeOnlyLabel}</span>
                    {firstHolidayHighlight ? (
                      <Link
                          className="ui-topbar-holiday flex max-w-[170px] items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50/85 px-2 py-1 text-orange-950 transition hover:border-orange-200 hover:bg-orange-100"
                          href="/dashboard?calendar=1"
                          title="Abrir calendario"
                        >
                          <CalendarClock className="size-3 shrink-0 text-orange-600" />
                          <span className="min-w-0 truncate text-[10px] font-semibold">
                            {firstHolidayHighlight.title}
                          </span>
                      </Link>
	                    ) : null}
	                  </div>

                    {workspaceModuleConfig.tickets ? (
                      <HeaderActionTooltip label="Adicionar atendimento">
                        <Button asChild aria-label="Adicionar atendimento" className={topbarActionButtonClass} size="icon" variant="secondary">
                          <Link href="/atendimentos?new=1">
                            <Plus />
                          </Link>
                        </Button>
                      </HeaderActionTooltip>
                    ) : null}

	                  {unreadNotificationCount ? (
	                    <HeaderActionTooltip label={notificationsActionLabel}>
	                      <Button aria-label={notificationsActionLabel} className={topbarActionButtonClass} size="icon" variant="secondary" onClick={handleOpenNotifications}>
	                        <div className="relative">
	                          <Bell />
	                          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
	                            {unreadNotificationCount}
	                          </span>
	                        </div>
	                      </Button>
	                    </HeaderActionTooltip>
	                  ) : null}

	                  {canManageWorkspace ? (
	                    <HeaderActionTooltip label={trashSummary.total ? `Lixeira (${trashSummary.total})` : "Lixeira"}>
	                      <Button
	                        asChild
	                        className={`${topbarActionButtonClass} ${trashIsOpen ? "border-rose-200 bg-rose-50 text-rose-700" : ""}`}
	                        size="icon"
	                        variant="secondary"
	                      >
	                        <Link aria-label={trashSummary.total ? `Lixeira (${trashSummary.total})` : "Lixeira"} href="/lixeira">
	                          <div className="relative">
	                            <Trash2 />
	                            {trashSummary.total ? (
	                              <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
	                                {trashSummary.total > 99 ? "99+" : trashSummary.total}
	                              </span>
	                            ) : null}
	                          </div>
	                        </Link>
	                      </Button>
	                    </HeaderActionTooltip>
	                  ) : null}

	                  <HeaderActionTooltip label="Meu perfil">
	                    <Button aria-label="Meu perfil" className={topbarActionButtonClass} size="icon" variant="secondary" onClick={() => setProfileOpen(true)}>
	                      <CircleUserRound />
                    </Button>
                  </HeaderActionTooltip>

	                  {canManageWorkspace ? (
	                    <HeaderActionTooltip label={settingsToggleLabel}>
	                      <Button
	                        asChild
	                        className={`${topbarActionButtonClass} ${settingsIsOpen ? "border-orange-200 bg-orange-50 text-orange-700" : ""}`}
	                        size="icon"
	                        variant="secondary"
	                      >
	                        <Link aria-label={settingsToggleLabel} href={settingsToggleHref}>
	                          <Settings2 />
	                        </Link>
	                      </Button>
	                    </HeaderActionTooltip>
	                  ) : null}

                  <HeaderActionTooltip label="Sair">
                    <Button
                      aria-label="Sair"
                      className={`${topbarActionButtonClass} hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700`}
                      disabled={logoutPending}
                      onClick={handleLogout}
                      size="icon"
                      variant="secondary"
                    >
                      <LogOut />
                    </Button>
                  </HeaderActionTooltip>
	                </div>
	              </div>

              <div className="space-y-2 md:hidden">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold tracking-normal text-slate-950">
                      {mobileCurrentTitle}
                    </h1>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{dateLabel} · {timeOnlyLabel}</p>
                    {firstHolidayHighlight ? (
                      <div className="mt-1 flex items-center gap-2">
                        <Link
                          className="ui-topbar-holiday inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50/90 px-2 py-1 text-orange-950 transition hover:border-orange-200 hover:bg-orange-100"
                          href="/dashboard?calendar=1"
                          title="Abrir calendario"
                        >
                          <CalendarClock className="size-3.5 shrink-0 text-orange-600" />
                          <span className="min-w-0 truncate text-[11px] font-semibold">
                            {firstHolidayHighlight.title}
                          </span>
                        </Link>
                        {extraHolidayHighlights ? (
                          <Link
                            className="ui-topbar-holiday inline-flex min-w-fit items-center rounded-full border border-orange-100 bg-orange-50/90 px-2.5 py-1.5 text-xs font-semibold text-orange-700"
                            href="/dashboard?calendar=1"
                            title="Abrir calendario"
                          >
                            +{extraHolidayHighlights}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

	                  <div className="flex shrink-0 items-center gap-2">
                      {workspaceModuleConfig.tickets ? (
                        <Button asChild aria-label="Adicionar atendimento" className={topbarActionButtonClass} size="icon" variant="secondary">
                          <Link href="/atendimentos?new=1">
                            <Plus />
                          </Link>
                        </Button>
                      ) : null}
	                    {unreadNotificationCount ? (
	                      <Button aria-label={notificationsActionLabel} className={topbarActionButtonClass} size="icon" variant="secondary" onClick={handleOpenNotifications}>
	                        <div className="relative">
	                          <Bell />
	                          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
	                            {unreadNotificationCount}
	                          </span>
	                        </div>
	                      </Button>
	                    ) : null}
	                    {canManageWorkspace ? (
	                      <Button
	                        aria-label={trashSummary.total ? `Lixeira (${trashSummary.total})` : "Lixeira"}
	                        asChild
	                        className={`${topbarActionButtonClass} ${trashIsOpen ? "border-rose-200 bg-rose-50 text-rose-700" : ""}`}
	                        size="icon"
	                        variant="secondary"
	                      >
	                        <Link href="/lixeira">
	                          <div className="relative">
	                            <Trash2 />
	                            {trashSummary.total ? (
	                              <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
	                                {trashSummary.total > 99 ? "99+" : trashSummary.total}
	                              </span>
	                            ) : null}
	                          </div>
	                        </Link>
	                      </Button>
	                    ) : null}
	                    <Button
	                      aria-label="Sair"
	                      className={`${topbarActionButtonClass} hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700`}
	                      disabled={logoutPending}
	                      onClick={handleLogout}
	                      size="icon"
	                      variant="secondary"
	                    >
	                      <LogOut />
	                    </Button>
	                  </div>
	                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <div className="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-600">
                    {session.gabinete?.name || "Gabinete360"}
                  </div>
                  {settingsIsOpen ? (
                    <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
                      Configuracoes
                    </div>
                  ) : null}
                </div>
	              </div>
	            </div>

            {helpIsOpen ? (
              <div className="ui-help-banner mb-8 rounded-[30px] border border-orange-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,250,246,0.94))] p-5 shadow-[0_24px_70px_-48px_rgba(249,115,22,0.16)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-[18px] bg-orange-50 text-orange-700">
                      <Headset className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-700">Suporte Gabinete360</p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-950">Precisa falar com o suporte?</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Use o WhatsApp para duvida de uso, configuracao ou algo que travou na rotina.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      className="rounded-full"
                      onClick={() => setSupportFabVisible(!showSupportFab)}
                      type="button"
                      variant="secondary"
                    >
                      <MessageSquareText className="size-4" />
                      {showSupportFab ? "Ocultar atalho" : "Mostrar atalho"}
                    </Button>
                    <Button asChild className="rounded-full bg-orange-600 text-white hover:bg-orange-700">
                      <a href={session.support?.url || "#"} rel="noreferrer" target="_blank">
                        Abrir WhatsApp
                        <ChevronRight className="size-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {children}

            <footer className="mt-8 border-t border-slate-200/70 px-2 pb-1 pt-5 text-center text-xs leading-5 text-slate-400 md:flex md:items-center md:justify-between md:text-left">
              <p>© 2026 Gabinete360. Todos os direitos reservados.</p>
              <p className="inline-flex items-center justify-center gap-1.5 md:justify-start">
                <Heart className="size-3.5 fill-current text-rose-500" />
                Feito com carinho, de assessor para assessor.
              </p>
            </footer>
          </div>
        </main>
      </div>

      <Sheet onOpenChange={setMobileNavOpen} open={mobileNavOpen}>
        <SheetContent className="w-[calc(100vw-1rem)] max-h-[min(88vh,760px)] rounded-[30px] border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(247,250,255,0.97))] shadow-[0_40px_120px_-34px_rgba(15,23,42,0.28)] md:w-[min(460px,calc(100vw-2rem))] xl:hidden">
          <SheetHeader className="space-y-3 border-b border-slate-200/80 px-5 py-5">
            <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-200" />
            <SheetTitle>Mais do gabinete</SheetTitle>
            <SheetDescription>
              Atalhos e modulos que nao ficam na barra principal do iPhone.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-5 px-5 py-5">
	            <div className="grid grid-cols-3 gap-3">
	              <button
	                className="flex min-h-24 flex-col items-center justify-center gap-2.5 rounded-[22px] border border-slate-200/80 bg-white text-slate-700"
	                onClick={() => {
	                  setMobileNavOpen(false);
	                  void handleOpenNotifications();
	                }}
	                type="button"
	              >
	                <Bell className="size-6" />
	                <span className="text-xs font-semibold">Avisos</span>
	              </button>
	              <button
	                className="flex min-h-24 flex-col items-center justify-center gap-2.5 rounded-[22px] border border-slate-200/80 bg-white text-slate-700"
	                onClick={() => {
	                  setMobileNavOpen(false);
	                  setProfileOpen(true);
	                }}
	                type="button"
	              >
	                <CircleUserRound className="size-6" />
	                <span className="text-xs font-semibold">Perfil</span>
	              </button>
	              <button
	                className="flex min-h-24 flex-col items-center justify-center gap-2.5 rounded-[22px] border border-slate-200/80 bg-white text-slate-700"
	                onClick={() => {
	                  setMobileNavOpen(false);
	                  setThemeOpen(true);
	                }}
	                type="button"
	              >
	                <ThemeButtonIcon className="size-6" />
	                <span className="text-xs font-semibold">Tema</span>
	              </button>
            </div>

            <nav className="space-y-4">
              {mobileMoreItems.length ? (
                <div className="space-y-2">
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Mais modulos</p>
                  {mobileMoreItems.map((item) => {
                    const Icon = item.icon;
                    const active = matchesNavPath(pathname, item.href);
                    return (
                      <Link
                        className={navItemClass(active)}
                        href={item.href}
                        key={item.href}
                        onClick={() => setMobileNavOpen(false)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={navIconClass(active)}>
                            <Icon className="size-4" />
                          </div>
                          <span className="font-medium">{item.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Conta e ajuda</p>
	                {canManageWorkspace ? (
	                  <Link className={navItemClass(settingsIsOpen)} href={settingsToggleHref} onClick={() => setMobileNavOpen(false)}>
	                    <div className="flex items-center gap-3">
	                      <div className={navIconClass(settingsIsOpen)}>
	                        <Settings2 className="size-4" />
	                      </div>
	                      <span className="font-medium">{settingsToggleLabel}</span>
	                    </div>
	                  </Link>
	                ) : null}
                <Link className={navItemClass(helpIsOpen)} href="/guia" onClick={() => setMobileNavOpen(false)}>
                  <div className="flex items-center gap-3">
                    <div className={navIconClass(helpIsOpen)}>
                      <Headset className="size-4" />
                    </div>
                    <span className="font-medium">Ajuda</span>
                  </div>
                </Link>
                <button className={navItemClass(false)} disabled={logoutPending} onClick={handleLogout} type="button">
                  <div className="flex items-center gap-3">
                    <div className={navIconClass(false)}>
                      <LogOut className="size-4" />
                    </div>
                    <span className="font-medium">Sair</span>
                  </div>
                </button>
              </div>
            </nav>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <div
        className="fixed inset-x-0 bottom-0 z-[65] px-3 md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.65rem)" }}
      >
        <div className="mx-auto flex max-w-[34rem] items-end justify-between rounded-[30px] border border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,248,255,0.94))] px-2 py-2 shadow-[0_30px_90px_-42px_rgba(15,23,42,0.32)] backdrop-blur-2xl">
          {mobilePrimaryTabs.map((item) => {
            const Icon = item.icon;
            const active = matchesNavPath(pathname, item.href);
            return (
              <Link
                aria-label={item.label}
                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[22px] px-2 py-2 text-center transition"
                href={item.href}
                key={item.href}
              >
                <span
                  className={`grid size-10 place-items-center rounded-[18px] ${
                    active ? "bg-orange-100 text-orange-700" : "text-slate-500"
                  }`}
                >
                  <Icon className="size-5" />
                </span>
                <span className={`truncate text-[11px] font-semibold ${active ? "text-orange-700" : "text-slate-500"}`}>{item.label}</span>
              </Link>
            );
          })}

          <button
            aria-label="Mais"
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[22px] px-2 py-2 text-center transition"
            onClick={() => setMobileNavOpen(true)}
            type="button"
          >
            <span
              className={`grid size-10 place-items-center rounded-[18px] ${
                mobileMoreActive ? "bg-orange-100 text-orange-700" : "text-slate-500"
              }`}
            >
              <MoreHorizontal className="size-5" />
            </span>
            <span className={`truncate text-[11px] font-semibold ${mobileMoreActive ? "text-orange-700" : "text-slate-500"}`}>Mais</span>
          </button>
        </div>
      </div>

      <button
        aria-label="Voltar ao topo"
        className={`ui-back-to-top fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 z-[60] inline-flex -translate-x-1/2 items-center justify-center rounded-full border border-sky-500 bg-sky-600 p-3 text-white shadow-[0_18px_50px_-26px_rgba(2,132,199,0.55)] transition-all hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-200 md:bottom-8 md:p-3.5 ${
          showBackToTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
        onClick={scrollToTop}
        type="button"
      >
        <ArrowUp className="size-5" />
      </button>

      {showSupportFab ? (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-5 z-[60] flex flex-col items-end gap-2 md:bottom-6 md:right-6">
          <button
            aria-label="Fechar atalho do WhatsApp"
            className="ui-support-close inline-flex size-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/92 text-slate-500 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.24)] transition hover:text-slate-700"
            onClick={() => {
              setSupportFabVisible(false);
            }}
            type="button"
          >
            <X className="size-4" />
          </button>
          <a
            aria-label="Falar com suporte no WhatsApp"
            className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-100 p-[18px] text-emerald-900 shadow-[0_18px_50px_-28px_rgba(34,197,94,0.28)] transition-transform hover:-translate-y-0.5"
            href={session.support?.url || "#"}
            rel="noreferrer"
            target="_blank"
          >
            <WhatsAppMark />
          </a>
        </div>
      ) : null}

      <Sheet onOpenChange={setThemeOpen} open={themeOpen}>
        <SheetContent className="inset-x-auto inset-y-auto bottom-auto left-1/2 right-auto top-4 max-h-[min(680px,calc(100vh-2rem))] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-[34px] sm:top-6">
          <SheetHeader>
            <Badge variant="info" className="w-fit">
              Aparencia
            </Badge>
            <SheetTitle>Tema da sua tela</SheetTitle>
            <SheetDescription>
              Preferencia visual salva para o seu usuario.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-slate-950">Modo</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {THEME_MODE_OPTIONS.map((item) => {
                    const Icon = item.icon;
                    const active = themeDraft.ui_theme_mode === item.value;
                    return (
                      <button
                        className={`flex min-h-24 items-start gap-3 rounded-[22px] border px-4 py-4 text-left transition ${
                          active
                            ? "border-orange-300 bg-orange-50 text-orange-900 shadow-[0_18px_44px_-36px_rgba(249,115,22,0.32)]"
                            : "border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50/60"
                        }`}
                        disabled={themeSaving}
                        key={item.value}
                        onClick={() =>
                          handleSaveThemePreference({
                            ...themeDraft,
                            ui_theme_mode: item.value,
                          })
                        }
                        type="button"
                      >
                        <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${active ? "bg-white text-orange-700" : "bg-slate-50 text-slate-500"}`}>
                          <Icon className="size-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">{item.label}</span>
                          <span className="mt-1 block text-sm leading-6 text-slate-500">{item.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-950">Cor</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {THEME_PALETTE_OPTIONS.map((item) => {
                    const active = themeDraft.ui_theme_palette === item.value;
                    return (
                      <button
                        className={`flex min-h-14 items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition ${
                          active
                            ? "border-orange-300 bg-orange-50 text-slate-950 shadow-[0_18px_44px_-36px_rgba(249,115,22,0.26)]"
                            : "border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50/60"
                        }`}
                        disabled={themeSaving}
                        key={item.value}
                        onClick={() =>
                          handleSaveThemePreference({
                            ...themeDraft,
                            ui_theme_palette: item.value,
                          })
                        }
                        type="button"
                      >
                        <span className="size-8 shrink-0 rounded-full border border-white shadow-[0_10px_24px_-14px_rgba(15,23,42,0.45)]" style={{ backgroundColor: item.color }} />
                        <span className="text-sm font-semibold">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {themeSaving ? <p className="text-sm text-slate-500">Salvando tema...</p> : null}
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>

	      <Sheet onOpenChange={setProfileOpen} open={profileOpen}>
	        <SheetContent className="inset-x-auto inset-y-auto bottom-auto left-1/2 right-auto top-4 max-h-[min(760px,calc(100vh-2rem))] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 rounded-[34px] sm:top-6 sm:max-h-[min(760px,calc(100vh-3rem))]">
	          <SheetHeader>
	            <SheetTitle>Meu perfil</SheetTitle>
	          </SheetHeader>
	          <SheetBody>
	            <div className="mb-5 grid gap-2 sm:grid-cols-3">
	              <button
	                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50/70"
	                onClick={() => {
	                  setProfileOpen(false);
	                  setThemeOpen(true);
	                }}
	                type="button"
	              >
	                <ThemeButtonIcon className="size-4" />
	                Tema
	              </button>
	              <Link
	                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50/70"
	                href="/guia"
	                onClick={() => setProfileOpen(false)}
	              >
	                <Headset className="size-4" />
	                Ajuda
	              </Link>
	              <button
	                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50/70 hover:text-rose-700"
	                disabled={logoutPending}
	                onClick={handleLogout}
	                type="button"
	              >
	                <LogOut className="size-4" />
	                Sair
	              </button>
		            </div>
		            <Separator className="mb-5" />

		            {menuPreferenceItems.length ? (
		              <div className="mb-5 rounded-[24px] border border-slate-100 bg-slate-50/70 p-4">
		                <div className="mb-3 flex items-center justify-between gap-3">
		                  <p className="text-sm font-semibold text-slate-950">Meu menu</p>
		                  {menuPreferenceSaving ? <span className="text-xs font-semibold text-slate-400">Salvando...</span> : null}
		                </div>
		                <div className="grid gap-2 sm:grid-cols-2">
		                  {menuPreferenceItems.map((item: any) => {
		                    const visible = Boolean(workspaceModuleConfig[item.key]);
		                    const saving = menuPreferenceSaving === item.key;
		                    return (
		                      <button
		                        aria-checked={visible}
		                        className={`flex min-h-12 items-center justify-between gap-3 rounded-[18px] border px-3 py-2 text-left transition ${
		                          visible
		                            ? "border-orange-200 bg-white text-slate-950"
		                            : "border-slate-200 bg-white/60 text-slate-500"
		                        }`}
		                        disabled={Boolean(menuPreferenceSaving)}
		                        key={item.key}
		                        onClick={() => handleToggleMenuPreference(item.key, !visible)}
		                        role="switch"
		                        type="button"
		                      >
		                        <span className="min-w-0 truncate text-sm font-semibold">{item.label}</span>
		                        <span
		                          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
		                            visible ? "bg-orange-500" : "bg-slate-200"
		                          } ${saving ? "opacity-60" : ""}`}
		                        >
		                          <span
		                            className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${
		                              visible ? "left-6" : "left-1"
		                            }`}
		                          />
		                        </span>
		                      </button>
		                    );
		                  })}
		                </div>
		              </div>
		            ) : null}

		            <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSaveProfile}>
	              <ProfileField label="Nome">
	                <Input
	                  required
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                />
              </ProfileField>
              <ProfileField label="Usuario">
                <Input
                  required
                  value={profileForm.username}
                  onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))}
                />
              </ProfileField>
              <ProfileField label="E-mail">
                <Input
                  required
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                />
              </ProfileField>
              <ProfileField label="Telefone">
                <Input
                  inputMode="tel"
                  value={profileForm.phone}
                  onBlur={() => setProfileForm((current) => ({ ...current, phone: formatPhoneInput(current.phone) }))}
                  onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </ProfileField>
              <ProfileField className="md:col-span-2" label="Senha atual">
                <Input
                  placeholder="Obrigatoria apenas se quiser trocar a senha"
                  type="password"
                  value={profileForm.current_password}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, current_password: event.target.value }))
                  }
                />
              </ProfileField>
              <ProfileField label="Nova senha">
                <Input
                  placeholder="Deixe em branco para manter"
                  type="password"
                  value={profileForm.new_password}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, new_password: event.target.value }))
                  }
                />
              </ProfileField>
              <ProfileField label="Confirmar nova senha">
                <Input
                  placeholder="Repita a nova senha"
                  type="password"
                  value={profileForm.confirm_new_password}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, confirm_new_password: event.target.value }))
                  }
                />
              </ProfileField>

              <Separator className="md:col-span-2" />

              <div className="flex flex-col-reverse gap-3 md:col-span-2 md:flex-row md:justify-end">
                <Button onClick={() => setProfileOpen(false)} type="button" variant="ghost">
                  Cancelar
                </Button>
                <Button disabled={profileSaving} type="submit">
                  {profileSaving ? "Salvando..." : "Salvar perfil"}
                </Button>
              </div>
            </form>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet onOpenChange={setDefaultAreaCodeOpen} open={defaultAreaCodeOpen}>
        <SheetContent className="w-[min(460px,calc(100vw-2rem))]">
          <SheetHeader>
            <Badge variant="info" className="w-fit">
              Configuracao inicial
            </Badge>
            <SheetTitle>DDD padrao do gabinete</SheetTitle>
            <SheetDescription>
              Usado para completar contatos importados que venham apenas como celular local.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <form className="space-y-5" onSubmit={handleSaveDefaultAreaCode}>
              <ProfileField label="DDD padrao">
                <Input
                  autoFocus
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="19"
                  value={defaultAreaCodeValue}
                  onChange={(event) => setDefaultAreaCodeValue(event.target.value.replace(/\D/g, "").slice(0, 2))}
                />
              </ProfileField>
              <div className="rounded-[24px] border border-orange-100 bg-orange-50/70 px-4 py-3 text-sm leading-6 text-orange-900">
                Fixo local precisa comecar de 2 a 5. Se vier com 8 digitos iniciando em 8 ou 9, o sistema trata como celular antigo e acrescenta o nono digito.
              </div>
              <div className="flex justify-end gap-3">
                <Button onClick={() => setDefaultAreaCodeOpen(false)} type="button" variant="ghost">
                  Depois
                </Button>
                <Button disabled={defaultAreaCodeSaving} type="submit">
                  {defaultAreaCodeSaving ? "Salvando..." : "Salvar DDD"}
                </Button>
              </div>
            </form>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet onOpenChange={setNotificationsOpen} open={notificationsOpen}>
        <SheetContent className="inset-x-auto inset-y-auto bottom-auto left-1/2 right-auto top-4 max-h-[min(760px,calc(100vh-2rem))] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 rounded-[34px] sm:top-6 sm:max-h-[min(760px,calc(100vh-3rem))]">
          <SheetHeader>
            <Badge variant="info" className="w-fit">
              Notificacoes
            </Badge>
            <SheetTitle>O que pede atencao agora</SheetTitle>
            <SheetDescription>
              Atribuicoes, prazos, aniversarios e avisos que entraram no radar do gabinete.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-[24px] border border-orange-100/80 bg-[linear-gradient(135deg,rgba(255,248,241,0.96),rgba(255,252,247,0.98))] px-4 py-3">
	                <div>
	                  <p className="text-sm font-semibold text-slate-950">
	                    {notifications.length ? `${notifications.length} aviso${notifications.length === 1 ? "" : "s"} pendente${notifications.length === 1 ? "" : "s"}` : "Nenhum aviso pendente"}
	                  </p>
	                  <p className="text-xs text-slate-500">
	                    {unreadPanelCount
	                      ? `${unreadPanelCount} aviso${unreadPanelCount === 1 ? "" : "s"} ainda sem confirmacao.`
	                      : "Tudo limpo por aqui."}
	                  </p>
	                </div>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={notificationsLoading}
                    onClick={loadNotifications}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Atualizar
                  </Button>
                  <Button
                    disabled={!unreadPanelCount || notificationsClearing}
                    onClick={handleAcknowledgeNotifications}
                    size="sm"
                    type="button"
                  >
                    {notificationsClearing ? "..." : "Limpar"}
                  </Button>
                </div>
              </div>

              {notificationsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      className="h-24 animate-pulse rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))]"
                      key={index}
                    />
                  ))}
                </div>
              ) : notifications.length ? (
                <div className="space-y-3">
                  {notifications.map((item) => {
                    const Icon = notificationIcon(item.kind);
                    const unread = !item.is_read;
                    return (
                      <button
                        className={`group w-full rounded-[28px] border p-4 text-left shadow-[0_18px_48px_-34px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_26px_60px_-36px_rgba(249,115,22,0.16)] ${
                          unread
                            ? "border-orange-200/90 bg-[linear-gradient(180deg,rgba(255,247,237,0.99),rgba(255,255,255,0.98))]"
                            : "border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(247,250,252,0.96))]"
                        }`}
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        type="button"
                      >
                        <div className="flex items-start gap-4">
                          <div className="grid size-12 shrink-0 place-items-center rounded-[18px] bg-[linear-gradient(135deg,#ffedd5,#fdba74)] text-orange-700 shadow-[0_18px_44px_-30px_rgba(249,115,22,0.22)]">
                            <Icon className="size-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                                  {unread ? (
                                    <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                                      Novo
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-sm leading-6 text-slate-500">{item.message}</p>
                              </div>
                              <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                {formatNotificationMoment(item.created_at)}
                              </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <span className="rounded-full border border-orange-100 bg-orange-50/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-700">
                                {notificationLabel(item.kind)}
                              </span>
                              <span className="text-sm font-medium text-orange-700 transition group-hover:text-orange-800">
                                Abrir
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[30px] border border-dashed border-slate-200 bg-white/80 px-6 py-12 text-center shadow-[0_18px_50px_-38px_rgba(15,23,42,0.12)]">
                  <div className="mx-auto grid size-14 place-items-center rounded-[20px] bg-orange-50 text-orange-700">
                    <Bell className="size-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">Nada pendente no sino</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Quando surgir atribuicao, prazo ou aviso importante, ele aparece aqui.
                  </p>
                </div>
              )}
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function normalizeThemeMode(value: unknown) {
  return String(value || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

function normalizeThemePalette(value: unknown) {
  const palette = String(value || "").trim().toLowerCase();
  return THEME_PALETTE_OPTIONS.some((item) => item.value === palette) ? palette : "azul";
}

function notificationIcon(kind: string) {
  if (kind.includes("whatsapp")) return MessageSquareText;
  if (kind.includes("task")) return CheckSquare;
  if (kind.includes("document")) return FileText;
  if (kind.includes("birthday") || kind.includes("holiday")) return CalendarClock;
  if (kind.includes("signup")) return ContactRound;
  return ClipboardList;
}

function notificationLabel(kind: string) {
  if (kind === "assignment") return "Atribuicao";
  if (kind === "ticket_update") return "Atendimento";
  if (kind === "document") return "Ofício / protocolo / requerimento";
  if (kind === "task") return "Tarefa";
  if (kind === "task_overdue") return "Tarefa atrasada";
  if (kind === "ticket_due") return "Retorno";
  if (kind === "document_due") return "Prazo";
  if (kind === "birthday_notice") return "Aniversario";
  if (kind === "holiday") return "Calendario";
  if (kind === "public_signup") return "Atendimento online";
  if (kind === "public_confirmation_failed") return "Atendimento online";
  if (kind === "whatsapp_connection_issue") return "WhatsApp";
  if (kind === "whatsapp_message") return "WhatsApp";
  return "Aviso";
}

function resolveNotificationHref(item: NotificationItem) {
  if (item.entity_type === "ticket" && item.entity_id) {
    return buildAppPath("/atendimentos", { focus: item.entity_id });
  }
  if (item.entity_type === "contact" && item.entity_id) {
    return buildAppPath("/contatos", { focus: item.entity_id });
  }
  if (item.entity_type === "document") {
    return "/documentos";
  }
  if (item.entity_type === "task") {
    return "/tarefas";
  }
  if (item.entity_type === "whatsapp_thread") {
    return "/whatsapp-crm";
  }
  return "/dashboard";
}

function HeaderActionTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex select-none" title={label}>
      {children}
      <span className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-[80] whitespace-nowrap rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.55)] transition group-hover:opacity-100 group-focus-within:opacity-100 group-active:opacity-100">
        {label}
      </span>
    </span>
  );
}

function formatNotificationMoment(value: string) {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getFirstName(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.split(/\s+/)[0] : "equipe";
}

function getGreetingName(value?: string | null) {
  const firstName = getFirstName(value);
  if (!firstName || firstName === "equipe") return "";
  return firstName.length <= 18 ? firstName : "";
}

function buildGreetingContextKey(date: Date, userKey: string | number) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return `${userKey || "user"}|${year}-${month}-${day}|${greetingPeriod(date)}|${date.getDay()}|${date.getDate()}|${lastDayOfMonth}`;
}

function pickHeaderGreeting(contextKey: string) {
  const options = headerGreetingOptions(contextKey);
  if (!options.length) return "Boas-vindas";
  const seed = hashText(contextKey) % options.length;
  return options[seed];
}

function headerGreetingOptions(contextKey: string) {
  const parts = contextKey.split("|");
  const period = parts[2] || "dia";
  const options =
    period === "madrugada"
      ? ["Boa madrugada"]
      : period === "manha"
        ? ["Bom dia"]
        : period === "almoco"
          ? ["Bom almoco"]
          : period === "tarde"
            ? ["Boa tarde"]
            : period === "fim-tarde"
              ? ["Boa tarde"]
              : period === "noite"
                ? ["Boa noite"]
                : ["Boa noite"];

  return Array.from(new Set(options));
}

function greetingIconForPeriod(period: string) {
  if (period === "madrugada" || period === "noite" || period === "fim-dia") return Moon;
  if (period === "almoco") return Coffee;
  if (period === "fim-tarde") return Sunset;
  return Sun;
}

function greetingIconToneClass(period: string) {
  if (period === "madrugada" || period === "noite" || period === "fim-dia") {
    return "border-indigo-100 bg-indigo-50/80 text-indigo-700";
  }
  if (period === "almoco") {
    return "border-amber-100 bg-amber-50/85 text-amber-700";
  }
  if (period === "fim-tarde") {
    return "border-orange-100 bg-orange-50/85 text-orange-700";
  }
  return "border-sky-100 bg-sky-50/85 text-sky-700";
}

function greetingPeriod(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return "madrugada";
  if (hour < 11) return "manha";
  if (hour < 14) return "almoco";
  if (hour < 17) return "tarde";
  if (hour < 19) return "fim-tarde";
  if (hour < 23) return "noite";
  return "fim-dia";
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function WhatsAppMark() {
  return (
    <div className="flex size-7 items-center justify-center">
      <svg aria-hidden className="size-7" viewBox="0 0 32 32">
        <path
          d="M19.11 17.47c-.29-.14-1.7-.84-1.96-.94-.26-.1-.45-.14-.63.14-.19.29-.73.94-.9 1.13-.16.19-.33.21-.62.07-.29-.14-1.21-.45-2.31-1.44-.85-.76-1.43-1.7-1.59-1.98-.16-.29-.02-.44.12-.58.13-.13.29-.33.43-.5.14-.17.19-.29.29-.48.09-.19.05-.36-.02-.5-.07-.14-.63-1.52-.86-2.08-.22-.54-.45-.47-.63-.48h-.54c-.19 0-.5.07-.76.36-.26.29-.99.97-.99 2.37 0 1.39 1.01 2.74 1.15 2.93.14.19 1.97 3 4.79 4.2.67.29 1.2.46 1.6.59.67.21 1.28.18 1.76.11.54-.08 1.7-.69 1.94-1.35.24-.67.24-1.24.17-1.35-.07-.11-.26-.18-.55-.32Z"
          fill="#ffffff"
        />
        <path
          d="M16.03 4.8c-6.18 0-11.2 5.01-11.2 11.19 0 1.97.52 3.9 1.49 5.6L4.8 27.2l5.74-1.5a11.18 11.18 0 0 0 5.48 1.44h.01c6.18 0 11.2-5.02 11.2-11.2 0-3-1.17-5.82-3.29-7.94a11.15 11.15 0 0 0-7.91-3.2Zm0 20.45h-.01a9.3 9.3 0 0 1-4.74-1.3l-.34-.2-3.4.89.91-3.31-.22-.34a9.28 9.28 0 0 1-1.43-4.99c0-5.15 4.19-9.35 9.35-9.35 2.49 0 4.83.97 6.59 2.74a9.27 9.27 0 0 1 2.74 6.6c0 5.16-4.2 9.36-9.35 9.36Z"
          fill="#ffffff"
        />
      </svg>
    </div>
  );
}

function ProfileField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

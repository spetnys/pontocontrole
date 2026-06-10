"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Toaster, toast } from "sonner";

import { fetchJson } from "@/lib/api";

type SessionState = {
  loading: boolean;
  authenticated: boolean;
  user: any;
  gabinete: any;
  gabineteOptions: any[];
  support: any;
  authProviders?: {
    google?: {
      enabled: boolean;
      start_url: string;
    };
  };
  unreadNotifications: number;
};

type ToastKind = "success" | "error";
type ToastOptions = {
  title?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
};

const SUCCESS_TOAST_DURATION_MS = 2000;
const ERROR_TOAST_DURATION_MS = 6500;

const AppContext = createContext<{
  session: SessionState;
  refreshSession: () => Promise<SessionState>;
  showToast: (kind: ToastKind, message: string, options?: ToastOptions) => void;
} | null>(null);

const EMPTY_SESSION: SessionState = {
  loading: true,
  authenticated: false,
  user: null,
  gabinete: null,
  gabineteOptions: [],
  support: null,
  authProviders: {
    google: {
      enabled: false,
      start_url: "/api/auth/google/start",
    },
  },
  unreadNotifications: 0,
};

export function AppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);

  const refreshSession = useCallback(async () => {
    try {
      const data = await fetchJson<SessionState>("/api/session");
      const nextSession = { loading: false, ...data };
      setSession(nextSession);
      return nextSession;
    } catch {
      const nextSession = { ...EMPTY_SESSION, loading: false };
      setSession(nextSession);
      return nextSession;
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!session.authenticated) return;

    const intervalId = window.setInterval(() => {
      refreshSession();
    }, 60000);

    const handleFocus = () => {
      refreshSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSession();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshSession, session.authenticated]);

  const showToast = useCallback((kind: ToastKind, message: string, options?: ToastOptions) => {
    if (kind === "error") {
      toast.error(options?.title || "Algo deu errado", {
        description: message,
        duration: options?.duration || ERROR_TOAST_DURATION_MS,
      });
      return;
    }
    toast.success(options?.title || "Concluido", {
      description: message,
      duration: options?.action
        ? options.duration || 3000
        : Math.min(options?.duration || SUCCESS_TOAST_DURATION_MS, SUCCESS_TOAST_DURATION_MS),
      action: options?.action,
    });
  }, []);

  const value = useMemo(
    () => ({
      session,
      refreshSession,
      showToast,
    }),
    [refreshSession, session, showToast],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <Toaster
        richColors
        closeButton
        position="top-right"
        toastOptions={{
          classNames: {
            toast:
              "rounded-[24px] border border-white/80 bg-white/95 text-slate-900 shadow-[0_25px_90px_-35px_rgba(15,23,42,0.35)]",
            description: "text-slate-500",
          },
        }}
      />
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp precisa estar dentro de AppProvider.");
  }
  return context;
}

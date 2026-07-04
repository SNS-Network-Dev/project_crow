"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
} from "react";
import styles from "./toast.module.css";

export type ToastType = "ok" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export default function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const baseId = useId();

  const show = useCallback((message: string, type: ToastType = "ok") => {
    const id = `${baseId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: Toast = { id, message, type };
    setToasts((prev) => [...prev, toast]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, [baseId]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className={styles.container} aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${styles[t.type]}`}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

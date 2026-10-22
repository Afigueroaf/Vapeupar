"use client";

import { useState, useEffect, useRef } from "react";
import { ShieldAlert, CheckCircle, Ban, AlertTriangle } from "lucide-react";

const VERIFICATION_KEY = "vapeupar_age_verified_at";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function AgeVerificationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasRejected, setHasRejected] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const verifiedTimestampStr = localStorage.getItem(VERIFICATION_KEY);
      if (verifiedTimestampStr) {
        const timestamp = parseInt(verifiedTimestampStr, 10);
        const now = Date.now();
        // If not expired within 30 days
        if (!isNaN(timestamp) && (now - timestamp) < THIRTY_DAYS_MS) {
          setIsOpen(false);
          return;
        }
      }
      setIsOpen(true);
    } catch (_e) {
      // LocalStorage access denied or incognito
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Lock body scroll
      document.body.style.overflow = "hidden";
      // Focus confirm button
      setTimeout(() => confirmButtonRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleConfirmAge = () => {
    try {
      localStorage.setItem(VERIFICATION_KEY, Date.now().toString());
    } catch (_e) {
      // fallback if storage disabled
    }
    setIsOpen(false);
  };

  const handleRejectAge = () => {
    setHasRejected(true);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-dialog-title"
      aria-describedby="age-dialog-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 text-center shadow-2xl">
        {!hasRejected ? (
          <>
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <ShieldAlert className="size-8" aria-hidden="true" />
            </div>

            <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Control Legal de Mayoría de Edad (+18)
            </span>

            <h2 id="age-dialog-title" className="mt-4 text-2xl font-bold tracking-tight text-white">
              Bienvenido a Vapeupar
            </h2>

            <p id="age-dialog-desc" className="mt-3 text-sm leading-relaxed text-zinc-400">
              Este sitio web comercializa vaporizadores y líquidos con y sin nicotina. La legislación colombiana (Ley 1335 de 2009) y normas sanitarias prohíben estrictamente el suministro o venta de estos productos a menores de 18 años.
            </p>

            <p className="mt-2 text-xs font-semibold text-amber-400">
              ¿Confirmas bajo juramento que tienes 18 años o más?
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={handleConfirmAge}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-zinc-950"
              >
                <CheckCircle className="size-4" aria-hidden="true" />
                Sí, soy mayor de 18 años
              </button>

              <button
                type="button"
                onClick={handleRejectAge}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-3 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-700"
              >
                <Ban className="size-4" aria-hidden="true" />
                No, soy menor de edad
              </button>
            </div>

            <p className="mt-4 text-[11px] text-zinc-500">
              La verificación se renueva cada 30 días. Se exigirá documento de identidad físico en la entrega.
            </p>
          </>
        ) : (
          <div className="py-4">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
              <AlertTriangle className="size-8" aria-hidden="true" />
            </div>

            <h3 className="text-xl font-bold text-white">Acceso Restringido</h3>

            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              De acuerdo con la legislación de protección a la infancia y la adolescencia, el acceso a este catálogo está restringido para menores de edad.
            </p>

            <a
              href="https://www.google.com"
              className="mt-6 inline-block rounded-xl bg-zinc-800 px-6 py-3 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
            >
              Salir de la página
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

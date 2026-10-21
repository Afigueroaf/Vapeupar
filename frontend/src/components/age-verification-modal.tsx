"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, CheckCircle, Ban } from "lucide-react";

export function AgeVerificationModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const verified = localStorage.getItem("vapeupar_age_verified");
    if (!verified) {
      setIsOpen(true);
    }
  }, []);

  const handleConfirmAge = () => {
    localStorage.setItem("vapeupar_age_verified", "true");
    setIsOpen(false);
  };

  const handleRejectAge = () => {
    window.location.href = "https://www.google.com";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
          <ShieldAlert className="size-8" />
        </div>

        <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
          Control de Edad +18
        </span>

        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
          Bienvenido a Vapeupar
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Este sitio web contiene productos destinados exclusivamente a adultos. La venta y consumo de vaporizadores y líquidos con nicotina está prohibida para menores de 18 años.
        </p>

        <p className="mt-2 text-xs font-medium text-amber-400/90">
          ¿Confirmas que tienes 18 años de edad o más?
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleConfirmAge}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-[0.98]"
          >
            <CheckCircle className="size-4" />
            Sí, soy mayor de 18 años
          </button>

          <button
            onClick={handleRejectAge}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <Ban className="size-4" />
            No, soy menor de edad
          </button>
        </div>

        <p className="mt-4 text-[11px] text-zinc-500">
          Al ingresar, aceptas nuestros términos de servicio y confirmas tu mayoría de edad legal.
        </p>
      </div>
    </div>
  );
}

import { ArrowDown, Zap, ShieldCheck, Truck, Sparkles } from "lucide-react";

export function Hero() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "573001234567";

  return (
    <section 
      aria-label="Bienvenida y propuesta de valor"
      className="relative overflow-hidden border-b border-zinc-800/60 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 py-16 sm:py-24"
    >
      {/* Background ambient glow */}
      <div aria-hidden="true" className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div aria-hidden="true" className="absolute top-1/3 right-10 size-80 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 text-center">
        {/* Top pill badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400 mb-6 shadow-sm">
          <Sparkles className="size-3.5" aria-hidden="true" />
          <span>Vape Shop Líder en Valledupar • Domicilios Inmediatos</span>
        </div>

        {/* Main headline */}
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl text-white max-w-4xl mx-auto">
          Los mejores vaporizadores, pods y sales con{" "}
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            entrega inmediata
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Marcas 100% auténticas, dispositivos de hasta 15,000 puffs, sabores premium y asesoría personalizada para encontrar tu setup ideal.
        </p>

        {/* Action buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#catalogo"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-6 py-3.5 text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-500/25 transition hover:opacity-95 active:scale-[0.98]"
          >
            Explorar Catálogo
            <ArrowDown className="size-4" aria-hidden="true" />
          </a>

          <a
            href={`https://wa.me/${whatsappNumber}?text=Hola,%20necesito%20asesor%C3%ADa%20para%20elegir%20mi%20vape`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/80 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
          >
            Hablar con un Asesor
          </a>
        </div>

        {/* Value props badges */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto pt-8 border-t border-zinc-800/60">
          <div className="flex items-center justify-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3">
            <Truck className="size-5 text-emerald-400 shrink-0" aria-hidden="true" />
            <div className="text-left">
              <p className="text-xs font-bold text-white">Domicilio en Valledupar</p>
              <p className="text-[11px] text-zinc-400">Entrega rápida en tu puerta</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3">
            <ShieldCheck className="size-5 text-cyan-400 shrink-0" aria-hidden="true" />
            <div className="text-left">
              <p className="text-xs font-bold text-white">Productos 100% Originales</p>
              <p className="text-[11px] text-zinc-400">Verificables con código QR</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3">
            <Zap className="size-5 text-emerald-400 shrink-0" aria-hidden="true" />
            <div className="text-left">
              <p className="text-xs font-bold text-white">Pago Contra Entrega</p>
              <p className="text-[11px] text-zinc-400">Efectivo, Nequi y Daviplata</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

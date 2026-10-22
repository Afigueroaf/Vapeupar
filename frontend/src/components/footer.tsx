import { ShieldAlert, Flame, MapPin, Phone, Clock } from "lucide-react";

export function Footer() {
  const currentYear = 2026;

  return (
    <footer className="border-t border-zinc-800/80 bg-zinc-950 pt-12 pb-8 text-xs text-zinc-400">
      {/* Obligatory health and legal warning for nicotine products */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mb-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5 text-amber-300">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-200">
              ADVERTENCIA LEGAL Y DE SALUD
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-amber-300/80">
              La venta de vaporizadores, cigarrillos electrónicos y líquidos con o sin nicotina está estrictamente prohibida para menores de 18 años (Ley 1335 de 2009). La nicotina es una sustancia altamente adictiva. No recomendado para mujeres embarazadas ni personas con afecciones cardiovasculares. Exige tu documento de identidad físico en la entrega.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-zinc-900">
        {/* Col 1: Brand Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 font-black">
              <Flame className="size-4 fill-zinc-950" aria-hidden="true" />
            </div>
            <span className="text-base font-extrabold text-white tracking-tight">VAPEUPAR</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Tu tienda especializada en Valledupar para vaporizadores desechables, pods recargables, e-líquidos premium y accesorios originales.
          </p>
        </div>

        {/* Col 2: Location & Hours */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Ubicación y Cobertura
          </h3>
          <ul className="space-y-2 text-zinc-400">
            <li className="flex items-center gap-2">
              <MapPin className="size-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Valledupar, Cesar, Colombia</span>
            </li>
            <li className="flex items-center gap-2">
              <Clock className="size-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Lunes a Sábado: 10:00 AM - 10:00 PM</span>
            </li>
            <li className="flex items-center gap-2">
              <Clock className="size-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Domingos: 12:00 PM - 8:00 PM</span>
            </li>
          </ul>
        </div>

        {/* Col 3: Customer Care & Ordering */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Atención al Cliente
          </h3>
          <ul className="space-y-2 text-zinc-400">
            <li className="flex items-center gap-2">
              <Phone className="size-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              <a 
                href="tel:+573001234567" 
                className="hover:text-emerald-400 transition underline underline-offset-2"
              >
                Llamadas: +57 300 123 4567
              </a>
            </li>
            <li>Envíos locales express en moto</li>
            <li>Envíos a todo el departamento del Cesar</li>
            <li>Métodos: Nequi, Daviplata, Contra Entrega</li>
          </ul>
        </div>

        {/* Col 4: Quick Links */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Categorías Rápidas
          </h3>
          <ul className="space-y-2 text-zinc-400">
            <li><a href="#desechables" className="hover:text-emerald-400 transition">Desechables 10k Puffs</a></li>
            <li><a href="#pods" className="hover:text-emerald-400 transition">Pods Recargables</a></li>
            <li><a href="#liquidos" className="hover:text-emerald-400 transition">Sales de Nicotina</a></li>
            <li><a href="#faq" className="hover:text-emerald-400 transition">Preguntas Frecuentes</a></li>
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-zinc-500 text-[11px]">
        <p>© {currentYear} Vapeupar. Todos los derechos reservados. Valledupar, Colombia.</p>
        <p>Solo para mayores de 18 años (+18). Consume con responsabilidad.</p>
      </div>
    </footer>
  );
}

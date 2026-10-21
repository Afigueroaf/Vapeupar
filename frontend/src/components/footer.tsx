import { ShieldAlert, Flame, MapPin, Phone, Clock } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800/80 bg-zinc-950 pt-12 pb-8 text-xs text-zinc-400">
      {/* Obligatory health and legal warning for nicotine products */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mb-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5 text-amber-300">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-amber-200">
              ADVERTENCIA LEGAL Y DE SALUD
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-amber-300/80">
              La venta de vaporizadores, cigarrillos electrónicos y líquidos con o sin nicotina está estrictamente prohibida para menores de 18 años. La nicotina es una sustancia altamente adictiva. No recomendado para mujeres embarazadas ni personas con afecciones cardiovasculares. Exige tu documento de identidad en la entrega.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-zinc-900">
        {/* Col 1 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 font-black">
              <Flame className="size-4" />
            </div>
            <span className="text-base font-extrabold text-white tracking-tight">VAPEUPAR</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Tu tienda de confianza en Valledupar para vaporizadores desechables, pods recargables, e-líquidos premium y accesorios originales.
          </p>
        </div>

        {/* Col 2 */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Ubicación y Cobertura
          </h4>
          <ul className="space-y-2 text-zinc-400">
            <li className="flex items-center gap-2">
              <MapPin className="size-3.5 text-emerald-400" />
              <span>Valledupar, Cesar, Colombia</span>
            </li>
            <li className="flex items-center gap-2">
              <Clock className="size-3.5 text-emerald-400" />
              <span>Lunes a Sábado: 10:00 AM - 10:00 PM</span>
            </li>
            <li className="flex items-center gap-2">
              <Clock className="size-3.5 text-emerald-400" />
              <span>Domingos: 12:00 PM - 8:00 PM</span>
            </li>
          </ul>
        </div>

        {/* Col 3 */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Atención al Cliente
          </h4>
          <ul className="space-y-2 text-zinc-400">
            <li className="flex items-center gap-2">
              <Phone className="size-3.5 text-emerald-400" />
              <span>WhatsApp Ventas: +57 300 123 4567</span>
            </li>
            <li>Envíos locales en moto express</li>
            <li>Envíos a todo el Cesar y Colombia</li>
            <li>Métodos de pago: Nequi, Daviplata, Efectivo</li>
          </ul>
        </div>

        {/* Col 4 */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Categorías Rápidas
          </h4>
          <ul className="space-y-2 text-zinc-400">
            <li><a href="#catalogo" className="hover:text-emerald-400 transition">Desechables 10k Puffs</a></li>
            <li><a href="#catalogo" className="hover:text-emerald-400 transition">Pods Recargables</a></li>
            <li><a href="#catalogo" className="hover:text-emerald-400 transition">Sales de Nicotina</a></li>
            <li><a href="#catalogo" className="hover:text-emerald-400 transition">Resistencias y Coils</a></li>
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-zinc-500 text-[11px]">
        <p>© {new Date().getFullYear()} Vapeupar. Todos los derechos reservados. Valledupar, Colombia.</p>
        <p>Solo para mayores de edad (+18). Consume responsablemente.</p>
      </div>
    </footer>
  );
}

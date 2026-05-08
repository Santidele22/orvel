import { c as createComponent } from './astro-component_rBFDG-4w.mjs';
import { l as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_pp2NYhb9.mjs';
import { $ as $$Layout } from './Layout_DGgiDipu.mjs';

const $$Plan = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Orvel - Seleccioná tu plan" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<main class="min-h-screen bg-bg-primary text-text-primary px-6 py-16 lg:py-24 font-body"> <div class="max-w-6xl mx-auto space-y-16"> <!-- Header --> <header class="grid lg:grid-cols-2 gap-12 items-center"> <div class="space-y-6"> <div class="inline-block px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-[10px] font-bold tracking-widest uppercase text-primary shadow-sm">
Paso 1 de 3
</div> <h1 class="text-5xl md:text-6xl font-headline font-black text-text-primary leading-[1.1] tracking-tighter">
Elegí el plan para <br> <span class="text-primary italic font-light">tu negocio.</span> </h1> <p class="text-text-secondary text-lg max-w-md">
Llená tu agenda sin esfuerzo. Elegí el plan que acompaña tu
            crecimiento y empezá hoy mismo.
</p> </div> <div class="hidden lg:block h-64 bg-bg-secondary rounded-2xl border border-border shadow-2xl relative overflow-hidden"> <div class="absolute inset-0 bg-primary/10 mix-blend-overlay"></div> <img src="/banner1.png" alt="Orvel Preview" class="absolute inset-0 w-full h-full object-cover opacity-50 blur-[1px]"> <div class="absolute inset-0 flex items-center justify-center"> <div class="text-center p-8 bg-bg-primary/40 backdrop-blur-md rounded-xl border border-white/10"> <p class="text-text-primary font-headline font-bold text-xl tracking-tight">
Potenciá tu salón con Orvel
</p> </div> </div> </div> </header> <!-- Plans --> <section class="grid grid-cols-1 md:grid-cols-4 gap-6"> <!-- Free --> <a href="/auth/signup/credentials?plan=FREE" class="card bg-bg-secondary/40 flex flex-col hover:-translate-y-2 hover:border-primary/50 transition-all duration-300 group cursor-pointer"> <div class="mb-6"> <div class="flex items-center gap-2 mb-2"> <div class="w-2 h-2 rounded-full bg-success shadow-[0_0_10px_rgba(16,185,129,0.4)]"></div> <p class="text-[10px] uppercase tracking-[0.2em] text-text-secondary">
Free
</p> </div> <h5 class="text-3xl font-headline font-bold text-text-primary">
Probá Gratis
</h5> <p class="text-2xl font-headline font-black mt-2">$0</p> </div> <ul class="mb-8 space-y-3 text-text-secondary text-xs flex-grow"> <li class="flex items-center gap-3">✓ 1 local</li> <li class="flex items-center gap-3">✓ Hasta 15 turnos/mes</li> <li class="flex items-center gap-3">✓ Reservas online</li> <li class="flex items-center gap-3">✓ Agenda automática</li> </ul> <div class="w-full btn btn-secondary rounded-full py-3 text-xs font-bold group-hover:bg-primary group-hover:text-white transition-all">
Empezar gratis
</div> </a> <!-- Starter (Featured) --> <a href="/auth/signup/credentials?plan=STARTER" class="card bg-gradient-to-b from-bg-secondary to-bg-primary border-primary ring-1 ring-primary flex flex-col shadow-xl shadow-primary/10 scale-105 relative z-10 hover:-translate-y-3 transition-all duration-300 group cursor-pointer"> <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-md">
RECOMENDADO
</div> <div class="mb-6 mt-4"> <div class="flex items-center gap-2 mb-2"> <div class="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_rgba(124,58,237,0.6)]"></div> <p class="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">
Starter
</p> </div> <h5 class="text-4xl font-headline font-black text-text-primary">
$12<span class="text-xs font-body text-text-secondary font-normal ml-1">
/mes</span> </h5> </div> <ul class="mb-8 space-y-3 text-text-primary text-xs flex-grow font-medium"> <li class="flex items-center gap-3">✓ 1 local</li> <li class="flex items-center gap-3">
✓ <span class="text-primary-light">Turnos ilimitados</span> </li> <li class="flex items-center gap-3">✓ Link de reservas</li> <li class="flex items-center gap-3">✓ Sin branding Orvel</li> </ul> <div class="w-full btn btn-primary rounded-full py-3 text-xs font-bold shadow-lg shadow-primary/20">
Elegir Starter
</div> </a> <!-- Growth --> <a href="/auth/signup/credentials?plan=GROWTH" class="card bg-bg-secondary/40 flex flex-col hover:-translate-y-2 hover:border-primary/50 transition-all duration-300 group cursor-pointer"> <div class="mb-6"> <div class="flex items-center gap-2 mb-2"> <div class="w-2 h-2 rounded-full bg-primary-light shadow-[0_0_10px_rgba(167,139,250,0.4)]"></div> <p class="text-[10px] uppercase tracking-[0.2em] text-text-secondary">
Growth
</p> </div> <h5 class="text-3xl font-headline font-bold text-text-primary">
$22<span class="text-xs font-body text-text-secondary font-normal ml-1">
/mes</span> </h5> </div> <ul class="mb-8 space-y-3 text-text-secondary text-xs flex-grow"> <li class="flex items-center gap-3">✓ Hasta 3 locales</li> <li class="flex items-center gap-3">✓ Recordatorios auto.</li> <li class="flex items-center gap-3">✓ Métricas y reportes</li> <li class="flex items-center gap-3">✓ Gestión de personal</li> </ul> <div class="w-full btn btn-secondary rounded-full py-3 text-xs font-bold group-hover:bg-primary group-hover:text-white transition-all">
Elegir Growth
</div> </a> <!-- Pro --> <a href="/auth/signup/credentials?plan=PRO" class="card bg-bg-secondary/40 flex flex-col hover:-translate-y-2 hover:border-primary/50 transition-all duration-300 group cursor-pointer"> <div class="mb-6"> <div class="flex items-center gap-2 mb-2"> <div class="w-2 h-2 rounded-full bg-warning shadow-[0_0_10px_rgba(245,158,11,0.4)]"></div> <p class="text-[10px] uppercase tracking-[0.2em] text-text-secondary">
Pro
</p> </div> <h5 class="text-3xl font-headline font-bold text-text-primary">
$39<span class="text-xs font-body text-text-secondary font-normal ml-1">
/mes</span> </h5> </div> <ul class="mb-8 space-y-3 text-text-secondary text-xs flex-grow"> <li class="flex items-center gap-3">✓ Hasta 10 locales</li> <li class="flex items-center gap-3">✓ Soporte prioritario</li> <li class="flex items-center gap-3">✓ Reportes avanzados</li> <li class="flex items-center gap-3">✓ API opcional</li> </ul> <div class="w-full btn btn-secondary rounded-full py-3 text-xs font-bold group-hover:bg-primary group-hover:text-white transition-all">
Elegir Pro
</div> </a> </section> <!-- Footer Info --> <footer class="pt-16 border-t border-border grid md:grid-cols-3 gap-8"> <div> <h4 class="text-xl font-headline font-bold text-text-primary mb-3">
Preguntas frecuentes
</h4> <p class="text-sm text-text-secondary">
Todo lo que necesitás saber sobre los planes y suscripciones de
            Orvel.
</p> </div> <div> <h5 class="text-xs font-bold uppercase tracking-widest text-primary mb-3">
¿Puedo cambiar de plan?
</h5> <p class="text-sm text-text-secondary">
Sí, podés subir o bajar de categoría en cualquier momento desde tu
            panel de configuración.
</p> </div> <div> <h5 class="text-xs font-bold uppercase tracking-widest text-primary mb-3">
¿Hay permanencia?
</h5> <p class="text-sm text-text-secondary">
No, podés cancelar tu suscripción cuando quieras sin costos ocultos
            ni penalizaciones.
</p> </div> </footer> </div> </main> ` })}`;
}, "/home/santid/santi/orvel-landing/src/pages/auth/signup/plan.astro", void 0);

const $$file = "/home/santid/santi/orvel-landing/src/pages/auth/signup/plan.astro";
const $$url = "/auth/signup/plan";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Plan,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

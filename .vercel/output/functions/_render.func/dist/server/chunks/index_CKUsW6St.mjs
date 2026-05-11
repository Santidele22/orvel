import { c as createComponent } from './astro-component_Cnwy2PEp.mjs';
import { m as maybeRenderHead, r as renderTemplate, h as addAttribute, l as renderComponent, n as Fragment, o as defineScriptVars } from './entrypoint_D6LB6xrT.mjs';
import { $ as $$Layout } from './Layout_C1nFOh5u.mjs';
import { createClient } from '@supabase/supabase-js';

function createPublicClient() {
  return createClient(
    "https://tzqgwziyiospmvpdgbnt.supabase.co",
    "sb_publishable_JH2uY3XfVHFujz_KnMdZPA_rZnHsi8i",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
async function getActivePlans() {
  const supabase = createPublicClient();
  try {
    const { data, error } = await supabase.rpc("get_active_plans");
    if (error) {
      if (error.code === "PGRST205") {
        console.warn("public.plans is unavailable; using static fallback plans.", error);
      } else {
        console.error("Error fetching plans from database:", error);
      }
      return getStaticPlans();
    }
    if (!data || data.length === 0) {
      return getStaticPlans();
    }
    return data;
  } catch (err) {
    console.error("Supabase connection error:", err);
    return getStaticPlans();
  }
}
function calculateBillingPrices(plan) {
  const monthly_price = plan.price;
  let quarterly_price = plan.price_quarterly ?? 0;
  let annual_price = plan.price_annual ?? 0;
  if (!plan.price_quarterly || !plan.price_annual) {
    switch (plan.code) {
      case "STARTER":
        quarterly_price = 30;
        annual_price = 99;
        break;
      case "GROWTH":
        quarterly_price = 55;
        annual_price = 179;
        break;
      case "PRO":
        quarterly_price = 99;
        annual_price = 299;
        break;
      default:
        quarterly_price = 0;
        annual_price = 0;
        break;
    }
  }
  return {
    ...plan,
    monthly_price,
    quarterly_price,
    annual_price
  };
}
function getStaticPlans() {
  return [
    {
      id: "static-free",
      code: "FREE",
      name: "Free",
      description: "Ideal para empezar a ordenar tus turnos. 1 local, hasta 15 turnos/mes, reservas online, agenda automática.",
      price: 0,
      price_quarterly: 0,
      price_annual: 0,
      currency: "USD",
      billing_frequency: 1,
      billing_frequency_type: "months",
      duration_days: 30,
      is_active: true,
      is_featured: false,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "static-starter",
      code: "STARTER",
      name: "Starter",
      description: "Empezá a llenar tu agenda. Automatizá tus turnos y dejá de responder mensajes. 1 local, turnos ilimitados, link de reservas, sin branding.",
      price: 12,
      price_quarterly: 30,
      price_annual: 99,
      currency: "USD",
      billing_frequency: 1,
      billing_frequency_type: "months",
      duration_days: 30,
      is_active: true,
      is_featured: true,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "static-growth",
      code: "GROWTH",
      name: "Growth",
      description: "Reducí cancelaciones y ganá más. Menos ausencias, más ingresos reales. Hasta 3 locales, recordatorios automáticos, métricas, reportes semanales.",
      price: 22,
      price_quarterly: 55,
      price_annual: 179,
      currency: "USD",
      billing_frequency: 1,
      billing_frequency_type: "months",
      duration_days: 30,
      is_active: true,
      is_featured: false,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "static-pro",
      code: "PRO",
      name: "Pro",
      description: "Escalá tu negocio sin límites. Pensado para negocios que ya están creciendo. Hasta 10 locales, soporte prioritario, reportes avanzados, API (opcional).",
      price: 39,
      price_quarterly: 99,
      price_annual: 299,
      currency: "USD",
      billing_frequency: 1,
      billing_frequency_type: "months",
      duration_days: 30,
      is_active: true,
      is_featured: false,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  ];
}

const $$Header = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<nav class="fixed top-0 w-full z-50 bg-bg-primary/80 backdrop-blur-3xl border-b border-border flex justify-between items-center px-8 md:px-12 h-16 shadow-[0_10px_30px_rgba(0,0,0,0.2)]"> <a href="/" class="flex items-center gap-2"> <img src="/logo-white.png" alt="Orvel Logo" class="h-6 w-auto"> </a> <div class="hidden md:flex items-center space-x-8 font-headline font-medium text-[13px] tracking-wide text-text-secondary"> <a class="hover:text-text-primary transition-colors" href="#tipos">Soluciones</a> <a class="hover:text-text-primary transition-colors" href="#beneficios">Beneficios</a> <a class="hover:text-text-primary transition-colors" href="#pricing">Precios</a> </div> <div class="flex items-center space-x-6"> <a href="/auth/login" class="text-text-secondary font-headline font-bold text-xs uppercase tracking-widest hover:text-text-primary transition-colors">Ingresar</a> <a href="/auth/signup/plan" class="btn btn-primary py-2 px-6 text-[10px] tracking-widest uppercase shadow-lg shadow-primary/20">
Empezar gratis
</a> </div> </nav>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Header.astro", void 0);

const $$Hero = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="relative min-h-[90vh] flex items-center pt-20 overflow-hidden bg-bg-primary" data-astro-cid-yfogg3tk> <!-- Background Decorative Elements --> <div class="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" data-astro-cid-yfogg3tk></div> <div class="absolute -top-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" data-astro-cid-yfogg3tk></div> <div class="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-bg-primary via-transparent to-transparent z-10" data-astro-cid-yfogg3tk></div> <div class="max-w-7xl mx-auto px-8 md:px-12 relative z-20" data-astro-cid-yfogg3tk> <div class="grid lg:grid-cols-2 gap-16 items-center" data-astro-cid-yfogg3tk> <!-- Content Column --> <div class="space-y-8" data-astro-cid-yfogg3tk> <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-[10px] font-bold tracking-[0.2em] uppercase text-primary shadow-sm" data-astro-cid-yfogg3tk> <span class="relative flex h-2 w-2" data-astro-cid-yfogg3tk> <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" data-astro-cid-yfogg3tk></span> <span class="relative inline-flex rounded-full h-2 w-2 bg-primary" data-astro-cid-yfogg3tk></span> </span>
Nueva versión 2.0 disponible
</div> <h1 class="text-5xl md:text-7xl font-headline font-black tracking-tighter text-text-primary leading-[1.05] reveal" data-astro-cid-yfogg3tk>
Gestioná tu salón <br data-astro-cid-yfogg3tk> <span class="text-primary italic font-light" data-astro-cid-yfogg3tk>con intención.</span> </h1> <p class="text-lg md:text-xl text-text-secondary font-body max-w-lg leading-relaxed reveal stagger-1" data-astro-cid-yfogg3tk>
Más que una agenda, el atelier digital para profesionales
                    que buscan excelencia en cada turno y fidelidad en cada
                    cliente.
</p> <div class="flex flex-col sm:flex-row items-center gap-4 pt-4 reveal stagger-2" data-astro-cid-yfogg3tk> <a href="/auth/signup/plan" class="w-full sm:w-auto btn btn-primary py-4 px-10 text-xs tracking-widest uppercase shadow-xl shadow-primary/20" data-astro-cid-yfogg3tk>
Comenzar ahora — Es gratis
</a> <a href="#how-it-works" class="w-full sm:w-auto btn btn-secondary py-4 px-10 text-xs tracking-widest uppercase" data-astro-cid-yfogg3tk>
Ver cómo funciona
</a> </div> <div class="flex items-center gap-6 pt-8 border-t border-border/50" data-astro-cid-yfogg3tk> <div class="flex -space-x-3" data-astro-cid-yfogg3tk> ${[1, 2, 3, 4].map((i) => renderTemplate`<div class="w-10 h-10 rounded-full border-2 border-bg-primary bg-bg-secondary flex items-center justify-center overflow-hidden" data-astro-cid-yfogg3tk> <img${addAttribute(`https://i.pravatar.cc/100?img=${i + 10}`, "src")} alt="User" class="w-full h-full object-cover" data-astro-cid-yfogg3tk> </div>`)} </div> <div class="text-sm" data-astro-cid-yfogg3tk> <div class="flex items-center gap-1 text-warning" data-astro-cid-yfogg3tk> <i class="ri-star-fill" data-astro-cid-yfogg3tk></i> <i class="ri-star-fill" data-astro-cid-yfogg3tk></i> <i class="ri-star-fill" data-astro-cid-yfogg3tk></i> <i class="ri-star-fill" data-astro-cid-yfogg3tk></i> <i class="ri-star-fill" data-astro-cid-yfogg3tk></i> </div> <p class="text-text-secondary font-medium" data-astro-cid-yfogg3tk>
+500 salones confían en Orvel
</p> </div> </div> </div> <!-- Image Column --> <div class="relative lg:block hidden reveal-right stagger-3" data-astro-cid-yfogg3tk> <div class="absolute inset-0 bg-primary/20 blur-[100px] rounded-full scale-75 opacity-50" data-astro-cid-yfogg3tk></div> <div class="relative rounded-2xl border border-white/10 bg-bg-secondary/40 backdrop-blur-sm p-4 shadow-2xl overflow-hidden group" data-astro-cid-yfogg3tk> <img src="/banner1.png" alt="Orvel Dashboard Preview" class="rounded-lg w-full shadow-2xl transition-transform duration-700 group-hover:scale-[1.02]" data-astro-cid-yfogg3tk> <div class="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-transparent pointer-events-none" data-astro-cid-yfogg3tk></div> </div> <!-- Floating Elements --> <div class="absolute -bottom-6 -left-6 bg-bg-secondary border border-border p-4 rounded-xl shadow-xl animate-float max-w-[200px]" data-astro-cid-yfogg3tk> <div class="flex items-center gap-3 mb-2" data-astro-cid-yfogg3tk> <div class="w-8 h-8 rounded-full bg-success/20 text-success flex items-center justify-center" data-astro-cid-yfogg3tk> <i class="ri-check-line" data-astro-cid-yfogg3tk></i> </div> <p class="text-[10px] font-bold uppercase tracking-widest text-text-primary" data-astro-cid-yfogg3tk>
Turno Confirmado
</p> </div> <p class="text-xs text-text-secondary" data-astro-cid-yfogg3tk>
Peluquería "La Corte" — 15:30hs
</p> </div> </div> </div> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Hero.astro", void 0);

const $$Features = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="py-20 relative overflow-hidden" id="tipos"> <div class="max-w-7xl mx-auto px-8 md:px-12"> <div class="text-center mb-16"> <div class="inline-block px-3 py-1 rounded-full border border-border bg-white/5 text-[10px] font-bold tracking-widest uppercase text-text-primary mb-4">Tu especialidad, tu regla</div> <h2 class="text-4xl lg:text-5xl font-headline font-bold tracking-tight text-text-primary mb-4">Un sistema que entiende <br> tu modelo de negocio</h2> <p class="text-text-primary font-body text-base max-w-xl mx-auto">Seleccioná tu rubro y descubrí cómo Orvel aumenta tu facturación optimizando la manera en que te compran.</p> </div> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"> <!-- Peluquerías --> <a href="/auth/login?type=peluqueria" class="group relative h-80 rounded-2xl overflow-hidden block border border-border shadow-md"> <img src="https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=800" alt="Peluquerías" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"> <div class="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/60 to-transparent transition-opacity group-hover:opacity-90"></div> <div class="absolute inset-0 p-8 flex flex-col justify-end"> <div class="flex items-center justify-between"> <div> <h4 class="font-headline font-bold text-2xl text-white drop-shadow-sm tracking-tight mb-1">Peluquerías</h4> <p class="text-white/70 font-body text-xs font-medium">Llená los espacios vacíos.</p> </div> <div class="w-10 h-10 rounded-full bg-primary shadow-[0_0_15px_rgba(162,207,203,0.5)] flex items-center justify-center opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"> <i class="ri-arrow-right-line text-[#0e0e0e] text-sm font-bold"></i> </div> </div> </div> </a> <!-- Barberías --> <a href="/auth/login?type=barberia" class="group relative h-80 rounded-2xl overflow-hidden block border border-border shadow-md"> <img src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=800" alt="Barberías" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"> <div class="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/60 to-transparent transition-opacity group-hover:opacity-90"></div> <div class="absolute inset-0 p-8 flex flex-col justify-end"> <div class="flex items-center justify-between"> <div> <h4 class="font-headline font-bold text-2xl text-white drop-shadow-sm tracking-tight mb-1">Barberías</h4> <p class="text-white/70 font-body text-xs font-medium">Reservas automáticas.</p> </div> <div class="w-10 h-10 rounded-full bg-primary shadow-[0_0_15px_rgba(162,207,203,0.5)] flex items-center justify-center opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"> <i class="ri-arrow-right-line text-[#0e0e0e] text-sm font-bold"></i> </div> </div> </div> </a> <!-- Spas & Masajes --> <a href="/auth/login?type=spa" class="group relative h-80 rounded-2xl overflow-hidden block border border-border shadow-md"> <img src="https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&q=80&w=800" alt="Spas & Masajes" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"> <div class="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/60 to-transparent transition-opacity group-hover:opacity-90"></div> <div class="absolute inset-0 p-8 flex flex-col justify-end"> <div class="flex items-center justify-between"> <div> <h4 class="font-headline font-bold text-2xl text-white drop-shadow-sm tracking-tight mb-1">Spas & Masajes</h4> <p class="text-white/70 font-body text-xs font-medium">Experiencia prémium.</p> </div> <div class="w-10 h-10 rounded-full bg-primary shadow-[0_0_15px_rgba(162,207,203,0.5)] flex items-center justify-center opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"> <i class="ri-arrow-right-line text-[#0e0e0e] text-sm font-bold"></i> </div> </div> </div> </a> <!-- Salones de Uñas --> <a href="/auth/login?type=unas" class="group relative h-80 rounded-2xl overflow-hidden block border border-border shadow-md"> <img src="https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&q=80&w=800" alt="Salones de Uñas" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"> <div class="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/60 to-transparent transition-opacity group-hover:opacity-90"></div> <div class="absolute inset-0 p-8 flex flex-col justify-end"> <div class="flex items-center justify-between"> <div> <h4 class="font-headline font-bold text-2xl text-white drop-shadow-sm tracking-tight mb-1">Nail Salons</h4> <p class="text-white/70 font-body text-xs font-medium">Organización al minuto.</p> </div> <div class="w-10 h-10 rounded-full bg-primary shadow-[0_0_15px_rgba(162,207,203,0.5)] flex items-center justify-center opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"> <i class="ri-arrow-right-line text-[#0e0e0e] text-sm font-bold"></i> </div> </div> </div> </a> <!-- Estudios de Tattoo --> <a href="/auth/login?type=tattoo" class="group relative h-80 rounded-2xl overflow-hidden block border border-border shadow-md"> <img src="https://images.unsplash.com/photo-1621607512214-68297480165e?auto=format&fit=crop&q=80&w=800" alt="Estudios de Tattoo" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"> <div class="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/60 to-transparent transition-opacity group-hover:opacity-90"></div> <div class="absolute inset-0 p-8 flex flex-col justify-end"> <div class="flex items-center justify-between"> <div> <h4 class="font-headline font-bold text-2xl text-white drop-shadow-sm tracking-tight mb-1">Tattoo Studios</h4> <p class="text-white/70 font-body text-xs font-medium">Cobro de señas integradas.</p> </div> <div class="w-10 h-10 rounded-full bg-primary shadow-[0_0_15px_rgba(162,207,203,0.5)] flex items-center justify-center opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"> <i class="ri-arrow-right-line text-[#0e0e0e] text-sm font-bold"></i> </div> </div> </div> </a> <!-- Cejas y Pestañas --> <a href="/auth/login?type=cejas" class="group relative h-80 rounded-2xl overflow-hidden block border border-border shadow-md"> <img src="https://images.unsplash.com/photo-1522338242992-e1a54906a8da?auto=format&fit=crop&q=80&w=800" alt="Cejas y Pestañas" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"> <div class="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/60 to-transparent transition-opacity group-hover:opacity-90"></div> <div class="absolute inset-0 p-8 flex flex-col justify-end"> <div class="flex items-center justify-between"> <div> <h4 class="font-headline font-bold text-2xl text-white drop-shadow-sm tracking-tight mb-1">Cejas y Pestañas</h4> <p class="text-white/70 font-body text-xs font-medium">Fidelización constante.</p> </div> <div class="w-10 h-10 rounded-full bg-primary shadow-[0_0_15px_rgba(162,207,203,0.5)] flex items-center justify-center opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"> <i class="ri-arrow-right-line text-[#0e0e0e] text-sm font-bold"></i> </div> </div> </div> </a> </div> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Features.astro", void 0);

const $$Problem = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="py-20" id="el-problema"> <div class="max-w-7xl mx-auto px-8 md:px-12 text-center"> <div class="inline-block px-3 py-1 rounded-full border border-error/20 bg-error/5 text-[10px] font-bold tracking-widest uppercase text-error mb-6">El fin del caos</div> <h2 class="text-4xl md:text-5xl font-headline font-bold tracking-tighter text-text-primary mb-6 reveal">
A mayor éxito, <span class="italic text-error opacity-90 relative">peor calidad de vida</span> </h2> <p class="text-text-primary font-body text-lg max-w-2xl mx-auto mb-16 leading-relaxed reveal stagger-1">Si sos bueno en lo que hacés, tu WhatsApp explota. Terminá respondiendo mensajes en vez de descansar. No tiene que ser así.</p> <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-left mb-16"> <div class="bg-bg-secondary rounded-2xl p-8 border border-border shadow-sm reveal stagger-1"> <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center mb-6"> <i class="ri-calendar-check-line text-error text-xl"></i> </div> <h4 class="text-lg font-headline font-bold mb-2 text-text-primary">Reserva automática</h4> <p class="text-text-primary leading-relaxed text-sm">Disponibilidad en tiempo real mediante un link privado. Tus clientes reservan solos, sin que tengas que responder un solo mensaje.</p> </div> <div class="bg-bg-secondary rounded-2xl p-8 border border-border shadow-sm reveal stagger-2"> <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center mb-6"> <i class="ri-refresh-line text-error text-xl"></i> </div> <h4 class="text-lg font-headline font-bold mb-2 text-text-primary">Gestión completa</h4> <p class="text-text-primary leading-relaxed text-sm">Cancelaciones, pagos y agenda centralizada. El sistema registra cada movimiento para que te olvides de la libreta para siempre.</p> </div> <div class="bg-bg-secondary rounded-2xl p-8 border border-border shadow-sm reveal stagger-3"> <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center mb-6"> <i class="ri-whatsapp-line text-error text-xl"></i> </div> <h4 class="text-lg font-headline font-bold mb-2 text-text-primary">Recordatorios inteligentes</h4> <p class="text-text-primary leading-relaxed text-sm">Envío automático de confirmaciones y recordatorios por WhatsApp. Reduce ausencias y protege la rentabilidad de tu salón.</p> </div> </div> <p class="text-2xl md:text-3xl font-headline font-bold text-text-primary reveal">
Con Orvel, el sistema lo hace <span class="italic text-primary opacity-100 underline decoration-secondary decoration-4 underline-offset-4">todo por vos.</span> </p> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Problem.astro", void 0);

const $$Solution = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="py-20 bg-bg-primary border-y border-border" id="solucion"> <div class="max-w-7xl mx-auto px-8 md:px-12"> <div class="text-center mb-16 reveal"> <div class="inline-block px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-[10px] font-bold tracking-widest uppercase text-primary mb-4 shadow-sm">Muchas estéticas duplican sus turnos usando esto</div> <h2 class="text-4xl md:text-5xl font-headline font-bold tracking-tighter text-text-primary mb-4">Orvel no organiza tu agenda... <span class="italic text-primary opacity-90 relative">la llena.</span></h2> </div> <div class="flex flex-col md:flex-row gap-6"> <div class="flex-1 bg-bg-secondary rounded-2xl p-10 relative border border-border reveal stagger-1"> <div class="mb-6 w-10 h-1 rounded-full bg-primary"></div> <h4 class="text-2xl font-headline font-bold mb-4 text-text-primary">Agenda que se llena sola</h4> <p class="text-text-primary text-sm mb-6 leading-relaxed">Tus clientes reservan mientras vos trabajás o descansás. Convertí tu tiempo en dinero sin esfuerzo extra.</p> </div> <div class="flex-1 bg-bg-secondary rounded-2xl p-10 relative border border-border reveal stagger-2"> <div class="mb-6 w-10 h-1 rounded-full bg-primary-light"></div> <h4 class="text-2xl font-headline font-bold mb-4 text-text-primary">Más turnos, sin esfuerzo</h4> <p class="text-text-primary text-sm mb-6 leading-relaxed">Maximizá la productividad de tu salón. Permití que varios profesionales atiendan en simultáneo sin conflictos.</p> </div> <div class="flex-1 bg-bg-secondary rounded-2xl p-10 relative border border-border reveal stagger-3"> <div class="mb-6 w-10 h-1 rounded-full bg-primary"></div> <h4 class="text-2xl font-headline font-bold mb-4 text-text-primary">No pierdas más turnos</h4> <p class="text-text-primary text-sm mb-6 leading-relaxed">El sistema detecta huecos libres y te ayuda a ocuparlos, asegurando que tu salón rinda al máximo todos los días.</p> </div> </div> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Solution.astro", void 0);

const $$HowItWorks = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="py-20 bg-bg-primary" id="como-funciona"> <div class="max-w-7xl mx-auto px-8 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16 items-center"> <div> <div class="inline-block px-3 py-1 rounded-full border border-border bg-white/5 text-[10px] font-bold tracking-widest uppercase text-text-primary mb-6">Tu control</div> <h2 class="text-4xl md:text-5xl font-headline font-bold tracking-tighter text-text-primary mb-6 leading-tight">Sabé qué sigue, <br>sin estrés</h2> <p class="text-lg text-text-primary mb-10">Nuestra vista de agenda te relaja. Olvidate de las notificaciones constantes y concentrate en pulir lo que mejor hacés.</p> <div class="space-y-4"> <div class="flex items-start gap-4 p-5 glass-panel rounded-xl bg-white/5 border border-primary/20 shadow-md"> <i class="ri-shield-check-fill text-primary text-2xl"></i> <div> <p class="font-headline font-bold text-text-primary text-base">Protección de ingresos</p> <p class="text-sm text-text-primary mt-1">Cobro de seña online. Reducimos el ausentismo.</p> </div> </div> <div class="flex items-start gap-4 p-5 rounded-xl border border-border bg-bg-primary"> <i class="ri-refresh-line text-primary-light text-2xl"></i> <div> <p class="font-headline font-bold text-text-primary text-base">Sincronización Total</p> <p class="text-sm text-text-primary mt-1">Conectamos con calendarios externos para organizar tu vida.</p> </div> </div> </div> </div> <div class="relative group"> <div class="absolute -inset-6 bg-primary-light/10 blur-[60px] rounded-[3rem] opacity-0 group-hover:opacity-100 transition-opacity"></div> <img alt="Agenda Details" class="rounded-xl shadow-2xl relative z-10 border border-border transform rotate-1 group-hover:rotate-0 transition-transform duration-500" src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&q=80&w=1200"> </div> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/HowItWorks.astro", void 0);

const $$Differential = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="py-20 bg-bg-secondary relative overflow-hidden border-y border-border"> <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-bg-secondary to-bg-secondary pointer-events-none"></div> <div class="max-w-3xl mx-auto px-8 md:px-12 relative z-10 text-center"> <h2 class="text-4xl md:text-5xl font-headline font-bold tracking-tighter text-text-primary mb-6">
No es otra <span class="italic text-primary opacity-80 decoration-white/20 underline underline-offset-4">agenda más</span> </h2> <p class="text-text-primary text-lg font-body mb-10 max-w-2xl mx-auto">
Disenamos Orvel para que la fluidez gane desde el primer minuto, sin manuales complicados.
</p> <div class="flex flex-wrap justify-center gap-4 mb-12"> <span class="px-6 py-2 rounded-full border border-primary/30 bg-primary/10 text-text-primary font-headline font-semibold text-xs tracking-wide">Sin Excel</span> <span class="px-6 py-2 rounded-full border border-primary/30 bg-primary/10 text-text-primary font-headline font-semibold text-xs tracking-wide">Sin Capacitación</span> <span class="px-6 py-2 rounded-full border border-primary/30 bg-primary/10 text-text-primary font-headline font-semibold text-xs tracking-wide">Hecho para humanos</span> </div> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Differential.astro", void 0);

const $$Results = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="py-24 max-w-7xl mx-auto px-8 md:px-12 text-center" id="resultados"> <div class="inline-block px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-[10px] font-bold tracking-widest uppercase text-primary mb-6 shadow-sm">Impacto Claro</div> <h2 class="text-4xl md:text-5xl font-headline font-bold tracking-tighter text-text-primary mb-6">
Lo vas a notar <br> desde la <span class="italic text-primary opacity-80">primera semana</span> </h2> <p class="text-text-primary text-lg font-body mb-16 max-w-2xl mx-auto">
Aseguramos tus ingresos por seña y aniquilamos el trabajo repetitivo comercial que traba tu crecimiento.
</p> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left"> <div class="bg-bg-secondary rounded-2xl p-6 border border-border"> <i class="ri-line-chart-line text-primary mb-6 block text-2xl"></i> <div class="text-3xl font-headline font-bold text-text-primary mb-2">+38%</div> <div class="text-text-primary font-headline font-medium text-sm mb-2">Turnos cobrados</div> <p class="text-text-primary/70 text-xs font-body">Generás citas incluso cuando cerraste tu local.</p> </div> <div class="bg-bg-secondary rounded-2xl p-6 border border-border"> <i class="ri-time-line text-primary mb-6 block text-2xl"></i> <div class="text-3xl font-headline font-bold text-text-primary mb-2">-5h</div> <div class="text-text-primary font-headline font-medium text-sm mb-2">Libres a la semana</div> <p class="text-text-primary/70 text-xs font-body">Horas de tu vida salvadas de no responder consultas.</p> </div> <div class="bg-bg-secondary rounded-2xl p-6 border border-border"> <i class="ri-prohibited-line text-primary mb-6 block text-2xl"></i> <div class="text-3xl font-headline font-bold text-text-primary mb-2">0%</div> <div class="text-text-primary font-headline font-medium text-sm mb-2">Horarios pisados</div> <p class="text-text-primary/70 text-xs font-body">Nadie reserva cuando ya estás ocupado.</p> </div> <div class="bg-bg-secondary rounded-2xl p-6 border border-border"> <i class="ri-dashboard-line text-primary mb-6 block text-2xl"></i> <div class="text-3xl font-headline font-bold text-text-primary mb-2">1</div> <div class="text-text-primary font-headline font-medium text-sm mb-2">App principal</div> <p class="text-text-primary/70 text-xs font-body">Todo el control en la solapa de tu navegador.</p> </div> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Results.astro", void 0);

const $$Audience = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="py-24 bg-bg-primary" id="audiencia"> <div class="max-w-7xl mx-auto px-8 md:px-12"> <h2 class="text-4xl md:text-5xl font-headline font-bold tracking-tighter text-text-primary mb-12 text-center">Para quienes valoran el tiempo</h2> <div class="grid grid-cols-1 md:grid-cols-2 gap-6"> <!-- Colorful Card --> <div class="glass-panel p-10 rounded-2xl bg-gradient-to-br from-primary/20 via-tertiary/10 to-bg-bg-secondary border border-primary/40 shadow-[0_0_40px_rgba(162,207,203,0.15)] relative overflow-hidden"> <div class="absolute -top-10 -right-10 w-40 h-40 bg-primary/20 blur-3xl rounded-full"></div> <div class="absolute -bottom-10 -left-10 w-40 h-40 bg-primary-light/20 blur-3xl rounded-full"></div> <div class="relative z-10"> <div class="inline-block px-4 py-1.5 bg-gradient-to-r from-primary to-primary-hover text-on-secondary font-bold text-[10px] uppercase tracking-widest rounded-full mb-6 shadow-md">El Match Perfecto</div> <h3 class="text-3xl font-headline font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-stone-100 to-primary">Hecho para vos si...</h3> <ul class="space-y-5 text-stone-200 text-sm font-medium"> <li class="flex items-center gap-4"> <div class="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0"> <i class="ri-check-line text-primary text-sm font-black"></i> </div>
Tu tiempo es dinero, no horas de setup IT.
</li> <li class="flex items-center gap-4"> <div class="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0"> <i class="ri-check-line text-primary text-sm font-black"></i> </div>
Buscás un estatus premium visual en tu estética.
</li> <li class="flex items-center gap-4"> <div class="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0"> <i class="ri-check-line text-primary text-sm font-black"></i> </div>
Querés delegar la fricción de los cobros online.
</li> </ul> </div> </div> <!-- Muted Card --> <div class="p-10 rounded-2xl bg-bg-primary-highest border border-border opacity-90 transition-opacity"> <div class="inline-block px-3 py-1 border border-border text-text-primary/80 font-bold text-[10px] uppercase tracking-widest rounded-full mb-6">Descartado</div> <h3 class="text-3xl font-headline font-bold mb-6 text-text-primary">No somos para vos...</h3> <ul class="space-y-5 text-text-primary/80 text-sm"> <li class="flex items-center gap-4"> <span class="w-1.5 h-1.5 rounded-full bg-outline-variant shrink-0"></span>
Si amás configurar hojas de Excel super pesadas.
</li> <li class="flex items-center gap-4"> <span class="w-1.5 h-1.5 rounded-full bg-outline-variant shrink-0"></span>
Si solo aceptás billete físico en tu local.
</li> <li class="flex items-center gap-4"> <span class="w-1.5 h-1.5 rounded-full bg-outline-variant shrink-0"></span>
Si tu volumen no te exige organizarte en absoluto.
</li> </ul> </div> </div> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Audience.astro", void 0);

const $$Pricing = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Pricing;
  const { plansWithBilling } = Astro2.props;
  function getPlanButtonLabel(planCode) {
    switch (planCode) {
      case "FREE":
        return "Empezar gratis";
      case "STARTER":
        return "Elegir Starter";
      case "GROWTH":
        return "Elegir Growth";
      case "PRO":
        return "Elegir Pro";
      default:
        return "Elegir plan";
    }
  }
  return renderTemplate`${maybeRenderHead()}<section class="py-24 bg-bg-primary" id="pricing"> <div class="max-w-7xl mx-auto px-8 md:px-12"> <div class="text-center mb-12"> <div class="inline-block px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-[10px] font-bold tracking-widest uppercase text-primary mb-4 shadow-sm">Precios claros</div> <h2 class="text-4xl md:text-5xl font-headline font-bold tracking-tighter text-text-primary mb-4">Llená tu agenda sin esfuerzo</h2> <p class="text-lg text-text-primary/70 max-w-2xl mx-auto">Más turnos, menos cancelaciones. Elegí el plan que acompaña tu crecimiento.</p> </div> <!-- Billing Toggle --> <div class="flex justify-center mb-10"> <div class="bg-bg-primary rounded-full p-1.5 flex items-center gap-1 border border-border"> <button class="billing-option px-6 py-2.5 rounded-full text-xs font-headline font-bold tracking-wide transition-all bg-primary text-on-secondary" data-billing="monthly">Mensual</button> <button class="billing-option px-6 py-2.5 rounded-full text-xs font-headline font-bold tracking-wide transition-all text-text-primary" data-billing="quarterly">Trimestral (-15%)</button> <button class="billing-option px-6 py-2.5 rounded-full text-xs font-headline font-bold tracking-wide transition-all text-text-primary" data-billing="annual">Anual (-30%) <span class="text-primary text-[9px]">🔥</span></button> </div> </div> <div class="grid grid-cols-1 md:grid-cols-4 gap-6"> ${plansWithBilling.map((plan) => renderTemplate`<div${addAttribute(`plan-card p-6 rounded-xl bg-bg-primary border border-border flex flex-col hover:-translate-y-2 hover:border-primary/50 hover:shadow-xl transition-all duration-300 group cursor-pointer ${plan.is_featured ? "ring-2 ring-primary relative z-10" : ""}`, "class")}${addAttribute(plan.code, "data-plan-code")}> ${plan.is_featured && renderTemplate`<div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-secondary px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shadow-md"> <i class="ri-star-fill text-[10px]"></i> Destacado
</div>`} <div class="mb-4 mt-3"> <div class="flex items-center gap-2 mb-2"> <div${addAttribute(`w-2 h-2 rounded-full ${plan.code === "FREE" ? "bg-green-500" : plan.code === "STARTER" ? "bg-primary" : plan.code === "GROWTH" ? "bg-purple-500" : "bg-yellow-500"}`, "class")}></div> <p class="font-label text-xs uppercase tracking-widest text-text-primary font-bold">${plan.name}</p> </div> ${plan.price === 0 ? renderTemplate`<h5 class="text-3xl font-headline font-bold text-text-primary">$0</h5>` : renderTemplate`<div class="price-display"> <h5 class="text-4xl font-headline font-black text-text-primary">
$<span class="price-value">${plan.price}</span><span class="text-sm font-body text-text-primary/60 font-normal price-label">/mes</span> </h5> <p class="price-savings text-primary text-[9px] font-bold hidden">
ahorrás $<span class="savings-amount">0</span> </p> </div>`} <p class="text-text-primary/60 text-[10px] mt-1 h-8 line-clamp-2">${plan.description}</p> </div> <ul class="mb-6 space-y-3 text-text-primary text-xs flex-grow border-t border-border/50 pt-4"> ${plan.code === "FREE" && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <li class="flex items-center gap-2"><i class="ri-check-line text-green-500 font-bold"></i> 1 local</li> <li class="flex items-center gap-2"><i class="ri-check-line text-green-500 font-bold"></i> Hasta 15 turnos/mes</li> <li class="flex items-center gap-2"><i class="ri-check-line text-green-500 font-bold"></i> Reservas online</li> <li class="flex items-center gap-2"><i class="ri-check-line text-green-500 font-bold"></i> Agenda automática</li> <li class="flex items-center gap-2 text-text-primary/50"><i class="ri-close-line text-red-400"></i> Con branding Orvel</li> ` })}`} ${plan.code === "STARTER" && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <li class="flex items-center gap-2 font-bold"><i class="ri-checkbox-circle-fill text-primary"></i> 1 local</li> <li class="flex items-center gap-2 font-bold"><i class="ri-checkbox-circle-fill text-primary"></i> Turnos ilimitados</li> <li class="flex items-center gap-2 font-bold"><i class="ri-checkbox-circle-fill text-primary"></i> Link de reservas</li> <li class="flex items-center gap-2 font-bold"><i class="ri-checkbox-circle-fill text-primary"></i> Sin branding</li> ` })}`} ${plan.code === "GROWTH" && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <li class="flex items-center gap-2"><i class="ri-check-line text-purple-500 font-bold"></i> Hasta 3 locales</li> <li class="flex items-center gap-2"><i class="ri-check-line text-purple-500 font-bold"></i> Recordatorios auto</li> <li class="flex items-center gap-2"><i class="ri-check-line text-purple-500 font-bold"></i> Métricas de tu agenda</li> <li class="flex items-center gap-2"><i class="ri-check-line text-purple-500 font-bold"></i> Reportes semanales</li> ` })}`} ${plan.code === "PRO" && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <li class="flex items-center gap-2"><i class="ri-check-line text-yellow-500 font-bold"></i> Hasta 10 locales</li> <li class="flex items-center gap-2"><i class="ri-check-line text-yellow-500 font-bold"></i> Soporte prioritario</li> <li class="flex items-center gap-2"><i class="ri-check-line text-yellow-500 font-bold"></i> Reportes avanzados</li> <li class="flex items-center gap-2"><i class="ri-check-line text-yellow-500 font-bold"></i> API (opcional)</li> ` })}`} </ul> <button${addAttribute(`w-full py-2.5 rounded-full font-headline font-bold text-xs shadow-lg hover:shadow-xl transition-all active:scale-95 ${plan.is_featured ? "bg-primary text-on-secondary hover:bg-primary-hover" : "border border-border text-text-primary hover:bg-white/5"}`, "class")}${addAttribute(plan.code, "data-plan")}> ${getPlanButtonLabel(plan.code)} </button> <p class="text-[9px] text-center text-text-primary/40 mt-3 italic"> ${plan.code === "FREE" && "Probalo sin riesgo."} ${plan.code === "STARTER" && "Con solo 3 turnos más, se paga solo."} ${plan.code === "GROWTH" && "Reducí hasta un 30% las cancelaciones."} ${plan.code === "PRO" && "Control total para escalar sin fricción."} </p> </div>`)} </div> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Pricing.astro", void 0);

const $$CTA = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="relative py-24 overflow-hidden mx-auto max-w-7xl px-8 md:px-12 mb-20" id="registro"> <div class="bg-gradient-to-br from-[#121614] to-[#0A0D0B] rounded-3xl p-12 md:p-20 text-center relative overflow-hidden border border-primary/20 shadow-xl group"> <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-1000"></div> <div class="inline-block px-3 py-1 rounded-full bg-white/5 border border-border text-[10px] font-bold tracking-widest uppercase text-stone-300 mb-6 backdrop-blur-md relative z-10">Activá Tu Negocio Hoy</div> <h1 class="text-5xl md:text-6xl font-headline font-bold tracking-tight text-white mb-6 relative z-10 drop-shadow-md leading-tight">
Detené el <span class="italic text-primary">caos.</span> <br>
Subí el nivel.
</h1> <p class="text-text-primary text-lg font-body mb-8 max-w-2xl mx-auto relative z-10">
En 5 minutos tu link de reservas estará activo y listo para cobrar pagos por seña.
</p> <div class="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10"> <button class="bg-primary text-on-secondary px-8 py-4 rounded-full font-headline font-bold text-lg hover:scale-105 hover:shadow-[0_0_20px_rgba(162,207,203,0.4)] transition-all flex items-center justify-center gap-2">
Activar Pro Gratis <i class="ri-rocket-line text-base"></i> </button> <button class="px-6 py-4 rounded-full font-headline font-medium text-sm text-white border border-white/20 hover:bg-white/10 hover:scale-105 transition-all flex items-center justify-center gap-2">
Ver Tutorial <i class="ri-play-circle-line text-base"></i> </button> </div> <p class="text-text-primary/70 text-xs mt-6 font-body relative z-10 flex items-center justify-center gap-1.5"> <i class="ri-lock-line text-[10px]"></i> Tarjeta no requerida para probar.
</p> </div> </section>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/CTA.astro", void 0);

const $$Footer = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<footer class="bg-[#0e0e0e] w-full pt-16 pb-8 border-t border-border mt-auto"> <div class="max-w-7xl mx-auto px-8 md:px-12 flex flex-col md:flex-row justify-between items-center opacity-80 hover:opacity-100 transition-opacity"> <div class="mb-6 md:mb-0 text-center md:text-left"> <div class="text-xl font-bold text-stone-100 font-headline mb-2">Orvel</div> <p class="font-body text-[10px] uppercase tracking-widest text-stone-500 font-medium">© 2026 Orvel.</p> </div> <div class="flex flex-wrap justify-center gap-6"> <a class="font-body text-[10px] uppercase tracking-widest text-stone-400 font-semibold hover:text-primary transition-colors" href="#">Ayuda</a> <a class="font-body text-[10px] uppercase tracking-widest text-stone-400 font-semibold hover:text-primary transition-colors" href="#">Precios</a> <a class="font-body text-[10px] uppercase tracking-widest text-stone-400 font-semibold hover:text-primary transition-colors" href="#">Legal</a> </div> </div> <div class="mt-8 border-t border-border pt-8 max-w-7xl mx-auto px-8 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left"> <p class="text-stone-600 text-xs font-body">Cordoba, Argentina.</p> <div class="inline-flex space-x-6 opacity-60 hover:opacity-100 transition-opacity"> <a href="#" aria-label="Instagram" class="hover:text-primary transition-colors"><i class="ri-instagram-line text-xl"></i></a> <a href="#" aria-label="Twitter" class="hover:text-primary transition-colors"><i class="ri-twitter-x-line text-xl"></i></a> </div> </div> </footer>`;
}, "/home/santid/santi/orvel-landing/src/components/organisms/Footer.astro", void 0);

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));
var _a;
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  let plans = await getActivePlans();
  const plansWithBilling = plans.map((p) => calculateBillingPrices(p));
  return renderTemplate(_a || (_a = __template(["<script>(function(){", "\n// Store plans data for client-side use\nconst PLANS_DATA = plansData;\n\n// Billing toggle state\nlet currentBillingPeriod = 'monthly';\n\n// Update prices based on billing period\nfunction updatePrices(period) {\n  currentBillingPeriod = period;\n  \n  // Update button states\n  document.querySelectorAll('.billing-option').forEach(btn => {\n    if (btn.dataset.billing === period) {\n      btn.classList.add('bg-primary', 'text-on-secondary');\n      btn.classList.remove('text-text-primary');\n    } else {\n      btn.classList.remove('bg-primary', 'text-on-secondary');\n      btn.classList.add('text-text-primary');\n    }\n  });\n\n  // Update all price displays\n  document.querySelectorAll('.plan-card').forEach(card => {\n    const planCode = card.dataset.planCode;\n    const plan = PLANS_DATA.find(p => p.code === planCode);\n    if (!plan) return;\n\n    // Hide FREE plan if not monthly\n    if (planCode === 'FREE') {\n      if (period !== 'monthly') {\n        card.classList.add('hidden');\n      } else {\n        card.classList.remove('hidden');\n      }\n      return;\n    }\n\n    let price = 0;\n    let savings = 0;\n    let billingLabel = '';\n\n    switch (period) {\n      case 'monthly':\n        price = plan.price;\n        billingLabel = '/mes';\n        break;\n      case 'quarterly':\n        price = plan.quarterly_price;\n        billingLabel = '/trimestre';\n        savings = (plan.price * 3) - plan.quarterly_price;\n        break;\n      case 'annual':\n        price = plan.annual_price;\n        billingLabel = '/año';\n        savings = (plan.price * 12) - plan.annual_price;\n        break;\n    }\n\n    const priceEl = card.querySelector('.price-value');\n    const labelEl = card.querySelector('.price-label');\n    const savingsEl = card.querySelector('.price-savings');\n    const savingsAmountEl = card.querySelector('.savings-amount');\n\n    if (priceEl) priceEl.textContent = price;\n    if (labelEl) labelEl.textContent = billingLabel;\n    \n    if (savings > 0 && savingsEl && savingsAmountEl) {\n      savingsAmountEl.textContent = savings;\n      savingsEl.classList.remove('hidden');\n    } else if (savingsEl) {\n      savingsEl.classList.add('hidden');\n    }\n  });\n}\n\n// Handle plan selection\nasync function handlePlanSelection(planCode) {\n  const plan = PLANS_DATA.find(p => p.code === planCode);\n  if (!plan) {\n    console.error('Plan not found:', planCode);\n    return;\n  }\n\n  // For free plan, redirect to signup\n  if (plan.price === 0) {\n    window.location.href = '/auth/signup/plan?plan=FREE';\n    return;\n  }\n\n  // For paid plans, check authentication first\n  const sessionData = localStorage.getItem('orvel.session.v1');\n  if (!sessionData) {\n    // Redirect to login with plan selection\n    window.location.href = `/auth/login?plan=${planCode}&returnTo=/auth/signup/plan`;\n    return;\n  }\n\n  // Show loading state\n  const button = document.querySelector(`[data-plan=\"${planCode}\"]`);\n  const originalText = button?.textContent;\n  if (button) {\n    button.textContent = 'Procesando...';\n    button.disabled = true;\n  }\n\n  try {\n    const result = await createSubscription(planCode);\n    \n    if (!result.success) {\n      alert(result.error || 'Error al procesar suscripción');\n      if (button) {\n        button.textContent = originalText;\n        button.disabled = false;\n      }\n      return;\n    }\n\n    // Free plan: subscription already created\n    if (!result.init_point) {\n      window.location.href = '/dashboard';\n      return;\n    }\n\n    // Redirect to Mercado Pago\n    window.location.href = result.init_point;\n  } catch (err) {\n    console.error('Subscription error:', err);\n    alert('Error de conexión. Intentá nuevamente.');\n    if (button) {\n      button.textContent = originalText;\n      button.disabled = false;\n    }\n  }\n}\n\n// Initialize billing toggle\ndocument.addEventListener('DOMContentLoaded', () => {\n  updatePrices('monthly');\n\n  // Billing toggle handlers\n  document.querySelectorAll('.billing-option').forEach(btn => {\n    btn.addEventListener('click', () => {\n      updatePrices(btn.dataset.billing);\n    });\n  });\n\n  // Plan button handlers\n  document.querySelectorAll('[data-plan]').forEach(btn => {\n    btn.addEventListener('click', () => {\n      handlePlanSelection(btn.dataset.plan);\n    });\n  });\n});\n})();<\/script> ", ""], ["<script>(function(){", "\n// Store plans data for client-side use\nconst PLANS_DATA = plansData;\n\n// Billing toggle state\nlet currentBillingPeriod = 'monthly';\n\n// Update prices based on billing period\nfunction updatePrices(period) {\n  currentBillingPeriod = period;\n  \n  // Update button states\n  document.querySelectorAll('.billing-option').forEach(btn => {\n    if (btn.dataset.billing === period) {\n      btn.classList.add('bg-primary', 'text-on-secondary');\n      btn.classList.remove('text-text-primary');\n    } else {\n      btn.classList.remove('bg-primary', 'text-on-secondary');\n      btn.classList.add('text-text-primary');\n    }\n  });\n\n  // Update all price displays\n  document.querySelectorAll('.plan-card').forEach(card => {\n    const planCode = card.dataset.planCode;\n    const plan = PLANS_DATA.find(p => p.code === planCode);\n    if (!plan) return;\n\n    // Hide FREE plan if not monthly\n    if (planCode === 'FREE') {\n      if (period !== 'monthly') {\n        card.classList.add('hidden');\n      } else {\n        card.classList.remove('hidden');\n      }\n      return;\n    }\n\n    let price = 0;\n    let savings = 0;\n    let billingLabel = '';\n\n    switch (period) {\n      case 'monthly':\n        price = plan.price;\n        billingLabel = '/mes';\n        break;\n      case 'quarterly':\n        price = plan.quarterly_price;\n        billingLabel = '/trimestre';\n        savings = (plan.price * 3) - plan.quarterly_price;\n        break;\n      case 'annual':\n        price = plan.annual_price;\n        billingLabel = '/año';\n        savings = (plan.price * 12) - plan.annual_price;\n        break;\n    }\n\n    const priceEl = card.querySelector('.price-value');\n    const labelEl = card.querySelector('.price-label');\n    const savingsEl = card.querySelector('.price-savings');\n    const savingsAmountEl = card.querySelector('.savings-amount');\n\n    if (priceEl) priceEl.textContent = price;\n    if (labelEl) labelEl.textContent = billingLabel;\n    \n    if (savings > 0 && savingsEl && savingsAmountEl) {\n      savingsAmountEl.textContent = savings;\n      savingsEl.classList.remove('hidden');\n    } else if (savingsEl) {\n      savingsEl.classList.add('hidden');\n    }\n  });\n}\n\n// Handle plan selection\nasync function handlePlanSelection(planCode) {\n  const plan = PLANS_DATA.find(p => p.code === planCode);\n  if (!plan) {\n    console.error('Plan not found:', planCode);\n    return;\n  }\n\n  // For free plan, redirect to signup\n  if (plan.price === 0) {\n    window.location.href = '/auth/signup/plan?plan=FREE';\n    return;\n  }\n\n  // For paid plans, check authentication first\n  const sessionData = localStorage.getItem('orvel.session.v1');\n  if (!sessionData) {\n    // Redirect to login with plan selection\n    window.location.href = \\`/auth/login?plan=\\${planCode}&returnTo=/auth/signup/plan\\`;\n    return;\n  }\n\n  // Show loading state\n  const button = document.querySelector(\\`[data-plan=\"\\${planCode}\"]\\`);\n  const originalText = button?.textContent;\n  if (button) {\n    button.textContent = 'Procesando...';\n    button.disabled = true;\n  }\n\n  try {\n    const result = await createSubscription(planCode);\n    \n    if (!result.success) {\n      alert(result.error || 'Error al procesar suscripción');\n      if (button) {\n        button.textContent = originalText;\n        button.disabled = false;\n      }\n      return;\n    }\n\n    // Free plan: subscription already created\n    if (!result.init_point) {\n      window.location.href = '/dashboard';\n      return;\n    }\n\n    // Redirect to Mercado Pago\n    window.location.href = result.init_point;\n  } catch (err) {\n    console.error('Subscription error:', err);\n    alert('Error de conexión. Intentá nuevamente.');\n    if (button) {\n      button.textContent = originalText;\n      button.disabled = false;\n    }\n  }\n}\n\n// Initialize billing toggle\ndocument.addEventListener('DOMContentLoaded', () => {\n  updatePrices('monthly');\n\n  // Billing toggle handlers\n  document.querySelectorAll('.billing-option').forEach(btn => {\n    btn.addEventListener('click', () => {\n      updatePrices(btn.dataset.billing);\n    });\n  });\n\n  // Plan button handlers\n  document.querySelectorAll('[data-plan]').forEach(btn => {\n    btn.addEventListener('click', () => {\n      handlePlanSelection(btn.dataset.plan);\n    });\n  });\n});\n})();<\/script> ", ""])), defineScriptVars({ plansData: plansWithBilling }), renderComponent($$result, "Layout", $$Layout, { "title": "Orvel - Probalo hoje No necesitás aprender nada." }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Header", $$Header, {})} ${renderComponent($$result2, "Hero", $$Hero, {})} ${renderComponent($$result2, "Features", $$Features, {})} ${renderComponent($$result2, "Problem", $$Problem, {})} ${renderComponent($$result2, "Solution", $$Solution, {})} ${renderComponent($$result2, "HowItWorks", $$HowItWorks, {})} ${renderComponent($$result2, "Differential", $$Differential, {})} ${renderComponent($$result2, "Results", $$Results, {})} ${renderComponent($$result2, "Audience", $$Audience, {})} ${renderComponent($$result2, "Pricing", $$Pricing, { "plansWithBilling": plansWithBilling })} ${renderComponent($$result2, "CTA", $$CTA, {})} ${renderComponent($$result2, "Footer", $$Footer, {})} ` }));
}, "/home/santid/santi/orvel-landing/src/pages/index.astro", void 0);

const $$file = "/home/santid/santi/orvel-landing/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

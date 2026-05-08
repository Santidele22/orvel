import { c as createComponent } from './astro-component_rBFDG-4w.mjs';
import { l as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_pp2NYhb9.mjs';
import { $ as $$Layout, r as renderScript } from './Layout_DGgiDipu.mjs';

const $$OnboardingCallback = createComponent(async ($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Orvel - Conectando Google" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<main class="flex min-h-screen w-full items-center justify-center bg-[#0e0e0e] px-8"> <section class="max-w-md rounded-2xl border border-[#dcc1b4]/20 bg-[#1c1b1b] p-8 text-center shadow-2xl shadow-black/30"> <p class="mb-4 text-[10px] uppercase tracking-[0.2em] text-[#dcc1b4]">Google OAuth</p> <h1 class="mb-3 font-headline text-3xl font-bold tracking-tighter text-text-primary">Preparando tu atelier</h1> <p id="oauthCallbackStatus" class="text-sm font-light text-text-primary">Validando tu cuenta y recuperando el plan seleccionado…</p> </section> </main> ` })} ${renderScript($$result, "/home/santid/santi/orvel-landing/src/pages/auth/oauth/onboarding-callback.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/santid/santi/orvel-landing/src/pages/auth/oauth/onboarding-callback.astro", void 0);

const $$file = "/home/santid/santi/orvel-landing/src/pages/auth/oauth/onboarding-callback.astro";
const $$url = "/auth/oauth/onboarding-callback";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$OnboardingCallback,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

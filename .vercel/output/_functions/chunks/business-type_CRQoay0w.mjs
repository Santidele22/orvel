import { c as createComponent } from './astro-component_rBFDG-4w.mjs';
import { l as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_pp2NYhb9.mjs';
import { $ as $$Layout, r as renderScript } from './Layout_DGgiDipu.mjs';

const $$BusinessType = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Orvel - Tipo de negocio" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<main class="flex min-h-screen w-full items-center justify-center bg-bg-primary px-8"> <section class="max-w-md rounded-lg border border-border bg-bg-secondary p-12 text-center shadow-2xl"> <div class="mb-6 flex justify-center"> <div class="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div> </div> <p class="mb-2 text-[10px] uppercase tracking-[0.2em] text-primary font-bold">Personalización</p> <h1 class="mb-3 font-headline text-3xl font-black tracking-tighter text-text-primary">Configurando tu espacio</h1> <p class="text-sm font-body text-text-secondary">Estamos preparando tu dashboard personalizado. Un momento por favor...</p> </section> </main> ` })} ${renderScript($$result, "/home/santid/santi/orvel-landing/src/pages/auth/signup/business-type.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/santid/santi/orvel-landing/src/pages/auth/signup/business-type.astro", void 0);

const $$file = "/home/santid/santi/orvel-landing/src/pages/auth/signup/business-type.astro";
const $$url = "/auth/signup/business-type";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$BusinessType,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

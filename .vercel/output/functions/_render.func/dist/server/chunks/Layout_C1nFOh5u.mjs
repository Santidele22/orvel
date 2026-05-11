import { c as createComponent } from './astro-component_Cnwy2PEp.mjs';
import { p as createRenderInstruction, r as renderTemplate, q as renderSlot, v as renderHead, h as addAttribute } from './entrypoint_D6LB6xrT.mjs';

async function renderScript(result, id) {
  const inlined = result.inlinedScripts.get(id);
  let content = "";
  if (inlined != null) {
    if (inlined) {
      content = `<script type="module">${inlined}</script>`;
    }
  } else {
    const resolved = await result.resolve(id);
    content = `<script type="module" src="${result.userAssetsBase ? (result.base === "/" ? "" : result.base) + result.userAssetsBase : ""}${resolved}"></script>`;
  }
  return createRenderInstruction({ type: "script", id, content });
}

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Layout;
  const { title } = Astro2.props;
  return renderTemplate(_a || (_a = __template(['<html lang="es" class="dark"> <head><meta charset="UTF-8"><meta name="description" content="Gestioná tus turnos, cobros y clientes con una interfaz que se siente natural. El atelier digital para tu negocio."><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta name="generator"', '><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><title>', "</title>", '</head> <body class="bg-bg-primary text-text-primary antialiased"> ', ' <!-- Lenis Smooth Scroll & Reveal Script --> <script src="https://unpkg.com/@studio-freight/lenis@1.0.42/dist/lenis.min.js"><\/script> ', " </body> </html>"])), addAttribute(Astro2.generator, "content"), title, renderHead(), renderSlot($$result, $$slots["default"]), renderScript($$result, "/home/santid/santi/orvel-landing/src/layouts/Layout.astro?astro&type=script&index=0&lang.ts"));
}, "/home/santid/santi/orvel-landing/src/layouts/Layout.astro", void 0);

export { $$Layout as $, renderScript as r };

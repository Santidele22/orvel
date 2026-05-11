import { c as createComponent } from './astro-component_Cnwy2PEp.mjs';
import { l as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_D6LB6xrT.mjs';
import { $ as $$Layout, r as renderScript } from './Layout_C1nFOh5u.mjs';

const $$Login = createComponent(async ($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Orvel - Iniciar Sesión" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<main class="flex min-h-screen w-full bg-bg-primary"> <!-- Left Side: Imagery --> <section class="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-bg-secondary flex-col justify-end p-12 lg:p-24"> <div class="absolute inset-0 z-10 bg-gradient-to-t from-bg-primary via-bg-primary/20 to-transparent opacity-90"></div> <img src="/banner2.png" alt="Orvel Dashboard" class="absolute inset-0 w-full h-full object-cover scale-110 blur-[1px] opacity-70"> <div class="relative z-20 space-y-4"> <div class="inline-block px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-[10px] font-bold tracking-widest uppercase text-primary mb-2 shadow-sm">Atelier Digital</div> <h2 class="text-5xl lg:text-6xl font-headline font-black text-text-primary leading-[1.05] max-w-md tracking-tighter">
Gestioná con <br> excelencia.
</h2> <p class="text-text-secondary text-lg font-body max-w-sm">
Entrá a tu panel y tomá el control total de tu agenda, cobros y clientes.
</p> </div> </section> <!-- Right Side: Login Form --> <section class="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 relative z-10"> <div class="max-w-md w-full mx-auto md:mx-0 lg:ml-0"> <header class="mb-10 text-center lg:text-left"> <h1 class="text-4xl md:text-5xl font-headline font-black tracking-tighter text-text-primary mb-2 leading-[1.1]">
Bienvenido.
</h1> <p class="text-text-secondary text-base font-body">
Ingresá tus credenciales para continuar.
</p> </header> <form id="loginForm" class="space-y-6" novalidate> <div class="group"> <label class="block text-[10px] uppercase tracking-[0.2em] text-text-secondary mb-2 ml-1 font-bold">Email</label> <input id="email" name="email" type="email" autocomplete="username" required class="input" placeholder="ejemplo@negocio.com"> </div> <div class="group"> <div class="flex items-center justify-between mb-2 ml-1"> <label class="block text-[10px] uppercase tracking-[0.2em] text-text-secondary font-bold">Contraseña</label> <a href="/auth/recovery" class="text-[10px] uppercase tracking-[0.2em] text-primary hover:text-primary-light transition-colors">¿Olvidaste?</a> </div> <input id="password" name="password" type="password" autocomplete="current-password" required class="input" placeholder="•••••••••"> </div> <p id="loginError" class="hidden text-xs text-error font-medium" aria-live="polite"></p> <button type="submit" class="w-full btn btn-primary py-4 rounded-full uppercase tracking-widest text-xs shadow-xl shadow-primary/20">
Entrar al Dashboard
</button> <div class="relative flex items-center py-4"> <div class="flex-grow border-t border-border"></div> <span class="flex-shrink-0 mx-4 text-[10px] font-headline uppercase tracking-[0.2em] text-text-secondary">O</span> <div class="flex-grow border-t border-border"></div> </div> <button type="button" id="googleBtn" class="flex items-center justify-center gap-3 w-full btn btn-secondary py-4 rounded-full uppercase tracking-widest text-xs"> <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"> <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path> <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path> <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path> <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path> </svg>
Continuar con Google
</button> </form> <footer class="mt-12 text-center lg:text-left"> <p class="text-sm text-text-secondary font-body">
¿No tenés cuenta? <a href="/auth/signup/plan" class="text-primary font-bold hover:underline">Registrate gratis</a> </p> </footer> </div> </section> </main> ` })} ${renderScript($$result, "/home/santid/santi/orvel-landing/src/pages/auth/login.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/santid/santi/orvel-landing/src/pages/auth/login.astro", void 0);

const $$file = "/home/santid/santi/orvel-landing/src/pages/auth/login.astro";
const $$url = "/auth/login";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Login,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

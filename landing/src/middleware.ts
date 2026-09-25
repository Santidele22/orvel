import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname === '/auth/signup/credentials') {
    const accountUrl = new URL(context.url);
    accountUrl.pathname = '/auth/signup/account';
    return context.redirect(accountUrl.toString(), 302);
  }

  return next();
});

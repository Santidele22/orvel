import { approvePremium } from './billing/application/approve-premium';
import { listPendingPremium } from './billing/application/list-pending-premium';
import { BUSINESS_NOT_MATERIALIZED, createPremiumQueueAdapter } from './billing/infrastructure/supabase-premium-queue-adapter';
import { renderQueue } from './billing/presentation/render-queue';
import { resolveOperatorGate } from './identity/application/resolve-operator-gate';
import { createSupabaseAuthAdapter } from './identity/infrastructure/supabase-auth-adapter';
import { createOperatorSupabaseClient } from './identity/infrastructure/supabase-browser-client';
import { renderLogin } from './identity/presentation/render-login';
import { renderNotFound } from './identity/presentation/render-not-found';
import './styles.css';

const root = document.querySelector('#app');

if (!(root instanceof HTMLElement)) {
  throw new Error('Missing #app');
}

const client = createOperatorSupabaseClient();
const auth = createSupabaseAuthAdapter(client);
const queue = createPremiumQueueAdapter(client);

let busyId: string | null = null;
let notice: string | null = null;

async function render(): Promise<void> {
  const session = await auth.getSession();
  const gate = resolveOperatorGate(session);

  if (gate.kind === 'login') {
    renderLogin(root, async (email, password) => {
      const { errorMessage } = await auth.signInWithPassword(email, password);
      if (errorMessage) {
        return 'No se pudo iniciar sesión.';
      }
      await render();
      return null;
    });
    return;
  }

  if (gate.kind === 'not-found') {
    renderNotFound(root);
    return;
  }

  try {
    const rows = await listPendingPremium(queue);
    renderQueue(root, {
      rows,
      busyId,
      notice,
      onApprove: async (requestId) => {
        busyId = requestId;
        notice = null;
        await render();
        try {
          const current = rows.find((row) => row.id === requestId);
          await approvePremium(queue, current ?? {
            id: requestId,
            who: 'Alta pendiente',
            whatTheyAsked: 'PREMIUM',
            status: 'pending',
            when: new Date().toISOString(),
            accountExists: false,
          });
        } catch (error) {
          notice =
            error instanceof Error && error.message === BUSINESS_NOT_MATERIALIZED
              ? 'La cuenta todavía no existe. No se puede activar Premium sin un negocio creado.'
              : 'No se pudo aceptar la solicitud.';
        } finally {
          busyId = null;
          await render();
        }
      },
      onSignOut: async () => {
        await auth.signOut();
        notice = null;
        await render();
      },
    });
  } catch {
    renderNotFound(root);
  }
}

void render();

import type { PendingPremiumRequest } from '../domain/pending-premium-request';

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('es-AR');
}

export function renderQueue(
  root: HTMLElement,
  input: {
    rows: readonly PendingPremiumRequest[];
    busyId: string | null;
    notice: string | null;
    onApprove: (requestId: string) => void;
    onSignOut: () => void;
  },
): void {
  const rows = input.rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.who)}</td>
          <td>${escapeHtml(row.whatTheyAsked)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(formatWhen(row.when))}</td>
          <td>${row.accountExists ? 'Sí' : 'No'}</td>
          <td>
            <button
              type="button"
              data-approve="${escapeHtml(row.id)}"
              ${input.busyId === row.id ? 'disabled' : ''}
            >
              Aceptar
            </button>
          </td>
        </tr>
      `,
    )
    .join('');

  root.innerHTML = `
    <main class="panel queue">
      <header class="queue-header">
        <h1>Solicitudes Premium</h1>
        <button type="button" class="sign-out">Salir</button>
      </header>
      ${input.notice ? `<p class="notice">${escapeHtml(input.notice)}</p>` : ''}
      ${
        input.rows.length === 0
          ? '<p class="empty">No hay solicitudes pendientes.</p>'
          : `
            <table>
              <thead>
                <tr>
                  <th>Quién</th>
                  <th>Qué pidió</th>
                  <th>Estado</th>
                  <th>Cuándo</th>
                  <th>¿Existe cuenta?</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          `
      }
    </main>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-approve]').forEach((button) => {
    button.addEventListener('click', () => {
      const requestId = button.dataset.approve;
      if (requestId) {
        input.onApprove(requestId);
      }
    });
  });

  root.querySelector('.sign-out')?.addEventListener('click', () => {
    input.onSignOut();
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderLogin(
  root: HTMLElement,
  onSubmit: (email: string, password: string) => Promise<string | null>,
): void {
  root.innerHTML = `
    <main class="panel">
      <h1>Iniciar sesión</h1>
      <form class="login-form">
        <label>
          Correo
          <input name="email" type="email" autocomplete="username" required />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <p class="error" hidden></p>
        <button type="submit">Entrar</button>
      </form>
    </main>
  `;

  const form = root.querySelector('form');
  const errorEl = root.querySelector('.error');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    const error = await onSubmit(email, password);
    if (errorEl instanceof HTMLElement) {
      errorEl.hidden = !error;
      errorEl.textContent = error ?? '';
    }
  });
}

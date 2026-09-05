export function renderNotFound(root: HTMLElement): void {
  root.innerHTML = `
    <main class="panel">
      <h1>No encontrado</h1>
      <p>La página no existe.</p>
    </main>
  `;
}

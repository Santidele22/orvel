export function initPreloader(): void {
  if (typeof document === 'undefined') return;

  const hideSkeleton = () => {
    const loader = document.getElementById('orvel-skeleton-loader');
    if (!loader) return;

    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      loader.style.opacity = '0';
      document.body.style.overflow = '';
      window.setTimeout(() => loader.remove(), 700);
    }, 300);
  };

  if (document.readyState === 'complete') {
    hideSkeleton();
  } else {
    window.addEventListener('load', hideSkeleton, { once: true });
  }
}

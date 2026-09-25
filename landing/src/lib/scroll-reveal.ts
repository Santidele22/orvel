export function initScrollReveal(): void {
  if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('active');
    });
  }, {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  });

  const setupObserver = () => {
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach((element) => {
      observer.observe(element);
    });
  };

  setupObserver();
  document.addEventListener('astro:page-load', setupObserver);
}

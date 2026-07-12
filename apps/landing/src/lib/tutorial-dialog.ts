type DialogRoot = Pick<Document, 'querySelector' | 'body'>;

const activeInitializers = new WeakMap<object, () => void>();

export function initTutorialDialog(root: DialogRoot = document): () => void {
  const existingDestroy = activeInitializers.get(root as object);
  if (existingDestroy) return existingDestroy;

  const trigger = root.querySelector<HTMLAnchorElement>('[data-tutorial-open]');
  const dialog = root.querySelector<HTMLDialogElement>('[data-tutorial-dialog]');
  const closeButton = root.querySelector<HTMLButtonElement>('[data-tutorial-close]');
  const video = root.querySelector<HTMLVideoElement>('[data-tutorial-video]');
  const errorPanel = root.querySelector<HTMLElement>('[data-tutorial-error]');
  const errorMessage = root.querySelector<HTMLElement>('[data-tutorial-error-message]');
  const retryButton = root.querySelector<HTMLButtonElement>('[data-tutorial-retry]');

  if (!trigger || !dialog || !closeButton || !video || !errorPanel || !errorMessage || !retryButton) {
    return () => {};
  }

  let returnFocus: HTMLElement | null = null;
  let previousOverflow = '';

  const closeDialog = () => {
    if (dialog.open) dialog.close();
  };

  const loadVideo = () => {
    errorPanel.hidden = true;
    const source = video.dataset.src;
    if (source && video.getAttribute('src') !== source) video.setAttribute('src', source);
    video.load();
  };

  const handleOpen = (event: MouseEvent) => {
    if (typeof dialog.showModal !== 'function') return;

    try {
      dialog.showModal();
    } catch {
      return;
    }

    event.preventDefault();
    returnFocus = trigger;
    previousOverflow = root.body.style.overflow;
    root.body.style.overflow = 'hidden';
    loadVideo();
    closeButton.focus();
  };

  const handleCancel = (event: Event) => {
    event.preventDefault();
    closeDialog();
  };

  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === dialog) closeDialog();
  };

  const handleClose = () => {
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      // Some browsers reject seeking before metadata is available.
    }
    root.body.style.overflow = previousOverflow;
    returnFocus?.focus();
  };

  const handleVideoError = () => {
    errorMessage.textContent = 'No pudimos cargar el tutorial. Revisá tu conexión o abrilo directamente.';
    errorPanel.hidden = false;
    retryButton.focus();
  };

  const handleRetry = () => {
    loadVideo();
  };

  const handleVideoReady = () => {
    errorPanel.hidden = true;
  };

  trigger.addEventListener('click', handleOpen);
  closeButton.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', handleCancel);
  dialog.addEventListener('click', handleBackdropClick);
  dialog.addEventListener('close', handleClose);
  video.addEventListener('error', handleVideoError);
  video.addEventListener('loadeddata', handleVideoReady);
  retryButton.addEventListener('click', handleRetry);

  const destroy = () => {
    if (dialog.open) dialog.close();
    trigger.removeEventListener('click', handleOpen);
    closeButton.removeEventListener('click', closeDialog);
    dialog.removeEventListener('cancel', handleCancel);
    dialog.removeEventListener('click', handleBackdropClick);
    dialog.removeEventListener('close', handleClose);
    video.removeEventListener('error', handleVideoError);
    video.removeEventListener('loadeddata', handleVideoReady);
    retryButton.removeEventListener('click', handleRetry);
    activeInitializers.delete(root as object);
  };

  activeInitializers.set(root as object, destroy);
  return destroy;
}

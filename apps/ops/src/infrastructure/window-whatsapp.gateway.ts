import type { WhatsAppGateway } from '../application/ports/whatsapp-gateway';

export class WindowWhatsAppGateway implements WhatsAppGateway {
  constructor(private readonly opener: (url: string) => void = defaultOpen) {}

  async open(url: string): Promise<void> {
    this.opener(url);
  }
}

function defaultOpen(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

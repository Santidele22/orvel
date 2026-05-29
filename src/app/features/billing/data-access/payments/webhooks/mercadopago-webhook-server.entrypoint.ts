type WebhookRequestInput = {
  headers: Record<string, string>;
  rawBody: string;
  nowIso: string;
};

type WebhookResponse = {
  status: number;
  body: unknown;
};

export function registerMercadoPagoWebhookRoute(deps: {
  registerRoute: (route: {
    method: 'POST';
    path: '/api/payments/webhooks/mercadopago';
    handler: (input: WebhookRequestInput) => Promise<WebhookResponse>;
  }) => void;
  handleWebhook: (input: WebhookRequestInput) => Promise<WebhookResponse>;
}) {
  deps.registerRoute({
    method: 'POST',
    path: '/api/payments/webhooks/mercadopago',
    handler: async (input) => deps.handleWebhook(input)
  });
}

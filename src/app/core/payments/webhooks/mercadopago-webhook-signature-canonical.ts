type CanonicalInput = {
  dataId: string;
  requestId: string;
  ts: string;
};

function normalize(value: string): string {
  return value.trim().normalize('NFC');
}

export function buildMercadoPagoCanonicalString(input: CanonicalInput): string {
  const dataId = normalize(input.dataId);
  const requestId = normalize(input.requestId).toLowerCase();
  const ts = normalize(input.ts);

  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

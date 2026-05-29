const MAX_CORRELATION_ID_LENGTH = 64
const SAFE_CORRELATION_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,64}$/
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/
const UNSAFE_CHARS_PATTERN = /[^a-zA-Z0-9._:-]/g

export function canonicalizeMercadoPagoCorrelationId(rawCorrelationId: string): string {
  if (CONTROL_CHAR_PATTERN.test(rawCorrelationId)) {
    throw new Error('Invalid correlationId: control characters are not allowed')
  }

  const canonical = rawCorrelationId.trim().replace(UNSAFE_CHARS_PATTERN, '_').slice(0, MAX_CORRELATION_ID_LENGTH)

  if (!SAFE_CORRELATION_ID_PATTERN.test(canonical)) {
    throw new Error('Invalid correlationId: expected [a-zA-Z0-9._:-] and max length 64')
  }

  return canonical
}

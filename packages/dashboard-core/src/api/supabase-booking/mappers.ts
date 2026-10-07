export type PublicTurneroDisabledMapping = {
  status: 422;
  code: 'PUBLIC_TURNERO_DISABLED';
  message: 'Public booking is temporarily unavailable.';
};

export function mapPublicTurneroDisabledError(error: {
  code?: string | null;
  message?: string | null;
}): PublicTurneroDisabledMapping | null {
  const searchable = `${error.code ?? ''} ${error.message ?? ''}`;
  if (!searchable.includes('PUBLIC_TURNERO_DISABLED')) {
    return null;
  }

  return {
    status: 422,
    code: 'PUBLIC_TURNERO_DISABLED',
    message: 'Public booking is temporarily unavailable.'
  };
}

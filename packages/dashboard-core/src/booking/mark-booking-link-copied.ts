export type MarkBookingLinkCopiedClient = {
  rpc: (
    fn: 'mark_booking_link_copied',
    args: { p_business_id: string },
  ) => PromiseLike<unknown>;
};

export async function markBookingLinkCopied(
  businessId: string | null | undefined,
  client: MarkBookingLinkCopiedClient | null | undefined,
): Promise<void> {
  if (!businessId || !client) {
    return;
  }

  try {
    await client.rpc('mark_booking_link_copied', { p_business_id: businessId });
  } catch {
    // Clipboard UX already succeeded; persistence must not flip copied/failed flags.
  }
}

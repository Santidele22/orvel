import { createSupabaseClient } from '../api/supabase-booking/real-gateway';

export interface SendNotificationInput {
  to: string;
  subject: string;
  html: string;
  businessId?: string;
  bookingId?: string;
  templateKey?: string;
}

export interface SendNotificationResult {
  success: boolean;
  error?: string;
}

/**
 * Sends a notification by inserting it into the Supabase notification_email_outbox.
 * This relies on a Supabase trigger to actually send the email via an Edge Function.
 * 
 * Note: If RLS is enabled on the outbox, this may require an RPC or service role permissions.
 */
export async function sendNotification(input: SendNotificationInput): Promise<SendNotificationResult> {
  const supabase = createSupabaseClient();

  try {
    const { error } = await supabase.from('notification_email_outbox').insert({
      business_id: input.businessId,
      booking_id: input.bookingId,
      to_email: input.to,
      template_key: input.templateKey || 'manual_notification',
      payload: {
        subject: input.subject,
        html: input.html,
      },
    });

    if (error) {
      console.error('[NotificationSender] Error inserting into outbox:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[NotificationSender] Unexpected error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Alternatively, calls the Edge Function directly.
 * This is useful if the DB trigger is not working or if you want immediate feedback.
 */
export async function sendNotificationDirect(input: SendNotificationInput): Promise<SendNotificationResult> {
  const supabase = createSupabaseClient();

  try {
    const { data, error } = await supabase.functions.invoke('process-email-outbox', {
      body: {
        type: 'DIRECT_SEND',
        record: {
          to_email: input.to,
          subject: input.subject,
          html: input.html,
          business_id: input.businessId,
          booking_id: input.bookingId,
          template_key: input.templateKey,
        }
      }
    });

    if (error) {
      console.error('[NotificationSender] Error calling Edge Function:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[NotificationSender] Unexpected error calling Edge Function:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

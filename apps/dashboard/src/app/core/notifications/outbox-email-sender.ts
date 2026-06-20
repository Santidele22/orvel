import { sendNotification } from './notification-sender';

export interface QueueHtmlEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface QueueHtmlEmailResult {
  status: 'queued';
}

/**
 * Dashboard-side adapter for repository-rendered HTML emails.
 *
 * The dashboard queues messages into the Supabase notification outbox only.
 * Provider-specific delivery is owned by the server-side outbox processor.
 */
export async function queueHtmlEmail(input: QueueHtmlEmailInput): Promise<QueueHtmlEmailResult> {
  const result = await sendNotification({
    to: input.to,
    subject: input.subject,
    html: input.html,
    templateKey: 'manual_notification',
  });

  if (!result.success) {
    throw new Error(result.error || 'Unable to queue email notification');
  }

  return { status: 'queued' };
}

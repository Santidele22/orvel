export const NOTIFICATION_RETENTION_DAYS = 30 as const;

export const DASHBOARD_NOTIFICATION_STATUSES = ['unread', 'read', 'archived'] as const;

export type DashboardNotificationStatus = (typeof DASHBOARD_NOTIFICATION_STATUSES)[number];

export type DashboardNotificationEventType =
  | 'appointment.created'
  | 'appointment.cancelled'
  | 'appointment.rescheduled';

export interface DashboardNotification {
  id: string;
  status: DashboardNotificationStatus;
  eventType: DashboardNotificationEventType;
  businessId: string;
  appointmentId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
  archivedAt?: string | null;
}

export const DEFAULT_NOTIFICATIONS_LIMIT = 50;

export interface ListAdminNotificationsInput {
  businessId: string;
  unreadOnly?: boolean;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
  cursorId?: string;
}

import { createSupabaseClient } from '../runtime/supabase-client';

export async function listAdminNotifications(
  input: ListAdminNotificationsInput,
): Promise<DashboardNotification[]> {
  const supabase = createSupabaseClient();
  let query = supabase
    .from('dashboard_notifications')
    .select('*')
    .eq('business_id', input.businessId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? DEFAULT_NOTIFICATIONS_LIMIT);

  if (input.unreadOnly) {
    query = query.eq('status', 'unread');
  } else if (!input.includeArchived) {
    query = query.in('status', ['unread', 'read']);
  }

  if (input.cursor && input.cursorId) {
    query = query.lt('created_at', input.cursor).or(`id.lt.${input.cursorId},created_at.lt.${input.cursor}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching dashboard notifications:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    status: row.status,
    eventType: row.event_type,
    businessId: row.business_id,
    appointmentId: row.appointment_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
    archivedAt: row.archived_at
  }));
}

export async function getUnreadNotificationCount(businessId: string): Promise<number> {
  const supabase = createSupabaseClient();
  const { count, error } = await supabase
    .from('dashboard_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'unread');
    
  if (error) {
    console.error('Error counting unread notifications:', error);
    return 0;
  }
  return count || 0;
}

export async function markNotificationRead(notificationId: string): Promise<DashboardNotification> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from('dashboard_notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to mark notification read: ${error?.message}`);
  }

  return {
    id: data.id,
    status: data.status,
    eventType: data.event_type,
    businessId: data.business_id,
    appointmentId: data.appointment_id,
    title: data.title,
    body: data.body,
    createdAt: data.created_at,
    readAt: data.read_at,
    archivedAt: data.archived_at
  };
}

export async function archiveNotification(notificationId: string): Promise<DashboardNotification> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from('dashboard_notifications')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', notificationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to archive notification: ${error?.message}`);
  }

  return {
    id: data.id,
    status: data.status,
    eventType: data.event_type,
    businessId: data.business_id,
    appointmentId: data.appointment_id,
    title: data.title,
    body: data.body,
    createdAt: data.created_at,
    readAt: data.read_at,
    archivedAt: data.archived_at
  };
}

export async function archiveAllNotifications(businessId: string): Promise<void> {
  const supabase = createSupabaseClient();
  console.log('[API] Archiving all notifications via RPC for business:', businessId);
  
  const { data, error } = await supabase.rpc('archive_all_dashboard_notifications', {
    p_business_id: businessId
  });

  if (error) {
    console.error('[API] RPC Error archiving notifications:', error);
    throw new Error(`Failed to archive all notifications: ${error.message}`);
  }
  
  console.log(`[API] RPC Success: ${data || 0} notifications archived.`);
}

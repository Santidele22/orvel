-- Restrict appointment reminder enqueue RPC to service-role execution only.
revoke execute on function public.enqueue_appointment_reminders_24h() from public;
revoke execute on function public.enqueue_appointment_reminders_24h() from anon;
revoke execute on function public.enqueue_appointment_reminders_24h() from authenticated;
grant execute on function public.enqueue_appointment_reminders_24h() to service_role;

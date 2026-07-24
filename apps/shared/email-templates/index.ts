export {
  renderAppointmentConfirmationEmail,
  renderAppointmentReminder24hEmail,
  renderAppointmentCancellationEmail,
  renderAppointmentRescheduleEmail,
  renderAppointmentBusinessNotificationEmail,
  renderAppointmentBusinessCancellationEmail,
  formatArgentinaAppointmentDate,
} from './appointment-templates.ts';

export type {
  AppointmentTemplateData,
  EmailPayload,
} from './appointment-template.types.ts';

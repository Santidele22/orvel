export interface AppointmentTemplateData {
  customer: { name: string; email: string };
  business: { name: string; address: string };
  service: { name: string };
  date: Date | string;
  time: string;
  duration: number;
  price: number;
  contact: { phone: string; email: string };
  links?: { view?: string | null; cancel?: string | null; reschedule?: string | null };
}

export interface EmailPayload {
  subject: string;
  html: string;
}

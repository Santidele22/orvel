import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const TOPBAR_COMPONENT = path.join(ROOT, 'src', 'app', 'shared', 'dashboard-topbar', 'dashboard-topbar.component.ts');
const TOPBAR_HTML = path.join(ROOT, 'src', 'app', 'shared', 'dashboard-topbar', 'dashboard-topbar.component.html');
const ZEN_TOPBAR_COMPONENT = path.join(
  ROOT,
  'src',
  'app',
  'shared',
  'dashboard-topbar',
  'templates',
  'zen-topbar.component.ts',
);

type DashboardNotificationStatus = 'unread' | 'read' | 'archived';

type DashboardNotification = {
  id: string;
  status: DashboardNotificationStatus;
  eventType: 'appointment.created' | 'appointment.cancelled' | 'appointment.rescheduled';
  businessId: string;
  appointmentId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
  archivedAt?: string | null;
};

type DashboardNotificationsModule = {
  NOTIFICATION_RETENTION_DAYS: 30;
  DASHBOARD_NOTIFICATION_STATUSES: readonly DashboardNotificationStatus[];
  listAdminNotifications: (input?: { unreadOnly?: boolean; includeArchived?: boolean }) => Promise<DashboardNotification[]>;
  getUnreadNotificationCount: () => Promise<number>;
  markNotificationRead: (notificationId: string) => Promise<DashboardNotification>;
  archiveNotification: (notificationId: string) => Promise<DashboardNotification>;
};

type SendGridEnvModule = {
  REQUIRED_SENDGRID_ENV_KEYS: readonly string[];
  SENDGRID_SENDER_NAME: 'Orvel';
  loadSendGridEnv: (source?: Record<string, string | undefined>) => {
    apiKey: string;
    fromEmail: string;
    fromName: 'Orvel';
  };
};

type SendGridSenderModule = {
  sendHtmlEmail: (input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }) => Promise<{ status: 'queued' | 'sent'; providerMessageId?: string }>;
};

type AppointmentTemplateData = {
  customer: { name: string; email: string };
  business: { name: string; address: string };
  service: { name: string };
  date: Date;
  time: string;
  duration: number;
  price: number;
  contact: { phone: string; email: string };
  links: { view: string; cancel: string; reschedule: string };
};

type AppointmentTemplatesModule = {
  formatArgentinaAppointmentDate: (date: Date) => string;
  renderAppointmentConfirmationEmail: (data: AppointmentTemplateData) => { subject: string; html: string };
  renderAppointmentReminder24hEmail: (data: AppointmentTemplateData) => { subject: string; html: string };
  renderAppointmentCancellationEmail: (data: AppointmentTemplateData) => { subject: string; html: string };
  renderAppointmentRescheduleEmail: (data: AppointmentTemplateData) => { subject: string; html: string };
};

type BusinessWelcomeTemplatesModule = {
  renderBusinessWelcomeEmail: (data: {
    business: { name: string; ownerName: string };
    dashboardUrl: string;
    supportContact: string;
  }) => { subject: string; html: string };
};

function readSqlCorpus(): string {
  expect(fs.existsSync(MIGRATIONS_DIR), `Missing migrations directory: ${MIGRATIONS_DIR}`).toBe(true);

  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => fs.readFileSync(path.join(MIGRATIONS_DIR, entry), 'utf8'))
    .join('\n\n');
}

async function loadDashboardNotificationsModule(): Promise<DashboardNotificationsModule> {
  try {
    const mod = await import('../../core/notifications/internal-dashboard-notifications.api');
    return mod as DashboardNotificationsModule;
  } catch {
    throw new Error(
      'TODO(Magnus/Aurora): add src/app/core/notifications/internal-dashboard-notifications.api.ts exporting admin-only list/count/mark-read/archive contracts for the existing dashboard bell.',
    );
  }
}

async function loadSendGridEnvModule(): Promise<SendGridEnvModule> {
  try {
    const mod = await import('../../core/notifications/sendgrid-env');
    return mod as SendGridEnvModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/notifications/sendgrid-env.ts with required SENDGRID_API_KEY/SENDGRID_FROM_EMAIL/SENDGRID_FROM_NAME loader and Orvel sender name.',
    );
  }
}

async function loadSendGridSenderModule(): Promise<SendGridSenderModule> {
  try {
    const mod = await import('../../core/notifications/sendgrid-sender');
    return mod as SendGridSenderModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/notifications/sendgrid-sender.ts sending repository-rendered HTML via SendGrid without Dynamic Templates.',
    );
  }
}

async function loadAppointmentTemplatesModule(): Promise<AppointmentTemplatesModule> {
  try {
    const mod = await import('../../core/notifications/templates/appointment-email-templates');
    return mod as AppointmentTemplatesModule;
  } catch {
    throw new Error(
      'TODO(Almendra/Magnus): add repository HTML appointment email templates for confirmation, 24h reminder, cancellation, and reschedule.',
    );
  }
}

async function loadBusinessWelcomeTemplatesModule(): Promise<BusinessWelcomeTemplatesModule> {
  try {
    const mod = await import('../../core/notifications/templates/business-welcome-email-template');
    return mod as BusinessWelcomeTemplatesModule;
  } catch {
    throw new Error(
      'TODO(Almendra/Magnus): add repository HTML business welcome email template for new businesses.',
    );
  }
}

function appointmentTemplateFixture(): AppointmentTemplateData {
  return {
    customer: { name: 'Camila Pérez', email: 'camila@example.com' },
    business: { name: 'Orvel Studio', address: 'Av. Corrientes 1234, CABA' },
    service: { name: 'Corte y peinado' },
    date: new Date('2026-05-03T15:30:00.000-03:00'),
    time: '15:30',
    duration: 45,
    price: 12500,
    contact: { phone: '+54 11 5555-5555', email: 'hola@orvel.test' },
    links: {
      view: 'https://orvel.test/turnos/abc',
      cancel: 'https://orvel.test/turnos/abc/cancelar?token=secure-token',
      reschedule: 'https://orvel.test/turnos/abc/reprogramar?token=secure-token',
    },
  };
}

function expectAppointmentTemplatePayload(payload: { subject: string; html: string }, expectedKeyword: RegExp): void {
  expect(payload.subject).toMatch(expectedKeyword);
  expect(payload.html).toMatch(/Camila Pérez/);
  expect(payload.html).toMatch(/Orvel Studio/);
  expect(payload.html).toMatch(/Corte y peinado/);
  expect(payload.html).toMatch(/03\/05\/2026/);
  expect(payload.html).toMatch(/15:30/);
  expect(payload.html).toMatch(/45\s*(min|minutos)/i);
  expect(payload.html).toMatch(/\$?\s*12\.?500|12500/);
  expect(payload.html).toMatch(/\+54 11 5555-5555|hola@orvel\.test/);
  expect(payload.html).toMatch(/https:\/\/orvel\.test\/turnos\/abc/);
  expect(payload.html).toMatch(/cancelar\?token=secure-token/);
  expect(payload.html).toMatch(/reprogramar\?token=secure-token/);
}

describe('Orvel notification system RED contracts', () => {
  describe('1) Internal dashboard notifications backend', () => {
    it('defines persisted admin dashboard notifications with unread/read/archived states and 30-day retention', () => {
      const sql = readSqlCorpus().toLowerCase();

      expect(sql).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.dashboard_notifications\b/);
      expect(sql).toMatch(/status\s+text\s+not\s+null\s+default\s+'unread'/);
      expect(sql).toMatch(/check\s*\(\s*status\s+in\s*\(\s*'unread'\s*,\s*'read'\s*,\s*'archived'\s*\)\s*\)/);
      expect(sql).toMatch(/created_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/);
      expect(sql).toMatch(/read_at\s+timestamptz/);
      expect(sql).toMatch(/archived_at\s+timestamptz/);
      expect(sql).toMatch(/delete\s+from\s+public\.dashboard_notifications[\s\S]*interval\s+'30\s+days'/);
    });

    it('enforces single-admin visibility and unread-only counter at DB/RPC level', () => {
      const sql = readSqlCorpus().toLowerCase();

      expect(sql).toMatch(/alter\s+table\s+public\.dashboard_notifications\s+enable\s+row\s+level\s+security/);
      expect(sql).toMatch(/recipient_role\s+text\s+not\s+null\s+default\s+'admin'|visible_to\s+text\s+not\s+null\s+default\s+'admin'/);
      expect(sql).toMatch(/with\s+check\s*\([\s\S]*'admin'[\s\S]*\)|using\s*\([\s\S]*'admin'[\s\S]*\)/);
      expect(sql).toMatch(/create\s+(or\s+replace\s+)?function\s+public\.get_unread_dashboard_notification_count\s*\(/);
      expect(sql).toMatch(/count\s*\(\s*\*\s*\)[\s\S]*status\s*=\s*'unread'[\s\S]*status\s*<>\s*'archived'|status\s*=\s*'unread'[\s\S]*count\s*\(\s*\*\s*\)/);
    });

    it('creates admin notifications for appointment created, cancelled, and rescheduled events', () => {
      const sql = readSqlCorpus().toLowerCase();

      expect(sql).toMatch(/appointment\.created|booking\.created/);
      expect(sql).toMatch(/appointment\.cancelled|booking\.cancelled/);
      expect(sql).toMatch(/appointment\.rescheduled|booking\.rescheduled/);
      expect(sql).toMatch(/insert\s+into\s+public\.dashboard_notifications[\s\S]*event_type[\s\S]*created/);
      expect(sql).toMatch(/insert\s+into\s+public\.dashboard_notifications[\s\S]*event_type[\s\S]*cancelled/);
      expect(sql).toMatch(/insert\s+into\s+public\.dashboard_notifications[\s\S]*event_type[\s\S]*rescheduled/);
    });

    it('exposes frontend data/actions contract consumed by the existing bell', async () => {
      const notifications = await loadDashboardNotificationsModule();

      expect(notifications.NOTIFICATION_RETENTION_DAYS).toBe(30);
      expect(notifications.DASHBOARD_NOTIFICATION_STATUSES).toEqual(['unread', 'read', 'archived']);
      expect(typeof notifications.listAdminNotifications).toBe('function');
      expect(typeof notifications.getUnreadNotificationCount).toBe('function');
      expect(typeof notifications.markNotificationRead).toBe('function');
      expect(typeof notifications.archiveNotification).toBe('function');
    });
  });

  describe('2) SendGrid sender + repo HTML templates', () => {
    it('requires SendGrid env vars and normalizes sender name to Orvel', async () => {
      const env = await loadSendGridEnvModule();

      expect(env.REQUIRED_SENDGRID_ENV_KEYS).toEqual([
        'SENDGRID_API_KEY',
        'SENDGRID_FROM_EMAIL',
        'SENDGRID_FROM_NAME',
      ]);
      expect(env.SENDGRID_SENDER_NAME).toBe('Orvel');
      expect(() => env.loadSendGridEnv({ SENDGRID_FROM_NAME: 'Orvel' })).toThrow(/missing required/i);
      expect(
        env.loadSendGridEnv({
          SENDGRID_API_KEY: 'SG.fake-key-for-contract',
          SENDGRID_FROM_EMAIL: 'notificaciones@orvel.test',
          SENDGRID_FROM_NAME: 'Anything else must normalize',
        }),
      ).toMatchObject({ fromName: 'Orvel' });
    });

    it('sends repository-rendered HTML and does not depend on SendGrid Dynamic Templates', async () => {
      const sender = await loadSendGridSenderModule();
      const senderSourcePath = path.join(ROOT, 'src', 'app', 'core', 'notifications', 'sendgrid-sender.ts');
      const source = fs.existsSync(senderSourcePath) ? fs.readFileSync(senderSourcePath, 'utf8') : '';

      expect(typeof sender.sendHtmlEmail).toBe('function');
      expect(source).toMatch(/html\s*:/);
      expect(source).not.toMatch(/template[_-]?id|dynamic[_-]?template[_-]?data/i);
    });
  });

  describe('3) Appointment email templates', () => {
    it('formats appointment dates as Spanish Argentina dd/mm/yyyy', async () => {
      const templates = await loadAppointmentTemplatesModule();

      expect(templates.formatArgentinaAppointmentDate(new Date('2026-05-03T15:30:00.000-03:00'))).toBe('03/05/2026');
    });

    it('renders confirmation, 24h reminder, cancellation, and reschedule templates with required appointment data and links', async () => {
      const templates = await loadAppointmentTemplatesModule();
      const data = appointmentTemplateFixture();

      expectAppointmentTemplatePayload(templates.renderAppointmentConfirmationEmail(data), /confirmad[ao]|confirmación/i);
      expectAppointmentTemplatePayload(templates.renderAppointmentReminder24hEmail(data), /recordatorio|24\s*h/i);
      expectAppointmentTemplatePayload(templates.renderAppointmentCancellationEmail(data), /cancelad[ao]|cancelación/i);
      expectAppointmentTemplatePayload(templates.renderAppointmentRescheduleEmail(data), /reprogramad[ao]|nuevo horario/i);
    });
  });

  describe('4) Business welcome template', () => {
    it('renders a repository HTML welcome email for businesses', async () => {
      const welcome = await loadBusinessWelcomeTemplatesModule();
      const payload = welcome.renderBusinessWelcomeEmail({
        business: { name: 'Orvel Studio', ownerName: 'Sofía' },
        dashboardUrl: 'https://orvel.test/dashboard',
        supportContact: 'soporte@orvel.test',
      });

      expect(payload.subject).toMatch(/bienvenid[ao]|orvel/i);
      expect(payload.html).toMatch(/Sofía/);
      expect(payload.html).toMatch(/Orvel Studio/);
      expect(payload.html).toMatch(/https:\/\/orvel\.test\/dashboard/);
      expect(payload.html).toMatch(/soporte@orvel\.test/);
    });
  });

  describe('5) Existing bell wiring contract', () => {
    it('preserves the existing topbar bell UI and only wires count/list/read/archive data/actions', () => {
      const mergedTopbarSource = [TOPBAR_COMPONENT, TOPBAR_HTML, ZEN_TOPBAR_COMPONENT]
        .map((filePath) => fs.readFileSync(filePath, 'utf8'))
        .join('\n');

      expect(mergedTopbarSource).toMatch(/data-testid=["']dashboard-topbar-notifications["']|ri-notification-3-(line|fill)/);
      expect(mergedTopbarSource).toMatch(/unread(Notification)?Count|notificationCount|notificationsUnread/);
      expect(mergedTopbarSource).toMatch(/listAdminNotifications|notifications\s*=|notificationList/);
      expect(mergedTopbarSource).toMatch(/markNotificationRead|mark.*Read|readNotification/);
      expect(mergedTopbarSource).toMatch(/archiveNotification|archive.*Notification/);

      // User clarification: Aurora must wire the existing bell, not rebuild/replace visual UI.
      expect(mergedTopbarSource).not.toMatch(/new\s+notification\s+bell|rebuild\s+bell|replace\s+topbar\s+bell/i);
    });
  });
});

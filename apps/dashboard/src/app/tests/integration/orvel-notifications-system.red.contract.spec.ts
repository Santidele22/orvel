import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');
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

type OutboxEmailSenderModule = {
  queueHtmlEmail: (input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }) => Promise<{ status: 'queued' }>;
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

async function loadOutboxEmailSenderModule(): Promise<OutboxEmailSenderModule> {
  try {
    const mod = await import('../../core/notifications/outbox-email-sender');
    return mod as OutboxEmailSenderModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/notifications/outbox-email-sender.ts queueing repository-rendered HTML through notification_email_outbox without browser provider calls.',
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

function expectDetailedAppointmentTemplatePayload(payload: { subject: string; html: string }, expectedKeyword: RegExp): void {
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

function expectMinimalConfirmationPayload(payload: { subject: string; html: string }): void {
  const links = Array.from(payload.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi));

  expect(payload.subject).toBe('Turno confirmado');
  expect(payload.html).toMatch(/<h1[^>]*>\s*Turno confirmado\s*<\/h1>/i);
  expect(payload.html).toMatch(/Camila Pérez/);
  expect(payload.html).toMatch(/gracias por confiar en nosotros/i);
  expect(payload.html.match(/Ver y gestionar turno/g)).toHaveLength(1);
  expect(links.map(([, href]) => href)).toEqual(['https://orvel.test/turnos/abc']);
  expect(payload.html).not.toMatch(/href=["']#["']/i);

  expect(payload.html).not.toMatch(/Orvel Studio/);
  expect(payload.html).not.toMatch(/Corte y peinado/);
  expect(payload.html).not.toMatch(/03\/05\/2026/);
  expect(payload.html).not.toMatch(/15:30/);
  expect(payload.html).not.toMatch(/45\s*(min|minutos)/i);
  expect(payload.html).not.toMatch(/\$?\s*12\.?500|12500/);
  expect(payload.html).not.toMatch(/\+54 11 5555-5555|hola@orvel\.test/);
  expect(payload.html).not.toMatch(/cancelar\?token=secure-token/);
  expect(payload.html).not.toMatch(/reprogramar\?token=secure-token/);
}

function expectActiveOrvelEmailBranding(payload: { subject: string; html: string }, options?: { includeMuted?: boolean }): void {
  const requiredPalette = ['#0A0A0A', '#121212', '#F1F5F9', '#7C3AED', '#6D28D9', '#A78BFA'];
  const rejectedOldPalette = ['#f6efe7', '#f7f0e8', '#30251d', '#2b2118', '#fffaf5', '#ead8c7', '#9a6b43', '#8a5a36'];

  if (options?.includeMuted) {
    requiredPalette.push('#94A3B8');
  }

  for (const color of requiredPalette) {
    expect(payload.html, `Expected active Orvel dark/violet email palette color ${color}`).toContain(color);
  }
  for (const color of rejectedOldPalette) {
    expect(payload.html.toLowerCase(), `Email template must not use old beige/brown color ${color}`).not.toContain(color.toLowerCase());
  }
}

describe('Orvel notification system RED contracts', () => {
  describe('1) Internal dashboard notifications backend', () => {
    it('defines persisted admin dashboard notifications with unread/read/archived states', () => {
      const sql = readSqlCorpus().toLowerCase();

      expect(sql).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?public\.dashboard_notifications\b/);
      expect(sql).toMatch(/status\s+text\s+not\s+null\s+default\s+'unread'/);
      expect(sql).toMatch(/check\s*\(\s*status\s+in\s*\(\s*'unread'\s*,\s*'read'\s*,\s*'archived'\s*\)\s*\)/);
      expect(sql).toMatch(/created_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/);
      expect(sql).toMatch(/read_at\s+timestamptz/);
      expect(sql).toMatch(/archived_at\s+timestamptz/);
    });

    it('enforces admin notification visibility at DB policy level', () => {
      const sql = readSqlCorpus().toLowerCase();

      expect(sql).toMatch(/alter\s+table\s+public\.dashboard_notifications\s+enable\s+row\s+level\s+security/);
      expect(sql).toMatch(/recipient_role\s+text\s+not\s+null\s+default\s+'admin'|visible_to\s+text\s+not\s+null\s+default\s+'admin'/);
      expect(sql).toMatch(/with\s+check\s*\([\s\S]*'admin'[\s\S]*\)|using\s*\([\s\S]*'admin'[\s\S]*\)/);
      expect(sql).toMatch(/is_business_owner\s*\(\s*business_id\s*\)|auth\.role\(\)\s*=\s*'service_role'/);
    });

    it('creates admin notifications for appointment-created events and keeps customer email in the outbox', () => {
      const sql = readSqlCorpus().toLowerCase();

      expect(sql).toMatch(/appointment\.created|booking\.created/);
      expect(sql).toMatch(/insert\s+into\s+public\.dashboard_notifications[\s\S]*event_type[\s\S]*created/);
      expect(sql).toMatch(/insert\s+into\s+public\.notification_email_outbox[\s\S]*(booking_created|appointment_confirmation)/);
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

  describe('2) Outbox email sender + repo HTML templates', () => {
    it('queues repository-rendered HTML and does not depend on provider templates from dashboard code', async () => {
      const sender = await loadOutboxEmailSenderModule();
      const senderSourcePath = path.join(ROOT, 'src', 'app', 'core', 'notifications', 'outbox-email-sender.ts');
      const source = fs.existsSync(senderSourcePath) ? fs.readFileSync(senderSourcePath, 'utf8') : '';

      expect(typeof sender.queueHtmlEmail).toBe('function');
      expect(source).toMatch(/html\s*:/);
      expect(source).not.toMatch(/template[_-]?id|dynamic[_-]?template[_-]?data/i);
      expect(source).not.toMatch(/mailtrap|sendgrid|providerMessageId/i);
    });
  });

  describe('3) Appointment email templates', () => {
    it('formats appointment dates as Spanish Argentina dd/mm/yyyy', async () => {
      const templates = await loadAppointmentTemplatesModule();

      expect(templates.formatArgentinaAppointmentDate(new Date('2026-05-03T15:30:00.000-03:00'))).toBe('03/05/2026');
    });

    it('renders minimal customer confirmation email with only the manage appointment CTA', async () => {
      const templates = await loadAppointmentTemplatesModule();
      const data = appointmentTemplateFixture();

      expectMinimalConfirmationPayload(templates.renderAppointmentConfirmationEmail(data));
    });

    it('renders reminder, cancellation, and reschedule templates with required appointment data and links', async () => {
      const templates = await loadAppointmentTemplatesModule();
      const data = appointmentTemplateFixture();

      expectDetailedAppointmentTemplatePayload(templates.renderAppointmentReminder24hEmail(data), /recordatorio|24\s*h/i);
      expectDetailedAppointmentTemplatePayload(templates.renderAppointmentCancellationEmail(data), /cancelad[ao]|cancelación/i);
      expectDetailedAppointmentTemplatePayload(templates.renderAppointmentRescheduleEmail(data), /reprogramad[ao]|nuevo horario/i);
    });

    it('uses the active Orvel dark/violet palette for customer appointment email templates', async () => {
      const templates = await loadAppointmentTemplatesModule();
      const data = appointmentTemplateFixture();

      expectActiveOrvelEmailBranding(templates.renderAppointmentConfirmationEmail(data));
      expectActiveOrvelEmailBranding(templates.renderAppointmentReminder24hEmail(data), { includeMuted: true });
      expectActiveOrvelEmailBranding(templates.renderAppointmentCancellationEmail(data), { includeMuted: true });
      expectActiveOrvelEmailBranding(templates.renderAppointmentRescheduleEmail(data), { includeMuted: true });
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

    it('uses the active Orvel dark/violet palette for business welcome emails', async () => {
      const welcome = await loadBusinessWelcomeTemplatesModule();
      const payload = welcome.renderBusinessWelcomeEmail({
        business: { name: 'Orvel Studio', ownerName: 'Sofía' },
        dashboardUrl: 'https://orvel.test/dashboard',
        supportContact: 'soporte@orvel.test',
      });

      expectActiveOrvelEmailBranding(payload);
    });
  });

  describe('5) Existing bell wiring contract', () => {
    it('resolves the dashboard notification tenant from business context, not the raw auth user id', () => {
      const serviceSource = fs.readFileSync(
        path.join(ROOT, 'src', 'app', 'core', 'notifications', 'dashboard-notifications.service.ts'),
        'utf8',
      );
      const verifiedBusinessContextSource = fs.readFileSync(
        path.join(ROOT, 'src', 'app', 'core', 'business', 'verified-dashboard-business-context.ts'),
        'utf8',
      );
      const tenantResolutionSource = `${serviceSource}\n${verifiedBusinessContextSource}`;

      expect(serviceSource).toMatch(/resolve(?:Dashboard)?BusinessId/i);
      expect(tenantResolutionSource).toMatch(/get_dashboard_branches/i);
      expect(tenantResolutionSource).not.toMatch(/user_metadata|\.from\(['"]businesses['"]\)|\.from\(['"]branches['"]\)/i);
      expect(serviceSource).not.toMatch(/authService\.user\(\)\?\.id/);
      expect(serviceSource).toMatch(/listAdminNotifications\(\{\s*businessId/);
      expect(serviceSource).toMatch(/business_id=eq\.\$\{businessId\}/);
    });

    it('does not silently render zero notifications when verified branch RPC resolution fails', () => {
      const serviceSource = fs.readFileSync(
        path.join(ROOT, 'src', 'app', 'core', 'notifications', 'dashboard-notifications.service.ts'),
        'utf8',
      );
      const apiSource = fs.readFileSync(
        path.join(ROOT, 'src', 'app', 'core', 'notifications', 'internal-dashboard-notifications.api.ts'),
        'utf8',
      );
      const topbarSource = fs.readFileSync(
        path.join(ROOT, 'src', 'app', 'shared', 'dashboard-topbar', 'templates', 'zen-topbar.component.ts'),
        'utf8',
      );

      expect(serviceSource).toMatch(/DashboardBranchContextError/);
      expect(serviceSource).toMatch(/handleDashboardBusinessResolutionError/);
      expect(apiSource).not.toMatch(/return\s+\[\]\s*;[\s\S]{0,120}Error fetching dashboard notifications/);
      expect(apiSource).not.toMatch(/return\s+0\s*;[\s\S]{0,120}Error counting unread notifications/);
      expect(topbarSource).toMatch(/showNotificationRefreshFailed|No pudimos cargar las notificaciones/);
    });

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

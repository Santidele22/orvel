import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DASHBOARD_SRC = path.join(ROOT, 'src', 'app');
const DASHBOARD_PACKAGE = path.join(ROOT, 'package.json');

function walkTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTsFiles(fullPath);
    return entry.isFile() && fullPath.endsWith('.ts') ? [fullPath] : [];
  });
}

vi.mock('../../core/notifications/notification-sender', () => ({
  sendNotification: vi.fn(async () => ({ success: true })),
}));

describe('Dashboard notification outbox boundary', () => {
  it('does not depend on direct email provider packages from dashboard package or source', () => {
    const packageJson = fs.existsSync(DASHBOARD_PACKAGE) ? fs.readFileSync(DASHBOARD_PACKAGE, 'utf8') : '{}';
    const sourceCorpus = walkTsFiles(DASHBOARD_SRC)
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n');

    expect(packageJson).not.toMatch(/@sendgrid\/mail|mailtrap/i);
    expect(sourceCorpus).not.toMatch(/from\s+['"]@sendgrid\/mail['"]|require\(['"]@sendgrid\/mail['"]\)|from\s+['"]mailtrap['"]|require\(['"]mailtrap['"]\)/i);
  });

  it('does not keep provider environment loaders in dashboard/browser notification helpers', () => {
    const notificationFiles = walkTsFiles(path.join(DASHBOARD_SRC, 'core', 'notifications'));
    const notificationCorpus = notificationFiles
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n');

    expect(notificationFiles.map((filePath) => path.basename(filePath))).not.toContain('sendgrid-env.ts');
    expect(notificationFiles.map((filePath) => path.basename(filePath))).not.toContain('mailtrap-env.ts');
    expect(notificationCorpus).not.toMatch(/SENDGRID_API_KEY|MAILTRAP_TOKEN|MAILTRAP_API_KEY|apiKey\s*:/);
  });

  it('queueHtmlEmail queues through the outbox adapter and never calls provider-direct dashboard code', async () => {
    const { sendNotification } = await import('../../core/notifications/notification-sender');
    const { queueHtmlEmail } = await import('../../core/notifications/outbox-email-sender');

    await expect(queueHtmlEmail({
      to: 'customer@example.test',
      subject: 'Turno confirmado',
      html: '<p>ok</p>',
    })).resolves.toEqual({ status: 'queued' });

    expect(sendNotification).toHaveBeenCalledWith({
      to: 'customer@example.test',
      subject: 'Turno confirmado',
      html: '<p>ok</p>',
      templateKey: 'manual_notification',
    });
  });
});

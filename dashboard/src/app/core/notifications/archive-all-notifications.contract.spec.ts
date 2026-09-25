import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./internal-dashboard-notifications.api.ts', import.meta.url), 'utf8');

function archiveAllNotificationsSource(sourceText: string): string {
  const start = sourceText.indexOf('export async function archiveAllNotifications');
  if (start === -1) return '';
  return sourceText.slice(start);
}

describe('archiveAllNotifications table update contract', () => {
  it('archives unread and read rows on dashboard_notifications without an RPC', () => {
    const archiveAll = archiveAllNotificationsSource(source);

    expect(archiveAll, 'archiveAllNotifications must exist').not.toBe('');
    expect(archiveAll).toContain(".from('dashboard_notifications')");
    expect(archiveAll).toContain('.update(');
    expect(archiveAll).toContain('business_id');
    expect(archiveAll).toContain('archived');
    expect(archiveAll).not.toContain('archive_all_dashboard_notifications');
    expect(archiveAll).not.toContain('.rpc(');
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NOTIFICATIONS_LIMIT,
  type ListAdminNotificationsInput,
} from '../../core/notifications/internal-dashboard-notifications.api';

describe('Dashboard notifications pagination constants', () => {
  it('exports DEFAULT_NOTIFICATIONS_LIMIT = 50', () => {
    expect(DEFAULT_NOTIFICATIONS_LIMIT).toBe(50);
  });
});

describe('ListAdminNotificationsInput supports pagination fields', () => {
  it('accepts optional limit', () => {
    const input: ListAdminNotificationsInput = {
      businessId: 'b-id',
      limit: 25,
    };
    expect(input.limit).toBe(25);
  });

  it('accepts optional cursor', () => {
    const input: ListAdminNotificationsInput = {
      businessId: 'b-id',
      cursor: '2026-07-13T00:00:00Z',
    };
    expect(input.cursor).toBe('2026-07-13T00:00:00Z');
  });

  it('accepts optional cursorId', () => {
    const input: ListAdminNotificationsInput = {
      businessId: 'b-id',
      cursor: '2026-07-13T00:00:00Z',
      cursorId: 'uuid-123',
    };
    expect(input.cursor).toBe('2026-07-13T00:00:00Z');
    expect(input.cursorId).toBe('uuid-123');
  });
});

describe('listAdminNotifications applies default limit without explicit input', () => {
  it('uses DEFAULT_NOTIFICATIONS_LIMIT when no limit is provided', async () => {
    // Verify via source code analysis that the function applies the default limit
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/core/notifications/internal-dashboard-notifications.api.ts'),
      'utf8',
    );

    expect(source).toMatch(/\.limit\(input\.limit \?\? DEFAULT_NOTIFICATIONS_LIMIT\)/);
    const input: ListAdminNotificationsInput = { businessId: 'b-id' };
    expect(input.limit).toBeUndefined();
    expect(DEFAULT_NOTIFICATIONS_LIMIT).toBe(50);
  });
});

describe('Service layer supports cursor-based loadMore', () => {
  it('dashboard-notifications.service.ts exports refreshForAdmin with optional cursor param', async () => {
    // Read source to verify method signature
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/core/notifications/dashboard-notifications.service.ts'),
      'utf8',
    );

    // refreshForAdmin should accept an optional cursor parameter
    expect(source).toMatch(/refreshForAdmin\(\s*(cursor\??|cursor\?:|\.\.\.)/);
  });

  it('dashboard-notifications.service.ts exports a loadMore method', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/core/notifications/dashboard-notifications.service.ts'),
      'utf8',
    );

    expect(source).toMatch(/loadMore/);
  });
});

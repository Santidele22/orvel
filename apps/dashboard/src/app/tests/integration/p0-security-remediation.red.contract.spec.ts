import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { handleMercadoPagoWebhook } from '../../core/payments/webhooks/mercadopago-webhook.api';

const ROOT = process.cwd();
const DASHBOARD_SRC = path.join(ROOT, 'src');
const MAIN_BOOTSTRAP_PATH = path.join(DASHBOARD_SRC, 'main.ts');

function walkRuntimeTsFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile() || !absolutePath.endsWith('.ts') || absolutePath.endsWith('.spec.ts')) {
        continue;
      }

      files.push(absolutePath);
    }
  }

  return files.sort();
}

describe('P0 security remediation RED contracts', () => {
  describe('P0-1) Remove bootstrap auth bypass', () => {
    it('forbids runtime bootstrap from auto-seeding default mock session', () => {
      expect(fs.existsSync(MAIN_BOOTSTRAP_PATH), `Missing bootstrap file at ${MAIN_BOOTSTRAP_PATH}`).toBe(true);

      const bootstrapSource = fs.readFileSync(MAIN_BOOTSTRAP_PATH, 'utf8');

      expect(bootstrapSource).not.toMatch(/MOCK_SESSION/);
      expect(bootstrapSource).not.toMatch(/localStorage\.setItem\(\s*['"]turnea\.session\.v1['"]/);
    });
  });

  describe('P0-2) No MP secret exposure in frontend runtime', () => {
    it('forbids MP secrets from frontend runtime modules via env/global/window references', () => {
      const runtimeFiles = walkRuntimeTsFiles(DASHBOARD_SRC);

      const forbiddenPatterns = [
        /\bMP_ACCESS_TOKEN\b/,
        /\bMP_WEBHOOK_SECRET\b/,
        /__MP_ACCESS_TOKEN__/,
        /__MP_WEBHOOK_SECRET__/,
        /import\.meta\.env\.(?:VITE_)?MP_(?:ACCESS_TOKEN|WEBHOOK_SECRET)/,
        /(?:globalThis|window)\s*\.\s*(?:__MP_ACCESS_TOKEN__|__MP_WEBHOOK_SECRET__|MP_ACCESS_TOKEN|MP_WEBHOOK_SECRET)/
      ];

      const offenders = runtimeFiles.filter((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return forbiddenPatterns.some((pattern) => pattern.test(source));
      });

      expect(
        offenders,
        'Frontend runtime must never reference MP_ACCESS_TOKEN/MP_WEBHOOK_SECRET (or global/window variants).'
      ).toEqual([]);
    });
  });

  describe('P0-3) Strict Mercado Pago webhook signature verification', () => {
    it('rejects format-only 64-hex signatures and fails closed when official verifier path is unavailable', async () => {
      const response = await handleMercadoPagoWebhook({
        headers: {
          'x-request-id': 'req_p0_s3_001',
          'x-signature':
            'ts=1776765605,v1=5f6e13f10cf6f5dca50b5d446f7304b3fdf43f8fd6e1d9ec0af0b783ca50a111'
        },
        rawBody: JSON.stringify({
          id: 'mp_evt_p0_s3_001',
          action: 'payment.updated',
          data: { id: 'mp_pay_p0_s3_001' },
          external_reference: 'ext_biz_mp_p0_001',
          status: 'approved',
          date_created: '2026-04-24T10:00:05.000Z',
          transaction_amount: 1250,
          currency_id: 'ARS'
        }),
        nowIso: '2026-04-24T10:00:06.000Z'
      });

      expect(response.status).toBe(401);
      expect(response.error?.code).toMatch(/INVALID_SIGNATURE|LEGACY_FORMAT_CHECK_DISABLED/);
    });
  });
});

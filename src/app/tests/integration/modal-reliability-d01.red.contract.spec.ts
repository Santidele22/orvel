import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const DASHBOARD_ROOT = resolve(process.cwd(), 'src/app/pages/dashboard');

function readFlowTree(relativeDir: string): string {
  const absoluteDir = resolve(DASHBOARD_ROOT, relativeDir);
  if (!existsSync(absoluteDir)) {
    return '';
  }

  const chunks: string[] = [];

  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!/\.(ts|html|tpl|scss)$/.test(entry.name)) {
        continue;
      }

      if (!statSync(fullPath).isFile()) {
        continue;
      }

      chunks.push(readFileSync(fullPath, 'utf-8'));
    }
  };

  walk(absoluteDir);
  return chunks.join('\n');
}

describe('D-01 RED contract - Modal reliability foundation in dashboard', () => {
  it('keeps target dashboard flows present for modal hardening scope', () => {
    const servicios = readFlowTree('servicios');
    const clientes = readFlowTree('clientes');
    const turnos = readFlowTree('turnos');
    const configuracion = readFlowTree('configuracion');

    expect(servicios.length).toBeGreaterThan(0);
    expect(clientes.length).toBeGreaterThan(0);
    expect(turnos.length).toBeGreaterThan(0);
    expect(configuracion.length).toBeGreaterThan(0);
  });

  describe('Open/close mechanics contracts', () => {
    it('servicios + clientes expose deterministic add/edit/delete modal triggers', () => {
      const servicios = readFlowTree('servicios');
      const clientes = readFlowTree('clientes');

      expect(servicios).toMatch(/data-testid=["']servicios-modal-add-trigger["']/i);
      expect(servicios).toMatch(/data-testid=["']servicios-modal-edit-trigger["']/i);
      expect(servicios).toMatch(/data-testid=["']servicios-modal-delete-trigger["']/i);

      expect(clientes).toMatch(/data-testid=["']clientes-modal-add-trigger["']/i);
      expect(clientes).toMatch(/data-testid=["']clientes-modal-edit-trigger["']/i);
      expect(clientes).toMatch(/data-testid=["']clientes-modal-delete-trigger["']/i);
    });

    it('all modal flows provide close button, overlay click policy and ESC support', () => {
      const servicios = readFlowTree('servicios');
      const clientes = readFlowTree('clientes');
      const turnos = readFlowTree('turnos');
      const configuracion = readFlowTree('configuracion');
      const source = `${servicios}\n${clientes}\n${turnos}\n${configuracion}`;

      expect(source).toMatch(/data-testid=["'][\w-]*modal-close["']/i);
      expect(source).toMatch(/data-testid=["'][\w-]*modal-overlay["']/i);
      expect(source).toMatch(/(overlay.*(close|dismiss).*(enabled|allow)|allowOverlayClose|closeOnOverlayClick)/i);
      expect(source).toMatch(/(document:keydown\.escape|key === ['"]Escape['"]|event\.key === ['"]Escape['"])/i);
    });
  });

  describe('State consistency contracts', () => {
    it('enforces exclusive modal state per workflow and blocks cross-modal leakage', () => {
      const servicios = readFlowTree('servicios');
      const clientes = readFlowTree('clientes');
      const turnos = readFlowTree('turnos');
      const configuracion = readFlowTree('configuracion');
      const source = `${servicios}\n${clientes}\n${turnos}\n${configuracion}`;

      expect(source).toMatch(/activeModal(Id|Type|Kind)?\s*=\s*signal<[^>]*null[^>]*>/);
      expect(source).toMatch(/(open(Add|Edit|Delete|Reprogram|AccountSettings)Modal|setActiveModal)\([\s\S]*?(reset|clear|set\(null\)|patchValue\(|form\.reset\()/);
    });

    it('requires cancel/reset hooks to restore clean draft state before close', () => {
      const servicios = readFlowTree('servicios');
      const clientes = readFlowTree('clientes');
      const turnos = readFlowTree('turnos');
      const configuracion = readFlowTree('configuracion');
      const source = `${servicios}\n${clientes}\n${turnos}\n${configuracion}`;

      expect(source).toMatch(/(cancel.*Modal|onModalCancel|dismissModal)/i);
      expect(source).toMatch(/(reset.*(Form|Draft|State)|form\.reset\(|patchValue\(|set\(null\))/i);
      expect(source).toMatch(/data-testid=["'][\w-]*modal-cancel["']/i);
    });
  });

  describe('Accessibility and focus contracts', () => {
    it('modal containers expose baseline a11y semantics', () => {
      const servicios = readFlowTree('servicios');
      const clientes = readFlowTree('clientes');
      const turnos = readFlowTree('turnos');
      const configuracion = readFlowTree('configuracion');
      const source = `${servicios}\n${clientes}\n${turnos}\n${configuracion}`;

      expect(source).toMatch(/role=["']dialog["']/i);
      expect(source).toMatch(/aria-modal=["']true["']/i);
      expect(source).toMatch(/(aria-labelledby|aria-label)=["'][\w-\s]+["']/i);
    });

    it('focus enters modal on open and returns to trigger on close', () => {
      const servicios = readFlowTree('servicios');
      const clientes = readFlowTree('clientes');
      const turnos = readFlowTree('turnos');
      const configuracion = readFlowTree('configuracion');
      const source = `${servicios}\n${clientes}\n${turnos}\n${configuracion}`;

      expect(source).toMatch(/(focusFirst|focusInitial|autoFocusModal|focusTrap)/i);
      expect(source).toMatch(/(restoreTriggerFocus|focusReturn|lastTrigger.*focus)/i);
    });
  });

  describe('Flow-specific contracts for D-01', () => {
    it('turnos flow exposes a reprogramar modal contract from admin action to confirm/cancel', () => {
      const turnos = readFlowTree('turnos');

      expect(turnos).toMatch(/data-testid=["']turno-admin-reschedule-action["']/i);
      expect(turnos).toMatch(/data-testid=["']turnos-reschedule-modal["']/i);
      expect(turnos).toMatch(/data-testid=["']turnos-reschedule-confirm["']/i);
      expect(turnos).toMatch(/data-testid=["']turnos-reschedule-cancel["']/i);
      expect(turnos).toMatch(/(openRescheduleModal|closeRescheduleModal|submitRescheduleModal)/i);
    });

    it('configuracion flow exposes account settings modal with open/save/cancel state boundaries', () => {
      const configuracion = readFlowTree('configuracion');

      expect(configuracion).toMatch(/data-testid=["']account-settings-modal["']/i);
      expect(configuracion).toMatch(/data-testid=["']account-settings-open-trigger["']/i);
      expect(configuracion).toMatch(/data-testid=["']account-settings-save["']/i);
      expect(configuracion).toMatch(/data-testid=["']account-settings-cancel["']/i);
      expect(configuracion).toMatch(/(openAccountSettingsModal|saveAccountSettingsFromModal|cancelAccountSettingsModal)/i);
      expect(configuracion).toMatch(/(resetAccountSettingsDraft|restoreSavedAccountSettings|revertAccountSettingsDraft)/i);
    });
  });
});

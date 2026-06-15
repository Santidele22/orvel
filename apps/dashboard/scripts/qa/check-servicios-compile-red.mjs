import { readFileSync, existsSync } from 'node:fs';

const failures = [];

const templatePath = 'src/app/pages/dashboard/servicios/servicios.page.html';
const template = readFileSync(templatePath, 'utf8');
const forbiddenTemplateAccess = ['s.nombre', 's.categoria', 's.duracionMinutos', 's.precio'];

for (const pattern of forbiddenTemplateAccess) {
  if (template.includes(pattern)) {
    failures.push(`Template still uses dot-access '${pattern}' (TS4111 risk).`);
  }
}

const validationPath = 'src/app/pages/dashboard/servicios/servicios.validation.ts';
if (!existsSync(validationPath)) {
  failures.push('Missing servicios.validation.ts (cannot validate zod typing contract).');
} else {
  const validation = readFileSync(validationPath, 'utf8');
  if (validation.includes('SafeParseError') && !validation.includes('ZodSafeParseError')) {
    failures.push('Validation file uses SafeParseError instead of ZodSafeParseError (TS2724 risk).');
  }
}

if (failures.length > 0) {
  console.error('RED CHECK: servicios compile guards failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Servicos compile guard checks passed.');

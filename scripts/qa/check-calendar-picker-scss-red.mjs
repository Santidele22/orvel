import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const componentFile = resolve('src/app/shared/components/calendar-picker/calendar-picker.component.ts');
const componentSource = readFileSync(componentFile, 'utf8');
const stylesheetRelPath = './calendar-picker.component.scss';
const stylesheetAbsPath = resolve('src/app/shared/components/calendar-picker/calendar-picker.component.scss');

if (!componentSource.includes(`styleUrl: '${stylesheetRelPath}'`)) {
  console.error('[check:calendar-picker:scss:red] Contract changed: component no longer references ./calendar-picker.component.scss');
  process.exit(1);
}

if (!existsSync(stylesheetAbsPath)) {
  console.error("NG2008: Could not find stylesheet file './calendar-picker.component.scss' in calendar-picker.component.ts");
  process.exit(1);
}

console.log('[check:calendar-picker:scss:red] Unexpected pass: stylesheet file exists.');
process.exit(0);

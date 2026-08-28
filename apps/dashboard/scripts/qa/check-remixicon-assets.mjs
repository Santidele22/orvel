import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const failures = [];

const dashboardIndexPath = resolve('src/index.html');
const dashboardAngularPath = resolve('angular.json');
const landingLayoutPath = resolve('../landing/src/layouts/Layout.astro');

const dashboardIndex = readFileSync(dashboardIndexPath, 'utf8');
const dashboardAngular = JSON.parse(readFileSync(dashboardAngularPath, 'utf8'));
const landingLayout = readFileSync(landingLayoutPath, 'utf8');

const dashboardStyles = dashboardAngular.projects?.['salon-de-belleza']?.architect?.build?.options?.styles ?? [];
const remixiconPackageCss = 'node_modules/remixicon/fonts/remixicon.css';
const remixiconSubsetCss = 'src/styles/remixicon-used.css';

if (dashboardIndex.includes('cdn.jsdelivr.net/npm/remixicon') || dashboardIndex.includes('unpkg.com/remixicon')) {
  failures.push('Dashboard index.html still depends on an external Remix Icon CDN link.');
}

if (dashboardStyles.includes(remixiconPackageCss)) {
  failures.push('Dashboard angular.json styles must not include the full Remix Icon package stylesheet.');
}

if (!dashboardStyles.includes(remixiconSubsetCss)) {
  failures.push(`Dashboard angular.json styles must include ${remixiconSubsetCss} so only used ri-* icons are bundled.`);
}

if (!landingLayout.includes('import "remixicon/fonts/remixicon.css";')) {
  failures.push('Landing Layout.astro must keep importing remixicon/fonts/remixicon.css from the installed package.');
}

if (failures.length > 0) {
  console.error('[check-remixicon-assets] Remix Icon asset contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check-remixicon-assets] Remix Icon asset contract passed.');

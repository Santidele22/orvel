/** @type {import('tailwindcss').Config} */
// Fase 3 of #1098: the web target reuses the dashboard's feature templates while the split is a
// strangler, so Tailwind has to scan both trees. The theme itself is not duplicated: it is the
// dashboard's config, extended with this app's content globs.
const dashboardConfig = require('../dashboard/tailwind.config.js');

module.exports = {
  ...dashboardConfig,
  content: ['./src/**/*.{html,ts}', '../dashboard/src/app/**/*.{html,ts}']
};

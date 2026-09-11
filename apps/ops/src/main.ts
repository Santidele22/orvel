import { createApp } from 'vue';
import { createBrowserOps } from './infrastructure/create-browser-ops';
import App from './ui/App.vue';
import { OPS_KEY } from './ui/ops-key';
import { router } from './ui/router';
import './ui/styles.css';

const app = createApp(App);
app.provide(OPS_KEY, createBrowserOps());
app.use(router);
app.mount('#app');

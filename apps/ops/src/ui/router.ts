import { createRouter, createWebHistory } from 'vue-router';
import ContactsPage from './pages/ContactsPage.vue';
import ImportPage from './pages/ImportPage.vue';
import MessagesPage from './pages/MessagesPage.vue';
import PipelinePage from './pages/PipelinePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/pipeline' },
    { path: '/pipeline', component: PipelinePage, meta: { title: 'Pipeline' } },
    { path: '/contactos', component: ContactsPage, meta: { title: 'Contactos' } },
    { path: '/mensajes', component: MessagesPage, meta: { title: 'Mensajes' } },
    { path: '/importar', component: ImportPage, meta: { title: 'Importar' } }
  ]
});

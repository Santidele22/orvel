export interface SidebarLink {
  label: string;
  path: string;
  icon: string;
}

export const SIDEBAR_LINKS: SidebarLink[] = [
  { label: 'Inicio', path: '/dashboard/inicio', icon: 'ri-dashboard-line' },
  { label: 'Turnos', path: '/dashboard/turnos', icon: 'ri-calendar-event-line' },
  { label: 'Clientes', path: '/dashboard/clientes', icon: 'ri-user-3-line' },
  { label: 'Servicios', path: '/dashboard/servicios', icon: 'ri-scissors-line' },
  { label: 'Configuración', path: '/dashboard/configuracion', icon: 'ri-settings-line' }
];

export interface SidebarLink {
  label: string;
  path: string;
  icon: string;
}

export const SIDEBAR_LINKS: SidebarLink[] = [
  { label: 'Overview', path: '/dashboard/inicio', icon: 'ri-dashboard-line' },
  { label: 'Appointments', path: '/dashboard/turnos', icon: 'ri-calendar-event-line' },
  { label: 'Clients', path: '/dashboard/clientes', icon: 'ri-user-3-line' },
  { label: 'Services', path: '/dashboard/servicios', icon: 'ri-scissors-line' },
  { label: "Configuración", path: "/dashboard/configuracion", icon: "ri-settings-line" }
];

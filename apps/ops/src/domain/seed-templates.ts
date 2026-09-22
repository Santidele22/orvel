import type { MessageTemplate } from './message-template';

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'tmpl-primer-contacto',
    name: 'Primer contacto',
    category: 'Apertura',
    body: 'Hola {nombre}! Te escribo de Orvel, un sistema de turnos online para salones. Vi que están en {ciudad} y quería contarte cómo funciona. Es gratis para arrancar.'
  },
  {
    id: 'tmpl-seguimiento',
    name: 'Seguimiento',
    category: 'Seguimiento',
    body: 'Hola {nombre}, te vuelvo a escribir por lo de Orvel. Cualquier duda que tengas te la respondo acá.'
  },
  {
    id: 'tmpl-cierre',
    name: 'Cierre',
    category: 'Cierre',
    body: '{nombre}, dale, te dejo el dato para que lo mires cuando quieras. Cualquier cosa estoy por acá. Están en {ciudad}, no?'
  }
];

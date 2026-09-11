export type TemplateCategory = string;

export type MessageTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  body: string;
};

export type TemplateVars = {
  nombre: string;
  ciudad: string;
};

export function interpolateTemplate(body: string, vars: TemplateVars): string {
  return body.replaceAll('{nombre}', vars.nombre).replaceAll('{ciudad}', vars.ciudad);
}

export function whatsappUrl(normalizedPhone: string, text: string): string {
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`;
}

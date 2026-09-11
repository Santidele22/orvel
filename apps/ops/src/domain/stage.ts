export const PIPELINE_STAGES = [
  'nuevo',
  'contactado',
  'respondio',
  'en_negociacion',
  'cliente',
  'descartado'
] as const;

export type StageId = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABEL: Record<StageId, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  respondio: 'Respondió',
  en_negociacion: 'En negociación',
  cliente: 'Cliente',
  descartado: 'Descartado'
};

export function isStageId(value: string): value is StageId {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

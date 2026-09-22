import type { Contact } from './contact';

export type PipelineStats = {
  total: number;
  nuevo: number;
  respondieron: number;
  clientes: number;
  responseRatePercent: number;
};

export function computePipelineStats(contacts: Contact[]): PipelineStats {
  const total = contacts.length;
  const nuevo = contacts.filter((contact) => contact.stage === 'nuevo').length;
  const respondieron = contacts.filter((contact) =>
    contact.stage === 'respondio' || contact.stage === 'en_negociacion' || contact.stage === 'cliente'
  ).length;
  const clientes = contacts.filter((contact) => contact.stage === 'cliente').length;
  const engaged = contacts.filter(
    (contact) => contact.stage !== 'nuevo' && contact.stage !== 'descartado'
  ).length;
  return {
    total,
    nuevo,
    respondieron,
    clientes,
    responseRatePercent: engaged === 0 ? 0 : Math.round((respondieron / engaged) * 100)
  };
}

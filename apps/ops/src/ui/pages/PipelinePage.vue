<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Contact } from '../../domain/contact';
import type { MessageTemplate } from '../../domain/message-template';
import type { PipelineStats } from '../../domain/pipeline-stats';
import { PIPELINE_STAGES, STAGE_LABEL, type StageId } from '../../domain/stage';
import { useOps, useToast } from '../use-ops';

const ops = useOps();
const showToast = useToast();

const contacts = ref<Contact[]>([]);
const templates = ref<MessageTemplate[]>([]);
const stats = ref<PipelineStats>({
  total: 0,
  nuevo: 0,
  respondieron: 0,
  clientes: 0,
  responseRatePercent: 0
});
const selectedTemplate = ref<Record<string, string>>({});

async function reload() {
  contacts.value = await ops.listContacts();
  templates.value = await ops.listTemplates();
  stats.value = await ops.pipelineStats();
  for (const contact of contacts.value) {
    if (!selectedTemplate.value[contact.id] && templates.value[0]) {
      selectedTemplate.value[contact.id] = templates.value[0].id;
    }
  }
}

function inStage(stage: StageId): Contact[] {
  return contacts.value.filter((contact) => contact.stage === stage);
}

async function send(contact: Contact) {
  const templateId = selectedTemplate.value[contact.id];
  if (!templateId) {
    showToast('Elegí una plantilla', true);
    return;
  }
  try {
    await ops.sendWhatsApp(contact.id, templateId);
    showToast('WhatsApp abierto — estado actualizado');
    await reload();
  } catch (error) {
    showToast(error instanceof Error && error.message === 'PHONE_INVALID'
      ? 'Teléfono inválido. Corregilo en Contactos.'
      : 'No se pudo enviar. Reintentá.', true);
  }
}

async function changeStage(contact: Contact, stage: string) {
  await ops.moveStage(contact.id, stage as StageId);
  await reload();
}

onMounted(reload);

const statItems = computed(() => [
  { label: 'Contactos', value: String(stats.value.total) },
  { label: 'Nuevos', value: String(stats.value.nuevo) },
  { label: 'Respondieron', value: String(stats.value.respondieron) },
  { label: 'Tasa de respuesta', value: `${stats.value.responseRatePercent}%` },
  { label: 'Clientes', value: String(stats.value.clientes) }
]);
</script>

<template>
  <div class="page-head">
    <div>
      <h1 class="page-title">Pipeline</h1>
      <p class="page-desc">Embudo de salones. El envío real lo confirmás vos en WhatsApp.</p>
    </div>
  </div>

  <div class="stats-grid">
    <div v-for="item in statItems" :key="item.label" class="stat-card">
      <div class="stat-label">{{ item.label }}</div>
      <div class="stat-value">{{ item.value }}</div>
    </div>
  </div>

  <div class="kanban">
    <section v-for="stage in PIPELINE_STAGES" :key="stage" class="kanban-col">
      <div class="kanban-head">
        <h2 class="kanban-title">{{ STAGE_LABEL[stage] }}</h2>
        <span class="section-count">{{ inStage(stage).length }}</span>
      </div>
      <article v-for="contact in inStage(stage)" :key="contact.id" class="lead-card">
        <div class="name">{{ contact.name }}</div>
        <div class="meta">{{ contact.city }} · {{ contact.category }}<span v-if="contact.rating"> · {{ contact.rating }}★</span></div>
        <div class="phone">{{ contact.phoneRaw }}</div>
        <div v-if="contact.notes" class="meta">{{ contact.notes }}</div>
        <div class="meta">{{ contact.lastContactedAt ? contact.lastContactedAt.slice(0, 16).replace('T', ' ') : 'sin contactar' }}</div>
        <div class="card-actions">
          <select
            class="field-input"
            :value="selectedTemplate[contact.id]"
            @change="selectedTemplate[contact.id] = ($event.target as HTMLSelectElement).value"
          >
            <option v-for="template in templates" :key="template.id" :value="template.id">
              {{ template.name }}
            </option>
          </select>
          <button class="btn-wa" type="button" @click="send(contact)">Enviar</button>
          <select class="field-input" :value="contact.stage" @change="changeStage(contact, ($event.target as HTMLSelectElement).value)">
            <option v-for="option in PIPELINE_STAGES" :key="option" :value="option">{{ STAGE_LABEL[option] }}</option>
          </select>
        </div>
      </article>
      <p v-if="inStage(stage).length === 0" class="empty-body">Vacío</p>
    </section>
  </div>
</template>

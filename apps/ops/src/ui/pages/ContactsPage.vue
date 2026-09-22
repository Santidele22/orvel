<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CATEGORY_LABEL, CONTACT_CATEGORIES, type ContactCategory } from '../../domain/category';
import type { Contact } from '../../domain/contact';
import type { MessageTemplate } from '../../domain/message-template';
import { PIPELINE_STAGES, STAGE_LABEL, type StageId } from '../../domain/stage';
import { useOps, useToast } from '../use-ops';

const ops = useOps();
const showToast = useToast();

const contacts = ref<Contact[]>([]);
const templates = ref<MessageTemplate[]>([]);
const query = ref('');
const stageFilter = ref<'all' | StageId>('all');
const categoryFilter = ref<'all' | ContactCategory>('all');
const selectedTemplate = ref<Record<string, string>>({});
const editing = ref<Contact | null>(null);

async function reload() {
  contacts.value = await ops.listContacts();
  templates.value = await ops.listTemplates();
  for (const contact of contacts.value) {
    if (!selectedTemplate.value[contact.id] && templates.value[0]) {
      selectedTemplate.value[contact.id] = templates.value[0].id;
    }
  }
}

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return contacts.value.filter((contact) => {
    if (stageFilter.value !== 'all' && contact.stage !== stageFilter.value) {
      return false;
    }
    if (categoryFilter.value !== 'all' && contact.category !== categoryFilter.value) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return contact.name.toLowerCase().includes(needle) || contact.city.toLowerCase().includes(needle);
  });
});

async function send(contact: Contact) {
  const templateId = selectedTemplate.value[contact.id];
  if (!templateId) {
    return;
  }
  try {
    await ops.sendWhatsApp(contact.id, templateId);
    showToast('WhatsApp abierto — estado actualizado');
    await reload();
  } catch {
    showToast('No se pudo enviar. Revisá el teléfono.', true);
  }
}

async function changeStage(contact: Contact, stage: string) {
  await ops.moveStage(contact.id, stage as StageId);
  await reload();
}

async function remove(contact: Contact) {
  await ops.deleteContact(contact.id);
  showToast('Contacto eliminado');
  await reload();
}

async function saveEdit() {
  if (!editing.value) {
    return;
  }
  await ops.updateContact(editing.value.id, {
    name: editing.value.name,
    phoneRaw: editing.value.phoneRaw,
    city: editing.value.city,
    category: editing.value.category,
    notes: editing.value.notes
  });
  editing.value = null;
  showToast('Contacto guardado');
  await reload();
}

onMounted(reload);
</script>

<template>
  <div class="page-head">
    <div>
      <h1 class="page-title">Contactos</h1>
      <p class="page-desc">La misma base que el pipeline, en tabla, cuando el kanban se vuelve ruidoso.</p>
    </div>
  </div>

  <div class="filters">
    <input v-model="query" class="search-input" placeholder="Buscar por nombre o ciudad…" />
    <select v-model="stageFilter" class="field-input">
      <option value="all">Todos los estados</option>
      <option v-for="stage in PIPELINE_STAGES" :key="stage" :value="stage">{{ STAGE_LABEL[stage] }}</option>
    </select>
    <select v-model="categoryFilter" class="field-input">
      <option value="all">Todas las categorías</option>
      <option v-for="category in CONTACT_CATEGORIES" :key="category" :value="category">{{ CATEGORY_LABEL[category] }}</option>
    </select>
  </div>

  <div class="section-card">
    <div class="table-head">
      <div>Salón</div>
      <div>Ciudad</div>
      <div>Teléfono</div>
      <div>Estado</div>
      <div>Plantilla</div>
      <div></div>
    </div>
    <div v-for="contact in filtered" :key="contact.id" class="contact-row">
      <div>
        <div class="name">{{ contact.name }}</div>
        <div class="meta">{{ CATEGORY_LABEL[contact.category] }}</div>
      </div>
      <div>{{ contact.city }}</div>
      <div class="phone">{{ contact.phoneRaw }}</div>
      <div>
        <select class="field-input" :value="contact.stage" @change="changeStage(contact, ($event.target as HTMLSelectElement).value)">
          <option v-for="stage in PIPELINE_STAGES" :key="stage" :value="stage">{{ STAGE_LABEL[stage] }}</option>
        </select>
      </div>
      <div>
        <select
          class="field-input"
          :value="selectedTemplate[contact.id]"
          @change="selectedTemplate[contact.id] = ($event.target as HTMLSelectElement).value"
        >
          <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
        </select>
      </div>
      <div class="row-actions">
        <button class="btn-wa btn-sm" type="button" @click="send(contact)">Enviar</button>
        <button class="btn btn-secondary btn-sm" type="button" @click="editing = { ...contact }">Editar</button>
        <button class="btn btn-ghost btn-sm" type="button" @click="remove(contact)">Eliminar</button>
      </div>
    </div>
    <p v-if="filtered.length === 0" class="empty-body" style="padding: 16px 6px">No hay contactos con ese filtro.</p>
  </div>

  <div v-if="editing" class="overlay" @click.self="editing = null">
    <div class="modal">
      <div class="modal-head">
        <h2 class="page-title" style="font-size: 20px">Editar contacto</h2>
        <button class="close-x" type="button" @click="editing = null">✕</button>
      </div>
      <label class="field-label">Nombre</label>
      <input v-model="editing.name" class="field-input field-row" />
      <label class="field-label">Teléfono</label>
      <input v-model="editing.phoneRaw" class="field-input field-row" />
      <label class="field-label">Ciudad</label>
      <input v-model="editing.city" class="field-input field-row" />
      <label class="field-label">Categoría</label>
      <select v-model="editing.category" class="field-input field-row">
        <option v-for="category in CONTACT_CATEGORIES" :key="category" :value="category">{{ CATEGORY_LABEL[category] }}</option>
      </select>
      <label class="field-label">Notas</label>
      <textarea v-model="editing.notes" class="field-input field-row" rows="3"></textarea>
      <div class="row-actions">
        <button class="btn btn-secondary" type="button" @click="editing = null">Cancelar</button>
        <button class="btn btn-primary" type="button" @click="saveEdit">Guardar</button>
      </div>
    </div>
  </div>
</template>

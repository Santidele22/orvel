<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { MessageTemplate } from '../../domain/message-template';
import { useOps, useToast } from '../use-ops';

const ops = useOps();
const showToast = useToast();

const templates = ref<MessageTemplate[]>([]);
const editing = ref<MessageTemplate | null>(null);

async function reload() {
  templates.value = await ops.listTemplates();
}

function startNew() {
  editing.value = { id: '', name: '', category: 'Apertura', body: '' };
}

function insertToken(token: '{nombre}' | '{ciudad}') {
  if (!editing.value) {
    return;
  }
  editing.value.body += (editing.value.body && !editing.value.body.endsWith(' ') ? ' ' : '') + token;
}

async function save() {
  if (!editing.value) {
    return;
  }
  await ops.saveTemplate(editing.value);
  editing.value = null;
  showToast('Plantilla guardada');
  await reload();
}

async function remove(template: MessageTemplate) {
  await ops.deleteTemplate(template.id);
  showToast('Plantilla borrada');
  await reload();
}

onMounted(reload);
</script>

<template>
  <div class="page-head">
    <div>
      <h1 class="page-title">Mensajes</h1>
      <p class="page-desc">Plantillas cortas, tono WhatsApp. {nombre} y {ciudad} se completan al enviar.</p>
    </div>
    <button class="btn btn-primary" type="button" @click="startNew">+ Nueva plantilla</button>
  </div>

  <div class="section-card">
    <div v-for="template in templates" :key="template.id" class="tmpl-card">
      <div>
        <div class="name">{{ template.name }}</div>
        <div class="meta">{{ template.category }}</div>
        <div class="tmpl-text">{{ template.body }}</div>
        <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap">
          <span class="var-pill">{nombre}</span>
          <span class="var-pill">{ciudad}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="editing = { ...template }">Editar</button>
        <button class="btn btn-ghost btn-sm" type="button" @click="remove(template)">Borrar</button>
      </div>
    </div>
  </div>

  <div v-if="editing" class="overlay" @click.self="editing = null">
    <div class="modal">
      <div class="modal-head">
        <h2 class="page-title" style="font-size: 20px">{{ editing.id ? 'Editar plantilla' : 'Nueva plantilla' }}</h2>
        <button class="close-x" type="button" @click="editing = null">✕</button>
      </div>
      <label class="field-label">Nombre</label>
      <input v-model="editing.name" class="field-input field-row" />
      <label class="field-label">Categoría</label>
      <input v-model="editing.category" class="field-input field-row" placeholder="Apertura / Seguimiento / Cierre" />
      <label class="field-label">Texto</label>
      <textarea v-model="editing.body" class="field-input field-row" rows="5"></textarea>
      <div class="row-actions" style="margin-bottom: 16px">
        <button class="btn btn-secondary btn-sm" type="button" @click="insertToken('{nombre}')">Insertar {nombre}</button>
        <button class="btn btn-secondary btn-sm" type="button" @click="insertToken('{ciudad}')">Insertar {ciudad}</button>
      </div>
      <div class="row-actions">
        <button class="btn btn-secondary" type="button" @click="editing = null">Cancelar</button>
        <button class="btn btn-primary" type="button" @click="save">Guardar</button>
      </div>
    </div>
  </div>
</template>

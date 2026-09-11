<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ImportPreviewRow } from '../../domain/import-parse';
import { useOps, useToast } from '../use-ops';

const ops = useOps();
const showToast = useToast();

const raw = ref('');
const preview = ref<ImportPreviewRow[]>([]);
const busy = ref(false);

const selectedCount = computed(() => preview.value.filter((row) => row.selected).length);
const rejectedCount = computed(() => preview.value.filter((row) => !row.inArgentina).length);
const duplicateCount = computed(() => preview.value.filter((row) => row.duplicate).length);

async function runPreview() {
  preview.value = await ops.previewImport(raw.value);
}

async function confirm() {
  busy.value = true;
  try {
    const result = await ops.confirmImport(raw.value);
    showToast(`${result.imported} importados, ${result.skipped} descartados`);
    raw.value = '';
    preview.value = [];
  } catch {
    showToast('No se pudo guardar. Reintentá.', true);
  } finally {
    busy.value = false;
  }
}

function rowFlag(row: ImportPreviewRow): string {
  if (row.duplicate) {
    return 'ya existe';
  }
  if (!row.inArgentina) {
    return 'fuera de AR';
  }
  if (!row.phoneNormalized) {
    return 'tel. inválido';
  }
  return '';
}
</script>

<template>
  <div class="page-head">
    <div>
      <h1 class="page-title">Importar</h1>
      <p class="page-desc">
        En Google Maps buscá “salón de belleza + ciudad”, scrapeá con Instant Data Scraper
        (nombre, dirección, teléfono, rating) y pegá acá. Solo entran filas de Argentina.
      </p>
    </div>
  </div>

  <div class="section-card">
    <label class="field-label">Pegá el TSV de Instant Data Scraper</label>
    <textarea
      v-model="raw"
      class="field-input"
      rows="8"
      placeholder="Title	Address	Phone	Rating	Category"
    ></textarea>
    <div style="margin-top: 14px; display: flex; gap: 10px">
      <button class="btn btn-primary" type="button" :disabled="!raw.trim()" @click="runPreview">Vista previa</button>
      <button class="btn btn-secondary" type="button" @click="raw = ''; preview = []">Cancelar</button>
    </div>
  </div>

  <div v-if="preview.length" class="section-card">
    <div class="kanban-head">
      <h2 class="kanban-title">Vista previa — {{ preview.length }} filas</h2>
      <span class="section-count">{{ duplicateCount }} duplicados · {{ rejectedCount }} fuera de AR</span>
    </div>
    <div class="preview-row preview-row-maps" style="font-weight: 700; color: var(--ink-soft); font-size: 11px">
      <div></div>
      <div>Salón</div>
      <div>Ciudad</div>
      <div>Teléfono</div>
      <div>Rating</div>
      <div></div>
    </div>
    <div v-for="(row, index) in preview" :key="index" class="preview-row preview-row-maps">
      <input type="checkbox" :checked="row.selected" disabled />
      <div>{{ row.name }}</div>
      <div>{{ row.city }}</div>
      <div class="phone">{{ row.phoneRaw }}</div>
      <div>{{ row.rating ?? '—' }}</div>
      <div v-if="rowFlag(row)" class="dup-flag">{{ rowFlag(row) }}</div>
    </div>
    <div style="margin-top: 16px; display: flex; gap: 10px">
      <button class="btn btn-primary" type="button" :disabled="busy || selectedCount === 0" @click="confirm">
        Confirmar importación ({{ selectedCount }})
      </button>
    </div>
  </div>
</template>

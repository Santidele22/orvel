<script setup lang="ts">
import { provide, ref } from 'vue';
import AppShell from './layout/AppShell.vue';
import { TOAST_KEY, type ShowToast } from './toast-key';

const toast = ref<{ message: string; error: boolean } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

const showToast: ShowToast = (message, error = false) => {
  toast.value = { message, error };
  clearTimeout(timer);
  timer = setTimeout(() => {
    toast.value = null;
  }, 3600);
};

provide(TOAST_KEY, showToast);
</script>

<template>
  <AppShell>
    <router-view />
  </AppShell>
  <div v-if="toast" class="toast" :class="{ err: toast.error }">{{ toast.message }}</div>
</template>

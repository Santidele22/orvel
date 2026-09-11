<template>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-name">Orvel Ops</div>
        <div class="brand-sub">prospecta</div>
      </div>
      <nav class="nav">
        <router-link class="nav-item" to="/pipeline">Pipeline</router-link>
        <router-link class="nav-item" to="/contactos">Contactos</router-link>
        <router-link class="nav-item" to="/mensajes">Mensajes</router-link>
        <router-link class="nav-item" to="/importar">Importar</router-link>
      </nav>
      <div class="sidebar-foot">Santi · admin único<br />persistencia local</div>
    </aside>
    <main class="main">
      <slot />
    </main>
  </div>
</template>

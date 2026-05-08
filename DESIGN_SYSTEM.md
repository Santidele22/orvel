# Atomic Design System: Luminous Atelier (Turnea)

Este sistema de diseño está organizado siguiendo los principios de **Atomic Design** para garantizar modularidad, escalabilidad y facilidad de implementación para Aurora.

---

## 🚀 Visión: "The Luminous Atelier"
Una estética premium y glassmorphic definida por la luz, la transparencia y diagramaciones editoriales. Sin bordes duros, solo cambios tonales y brillos suaves.

---

## ⚛️ 1. Atoms (Fundamentos)

### 1.1 Tipografía
- **Headings (Manrope, SemiBold):** Alto contraste, tracking -0.02em.
  - `Display Large`: 56px (Títulos Hero)
  - `Headline Large`: 32px (Títulos de sección)
- **Body (Inter, Regular):** 
  - `Body Large`: 18px (Párrafos)
  - `Body Small`: 14px (Meta info, captions)
- **Labels (Inter, Medium):** 12px, Uppercase, tracking 0.1em.

### 1.2 Colores (Sub-temas por Negocio)

El sistema de diseño se adapta cromáticamente según el tipo de negocio, manteniendo siempre la estética **Luminous Atelier** (glassmorphism/luz).

- **🖤 Atelier Industrial (Peluquerías & Barberías):**
  - `Background`: #0F0F0F (Negro Azabache)
  - `Primary`: #C6C6C7 (Plata Metálico)
  - `Accent`: #B8860B (Bronce Viejo)
  - *Vibra*: Profesional, clásico, robusto.

- **🌿 Atelier Zen (Spas & Estética & Masajerías):**
  - `Background`: #F2F4F3 (Blanco Hueso / Zen Light)
  - `Primary`: #8BA888 (Verde Salvia)
  - `Accent`: #D9C5B2 (Arena Suave)
  - *Vibra*: Calma, naturaleza, bienestar.

- **🌸 Atelier Chic (Uñas & Pestañas & Cejas):**
  - `Background`: #FBFAFB (Blanco Perlado)
  - `Primary`: #E8B4B8 (Rosa Viejo)
  - `Accent`: #D4C1EC (Lavanda Pálido)
  - *Vibra*: Glamour, moda, detalle.

- **🎨 Atelier Ink (Tattoo & Piercing):**
  - `Background`: #050505 (Negro Absoluto)
  - `Primary`: #A10000 (Rojo Sangría)
  - `Accent`: #DAA520 (Oro Mate)
  - *Vibra*: Artístico, rebelde, premium.

### 1.3 Primitivas UI
- **Buttons:**
  - `Primary`: Gradiente (Menta a Menta Oscuro), forma de píldora (full radius).
  - `Secondary`: Ghost/Glass, borde blanco fino (20% opacidad).
- **Icons:** Línea fina (1px stroke weight).
- **Radius:** `LG` (16px) para cards, `FULL` para botones/chips.

---

## 🧩 2. Molecules (Ensamblaje)

### 2.1 Pricing Card Atomized
- **Header:** Label + Price (Display Large) + Periodicity.
- **Feature List Item:** Icono + Texto (Body Small).
- **CTA:** Botón Primario.

### 2.2 Stat Card
- **Value:** Display Large en `Primary`.
- **Label:** Label Medium en `Secondary`.

### 2.3 Feature Card (Glassmorphic)
- **Container:** `Surface High` con 20px blur y borde 15% `Primary`.
- **Content:** Título (Headline) + Descripción (Body).

### 2.4 Agenda Row
- **Estructura:** Hora (Label) | Nombre (Body) | Tag (Chip).

---

## 🏗️ 3. Organisms (Contextos)

### 3.1 Global Navbar
- Posición fija, fondo glassmorphic (80% opacidad, 40px blur).
- Contiene: Logo, molécula NavLinks y Átomo CTA.

### 3.2 Comparison Section
- Dos feature cards grandes lado a lado.
- Izquierda: "Hecho para vos" (Menta).
- Derecha: "No es para todos" (Gris Neutro).

### 3.3 Pricing Matrix
- Grid de 4 moléculas de Pricing Card: Free, Básico, Medio (Destacado), Premium.

### 3.4 Dashboard Showcase
- Contenedor grande con stack vertical de "Agenda Row".

---

## 🛠️ Reglas para Aurora
1. **Sin Bordes:** Nunca usar `border: 1px solid`. Usar cambios de fondo o "Ghost Borders" (15% opacidad).
2. **Glassmorphism:** Todo elemento flotante DEBE tener `backdrop-filter: blur(20px)`.
3. **Espaciado:** Usar escala base 8 (8px). Márgenes entre secciones: 80px-120px. Padding en cards: 32px.
4. **Brillos:** Usar `box-shadow: 0 0 40px [color]10` para estados hover.

<script setup lang="ts">
/** White card with a hairline edge and radius-lg; no shadow. `tone="needs"` adds the violet edge for something that needs the owner. */
withDefaults(
  defineProps<{
    as?: string;
    title?: string;
    /** Small label above the content, e.g. "Order request". */
    label?: string;
    padding?: 'none' | 'md' | 'lg';
    radius?: 'md' | 'lg';
    tone?: 'default' | 'needs';
    headingLevel?: 2 | 3 | 4;
  }>(),
  { as: 'section', title: undefined, label: undefined, padding: 'md', radius: 'lg', tone: 'default', headingLevel: 2 },
);
</script>

<template>
  <component :is="as" :class="['ov-card', `ov-card--pad-${padding}`, `ov-card--r-${radius}`, { 'ov-card--needs': tone === 'needs' }]">
    <div v-if="title || label || $slots.actions" class="ov-card__head">
      <div class="ov-card__heading">
        <p v-if="label" class="ov-card__label">{{ label }}</p>
        <component :is="`h${headingLevel}`" v-if="title" class="ov-card__title">{{ title }}</component>
      </div>
      <div v-if="$slots.actions" class="ov-card__actions"><slot name="actions" /></div>
    </div>
    <slot />
    <div v-if="$slots.footer" class="ov-card__foot"><slot name="footer" /></div>
  </component>
</template>

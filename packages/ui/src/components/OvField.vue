<script setup lang="ts">
import { computed, useId } from 'vue';
import OvIcon from './OvIcon.vue';
import { provideField } from '../composables/useField';

/**
 * A labelled field. The control inside (OvInput, OvTextarea, OvInputGroup, OvDropdown, OvDatePicker…) picks up the id,
 * aria-describedby and aria-invalid from here. For a native control of your own, use the slot props.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    help?: string;
    /** Error message: say what to enter ("Enter 0 or more"). Turns the field red and is linked to the control. */
    error?: string;
    required?: boolean;
    /** Id of the control; generated when omitted. */
    for?: string;
    /** Hide the label visually (it stays for screen readers). */
    hideLabel?: boolean;
  }>(),
  { help: undefined, error: undefined, for: undefined },
);

const uid = useId();
const controlId = computed(() => props.for ?? `ov-field-${uid}`);
const labelId = `ov-field-${uid}-label`;
const helpId = `ov-field-${uid}-help`;
const errorId = `ov-field-${uid}-error`;
const invalid = computed(() => !!props.error);
const describedBy = computed(() => [props.error ? errorId : null, props.help ? helpId : null].filter(Boolean).join(' ') || undefined);

provideField({ controlId, labelId, describedBy, invalid, required: computed(() => !!props.required) });
</script>

<template>
  <div :class="['ov-field', { 'ov-field--error': invalid }]">
    <label :id="labelId" :for="controlId" :class="['ov-field__label', { 'ov-sr': hideLabel }]">
      {{ label }}<span v-if="required" class="ov-field__req"> (required)</span>
    </label>
    <slot :id="controlId" :label-id="labelId" :described-by="describedBy" :invalid="invalid" />
    <p v-if="error" :id="errorId" class="ov-field__error"><OvIcon name="alert" :size="14" />{{ error }}</p>
    <p v-if="help" :id="helpId" class="ov-field__help">{{ help }}</p>
  </div>
</template>

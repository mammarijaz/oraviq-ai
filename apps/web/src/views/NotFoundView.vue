<script setup lang="ts">
import { useRouter } from 'vue-router';
import { OvCard, OvEmptyState, OvPageHeader } from '@oraviq/ui';

const router = useRouter();
</script>

<template>
  <OvPageHeader title="Page not found" />
  <OvCard>
    <OvEmptyState title="There's no page here" icon="search" text="The link may be old. Your inbox has everything that needs you." action-label="Go to the inbox" @action="router.push('/inbox')" />
  </OvCard>
</template>

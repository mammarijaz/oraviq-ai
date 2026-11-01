<script setup lang="ts">
import logoReversed from '@/assets/oraviq-logo-reversed.svg';
import logoUrl from '@/assets/oraviq-logo.svg';
</script>

<template>
  <div class="auth">
    <section class="auth-brand" aria-hidden="true">
      <img :src="logoReversed" alt="" style="height: 30px; width: auto; align-self: flex-start" />
      <div>
        <h2>Every call answered. Every quote from your prices.</h2>
        <p>The assistant answers calls, texts and website chats day and night, quotes from your own price table and sends you orders to confirm.</p>
      </div>
      <ul>
        <li>Missed call to quote in under a minute</li>
        <li>One inbox for text, Facebook, Instagram and website chat</li>
        <li>Nothing is booked until you confirm it</li>
      </ul>
    </section>
    <main class="auth-main">
      <div class="auth-col">
        <img class="auth-logo" :src="logoUrl" alt="Oraviq AI" height="30" />
        <slot />
      </div>
    </main>
  </div>
</template>

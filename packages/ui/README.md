# @oraviq/ui

The Oraviq design system as Vue 3 components: the `ov-` kit (tokens + `kit.css`) plus the app-level pieces from the approved prototype. It is a **source package**: the consuming Vite app compiles the `.vue` files, so there is no build step here.

Built on Vue 3.5, [Reka UI](https://reka-ui.com) 2 (Dialog, Tooltip, FocusScope) and `@vueuse/core`. Colours come only from `@oraviq/ui-tokens`.

## Use

```ts
// main.ts
import '@oraviq/ui/styles.css'; // tokens + kit + component CSS, once
```

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { OvButton, OvDropdown, OvToaster, useToast } from '@oraviq/ui';

const channels = ref<string[]>([]);
const { toast } = useToast();
</script>

<template>
  <OvDropdown v-model="channels" label="Channel" multiple :options="[{ value: 'sms', label: 'Text message', icon: 'chat', count: 6 }]" />
  <OvButton @click="toast('Order confirmed. Customer texted.', { action: { label: 'Undo', onClick: undo } })">Confirm order</OvButton>
  <OvToaster /> <!-- once, near the app root -->
</template>
```

No `app.use()`: import what you need by name. Put `class="ov-app"` on `<body>` (or the app root) for the base font, colours and the 2px ink focus ring. Set `--ov-accent` on a container to re-colour checked boxes, chosen days and counts (a hauler's own colour in their widgets).

Writing rules from the brand book apply to every label you pass in: sentence case, nothing in uppercase, buttons start with a verb, one `signal` button per screen, status is always a marker plus a word.

## Develop

```sh
pnpm --filter @oraviq/ui dev        # gallery at http://localhost:5174 (playground/)
pnpm --filter @oraviq/ui test       # vitest + @vue/test-utils (jsdom)
pnpm --filter @oraviq/ui typecheck  # vue-tsc, strictTemplates on
```

## Components

`v-model` = `modelValue` / `update:modelValue` unless noted. All props are optional unless marked **required**.

### Actions and brand

| Component | Props | Events | Slots |
| --- | --- | --- | --- |
| `OvButton` | `variant` `'primary' \| 'signal' \| 'secondary' \| 'outline' \| 'quiet'` (primary), `size` `'md' \| 'sm'`, `loading`, `disabled`, `href` (renders `<a>`), `as` + `to` (e.g. `RouterLink`), `type`, `icon`, `iconEnd`, `block` | `click` (not fired while loading/disabled) | default |
| `OvIcon` | **`name`** `IconName`, `size` (20), `label` (makes it `role="img"`, else `aria-hidden`), `strokeWidth` | | |
| `OvLogo` | `variant` `'full' \| 'mark' \| 'reversed' \| 'mark-reversed' \| 'mono'`, `height` (32), `label` (`''` = decorative) | | |

Icons: inbox, phone, receptionist, chat (sms), globe (website), calendar, star, dollar, chart, setup (check-square), truck (orders), mobile, facebook (people), instagram (camera), whatsapp, mail, user, settings, logout, menu, bell, external, plus, send, mic, copy, trash, edit, clock, mapPin, search, close, chevron, chevronUp/Left/Right, info, check, tick, sort, alert, calendarSmall. `ICON_NAMES` lists them all.

### Status and labels

| Component | Props | Events | Slots |
| --- | --- | --- | --- |
| `OvStatus` (alias `OvBadge`) | `tone` `'neutral' \| 'assistant' \| 'needs' \| 'confirmed' \| 'info' \| 'warning' \| 'danger'`, `label` | | default (the word) |
| `OvChip` | `v-model` boolean (aria-pressed), `count`, `size`, `disabled` | | default |
| `OvChannelTag` | **`channel`** (`sms`, `phone`, `web_chat`, `booking_form`, `facebook`, `instagram`, `whatsapp`, `email`, `google`, or display names like "Phone call"), `label`, `iconOnly` | | |
| `OvStars` | **`rating`**, `max` (5), `size`, `label` ("4 out of 5 stars") | | |

`CHANNEL_META`, `channelLabel()`, `channelMeta()` give the same map in code.

### Layout

| Component | Props | Events | Slots |
| --- | --- | --- | --- |
| `OvCard` | `as` (section), `title`, `label` (small line above), `padding` `'none' \| 'md' \| 'lg'`, `radius` `'md' \| 'lg'`, `tone` `'default' \| 'needs'` (violet edge), `headingLevel` | | default, `actions`, `footer` |
| `OvPageHeader` | **`title`** (h1 + violet diamond), `subtitle`, `diamond` | | default (subtitle), `actions` (alias `right`) |
| `OvKpiStrip` | `columns` (4; 2 under 900px), `label` | | default (`OvKpi`s) |
| `OvKpi` | **`label`**, **`value`**, `note` | | `value`, default (note) |
| `OvNote` | `tone` `'info' \| 'warning' \| 'danger'` | | default |
| `OvAlert` | `tone` `'needs' \| 'info' \| 'warning' \| 'danger'`, `title`, `live` (role status/alert) | | default, `actions` |
| `OvSpinner` | `size`, `label` ('Loading'; `''` inside a busy button) | | |
| `OvSkeleton` | `width`, `height`, `radius` `'sm' \| 'md' \| 'lg' \| 'pill' \| 'circle'`, `lines` | | |

### Forms

Wrap a control in `OvField` and it is wired automatically: `<label for>`, `aria-describedby` (help + error), `aria-invalid`, `required`. Dropdown fields and date pickers are labelled by the field label plus their value.

| Component | Props | Events | Slots |
| --- | --- | --- | --- |
| `OvField` | **`label`**, `help`, `error` (say what to enter), `required`, `for` (control id; generated), `hideLabel` | | default `{ id, labelId, describedBy, invalid }` for your own native control |
| `OvInput` | `v-model` (string, or number with `type="number"`), `type`, `placeholder`, `size`, `disabled`, `readonly`, `invalid`, `id`, `name`, `autocomplete`, `inputmode`, `maxlength`, `min`, `max`, `step`, `pattern`, `aria-label` | `update:modelValue` | |
| `OvTextarea` | `v-model`, `rows` (4), `placeholder`, `disabled`, `readonly`, `invalid`, `name`, `maxlength`, `aria-label` | `update:modelValue` | |
| `OvInputGroup` | `v-model`, `prefix`, `suffix` ("$", "per day", "tons"), plus the `OvInput` props | `update:modelValue` | `prefix`, `suffix` |
| `OvSearch` | `v-model` string, `placeholder` ('Search'), `label` (aria-label), `disabled`, `name` | `clear` | |
| `OvCheckbox` | `v-model` boolean, or string[] with `value`; `label`, `hint`, `indeterminate`, `disabled`, `name` | `update:modelValue` | default (label) |
| `OvRadioGroup` | `v-model` string, `label` (legend), `hideLabel`, `name`, `orientation` `'vertical' \| 'horizontal'`, `disabled` | `update:modelValue` | default (`OvRadio`s) |
| `OvRadio` | **`value`**, `label`, `hint`, `disabled` | | default |
| `OvSwitch` | `v-model` boolean (`role="switch"`), `label`, `hint`, `disabled` | | default |
| `OvChoiceCards` | `v-model` string, **`options`** `{ value, title, description?, disabled? }[]`, `label`, `hideLabel`, `columns`, `name`, `disabled` | `update:modelValue` | |
| `OvDropdown` | `v-model` `string` (field) or `string[]` (multi), **`options`** `{ value, label, hint?, count?, icon?, disabled? }[]`, **`label`**, `multiple`, `variant` `'filter' \| 'field'`, `allLabel` ('All'), `placeholder` ('Choose'), `searchable` (default when > 7 options), `disabled`, `invalid`, `block`, `name` (hidden inputs), `teleportTo` | `update:modelValue`, `open`, `close` | |
| `OvDatePicker` | `v-model` ISO `'YYYY-MM-DD'`, `label` ('Date'), `placeholder`, `min`, `max`, `quickPicks` (Today, Tomorrow, Saturday), `today` (override), `disabled`, `invalid`, `name`, `teleportTo` | `update:modelValue`, `open`, `close` | |

**OvDropdown.** Filter: pill trigger with the name, a summary ("All", "Facebook", "Facebook +1") and a violet count; checkbox per option with icon and count; Select all, Clear, Done; changes apply live; nothing chosen means no filter. Field: input-shaped, hint lines, a violet tick, choosing closes. Keys: Down/Up open; Up/Down/Home/End move; Enter or Space tick; typing searches (or jumps to a letter); Escape closes and refocuses the trigger; Tab leaves. The panel is teleported to `<body>` with fixed positioning, so cards and table wrappers never clip it, and flips above near the bottom of the screen. Listbox pattern with `aria-activedescendant` and `aria-multiselectable`.

**OvDatePicker.** Shows "Thu, Nov 5"; days before `min` are struck through and skipped by quick picks. Keys: arrows by day and week, Page Up/Down by month, Home/End to the start/end of the week, Enter picks, Escape closes.

### Navigation

| Component | Props | Events | Slots |
| --- | --- | --- | --- |
| `OvTabs` | `v-model`, **`items`** `{ value, label, count?, disabled?, controls? }[]`, **`label`** (tablist name), `id` | `update:modelValue`, `change` | default `{ value }` is rendered as the labelled tabpanel |
| `OvSegmented` | `v-model`, **`options`** `{ value, label, icon?, disabled? }[]`, **`label`**, `size` | `update:modelValue` | |

Tabs: arrow keys move and select (skipping disabled, wrapping), Home and End jump.

### Overlays

| Component | Props | Events | Slots |
| --- | --- | --- | --- |
| `OvModal` | `v-model:open`, **`title`**, `subtitle`, `size` `'sm' \| 'md' \| 'lg'` (480/560/720), `dismissible` (backdrop closes), `closeLabel`, `initialFocus` (selector), `teleportTo` | `update:open`, `close` | default `{ close }` (body), `footer` `{ close }`, `trigger` |
| `OvToaster` | `teleportTo` | | |
| `OvTooltip` | `text`, `side`, `align`, `delay` (200), `disabled`, `v-model:open` | `update:open` | default (one focusable trigger), `content` |
| `OvInfoTip` | **`text`**, `label` (button name, 'More information'), `side`, `align` | | |

`OvModal` is Reka Dialog: focus moves in and is trapped, Escape closes an open dropdown or calendar inside it first, the backdrop closes, focus returns to the opener; a bottom sheet with full-width buttons under 560px. Footer: a quiet Cancel and one primary action named for what it does.

`useToast()` returns `{ toast(message, { tone?, action?: { label, onClick }, duration? }), success, info, danger, dismiss(id), dismissAll, toasts }`. Tones: success (default), info, danger. Stays 3.2 s, or 6 s with an action; pauses on hover and focus; at most 3 (oldest dropped); announced politely.

### Data

| Component | Props | Events | Slots |
| --- | --- | --- | --- |
| `OvTable` | **`columns`** `{ key, label, align?, sortable?, width?, hideLabel?, sortFirst?, sortValue?, wrap? }[]`, **`rows`**, `v-model:sort` `{ key, dir } \| null`, `rowKey` (default `id`), `caption` (screen readers), `stackOnMobile` (cards with labels under 640px), `selectedKey`, `clickableRows`, `manualSort` (don't sort here), `emptyText` | `update:sort`, `row-click(row, index)` | `cell-<key>` `{ row, value, index, column }`, `header-<key>` `{ column }`, `empty` (replaces the table) |
| `OvEmptyState` | **`title`**, `text`, `icon` ('search'), `actionLabel`, `headingLevel` | `action` | default (text), `action` |

Sortable headers are buttons; the sorted `th` gets `aria-sort` and a violet arrow. Rows are sorted client-side (empty values last) unless `manualSort`.

### Conversation

| Component | Props | Events | Slots |
| --- | --- | --- | --- |
| `OvThread` | `label`, `live` (`role="log"`) | | default (bubbles) |
| `OvMessageBubble` | **`author`** `'customer' \| 'assistant' \| 'owner' \| 'system'`, `text`, `meta` ("SMS, 6:42 p.m."), `failed` | | default (text) |
| `OvQuoteCard` | **`quote`** (a `Quote` from `@oraviq/pricing`, or any `QuoteLike`), `title` (default "20-yard roll-off, 10 days"), `note`, `showWeight` (true) | | `note` |
| `OvConversationItem` | **`name`**, `time`, `preview` (2 lines), `statusLabel`, `statusTone`, `tags` (extra info statuses), `channel`, `selected` (lavender + violet bar, `aria-current`), `unread` | `click` | `status` |

`OvQuoteCard` shows the total first with the light-violet diamond, then every line item, then "Weight included" and "Over the included weight" (or "No weight charge" for clean fill). A zero delivery line reads "Included". `formatMoney` and `formatTons` here mirror `@oraviq/pricing` (that package is not a dependency of `@oraviq/ui`; the prop is structurally typed, so an engine `Quote` passes as is).

## Helpers

`formatMoney(cents)`, `formatTons(tons)`, `formatDate(iso, long?)`, `parseIsoDate`, `toIsoDate`, `todayIso`, `addDays`, `CHANNEL_META`, `channelLabel`, `ICONS`, `getIcon`, `hasOpenPopover`, `closeTopPopover`, `useFieldContext`, and the types `DropdownOption`, `TabItem`, `SegmentedOption`, `ChoiceOption`, `TableColumn`, `TableSort`, `QuoteLike`, `StatusTone`, `IconName`, `ToastOptions`.

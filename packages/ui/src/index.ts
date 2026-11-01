/**
 * @oraviq/ui: the Oraviq design system as Vue 3 components. Source package; the consuming Vite app compiles it.
 *   import '@oraviq/ui/styles.css';
 *   import { OvButton, OvDropdown, useToast } from '@oraviq/ui';
 */

/* Actions and brand */
export { default as OvButton } from './components/OvButton.vue';
export { default as OvIcon } from './components/OvIcon.vue';
export { default as OvLogo } from './components/OvLogo.vue';

/* Status and labels */
export { default as OvStatus } from './components/OvStatus.vue';
export { default as OvBadge } from './components/OvStatus.vue';
export { default as OvChip } from './components/OvChip.vue';
export { default as OvChannelTag } from './components/OvChannelTag.vue';
export { default as OvStars } from './components/OvStars.vue';

/* Layout */
export { default as OvCard } from './components/OvCard.vue';
export { default as OvPageHeader } from './components/OvPageHeader.vue';
export { default as OvKpiStrip } from './components/OvKpiStrip.vue';
export { default as OvKpi } from './components/OvKpi.vue';
export { default as OvNote } from './components/OvNote.vue';
export { default as OvAlert } from './components/OvAlert.vue';
export { default as OvSpinner } from './components/OvSpinner.vue';
export { default as OvSkeleton } from './components/OvSkeleton.vue';

/* Forms */
export { default as OvField } from './components/OvField.vue';
export { default as OvInput } from './components/OvInput.vue';
export { default as OvTextarea } from './components/OvTextarea.vue';
export { default as OvInputGroup } from './components/OvInputGroup.vue';
export { default as OvSearch } from './components/OvSearch.vue';
export { default as OvCheckbox } from './components/OvCheckbox.vue';
export { default as OvRadioGroup } from './components/OvRadioGroup.vue';
export { default as OvRadio } from './components/OvRadio.vue';
export { default as OvSwitch } from './components/OvSwitch.vue';
export { default as OvChoiceCards } from './components/OvChoiceCards.vue';
export { default as OvDropdown } from './components/OvDropdown.vue';
export { default as OvDatePicker } from './components/OvDatePicker.vue';

/* Navigation */
export { default as OvTabs } from './components/OvTabs.vue';
export { default as OvSegmented } from './components/OvSegmented.vue';

/* Overlays */
export { default as OvModal } from './components/OvModal.vue';
export { default as OvToaster } from './components/OvToaster.vue';
export { default as OvTooltip } from './components/OvTooltip.vue';
export { default as OvInfoTip } from './components/OvInfoTip.vue';

/* Data */
export { default as OvTable } from './components/OvTable.vue';
export { default as OvEmptyState } from './components/OvEmptyState.vue';

/* Conversation */
export { default as OvMessageBubble } from './components/OvMessageBubble.vue';
export { default as OvThread } from './components/OvThread.vue';
export { default as OvQuoteCard } from './components/OvQuoteCard.vue';
export { default as OvConversationItem } from './components/OvConversationItem.vue';

/* Composables */
export { useToast, TOAST_MAX } from './composables/useToast';
export type { ToastTone, ToastAction, ToastOptions, ToastItem } from './composables/useToast';
export { useFieldContext, FIELD_KEY } from './composables/useField';
export type { FieldContext } from './composables/useField';
export { hasOpenPopover, closeTopPopover } from './composables/usePopover';

/* Data, helpers and types */
export { ICONS, ICON_ALIASES, ICON_NAMES, getIcon } from './icons';
export type { IconName, IconDef } from './icons';
export { CHANNEL_META, channelKey, channelLabel, channelMeta } from './utils/channels';
export type { ChannelMeta } from './utils/channels';
export { formatMoney, formatTons, formatDate, parseIsoDate, toIsoDate, todayIso, addDays } from './utils/format';
export type {
  ButtonVariant,
  ButtonSize,
  StatusTone,
  DropdownOption,
  TabItem,
  SegmentedOption,
  ChoiceOption,
  TableColumn,
  TableSort,
  QuoteLike,
  QuoteLineLike,
  MessageAuthor,
} from './utils/types';

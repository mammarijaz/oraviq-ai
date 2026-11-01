import type { Component } from 'vue';
import type { IconName } from '../icons';

export type ButtonVariant = 'primary' | 'signal' | 'secondary' | 'outline' | 'quiet';
export type ButtonSize = 'md' | 'sm';

export type StatusTone = 'neutral' | 'assistant' | 'needs' | 'confirmed' | 'info' | 'warning' | 'danger';

export interface DropdownOption {
  value: string;
  label: string;
  /** Second line under the label (field variant). */
  hint?: string;
  /** Count shown on the right (filter variant). */
  count?: number | string;
  /** An icon name from the Oraviq set, or any component. */
  icon?: IconName | Component;
  disabled?: boolean;
}

export interface TabItem {
  value: string;
  label: string;
  count?: number | string;
  disabled?: boolean;
  /** Id of an external panel this tab controls (when you don't use the default slot). */
  controls?: string;
}

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: IconName;
  disabled?: boolean;
}

export interface ChoiceOption {
  value: string;
  title: string;
  description?: string;
  disabled?: boolean;
}

export interface TableColumn<Row = Record<string, unknown>> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** CSS width, e.g. '120px' or '20%'. */
  width?: string;
  /** Visually hide the header label (it stays for screen readers), e.g. an actions column. */
  hideLabel?: boolean;
  /** First direction when this column is sorted. Default 'asc'. */
  sortFirst?: 'asc' | 'desc';
  /** Value used for client-side sorting. Defaults to row[key]. */
  sortValue?: (row: Row) => unknown;
  /** Let long text wrap (cells don't wrap by default). */
  wrap?: boolean;
}

export interface TableSort {
  key: string;
  dir: 'asc' | 'desc';
}

/** Structural shape of a Quote from @oraviq/pricing. A real `Quote` is assignable to it. */
export interface QuoteLineLike {
  code?: string;
  label: string;
  amountCents: number;
}
export interface QuoteLike {
  yards: number;
  days: number;
  totalCents: number;
  lineItems: readonly QuoteLineLike[];
  includedTons?: number | null;
  overagePerTonCents?: number | null;
  heavyFlat?: boolean;
  zoneName?: string;
}

export type MessageAuthor = 'customer' | 'assistant' | 'owner' | 'system';

/**
 * The Oraviq stroke icon set: simple inline stroke icons ported from the prototype and the kit.
 * Drawn on a 24px grid with a 1.75 stroke (the kit's small control glyphs keep their own 14/16/18 grid
 * so they stay pixel-identical to the plain-CSS kit). Static markup only; never user content.
 */
export interface IconDef {
  /** viewBox size (square). */
  vb: number;
  /** SVG child markup. */
  body: string;
  /** Optional stroke width override in viewBox units. */
  sw?: number;
}

const i = (body: string, vb = 24, sw?: number): IconDef => ({ vb, body, sw });

export const ICONS = {
  inbox: i('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'),
  phone: i('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.12L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
  receptionist: i('<path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.12L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
  chat: i('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  globe: i('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  calendar: i('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  star: i('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>'),
  dollar: i('<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
  chart: i('<path d="M3 3v18h18"/><path d="M7 15v-4"/><path d="M12 15V8"/><path d="M17 15v-6"/>'),
  setup: i('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  truck: i('<path d="M3 7h13l3 4v6h-2"/><path d="M3 7v10h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>'),
  mobile: i('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>'),
  facebook: i('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  instagram: i('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
  whatsapp: i('<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/>'),
  mail: i('<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M3 6.5l9 6.5 9-6.5"/>'),
  user: i('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  settings: i('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  logout: i('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
  menu: i('<path d="M3 6h18M3 12h18M3 18h18"/>'),
  bell: i('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
  external: i('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>'),
  plus: i('<path d="M12 5v14M5 12h14"/>'),
  send: i('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>'),
  mic: i('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4M8 22h8"/>'),
  copy: i('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  trash: i('<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
  edit: i('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  clock: i('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  mapPin: i('<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  /* Small control glyphs from the kit (own grid so they match kit.css exactly). */
  search: i('<circle cx="7" cy="7" r="4.75"/><path d="M10.5 10.5L14 14"/>', 16),
  close: i('<path d="M4 4l8 8M12 4l-8 8"/>', 16),
  chevron: i('<path d="M4 6l4 4 4-4"/>', 16),
  chevronUp: i('<path d="M4 10l4-4 4 4"/>', 16),
  chevronLeft: i('<path d="M10 3.5L5.5 8l4.5 4.5"/>', 16),
  chevronRight: i('<path d="M6 3.5L10.5 8 6 12.5"/>', 16),
  info: i('<circle cx="8" cy="8" r="6.25"/><path d="M8 7.25v3.75"/><circle cx="8" cy="4.9" r=".6" fill="currentColor" stroke="none"/>', 16),
  check: i('<path d="M3 7.5l2.6 2.6L11 4.5"/>', 14, 2),
  tick: i('<path d="M3.5 8.5l3 3 6-7"/>', 16),
  sort: i('<path d="M7 3v8M3.5 7.5L7 11l3.5-3.5"/>', 14),
  alert: i('<path d="M7 3.5v4.25"/><circle cx="7" cy="10.4" r=".7" fill="currentColor" stroke="none"/>', 14),
  calendarSmall: i('<rect x="2.5" y="3.5" width="13" height="12" rx="2.5"/><path d="M2.5 7.5h13M6 2v3M12 2v3"/>', 18),
} satisfies Record<string, IconDef>;

/** Friendly aliases so callers can use the names from the brief. */
export const ICON_ALIASES = {
  sms: 'chat',
  'check-square': 'setup',
  orders: 'truck',
  people: 'facebook',
  camera: 'instagram',
  website: 'globe',
  pricing: 'dollar',
  report: 'chart',
  reviews: 'star',
  'chevron-down': 'chevron',
  'chevron-up': 'chevronUp',
  'chevron-left': 'chevronLeft',
  'chevron-right': 'chevronRight',
  'map-pin': 'mapPin',
  email: 'mail',
  try: 'mobile',
} as const;

export type IconName = keyof typeof ICONS | keyof typeof ICON_ALIASES;

export const ICON_NAMES = [...Object.keys(ICONS), ...Object.keys(ICON_ALIASES)] as IconName[];

export function getIcon(name: IconName): IconDef {
  const key = (name in ICON_ALIASES ? ICON_ALIASES[name as keyof typeof ICON_ALIASES] : name) as keyof typeof ICONS;
  return ICONS[key] ?? ICONS.info;
}

/** US states and DC, for the city/state fields. */
export const US_STATES: Array<[code: string, name: string]> = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'],
  ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'],
  ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

export const STATE_OPTIONS = US_STATES.map(([value, name]) => ({ value, label: name }));

export const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern time', hint: 'New York, Atlanta, Miami' },
  { value: 'America/Chicago', label: 'Central time', hint: 'Chicago, Dallas, Houston' },
  { value: 'America/Denver', label: 'Mountain time', hint: 'Denver, Salt Lake City' },
  { value: 'America/Phoenix', label: 'Arizona', hint: 'Phoenix, no daylight saving' },
  { value: 'America/Los_Angeles', label: 'Pacific time', hint: 'Los Angeles, Seattle' },
  { value: 'America/Anchorage', label: 'Alaska time', hint: 'Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii time', hint: 'Honolulu' },
];

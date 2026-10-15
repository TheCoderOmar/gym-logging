// Inline SVG icons (24px grid, stroke = currentColor). Use in views as <%- icon('home') %>.
const paths = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  library: '<path d="M2 9v6M5 6v12M19 6v12M22 9v6M5 12h14"/>',
  routines: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  progress: '<path d="M3 20h18"/><path d="m4 15 5-5 4 3 7-7"/><path d="M15 6h5v5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5Z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
};

// Two-tone filled flame (not a stroke icon): "this muscle hit its weekly target".
const flame = `<svg class="flame" viewBox="0 0 24 24" aria-hidden="true">
  <path class="flame-out" d="M12 2c1 3.2 4.6 5.4 5.6 9.2.9 3.7-1.4 7.6-5.6 8.8-4.3-1.2-6.5-5-5.6-8.4.5-2 1.9-3.2 2.4-5 .9 1.3 1.1 2.4 1 3.6C11.6 8.4 12.6 5.6 12 2Z"/>
  <path class="flame-in" d="M12 11.5c.6 1.6 2.4 2.7 2.6 4.6.2 1.9-1.1 3.4-2.6 3.9-1.6-.5-2.8-2-2.6-3.6.1-1 .7-1.7 1-2.6.5.6.7 1.2.7 1.8.6-1.3.9-2.7.9-4.1Z"/>
</svg>`;

// Filled equipment silhouettes for the library filter, drawn like the body figure (solid grey shapes).
const equip = {
  bodyweight: '<circle cx="12" cy="4" r="2.6"/><path d="M8.6 7.6h6.8l3.4 5.2-1.6 1.1-2.6-3.4v4.3l1.6 7.7h-2.4L12 15.6l-1.8 6.9H7.8l1.6-7.7v-4.3l-2.6 3.4-1.6-1.1Z"/>',
  dumbbell: '<rect x="7.5" y="10.8" width="9" height="2.4" rx="1"/><rect x="2.5" y="8.5" width="3" height="7" rx="1"/><rect x="5" y="6.5" width="3" height="11" rx="1"/><rect x="16" y="6.5" width="3" height="11" rx="1"/><rect x="18.5" y="8.5" width="3" height="7" rx="1"/>',
  barbell: '<rect x="1" y="11" width="22" height="2" rx="1"/><rect x="3.5" y="5" width="2.8" height="14" rx="1"/><rect x="6.8" y="7" width="2.4" height="10" rx="1"/><rect x="14.8" y="7" width="2.4" height="10" rx="1"/><rect x="17.7" y="5" width="2.8" height="14" rx="1"/>',
  ezbar: '<path d="M1 11h6.2l2.3-2 2.5 3.2L14.5 9l2.3 2H23v2h-6.9l-1.8-1.6-2.3 3.1-2.5-3.1L7.9 13H1Z"/><rect x="3" y="6" width="2.8" height="12" rx="1"/><rect x="18.2" y="6" width="2.8" height="12" rx="1"/>',
  cable: '<rect x="2" y="2" width="3" height="20" rx="1"/><rect x="2" y="2" width="17" height="2.6" rx="1"/><circle cx="17.5" cy="7.5" r="2.4"/><rect x="16.8" y="9" width="1.4" height="7"/><path d="M13.5 16h8v2.2h-8Z"/><rect x="5.5" y="14" width="4" height="7" rx="1"/>',
  machine: '<rect x="3" y="2" width="3.2" height="20" rx="1"/><rect x="1.5" y="20" width="21" height="2" rx="1"/><path d="M6 6h7.5l5.5 5.5-1.6 1.6-4.8-4.8H6Z"/><rect x="12" y="13.5" width="9" height="3" rx="1.2"/><rect x="15" y="16" width="2.5" height="4.5"/>',
  smith: '<rect x="3" y="2" width="2.6" height="20" rx="1"/><rect x="18.4" y="2" width="2.6" height="20" rx="1"/><rect x="1" y="2" width="22" height="2.2" rx="1"/><rect x="1" y="20" width="22" height="2" rx="1"/><rect x="5" y="10.5" width="14" height="2" rx="1"/><rect x="7" y="7.5" width="2.4" height="8" rx="1"/><rect x="14.6" y="7.5" width="2.4" height="8" rx="1"/>',
  kettlebell: '<path fill-rule="evenodd" d="M8 10.2V7.6a4 4 0 0 1 8 0v2.6a7 7 0 0 1-1.2 11.8H9.2A7 7 0 0 1 8 10.2Zm2.2-.9a6.9 6.9 0 0 1 3.6 0V7.6a1.8 1.8 0 0 0-3.6 0Z"/>',
  band: '<path fill-rule="evenodd" d="M2.5 17.5C5 6 19 6 21.5 17.5H24V20h-7v-2.5h1.6C16.5 11 7.5 11 5.4 17.5H7V20H0v-2.5Z"/>',
  suspension: '<rect x="10.5" y="1" width="3" height="5" rx="1"/><path d="M11.2 5.5h1.6l4.6 10.2-1.5.7L12 7.6l-3.9 8.8-1.5-.7Z"/><rect x="4.5" y="15.5" width="5.5" height="3" rx="1.5"/><rect x="14" y="15.5" width="5.5" height="3" rx="1.5"/>',
  plate: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/>',
  ball: '<circle cx="12" cy="12" r="10"/>',
  pullup: '<rect x="1" y="2" width="22" height="2.6" rx="1"/><rect x="3.5" y="2" width="2.6" height="20" rx="1"/><rect x="17.9" y="2" width="2.6" height="20" rx="1"/><rect x="1.5" y="20" width="7" height="2" rx="1"/><rect x="15.5" y="20" width="7" height="2" rx="1"/>',
};
function equipIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${equip[name] || ''}</svg>`;
}

function icon(name, cls = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${paths[name] || ''}</svg>`;
}

// Brand mark: a plate seen face-on.
const brandMark = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="var(--go)"/><circle cx="16" cy="16" r="9.5" fill="none" stroke="var(--chalk)" stroke-width="1.5" opacity=".55"/><circle cx="16" cy="16" r="3.2" fill="var(--chalk)"/></svg>`;

module.exports = { icon, equipIcon, brandMark, flame };

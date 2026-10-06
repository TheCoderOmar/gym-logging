// Front and back body figures as inline SVG. Each muscle is drawn once for the
// figure's left half and mirrored across x = 100 for the right half.

const FRONT = {
  traps: ['M91,58 C86,65 78,70 68,74 L90,77 Z'],
  shoulders: ['M68,75 C56,75 47,85 46,101 C51,106 58,105 63,101 C64,91 68,83 77,79 Z'],
  chest: ['M98,79 L79,79 C69,83 65,93 67,105 C73,115 86,118 98,114 Z'],
  biceps: ['M46,106 C43,118 42,131 44,145 C49,149 56,147 59,142 C61,129 61,116 62,105 C56,109 51,109 46,106 Z'],
  forearms: ['M43,151 C39,167 37,182 37,197 C41,200 46,200 49,197 C52,183 56,167 58,149 C53,152 48,153 43,151 Z'],
  abs: ['M98,119 L85,119 C83,141 83,165 87,191 C92,196 95,198 98,198 Z'],
  obliques: ['M82,120 C72,122 68,134 70,151 C72,167 76,181 84,193 C80,169 80,143 82,120 Z'],
  quads: ['M70,203 C63,227 63,258 70,287 C76,293 86,293 91,287 C93,263 92,234 90,216 C84,212 76,208 70,203 Z'],
  adductors: ['M92,217 C95,235 96,257 94,280 L98,276 L98,208 Z'],
  calves: ['M70,312 C66,331 67,356 72,377 C76,381 81,381 85,377 C89,356 90,331 89,312 C83,316 76,316 70,312 Z'],
};

const BACK = {
  traps: ['M98,57 L90,59 C84,66 75,70 66,74 C77,81 88,93 98,122 Z'],
  shoulders: ['M65,75 C55,75 47,85 46,101 C52,106 58,105 63,100 C65,90 69,83 75,79 Z'],
  upper_back: ['M76,82 C70,89 68,99 70,108 C80,111 89,114 97,124 C89,104 83,91 76,82 Z'],
  lats: ['M70,112 C66,128 70,149 82,167 C88,171 94,172 98,172 L98,129 C89,119 79,115 70,112 Z'],
  lower_back: ['M98,175 L86,171 C84,182 84,191 86,198 L98,200 Z'],
  triceps: ['M46,106 C43,118 42,131 44,145 C49,149 56,147 59,142 C61,129 61,116 62,104 C56,108 51,108 46,106 Z'],
  forearms: ['M43,151 C39,167 37,182 37,197 C41,200 46,200 49,197 C52,183 56,167 58,149 C53,152 48,153 43,151 Z'],
  glutes: ['M98,203 L86,200 C72,202 66,215 68,233 C74,245 90,247 98,239 Z'],
  hamstrings: ['M68,238 C64,257 66,277 72,293 C78,297 86,297 91,293 C94,273 95,255 95,243 C87,247 76,245 68,238 Z'],
  calves: ['M70,307 C64,323 66,343 72,361 C78,367 85,367 89,359 C92,341 91,321 89,307 C83,311 76,311 70,307 Z'],
};

// Parts with no muscle region (head, hands, knees, feet), drawn in a neutral tone.
const BASE_HALF = [
  '<path d="M86,193 L98,200 L98,215 C91,212 79,206 70,201 C73,197 79,195 86,193 Z"/>', // hip
  '<ellipse cx="42" cy="207" rx="6" ry="10"/>',   // hand
  '<ellipse cx="80" cy="300" rx="11" ry="9"/>',    // knee
  '<ellipse cx="79" cy="390" rx="10" ry="6"/>',    // foot
];
const BASE_CENTER = [
  '<ellipse cx="100" cy="31" rx="19" ry="23"/>',  // head
  '<rect x="90" y="50" width="20" height="12" rx="4"/>', // neck
];

const mirror = (inner) => `${inner}<g transform="translate(200 0) scale(-1 1)">${inner}</g>`;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function describe(st) {
  if (!st || st.bucket === 'never') return `${st ? st.label : ''}: not trained yet`;
  const when = st.days === 0 ? 'today' : st.days === 1 ? 'yesterday' : `${st.days} days ago`;
  return `${st.label}: trained ${when}, ${st.sets} ${st.sets === 1 ? 'set' : 'sets'} (score ${st.points})`;
}

// Draw one figure. `decorate(regionId)` returns { cls, attrs, title } for each muscle group.
function figure(view, shapes, decorate, idPrefix = 'fig') {
  const regions = Object.entries(shapes)
    .map(([id, paths]) => {
      const { cls = '', attrs = '', title = '' } = decorate(id);
      const d = paths.map((p) => `<path d="${p}"/>`).join('');
      return `<g class="muscle ${cls}" data-region="${id}" ${attrs}><title>${esc(title)}</title>${mirror(d)}</g>`;
    })
    .join('');
  return `<svg class="body-fig" viewBox="20 0 160 402" aria-labelledby="${idPrefix}-${view}">
    <title id="${idPrefix}-${view}">${view === 'front' ? 'Front' : 'Back'} of body</title>
    <g class="body-base">${BASE_CENTER.join('')}${mirror(BASE_HALF.join(''))}</g>
    ${regions}
  </svg>`;
}

// Home: muscles coloured by how recently they were trained.
function bodyMap(status) {
  const decorate = (id) => {
    const st = status[id];
    const text = describe(st);
    return { cls: `b-${st.bucket} i-${st.intensity}`, attrs: `tabindex="0" role="img" aria-label="${esc(text)}"`, title: text };
  };
  return { front: figure('front', FRONT, decorate), back: figure('back', BACK, decorate) };
}

// Exercise library: muscles you can click to filter by. `selected` is a Set of region ids.
function muscleFilterMap(selected, labels) {
  const decorate = (id) => {
    const on = selected.has(id);
    return {
      cls: `pick${on ? ' is-on' : ''}`,
      attrs: `tabindex="0" role="checkbox" aria-checked="${on}" aria-label="${esc(labels[id])}"`,
      title: labels[id],
    };
  };
  return { front: figure('front', FRONT, decorate, 'pick'), back: figure('back', BACK, decorate, 'pick') };
}

module.exports = { bodyMap, muscleFilterMap, describe };

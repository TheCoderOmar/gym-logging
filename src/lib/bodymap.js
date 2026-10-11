// Front and back body figures as inline SVG. Each muscle is drawn once for the
// figure's left half and mirrored across x = 100 for the right half.
const { hasHeads } = require('./heads');
const { activityText } = require('./sports');

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
  return `${st.label}: trained ${when}, ${activityText(st)} (score ${st.points})`;
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
    // Muscles with heads open a close-up when clicked.
    const attrs = hasHeads(id)
      ? `tabindex="0" role="button" aria-haspopup="dialog" data-heads aria-label="${esc(text)}. Show ${esc(st.label.toLowerCase())} heads"`
      : `tabindex="0" role="img" aria-label="${esc(text)}"`;
    return { cls: `b-${st.bucket} i-${st.intensity}`, attrs, title: text };
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

// Sports session page: muscles shaded by how hard the sport works them (points 0–3 per region).
function workMap(points, labels) {
  const decorate = (id) => {
    const p = points.get(id) || 0;
    const text = p ? `${labels[id]}: ${p} ${p === 1 ? 'point' : 'points'} per 30 min` : `${labels[id]}: not worked`;
    return { cls: `work-${p}`, attrs: `role="img" aria-label="${esc(text)}"`, title: text };
  };
  return { front: figure('front', FRONT, decorate, 'work'), back: figure('back', BACK, decorate, 'work') };
}

// Close-ups for the recovery-map popup: one muscle split into its heads (viewBox 0 0 200 240).
// `mirror: true` draws the left half and reflects it across x = 100, like the body figures.
// Heads are drawn in object order, so a head listed first sits underneath the others.
const CLOSEUPS = {
  chest: {
    mirror: true,
    base: ['<path d="M100,14 L58,16 C40,20 26,32 22,56 C20,120 30,190 46,236 L100,236 Z"/>'],
    heads: {
      chest_upper: ['M98,40 L62,36 C50,38 40,46 36,58 C56,62 78,64 98,66 Z'],
      chest_middle: ['M98,70 C78,68 56,66 36,63 C34,77 36,91 42,101 C62,105 80,105 98,103 Z'],
      chest_lower: ['M98,107 C80,109 62,109 45,105 C51,119 61,129 75,131 C85,131 93,127 98,121 Z'],
    },
  },
  shoulders: {
    base: [
      '<path d="M100,22 C138,22 160,50 160,86 C160,120 148,150 140,236 L60,236 C52,150 40,120 40,86 C40,50 62,22 100,22 Z"/>',
      '<text x="30" y="232" class="fig-note">Front</text>',
      '<text x="170" y="232" class="fig-note" text-anchor="end">Back</text>',
    ],
    heads: {
      delt_front: ['M100,170 C84,140 56,118 50,88 C46,62 60,42 80,36 C83,84 90,126 100,170 Z'],
      delt_rear: ['M100,170 C110,126 117,84 120,36 C140,42 154,62 150,88 C144,118 116,140 100,170 Z'],
      delt_side: ['M100,170 C91,126 85,84 83,35 C94,30 106,30 117,35 C115,84 109,126 100,170 Z'],
    },
  },
  biceps: {
    base: ['<path d="M70,10 C100,0 135,8 140,30 L138,200 C136,225 120,236 100,236 C80,236 64,225 62,200 L60,30 C60,18 64,12 70,10 Z"/>'],
    heads: {
      brachialis: ['M62,140 C70,164 84,182 100,186 C116,182 130,164 138,142 L138,190 C132,206 117,214 100,214 C83,214 68,206 62,190 Z'],
      biceps_long: ['M66,38 C72,28 92,28 98,38 L98,168 C90,178 76,176 70,166 C64,128 62,80 66,38 Z'],
      biceps_short: ['M102,38 C110,28 130,30 134,40 C137,80 134,128 128,164 C122,176 108,178 102,168 Z'],
    },
  },
  triceps: {
    base: ['<path d="M70,10 C100,0 135,8 140,30 L138,200 C136,225 120,236 100,236 C80,236 64,225 62,200 L60,30 C60,18 64,12 70,10 Z"/>'],
    heads: {
      triceps_medial: ['M68,132 C80,146 90,150 100,150 C110,150 122,146 134,132 C134,166 124,192 100,196 C76,192 66,166 68,132 Z'],
      triceps_lateral: ['M64,34 C72,24 94,26 98,38 L97,136 C88,146 74,144 68,132 C62,100 60,62 64,34 Z'],
      triceps_long: ['M102,34 C112,24 130,28 136,38 C138,78 137,108 134,132 C124,146 110,146 102,136 Z'],
    },
  },
  forearms: {
    base: [
      '<path d="M26,22 C42,10 76,10 92,22 L82,204 C78,216 42,216 38,204 Z"/>',
      '<path d="M108,22 C124,10 158,10 174,22 L164,204 C160,216 124,216 120,204 Z"/>',
      '<text x="59" y="234" class="fig-note" text-anchor="middle">Inner</text>',
      '<text x="141" y="234" class="fig-note" text-anchor="middle">Outer</text>',
    ],
    heads: {
      forearm_flexors: ['M32,30 C46,20 72,20 86,30 C84,90 76,140 64,196 L56,196 C44,140 34,90 32,30 Z'],
      forearm_extensors: ['M138,26 C152,20 166,22 170,30 C168,92 162,142 152,196 L144,196 C136,150 132,110 134,70 C134,52 135,38 138,26 Z'],
      brachioradialis: ['M112,30 C116,20 128,18 134,22 C130,46 128,80 130,112 C126,128 122,140 120,150 C116,110 112,70 112,30 Z'],
    },
  },
  abs: {
    mirror: true,
    base: ['<path d="M100,8 L44,8 C36,80 38,160 52,236 L100,236 Z"/>'],
    heads: {
      abs_upper: ['M97,20 L76,22 C72,38 72,48 74,58 L97,58 Z', 'M97,64 L74,64 C72,78 72,90 74,100 L97,100 Z'],
      abs_lower: ['M97,106 L74,106 C72,120 73,132 76,142 L97,144 Z', 'M97,150 L77,150 C83,178 89,202 97,224 Z'],
    },
  },
  quads: {
    base: [
      '<path d="M58,10 C90,0 130,4 152,14 C152,82 142,160 132,206 C126,222 82,224 72,210 C60,160 52,82 58,10 Z"/>',
      '<ellipse cx="102" cy="222" rx="24" ry="14"/>',
    ],
    heads: {
      quad_vl: ['M62,28 C70,18 84,18 90,28 C92,90 90,150 86,198 C78,204 70,198 68,188 C60,140 57,82 62,28 Z'],
      quad_rf: ['M93,22 C102,12 118,12 124,22 C127,80 122,140 112,180 C106,186 99,186 95,178 C91,130 90,80 93,22 Z'],
      quad_vm: ['M126,128 C141,140 146,166 140,192 C132,206 112,206 106,196 C110,170 117,148 126,128 Z'],
    },
  },
  lats: {
    mirror: true,
    base: ['<path d="M100,14 L58,16 C40,20 26,32 24,60 C22,130 38,190 60,236 L100,236 Z"/>'],
    heads: {
      lats_upper: ['M38,58 C56,60 72,70 84,84 C82,98 76,108 67,115 C56,103 45,85 38,58 Z'],
      lats_lower: ['M68,120 C77,112 85,101 88,90 C93,110 96,140 98,168 L98,204 C84,194 70,174 63,152 C59,140 61,129 68,120 Z'],
    },
  },
};

// Popup close-up: each head coloured by its status (from headStatus).
function headFigure(region, status) {
  const spec = CLOSEUPS[region];
  const byHead = new Map(status.map((s) => [s.head, s]));
  const draw = spec.mirror ? mirror : (x) => x;
  const heads = Object.entries(spec.heads)
    .map(([id, paths]) => {
      const st = byHead.get(id) || { label: id, bucket: 'never', intensity: 0 };
      const d = paths.map((p) => `<path d="${p}"/>`).join('');
      return `<g class="muscle b-${st.bucket} i-${st.intensity}" data-head="${id}"><title>${esc(describe(st))}</title>${draw(d)}</g>`;
    })
    .join('');
  return `<svg class="head-fig" viewBox="0 0 200 240" aria-hidden="true">
    <g class="body-base">${draw(spec.base.filter((b) => !b.startsWith('<text')).join(''))}</g>
    ${spec.base.filter((b) => b.startsWith('<text')).join('')}
    ${heads}
  </svg>`;
}

module.exports = { bodyMap, muscleFilterMap, workMap, describe, headFigure };

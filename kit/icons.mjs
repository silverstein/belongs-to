// 16-unit line icons, drawn on a 16x16 grid with 1.4 strokes, round caps.
// Each is a plain shape a reader already knows: a house is a house.
const ICONS = {
  person: `<circle cx="8" cy="5.2" r="2.7"/><path d="M2.8 14.2c.6-3 2.7-4.6 5.2-4.6s4.6 1.6 5.2 4.6"/>`,
  trust: `<path d="M3.5 1.8h6.2l2.8 2.8v9.6h-9z"/><path d="M9.7 1.8v2.8h2.8"/><circle cx="8" cy="10" r="2"/><path d="M6.9 11.7l-.6 2.3M9.1 11.7l.6 2.3"/>`,
  llc: `<rect x="2.2" y="3.2" width="11.6" height="10.6" rx="1"/><path d="M2.2 6.6h11.6M6 3.2v3.4M10 3.2v3.4"/><path d="M5 9.4h2M9 9.4h2M5 11.6h2M9 11.6h2"/>`,
  corp: `<path d="M2 5.6L8 2.2l6 3.4"/><path d="M2.6 13.8h10.8M3.4 6.2v6.2M6.2 6.2v6.2M9.8 6.2v6.2M12.6 6.2v6.2"/>`,
  group: `<circle cx="5.4" cy="5.6" r="2.1"/><circle cx="10.8" cy="5.6" r="2.1"/><path d="M1.6 13.6c.4-2.4 1.9-3.7 3.8-3.7s3.4 1.3 3.8 3.7M7.6 10.4c.8-.4 1.9-.5 3.2-.5 1.9 0 3.4 1.3 3.8 3.7"/>`,
  home: `<path d="M2 7.6L8 2.4l6 5.2"/><path d="M3.6 6.4v7.6h8.8V6.4"/><path d="M6.6 14v-4h2.8v4"/>`,
  rental: `<rect x="3" y="2.2" width="10" height="11.8" rx=".6"/><path d="M5.4 5h1.6M9 5h1.6M5.4 7.8h1.6M9 7.8h1.6M5.4 10.6h1.6M9 10.6h1.6"/>`,
  brokerage: `<path d="M2 13.8h12"/><path d="M3.6 11.2l3-3.4 2.4 2 3.8-5"/><path d="M10.4 4.8h2.4v2.4"/>`,
  retirement: `<ellipse cx="8" cy="4" rx="5" ry="1.8"/><path d="M3 4v3.2c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4"/><path d="M3 7.2v3.4c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V7.2"/>`,
  insurance: `<path d="M8 1.8l5.4 2v4c0 3.2-2.3 5.4-5.4 6.4-3.1-1-5.4-3.2-5.4-6.4v-4z"/><path d="M5.6 8.2l1.7 1.7 3.2-3.4"/>`,
  stock: `<rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1"/><circle cx="8" cy="8" r="2.2"/><path d="M4 5.4h1.6M10.4 10.6H12"/>`,
  vehicle: `<path d="M2.4 9.2l1.6-4.2c.2-.5.6-.8 1.1-.8h5.8c.5 0 .9.3 1.1.8l1.6 4.2"/><path d="M1.8 9.2h12.4v3.2H1.8z"/><circle cx="4.6" cy="12.6" r="1.3"/><circle cx="11.4" cy="12.6" r="1.3"/><path d="M4 9.2h8"/>`,
  bank: `<path d="M2 6.2L8 2.6l6 3.6H2z"/><path d="M3.2 6.2v5.4M6.4 6.2v5.4M9.6 6.2v5.4M12.8 6.2v5.4"/><path d="M2 13.6h12M2.6 11.6h10.8"/>`,
  court: `<path d="M2 5.8L8 2.4l6 3.4"/><path d="M2.6 13.6h10.8M4 6.6v5.4M8 6.6v5.4M12 6.6v5.4"/>`,
  form: `<path d="M3.6 1.8h8.8v12.4H3.6z"/><path d="M5.6 5h4.8M5.6 7.6h4.8M5.6 10.2h2.6"/>`,
  key: `<circle cx="5" cy="8" r="2.8"/><path d="M7.8 8h6.4M12 8v2.4M14 8v1.6"/>`,
  clock: `<circle cx="8" cy="8" r="5.8"/><path d="M8 4.6V8l2.4 1.6"/>`,
};

export function icon(name, x, y, size = 16, cls = "bt-icon") {
  const body = ICONS[name] ?? ICONS.form;
  const s = size / 16;
  return `<g class="${cls}" transform="translate(${x} ${y}) scale(${s})">${body}</g>`;
}

export const iconFor = (node) => {
  if (node.kind === "person") return "person";
  if (node.kind === "law") return "court";
  if (["bank", "bank account", "checking", "savings"].includes(node.kind)) return "bank";
  if (ICONS[node.kind]) return node.kind;
  return "form";
};

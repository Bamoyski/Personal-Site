/**
 * Builds the tech binder sheets from the machine data and drives the 3D
 * framing: which machine is on stage, where on screen it sits, how far it has
 * rotated, and how far it has come apart.
 */

import { machines, fleet, topology, portLayout } from './machines.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ *
 * Port drawing
 * ------------------------------------------------------------------ */
const PORT_SHAPES = {
  'usb-a': (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5"/>`,
  'usb-c': (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h * 0.7}" rx="${h * 0.35}"/>`,
  usbc: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h * 0.7}" rx="${h * 0.35}"/>`,
  rj45: (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5"/><rect x="${x + w * 0.14}" y="${y + h * 0.2}" width="${w * 0.72}" height="${h * 0.45}" rx="1"/>`,
  dp: (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/><path d="M${x + w * 0.12} ${y + h * 0.18} h${w * 0.2} v${h * 0.16} h${w * 0.2}"/>`,
  hdmi: (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/><path d="M${x + w * 0.12} ${y + h * 0.72} h${w * 0.76}"/>`,
  vga: (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/><circle cx="${x + w * 0.24}" cy="${y + h * 0.34}" r="1"/><circle cx="${x + w * 0.76}" cy="${y + h * 0.34}" r="1"/><circle cx="${x + w * 0.5}" cy="${y + h * 0.72}" r="1"/>`,
  serial: (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/><circle cx="${x + w * 0.2}" cy="${y + h * 0.5}" r="0.9"/><circle cx="${x + w * 0.42}" cy="${y + h * 0.5}" r="0.9"/><circle cx="${x + w * 0.64}" cy="${y + h * 0.5}" r="0.9"/><circle cx="${x + w * 0.82}" cy="${y + h * 0.5}" r="0.9"/>`,
  audio: (x, y, w, h) =>
    `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2}"/><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 5}" class="fill"/>`,
  power: (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/><path d="M${x + w / 2} ${y + h * 0.26} v${h * 0.26} M${x + w * 0.34} ${y + h * 0.36} a${w * 0.16} ${w * 0.16} 0 1 0 ${w * 0.32} 0"/>`,
  led: (x, y, w, h) =>
    `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2.6}"/><path d="M${x + w * 0.3} ${y + h * 0.7} h${w * 0.4}"/>`,
  optical: (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5"/><path d="M${x + w * 0.15} ${y + h * 0.62} h${w * 0.7}"/>`,
};

function portDiagram(machineId, side) {
  const layout = portLayout[machineId]?.[side];
  if (!layout) return '';

  const cols = layout.length > 9 ? 6 : 4;
  const cellW = 46;
  const cellH = 54;
  const padX = 26;
  const padY = 30;
  const rows = Math.ceil(layout.length / cols);
  const width = padX * 2 + cols * cellW;
  const height = padY * 2 + rows * cellH;

  const shapes = layout
    .map((port, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const cx = padX + col * cellW + cellW / 2;
      const cy = padY + row * cellH + cellH / 2;
      const w = 22;
      const h = 16;
      const draw = PORT_SHAPES[port.type] || PORT_SHAPES['usb-a'];
      const number = index + 1;
      return `
        <g class="pd-port">
          ${draw(cx - w / 2, cy - h / 2, w, h)}
          <text class="pd-num" x="${cx - w / 2 - 6}" y="${cy + 3}" text-anchor="end">${number}</text>
        </g>`;
    })
    .join('');

  const legend = layout
    .map(
      (port, index) => `
      <li>
        <span class="pl-num">${String(index + 1).padStart(2, '0')}</span>
        <span class="pl-label">${port.label}</span>
      </li>`
    )
    .join('');

  return `
    <div class="pd">
      <figure class="pd-figure">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${side} port layout for ${machineId}">
          <rect class="pd-panel" x="6" y="6" width="${width - 12}" height="${height - 12}" rx="8"/>
          ${shapes}
        </svg>
        <figcaption class="pd-cap">${side} panel</figcaption>
      </figure>
      <ol class="pd-legend">${legend}</ol>
    </div>`;
}

/* ------------------------------------------------------------------ *
 * Sheet markup
 * ------------------------------------------------------------------ */
function specGroup(group) {
  const rows = group.rows
    .map(
      ([label, value]) => `
      <div class="spec-row">
        <dt>${label}</dt>
        <dd>${value}</dd>
      </div>`
    )
    .join('');
  return `
    <section class="spec-group">
      <h3 class="spec-group-title"><span>${group.group}</span></h3>
      <dl class="spec-table">${rows}</dl>
    </section>`;
}

function sheetMarkup(machine) {
  const headline = machine.headline
    .map(
      ([label, value]) => `
      <li>
        <span class="ss-label">${label}</span>
        <b class="ss-value">${value}</b>
      </li>`
    )
    .join('');

  const specGroups = machine.specs.map(specGroup).join('');

  const internals = machine.internals
    .map(
      (item, index) => `
      <li>
        <span class="il-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="il-label">${item.label}</span>
        <p>${item.note}</p>
      </li>`
    )
    .join('');

  const notes = machine.notes
    .map(
      (note, index) => `
      <li>
        <span class="note-index">N${String(index + 1).padStart(2, '0')}</span>
        <p>${note}</p>
      </li>`
    )
    .join('');

  const upgrades = machine.upgrades
    .map(
      ([title, detail]) => `
      <tr>
        <th scope="row">${title}</th>
        <td>${detail}</td>
      </tr>`
    )
    .join('');

  return `
  <article class="sheet" id="machine-${machine.index}" data-machine="${machine.id}" data-preset="${machine.preset}">
    <div class="wrap">
      <header class="sheet-head">
        <div class="sheet-ident">
          <span class="sheet-index">${machine.index}</span>
          <div class="sheet-title">
            <span class="sheet-maker">${machine.maker}</span>
            <h2>${machine.model}</h2>
          </div>
        </div>
        <dl class="sheet-meta">
          <div><dt>Form factor</dt><dd>${machine.form}</dd></div>
          <div><dt>Role</dt><dd>${machine.role}</dd></div>
          <div><dt>Status</dt><dd><span class="status"><i aria-hidden="true"></i>${machine.status}</span></dd></div>
          <div><dt>In fleet since</dt><dd>${machine.since}</dd></div>
        </dl>
      </header>

      <div class="sheet-body">
        <div class="sheet-stage">
          <div class="viewport" data-viewport data-plate="${machine.id}">
            <img class="vp-product" src="${machine.image}" alt="${machine.maker} ${machine.model}" loading="lazy" decoding="async" width="900" height="1200">
            <span class="vp-tag vp-tag--tl">VIEW · ${machine.index}</span>
            <span class="vp-tag vp-tag--tr">${machine.code}</span>
            <span class="vp-tag vp-tag--bl">${machine.imageCredit}</span>
            <span class="vp-tag vp-tag--br">SCROLL TO ROTATE</span>
            <span class="vp-axis vp-axis--h" aria-hidden="true"></span>
          </div>

          <div class="stage-meta">
            <p class="sheet-summary">${machine.summary}</p>
            <ul class="spec-strip">${headline}</ul>
          </div>
        </div>

        <div class="sheet-content">
          <div class="spec-columns">${specGroups}</div>

          <section class="sheet-section">
            <h3 class="section-title">Port map</h3>
            <div class="port-columns">
              ${portDiagram(machine.id, 'rear')}
              ${portDiagram(machine.id, 'front')}
            </div>
          </section>

          <section class="sheet-section" data-internals>
            <h3 class="section-title">Inside</h3>
            <ul class="internal-list">${internals}</ul>
          </section>

          <section class="sheet-section">
            <h3 class="section-title">Notes from the field</h3>
            <ul class="note-list">${notes}</ul>
          </section>

          <section class="sheet-section">
            <h3 class="section-title">Upgrade paths</h3>
            <table class="upgrade-table">
              <tbody>${upgrades}</tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ *
 * Contents table
 * ------------------------------------------------------------------ */
function contentsMarkup() {
  const rows = machines
    .map(
      (machine) => `
      <tr>
        <td class="c-index">${machine.index}</td>
        <td class="c-name">
          <a href="#machine-${machine.index}">
            <span class="c-maker">${machine.maker}</span>
            <span class="c-model">${machine.model}</span>
          </a>
        </td>
        <td class="c-role">${machine.role}</td>
        <td class="c-spec">${machine.headline[0][1]}</td>
        <td class="c-spec">${machine.headline[2][1]}</td>
        <td class="c-spec">${machine.headline[3][1]}</td>
        <td class="c-spec">${machine.headline[5][1]}</td>
      </tr>`
    )
    .join('');

  return `
    <table class="contents-table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Machine</th>
          <th scope="col">Role</th>
          <th scope="col">CPU</th>
          <th scope="col">Memory</th>
          <th scope="col">Storage</th>
          <th scope="col">PSU</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ------------------------------------------------------------------ *
 * Topology diagram
 * ------------------------------------------------------------------ */
function topologyMarkup() {
  const sw = topology.switch;
  const nodes = machines
    .map((machine, index) => {
      const x = 120 + index * 330;
      const y = 250;
      return `
      <g class="tp-node" data-node="${machine.id}">
        <rect x="${x - 95}" y="${y - 58}" width="190" height="116" rx="6"/>
        <text class="tp-index" x="${x - 78}" y="${y - 34}">${machine.index}</text>
        <text class="tp-model" x="${x - 78}" y="${y - 8}">${machine.model}</text>
        <text class="tp-role" x="${x - 78}" y="${y + 16}">${machine.role}</text>
        <text class="tp-ip" x="${x - 78}" y="${y + 38}">${machine.specs.find((g) => g.group === 'Networking').rows.find((r) => r[0] === 'Host IP')[1]}</text>
      </g>`;
    })
    .join('');

  const links = topology.links    .map((link) => {
      const from = machines.findIndex((m) => m.id === link.from);
      const to = machines.findIndex((m) => m.id === link.to);
      const x1 = 120 + from * 330;
      const x2 = 120 + to * 330;
      const mx = (x1 + x2) / 2;
      return `
      <g class="tp-link">
        <path d="M${x1} 306 C ${x1} 392, ${x2} 392, ${x2} 306"/>
        <text class="tp-link-label" x="${mx}" y="342" text-anchor="middle">${link.label}</text>
        <text class="tp-link-note" x="${mx}" y="360" text-anchor="middle">${link.note}</text>
      </g>`;
    })
    .join('');

  return `
    <svg class="topology-svg" viewBox="0 0 960 410" role="img" aria-label="Network topology of the three nodes">
      <g class="tp-switch">
        <rect x="330" y="30" width="300" height="86" rx="6"/>
        <text class="tp-switch-name" x="480" y="64" text-anchor="middle">${sw.name}</text>
        <text class="tp-switch-meta" x="480" y="88" text-anchor="middle">${sw.ports} · ${sw.ip}</text>
      </g>
      <g class="tp-uplink">
        <path d="M480 116 L480 180"/>
        <text class="tp-link-label" x="492" y="152">${topology.vlan}</text>
      </g>
      ${links}
      ${nodes}
    </svg>`;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */
export function renderBinder() {
  const sheetsHost = document.getElementById('sheets');
  const contentsHost = document.getElementById('contents-table');
  const topologyHost = document.getElementById('topology-diagram');
  const spineHost = document.getElementById('spine-links');

  if (sheetsHost) sheetsHost.innerHTML = machines.map(sheetMarkup).join('');
  if (contentsHost) contentsHost.innerHTML = contentsMarkup();
  if (topologyHost) topologyHost.innerHTML = topologyMarkup();

  if (spineHost) {
    const links = [
      { href: '#contents', label: 'Contents', index: '00' },
      ...machines.map((m) => ({ href: `#machine-${m.index}`, label: m.code, index: m.index })),
      { href: '#topology', label: 'Topology', index: '04' },
      { href: '#about', label: 'About', index: '05' },
    ];
    spineHost.innerHTML = links
      .map(
        (link) => `
        <li>
          <a class="tab" href="${link.href}">
            <b>${link.index}</b>${link.label}
          </a>
        </li>`
      )
      .join('');
  }

  const metaHost = document.getElementById('cover-meta');
  if (metaHost) {
    const rows = [
      ['Revision', fleet.updated],
      ['Location', fleet.location],
      ['Nodes', String(machines.length)],
      ['Uplink', fleet.uplink],
      ['Hypervisor', 'Proxmox VE 8.x'],
      ['Management', 'Intel AMT'],
    ];
    metaHost.innerHTML = rows
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join('');
  }
}

/* ------------------------------------------------------------------ *
 * Frame provider for the 3D layer
 * ------------------------------------------------------------------ */
export function createFrameProvider() {
  let cache = [];

  const refresh = () => {
    cache = Array.from(document.querySelectorAll('[data-viewport]')).map((viewport) => {
      const sheet = viewport.closest('.sheet');
      return {
        viewport,
        sheet,
        plate: viewport.dataset.plate || '',
        cover: viewport.hasAttribute('data-cover'),
      };
    });
  };
  refresh();

  return {
    refresh,
    getFrame() {
      if (!cache.length) refresh();
      const W = window.innerWidth;
      const H = window.innerHeight;

      let best = null;
      let bestArea = 0;

      cache.forEach((entry) => {
        const rect = entry.viewport.getBoundingClientRect();
        const visibleW = Math.max(0, Math.min(rect.right, W) - Math.max(rect.left, 0));
        const visibleH = Math.max(0, Math.min(rect.bottom, H) - Math.max(rect.top, 0));
        const area = visibleW * visibleH;
        if (area > bestArea) {
          bestArea = area;
          best = { entry, rect };
        }
      });

      if (!best || bestArea < 2000) {
        return { visible: false, rect: null, yaw: 0, pitch: 0, plate: '' };
      }

      const { entry, rect } = best;

      let yaw;
      let pitch;
      if (entry.cover) {
        // the cover turns slowly on its own
        yaw = (performance.now() / 1000) * 0.13 - 0.5;
        pitch = 0.13;
      } else {
        // turntable driven by how far the sheet has scrolled
        const sheetRect = entry.sheet.getBoundingClientRect();
        const progress = clamp((H - sheetRect.top) / (sheetRect.height + H), 0, 1);
        yaw = lerp(-0.42, 0.46, progress);
        pitch = lerp(0.04, 0.17, progress);
      }

      const visible = bestArea > rect.width * rect.height * 0.1;

      return {
        visible,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        yaw,
        pitch,
        plate: entry.plate,
      };
    },
  };
}

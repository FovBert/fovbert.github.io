#!/usr/bin/env node
/**
 * contrib.mjs — генератор календаря активности GitHub.
 *
 * Забирает публичный граф вкладов пользователя (без токена),
 * считает статистику и рендерит минималистичные SVG (dark/light) + JSON.
 *
 *   node scripts/contrib.mjs --user FovBert --out assets
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/* ─────────────────────────── параметры ─────────────────────────── */

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const USER = arg('user', 'FovBert');
const OUT = arg('out', 'assets');
const JSON_ONLY = argv.includes('--json-only');

/* ─────────────────────────── палитры ───────────────────────────── */

const THEMES = {
  dark: {
    bg: 'none',
    stroke: '#1b2129',
    levels: ['#12171d', '#1e3a4c', '#2f6d8c', '#4fa8cc', '#8fdcf5'],
    text: '#e6edf3',
    muted: '#6e7b8a',
    faint: '#3d4753',
  },
  light: {
    bg: 'none',
    stroke: '#e4e8ec',
    levels: ['#eef1f4', '#cfe6f1', '#8fc7dd', '#4c9dbd', '#1f6d8c'],
    text: '#12171d',
    muted: '#6b7681',
    faint: '#aab4be',
  },
};

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = { 1: 'Пн', 3: 'Ср', 5: 'Пт' };

/* ─────────────────────────── загрузка ──────────────────────────── */

async function fetchCalendar(user) {
  const url = `https://github.com/users/${encodeURIComponent(user)}/contributions`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': `contrib.mjs (+https://github.com/${user})`,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`GitHub ответил ${res.status} ${res.statusText}`);
  return parseCalendar(await res.text());
}

function parseCalendar(html) {
  // счётчики лежат в <tool-tip for="contribution-day-component-R-C">N contributions ...</tool-tip>
  const counts = new Map();
  const tipRe = /<tool-tip[^>]*\bfor="(contribution-day-component-[^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;
  for (const m of html.matchAll(tipRe)) {
    const n = /^(\d+)\s+contribution/i.exec(m[2].trim());
    counts.set(m[1], n ? Number(n[1]) : 0);
  }

  const days = [];
  const dayRe = /<td[^>]*\bclass="[^"]*ContributionCalendar-day[^"]*"[^>]*>/g;
  for (const m of html.matchAll(dayRe)) {
    const tag = m[0];
    const date = /\bdata-date="([\d-]+)"/.exec(tag)?.[1];
    if (!date) continue;
    const id = /\bid="([^"]+)"/.exec(tag)?.[1] ?? '';
    const level = Number(/\bdata-level="(\d)"/.exec(tag)?.[1] ?? 0);
    days.push({ date, level, count: counts.get(id) ?? 0 });
  }

  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!days.length) throw new Error('не удалось разобрать календарь — GitHub изменил разметку?');
  return days;
}

/* ─────────────────────────── статистика ────────────────────────── */

const iso = (d) => d.toISOString().slice(0, 10);

function buildStats(days) {
  const today = iso(new Date());
  const past = days.filter((d) => d.date <= today);

  const total = past.reduce((s, d) => s + d.count, 0);
  const activeDays = past.filter((d) => d.count > 0).length;
  const best = past.reduce((a, b) => (b.count > a.count ? b : a), { date: null, count: 0 });

  let longest = 0;
  let run = 0;
  for (const d of past) {
    run = d.count > 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  }

  // текущая серия: сегодняшний пустой день её не рвёт — он ещё может «дозаписаться»
  let current = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].count > 0) current++;
    else if (i === past.length - 1) continue;
    else break;
  }

  return {
    user: USER,
    updated: new Date().toISOString(),
    from: past[0]?.date ?? null,
    to: past.at(-1)?.date ?? null,
    total,
    activeDays,
    currentStreak: current,
    longestStreak: longest,
    bestDay: best.count > 0 ? best : null,
    days: past,
  };
}

/* ─────────────────────────── рендер SVG ────────────────────────── */

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const PAD_L = 34;
const PAD_T = 62;
const PAD_R = 16;
const PAD_B = 30;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

function toWeeks(days) {
  const weeks = [];
  let week = new Array(7).fill(null);
  for (const d of days) {
    const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    if (wd === 0 && week.some(Boolean)) {
      weeks.push(week);
      week = new Array(7).fill(null);
    }
    week[wd] = d;
  }
  if (week.some(Boolean)) weeks.push(week);
  return weeks;
}

function renderSVG(stats, themeName) {
  const t = THEMES[themeName];
  const weeks = toWeeks(stats.days);

  const gridW = weeks.length * STEP - GAP;
  const W = PAD_L + gridW + PAD_R;
  const H = PAD_T + 7 * STEP - GAP + PAD_B;

  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Календарь активности GitHub — ${esc(USER)}">`
  );
  out.push(`<style>
  .t{font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif}
  .m{font-family:"JetBrains Mono","SF Mono",ui-monospace,Consolas,monospace}
  .sub{fill:${t.muted};font-size:9.5px;letter-spacing:.16em}
  .lbl{fill:${t.faint};font-size:9px}
  .num{fill:${t.text};font-size:16px;font-weight:600}
  .cap{fill:${t.muted};font-size:8.5px;letter-spacing:.1em}
  rect{shape-rendering:geometricPrecision}
  </style>`);

  if (t.bg !== 'none') out.push(`<rect width="${W}" height="${H}" fill="${t.bg}"/>`);

  /* шапка */
  out.push(`<text class="t sub" x="${PAD_L}" y="15">GITHUB ACTIVITY</text>`);
  out.push(
    `<text class="m sub" x="${W - PAD_R}" y="15" text-anchor="end">${esc(stats.from ?? '')} → ${esc(stats.to ?? '')}</text>`
  );
  out.push(`<line x1="${PAD_L}" y1="24" x2="${W - PAD_R}" y2="24" stroke="${t.stroke}" stroke-width="1"/>`);

  const metrics = [
    [String(stats.total), plural(stats.total, 'ВКЛАД', 'ВКЛАДА', 'ВКЛАДОВ')],
    [String(stats.activeDays), 'АКТИВНЫХ ДНЕЙ'],
    [String(stats.currentStreak), 'СЕРИЯ СЕЙЧАС'],
    [String(stats.longestStreak), 'ЛУЧШАЯ СЕРИЯ'],
  ];
  const colW = (W - PAD_L - PAD_R) / metrics.length;
  metrics.forEach(([n, cap], i) => {
    const x = PAD_L + i * colW;
    out.push(`<text class="m num" x="${x}" y="46">${esc(n)}</text>`);
    out.push(`<text class="t cap" x="${x}" y="57">${esc(cap)}</text>`);
  });

  /* подписи месяцев */
  let lastMonth = -1;
  weeks.forEach((wk, i) => {
    const first = wk.find(Boolean);
    if (!first) return;
    const mo = Number(first.date.slice(5, 7)) - 1;
    if (mo !== lastMonth && i < weeks.length - 1) {
      lastMonth = mo;
      out.push(`<text class="t lbl" x="${PAD_L + i * STEP}" y="${PAD_T - 7}">${MONTHS[mo]}</text>`);
    }
  });

  /* подписи дней недели */
  for (const [wd, name] of Object.entries(WEEKDAYS)) {
    const y = PAD_T + Number(wd) * STEP + CELL - 2;
    out.push(`<text class="t lbl" x="${PAD_L - 8}" y="${y}" text-anchor="end">${name}</text>`);
  }

  /* сетка */
  weeks.forEach((wk, x) => {
    wk.forEach((d, y) => {
      if (!d) return;
      const fill = t.levels[Math.min(4, d.level)];
      const extra = d.level === 0 ? ` stroke="${t.stroke}" stroke-width=".5"` : '';
      const title = `${d.date} — ${d.count} ${plural(d.count, 'вклад', 'вклада', 'вкладов')}`;
      out.push(
        `<rect x="${PAD_L + x * STEP}" y="${PAD_T + y * STEP}" width="${CELL}" height="${CELL}" rx="2.5" fill="${fill}"${extra}><title>${esc(title)}</title></rect>`
      );
    });
  });

  /* легенда */
  const legendY = PAD_T + 7 * STEP + 8;
  const legendX = W - PAD_R - 5 * 12 - 42;
  out.push(`<text class="t lbl" x="${PAD_L}" y="${legendY + 8}">@${esc(USER)}</text>`);
  out.push(`<text class="t lbl" x="${legendX - 6}" y="${legendY + 8}" text-anchor="end">меньше</text>`);
  t.levels.forEach((c, i) => {
    const extra = i === 0 ? ` stroke="${t.stroke}" stroke-width=".5"` : '';
    out.push(`<rect x="${legendX + i * 12}" y="${legendY}" width="9" height="9" rx="2" fill="${c}"${extra}/>`);
  });
  out.push(`<text class="t lbl" x="${legendX + 5 * 12 + 3}" y="${legendY + 8}">больше</text>`);

  out.push('</svg>');
  return out.join('\n');
}

/* ─────────────────────────── запуск ────────────────────────────── */

const write = async (p, data) => {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, data, 'utf8');
  console.log('  +', p);
};

try {
  console.log(`-> загружаю календарь @${USER}`);
  const days = await fetchCalendar(USER);
  const stats = buildStats(days);
  console.log(
    `-> ${stats.total} вкладов | активных дней: ${stats.activeDays} | серия: ${stats.currentStreak}/${stats.longestStreak}`
  );

  if (!JSON_ONLY) {
    await write(join(OUT, 'contributions-dark.svg'), renderSVG(stats, 'dark'));
    await write(join(OUT, 'contributions-light.svg'), renderSVG(stats, 'light'));
  }
  await write(
    join(OUT, 'contributions.json'),
    JSON.stringify({
      user: stats.user,
      updated: stats.updated,
      from: stats.from,
      to: stats.to,
      total: stats.total,
      activeDays: stats.activeDays,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      bestDay: stats.bestDay,
      days: stats.days.map((d) => [d.date, d.count, d.level]),
    })
  );
  console.log('готово.');
} catch (e) {
  console.error('!', e.message);
  process.exit(1);
}

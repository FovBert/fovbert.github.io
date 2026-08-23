/* ============================================================
   FovBert — логика страницы.
   Без зависимостей. ~150 строк.
   ============================================================ */

(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ── тема ────────────────────────────────────────────────── */

  const root = document.documentElement;
  $('[data-theme-toggle]')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  /* ── год в подвале ───────────────────────────────────────── */

  const yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ── прилипшая панель ────────────────────────────────────── */

  const bar = $('.bar');
  const onScroll = () => bar?.classList.toggle('is-stuck', window.scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── подсветка активного раздела ─────────────────────────── */

  const links = new Map($$('.bar__nav a').map((a) => [a.getAttribute('href').slice(1), a]));
  if (links.size) {
    const spy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          links.forEach((a) => a.classList.remove('is-active'));
          links.get(e.target.id)?.classList.add('is-active');
        }
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* ── появление блоков при скролле ────────────────────────── */

  const reveals = $$('.sec, .hero__meta');
  reveals.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        obs.unobserve(e.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );
  reveals.forEach((el) => io.observe(el));

  // страховка: если наблюдатель по какой-то причине не сработал — показываем всё
  setTimeout(() => reveals.forEach((el) => el.classList.add('is-in')), 1500);

  /* ── календарь активности ────────────────────────────────── */

  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const CELL = 16; // 13px клетка + 3px зазор

  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
    return many;
  };

  const fmt = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  async function renderCalendar() {
    const box = $('[data-cal]');
    if (!box) return;
    const grid = $('[data-cal-grid]', box);

    let data;
    try {
      const res = await fetch('assets/contributions.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch (e) {
      grid.innerHTML = '<p class="cal__empty mono">не удалось загрузить данные календаря</p>';
      return;
    }

    /* метрики */
    const metrics = [data.total, data.activeDays, data.currentStreak, data.longestStreak];
    $$('[data-cal-metrics] b', box).forEach((b, i) => countUp(b, metrics[i] ?? 0));

    const range = $('[data-cal-range]', box);
    if (range && data.from && data.to) range.textContent = `${fmt(data.from)} → ${fmt(data.to)}`;

    const upd = $('[data-cal-updated]', box);
    if (upd && data.updated) {
      upd.textContent = `обновлено ${fmt(data.updated.slice(0, 10))}`;
    }

    /* раскладка по неделям */
    const weeks = [];
    let week = new Array(7).fill(null);
    for (const [date, count, level] of data.days) {
      const wd = new Date(date + 'T00:00:00Z').getUTCDay();
      if (wd === 0 && week.some(Boolean)) { weeks.push(week); week = new Array(7).fill(null); }
      week[wd] = { date, count, level };
    }
    if (week.some(Boolean)) weeks.push(week);

    /* месяцы */
    const months = document.createElement('div');
    months.className = 'cal__months';
    let last = -1;
    weeks.forEach((wk, i) => {
      const first = wk.find(Boolean);
      if (!first) return;
      const m = Number(first.date.slice(5, 7)) - 1;
      if (m !== last && i < weeks.length - 1) {
        last = m;
        const s = document.createElement('span');
        s.textContent = MONTHS[m];
        s.style.left = i * CELL + 'px';
        months.append(s);
      }
    });

    /* дни недели */
    const days = document.createElement('div');
    days.className = 'cal__days';
    ['', 'Пн', '', 'Ср', '', 'Пт', ''].forEach((t) => {
      const s = document.createElement('span');
      s.textContent = t;
      days.append(s);
    });

    /* сетка */
    const wrap = document.createElement('div');
    wrap.className = 'cal__weeks';
    weeks.forEach((wk, wi) => {
      const col = document.createElement('div');
      col.className = 'cal__week';
      wk.forEach((d) => {
        const cell = document.createElement('div');
        cell.className = 'cal__day' + (d ? '' : ' cal__day--void');
        if (d) {
          cell.dataset.lvl = String(d.level);
          cell.title = `${fmt(d.date)} — ${d.count} ${plural(d.count, 'вклад', 'вклада', 'вкладов')}`;
        }
        cell.style.animationDelay = Math.min(wi * 9, 600) + 'ms';
        col.append(cell);
      });
      wrap.append(col);
    });

    grid.replaceChildren(months, days, wrap);

    // календарь показываем с правого края — там «сегодня»
    const scroller = $('.cal__scroll', box);
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }

  function countUp(el, target) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) {
      el.textContent = String(target);
      return;
    }
    const dur = 900;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── репозитории ─────────────────────────────────────────── */

  async function renderRepos() {
    const box = $('[data-repos]');
    if (!box) return;

    let repos;
    try {
      const res = await fetch('https://api.github.com/users/FovBert/repos?per_page=100&sort=pushed');
      if (!res.ok) throw new Error(res.status);
      repos = await res.json();
    } catch (e) {
      box.innerHTML =
        '<p class="repos__hint mono">репозитории — на <a href="https://github.com/FovBert?tab=repositories" target="_blank" rel="noopener" style="color:var(--accent)">github.com/FovBert</a></p>';
      return;
    }

    const list = repos
      .filter((r) => !r.fork && !r.archived && r.name.toLowerCase() !== 'fovbert')
      .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
      .slice(0, 6);

    if (!list.length) {
      box.innerHTML = '<p class="repos__hint mono">публичных репозиториев пока нет</p>';
      return;
    }

    box.replaceChildren(
      ...list.map((r) => {
        const a = document.createElement('a');
        a.className = 'repo';
        a.href = r.html_url;
        a.target = '_blank';
        a.rel = 'noopener';

        const name = document.createElement('span');
        name.className = 'repo__name';
        name.textContent = r.name;

        const desc = document.createElement('span');
        desc.className = 'repo__desc';
        desc.textContent = r.description || 'без описания';

        const meta = document.createElement('span');
        meta.className = 'repo__meta';
        if (r.language) {
          const l = document.createElement('span');
          l.className = 'repo__lang';
          l.textContent = r.language;
          meta.append(l);
        }
        const upd = document.createElement('span');
        upd.textContent = fmt(r.pushed_at.slice(0, 10));
        meta.append(upd);

        a.append(name, desc, meta);
        return a;
      })
    );
  }

  renderCalendar();
  renderRepos();
})();

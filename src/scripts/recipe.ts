/* Client behaviour for a recipe page: view toggle, quantity scaling, and
   cross-off. Loaded once per page, so nothing here is per-component. */

import { renderQty } from '../lib/recipe/format';

/* ── view toggle ───────────────────────────────────────────── */

const VIEW_KEY = 'recipe-view';

function applyView(view: string) {
  document.querySelectorAll<HTMLElement>('[data-method-view]').forEach((region) => {
    region.hidden = region.dataset.methodView !== view;
  });
  document.querySelectorAll<HTMLButtonElement>('.view-pill').forEach((pill) => {
    pill.setAttribute('aria-pressed', String(pill.dataset.view === view));
  });
}

function initViewToggle() {
  const pills = document.querySelectorAll<HTMLButtonElement>('.view-pill');
  if (pills.length === 0) return;

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(VIEW_KEY);
  } catch {
    /* private mode, blocked storage: fall through to the default */
  }
  applyView(stored === 'graph' ? 'graph' : 'prose');

  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const view = pill.dataset.view!;
      applyView(view);
      try {
        localStorage.setItem(VIEW_KEY, view);
      } catch {
        /* not persisting is fine; the toggle still works this session */
      }
    });
  });
}

/* ── scaling ───────────────────────────────────────────────── */

function initStepper() {
  const stepper = document.querySelector<HTMLElement>('.stepper');
  if (!stepper) return;

  const base = Number(stepper.dataset.baseServings ?? '1');
  const countEl = stepper.querySelector<HTMLElement>('.servings-count')!;
  const resetBtn = stepper.querySelector<HTMLButtonElement>('.stepper-reset')!;
  const amounts = document.querySelectorAll<HTMLElement>('[data-qty]');
  let current = base;

  function render() {
    countEl.textContent = String(current);
    resetBtn.hidden = current === base;

    stepper.querySelectorAll<HTMLButtonElement>('.step-btn').forEach((btn) => {
      const next = current + Number(btn.dataset.step);
      btn.disabled = next < 1 || next > 50;
    });

    const factor = current / base;
    amounts.forEach((el) => {
      const qty = Number(el.dataset.qty);
      const unit = el.dataset.unit || undefined;
      const text = renderQty(qty * factor, unit);
      if (text !== el.textContent) {
        el.textContent = text;
        el.classList.add('updated');
        setTimeout(() => el.classList.remove('updated'), 600);
      }
    });
  }

  stepper.querySelectorAll<HTMLButtonElement>('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = current + Number(btn.dataset.step);
      if (next < 1 || next > 50) return;
      current = next;
      render();
    });
  });

  resetBtn.addEventListener('click', () => {
    current = base;
    render();
  });

  render();
}

/* ── cross-off ─────────────────────────────────────────────── */

function initCrossOff() {
  const slug = document.querySelector<HTMLElement>('[data-recipe-slug]')?.dataset.recipeSlug;
  if (!slug) return;
  const key = `recipe:${slug}:crossed`;

  let crossed = new Set<string>();
  try {
    crossed = new Set(JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch {
    /* unreadable or absent: start with nothing crossed off */
  }

  const checks = document.querySelectorAll<HTMLButtonElement>('.ing-check');

  /* the same ingredient appears in both views, so state is keyed by id */
  function paint(id: string, on: boolean) {
    checks.forEach((btn) => {
      if (btn.dataset.ing === id) btn.setAttribute('aria-pressed', String(on));
    });
  }

  crossed.forEach((id) => paint(id, true));

  checks.forEach((btn) => {
    const id = btn.dataset.ing!;
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      if (on) crossed.add(id);
      else crossed.delete(id);
      paint(id, on);
      try {
        localStorage.setItem(key, JSON.stringify([...crossed]));
      } catch {
        /* session-only is an acceptable degradation */
      }
    });
  });
}

/* ── component links ───────────────────────────────────────── */

/* An ingredient can be another component's output ("15g beef salt"). Both views
   render that component, so the href alone would jump to whichever copy the
   markup happens to id, hidden half the time. Scroll to the visible one. */
function initRefLinks() {
  document.querySelectorAll<HTMLAnchorElement>('.ing-ref').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.dataset.ref;
      if (!id) return;

      const target = [...document.querySelectorAll<HTMLElement>(`[data-component="${id}"]`)].find(
        (section) => section.closest('[data-method-view]')?.hasAttribute('hidden') === false,
      );
      if (!target) return; /* let the plain href do whatever it can */

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      /* move focus too, or keyboard users jump visually and not actually */
      const heading = target.querySelector<HTMLElement>('.recipe-component-title');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
  });
}

initViewToggle();
initStepper();
initCrossOff();
initRefLinks();

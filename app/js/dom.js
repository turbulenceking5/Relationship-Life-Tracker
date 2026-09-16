export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null && value !== false) {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(child) : child);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(container, children) {
  clear(container);
  for (const child of [].concat(children)) {
    if (child) container.appendChild(child);
  }
}

export function openSheet(dialogEl) {
  if (typeof dialogEl.showModal === 'function') dialogEl.showModal();
  else dialogEl.setAttribute('open', '');
}

export function closeSheet(dialogEl) {
  if (typeof dialogEl.close === 'function') dialogEl.close();
  else dialogEl.removeAttribute('open');
}

// A <dialog> sheet with a visible close (X) button and tap-outside-to-
// dismiss built in. Without this, a <dialog> has no way to be dismissed
// on iOS short of submitting the form — no Escape key, and tapping the
// backdrop does nothing unless wired up explicitly.
export function makeSheet(title) {
  const dialog = h('dialog', {});
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeSheet(dialog);
  });
  const body = h('div', { class: 'sheet-body' });
  const header = h('div', { class: 'sheet-header' }, [
    h('h2', {}, title),
    h('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Close', onclick: () => closeSheet(dialog) }, '✕'),
  ]);
  mount(dialog, h('div', { class: 'sheet' }, [header, body]));
  return { dialog, body };
}

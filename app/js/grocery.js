import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';

const TABLE = 'grocery_items';

export async function render(container, ctx) {
  const rows = await fetchRows(TABLE, ctx.household.id, 'created_at', true);
  const toBuy = rows.filter((r) => !r.is_done);
  const bought = rows.filter((r) => r.is_done);

  const { dialog, body } = makeSheet('Add grocery item');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Milk' });
  const quantityInput = h('input', { type: 'text', placeholder: 'e.g. 2L (optional)' });
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          quantity: quantityInput.value.trim() || null,
          created_by: ctx.user.id,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Item'), titleInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Quantity'), quantityInput]),
    ]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Add item'),
  ]);
  mount(body, form);

  function itemCard(item) {
    const checkbox = h('input', {
      type: 'checkbox',
      checked: item.is_done,
      onchange: async () => {
        await updateRow(TABLE, item.id, { is_done: checkbox.checked });
        render(container, ctx);
      },
    });
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('label', { style: 'display:flex;align-items:center;gap:10px;flex:1' }, [
          checkbox,
          h('span', { style: item.is_done ? 'text-decoration:line-through;color:var(--text-muted)' : '' },
            item.quantity ? `${item.title} · ${item.quantity}` : item.title),
        ]),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TABLE, item.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  mount(container, [
    h('button', { class: 'btn secondary small', style: 'margin-bottom:14px', onclick: () => openSheet(dialog) }, '+ Add item'),
    h('div', { class: 'section-title' }, 'To buy'),
    toBuy.length ? h('div', {}, toBuy.map(itemCard)) : h('div', { class: 'empty-state' }, 'Nothing on the list — add something above.'),
    ...(bought.length ? [
      h('div', { class: 'section-title' }, 'In cart'),
      h('div', {}, bought.map(itemCard)),
      h('button', {
        class: 'btn danger-text small',
        onclick: async () => {
          if (!confirm('Clear all bought items?')) return;
          await Promise.all(bought.map((b) => deleteRow(TABLE, b.id)));
          render(container, ctx);
        },
      }, 'Clear bought items'),
    ] : []),
    dialog,
  ]);
}

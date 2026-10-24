import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { fetchRows, insertRow, insertRows, updateRow, deleteRow } from './crud.js';
import { getHouseholdMembers } from './household.js';

const TABLE = 'grocery_items';

// Fixed shop-aisle order rather than alphabetical, so sections read the
// way you'd actually walk the store. 'other' always sorts last as a
// catch-all. A stray/legacy category not in this list still renders fine —
// categoryLabel() falls back to capitalizing it, it just sorts after
// 'other' since it isn't found in CATEGORY_ORDER.
export const GROCERY_CATEGORIES = ['produce', 'meat', 'dairy', 'bakery', 'frozen', 'pantry', 'household', 'other'];

function categoryLabel(category) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function categoryRank(category) {
  const i = GROCERY_CATEGORIES.indexOf(category);
  return i === -1 ? GROCERY_CATEGORIES.length : i;
}

// Keyword guesses for the add form, checked against the typed title as a
// whole word/phrase (word-boundary regex, not a plain substring match —
// "oil" as a bare substring would otherwise false-match inside "toilet
// (paper)", and "ham" inside "shampoo"). Listed in match-priority order,
// not GROCERY_CATEGORIES' shop-aisle order: 'frozen' is checked first
// since it's the strongest signal (a "frozen peas" shouldn't fall through
// to 'produce' just because it also matches 'peas'), and 'other' has no
// keyword list at all — it's the fallback when nothing matches, which is
// exactly the "unknown, you pick" case this is for.
const CATEGORY_KEYWORDS = {
  frozen: ['frozen', 'ice cream', 'ice-cream', 'icecream', 'ice block', 'popsicle'],
  meat: ['chicken', 'beef', 'mince', 'steak', 'pork', 'bacon', 'sausage', 'lamb', 'ham', 'turkey', 'salami', 'schnitzel', 'patty', 'patties', 'fish', 'salmon', 'tuna', 'prawn', 'seafood'],
  dairy: ['milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'egg'],
  bakery: ['bread', 'bagel', 'roll', 'croissant', 'muffin', 'bun', 'baguette', 'tortilla', 'wrap', 'pastry'],
  produce: ['apple', 'banana', 'orange', 'lettuce', 'tomato', 'tomatoes', 'potato', 'potatoes', 'onion', 'carrot', 'capsicum', 'cucumber', 'avocado', 'mushroom', 'broccoli', 'spinach', 'garlic', 'lemon', 'lime', 'grape', 'berry', 'berries', 'mandarin', 'pear', 'pumpkin', 'zucchini', 'celery', 'kale', 'herbs', 'basil', 'coriander', 'parsley', 'mint', 'ginger', 'corn', 'cabbage'],
  pantry: ['pasta', 'rice', 'flour', 'sugar', 'cereal', 'oats', 'sauce', 'oil', 'vinegar', 'spice', 'salt', 'pepper', 'tea', 'coffee', 'honey', 'jam', 'peanut butter', 'nuts', 'crackers', 'biscuit', 'chocolate', 'snack', 'soup', 'stock', 'noodle', 'lentil', 'canned', 'tinned'],
  household: ['toilet paper', 'paper towel', 'dish soap', 'detergent', 'washing powder', 'laundry', 'cleaning', 'bin bag', 'garbage bag', 'sponge', 'foil', 'cling wrap', 'batteries', 'soap', 'shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'deodorant'],
};

// An optional trailing 's' handles the common case of a regular plural
// ("banana" also matching "bananas") without a full pluralization
// library; an irregular plural (tomato/tomatoes, berry/berries) is just
// listed as its own extra keyword above instead.
function matchesKeyword(title, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}s?\\b`, 'i').test(title);
}

export function guessCategory(title) {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => matchesKeyword(title, k))) return category;
  }
  return null;
}

// Splits a pasted multi-line list (e.g. copied out of a notes app) into
// one {title, quantity} pair per non-blank line, so "Paste list" can
// bulk-add a whole list in one go instead of one "+ Add item" per line.
// Recognizes the handful of quantity conventions people actually type —
// "Milk - 2", "Milk x2"/"Milk x 2", "2x Milk", "Milk (2L)" — in addition
// to a bare "Eggs" with no quantity at all. Anything that doesn't match
// one of those shapes is kept as-is with no quantity rather than dropped,
// since a rough guess here is still better than silently losing the line.
export function parseGroceryListText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseGroceryLine);
}

function parseGroceryLine(rawLine) {
  // Strip a leading bullet/numbering marker ("- ", "* ", "• ", "1. ", "1) ")
  // some notes apps add automatically — it's noise, not part of the title.
  const line = rawLine.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();

  // "2 x Milk" / "2x Milk" — leading quantity.
  let m = line.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(.+)$/i);
  if (m) return { title: m[2].trim(), quantity: m[1] };

  // "Milk - 2" — a space-dash-space, so a hyphenated word like
  // "ice-cream" (no surrounding spaces around its dash) isn't mistaken
  // for a title/quantity split.
  m = line.match(/^(.+?)\s+-\s+(.+)$/);
  if (m) return { title: m[1].trim(), quantity: m[2].trim() };

  // "Milk x2" / "Milk x 2" — trailing quantity.
  m = line.match(/^(.+?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
  if (m) return { title: m[1].trim(), quantity: `x${m[2]}` };

  // "Milk (2L)" / "Milk (2)"
  m = line.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (m) return { title: m[1].trim(), quantity: m[2].trim() };

  return { title: line, quantity: null };
}

function openPasteSheet(container, ctx) {
  const { dialog, body } = makeSheet('Paste grocery list');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const textarea = h('textarea', {
    rows: '8',
    required: true,
    placeholder: 'Milk - 2\nEggs\nCoffee',
  });
  const hint = h('div', { class: 'meta' }, 'One item per line. A category is guessed automatically for each, just like adding items one at a time.');
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Add items');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const items = parseGroceryListText(textarea.value);
      if (!items.length) {
        errorEl.textContent = 'Paste at least one item, one per line.';
        errorEl.style.display = 'block';
        return;
      }
      const restore = withBusyLabel(submitBtn, 'Adding…');
      try {
        await insertRows(TABLE, items.map((item) => ({
          household_id: ctx.household.id,
          title: item.title,
          quantity: item.quantity,
          category: guessCategory(item.title) || 'other',
          created_by: ctx.user.id,
        })));
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Paste your list'), textarea]),
    hint,
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

// Matches title or quantity — case-insensitive substring, same shape as
// the search on Expenses/Documents/Recipes.
function matchesSearch(row, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return row.title.toLowerCase().includes(q) || (row.quantity || '').toLowerCase().includes(q);
}

function openEditSheet(row, container, ctx) {
  const { dialog, body } = makeSheet('Edit grocery item');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, value: row.title });
  const quantityInput = h('input', { type: 'text', value: row.quantity || '', placeholder: 'e.g. 2L (optional)' });
  const categorySelect = h('select', {}, GROCERY_CATEGORIES.map((c) => h('option', { value: c, selected: c === row.category }, categoryLabel(c))));
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save changes');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await updateRow(TABLE, row.id, {
          title: titleInput.value.trim(),
          quantity: quantityInput.value.trim() || null,
          category: categorySelect.value,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Item'), titleInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Quantity'), quantityInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

export async function render(container, ctx) {
  const [rows, members] = await Promise.all([
    fetchRows(TABLE, ctx.household.id, 'created_at', true),
    getHouseholdMembers(ctx.household.id),
  ]);
  const memberName = (id) => members.find((m) => m.user_id === id)?.display_name;

  const { dialog, body } = makeSheet('Add grocery item');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Milk' });
  const quantityInput = h('input', { type: 'text', placeholder: 'e.g. 2L (optional)' });
  const categorySelect = h('select', {}, GROCERY_CATEGORIES.map((c) => h('option', { value: c, selected: c === 'other' }, categoryLabel(c))));
  // Auto-guesses the category from the item name as it's typed (see
  // guessCategory() above), so adding "Milk" just works without having to
  // touch the dropdown. Falls back to — and stays on — 'other' for
  // anything unrecognized, which is exactly where the dropdown comes in:
  // it's still a normal, always-editable select, so picking the right
  // category for an unknown item is one tap away. Once someone picks a
  // category by hand, further typing stops overwriting their choice.
  let categoryTouched = false;
  categorySelect.addEventListener('change', () => { categoryTouched = true; });
  titleInput.addEventListener('input', () => {
    if (categoryTouched) return;
    categorySelect.value = guessCategory(titleInput.value) || 'other';
  });
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Add item');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Adding…');
      try {
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          quantity: quantityInput.value.trim() || null,
          category: categorySelect.value,
          created_by: ctx.user.id,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Item'), titleInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Quantity'), quantityInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
    errorEl,
    submitBtn,
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
    const addedBy = memberName(item.created_by);
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('label', { style: 'display:flex;align-items:center;gap:10px;flex:1' }, [
          checkbox,
          h('div', {}, [
            h('span', { style: item.is_done ? 'text-decoration:line-through;color:var(--text-muted)' : '' },
              item.quantity ? `${item.title} · ${item.quantity}` : item.title),
            addedBy ? h('div', { class: 'meta' }, `added by ${addedBy}`) : null,
          ]),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn secondary small', onclick: () => openEditSheet(item, container, ctx) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TABLE, item.id); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  const searchInput = h('input', { type: 'search', placeholder: 'Search grocery list…' });
  const listContainer = h('div', {});
  function renderList() {
    const query = searchInput.value.trim();
    const filtered = rows.filter((r) => matchesSearch(r, query));
    const toBuy = filtered.filter((r) => !r.is_done);
    const bought = filtered.filter((r) => r.is_done);

    // Grouped into sections by category (in shop-aisle order) rather than
    // one flat list — the point of categorizing a grocery list is reading
    // it section-by-section while actually walking the store, not just
    // tagging items for later. "In cart" stays a flat list below since
    // it's just a holding area before "Clear bought items", not something
    // you read while shopping.
    const toBuySections = GROCERY_CATEGORIES
      .map((c) => ({ category: c, items: toBuy.filter((r) => r.category === c) }))
      .filter((s) => s.items.length);
    for (const r of toBuy) {
      if (!GROCERY_CATEGORIES.includes(r.category)) {
        let stray = toBuySections.find((s) => s.category === r.category);
        if (!stray) { stray = { category: r.category, items: [] }; toBuySections.push(stray); }
        stray.items.push(r);
      }
    }
    toBuySections.sort((a, b) => categoryRank(a.category) - categoryRank(b.category));

    mount(listContainer, [
      h('div', { class: 'section-title' }, 'To buy'),
      toBuySections.length
        ? h('div', {}, toBuySections.flatMap((s) => [
            h('div', { class: 'meta', style: 'margin:10px 0 4px;font-weight:600' }, categoryLabel(s.category)),
            ...s.items.map(itemCard),
          ]))
        : h('div', { class: 'empty-state' }, query ? 'No items match your search.' : 'Nothing on the list — add something above.'),
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
    ]);
  }
  searchInput.addEventListener('input', renderList);
  renderList();

  mount(container, [
    h('div', { class: 'action-chip-row' }, [
      h('button', { class: 'btn secondary small', onclick: () => openSheet(dialog) }, '+ Add item'),
      h('button', { class: 'btn secondary small', onclick: () => openPasteSheet(container, ctx) }, '📋 Paste list'),
    ]),
    rows.length ? h('div', { class: 'field' }, searchInput) : null,
    listContainer,
    dialog,
  ]);
}

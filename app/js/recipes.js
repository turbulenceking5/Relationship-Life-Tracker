import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { guessCategory } from './grocery.js';

const TABLE = 'recipes';
const GROCERY_TABLE = 'grocery_items';

function parseLines(text) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

function renderRecipeBody(section, ctx, recipe, editing, onChanged) {
  function editForm() {
    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const editTitleInput = h('input', { type: 'text', required: true, value: recipe.title });
    const editIngredientsInput = h('textarea', { rows: '5' }, (recipe.ingredients || []).join('\n'));
    const editInstructionsInput = h('textarea', { rows: '5' }, (recipe.instructions || []).join('\n'));
    const submitBtn = h('button', { class: 'btn primary small', type: 'submit' }, 'Save');
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        const restore = withBusyLabel(submitBtn, 'Saving…');
        try {
          const patch = {
            title: editTitleInput.value.trim(),
            ingredients: parseLines(editIngredientsInput.value),
            instructions: parseLines(editInstructionsInput.value),
          };
          await updateRow(TABLE, recipe.id, patch);
          // Re-render the whole list (not just this section) since the
          // collapsed <summary> title was baked in as a string when the
          // list was first built — mutating `recipe` in place wouldn't
          // update it — and a title change can also move the recipe's
          // alphabetical position.
          onChanged();
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
          restore();
        }
      },
    }, [
      h('div', { class: 'field' }, [h('label', {}, 'Title'), editTitleInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Ingredients (one per line)'), editIngredientsInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Instructions (one step per line)'), editInstructionsInput]),
      errorEl,
      h('div', { class: 'actions-row' }, [
        submitBtn,
        h('button', { class: 'btn secondary small', type: 'button', onclick: () => renderRecipeBody(section, ctx, recipe, false, onChanged) }, 'Cancel'),
      ]),
      h('button', {
        class: 'btn danger-text small',
        type: 'button',
        onclick: async () => {
          if (!confirm(`Delete "${recipe.title}"?`)) return;
          await deleteRow(TABLE, recipe.id);
          onChanged();
        },
      }, 'Delete recipe'),
    ]);
    return h('div', { class: 'card' }, form);
  }

  // Pushes every ingredient line into the Grocery List's To Buy section,
  // running each through the same guessCategory() keyword-matcher the
  // Grocery List's own add form uses — so "500g beef mince" lands under
  // Meat automatically, same as typing it there by hand. Whole lines go
  // in as the item title (quantity and all) rather than trying to split
  // "500g beef mince" into a separate quantity field — a recipe line is
  // already exactly how you'd want it to read on the shopping list.
  async function addIngredientsToGroceryList(button) {
    const ingredients = recipe.ingredients || [];
    if (!ingredients.length) return;
    const restore = withBusyLabel(button, 'Adding…');
    try {
      await Promise.all(ingredients.map((line) => insertRow(GROCERY_TABLE, {
        household_id: ctx.household.id,
        title: line,
        category: guessCategory(line) || 'other',
        created_by: ctx.user.id,
      })));
      button.textContent = `Added ${ingredients.length} item${ingredients.length === 1 ? '' : 's'} ✓`;
      setTimeout(restore, 2000);
    } catch (err) {
      restore();
      alert(err.message);
    }
  }

  const content = [];
  if (editing) {
    content.push(editForm());
  } else {
    content.push(h('div', { class: 'section-title' }, 'Ingredients'));
    content.push(recipe.ingredients && recipe.ingredients.length
      ? h('ul', { class: 'recipe-list' }, recipe.ingredients.map((i) => h('li', {}, i)))
      : h('div', { class: 'empty-state' }, 'No ingredients listed.'));
    if (recipe.ingredients && recipe.ingredients.length) {
      content.push(h('button', {
        class: 'btn secondary small',
        style: 'margin-bottom:10px',
        onclick: (e) => addIngredientsToGroceryList(e.currentTarget),
      }, '+ Add ingredients to Grocery List'));
    }

    content.push(h('div', { class: 'section-title' }, 'Instructions'));
    content.push(recipe.instructions && recipe.instructions.length
      ? h('ol', { class: 'recipe-list' }, recipe.instructions.map((i) => h('li', {}, i)))
      : h('div', { class: 'empty-state' }, 'No instructions listed.'));

    content.push(h('button', { class: 'btn text', onclick: () => renderRecipeBody(section, ctx, recipe, true, onChanged) }, 'Edit recipe'));
  }
  mount(section, content);
}

export async function render(container, ctx) {
  const recipes = await fetchRows(TABLE, ctx.household.id, 'title', true);

  const { dialog, body } = makeSheet('Add recipe');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Spaghetti Bolognese' });
  const ingredientsInput = h('textarea', { rows: '5', placeholder: 'One ingredient per line, e.g.\n500g beef mince\n1 onion, diced' });
  const instructionsInput = h('textarea', { rows: '5', placeholder: 'One step per line, e.g.\nBrown the mince\nAdd onion and cook until soft' });
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save recipe');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          ingredients: parseLines(ingredientsInput.value),
          instructions: parseLines(instructionsInput.value),
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
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Ingredients (one per line)'), ingredientsInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Instructions (one step per line)'), instructionsInput]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);

  const searchInput = h('input', { type: 'search', placeholder: 'Search recipes…' });
  const listContainer = h('div', {});
  function renderList() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = query ? recipes.filter((r) => r.title.toLowerCase().includes(query)) : recipes;
    mount(listContainer, filtered.length
      ? filtered.map((r) => h('details', { class: 'goal-section', open: filtered.length === 1 }, [
          h('summary', {}, r.title),
          h('div', { class: 'goal-section-body', id: `recipe-body-${r.id}` }, h('div', { class: 'empty-state' }, 'Loading…')),
        ]))
      : [h('div', { class: 'empty-state' }, query ? 'No recipes match your search.' : 'No recipes yet — add one to start your collection.')]);
    for (const recipe of filtered) {
      const section = listContainer.querySelector(`#recipe-body-${recipe.id}`);
      if (section) renderRecipeBody(section, ctx, recipe, false, () => render(container, ctx));
    }
  }
  searchInput.addEventListener('input', renderList);
  renderList();

  mount(container, [
    h('button', { class: 'btn secondary small', style: 'margin-bottom:14px', onclick: () => openSheet(dialog) }, '+ Add recipe'),
    recipes.length ? h('div', { class: 'field' }, searchInput) : null,
    listContainer,
    dialog,
  ]);
}

import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';

const TABLE = 'recipes';

function parseLines(text) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

function renderRecipeBody(section, ctx, recipe, editing, onChanged) {
  function editForm() {
    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const editTitleInput = h('input', { type: 'text', required: true, value: recipe.title });
    const editIngredientsInput = h('textarea', { rows: '5' }, (recipe.ingredients || []).join('\n'));
    const editInstructionsInput = h('textarea', { rows: '5' }, (recipe.instructions || []).join('\n'));
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
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
        }
      },
    }, [
      h('div', { class: 'field' }, [h('label', {}, 'Title'), editTitleInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Ingredients (one per line)'), editIngredientsInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Instructions (one step per line)'), editInstructionsInput]),
      errorEl,
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn primary small', type: 'submit' }, 'Save'),
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

  const content = [];
  if (editing) {
    content.push(editForm());
  } else {
    content.push(h('div', { class: 'section-title' }, 'Ingredients'));
    content.push(recipe.ingredients && recipe.ingredients.length
      ? h('ul', { class: 'recipe-list' }, recipe.ingredients.map((i) => h('li', {}, i)))
      : h('div', { class: 'empty-state' }, 'No ingredients listed.'));

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
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
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
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Ingredients (one per line)'), ingredientsInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Instructions (one step per line)'), instructionsInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save recipe'),
  ]);
  mount(body, form);

  mount(container, [
    h('button', { class: 'btn secondary small', style: 'margin-bottom:14px', onclick: () => openSheet(dialog) }, '+ Add recipe'),
    recipes.length
      ? h('div', {}, recipes.map((r) => h('details', { class: 'goal-section', open: recipes.length === 1 }, [
          h('summary', {}, r.title),
          h('div', { class: 'goal-section-body', id: `recipe-body-${r.id}` }, h('div', { class: 'empty-state' }, 'Loading…')),
        ])))
      : h('div', { class: 'empty-state' }, 'No recipes yet — add one to start your collection.'),
    dialog,
  ]);

  for (const recipe of recipes) {
    const section = container.querySelector(`#recipe-body-${recipe.id}`);
    if (section) renderRecipeBody(section, ctx, recipe, false, () => render(container, ctx));
  }
}

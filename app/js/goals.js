import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, formatMoney, daysUntil, todayStr } from './format.js';
import { viewDocument, removeDocument, openEditDocumentSheet, openUploadDocumentSheet } from './documents.js';

const GOALS_TABLE = 'custom_goals';
const TXN_TABLE = 'goal_transactions';
const TASKS_TABLE = 'goal_tasks';
const DOCUMENTS_TABLE = 'documents';

function goalCountdown(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return '';
  if (days === 0) return "It's today! \u{1F389}";
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} to go`;
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
}

export async function render(container, ctx) {
  const goals = await fetchRows(GOALS_TABLE, ctx.household.id, 'created_at', false);

  const { dialog: addGoalDialog, body: addGoalBody } = makeSheet('Add goal');
  const addErrorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Holiday fund' });
  const targetInput = h('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00 (optional)' });
  const dateInput = h('input', { type: 'date' });
  const addGoalForm = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      addErrorEl.style.display = 'none';
      try {
        await insertRow(GOALS_TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          target_amount: targetInput.value ? parseFloat(targetInput.value) : null,
          target_date: dateInput.value || null,
          currency: ctx.household.default_currency || 'AUD',
          created_by: ctx.user.id,
        });
        closeSheet(addGoalDialog);
        render(container, ctx);
      } catch (err) {
        addErrorEl.textContent = err.message;
        addErrorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Target amount (optional)'), targetInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Target date (optional)'), dateInput]),
    ]),
    addErrorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
  ]);
  mount(addGoalBody, addGoalForm);

  mount(container, [
    h('button', { class: 'btn secondary small', style: 'margin-bottom:14px', onclick: () => openSheet(addGoalDialog) }, '+ Add goal'),
    goals.length
      ? h('div', {}, goals.map((goal) => h('details', { class: 'goal-section', open: goals.length === 1 }, [
          h('summary', {}, goal.title),
          h('div', { class: 'goal-section-body', id: `goal-body-${goal.id}` }, h('div', { class: 'empty-state' }, 'Loading…')),
        ])))
      : h('div', { class: 'empty-state' }, 'No goals yet — add one to start tracking it.'),
    addGoalDialog,
  ]);

  for (const goal of goals) {
    const body = container.querySelector(`#goal-body-${goal.id}`);
    if (body) renderGoalBody(body, ctx, goal, false, () => render(container, ctx));
  }
}

async function renderGoalBody(section, ctx, goal, editing = false, onDeleted) {
  const [transactions, tasks, documents] = await Promise.all([
    fetchRows(TXN_TABLE, ctx.household.id, 'transaction_date', false).then((rows) => rows.filter((r) => r.goal_id === goal.id)),
    fetchRows(TASKS_TABLE, ctx.household.id, 'created_at', true).then((rows) => rows.filter((r) => r.goal_id === goal.id)),
    fetchRows(DOCUMENTS_TABLE, ctx.household.id, 'created_at', false).then((rows) => rows.filter((r) => r.related_type === 'goal' && r.related_id === goal.id)),
  ]);

  const currency = goal.currency || ctx.household.default_currency || 'AUD';
  const saved = transactions.filter((t) => t.type === 'saved').reduce((sum, t) => sum + Number(t.amount), 0);
  const spent = transactions.filter((t) => t.type === 'spent').reduce((sum, t) => sum + Number(t.amount), 0);
  const target = goal.target_amount != null ? Number(goal.target_amount) : null;
  const remaining = target !== null ? Math.max(target - saved, 0) : null;

  function editForm() {
    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const editTitleInput = h('input', { type: 'text', required: true, value: goal.title });
    const editDateInput = h('input', { type: 'date', value: goal.target_date || '' });
    const editTargetInput = h('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00', value: target !== null ? target : '' });
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        try {
          await updateRow(GOALS_TABLE, goal.id, {
            title: editTitleInput.value.trim(),
            target_date: editDateInput.value || null,
            target_amount: editTargetInput.value ? parseFloat(editTargetInput.value) : null,
          });
          Object.assign(goal, {
            title: editTitleInput.value.trim(),
            target_date: editDateInput.value || null,
            target_amount: editTargetInput.value ? parseFloat(editTargetInput.value) : null,
          });
          renderGoalBody(section, ctx, goal, false, onDeleted);
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      },
    }, [
      h('div', { class: 'field' }, [h('label', {}, 'Title'), editTitleInput]),
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [h('label', {}, 'Target date'), editDateInput]),
        h('div', { class: 'field' }, [h('label', {}, 'Target amount'), editTargetInput]),
      ]),
      errorEl,
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn primary small', type: 'submit' }, 'Save'),
        h('button', { class: 'btn secondary small', type: 'button', onclick: () => renderGoalBody(section, ctx, goal, false, onDeleted) }, 'Cancel'),
      ]),
      h('button', {
        class: 'btn danger-text small',
        type: 'button',
        onclick: async () => {
          if (!confirm(`Delete "${goal.title}"? This also deletes its transactions.`)) return;
          await deleteRow(GOALS_TABLE, goal.id);
          if (onDeleted) onDeleted();
        },
      }, 'Delete goal'),
    ]);
    return h('div', { class: 'card' }, form);
  }

  function openEditTxnSheet(t) {
    const { dialog: editDialog, body: editBody } = makeSheet(`Edit transaction — ${goal.title}`);
    document.body.appendChild(editDialog);
    editDialog.addEventListener('close', () => editDialog.remove());

    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const editTypeSelect = h('select', {}, [
      h('option', { value: 'saved', selected: t.type === 'saved' }, 'Saved toward the goal'),
      h('option', { value: 'spent', selected: t.type === 'spent' }, 'Spent on the goal'),
    ]);
    const editTitleInput = h('input', { type: 'text', required: true, value: t.title });
    const editAmountInput = h('input', { type: 'number', step: '0.01', min: '0', required: true, value: t.amount });
    const editDateInput = h('input', { type: 'date', required: true, value: t.transaction_date });
    const editNotesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' }, t.notes || '');
    const editForm = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        try {
          await updateRow(TXN_TABLE, t.id, {
            type: editTypeSelect.value,
            title: editTitleInput.value.trim(),
            amount: parseFloat(editAmountInput.value),
            transaction_date: editDateInput.value,
            notes: editNotesInput.value.trim() || null,
          });
          closeSheet(editDialog);
          renderGoalBody(section, ctx, goal, editing, onDeleted);
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      },
    }, [
      h('div', { class: 'field' }, [h('label', {}, 'Type'), editTypeSelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Title'), editTitleInput]),
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [h('label', {}, 'Amount'), editAmountInput]),
        h('div', { class: 'field' }, [h('label', {}, 'Date'), editDateInput]),
      ]),
      h('div', { class: 'field' }, [h('label', {}, 'Notes'), editNotesInput]),
      errorEl,
      h('button', { class: 'btn primary', type: 'submit' }, 'Save changes'),
    ]);
    mount(editBody, editForm);
    openSheet(editDialog);
  }

  const { dialog, body } = makeSheet(`Add transaction — ${goal.title}`);
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const typeSelect = h('select', {}, [
    h('option', { value: 'saved' }, 'Saved toward the goal'),
    h('option', { value: 'spent' }, 'Spent on the goal'),
  ]);
  const txnTitleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Deposit' });
  const amountInput = h('input', { type: 'number', step: '0.01', min: '0', required: true, placeholder: '0.00' });
  const txnDateInput = h('input', { type: 'date', required: true, value: todayStr() });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        await insertRow(TXN_TABLE, {
          goal_id: goal.id,
          household_id: ctx.household.id,
          type: typeSelect.value,
          title: txnTitleInput.value.trim(),
          amount: parseFloat(amountInput.value),
          transaction_date: txnDateInput.value,
          notes: notesInput.value.trim() || null,
          created_by: ctx.user.id,
        });
        closeSheet(dialog);
        renderGoalBody(section, ctx, goal, editing, onDeleted);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Type'), typeSelect]),
    h('div', { class: 'field' }, [h('label', {}, 'Title'), txnTitleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Amount'), amountInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Date'), txnDateInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Notes'), notesInput]),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
  ]);
  mount(body, form);

  function txnCard(t) {
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, t.title),
          h('div', { class: 'meta' }, `${formatDate(t.transaction_date)}${t.notes ? ' · ' + t.notes : ''}`),
        ]),
        h('div', { style: 'text-align:right' }, [
          h('div', { class: `amount ${t.type === 'saved' ? 'positive' : 'negative'}` }, `${t.type === 'saved' ? '+' : '-'}${formatMoney(t.amount, currency)}`),
          h('span', { class: 'pill' }, t.type === 'saved' ? 'Saved' : 'Spent'),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn secondary small', onclick: () => openEditTxnSheet(t) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TXN_TABLE, t.id); renderGoalBody(section, ctx, goal, editing, onDeleted); } }, 'Delete'),
      ]),
    ]);
  }

  const { dialog: taskDialog, body: taskBody } = makeSheet(`Add task — ${goal.title}`);
  const taskErrorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const taskTitleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Book venue' });
  const taskForm = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      taskErrorEl.style.display = 'none';
      try {
        await insertRow(TASKS_TABLE, {
          goal_id: goal.id,
          household_id: ctx.household.id,
          title: taskTitleInput.value.trim(),
          created_by: ctx.user.id,
        });
        closeSheet(taskDialog);
        renderGoalBody(section, ctx, goal, editing, onDeleted);
      } catch (err) {
        taskErrorEl.textContent = err.message;
        taskErrorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Task'), taskTitleInput]),
    taskErrorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
  ]);
  mount(taskBody, taskForm);

  function taskCard(t) {
    const checkbox = h('input', {
      type: 'checkbox',
      checked: t.is_done,
      onchange: async () => {
        await updateRow(TASKS_TABLE, t.id, { is_done: checkbox.checked });
        renderGoalBody(section, ctx, goal, editing, onDeleted);
      },
    });
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('label', { style: 'display:flex;align-items:center;gap:10px;flex:1' }, [
          checkbox,
          h('span', { style: t.is_done ? 'text-decoration:line-through;color:var(--text-muted)' : '' }, t.title),
        ]),
        h('button', { class: 'btn danger-text small', onclick: async () => { await deleteRow(TASKS_TABLE, t.id); renderGoalBody(section, ctx, goal, editing, onDeleted); } }, 'Delete'),
      ]),
    ]);
  }

  function documentCard(d) {
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, d.title),
          h('div', { class: 'meta' }, `${d.category || 'document'} · added ${formatDate(d.created_at.slice(0, 10))}`),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn secondary small', onclick: () => viewDocument(d) }, 'View'),
        h('button', { class: 'btn secondary small', onclick: () => openEditDocumentSheet(d, () => renderGoalBody(section, ctx, goal, editing, onDeleted)) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await removeDocument(d); renderGoalBody(section, ctx, goal, editing, onDeleted); } }, 'Delete'),
      ]),
    ]);
  }

  const content = [];

  if (editing) {
    content.push(editForm());
  } else {
    if (goal.target_date) {
      content.push(h('div', { class: 'total-banner' }, [
        h('span', {}, goalCountdown(goal.target_date)),
        h('span', { class: 'value' }, formatDate(goal.target_date)),
      ]));
    }
    content.push(h('div', { class: 'card' }, [
      target !== null ? h('div', { class: 'card-row' }, [h('span', {}, 'Target'), h('span', { class: 'amount' }, formatMoney(target, currency))]) : null,
      h('div', { class: 'card-row', style: 'margin-top:6px' }, [h('span', {}, 'Saved so far'), h('span', { class: 'amount positive' }, formatMoney(saved, currency))]),
      h('div', { class: 'card-row', style: 'margin-top:6px' }, [h('span', {}, 'Spent so far'), h('span', { class: 'amount negative' }, formatMoney(spent, currency))]),
      remaining !== null ? h('div', { class: 'card-row', style: 'margin-top:6px' }, [h('span', {}, 'Remaining to save'), h('span', { class: 'amount' }, formatMoney(remaining, currency))]) : null,
    ]));
    content.push(h('button', { class: 'btn text', onclick: () => renderGoalBody(section, ctx, goal, true, onDeleted) }, 'Edit goal'));
  }

  content.push(h('div', { class: 'section-title' }, 'Transactions'));
  content.push(h('button', { class: 'btn secondary small', style: 'margin-bottom:10px', onclick: () => openSheet(dialog) }, '+ Add transaction'));
  content.push(transactions.length ? h('div', {}, transactions.map(txnCard)) : h('div', { class: 'empty-state' }, 'No transactions logged yet.'));
  content.push(dialog);

  content.push(h('div', { class: 'section-title' }, 'Tasks'));
  content.push(h('button', { class: 'btn secondary small', style: 'margin-bottom:10px', onclick: () => openSheet(taskDialog) }, '+ Add task'));
  content.push(tasks.length ? h('div', {}, tasks.map(taskCard)) : h('div', { class: 'empty-state' }, 'No tasks yet.'));
  content.push(taskDialog);

  content.push(h('div', { class: 'section-title' }, 'Documents'));
  content.push(h('button', {
    class: 'btn secondary small',
    style: 'margin-bottom:10px',
    onclick: () => openUploadDocumentSheet(ctx, {
      sheetTitle: `Add document — ${goal.title}`,
      relatedType: 'goal',
      relatedId: goal.id,
      onSaved: () => renderGoalBody(section, ctx, goal, editing, onDeleted),
    }),
  }, '+ Add document'));
  content.push(documents.length ? h('div', {}, documents.map(documentCard)) : h('div', { class: 'empty-state' }, 'No documents linked yet.'));

  mount(section, content);
}

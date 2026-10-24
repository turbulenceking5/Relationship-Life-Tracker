import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, todayStr, currentOccurrence, occurrenceCycleCount } from './format.js';
import { getHouseholdMembers } from './household.js';
import { getCommentCounts, deleteCommentsFor, openCommentsSheet } from './comments.js';
import { buildIcsEvent, downloadIcs } from './ics.js';

const TABLE = 'events';
const ENTITY_TYPE = 'event';
const CATEGORIES = ['birthday', 'anniversary', 'appointment', 'other'];
const DEFAULT_RECURRING_CATEGORIES = ['birthday', 'anniversary'];
const REPEAT_OPTIONS = [
  { value: 'never', label: "Doesn't repeat" },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

// "Alternate between us" — only meaningful for a recurring event in a
// two-person household, so this returns null (nothing to mount) rather
// than a disabled control when either condition isn't met. `assignee_
// user_id` holds who's assigned on the event's own anchor occurrence;
// whose turn it currently is gets computed from that plus
// occurrenceCycleCount() (see turnLabel() below), not stored per
// occurrence.
function buildRotationField(members, initial) {
  if (members.length !== 2) return null;
  const rotateCheckbox = h('input', { type: 'checkbox', checked: initial?.rotate_assignee || false });
  const assigneeSelect = h('select', {}, members.map((m) => h('option', {
    value: m.user_id,
    selected: m.user_id === (initial?.assignee_user_id || members[0].user_id),
  }, m.display_name)));
  const wrapper = h('div', { class: 'field', style: 'display:none' }, [
    h('label', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px' }, [rotateCheckbox, h('span', {}, 'Alternate between us each time')]),
    h('div', { class: 'field' }, [h('label', {}, 'Starting with'), assigneeSelect]),
  ]);
  return { wrapper, rotateCheckbox, assigneeSelect };
}

// Only shown while the "Repeats" select is on something other than
// "Doesn't repeat" — a one-off event has no "each time" to alternate.
function wireRotationVisibility(repeatSelect, rotation) {
  if (!rotation) return;
  const update = () => { rotation.wrapper.style.display = repeatSelect.value === 'never' ? 'none' : 'block'; };
  repeatSelect.addEventListener('change', update);
  update();
}

function buildGoalLinkField(goals, initial) {
  const select = h('select', {}, [
    h('option', { value: '', selected: !initial?.related_goal_id }, 'No goal'),
    ...goals.map((g) => h('option', { value: g.id, selected: g.id === initial?.related_goal_id }, g.title)),
  ]);
  const field = h('div', { class: 'field' }, [h('label', {}, 'Link to a goal (optional)'), select]);
  return { field, select };
}

function openEditSheet(row, container, ctx, members, goals) {
  const { dialog, body } = makeSheet('Edit event');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, value: row.title });
  const dateInput = h('input', { type: 'date', required: true, value: row.event_date });
  const repeatSelect = h('select', {}, REPEAT_OPTIONS.map((o) => h('option', {
    value: o.value,
    selected: o.value === (row.recurring ? row.recurring_interval : 'never'),
  }, o.label)));
  const categorySelect = h('select', {}, CATEGORIES.map((c) => h('option', { value: c, selected: c === row.category }, c)));
  const descInput = h('textarea', { rows: '2', placeholder: 'Optional notes' }, row.description || '');
  const rotation = buildRotationField(members, row);
  wireRotationVisibility(repeatSelect, rotation);
  const goalLink = buildGoalLinkField(goals, row);
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save changes');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await updateRow(TABLE, row.id, {
          title: titleInput.value.trim(),
          event_date: dateInput.value,
          category: categorySelect.value,
          recurring: repeatSelect.value !== 'never',
          recurring_interval: repeatSelect.value === 'never' ? 'yearly' : repeatSelect.value,
          description: descInput.value.trim() || null,
          rotate_assignee: repeatSelect.value !== 'never' && rotation ? rotation.rotateCheckbox.checked : false,
          assignee_user_id: rotation ? rotation.assigneeSelect.value : null,
          related_goal_id: goalLink.select.value || null,
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
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Repeats'), repeatSelect]),
    rotation ? rotation.wrapper : null,
    goalLink.field,
    h('div', { class: 'field' }, [h('label', {}, 'Description'), descInput]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

// True once this cycle's occurrence has passed, OR once someone's
// manually marked it done (completed_occurrence matching the current
// occurrence — see the migration comment on why that's a date, not a
// boolean, and how it auto-resets for a recurring event's next cycle).
function isEventDone(row, today) {
  return row._occurrence < today || row.completed_occurrence === row._occurrence;
}

// Whose turn it is right now for a rotating recurring event: even cycles
// since the anchor occurrence stay with the anchor assignee, odd cycles
// flip to the other household member. Returns null when rotation doesn't
// apply (not recurring, not rotating, or not a two-person household),
// so callers can skip rendering anything.
function turnLabel(row, members, memberName) {
  if (!row.recurring || !row.rotate_assignee || members.length !== 2) return null;
  const cycles = occurrenceCycleCount(row.event_date, row.recurring, row.recurring_interval);
  const [a, b] = members;
  const anchorIsA = row.assignee_user_id === a.user_id;
  const turnUserId = cycles % 2 === 0 ? row.assignee_user_id : (anchorIsA ? b.user_id : a.user_id);
  const name = memberName(turnUserId);
  return name ? `It's ${name}'s turn` : null;
}

// How many times each person has had the turn so far, for a rotating
// recurring event — "you've done bin day 5 times, I've done it 4"
// instead of just the current turn. Since rotation is fully
// deterministic (turnLabel() above always alternates strictly on cycle
// parity, with no stored history of actual swaps or skips), the tally is
// just arithmetic on occurrenceCycleCount() rather than a real log:
// cycles 0..occurrenceCycleCount() inclusive (the anchor cycle through
// the current one) split evenly between the anchor assignee (the odd
// one out on a total with no exact half) and the other member. Same
// null-return conditions as turnLabel(), for the same reason.
function fairnessTally(row, members) {
  if (!row.recurring || !row.rotate_assignee || members.length !== 2) return null;
  const totalTurns = occurrenceCycleCount(row.event_date, row.recurring, row.recurring_interval) + 1;
  const anchorTurns = Math.ceil(totalTurns / 2);
  const otherTurns = Math.floor(totalTurns / 2);
  const [a, b] = members;
  const anchorIsA = row.assignee_user_id === a.user_id;
  return anchorIsA
    ? `${a.display_name} ${anchorTurns} · ${b.display_name} ${otherTurns}`
    : `${b.display_name} ${anchorTurns} · ${a.display_name} ${otherTurns}`;
}

export async function render(container, ctx) {
  const [rows, members, goals, commentCounts] = await Promise.all([
    fetchRows(TABLE, ctx.household.id, 'event_date', true),
    getHouseholdMembers(ctx.household.id),
    fetchRows('custom_goals', ctx.household.id, 'created_at', false),
    getCommentCounts(ctx.household.id, ENTITY_TYPE),
  ]);
  const memberName = (id) => members.find((m) => m.user_id === id)?.display_name;
  const goalTitle = (id) => goals.find((g) => g.id === id)?.title;
  const today = todayStr();
  // currentOccurrence never rolls a recurring event forward into its next
  // cycle, so one whose occurrence has already passed this cycle lands in
  // Done rather than being mixed into Upcoming under a misleading future
  // date.
  const withOccurrence = rows.map((r) => ({ ...r, _occurrence: currentOccurrence(r.event_date, r.recurring, r.recurring_interval) }));
  const upcoming = withOccurrence.filter((r) => !isEventDone(r, today)).sort((a, b) => (a._occurrence < b._occurrence ? -1 : 1));
  const done = withOccurrence.filter((r) => isEventDone(r, today)).sort((a, b) => (a._occurrence < b._occurrence ? 1 : -1));

  function card(row, isDone) {
    const dateLabel = row.recurring
      ? `${isDone ? '' : 'Next: '}${formatDate(row._occurrence)} · repeats ${row.recurring_interval}`
      : formatDate(row.event_date);
    const addedBy = memberName(row.created_by);
    const linkedGoal = row.related_goal_id ? goalTitle(row.related_goal_id) : null;
    const turn = isDone ? null : turnLabel(row, members, memberName);
    const tally = fairnessTally(row, members);
    // Once the occurrence's date has actually passed, "undo" has nothing
    // to revert to — it'd just land back in Done next render anyway (the
    // date comparison in isEventDone() still holds). Only a manually
    // completed, not-yet-due event can be un-done; a naturally overdue
    // one only gets the one-way "Mark done" action removed, not an
    // always-present toggle that's sometimes a no-op.
    const canToggle = !isDone || row._occurrence >= today;
    const toggleDone = async () => {
      await updateRow(TABLE, row.id, { completed_occurrence: isDone ? null : row._occurrence });
      render(container, ctx);
    };
    const commentCount = commentCounts.get(row.id) || 0;
    const commentLabel = (count) => (count ? `${count} comment${count === 1 ? '' : 's'}` : 'Comments');
    const commentBtn = h('button', {
      class: 'btn secondary small',
      'aria-label': commentLabel(commentCount),
      onclick: () => openCommentsSheet(ENTITY_TYPE, row.id, row.title, members, ctx, (count) => {
        commentCounts.set(row.id, count);
        commentBtn.textContent = `💬 ${count || ''}`.trim();
        commentBtn.setAttribute('aria-label', commentLabel(count));
      }),
    }, `💬 ${commentCount || ''}`.trim());
    // Downloads just this one occurrence as a single-date .ics, not a
    // subscribable feed of every future occurrence (that's a separate
    // Phase 5 stretch goal) — good enough for "add this one to my phone
    // calendar" without any new backend involved.
    const icsBtn = h('button', {
      class: 'btn secondary small',
      'aria-label': 'Download to calendar (.ics)',
      onclick: () => {
        const ics = buildIcsEvent({
          uid: row.id,
          title: row.title,
          dateStr: row._occurrence,
          description: row.description,
        });
        const safeName = row.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        downloadIcs(`${safeName || 'event'}.ics`, ics);
      },
    }, '🗓️');
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', { style: isDone ? 'text-decoration:line-through;color:var(--text-muted)' : '' }, row.title),
          h('div', { class: 'meta' }, `${dateLabel}${row.category ? ' · ' + row.category : ''}${addedBy ? ' · added by ' + addedBy : ''}${linkedGoal ? ' · linked to ' + linkedGoal : ''}`),
          turn ? h('div', { class: 'meta', style: 'margin-top:4px;font-weight:600' }, turn) : null,
          tally ? h('div', { class: 'meta', style: 'margin-top:2px' }, tally) : null,
          row.description ? h('div', { class: 'meta', style: 'margin-top:4px' }, row.description) : null,
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        canToggle ? h('button', { class: 'btn secondary small', onclick: toggleDone }, isDone ? 'Mark not done' : 'Mark done') : null,
        commentBtn,
        icsBtn,
        h('button', { class: 'btn secondary small', onclick: () => openEditSheet(row, container, ctx, members, goals) }, 'Edit'),
        h('button', {
          class: 'btn danger-text small',
          onclick: async () => {
            if (!confirm('Delete this event?')) return;
            await deleteCommentsFor(ENTITY_TYPE, row.id);
            await deleteRow(TABLE, row.id);
            render(container, ctx);
          },
        }, 'Delete'),
      ]),
    ]);
  }

  const { dialog, body } = makeSheet('Add event');
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Sam’s birthday' });
  const dateInput = h('input', { type: 'date', required: true, value: today });
  // categorySelect's own default is initialCategory (set explicitly below,
  // rather than left implicit via option order) — repeatSelect's initial
  // value is derived from that same variable instead of re-deriving it
  // from CATEGORIES[0] independently, so the two selects can't drift out
  // of sync if either one's default logic changes later.
  const initialCategory = CATEGORIES[0];
  const repeatSelect = h('select', {}, REPEAT_OPTIONS.map((o) => h('option', {
    value: o.value,
    selected: o.value === (DEFAULT_RECURRING_CATEGORIES.includes(initialCategory) ? 'yearly' : 'never'),
  }, o.label)));
  const categorySelect = h('select', {
    onchange: () => { repeatSelect.value = DEFAULT_RECURRING_CATEGORIES.includes(categorySelect.value) ? 'yearly' : 'never'; repeatSelect.dispatchEvent(new Event('change')); },
  }, CATEGORIES.map((c) => h('option', { value: c, selected: c === initialCategory }, c)));
  const descInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });
  const rotation = buildRotationField(members, { assignee_user_id: ctx.user.id });
  wireRotationVisibility(repeatSelect, rotation);
  const goalLink = buildGoalLinkField(goals, null);
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save event');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          event_date: dateInput.value,
          category: categorySelect.value,
          recurring: repeatSelect.value !== 'never',
          recurring_interval: repeatSelect.value === 'never' ? 'yearly' : repeatSelect.value,
          description: descInput.value.trim() || null,
          created_by: ctx.user.id,
          rotate_assignee: repeatSelect.value !== 'never' && rotation ? rotation.rotateCheckbox.checked : false,
          assignee_user_id: rotation ? rotation.assigneeSelect.value : null,
          related_goal_id: goalLink.select.value || null,
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
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Date'), dateInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Repeats'), repeatSelect]),
    rotation ? rotation.wrapper : null,
    goalLink.field,
    h('div', { class: 'field' }, [h('label', {}, 'Description'), descInput]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);

  // Title, category, or description — case-insensitive substring, no
  // fancy tokenizing, same scope as every other list's search box.
  function matchesSearch(row, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      row.title.toLowerCase().includes(q) ||
      (row.category || '').toLowerCase().includes(q) ||
      (row.description || '').toLowerCase().includes(q)
    );
  }

  const searchInput = h('input', { type: 'search', placeholder: 'Search events…' });
  const listContainer = h('div', {});
  function renderList() {
    const query = searchInput.value.trim();
    const filteredUpcoming = upcoming.filter((r) => matchesSearch(r, query));
    const filteredDone = done.filter((r) => matchesSearch(r, query));
    const list = [
      h('div', { class: 'section-title' }, 'Upcoming'),
      ...(filteredUpcoming.length ? filteredUpcoming.map((row) => card(row, false)) : [h('div', { class: 'empty-state' }, query ? 'No events match your search.' : 'No upcoming events yet.')]),
    ];
    if (filteredDone.length) {
      list.push(h('div', { class: 'section-title' }, 'Done'));
      list.push(...filteredDone.slice(0, 20).map((row) => card(row, true)));
    }
    mount(listContainer, list);
  }
  searchInput.addEventListener('input', renderList);
  renderList();

  mount(container, [
    rows.length ? h('div', { class: 'field' }, searchInput) : null,
    listContainer,
    h('button', { class: 'fab', 'aria-label': 'Add event', onclick: () => openSheet(dialog) }, '+'),
    dialog,
  ]);
}

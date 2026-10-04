// Comment thread attached to a single expense or event row — a running
// back-and-forth note ("did we ever get reimbursed for this?", "who's
// picking up the cake?") instead of needing a text message outside the
// app. Shared by expenses.js and events.js rather than duplicated, since
// the thread UI itself doesn't care which table the parent row lives in
// — only `entityType`/`entityId` (see supabase/migrations/0035_item_comments.sql)
// vary between the two callers.
import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { supabase } from './supabaseClient.js';
import { formatDateTime } from './format.js';

const TABLE = 'item_comments';

// One query per tab render (not one per card) — fetches every comment for
// the given entity type across the whole household, then groups by
// entity_id client-side. Callers use this to show a "💬 N" count on each
// card without an N+1 query per row; openCommentsSheet() below re-fetches
// just that one entity's thread when actually opened, since this count
// is only for the card badge, not the sheet's own list.
export async function getCommentCounts(householdId, entityType) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('entity_id')
    .eq('household_id', householdId)
    .eq('entity_type', entityType);
  if (error) throw error;
  const counts = new Map();
  for (const row of data) {
    counts.set(row.entity_id, (counts.get(row.entity_id) || 0) + 1);
  }
  return counts;
}

// Called by the parent record's own "Delete" handler (expenses.js,
// events.js) before deleting the row itself — item_comments has no DB
// cascade since entity_id is a polymorphic reference, not a real FK.
export async function deleteCommentsFor(entityType, entityId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);
  if (error) throw error;
}

function memberNameFor(members, userId) {
  return members.find((m) => m.user_id === userId)?.display_name || 'Someone';
}

// `onCountChange` lets the caller refresh just the "💬 N" badge on the
// card that opened this sheet without re-rendering the whole tab (the
// sheet stays open across an add/delete, unlike every other sheet in the
// app, since a comment thread is something you keep adding to in one
// sitting rather than a one-shot form).
export function openCommentsSheet(entityType, entityId, label, members, ctx, onCountChange) {
  const { dialog, body } = makeSheet(`Comments — ${label}`);
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const listEl = h('div', {});
  const bodyInput = h('textarea', { rows: '2', placeholder: 'Write a comment…', required: true });
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Post');

  async function load() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    mount(listEl, data.length
      ? data.map((c) => h('div', { class: 'card' }, [
          h('div', { class: 'meta' }, `${memberNameFor(members, c.author_id)} · ${formatDateTime(c.created_at)}`),
          h('div', {}, c.body),
          h('div', { class: 'actions-row' }, [
            h('button', {
              class: 'btn danger-text small',
              onclick: async () => {
                if (!confirm('Delete this comment?')) return;
                await supabase.from(TABLE).delete().eq('id', c.id);
                await load();
                onCountChange?.(data.length - 1);
              },
            }, 'Delete'),
          ]),
        ]))
      : [h('div', { class: 'empty-state' }, 'No comments yet.')]);
    return data.length;
  }

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Posting…');
      try {
        await supabase.from(TABLE).insert({
          household_id: ctx.household.id,
          entity_type: entityType,
          entity_id: entityId,
          author_id: ctx.user.id,
          body: bodyInput.value.trim(),
        });
        bodyInput.value = '';
        const count = await load();
        onCountChange?.(count);
        restore();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Add a comment'), bodyInput]),
    errorEl,
    submitBtn,
  ]);

  mount(body, [listEl, form]);
  load();
  openSheet(dialog);
}

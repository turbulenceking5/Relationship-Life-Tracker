import { h, mount, openSheet, closeSheet, makeSheet } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate } from './format.js';
import { supabase } from './supabaseClient.js';

export const DOCUMENT_TABLE = 'documents';
export const DOCUMENT_BUCKET = 'documents';
export const DOCUMENT_CATEGORIES = ['warranty', 'contract', 'receipt', 'id', 'other'];

export async function viewDocument(row) {
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(row.file_path, 60);
  if (error) { alert(error.message); return; }
  window.open(data.signedUrl, '_blank');
}

export async function removeDocument(row) {
  await supabase.storage.from(DOCUMENT_BUCKET).remove([row.file_path]);
  await deleteRow(DOCUMENT_TABLE, row.id);
}

export function openEditDocumentSheet(row, onSaved) {
  const { dialog, body } = makeSheet('Edit document');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, value: row.title });
  const categorySelect = h('select', {}, DOCUMENT_CATEGORIES.map((c) => h('option', { value: c, selected: c === row.category }, c)));
  const expiryInput = h('input', { type: 'date', value: row.expiry_date || '' });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      try {
        await updateRow(DOCUMENT_TABLE, row.id, {
          title: titleInput.value.trim(),
          category: categorySelect.value,
          expiry_date: expiryInput.value || null,
        });
        closeSheet(dialog);
        onSaved();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Expiry date (optional)'), expiryInput]),
    ]),
    h('p', { class: 'meta' }, 'To replace the file itself, delete this and upload a new one.'),
    errorEl,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save changes'),
  ]);
  mount(body, form);
  openSheet(dialog);
}

// relatedType/relatedId tag the document as belonging to something other
// than the general Documents list (currently just goals — see
// docs/12-feature-goals.md) via the documents table's existing
// related_type/related_id columns.
export function openUploadDocumentSheet(ctx, { sheetTitle = 'Add document', relatedType = null, relatedId = null, onSaved }) {
  const { dialog, body } = makeSheet(sheetTitle);
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Boiler warranty' });
  const categorySelect = h('select', {}, DOCUMENT_CATEGORIES.map((c) => h('option', { value: c }, c)));
  const expiryInput = h('input', { type: 'date' });
  const fileInput = h('input', { type: 'file', accept: 'application/pdf,image/*', capture: 'environment', required: true });
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Upload document');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const file = fileInput.files[0];
      if (!file) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading…';
      try {
        const path = `${ctx.household.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        await insertRow(DOCUMENT_TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          category: categorySelect.value,
          file_path: path,
          file_name: file.name,
          mime_type: file.type,
          expiry_date: expiryInput.value || null,
          related_type: relatedType,
          related_id: relatedId,
          uploaded_by: ctx.user.id,
        });
        closeSheet(dialog);
        onSaved();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload document';
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Expiry date (optional)'), expiryInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'File (PDF or photo)'), fileInput]),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

export async function render(container, ctx) {
  const [rows, goals] = await Promise.all([
    fetchRows(DOCUMENT_TABLE, ctx.household.id, 'created_at', false),
    fetchRows('custom_goals', ctx.household.id, 'created_at', false),
  ]);
  const goalTitle = (id) => goals.find((g) => g.id === id)?.title;

  function card(row) {
    const linkedGoal = row.related_type === 'goal' ? goalTitle(row.related_id) : null;
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${row.category || 'document'} · added ${formatDate(row.created_at.slice(0, 10))}${row.expiry_date ? ' · expires ' + formatDate(row.expiry_date) : ''}${linkedGoal ? ' · linked to ' + linkedGoal : ''}`),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn secondary small', onclick: () => viewDocument(row) }, 'View'),
        h('button', { class: 'btn secondary small', onclick: () => openEditDocumentSheet(row, () => render(container, ctx)) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { await removeDocument(row); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  mount(container, [
    rows.length ? h('div', {}, rows.map(card)) : h('div', { class: 'empty-state' }, 'No documents yet — warranties, contracts, receipts all live here, privately.'),
    h('button', { class: 'fab', onclick: () => openUploadDocumentSheet(ctx, { onSaved: () => render(container, ctx) }) }, '+'),
  ]);
}

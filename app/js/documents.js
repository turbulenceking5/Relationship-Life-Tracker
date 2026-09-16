import { h, mount, openSheet, closeSheet } from './dom.js';
import { fetchRows, insertRow, deleteRow } from './crud.js';
import { formatDate } from './format.js';
import { supabase } from './supabaseClient.js';

const TABLE = 'documents';
const BUCKET = 'documents';
const CATEGORIES = ['warranty', 'contract', 'receipt', 'id', 'other'];

export async function render(container, ctx) {
  const rows = await fetchRows(TABLE, ctx.household.id, 'created_at', false);

  async function openDoc(row) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_path, 60);
    if (error) { alert(error.message); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function removeDoc(row) {
    await supabase.storage.from(BUCKET).remove([row.file_path]);
    await deleteRow(TABLE, row.id);
    render(container, ctx);
  }

  function card(row) {
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${row.category || 'document'} · added ${formatDate(row.created_at.slice(0, 10))}${row.expiry_date ? ' · expires ' + formatDate(row.expiry_date) : ''}`),
        ]),
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn secondary small', onclick: () => openDoc(row) }, 'View'),
        h('button', { class: 'btn danger-text small', onclick: () => removeDoc(row) }, 'Delete'),
      ]),
    ]);
  }

  const dialog = h('dialog', {}, []);
  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Boiler warranty' });
  const categorySelect = h('select', {}, CATEGORIES.map((c) => h('option', { value: c }, c)));
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
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        await insertRow(TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          category: categorySelect.value,
          file_path: path,
          file_name: file.name,
          mime_type: file.type,
          expiry_date: expiryInput.value || null,
          uploaded_by: ctx.user.id,
        });
        closeSheet(dialog);
        render(container, ctx);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload document';
      }
    },
  }, [
    h('h2', {}, 'Add document'),
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Expiry date (optional)'), expiryInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'File (PDF or photo)'), fileInput]),
    errorEl,
    submitBtn,
  ]);
  mount(dialog, h('div', { class: 'sheet' }, form));

  mount(container, [
    rows.length ? h('div', {}, rows.map(card)) : h('div', { class: 'empty-state' }, 'No documents yet — warranties, contracts, receipts all live here, privately.'),
    h('button', { class: 'fab', onclick: () => openSheet(dialog) }, '+'),
    dialog,
  ]);
}

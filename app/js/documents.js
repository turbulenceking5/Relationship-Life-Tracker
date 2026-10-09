import { h, mount, openSheet, closeSheet, makeSheet, withBusyLabel } from './dom.js';
import { fetchRows, insertRow, updateRow, deleteRow } from './crud.js';
import { formatDate, daysUntil, dayThresholdStatus } from './format.js';
import { supabase } from './supabaseClient.js';
import { isConfigured, isDriveConnected, hasLocalDriveAccess, uploadFileToDrive, deleteDriveFile } from './googleDrive.js';
import { getHouseholdMembers } from './household.js';

export const DOCUMENT_TABLE = 'documents';
export const DOCUMENT_BUCKET = 'documents';
export const DOCUMENT_CATEGORIES = ['warranty', 'contract', 'receipt', 'id', 'sophie', 'other'];

// 'id' capitalizes to 'ID', not 'Id' — every other category just needs a
// leading capital. Used both for the category filter chips below and to
// prefix the filename shown in Drive (see openUploadDocumentSheet) so
// documents at least sort/group by category there without needing real
// Drive subfolders — see the comment on uploadFileToDrive() in
// googleDrive.js for why subfolders don't work with this app's OAuth scope.
function categoryLabel(category) {
  if (category === 'id') return 'ID';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

// Shares dueStatus()'s day-threshold bucketing (format.js's
// dayThresholdStatus(), also used for rent/mortgage due dates) with
// wording that fits an expiry rather than a bill: a document "expires,"
// it isn't "due."
export function expiryStatus(expiryDate) {
  return dayThresholdStatus(daysUntil(expiryDate), {
    overdue: (d) => `Expired ${d}d ago`,
    soon: (d) => `Expires in ${d}d`,
  });
}

export async function viewDocument(row) {
  if (row.storage_provider === 'drive') {
    window.open(row.drive_web_view_link || `https://drive.google.com/file/d/${row.drive_file_id}/view`, '_blank');
    return;
  }
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(row.file_path, 60);
  if (error) { alert(error.message); return; }
  window.open(data.signedUrl, '_blank');
}

export async function removeDocument(row) {
  if (row.storage_provider === 'drive') {
    await deleteDriveFile(row.drive_file_id).catch(() => {}); // best-effort, same tolerance as the Supabase Storage path below
  } else {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([row.file_path]);
  }
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
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save changes');
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' }, row.notes || '');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const restore = withBusyLabel(submitBtn, 'Saving…');
      try {
        await updateRow(DOCUMENT_TABLE, row.id, {
          title: titleInput.value.trim(),
          category: categorySelect.value,
          expiry_date: expiryInput.value || null,
          notes: notesInput.value.trim() || null,
        });
        closeSheet(dialog);
        onSaved();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Expiry date (optional)'), expiryInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'Notes (optional)'), notesInput]),
    h('p', { class: 'meta' }, 'To replace the file itself, delete this and upload a new one.'),
    errorEl,
    submitBtn,
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

  if (!isConfigured()) {
    mount(body, h('p', { class: 'meta' }, 'Google Drive isn’t set up for this deployment yet — see docs/21-google-drive-documents.md.'));
    openSheet(dialog);
    return;
  }
  if (!isDriveConnected(ctx.household) || !hasLocalDriveAccess(ctx)) {
    mount(body, h('p', { class: 'meta' }, 'Connect Google Drive first, from ⚙️ Account & household → Documents storage, then come back here to upload.'));
    openSheet(dialog);
    return;
  }

  const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
  const titleInput = h('input', { type: 'text', required: true, placeholder: 'e.g. Boiler warranty' });
  const categorySelect = h('select', {}, DOCUMENT_CATEGORIES.map((c) => h('option', { value: c }, c)));
  const expiryInput = h('input', { type: 'date' });
  const notesInput = h('textarea', { rows: '2', placeholder: 'Optional notes' });
  // No `accept`/`capture` restriction: documents are any file type, not
  // just photos/PDFs (a `capture` attribute here used to force Android
  // straight into the camera, hiding the file picker entirely — see
  // docs/21-google-drive-documents.md).
  const fileInput = h('input', { type: 'file', required: true });
  const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Upload document');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const file = fileInput.files[0];
      if (!file) return;
      const restore = withBusyLabel(submitBtn, 'Uploading…');
      try {
        const driveFileName = `[${categoryLabel(categorySelect.value)}] ${file.name}`;
        const uploaded = await uploadFileToDrive(ctx, file, driveFileName);
        await insertRow(DOCUMENT_TABLE, {
          household_id: ctx.household.id,
          title: titleInput.value.trim(),
          category: categorySelect.value,
          storage_provider: 'drive',
          drive_file_id: uploaded.id,
          drive_web_view_link: uploaded.webViewLink,
          file_name: file.name,
          mime_type: file.type,
          expiry_date: expiryInput.value || null,
          notes: notesInput.value.trim() || null,
          related_type: relatedType,
          related_id: relatedId,
          uploaded_by: ctx.user.id,
        });
        closeSheet(dialog);
        onSaved();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        restore();
      }
    },
  }, [
    h('div', { class: 'field' }, [h('label', {}, 'Title'), titleInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [h('label', {}, 'Category'), categorySelect]),
      h('div', { class: 'field' }, [h('label', {}, 'Expiry date (optional)'), expiryInput]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, 'File'), fileInput]),
    h('div', { class: 'field' }, [h('label', {}, 'Notes (optional)'), notesInput]),
    h('p', { class: 'meta' }, 'Uploads to the household’s Google Drive folder.'),
    errorEl,
    submitBtn,
  ]);
  mount(body, form);
  openSheet(dialog);
}

// Matches title, category, notes, or linked-goal name — case-insensitive
// substring, no fancy tokenizing.
function matchesSearch(row, goalTitle, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const linkedGoal = row.related_type === 'goal' ? goalTitle(row.related_id) : null;
  return (
    row.title.toLowerCase().includes(q) ||
    (row.category || '').toLowerCase().includes(q) ||
    (row.notes || '').toLowerCase().includes(q) ||
    (linkedGoal || '').toLowerCase().includes(q)
  );
}

export async function render(container, ctx) {
  const [rows, goals, members] = await Promise.all([
    fetchRows(DOCUMENT_TABLE, ctx.household.id, 'created_at', false),
    fetchRows('custom_goals', ctx.household.id, 'created_at', false),
    getHouseholdMembers(ctx.household.id),
  ]);
  const goalTitle = (id) => goals.find((g) => g.id === id)?.title;
  const memberName = (id) => members.find((m) => m.user_id === id)?.display_name;

  function card(row) {
    const linkedGoal = row.related_type === 'goal' ? goalTitle(row.related_id) : null;
    const status = row.expiry_date ? expiryStatus(row.expiry_date) : null;
    const addedBy = memberName(row.uploaded_by);
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-row' }, [
        h('div', {}, [
          h('h3', {}, row.title),
          h('div', { class: 'meta' }, `${row.category || 'document'} · added ${formatDate(row.created_at.slice(0, 10))}${addedBy ? ' by ' + addedBy : ''}${row.expiry_date ? ' · expires ' + formatDate(row.expiry_date) : ''}${linkedGoal ? ' · linked to ' + linkedGoal : ''}`),
          row.notes ? h('div', { class: 'meta' }, row.notes) : null,
        ]),
        status && status.cls !== 'ok' ? h('span', { class: `pill ${status.cls}` }, status.label) : null,
      ]),
      h('div', { class: 'actions-row' }, [
        h('button', { class: 'btn secondary small', onclick: () => viewDocument(row) }, 'View'),
        h('button', { class: 'btn secondary small', onclick: () => openEditDocumentSheet(row, () => render(container, ctx)) }, 'Edit'),
        h('button', { class: 'btn danger-text small', onclick: async () => { if (!confirm('Delete this document? This can’t be undone.')) return; await removeDocument(row); render(container, ctx); } }, 'Delete'),
      ]),
    ]);
  }

  // Category filter chips — a quick way to browse "just the warranties"
  // without typing, complementing the text search below rather than
  // replacing it (both apply together). Resets to "All" on every
  // render() the same way the search box's typed text does, rather than
  // persisting across add/edit/delete — see matchesSearch() above for the
  // equivalent search behavior.
  let activeCategory = 'all';
  const categoryOptions = [{ value: 'all', label: 'All' }, ...DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))];
  const chipButtons = categoryOptions.map((opt) => h('button', {
    type: 'button',
    class: opt.value === 'all' ? 'active' : '',
    onclick: () => {
      activeCategory = opt.value;
      chipButtons.forEach((btn, i) => { btn.className = categoryOptions[i].value === activeCategory ? 'active' : ''; });
      renderList();
    },
  }, opt.label));
  const filterRow = h('div', { class: 'segmented' }, chipButtons);

  const searchInput = h('input', { type: 'search', placeholder: 'Search documents…' });
  const listContainer = h('div', {});
  function renderList() {
    const query = searchInput.value.trim();
    const filtered = rows.filter((r) => (activeCategory === 'all' || r.category === activeCategory) && matchesSearch(r, goalTitle, query));
    mount(listContainer, filtered.length
      ? filtered.map(card)
      : [h('div', { class: 'empty-state' }, query || activeCategory !== 'all' ? 'No documents match your search.' : 'No documents yet — warranties, contracts, receipts all live here, privately.')]);
  }
  searchInput.addEventListener('input', renderList);
  renderList();

  mount(container, [
    rows.length ? filterRow : null,
    rows.length ? h('div', { class: 'field' }, searchInput) : null,
    listContainer,
    h('button', { class: 'fab', 'aria-label': 'Add document', onclick: () => openUploadDocumentSheet(ctx, { onSaved: () => render(container, ctx) }) }, '+'),
  ]);
}

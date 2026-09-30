import { supabase } from './supabaseClient.js';
import { h, mount } from './dom.js';

export async function getMyHousehold() {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, role, households ( id, name, invite_code, default_currency )')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data.households, myRole: data.role };
}

export async function getHouseholdMembers(householdId) {
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, split_percent, profiles ( display_name )')
    .eq('household_id', householdId);
  if (error) throw error;
  return data.map((m) => ({ user_id: m.user_id, display_name: m.profiles?.display_name || 'Member', split_percent: Number(m.split_percent) }));
}

// Only meaningful for a two-person household — the whole point of
// split_percent is "what share of shared expenses is each partner
// responsible for," which doesn't generalize past two people without a
// bigger redesign (see docs/04-feature-expenses.md).
export async function updateSplitPercents(householdId, userIdA, percentA, userIdB, percentB) {
  const { error: errA } = await supabase
    .from('household_members')
    .update({ split_percent: percentA })
    .eq('household_id', householdId)
    .eq('user_id', userIdA);
  if (errA) throw errA;
  const { error: errB } = await supabase
    .from('household_members')
    .update({ split_percent: percentB })
    .eq('household_id', householdId)
    .eq('user_id', userIdB);
  if (errB) throw errB;
}

export function renderHouseholdScreen(container, onReady) {
  let mode = 'choose'; // choose | create | join

  function draw() {
    let body;

    if (mode === 'choose') {
      body = [
        h('button', { class: 'btn primary', onclick: () => { mode = 'create'; draw(); } }, 'Create a household'),
        h('div', { style: 'height:10px' }),
        h('button', { class: 'btn secondary', onclick: () => { mode = 'join'; draw(); } }, 'Join with an invite code'),
      ];
    } else if (mode === 'create') {
      const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
      const nameInput = h('input', { type: 'text', placeholder: 'e.g. Alex & Sam', required: true });
      const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Create');
      const form = h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          errorEl.style.display = 'none';
          submitBtn.disabled = true;
          try {
            const { error } = await supabase.rpc('create_household', { p_name: nameInput.value.trim() });
            if (error) throw error;
            onReady();
          } catch (err) {
            errorEl.textContent = err.message || 'Could not create household';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
          }
        },
      }, [
        h('div', { class: 'field' }, [h('label', {}, 'Household name'), nameInput]),
        errorEl,
        submitBtn,
      ]);
      body = [form, h('button', { class: 'link-btn', onclick: () => { mode = 'choose'; draw(); } }, 'Back')];
    } else {
      const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
      const codeInput = h('input', { type: 'text', placeholder: 'e.g. A1B2C3D4', required: true, style: 'text-transform:uppercase' });
      const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Join');
      const form = h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          errorEl.style.display = 'none';
          submitBtn.disabled = true;
          try {
            const { error } = await supabase.rpc('join_household', { p_invite_code: codeInput.value.trim() });
            if (error) throw error;
            onReady();
          } catch (err) {
            errorEl.textContent = err.message || 'Could not join household';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
          }
        },
      }, [
        h('div', { class: 'field' }, [h('label', {}, 'Invite code'), codeInput]),
        errorEl,
        submitBtn,
      ]);
      body = [form, h('button', { class: 'link-btn', onclick: () => { mode = 'choose'; draw(); } }, 'Back')];
    }

    mount(container, h('div', { class: 'household-screen' }, [
      h('h1', {}, "Let's set up your household"),
      h('p', { class: 'lead' }, 'A household is the shared space where you and your partner see the same events, expenses, reminders and documents.'),
      ...body,
    ]));
  }

  draw();
}

export function renderInviteInfo(household) {
  return h('div', {}, [
    h('div', { class: 'section-title' }, 'Invite your partner'),
    h('p', {}, `Share this code with your partner — they can join "${household.name}" with it from the "Join with an invite code" screen.`),
    h('div', { class: 'invite-code' }, household.invite_code),
  ]);
}

import { supabase } from './supabaseClient.js';
import { h, mount } from './dom.js';
import { SITE_URL } from './config.js';

export function renderAuthScreen(container) {
  let mode = 'sign_in'; // or 'sign_up'
  let notice = null;

  function draw() {
    const errorEl = h('div', { class: 'error-msg', style: 'display:none' });
    const noticeEl = notice ? h('div', { class: 'success-msg' }, notice) : null;
    const emailInput = h('input', { type: 'email', autocomplete: 'email', required: true, placeholder: 'you@example.com' });
    const passwordInput = h('input', { type: 'password', autocomplete: mode === 'sign_up' ? 'new-password' : 'current-password', required: true, placeholder: 'At least 6 characters', minlength: '6' });
    const nameInput = h('input', { type: 'text', autocomplete: 'name', placeholder: 'Alex' });
    const nameField = mode === 'sign_up'
      ? h('div', { class: 'field' }, [h('label', {}, 'Your name'), nameInput])
      : null;

    const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, mode === 'sign_up' ? 'Create account' : 'Log in');

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        notice = null;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Please wait…';
        try {
          if (mode === 'sign_up') {
            const displayName = nameInput.value.trim();
            const { data, error } = await supabase.auth.signUp({
              email: emailInput.value.trim(),
              password: passwordInput.value,
              options: {
                data: displayName ? { display_name: displayName } : undefined,
                emailRedirectTo: `${SITE_URL}/confirmed.html`,
              },
            });
            if (error) throw error;
            if (!data.session) {
              // Email confirmation is required, so no session was issued —
              // there's nothing more this screen can do until the link is
              // clicked. Without this, the button would just say "Please
              // wait…" forever with no explanation.
              mode = 'sign_in';
              notice = 'Account created! Check your email for a confirmation link, then log in below.';
              draw();
              return;
            }
          } else {
            const { error } = await supabase.auth.signInWithPassword({
              email: emailInput.value.trim(),
              password: passwordInput.value,
            });
            if (error) throw error;
          }
          // onAuthStateChange in app.js handles the redirect.
        } catch (err) {
          errorEl.textContent = err.message || 'Something went wrong';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = mode === 'sign_up' ? 'Create account' : 'Log in';
        }
      },
    }, [
      nameField,
      h('div', { class: 'field' }, [h('label', {}, 'Email'), emailInput]),
      h('div', { class: 'field' }, [h('label', {}, 'Password'), passwordInput]),
      errorEl,
      submitBtn,
    ]);

    const switchBtn = h('button', {
      class: 'link-btn',
      type: 'button',
      onclick: () => { mode = mode === 'sign_up' ? 'sign_in' : 'sign_up'; notice = null; draw(); },
    }, mode === 'sign_up' ? 'Already have an account? Log in' : "New here? Create an account");

    mount(container, h('div', { class: 'auth-screen' }, [
      h('h1', {}, 'Life Tracker'),
      h('p', { class: 'lead' }, 'Shared events, expenses, replacement reminders, repayments and documents — for you and your partner.'),
      noticeEl,
      form,
      switchBtn,
    ]));
  }

  draw();
}

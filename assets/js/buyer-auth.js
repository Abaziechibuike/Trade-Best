const message = document.getElementById('message');

async function send(form, url) {
	const r = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(Object.fromEntries(new FormData(form)))
	});
	const d = await r.json().catch(() => ({}));
	message.textContent = d.message || '';
	if (r.ok && d.ok) location = 'buyer-dashboard.html';
}

document.getElementById('buyerLogin').addEventListener('submit', e => { e.preventDefault(); send(document.getElementById('buyerLogin'), '/api/buyer/login'); });
document.getElementById('buyerSignup').addEventListener('submit', e => { e.preventDefault(); send(document.getElementById('buyerSignup'), '/api/buyer/signup'); });

// Forgot password toggles and submit
const forgotToggle = document.getElementById('buyerForgotToggle');
const forgotForm = document.getElementById('buyerForgotForm');
const forgotCancel = document.getElementById('buyerForgotCancel');
if (forgotToggle && forgotForm) {
	forgotToggle.addEventListener('click', e => { e.preventDefault(); forgotForm.style.display = forgotForm.style.display === 'none' ? 'block' : 'none'; });
	if (forgotCancel) forgotCancel.addEventListener('click', () => { forgotForm.style.display = 'none'; });
	forgotForm.addEventListener('submit', async e => {
		e.preventDefault();
		const btn = document.getElementById('buyerForgotBtn');
		if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
		const r = await fetch('/api/buyer/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(forgotForm))) });
		const d = await r.json().catch(() => ({}));
		const msgEl = document.getElementById('buyerForgotMsg') || message;
		if (msgEl) msgEl.textContent = d.message || '';
		if (d.ok && forgotForm) forgotForm.style.display = 'none';
		if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
	});
}

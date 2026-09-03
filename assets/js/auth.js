// Simple auth client for signup/login (demo only)
const apiBase = '';

function showToast(msg, time = 3000){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), time);
}

async function postJSON(url, data){
  try{
    const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const text = await res.text();
    if(!text) return { ok: res.ok, message: 'Empty response from server', status: res.status };
    try{ return JSON.parse(text); }catch(e){
      // Non-JSON response — return text for debugging
      return { ok: res.ok, message: text, status: res.status };
    }
  }catch(err){
    return { ok:false, message: 'Network error: ' + String(err) };
  }
}

function disableButton(btn, state){
  if(!btn) return;
  btn.disabled = state;
  btn.style.opacity = state ? '0.7' : '1';
}

if(document.getElementById('signupForm')){
  const form = document.getElementById('signupForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const submitBtn = form.querySelector('button[type=submit]');
    disableButton(submitBtn, true);
    document.getElementById('msg').textContent = '';
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const res = await postJSON('/api/auth/signup', body);
    document.getElementById('msg').textContent = res.message || JSON.stringify(res);
    if(res.ok){
      showToast('Account created — redirecting...');
      setTimeout(()=> location.href='seller-dashboard.html',800);
    } else {
      showToast(res.message || 'Signup failed');
    }
    disableButton(submitBtn, false);
  });
}

if(document.getElementById('loginForm')){
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const submitBtn = form.querySelector('button[type=submit]');
    disableButton(submitBtn, true);
    document.getElementById('msg').textContent = '';
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const res = await postJSON('/api/auth/login', body);
    document.getElementById('msg').textContent = res.message || JSON.stringify(res);
    if(res.ok){
      showToast('Logged in — redirecting...');
      setTimeout(()=> location.href='seller-dashboard.html',800);
    } else {
      showToast(res.message || 'Login failed');
    }
    disableButton(submitBtn, false);
  });
}

// Seller forgot password flow
if(document.getElementById('forgotToggle')){
  const toggle = document.getElementById('forgotToggle');
  const form = document.getElementById('sellerForgotForm');
  const cancel = document.getElementById('forgotCancel');
  toggle.addEventListener('click', (e)=>{ e.preventDefault(); if(form) form.style.display = form.style.display === 'none' ? 'block' : 'none'; });
  if(cancel) cancel.addEventListener('click', ()=>{ if(form) form.style.display = 'none'; });
  if(form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]') || form.querySelector('button');
      disableButton(btn, true);
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
        const res = await postJSON('/api/seller/password-reset', body);
        const msgEl = document.getElementById('sellerForgotMsg') || document.getElementById('msg');
        if (msgEl) msgEl.textContent = res.message || '';
        showToast(res.message || (res.ok ? 'Check your email for reset link' : 'Could not send reset'));
        if (res.ok && form) form.style.display = 'none';
      disableButton(btn, false);
    });
  }
}

"use strict";
// GATE GLOBAL — trava o app inteiro atrás de login+licença (allowlist de e-mail), exceto quem chega
// por link de convite (?c=CODIGO): esse fluxo é do técnico cadastrando o time dele, nunca precisou
// de conta, e continua sem precisar — só o organizador/dono do app passa por aqui.
const SUPABASE_URL = 'https://rgyjvmpyyyatkaboksww.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJneWp2bXB5eXlhdGthYm9rc3d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTUwMjUsImV4cCI6MjEwMzE5MTAyNX0.yOv951mh1LF4_lYW1SOG07Y75bMZJKVWw0qocJQaPQ0';
const supaAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function gateEscape(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function gateHasLicense(session){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/licenses?email=eq.${encodeURIComponent((session.user.email||'').toLowerCase())}&select=email`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` }
    });
    if(!res.ok) return false;
    const rows = await res.json();
    return rows.length > 0;
  }catch(e){ return false; }
}

function gateRender(html){
  document.getElementById('gate-body').innerHTML = html;
  document.getElementById('auth-gate').classList.add('open');
}
function gateOpenApp(){
  document.getElementById('auth-gate').classList.remove('open');
}

function gateLoginHTML(){
  return `
    <span class="eyebrow">Statix</span>
    <h2>Entrar</h2>
    <p style="color:var(--ink-dim);font-size:13px;margin:-6px 0 16px;">Acesso liberado só pra e-mails com licença. <a href="https://cpzdigital.com.br/statix#contato" target="_blank" rel="noopener" style="color:var(--accent);">Ainda não tem licença? Peça aqui.</a></p>
    <button type="button" class="btn" id="gate-btn-google" style="width:100%;margin-bottom:14px;">Entrar com o Google</button>
    <div style="text-align:center;color:var(--ink-dim);font-family:'JetBrains Mono';font-size:11px;margin-bottom:14px;">— ou com e-mail e senha —</div>
    <div class="row row-stack">
      <input type="text" id="gate-email" placeholder="E-mail" style="flex:1;min-width:0;">
      <input type="text" id="gate-pass" placeholder="Senha" style="flex:1;min-width:0;">
    </div>
    <div class="row" style="margin-top:12px;">
      <button class="btn primary" id="gate-btn-login" style="flex:1;">Entrar</button>
      <button class="btn" id="gate-btn-signup" style="flex:1;">Criar conta</button>
    </div>
    <div id="gate-msg" style="margin-top:10px;font-family:'JetBrains Mono';font-size:12px;color:var(--miss);"></div>`;
}

function gateNoLicenseHTML(session){
  return `
    <span class="eyebrow">Statix</span>
    <h2>Sem licença ativa</h2>
    <p style="color:var(--ink-dim);font-size:13px;margin:-6px 0 16px;">A conta <strong style="color:var(--ink);">${gateEscape(session.user.email)}</strong> logou certinho, mas esse e-mail ainda não tem licença liberada.</p>
    <div class="row">
      <a class="btn primary" href="https://cpzdigital.com.br/statix#contato" target="_blank" rel="noopener">Pedir licença →</a>
      <button class="btn ghost" id="gate-btn-logout">Sair</button>
    </div>`;
}

function gateWireLogin(){
  const msg = document.getElementById('gate-msg');
  document.getElementById('gate-btn-google').addEventListener('click', async ()=>{
    const { error } = await supaAuth.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.href } });
    if(error) msg.textContent = 'Login com Google ainda não está configurado.';
  });
  document.getElementById('gate-btn-login').addEventListener('click', async ()=>{
    const email = document.getElementById('gate-email').value.trim();
    const password = document.getElementById('gate-pass').value;
    msg.textContent = 'Entrando…';
    const { error } = await supaAuth.auth.signInWithPassword({ email, password });
    if(error){ msg.textContent = 'E-mail ou senha inválidos.'; return; }
    gateRunCheck();
  });
  document.getElementById('gate-btn-signup').addEventListener('click', async ()=>{
    const email = document.getElementById('gate-email').value.trim();
    const password = document.getElementById('gate-pass').value;
    if(!email || password.length < 6){ msg.textContent = 'Preencha o e-mail e uma senha com 6+ caracteres.'; return; }
    msg.textContent = 'Criando conta…';
    const { error } = await supaAuth.auth.signUp({ email, password });
    if(error){ msg.textContent = error.message; return; }
    msg.textContent = 'Conta criada. Se pedir confirmação, confira seu e-mail antes de entrar.';
  });
}

async function gateRunCheck(){
  // fluxo de convite (?c=CODIGO) é do técnico cadastrando o time dele — nunca passou por login, continua livre
  if(new URLSearchParams(location.search).get('c')){ gateOpenApp(); return; }

  const { data:{ session } } = await supaAuth.auth.getSession();
  if(!session){
    gateRender(gateLoginHTML());
    gateWireLogin();
    return;
  }
  const licensed = await gateHasLicense(session);
  if(!licensed){
    gateRender(gateNoLicenseHTML(session));
    document.getElementById('gate-btn-logout').addEventListener('click', async ()=>{
      await supaAuth.auth.signOut();
      gateRunCheck();
    });
    return;
  }
  gateOpenApp();
}

supaAuth.auth.onAuthStateChange(()=> gateRunCheck());
gateRunCheck();

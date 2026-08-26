"use strict";
  // =====================================================================
  // CAMPEONATO — vários técnicos, cada um com seu time, sincronizado num
  // banco central (Supabase) via link de convite. Módulo separado do resto
  // do app (que continua 100% local por dispositivo) pra não arriscar
  // quebrar o que já funciona.
  // =====================================================================
  // SUPABASE_URL, SUPABASE_KEY e o cliente supaAuth já vêm declarados globalmente por js/app-gate.js
  // (que carrega antes pra travar o app inteiro) — reaproveitados aqui, não redeclarar.

  async function currentSession(){
    const { data } = await supaAuth.auth.getSession();
    return data.session;
  }

  // authed=true assina a chamada com o token do organizador logado (exigido pelas policies de escrita
  // de campeonato/confronto/estatística); sem isso cai na anon key, só válida pra leitura e pro fluxo do técnico.
  async function sb(path, opts={}, authed=false){
    let bearer = SUPABASE_KEY;
    if(authed){
      const session = await currentSession();
      if(!session) throw new Error('Sessão expirada — faça login de novo.');
      bearer = session.access_token;
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(opts.headers||{})
      }
    });
    if(!res.ok) throw new Error(await res.text().catch(()=>res.statusText));
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // toast fixo pra dar feedback de sincronizacao com o servidor (salvando/salvo/falhou)
  let toastTimer = null;
  function showToast(msg, kind){
    let el = document.getElementById('sync-toast');
    if(!el){
      el = document.createElement('div');
      el.id = 'sync-toast';
      el.className = 'sync-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'sync-toast show ' + (kind||'');
    clearTimeout(toastTimer);
    if(kind !== 'loading'){
      toastTimer = setTimeout(()=> el.classList.remove('show'), kind==='error' ? 4000 : 1400);
    }
  }
  function hideToast(){
    const el = document.getElementById('sync-toast');
    if(el) el.classList.remove('show');
  }

  // roda uma escrita no Supabase com feedback visual e nova tentativa manual em caso de falha
  async function sbWrite(path, opts, successMsg, authed=false){
    showToast('Salvando…', 'loading');
    try{
      const result = await sb(path, opts, authed);
      showToast(successMsg || 'Salvo', 'success');
      return result;
    }catch(e){
      showToast('Falha ao salvar — sem conexão com o servidor. Toque pra tentar de novo.', 'error');
      const el = document.getElementById('sync-toast');
      if(el) el.onclick = ()=>{ el.onclick=null; sbWrite(path, opts, successMsg, authed); };
      throw e;
    }
  }

  async function sha256(text){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  // estatística completa por jogador na partida — pts é coluna gerada no banco (2*fg2m + 3*fg3m + ftm),
  // nunca mandar no INSERT/PATCH. Tempo de quadra soma o acumulado + o turno atual se ainda estiver em quadra.
  const EMPTY_STAT = { fg2m:0, fg2a:0, fg3m:0, fg3a:0, ftm:0, fta:0, reb:0, ast:0, stl:0, pf:0, pts:0 };
  function fmtMinutes(sec){ const m = Math.floor(sec/60), s = sec%60; return `${m}:${String(s).padStart(2,'0')}`; }
  function mpSeconds(mp){
    if(!mp) return 0;
    let sec = mp.seconds_played || 0;
    if(mp.on_court && mp.last_in_at) sec += Math.max(0, Math.round((Date.now() - new Date(mp.last_in_at).getTime())/1000));
    return sec;
  }
  function statButtonsHTML(pid){
    return `
      <button class="stat-btn make" data-pid="${pid}" data-changes='{"fg2m":1,"fg2a":1}'>2pt ✓</button>
      <button class="stat-btn miss" data-pid="${pid}" data-changes='{"fg2a":1}'>2pt ✗</button>
      <button class="stat-btn make" data-pid="${pid}" data-changes='{"fg3m":1,"fg3a":1}'>3pt ✓</button>
      <button class="stat-btn miss" data-pid="${pid}" data-changes='{"fg3a":1}'>3pt ✗</button>
      <button class="stat-btn make" data-pid="${pid}" data-changes='{"ftm":1,"fta":1}'>ll ✓</button>
      <button class="stat-btn miss" data-pid="${pid}" data-changes='{"fta":1}'>ll ✗</button>
      <button class="stat-btn" data-pid="${pid}" data-changes='{"reb":1}'>+ rebote</button>
      <button class="stat-btn" data-pid="${pid}" data-changes='{"ast":1}'>+ assist.</button>
      <button class="stat-btn" data-pid="${pid}" data-changes='{"stl":1}'>+ roubo</button>
      <button class="stat-btn miss" data-pid="${pid}" data-changes='{"pf":1}'>+ falta</button>`;
  }
  function statLineHTML(s, sec){
    return `${s.pts||0} pts · ${s.fg2m}/${s.fg2a} 2pt · ${s.fg3m}/${s.fg3a} 3pt · ${s.ftm}/${s.fta} ll · ${s.reb} reb · ${s.ast} ast · ${s.stl} rb · ${s.pf} faltas · ${fmtMinutes(sec)} em quadra`;
  }

  // champCode() já vem definida globalmente por js/app-gate.js (que carrega antes de tudo,
  // inclusive do app-core.js, que também precisa dela) — não redeclarar aqui.
  function champSessionKey(code){ return `statix-champ-session-${code}`; }
  function loadChampSession(code){ try{ return JSON.parse(localStorage.getItem(champSessionKey(code))||'null'); }catch(e){ return null; } }
  function saveChampSession(code, session){ try{ localStorage.setItem(champSessionKey(code), JSON.stringify(session)); }catch(e){} }
  function genInviteCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
  }

  let champUI = { view:'loading', championship:null, teamId:null, pin:null, tree:null, error:null };

  function goToDashboard(){
    const url = new URL(location.href);
    url.searchParams.delete('c');
    history.replaceState(null, '', url);
    renderChamp();
  }

  function watchParam(){ return new URLSearchParams(location.search).get('watch') || ''; }

  async function renderChamp(){
    const el = document.getElementById('champ-body');
    const code = champCode();
    const watchId = watchParam();

    // placar público — sem login, sem PIN, qualquer um com o link vê ao vivo (leitura já é aberta no RLS)
    if(code && watchId){
      await renderPublicMatch(code, watchId);
      return;
    }

    if(!code){
      await renderDashboard();
      return;
    }

    el.innerHTML = `<div class="panel"><div class="empty">Carregando campeonato…</div></div>`;
    let championship;
    try{
      const rows = await sb(`championships?invite_code=eq.${encodeURIComponent(code)}&select=*`);
      championship = rows && rows[0];
    }catch(e){
      el.innerHTML = champErrorHTML('Não deu pra conectar ao servidor. Verifique a internet e tente de novo.');
      return;
    }
    if(!championship){
      el.innerHTML = champErrorHTML('Link de campeonato inválido ou expirado.');
      return;
    }
    champUI.championship = championship;

    // se quem abriu o link é o organizador logado dono deste campeonato, pula o cadastro de técnico
    // e vai direto pro painel de scout — dono é validado no banco (owner_id), não no front.
    const session = await currentSession();
    if(session && championship.owner_id === session.user.id){
      await renderChampOverall(championship, true);
      return;
    }

    const teamSession = loadChampSession(code);
    if(teamSession && teamSession.teamId){
      champUI.teamId = teamSession.teamId; champUI.pin = teamSession.pin;
      await renderChampTeamPanel();
    } else {
      el.innerHTML = champJoinHTML(championship);
      wireChampJoin(championship);
    }
  }

  function champErrorHTML(msg){
    return `<div class="panel"><div class="empty">${escapeHtml(msg)}</div></div>`;
  }

  // ---------- DASHBOARD DO ORGANIZADOR (login + "meus campeonatos") ----------
  async function renderDashboard(){
    const el = document.getElementById('champ-body');
    el.innerHTML = `<div class="panel"><div class="empty">Carregando…</div></div>`;
    const session = await currentSession();
    if(!session){
      el.innerHTML = dashLoginHTML();
      wireDashLogin();
      return;
    }
    let licensed;
    try{
      const rows = await sb(`licenses?email=eq.${encodeURIComponent((session.user.email||'').toLowerCase())}&select=email`, {}, true);
      licensed = rows && rows.length > 0;
    }catch(e){
      el.innerHTML = champErrorHTML('Não deu pra confirmar sua licença. Verifique a internet e volte a essa tela.');
      return;
    }
    if(!licensed){
      el.innerHTML = dashNoLicenseHTML(session);
      document.getElementById('btn-dash-logout').addEventListener('click', async ()=>{
        await supaAuth.auth.signOut();
        renderDashboard();
      });
      return;
    }
    let mine;
    try{
      mine = await sb(`championships?owner_id=eq.${session.user.id}&select=*&order=created_at.desc`, {}, true);
    }catch(e){
      el.innerHTML = champErrorHTML('Não deu pra carregar seus campeonatos. Verifique a internet e volte a essa tela.');
      return;
    }
    el.innerHTML = `
      <div class="panel">
        <span class="eyebrow">Organizador</span>
        <h2>Meus campeonatos</h2>
        <div style="color:var(--ink-dim);font-size:12.5px;margin-bottom:6px;">${escapeHtml(session.user.email)}</div>
        <button class="btn ghost" id="btn-dash-logout">Sair da conta</button>
        <div class="roster-list" style="margin-top:16px;">
          ${mine.length ? mine.map(c=>`
            <div class="roster-row">
              <span class="name">${escapeHtml(c.name)}</span>
              <span style="color:var(--ink-dim);font-family:'JetBrains Mono';font-size:11px;">${escapeHtml(c.invite_code)}</span>
              <button type="button" class="btn dash-open-champ" data-code="${escapeHtml(c.invite_code)}">Abrir</button>
            </div>`).join('') : `<div class="empty">Nenhum campeonato criado ainda.</div>`}
        </div>
      </div>
      <div class="panel" style="margin-top:16px;">
        <span class="eyebrow">Novo</span>
        <h2>Criar campeonato</h2>
        <div class="row row-stack">
          <input type="text" id="champ-name" placeholder="Nome do campeonato" style="flex:2;min-width:200px;">
          <button class="btn primary" id="btn-create-champ">Criar campeonato</button>
        </div>
        <div id="champ-create-msg" style="margin-top:10px;font-family:'JetBrains Mono';font-size:12px;color:var(--ink-dim);"></div>
      </div>
      <div class="panel" style="margin-top:16px;">
        <span class="eyebrow">Fui convidado</span>
        <h2>Entrar num campeonato como técnico</h2>
        <div class="row row-stack">
          <input type="text" id="champ-code-input" placeholder="Código do convite (ex: A3F9K2)" style="flex:2;min-width:200px;text-transform:uppercase;">
          <button class="btn" id="btn-goto-champ">Entrar</button>
        </div>
      </div>`;

    document.getElementById('btn-dash-logout').addEventListener('click', async ()=>{
      await supaAuth.auth.signOut();
      renderDashboard();
    });
    el.querySelectorAll('.dash-open-champ').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const url = new URL(location.href);
        url.searchParams.set('c', btn.dataset.code);
        history.replaceState(null, '', url);
        renderChamp();
      });
    });
    document.getElementById('btn-create-champ').addEventListener('click', async ()=>{
      const name = document.getElementById('champ-name').value.trim();
      const msg = document.getElementById('champ-create-msg');
      if(!name){ msg.textContent = 'Digite um nome pro campeonato.'; return; }
      msg.textContent = 'Criando…';
      try{
        let created = null, tries = 0;
        while(!created && tries < 5){
          tries++;
          const code = genInviteCode();
          try{
            const rows = await sb('championships', { method:'POST', body: JSON.stringify({ name, invite_code: code, owner_id: session.user.id }) }, true);
            created = rows[0];
          }catch(e){ /* código colidiu, tenta outro */ }
        }
        if(!created){ msg.textContent = 'Erro ao criar. Tenta de novo.'; return; }
        const url = new URL(location.href);
        url.searchParams.set('c', created.invite_code);
        history.replaceState(null, '', url);
        renderChamp();
      }catch(e){ msg.textContent = 'Erro ao criar campeonato.'; }
    });
    document.getElementById('btn-goto-champ').addEventListener('click', ()=>{
      const code = document.getElementById('champ-code-input').value.trim().toUpperCase();
      if(!code) return;
      const url = new URL(location.href);
      url.searchParams.set('c', code);
      history.replaceState(null, '', url);
      renderChamp();
    });
  }

  function dashNoLicenseHTML(session){
    return `
      <div class="panel">
        <span class="eyebrow">Organizador</span>
        <h2>Sem licença ativa</h2>
        <p style="color:var(--ink-dim);font-size:13px;margin:-6px 0 16px;">A conta <strong style="color:var(--ink);">${escapeHtml(session.user.email)}</strong> logou certinho, mas ainda não tem uma licença liberada pra criar ou gerenciar campeonatos. Peça acesso e a gente libera pra esse e-mail.</p>
        <div class="row">
          <a class="btn primary" href="https://cpzdigital.com.br/statix#contato" target="_blank" rel="noopener">Pedir licença →</a>
          <button class="btn ghost" id="btn-dash-logout">Sair da conta</button>
        </div>
      </div>`;
  }

  function dashLoginHTML(){
    return `
      <div class="panel">
        <span class="eyebrow">Organizador</span>
        <h2>Entrar ou criar conta</h2>
        <p style="color:var(--ink-dim);font-size:13px;margin:-6px 0 16px;">Só o organizador com licença ativa acessa o painel — pra criar campeonatos, gerenciar vários ao mesmo tempo e rodar o scout ao vivo dos confrontos. Técnico convidado não precisa de conta: só usa o link. <a href="https://cpzdigital.com.br/statix#contato" target="_blank" rel="noopener" style="color:var(--accent);">Ainda não tem licença? Peça aqui.</a></p>
        <button type="button" class="btn" id="btn-dash-google" style="width:100%;margin-bottom:14px;">Entrar com o Google</button>
        <div style="text-align:center;color:var(--ink-dim);font-family:'JetBrains Mono';font-size:11px;margin-bottom:14px;">— ou com e-mail e senha —</div>
        <div class="row row-stack">
          <input type="text" id="dash-email" placeholder="E-mail" style="flex:1;min-width:200px;">
          <input type="text" id="dash-pass" placeholder="Senha" style="flex:1;min-width:160px;">
        </div>
        <div class="row" style="margin-top:12px;">
          <button class="btn primary" id="btn-dash-login">Entrar</button>
          <button class="btn" id="btn-dash-signup">Criar conta</button>
        </div>
        <div id="dash-login-msg" style="margin-top:10px;font-family:'JetBrains Mono';font-size:12px;color:var(--miss);"></div>
      </div>
      <div class="panel" style="margin-top:16px;">
        <span class="eyebrow">Fui convidado</span>
        <h2>Entrar num campeonato como técnico</h2>
        <div class="row row-stack">
          <input type="text" id="champ-code-input" placeholder="Código do convite (ex: A3F9K2)" style="flex:2;min-width:200px;text-transform:uppercase;">
          <button class="btn" id="btn-goto-champ">Entrar</button>
        </div>
      </div>`;
  }

  function wireDashLogin(){
    const msg = document.getElementById('dash-login-msg');
    document.getElementById('btn-dash-google').addEventListener('click', async ()=>{
      const { error } = await supaAuth.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.href } });
      if(error) msg.textContent = 'Login com Google ainda não está configurado.';
    });
    document.getElementById('btn-dash-login').addEventListener('click', async ()=>{
      const email = document.getElementById('dash-email').value.trim();
      const password = document.getElementById('dash-pass').value;
      msg.textContent = 'Entrando…';
      const { error } = await supaAuth.auth.signInWithPassword({ email, password });
      if(error){ msg.textContent = 'E-mail ou senha inválidos.'; return; }
      renderDashboard();
    });
    document.getElementById('btn-dash-signup').addEventListener('click', async ()=>{
      const email = document.getElementById('dash-email').value.trim();
      const password = document.getElementById('dash-pass').value;
      if(!email || password.length < 6){ msg.textContent = 'Preencha o e-mail e uma senha com 6+ caracteres.'; return; }
      msg.textContent = 'Criando conta…';
      const { error } = await supaAuth.auth.signUp({ email, password });
      if(error){ msg.textContent = error.message; return; }
      msg.textContent = 'Conta criada. Se pedir confirmação, confira seu e-mail antes de entrar.';
    });
    document.getElementById('btn-goto-champ').addEventListener('click', ()=>{
      const code = document.getElementById('champ-code-input').value.trim().toUpperCase();
      if(!code) return;
      const url = new URL(location.href);
      url.searchParams.set('c', code);
      history.replaceState(null, '', url);
      renderChamp();
    });
  }

  function champJoinHTML(championship){
    const link = location.origin + location.pathname + '?c=' + championship.invite_code;
    return `
      <div class="panel">
        <span class="eyebrow">Campeonato</span>
        <h2>${escapeHtml(championship.name)}</h2>
        <div class="row" style="margin-bottom:16px;">
          <input type="text" readonly value="${escapeHtml(link)}" style="flex:1;min-width:180px;font-size:12px;" id="champ-link-field">
          <button class="btn" id="btn-copy-link">Copiar link</button>
        </div>
        <div class="eyebrow">Entrar como técnico</div>
        <div class="row row-stack">
          <input type="text" id="champ-team-name" placeholder="Nome do seu time" style="flex:1;min-width:160px;">
          <input type="text" id="champ-team-pin" placeholder="PIN (crie um, 4 dígitos)" style="max-width:200px;" inputmode="numeric" maxlength="8">
          <button class="btn primary" id="btn-join-team">Entrar / criar time</button>
        </div>
        <div id="champ-join-msg" style="margin-top:10px;font-family:'JetBrains Mono';font-size:12px;color:var(--miss);"></div>
      </div>`;
  }

  function wireChampJoin(championship){
    document.getElementById('btn-copy-link').addEventListener('click', ()=>{
      const field = document.getElementById('champ-link-field');
      field.select();
      navigator.clipboard?.writeText(field.value).catch(()=>document.execCommand('copy'));
    });
    document.getElementById('btn-join-team').addEventListener('click', async ()=>{
      const name = document.getElementById('champ-team-name').value.trim();
      const pin = document.getElementById('champ-team-pin').value.trim();
      const msg = document.getElementById('champ-join-msg');
      if(!name || !pin){ msg.textContent = 'Preencha o nome do time e um PIN.'; return; }
      msg.textContent = 'Entrando…';
      try{
        const pinHash = await sha256(pin);
        const existing = await sb(`teams?championship_id=eq.${championship.id}&name=eq.${encodeURIComponent(name)}&select=*`);
        let team;
        if(existing && existing.length){
          team = existing[0];
          if(team.pin !== pinHash){ msg.textContent = 'Já existe um time com esse nome e o PIN não confere.'; return; }
        } else {
          const rows = await sb('teams', { method:'POST', body: JSON.stringify({ championship_id: championship.id, name, pin: pinHash }) });
          team = rows[0];
        }
        saveChampSession(championship.invite_code, { teamId: team.id, pin });
        champUI.teamId = team.id; champUI.pin = pin;
        await renderChampTeamPanel();
      }catch(e){ msg.textContent = 'Erro ao entrar. Tenta de novo.'; }
    });
  }

  async function fetchChampTree(championshipId){
    return sb(`teams?championship_id=eq.${championshipId}&select=id,name,players(id,name,num,attrs)`);
  }

  // ranking geral agora vem só dos confrontos que o organizador roda no scout — o técnico convidado não registra jogo
  async function fetchChampMatches(championshipId){
    return sb(`matches?championship_id=eq.${championshipId}&select=id,finished,played_at,teamA:teams!matches_team_a_id_fkey(name),teamB:teams!matches_team_b_id_fkey(name),match_players(player_id,team_id,starter,players(name,num),teams(name)),match_stats(player_id,pts,reb,ast,fg3m,stl)&order=played_at.desc`);
  }

  function champRankingsFromMatches(matches){
    const byPlayer = {};
    matches.filter(m=>m.finished).forEach(m=>{
      m.match_players.forEach(mp=>{
        if(!byPlayer[mp.player_id]){
          byPlayer[mp.player_id] = { name:mp.players.name, num:mp.players.num, team:mp.teams.name, gp:0, pts:0,reb:0,ast:0,fg3m:0,stl:0 };
        }
        const s = m.match_stats.find(x=>x.player_id===mp.player_id) || {pts:0,reb:0,ast:0,fg3m:0,stl:0};
        const row = byPlayer[mp.player_id];
        row.gp++; row.pts+=s.pts; row.reb+=s.reb; row.ast+=s.ast; row.fg3m+=s.fg3m; row.stl+=s.stl;
      });
    });
    return Object.values(byPlayer).map(r=>{
      const div = r.gp||1;
      return { ...r, ppg:r.pts/div, rpg:r.reb/div, apg:r.ast/div, spg:r.stl/div };
    }).sort((a,b)=>b.ppg-a.ppg);
  }

  async function renderChampOverall(championship, viewOnly){
    const el = document.getElementById('champ-body');
    el.innerHTML = `<div class="panel"><div class="empty">Carregando…</div></div>`;
    let teams, matches;
    try{
      [teams, matches] = await Promise.all([ fetchChampTree(championship.id), fetchChampMatches(championship.id) ]);
    }catch(e){
      el.innerHTML = champErrorHTML('Não deu pra carregar os dados do campeonato. Verifique a internet e volte a essa tela.');
      return;
    }
    const rows = champRankingsFromMatches(matches);
    const backBtn = `<button class="btn ghost" id="btn-champ-back" style="margin-bottom:16px;">← voltar</button>`;
    const inviteLink = `${location.origin}${location.pathname}?c=${championship.invite_code}`;
    el.innerHTML = `
      ${backBtn}
      <div class="panel">
        <span class="eyebrow">Organizador</span>
        <h2>${escapeHtml(championship.name)}</h2>
        <div class="row" style="margin-bottom:14px;">
          <input type="text" readonly value="${escapeHtml(inviteLink)}" style="flex:1;min-width:180px;font-size:12px;" id="champ-invite-field">
          <button class="btn" id="btn-copy-invite">Copiar link de convite</button>
          <span style="color:var(--ink-dim);font-family:'JetBrains Mono';font-size:12px;">código: ${escapeHtml(championship.invite_code)}</span>
        </div>
        <div class="row">
          <button class="btn primary" id="btn-new-match" ${teams.length<2?'disabled':''}>Novo confronto (scout ao vivo)</button>
        </div>
        ${teams.length<2 ? `<div style="margin-top:8px;color:var(--ink-dim);font-size:12px;">Precisa de pelo menos 2 times cadastrados no campeonato — mande o link de convite acima pros técnicos.</div>` : ''}
      </div>
      <div class="panel" style="margin-top:16px;">
        <span class="eyebrow">Temporada</span>
        <h2>Ranking geral</h2>
        <div style="color:var(--ink-dim);font-family:'JetBrains Mono';font-size:11.5px;margin-bottom:14px;">${teams.length} time(s) participando</div>
        <div class="table-wrap">
          <table><thead><tr><th>#</th><th>Jogador</th><th>Time</th><th>Jogos</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((r,i)=>`<tr>
              <td class="rank-num">${i+1}</td>
              <td>${escapeHtml(r.name)} <span style="color:var(--ink-dim);">#${escapeHtml(r.num||'—')}</span></td>
              <td>${escapeHtml(r.team)}</td>
              <td>${r.gp}</td><td>${r.ppg.toFixed(1)}</td><td>${r.rpg.toFixed(1)}</td><td>${r.apg.toFixed(1)}</td><td>${r.spg.toFixed(1)}</td>
            </tr>`).join('') : `<tr><td colspan="8" class="empty">Nenhum confronto encerrado ainda.</td></tr>`}
          </tbody></table>
        </div>
      </div>
      <div class="panel" style="margin-top:16px;">
        <span class="eyebrow">Histórico</span>
        <h2>Confrontos</h2>
        <div class="roster-list">
          ${matches.length ? matches.map(m=>{
            function scoreFor(teamName){
              return m.match_stats.reduce((s,x)=>{
                const mp = m.match_players.find(p=>p.player_id===x.player_id);
                return (mp && mp.teams && mp.teams.name===teamName) ? s+x.pts : s;
              },0);
            }
            const a = scoreFor(m.teamA.name), b = scoreFor(m.teamB.name);
            const d = new Date(m.played_at);
            return `<div class="roster-row">
              <span class="name">${escapeHtml(m.teamA.name)} <span class="num" style="color:var(--ink-dim);">${a}</span> × <span class="num" style="color:var(--ink-dim);">${b}</span> ${escapeHtml(m.teamB.name)}</span>
              <span style="color:var(--ink-dim);font-family:'JetBrains Mono';font-size:11px;">${d.toLocaleDateString('pt-BR')} ${m.finished?'· encerrado':'· em andamento'}</span>
              ${!m.finished ? `<button data-mid="${m.id}" class="btn-resume-match" style="color:var(--accent);">continuar</button>` : ''}
            </div>`;
          }).join('') : `<div class="empty">Nenhum confronto criado ainda.</div>`}
        </div>
      </div>`;
    document.getElementById('btn-champ-back').addEventListener('click', goToDashboard);
    document.getElementById('btn-copy-invite').addEventListener('click', ()=>{
      const field = document.getElementById('champ-invite-field');
      field.select();
      navigator.clipboard?.writeText(field.value).catch(()=>document.execCommand('copy'));
      showToast('Link copiado', 'success');
    });
    if(teams.length>=2){
      document.getElementById('btn-new-match').addEventListener('click', ()=> renderMatchSetup(championship, teams));
    }
    el.querySelectorAll('.btn-resume-match').forEach(btn=>{
      btn.addEventListener('click', ()=> renderMatchLive(championship, teams, btn.dataset.mid));
    });
  }

  // ---------- SCOUT AO VIVO (confronto entre dois times do campeonato) ----------
  function renderMatchSetup(championship, teams){
    const el = document.getElementById('champ-body');
    el.innerHTML = `
      <button class="btn ghost" id="btn-match-back" style="margin-bottom:16px;">← voltar</button>
      <div class="panel">
        <span class="eyebrow">Novo confronto</span>
        <h2>Escolha os dois times</h2>
        <div class="row row-stack">
          <select id="match-team-a" style="flex:1;min-width:160px;">${teams.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select>
          <span style="align-self:center;color:var(--ink-dim);font-family:'JetBrains Mono';">vs</span>
          <select id="match-team-b" style="flex:1;min-width:160px;">${teams.map((t,i)=>`<option value="${t.id}" ${i===1?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}</select>
        </div>
        <button class="btn primary" id="btn-confirm-match" style="margin-top:14px;">Definir titulares e banco</button>
      </div>`;
    document.getElementById('btn-match-back').addEventListener('click', ()=> renderChampOverall(championship, true));
    document.getElementById('btn-confirm-match').addEventListener('click', async ()=>{
      const teamAId = document.getElementById('match-team-a').value;
      const teamBId = document.getElementById('match-team-b').value;
      if(teamAId===teamBId){ alert('Escolha dois times diferentes.'); return; }
      try{
        const rows = await sbWrite('matches', { method:'POST', body: JSON.stringify({ championship_id: championship.id, team_a_id: teamAId, team_b_id: teamBId }) }, 'Confronto criado', true);
        renderMatchRoster(championship, teams, rows[0]);
      }catch(e){}
    });
  }

  function renderMatchRoster(championship, teams, match){
    const teamA = teams.find(t=>t.id===match.team_a_id);
    const teamB = teams.find(t=>t.id===match.team_b_id);
    const starters = {}; // player_id -> bool, default false (banco)

    function teamBlock(team){
      return `
        <div class="panel">
          <span class="eyebrow">${escapeHtml(team.name)}</span>
          <h2>Titulares e banco</h2>
          <div class="roster-list">
            ${team.players.length ? team.players.map(p=>`
              <div class="roster-row">
                <span class="jersey">${escapeHtml(p.num||'—')}</span>
                <span class="name">${escapeHtml(p.name)}</span>
                <button type="button" class="filter-chip starter-toggle" data-pid="${p.id}" data-team="${team.id}">Banco</button>
              </div>`).join('') : `<div class="empty">Time sem jogadores cadastrados.</div>`}
          </div>
        </div>`;
    }

    const el = document.getElementById('champ-body');
    el.innerHTML = `
      <button class="btn ghost" id="btn-roster-back" style="margin-bottom:16px;">← voltar</button>
      <div class="panel">
        <span class="eyebrow">Confronto</span>
        <h2>${escapeHtml(teamA.name)} vs ${escapeHtml(teamB.name)}</h2>
        <div style="color:var(--ink-dim);font-size:12.5px;">clique nos jogadores que vão começar em quadra como titulares — o resto entra como banco</div>
      </div>
      ${teamBlock(teamA)}
      ${teamBlock(teamB)}
      <button class="btn primary" id="btn-start-match" style="margin-top:6px;">Começar confronto</button>`;

    document.getElementById('btn-roster-back').addEventListener('click', ()=> renderChampOverall(championship, true));
    el.querySelectorAll('.starter-toggle').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const on = !starters[btn.dataset.pid];
        starters[btn.dataset.pid] = on;
        btn.classList.toggle('active', on);
        btn.textContent = on ? 'Titular' : 'Banco';
      });
    });
    document.getElementById('btn-start-match').addEventListener('click', async ()=>{
      const now = new Date().toISOString();
      const rosterRows = [...teamA.players, ...teamB.players].map(p=>({
        match_id: match.id,
        player_id: p.id,
        team_id: teamA.players.includes(p) ? teamA.id : teamB.id,
        starter: !!starters[p.id],
        on_court: !!starters[p.id],
        last_in_at: starters[p.id] ? now : null
      }));
      try{
        if(rosterRows.length) await sbWrite('match_players', { method:'POST', body: JSON.stringify(rosterRows) }, 'Escalação salva', true);
        renderMatchLive(championship, teams, match.id);
      }catch(e){}
    });
  }

  async function fetchMatch(matchId){
    const rows = await sb(`matches?id=eq.${matchId}&select=*,match_players(player_id,team_id,starter,on_court,seconds_played,last_in_at),match_stats(player_id,pts,fg2m,fg2a,fg3m,fg3a,ftm,fta,reb,ast,stl,pf)`);
    return rows[0];
  }

  // ---------- PLACAR PÚBLICO (link ?c=CODIGO&watch=MATCH_ID) ----------
  // Sem login, sem PIN — qualquer um com o link vê o confronto ao vivo, só leitura.
  // Reaproveita as classes visuais do Modo Quadra (court-diagram/court-chip) só pra exibir, sem drag nem clique.
  function openPublicStatModal(player, s, mp){
    document.getElementById('court-modal-name').textContent = `#${player.num||'—'} ${player.name}`;
    document.getElementById('court-modal-line').textContent = 'nesta partida';
    document.getElementById('court-modal-stats').innerHTML = `
      <div class="stat-btn" style="cursor:default;">${s.pts||0}<br>pontos</div>
      <div class="stat-btn" style="cursor:default;">${s.fg2m}/${s.fg2a}<br>2 pontos</div>
      <div class="stat-btn make" style="cursor:default;">${s.fg3m}/${s.fg3a}<br>3 pontos</div>
      <div class="stat-btn" style="cursor:default;">${s.ftm}/${s.fta}<br>lance livre</div>
      <div class="stat-btn" style="cursor:default;">${s.reb||0}<br>rebotes</div>
      <div class="stat-btn" style="cursor:default;">${s.ast||0}<br>assist.</div>
      <div class="stat-btn" style="cursor:default;">${s.stl||0}<br>roubos</div>
      <div class="stat-btn miss" style="cursor:default;">${s.pf||0}<br>faltas</div>
      <div class="stat-btn" style="cursor:default;">${fmtMinutes(mpSeconds(mp))}<br>em quadra</div>`;
    document.getElementById('court-stat-modal').classList.add('open');
  }

  function publicCourtHTML(team, roster, playersById, statOf){
    const onCourt = roster.filter(mp=>mp.on_court);
    const chips = onCourt.map((mp,i)=>{
      const p = playersById[mp.player_id]; if(!p) return '';
      const pos = COURT_SLOTS[i % COURT_SLOTS.length];
      const s = statOf(mp.player_id);
      return `<div class="court-chip" style="left:${pos[0]}%;top:${pos[1]}%;" data-pid="${p.id}"><span>${escapeHtml(p.num||'—')}</span><small>${s.pts||0}p</small></div>`;
    }).join('');
    return `
      <div class="court-diagram" style="height:180px;margin-bottom:10px;">
        <svg class="court-svg" viewBox="0 0 300 190" preserveAspectRatio="none">
          <rect x="2" y="2" width="296" height="186" fill="none" stroke="currentColor" stroke-width="1.2"/>
          <circle cx="150" cy="95" r="24" fill="none" stroke="currentColor" stroke-width="1"/>
          <line x1="150" y1="2" x2="150" y2="188" stroke="currentColor" stroke-width="1"/>
        </svg>
        <div>${chips}</div>
      </div>`;
  }

  async function renderPublicMatch(code, matchId){
    const el = document.getElementById('champ-body');
    el.innerHTML = `<div class="panel"><div class="empty">Carregando placar…</div></div>`;

    let championship, teams, match;
    try{
      const rows = await sb(`championships?invite_code=eq.${encodeURIComponent(code)}&select=*`);
      championship = rows && rows[0];
      if(!championship) throw new Error('not found');
      [teams, match] = await Promise.all([ fetchChampTree(championship.id), fetchMatch(matchId) ]);
    }catch(e){
      el.innerHTML = champErrorHTML('Não foi possível carregar esse placar. Verifique o link ou a internet.');
      return;
    }
    if(!match){ el.innerHTML = champErrorHTML('Confronto não encontrado.'); return; }

    const teamA = teams.find(t=>t.id===match.team_a_id);
    const teamB = teams.find(t=>t.id===match.team_b_id);
    const playersById = Object.fromEntries([...(teamA?.players||[]), ...(teamB?.players||[])].map(p=>[p.id,p]));
    const statOf = pid => match.match_stats.find(s=>s.player_id===pid) || EMPTY_STAT;
    const mpOf = pid => match.match_players.find(mp=>mp.player_id===pid);
    const scoreOf = team => match.match_players.filter(mp=>mp.team_id===team.id).reduce((s,mp)=>s+(statOf(mp.player_id).pts||0),0);

    function publicTeamPanel(team){
      const roster = match.match_players.filter(mp=>mp.team_id===team.id);
      const bench = roster.filter(mp=>!mp.on_court).map(mp=>playersById[mp.player_id]).filter(Boolean);
      const lines = roster.filter(mp=>mp.on_court).map(mp=>{
        const p = playersById[mp.player_id]; if(!p) return '';
        const s = statOf(mp.player_id);
        return `<div class="roster-row public-player-row" data-pid="${p.id}" style="cursor:pointer;"><span class="jersey">${escapeHtml(p.num||'—')}</span><span class="name">${escapeHtml(p.name)}</span><span style="color:var(--ink-dim);font-family:'JetBrains Mono';font-size:11px;white-space:nowrap;">${s.pts}p ${s.reb}r ${s.ast}a ${s.stl}rb ${s.pf}f · ${fmtMinutes(mpSeconds(mp))}</span></div>`;
      }).join('');
      return `
        <div class="panel">
          <span class="eyebrow">${escapeHtml(team.name)}</span>
          <div class="clock num" style="margin-bottom:10px;">${scoreOf(team)}</div>
          ${publicCourtHTML(team, roster, playersById, statOf)}
          <div class="roster-list">${lines}</div>
          ${bench.length ? `<div class="eyebrow" style="margin-top:14px;">Banco</div><div style="color:var(--ink-dim);font-family:'JetBrains Mono';font-size:12px;">${bench.map(p=>`#${escapeHtml(p.num||'—')} ${escapeHtml(p.name)}`).join(' · ')}</div>` : ''}
        </div>`;
    }

    el.innerHTML = `
      <button class="btn ghost" id="btn-public-back" style="margin-bottom:16px;">← sair do placar</button>
      <div class="panel">
        <span class="eyebrow">${match.finished ? 'Confronto encerrado' : '🔴 Ao vivo'} · ${escapeHtml(championship.name)}</span>
        <h2>${escapeHtml(teamA?.name||'?')} ${scoreOf(teamA)} × ${scoreOf(teamB)} ${escapeHtml(teamB?.name||'?')}</h2>
      </div>
      <div class="match-columns">
        ${publicTeamPanel(teamA)}
        ${publicTeamPanel(teamB)}
      </div>`;

    document.getElementById('btn-public-back').addEventListener('click', ()=>{
      const url = new URL(location.href);
      url.searchParams.delete('c'); url.searchParams.delete('watch');
      history.replaceState(null, '', url);
      switchView('scorer');
    });
    el.querySelectorAll('.court-chip[data-pid], .public-player-row[data-pid]').forEach(node=>{
      node.addEventListener('click', ()=>{
        const p = playersById[node.dataset.pid];
        if(p) openPublicStatModal(p, statOf(p.id), mpOf(p.id));
      });
    });

    if(!match.finished){
      setTimeout(()=>{
        if(document.getElementById('view-champ')?.classList.contains('active') && watchParam()===matchId){
          renderPublicMatch(code, matchId);
        }
      }, 8000);
    }
  }

  async function renderMatchLive(championship, teams, matchId){
    const el = document.getElementById('champ-body');
    el.innerHTML = `<div class="panel"><div class="empty">Carregando confronto…</div></div>`;
    const match = await fetchMatch(matchId);
    const teamA = teams.find(t=>t.id===match.team_a_id);
    const teamB = teams.find(t=>t.id===match.team_b_id);
    const playersById = Object.fromEntries([...teamA.players, ...teamB.players].map(p=>[p.id,p]));

    function statOf(pid){ return match.match_stats.find(s=>s.player_id===pid) || EMPTY_STAT; }
    function mpOf(pid){ return match.match_players.find(mp=>mp.player_id===pid); }

    function teamScore(team){
      return match.match_players.filter(mp=>mp.team_id===team.id).reduce((sum,mp)=>sum+(statOf(mp.player_id).pts||0),0);
    }

    function teamColumn(team){
      const roster = match.match_players.filter(mp=>mp.team_id===team.id);
      const onCourt = roster.filter(mp=>mp.on_court);
      const bench = roster.filter(mp=>!mp.on_court);
      return `
        <div class="panel">
          <span class="eyebrow">${escapeHtml(team.name)}</span>
          <div class="clock num" style="margin-bottom:14px;">${teamScore(team)}</div>
          <div class="oncourt">
            ${onCourt.map(mp=>{
              const p = playersById[mp.player_id]; const s = statOf(mp.player_id);
              return `<div class="player-card">
                <div class="pname"><span class="jersey">${escapeHtml(p.num||'—')}</span><strong>${escapeHtml(p.name)}</strong></div>
                <div class="stat-grid">
                  ${statButtonsHTML(p.id)}
                </div>
                <div class="live-line">${statLineHTML(s, mpSeconds(mp))}</div>
                <button type="button" class="btn ghost sub-out" data-pid="${p.id}" style="margin-top:8px;width:100%;">↓ substituir (sai)</button>
              </div>`;
            }).join('')}
          </div>
          ${bench.length ? `
          <div class="eyebrow" style="margin-top:16px;">Banco de reservas</div>
          <div class="roster-list">
            ${bench.map(mp=>{
              const p = playersById[mp.player_id];
              return `<div class="roster-row">
                <span class="jersey">${escapeHtml(p.num||'—')}</span>
                <span class="name">${escapeHtml(p.name)}</span>
                <button type="button" class="btn sub-in" data-pid="${p.id}" style="color:var(--make);">↑ entra</button>
              </div>`;
            }).join('')}
          </div>` : ''}
        </div>`;
    }

    el.innerHTML = `
      <button class="btn ghost" id="btn-live-back" style="margin-bottom:16px;">← voltar (o confronto continua salvo, dá pra retomar depois)</button>
      <div class="panel">
        <span class="eyebrow">Confronto ao vivo</span>
        <h2>${escapeHtml(teamA.name)} ${teamScore(teamA)} × ${teamScore(teamB)} ${escapeHtml(teamB.name)}</h2>
        <div class="row">
          <button class="btn" id="btn-match-court-mode">🏀 Modo quadra</button>
          <button class="btn" id="btn-share-public">🔗 Compartilhar placar</button>
          <button class="btn primary" id="btn-finish-match">Encerrar confronto</button>
        </div>
        <div id="share-public-msg" style="margin-top:8px;font-family:'JetBrains Mono';font-size:12px;color:var(--ink-dim);"></div>
      </div>
      <div class="match-columns">
        ${teamColumn(teamA)}
        ${teamColumn(teamB)}
      </div>`;

    el.querySelectorAll('.stat-btn').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        btn.disabled = true;
        const changes = JSON.parse(btn.dataset.changes);
        const cur = statOf(btn.dataset.pid);
        const next = {...cur};
        Object.entries(changes).forEach(([k,v])=> next[k]=(next[k]||0)+v);
        try{
          await sbWrite(`match_stats?on_conflict=match_id,player_id`, {
            method:'POST',
            headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify({ match_id: matchId, player_id: btn.dataset.pid, fg2m:next.fg2m, fg2a:next.fg2a, fg3m:next.fg3m, fg3a:next.fg3a, ftm:next.ftm, fta:next.fta, reb:next.reb, ast:next.ast, stl:next.stl, pf:next.pf })
          }, undefined, true);
          renderMatchLive(championship, teams, matchId);
        }catch(e){ btn.disabled = false; }
      });
    });
    el.querySelectorAll('.sub-out').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const mp = mpOf(btn.dataset.pid);
        try{
          await sbWrite(`match_players?match_id=eq.${matchId}&player_id=eq.${btn.dataset.pid}`, { method:'PATCH', body: JSON.stringify({ on_court:false, seconds_played: mpSeconds(mp), last_in_at:null }) }, 'Substituição feita', true);
          renderMatchLive(championship, teams, matchId);
        }catch(e){}
      });
    });
    el.querySelectorAll('.sub-in').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        try{
          await sbWrite(`match_players?match_id=eq.${matchId}&player_id=eq.${btn.dataset.pid}`, { method:'PATCH', body: JSON.stringify({ on_court:true, last_in_at:new Date().toISOString() }) }, 'Substituição feita', true);
          renderMatchLive(championship, teams, matchId);
        }catch(e){}
      });
    });
    document.getElementById('btn-finish-match').addEventListener('click', async ()=>{
      try{
        for(const mp of match.match_players.filter(x=>x.on_court && x.last_in_at)){
          await sb(`match_players?match_id=eq.${matchId}&player_id=eq.${mp.player_id}`, { method:'PATCH', body: JSON.stringify({ seconds_played: mpSeconds(mp), last_in_at:null }) }, true);
        }
        await sbWrite(`matches?id=eq.${matchId}`, { method:'PATCH', body: JSON.stringify({ finished:true }) }, 'Confronto encerrado', true);
        renderChampOverall(championship, true);
      }catch(e){}
    });
    document.getElementById('btn-live-back').addEventListener('click', ()=> renderChampOverall(championship, true));
    document.getElementById('btn-match-court-mode').addEventListener('click', ()=>{
      openMatchCourtMode(championship, teamA, teamB, matchId);
    });
    document.getElementById('btn-share-public').addEventListener('click', ()=>{
      const link = `${location.origin}${location.pathname}?c=${championship.invite_code}&watch=${matchId}`;
      navigator.clipboard?.writeText(link).catch(()=>{});
      document.getElementById('share-public-msg').textContent = `Link copiado — qualquer um pode acompanhar ao vivo sem login: ${link}`;
    });
  }

  // Modo Quadra também pro confronto do organizador (dois times reais) — reaproveita o mesmo overlay
  // usado na súmula individual, com uma aba pra trocar de time em quadra.
  let matchCourtCtx = null;

  function openMatchCourtMode(championship, teamA, teamB, matchId){
    matchCourtCtx = { championship, teamA, teamB, matchId, activeTeamId: teamA.id };
    document.getElementById('court-overlay').classList.add('open');
    const switchBar = document.getElementById('court-team-switch');
    switchBar.style.display = 'flex';
    switchBar.innerHTML = `
      <button type="button" class="filter-chip active" data-team="${teamA.id}">${escapeHtml(teamA.name)}</button>
      <button type="button" class="filter-chip" data-team="${teamB.id}">${escapeHtml(teamB.name)}</button>`;
    switchBar.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        matchCourtCtx.activeTeamId = btn.dataset.team;
        switchBar.querySelectorAll('button').forEach(b=>b.classList.toggle('active', b===btn));
        renderMatchCourtMode();
      });
    });
    renderMatchCourtMode();
  }

  async function renderMatchCourtMode(){
    const ctx = matchCourtCtx;
    if(!ctx) return;
    let match;
    try{ match = await fetchMatch(ctx.matchId); }
    catch(e){ showToast('Falha ao carregar o confronto.', 'error'); return; }

    const teamPlayers = (ctx.activeTeamId===ctx.teamA.id ? ctx.teamA : ctx.teamB).players;
    const playersById = Object.fromEntries(teamPlayers.map(p=>[p.id,p]));
    const roster = match.match_players.filter(mp=>mp.team_id===ctx.activeTeamId);
    const onCourtIds = roster.filter(mp=>mp.on_court).map(mp=>mp.player_id);
    const benchIds = roster.filter(mp=>!mp.on_court).map(mp=>mp.player_id);
    const statOf = pid => match.match_stats.find(s=>s.player_id===pid) || EMPTY_STAT;

    const scoreOf = teamId => match.match_stats.reduce((s,x)=>{
      const mp = match.match_players.find(p=>p.player_id===x.player_id);
      return mp && mp.team_id===teamId ? s + (x.pts||0) : s;
    },0);
    document.getElementById('court-score').textContent = `${ctx.teamA.name} ${scoreOf(ctx.teamA.id)} × ${scoreOf(ctx.teamB.id)} ${ctx.teamB.name}`;

    const wrap = document.getElementById('court-players');
    wrap.innerHTML = onCourtIds.map((pid,i)=>{
      const p = playersById[pid]; if(!p) return '';
      const pos = COURT_SLOTS[i % COURT_SLOTS.length];
      const s = statOf(pid);
      return `<div class="court-chip" style="left:${pos[0]}%;top:${pos[1]}%;" data-pid="${pid}">
        <span>${escapeHtml(p.num||'—')}</span><small>${s.pts||0}p</small>
      </div>`;
    }).join('');
    wrap.querySelectorAll('.court-chip').forEach(chip=>{
      const mp = roster.find(m=>m.player_id===chip.dataset.pid);
      chip.addEventListener('click', ()=> openMatchStatModal(chip.dataset.pid, playersById[chip.dataset.pid], statOf(chip.dataset.pid), mp));
    });

    const benchList = document.getElementById('court-bench-list');
    benchList.innerHTML = benchIds.length
      ? benchIds.map(pid=>{ const p = playersById[pid]; return p ? `<div class="court-bench-chip" data-pid="${pid}">${escapeHtml(p.num||'—')}</div>` : ''; }).join('')
      : `<div style="color:var(--ink-dim);font-family:'JetBrains Mono';font-size:11px;">sem reservas</div>`;
    benchList.querySelectorAll('.court-bench-chip').forEach(chip=> enableMatchBenchDrag(chip));
  }

  function enableMatchBenchDrag(chipEl){
    chipEl.addEventListener('pointerdown', e=>{
      e.preventDefault();
      const benchPid = chipEl.dataset.pid;
      const ghost = chipEl.cloneNode(true);
      ghost.style.position = 'fixed'; ghost.style.zIndex = '999'; ghost.style.pointerEvents = 'none'; ghost.style.opacity = '0.85';
      ghost.style.left = (e.clientX-22)+'px'; ghost.style.top = (e.clientY-22)+'px';
      document.body.appendChild(ghost);
      function clearHi(){ document.querySelectorAll('.court-chip.drag-over').forEach(c=>c.classList.remove('drag-over')); }
      function move(ev){
        ghost.style.left = (ev.clientX-22)+'px'; ghost.style.top = (ev.clientY-22)+'px';
        clearHi();
        const chip = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.court-chip');
        if(chip) chip.classList.add('drag-over');
      }
      async function up(ev){
        document.removeEventListener('pointermove', move);
        ghost.remove(); clearHi();
        const chip = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.court-chip');
        if(chip) await matchSubstitute(benchPid, chip.dataset.pid);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up, { once:true });
    });
  }

  async function matchSubstitute(benchPid, onCourtPid){
    const ctx = matchCourtCtx;
    if(!ctx || benchPid===onCourtPid) return;
    try{
      const match = await fetchMatch(ctx.matchId);
      const outMp = match.match_players.find(mp=>mp.player_id===onCourtPid);
      await sbWrite(`match_players?match_id=eq.${ctx.matchId}&player_id=eq.${onCourtPid}`, { method:'PATCH', body: JSON.stringify({ on_court:false, seconds_played: mpSeconds(outMp), last_in_at:null }) }, undefined, true);
      await sbWrite(`match_players?match_id=eq.${ctx.matchId}&player_id=eq.${benchPid}`, { method:'PATCH', body: JSON.stringify({ on_court:true, last_in_at:new Date().toISOString() }) }, 'Substituição feita', true);
      renderMatchCourtMode();
    }catch(e){}
  }

  function openMatchStatModal(pid, player, s, mp){
    const ctx = matchCourtCtx;
    document.getElementById('court-modal-name').textContent = `#${player.num||'—'} ${player.name}`;
    document.getElementById('court-modal-line').textContent = statLineHTML(s, mpSeconds(mp));
    const statsEl = document.getElementById('court-modal-stats');
    statsEl.innerHTML = statButtonsHTML(pid);
    statsEl.querySelectorAll('.stat-btn').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const changes = JSON.parse(btn.dataset.changes);
        const next = { ...EMPTY_STAT, ...s };
        Object.entries(changes).forEach(([k,v])=> next[k]=(next[k]||0)+v);
        try{
          await sbWrite(`match_stats?on_conflict=match_id,player_id`, {
            method:'POST',
            headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify({ match_id: ctx.matchId, player_id: pid, fg2m:next.fg2m, fg2a:next.fg2a, fg3m:next.fg3m, fg3a:next.fg3a, ftm:next.ftm, fta:next.fta, reb:next.reb, ast:next.ast, stl:next.stl, pf:next.pf })
          }, undefined, true);
          const match = await fetchMatch(ctx.matchId);
          const newS = match.match_stats.find(x=>x.player_id===pid) || EMPTY_STAT;
          const newMp = match.match_players.find(x=>x.player_id===pid);
          openMatchStatModal(pid, player, newS, newMp);
          renderMatchCourtMode();
        }catch(e){}
      });
    });
    document.getElementById('court-stat-modal').classList.add('open');
  }

  // técnico convidado só cadastra o próprio elenco (titulares + reservas) — jogo, estatística, ranking e
  // gráfico ficam exclusivos com o organizador/scout. Nada de "premium" aparece aqui de propósito.
  async function renderChampTeamPanel(){
    const el = document.getElementById('champ-body');
    const championship = champUI.championship;
    el.innerHTML = `<div class="panel"><div class="empty">Carregando seu time…</div></div>`;
    let teams;
    try{ teams = await fetchChampTree(championship.id); }
    catch(e){ el.innerHTML = champErrorHTML('Não deu pra conectar. Verifique a internet e volte a essa tela.'); return; }
    const myTeam = teams.find(t=>t.id===champUI.teamId);
    if(!myTeam){ el.innerHTML = champErrorHTML('Time não encontrado — o campeonato pode ter sido apagado.'); return; }

    el.innerHTML = `
      <div class="panel">
        <span class="eyebrow">Campeonato · ${escapeHtml(championship.name)}</span>
        <h2>${escapeHtml(myTeam.name)}</h2>
        <div style="color:var(--ink-dim);font-size:12.5px;margin-bottom:12px;">Cadastre aqui o elenco do seu time — titulares e reservas. Jogos e estatísticas ficam com o organizador.</div>
        <button class="btn ghost" id="btn-champ-leave">Sair deste time neste dispositivo</button>
      </div>

      <div class="panel" style="margin-top:16px;">
        <span class="eyebrow">Elenco</span>
        <h2>Jogadores</h2>
        <div class="row">
          <input type="text" id="champ-player-name" placeholder="Nome do jogador" style="flex:2;min-width:160px;">
          <input type="text" id="champ-player-num" placeholder="Nº" style="max-width:80px;">
          <button class="btn primary" id="champ-add-player">Adicionar</button>
        </div>
        <div class="roster-list" id="champ-roster" style="margin-top:12px;">
          ${myTeam.players.length ? myTeam.players.map(p=>`
            <div class="roster-row">
              <span class="jersey">${escapeHtml(p.num||'—')}</span>
              <span class="name">${escapeHtml(p.name)}</span>
              <button type="button" class="icon-btn danger champ-remove-player" data-pid="${p.id}" title="Remover jogador">
                <svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>
              </button>
            </div>
          `).join('') : `<div class="empty">Nenhum jogador ainda.</div>`}
        </div>
      </div>`;

    document.getElementById('btn-champ-leave').addEventListener('click', ()=>{
      localStorage.removeItem(champSessionKey(championship.invite_code));
      champUI.teamId = null;
      renderChamp();
    });
    document.getElementById('champ-add-player').addEventListener('click', async ()=>{
      const name = document.getElementById('champ-player-name').value.trim();
      const num = document.getElementById('champ-player-num').value.trim();
      if(!name) return;
      try{
        await sbWrite('players', { method:'POST', body: JSON.stringify({ team_id: myTeam.id, name, num }) }, 'Jogador adicionado');
        renderChampTeamPanel();
      }catch(e){}
    });
    document.querySelectorAll('.champ-remove-player').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        try{
          await sbWrite(`players?id=eq.${btn.dataset.pid}`, { method:'DELETE' }, 'Jogador removido');
          renderChampTeamPanel();
        }catch(e){}
      });
    });
  }

  if(champCode()) switchView('champ');

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{}); // ponytail: falha silenciosa fora do GitHub Pages (ex. preview do artifact), onde sw.js/manifest não existem
  }

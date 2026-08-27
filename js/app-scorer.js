"use strict";
  // ---------- SCORER ----------
  function currentGame(){
    const t = team();
    if(!t || !currentGameId) return null;
    return t.games.find(g=>g.id===currentGameId) || null;
  }

  function record(pid, changes){
    const g = currentGame();
    if(!g || g.finished) return;
    Object.entries(changes).forEach(([type,delta])=>{ g.stats[pid][type] = (g.stats[pid][type]||0) + delta; });
    g.log.push({ pid, changes, ts: Date.now() });
    save(); renderScorer();
  }

  document.getElementById('btn-undo').addEventListener('click', ()=>{
    const g = currentGame();
    if(!g || !g.log.length) return;
    const last = g.log.pop();
    Object.entries(last.changes).forEach(([type,delta])=>{ g.stats[last.pid][type] = (g.stats[last.pid][type]||0) - delta; });
    save(); renderScorer();
  });

  document.getElementById('btn-finish-game').addEventListener('click', ()=>{
    const g = currentGame();
    if(!g) return;
    g.finished = true;
    save(); renderScorer(); renderGames(); renderRankings();
  });

  function renderScorer(){
    const t = team();
    const g = currentGame();
    const empty = document.getElementById('scorer-empty');
    const body = document.getElementById('scorer-body');
    if(!t || !g){
      empty.style.display='block'; body.style.display='none';
      return;
    }
    empty.style.display='none'; body.style.display='block';
    document.getElementById('scorer-opponent').textContent = 'vs ' + g.opponent;
    const total = Object.values(g.stats).reduce((s,x)=>s+x.pts,0);
    document.getElementById('scorer-total').innerHTML = total + ' <span style="font-size:20px;color:var(--ink-dim);">PTS</span>';

    const disabled = g.finished ? 'disabled' : '';
    document.getElementById('oncourt').innerHTML = t.players.map(p=>{
      const s = g.stats[p.id] || {pts:0,reb:0,ast:0,fg3:0,stl:0};
      return `<div class="player-card">
        <div class="pname"><span class="jersey">${escapeHtml(p.num)}</span><strong>${escapeHtml(p.name)}</strong></div>
        <div class="stat-grid">
          <button class="stat-btn make" ${disabled} data-pid="${p.id}" data-changes='{"pts":2}'>+2 pontos</button>
          <button class="stat-btn make" ${disabled} data-pid="${p.id}" data-changes='{"pts":3,"fg3":1}'>+3 pontos</button>
          <button class="stat-btn make" ${disabled} data-pid="${p.id}" data-changes='{"pts":1}'>+1 lance livre</button>
          <button class="stat-btn" ${disabled} data-pid="${p.id}" data-changes='{"reb":1}'>+ rebote</button>
          <button class="stat-btn" ${disabled} data-pid="${p.id}" data-changes='{"ast":1}'>+ assistência</button>
          <button class="stat-btn" ${disabled} data-pid="${p.id}" data-changes='{"stl":1}'>+ roubo de bola</button>
        </div>
        <div class="live-line">${s.pts} pontos · ${s.fg3} cestas de 3 · ${s.reb} rebotes · ${s.ast} assistências · ${s.stl} roubos</div>
      </div>`;
    }).join('');
    document.getElementById('oncourt').querySelectorAll('.stat-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        record(btn.dataset.pid, JSON.parse(btn.dataset.changes));
      });
    });
    document.getElementById('btn-finish-game').disabled = g.finished;
    document.getElementById('btn-undo').disabled = g.finished || !g.log.length;
    const last = g.log[g.log.length-1];
    document.getElementById('log').textContent = last
      ? `última: ${t.players.find(p=>p.id===last.pid)?.name || '—'} ` + Object.entries(last.changes).map(([k,v])=>`+${v} ${STAT_NAMES[k]||k}`).join(' ')
      : 'nenhum evento ainda';
  }

  // ---------- MODO QUADRA (visualização interativa, opcional) ----------
  // slots em formação de arco, em % da área da quadra — não é posição real do jogador, é só layout fixo pros chips
  const COURT_SLOTS = [[15,50],[35,20],[50,80],[65,20],[85,50]];

  document.getElementById('btn-court-mode').addEventListener('click', ()=>{
    if(!currentGame()){ alert('Inicie um jogo primeiro.'); return; }
    matchCourtCtx = null;
    document.querySelector('.court-bench').style.display = '';
    document.getElementById('court-bench-dual').classList.remove('open');
    document.getElementById('court-label-left').textContent = '';
    document.getElementById('court-label-right').textContent = '';
    document.getElementById('court-overlay').classList.add('open');
    renderCourtMode();
  });
  document.getElementById('btn-close-court').addEventListener('click', ()=>{
    document.getElementById('court-overlay').classList.remove('open');
    if(matchCourtCtx){
      const { championship, matchId } = matchCourtCtx;
      matchCourtCtx = null;
      fetchChampTree(championship.id).then(teams=> renderMatchLive(championship, teams, matchId));
    }
  });
  document.getElementById('btn-close-stat-modal').addEventListener('click', ()=>{
    document.getElementById('court-stat-modal').classList.remove('open');
  });

  function renderCourtMode(){
    const t = team(); const g = currentGame();
    if(!t || !g) return;
    if(!g.onCourt || !g.onCourt.length) g.onCourt = t.players.slice(0,5).map(p=>p.id);

    const total = Object.values(g.stats).reduce((s,x)=>s+(x.pts||0),0);
    document.getElementById('court-score').textContent = `vs ${g.opponent} · ${total} pts`;

    const onCourtPlayers = g.onCourt.map(pid=>t.players.find(p=>p.id===pid)).filter(Boolean);
    const benchPlayers = t.players.filter(p=>!g.onCourt.includes(p.id));

    const wrap = document.getElementById('court-players');
    wrap.innerHTML = onCourtPlayers.map((p,i)=>{
      const pos = COURT_SLOTS[i % COURT_SLOTS.length];
      const s = g.stats[p.id] || {};
      return `<div class="court-chip" style="left:${pos[0]}%;top:${pos[1]}%;" data-pid="${p.id}">
        <span>${escapeHtml(p.num||'—')}</span><small>${s.pts||0}p</small>
      </div>`;
    }).join('');
    wrap.querySelectorAll('.court-chip').forEach(chip=>{
      chip.addEventListener('click', ()=> openStatModal(chip.dataset.pid));
    });

    const benchList = document.getElementById('court-bench-list');
    benchList.innerHTML = benchPlayers.length
      ? benchPlayers.map(p=>`<div class="court-bench-chip" data-pid="${p.id}">${escapeHtml(p.num||'—')}</div>`).join('')
      : `<div style="color:var(--ink-dim);font-family:'JetBrains Mono';font-size:11px;">sem reservas cadastrados</div>`;
    benchList.querySelectorAll('.court-bench-chip').forEach(chip=> enableBenchDrag(chip));
  }

  // arrastar (mouse ou toque, via Pointer Events) um jogador do banco sobre um jogador em quadra pra substituir
  function enableBenchDrag(chipEl){
    chipEl.addEventListener('pointerdown', e=>{
      e.preventDefault();
      const benchPid = chipEl.dataset.pid;
      const ghost = chipEl.cloneNode(true);
      ghost.style.position = 'fixed';
      ghost.style.zIndex = '999';
      ghost.style.pointerEvents = 'none';
      ghost.style.opacity = '0.85';
      ghost.style.left = (e.clientX - 22) + 'px';
      ghost.style.top = (e.clientY - 22) + 'px';
      document.body.appendChild(ghost);

      function clearHighlights(){
        document.querySelectorAll('.court-chip.drag-over').forEach(c=>c.classList.remove('drag-over'));
      }
      function move(ev){
        ghost.style.left = (ev.clientX - 22) + 'px';
        ghost.style.top = (ev.clientY - 22) + 'px';
        clearHighlights();
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const chip = target && target.closest('.court-chip');
        if(chip) chip.classList.add('drag-over');
      }
      function up(ev){
        document.removeEventListener('pointermove', move);
        ghost.remove();
        clearHighlights();
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const chip = target && target.closest('.court-chip');
        if(chip) substitutePlayer(benchPid, chip.dataset.pid);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up, { once:true });
    });
  }

  function substitutePlayer(benchPid, onCourtPid){
    const g = currentGame();
    if(!g || g.finished || benchPid===onCourtPid) return;
    const idx = g.onCourt.indexOf(onCourtPid);
    if(idx===-1) return;
    g.onCourt[idx] = benchPid;
    save();
    renderCourtMode();
  }

  function openStatModal(pid){
    const t = team(); const g = currentGame();
    const p = t.players.find(x=>x.id===pid);
    if(!p || !g) return;
    const s = g.stats[pid] || {};
    document.getElementById('court-modal-name').textContent = `#${p.num||'—'} ${p.name}`;
    document.getElementById('court-modal-line').textContent =
      `${s.pts||0} pontos · ${s.reb||0} rebotes · ${s.ast||0} assistências · ${s.stl||0} roubos · ${s.pf||0} faltas`;
    const statsEl = document.getElementById('court-modal-stats');
    statsEl.innerHTML = `
      <button class="stat-btn make" data-changes='{"pts":2}'>+2 pontos</button>
      <button class="stat-btn make" data-changes='{"pts":3,"fg3":1}'>+3 pontos</button>
      <button class="stat-btn make" data-changes='{"pts":1}'>+1 livre</button>
      <button class="stat-btn" data-changes='{"reb":1}'>+ rebote</button>
      <button class="stat-btn" data-changes='{"ast":1}'>+ assist.</button>
      <button class="stat-btn" data-changes='{"stl":1}'>+ roubo</button>
      <button class="stat-btn miss" data-changes='{"pf":1}' style="grid-column:1 / -1;">+ falta pessoal</button>
    `;
    statsEl.querySelectorAll('.stat-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        record(pid, JSON.parse(btn.dataset.changes));
        openStatModal(pid);
        renderCourtMode();
      });
    });
    document.getElementById('court-stat-modal').classList.add('open');
  }


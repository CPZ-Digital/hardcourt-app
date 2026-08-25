"use strict";
  const store = {
    read(){ try{ return JSON.parse(localStorage.getItem('hardcourt-data')||'{}'); }catch(e){ return {}; } },
    write(d){ try{ localStorage.setItem('hardcourt-data', JSON.stringify(d)); }catch(e){} }
  };

  const STAT_NAMES = { pts:'pontos', fg3:'cesta de 3', reb:'rebote', ast:'assistência', stl:'roubo de bola', pf:'falta' };

  // ponytail: lista única controla o formulário de ficha física e a exibição — trocar de esporte é só editar isto
  const ATTR_FIELDS = [
    { key:'position', label:'Posição', type:'select', options:['Armador','Ala-armador','Ala','Ala-pivô','Pivô'] },
    { key:'birthdate', label:'Nascimento', type:'date' },
    { key:'height', label:'Altura (cm)', type:'number' },
    { key:'weight', label:'Peso (kg)', type:'number' },
    { key:'wingspan', label:'Envergadura (cm)', type:'number' },
    { key:'vertical', label:'Impulsão vertical (cm)', type:'number' },
    { key:'sprint', label:'Velocidade 20m (s)', type:'number', step:'0.01' },
  ];
  function attrAge(birthdate){
    if(!birthdate) return null;
    const b = new Date(birthdate), now = new Date();
    let age = now.getFullYear()-b.getFullYear();
    if(now.getMonth()<b.getMonth() || (now.getMonth()===b.getMonth() && now.getDate()<b.getDate())) age--;
    return age;
  }

  let db = store.read();
  db.teams = db.teams || {};
  let currentTeamId = db.lastTeam && db.teams[db.lastTeam] ? db.lastTeam : null;
  let currentGameId = null;

  function save(){ store.write(db); }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function team(){ return currentTeamId ? db.teams[currentTeamId] : null; }

  function newTeam(name){
    const id = uid();
    db.teams[id] = { id, name, players: [], games: [] };
    currentTeamId = id; db.lastTeam = id;
    save(); renderAll();
  }

  // ---------- VIEWS ----------
  const views = document.querySelectorAll('.view');
  const navButtons = document.querySelectorAll('nav button[data-view], .more-item[data-view]');
  navButtons.forEach(b=>b.addEventListener('click',()=>{ switchView(b.dataset.view); closeMoreMenu(); }));

  const moreOverlay = document.getElementById('more-overlay');
  function openMoreMenu(){ moreOverlay.classList.add('open'); }
  function closeMoreMenu(){ moreOverlay.classList.remove('open'); }
  document.getElementById('btn-more-menu').addEventListener('click', openMoreMenu);
  document.getElementById('btn-close-more').addEventListener('click', closeMoreMenu);
  moreOverlay.addEventListener('click', e=>{ if(e.target===moreOverlay) closeMoreMenu(); });

  function switchView(name){
    views.forEach(v=>v.classList.toggle('active', v.id==='view-'+name));
    navButtons.forEach(b=>b.classList.toggle('active', b.dataset.view===name));
    if(name==='rankings') renderRankings();
    if(name==='games') renderGames();
    if(name==='scorer') renderScorer();
    if(name==='athlete'){ renderAthleteSelect(); renderAthlete(document.getElementById('athlete-select').value); }
    if(name==='champ') renderChamp();
  }

  // aba Campeonato só aparece na barra principal se já estiver vinculada a um campeonato (link ou sessão salva neste dispositivo)
  function hasAnyChampSession(){
    return Object.keys(localStorage).some(k=>k.startsWith('hardcourt-champ-session-'));
  }
  if(champCode() || hasAnyChampSession()){
    document.getElementById('nav-champ').style.display = '';
  }

  // ---------- TEAM SELECT ----------
  const teamSelect = document.getElementById('team-select');
  document.getElementById('btn-new-team').addEventListener('click', ()=>{
    const name = prompt('Nome do time:');
    if(name && name.trim()) newTeam(name.trim());
  });
  teamSelect.addEventListener('change', ()=>{
    currentTeamId = teamSelect.value || null;
    db.lastTeam = currentTeamId;
    save(); renderAll();
  });

  document.getElementById('btn-demo-data').addEventListener('click', loadDemoData);

  function loadDemoData(){
    const rosterA = [
      ['Lucas Ferreira',7,{position:'Armador',birthdate:'2001-03-14',height:188,weight:82,wingspan:193,vertical:58,sprint:2.98}],
      ['Bruno Alves',23,{position:'Ala',birthdate:'1999-07-22',height:198,weight:94,wingspan:205,vertical:64,sprint:3.05}],
      ['Rafael Souza',11,{position:'Ala-armador',birthdate:'2000-11-02',height:192,weight:88,wingspan:196,vertical:60,sprint:3.02}],
      ['Thiago Lima',5,{position:'Armador',birthdate:'2002-05-30',height:183,weight:78,wingspan:186,vertical:55,sprint:2.91}],
      ['Gustavo Rocha',44,{position:'Pivô',birthdate:'1998-01-18',height:208,weight:108,wingspan:218,vertical:52,sprint:3.4}],
      ['Caio Mendes',3,{position:'Ala',birthdate:'2002-08-19',height:195,weight:89,wingspan:199,vertical:59,sprint:3.01}],
      ['Vitor Barros',14,{position:'Pivô',birthdate:'1999-04-06',height:206,weight:105,wingspan:215,vertical:53,sprint:3.35}],
      ['Enzo Cardoso',8,{position:'Ala-armador',birthdate:'2003-01-27',height:189,weight:83,wingspan:192,vertical:57,sprint:2.96}],
    ];
    const rosterB = [
      ['Diego Martins',10,{position:'Armador',birthdate:'2000-09-09',height:186,weight:80,wingspan:190,vertical:57,sprint:2.95}],
      ['Fernando Costa',33,{position:'Ala-pivô',birthdate:'1999-02-14',height:203,weight:100,wingspan:212,vertical:56,sprint:3.2}],
      ['Marcelo Dias',9,{position:'Ala',birthdate:'2001-06-25',height:196,weight:90,wingspan:200,vertical:61,sprint:3.0}],
      ['Rodrigo Nunes',15,{position:'Ala-armador',birthdate:'2000-12-03',height:191,weight:86,wingspan:194,vertical:59,sprint:2.99}],
      ['André Pinto',21,{position:'Pivô',birthdate:'1997-10-11',height:210,weight:112,wingspan:220,vertical:50,sprint:3.45}],
      ['Felipe Rezende',6,{position:'Armador',birthdate:'2002-02-11',height:184,weight:77,wingspan:187,vertical:56,sprint:2.93}],
      ['Igor Barbosa',27,{position:'Ala',birthdate:'2000-05-16',height:197,weight:92,wingspan:201,vertical:60,sprint:3.03}],
      ['Nicolas Freitas',12,{position:'Pivô',birthdate:'1998-11-29',height:205,weight:103,wingspan:214,vertical:54,sprint:3.3}],
    ];

    function makeTeam(name, roster){
      const id = uid();
      const players = roster.map(([name,num,attrs])=>({ id: uid(), name, num: String(num), attrs: attrs||{} }));
      db.teams[id] = { id, name, players, games: [] };
      return db.teams[id];
    }

    const teamA = makeTeam('Águias FC', rosterA);
    const teamB = makeTeam('Furacão BC', rosterB);

    // jogo 1: Águias vs Furacão, com estatísticas variadas
    function makeGame(team, opponent, statLines, finished=true){
      const stats = {};
      const log = [];
      team.players.forEach((p,i)=>{
        const line = statLines[i] || {pts:0,reb:0,ast:0,fg3:0,stl:0};
        stats[p.id] = { pts: line.pts, reb: line.reb, ast: line.ast, fg3: line.fg3||0, stl: line.stl||0 };
        log.push({ pid:p.id, changes:{pts:line.pts}, ts: Date.now() });
      });
      const game = {
        id: uid(), opponent, date: new Date().toISOString(),
        finished, stats, log
      };
      team.games.push(game);
      return game;
    }

    makeGame(teamA, 'Furacão BC', [
      {pts:24,reb:6,ast:5,fg3:2,stl:2},
      {pts:18,reb:9,ast:2,fg3:1,stl:1},
      {pts:12,reb:3,ast:7,fg3:0,stl:3},
      {pts:9,reb:4,ast:1,fg3:1,stl:0},
      {pts:6,reb:11,ast:0,fg3:0,stl:1},
      {pts:8,reb:2,ast:3,fg3:0,stl:1},
      {pts:4,reb:8,ast:0,fg3:0,stl:0},
      {pts:11,reb:3,ast:4,fg3:1,stl:2},
    ]);
    makeGame(teamA, 'Tubarões SC', [
      {pts:16,reb:5,ast:8,fg3:1,stl:1},
      {pts:22,reb:7,ast:1,fg3:3,stl:0},
      {pts:14,reb:2,ast:4,fg3:2,stl:2},
      {pts:5,reb:6,ast:2,fg3:0,stl:1},
      {pts:8,reb:9,ast:1,fg3:0,stl:0},
      {pts:13,reb:4,ast:2,fg3:1,stl:1},
      {pts:2,reb:10,ast:0,fg3:0,stl:0},
      {pts:9,reb:3,ast:5,fg3:0,stl:1},
    ]);
    makeGame(teamA, 'Panteras BC', [
      {pts:19,reb:4,ast:6,fg3:2,stl:2},
      {pts:15,reb:8,ast:3,fg3:0,stl:0},
      {pts:10,reb:3,ast:5,fg3:1,stl:1},
      {pts:7,reb:5,ast:2,fg3:1,stl:0},
      {pts:5,reb:12,ast:1,fg3:0,stl:0},
      {pts:12,reb:3,ast:2,fg3:2,stl:2},
      {pts:6,reb:9,ast:0,fg3:0,stl:0},
      {pts:8,reb:2,ast:6,fg3:0,stl:3},
    ]);
    // jogo ainda em andamento — não deve entrar nas médias/ranking até ser encerrado
    makeGame(teamA, 'Cometas EC', [
      {pts:6,reb:2,ast:1,fg3:1,stl:0},
      {pts:4,reb:3,ast:0,fg3:0,stl:1},
      {pts:2,reb:1,ast:2,fg3:0,stl:0},
    ], false);

    makeGame(teamB, 'Águias FC', [
      {pts:20,reb:8,ast:3,fg3:2,stl:1},
      {pts:15,reb:4,ast:6,fg3:1,stl:2},
      {pts:11,reb:5,ast:2,fg3:0,stl:0},
      {pts:19,reb:3,ast:4,fg3:3,stl:1},
      {pts:7,reb:10,ast:1,fg3:0,stl:3},
      {pts:9,reb:2,ast:3,fg3:1,stl:0},
      {pts:6,reb:7,ast:0,fg3:0,stl:1},
      {pts:12,reb:3,ast:4,fg3:1,stl:2},
    ]);
    makeGame(teamB, 'Tubarões SC', [
      {pts:17,reb:6,ast:4,fg3:1,stl:2},
      {pts:12,reb:5,ast:5,fg3:0,stl:1},
      {pts:9,reb:4,ast:3,fg3:1,stl:0},
      {pts:21,reb:2,ast:6,fg3:3,stl:1},
      {pts:8,reb:11,ast:0,fg3:0,stl:0},
      {pts:10,reb:3,ast:2,fg3:1,stl:1},
      {pts:5,reb:8,ast:1,fg3:0,stl:0},
      {pts:13,reb:4,ast:3,fg3:2,stl:1},
    ]);

    currentTeamId = teamA.id;
    db.lastTeam = currentTeamId;
    save(); renderAll();
    switchView('rankings');
  }

  function renderTeamSelect(){
    const teams = Object.values(db.teams);
    teamSelect.innerHTML = teams.length
      ? teams.map(t=>`<option value="${t.id}" ${t.id===currentTeamId?'selected':''}>${escapeHtml(t.name)}</option>`).join('')
      : `<option value="">— nenhum time —</option>`;
    document.getElementById('team-tag').textContent = team() ? '— ' + team().name : '— sem time selecionado';
  }

  // ---------- ROSTER ----------
  document.getElementById('btn-add-player').addEventListener('click', ()=>{
    const t = team();
    if(!t){ alert('Crie ou selecione um time primeiro.'); return; }
    const name = document.getElementById('player-name').value.trim();
    const num = document.getElementById('player-num').value.trim() || '—';
    if(!name) return;
    t.players.push({ id: uid(), name, num, attrs:{} });
    document.getElementById('player-name').value = '';
    document.getElementById('player-num').value = '';
    save(); renderRoster();
  });

  let openAttrsPid = null;

  function renderRoster(){
    const t = team();
    const list = document.getElementById('roster-list');
    if(!t || !t.players.length){
      list.innerHTML = `<div class="empty">Nenhum jogador cadastrado ainda.</div>`;
      return;
    }
    list.innerHTML = t.players.map(p=>{
      p.attrs = p.attrs || {};
      const open = openAttrsPid === p.id;
      return `
      <div>
        <div class="roster-row">
          <span class="jersey">${escapeHtml(p.num)}</span>
          <span class="name">${escapeHtml(p.name)}</span>
          <button data-pid="${p.id}" class="icon-btn attrs btn-toggle-attrs ${open?'open':''}" title="${open?'Fechar ficha física':'Ficha física'}">
            <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="1.5"></rect><path d="M9 3h6v2.5a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V3z"></path><line x1="8" y1="10.5" x2="16" y2="10.5"></line><line x1="8" y1="14" x2="16" y2="14"></line><line x1="8" y1="17.5" x2="13" y2="17.5"></line></svg>
          </button>
          <button data-pid="${p.id}" class="icon-btn danger btn-remove-player" title="Remover jogador">
            <svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>
          </button>
        </div>
        ${open ? `
        <div class="panel" style="margin:6px 0 0;padding:14px;">
          <div class="row" style="gap:12px;">
            ${ATTR_FIELDS.map(f=>`
              <div class="field" style="min-width:150px;flex:1;margin:0;">
                <label>${f.label}</label>
                ${f.type==='select'
                  ? `<select data-pid="${p.id}" data-attr="${f.key}" class="attr-input">
                      <option value="">—</option>
                      ${f.options.map(o=>`<option value="${o}" ${p.attrs[f.key]===o?'selected':''}>${o}</option>`).join('')}
                     </select>`
                  : `<input type="${f.type}" step="${f.step||'1'}" data-pid="${p.id}" data-attr="${f.key}" class="attr-input" value="${p.attrs[f.key]||''}">`
                }
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>`;
    }).join('');
    list.querySelectorAll('.btn-remove-player').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        t.players = t.players.filter(p=>p.id!==btn.dataset.pid);
        save(); renderRoster();
      });
    });
    list.querySelectorAll('.btn-toggle-attrs').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        openAttrsPid = openAttrsPid === btn.dataset.pid ? null : btn.dataset.pid;
        renderRoster();
      });
    });
    list.querySelectorAll('.attr-input').forEach(input=>{
      input.addEventListener('change', ()=>{
        const p = t.players.find(x=>x.id===input.dataset.pid);
        if(!p) return;
        p.attrs = p.attrs || {};
        p.attrs[input.dataset.attr] = input.value;
        save();
      });
    });
  }

  // ---------- GAMES ----------
  document.getElementById('btn-start-game').addEventListener('click', ()=>{
    const t = team();
    if(!t){ alert('Crie ou selecione um time primeiro.'); return; }
    if(!t.players.length){ alert('Cadastre jogadores no elenco antes de iniciar um jogo.'); return; }
    const opp = document.getElementById('opponent-name').value.trim() || 'Adversário';
    const game = {
      id: uid(), opponent: opp, date: new Date().toISOString(),
      finished: false,
      stats: Object.fromEntries(t.players.map(p=>[p.id,{pts:0,reb:0,ast:0,fg3:0,stl:0,pf:0}])),
      onCourt: t.players.slice(0,5).map(p=>p.id),
      log: []
    };
    t.games.push(game);
    currentGameId = game.id;
    document.getElementById('opponent-name').value = '';
    save(); renderGames(); switchView('scorer');
  });

  function renderGames(){
    const t = team();
    const list = document.getElementById('games-list');
    if(!t || !t.games.length){
      list.innerHTML = `<div class="empty">Nenhum jogo registrado ainda.</div>`;
      return;
    }
    list.innerHTML = t.games.slice().reverse().map(g=>{
      const total = Object.values(g.stats).reduce((s,x)=>s+x.pts,0);
      const d = new Date(g.date);
      return `<div class="roster-row">
        <span class="name">vs ${escapeHtml(g.opponent)} <span style="color:var(--ink-dim);">· ${d.toLocaleDateString('pt-BR')}</span></span>
        <span class="num" style="color:var(--ink-dim);font-size:12.5px;">${total} pts ${g.finished?'· encerrado':'· em andamento'}</span>
        <button data-gid="${g.id}" class="btn-open-game" style="color:var(--accent-ink);">${g.finished?'ver':'continuar'}</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.btn-open-game').forEach(btn=>{
      btn.addEventListener('click', ()=>{ currentGameId = btn.dataset.gid; switchView('scorer'); });
    });
  }


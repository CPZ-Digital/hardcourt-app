"use strict";
  // ---------- RANKINGS ----------
  // ponytail: cada categoria define suas colunas (média + total) — marcar filtros mostra só essas colunas; nenhum filtro = ranking geral com tudo
  const RANKING_CATEGORIES = [
    { key:'pontos', label:'Pontos', cols:[
      {key:'ppg', label:'PPG', title:'Pontos por jogo'},
      {key:'pts', label:'Pontos', title:'Pontos na temporada'},
    ]},
    { key:'rebotes', label:'Rebotes', cols:[
      {key:'rpg', label:'RPG', title:'Rebotes por jogo'},
      {key:'reb', label:'Rebotes', title:'Rebotes na temporada'},
    ]},
    { key:'assistencias', label:'Assistências', cols:[
      {key:'apg', label:'APG', title:'Assistências por jogo'},
      {key:'ast', label:'Assist.', title:'Assistências na temporada'},
    ]},
    { key:'roubos', label:'Roubos de bola', cols:[
      {key:'spg', label:'SPG', title:'Roubos de bola por jogo'},
      {key:'stl', label:'Roubos', title:'Roubos de bola na temporada'},
    ]},
    { key:'tresp', label:'Cestas de 3', cols:[
      {key:'fg3', label:'3PM', title:'Cestas de 3 pontos convertidas'},
    ]},
  ];
  const rankingFilters = new Set();
  let sortKey = 'ppg';

  const filtersBar = document.getElementById('ranking-filters');
  filtersBar.innerHTML = RANKING_CATEGORIES.map(c=>`<button type="button" class="filter-chip" data-cat="${c.key}">${c.label}</button>`).join('');
  filtersBar.querySelectorAll('.filter-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const cat = chip.dataset.cat;
      rankingFilters.has(cat) ? rankingFilters.delete(cat) : rankingFilters.add(cat);
      chip.classList.toggle('active', rankingFilters.has(cat));
      renderRankings();
    });
  });

  function visibleCategories(){
    return rankingFilters.size ? RANKING_CATEGORIES.filter(c=>rankingFilters.has(c.key)) : RANKING_CATEGORIES;
  }

  function renderRankings(){
    const t = team();
    const tbody = document.getElementById('rankings-body');
    const thead = document.getElementById('rankings-head');
    const cats = visibleCategories();
    const cols = cats.flatMap(c=>c.cols);
    if(!cols.some(c=>c.key===sortKey)) sortKey = cols[0].key;

    thead.innerHTML = `<tr>
      <th>#</th><th>Jogador</th>
      <th class="sortable" data-key="gp" title="Jogos disputados">Jogos</th>
      ${cols.map(c=>`<th class="sortable ${c.key===sortKey?'active':''}" data-key="${c.key}" title="${c.title}">${c.label}</th>`).join('')}
    </tr>`;
    thead.querySelectorAll('th.sortable').forEach(th=>{
      th.addEventListener('click', ()=>{ sortKey = th.dataset.key; renderRankings(); });
    });

    if(!t || !t.players.length){
      tbody.innerHTML = `<tr><td colspan="${cols.length+3}" class="empty">Sem dados ainda — jogue uma partida na aba Súmula.</td></tr>`;
      return;
    }
    const rows = t.players.map(p=>{
      const games = t.games.filter(g=>g.stats[p.id] && g.finished);
      const gp = games.length;
      const totals = games.reduce((acc,g)=>{
        const s = g.stats[p.id];
        acc.pts += s.pts; acc.reb += s.reb; acc.ast += s.ast;
        acc.fg3 += s.fg3||0; acc.stl += s.stl||0;
        return acc;
      },{pts:0,reb:0,ast:0,fg3:0,stl:0});
      const div = gp || 1;
      return {
        id: p.id, name: p.name, num: p.num, gp,
        pts: totals.pts, reb: totals.reb, ast: totals.ast, fg3: totals.fg3, stl: totals.stl,
        ppg: totals.pts/div, rpg: totals.reb/div, apg: totals.ast/div, spg: totals.stl/div
      };
    }).sort((a,b)=> b[sortKey]-a[sortKey]);

    const isRate = k => ['ppg','rpg','apg','spg'].includes(k);
    tbody.innerHTML = rows.map((r,i)=>`
      <tr class="athlete-row" data-pid="${r.id}" style="cursor:pointer;">
        <td class="rank-num">${i+1}</td>
        <td>${escapeHtml(r.name)} <span style="color:var(--ink-dim);">#${escapeHtml(r.num)}</span></td>
        <td>${r.gp}</td>
        ${cols.map(c=>`<td>${isRate(c.key) ? r[c.key].toFixed(1) : r[c.key]}</td>`).join('')}
      </tr>`).join('');
    tbody.querySelectorAll('.athlete-row').forEach(tr=>{
      tr.addEventListener('click', ()=>{
        switchView('athlete');
        document.getElementById('athlete-select').value = tr.dataset.pid;
        renderAthlete(tr.dataset.pid);
      });
    });
  }


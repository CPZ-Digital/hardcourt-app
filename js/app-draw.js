"use strict";
  // ---------- TEAM DRAW ----------
  // estatística que o sorteio balanceado usa pra medir "desempenho" — antes só tinha pontos (PPG),
  // agora dá pra escolher rebote/assistência/roubo também (pedido explícito).
  const DRAW_STATS = {
    ppg: { key:'pts', label:'pts/jogo' },
    rpg: { key:'reb', label:'reb/jogo' },
    apg: { key:'ast', label:'ast/jogo' },
    spg: { key:'stl', label:'roubos/jogo' },
  };
  document.getElementById('btn-draw').addEventListener('click', ()=>{
    const t = team();
    if(!t || t.players.length < 2){ alert('Cadastre pelo menos 2 jogadores no elenco.'); return; }
    const count = Math.max(2, Math.min(6, Number(document.getElementById('draw-count').value) || 2));
    const balance = document.getElementById('draw-balance').checked;
    const statChoice = DRAW_STATS[document.getElementById('draw-stat').value] || DRAW_STATS.ppg;

    const withAvg = t.players.map(p=>{
      const games = t.games.filter(g=>g.stats[p.id] && g.finished);
      const gp = games.length || 1;
      const total = games.reduce((s,g)=>s+(g.stats[p.id][statChoice.key]||0),0);
      return { ...p, avg: total/gp };
    });

    const pool = balance
      ? withAvg.slice().sort((a,b)=> b.avg - a.avg)
      : shuffle(withAvg.slice());

    const teams = Array.from({length:count}, ()=>[]);
    if(balance){
      // snake draft: distribui do melhor pro pior alternando direção, pra equilibrar o nível médio de cada time
      let dir = 1, idx = 0;
      pool.forEach(p=>{
        teams[idx].push(p);
        idx += dir;
        if(idx===count){ idx=count-1; dir=-1; }
        else if(idx<0){ idx=0; dir=1; }
      });
    } else {
      pool.forEach((p,i)=> teams[i%count].push(p));
    }

    const result = document.getElementById('draw-result');
    result.innerHTML = teams.map((squad,i)=>{
      const avg = squad.length ? (squad.reduce((s,p)=>s+p.avg,0)/squad.length).toFixed(1) : '0.0';
      return `<div class="panel" style="margin-bottom:12px;">
        <div class="eyebrow">Time ${i+1} · média ${avg} ${statChoice.label}</div>
        <div class="roster-list">
          ${squad.map(p=>`<div class="roster-row"><span class="jersey">${escapeHtml(p.num)}</span><span class="name">${escapeHtml(p.name)}</span></div>`).join('')}
        </div>
      </div>`;
    }).join('');
  });

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }

  function renderAll(){
    renderTeamSelect(); renderRoster(); renderGames(); renderScorer(); renderRankings(); renderAthleteSelect();
  }

  renderAll();


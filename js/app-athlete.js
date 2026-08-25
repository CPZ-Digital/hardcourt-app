"use strict";
  // ---------- ATHLETE PROFILE ----------
  const athleteSelect = document.getElementById('athlete-select');
  athleteSelect.addEventListener('change', ()=> renderAthlete(athleteSelect.value));

  function renderAthleteSelect(){
    const t = team();
    athleteSelect.innerHTML = (t && t.players.length)
      ? t.players.map(p=>`<option value="${p.id}">#${escapeHtml(p.num)} ${escapeHtml(p.name)}</option>`).join('')
      : `<option value="">— sem atletas —</option>`;
  }

  function renderAthlete(pid){
    const t = team();
    const body = document.getElementById('athlete-body');
    const p = t && t.players.find(x=>x.id===pid);
    if(!p){
      body.innerHTML = `<div class="empty">Selecione um atleta pra ver a ficha.</div>`;
      return;
    }
    const games = t.games.filter(g=>g.stats[p.id]).slice().reverse();
    const finished = games.filter(g=>g.finished);
    const totals = finished.reduce((acc,g)=>{
      const s = g.stats[p.id];
      acc.pts+=s.pts; acc.reb+=s.reb; acc.ast+=s.ast; acc.fg3+=s.fg3||0; acc.stl+=s.stl||0;
      return acc;
    },{pts:0,reb:0,ast:0,fg3:0,stl:0});
    const gp = finished.length || 1;

    const metrics = [
      ['Pontos por jogo', (totals.pts/gp).toFixed(1)],
      ['Rebotes por jogo', (totals.reb/gp).toFixed(1)],
      ['Assistências por jogo', (totals.ast/gp).toFixed(1)],
      ['Roubos por jogo', (totals.stl/gp).toFixed(1)],
      ['Cestas de 3 na temporada', totals.fg3],
      ['Jogos disputados', finished.length],
    ];

    const attrs = p.attrs || {};
    const age = attrAge(attrs.birthdate);
    const combine = [
      ['Posição', attrs.position || '—'],
      ['Idade', age!=null ? age+' anos' : '—'],
      ['Altura', attrs.height ? attrs.height+' cm' : '—'],
      ['Peso', attrs.weight ? attrs.weight+' kg' : '—'],
      ['Envergadura', attrs.wingspan ? attrs.wingspan+' cm' : '—'],
      ['Impulsão vertical', attrs.vertical ? attrs.vertical+' cm' : '—'],
      ['Velocidade 20m', attrs.sprint ? attrs.sprint+' s' : '—'],
    ];

    body.innerHTML = `
      <div class="row" style="margin-bottom:20px;">
        <span class="jersey" style="width:44px;height:44px;font-size:18px;">${escapeHtml(p.num)}</span>
        <div>
          <div class="display" style="font-size:22px;">${escapeHtml(p.name)}</div>
          <div style="color:var(--ink-dim);font-family:'JetBrains Mono';font-size:11px;">${escapeHtml(t.name)}</div>
        </div>
      </div>
      <div class="eyebrow">Ficha física</div>
      <div class="table-wrap" style="margin-bottom:22px;">
        <table>
          <thead><tr>${combine.map(([label])=>`<th>${label}</th>`).join('')}</tr></thead>
          <tbody><tr>${combine.map(([,val])=>`<td class="num" style="font-family:'Rajdhani';font-size:15px;font-weight:600;">${val}</td>`).join('')}</tr></tbody>
        </table>
      </div>
      <div class="eyebrow">Desempenho</div>
      <div class="oncourt" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:22px;">
        ${metrics.map(([label,val])=>`
          <div class="player-card" style="text-align:center;">
            <div class="num" style="font-size:26px;color:var(--accent);text-shadow:0 0 14px color-mix(in srgb, var(--accent) 45%, transparent);">${val}</div>
            <div style="font-family:'JetBrains Mono';font-size:10px;color:var(--ink-dim);text-transform:uppercase;letter-spacing:0.03em;margin-top:4px;">${label}</div>
          </div>`).join('')}
      </div>
      <div class="eyebrow">Evolução na temporada</div>
      <div class="panel" style="margin-bottom:16px;padding:14px;">
        <canvas id="athlete-chart" style="width:100%;height:220px;display:block;"></canvas>
        <div class="row" id="chart-legend" style="margin-top:10px;gap:18px;font-family:'JetBrains Mono';font-size:10.5px;color:var(--ink-dim);">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;">
            <input type="checkbox" class="chart-toggle" data-series="pts" checked style="width:auto;accent-color:var(--accent);">
            <span style="display:inline-block;width:9px;height:9px;background:var(--accent);"></span>pontos
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;">
            <input type="checkbox" class="chart-toggle" data-series="reb" checked style="width:auto;accent-color:var(--make);">
            <span style="display:inline-block;width:9px;height:9px;background:var(--make);"></span>rebotes
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;">
            <input type="checkbox" class="chart-toggle" data-series="ast" checked style="width:auto;accent-color:var(--court);">
            <span style="display:inline-block;width:9px;height:9px;background:var(--court);"></span>assistências
          </label>
        </div>
      </div>
      <div class="eyebrow">Histórico de jogos</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Adversário</th><th>Pontos</th><th title="Cestas de 3 pontos">3PM</th><th>Rebotes</th><th>Assist.</th><th>Roubos</th></tr></thead>
          <tbody>
            ${games.length ? games.map(g=>{
              const s = g.stats[p.id];
              return `<tr>
                <td>${new Date(g.date).toLocaleDateString('pt-BR')}</td>
                <td>vs ${escapeHtml(g.opponent)} ${g.finished?'':'<span style=\"color:var(--accent);\">· em andamento</span>'}</td>
                <td>${s.pts}</td><td>${s.fg3||0}</td><td>${s.reb}</td><td>${s.ast}</td><td>${s.stl||0}</td>
              </tr>`;
            }).join('') : `<tr><td colspan="7" class="empty">Nenhum jogo registrado.</td></tr>`}
          </tbody>
        </table>
      </div>`;

    currentChartGames = games.slice().reverse();
    currentChartPid = p.id;
    document.querySelectorAll('.chart-toggle').forEach(cb=>{
      cb.onchange = ()=> drawAthleteChart(currentChartGames, currentChartPid);
    });
    drawAthleteChart(currentChartGames, currentChartPid);
  }

  let currentChartGames = [], currentChartPid = null;

  function drawAthleteChart(gamesChrono, pid){
    const canvas = document.getElementById('athlete-chart');
    if(!canvas || !gamesChrono.length) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = 220;
    canvas.width = w*dpr; canvas.height = h*dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,w,h);

    const active = {};
    document.querySelectorAll('.chart-toggle').forEach(cb=>{ active[cb.dataset.series] = cb.checked; });

    const series = { pts: [], reb: [], ast: [] };
    gamesChrono.forEach(g=>{
      const s = g.stats[pid];
      series.pts.push(s.pts); series.reb.push(s.reb); series.ast.push(s.ast);
    });
    const activeVals = Object.keys(series).filter(k=>active[k]).flatMap(k=>series[k]);
    const maxVal = Math.max(1, ...(activeVals.length ? activeVals : [0]));
    const padL = 28, padB = 20, padT = 10, padR = 10;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const n = gamesChrono.length;
    const stepX = n>1 ? plotW/(n-1) : 0;

    const styles = getComputedStyle(document.documentElement);
    const gridColor = styles.getPropertyValue('--line').trim();
    const dimColor = styles.getPropertyValue('--ink-dim').trim();

    ctx.strokeStyle = gridColor; ctx.lineWidth = 1; ctx.font = '10px JetBrains Mono, monospace'; ctx.fillStyle = dimColor;
    for(let i=0;i<=4;i++){
      const y = padT + plotH - (plotH*i/4);
      ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(w-padR,y); ctx.stroke();
      ctx.fillText(Math.round(maxVal*i/4), 2, y+3);
    }

    if(!activeVals.length){
      ctx.fillStyle = dimColor; ctx.font = '12px JetBrains Mono, monospace';
      ctx.fillText('Nenhuma série selecionada', padL, padT + plotH/2);
      return;
    }

    function plot(vals, color){
      ctx.beginPath();
      vals.forEach((v,i)=>{
        const x = padL + stepX*i;
        const y = padT + plotH - (plotH*v/maxVal);
        i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      });
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      vals.forEach((v,i)=>{
        const x = padL + stepX*i;
        const y = padT + plotH - (plotH*v/maxVal);
        ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fillStyle = color; ctx.fill();
      });
    }
    if(active.reb) plot(series.reb, styles.getPropertyValue('--make').trim());
    if(active.ast) plot(series.ast, styles.getPropertyValue('--court').trim());
    if(active.pts) plot(series.pts, styles.getPropertyValue('--accent').trim());
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.getElementById('btn-export-pdf').addEventListener('click', ()=>{
    if(!athleteSelect.value){ alert('Selecione um atleta primeiro.'); return; }
    document.body.classList.add('print-athlete');
    window.print();
    document.body.classList.remove('print-athlete');
  });


  const state = loadState();
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || 'waterside-5122';
  const listing = LISTINGS.find(l => l.id === id) || LISTINGS[0];

  document.getElementById('addr').textContent = listing.addr;
  document.getElementById('price').textContent = fmtPrice(listing.price);
  document.getElementById('freeHero').style.backgroundImage = `url('${listing.img}')`;

  // ---------- Guided Tour ----------
  // 4 stops. Each references profile via whyLineForDim.
  // Personalized WHY per stop selects a profile dim if available.
  const topProfileDims = topDims(state, 5).map(e => e.dim);
  function pickDim(preferred) {
    // if any of preferred is in top profile dims, use it; else return preferred[0]
    for (const d of preferred) if (topProfileDims.includes(d)) return { dim: d, personalized: true };
    return { dim: preferred[0], personalized: false };
  }
  function whyFor(dim, personalized, stopContext) {
    const e = state.profile.find(x => x.dim === dim);
    const count = e ? e.evidence_count : 0;
    if (personalized && count >= 2) {
      return `You've picked <b>${count}</b> places tied to ${DIMS[dim].label}. ${stopContext}`;
    }
    if (personalized && count >= 1) {
      return `You've started signaling interest in ${DIMS[dim].label}. ${stopContext}`;
    }
    return `${stopContext} — this is a feature many buyers care about; we'll personalize as we learn you.`;
  }

  const STOPS = [
    {
      key: 'kitchen',
      img: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=70',
      title: 'The kitchen island',
      dimPref: ['entertaining', 'move_in', 'family'],
      ctx: "The island seats 4 and opens directly to the dining and porch — this is the entertaining anchor of the house.",
      actions: ['why_this_matters', 'compare', 'save_feature', 'ask_ai'],
    },
    {
      key: 'porch',
      img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=70',
      title: 'Screened porch to the backyard',
      dimPref: ['outdoors', 'entertaining'],
      ctx: "Screened porch flows to a flat lawn — outdoor gathering space you can actually use in NC humidity.",
      actions: ['why_this_matters', 'compare', 'save_feature', 'ask_ai'],
    },
    {
      key: 'trail',
      img: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=1200&q=70',
      title: 'Bolin Creek trail access',
      dimPref: ['trails', 'outdoors'],
      ctx: "The lot backs onto Bolin Creek Trail — 4.2mi greenway, 6 minutes walking from your back gate.",
      actions: ['why_this_matters', 'compare', 'save_feature', 'ask_ai'],
    },
    {
      key: 'neighborhood',
      img: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=70',
      title: 'Waterside itself',
      dimPref: ['schools', 'quiet', 'family'],
      ctx: "Cul-de-sac street, Ephesus Elementary 4 minutes by car, no through traffic.",
      actions: ['why_this_matters', 'compare', 'save_feature', 'ask_ai'],
    },
  ];

  let stopIdx = 0;
  const $guided = document.getElementById('guided');
  const $transition = document.getElementById('transition');
  const $free = document.getElementById('free');

  function renderStop() {
    const s = STOPS[stopIdx];
    const { dim, personalized } = pickDim(s.dimPref);
    const why = whyFor(dim, personalized, s.ctx);
    $guided.innerHTML = `
      <div class="progress">Guided Tour · Stop ${stopIdx+1} of ${STOPS.length}</div>
      <div class="stop">
        <div class="hero" style="background-image:url('${s.img}')">
          <div class="stop-tag">Stop ${stopIdx+1} / ${STOPS.length}</div>
        </div>
        <div class="body">
          <div class="why"><b>Why for you:</b> ${why}</div>
          <h2>${s.title}</h2>
          <div class="hotspot-actions">
            ${s.actions.map(a => `<button data-a="${a}" data-dim="${dim}" data-key="${s.key}">${actionLabel(a)}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="tour-nav">
        ${stopIdx>0 ? '<button id="prev">← Prev</button>' : ''}
        <button id="next" class="primary">${stopIdx+1===STOPS.length ? 'Finish tour →' : 'Next stop →'}</button>
      </div>
    `;
    $guided.querySelectorAll('.hotspot-actions button').forEach(b => {
      b.onclick = () => onHotspotAction(b.dataset.a, b.dataset.dim, b.dataset.key, s.title);
    });
    const nxt = document.getElementById('next');
    const prv = document.getElementById('prev');
    if (prv) prv.onclick = () => { stopIdx--; renderStop(); };
    nxt.onclick = () => {
      if (stopIdx+1 < STOPS.length) { stopIdx++; renderStop(); }
      else showTransition();
    };
  }

  function actionLabel(a) {
    return ({
      why_this_matters: '💡 Why this matters',
      compare: '📊 Compare similar homes',
      save_feature: '⭐ Save this feature',
      ask_ai: '💬 Ask AI',
      renovation_estimate: '🔨 Reno estimate',
    })[a] || a;
  }

  function onHotspotAction(a, dim, key, title) {
    if (a === 'save_feature') {
      bumpDim(state, dim, 1);
      if (!state.saved.includes(listing.id + '#' + key)) state.saved.push(listing.id + '#' + key);
      saveState(state);
      flashToast(`Saved “${title}” — profile updated (${dim})`);
    } else if (a === 'why_this_matters') {
      flashToast(`This connects to your ${DIMS[dim].label} signal.`);
    } else if (a === 'compare') {
      flashToast(`In ${listing.community}, ~72% of listings have this feature.`);
    } else if (a === 'ask_ai') {
      flashToast(`(AI stub) Ask about ${title}: try "What's the maintenance like?"`);
    }
  }

  function showTransition() {
    $guided.style.display = 'none';
    $transition.style.display = 'block';
    const dims = topDims(state, 2).map(e => DIMS[e.dim].label);
    document.getElementById('learned').textContent =
      dims.length ? `you care about ${dims.join(' and ')}.` : `you're still exploring — swipe more and we'll dial in.`;
    document.getElementById('continue-btn').onclick = () => {
      $transition.style.display = 'none';
      $free.classList.add('on');
      renderFree();
      window.scrollTo(0,0);
    };
  }

  // ---------- Free Explore ----------
  // 6 hotspots. Pins on hero + section list. Tap opens sheet.
  const HOTSPOTS = [
    { key:'kitchen',    x:22, y:60, title:'Kitchen island',        dims:['entertaining','move_in'] },
    { key:'porch',      x:70, y:40, title:'Screened porch',        dims:['outdoors','entertaining'] },
    { key:'backyard',   x:55, y:80, title:'Flat backyard',         dims:['outdoors','family'] },
    { key:'primary',    x:35, y:25, title:'Primary suite',         dims:['space','move_in'] },
    { key:'trail',      x:85, y:70, title:'Trail access at rear',  dims:['trails','outdoors'] },
    { key:'school',     x:12, y:22, title:'Ephesus Elementary',    dims:['schools','family'] },
  ];

  function renderFree() {
    const hero = document.getElementById('freeHero');
    // clear old pins
    [...hero.querySelectorAll('.hotspot-pin')].forEach(n => n.remove());
    HOTSPOTS.forEach((h, i) => {
      const p = document.createElement('div');
      p.className = 'hotspot-pin';
      p.style.left = h.x + '%'; p.style.top = h.y + '%';
      p.textContent = (i+1);
      p.onclick = () => openSheet(h);
      hero.appendChild(p);
    });
    document.getElementById('freeSections').innerHTML = HOTSPOTS.map((h,i) => `
      <div class="stop">
        <div class="body">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <span style="background:var(--accent);color:#000;font-weight:700;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;">${i+1}</span>
            <h2 style="margin:0;">${h.title}</h2>
          </div>
          <div style="font-size:13px;color:var(--muted);">${sectionSummary(h)}</div>
          <button style="margin-top:10px;background:var(--accent);color:#000;border:none;padding:10px 14px;border-radius:10px;font-weight:600;cursor:pointer;" onclick='openSheet(${JSON.stringify(h)})'>Open actions →</button>
        </div>
      </div>
    `).join('');
  }

  function sectionSummary(h) {
    const dim = h.dims.find(d => topDims(state,5).some(e => e.dim === d)) || h.dims[0];
    return `Tied to ${DIMS[dim].label}.`;
  }

  window.openSheet = function(h) {
    const dim = h.dims.find(d => topDims(state,5).some(e => e.dim === d)) || h.dims[0];
    const e = state.profile.find(x => x.dim === dim);
    const count = e ? e.evidence_count : 0;
    document.getElementById('sheetTitle').textContent = h.title;
    document.getElementById('sheetWhy').innerHTML = count >= 2
      ? `You've signaled ${count}× interest in ${DIMS[dim].label} — this feature ties to that.`
      : `This feature ties to ${DIMS[dim].label}. We'll personalize more as we learn you.`;
    const actions = ['why_this_matters', 'compare', 'save_feature', 'ask_ai'];
    document.getElementById('sheetActions').innerHTML = actions.map(a =>
      `<button data-a="${a}">${actionLabel(a)}</button>`).join('');
    [...document.getElementById('sheetActions').querySelectorAll('button')].forEach(b => {
      b.onclick = () => onHotspotAction(b.dataset.a, dim, h.key, h.title);
    });
    document.getElementById('sheetBg').classList.add('on');
    document.getElementById('sheet').classList.add('on');
  };
  window.closeSheet = function() {
    document.getElementById('sheetBg').classList.remove('on');
    document.getElementById('sheet').classList.remove('on');
  };

  // ---- toast ----
  function flashToast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#000;color:#fff;padding:10px 16px;border-radius:999px;z-index:100;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,0.5);max-width:90%;text-align:center;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._to);
    t._to = setTimeout(() => t.style.opacity = '0', 1800);
    t.style.transition = 'opacity 0.4s';
  }

  renderStop();

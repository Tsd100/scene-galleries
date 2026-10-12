(function () {
  'use strict';
  const scenes = window.MONONOKE_SCENES;
  const byId = new Map(scenes.map(s => [s.id, s]));
  const $ = id => document.getElementById(id);
  const chapters = [...new Set(scenes.map(s => s.chapter))];
  let current = byId.get(location.hash.slice(1)) || byId.get('08');
  let tour = false, timer = null, fadeTimer = null, motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previousFocus = null;
  const sceneImage = $('sceneImage');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

  function nextId(delta) { return scenes[(scenes.findIndex(s => s.id === current.id) + delta + scenes.length) % scenes.length].id; }
  function stopTour() { tour = false; clearTimeout(timer); timer = null; $('tourButton').setAttribute('aria-pressed', 'false'); $('tourButton').textContent = '▷ 自动巡游'; }
  function scheduleTour() { clearTimeout(timer); if (tour && !document.hidden && $('directory').hidden) timer = setTimeout(() => show(nextId(1), false), 23000); }
  function preload() { for (const id of [nextId(-1),nextId(1)]) { const img = new Image(); img.src = byId.get(id).image; } }
  function paint() {
    $('chapterLabel').textContent = `${['第一章','第二章','第三章','第四章'][chapters.indexOf(current.chapter)]} · ${current.chapter}`;
    $('sceneChapter').textContent = current.chapter;
    $('sceneTitle').textContent = current.title;
    $('sceneDescription').textContent = current.description;
    $('sceneNumber').textContent = `${current.id} / 16`;
    $('progressNumber').textContent = current.id;
    $('progressFill').style.width = `${Number(current.id) / 16 * 100}%`;
    document.title = `${current.title} · 幽灵公主`;
    const hotspots = $('hotspots'); const mobile = $('mobileDestinations');
    hotspots.replaceChildren(); mobile.replaceChildren();
    for (const h of current.hotspots) {
      const destination = byId.get(h.to);
      const label = `${h.label} · ${destination.title}`;
      const button = document.createElement('button');
      button.className = 'hotspot'; button.type = 'button'; button.style.left = `${h.x}%`; button.style.top = `${h.y}%`;
      button.setAttribute('aria-label', label); button.innerHTML = '<span class="dot" aria-hidden="true"></span><strong></strong>';
      button.querySelector('strong').textContent = destination.title;
      button.title = label; button.addEventListener('click', () => show(h.to, true)); hotspots.append(button);
      const mobileButton = document.createElement('button'); mobileButton.type = 'button'; mobileButton.textContent = `前往 ${destination.title} →`;
      mobileButton.addEventListener('click', () => show(h.to, true)); mobile.append(mobileButton);
    }
    document.querySelectorAll('.scene-card').forEach(card => card.classList.toggle('active',card.dataset.id===current.id));
    preload(); scheduleTour();
  }
  function show(id, manual = true) {
    const target = byId.get(id); if (!target) return;
    if (manual) stopTour();
    clearTimeout(fadeTimer); current = target; history.replaceState(null, '', `#${id}`);
    const swap = () => { sceneImage.src = current.image; sceneImage.alt = `${current.title}：${current.description}`; sceneImage.style.objectPosition = current.id === '04' ? '42% center' : 'center'; $('imageError').hidden = true; paint(); requestAnimationFrame(() => sceneImage.classList.remove('fading')); };
    if (motion && sceneImage.complete && sceneImage.naturalWidth) { sceneImage.classList.add('fading'); fadeTimer = setTimeout(swap, 260); } else swap();
  }
  function makeDirectory() {
    const content = $('directoryContent');
    for (const chapter of chapters) {
      const group = document.createElement('section'); group.className = 'chapter-group';
      const heading = document.createElement('h3'); heading.textContent = `${['第一章','第二章','第三章','第四章'][chapters.indexOf(chapter)]} · ${chapter}`;
      const grid = document.createElement('div'); grid.className = 'scene-grid';
      for (const scene of scenes.filter(s => s.chapter === chapter)) {
        const card = document.createElement('button'); card.type = 'button'; card.className = 'scene-card'; card.dataset.id = scene.id;
        const image = document.createElement('img'); image.src = scene.thumb; image.alt = ''; image.loading = 'lazy';
        const caption = document.createElement('span'); caption.innerHTML = `<em>${scene.id}</em>`; caption.append(document.createTextNode(scene.title));
        card.append(image,caption); card.addEventListener('click', () => { closeDirectory(); show(scene.id,true); }); grid.append(card);
      }
      group.append(heading,grid); content.append(group);
    }
  }
  function syncMotionControl() {
    const label = motion ? '暂停环境动效' : '开启环境动效';
    $('motionButton').setAttribute('aria-label', label);
    $('motionButton').title = label;
  }
  function openDirectory() {
    previousFocus = document.activeElement;
    document.querySelector('.topbar').inert = true;
    document.querySelector('.shell').inert = true;
    $('directory').hidden = false;
    scheduleTour();
    $('closeDirectory').focus();
  }
  function closeDirectory() {
    $('directory').hidden = true;
    document.querySelector('.topbar').inert = false;
    document.querySelector('.shell').inert = false;
    scheduleTour();
    previousFocus?.focus();
  }
  $('chapterButton').addEventListener('click',openDirectory);
  $('closeDirectory').addEventListener('click',closeDirectory);
  $('directory').addEventListener('click',e => { if(e.target === $('directory')) closeDirectory(); });
  $('prevButton').addEventListener('click',()=>show(nextId(-1),true));
  $('nextButton').addEventListener('click',()=>show(nextId(1),true));
  $('startButton').addEventListener('click',()=>show('01',true));
  $('homeButton').addEventListener('click',()=>show('08',true));
  $('tourButton').addEventListener('click',()=>{tour = !tour; $('tourButton').setAttribute('aria-pressed',String(tour)); $('tourButton').textContent = tour ? 'Ⅱ 暂停巡游' : '▷ 自动巡游'; scheduleTour();});
  $('motionButton').addEventListener('click',()=>{motion = !motion; document.body.classList.toggle('motion-off',!motion); syncMotionControl();});
  $('fullscreenButton').addEventListener('click',()=>{if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();});
  sceneImage.addEventListener('error',()=>{ $('imageError').hidden = false; });
  document.addEventListener('visibilitychange',scheduleTour);
  document.addEventListener('keydown',e=>{
    if(!$('directory').hidden) {
      if(e.key === 'Escape') { closeDirectory(); e.preventDefault(); }
      if(e.key === 'Tab') { const focusable=[...$('directory').querySelectorAll('button')]; const index=focusable.indexOf(document.activeElement); if(e.shiftKey && index===0){focusable.at(-1).focus();e.preventDefault();} else if(!e.shiftKey && index===focusable.length-1){focusable[0].focus();e.preventDefault();} }
      return;
    }
    if(e.key==='ArrowLeft'){show(nextId(-1),true);e.preventDefault();}
    if(e.key==='ArrowRight'){show(nextId(1),true);e.preventDefault();}
    if(e.key==='Escape' && document.fullscreenElement) document.exitFullscreen();
  });
  window.addEventListener('hashchange',()=>{const id=location.hash.slice(1); if(byId.has(id)&&id!==current.id) show(id,true);});
  motionPreference.addEventListener?.('change', event => { motion = !event.matches; document.body.classList.toggle('motion-off', !motion); syncMotionControl(); });
  makeDirectory(); if(!motion) document.body.classList.add('motion-off'); syncMotionControl(); show(current.id,false);
})();


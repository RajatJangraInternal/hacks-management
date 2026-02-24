/* ============================================
   HACKS MANAGEMENT DASHBOARD
   Infinite Scroll • Wheel Zoom • Day Names
   ============================================ */

import './style.css';

// --- Constants ---
const STORAGE_KEY = 'hacks-manager-data';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const ROW_LABEL_WIDTH = 130;

const PHASE = {
    pre:  { bg:'#e6b800', bright:'#ffd633', label:'Pre-Event',   css:'phase-pre' },
    hack: { bg:'#22c55e', bright:'#4ade80', label:'Actual Hack', css:'phase-hack' },
    post: { bg:'#f97316', bright:'#fb923c', label:'Post-Event',  css:'phase-post' },
};

// Zoom levels
const ZOOM_LEVELS = [14, 18, 22, 28, 36, 48, 64];
const ZOOM_DEFAULT_IDX = 3; // 28px

// --- State ---
const today = new Date();
const state = {
    hacks: [],
    activeYear: today.getFullYear(),
    editing: null,
    zoomIdx: ZOOM_DEFAULT_IDX,
    dayWidth: ZOOM_LEVELS[ZOOM_DEFAULT_IDX],
    // Infinite scroll: track loaded year range
    yearStart: today.getFullYear() - 1,
    yearEnd: today.getFullYear() + 2,
};

// Pre-computed calendar structure
let calMonths = [];
let totalCalDays = 0;

function rebuildCalMeta() {
    calMonths = [];
    totalCalDays = 0;
    for (let y = state.yearStart; y <= state.yearEnd; y++) {
        for (let m = 0; m < 12; m++) {
            const days = new Date(y, m + 1, 0).getDate();
            calMonths.push({ year: y, month: m, days, offset: totalCalDays });
            totalCalDays += days;
        }
    }
}

// --- DOM ---
const $ = id => document.getElementById(id);
const $hackList = $('hack-list');
const $hackCount = $('hack-count');
const $calWrap = $('calendar-wrapper');
const $headerMonths = $('calendar-header-months');
const $headerDays = $('calendar-header-days');
const $headerDayNames = $('calendar-header-daynames');
const $calBody = $('calendar-body');
const $yearTabs = $('year-tabs');
const $viewLabel = $('current-view-label');
const $modalOverlay = $('modal-overlay');
const $modalTitle = $('modal-title');
const $hackForm = $('hack-form');
const $hackId = $('hack-id');
const $hackName = $('hack-name');
const $hackPo = $('hack-po');
const $hackTechSheet = $('hack-tech-sheet');
const $hackCredSheet = $('hack-cred-sheet');
const $docList = $('doc-list');
const $hackNotes = $('hack-notes');
const $btnDelete = $('btn-delete');
const $toastBox = $('toast-container');
const $zoomInd = $('zoom-indicator');
const $preStart = $('hack-pre-start');
const $preEnd = $('hack-pre-end');
const $mainStart = $('hack-main-start');
const $mainEnd = $('hack-main-end');
const $postStart = $('hack-post-start');
const $postEnd = $('hack-post-end');

// ============================================
// PERSISTENCE
// ============================================
function loadData() { try { const r = localStorage.getItem(STORAGE_KEY); if (r) state.hacks = JSON.parse(r); } catch(_){state.hacks=[];} }
function saveData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.hacks)); } catch(_){} }
function genId() { return 'h' + Date.now().toString(36) + Math.random().toString(36).substr(2,4); }

// ============================================
// DATE HELPERS
// ============================================
const isWknd = (y,m,d) => { const w = new Date(y,m,d).getDay(); return w===0||w===6; };
const isToday = (y,m,d) => y===today.getFullYear()&&m===today.getMonth()&&d===today.getDate();
const dtStr = d => new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const dtShort = d => new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const pDate = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const dayDiff = (a,b) => Math.round((new Date(b.getFullYear(),b.getMonth(),b.getDate())-new Date(a.getFullYear(),a.getMonth(),a.getDate()))/864e5);
const dayOff = d => dayDiff(new Date(state.yearStart,0,1), d);
const fDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addD = (d,n) => new Date(d.getTime()+n*864e5);
const getDayName = (y,m,d) => DAY_NAMES[new Date(y,m,d).getDay()];

// ============================================
// DOCUMENTS
// ============================================
function mkDocEntry(nm='',url='') {
    const e = mk('div','doc-entry');
    e.innerHTML = `<input type="text" class="doc-name-input" placeholder="Document name" value="${esc(nm)}"><input type="url" class="doc-url-input" placeholder="https://..." value="${esc(url)}"><button type="button" class="btn btn-icon doc-remove" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    e.querySelector('.doc-remove').addEventListener('click',()=>{ if($docList.children.length>1) e.remove(); else { e.querySelector('.doc-name-input').value=''; e.querySelector('.doc-url-input').value=''; }});
    return e;
}
function getDocs() { return [...$docList.querySelectorAll('.doc-entry')].reduce((a,e)=>{ const n=e.querySelector('.doc-name-input').value.trim(),u=e.querySelector('.doc-url-input').value.trim(); if(n||u)a.push({name:n||'Untitled',url:u}); return a; },[]); }
function setDocs(docs) { $docList.innerHTML=''; if(!docs||!docs.length){$docList.appendChild(mkDocEntry());return;} docs.forEach(d=>$docList.appendChild(mkDocEntry(d.name,d.url))); }

// ============================================
// INFINITE SCROLL — expand years dynamically
// ============================================
function expandIfNeeded() {
    const sl = $calWrap.scrollLeft;
    const sw = $calWrap.scrollWidth;
    const cw = $calWrap.clientWidth;
    let changed = false;

    // Near left edge → prepend a year
    if (sl < cw * 0.5) {
        state.yearStart--;
        changed = true;
    }
    // Near right edge → append a year
    if (sw - sl - cw < cw * 0.5) {
        state.yearEnd++;
        changed = true;
    }

    if (changed) {
        // Remember scroll position relative to calendar start
        const oldScrollDate = scrollPosToDate(sl);
        rebuildCalMeta();
        renderHeaders();
        renderCalendarRows();
        renderYearTabs();
        // Restore scroll position
        const newOffset = dayOff(oldScrollDate);
        $calWrap.scrollLeft = newOffset * state.dayWidth;
    }
}

function scrollPosToDate(scrollLeft) {
    let acc = 0;
    for (const cm of calMonths) {
        const w = cm.days * state.dayWidth;
        if (acc + w > scrollLeft) {
            const dayInMonth = Math.floor((scrollLeft - acc) / state.dayWidth) + 1;
            return new Date(cm.year, cm.month, Math.min(dayInMonth, cm.days));
        }
        acc += w;
    }
    const last = calMonths[calMonths.length - 1];
    return new Date(last.year, last.month, last.days);
}

// ============================================
// ZOOM — wheel changes day width
// ============================================
let zoomTimer = 0;

function handleZoom(e) {
    // Only zoom on Ctrl+Wheel or pinch
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();

    const oldW = state.dayWidth;
    const oldIdx = state.zoomIdx;

    if (e.deltaY < 0 && state.zoomIdx < ZOOM_LEVELS.length - 1) state.zoomIdx++;
    else if (e.deltaY > 0 && state.zoomIdx > 0) state.zoomIdx--;
    else return;

    state.dayWidth = ZOOM_LEVELS[state.zoomIdx];

    // Keep the mouse position stable during zoom
    const rect = $calWrap.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const scrollBefore = $calWrap.scrollLeft;
    const ratio = state.dayWidth / oldW;

    // Re-render with new width
    renderHeaders();
    renderCalendarRows();

    // Adjust scroll to keep mouse-pointed date stable
    $calWrap.scrollLeft = (scrollBefore + mouseX) * ratio - mouseX;

    // Show zoom indicator
    const pct = Math.round((state.dayWidth / ZOOM_LEVELS[ZOOM_DEFAULT_IDX]) * 100);
    $zoomInd.textContent = pct + '%';
    $zoomInd.classList.add('visible');
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => $zoomInd.classList.remove('visible'), 1200);
}

// ============================================
// CALENDAR RENDERING
// ============================================
function renderAll() {
    rebuildCalMeta();
    renderHeaders();
    renderCalendarRows();
    renderYearTabs();
    updateViewLabel();
}

function renderHeaders() {
    renderMonthHeaders();
    renderDayHeaders();
    renderDayNameHeaders();
}

function renderMonthHeaders() {
    const f = document.createDocumentFragment();
    const sp = mk('div','row-label');
    Object.assign(sp.style,{background:'var(--bg-tertiary)',fontWeight:'700',color:'var(--text-primary)',fontSize:'13px'});
    sp.textContent = 'Events';
    f.appendChild(sp);

    for (const cm of calMonths) {
        const h = mk('div','month-header');
        const w = cm.days * state.dayWidth;
        h.style.width = h.style.minWidth = w + 'px';
        h.innerHTML = `${MONTHS[cm.month]} <span class="year-label">${cm.year}</span>`;
        f.appendChild(h);
    }
    $headerMonths.innerHTML = '';
    $headerMonths.appendChild(f);
}

function renderDayHeaders() {
    const f = document.createDocumentFragment();
    const sp = mk('div','row-label');
    Object.assign(sp.style,{background:'var(--bg-secondary)',minHeight:'24px',height:'24px'});
    f.appendChild(sp);

    for (const cm of calMonths) {
        for (let d = 1; d <= cm.days; d++) {
            const c = mk('div','day-cell-header');
            c.style.width = c.style.minWidth = state.dayWidth + 'px';
            c.textContent = d;
            if (isWknd(cm.year,cm.month,d)) c.classList.add('weekend');
            if (isToday(cm.year,cm.month,d)) c.classList.add('today');
            f.appendChild(c);
        }
    }
    $headerDays.innerHTML = '';
    $headerDays.appendChild(f);
}

function renderDayNameHeaders() {
    const f = document.createDocumentFragment();
    const sp = mk('div','row-label');
    Object.assign(sp.style,{background:'rgba(13,11,26,0.95)',minHeight:'20px',height:'20px'});
    f.appendChild(sp);

    for (const cm of calMonths) {
        for (let d = 1; d <= cm.days; d++) {
            const c = mk('div','dayname-cell');
            c.style.width = c.style.minWidth = state.dayWidth + 'px';
            c.textContent = getDayName(cm.year, cm.month, d);
            if (isWknd(cm.year,cm.month,d)) c.classList.add('weekend');
            if (isToday(cm.year,cm.month,d)) c.classList.add('today');
            f.appendChild(c);
        }
    }
    $headerDayNames.innerHTML = '';
    $headerDayNames.appendChild(f);
}

function renderCalendarRows() {
    const f = document.createDocumentFragment();
    const W = state.dayWidth;

    if (state.hacks.length === 0) {
        const row = mk('div','calendar-row');
        const label = mk('div','row-label');
        label.textContent = 'No hacks yet';
        label.style.color = 'var(--text-muted)'; label.style.fontStyle = 'italic';
        row.appendChild(label);
        appendCells(row, W);
        f.appendChild(row);
    } else {
        const calS = new Date(state.yearStart, 0, 1);
        const calE = new Date(state.yearEnd, 11, 31);

        state.hacks.forEach(hack => {
            const row = mk('div','calendar-row');
            const label = mk('div','row-label');
            label.innerHTML = `<span class="row-label-color" style="background:${PHASE.hack.bg};color:${PHASE.hack.bg}"></span><span title="${escH(hack.name)}">${escH(hack.name)}</span>`;
            row.appendChild(label);

            const cont = mk('div','cells-container');
            appendCells(cont, W);

            // Phase bars
            [{key:'pre',s:hack.preStart,e:hack.preEnd},{key:'hack',s:hack.mainStart,e:hack.mainEnd},{key:'post',s:hack.postStart,e:hack.postEnd}].forEach(ph => {
                if (!ph.s || !ph.e) return;
                const sd = pDate(ph.s), ed = pDate(ph.e);
                if (ed < calS || sd > calE) return;

                const cs = sd<calS?calS:sd, ce = ed>calE?calE:ed;
                const off = dayOff(cs);
                const dur = dayDiff(cs, ce) + 1;
                const pc = PHASE[ph.key];

                const bar = mk('div',`event-bar ${pc.css}`);
                bar.style.left = (off * W) + 'px';
                bar.style.width = (dur * W - 2) + 'px';
                bar.style.background = `linear-gradient(135deg,${pc.bg},${pc.bright})`;
                bar.textContent = ph.key === 'hack' ? hack.name : pc.label;
                bar.title = `${hack.name} — ${pc.label}\n${dtStr(ph.s)} → ${dtStr(ph.e)}`;
                bar.addEventListener('click', ev => { ev.stopPropagation(); openEditModal(hack.id); });
                cont.appendChild(bar);
            });

            row.appendChild(cont);
            f.appendChild(row);
        });
    }

    $calBody.innerHTML = '';
    $calBody.appendChild(f);
    renderTodayMarker();
}

function appendCells(container, W) {
    const f = document.createDocumentFragment();
    for (const cm of calMonths) {
        for (let d = 1; d <= cm.days; d++) {
            const c = mk('div','day-cell');
            c.style.width = c.style.minWidth = W + 'px';
            if (isWknd(cm.year,cm.month,d)) c.classList.add('weekend');
            if (isToday(cm.year,cm.month,d)) c.classList.add('today');
            if (d===1) c.classList.add('month-start');
            f.appendChild(c);
        }
    }
    container.appendChild(f);
}

function renderTodayMarker() {
    const td = new Date(today.getFullYear(),today.getMonth(),today.getDate());
    const calS = new Date(state.yearStart,0,1), calE = new Date(state.yearEnd,11,31);
    if (td<calS||td>calE) return;
    const off = dayOff(td);
    const m = mk('div','today-marker');
    m.style.left = (ROW_LABEL_WIDTH + off * state.dayWidth + state.dayWidth/2) + 'px';
    $calBody.appendChild(m);
}

function renderYearTabs() {
    const f = document.createDocumentFragment();
    // Show a reasonable range of year tabs
    const visibleYears = [];
    for (let y = state.yearStart; y <= state.yearEnd; y++) visibleYears.push(y);

    visibleYears.forEach(y => {
        const btn = mk('button',`btn btn-nav${y===state.activeYear?' active':''}`);
        btn.textContent = y;
        btn.addEventListener('click', () => scrollToYear(y));
        f.appendChild(btn);
    });
    $yearTabs.innerHTML = '';
    $yearTabs.appendChild(f);
}

function updateViewLabel() {
    const sl = $calWrap.scrollLeft;
    let acc = 0;
    for (const cm of calMonths) {
        const w = cm.days * state.dayWidth;
        if (acc + w > sl) {
            $viewLabel.textContent = `${MONTHS_FULL[cm.month]} ${cm.year}`;
            if (state.activeYear !== cm.year) {
                state.activeYear = cm.year;
                $yearTabs.querySelectorAll('.btn-nav').forEach(b => b.classList.toggle('active', +b.textContent===cm.year));
            }
            return;
        }
        acc += w;
    }
}

// ============================================
// SIDEBAR
// ============================================
function renderSidebar() {
    if (state.hacks.length === 0) {
        $hackList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚡</div><div class="empty-state-text">No hacks added yet.<br>Click <strong>"Add Hack"</strong> to get started.</div></div>`;
        $hackCount.textContent = '0 hacks';
        return;
    }
    const f = document.createDocumentFragment();
    const sorted = [...state.hacks].sort((a,b)=>(a.preStart||'').localeCompare(b.preStart||''));
    const svg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

    sorted.forEach((h,i) => {
        const it = mk('div','hack-item');
        it.style.setProperty('--hack-color',PHASE.hack.bg);
        it.style.animationDelay = (i*35)+'ms';
        let lnks=[];
        if(h.po)lnks.push(`<span class="hack-link">PO: ${escH(h.po)}</span>`);
        if(h.techSheet)lnks.push(`<a href="${esc(h.techSheet)}" target="_blank" class="hack-link">📄 Tech</a>`);
        if(h.credSheet)lnks.push(`<a href="${esc(h.credSheet)}" target="_blank" class="hack-link">🔑 Creds</a>`);
        (h.documents||[]).forEach(d=>{lnks.push(d.url?`<a href="${esc(d.url)}" target="_blank" class="hack-link">📝 ${escH(d.name)}</a>`:`<span class="hack-link">📝 ${escH(d.name)}</span>`);});

        it.innerHTML = `<div class="hack-item-header"><span class="hack-item-name">${escH(h.name)}</span></div>
            <div class="hack-item-dates">${svg} ${dtShort(h.preStart)} — ${dtShort(h.postEnd)}</div>
            <div class="hack-item-phases">
                <div class="hack-item-phase-bar" style="background:${PHASE.pre.bg};color:${PHASE.pre.bg}" title="Pre"></div>
                <div class="hack-item-phase-bar" style="background:${PHASE.hack.bg};color:${PHASE.hack.bg}" title="Hack"></div>
                <div class="hack-item-phase-bar" style="background:${PHASE.post.bg};color:${PHASE.post.bg}" title="Post"></div>
            </div>
            ${lnks.length?`<div class="hack-item-links">${lnks.join('')}</div>`:''}
            ${h.notes?`<div class="hack-item-notes">${escH(h.notes)}</div>`:''}`;
        it.addEventListener('click',()=>openEditModal(h.id));
        f.appendChild(it);
    });
    $hackList.innerHTML=''; $hackList.appendChild(f);
    $hackCount.textContent = `${state.hacks.length} hack${state.hacks.length!==1?'s':''}`;
}

// ============================================
// MODAL
// ============================================
function openAddModal() {
    state.editing = null;
    $modalTitle.textContent = 'Add New Hack';
    $hackId.value=$hackName.value=$hackPo.value=$hackTechSheet.value=$hackCredSheet.value=$hackNotes.value='';
    $btnDelete.style.display='none';
    setDocs([]);
    const t=today;
    $preStart.value=fDate(t); $preEnd.value=fDate(addD(t,2));
    $mainStart.value=fDate(addD(t,3)); $mainEnd.value=fDate(addD(t,5));
    $postStart.value=fDate(addD(t,6)); $postEnd.value=fDate(addD(t,10));
    showModal();
}

function openEditModal(id) {
    const h = state.hacks.find(x=>x.id===id);
    if(!h) return;
    state.editing = id;
    $modalTitle.textContent = 'Edit Hack';
    $hackId.value=h.id; $hackName.value=h.name;
    $hackPo.value=h.po||''; $hackTechSheet.value=h.techSheet||''; $hackCredSheet.value=h.credSheet||'';
    setDocs(h.documents||[]); $hackNotes.value=h.notes||'';
    $btnDelete.style.display='inline-flex';
    $preStart.value=h.preStart; $preEnd.value=h.preEnd;
    $mainStart.value=h.mainStart; $mainEnd.value=h.mainEnd;
    $postStart.value=h.postStart; $postEnd.value=h.postEnd;
    showModal();
}

function showModal() { $modalOverlay.classList.add('active'); requestAnimationFrame(()=>$hackName.focus()); }
function hideModal() { $modalOverlay.classList.remove('active'); state.editing=null; }

function handleSave(e) {
    e.preventDefault();
    const name=$hackName.value.trim();
    if(!name) return toast('⚠️','Please enter a hack name.');
    const d={preStart:$preStart.value,preEnd:$preEnd.value,mainStart:$mainStart.value,mainEnd:$mainEnd.value,postStart:$postStart.value,postEnd:$postEnd.value};
    for(const v of Object.values(d)) if(!v) return toast('⚠️','Please fill all phase dates.');
    if(d.preStart>d.preEnd) return toast('⚠️','Pre-Event end must be ≥ start.');
    if(d.mainStart>d.mainEnd) return toast('⚠️','Hack end must be ≥ start.');
    if(d.postStart>d.postEnd) return toast('⚠️','Post-Event end must be ≥ start.');

    const hd = {name,po:$hackPo.value.trim(),techSheet:$hackTechSheet.value.trim(),credSheet:$hackCredSheet.value.trim(),documents:getDocs(),notes:$hackNotes.value.trim(),...d};

    if(state.editing){
        const idx=state.hacks.findIndex(x=>x.id===state.editing);
        if(idx!==-1){state.hacks[idx]={...state.hacks[idx],...hd}; toast('✅','Hack updated!');}
    } else {
        state.hacks.push({id:genId(),...hd,createdAt:new Date().toISOString()});
        toast('✅','Hack added!');
    }
    saveData(); renderSidebar(); renderCalendarRows(); hideModal();
}

function handleDelete() {
    if(!state.editing||!confirm('Delete this hack?')) return;
    state.hacks=state.hacks.filter(h=>h.id!==state.editing);
    saveData(); renderSidebar(); renderCalendarRows(); hideModal(); toast('🗑️','Deleted.');
}

// ============================================
// NAVIGATION
// ============================================
function scrollToToday() {
    const off = dayOff(new Date(today.getFullYear(),today.getMonth(),today.getDate()));
    $calWrap.scrollTo({left:Math.max(0,off*state.dayWidth-$calWrap.clientWidth/3),behavior:'smooth'});
}

function scrollToYear(year) {
    // Expand years if needed
    while (year < state.yearStart) { state.yearStart--; }
    while (year > state.yearEnd) { state.yearEnd++; }
    rebuildCalMeta(); renderHeaders(); renderCalendarRows(); renderYearTabs();

    let off = 0;
    for (const cm of calMonths) { if(cm.year===year&&cm.month===0) break; off+=cm.days; }
    $calWrap.scrollTo({left:off*state.dayWidth,behavior:'smooth'});
}

function scrollByMonth(dir) {
    const sl=$calWrap.scrollLeft; let acc=0;
    for(const cm of calMonths){
        const w=cm.days*state.dayWidth;
        if(dir>0&&acc+w>sl+10){$calWrap.scrollTo({left:acc+w,behavior:'smooth'});return;}
        if(dir<0&&acc>=sl-10){$calWrap.scrollTo({left:Math.max(0,acc-w),behavior:'smooth'});return;}
        acc+=w;
    }
}

// ============================================
// UTILITIES
// ============================================
function mk(tag,cls) { const e=document.createElement(tag); if(cls)e.className=cls; return e; }
function escH(t) { if(!t)return''; const m={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}; return t.replace(/[&<>"']/g,c=>m[c]); }
function esc(t) { return (t||'').replace(/"/g,'&quot;'); }
function toast(icon,msg) {
    const t=mk('div','toast');
    t.innerHTML=`<span class="toast-icon">${icon}</span> ${msg}`;
    $toastBox.appendChild(t);
    setTimeout(()=>{t.classList.add('toast-exit');setTimeout(()=>t.remove(),250);},2200);
}

// ============================================
// DATE CHAINING
// ============================================
function setupChaining() {
    $preEnd.addEventListener('change',()=>{
        if(!$preEnd.value)return;
        const next=addD(pDate($preEnd.value),1);
        $mainStart.value=fDate(next);
        if(!$mainEnd.value||$mainEnd.value<$mainStart.value) $mainEnd.value=fDate(addD(next,2));
    });
    $mainEnd.addEventListener('change',()=>{
        if(!$mainEnd.value)return;
        const next=addD(pDate($mainEnd.value),1);
        $postStart.value=fDate(next);
        if(!$postEnd.value||$postEnd.value<$postStart.value) $postEnd.value=fDate(addD(next,4));
    });
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEvents() {
    $('btn-add-hack').addEventListener('click',openAddModal);
    $('modal-close').addEventListener('click',hideModal);
    $('btn-cancel').addEventListener('click',hideModal);
    $modalOverlay.addEventListener('click',e=>{if(e.target===$modalOverlay)hideModal();});
    $hackForm.addEventListener('submit',handleSave);
    $btnDelete.addEventListener('click',handleDelete);
    $('btn-add-doc').addEventListener('click',()=>$docList.appendChild(mkDocEntry()));

    $docList.querySelectorAll('.doc-remove').forEach(btn=>{
        btn.addEventListener('click',()=>{
            const entry=btn.closest('.doc-entry');
            if($docList.children.length>1) entry.remove();
            else { entry.querySelector('.doc-name-input').value=''; entry.querySelector('.doc-url-input').value=''; }
        });
    });

    $('btn-today').addEventListener('click',scrollToToday);
    $('btn-prev-month').addEventListener('click',()=>scrollByMonth(-1));
    $('btn-next-month').addEventListener('click',()=>scrollByMonth(1));

    // Scroll: update label + infinite expand
    let sRaf = 0;
    $calWrap.addEventListener('scroll',()=>{
        cancelAnimationFrame(sRaf);
        sRaf = requestAnimationFrame(()=>{
            updateViewLabel();
            expandIfNeeded();
        });
    },{passive:true});

    // Zoom on Ctrl+Wheel
    $calWrap.addEventListener('wheel', handleZoom, {passive:false});

    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$modalOverlay.classList.contains('active'))hideModal();});
    setupChaining();
}

// ============================================
// INIT
// ============================================
loadData();
renderAll();
renderSidebar();
initEvents();
setTimeout(scrollToToday, 200);

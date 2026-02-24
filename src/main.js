/* ============================================
   HACKS MANAGEMENT DASHBOARD - APP LOGIC
   3-Phase System: Pre-Event / Actual Hack / Post-Event
   Fields: PO, Tech Sheet URL, Credential Sheet URL, Instruction Documents
   ============================================ */

import './style.css';

// --- Constants ---
const STORAGE_KEY = 'hacks-manager-data';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_WIDTH = 28;
const ROW_LABEL_WIDTH = 130;

// Phase colors
const PHASE_COLORS = {
    pre:  { bg: '#5b8cd4', label: 'Pre-Event' },
    hack: { bg: '#d4a843', label: 'Actual Hack' },
    post: { bg: '#6bba6b', label: 'Post-Event' },
};

// --- State ---
const today = new Date();
const currentYear = today.getFullYear();
const state = {
    hacks: [],
    years: [currentYear, currentYear + 1, currentYear + 2],
    activeYear: currentYear,
    editing: null,
};

// --- DOM References ---
const $ = (id) => document.getElementById(id);
const $hackList = $('hack-list');
const $hackCount = $('hack-count');
const $calendarWrapper = $('calendar-wrapper');
const $headerMonths = $('calendar-header-months');
const $headerDays = $('calendar-header-days');
const $calendarBody = $('calendar-body');
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
const $toastContainer = $('toast-container');

// Phase date inputs
const $preStart = $('hack-pre-start');
const $preEnd = $('hack-pre-end');
const $mainStart = $('hack-main-start');
const $mainEnd = $('hack-main-end');
const $postStart = $('hack-post-start');
const $postEnd = $('hack-post-end');

// ============================================
// DATA / PERSISTENCE
// ============================================
function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            state.hacks = JSON.parse(raw);
        }
    } catch (e) {
        console.warn('Failed to load data:', e);
        state.hacks = [];
    }
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.hacks));
    } catch (e) {
        console.warn('Failed to save data:', e);
    }
}

function generateId() {
    return 'hack_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// ============================================
// DATE HELPERS
// ============================================
function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function isWeekend(year, month, day) {
    const d = new Date(year, month, day);
    const dow = d.getDay();
    return dow === 0 || dow === 6;
}

function isToday(year, month, day) {
    return year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
}

function dateToStr(d) {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateToShort(d) {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseDate(str) {
    const parts = str.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function daysBetween(start, end) {
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((e - s) / (1000 * 60 * 60 * 24));
}

function dayOffset(date) {
    const startOfCalendar = new Date(state.years[0], 0, 1);
    return daysBetween(startOfCalendar, date);
}

function formatDateInput(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function addDays(d, n) {
    return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

// ============================================
// INSTRUCTION DOCUMENTS MANAGEMENT
// ============================================
function createDocEntry(name = '', url = '') {
    const entry = document.createElement('div');
    entry.className = 'doc-entry';
    entry.innerHTML = `
        <input type="text" class="doc-name-input" placeholder="Document name" value="${escapeAttr(name)}">
        <input type="url" class="doc-url-input" placeholder="https://..." value="${escapeAttr(url)}">
        <button type="button" class="btn btn-icon doc-remove" title="Remove">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    entry.querySelector('.doc-remove').addEventListener('click', () => {
        if ($docList.querySelectorAll('.doc-entry').length > 1) {
            entry.remove();
        } else {
            // Clear instead of remove if it's the last one
            entry.querySelector('.doc-name-input').value = '';
            entry.querySelector('.doc-url-input').value = '';
        }
    });
    return entry;
}

function getDocuments() {
    const entries = $docList.querySelectorAll('.doc-entry');
    const docs = [];
    entries.forEach(entry => {
        const name = entry.querySelector('.doc-name-input').value.trim();
        const url = entry.querySelector('.doc-url-input').value.trim();
        if (name || url) {
            docs.push({ name: name || 'Untitled', url });
        }
    });
    return docs;
}

function setDocuments(docs) {
    $docList.innerHTML = '';
    if (!docs || docs.length === 0) {
        $docList.appendChild(createDocEntry());
    } else {
        docs.forEach(doc => {
            $docList.appendChild(createDocEntry(doc.name, doc.url));
        });
    }
}

// ============================================
// CALENDAR RENDERING
// ============================================
function renderCalendar() {
    renderMonthHeaders();
    renderDayHeaders();
    renderCalendarRows();
    renderYearTabs();
    updateViewLabel();
}

function renderMonthHeaders() {
    $headerMonths.innerHTML = '';
    const spacer = document.createElement('div');
    spacer.className = 'row-label';
    spacer.style.background = 'var(--bg-tertiary)';
    spacer.style.fontWeight = '700';
    spacer.style.color = 'var(--text-primary)';
    spacer.style.fontSize = '13px';
    spacer.textContent = 'Events';
    $headerMonths.appendChild(spacer);

    for (const year of state.years) {
        for (let m = 0; m < 12; m++) {
            const days = daysInMonth(year, m);
            const header = document.createElement('div');
            header.className = 'month-header';
            header.style.width = (days * DAY_WIDTH) + 'px';
            header.style.minWidth = (days * DAY_WIDTH) + 'px';
            header.innerHTML = `${MONTHS[m]} <span class="year-label">${year}</span>`;
            $headerMonths.appendChild(header);
        }
    }
}

function renderDayHeaders() {
    $headerDays.innerHTML = '';
    const spacer = document.createElement('div');
    spacer.className = 'row-label';
    spacer.style.background = 'var(--bg-secondary)';
    spacer.style.minHeight = '24px';
    spacer.style.height = '24px';
    $headerDays.appendChild(spacer);

    for (const year of state.years) {
        for (let m = 0; m < 12; m++) {
            const days = daysInMonth(year, m);
            for (let d = 1; d <= days; d++) {
                const cell = document.createElement('div');
                cell.className = 'day-cell-header';
                cell.textContent = d;
                if (isWeekend(year, m, d)) cell.classList.add('weekend');
                if (isToday(year, m, d)) cell.classList.add('today');
                $headerDays.appendChild(cell);
            }
        }
    }
}

function renderCalendarRows() {
    $calendarBody.innerHTML = '';

    if (state.hacks.length === 0) {
        const row = document.createElement('div');
        row.className = 'calendar-row';
        const label = document.createElement('div');
        label.className = 'row-label';
        label.textContent = 'No hacks yet';
        label.style.color = 'var(--text-muted)';
        label.style.fontStyle = 'italic';
        row.appendChild(label);
        renderDayCells(row);
        $calendarBody.appendChild(row);
        return;
    }

    state.hacks.forEach((hack, index) => {
        const row = document.createElement('div');
        row.className = 'calendar-row';
        row.style.animationDelay = (index * 30) + 'ms';

        // Row label
        const label = document.createElement('div');
        label.className = 'row-label';
        label.innerHTML = `<span class="row-label-color" style="background:${PHASE_COLORS.hack.bg}"></span>
            <span title="${escapeHtml(hack.name)}">${escapeHtml(hack.name)}</span>`;
        row.appendChild(label);

        // Day cells - use a container so bars can float above
        const cellsContainer = document.createElement('div');
        cellsContainer.style.display = 'flex';
        cellsContainer.style.position = 'relative';
        renderDayCellsInto(cellsContainer);

        // Render 3 phase bars inside the cells container
        const calStart = new Date(state.years[0], 0, 1);
        const calEnd = new Date(state.years[state.years.length - 1], 11, 31);

        const phases = [
            { key: 'pre',  start: hack.preStart,  end: hack.preEnd,  color: PHASE_COLORS.pre },
            { key: 'hack', start: hack.mainStart,  end: hack.mainEnd, color: PHASE_COLORS.hack },
            { key: 'post', start: hack.postStart,  end: hack.postEnd, color: PHASE_COLORS.post },
        ];

        phases.forEach(phase => {
            if (!phase.start || !phase.end) return;
            const startDate = parseDate(phase.start);
            const endDate = parseDate(phase.end);

            if (endDate >= calStart && startDate <= calEnd) {
                const clampedStart = startDate < calStart ? calStart : startDate;
                const clampedEnd = endDate > calEnd ? calEnd : endDate;
                const offsetStart = dayOffset(clampedStart);
                const duration = daysBetween(clampedStart, clampedEnd) + 1;

                const bar = document.createElement('div');
                bar.className = 'event-bar';
                bar.style.left = (offsetStart * DAY_WIDTH) + 'px';
                bar.style.width = (duration * DAY_WIDTH - 2) + 'px';
                bar.style.background = `linear-gradient(135deg, ${phase.color.bg}, ${adjustColor(phase.color.bg, 20)})`;

                if (phase.key === 'hack') {
                    bar.textContent = hack.name;
                } else {
                    bar.textContent = phase.color.label;
                }

                bar.title = `${hack.name} — ${phase.color.label}\n${dateToStr(phase.start)} → ${dateToStr(phase.end)}`;
                bar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditModal(hack.id);
                });
                cellsContainer.appendChild(bar);
            }
        });

        row.appendChild(cellsContainer);
        $calendarBody.appendChild(row);
    });

    renderTodayMarker();
}

function renderDayCellsInto(container) {
    for (const year of state.years) {
        for (let m = 0; m < 12; m++) {
            const days = daysInMonth(year, m);
            for (let d = 1; d <= days; d++) {
                const cell = document.createElement('div');
                cell.className = 'day-cell';
                if (isWeekend(year, m, d)) cell.classList.add('weekend');
                if (isToday(year, m, d)) cell.classList.add('today');
                if (d === 1) cell.classList.add('month-start');
                container.appendChild(cell);
            }
        }
    }
}

function renderDayCells(row) {
    renderDayCellsInto(row);
}

function renderTodayMarker() {
    const existing = $calendarBody.querySelector('.today-marker');
    if (existing) existing.remove();

    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const calStart = new Date(state.years[0], 0, 1);
    const calEnd = new Date(state.years[state.years.length - 1], 11, 31);

    if (todayDate >= calStart && todayDate <= calEnd) {
        const offset = dayOffset(todayDate);
        // Find the first row with a cells container
        const firstRow = $calendarBody.querySelector('.calendar-row');
        if (firstRow) {
            const marker = document.createElement('div');
            marker.className = 'today-marker';
            // Account for the row-label width in the overall calendar body
            marker.style.left = (ROW_LABEL_WIDTH + offset * DAY_WIDTH + DAY_WIDTH / 2) + 'px';
            $calendarBody.appendChild(marker);
        }
    }
}

function renderYearTabs() {
    $yearTabs.innerHTML = '';
    state.years.forEach(year => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-nav';
        btn.textContent = year;
        if (year === state.activeYear) btn.classList.add('active');
        btn.addEventListener('click', () => scrollToYear(year));
        $yearTabs.appendChild(btn);
    });
}

function updateViewLabel() {
    const scrollLeft = $calendarWrapper.scrollLeft;
    let accum = 0;
    for (const year of state.years) {
        for (let m = 0; m < 12; m++) {
            const monthWidth = daysInMonth(year, m) * DAY_WIDTH;
            if (accum + monthWidth > scrollLeft) {
                $viewLabel.textContent = `${MONTHS_FULL[m]} ${year}`;
                state.activeYear = year;
                document.querySelectorAll('.year-tabs .btn-nav').forEach(btn => {
                    btn.classList.toggle('active', parseInt(btn.textContent) === year);
                });
                return;
            }
            accum += monthWidth;
        }
    }
}

// ============================================
// SIDEBAR RENDERING
// ============================================
function renderSidebar() {
    $hackList.innerHTML = '';

    if (state.hacks.length === 0) {
        $hackList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <div class="empty-state-text">
                    No hacks added yet.<br>
                    Click <strong>"Add Hack"</strong> to get started.
                </div>
            </div>`;
        $hackCount.textContent = '0 hacks';
        return;
    }

    const sorted = [...state.hacks].sort((a, b) => (a.preStart || '').localeCompare(b.preStart || ''));

    sorted.forEach((hack, i) => {
        const item = document.createElement('div');
        item.className = 'hack-item';
        item.style.setProperty('--hack-color', PHASE_COLORS.hack.bg);
        item.style.animationDelay = (i * 40) + 'ms';

        const calIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>`;

        // Build links section
        let linksHtml = '';
        const links = [];
        if (hack.po) links.push(`<span class="hack-link" title="PO: ${escapeHtml(hack.po)}">PO: ${escapeHtml(hack.po)}</span>`);
        if (hack.techSheet) links.push(`<a href="${escapeAttr(hack.techSheet)}" target="_blank" class="hack-link" title="Tech Sheet">📄 Tech Sheet</a>`);
        if (hack.credSheet) links.push(`<a href="${escapeAttr(hack.credSheet)}" target="_blank" class="hack-link" title="Credential Sheet">🔑 Creds</a>`);
        if (hack.documents && hack.documents.length > 0) {
            hack.documents.forEach(doc => {
                if (doc.url) {
                    links.push(`<a href="${escapeAttr(doc.url)}" target="_blank" class="hack-link" title="${escapeHtml(doc.name)}">📝 ${escapeHtml(doc.name)}</a>`);
                } else {
                    links.push(`<span class="hack-link" title="${escapeHtml(doc.name)}">📝 ${escapeHtml(doc.name)}</span>`);
                }
            });
        }
        if (links.length > 0) linksHtml = `<div class="hack-item-links">${links.join('')}</div>`;

        item.innerHTML = `
            <div class="hack-item-header">
                <span class="hack-item-name">${escapeHtml(hack.name)}</span>
            </div>
            <div class="hack-item-dates">
                ${calIcon}
                ${dateToShort(hack.preStart)} — ${dateToShort(hack.postEnd)}
            </div>
            <div class="hack-item-phases">
                <div class="hack-item-phase-bar" style="background:${PHASE_COLORS.pre.bg}" title="Pre-Event: ${dateToShort(hack.preStart)} → ${dateToShort(hack.preEnd)}"></div>
                <div class="hack-item-phase-bar" style="background:${PHASE_COLORS.hack.bg}" title="Hack: ${dateToShort(hack.mainStart)} → ${dateToShort(hack.mainEnd)}"></div>
                <div class="hack-item-phase-bar" style="background:${PHASE_COLORS.post.bg}" title="Post: ${dateToShort(hack.postStart)} → ${dateToShort(hack.postEnd)}"></div>
            </div>
            ${linksHtml}
            ${hack.notes ? `<div class="hack-item-notes" title="${escapeHtml(hack.notes)}">${escapeHtml(hack.notes)}</div>` : ''}
        `;
        item.addEventListener('click', () => openEditModal(hack.id));
        $hackList.appendChild(item);
    });

    $hackCount.textContent = `${state.hacks.length} hack${state.hacks.length !== 1 ? 's' : ''}`;
}

// ============================================
// MODAL
// ============================================
function openAddModal() {
    state.editing = null;
    $modalTitle.textContent = 'Add New Hack';
    $hackId.value = '';
    $hackName.value = '';
    $hackPo.value = '';
    $hackTechSheet.value = '';
    $hackCredSheet.value = '';
    setDocuments([]);
    $hackNotes.value = '';
    $btnDelete.style.display = 'none';

    const t = today;
    $preStart.value = formatDateInput(t);
    $preEnd.value = formatDateInput(addDays(t, 2));
    $mainStart.value = formatDateInput(addDays(t, 3));
    $mainEnd.value = formatDateInput(addDays(t, 5));
    $postStart.value = formatDateInput(addDays(t, 6));
    $postEnd.value = formatDateInput(addDays(t, 10));

    showModal();
}

function openEditModal(id) {
    const hack = state.hacks.find(h => h.id === id);
    if (!hack) return;
    state.editing = id;
    $modalTitle.textContent = 'Edit Hack';
    $hackId.value = hack.id;
    $hackName.value = hack.name;
    $hackPo.value = hack.po || '';
    $hackTechSheet.value = hack.techSheet || '';
    $hackCredSheet.value = hack.credSheet || '';
    setDocuments(hack.documents || []);
    $hackNotes.value = hack.notes || '';
    $btnDelete.style.display = 'inline-flex';

    $preStart.value = hack.preStart;
    $preEnd.value = hack.preEnd;
    $mainStart.value = hack.mainStart;
    $mainEnd.value = hack.mainEnd;
    $postStart.value = hack.postStart;
    $postEnd.value = hack.postEnd;

    showModal();
}

function showModal() {
    $modalOverlay.classList.add('active');
    setTimeout(() => $hackName.focus(), 200);
}

function hideModal() {
    $modalOverlay.classList.remove('active');
    state.editing = null;
}

function handleSave(e) {
    e.preventDefault();
    const name = $hackName.value.trim();
    const po = $hackPo.value.trim();
    const techSheet = $hackTechSheet.value.trim();
    const credSheet = $hackCredSheet.value.trim();
    const documents = getDocuments();
    const notes = $hackNotes.value.trim();

    const preStart = $preStart.value;
    const preEnd = $preEnd.value;
    const mainStart = $mainStart.value;
    const mainEnd = $mainEnd.value;
    const postStart = $postStart.value;
    const postEnd = $postEnd.value;

    if (!name) {
        showToast('⚠️', 'Please enter a hack name.');
        return;
    }
    if (!preStart || !preEnd || !mainStart || !mainEnd || !postStart || !postEnd) {
        showToast('⚠️', 'Please fill in all date fields for all 3 phases.');
        return;
    }

    if (preStart > preEnd) { showToast('⚠️', 'Pre-Event: end must be after start.'); return; }
    if (mainStart > mainEnd) { showToast('⚠️', 'Actual Hack: end must be after start.'); return; }
    if (postStart > postEnd) { showToast('⚠️', 'Post-Event: end must be after start.'); return; }

    const hackData = {
        name, po, techSheet, credSheet, documents, notes,
        preStart, preEnd,
        mainStart, mainEnd,
        postStart, postEnd,
    };

    if (state.editing) {
        const idx = state.hacks.findIndex(h => h.id === state.editing);
        if (idx !== -1) {
            state.hacks[idx] = { ...state.hacks[idx], ...hackData };
            showToast('✅', 'Hack updated successfully.');
        }
    } else {
        state.hacks.push({
            id: generateId(),
            ...hackData,
            createdAt: new Date().toISOString()
        });
        showToast('✅', 'Hack added successfully.');
    }

    saveData();
    renderSidebar();
    renderCalendarRows();
    hideModal();
}

function handleDelete() {
    if (!state.editing) return;
    if (!confirm('Are you sure you want to delete this hack?')) return;
    state.hacks = state.hacks.filter(h => h.id !== state.editing);
    saveData();
    renderSidebar();
    renderCalendarRows();
    hideModal();
    showToast('🗑️', 'Hack deleted.');
}

// ============================================
// NAVIGATION
// ============================================
function scrollToToday() {
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const offset = dayOffset(todayDate);
    const scrollTarget = Math.max(0, offset * DAY_WIDTH - $calendarWrapper.clientWidth / 3);
    $calendarWrapper.scrollTo({ left: scrollTarget, behavior: 'smooth' });
}

function scrollToYear(year) {
    let offset = 0;
    for (const y of state.years) {
        if (y === year) break;
        for (let m = 0; m < 12; m++) {
            offset += daysInMonth(y, m);
        }
    }
    $calendarWrapper.scrollTo({ left: offset * DAY_WIDTH, behavior: 'smooth' });
}

function scrollByMonth(direction) {
    const scrollLeft = $calendarWrapper.scrollLeft;
    let accum = 0;
    for (const year of state.years) {
        for (let m = 0; m < 12; m++) {
            const monthWidth = daysInMonth(year, m) * DAY_WIDTH;
            if (direction > 0 && accum + monthWidth > scrollLeft + 10) {
                $calendarWrapper.scrollTo({ left: accum + monthWidth, behavior: 'smooth' });
                return;
            }
            if (direction < 0 && accum >= scrollLeft - 10) {
                $calendarWrapper.scrollTo({ left: Math.max(0, accum - monthWidth), behavior: 'smooth' });
                return;
            }
            accum += monthWidth;
        }
    }
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, ch => map[ch]);
}

function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function adjustColor(hex, amount) {
    hex = hex.replace('#', '');
    let r = Math.min(255, parseInt(hex.substring(0, 2), 16) + amount);
    let g = Math.min(255, parseInt(hex.substring(2, 4), 16) + amount);
    let b = Math.min(255, parseInt(hex.substring(4, 6), 16) + amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function showToast(icon, message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon">${icon}</span> ${message}`;
    $toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ============================================
// AUTO-CHAIN DATE FIELDS
// ============================================
function setupDateChaining() {
    $preEnd.addEventListener('change', () => {
        if ($preEnd.value) {
            const next = addDays(parseDate($preEnd.value), 1);
            $mainStart.value = formatDateInput(next);
            if (!$mainEnd.value || $mainEnd.value < $mainStart.value) {
                $mainEnd.value = formatDateInput(addDays(next, 2));
            }
        }
    });

    $mainEnd.addEventListener('change', () => {
        if ($mainEnd.value) {
            const next = addDays(parseDate($mainEnd.value), 1);
            $postStart.value = formatDateInput(next);
            if (!$postEnd.value || $postEnd.value < $postStart.value) {
                $postEnd.value = formatDateInput(addDays(next, 4));
            }
        }
    });
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
    $('btn-add-hack').addEventListener('click', openAddModal);
    $('modal-close').addEventListener('click', hideModal);
    $('btn-cancel').addEventListener('click', hideModal);
    $modalOverlay.addEventListener('click', (e) => {
        if (e.target === $modalOverlay) hideModal();
    });

    $hackForm.addEventListener('submit', handleSave);
    $btnDelete.addEventListener('click', handleDelete);

    // Add document button
    $('btn-add-doc').addEventListener('click', () => {
        $docList.appendChild(createDocEntry());
    });

    // Handle remove buttons on the initial doc entry
    $docList.querySelectorAll('.doc-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const entry = btn.closest('.doc-entry');
            if ($docList.querySelectorAll('.doc-entry').length > 1) {
                entry.remove();
            } else {
                entry.querySelector('.doc-name-input').value = '';
                entry.querySelector('.doc-url-input').value = '';
            }
        });
    });

    $('btn-today').addEventListener('click', scrollToToday);
    $('btn-prev-month').addEventListener('click', () => scrollByMonth(-1));
    $('btn-next-month').addEventListener('click', () => scrollByMonth(1));

    $calendarWrapper.addEventListener('scroll', () => {
        requestAnimationFrame(updateViewLabel);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && $modalOverlay.classList.contains('active')) {
            hideModal();
        }
    });

    setupDateChaining();
}

// ============================================
// INITIALIZATION
// ============================================
function init() {
    loadData();
    renderCalendar();
    renderSidebar();
    initEventListeners();
    setTimeout(scrollToToday, 300);
}

init();

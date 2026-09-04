/**
 * HinTeach — Module: Thời khoá biểu (schedule)
 *
 * M1  — Calendar shell + session list (read-only)
 * M2  — Create single session
 * M3  — Recurrence
 * M4  — Edit/Delete recurrence
 * M5  — Quick entry / session record / score
 * M6  — Calendar actions (context menu, copy/paste, duplicate, display color)
 * M7  — Calendar interaction (drag create, drag move)
 *
 * Shape: export default { async render(container) } — giống classes.js / students.js.
 * Không dùng thư viện ngoài. Không tự tạo state/framework riêng.
 *
 * @package HinTeach
 */

const ScheduleModule = {

    // ── M7 Time-grid constants ─────────────────────────────────
    /** Pixel height cho mỗi giờ trong time-grid */
    HOUR_HEIGHT: 48,
    /** Giờ bắt đầu hiển thị (06:00) */
    DAY_START_HOUR: 6,
    /** Giờ kết thúc hiển thị (24:00) */
    DAY_END_HOUR: 24,
    /** Snap đơn vị phút khi kéo */
    SNAP_MINUTES: 30,
    /** Threshold pixel trước khi coi là drag (không phải click) */
    DRAG_THRESHOLD: 6,

    /** Ngày bất kỳ trong tuần đang xem — state nội bộ */
    _currentDate: new Date(),

    /** Danh sách sessions tuần hiện tại */
    _sessions: [],

    /** Clipboard lưu session in-memory */
    _calendarSessionClipboard: null,

    /** Reference context menu element đang mở */
    _contextMenuEl: null,

    /** Flag suppress click sau khi drag move xong */
    _dragClickSuppressed: false,

    // ──────────────────────────────────────────────────────────
    // Entry point — gọi bởi HT.router.navigate('schedule')
    // ──────────────────────────────────────────────────────────

    /**
     * Render module vào container.
     * @param {HTMLElement} container
     */
    async render(container) {
        // Reset về tuần hiện tại mỗi lần mount tab
        this._currentDate = new Date();
        this._dismissContextMenu();

        container.innerHTML = `
            <div class="ht-module ht-module--schedule">
                <div class="ht-module__header">
                    <h2 class="ht-module__title">Thời khoá biểu</h2>
                    <button type="button" class="ht-btn ht-btn--primary" id="ht-session-add">+ Tạo buổi mới</button>
                </div>
                <div id="ht-schedule-calendar"></div>
            </div>
        `;

        // Bind sự kiện tạo buổi
        document.getElementById('ht-session-add')
            ?.addEventListener('click', () => this._openCreateForm());

        await this._render();
    },

    // ──────────────────────────────────────────────────────────
    // Render calendar
    // ──────────────────────────────────────────────────────────

    /**
     * Render lại toàn bộ calendar (header nav + 7 cột ngày).
     * Gọi API hinteach_session_list để lấy sessions trong khoảng tuần.
     */
    async _render() {
        const cal = document.getElementById('ht-schedule-calendar');
        if (!cal) return;

        this._dismissContextMenu();
        const week = this._getWeekRange(this._currentDate);

        try {
            const sessions = await this._loadSessions(week.fromStr, week.toStr);
            this._sessions = sessions;
            cal.innerHTML = this._buildCalendarHtml(week, sessions);
            this._bindNavEvents();
            this._bindSessionEvents();       // M4 click/contextmenu + M7 drag move
            this._bindCalendarAreaEvents();  // M6 contextmenu vùng trống + M7 drag create
        } catch (err) {
            cal.innerHTML = `<div class="ht-error"><p>Lỗi tải lịch: ${HT.utils.escapeHtml(err.message)}</p></div>`;
        }
    },

    /**
     * Build toàn bộ HTML calendar tuần — M7: time-grid layout.
     *
     * @param {{ from: Date, to: Date, fromStr: string, toStr: string }} week
     * @param {Array} sessions
     * @returns {string} HTML string
     */
    /**
     * Build toàn bộ HTML calendar tuần — M7 time-grid layout + M8 Phase 3 Week View enhancements:
     * - Summary Cards (Tổng buổi, Tổng giờ, 1-1/Lớp học, Tổng tiền)
     * - Navigation bar (Week/Month switch, Hôm nay button, prev/next, week range label)
     * - Daily revenue in each day header
     *
     * @param {{ from: Date, to: Date, fromStr: string, toStr: string }} week
     * @param {Array} sessions
     * @returns {string} HTML string
     */
    _buildCalendarHtml(week, sessions) {
        const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        const today = this._toIso(new Date());
        const totalHours = this.DAY_END_HOUR - this.DAY_START_HOUR;
        const gridHeight = totalHours * this.HOUR_HEIGHT;

        // ── M8 Phase 3: Tính toán Summary Cards ──────────────────
        const totalCount = sessions.length;
        let totalMinutes = 0;
        let privateCount = 0;
        let groupCount = 0;
        let totalMoney = 0;

        for (const s of sessions) {
            const startM = this._timeToMinutes(s.start_time);
            const endM = this._timeToMinutes(s.end_time || s.start_time);
            if (endM > startM) {
                totalMinutes += (endM - startM);
            }
            if (s.type === 'riêng') {
                privateCount++;
            } else if (s.type === 'chung') {
                groupCount++;
            }
            const p = parseFloat(s.price);
            if (Number.isFinite(p) && p > 0) {
                totalMoney += p;
            }
        }

        const summaryHours = (totalMinutes / 60).toFixed(1);
        const summaryRatio = `${privateCount}/${groupCount}`;
        const summaryMoney = HT.utils.formatCurrency(totalMoney);

        const summaryHtml = `
            <div class="ht-cal-summary-grid">
                <div class="ht-cal-summary-card">
                    <div class="ht-cal-summary-card__label">TỔNG BUỔI</div>
                    <div class="ht-cal-summary-card__value">${totalCount}</div>
                </div>
                <div class="ht-cal-summary-card">
                    <div class="ht-cal-summary-card__label">TỔNG GIỜ</div>
                    <div class="ht-cal-summary-card__value">${summaryHours}</div>
                </div>
                <div class="ht-cal-summary-card">
                    <div class="ht-cal-summary-card__label">1-1/LỚP HỌC</div>
                    <div class="ht-cal-summary-card__value">${summaryRatio}</div>
                </div>
                <div class="ht-cal-summary-card">
                    <div class="ht-cal-summary-card__label">TỔNG TIỀN</div>
                    <div class="ht-cal-summary-card__value">${summaryMoney}</div>
                </div>
            </div>
        `;

        // Nhóm session theo ngày
        const byDay = {};
        for (const s of sessions) {
            if (!byDay[s.date]) byDay[s.date] = [];
            byDay[s.date].push(s);
        }

        // Mảng 7 ngày T2..CN
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(week.from);
            d.setDate(week.from.getDate() + i);
            days.push(this._toIso(d));
        }

        // Label header: DD/MM - DD/MM/YYYY
        const headerLabel = `${this._fmtShort(week.fromStr)} – ${this._fmtShort(week.toStr)}/${week.toStr.slice(0, 4)}`;

        // Navigation Toolbar (M8 Phase 3: Switch Tuần/Tháng + Nút Hôm nay)
        const navHtml = `
            <div class="ht-cal__nav">
                <div class="ht-cal__view-switch">
                    <button type="button" class="ht-btn ht-btn--sm ht-cal__view-btn is-active" data-view="week">Tuần</button>
                    <button type="button" class="ht-btn ht-btn--sm ht-cal__view-btn" data-view="month">Tháng</button>
                </div>
                <div class="ht-cal__nav-controls">
                    <button type="button" class="ht-btn ht-btn--ghost ht-btn--icon" id="ht-cal-prev" title="Tuần trước" aria-label="Tuần trước">‹</button>
                    <button type="button" class="ht-btn ht-btn--ghost" id="ht-cal-today">Hôm nay</button>
                    <button type="button" class="ht-btn ht-btn--ghost ht-btn--icon" id="ht-cal-next" title="Tuần sau" aria-label="Tuần sau">›</button>
                    <span class="ht-cal__week-label">${HT.utils.escapeHtml(headerLabel)}</span>
                </div>
            </div>
        `;

        // Hour rows HTML — dùng chung cho mọi cột ngày
        let hourRowsHtml = '';
        for (let h = this.DAY_START_HOUR; h <= this.DAY_END_HOUR; h++) {
            const top = (h - this.DAY_START_HOUR) * this.HOUR_HEIGHT;
            const cls = h % 1 === 0 ? 'ht-cal__hour-row ht-cal__hour-row--full' : 'ht-cal__hour-row';
            hourRowsHtml += `<div class="${cls}" style="top:${top}px;"></div>`;
        }

        // Time gutter (cột trục giờ bên trái)
        let gutterHtml = '<div class="ht-cal__time-gutter"><div class="ht-cal__time-gutter-header"></div><div class="ht-cal__time-gutter-body" style="height:' + gridHeight + 'px;">';
        for (let h = this.DAY_START_HOUR; h <= this.DAY_END_HOUR; h++) {
            const top = (h - this.DAY_START_HOUR) * this.HOUR_HEIGHT;
            gutterHtml += `<span class="ht-cal__hour-label" style="top:${top}px;">${String(h).padStart(2, '0')}:00</span>`;
        }
        gutterHtml += '</div></div>';

        // Cột ngày — M8 Phase 3: thêm Daily revenue dưới tên thứ
        const colsHtml = days.map((isoDate, i) => {
            const isToday = isoDate === today;
            const daySessions = byDay[isoDate] || [];

            let dayRevenue = 0;
            for (const s of daySessions) {
                const p = parseFloat(s.price);
                if (Number.isFinite(p) && p > 0) {
                    dayRevenue += p;
                }
            }
            const dayRevenueStr = HT.utils.formatCurrency(dayRevenue);

            const blocks = daySessions
                .map(s => this._renderSessionBlock(s))
                .join('');

            return `
                <div class="ht-cal__col${isToday ? ' ht-cal__col--today' : ''}">
                    <div class="ht-cal__day-header">
                        <div class="ht-cal__day-title">
                            <span class="ht-cal__day-name">${DAY_LABELS[i]}</span>
                            <span class="ht-cal__day-sep">·</span>
                            <span class="ht-cal__day-date">${this._fmtShort(isoDate)}</span>
                        </div>
                        <div class="ht-cal__day-revenue">${dayRevenueStr}</div>
                    </div>
                    <div class="ht-cal__day-body" data-date="${isoDate}" style="height:${gridHeight}px;">
                        ${hourRowsHtml}
                        ${blocks}
                    </div>
                </div>
            `;
        }).join('');

        return `
            ${navHtml}
            ${summaryHtml}
            <div class="ht-cal__grid">
                ${gutterHtml}
                ${colsHtml}
            </div>
        `;
    },

    /**
     * Chuyển hex color thành rgba() với alpha cho trước (mặc định 0.12).
     * @param {string} hex
     * @param {number} alpha
     * @returns {string}
     */
    _hexToRgba(hex, alpha = 0.12) {
        if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
            return `rgba(74, 144, 217, ${alpha})`;
        }
        let clean = hex.slice(1);
        if (clean.length === 3) {
            clean = clean.split('').map(c => c + c).join('');
        }
        if (clean.length !== 6) {
            return `rgba(74, 144, 217, ${alpha})`;
        }
        const num = parseInt(clean, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

    /**
     * Render 1 session block — M7: absolute position theo start_time/end_time.
     * M8 Phase 3:
     * - Recurrence indicator: icon ↻ khi session thuộc chuỗi lặp (repeat_group_id)
     * - Price display: hiển thị học phí nếu price > 0
     *
     * @param {Object} s  Session object
     * @returns {string} HTML string
     */
    _renderSessionBlock(s) {
        const rawColor = s.display_color || s.class_color || '#4A90D9';
        const color = HT.utils.escapeHtml(rawColor);
        const bgColor = this._hexToRgba(rawColor, 0.12);
        const name = HT.utils.escapeHtml(s.class_name || '');
        const sessName = s.session_name ? HT.utils.escapeHtml(s.session_name) : '';
        const timeStr = this._fmtTime(s.start_time) +
            (s.end_time ? ' – ' + this._fmtTime(s.end_time) : '');

        // Tính top/height từ start_time/end_time
        const startM = this._timeToMinutes(s.start_time);
        const endM = this._timeToMinutes(s.end_time || s.start_time);
        const dayStartM = this.DAY_START_HOUR * 60;
        const top = Math.max(0, (startM - dayStartM) / 60 * this.HOUR_HEIGHT);
        const height = Math.max(20, (endM - startM) / 60 * this.HOUR_HEIGHT);

        // M8 Phase 3: Recurrence indicator
        const isRecurring = Boolean(s.repeat_group_id && Number(s.repeat_group_id) > 0);
        const repeatIconHtml = isRecurring
            ? `<span class="ht-session-block__repeat" title="Buổi học thuộc chuỗi lặp" aria-label="Lịch lặp lại">↻</span>`
            : '';

        // M8 Phase 3: Price display on session block
        const priceNum = parseFloat(s.price);
        const priceHtml = (Number.isFinite(priceNum) && priceNum > 0)
            ? `<div class="ht-session-block__price">${HT.utils.formatCurrency(priceNum)}</div>`
            : '';

        return `
            <div class="ht-session-block" data-id="${s.id}" style="border-left:3px solid ${color}; background-color:${bgColor}; top:${top}px; height:${height}px;">
                ${repeatIconHtml}
                <div class="ht-session-block__time">${HT.utils.escapeHtml(timeStr)}</div>
                <div class="ht-session-block__name">${name}</div>
                ${sessName ? `<div class="ht-session-block__title">${sessName}</div>` : ''}
                ${priceHtml}
            </div>
        `;
    },

    /**
     * Bind click, contextmenu, và M7 drag-move trên các session block.
     * click → edit form (M4) — suppressed nếu vừa drag xong.
     * contextmenu → session context menu (M6).
     * pointerdown → bắt đầu drag-move tracking (M7).
     */
    _bindSessionEvents() {
        document.querySelectorAll('.ht-session-block[data-id]').forEach(el => {
            el.addEventListener('click', (e) => {
                // Suppress click nếu vừa hoàn thành drag move
                if (this._dragClickSuppressed) return;
                const id = parseInt(el.dataset.id, 10);
                if (id) this._openEditForm(id);
            });
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = parseInt(el.dataset.id, 10);
                if (id) this._showSessionContextMenu(e, id);
            });
            // M7: Drag Move — pointerdown
            el.addEventListener('pointerdown', (e) => {
                // Chỉ main button (left click)
                if (e.button !== 0) return;
                const id = parseInt(el.dataset.id, 10);
                if (id) this._onSessionPointerDown(e, el, id);
            });
        });
    },

    /**
     * Bind contextmenu (M6) và drag-create pointerdown (M7) trên vùng lịch trống.
     */
    _bindCalendarAreaEvents() {
        document.querySelectorAll('.ht-cal__day-body[data-date]').forEach(el => {
            el.addEventListener('contextmenu', (e) => {
                if (e.target.closest('.ht-session-block')) return;
                e.preventDefault();
                e.stopPropagation();
                const date = el.dataset.date;
                if (date) this._showEmptyContextMenu(e, date);
            });
            // M7: Drag Create — pointerdown trên vùng trống
            el.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                if (e.target.closest('.ht-session-block')) return;
                const date = el.dataset.date;
                if (date) this._onCreatePointerDown(e, el, date);
            });
        });
    },

    // ──────────────────────────────────────────────────────────
    // Navigation
    // ──────────────────────────────────────────────────────────

    /**
     * Chuyển tuần.
     * @param {number} delta  -1 = tuần trước, +1 = tuần sau
     */
    _navigate(delta) {
        this._currentDate = new Date(this._currentDate);
        this._currentDate.setDate(this._currentDate.getDate() + delta * 7);
        this._render();
    },

    /** Bind nút điều hướng và chuyển chế độ xem sau mỗi lần render */
    _bindNavEvents() {
        document.getElementById('ht-cal-prev')
            ?.addEventListener('click', () => this._navigate(-1));
        document.getElementById('ht-cal-next')
            ?.addEventListener('click', () => this._navigate(+1));
        document.getElementById('ht-cal-today')
            ?.addEventListener('click', () => {
                this._currentDate = new Date();
                this._render();
            });

        document.querySelectorAll('.ht-cal__view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Phase 3: Tuần là chế độ duy nhất active, nút Tháng là visual shell (không render Month, không toast)
                return;
            });
        });
    },

    // ──────────────────────────────────────────────────────────
    // API call
    // ──────────────────────────────────────────────────────────

    /**
     * Gọi API hinteach_session_list để lấy sessions trong khoảng ngày.
     *
     * @param {string} fromStr  'YYYY-MM-DD'
     * @param {string} toStr    'YYYY-MM-DD'
     * @returns {Promise<Array>}
     */
    async _loadSessions(fromStr, toStr) {
        const data = await HT.api.call('hinteach_session_list', {
            date_from: fromStr,
            date_to: toStr,
        }, 'GET');
        return data.sessions || [];
    },

    // ──────────────────────────────────────────────────────────
    // Date utilities
    // ──────────────────────────────────────────────────────────

    /**
     * Lấy khoảng T2–CN của tuần chứa `date`.
     *
     * @param {Date} date
     * @returns {{ from: Date, to: Date, fromStr: string, toStr: string }}
     */
    _getWeekRange(date) {
        const d = new Date(date);
        const day = d.getDay();            // 0=CN,1=T2,...,6=T7
        const offset = (day + 6) % 7;      // T2→0, T3→1, ..., CN→6

        const from = new Date(d);
        from.setDate(d.getDate() - offset); // T2 của tuần

        const to = new Date(from);
        to.setDate(from.getDate() + 6);     // CN của tuần

        return { from, to, fromStr: this._toIso(from), toStr: this._toIso(to) };
    },

    /** Date → 'YYYY-MM-DD' */
    _toIso(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    /** 'YYYY-MM-DD' → 'DD/MM' */
    _fmtShort(iso) {
        return iso.slice(8, 10) + '/' + iso.slice(5, 7);
    },

    /** 'HH:MM:SS' hoặc 'HH:MM' → 'HH:MM' */
    _fmtTime(timeStr) {
        if (!timeStr) return '';
        return timeStr.slice(0, 5);
    },

    // ──────────────────────────────────────────────────────────
    // M2: Tạo buổi học
    // ──────────────────────────────────────────────────────────

    /**
     * Mở form tạo buổi học mới.
     * Load danh sách lớp, hiển modal, bind events.
     * Hỗ trợ prefill khi Dán buổi học (Paste — M6)
     * hoặc khi kéo tạo buổi (Drag Create — M7).
     *
     * M7: prefill có thể chứa { date, start_time, end_time } từ vùng kéo.
     *
     * @param {Object|null} prefill
     */
    async _openCreateForm(prefill = null) {
        // Load danh sách lớp
        let classes = [];
        try {
            const data = await HT.api.call('hinteach_class_list', {}, 'POST');
            classes = data.classes || [];
        } catch (err) {
            HT.utils.toast('Không thể tải danh sách lớp: ' + err.message, 'error');
            return;
        }

        if (!classes.length) {
            HT.utils.toast('Chưa có lớp học nào. Vui lòng tạo lớp trước.', 'error');
            return;
        }

        const today = this._toIso(new Date());
        const defaultDate = prefill?.date || today;
        const modalTitle = prefill?.isPaste ? 'Tạo buổi học (Dán)' : 'Tạo buổi học mới';

        HT.modal.open({
            title: modalTitle,
            body: this._buildCreateFormHtml(classes, defaultDate, prefill),
            footer: `
                <button type="button" class="ht-btn ht-btn--secondary" id="ht-session-form-cancel">Huỷ</button>
                <button type="button" class="ht-btn ht-btn--primary" id="ht-session-form-save">Tạo buổi</button>
            `,
        });

        // Internal state for repeat dates
        this._repeatDates = [];

        // Bind events
        document.getElementById('ht-session-form-cancel')
            ?.addEventListener('click', () => HT.modal.close());
        document.getElementById('ht-session-form-save')
            ?.addEventListener('click', () => this._saveSession());
        document.getElementById('ht-sf-class')
            ?.addEventListener('change', (e) => this._onClassChange(e.target.value));
        document.querySelectorAll('input[name="type"]').forEach(r => {
            r.addEventListener('change', () => this._onTypeChange());
        });
        document.getElementById('ht-sf-color-toggle')
            ?.addEventListener('change', (e) => {
                const colorInput = document.getElementById('ht-sf-color');
                if (colorInput) colorInput.disabled = !e.target.checked;
            });

        // M3: Recurrence event bindings
        document.getElementById('ht-sf-repeat-toggle')
            ?.addEventListener('change', (e) => {
                const panel = document.getElementById('ht-sf-repeat-panel');
                if (panel) panel.style.display = e.target.checked ? '' : 'none';
                if (!e.target.checked) {
                    this._repeatDates = [];
                    this._renderRepeatChips();
                }
            });
        document.querySelectorAll('input[name="repeat_mode"]').forEach(r => {
            r.addEventListener('change', () => this._onRecurrenceChange());
        });
        document.getElementById('ht-sf-repeat-until')
            ?.addEventListener('change', () => this._onRecurrenceChange());
        document.querySelectorAll('.ht-weekday-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('ht-weekday-btn--active');
                this._onRecurrenceChange();
            });
        });
        document.getElementById('ht-sf-repeat-gen')
            ?.addEventListener('click', () => this._onRecurrenceChange());
        document.getElementById('ht-sf-custom-date')
            ?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this._addCustomRepeatDate(); }
            });
        document.getElementById('ht-sf-custom-add')
            ?.addEventListener('click', () => this._addCustomRepeatDate());

        // Nếu có prefill class_id (Paste), load học sinh và check checkboxes
        if (prefill?.class_id) {
            await this._onClassChange(prefill.class_id, prefill.student_ids || [], prefill.price);
        }
    },

    /**
     * Build HTML form tạo buổi học.
     *
     * @param {Array} classes        Danh sách lớp
     * @param {string} defaultDate   YYYY-MM-DD
     * @param {Object|null} prefill  Dữ liệu prefill (Paste)
     * @returns {string} HTML
     */
    _buildCreateFormHtml(classes, defaultDate, prefill = null) {
        const selectedClassId = prefill?.class_id ? Number(prefill.class_id) : '';
        const startTime = prefill?.start_time || '';
        const endTime = prefill?.end_time || '';
        const type = prefill?.type || 'riêng';
        const price = prefill?.price !== undefined ? prefill.price : 0;
        const sessionName = prefill?.session_name ? HT.utils.escapeHtml(prefill.session_name) : '';
        const content = prefill?.content ? HT.utils.escapeHtml(prefill.content) : '';
        const homework = prefill?.homework_content ? HT.utils.escapeHtml(prefill.homework_content) : '';
        const comment = prefill?.general_comment ? HT.utils.escapeHtml(prefill.general_comment) : '';

        return `
            <form id="ht-session-form" class="ht-form">
                <fieldset class="ht-form__fieldset">
                    <legend>Lớp học</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-class">Lớp *</label>
                        <select id="ht-sf-class" name="class_id" class="ht-form__select" required>
                            <option value="">-- Chọn lớp --</option>
                            ${classes.map(c => `
                                <option value="${c.id}" data-fee="${c.fee_amount || 0}" ${Number(c.id) === selectedClassId ? 'selected' : ''}>
                                    ${HT.utils.escapeHtml(c.name)}
                                </option>
                            ` ).join('')}
                        </select>
                    </div>
                </fieldset>

                <fieldset class="ht-form__fieldset">
                    <legend>Thời gian</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-date">Ngày *</label>
                        <input type="date" id="ht-sf-date" name="date" class="ht-form__input" required value="${defaultDate}" />
                    </div>
                    <div class="ht-form__row">
                        <div class="ht-form__row-half">
                            <label class="ht-form__label" for="ht-sf-start">Bắt đầu *</label>
                            <input type="time" id="ht-sf-start" name="start_time" class="ht-form__input" required value="${startTime}" />
                        </div>
                        <div class="ht-form__row-half">
                            <label class="ht-form__label" for="ht-sf-end">Kết thúc *</label>
                            <input type="time" id="ht-sf-end" name="end_time" class="ht-form__input" required value="${endTime}" />
                        </div>
                    </div>
                </fieldset>

                <fieldset class="ht-form__fieldset">
                    <legend>Loại buổi & Học sinh</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label">Loại buổi *</label>
                        <div class="ht-form__radio-group">
                            <label><input type="radio" name="type" value="riêng" ${type === 'riêng' ? 'checked' : ''} /> Riêng (1-1)</label>
                            <label><input type="radio" name="type" value="chung" ${type === 'chung' ? 'checked' : ''} /> Chung (nhóm)</label>
                        </div>
                    </div>
                    <div class="ht-form__row" id="ht-sf-students-container">
                        <label class="ht-form__label">Học sinh *</label>
                        <p class="ht-form__note">Chọn lớp trước để xem danh sách học sinh.</p>
                    </div>
                </fieldset>

                <fieldset class="ht-form__fieldset">
                    <legend>Chi tiết</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-price">Học phí buổi</label>
                        <input type="number" id="ht-sf-price" name="price" class="ht-form__input" min="0" step="1000" value="${price}" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-name">Tên buổi học</label>
                        <input type="text" id="ht-sf-name" name="session_name" class="ht-form__input" placeholder="(Tuỳ chọn)" value="${sessionName}" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-content">Nội dung buổi học</label>
                        <textarea id="ht-sf-content" name="content" class="ht-form__textarea" rows="2" placeholder="(Tuỳ chọn)">${content}</textarea>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-homework">Nội dung bài tập về nhà</label>
                        <textarea id="ht-sf-homework" name="homework_content" class="ht-form__textarea" rows="2" placeholder="(Tuỳ chọn)">${homework}</textarea>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-comment">Nhận xét chung</label>
                        <textarea id="ht-sf-comment" name="general_comment" class="ht-form__textarea" rows="2" placeholder="(Tuỳ chọn)">${comment}</textarea>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label">Màu hiển thị</label>
                        <div class="ht-form__inline-group">
                            <label class="ht-form__checkbox-inline">
                                <input type="checkbox" id="ht-sf-color-toggle" /> Dùng màu riêng
                            </label>
                            <input type="color" id="ht-sf-color" name="display_color"
                                   class="ht-form__input ht-form__input--color" value="#4A90D9" disabled />
                        </div>
                    </div>
                </fieldset>

                <fieldset class="ht-form__fieldset">
                    <legend>Lặp lịch</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__checkbox-inline">
                            <input type="checkbox" id="ht-sf-repeat-toggle" /> Lặp lại buổi học này
                        </label>
                    </div>
                    <div id="ht-sf-repeat-panel" style="display:none">
                        <div class="ht-form__row">
                            <label class="ht-form__label">Kiểu lặp</label>
                            <div class="ht-form__radio-group">
                                <label><input type="radio" name="repeat_mode" value="daily" checked /> Hằng ngày</label>
                                <label><input type="radio" name="repeat_mode" value="weekly" /> Hằng tuần</label>
                                <label><input type="radio" name="repeat_mode" value="monthly" /> Hằng tháng</label>
                                <label><input type="radio" name="repeat_mode" value="custom" /> Tuỳ chọn</label>
                            </div>
                        </div>
                        <div class="ht-form__row" id="ht-sf-repeat-until-row">
                            <label class="ht-form__label" for="ht-sf-repeat-until">Lặp đến ngày</label>
                            <input type="date" id="ht-sf-repeat-until" class="ht-form__input" />
                        </div>
                        <div class="ht-form__row" id="ht-sf-weekday-row" style="display:none">
                            <label class="ht-form__label">Các thứ trong tuần</label>
                            <div class="ht-weekday-picker">
                                <button type="button" class="ht-weekday-btn" data-day="1">T2</button>
                                <button type="button" class="ht-weekday-btn" data-day="2">T3</button>
                                <button type="button" class="ht-weekday-btn" data-day="3">T4</button>
                                <button type="button" class="ht-weekday-btn" data-day="4">T5</button>
                                <button type="button" class="ht-weekday-btn" data-day="5">T6</button>
                                <button type="button" class="ht-weekday-btn" data-day="6">T7</button>
                                <button type="button" class="ht-weekday-btn" data-day="0">CN</button>
                            </div>
                        </div>
                        <div class="ht-form__row" id="ht-sf-custom-row" style="display:none">
                            <label class="ht-form__label">Thêm ngày thủ công</label>
                            <div class="ht-form__inline-group">
                                <input type="date" id="ht-sf-custom-date" class="ht-form__input" />
                                <button type="button" class="ht-btn ht-btn--ghost" id="ht-sf-custom-add">+ Thêm</button>
                            </div>
                        </div>
                        <div class="ht-form__row" id="ht-sf-repeat-gen-row">
                            <button type="button" class="ht-btn ht-btn--ghost" id="ht-sf-repeat-gen">Tạo danh sách ngày lặp</button>
                        </div>
                        <div class="ht-form__row">
                            <label class="ht-form__label">Ngày lặp (<span id="ht-sf-repeat-count">0</span> ngày)</label>
                            <div id="ht-sf-repeat-chips" class="ht-chip-list"></div>
                        </div>
                    </div>
                </fieldset>
            </form>
        `;
    },

    /**
     * Khi chọn lớp → load danh sách học sinh + prefill giá.
     *
     * @param {string} classId
     * @param {Array} prefillStudentIds
     * @param {number|null} prefillPrice
     */
    async _onClassChange(classId, prefillStudentIds = [], prefillPrice = null) {
        const container = document.getElementById('ht-sf-students-container');
        if (!container) return;

        if (!classId) {
            container.innerHTML = `
                <label class="ht-form__label">Học sinh *</label>
                <p class="ht-form__note">Chọn lớp trước để xem danh sách học sinh.</p>
            `;
            return;
        }

        container.innerHTML = `
            <label class="ht-form__label">Học sinh *</label>
            <p class="ht-form__note">Đang tải...</p>
        `;

        try {
            const data = await HT.api.call('hinteach_class_get', { class_id: classId }, 'GET');
            const students = data.students || [];
            const classData = data.class;

            // Prefill giá từ class.fee_amount hoặc prefillPrice nếu có
            const priceInput = document.getElementById('ht-sf-price');
            if (priceInput) {
                if (prefillPrice !== null && prefillPrice !== undefined) {
                    priceInput.value = prefillPrice;
                } else if (classData && classData.fee_amount) {
                    priceInput.value = classData.fee_amount;
                }
            }

            this._renderStudentsList(students, prefillStudentIds);
        } catch (err) {
            container.innerHTML = `
                <label class="ht-form__label">Học sinh *</label>
                <p class="ht-form__note">Lỗi tải danh sách: ${HT.utils.escapeHtml(err.message)}</p>
            `;
        }
    },

    /**
     * Render danh sách học sinh (checkboxes) trong form.
     *
     * @param {Array} students
     * @param {Array} prefillStudentIds
     */
    _renderStudentsList(students, prefillStudentIds = []) {
        const container = document.getElementById('ht-sf-students-container');
        if (!container) return;

        if (!students.length) {
            container.innerHTML = `
                <label class="ht-form__label">Học sinh *</label>
                <p class="ht-form__note">Lớp này chưa có học sinh nào.</p>
            `;
            return;
        }

        const type = document.querySelector('input[name="type"]:checked')?.value || 'riêng';
        const hint = type === 'riêng' ? '(chọn 1)' : '(chọn ít nhất 2)';
        const selectedIds = Array.isArray(prefillStudentIds) ? prefillStudentIds.map(id => Number(id)) : [];

        container.innerHTML = `
            <label class="ht-form__label">Học sinh * ${hint}</label>
            <div class="ht-multi-select" id="ht-sf-students">
                ${students.map(s => {
            const checked = selectedIds.includes(Number(s.id)) ? 'checked' : '';
            return `
                        <label class="ht-multi-select__item">
                            <input type="checkbox" name="student_ids" value="${s.id}" ${checked} />
                            <span>${HT.utils.escapeHtml(s.name)}</span>
                        </label>
                    `;
        }).join('')}
            </div>
        `;
    },

    /** Cập nhật label học sinh khi đổi type riêng/chung. */
    _onTypeChange() {
        const studentsDiv = document.getElementById('ht-sf-students');
        if (!studentsDiv) return;

        const type = document.querySelector('input[name="type"]:checked')?.value || 'riêng';
        const hint = type === 'riêng' ? '(chọn 1)' : '(chọn ít nhất 2)';
        const label = studentsDiv.closest('.ht-form__row')?.querySelector('.ht-form__label');
        if (label) {
            label.textContent = `Học sinh * ${hint}`;
        }
    },

    // ──────────────────────────────────────────────────────────
    // M3: Recurrence helpers
    // ──────────────────────────────────────────────────────────

    /**
     * Xử lý khi thay đổi mode lặp hoặc nhấn "Tạo danh sách ngày lặp".
     * Sinh repeat_dates theo mode (daily/weekly/monthly), render chips.
     * Custom mode không tự sinh — user thêm tay.
     */
    _onRecurrenceChange() {
        const mode = document.querySelector('input[name="repeat_mode"]:checked')?.value || 'daily';

        // Show/hide UI elements based on mode
        const untilRow = document.getElementById('ht-sf-repeat-until-row');
        const weekdayRow = document.getElementById('ht-sf-weekday-row');
        const customRow = document.getElementById('ht-sf-custom-row');
        const genRow = document.getElementById('ht-sf-repeat-gen-row');

        if (untilRow) untilRow.style.display = mode === 'custom' ? 'none' : '';
        if (weekdayRow) weekdayRow.style.display = mode === 'weekly' ? '' : 'none';
        if (customRow) customRow.style.display = mode === 'custom' ? '' : 'none';
        if (genRow) genRow.style.display = mode === 'custom' ? 'none' : '';

        // For non-custom modes, generate dates
        if (mode !== 'custom') {
            const baseDate = document.getElementById('ht-sf-date')?.value || '';
            const until = document.getElementById('ht-sf-repeat-until')?.value || '';

            if (!baseDate || !until) return;
            if (until <= baseDate) {
                HT.utils.toast('Ngày kết thúc lặp phải sau ngày gốc.', 'error');
                return;
            }

            let selectedWeekdays = [];
            if (mode === 'weekly') {
                selectedWeekdays = Array.from(
                    document.querySelectorAll('.ht-weekday-btn--active')
                ).map(btn => parseInt(btn.dataset.day, 10));

                if (!selectedWeekdays.length) {
                    HT.utils.toast('Vui lòng chọn ít nhất 1 thứ trong tuần.', 'error');
                    return;
                }
            }

            this._repeatDates = this._generateRepeatDates(mode, baseDate, until, selectedWeekdays);
            this._renderRepeatChips();
        }
    },

    /**
     * Sinh mảng ngày lặp dựa trên mode.
     *
     * @param {string} mode          'daily' | 'weekly' | 'monthly'
     * @param {string} startDate     YYYY-MM-DD (base date)
     * @param {string} until         YYYY-MM-DD (end date)
     * @param {number[]} weekdays    Mảng thứ (0=CN,1=T2,...6=T7) — chỉ dùng cho weekly
     * @returns {string[]}           Mảng YYYY-MM-DD, đã sort, slice(0, 365)
     */
    _generateRepeatDates(mode, startDate, until, weekdays) {
        const dates = [];
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(until + 'T00:00:00');

        if (mode === 'daily') {
            const cursor = new Date(start);
            cursor.setDate(cursor.getDate() + 1); // Bắt đầu từ ngày sau base
            while (cursor <= end && dates.length < 365) {
                dates.push(this._toIso(cursor));
                cursor.setDate(cursor.getDate() + 1);
            }
        } else if (mode === 'weekly') {
            const cursor = new Date(start);
            cursor.setDate(cursor.getDate() + 1);
            while (cursor <= end && dates.length < 365) {
                if (weekdays.includes(cursor.getDay())) {
                    dates.push(this._toIso(cursor));
                }
                cursor.setDate(cursor.getDate() + 1);
            }
        } else if (mode === 'monthly') {
            // Lặp cùng thứ-occurrence trong tháng (vd: thứ 3 tuần thứ 2)
            const baseDay = start.getDay(); // 0-6
            const baseOccurrence = Math.ceil(start.getDate() / 7); // Occurrence 1-5

            let month = start.getMonth();
            let year = start.getFullYear();

            while (dates.length < 365) {
                month++;
                if (month > 11) { month = 0; year++; }

                const candidate = this._nthWeekdayOfMonth(year, month, baseDay, baseOccurrence);
                if (!candidate) continue;
                if (candidate > this._toIso(end)) break;
                if (candidate <= startDate) continue;

                dates.push(candidate);
            }
        }

        // Dedupe (Set), sort, slice(0, 365) — v3 fix
        const unique = [...new Set(dates)];
        unique.sort();
        return unique.slice(0, 365);
    },

    /**
     * Tìm ngày thứ N-th weekday trong tháng.
     * VD: thứ 3 (Wednesday) tuần thứ 2 của tháng 9/2026.
     * Nếu occurrence vượt quá số tuần trong tháng → fallback lùi về occurrence cuối.
     *
     * @param {number} year
     * @param {number} month       0-11
     * @param {number} weekday     0=CN, 1=T2, ..., 6=T7
     * @param {number} occurrence  1-5
     * @returns {string|null}      'YYYY-MM-DD' hoặc null
     */
    _nthWeekdayOfMonth(year, month, weekday, occurrence) {
        // Tìm ngày đầu tiên trong tháng có đúng weekday
        const firstDay = new Date(year, month, 1);
        let firstOccurrence = 1 + ((weekday - firstDay.getDay() + 7) % 7);

        // Tính ngày target
        let targetDate = firstOccurrence + (occurrence - 1) * 7;

        // Số ngày trong tháng
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Fallback: nếu vượt quá → lùi về occurrence cuối cùng
        while (targetDate > daysInMonth) {
            targetDate -= 7;
        }

        if (targetDate < 1) return null;

        const d = new Date(year, month, targetDate);
        return this._toIso(d);
    },

    /**
     * Render chip list preview cho repeat_dates.
     */
    _renderRepeatChips() {
        const container = document.getElementById('ht-sf-repeat-chips');
        const countEl = document.getElementById('ht-sf-repeat-count');
        if (!container) return;

        if (countEl) countEl.textContent = this._repeatDates.length;

        if (!this._repeatDates.length) {
            container.innerHTML = '<p class="ht-form__note">Chưa có ngày lặp nào.</p>';
            return;
        }

        container.innerHTML = this._repeatDates.map(d => `
            <span class="ht-chip">
                ${this._fmtShort(d)}
                <button type="button" class="ht-chip__remove" data-date="${d}">&times;</button>
            </span>
        ` ).join('');

        // Bind remove events
        container.querySelectorAll('.ht-chip__remove').forEach(btn => {
            btn.addEventListener('click', () => this._removeRepeatDate(btn.dataset.date));
        });
    },

    /**
     * Xoá 1 ngày khỏi repeat_dates và re-render chips.
     * @param {string} dateStr  YYYY-MM-DD
     */
    _removeRepeatDate(dateStr) {
        this._repeatDates = this._repeatDates.filter(d => d !== dateStr);
        this._renderRepeatChips();
    },

    /**
     * Thêm 1 ngày thủ công vào repeat_dates (custom mode).
     */
    _addCustomRepeatDate() {
        const input = document.getElementById('ht-sf-custom-date');
        const baseDate = document.getElementById('ht-sf-date')?.value || '';
        if (!input || !input.value) {
            HT.utils.toast('Vui lòng chọn ngày.', 'error');
            return;
        }

        const newDate = input.value;

        if (newDate <= baseDate) {
            HT.utils.toast('Ngày lặp phải sau ngày gốc (' + this._fmtShort(baseDate) + ').', 'error');
            return;
        }

        if (this._repeatDates.includes(newDate)) {
            HT.utils.toast('Ngày này đã có trong danh sách.', 'error');
            return;
        }

        if (this._repeatDates.length >= 365) {
            HT.utils.toast('Đã đạt giới hạn 365 ngày lặp.', 'error');
            return;
        }

        this._repeatDates.push(newDate);
        this._repeatDates.sort();
        this._renderRepeatChips();
        input.value = '';
    },

    /**
     * Submit form tạo buổi học.
     * Client-side validate → gọi API → xử lý conflict 409 / success.
     * M3: nếu có repeat_dates → gọi hinteach_session_save_recurring.
     */
    async _saveSession() {
        const form = document.getElementById('ht-session-form');
        if (!form) return;

        // Collect
        const classId = form.querySelector('[name="class_id"]')?.value || '';
        const date = form.querySelector('[name="date"]')?.value || '';
        const startTime = form.querySelector('[name="start_time"]')?.value || '';
        const endTime = form.querySelector('[name="end_time"]')?.value || '';
        const type = form.querySelector('input[name="type"]:checked')?.value || '';
        const price = form.querySelector('[name="price"]')?.value || '0';
        const sessName = form.querySelector('[name="session_name"]')?.value || '';
        const content = form.querySelector('[name="content"]')?.value || '';
        const homework = form.querySelector('[name="homework_content"]')?.value || '';
        const comment = form.querySelector('[name="general_comment"]')?.value || '';

        // Color — chỉ gửi nếu checkbox bật
        const colorToggle = document.getElementById('ht-sf-color-toggle');
        const displayColor = colorToggle?.checked
            ? (form.querySelector('[name="display_color"]')?.value || '')
            : '';

        // Student IDs
        const studentCheckboxes = form.querySelectorAll('input[name="student_ids"]:checked');
        const studentIds = Array.from(studentCheckboxes).map(cb => cb.value);

        // M3: Repeat dates
        const repeatToggle = document.getElementById('ht-sf-repeat-toggle');
        const isRecurring = repeatToggle?.checked && this._repeatDates && this._repeatDates.length > 0;

        // ── Client-side validate ───────────────────────────
        if (!classId) { HT.utils.toast('Vui lòng chọn lớp.', 'error'); return; }
        if (!date) { HT.utils.toast('Vui lòng chọn ngày.', 'error'); return; }
        if (!startTime || !endTime) {
            HT.utils.toast('Vui lòng nhập giờ bắt đầu và kết thúc.', 'error'); return;
        }
        if (startTime >= endTime) {
            HT.utils.toast('Giờ bắt đầu phải trước giờ kết thúc.', 'error'); return;
        }
        if (!type) { HT.utils.toast('Vui lòng chọn loại buổi.', 'error'); return; }
        if (type === 'riêng' && studentIds.length !== 1) {
            HT.utils.toast('Buổi riêng phải chọn đúng 1 học sinh.', 'error'); return;
        }
        if (type === 'chung' && studentIds.length < 2) {
            HT.utils.toast('Buổi chung phải chọn ít nhất 2 học sinh.', 'error'); return;
        }

        // M3: validate recurring
        if (isRecurring && this._repeatDates.length > 365) {
            HT.utils.toast('Số ngày lặp tối đa là 365.', 'error'); return;
        }

        // Payload
        const payload = {
            class_id: classId,
            date: date,
            start_time: startTime,
            end_time: endTime,
            type: type,
            student_ids: studentIds,
            price: price,
            session_name: sessName,
            content: content,
            homework_content: homework,
            general_comment: comment,
            display_color: displayColor,
        };

        // M3: Thêm repeat_dates nếu recurring
        if (isRecurring) {
            payload.repeat_dates = this._repeatDates;
        }

        // Chọn action: recurring (M3) hay single (M2)
        const action = isRecurring ? 'hinteach_session_save_recurring' : 'hinteach_session_save';
        const btnLabel = isRecurring ? 'Tạo buổi lặp' : 'Tạo buổi';

        try {
            const saveBtn = document.getElementById('ht-session-form-save');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang tạo...'; }

            const result = await HT.api.call(action, payload);
            HT.modal.close();

            if (isRecurring && result.created_count) {
                HT.utils.toast(`Đã tạo ${result.created_count} buổi học thành công.`);
            } else {
                HT.utils.toast('Đã tạo buổi học thành công.');
            }
            await this._render(); // Refresh calendar
        } catch (err) {
            // Xử lý conflict 409 với structured payload
            if (err.status === 409 && err.serverData?.conflict) {
                const c = err.serverData.conflict;
                const conflictName = c.session_name
                    ? `"${HT.utils.escapeHtml(c.session_name)}"`
                    : 'buổi học';
                const conflictTime = `${this._fmtTime(c.start_time)} – ${this._fmtTime(c.end_time)}`;
                HT.utils.toast(
                    `Trùng lịch với ${conflictName} lúc ${conflictTime} ngày ${this._fmtShort(c.date)}.`,
                    'error'
                );
            } else {
                HT.utils.toast(err.message, 'error');
            }
            const saveBtn = document.getElementById('ht-session-form-save');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = btnLabel; }
        }
    },

    // ──────────────────────────────────────────────────────────
    // M4: Edit & Delete Session Handlers
    // ──────────────────────────────────────────────────────────

    /**
     * Mở modal chỉnh sửa buổi học.
     *
     * @param {number} sessionId
     */
    async _openEditForm(sessionId) {
        try {
            const [sessionData, classesData] = await Promise.all([
                HT.api.call('hinteach_session_get', { session_id: sessionId }, 'GET'),
                HT.api.call('hinteach_class_list', {}, 'POST'),
            ]);

            const session = sessionData.session;
            const classes = classesData.classes || [];

            if (!session) {
                HT.utils.toast('Không tìm thấy thông tin buổi học.', 'error');
                return;
            }

            // Load học sinh của lớp hiện tại để render danh sách chọn
            let classStudents = [];
            try {
                const classDetail = await HT.api.call('hinteach_class_get', { class_id: session.class_id }, 'GET');
                classStudents = classDetail.students || [];
            } catch (e) {
                classStudents = (session.students || []).map(s => ({ id: s.student_id, name: s.name }));
            }

            HT.modal.open({
                title: 'Chỉnh sửa buổi học',
                body: this._buildEditFormHtml(classes, session, classStudents),
                footer: `
                    <button type="button" class="ht-btn ht-btn--danger ht-btn--ghost" id="ht-session-form-delete" style="margin-right:auto;">Xoá buổi</button>
                    <button type="button" class="ht-btn ht-btn--secondary" id="ht-session-form-cancel">Huỷ</button>
                    <button type="button" class="ht-btn ht-btn--primary" id="ht-session-form-quick-entry" style="background:var(--ht-success,#16a34a);">Lưu nhật ký</button>
                    <button type="button" class="ht-btn ht-btn--primary" id="ht-session-form-update">Lưu thay đổi</button>
                `,
            });

            // Bind events
            document.getElementById('ht-session-form-cancel')
                ?.addEventListener('click', () => HT.modal.close());
            document.getElementById('ht-session-form-update')
                ?.addEventListener('click', () => this._updateSession(session));
            document.getElementById('ht-session-form-delete')
                ?.addEventListener('click', () => this._deleteSession(session));
            document.getElementById('ht-session-form-quick-entry')
                ?.addEventListener('click', () => this._saveQuickEntry(session));
            document.getElementById('ht-sf-class')
                ?.addEventListener('change', (e) => this._onClassChange(e.target.value));
            document.querySelectorAll('input[name="type"]').forEach(r => {
                r.addEventListener('change', () => this._onTypeChange());
            });
            document.getElementById('ht-sf-color-toggle')
                ?.addEventListener('change', (e) => {
                    const colorInput = document.getElementById('ht-sf-color');
                    if (colorInput) colorInput.disabled = !e.target.checked;
                });

            // M5: Bind score group add button + initialize score group counter
            this._scoreGroupCounter = 0;
            document.getElementById('ht-score-add-group')
                ?.addEventListener('click', () => this._addScoreGroup(session));

            // M5: Render existing score groups if session.grades exists
            if (session.grades && session.grades.length) {
                const existingGroupsMap = new Map();
                session.grades.forEach(g => {
                    const scoreType = g.score_type_label || (g.type === 'homework' ? 'BTVN' : (g.type === 'final' ? 'Cuối kỳ' : ''));
                    const key = `${g.test_name}___${g.scale}___${scoreType}`;
                    if (!existingGroupsMap.has(key)) {
                        existingGroupsMap.set(key, {
                            score_type: scoreType,
                            test_name: g.test_name,
                            max_score: parseFloat(g.scale) || 10,
                            entries: {},
                        });
                    }
                    existingGroupsMap.get(key).entries[parseInt(g.student_id, 10)] = {
                        score_value: g.score !== null && g.score !== undefined ? parseFloat(g.score) : null,
                        score_note: g.note || '',
                    };
                });

                existingGroupsMap.forEach(groupData => {
                    this._addScoreGroup(session, groupData);
                });
            }
        } catch (err) {
            HT.utils.toast('Không thể tải thông tin buổi học: ' + err.message, 'error');
        }
    },

    /**
     * Build HTML form chỉnh sửa buổi học.
     *
     * @param {Array} classes
     * @param {Object} session
     * @param {Array} classStudents
     * @returns {string} HTML string
     */
    _buildEditFormHtml(classes, session, classStudents) {
        const assignedStudentIds = (session.students || []).map(s => parseInt(s.student_id, 10));
        const isRecurring = !!session.repeat_group_id;
        const followingCount = session.following_count || 0;
        const hasCustomColor = !!session.display_color;
        const startTime = session.start_time ? session.start_time.slice(0, 5) : '';
        const endTime = session.end_time ? session.end_time.slice(0, 5) : '';

        const typeHint = session.type === 'riêng' ? '(chọn 1)' : '(chọn ít nhất 2)';

        const recurringNotice = isRecurring && followingCount > 0
            ? `<div class="ht-form__note" style="margin-bottom:14px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--ht-radius-sm);color:#166534;">
                 Buổi học thuộc chuỗi lặp (còn <strong>${followingCount}</strong> buổi tiếp theo). Khi lưu, bạn có thể chọn áp dụng cho riêng buổi này hoặc toàn bộ các buổi sau.
               </div>`
            : '';

        return `
            <form id="ht-session-form" class="ht-form">
                ${recurringNotice}
                <fieldset class="ht-form__fieldset">
                    <legend>Lớp học</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-class">Lớp *</label>
                        <select id="ht-sf-class" name="class_id" class="ht-form__select" required>
                            <option value="">-- Chọn lớp --</option>
                            ${classes.map(c => `
                                <option value="${c.id}" data-fee="${c.fee_amount || 0}" ${Number(c.id) === Number(session.class_id) ? 'selected' : ''}>
                                    ${HT.utils.escapeHtml(c.name)}
                                </option>
                            ` ).join('')}
                        </select>
                    </div>
                </fieldset>

                <fieldset class="ht-form__fieldset">
                    <legend>Thời gian</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-date">Ngày *</label>
                        <input type="date" id="ht-sf-date" name="date" class="ht-form__input" required value="${session.date}" />
                    </div>
                    <div class="ht-form__row">
                        <div class="ht-form__row-half">
                            <label class="ht-form__label" for="ht-sf-start">Bắt đầu *</label>
                            <input type="time" id="ht-sf-start" name="start_time" class="ht-form__input" required value="${startTime}" />
                        </div>
                        <div class="ht-form__row-half">
                            <label class="ht-form__label" for="ht-sf-end">Kết thúc *</label>
                            <input type="time" id="ht-sf-end" name="end_time" class="ht-form__input" required value="${endTime}" />
                        </div>
                    </div>
                </fieldset>

                <fieldset class="ht-form__fieldset">
                    <legend>Loại buổi & Học sinh</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label">Loại buổi *</label>
                        <div class="ht-form__radio-group">
                            <label><input type="radio" name="type" value="riêng" ${session.type === 'riêng' ? 'checked' : ''} /> Riêng (1-1)</label>
                            <label><input type="radio" name="type" value="chung" ${session.type === 'chung' ? 'checked' : ''} /> Chung (nhóm)</label>
                        </div>
                    </div>
                    <div class="ht-form__row" id="ht-sf-students-container">
                        <label class="ht-form__label">Học sinh * ${typeHint}</label>
                        <div class="ht-multi-select" id="ht-sf-students">
                            ${classStudents.map(s => `
                                <label class="ht-multi-select__item">
                                    <input type="checkbox" name="student_ids" value="${s.id}" ${assignedStudentIds.includes(parseInt(s.id, 10)) ? 'checked' : ''} />
                                    <span>${HT.utils.escapeHtml(s.name)}</span>
                                </label>
                            ` ).join('')}
                        </div>
                    </div>
                </fieldset>

                <fieldset class="ht-form__fieldset">
                    <legend>Chi tiết</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-price">Học phí buổi</label>
                        <input type="number" id="ht-sf-price" name="price" class="ht-form__input" min="0" step="1000" value="${session.price || 0}" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-name">Tên buổi học</label>
                        <input type="text" id="ht-sf-name" name="session_name" class="ht-form__input" placeholder="(Tuỳ chọn)" value="${HT.utils.escapeHtml(session.session_name || '')}" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-content">Nội dung buổi học</label>
                        <textarea id="ht-sf-content" name="content" class="ht-form__textarea" rows="2" placeholder="(Tuỳ chọn)">${HT.utils.escapeHtml(session.content || '')}</textarea>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-homework">Nội dung bài tập về nhà</label>
                        <textarea id="ht-sf-homework" name="homework_content" class="ht-form__textarea" rows="2" placeholder="(Tuỳ chọn)">${HT.utils.escapeHtml(session.homework_content || '')}</textarea>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-comment">Nhận xét chung</label>
                        <textarea id="ht-sf-comment" name="general_comment" class="ht-form__textarea" rows="2" placeholder="(Tuỳ chọn)">${HT.utils.escapeHtml(session.general_comment || '')}</textarea>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label">Màu hiển thị</label>
                        <div class="ht-form__inline-group">
                            <label class="ht-form__checkbox-inline">
                                <input type="checkbox" id="ht-sf-color-toggle" ${hasCustomColor ? 'checked' : ''} /> Dùng màu riêng
                            </label>
                            <input type="color" id="ht-sf-color" name="display_color"
                                   class="ht-form__input ht-form__input--color" value="${session.display_color || '#4A90D9'}" ${hasCustomColor ? '' : 'disabled'} />
                        </div>
                    </div>
                </fieldset>

                ${this._buildJournalFieldsetHtml(session)}

                <fieldset class="ht-form__fieldset">
                    <legend>Điểm buổi học</legend>
                    <div id="ht-score-groups-container"></div>
                    <button type="button" class="ht-score-add-btn" id="ht-score-add-group">+ Thêm nhóm điểm</button>
                </fieldset>
            </form>
        `;
    },

    // ──────────────────────────────────────────────────────────
    // M5: Quick Entry — Journal & Score Methods
    // ──────────────────────────────────────────────────────────

    /**
     * Build fieldset HTML nhật ký học tập per-student.
     *
     * @param {Object} session — session data from hinteach_session_get
     * @returns {string} HTML string
     */
    _buildJournalFieldsetHtml(session) {
        const students = session.students || [];
        if (!students.length) return '';

        const homeworkOptions = ['', '0%', '30%', '50%', '70%', '100%'];

        const cards = students.map(s => {
            const sid = s.student_id;
            const name = HT.utils.escapeHtml(s.name || `Học sinh #${sid}`);

            const hwValue = s.homework || '';
            const attValue = HT.utils.escapeHtml(s.attitude || '');
            const icValue = HT.utils.escapeHtml(s.individual_comment || '');
            const ntValue = HT.utils.escapeHtml(s.note || '');

            const hwOptions = homeworkOptions.map(v => {
                const label = v === '' ? '-- Chọn --' : v;
                return `<option value="${v}" ${v === hwValue ? 'selected' : ''}>${label}</option>`;
            }).join('');

            return `
                <div class="ht-journal-card" data-student-id="${sid}">
                    <div class="ht-journal-card__name">${name}</div>
                    <div class="ht-journal-card__grid">
                        <div class="ht-form__row">
                            <label class="ht-form__label">BTVN</label>
                            <select class="ht-form__select ht-qe-homework" data-sid="${sid}">
                                ${hwOptions}
                            </select>
                        </div>
                        <div class="ht-form__row">
                            <label class="ht-form__label">Thái độ</label>
                            <input type="text" class="ht-form__input ht-qe-attitude" data-sid="${sid}" value="${attValue}" placeholder="(Tuỳ chọn)" />
                        </div>
                        <div class="ht-form__row">
                            <label class="ht-form__label">Nhận xét riêng</label>
                            <textarea class="ht-form__textarea ht-qe-comment" data-sid="${sid}" rows="2" placeholder="(Tuỳ chọn)">${icValue}</textarea>
                        </div>
                        <div class="ht-form__row">
                            <label class="ht-form__label">Ghi chú</label>
                            <textarea class="ht-form__textarea ht-qe-note" data-sid="${sid}" rows="2" placeholder="(Tuỳ chọn)">${ntValue}</textarea>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <fieldset class="ht-form__fieldset">
                <legend>Nhật ký học tập</legend>
                ${cards}
            </fieldset>
        `;
    },

    /**
     * Build 1 score group HTML.
     *
     * @param {Object} session — session data
     * @param {number} groupIndex — unique index
     * @param {Object|null} initialData — optional existing group data { score_type, test_name, max_score, entries }
     * @returns {string} HTML string
     */
    _buildScoreGroupHtml(session, groupIndex, initialData = null) {
        const students = session.students || [];
        const gid = `ht-sg-${groupIndex}`;

        const initScoreType = initialData ? HT.utils.escapeHtml(initialData.score_type || '') : '';
        const initTestName = initialData ? HT.utils.escapeHtml(initialData.test_name || '') : '';
        const initMaxScore = initialData ? (initialData.max_score || 10) : 10;
        const initEntries = initialData?.entries || {};

        const studentRows = students.map(s => {
            const sid = s.student_id;
            const name = HT.utils.escapeHtml(s.name || `#${sid}`);
            const entry = initEntries[sid] || null;
            const scoreVal = entry && entry.score_value !== null && entry.score_value !== undefined ? entry.score_value : '';
            const scoreNote = entry ? HT.utils.escapeHtml(entry.score_note || '') : '';

            return `
                <tr>
                    <td>${name}</td>
                    <td><input type="number" class="ht-form__input" data-field="score_value" data-sid="${sid}" min="0" step="0.5" placeholder="—" value="${scoreVal}" /></td>
                    <td><input type="text" class="ht-form__input" data-field="score_note" data-sid="${sid}" maxlength="500" placeholder="Ghi chú" value="${scoreNote}" /></td>
                </tr>
            `;
        }).join('');

        return `
            <div class="ht-score-group" data-group-index="${groupIndex}" id="${gid}">
                <button type="button" class="ht-score-group__remove" data-remove-group="${gid}" title="Xoá nhóm">&times;</button>
                <div class="ht-score-group__header">
                    <div class="ht-form__row">
                        <label class="ht-form__label">Loại điểm</label>
                        <input type="text" class="ht-form__input" data-field="score_type" maxlength="100" placeholder="VD: BTVN, Kiểm tra…" value="${initScoreType}" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label">Tên bài *</label>
                        <input type="text" class="ht-form__input" data-field="test_name" maxlength="255" placeholder="VD: Kiểm tra chương 3" required value="${initTestName}" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label">Thang điểm</label>
                        <input type="number" class="ht-form__input" data-field="max_score" min="1" max="1000" value="${initMaxScore}" />
                    </div>
                </div>
                <table class="ht-score-group__entries">
                    <thead>
                        <tr><th>Học sinh</th><th>Điểm</th><th>Ghi chú</th></tr>
                    </thead>
                    <tbody>${studentRows}</tbody>
                </table>
            </div>
        `;
    },

    /**
     * Thêm 1 nhóm điểm vào container.
     *
     * @param {Object} session
     * @param {Object|null} initialData
     */
    _addScoreGroup(session, initialData = null) {
        const container = document.getElementById('ht-score-groups-container');
        if (!container) return;

        this._scoreGroupCounter = (this._scoreGroupCounter || 0) + 1;
        const html = this._buildScoreGroupHtml(session, this._scoreGroupCounter, initialData);
        container.insertAdjacentHTML('beforeend', html);

        // Bind remove
        const groupEl = document.getElementById(`ht-sg-${this._scoreGroupCounter}`);
        const removeBtn = groupEl?.querySelector('.ht-score-group__remove');
        removeBtn?.addEventListener('click', () => groupEl.remove());
    },

    /**
     * Collect quick-entry payload từ modal.
     *
     * @returns {{ studentDetails: Object, scoreGroups: Array }}
     */
    _collectQuickEntryPayload() {
        const form = document.getElementById('ht-session-form');
        if (!form) {
            return { content: '', homeworkContent: '', sessionName: '', generalComment: '', studentDetails: {}, scoreGroups: [] };
        }

        // Session-level (same fields already in edit form)
        const content = form.querySelector('[name="content"]')?.value ?? '';
        const homeworkContent = form.querySelector('[name="homework_content"]')?.value ?? '';
        const sessionName = form.querySelector('[name="session_name"]')?.value ?? '';
        const generalComment = form.querySelector('[name="general_comment"]')?.value ?? '';

        // Per-student journal (scoped to form)
        const studentDetails = {};
        form.querySelectorAll('.ht-journal-card').forEach(card => {
            const sid = card.dataset.studentId;
            if (!sid) return;
            studentDetails[sid] = {
                homework: card.querySelector('.ht-qe-homework')?.value ?? '',
                attitude: card.querySelector('.ht-qe-attitude')?.value ?? '',
                individual_comment: card.querySelector('.ht-qe-comment')?.value ?? '',
                note: card.querySelector('.ht-qe-note')?.value ?? '',
            };
        });

        // Score groups (scoped to form)
        const scoreGroups = [];
        form.querySelectorAll('.ht-score-group').forEach(groupEl => {
            const scoreType = groupEl.querySelector('[data-field="score_type"]')?.value ?? '';
            const testName = groupEl.querySelector('[data-field="test_name"]')?.value ?? '';
            const maxScore = parseFloat(groupEl.querySelector('[data-field="max_score"]')?.value) || 0;

            const entries = [];
            groupEl.querySelectorAll('tbody tr').forEach(row => {
                const scoreInput = row.querySelector('[data-field="score_value"]');
                const noteInput = row.querySelector('[data-field="score_note"]');
                if (!scoreInput) return;

                const sid = scoreInput.dataset.sid;
                const scoreValue = scoreInput.value !== '' ? parseFloat(scoreInput.value) : null;
                const scoreNote = noteInput?.value ?? '';

                entries.push({
                    student_id: parseInt(sid, 10),
                    score_value: scoreValue,
                    score_note: scoreNote,
                });
            });

            // Only include groups with at least 1 entry that has a score
            const hasAnyScore = entries.some(e => e.score_value !== null);
            if (hasAnyScore) {
                scoreGroups.push({ score_type: scoreType, test_name: testName, max_score: maxScore, entries });
            }
        });

        return { content, homeworkContent, sessionName, generalComment, studentDetails, scoreGroups };
    },

    /**
     * Lưu nhật ký + điểm buổi học (quick-entry).
     * Gọi action hinteach_session_quick_entry (M5).
     * KHÔNG propagate sang recurrence — luôn single-session.
     *
     * @param {Object} currentSession
     */
    async _saveQuickEntry(currentSession) {
        const payload = this._collectQuickEntryPayload();

        // Client-side validation
        for (const group of payload.scoreGroups) {
            if (!group.test_name.trim()) {
                HT.utils.toast('Vui lòng nhập tên bài kiểm tra cho tất cả nhóm điểm.', 'error');
                return;
            }
            if (group.max_score <= 0) {
                HT.utils.toast('Thang điểm tối đa phải lớn hơn 0.', 'error');
                return;
            }
            for (const entry of group.entries) {
                if (entry.score_value !== null && (entry.score_value < 0 || entry.score_value > group.max_score)) {
                    HT.utils.toast(
                        `Điểm số phải nằm trong khoảng 0 – ${group.max_score}.`,
                        'error'
                    );
                    return;
                }
            }
        }

        const apiPayload = {
            session_id: currentSession.id,
            content: payload.content,
            homework_content: payload.homeworkContent,
            session_name: payload.sessionName,
            general_comment: payload.generalComment,
            student_details: JSON.stringify(payload.studentDetails),
            score_groups: JSON.stringify(payload.scoreGroups),
        };

        try {
            const btn = document.getElementById('ht-session-form-quick-entry');
            if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...'; }

            const result = await HT.api.call('hinteach_session_quick_entry', apiPayload);

            let msg = result.message || 'Đã lưu nhật ký buổi học.';
            if (result.created_scores && result.created_scores.length) {
                msg += ` (${result.created_scores.length} điểm)`;
            }
            HT.utils.toast(msg);

            if (btn) { btn.disabled = false; btn.textContent = 'Lưu nhật ký'; }
        } catch (err) {
            HT.utils.toast(err.message || 'Không thể lưu nhật ký.', 'error');
            const btn = document.getElementById('ht-session-form-quick-entry');
            if (btn) { btn.disabled = false; btn.textContent = 'Lưu nhật ký'; }
        }
    },

    /**
     * Modal chọn scope (single / following) cho buổi lặp.
     *
     * @param {string} actionText    'cập nhật' | 'xoá'
     * @param {number} followingCount Số buổi sau
     * @returns {Promise<'single'|'following'|null>}
     */
    _askScope(actionText = 'cập nhật', followingCount = 0) {
        return new Promise((resolve) => {
            let resolved = false;
            const totalFollowing = followingCount + 1;

            HT.modal.open({
                title: `Tuỳ chọn ${actionText} buổi học`,
                body: `
                    <p style="margin-bottom:16px;">Buổi học này thuộc một chuỗi lặp. Bạn muốn ${actionText} như thế nào?</p>
                    <div class="ht-scope-choices">
                        <button type="button" class="ht-scope-choice" id="ht-scope-single">
                            <span class="ht-scope-choice__title">Chỉ buổi này</span>
                            <span class="ht-scope-choice__desc">Chỉ áp dụng ${actionText} cho riêng buổi học này.</span>
                        </button>
                        <button type="button" class="ht-scope-choice" id="ht-scope-following">
                            <span class="ht-scope-choice__title">Buổi này và các buổi sau (${totalFollowing} buổi)</span>
                            <span class="ht-scope-choice__desc">Áp dụng ${actionText} cho buổi này cùng toàn bộ các buổi tiếp theo trong chuỗi.</span>
                        </button>
                    </div>
                `,
                footer: `
                    <button type="button" class="ht-btn ht-btn--ghost" id="ht-scope-cancel">Huỷ</button>
                `,
                onClose: () => {
                    if (resolved) return;
                    resolved = true;
                    resolve(null);
                },
            });

            document.getElementById('ht-scope-single')?.addEventListener('click', () => {
                resolved = true;
                HT.modal.close();
                resolve('single');
            });

            document.getElementById('ht-scope-following')?.addEventListener('click', () => {
                resolved = true;
                HT.modal.close();
                resolve('following');
            });

            document.getElementById('ht-scope-cancel')?.addEventListener('click', () => {
                resolved = true;
                HT.modal.close();
                resolve(null);
            });
        });
    },

    /**
     * Submit cập nhật buổi học.
     *
     * @param {Object} currentSession
     */
    async _updateSession(currentSession) {
        const form = document.getElementById('ht-session-form');
        if (!form) return;

        const classId = form.querySelector('[name="class_id"]')?.value || '';
        const date = form.querySelector('[name="date"]')?.value || '';
        const startTime = form.querySelector('[name="start_time"]')?.value || '';
        const endTime = form.querySelector('[name="end_time"]')?.value || '';
        const type = form.querySelector('input[name="type"]:checked')?.value || '';
        const price = form.querySelector('[name="price"]')?.value || '0';
        const sessName = form.querySelector('[name="session_name"]')?.value || '';
        const content = form.querySelector('[name="content"]')?.value || '';
        const homework = form.querySelector('[name="homework_content"]')?.value || '';
        const comment = form.querySelector('[name="general_comment"]')?.value || '';

        const colorToggle = document.getElementById('ht-sf-color-toggle');
        const displayColor = colorToggle?.checked
            ? (form.querySelector('[name="display_color"]')?.value || '')
            : '';

        const studentCheckboxes = form.querySelectorAll('input[name="student_ids"]:checked');
        const studentIds = Array.from(studentCheckboxes).map(cb => cb.value);

        // Validate
        if (!classId) { HT.utils.toast('Vui lòng chọn lớp.', 'error'); return; }
        if (!date) { HT.utils.toast('Vui lòng chọn ngày.', 'error'); return; }
        if (!startTime || !endTime) {
            HT.utils.toast('Vui lòng nhập giờ bắt đầu và kết thúc.', 'error'); return;
        }
        if (startTime >= endTime) {
            HT.utils.toast('Giờ bắt đầu phải trước giờ kết thúc.', 'error'); return;
        }
        if (!type) { HT.utils.toast('Vui lòng chọn loại buổi.', 'error'); return; }
        if (type === 'riêng' && studentIds.length !== 1) {
            HT.utils.toast('Buổi riêng phải chọn đúng 1 học sinh.', 'error'); return;
        }
        if (type === 'chung' && studentIds.length < 2) {
            HT.utils.toast('Buổi chung phải chọn ít nhất 2 học sinh.', 'error'); return;
        }

        // Scope
        let scope = 'single';
        if (currentSession.repeat_group_id && currentSession.following_count > 0) {
            scope = await this._askScope('cập nhật', currentSession.following_count);
            if (!scope) {
                return; // User cancelled
            }
        }

        const payload = {
            session_id: currentSession.id,
            update_scope: scope,
            class_id: classId,
            date: date,
            start_time: startTime,
            end_time: endTime,
            type: type,
            student_ids: studentIds,
            price: price,
            session_name: sessName,
            content: content,
            homework_content: homework,
            general_comment: comment,
            display_color: displayColor,
        };

        try {
            const updateBtn = document.getElementById('ht-session-form-update');
            if (updateBtn) { updateBtn.disabled = true; updateBtn.textContent = 'Đang lưu...'; }

            const result = await HT.api.call('hinteach_session_save', payload);
            HT.modal.close();

            if (result.scope === 'following' && result.updated_count) {
                HT.utils.toast(`Đã cập nhật ${result.updated_count} buổi trong chuỗi lặp.`);
            } else {
                HT.utils.toast(result.message || 'Đã cập nhật buổi học thành công.');
            }
            await this._render();
        } catch (err) {
            if (err.status === 409 && err.serverData?.conflict) {
                const c = err.serverData.conflict;
                const conflictName = c.session_name
                    ? `"${HT.utils.escapeHtml(c.session_name)}"`
                    : 'buổi học';
                const conflictTime = `${this._fmtTime(c.start_time)} – ${this._fmtTime(c.end_time)}`;
                HT.utils.toast(
                    `Trùng lịch với ${conflictName} lúc ${conflictTime} ngày ${this._fmtShort(c.date)}.`,
                    'error'
                );
            } else {
                HT.utils.toast(err.message, 'error');
            }
            const updateBtn = document.getElementById('ht-session-form-update');
            if (updateBtn) { updateBtn.disabled = false; updateBtn.textContent = 'Lưu thay đổi'; }
        }
    },

    /**
     * Xoá buổi học (single hoặc following).
     *
     * @param {Object} currentSession
     */
    async _deleteSession(currentSession) {
        let scope = 'single';
        if (currentSession.repeat_group_id && currentSession.following_count > 0) {
            scope = await this._askScope('xoá', currentSession.following_count);
            if (!scope) {
                return;
            }
        }

        const confirmMsg = scope === 'following'
            ? `Bạn có chắc chắn muốn xoá buổi học này và ${currentSession.following_count} buổi tiếp theo trong chuỗi lặp?`
            : 'Bạn có chắc chắn muốn xoá buổi học này?';

        const confirmed = await HT.modal.confirm(confirmMsg);
        if (!confirmed) return;

        try {
            const result = await HT.api.call('hinteach_session_delete', {
                session_id: currentSession.id,
                scope: scope,
            });

            HT.modal.close();

            if (result.scope === 'following' && result.deleted_count) {
                HT.utils.toast(`Đã xoá ${result.deleted_count} buổi trong chuỗi lặp.`);
            } else {
                HT.utils.toast(result.message || 'Đã xoá buổi học.');
            }

            await this._render();
        } catch (err) {
            HT.utils.toast(err.message, 'error');
        }
    },

    // ──────────────────────────────────────────────────────────
    // M6: Calendar Actions (Context Menu, Color, Copy, Paste, Duplicate)
    // ──────────────────────────────────────────────────────────

    /** Đóng context menu hiện tại nếu có */
    _dismissContextMenu() {
        if (this._contextMenuEl) {
            this._contextMenuEl.remove();
            this._contextMenuEl = null;
        }
    },

    /**
     * Đặt vị trí và hiển thị context menu trong viewport.
     *
     * @param {HTMLElement} menu
     * @param {MouseEvent} e
     */
    _positionContextMenu(menu, e) {
        document.body.appendChild(menu);
        this._contextMenuEl = menu;

        const rect = menu.getBoundingClientRect();
        let x = e.clientX;
        let y = e.clientY;

        if (x + rect.width > window.innerWidth) {
            x = Math.max(10, window.innerWidth - rect.width - 10);
        }
        if (y + rect.height > window.innerHeight) {
            y = Math.max(10, window.innerHeight - rect.height - 10);
        }

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const onDocClick = (evt) => {
            if (!menu.contains(evt.target)) {
                this._dismissContextMenu();
                document.removeEventListener('click', onDocClick);
                document.removeEventListener('contextmenu', onDocClick);
            }
        };

        const onKeyDown = (evt) => {
            if (evt.key === 'Escape') {
                this._dismissContextMenu();
                document.removeEventListener('keydown', onKeyDown);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', onDocClick);
            document.addEventListener('contextmenu', onDocClick);
            document.addEventListener('keydown', onKeyDown);
        }, 0);
    },

    /**
     * Hiển thị context menu cho 1 buổi học (chuột phải).
     * 4 actions: Đổi màu, Sao chép, Nhân bản, Xóa.
     *
     * @param {MouseEvent} e
     * @param {number} sessionId
     */
    /**
     * Hiển thị context menu cho 1 buổi học (chuột phải).
     * 4 actions: Đổi màu (Preset / Màu khác / Theo màu lớp), Sao chép, Nhân bản, Xóa.
     *
     * @param {MouseEvent} e
     * @param {number} sessionId
     */
    _showSessionContextMenu(e, sessionId) {
        this._dismissContextMenu();

        const menu = document.createElement('div');
        menu.className = 'ht-context-menu';

        const paletteColors = [
            '#4A90D9', '#2E7D32', '#E65100', '#C2185B', '#7B1FA2',
            '#0097A7', '#D32F2F', '#F57C00', '#455A64', '#10B981'
        ];

        const swatchesHtml = paletteColors.map(c => `
            <button type="button" class="ht-color-swatch" data-color="${c}" style="background:${c};" title="Màu ${c}"></button>
        ` ).join('');

        menu.innerHTML = `
            <div class="ht-color-swatches">
                <div class="ht-color-swatches__header">
                    <span class="ht-color-swatches__title">🎨 Đổi màu hiển thị</span>
                </div>
                <div class="ht-color-swatches__grid">
                    ${swatchesHtml}
                </div>
                <div class="ht-color-swatches__actions">
                    <label class="ht-color-action-btn ht-color-action-btn--custom" title="Chọn màu bất kỳ">
                        <input type="color" class="ht-color-action-input" id="ht-ctx-color-custom" value="#4A90D9" />
                        <span class="ht-color-action-btn__icon">🌈</span>
                        <span class="ht-color-action-btn__text">Màu khác…</span>
                    </label>
                    <button type="button" class="ht-color-action-btn ht-color-action-btn--reset" id="ht-ctx-color-class" title="Xoá màu riêng, hiển thị theo màu của lớp">
                        <span class="ht-color-action-btn__icon">🏷</span>
                        <span class="ht-color-action-btn__text">Theo màu lớp</span>
                    </button>
                </div>
            </div>
            <div class="ht-context-menu__divider"></div>
            <button type="button" class="ht-context-menu__item" id="ht-ctx-copy">
                <span class="ht-context-menu__icon">📋</span> Sao chép
            </button>
            <button type="button" class="ht-context-menu__item" id="ht-ctx-duplicate">
                <span class="ht-context-menu__icon">⊕</span> Nhân bản
            </button>
            <div class="ht-context-menu__divider"></div>
            <button type="button" class="ht-context-menu__item ht-context-menu__item--danger" id="ht-ctx-delete">
                <span class="ht-context-menu__icon">🗑</span> Xóa
            </button>
        `;

        // 1. Bind preset color swatches
        menu.querySelectorAll('.ht-color-swatch').forEach(btn => {
            btn.addEventListener('click', async (evt) => {
                evt.stopPropagation();
                const color = btn.dataset.color || '';
                this._dismissContextMenu();
                await this._changeDisplayColor(sessionId, color);
            });
        });

        // 2. Bind "Màu khác..." custom color picker
        const customColorInput = menu.querySelector('#ht-ctx-color-custom');
        customColorInput?.addEventListener('click', (evt) => {
            evt.stopPropagation();
        });
        customColorInput?.addEventListener('change', async (evt) => {
            evt.stopPropagation();
            const chosenColor = customColorInput.value;
            if (chosenColor) {
                this._dismissContextMenu();
                await this._changeDisplayColor(sessionId, chosenColor);
            }
        });

        // 3. Bind "Theo màu lớp" (clear display_color)
        menu.querySelector('#ht-ctx-color-class')?.addEventListener('click', async (evt) => {
            evt.stopPropagation();
            this._dismissContextMenu();
            await this._changeDisplayColor(sessionId, '');
        });

        // Bind copy
        menu.querySelector('#ht-ctx-copy')?.addEventListener('click', async (evt) => {
            evt.stopPropagation();
            this._dismissContextMenu();
            await this._copySession(sessionId);
        });

        // Bind duplicate
        menu.querySelector('#ht-ctx-duplicate')?.addEventListener('click', async (evt) => {
            evt.stopPropagation();
            this._dismissContextMenu();
            await this._duplicateSession(sessionId);
        });

        // Bind delete
        menu.querySelector('#ht-ctx-delete')?.addEventListener('click', async (evt) => {
            evt.stopPropagation();
            this._dismissContextMenu();
            await this._deleteSessionShortcut(sessionId);
        });

        this._positionContextMenu(menu, e);
    },

    /**
     * Hiển thị context menu trên vị trí lịch trống (chuột phải).
     * 2 actions: Thêm buổi học, Dán.
     *
     * @param {MouseEvent} e
     * @param {string} date YYYY-MM-DD
     */
    _showEmptyContextMenu(e, date) {
        this._dismissContextMenu();

        const menu = document.createElement('div');
        menu.className = 'ht-context-menu';

        const hasClipboard = !!this._calendarSessionClipboard;

        menu.innerHTML = `
            <button type="button" class="ht-context-menu__item" id="ht-ctx-add">
                <span class="ht-context-menu__icon">＋</span> Thêm buổi học
            </button>
            <button type="button" class="ht-context-menu__item${!hasClipboard ? ' ht-context-menu__item--disabled' : ''}" id="ht-ctx-paste">
                <span class="ht-context-menu__icon">📌</span> Dán
            </button>
        `;

        menu.querySelector('#ht-ctx-add')?.addEventListener('click', (evt) => {
            evt.stopPropagation();
            this._dismissContextMenu();
            this._openCreateForm({ date: date });
        });

        if (hasClipboard) {
            menu.querySelector('#ht-ctx-paste')?.addEventListener('click', (evt) => {
                evt.stopPropagation();
                this._dismissContextMenu();
                this._pasteSession(date);
            });
        }

        this._positionContextMenu(menu, e);
    },

    /**
     * Đổi màu hiển thị buổi học (gọi API riêng biệt).
     *
     * @param {number} sessionId
     * @param {string} color Hex hoặc ''
     */
    async _changeDisplayColor(sessionId, color) {
        try {
            const result = await HT.api.call('hinteach_session_display_color', {
                session_id: sessionId,
                display_color: color,
            });
            HT.utils.toast(result.message || 'Đã đổi màu buổi học.');
            await this._render();
        } catch (err) {
            HT.utils.toast(err.message || 'Không thể đổi màu buổi học.', 'error');
        }
    },

    /**
     * Sao chép buổi học vào clipboard in-memory.
     *
     * @param {number} sessionId
     */
    async _copySession(sessionId) {
        try {
            const data = await HT.api.call('hinteach_session_get', { session_id: sessionId }, 'GET');
            const session = data.session;
            if (!session) {
                HT.utils.toast('Không tìm thấy buổi học để sao chép.', 'error');
                return;
            }

            // Clone dữ liệu, bỏ display_color và thông tin recurrence
            this._calendarSessionClipboard = {
                class_id: session.class_id,
                type: session.type,
                price: session.price,
                session_name: session.session_name || '',
                content: session.content || '',
                homework_content: session.homework_content || '',
                general_comment: session.general_comment || '',
                start_time: session.start_time,
                end_time: session.end_time,
                student_ids: (session.students || []).map(s => parseInt(s.student_id, 10)),
            };

            HT.utils.toast('Đã sao chép buổi học vào bộ nhớ tạm.');
        } catch (err) {
            HT.utils.toast('Lỗi khi sao chép: ' + err.message, 'error');
        }
    },

    /**
     * Dán buổi học: mở modal tạo buổi và prefill dữ liệu đã sao chép.
     *
     * @param {string} targetDate YYYY-MM-DD
     */
    _pasteSession(targetDate) {
        if (!this._calendarSessionClipboard) {
            HT.utils.toast('Bộ nhớ tạm rỗng. Vui lòng sao chép một buổi học trước.', 'error');
            return;
        }

        const clip = this._calendarSessionClipboard;
        this._openCreateForm({
            isPaste: true,
            date: targetDate,
            start_time: clip.start_time ? clip.start_time.slice(0, 5) : '',
            end_time: clip.end_time ? clip.end_time.slice(0, 5) : '',
            class_id: clip.class_id,
            type: clip.type,
            price: clip.price,
            session_name: clip.session_name,
            content: clip.content,
            homework_content: clip.homework_content,
            general_comment: clip.general_comment,
            student_ids: clip.student_ids || [],
        });
    },

    /**
     * Chuyển chuỗi HH:MM hoặc HH:MM:SS thành số phút từ đầu ngày.
     *
     * @param {string} timeStr
     * @returns {number}
     */
    _timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.slice(0, 5).split(':');
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    },

    /**
     * Chuyển số phút thành chuỗi định dạng HH:MM.
     *
     * @param {number} mins
     * @returns {string}
     */
    _minutesToTime(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    /**
     * Thuật toán tìm slot trống trong ngày cho action Nhân bản (Duplicate).
     * Khung giờ: 07:00 – 24:00 cùng ngày.
     *
     * @param {Object} session      Session nguồn
     * @param {Array}  allSessions  Danh sách sessions hiện có trong tuần
     * @returns {{ start_time: string, end_time: string }|null}
     */
    _findDuplicateSlot(session, allSessions) {
        const sStartM = this._timeToMinutes(session.start_time);
        const sEndM = this._timeToMinutes(session.end_time);
        const durM = sEndM - sStartM;

        if (durM <= 0) return null;

        const daySessions = allSessions.filter(s => s.date === session.date && Number(s.id) !== Number(session.id));

        const isSlotBusy = (startM, endM) => {
            return daySessions.some(s => {
                const ss = this._timeToMinutes(s.start_time);
                const se = this._timeToMinutes(s.end_time);
                return (startM < se && endM > ss);
            });
        };

        const EARLIEST = this.DAY_START_HOUR * 60;   // 06:00
        const LATEST = this.DAY_END_HOUR * 60;        // 24:00

        // Priority 1: Ngay sau endTime của session gốc
        if (sEndM + durM <= LATEST && !isSlotBusy(sEndM, sEndM + durM)) {
            return {
                start_time: this._minutesToTime(sEndM),
                end_time: this._minutesToTime(sEndM + durM),
            };
        }

        // Priority 2: Mở rộng tìm kiếm ±30 phút mỗi bước quanh mốc sEndM
        const maxOffset = Math.max(LATEST - sEndM, sEndM - EARLIEST);
        for (let offset = 30; offset <= maxOffset; offset += 30) {
            // Thử hướng sau: sEndM + offset
            const afterStart = sEndM + offset;
            const afterEnd = afterStart + durM;
            if (afterStart >= EARLIEST && afterEnd <= LATEST && !isSlotBusy(afterStart, afterEnd)) {
                return {
                    start_time: this._minutesToTime(afterStart),
                    end_time: this._minutesToTime(afterEnd),
                };
            }

            // Thử hướng trước: sEndM - offset
            const beforeStart = sEndM - offset;
            const beforeEnd = beforeStart + durM;
            if (beforeStart >= EARLIEST && beforeEnd <= LATEST && !isSlotBusy(beforeStart, beforeEnd)) {
                return {
                    start_time: this._minutesToTime(beforeStart),
                    end_time: this._minutesToTime(beforeEnd),
                };
            }
        }

        return null;
    },

    /**
     * Nhân bản buổi học (1-click, tự tìm slot trống, tạo ngay không qua form).
     *
     * @param {number} sessionId
     */
    async _duplicateSession(sessionId) {
        try {
            const data = await HT.api.call('hinteach_session_get', { session_id: sessionId }, 'GET');
            const session = data.session;
            if (!session) {
                HT.utils.toast('Không tìm thấy thông tin buổi học.', 'error');
                return;
            }

            // Tìm slot trống trong ngày
            const slot = this._findDuplicateSlot(session, this._sessions || []);
            if (!slot) {
                HT.utils.toast('Không còn khung giờ trống trong ngày để nhân bản buổi học này.', 'error');
                return;
            }

            const studentIds = (session.students || []).map(s => parseInt(s.student_id, 10));

            const payload = {
                class_id: session.class_id,
                date: session.date,
                start_time: slot.start_time,
                end_time: slot.end_time,
                type: session.type,
                student_ids: studentIds,
                price: session.price || 0,
                session_name: session.session_name || '',
                content: session.content || '',
                homework_content: session.homework_content || '',
                general_comment: session.general_comment || '',
                display_color: '', // Buổi nhân bản độc lập, không kế thừa màu
            };

            await HT.api.call('hinteach_session_save', payload);
            HT.utils.toast('Đã nhân bản buổi học thành công.');
            await this._render();
        } catch (err) {
            if (err.status === 409 && err.serverData?.conflict) {
                const c = err.serverData.conflict;
                const conflictName = c.session_name
                    ? `"${HT.utils.escapeHtml(c.session_name)}"`
                    : 'buổi học';
                const conflictTime = `${this._fmtTime(c.start_time)} – ${this._fmtTime(c.end_time)}`;
                HT.utils.toast(
                    `Trùng lịch với ${conflictName} lúc ${conflictTime} ngày ${this._fmtShort(c.date)}.`,
                    'error'
                );
            } else {
                HT.utils.toast(err.message || 'Không thể nhân bản buổi học.', 'error');
            }
        }
    },

    /**
     * Shortcut xoá buổi học từ context menu (tái sử dụng flow M4).
     *
     * @param {number} sessionId
     */
    async _deleteSessionShortcut(sessionId) {
        try {
            const data = await HT.api.call('hinteach_session_get', { session_id: sessionId }, 'GET');
            if (!data.session) {
                HT.utils.toast('Không tìm thấy thông tin buổi học.', 'error');
                return;
            }
            await this._deleteSession(data.session);
        } catch (err) {
            HT.utils.toast(err.message || 'Lỗi khi chuẩn bị xoá buổi học.', 'error');
        }
    },

    // ──────────────────────────────────────────────────────────
    // M7: Time-grid pixel helpers
    // ──────────────────────────────────────────────────────────

    /**
     * Chuyển pixel Y (relative to day-body top) thành số phút từ 00:00.
     * @param {number} px
     * @returns {number}
     */
    _pxToMinutes(px) {
        return (px / this.HOUR_HEIGHT) * 60 + this.DAY_START_HOUR * 60;
    },

    /**
     * Snap số phút về bội số gần nhất của SNAP_MINUTES.
     * @param {number} mins
     * @returns {number}
     */
    _snapMinutes(mins) {
        return Math.round(mins / this.SNAP_MINUTES) * this.SNAP_MINUTES;
    },

    /**
     * Chuyển số phút thành pixel Y (relative to day-body top).
     * @param {number} mins  phút từ 00:00
     * @returns {number}
     */
    _minutesToPx(mins) {
        return (mins - this.DAY_START_HOUR * 60) / 60 * this.HOUR_HEIGHT;
    },

    // ──────────────────────────────────────────────────────────
    // M7: Phase 2 — Drag Create
    // ──────────────────────────────────────────────────────────

    /**
     * Xử lý pointerdown trên vùng lịch trống — bắt đầu Drag Create.
     *
     * @param {PointerEvent} e
     * @param {HTMLElement}  dayBody  .ht-cal__day-body element
     * @param {string}       date     YYYY-MM-DD
     */
    _onCreatePointerDown(e, dayBody, date) {
        e.preventDefault();

        const rect = dayBody.getBoundingClientRect();
        const startY = e.clientY - rect.top;
        const startMins = this._snapMinutes(this._pxToMinutes(startY));

        let preview = null;
        let isDragging = false;
        let endMins = startMins + this.SNAP_MINUTES;
        let lastClientY = e.clientY;
        let rafId = null;

        document.body.style.userSelect = 'none';

        const updatePreview = () => {
            const curY = lastClientY - rect.top;
            const curMins = this._snapMinutes(this._pxToMinutes(curY));

            endMins = curMins > startMins ? curMins : startMins + this.SNAP_MINUTES;

            if (!preview) {
                preview = document.createElement('div');
                preview.className = 'ht-drag-preview';
                dayBody.appendChild(preview);
            }
            const topPx = this._minutesToPx(startMins);
            const heightPx = this._minutesToPx(endMins) - topPx;
            preview.style.top = `${topPx}px`;
            preview.style.height = `${Math.max(8, heightPx)}px`;
            preview.innerHTML = `<span class="ht-drag-preview__label">${this._minutesToTime(startMins)} \u2013 ${this._minutesToTime(endMins)}</span>`;
        };

        const onMove = (ev) => {
            lastClientY = ev.clientY;
            const rawDiff = Math.abs(ev.clientY - e.clientY);

            if (!isDragging && rawDiff < this.DRAG_THRESHOLD) return;
            isDragging = true;

            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    updatePreview();
                });
            }
        };

        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.body.style.userSelect = '';
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

            if (preview) { preview.remove(); preview = null; }
            if (!isDragging) return;

            // Clamp và đảm bảo tối thiểu SNAP_MINUTES
            const dayEndMins = this.DAY_END_HOUR * 60;
            if (endMins - startMins < this.SNAP_MINUTES) endMins = startMins + this.SNAP_MINUTES;
            if (endMins > dayEndMins) endMins = dayEndMins;
            if (startMins >= dayEndMins) return;

            this._openCreateForm({
                date: date,
                start_time: this._minutesToTime(startMins),
                end_time: this._minutesToTime(endMins),
            });
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    },

    // ──────────────────────────────────────────────────────────
    // M7: Phase 3 — Drag Move
    // ──────────────────────────────────────────────────────────

    /**
     * Xử lý pointerdown trên session block — bắt đầu Drag Move.
     *
     * @param {PointerEvent} e
     * @param {HTMLElement}  el         .ht-session-block element
     * @param {number}       sessionId
     */
    _onSessionPointerDown(e, el, sessionId) {
        if (e.target.closest('.ht-context-menu')) return;

        const origSession = this._sessions.find(s => Number(s.id) === sessionId);
        if (!origSession) return;

        const origDate = origSession.date;
        const origStart = origSession.start_time ? origSession.start_time.slice(0, 5) : '';
        const origEnd = origSession.end_time ? origSession.end_time.slice(0, 5) : '';

        const startX = e.clientX;
        const startY = e.clientY;
        let grabOffsetX = 0;
        let grabOffsetY = 0;
        let isDragging = false;
        let ghost = null;

        let newDate = origDate;
        let newStart = origStart;
        let newEnd = origEnd;

        let lastClientX = e.clientX;
        let lastClientY = e.clientY;
        let rafId = null;

        document.body.style.userSelect = 'none';

        const updateGhostAndTarget = () => {
            if (ghost) {
                ghost.style.transform = `translate3d(${lastClientX - grabOffsetX}px, ${lastClientY - grabOffsetY}px, 0)`;
                const timeEl = ghost.querySelector('.ht-session-block__time');
                if (timeEl && newStart && newEnd) {
                    timeEl.textContent = `${newStart} \u2013 ${newEnd}`;
                }
            }

            // Xác định day-body phía dưới con trỏ (ghost có pointer-events: none nên elementFromPoint xuyên qua được)
            const targetEl = document.elementFromPoint(lastClientX, lastClientY);
            if (!targetEl) return;
            const dayBody = targetEl.closest('.ht-cal__day-body[data-date]');
            if (!dayBody) return;

            newDate = dayBody.dataset.date;

            const rect = dayBody.getBoundingClientRect();
            const relY = lastClientY - rect.top;
            const snapMins = this._snapMinutes(this._pxToMinutes(relY));

            // Giữ nguyên duration
            const origStartM = this._timeToMinutes(origStart);
            const origEndM = this._timeToMinutes(origEnd);
            const durM = Math.max(this.SNAP_MINUTES, origEndM - origStartM);

            let newStartM = snapMins;
            let newEndM = newStartM + durM;

            // Clamp
            const dayEndM = this.DAY_END_HOUR * 60;
            const dayStartM = this.DAY_START_HOUR * 60;
            if (newEndM > dayEndM) {
                newEndM = dayEndM;
                newStartM = newEndM - durM;
            }
            if (newStartM < dayStartM) {
                newStartM = dayStartM;
                newEndM = newStartM + durM;
            }

            newStart = this._minutesToTime(newStartM);
            newEnd = this._minutesToTime(newEndM);
        };

        const onMove = (ev) => {
            lastClientX = ev.clientX;
            lastClientY = ev.clientY;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            if (!isDragging && (Math.abs(dx) < this.DRAG_THRESHOLD && Math.abs(dy) < this.DRAG_THRESHOLD)) return;

            if (!isDragging) {
                isDragging = true;

                const elRect = el.getBoundingClientRect();
                const elComputed = window.getComputedStyle(el);
                const computedBg = elComputed.backgroundColor;
                const computedColor = elComputed.color;
                const computedBorderLeft = elComputed.borderLeft;
                const computedBorderTop = elComputed.borderTop;
                const computedBorderRight = elComputed.borderRight;
                const computedBorderBottom = elComputed.borderBottom;
                const computedBorderRadius = elComputed.borderRadius;

                grabOffsetX = startX - elRect.left;
                grabOffsetY = startY - elRect.top;

                el.classList.add('ht-session-block--dragging');

                // Clone nguyên bản session block để giữ trọn vẹn kích thước, nội dung và cấu trúc
                ghost = el.cloneNode(true);
                ghost.classList.remove('ht-session-block--dragging');
                ghost.classList.add('ht-session-block--ghost');

                // Áp dụng computed visual styles từ block gốc để bảo toàn màu sắc
                ghost.style.backgroundColor = computedBg;
                ghost.style.color = computedColor;
                ghost.style.borderLeft = computedBorderLeft;
                ghost.style.borderTop = computedBorderTop;
                ghost.style.borderRight = computedBorderRight;
                ghost.style.borderBottom = computedBorderBottom;
                ghost.style.borderRadius = computedBorderRadius;

                // Layout cố định cho ghost
                ghost.style.position = 'fixed';
                ghost.style.top = '0px';
                ghost.style.left = '0px';
                ghost.style.right = 'auto';
                ghost.style.bottom = 'auto';
                ghost.style.width = `${elRect.width}px`;
                ghost.style.height = `${elRect.height}px`;
                ghost.style.margin = '0';
                ghost.style.zIndex = '99999';
                ghost.style.pointerEvents = 'none';
                ghost.style.boxSizing = 'border-box';
                ghost.style.transform = `translate3d(${lastClientX - grabOffsetX}px, ${lastClientY - grabOffsetY}px, 0)`;
                document.body.appendChild(ghost);
            }

            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    updateGhostAndTarget();
                });
            }
        };

        const onUp = async () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.body.style.userSelect = '';
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

            el.classList.remove('ht-session-block--dragging');
            if (ghost) { ghost.remove(); ghost = null; }

            if (!isDragging) return;

            // Click-suppression: ngăn click event bắn theo sau pointerup
            this._dragClickSuppressed = true;
            setTimeout(() => { this._dragClickSuppressed = false; }, 300);

            // No-op nếu không đổi vị trí
            if (newDate === origDate && newStart === origStart && newEnd === origEnd) return;

            await this._executeDragMove(sessionId, newDate, newStart, newEnd);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    },

    /**
     * Thực thi Drag Move: fetch full session → scope check → API update → _render().
     * Implements M7-2 (scope), M7-3 (server 409), M7-4 (rollback via _render).
     *
     * @param {number} sessionId
     * @param {string} newDate    YYYY-MM-DD
     * @param {string} newStart   HH:MM
     * @param {string} newEnd     HH:MM
     */
    async _executeDragMove(sessionId, newDate, newStart, newEnd) {
        let session;
        try {
            const data = await HT.api.call('hinteach_session_get', { session_id: sessionId }, 'GET');
            session = data.session;
            if (!session) {
                HT.utils.toast('Không tìm thấy thông tin buổi học.', 'error');
                await this._render();
                return;
            }
        } catch (err) {
            HT.utils.toast('Lỗi tải thông tin buổi học: ' + err.message, 'error');
            await this._render();
            return;
        }

        // M7-2: hỏi scope nếu thuộc chuỗi lặp và có following
        let updateScope = 'single';
        if (session.repeat_group_id && session.following_count > 0) {
            updateScope = await this._askScope('di chuyển', session.following_count);
            if (!updateScope) {
                // User cancel → abort, render lại về chỗ cũ
                await this._render();
                return;
            }
        }

        const studentIds = (session.students || []).map(s => parseInt(s.student_id, 10));
        const payload = {
            session_id: session.id,
            update_scope: updateScope,
            class_id: session.class_id,
            date: newDate,
            start_time: newStart,
            end_time: newEnd,
            type: session.type,
            student_ids: studentIds,
            price: session.price || 0,
            session_name: session.session_name || '',
            content: session.content || '',
            homework_content: session.homework_content || '',
            general_comment: session.general_comment || '',
            display_color: session.display_color || '',
            // M8: explicit discriminator — drag_move=true distinguishes this from Edit Form.
            // Backend uses this flag ONLY when update_scope="following" to apply delta semantics.
            // Edit Form submit handler does NOT include this field.
            drag_move: true,
        };

        try {
            const result = await HT.api.call('hinteach_session_save', payload);
            if (updateScope === 'following' && result.updated_count) {
                HT.utils.toast(`Đã di chuyển ${result.updated_count} buổi trong chuỗi lặp.`);
            } else {
                HT.utils.toast('Đã di chuyển buổi học thành công.');
            }
        } catch (err) {
            // M7-3: server 409 là source of truth
            if (err.status === 409 && err.serverData?.conflict) {
                const c = err.serverData.conflict;
                const conflictName = c.session_name
                    ? `"${HT.utils.escapeHtml(c.session_name)}"`
                    : 'buổi học';
                const conflictTime = `${this._fmtTime(c.start_time)} \u2013 ${this._fmtTime(c.end_time)}`;
                HT.utils.toast(
                    `Trùng lịch với ${conflictName} lúc ${conflictTime} ngày ${this._fmtShort(c.date)}.`,
                    'error'
                );
            } else {
                HT.utils.toast(err.message || 'Không thể di chuyển buổi học.', 'error');
            }
        }

        // M7-4: luôn _render() sau API call để đồng bộ UI với server
        await this._render();
    },
};

export default ScheduleModule;

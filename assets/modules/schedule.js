/**
 * HinTeach — Module: Thời khoá biểu (schedule)
 *
 * M1 — READ ONLY. Không có create/edit/delete/recurrence/quick-entry.
 * Gọi API hinteach_session_list để đọc sessions trong khoảng tuần đang xem.
 *
 * Shape: export default { async render(container) } — giống classes.js / students.js.
 * Không dùng thư viện ngoài. Không tự tạo state/framework riêng.
 *
 * @package HinTeach
 */

const ScheduleModule = {

    /** Ngày bất kỳ trong tuần đang xem — state nội bộ */
    _currentDate: new Date(),

    // ──────────────────────────────────────────────────────────
    // Entry point — gọi bởi HT.router.navigate('schedule')
    // ──────────────────────────────────────────────────────────

    /**
     * Render module vào container.
     * @param {HTMLElement} container
     */
    async render( container ) {
        // Reset về tuần hiện tại mỗi lần mount tab
        this._currentDate = new Date();

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
        document.getElementById( 'ht-session-add' )
            ?.addEventListener( 'click', () => this._openCreateForm() );

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
        const cal = document.getElementById( 'ht-schedule-calendar' );
        if ( ! cal ) return;

        const week = this._getWeekRange( this._currentDate );

        try {
            const sessions = await this._loadSessions( week.fromStr, week.toStr );
            cal.innerHTML = this._buildCalendarHtml( week, sessions );
            this._bindNavEvents();
            this._bindSessionEvents();
        } catch ( err ) {
            cal.innerHTML = `<div class="ht-error"><p>Lỗi tải lịch: ${HT.utils.escapeHtml(err.message)}</p></div>`;
        }
    },

    /**
     * Build toàn bộ HTML calendar tuần.
     *
     * @param {{ from: Date, to: Date, fromStr: string, toStr: string }} week
     * @param {Array} sessions
     * @returns {string} HTML string
     */
    _buildCalendarHtml( week, sessions ) {
        const DAY_LABELS = [ 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN' ];
        const today      = this._toIso( new Date() );

        // Nhóm session theo ngày (isoDate → session[])
        const byDay = {};
        for ( const s of sessions ) {
            if ( ! byDay[ s.date ] ) byDay[ s.date ] = [];
            byDay[ s.date ].push( s );
        }

        // Mảng 7 ngày T2..CN bắt đầu từ week.from
        const days = [];
        for ( let i = 0; i < 7; i++ ) {
            const d = new Date( week.from );
            d.setDate( week.from.getDate() + i );
            days.push( this._toIso( d ) );
        }

        // Label header: "25/08 – 31/08/2026"
        const headerLabel = `${this._fmtShort( week.fromStr )} – ${this._fmtShort( week.toStr )}/${week.toStr.slice( 0, 4 )}`;

        const colsHtml = days.map( ( isoDate, i ) => {
            const isToday = isoDate === today;
            const blocks  = ( byDay[ isoDate ] || [] )
                .map( s => this._renderSessionBlock( s ) )
                .join( '' );

            return `
                <div class="ht-cal__col${isToday ? ' ht-cal__col--today' : ''}">
                    <div class="ht-cal__day-header">
                        <span class="ht-cal__day-name">${DAY_LABELS[ i ]}</span>
                        <span class="ht-cal__day-date">${this._fmtShort( isoDate )}</span>
                    </div>
                    <div class="ht-cal__day-body">
                        ${blocks}
                    </div>
                </div>
            `;
        } ).join( '' );

        return `
            <div class="ht-cal__nav">
                <button type="button" class="ht-btn ht-btn--ghost" id="ht-cal-prev">← Tuần trước</button>
                <span class="ht-cal__week-label">${HT.utils.escapeHtml( headerLabel )}</span>
                <button type="button" class="ht-btn ht-btn--ghost" id="ht-cal-next">Tuần sau →</button>
            </div>
            <div class="ht-cal__grid">
                ${colsHtml}
            </div>
        `;
    },

    /**
     * Render 1 session block trong ô ngày.
     * display_color ưu tiên; fallback về class_color.
     * Không có click handler trong M1.
     *
     * @param {Object} s  Session object
     * @returns {string} HTML string
     */
    _renderSessionBlock( s ) {
        const color    = HT.utils.escapeHtml( s.display_color || s.class_color || '#888888' );
        const name     = HT.utils.escapeHtml( s.class_name || '' );
        const sessName = s.session_name ? HT.utils.escapeHtml( s.session_name ) : '';
        const timeStr  = this._fmtTime( s.start_time ) +
                         ( s.end_time ? ' – ' + this._fmtTime( s.end_time ) : '' );

        return `
            <div class="ht-session-block" data-id="${s.id}" style="border-left:3px solid ${color};">
                <div class="ht-session-block__name">${name}</div>
                ${sessName ? `<div class="ht-session-block__title">${sessName}</div>` : ''}
                <div class="ht-session-block__time">${HT.utils.escapeHtml( timeStr )}</div>
            </div>
        `;
    },

    /** Bind click sự kiện trên các session block để mở modal chỉnh sửa */
    _bindSessionEvents() {
        document.querySelectorAll( '.ht-session-block[data-id]' ).forEach( el => {
            el.addEventListener( 'click', () => {
                const id = parseInt( el.dataset.id, 10 );
                if ( id ) this._openEditForm( id );
            } );
        } );
    },

    // ──────────────────────────────────────────────────────────
    // Navigation
    // ──────────────────────────────────────────────────────────

    /**
     * Chuyển tuần.
     * @param {number} delta  -1 = tuần trước, +1 = tuần sau
     */
    _navigate( delta ) {
        this._currentDate = new Date( this._currentDate );
        this._currentDate.setDate( this._currentDate.getDate() + delta * 7 );
        this._render();
    },

    /** Bind nút ← → sau mỗi lần render */
    _bindNavEvents() {
        document.getElementById( 'ht-cal-prev' )
            ?.addEventListener( 'click', () => this._navigate( -1 ) );
        document.getElementById( 'ht-cal-next' )
            ?.addEventListener( 'click', () => this._navigate( +1 ) );
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
    async _loadSessions( fromStr, toStr ) {
        const data = await HT.api.call( 'hinteach_session_list', {
            date_from: fromStr,
            date_to:   toStr,
        }, 'GET' );
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
    _getWeekRange( date ) {
        const d      = new Date( date );
        const day    = d.getDay();            // 0=CN,1=T2,...,6=T7
        const offset = ( day + 6 ) % 7;      // T2→0, T3→1, ..., CN→6

        const from = new Date( d );
        from.setDate( d.getDate() - offset ); // T2 của tuần

        const to = new Date( from );
        to.setDate( from.getDate() + 6 );     // CN của tuần

        return { from, to, fromStr: this._toIso( from ), toStr: this._toIso( to ) };
    },

    /** Date → 'YYYY-MM-DD' */
    _toIso( date ) {
        const y = date.getFullYear();
        const m = String( date.getMonth() + 1 ).padStart( 2, '0' );
        const d = String( date.getDate() ).padStart( 2, '0' );
        return `${y}-${m}-${d}`;
    },

    /** 'YYYY-MM-DD' → 'DD/MM' */
    _fmtShort( iso ) {
        return iso.slice( 8, 10 ) + '/' + iso.slice( 5, 7 );
    },

    /** 'HH:MM:SS' hoặc 'HH:MM' → 'HH:MM' */
    _fmtTime( timeStr ) {
        if ( ! timeStr ) return '';
        return timeStr.slice( 0, 5 );
    },

    // ──────────────────────────────────────────────────────────
    // M2: Tạo buổi học
    // ──────────────────────────────────────────────────────────

    /**
     * Mở form tạo buổi học mới.
     * Load danh sách lớp, hiển modal, bind events.
     */
    async _openCreateForm() {
        // Load danh sách lớp
        let classes = [];
        try {
            const data = await HT.api.call( 'hinteach_class_list', {}, 'POST' );
            classes = data.classes || [];
        } catch ( err ) {
            HT.utils.toast( 'Không thể tải danh sách lớp: ' + err.message, 'error' );
            return;
        }

        if ( ! classes.length ) {
            HT.utils.toast( 'Chưa có lớp học nào. Vui lòng tạo lớp trước.', 'error' );
            return;
        }

        const today = this._toIso( new Date() );

        HT.modal.open( {
            title: 'Tạo buổi học mới',
            body: this._buildCreateFormHtml( classes, today ),
            footer: `
                <button type="button" class="ht-btn ht-btn--secondary" id="ht-session-form-cancel">Huỷ</button>
                <button type="button" class="ht-btn ht-btn--primary" id="ht-session-form-save">Tạo buổi</button>
            `,
        } );

        // Internal state for repeat dates
        this._repeatDates = [];

        // Bind events
        document.getElementById( 'ht-session-form-cancel' )
            ?.addEventListener( 'click', () => HT.modal.close() );
        document.getElementById( 'ht-session-form-save' )
            ?.addEventListener( 'click', () => this._saveSession() );
        document.getElementById( 'ht-sf-class' )
            ?.addEventListener( 'change', ( e ) => this._onClassChange( e.target.value ) );
        document.querySelectorAll( 'input[name="type"]' ).forEach( r => {
            r.addEventListener( 'change', () => this._onTypeChange() );
        } );
        document.getElementById( 'ht-sf-color-toggle' )
            ?.addEventListener( 'change', ( e ) => {
                const colorInput = document.getElementById( 'ht-sf-color' );
                if ( colorInput ) colorInput.disabled = ! e.target.checked;
            } );

        // M3: Recurrence event bindings
        document.getElementById( 'ht-sf-repeat-toggle' )
            ?.addEventListener( 'change', ( e ) => {
                const panel = document.getElementById( 'ht-sf-repeat-panel' );
                if ( panel ) panel.style.display = e.target.checked ? '' : 'none';
                if ( ! e.target.checked ) {
                    this._repeatDates = [];
                    this._renderRepeatChips();
                }
            } );
        document.querySelectorAll( 'input[name="repeat_mode"]' ).forEach( r => {
            r.addEventListener( 'change', () => this._onRecurrenceChange() );
        } );
        document.getElementById( 'ht-sf-repeat-until' )
            ?.addEventListener( 'change', () => this._onRecurrenceChange() );
        document.querySelectorAll( '.ht-weekday-btn' ).forEach( btn => {
            btn.addEventListener( 'click', () => {
                btn.classList.toggle( 'ht-weekday-btn--active' );
                this._onRecurrenceChange();
            } );
        } );
        document.getElementById( 'ht-sf-repeat-gen' )
            ?.addEventListener( 'click', () => this._onRecurrenceChange() );
        document.getElementById( 'ht-sf-custom-date' )
            ?.addEventListener( 'keydown', ( e ) => {
                if ( e.key === 'Enter' ) { e.preventDefault(); this._addCustomRepeatDate(); }
            } );
        document.getElementById( 'ht-sf-custom-add' )
            ?.addEventListener( 'click', () => this._addCustomRepeatDate() );
    },

    /**
     * Build HTML form tạo buổi học.
     *
     * @param {Array} classes    Danh sách lớp
     * @param {string} defaultDate  YYYY-MM-DD
     * @returns {string} HTML
     */
    _buildCreateFormHtml( classes, defaultDate ) {
        return `
            <form id="ht-session-form" class="ht-form">
                <fieldset class="ht-form__fieldset">
                    <legend>Lớp học</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-class">Lớp *</label>
                        <select id="ht-sf-class" name="class_id" class="ht-form__select" required>
                            <option value="">-- Chọn lớp --</option>
                            ${classes.map( c => `<option value="${c.id}" data-fee="${c.fee_amount || 0}">${HT.utils.escapeHtml( c.name )}</option>` ).join( '' )}
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
                            <input type="time" id="ht-sf-start" name="start_time" class="ht-form__input" required />
                        </div>
                        <div class="ht-form__row-half">
                            <label class="ht-form__label" for="ht-sf-end">Kết thúc *</label>
                            <input type="time" id="ht-sf-end" name="end_time" class="ht-form__input" required />
                        </div>
                    </div>
                </fieldset>

                <fieldset class="ht-form__fieldset">
                    <legend>Loại buổi & Học sinh</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label">Loại buổi *</label>
                        <div class="ht-form__radio-group">
                            <label><input type="radio" name="type" value="riêng" checked /> Riêng (1-1)</label>
                            <label><input type="radio" name="type" value="chung" /> Chung (nhóm)</label>
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
                        <input type="number" id="ht-sf-price" name="price" class="ht-form__input" min="0" step="1000" value="0" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-name">Tên buổi học</label>
                        <input type="text" id="ht-sf-name" name="session_name" class="ht-form__input" placeholder="(Tuỳ chọn)" />
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
     */
    async _onClassChange( classId ) {
        const container = document.getElementById( 'ht-sf-students-container' );
        if ( ! container ) return;

        if ( ! classId ) {
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
            const data = await HT.api.call( 'hinteach_class_get', { class_id: classId }, 'GET' );
            const students  = data.students || [];
            const classData = data.class;

            // Prefill giá từ class.fee_amount
            const priceInput = document.getElementById( 'ht-sf-price' );
            if ( priceInput && classData && classData.fee_amount ) {
                priceInput.value = classData.fee_amount;
            }

            this._renderStudentsList( students );
        } catch ( err ) {
            container.innerHTML = `
                <label class="ht-form__label">Học sinh *</label>
                <p class="ht-form__note">Lỗi tải danh sách: ${HT.utils.escapeHtml( err.message )}</p>
            `;
        }
    },

    /**
     * Render danh sách học sinh (checkboxes) trong form.
     *
     * @param {Array} students
     */
    _renderStudentsList( students ) {
        const container = document.getElementById( 'ht-sf-students-container' );
        if ( ! container ) return;

        if ( ! students.length ) {
            container.innerHTML = `
                <label class="ht-form__label">Học sinh *</label>
                <p class="ht-form__note">Lớp này chưa có học sinh nào.</p>
            `;
            return;
        }

        const type = document.querySelector( 'input[name="type"]:checked' )?.value || 'riêng';
        const hint = type === 'riêng' ? '(chọn 1)' : '(chọn ít nhất 2)';

        container.innerHTML = `
            <label class="ht-form__label">Học sinh * ${hint}</label>
            <div class="ht-multi-select" id="ht-sf-students">
                ${students.map( s => `
                    <label class="ht-multi-select__item">
                        <input type="checkbox" name="student_ids" value="${s.id}" />
                        <span>${HT.utils.escapeHtml( s.name )}</span>
                    </label>
                ` ).join( '' )}
            </div>
        `;
    },

    /** Cập nhật label học sinh khi đổi type riêng/chung. */
    _onTypeChange() {
        const studentsDiv = document.getElementById( 'ht-sf-students' );
        if ( ! studentsDiv ) return;

        const type  = document.querySelector( 'input[name="type"]:checked' )?.value || 'riêng';
        const hint  = type === 'riêng' ? '(chọn 1)' : '(chọn ít nhất 2)';
        const label = studentsDiv.closest( '.ht-form__row' )?.querySelector( '.ht-form__label' );
        if ( label ) {
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
        const mode = document.querySelector( 'input[name="repeat_mode"]:checked' )?.value || 'daily';

        // Show/hide UI elements based on mode
        const untilRow   = document.getElementById( 'ht-sf-repeat-until-row' );
        const weekdayRow = document.getElementById( 'ht-sf-weekday-row' );
        const customRow  = document.getElementById( 'ht-sf-custom-row' );
        const genRow     = document.getElementById( 'ht-sf-repeat-gen-row' );

        if ( untilRow )   untilRow.style.display   = mode === 'custom' ? 'none' : '';
        if ( weekdayRow ) weekdayRow.style.display  = mode === 'weekly' ? '' : 'none';
        if ( customRow )  customRow.style.display   = mode === 'custom' ? '' : 'none';
        if ( genRow )     genRow.style.display      = mode === 'custom' ? 'none' : '';

        // For non-custom modes, generate dates
        if ( mode !== 'custom' ) {
            const baseDate = document.getElementById( 'ht-sf-date' )?.value || '';
            const until    = document.getElementById( 'ht-sf-repeat-until' )?.value || '';

            if ( ! baseDate || ! until ) return;
            if ( until <= baseDate ) {
                HT.utils.toast( 'Ngày kết thúc lặp phải sau ngày gốc.', 'error' );
                return;
            }

            let selectedWeekdays = [];
            if ( mode === 'weekly' ) {
                selectedWeekdays = Array.from(
                    document.querySelectorAll( '.ht-weekday-btn--active' )
                ).map( btn => parseInt( btn.dataset.day, 10 ) );

                if ( ! selectedWeekdays.length ) {
                    HT.utils.toast( 'Vui lòng chọn ít nhất 1 thứ trong tuần.', 'error' );
                    return;
                }
            }

            this._repeatDates = this._generateRepeatDates( mode, baseDate, until, selectedWeekdays );
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
    _generateRepeatDates( mode, startDate, until, weekdays ) {
        const dates = [];
        const start = new Date( startDate + 'T00:00:00' );
        const end   = new Date( until + 'T00:00:00' );

        if ( mode === 'daily' ) {
            const cursor = new Date( start );
            cursor.setDate( cursor.getDate() + 1 ); // Bắt đầu từ ngày sau base
            while ( cursor <= end && dates.length < 365 ) {
                dates.push( this._toIso( cursor ) );
                cursor.setDate( cursor.getDate() + 1 );
            }
        } else if ( mode === 'weekly' ) {
            const cursor = new Date( start );
            cursor.setDate( cursor.getDate() + 1 );
            while ( cursor <= end && dates.length < 365 ) {
                if ( weekdays.includes( cursor.getDay() ) ) {
                    dates.push( this._toIso( cursor ) );
                }
                cursor.setDate( cursor.getDate() + 1 );
            }
        } else if ( mode === 'monthly' ) {
            // Lặp cùng thứ-occurrence trong tháng (vd: thứ 3 tuần thứ 2)
            const baseDay       = start.getDay(); // 0-6
            const baseOccurrence = Math.ceil( start.getDate() / 7 ); // Occurrence 1-5

            let month = start.getMonth();
            let year  = start.getFullYear();

            while ( dates.length < 365 ) {
                month++;
                if ( month > 11 ) { month = 0; year++; }

                const candidate = this._nthWeekdayOfMonth( year, month, baseDay, baseOccurrence );
                if ( ! candidate ) continue;
                if ( candidate > this._toIso( end ) ) break;
                if ( candidate <= startDate ) continue;

                dates.push( candidate );
            }
        }

        // Dedupe (Set), sort, slice(0, 365) — v3 fix
        const unique = [ ...new Set( dates ) ];
        unique.sort();
        return unique.slice( 0, 365 );
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
    _nthWeekdayOfMonth( year, month, weekday, occurrence ) {
        // Tìm ngày đầu tiên trong tháng có đúng weekday
        const firstDay = new Date( year, month, 1 );
        let firstOccurrence = 1 + ( ( weekday - firstDay.getDay() + 7 ) % 7 );

        // Tính ngày target
        let targetDate = firstOccurrence + ( occurrence - 1 ) * 7;

        // Số ngày trong tháng
        const daysInMonth = new Date( year, month + 1, 0 ).getDate();

        // Fallback: nếu vượt quá → lùi về occurrence cuối cùng
        while ( targetDate > daysInMonth ) {
            targetDate -= 7;
        }

        if ( targetDate < 1 ) return null;

        const d = new Date( year, month, targetDate );
        return this._toIso( d );
    },

    /**
     * Render chip list preview cho repeat_dates.
     */
    _renderRepeatChips() {
        const container = document.getElementById( 'ht-sf-repeat-chips' );
        const countEl   = document.getElementById( 'ht-sf-repeat-count' );
        if ( ! container ) return;

        if ( countEl ) countEl.textContent = this._repeatDates.length;

        if ( ! this._repeatDates.length ) {
            container.innerHTML = '<p class="ht-form__note">Chưa có ngày lặp nào.</p>';
            return;
        }

        container.innerHTML = this._repeatDates.map( d => `
            <span class="ht-chip">
                ${this._fmtShort( d )}
                <button type="button" class="ht-chip__remove" data-date="${d}">&times;</button>
            </span>
        ` ).join( '' );

        // Bind remove events
        container.querySelectorAll( '.ht-chip__remove' ).forEach( btn => {
            btn.addEventListener( 'click', () => this._removeRepeatDate( btn.dataset.date ) );
        } );
    },

    /**
     * Xoá 1 ngày khỏi repeat_dates và re-render chips.
     * @param {string} dateStr  YYYY-MM-DD
     */
    _removeRepeatDate( dateStr ) {
        this._repeatDates = this._repeatDates.filter( d => d !== dateStr );
        this._renderRepeatChips();
    },

    /**
     * Thêm 1 ngày thủ công vào repeat_dates (custom mode).
     */
    _addCustomRepeatDate() {
        const input    = document.getElementById( 'ht-sf-custom-date' );
        const baseDate = document.getElementById( 'ht-sf-date' )?.value || '';
        if ( ! input || ! input.value ) {
            HT.utils.toast( 'Vui lòng chọn ngày.', 'error' );
            return;
        }

        const newDate = input.value;

        if ( newDate <= baseDate ) {
            HT.utils.toast( 'Ngày lặp phải sau ngày gốc (' + this._fmtShort( baseDate ) + ').', 'error' );
            return;
        }

        if ( this._repeatDates.includes( newDate ) ) {
            HT.utils.toast( 'Ngày này đã có trong danh sách.', 'error' );
            return;
        }

        if ( this._repeatDates.length >= 365 ) {
            HT.utils.toast( 'Đã đạt giới hạn 365 ngày lặp.', 'error' );
            return;
        }

        this._repeatDates.push( newDate );
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
        const form = document.getElementById( 'ht-session-form' );
        if ( ! form ) return;

        // Collect
        const classId   = form.querySelector( '[name="class_id"]' )?.value || '';
        const date      = form.querySelector( '[name="date"]' )?.value || '';
        const startTime = form.querySelector( '[name="start_time"]' )?.value || '';
        const endTime   = form.querySelector( '[name="end_time"]' )?.value || '';
        const type      = form.querySelector( 'input[name="type"]:checked' )?.value || '';
        const price     = form.querySelector( '[name="price"]' )?.value || '0';
        const sessName  = form.querySelector( '[name="session_name"]' )?.value || '';

        // Color — chỉ gửi nếu checkbox bật
        const colorToggle  = document.getElementById( 'ht-sf-color-toggle' );
        const displayColor = colorToggle?.checked
            ? ( form.querySelector( '[name="display_color"]' )?.value || '' )
            : '';

        // Student IDs
        const studentCheckboxes = form.querySelectorAll( 'input[name="student_ids"]:checked' );
        const studentIds = Array.from( studentCheckboxes ).map( cb => cb.value );

        // M3: Repeat dates
        const repeatToggle = document.getElementById( 'ht-sf-repeat-toggle' );
        const isRecurring  = repeatToggle?.checked && this._repeatDates && this._repeatDates.length > 0;

        // ── Client-side validate ───────────────────────────
        if ( ! classId ) { HT.utils.toast( 'Vui lòng chọn lớp.', 'error' ); return; }
        if ( ! date )    { HT.utils.toast( 'Vui lòng chọn ngày.', 'error' ); return; }
        if ( ! startTime || ! endTime ) {
            HT.utils.toast( 'Vui lòng nhập giờ bắt đầu và kết thúc.', 'error' ); return;
        }
        if ( startTime >= endTime ) {
            HT.utils.toast( 'Giờ bắt đầu phải trước giờ kết thúc.', 'error' ); return;
        }
        if ( ! type ) { HT.utils.toast( 'Vui lòng chọn loại buổi.', 'error' ); return; }
        if ( type === 'riêng' && studentIds.length !== 1 ) {
            HT.utils.toast( 'Buổi riêng phải chọn đúng 1 học sinh.', 'error' ); return;
        }
        if ( type === 'chung' && studentIds.length < 2 ) {
            HT.utils.toast( 'Buổi chung phải chọn ít nhất 2 học sinh.', 'error' ); return;
        }

        // M3: validate recurring
        if ( isRecurring && this._repeatDates.length > 365 ) {
            HT.utils.toast( 'Số ngày lặp tối đa là 365.', 'error' ); return;
        }

        // Payload
        const payload = {
            class_id:      classId,
            date:          date,
            start_time:    startTime,
            end_time:      endTime,
            type:          type,
            student_ids:   studentIds,
            price:         price,
            session_name:  sessName,
            display_color: displayColor,
        };

        // M3: Thêm repeat_dates nếu recurring
        if ( isRecurring ) {
            payload.repeat_dates = this._repeatDates;
        }

        // Chọn action: recurring (M3) hay single (M2)
        const action = isRecurring ? 'hinteach_session_save_recurring' : 'hinteach_session_save';
        const btnLabel = isRecurring ? 'Tạo buổi lặp' : 'Tạo buổi';

        try {
            const saveBtn = document.getElementById( 'ht-session-form-save' );
            if ( saveBtn ) { saveBtn.disabled = true; saveBtn.textContent = 'Đang tạo...'; }

            const result = await HT.api.call( action, payload );
            HT.modal.close();

            if ( isRecurring && result.created_count ) {
                HT.utils.toast( `Đã tạo ${result.created_count} buổi học thành công.` );
            } else {
                HT.utils.toast( 'Đã tạo buổi học thành công.' );
            }
            await this._render(); // Refresh calendar
        } catch ( err ) {
            // Xử lý conflict 409 với structured payload
            if ( err.status === 409 && err.serverData?.conflict ) {
                const c = err.serverData.conflict;
                const conflictName = c.session_name
                    ? `"${HT.utils.escapeHtml( c.session_name )}"`
                    : 'buổi học';
                const conflictTime = `${this._fmtTime( c.start_time )} – ${this._fmtTime( c.end_time )}`;
                HT.utils.toast(
                    `Trùng lịch với ${conflictName} lúc ${conflictTime} ngày ${this._fmtShort( c.date )}.`,
                    'error'
                );
            } else {
                HT.utils.toast( err.message, 'error' );
            }
            const saveBtn = document.getElementById( 'ht-session-form-save' );
            if ( saveBtn ) { saveBtn.disabled = false; saveBtn.textContent = btnLabel; }
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
    async _openEditForm( sessionId ) {
        try {
            const [ sessionData, classesData ] = await Promise.all( [
                HT.api.call( 'hinteach_session_get', { session_id: sessionId }, 'GET' ),
                HT.api.call( 'hinteach_class_list', {}, 'POST' ),
            ] );

            const session = sessionData.session;
            const classes = classesData.classes || [];

            if ( ! session ) {
                HT.utils.toast( 'Không tìm thấy thông tin buổi học.', 'error' );
                return;
            }

            // Load học sinh của lớp hiện tại để render danh sách chọn
            let classStudents = [];
            try {
                const classDetail = await HT.api.call( 'hinteach_class_get', { class_id: session.class_id }, 'GET' );
                classStudents = classDetail.students || [];
            } catch ( e ) {
                classStudents = ( session.students || [] ).map( s => ( { id: s.student_id, name: s.name } ) );
            }

            HT.modal.open( {
                title: 'Chỉnh sửa buổi học',
                body: this._buildEditFormHtml( classes, session, classStudents ),
                footer: `
                    <button type="button" class="ht-btn ht-btn--danger ht-btn--ghost" id="ht-session-form-delete" style="margin-right:auto;">Xoá buổi</button>
                    <button type="button" class="ht-btn ht-btn--secondary" id="ht-session-form-cancel">Huỷ</button>
                    <button type="button" class="ht-btn ht-btn--primary" id="ht-session-form-update">Lưu thay đổi</button>
                `,
            } );

            // Bind events
            document.getElementById( 'ht-session-form-cancel' )
                ?.addEventListener( 'click', () => HT.modal.close() );
            document.getElementById( 'ht-session-form-update' )
                ?.addEventListener( 'click', () => this._updateSession( session ) );
            document.getElementById( 'ht-session-form-delete' )
                ?.addEventListener( 'click', () => this._deleteSession( session ) );
            document.getElementById( 'ht-sf-class' )
                ?.addEventListener( 'change', ( e ) => this._onClassChange( e.target.value ) );
            document.querySelectorAll( 'input[name="type"]' ).forEach( r => {
                r.addEventListener( 'change', () => this._onTypeChange() );
            } );
            document.getElementById( 'ht-sf-color-toggle' )
                ?.addEventListener( 'change', ( e ) => {
                    const colorInput = document.getElementById( 'ht-sf-color' );
                    if ( colorInput ) colorInput.disabled = ! e.target.checked;
                } );
        } catch ( err ) {
            HT.utils.toast( 'Không thể tải thông tin buổi học: ' + err.message, 'error' );
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
    _buildEditFormHtml( classes, session, classStudents ) {
        const assignedStudentIds = ( session.students || [] ).map( s => parseInt( s.student_id, 10 ) );
        const isRecurring        = !! session.repeat_group_id;
        const followingCount     = session.following_count || 0;
        const hasCustomColor     = !! session.display_color;
        const startTime          = session.start_time ? session.start_time.slice( 0, 5 ) : '';
        const endTime            = session.end_time ? session.end_time.slice( 0, 5 ) : '';

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
                            ${classes.map( c => `
                                <option value="${c.id}" data-fee="${c.fee_amount || 0}" ${Number( c.id ) === Number( session.class_id ) ? 'selected' : ''}>
                                    ${HT.utils.escapeHtml( c.name )}
                                </option>
                            ` ).join( '' )}
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
                            ${classStudents.map( s => `
                                <label class="ht-multi-select__item">
                                    <input type="checkbox" name="student_ids" value="${s.id}" ${assignedStudentIds.includes( parseInt( s.id, 10 ) ) ? 'checked' : ''} />
                                    <span>${HT.utils.escapeHtml( s.name )}</span>
                                </label>
                            ` ).join( '' )}
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
                        <input type="text" id="ht-sf-name" name="session_name" class="ht-form__input" placeholder="(Tuỳ chọn)" value="${HT.utils.escapeHtml( session.session_name || '' )}" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-content">Nội dung buổi học</label>
                        <textarea id="ht-sf-content" name="content" class="ht-form__textarea" rows="2" placeholder="(Tuỳ chọn)">${HT.utils.escapeHtml( session.content || '' )}</textarea>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-homework">Nội dung bài tập về nhà</label>
                        <textarea id="ht-sf-homework" name="homework_content" class="ht-form__textarea" rows="2" placeholder="(Tuỳ chọn)">${HT.utils.escapeHtml( session.homework_content || '' )}</textarea>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-sf-comment">Nhận xét chung</label>
                        <textarea id="ht-sf-comment" name="general_comment" class="ht-form__textarea" rows="2" placeholder="(Tuỳ chọn)">${HT.utils.escapeHtml( session.general_comment || '' )}</textarea>
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
            </form>
        `;
    },

    /**
     * Modal chọn scope (single / following) cho buổi lặp.
     *
     * @param {string} actionText    'cập nhật' | 'xoá'
     * @param {number} followingCount Số buổi sau
     * @returns {Promise<'single'|'following'|null>}
     */
    _askScope( actionText = 'cập nhật', followingCount = 0 ) {
        return new Promise( ( resolve ) => {
            let resolved = false;
            const totalFollowing = followingCount + 1;

            HT.modal.open( {
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
                    if ( resolved ) return;
                    resolved = true;
                    resolve( null );
                },
            } );

            document.getElementById( 'ht-scope-single' )?.addEventListener( 'click', () => {
                resolved = true;
                HT.modal.close();
                resolve( 'single' );
            } );

            document.getElementById( 'ht-scope-following' )?.addEventListener( 'click', () => {
                resolved = true;
                HT.modal.close();
                resolve( 'following' );
            } );

            document.getElementById( 'ht-scope-cancel' )?.addEventListener( 'click', () => {
                resolved = true;
                HT.modal.close();
                resolve( null );
            } );
        } );
    },

    /**
     * Submit cập nhật buổi học.
     *
     * @param {Object} currentSession
     */
    async _updateSession( currentSession ) {
        const form = document.getElementById( 'ht-session-form' );
        if ( ! form ) return;

        const classId   = form.querySelector( '[name="class_id"]' )?.value || '';
        const date      = form.querySelector( '[name="date"]' )?.value || '';
        const startTime = form.querySelector( '[name="start_time"]' )?.value || '';
        const endTime   = form.querySelector( '[name="end_time"]' )?.value || '';
        const type      = form.querySelector( 'input[name="type"]:checked' )?.value || '';
        const price     = form.querySelector( '[name="price"]' )?.value || '0';
        const sessName  = form.querySelector( '[name="session_name"]' )?.value || '';
        const content   = form.querySelector( '[name="content"]' )?.value || '';
        const homework  = form.querySelector( '[name="homework_content"]' )?.value || '';
        const comment   = form.querySelector( '[name="general_comment"]' )?.value || '';

        const colorToggle  = document.getElementById( 'ht-sf-color-toggle' );
        const displayColor = colorToggle?.checked
            ? ( form.querySelector( '[name="display_color"]' )?.value || '' )
            : '';

        const studentCheckboxes = form.querySelectorAll( 'input[name="student_ids"]:checked' );
        const studentIds = Array.from( studentCheckboxes ).map( cb => cb.value );

        // Validate
        if ( ! classId ) { HT.utils.toast( 'Vui lòng chọn lớp.', 'error' ); return; }
        if ( ! date )    { HT.utils.toast( 'Vui lòng chọn ngày.', 'error' ); return; }
        if ( ! startTime || ! endTime ) {
            HT.utils.toast( 'Vui lòng nhập giờ bắt đầu và kết thúc.', 'error' ); return;
        }
        if ( startTime >= endTime ) {
            HT.utils.toast( 'Giờ bắt đầu phải trước giờ kết thúc.', 'error' ); return;
        }
        if ( ! type ) { HT.utils.toast( 'Vui lòng chọn loại buổi.', 'error' ); return; }
        if ( type === 'riêng' && studentIds.length !== 1 ) {
            HT.utils.toast( 'Buổi riêng phải chọn đúng 1 học sinh.', 'error' ); return;
        }
        if ( type === 'chung' && studentIds.length < 2 ) {
            HT.utils.toast( 'Buổi chung phải chọn ít nhất 2 học sinh.', 'error' ); return;
        }

        // Scope
        let scope = 'single';
        if ( currentSession.repeat_group_id && currentSession.following_count > 0 ) {
            scope = await this._askScope( 'cập nhật', currentSession.following_count );
            if ( ! scope ) {
                return; // User cancelled
            }
        }

        const payload = {
            session_id:       currentSession.id,
            update_scope:     scope,
            class_id:         classId,
            date:             date,
            start_time:       startTime,
            end_time:         endTime,
            type:             type,
            student_ids:      studentIds,
            price:            price,
            session_name:     sessName,
            content:          content,
            homework_content: homework,
            general_comment:  comment,
            display_color:    displayColor,
        };

        try {
            const updateBtn = document.getElementById( 'ht-session-form-update' );
            if ( updateBtn ) { updateBtn.disabled = true; updateBtn.textContent = 'Đang lưu...'; }

            const result = await HT.api.call( 'hinteach_session_save', payload );
            HT.modal.close();

            if ( result.scope === 'following' && result.updated_count ) {
                HT.utils.toast( `Đã cập nhật ${result.updated_count} buổi trong chuỗi lặp.` );
            } else {
                HT.utils.toast( result.message || 'Đã cập nhật buổi học thành công.' );
            }
            await this._render();
        } catch ( err ) {
            if ( err.status === 409 && err.serverData?.conflict ) {
                const c = err.serverData.conflict;
                const conflictName = c.session_name
                    ? `"${HT.utils.escapeHtml( c.session_name )}"`
                    : 'buổi học';
                const conflictTime = `${this._fmtTime( c.start_time )} – ${this._fmtTime( c.end_time )}`;
                HT.utils.toast(
                    `Trùng lịch với ${conflictName} lúc ${conflictTime} ngày ${this._fmtShort( c.date )}.`,
                    'error'
                );
            } else {
                HT.utils.toast( err.message, 'error' );
            }
            const updateBtn = document.getElementById( 'ht-session-form-update' );
            if ( updateBtn ) { updateBtn.disabled = false; updateBtn.textContent = 'Lưu thay đổi'; }
        }
    },

    /**
     * Xoá buổi học (single hoặc following).
     *
     * @param {Object} currentSession
     */
    async _deleteSession( currentSession ) {
        let scope = 'single';
        if ( currentSession.repeat_group_id && currentSession.following_count > 0 ) {
            scope = await this._askScope( 'xoá', currentSession.following_count );
            if ( ! scope ) {
                return;
            }
        }

        const confirmMsg = scope === 'following'
            ? `Bạn có chắc chắn muốn xoá buổi học này và ${currentSession.following_count} buổi tiếp theo trong chuỗi lặp?`
            : 'Bạn có chắc chắn muốn xoá buổi học này?';

        const confirmed = await HT.modal.confirm( confirmMsg );
        if ( ! confirmed ) return;

        try {
            const result = await HT.api.call( 'hinteach_session_delete', {
                session_id: currentSession.id,
                scope:      scope,
            } );

            HT.modal.close();

            if ( result.scope === 'following' && result.deleted_count ) {
                HT.utils.toast( `Đã xoá ${result.deleted_count} buổi trong chuỗi lặp.` );
            } else {
                HT.utils.toast( result.message || 'Đã xoá buổi học.' );
            }

            await this._render();
        } catch ( err ) {
            HT.utils.toast( err.message, 'error' );
        }
    },
};

export default ScheduleModule;

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
            <div class="ht-session-block" style="border-left:3px solid ${color};">
                <div class="ht-session-block__name">${name}</div>
                ${sessName ? `<div class="ht-session-block__title">${sessName}</div>` : ''}
                <div class="ht-session-block__time">${HT.utils.escapeHtml( timeStr )}</div>
            </div>
        `;
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

    /**
     * Submit form tạo buổi học.
     * Client-side validate → gọi API → xử lý conflict 409 / success.
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

        try {
            const saveBtn = document.getElementById( 'ht-session-form-save' );
            if ( saveBtn ) { saveBtn.disabled = true; saveBtn.textContent = 'Đang tạo...'; }

            await HT.api.call( 'hinteach_session_save', payload );
            HT.modal.close();
            HT.utils.toast( 'Đã tạo buổi học thành công.' );
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
            if ( saveBtn ) { saveBtn.disabled = false; saveBtn.textContent = 'Tạo buổi'; }
        }
    },
};

export default ScheduleModule;

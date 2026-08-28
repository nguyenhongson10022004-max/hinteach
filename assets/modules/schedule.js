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
                </div>
                <div id="ht-schedule-calendar"></div>
            </div>
        `;

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
};

export default ScheduleModule;

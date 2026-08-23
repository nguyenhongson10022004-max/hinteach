/**
 * HinTeach — Module: Lớp học (classes)
 *
 * CRUD lớp học (3 billing_mode: session/course/monthly).
 * Form tạo/sửa 4 phần: thông tin, học phí, lịch học, chọn học sinh.
 * Gọi API qua HT.api.call(), KHÔNG fetch() trực tiếp.
 *
 * @package HinTeach
 */

const ClassesModule = {
    /**
     * Render module vào container.
     * @param {HTMLElement} container
     */
    async render( container ) {
        container.innerHTML = `
            <div class="ht-module ht-module--classes">
                <div class="ht-module__header">
                    <h2 class="ht-module__title">Lớp học</h2>
                    <button type="button" class="ht-btn ht-btn--primary" id="ht-class-add">+ Tạo lớp mới</button>
                </div>
                <div class="ht-module__body" id="ht-class-list-container">
                    <div class="ht-content__loading"><div class="ht-spinner"></div><p>Đang tải...</p></div>
                </div>
            </div>
        `;

        // Bind sự kiện
        document.getElementById( 'ht-class-add' )?.addEventListener( 'click', () => this.openForm() );

        // Load danh sách
        await this.loadList();
    },

    /**
     * Load và render danh sách lớp.
     */
    async loadList() {
        const container = document.getElementById( 'ht-class-list-container' );
        if ( ! container ) return;

        try {
            const data = await HT.api.call( 'hinteach_class_list', {}, 'POST' );
            const classes = data.classes || [];

            if ( ! classes.length ) {
                container.innerHTML = '<div class="ht-empty"><p>Chưa có lớp học nào. Bấm "Tạo lớp mới" để bắt đầu.</p></div>';
                return;
            }

            const billingLabels = {
                session: 'Theo buổi',
                course:  'Theo khoá',
                monthly: 'Theo tháng',
            };

            container.innerHTML = `
                <div class="ht-table-wrapper">
                    <table class="ht-table">
                        <thead>
                            <tr>
                                <th>Tên lớp</th>
                                <th>Chế độ thu phí</th>
                                <th>Học phí</th>
                                <th>Học sinh</th>
                                <th>Lịch học</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${classes.map( c => `
                                <tr data-class-id="${c.id}">
                                    <td>
                                        <span class="ht-color-dot" style="background:${HT.utils.escapeHtml(c.color)}"></span>
                                        ${HT.utils.escapeHtml(c.name)}
                                    </td>
                                    <td><span class="ht-badge ht-badge--${c.billing_mode}">${billingLabels[c.billing_mode] || c.billing_mode}</span></td>
                                    <td>${HT.utils.formatCurrency(c.fee_amount)}</td>
                                    <td>${c.student_count || 0}</td>
                                    <td>${c.schedule_type === 'fixed' ? 'Cố định' : 'Linh hoạt'}</td>
                                    <td class="ht-table__actions">
                                        <button type="button" class="ht-btn ht-btn--sm ht-btn--ghost ht-class-edit" data-id="${c.id}">Sửa</button>
                                        <button type="button" class="ht-btn ht-btn--sm ht-btn--ghost ht-btn--danger ht-class-delete" data-id="${c.id}" data-name="${HT.utils.escapeHtml(c.name)}" data-students="${c.student_count || 0}">Xoá</button>
                                    </td>
                                </tr>
                            ` ).join( '' )}
                        </tbody>
                    </table>
                </div>
            `;

            // Bind events: edit, delete
            container.querySelectorAll( '.ht-class-edit' ).forEach( btn => {
                btn.addEventListener( 'click', () => this.openForm( btn.dataset.id ) );
            } );

            container.querySelectorAll( '.ht-class-delete' ).forEach( btn => {
                btn.addEventListener( 'click', () => this.deleteClass( btn.dataset.id, btn.dataset.name, parseInt( btn.dataset.students ) ) );
            } );

        } catch ( err ) {
            container.innerHTML = `<div class="ht-error"><p>Lỗi tải danh sách: ${HT.utils.escapeHtml(err.message)}</p></div>`;
        }
    },

    /**
     * Mở form tạo/sửa lớp.
     * @param {number|null} classId  Nếu có → sửa, không → tạo mới
     */
    async openForm( classId = null ) {
        let classData  = null;
        let students   = [];
        let isLocked   = false;

        if ( classId ) {
            try {
                const data = await HT.api.call( 'hinteach_class_get', { class_id: classId }, 'GET' );
                classData = data.class;
                students  = data.students || [];
                isLocked  = classData.has_sessions;
            } catch ( err ) {
                HT.utils.toast( err.message, 'error' );
                return;
            }
        }

        // Lấy danh sách tất cả học sinh để chọn
        let allStudents = [];
        try {
            const sData = await HT.api.call( 'hinteach_student_list', {}, 'POST' );
            allStudents = sData.students || [];
        } catch ( e ) { /* ignore — form vẫn mở được */ }

        const selectedIds = students.map( s => String( s.id ) );
        const weekdays    = [ 'CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7' ];
        const fixedDays   = classData?.fixed_weekdays || [];

        const formHtml = `
            <form id="ht-class-form" class="ht-form">
                <!-- 1. Thông tin lớp -->
                <fieldset class="ht-form__fieldset">
                    <legend>Thông tin lớp</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-cf-name">Tên lớp *</label>
                        <input type="text" id="ht-cf-name" name="name" class="ht-form__input" required
                               value="${HT.utils.escapeHtml(classData?.name || '')}" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-cf-color">Màu</label>
                        <input type="color" id="ht-cf-color" name="color" class="ht-form__input ht-form__input--color"
                               value="${classData?.color || '#4A90D9'}" />
                    </div>
                </fieldset>

                <!-- 2. Học phí -->
                <fieldset class="ht-form__fieldset">
                    <legend>Học phí</legend>
                    ${isLocked ? '<div class="ht-form__note ht-form__note--warning">⚠️ Học phí và cách thu được cố định sau khi tạo buổi học. Để điều chỉnh, sử dụng phí riêng (fee_override) cho từng học sinh.</div>' : ''}
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-cf-billing">Chế độ thu phí</label>
                        <select id="ht-cf-billing" name="billing_mode" class="ht-form__select" ${isLocked ? 'disabled' : ''}>
                            <option value="session" ${classData?.billing_mode === 'session' ? 'selected' : ''}>Theo buổi</option>
                            <option value="course" ${classData?.billing_mode === 'course' ? 'selected' : ''}>Theo khoá</option>
                            <option value="monthly" ${classData?.billing_mode === 'monthly' ? 'selected' : ''}>Theo tháng</option>
                        </select>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-cf-fee" id="ht-cf-fee-label">Học phí/buổi</label>
                        <input type="number" id="ht-cf-fee" name="fee_amount" class="ht-form__input" min="0" step="1000"
                               value="${classData?.fee_amount || 0}" ${isLocked ? 'disabled' : ''} />
                    </div>
                    <div class="ht-form__row ht-form__row--course-dates" id="ht-cf-course-dates" style="display:none;">
                        <div class="ht-form__row-half">
                            <label class="ht-form__label" for="ht-cf-course-start">Ngày bắt đầu khoá</label>
                            <input type="date" id="ht-cf-course-start" name="course_start_date" class="ht-form__input"
                                   value="${classData?.course_start_date || ''}" />
                        </div>
                        <div class="ht-form__row-half">
                            <label class="ht-form__label" for="ht-cf-course-end">Ngày kết thúc khoá</label>
                            <input type="date" id="ht-cf-course-end" name="course_end_date" class="ht-form__input"
                                   value="${classData?.course_end_date || ''}" />
                        </div>
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-cf-surcharge-name">Tên phụ thu mặc định</label>
                        <input type="text" id="ht-cf-surcharge-name" name="surcharge_name" class="ht-form__input"
                               value="${HT.utils.escapeHtml(classData?.surcharge_name || '')}"
                               placeholder="VD: Phí tài liệu" />
                    </div>
                    <div class="ht-form__row">
                        <label class="ht-form__label" for="ht-cf-surcharge-amount">Mức phụ thu</label>
                        <input type="number" id="ht-cf-surcharge-amount" name="surcharge_amount" class="ht-form__input" min="0" step="1000"
                               value="${classData?.surcharge_amount || 0}" />
                    </div>
                </fieldset>

                <!-- 3. Lịch học -->
                <fieldset class="ht-form__fieldset">
                    <legend>Lịch học</legend>
                    <div class="ht-form__row">
                        <label class="ht-form__label">Kiểu lịch</label>
                        <div class="ht-form__radio-group">
                            <label><input type="radio" name="schedule_type" value="flexible" ${classData?.schedule_type !== 'fixed' ? 'checked' : ''} /> Linh hoạt</label>
                            <label><input type="radio" name="schedule_type" value="fixed" ${classData?.schedule_type === 'fixed' ? 'checked' : ''} /> Cố định</label>
                        </div>
                    </div>
                    <div class="ht-form__row" id="ht-cf-fixed-options" style="display:none;">
                        <label class="ht-form__label">Các thứ trong tuần</label>
                        <div class="ht-form__checkbox-group">
                            ${weekdays.map( ( day, i ) => `
                                <label><input type="checkbox" name="fixed_weekdays" value="${i}" ${fixedDays.includes(i) ? 'checked' : ''} /> ${day}</label>
                            ` ).join( '' )}
                        </div>
                        <div class="ht-form__row-half">
                            <label class="ht-form__label" for="ht-cf-start-time">Giờ bắt đầu</label>
                            <input type="time" id="ht-cf-start-time" name="fixed_start_time" class="ht-form__input"
                                   value="${classData?.fixed_start_time || ''}" />
                        </div>
                        <div class="ht-form__row-half">
                            <label class="ht-form__label" for="ht-cf-end-time">Giờ kết thúc</label>
                            <input type="time" id="ht-cf-end-time" name="fixed_end_time" class="ht-form__input"
                                   value="${classData?.fixed_end_time || ''}" />
                        </div>
                    </div>
                </fieldset>

                <!-- 4. Chọn học sinh -->
                <fieldset class="ht-form__fieldset">
                    <legend>Học sinh</legend>
                    <div class="ht-form__row">
                        <div class="ht-multi-select" id="ht-cf-students">
                            ${allStudents.map( s => `
                                <label class="ht-multi-select__item">
                                    <input type="checkbox" name="student_ids" value="${s.id}" ${selectedIds.includes(String(s.id)) ? 'checked' : ''} />
                                    <span>${HT.utils.escapeHtml(s.name)}</span>
                                </label>
                            ` ).join( '' )}
                            ${allStudents.length === 0 ? '<p class="ht-form__note">Chưa có học sinh nào.</p>' : ''}
                        </div>
                    </div>
                </fieldset>
            </form>
        `;

        HT.modal.open( {
            title: classId ? 'Sửa lớp học' : 'Tạo lớp mới',
            body: formHtml,
            footer: `
                <button type="button" class="ht-btn ht-btn--secondary" id="ht-class-form-cancel">Huỷ</button>
                <button type="button" class="ht-btn ht-btn--primary" id="ht-class-form-save">Lưu</button>
            `,
        } );

        // Bind dynamic form behavior
        this._bindFormDynamics( classData?.billing_mode, classData?.schedule_type );

        // Bind save/cancel
        document.getElementById( 'ht-class-form-cancel' )?.addEventListener( 'click', () => HT.modal.close() );
        document.getElementById( 'ht-class-form-save' )?.addEventListener( 'click', () => this.saveForm( classId ) );
    },

    /**
     * Bind dynamic form: billing_mode label thay đổi, course dates show/hide, fixed options.
     */
    _bindFormDynamics( initialBilling, initialSchedule ) {
        const billingSelect = document.getElementById( 'ht-cf-billing' );
        const feeLabel      = document.getElementById( 'ht-cf-fee-label' );
        const courseDates   = document.getElementById( 'ht-cf-course-dates' );
        const fixedOptions  = document.getElementById( 'ht-cf-fixed-options' );

        const updateBilling = () => {
            const mode = billingSelect?.value || 'session';
            const labels = { session: 'Học phí/buổi', course: 'Học phí/khoá', monthly: 'Học phí/tháng' };
            if ( feeLabel )   feeLabel.textContent = labels[ mode ] || 'Học phí';
            if ( courseDates ) courseDates.style.display = mode === 'course' ? 'flex' : 'none';
        };

        const updateSchedule = () => {
            const type = document.querySelector( 'input[name="schedule_type"]:checked' )?.value;
            if ( fixedOptions ) fixedOptions.style.display = type === 'fixed' ? 'block' : 'none';
        };

        billingSelect?.addEventListener( 'change', updateBilling );
        document.querySelectorAll( 'input[name="schedule_type"]' ).forEach( r => {
            r.addEventListener( 'change', updateSchedule );
        } );

        // Init
        updateBilling();
        updateSchedule();
    },

    /**
     * Submit form tạo/sửa lớp.
     */
    async saveForm( classId ) {
        const form = document.getElementById( 'ht-class-form' );
        if ( ! form ) return;

        const payload = {
            name:              form.querySelector( '[name="name"]' )?.value || '',
            color:             form.querySelector( '[name="color"]' )?.value || '#4A90D9',
            billing_mode:      form.querySelector( '[name="billing_mode"]' )?.value || 'session',
            fee_amount:        form.querySelector( '[name="fee_amount"]' )?.value || 0,
            course_start_date: form.querySelector( '[name="course_start_date"]' )?.value || '',
            course_end_date:   form.querySelector( '[name="course_end_date"]' )?.value || '',
            surcharge_name:    form.querySelector( '[name="surcharge_name"]' )?.value || '',
            surcharge_amount:  form.querySelector( '[name="surcharge_amount"]' )?.value || 0,
            schedule_type:     form.querySelector( 'input[name="schedule_type"]:checked' )?.value || 'flexible',
            fixed_start_time:  form.querySelector( '[name="fixed_start_time"]' )?.value || '',
            fixed_end_time:    form.querySelector( '[name="fixed_end_time"]' )?.value || '',
        };

        // Fixed weekdays
        const weekdayCheckboxes = form.querySelectorAll( 'input[name="fixed_weekdays"]:checked' );
        const fixedWeekdays = Array.from( weekdayCheckboxes ).map( cb => cb.value );
        payload.fixed_weekdays = JSON.stringify( fixedWeekdays );

        // Student IDs
        const studentCheckboxes = form.querySelectorAll( 'input[name="student_ids"]:checked' );
        payload.student_ids = Array.from( studentCheckboxes ).map( cb => cb.value );

        if ( classId ) {
            payload.class_id = classId;
        }

        try {
            const saveBtn = document.getElementById( 'ht-class-form-save' );
            if ( saveBtn ) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }

            await HT.api.call( 'hinteach_class_save', payload );
            HT.modal.close();
            HT.utils.toast( classId ? 'Đã cập nhật lớp.' : 'Đã tạo lớp mới.' );
            HT.events.emit( 'class:saved' );
            await this.loadList();
        } catch ( err ) {
            HT.utils.toast( err.message, 'error' );
            const saveBtn = document.getElementById( 'ht-class-form-save' );
            if ( saveBtn ) { saveBtn.disabled = false; saveBtn.textContent = 'Lưu'; }
        }
    },

    /**
     * Xoá lớp (soft delete) với confirm.
     */
    async deleteClass( classId, className, studentCount ) {
        let msg = `Bạn có chắc muốn xoá lớp "${className}"?`;
        if ( studentCount > 0 ) {
            msg += `\n\n⚠️ Lớp này đang có ${studentCount} học sinh.`;
        }

        const confirmed = await HT.modal.confirm( msg );
        if ( ! confirmed ) return;

        try {
            await HT.api.call( 'hinteach_class_delete', { class_id: classId } );
            HT.utils.toast( 'Đã xoá lớp.' );
            HT.events.emit( 'class:deleted' );
            await this.loadList();
        } catch ( err ) {
            HT.utils.toast( err.message, 'error' );
        }
    },
};

export default ClassesModule;

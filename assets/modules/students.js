/**
 * HinTeach — Module: Học sinh (students)
 *
 * CRUD học sinh, gán/bỏ lớp, import file Excel/CSV/Word.
 * Gọi API qua HT.api.call(), KHÔNG fetch() trực tiếp.
 *
 * @package HinTeach
 */

const StudentsModule = {
    /**
     * Render module vào container.
     * @param {HTMLElement} container
     */
    async render( container ) {
        container.innerHTML = `
            <div class="ht-module ht-module--students">
                <div class="ht-module__header">
                    <h2 class="ht-module__title">Học sinh</h2>
                    <div class="ht-module__header-actions">
                        <button type="button" class="ht-btn ht-btn--secondary" id="ht-student-import">📥 Import file</button>
                        <button type="button" class="ht-btn ht-btn--primary" id="ht-student-add">+ Thêm học sinh</button>
                    </div>
                </div>
                <div class="ht-module__body" id="ht-student-list-container">
                    <div class="ht-content__loading"><div class="ht-spinner"></div><p>Đang tải...</p></div>
                </div>
            </div>
        `;

        document.getElementById( 'ht-student-add' )?.addEventListener( 'click', () => this.openForm() );
        document.getElementById( 'ht-student-import' )?.addEventListener( 'click', () => this.openImportForm() );

        await this.loadList();
    },

    /**
     * Load và render danh sách học sinh.
     */
    async loadList() {
        const container = document.getElementById( 'ht-student-list-container' );
        if ( ! container ) return;

        try {
            const data = await HT.api.call( 'hinteach_student_list', {}, 'POST' );
            const students = data.students || [];

            if ( ! students.length ) {
                container.innerHTML = '<div class="ht-empty"><p>Chưa có học sinh nào. Bấm "Thêm học sinh" hoặc "Import file" để bắt đầu.</p></div>';
                return;
            }

            container.innerHTML = `
                <div class="ht-table-wrapper">
                    <table class="ht-table">
                        <thead>
                            <tr>
                                <th>Tên học sinh</th>
                                <th>Ngày sinh</th>
                                <th>SĐT</th>
                                <th>Email</th>
                                <th>Lớp</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.map( s => `
                                <tr data-student-id="${s.id}">
                                    <td><strong>${HT.utils.escapeHtml(s.name)}</strong></td>
                                    <td>${HT.utils.formatDate(s.dob)}</td>
                                    <td>${HT.utils.escapeHtml(s.phone || '-')}</td>
                                    <td>${HT.utils.escapeHtml(s.email || '-')}</td>
                                    <td>
                                        ${(s.classes || []).map( c =>
                                            `<span class="ht-tag" style="border-color:${HT.utils.escapeHtml(c.color)}">${HT.utils.escapeHtml(c.name)}</span>`
                                        ).join(' ')}
                                        ${(s.classes || []).length === 0 ? '<span class="ht-text-muted">—</span>' : ''}
                                    </td>
                                    <td class="ht-table__actions">
                                        <button type="button" class="ht-btn ht-btn--sm ht-btn--ghost ht-student-edit" data-id="${s.id}">Sửa</button>
                                        <button type="button" class="ht-btn ht-btn--sm ht-btn--ghost ht-btn--danger ht-student-delete" data-id="${s.id}" data-name="${HT.utils.escapeHtml(s.name)}">Xoá</button>
                                    </td>
                                </tr>
                            ` ).join( '' )}
                        </tbody>
                    </table>
                </div>
            `;

            container.querySelectorAll( '.ht-student-edit' ).forEach( btn => {
                btn.addEventListener( 'click', () => this.openForm( btn.dataset.id ) );
            } );

            container.querySelectorAll( '.ht-student-delete' ).forEach( btn => {
                btn.addEventListener( 'click', () => this.deleteStudent( btn.dataset.id, btn.dataset.name ) );
            } );

        } catch ( err ) {
            container.innerHTML = `<div class="ht-error"><p>Lỗi tải danh sách: ${HT.utils.escapeHtml(err.message)}</p></div>`;
        }
    },

    /**
     * Mở form tạo/sửa học sinh.
     */
    async openForm( studentId = null ) {
        let studentData = null;
        let studentClasses = [];

        if ( studentId ) {
            try {
                const data = await HT.api.call( 'hinteach_student_get', { student_id: studentId }, 'GET' );
                studentData    = data.student;
                studentClasses = studentData.classes || [];
            } catch ( err ) {
                HT.utils.toast( err.message, 'error' );
                return;
            }
        }

        // Lấy tất cả lớp để gán
        let allClasses = [];
        try {
            const cData = await HT.api.call( 'hinteach_class_list', {}, 'POST' );
            allClasses = cData.classes || [];
        } catch ( e ) { /* ignore */ }

        const assignedClassIds = studentClasses.map( c => String( c.id ) );

        const formHtml = `
            <form id="ht-student-form" class="ht-form">
                <div class="ht-form__row">
                    <label class="ht-form__label" for="ht-sf-name">Tên học sinh *</label>
                    <input type="text" id="ht-sf-name" name="name" class="ht-form__input" required
                           value="${HT.utils.escapeHtml(studentData?.name || '')}" />
                </div>
                <div class="ht-form__row">
                    <label class="ht-form__label" for="ht-sf-dob">Ngày sinh</label>
                    <input type="date" id="ht-sf-dob" name="dob" class="ht-form__input"
                           value="${studentData?.dob || ''}" />
                </div>
                <div class="ht-form__row">
                    <label class="ht-form__label" for="ht-sf-phone">Số điện thoại</label>
                    <input type="tel" id="ht-sf-phone" name="phone" class="ht-form__input"
                           value="${HT.utils.escapeHtml(studentData?.phone || '')}" />
                </div>
                <div class="ht-form__row">
                    <label class="ht-form__label" for="ht-sf-email">Email</label>
                    <input type="email" id="ht-sf-email" name="email" class="ht-form__input"
                           value="${HT.utils.escapeHtml(studentData?.email || '')}" />
                </div>
                <div class="ht-form__row">
                    <label class="ht-form__label" for="ht-sf-note">Ghi chú</label>
                    <textarea id="ht-sf-note" name="note" class="ht-form__textarea" rows="3">${HT.utils.escapeHtml(studentData?.note || '')}</textarea>
                </div>

                ${studentId ? `
                <fieldset class="ht-form__fieldset">
                    <legend>Lớp đang tham gia</legend>
                    <div class="ht-multi-select" id="ht-sf-classes">
                        ${allClasses.map( c => {
                            const isAssigned = assignedClassIds.includes( String( c.id ) );
                            const sc = studentClasses.find( sc => String(sc.id) === String(c.id) );
                            return `
                                <div class="ht-multi-select__item">
                                    <label>
                                        <input type="checkbox" name="class_ids" value="${c.id}" ${isAssigned ? 'checked' : ''} />
                                        <span class="ht-color-dot" style="background:${HT.utils.escapeHtml(c.color)}"></span>
                                        <span>${HT.utils.escapeHtml(c.name)}</span>
                                    </label>
                                    ${c.billing_mode === 'session' ? `
                                        <input type="number" name="fee_override_${c.id}" class="ht-form__input ht-form__input--sm"
                                               placeholder="Phí riêng (tuỳ chọn)" min="0" step="1000"
                                               value="${sc?.fee_override || ''}"
                                               ${!isAssigned ? 'disabled' : ''} />
                                    ` : ''}
                                </div>
                            `;
                        }).join( '' )}
                        ${allClasses.length === 0 ? '<p class="ht-form__note">Chưa có lớp nào.</p>' : ''}
                    </div>
                </fieldset>
                ` : ''}
            </form>
        `;

        HT.modal.open( {
            title: studentId ? 'Sửa thông tin học sinh' : 'Thêm học sinh mới',
            body: formHtml,
            footer: `
                <button type="button" class="ht-btn ht-btn--secondary" id="ht-student-form-cancel">Huỷ</button>
                <button type="button" class="ht-btn ht-btn--primary" id="ht-student-form-save">Lưu</button>
            `,
        } );

        // Enable/disable fee_override khi check/uncheck lớp
        document.querySelectorAll( '#ht-sf-classes input[name="class_ids"]' ).forEach( cb => {
            cb.addEventListener( 'change', () => {
                const feeInput = document.querySelector( `input[name="fee_override_${cb.value}"]` );
                if ( feeInput ) feeInput.disabled = ! cb.checked;
            } );
        } );

        document.getElementById( 'ht-student-form-cancel' )?.addEventListener( 'click', () => HT.modal.close() );
        document.getElementById( 'ht-student-form-save' )?.addEventListener( 'click', () => this.saveForm( studentId, assignedClassIds ) );
    },

    /**
     * Submit form tạo/sửa.
     */
    async saveForm( studentId, previousClassIds = [] ) {
        const form = document.getElementById( 'ht-student-form' );
        if ( ! form ) return;

        const payload = {
            name:  form.querySelector( '[name="name"]' )?.value || '',
            dob:   form.querySelector( '[name="dob"]' )?.value || '',
            phone: form.querySelector( '[name="phone"]' )?.value || '',
            email: form.querySelector( '[name="email"]' )?.value || '',
            note:  form.querySelector( '[name="note"]' )?.value || '',
        };

        if ( studentId ) {
            payload.student_id = studentId;
        }

        try {
            const saveBtn = document.getElementById( 'ht-student-form-save' );
            if ( saveBtn ) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }

            const result = await HT.api.call( 'hinteach_student_save', payload );
            const sid = result.student_id;

            // Xử lý gán/bỏ lớp nếu đang sửa
            if ( studentId ) {
                const checkedClassIds = Array.from(
                    form.querySelectorAll( 'input[name="class_ids"]:checked' )
                ).map( cb => cb.value );

                // Lớp mới thêm
                for ( const cid of checkedClassIds ) {
                    if ( ! previousClassIds.includes( cid ) ) {
                        const feeOverride = form.querySelector( `input[name="fee_override_${cid}"]` )?.value;
                        const addPayload = { student_id: sid, class_id: cid };
                        if ( feeOverride ) addPayload.fee_override = feeOverride;
                        await HT.api.call( 'hinteach_student_class_add', addPayload );
                    }
                }

                // Lớp đã bỏ
                for ( const cid of previousClassIds ) {
                    if ( ! checkedClassIds.includes( cid ) ) {
                        await HT.api.call( 'hinteach_student_class_remove', { student_id: sid, class_id: cid } );
                    }
                }
            }

            HT.modal.close();
            HT.utils.toast( studentId ? 'Đã cập nhật học sinh.' : 'Đã thêm học sinh mới.' );
            HT.events.emit( 'student:saved' );
            await this.loadList();
        } catch ( err ) {
            HT.utils.toast( err.message, 'error' );
            const saveBtn = document.getElementById( 'ht-student-form-save' );
            if ( saveBtn ) { saveBtn.disabled = false; saveBtn.textContent = 'Lưu'; }
        }
    },

    /**
     * Xoá học sinh (soft delete).
     */
    async deleteStudent( studentId, studentName ) {
        const confirmed = await HT.modal.confirm( `Bạn có chắc muốn xoá học sinh "${studentName}"?\n\nDữ liệu điểm số, buổi học cũ vẫn được giữ lại.` );
        if ( ! confirmed ) return;

        try {
            await HT.api.call( 'hinteach_student_delete', { student_id: studentId } );
            HT.utils.toast( 'Đã xoá học sinh.' );
            HT.events.emit( 'student:deleted' );
            await this.loadList();
        } catch ( err ) {
            HT.utils.toast( err.message, 'error' );
        }
    },

    /**
     * Mở form import file.
     */
    openImportForm() {
        const formHtml = `
            <form id="ht-import-form" class="ht-form">
                <div class="ht-form__row">
                    <label class="ht-form__label">Chọn file (xlsx, csv, docx)</label>
                    <input type="file" id="ht-import-file" name="import_file" class="ht-form__input"
                           accept=".xlsx,.csv,.docx" required />
                    <p class="ht-form__note">Giới hạn: 10MB, tối đa 500 dòng. Dòng đầu tiên phải là tên cột (name, dob, phone, email, note).</p>
                </div>
                <div class="ht-form__row">
                    <label class="ht-form__label" for="ht-import-class">Gán vào lớp (tuỳ chọn)</label>
                    <select id="ht-import-class" name="class_id" class="ht-form__select">
                        <option value="">— Không gán lớp —</option>
                    </select>
                </div>
                <div id="ht-import-result" style="display:none;"></div>
            </form>
        `;

        HT.modal.open( {
            title: 'Import học sinh từ file',
            body: formHtml,
            footer: `
                <button type="button" class="ht-btn ht-btn--secondary" id="ht-import-cancel">Huỷ</button>
                <button type="button" class="ht-btn ht-btn--primary" id="ht-import-submit">Import</button>
            `,
        } );

        // Load danh sách lớp cho select
        HT.api.call( 'hinteach_class_list', {}, 'POST' ).then( data => {
            const select = document.getElementById( 'ht-import-class' );
            if ( select && data.classes ) {
                data.classes.forEach( c => {
                    const opt = document.createElement( 'option' );
                    opt.value = c.id;
                    opt.textContent = c.name;
                    select.appendChild( opt );
                } );
            }
        } ).catch( () => {} );

        document.getElementById( 'ht-import-cancel' )?.addEventListener( 'click', () => HT.modal.close() );
        document.getElementById( 'ht-import-submit' )?.addEventListener( 'click', () => this.submitImport() );
    },

    /**
     * Submit import.
     */
    async submitImport() {
        const fileInput = document.getElementById( 'ht-import-file' );
        const classSelect = document.getElementById( 'ht-import-class' );
        const resultDiv = document.getElementById( 'ht-import-result' );

        if ( ! fileInput?.files?.length ) {
            HT.utils.toast( 'Vui lòng chọn file.', 'error' );
            return;
        }

        const payload = {
            import_file: fileInput.files[0],
        };
        if ( classSelect?.value ) {
            payload.class_id = classSelect.value;
        }

        try {
            const submitBtn = document.getElementById( 'ht-import-submit' );
            if ( submitBtn ) { submitBtn.disabled = true; submitBtn.textContent = 'Đang import...'; }

            const result = await HT.api.call( 'hinteach_student_import', payload );

            // Hiện kết quả
            if ( resultDiv ) {
                resultDiv.style.display = 'block';
                let html = `<div class="ht-import-result">
                    <p class="ht-import-result__summary">
                        ✅ Đã import: <strong>${result.imported}</strong> / ${result.total} học sinh
                        ${result.skipped > 0 ? ` | ⚠️ Bỏ qua: <strong>${result.skipped}</strong>` : ''}
                    </p>`;

                if ( result.errors && result.errors.length > 0 ) {
                    html += `<div class="ht-import-result__errors">
                        <p><strong>Chi tiết lỗi:</strong></p>
                        <ul>
                            ${result.errors.map( e => `<li>Dòng ${e.row}: ${HT.utils.escapeHtml(e.message)}</li>` ).join( '' )}
                        </ul>
                    </div>`;
                }

                html += '</div>';
                resultDiv.innerHTML = html;
            }

            HT.utils.toast( `Import xong: ${result.imported} học sinh.` );
            HT.events.emit( 'student:imported' );
            await this.loadList();

        } catch ( err ) {
            HT.utils.toast( err.message, 'error' );
            const submitBtn = document.getElementById( 'ht-import-submit' );
            if ( submitBtn ) { submitBtn.disabled = false; submitBtn.textContent = 'Import'; }
        }
    },
};

export default StudentsModule;

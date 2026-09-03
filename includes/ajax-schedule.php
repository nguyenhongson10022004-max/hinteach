<?php
/**
 * HinTeach — AJAX Handlers: Thời khoá biểu (Schedule)
 *
 * M1: Đọc danh sách buổi học trong khoảng ngày — READ ONLY.
 * Không có INSERT/UPDATE/DELETE trong file này ở M1.
 * Mọi handler: verify nonce → check capability → filter teacher_id → xử lý.
 * Assistant PHẢI qua hinteach_user_can_module($uid, 'scheduler').
 *
 * @package HinTeach
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Đăng ký AJAX actions
add_action( 'wp_ajax_hinteach_session_list', 'hinteach_ajax_session_list' );
add_action( 'wp_ajax_hinteach_session_get', 'hinteach_ajax_session_get' );                         // M4
add_action( 'wp_ajax_hinteach_session_save', 'hinteach_ajax_session_save' );
add_action( 'wp_ajax_hinteach_session_save_recurring', 'hinteach_ajax_session_save_recurring' );
add_action( 'wp_ajax_hinteach_session_delete', 'hinteach_ajax_session_delete' );                   // M4
add_action( 'wp_ajax_hinteach_session_quick_entry', 'hinteach_ajax_session_quick_entry' );         // M5
add_action( 'wp_ajax_hinteach_session_display_color', 'hinteach_ajax_session_display_color' );     // M6

// ──────────────────────────────────────────────────────────────
// Helpers chung cho file này
// ──────────────────────────────────────────────────────────────

/**
 * Kiểm tra quyền truy cập module Thời khoá biểu.
 * Gọi đầu mỗi handler. Nếu fail → wp_send_json_error và die.
 *
 * Pattern giống hinteach_class_check_access() trong ajax-classes.php.
 *
 * @return array ['user_id' => int, 'teacher_id' => int]
 */
function hinteach_schedule_check_access() {
    check_ajax_referer( 'hinteach_nonce', 'nonce' );

    $user_id = get_current_user_id();
    if ( ! $user_id ) {
        wp_send_json_error( array( 'message' => 'Chưa đăng nhập.' ), 401 );
    }

    // Check module permission — với assistant phải tra bảng assistant_permissions
    if ( ! hinteach_user_can_module( $user_id, 'scheduler' ) ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền truy cập module Thời khoá biểu.' ), 403 );
    }

    $teacher_id = hinteach_get_teacher_id( $user_id );
    if ( ! $teacher_id ) {
        wp_send_json_error( array( 'message' => 'Không xác định được giáo viên phụ trách.' ), 403 );
    }

    return array(
        'user_id'    => $user_id,
        'teacher_id' => $teacher_id,
    );
}

// ──────────────────────────────────────────────────────────────
// Handler: Danh sách buổi học trong khoảng ngày (GET)
// ──────────────────────────────────────────────────────────────

/**
 * Trả danh sách buổi học trong khoảng date_from → date_to.
 *
 * Input (GET params):
 *   date_from  string  YYYY-MM-DD  Bắt buộc
 *   date_to    string  YYYY-MM-DD  Bắt buộc. Tối đa 62 ngày kể từ date_from.
 *
 * Response: { sessions: [ { id, class_id, date, start_time, end_time,
 *                            type, session_name, display_color,
 *                            class_name, class_color }, ... ] }
 *
 * Không có buổi nào của giáo viên khác lọt vào kết quả
 * (trừ admin có manage_hinteach_all — xem tất cả).
 */
function hinteach_ajax_session_list() {
    $access = hinteach_schedule_check_access();

    // ── Validate input ──────────────────────────────────────

    $date_from = isset( $_GET['date_from'] ) ? sanitize_text_field( wp_unslash( $_GET['date_from'] ) ) : '';
    $date_to   = isset( $_GET['date_to'] )   ? sanitize_text_field( wp_unslash( $_GET['date_to'] ) )   : '';

    if ( empty( $date_from ) || empty( $date_to ) ) {
        wp_send_json_error( array( 'message' => 'Thiếu date_from hoặc date_to.' ), 400 );
    }

    // Validate format YYYY-MM-DD (createFromFormat trả false nếu sai)
    $d_from = DateTime::createFromFormat( 'Y-m-d', $date_from );
    $d_to   = DateTime::createFromFormat( 'Y-m-d', $date_to );

    if ( ! $d_from || $d_from->format( 'Y-m-d' ) !== $date_from ) {
        wp_send_json_error( array( 'message' => 'date_from không hợp lệ (định dạng YYYY-MM-DD).' ), 400 );
    }
    if ( ! $d_to || $d_to->format( 'Y-m-d' ) !== $date_to ) {
        wp_send_json_error( array( 'message' => 'date_to không hợp lệ (định dạng YYYY-MM-DD).' ), 400 );
    }

    if ( $date_from > $date_to ) {
        wp_send_json_error( array( 'message' => 'date_from phải nhỏ hơn hoặc bằng date_to.' ), 400 );
    }

    // Giới hạn khoảng tối đa 62 ngày (đủ cho 2 tháng đầy đủ)
    $diff_days = (int) $d_from->diff( $d_to )->days;
    if ( $diff_days > 62 ) {
        wp_send_json_error( array( 'message' => 'Khoảng ngày tối đa là 62 ngày.' ), 400 );
    }

    // ── Query ───────────────────────────────────────────────

    global $wpdb;
    $s_table = $wpdb->prefix . 'hinteach_sessions';
    $c_table = $wpdb->prefix . 'hinteach_classes';

    // Chỉ SELECT field cần thiết cho M1 — không lấy price/content/repeat_group_id/is_exception
    $select = "
        SELECT
            s.id,
            s.class_id,
            s.date,
            s.start_time,
            s.end_time,
            s.type,
            s.session_name,
            s.display_color,
            c.name  AS class_name,
            c.color AS class_color
        FROM {$s_table} s
        JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
        WHERE s.deleted_at IS NULL
          AND s.date BETWEEN %s AND %s
    ";

    if ( current_user_can( 'manage_hinteach_all' ) ) {
        // Admin — xem tất cả (không filter teacher_id)
        $sessions = $wpdb->get_results( $wpdb->prepare(
            $select . ' ORDER BY s.date ASC, s.start_time ASC',
            $date_from,
            $date_to
        ) );
    } else {
        // Teacher / Assistant — chỉ xem lớp của teacher_id mình sở hữu
        $sessions = $wpdb->get_results( $wpdb->prepare(
            $select . ' AND c.teacher_id = %d ORDER BY s.date ASC, s.start_time ASC',
            $date_from,
            $date_to,
            $access['teacher_id']
        ) );
    }

    wp_send_json_success( array( 'sessions' => $sessions ?: array() ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Chi tiết 1 buổi học (GET) — M4
// [HINTEACH DESIGN DECISION — D2] Thêm action riêng để lấy đủ
// field cho modal Sửa, giữ session_list nhẹ cho calendar.
// ──────────────────────────────────────────────────────────────

/**
 * Trả đầy đủ thông tin 1 buổi học theo id.
 *
 * Input (GET):
 *   session_id  int  Bắt buộc
 *
 * Response: { session: { id, class_id, date, start_time, end_time, price,
 *             type, session_name, content, homework_content, general_comment,
 *             display_color, repeat_group_id, is_exception,
 *             students: [ { student_id, name, fee_amount, paid, homework,
 *                           attitude, individual_comment, note } ],
 *             following_count: int } }
 */
function hinteach_ajax_session_get() {
    $access = hinteach_schedule_check_access();

    $session_id = isset( $_GET['session_id'] ) ? absint( $_GET['session_id'] ) : 0;
    if ( ! $session_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu session_id.' ), 400 );
    }

    global $wpdb;
    $s_table  = $wpdb->prefix . 'hinteach_sessions';
    $c_table  = $wpdb->prefix . 'hinteach_classes';
    $ss_table = $wpdb->prefix . 'hinteach_session_students';
    $st_table = $wpdb->prefix . 'hinteach_students';

    // Load session + class info
    $session = $wpdb->get_row( $wpdb->prepare(
        "SELECT s.*, c.teacher_id, c.name AS class_name, c.color AS class_color
         FROM {$s_table} s
         JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
         WHERE s.id = %d AND s.deleted_at IS NULL",
        $session_id
    ) );

    if ( ! $session ) {
        wp_send_json_error( array( 'message' => 'Buổi học không tồn tại hoặc đã bị xoá.' ), 404 );
    }

    // Ownership check
    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $session->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền xem buổi học này.' ), 403 );
    }

    // Load students trong buổi
    $students = $wpdb->get_results( $wpdb->prepare(
        "SELECT ss.student_id, st.name, ss.fee_amount, ss.paid,
                ss.homework, ss.attitude, ss.individual_comment, ss.note
         FROM {$ss_table} ss
         JOIN {$st_table} st ON ss.student_id = st.id AND st.deleted_at IS NULL
         WHERE ss.session_id = %d AND ss.deleted_at IS NULL
         ORDER BY st.name ASC",
        $session_id
    ) );

    // Load grades của buổi học (M5)
    $g_table = $wpdb->prefix . 'hinteach_grades';
    $grades  = $wpdb->get_results( $wpdb->prepare(
        "SELECT id, student_id, test_name, score, scale, type, score_type_label, date, note
         FROM {$g_table}
         WHERE session_id = %d AND deleted_at IS NULL
         ORDER BY id ASC",
        $session_id
    ) );

    // Format grades data
    $formatted_grades = array();
    if ( ! empty( $grades ) ) {
        foreach ( $grades as $g ) {
            $formatted_grades[] = array(
                'id'               => (int) $g->id,
                'student_id'       => (int) $g->student_id,
                'test_name'        => $g->test_name,
                'score'            => null !== $g->score ? (float) $g->score : null,
                'scale'            => (float) $g->scale,
                'type'             => $g->type,
                'score_type_label' => $g->score_type_label,
                'date'             => $g->date,
                'note'             => $g->note,
            );
        }
    }

    // Tính following_count — số buổi SAU buổi này trong cùng repeat_group_id
    // Dùng predicate đã chốt: (repeat_group_id, date, start_time, id) — schedule.md Mục 4
    $following_count = 0;
    if ( $session->repeat_group_id ) {
        $following_count = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$s_table}
             WHERE repeat_group_id = %d
               AND deleted_at IS NULL
               AND (
                   date > %s
                   OR (date = %s AND start_time > %s)
                   OR (date = %s AND start_time = %s AND id > %d)
               )",
            (int) $session->repeat_group_id,
            $session->date,
            $session->date, $session->start_time,
            $session->date, $session->start_time, $session_id
        ) );
    }

    wp_send_json_success( array(
        'session' => array(
            'id'               => (int) $session->id,
            'class_id'         => (int) $session->class_id,
            'class_name'       => $session->class_name,
            'class_color'      => $session->class_color,
            'date'             => $session->date,
            'start_time'       => $session->start_time,
            'end_time'         => $session->end_time,
            'price'            => (float) $session->price,
            'type'             => $session->type,
            'session_name'     => $session->session_name,
            'content'          => $session->content,
            'homework_content' => $session->homework_content,
            'general_comment'  => $session->general_comment,
            'display_color'    => $session->display_color,
            'repeat_group_id'  => $session->repeat_group_id ? (int) $session->repeat_group_id : null,
            'is_exception'     => (int) $session->is_exception,
            'students'         => $students ?: array(),
            'grades'           => $formatted_grades,
            'following_count'  => $following_count,
        ),
    ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Tạo buổi học (POST) — M2
// ──────────────────────────────────────────────────────────────

/**
 * Tạo hoặc cập nhật buổi học.
 *
 * M2: CREATE (không có session_id trong payload).
 * M4: UPDATE (session_id có giá trị) — dispatch sang hinteach_ajax_session_update().
 *
 * Decision Log (tất cả APPROVED bởi owner, 2026-08-29):
 *   #1 — Conflict scope = teacher_id [HINTEACH DESIGN DECISION]
 *   #2 — Assistant scheduler = full write [HINTEACH DESIGN DECISION]
 *   #3 — type='chung' ≥ 2 học sinh [HINTEACH DESIGN DECISION]
 *   #4 — price = client gửi, backend validate >= 0 [HINTEACH DESIGN DECISION]
 *
 * Input (POST) CREATE:
 *   class_id, date, start_time, end_time, type, student_ids[],
 *   price, session_name, content, homework_content, general_comment, display_color
 *
 * Input (POST) UPDATE (M4):
 *   session_id, update_scope ('single'|'following'),
 *   + tất cả field CREATE
 *
 * Response success CREATE: { id: int, message: string }
 * Response success UPDATE: { id: int, updated_count: int, scope: string, message: string }
 * Response conflict 409: { message: string, conflict: { id, date, start_time, end_time, session_name } }
 */
function hinteach_ajax_session_save() {
    $access = hinteach_schedule_check_access();
    // Decision Log #2 (APPROVED): assistant có module scheduler bật → được phép tạo buổi.
    // hinteach_schedule_check_access() đã bao gồm hinteach_user_can_module($uid, 'scheduler').
    // Không thêm check manage_hinteach_classes — khác với ajax-classes.php vì Decision Log #2.

    // ── M4: Nếu có session_id → rẽ nhánh UPDATE ─────────────
    $session_id = isset( $_POST['session_id'] ) ? absint( $_POST['session_id'] ) : 0;
    if ( $session_id ) {
        hinteach_ajax_session_update( $session_id, $access );
        return;
    }

    // ── Thu thập input ───────────────────────────────────────
    $class_id         = isset( $_POST['class_id'] ) ? absint( $_POST['class_id'] ) : 0;
    $date             = isset( $_POST['date'] ) ? sanitize_text_field( wp_unslash( $_POST['date'] ) ) : '';
    $start_time       = isset( $_POST['start_time'] ) ? sanitize_text_field( wp_unslash( $_POST['start_time'] ) ) : '';
    $end_time         = isset( $_POST['end_time'] ) ? sanitize_text_field( wp_unslash( $_POST['end_time'] ) ) : '';
    $type             = isset( $_POST['type'] ) ? sanitize_text_field( wp_unslash( $_POST['type'] ) ) : '';
    $price            = isset( $_POST['price'] ) ? floatval( $_POST['price'] ) : 0;
    $session_name     = isset( $_POST['session_name'] ) ? sanitize_text_field( wp_unslash( $_POST['session_name'] ) ) : '';
    $content          = isset( $_POST['content'] ) ? sanitize_textarea_field( wp_unslash( $_POST['content'] ) ) : '';
    $homework_content = isset( $_POST['homework_content'] ) ? sanitize_textarea_field( wp_unslash( $_POST['homework_content'] ) ) : '';
    $general_comment  = isset( $_POST['general_comment'] ) ? sanitize_textarea_field( wp_unslash( $_POST['general_comment'] ) ) : '';
    $display_color    = isset( $_POST['display_color'] ) ? sanitize_text_field( wp_unslash( $_POST['display_color'] ) ) : '';

    // student_ids — mảng từ FormData
    $student_ids_raw = isset( $_POST['student_ids'] ) && is_array( $_POST['student_ids'] )
        ? $_POST['student_ids']
        : array();
    $student_ids = array_values( array_unique( array_filter( array_map( 'absint', $student_ids_raw ) ) ) );

    // ── Validate ────────────────────────────────────────────

    global $wpdb;
    $c_table  = $wpdb->prefix . 'hinteach_classes';
    $s_table  = $wpdb->prefix . 'hinteach_sessions';
    $sc_table = $wpdb->prefix . 'hinteach_student_class';
    $ss_table = $wpdb->prefix . 'hinteach_session_students';

    // 1. class_id — tồn tại, chưa xoá, thuộc teacher_id
    if ( ! $class_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu lớp học.' ), 400 );
    }

    $class = $wpdb->get_row( $wpdb->prepare(
        "SELECT id, teacher_id, fee_amount, billing_mode FROM {$c_table} WHERE id = %d AND deleted_at IS NULL",
        $class_id
    ) );

    if ( ! $class ) {
        wp_send_json_error( array( 'message' => 'Lớp không tồn tại.' ), 404 );
    }

    // Ownership check (admin xem tất cả)
    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $class->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền tạo buổi học cho lớp này.' ), 403 );
    }

    // 2. date — format YYYY-MM-DD
    if ( empty( $date ) ) {
        wp_send_json_error( array( 'message' => 'Thiếu ngày.' ), 400 );
    }
    $d = DateTime::createFromFormat( 'Y-m-d', $date );
    if ( ! $d || $d->format( 'Y-m-d' ) !== $date ) {
        wp_send_json_error( array( 'message' => 'Ngày không hợp lệ (định dạng YYYY-MM-DD).' ), 400 );
    }

    // 3. start_time / end_time — format HH:MM, start < end
    if ( empty( $start_time ) || empty( $end_time ) ) {
        wp_send_json_error( array( 'message' => 'Giờ bắt đầu và kết thúc không được để trống.' ), 400 );
    }
    if ( ! preg_match( '/^\d{2}:\d{2}$/', $start_time ) || ! preg_match( '/^\d{2}:\d{2}$/', $end_time ) ) {
        wp_send_json_error( array( 'message' => 'Giờ không hợp lệ (định dạng HH:MM).' ), 400 );
    }
    if ( $start_time >= $end_time ) {
        wp_send_json_error( array( 'message' => 'Giờ bắt đầu phải trước giờ kết thúc.' ), 400 );
    }

    // 4. type — riêng hoặc chung
    if ( ! in_array( $type, array( 'riêng', 'chung' ), true ) ) {
        wp_send_json_error( array( 'message' => 'Loại buổi học không hợp lệ (riêng hoặc chung).' ), 400 );
    }

    // 5. student_ids — Decision Log #3 (APPROVED): riêng = 1, chung ≥ 2
    $student_count = count( $student_ids );
    if ( 'riêng' === $type ) {
        if ( 1 !== $student_count ) {
            wp_send_json_error( array( 'message' => 'Buổi học riêng phải có đúng 1 học sinh.' ), 400 );
        }
    } else {
        if ( $student_count < 2 ) {
            wp_send_json_error( array( 'message' => 'Buổi học chung phải có ít nhất 2 học sinh.' ), 400 );
        }
    }

    // 6. student_ids phải thuộc class_id
    $ids_str = implode( ',', array_map( 'intval', $student_ids ) );
    $valid_count = (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(DISTINCT student_id) FROM {$sc_table} WHERE class_id = %d AND student_id IN ({$ids_str}) AND deleted_at IS NULL",
        $class_id
    ) );
    if ( $valid_count !== $student_count ) {
        wp_send_json_error( array( 'message' => 'Một hoặc nhiều học sinh không thuộc lớp này.' ), 400 );
    }

    // 7. price — Decision Log #4 (APPROVED): nhận từ client, validate >= 0
    if ( $price < 0 ) {
        wp_send_json_error( array( 'message' => 'Học phí không được âm.' ), 400 );
    }

    // 8. display_color — hex hợp lệ hoặc rỗng → NULL
    if ( ! empty( $display_color ) ) {
        $sanitized_color = sanitize_hex_color( $display_color );
        if ( ! $sanitized_color ) {
            wp_send_json_error( array( 'message' => 'Màu hiển thị không hợp lệ (định dạng #RRGGBB).' ), 400 );
        }
        $display_color = $sanitized_color;
    } else {
        $display_color = null;
    }

    // ── Conflict check — Decision Log #1 (APPROVED, scope = teacher_id) ──
    // [HINTEACH DESIGN DECISION] Một giáo viên không thể có 2 buổi overlap
    // giờ trong cùng ngày, bất kể khác lớp/khác học sinh.
    // Overlap: existing.start_time < new.end_time AND existing.end_time > new.start_time
    $teacher_id_for_conflict = (int) $class->teacher_id;

    $conflict = $wpdb->get_row( $wpdb->prepare(
        "SELECT s.id, s.date, s.start_time, s.end_time, s.session_name
         FROM {$s_table} s
         JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
         WHERE c.teacher_id = %d
           AND s.date = %s
           AND s.start_time < %s
           AND s.end_time > %s
           AND s.deleted_at IS NULL
         LIMIT 1",
        $teacher_id_for_conflict,
        $date,
        $end_time,
        $start_time
    ) );

    if ( $conflict ) {
        wp_send_json_error( array(
            'message'  => 'Buổi học bị trùng lịch.',
            'conflict' => array(
                'id'           => (int) $conflict->id,
                'date'         => $conflict->date,
                'start_time'   => $conflict->start_time,
                'end_time'     => $conflict->end_time,
                'session_name' => $conflict->session_name,
            ),
        ), 409 );
    }

    // ── INSERT trong transaction ─────────────────────────────
    $now = current_time( 'mysql' );

    // Chuẩn bị dữ liệu session — field rỗng lưu NULL
    $session_data = array(
        'class_id'         => $class_id,
        'date'             => $date,
        'start_time'       => $start_time,
        'end_time'         => $end_time,
        'price'            => $price,
        'type'             => $type,
        'session_name'     => ! empty( $session_name ) ? $session_name : null,
        'content'          => ! empty( $content ) ? $content : null,
        'homework_content' => ! empty( $homework_content ) ? $homework_content : null,
        'general_comment'  => ! empty( $general_comment ) ? $general_comment : null,
        'display_color'    => $display_color,
        'repeat_group_id'  => null,
        'is_exception'     => 0,
        'created_at'       => $now,
        'updated_at'       => $now,
    );
    $session_format = array( '%d', '%s', '%s', '%s', '%f', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s' );

    $wpdb->query( 'START TRANSACTION' );

    $insert_ok = $wpdb->insert( $s_table, $session_data, $session_format );

    if ( false === $insert_ok ) {
        $wpdb->query( 'ROLLBACK' );
        wp_send_json_error( array( 'message' => 'Không thể tạo buổi học. Vui lòng thử lại.' ), 500 );
    }

    $new_session_id = $wpdb->insert_id;

    // INSERT session_students — fee_amount omitted → MySQL DEFAULT NULL
    foreach ( $student_ids as $sid ) {
        $ss_ok = $wpdb->insert( $ss_table, array(
            'session_id' => $new_session_id,
            'student_id' => (int) $sid,
            'paid'       => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ), array( '%d', '%d', '%d', '%s', '%s' ) );

        if ( false === $ss_ok ) {
            $wpdb->query( 'ROLLBACK' );
            wp_send_json_error( array( 'message' => 'Không thể gán học sinh vào buổi học. Vui lòng thử lại.' ), 500 );
        }
    }

    $wpdb->query( 'COMMIT' );

    wp_send_json_success( array(
        'id'      => $new_session_id,
        'message' => 'Đã tạo buổi học thành công.',
    ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Cập nhật buổi học (POST) — M4
// Gọi từ hinteach_ajax_session_save() khi có session_id.
// [HINTEACH DESIGN DECISION — D7] Conflict check khi edit.
// [HINTEACH DESIGN DECISION — D8] Overlap check toàn bộ tập following.
// ──────────────────────────────────────────────────────────────

/**
 * Cập nhật buổi học — scope 'single' hoặc 'following'.
 *
 * Không được gọi trực tiếp qua add_action — chỉ gọi từ hinteach_ajax_session_save().
 *
 * @param int   $session_id  ID buổi học cần sửa
 * @param array $access      ['user_id' => int, 'teacher_id' => int]
 */
function hinteach_ajax_session_update( $session_id, $access ) {
    global $wpdb;
    $s_table  = $wpdb->prefix . 'hinteach_sessions';
    $c_table  = $wpdb->prefix . 'hinteach_classes';
    $sc_table = $wpdb->prefix . 'hinteach_student_class';
    $ss_table = $wpdb->prefix . 'hinteach_session_students';

    // ── Load session hiện tại ─────────────────────────────────
    $session = $wpdb->get_row( $wpdb->prepare(
        "SELECT s.*, c.teacher_id
         FROM {$s_table} s
         JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
         WHERE s.id = %d AND s.deleted_at IS NULL",
        $session_id
    ) );

    if ( ! $session ) {
        wp_send_json_error( array( 'message' => 'Buổi học không tồn tại hoặc đã bị xoá.' ), 404 );
    }

    // Ownership check
    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $session->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền sửa buổi học này.' ), 403 );
    }

    // ── Thu thập input ────────────────────────────────────────
    $class_id         = isset( $_POST['class_id'] ) ? absint( $_POST['class_id'] ) : 0;
    $date             = isset( $_POST['date'] ) ? sanitize_text_field( wp_unslash( $_POST['date'] ) ) : '';
    $start_time       = isset( $_POST['start_time'] ) ? sanitize_text_field( wp_unslash( $_POST['start_time'] ) ) : '';
    $end_time         = isset( $_POST['end_time'] ) ? sanitize_text_field( wp_unslash( $_POST['end_time'] ) ) : '';
    $type             = isset( $_POST['type'] ) ? sanitize_text_field( wp_unslash( $_POST['type'] ) ) : '';
    $price            = isset( $_POST['price'] ) ? floatval( $_POST['price'] ) : 0;
    $session_name     = isset( $_POST['session_name'] ) ? sanitize_text_field( wp_unslash( $_POST['session_name'] ) ) : '';
    $content          = isset( $_POST['content'] ) ? sanitize_textarea_field( wp_unslash( $_POST['content'] ) ) : '';
    $homework_content = isset( $_POST['homework_content'] ) ? sanitize_textarea_field( wp_unslash( $_POST['homework_content'] ) ) : '';
    $general_comment  = isset( $_POST['general_comment'] ) ? sanitize_textarea_field( wp_unslash( $_POST['general_comment'] ) ) : '';
    $display_color    = isset( $_POST['display_color'] ) ? sanitize_text_field( wp_unslash( $_POST['display_color'] ) ) : '';
    $update_scope     = isset( $_POST['update_scope'] ) ? sanitize_text_field( wp_unslash( $_POST['update_scope'] ) ) : 'single';

    // M8: drag_move discriminator — true only when explicitly sent as string 'true' by _executeDragMove().
    // FormData serializes JS boolean true as the string 'true' via ToString(value).
    // Uses standard WordPress input sanitization: wp_unslash() + sanitize_text_field().
    // Strict whitelist: ONLY the exact string 'true'. Absent, empty, or any other value evaluates to false.
    $drag_move_raw = isset( $_POST['drag_move'] ) ? sanitize_text_field( wp_unslash( $_POST['drag_move'] ) ) : '';
    $is_drag_move  = ( 'true' === $drag_move_raw );

    // student_ids — mảng từ FormData
    $student_ids_raw = isset( $_POST['student_ids'] ) && is_array( $_POST['student_ids'] )
        ? $_POST['student_ids']
        : array();
    $student_ids = array_values( array_unique( array_filter( array_map( 'absint', $student_ids_raw ) ) ) );

    // ── Validate update_scope ─────────────────────────────────
    if ( ! in_array( $update_scope, array( 'single', 'following' ), true ) ) {
        wp_send_json_error( array( 'message' => 'update_scope không hợp lệ (single hoặc following).' ), 400 );
    }

    // Nếu session không thuộc chuỗi, hoặc không có following → force single
    // (an toàn, không lỗi — theo plan Mục 9.3)
    if ( 'following' === $update_scope ) {
        if ( ! $session->repeat_group_id ) {
            $update_scope = 'single';
        } else {
            // Kiểm tra xem có buổi following thật sự không
            $has_following = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(*) FROM {$s_table}
                 WHERE repeat_group_id = %d
                   AND deleted_at IS NULL
                   AND (
                       date > %s
                       OR (date = %s AND start_time > %s)
                       OR (date = %s AND start_time = %s AND id > %d)
                   )",
                (int) $session->repeat_group_id,
                $session->date,
                $session->date, $session->start_time,
                $session->date, $session->start_time, $session_id
            ) );
            if ( 0 === $has_following ) {
                $update_scope = 'single';
            }
        }
    }

    // ── Validate class_id ────────────────────────────────────
    if ( ! $class_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu lớp học.' ), 400 );
    }

    $class = $wpdb->get_row( $wpdb->prepare(
        "SELECT id, teacher_id, fee_amount, billing_mode FROM {$c_table} WHERE id = %d AND deleted_at IS NULL",
        $class_id
    ) );

    if ( ! $class ) {
        wp_send_json_error( array( 'message' => 'Lớp không tồn tại.' ), 404 );
    }

    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $class->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền sửa buổi học cho lớp này.' ), 403 );
    }

    // ── Validate fields (tái dùng logic từ CREATE) ────────────
    // date
    if ( empty( $date ) ) {
        wp_send_json_error( array( 'message' => 'Thiếu ngày.' ), 400 );
    }
    $d = DateTime::createFromFormat( 'Y-m-d', $date );
    if ( ! $d || $d->format( 'Y-m-d' ) !== $date ) {
        wp_send_json_error( array( 'message' => 'Ngày không hợp lệ (định dạng YYYY-MM-DD).' ), 400 );
    }

    // start_time / end_time
    if ( empty( $start_time ) || empty( $end_time ) ) {
        wp_send_json_error( array( 'message' => 'Giờ bắt đầu và kết thúc không được để trống.' ), 400 );
    }
    if ( ! preg_match( '/^\d{2}:\d{2}$/', $start_time ) || ! preg_match( '/^\d{2}:\d{2}$/', $end_time ) ) {
        wp_send_json_error( array( 'message' => 'Giờ không hợp lệ (định dạng HH:MM).' ), 400 );
    }
    if ( $start_time >= $end_time ) {
        wp_send_json_error( array( 'message' => 'Giờ bắt đầu phải trước giờ kết thúc.' ), 400 );
    }

    // type
    if ( ! in_array( $type, array( 'riêng', 'chung' ), true ) ) {
        wp_send_json_error( array( 'message' => 'Loại buổi học không hợp lệ (riêng hoặc chung).' ), 400 );
    }

    // student_ids
    $student_count = count( $student_ids );
    if ( 'riêng' === $type ) {
        if ( 1 !== $student_count ) {
            wp_send_json_error( array( 'message' => 'Buổi học riêng phải có đúng 1 học sinh.' ), 400 );
        }
    } else {
        if ( $student_count < 2 ) {
            wp_send_json_error( array( 'message' => 'Buổi học chung phải có ít nhất 2 học sinh.' ), 400 );
        }
    }

    // student_ids phải thuộc class_id
    $ids_str = implode( ',', array_map( 'intval', $student_ids ) );
    $valid_count = (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(DISTINCT student_id) FROM {$sc_table} WHERE class_id = %d AND student_id IN ({$ids_str}) AND deleted_at IS NULL",
        $class_id
    ) );
    if ( $valid_count !== $student_count ) {
        wp_send_json_error( array( 'message' => 'Một hoặc nhiều học sinh không thuộc lớp này.' ), 400 );
    }

    // price
    if ( $price < 0 ) {
        wp_send_json_error( array( 'message' => 'Học phí không được âm.' ), 400 );
    }

    // display_color
    if ( ! empty( $display_color ) ) {
        $sanitized_color = sanitize_hex_color( $display_color );
        if ( ! $sanitized_color ) {
            wp_send_json_error( array( 'message' => 'Màu hiển thị không hợp lệ (định dạng #RRGGBB).' ), 400 );
        }
        $display_color = $sanitized_color;
    } else {
        $display_color = null;
    }

    $teacher_id_for_conflict = (int) $class->teacher_id;
    $now = current_time( 'mysql' );

    // ── Chuẩn bị data cập nhật ────────────────────────────────
    $update_data = array(
        'class_id'         => $class_id,
        'start_time'       => $start_time,
        'end_time'         => $end_time,
        'price'            => $price,
        'type'             => $type,
        'session_name'     => ! empty( $session_name ) ? $session_name : null,
        'content'          => ! empty( $content ) ? $content : null,
        'homework_content' => ! empty( $homework_content ) ? $homework_content : null,
        'general_comment'  => ! empty( $general_comment ) ? $general_comment : null,
        'display_color'    => $display_color,
        'updated_at'       => $now,
    );
    $update_format = array( '%d', '%s', '%s', '%f', '%s', '%s', '%s', '%s', '%s', '%s', '%s' );

    // ══════════════════════════════════════════════════════════
    // SCOPE: SINGLE
    // ══════════════════════════════════════════════════════════
    if ( 'single' === $update_scope ) {
        // Thêm date cho single (following giữ date riêng từng buổi)
        $single_data           = $update_data;
        $single_data['date']   = $date;
        $single_format         = array_merge( $update_format, array( '%s' ) );

        // [HINTEACH DESIGN DECISION — D7] Conflict check khi edit
        $schedule_changed = ( $date !== $session->date
            || $start_time !== substr( $session->start_time, 0, 5 )
            || $end_time !== substr( $session->end_time, 0, 5 ) );

        if ( $schedule_changed ) {
            $conflict = $wpdb->get_row( $wpdb->prepare(
                "SELECT s.id, s.date, s.start_time, s.end_time, s.session_name
                 FROM {$s_table} s
                 JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
                 WHERE c.teacher_id = %d
                   AND s.date = %s
                   AND s.start_time < %s
                   AND s.end_time > %s
                   AND s.deleted_at IS NULL
                   AND s.id != %d
                 LIMIT 1",
                $teacher_id_for_conflict,
                $date,
                $end_time,
                $start_time,
                $session_id
            ) );

            if ( $conflict ) {
                wp_send_json_error( array(
                    'message'  => 'Buổi học bị trùng lịch.',
                    'conflict' => array(
                        'id'           => (int) $conflict->id,
                        'date'         => $conflict->date,
                        'start_time'   => $conflict->start_time,
                        'end_time'     => $conflict->end_time,
                        'session_name' => $conflict->session_name,
                    ),
                ), 409 );
            }
        }

        // UPDATE trong transaction
        $wpdb->query( 'START TRANSACTION' );

        $ok = $wpdb->update( $s_table, $single_data, array( 'id' => $session_id ), $single_format, array( '%d' ) );
        if ( false === $ok ) {
            $wpdb->query( 'ROLLBACK' );
            wp_send_json_error( array( 'message' => 'Không thể cập nhật buổi học. Vui lòng thử lại.' ), 500 );
        }

        // Đồng bộ session_students: soft-delete thừa, insert thiếu
        hinteach_sync_session_students( $session_id, $student_ids, $now );

        $wpdb->query( 'COMMIT' );

        wp_send_json_success( array(
            'id'            => $session_id,
            'updated_count' => 1,
            'scope'         => 'single',
            'message'       => 'Đã cập nhật buổi học thành công.',
        ) );
    }

    // ══════════════════════════════════════════════════════════
    // SCOPE: FOLLOWING
    // ══════════════════════════════════════════════════════════

    // Bước 1: FREEZE danh sách target IDs — dùng giá trị HIỆN TẠI trước khi update
    // (đúng quy tắc FREEZE bắt buộc trong schedule.md Mục 4)
    $target_ids = $wpdb->get_col( $wpdb->prepare(
        "SELECT id FROM {$s_table}
         WHERE repeat_group_id = %d
           AND deleted_at IS NULL
           AND (
               date > %s
               OR (date = %s AND start_time > %s)
               OR (date = %s AND start_time = %s AND id >= %d)
           )
         ORDER BY date ASC, start_time ASC, id ASC",
        (int) $session->repeat_group_id,
        $session->date,
        $session->date, $session->start_time,
        $session->date, $session->start_time, $session_id
    ) );
    $target_ids = array_map( 'intval', $target_ids );

    if ( empty( $target_ids ) ) {
        // Không nên xảy ra (đã check has_following ở trên), nhưng an toàn
        wp_send_json_error( array( 'message' => 'Không tìm thấy buổi nào để cập nhật.' ), 400 );
    }

    $target_ids_str = implode( ',', $target_ids );

    // ══════════════════════════════════════════════════════════
    // PATH B — FOLLOWING + NON-DRAG (M4 absolute semantics)
    // ══════════════════════════════════════════════════════════
    // Giữ nguyên hoàn toàn behavior M4: áp dụng cùng absolute start_time/end_time
    // cho tất cả frozen target sessions. Mỗi session giữ date riêng của nó.
    // [HINTEACH DESIGN DECISION — D7/D8] HAR 08 confirmed: date unchanged for following.
    if ( ! $is_drag_move ) {

        $schedule_changed = ( $start_time !== substr( $session->start_time, 0, 5 )
            || $end_time !== substr( $session->end_time, 0, 5 ) );

        if ( $schedule_changed ) {
            // Load ngày riêng của từng buổi trong tập target
            $target_dates_raw = $wpdb->get_results(
                "SELECT id, date FROM {$s_table} WHERE id IN ({$target_ids_str})"
            );

            foreach ( $target_dates_raw as $td ) {
                $conflict = $wpdb->get_row( $wpdb->prepare(
                    "SELECT s.id, s.date, s.start_time, s.end_time, s.session_name
                     FROM {$s_table} s
                     JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
                     WHERE c.teacher_id = %d
                       AND s.date = %s
                       AND s.start_time < %s
                       AND s.end_time > %s
                       AND s.deleted_at IS NULL
                       AND s.id NOT IN ({$target_ids_str})
                     LIMIT 1",
                    $teacher_id_for_conflict,
                    $td->date,
                    $end_time,
                    $start_time
                ) );

                if ( $conflict ) {
                    wp_send_json_error( array(
                        'message'  => 'Buổi học bị trùng lịch.',
                        'conflict' => array(
                            'id'           => (int) $conflict->id,
                            'date'         => $conflict->date,
                            'start_time'   => $conflict->start_time,
                            'end_time'     => $conflict->end_time,
                            'session_name' => $conflict->session_name,
                        ),
                    ), 409 );
                }
            }
        }

        // UPDATE toàn bộ tập target — KHÔNG update date (mỗi buổi giữ ngày riêng)
        $wpdb->query( 'START TRANSACTION' );

        $updated_count = 0;
        foreach ( $target_ids as $tid ) {
            $ok = $wpdb->update( $s_table, $update_data, array( 'id' => $tid ), $update_format, array( '%d' ) );
            if ( false === $ok ) {
                $wpdb->query( 'ROLLBACK' );
                wp_send_json_error( array( 'message' => 'Không thể cập nhật buổi học ID ' . $tid . '. Vui lòng thử lại.' ), 500 );
            }
            $updated_count++;

            // Đồng bộ session_students cho từng buổi trong tập
            hinteach_sync_session_students( $tid, $student_ids, $now );
        }

        $wpdb->query( 'COMMIT' );

        wp_send_json_success( array(
            'id'            => $session_id,
            'updated_count' => $updated_count,
            'scope'         => 'following',
            'message'       => 'Đã cập nhật ' . $updated_count . ' buổi trong chuỗi lặp.',
        ) );
    } // end PATH B

    // ══════════════════════════════════════════════════════════
    // PATH C — FOLLOWING + DRAG (M8 delta semantics)
    // ══════════════════════════════════════════════════════════
    // [HINTEACH DESIGN DECISION — M8: drag_move following delta]
    // Mỗi session trong frozen target set được dịch chuyển theo CÙNG
    // movement delta (date_delta + time_delta) từ OLD state của chính session đó.
    // Điều này bảo toàn relative scheduling giữa các session.

    // ── Tính movement delta ───────────────────────────────────
    // Date delta: số ngày chênh lệch có dấu (new_target_date − old_target_date)
    $old_date_obj = new DateTime( $session->date );
    $new_date_obj = new DateTime( $date );
    $date_diff    = $old_date_obj->diff( $new_date_obj );
    $date_delta   = (int) $date_diff->days * ( $new_date_obj > $old_date_obj ? 1 : -1 );

    // Time delta: số phút chênh lệch có dấu (new_target_start − old_target_start)
    $old_start_parts = explode( ':', substr( $session->start_time, 0, 5 ) );
    $old_end_parts   = explode( ':', substr( $session->end_time, 0, 5 ) );
    $new_start_parts = explode( ':', $start_time );
    $old_start_mins  = (int) $old_start_parts[0] * 60 + (int) $old_start_parts[1];
    $old_end_mins    = (int) $old_end_parts[0]   * 60 + (int) $old_end_parts[1];
    $new_start_mins  = (int) $new_start_parts[0] * 60 + (int) $new_start_parts[1];
    $time_delta      = $new_start_mins - $old_start_mins;  // signed minutes

    // ── Load OLD state cho tất cả frozen target sessions ─────
    // Cần trước khi projection để đảm bảo dùng DB state tại thời điểm FREEZE
    $target_rows_raw = $wpdb->get_results(
        "SELECT id, date, start_time, end_time FROM {$s_table} WHERE id IN ({$target_ids_str}) ORDER BY FIELD(id, " . implode( ',', $target_ids ) . ")"
    );
    $target_map = array();
    foreach ( $target_rows_raw as $row ) {
        $target_map[ (int) $row->id ] = $row;
    }

    // ── Project và validate TẤT CẢ sessions trước mutation ───
    // [HINTEACH DESIGN DECISION — D9: cross-midnight → reject]
    // Nếu bất kỳ projected session nào invalid → reject toàn bộ request, no partial update.
    $projected = array();  // id => [ 'date', 'start_time', 'end_time' ]

    foreach ( $target_ids as $tid ) {
        if ( ! isset( $target_map[ $tid ] ) ) {
            // Session in frozen list không load được — an toàn: reject
            wp_send_json_error( array( 'message' => 'Không thể load trạng thái buổi học ID ' . $tid . '.' ), 500 );
        }
        $row = $target_map[ $tid ];

        // Projected date
        $row_date_obj   = new DateTime( $row->date );
        $interval_spec  = 'P' . abs( $date_delta ) . 'D';
        $interval       = new DateInterval( $interval_spec );
        if ( $date_delta >= 0 ) {
            $row_date_obj->add( $interval );
        } else {
            $row_date_obj->sub( $interval );
        }
        $proj_date = $row_date_obj->format( 'Y-m-d' );

        // Projected start / end (minutes)
        $row_start_parts   = explode( ':', substr( $row->start_time, 0, 5 ) );
        $row_end_parts     = explode( ':', substr( $row->end_time, 0, 5 ) );
        $row_start_mins    = (int) $row_start_parts[0] * 60 + (int) $row_start_parts[1];
        $row_end_mins      = (int) $row_end_parts[0]   * 60 + (int) $row_end_parts[1];
        $proj_start_mins   = $row_start_mins + $time_delta;
        $proj_end_mins     = $row_end_mins   + $time_delta;  // duration preserved

        // Time-grid range validation: 06:00–24:00 (360–1440 mins) — (D10 / D9 Option A — REJECT)
        // M7 calendar time-grid operates from 06:00 to 24:00. Projected sessions must remain within viewable domain.
        if ( $proj_start_mins < 360 || $proj_end_mins > 1440 || $proj_start_mins >= $proj_end_mins ) {
            wp_send_json_error( array(
                'message' => 'Không thể di chuyển: một hoặc nhiều buổi trong chuỗi sẽ vượt ngoài khung giờ hiển thị lịch (06:00–24:00). Vui lòng chọn vị trí khác.',
            ), 400 );
        }

        // Format HH:MM
        $proj_start_str = sprintf( '%02d:%02d', intdiv( $proj_start_mins, 60 ), $proj_start_mins % 60 );
        $proj_end_str   = sprintf( '%02d:%02d', intdiv( $proj_end_mins,   60 ), $proj_end_mins   % 60 );

        $projected[ $tid ] = array(
            'date'       => $proj_date,
            'start_time' => $proj_start_str,
            'end_time'   => $proj_end_str,
        );
    }

    // ── Conflict validation trên PROJECTED state ──────────────
    // Sessions đang cùng move trong frozen target set được exclude khỏi mutual conflict check.
    // Chỉ check với sessions NGOÀI tập target (external sessions).
    foreach ( $projected as $tid => $proj ) {
        $conflict = $wpdb->get_row( $wpdb->prepare(
            "SELECT s.id, s.date, s.start_time, s.end_time, s.session_name
             FROM {$s_table} s
             JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
             WHERE c.teacher_id = %d
               AND s.date = %s
               AND s.start_time < %s
               AND s.end_time > %s
               AND s.deleted_at IS NULL
               AND s.id NOT IN ({$target_ids_str})
             LIMIT 1",
            $teacher_id_for_conflict,
            $proj['date'],
            $proj['end_time'],
            $proj['start_time']
        ) );

        if ( $conflict ) {
            wp_send_json_error( array(
                'message'  => 'Buổi học bị trùng lịch.',
                'conflict' => array(
                    'id'           => (int) $conflict->id,
                    'date'         => $conflict->date,
                    'start_time'   => $conflict->start_time,
                    'end_time'     => $conflict->end_time,
                    'session_name' => $conflict->session_name,
                ),
            ), 409 );
        }
    }

    // ── Apply delta updates ALL OR NOTHING trong transaction ──
    $wpdb->query( 'START TRANSACTION' );

    $updated_count = 0;
    foreach ( $target_ids as $tid ) {
        $proj = $projected[ $tid ];

        // M8 Review Correction: PATH C is SCHEDULE-ONLY.
        // Mutates ONLY date, start_time, end_time, updated_at.
        // Preserves each session's own class_id, price, type, session_name, content,
        // homework_content, general_comment, display_color, and session_students.
        $drag_update_data = array(
            'date'       => $proj['date'],
            'start_time' => $proj['start_time'],
            'end_time'   => $proj['end_time'],
            'updated_at' => $now,
        );
        $drag_update_format = array(
            '%s',
            '%s',
            '%s',
            '%s',
        );

        $ok = $wpdb->update( $s_table, $drag_update_data, array( 'id' => $tid ), $drag_update_format, array( '%d' ) );
        if ( false === $ok ) {
            $wpdb->query( 'ROLLBACK' );
            wp_send_json_error( array( 'message' => 'Không thể cập nhật buổi học ID ' . $tid . '. Vui lòng thử lại.' ), 500 );
        }
        $updated_count++;

        // M8 Review Correction: Do NOT call hinteach_sync_session_students() in PATH C.
        // Drag move is schedule-only and must preserve individual student assignments.
    }

    $wpdb->query( 'COMMIT' );

    wp_send_json_success( array(
        'id'            => $session_id,
        'updated_count' => $updated_count,
        'scope'         => 'following',
        'message'       => 'Đã cập nhật ' . $updated_count . ' buổi trong chuỗi lặp.',
    ) );
}

/**
 * Đồng bộ session_students: soft-delete học sinh thừa, insert học sinh thiếu.
 * Không đụng fee_amount (D3 — chờ GĐ4).
 *
 * @param int      $session_id
 * @param int[]    $student_ids  Danh sách student_id mới
 * @param string   $now          Thời điểm hiện tại (datetime)
 */
function hinteach_sync_session_students( $session_id, $student_ids, $now ) {
    global $wpdb;
    $ss_table = $wpdb->prefix . 'hinteach_session_students';

    // Lấy danh sách student_id hiện tại (chưa xoá)
    $current_ids = $wpdb->get_col( $wpdb->prepare(
        "SELECT student_id FROM {$ss_table} WHERE session_id = %d AND deleted_at IS NULL",
        $session_id
    ) );
    $current_ids = array_map( 'intval', $current_ids );

    // Soft-delete học sinh không còn trong danh sách mới
    $to_remove = array_diff( $current_ids, $student_ids );
    foreach ( $to_remove as $sid ) {
        $wpdb->update(
            $ss_table,
            array( 'deleted_at' => $now, 'updated_at' => $now ),
            array( 'session_id' => $session_id, 'student_id' => $sid, 'deleted_at' => null ),
            array( '%s', '%s' ),
            array( '%d', '%d' )
        );
    }

    // Insert học sinh mới chưa có
    $to_add = array_diff( $student_ids, $current_ids );
    foreach ( $to_add as $sid ) {
        $wpdb->insert( $ss_table, array(
            'session_id' => $session_id,
            'student_id' => (int) $sid,
            'paid'       => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ), array( '%d', '%d', '%d', '%s', '%s' ) );
    }
}

// ──────────────────────────────────────────────────────────────
// Handler: Tạo buổi học lặp lại (POST) — M3
// ──────────────────────────────────────────────────────────────

/**
 * Tạo batch buổi học theo recurrence (daily/weekly/monthly/custom).
 *
 * M3: hinteach_session_save_recurring — action MỚI, không sửa hinteach_session_save (M2).
 *
 * Decision Log (tất cả APPROVED bởi owner, 2026-08-30):
 *   #1 — repeat_group_id = base session id [HINTEACH IMPLEMENTATION CONVENTION, không phải FK]
 *   #2 — Tên action: hinteach_session_save_recurring [APPROVED]
 *   #3 — Limit: count(repeat_dates) + 1 <= 366, reject duplicate dates [APPROVED]
 *
 * Input (POST):
 *   class_id, date, start_time, end_time, type, student_ids[],
 *   price, session_name, content, homework_content, general_comment, display_color,
 *   repeat_dates[]  — mảng ngày YYYY-MM-DD, mỗi ngày > base date, tối đa 365 phần tử
 *
 * Response success: { created_count: int, repeat_group_id: int, message: string }
 * Response conflict 409: { message: string, conflict: { date, start_time, end_time, session_name } }
 * Response validation 400: { message: string }
 */
function hinteach_ajax_session_save_recurring() {
    $access = hinteach_schedule_check_access();

    // ── Guard: không nhận session_id (chỉ CREATE) ────────────
    $session_id = isset( $_POST['session_id'] ) ? absint( $_POST['session_id'] ) : 0;
    if ( $session_id ) {
        wp_send_json_error( array( 'message' => 'Chỉnh sửa chuỗi buổi lặp chưa được hỗ trợ.' ), 400 );
    }

    // ── Thu thập repeat_dates ─────────────────────────────────
    $repeat_dates_raw = isset( $_POST['repeat_dates'] ) && is_array( $_POST['repeat_dates'] )
        ? $_POST['repeat_dates']
        : array();

    if ( empty( $repeat_dates_raw ) ) {
        wp_send_json_error( array( 'message' => 'Thiếu danh sách ngày lặp (repeat_dates).' ), 400 );
    }

    // ── Thu thập input base session ──────────────────────────
    $class_id         = isset( $_POST['class_id'] ) ? absint( $_POST['class_id'] ) : 0;
    $date             = isset( $_POST['date'] ) ? sanitize_text_field( wp_unslash( $_POST['date'] ) ) : '';
    $start_time       = isset( $_POST['start_time'] ) ? sanitize_text_field( wp_unslash( $_POST['start_time'] ) ) : '';
    $end_time         = isset( $_POST['end_time'] ) ? sanitize_text_field( wp_unslash( $_POST['end_time'] ) ) : '';
    $type             = isset( $_POST['type'] ) ? sanitize_text_field( wp_unslash( $_POST['type'] ) ) : '';
    $price            = isset( $_POST['price'] ) ? floatval( $_POST['price'] ) : 0;
    $session_name     = isset( $_POST['session_name'] ) ? sanitize_text_field( wp_unslash( $_POST['session_name'] ) ) : '';
    $content          = isset( $_POST['content'] ) ? sanitize_textarea_field( wp_unslash( $_POST['content'] ) ) : '';
    $homework_content = isset( $_POST['homework_content'] ) ? sanitize_textarea_field( wp_unslash( $_POST['homework_content'] ) ) : '';
    $general_comment  = isset( $_POST['general_comment'] ) ? sanitize_textarea_field( wp_unslash( $_POST['general_comment'] ) ) : '';
    $display_color    = isset( $_POST['display_color'] ) ? sanitize_text_field( wp_unslash( $_POST['display_color'] ) ) : '';

    // student_ids — mảng từ FormData
    $student_ids_raw = isset( $_POST['student_ids'] ) && is_array( $_POST['student_ids'] )
        ? $_POST['student_ids']
        : array();
    $student_ids = array_values( array_unique( array_filter( array_map( 'absint', $student_ids_raw ) ) ) );

    // ── Validate base session fields ─────────────────────────
    // (logic viết riêng, không sửa/tách helper với M2 — theo plan)

    global $wpdb;
    $c_table  = $wpdb->prefix . 'hinteach_classes';
    $s_table  = $wpdb->prefix . 'hinteach_sessions';
    $sc_table = $wpdb->prefix . 'hinteach_student_class';
    $ss_table = $wpdb->prefix . 'hinteach_session_students';

    // 1. class_id — tồn tại, chưa xoá, thuộc teacher_id
    if ( ! $class_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu lớp học.' ), 400 );
    }

    $class = $wpdb->get_row( $wpdb->prepare(
        "SELECT id, teacher_id, fee_amount, billing_mode FROM {$c_table} WHERE id = %d AND deleted_at IS NULL",
        $class_id
    ) );

    if ( ! $class ) {
        wp_send_json_error( array( 'message' => 'Lớp không tồn tại.' ), 404 );
    }

    // Ownership check (admin xem tất cả)
    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $class->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền tạo buổi học cho lớp này.' ), 403 );
    }

    // 2. date — format YYYY-MM-DD
    if ( empty( $date ) ) {
        wp_send_json_error( array( 'message' => 'Thiếu ngày.' ), 400 );
    }
    $d = DateTime::createFromFormat( 'Y-m-d', $date );
    if ( ! $d || $d->format( 'Y-m-d' ) !== $date ) {
        wp_send_json_error( array( 'message' => 'Ngày không hợp lệ (định dạng YYYY-MM-DD).' ), 400 );
    }

    // 3. start_time / end_time — format HH:MM, start < end
    if ( empty( $start_time ) || empty( $end_time ) ) {
        wp_send_json_error( array( 'message' => 'Giờ bắt đầu và kết thúc không được để trống.' ), 400 );
    }
    if ( ! preg_match( '/^\d{2}:\d{2}$/', $start_time ) || ! preg_match( '/^\d{2}:\d{2}$/', $end_time ) ) {
        wp_send_json_error( array( 'message' => 'Giờ không hợp lệ (định dạng HH:MM).' ), 400 );
    }
    if ( $start_time >= $end_time ) {
        wp_send_json_error( array( 'message' => 'Giờ bắt đầu phải trước giờ kết thúc.' ), 400 );
    }

    // 4. type — riêng hoặc chung
    if ( ! in_array( $type, array( 'riêng', 'chung' ), true ) ) {
        wp_send_json_error( array( 'message' => 'Loại buổi học không hợp lệ (riêng hoặc chung).' ), 400 );
    }

    // 5. student_ids — riêng = 1, chung ≥ 2
    $student_count = count( $student_ids );
    if ( 'riêng' === $type ) {
        if ( 1 !== $student_count ) {
            wp_send_json_error( array( 'message' => 'Buổi học riêng phải có đúng 1 học sinh.' ), 400 );
        }
    } else {
        if ( $student_count < 2 ) {
            wp_send_json_error( array( 'message' => 'Buổi học chung phải có ít nhất 2 học sinh.' ), 400 );
        }
    }

    // 6. student_ids phải thuộc class_id
    $ids_str = implode( ',', array_map( 'intval', $student_ids ) );
    $valid_count = (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(DISTINCT student_id) FROM {$sc_table} WHERE class_id = %d AND student_id IN ({$ids_str}) AND deleted_at IS NULL",
        $class_id
    ) );
    if ( $valid_count !== $student_count ) {
        wp_send_json_error( array( 'message' => 'Một hoặc nhiều học sinh không thuộc lớp này.' ), 400 );
    }

    // 7. price — >= 0
    if ( $price < 0 ) {
        wp_send_json_error( array( 'message' => 'Học phí không được âm.' ), 400 );
    }

    // 8. display_color — hex hợp lệ hoặc rỗng → NULL
    if ( ! empty( $display_color ) ) {
        $sanitized_color = sanitize_hex_color( $display_color );
        if ( ! $sanitized_color ) {
            wp_send_json_error( array( 'message' => 'Màu hiển thị không hợp lệ (định dạng #RRGGBB).' ), 400 );
        }
        $display_color = $sanitized_color;
    } else {
        $display_color = null;
    }

    // ── Validate repeat_dates[] ──────────────────────────────

    // Sanitize + validate format
    $repeat_dates = array();
    foreach ( $repeat_dates_raw as $rd ) {
        $rd_clean = sanitize_text_field( wp_unslash( $rd ) );
        $rd_dt    = DateTime::createFromFormat( 'Y-m-d', $rd_clean );
        if ( ! $rd_dt || $rd_dt->format( 'Y-m-d' ) !== $rd_clean ) {
            wp_send_json_error( array( 'message' => 'Ngày lặp không hợp lệ: ' . $rd_clean . ' (định dạng YYYY-MM-DD).' ), 400 );
        }
        // Mỗi ngày phải > base date
        if ( $rd_clean <= $date ) {
            wp_send_json_error( array( 'message' => 'Ngày lặp phải sau ngày gốc (' . $date . '): ' . $rd_clean ), 400 );
        }
        $repeat_dates[] = $rd_clean;
    }

    // Decision #3.2: Reject duplicates — 400, NOT silent dedupe
    if ( count( $repeat_dates ) !== count( array_unique( $repeat_dates ) ) ) {
        wp_send_json_error( array( 'message' => 'Danh sách ngày lặp có ngày trùng. Vui lòng xoá ngày trùng trước khi gửi.' ), 400 );
    }

    // Decision #3.1: count(repeat_dates) + 1 <= 366  →  count(repeat_dates) <= 365
    if ( count( $repeat_dates ) > 365 ) {
        wp_send_json_error( array( 'message' => 'Số ngày lặp tối đa là 365 (tổng cộng 366 buổi bao gồm buổi gốc).' ), 400 );
    }

    // Sort repeat_dates ascending for consistency
    sort( $repeat_dates );

    // ── Conflict check — ALL dates (base + repeat_dates) ─────
    // Check toàn bộ trước khi insert bất kỳ dòng nào (all-or-nothing)
    $teacher_id_for_conflict = (int) $class->teacher_id;
    $all_dates = array_merge( array( $date ), $repeat_dates );

    // Build placeholders for IN clause
    $date_placeholders = implode( ', ', array_fill( 0, count( $all_dates ), '%s' ) );

    // Query: tìm BẤT KỲ session nào overlap giờ trên BẤT KỲ ngày nào trong danh sách
    $conflict_args = array( $teacher_id_for_conflict, $end_time, $start_time );
    $conflict_args = array_merge( $conflict_args, $all_dates );

    $conflict = $wpdb->get_row( $wpdb->prepare(
        "SELECT s.id, s.date, s.start_time, s.end_time, s.session_name
         FROM {$s_table} s
         JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
         WHERE c.teacher_id = %d
           AND s.start_time < %s
           AND s.end_time > %s
           AND s.date IN ({$date_placeholders})
           AND s.deleted_at IS NULL
         LIMIT 1",
        ...$conflict_args
    ) );

    if ( $conflict ) {
        wp_send_json_error( array(
            'message'  => 'Buổi học bị trùng lịch.',
            'conflict' => array(
                'date'         => $conflict->date,
                'start_time'   => $conflict->start_time,
                'end_time'     => $conflict->end_time,
                'session_name' => $conflict->session_name,
            ),
        ), 409 );
    }

    // ── INSERT trong transaction — all-or-nothing ────────────
    $now = current_time( 'mysql' );

    // Chuẩn bị dữ liệu base session
    $base_session_data = array(
        'class_id'         => $class_id,
        'date'             => $date,
        'start_time'       => $start_time,
        'end_time'         => $end_time,
        'price'            => $price,
        'type'             => $type,
        'session_name'     => ! empty( $session_name ) ? $session_name : null,
        'content'          => ! empty( $content ) ? $content : null,
        'homework_content' => ! empty( $homework_content ) ? $homework_content : null,
        'general_comment'  => ! empty( $general_comment ) ? $general_comment : null,
        'display_color'    => $display_color,
        'repeat_group_id'  => null,  // Sẽ UPDATE sau khi có insert_id
        'is_exception'     => 0,
        'created_at'       => $now,
        'updated_at'       => $now,
    );
    $session_format = array( '%d', '%s', '%s', '%s', '%f', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s' );

    $wpdb->query( 'START TRANSACTION' );

    // Step 7: INSERT base session
    $insert_ok = $wpdb->insert( $s_table, $base_session_data, $session_format );
    if ( false === $insert_ok ) {
        $wpdb->query( 'ROLLBACK' );
        wp_send_json_error( array( 'message' => 'Không thể tạo buổi học gốc. Vui lòng thử lại.' ), 500 );
    }

    $base_session_id = $wpdb->insert_id;

    // Step 8: UPDATE base session SET repeat_group_id = insert_id  (Decision #1)
    $update_ok = $wpdb->update(
        $s_table,
        array( 'repeat_group_id' => $base_session_id ),
        array( 'id' => $base_session_id ),
        array( '%d' ),
        array( '%d' )
    );
    if ( false === $update_ok ) {
        $wpdb->query( 'ROLLBACK' );
        wp_send_json_error( array( 'message' => 'Không thể cập nhật nhóm lặp. Vui lòng thử lại.' ), 500 );
    }

    // Step 9: INSERT các session lặp, mỗi dòng repeat_group_id = base_session_id
    $all_session_ids = array( $base_session_id );

    foreach ( $repeat_dates as $rd ) {
        $repeat_session_data = array(
            'class_id'         => $class_id,
            'date'             => $rd,
            'start_time'       => $start_time,
            'end_time'         => $end_time,
            'price'            => $price,
            'type'             => $type,
            'session_name'     => ! empty( $session_name ) ? $session_name : null,
            'content'          => ! empty( $content ) ? $content : null,
            'homework_content' => ! empty( $homework_content ) ? $homework_content : null,
            'general_comment'  => ! empty( $general_comment ) ? $general_comment : null,
            'display_color'    => $display_color,
            'repeat_group_id'  => $base_session_id,
            'is_exception'     => 0,
            'created_at'       => $now,
            'updated_at'       => $now,
        );

        $r_ok = $wpdb->insert( $s_table, $repeat_session_data, $session_format );
        if ( false === $r_ok ) {
            $wpdb->query( 'ROLLBACK' );
            wp_send_json_error( array( 'message' => 'Không thể tạo buổi học lặp ngày ' . $rd . '. Vui lòng thử lại.' ), 500 );
        }

        $all_session_ids[] = $wpdb->insert_id;
    }

    // Step 10: INSERT session_students cho MỌI session (fee_amount = NULL)
    foreach ( $all_session_ids as $sid ) {
        foreach ( $student_ids as $stu_id ) {
            $ss_ok = $wpdb->insert( $ss_table, array(
                'session_id' => $sid,
                'student_id' => (int) $stu_id,
                'paid'       => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ), array( '%d', '%d', '%d', '%s', '%s' ) );

            if ( false === $ss_ok ) {
                $wpdb->query( 'ROLLBACK' );
                wp_send_json_error( array( 'message' => 'Không thể gán học sinh vào buổi học. Vui lòng thử lại.' ), 500 );
            }
        }
    }

    // Step 11: COMMIT
    $wpdb->query( 'COMMIT' );

    // Step 12: Response
    wp_send_json_success( array(
        'created_count'   => count( $all_session_ids ),
        'repeat_group_id' => $base_session_id,
        'message'         => 'Đã tạo ' . count( $all_session_ids ) . ' buổi học thành công.',
    ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Xoá buổi học (POST) — M4
// Soft delete (deleted_at), cascade session_students.
// ──────────────────────────────────────────────────────────────

/**
 * Xoá buổi học — scope 'single' hoặc 'following'.
 *
 * Input (POST):
 *   session_id   int     Bắt buộc
 *   scope        string  'single' (mặc định) | 'following'
 *
 * Response: { deleted_count: int, scope: string, message: string }
 */
function hinteach_ajax_session_delete() {
    $access = hinteach_schedule_check_access();

    $session_id = isset( $_POST['session_id'] ) ? absint( $_POST['session_id'] ) : 0;
    if ( ! $session_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu session_id.' ), 400 );
    }

    $scope = isset( $_POST['scope'] ) ? sanitize_text_field( wp_unslash( $_POST['scope'] ) ) : 'single';
    if ( ! in_array( $scope, array( 'single', 'following' ), true ) ) {
        wp_send_json_error( array( 'message' => 'scope không hợp lệ (single hoặc following).' ), 400 );
    }

    global $wpdb;
    $s_table  = $wpdb->prefix . 'hinteach_sessions';
    $c_table  = $wpdb->prefix . 'hinteach_classes';
    $ss_table = $wpdb->prefix . 'hinteach_session_students';

    // Load session
    $session = $wpdb->get_row( $wpdb->prepare(
        "SELECT s.*, c.teacher_id
         FROM {$s_table} s
         JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
         WHERE s.id = %d AND s.deleted_at IS NULL",
        $session_id
    ) );

    if ( ! $session ) {
        wp_send_json_error( array( 'message' => 'Buổi học không tồn tại hoặc đã bị xoá.' ), 404 );
    }

    // Ownership check
    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $session->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền xoá buổi học này.' ), 403 );
    }

    // Nếu scope=following nhưng session không thuộc chuỗi → force single
    if ( 'following' === $scope && ! $session->repeat_group_id ) {
        $scope = 'single';
    }

    $now = current_time( 'mysql' );

    // ══════════════════════════════════════════════════════════
    // SCOPE: SINGLE
    // ══════════════════════════════════════════════════════════
    if ( 'single' === $scope ) {
        $wpdb->query( 'START TRANSACTION' );

        // Soft-delete session
        $ok = $wpdb->update(
            $s_table,
            array( 'deleted_at' => $now, 'updated_at' => $now ),
            array( 'id' => $session_id ),
            array( '%s', '%s' ),
            array( '%d' )
        );
        if ( false === $ok ) {
            $wpdb->query( 'ROLLBACK' );
            wp_send_json_error( array( 'message' => 'Không thể xoá buổi học. Vui lòng thử lại.' ), 500 );
        }

        // Cascade soft-delete session_students
        $wpdb->query( $wpdb->prepare(
            "UPDATE {$ss_table} SET deleted_at = %s, updated_at = %s WHERE session_id = %d AND deleted_at IS NULL",
            $now, $now, $session_id
        ) );

        $wpdb->query( 'COMMIT' );

        wp_send_json_success( array(
            'deleted_count' => 1,
            'scope'         => 'single',
            'message'       => 'Đã xoá buổi học.',
        ) );
    }

    // ══════════════════════════════════════════════════════════
    // SCOPE: FOLLOWING
    // ══════════════════════════════════════════════════════════

    // FREEZE tập target IDs — dùng predicate đã chốt (schedule.md Mục 4)
    $target_ids = $wpdb->get_col( $wpdb->prepare(
        "SELECT id FROM {$s_table}
         WHERE repeat_group_id = %d
           AND deleted_at IS NULL
           AND (
               date > %s
               OR (date = %s AND start_time > %s)
               OR (date = %s AND start_time = %s AND id >= %d)
           )
         ORDER BY date ASC, start_time ASC, id ASC",
        (int) $session->repeat_group_id,
        $session->date,
        $session->date, $session->start_time,
        $session->date, $session->start_time, $session_id
    ) );
    $target_ids = array_map( 'intval', $target_ids );

    if ( empty( $target_ids ) ) {
        wp_send_json_error( array( 'message' => 'Không tìm thấy buổi nào để xoá.' ), 400 );
    }

    $wpdb->query( 'START TRANSACTION' );

    $target_ids_str = implode( ',', $target_ids );

    // Soft-delete sessions
    $deleted_count = $wpdb->query( $wpdb->prepare(
        "UPDATE {$s_table} SET deleted_at = %s, updated_at = %s WHERE id IN ({$target_ids_str}) AND deleted_at IS NULL",
        $now, $now
    ) );

    if ( false === $deleted_count ) {
        $wpdb->query( 'ROLLBACK' );
        wp_send_json_error( array( 'message' => 'Không thể xoá buổi học. Vui lòng thử lại.' ), 500 );
    }

    // Cascade soft-delete session_students
    $wpdb->query( $wpdb->prepare(
        "UPDATE {$ss_table} SET deleted_at = %s, updated_at = %s WHERE session_id IN ({$target_ids_str}) AND deleted_at IS NULL",
        $now, $now
    ) );

    $wpdb->query( 'COMMIT' );

    wp_send_json_success( array(
        'deleted_count' => (int) $deleted_count,
        'scope'         => 'following',
        'message'       => 'Đã xoá ' . (int) $deleted_count . ' buổi trong chuỗi lặp.',
    ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Quick Entry — Nhật ký + Điểm buổi học (POST) — M5
//
// [D1 APPROVED]  Action riêng, không gộp vào hinteach_session_save.
// [D2 APPROVED]  Ghi grades trực tiếp từ ajax-schedule.php.
// [D3 APPROVED]  Option B: giữ type ENUM + thêm score_type_label.
// [D4 APPROVED]  Không thêm test_group_id.
// [D5 APPROVED]  Response trả created_scores[].
// [D6 APPROVED]  Entry null score_value → không tạo record.
// [D7 APPROVED]  Không thay đổi feeAmount/paid.
//
// KHÔNG propagate sang recurrence following — luôn single-session.
// ──────────────────────────────────────────────────────────────

/**
 * Ghi nhanh nhật ký học tập + điểm trong buổi học.
 *
 * Input (POST):
 *   session_id        int       Bắt buộc
 *   content           string    Optional — nội dung bài học
 *   homework_content  string    Optional — bài tập về nhà
 *   session_name      string    Optional — tên buổi học
 *   general_comment   string    Optional — nhận xét chung
 *   student_details   string    JSON — per-student journal
 *   score_groups      string    JSON — nhóm điểm
 *
 * Response success:
 *   { message, updated_students, created_scores: [{ id, student_id, test_name, score, scale, type, score_type_label, date }] }
 *
 * Response error:
 *   400 — validate lỗi
 *   403 — không có quyền
 *   404 — session không tồn tại / đã xoá
 */
function hinteach_ajax_session_quick_entry() {
    $access = hinteach_schedule_check_access();

    // ── Validate session_id ──────────────────────────────────
    $session_id = isset( $_POST['session_id'] ) ? absint( $_POST['session_id'] ) : 0;
    if ( ! $session_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu session_id.' ), 400 );
    }

    global $wpdb;
    $s_table  = $wpdb->prefix . 'hinteach_sessions';
    $c_table  = $wpdb->prefix . 'hinteach_classes';
    $ss_table = $wpdb->prefix . 'hinteach_session_students';
    $g_table  = $wpdb->prefix . 'hinteach_grades';
    $st_table = $wpdb->prefix . 'hinteach_students';

    // ── Load session + ownership check ───────────────────────
    $session = $wpdb->get_row( $wpdb->prepare(
        "SELECT s.*, c.teacher_id, c.name AS class_name
         FROM {$s_table} s
         JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
         WHERE s.id = %d AND s.deleted_at IS NULL",
        $session_id
    ) );

    if ( ! $session ) {
        wp_send_json_error( array( 'message' => 'Buổi học không tồn tại hoặc đã bị xoá.' ), 404 );
    }

    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $session->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền thao tác buổi học này.' ), 403 );
    }

    // ── Load valid student IDs cho session này ───────────────
    $valid_student_ids = $wpdb->get_col( $wpdb->prepare(
        "SELECT student_id FROM {$ss_table} WHERE session_id = %d AND deleted_at IS NULL",
        $session_id
    ) );
    $valid_student_ids = array_map( 'intval', $valid_student_ids );

    if ( empty( $valid_student_ids ) ) {
        wp_send_json_error( array( 'message' => 'Buổi học không có học sinh nào.' ), 400 );
    }

    // ── Thu thập session-level fields ────────────────────────
    $content          = isset( $_POST['content'] )          ? sanitize_textarea_field( wp_unslash( $_POST['content'] ) )          : null;
    $homework_content = isset( $_POST['homework_content'] ) ? sanitize_textarea_field( wp_unslash( $_POST['homework_content'] ) ) : null;
    $session_name     = isset( $_POST['session_name'] )     ? sanitize_text_field( wp_unslash( $_POST['session_name'] ) )         : null;
    $general_comment  = isset( $_POST['general_comment'] )  ? sanitize_textarea_field( wp_unslash( $_POST['general_comment'] ) )  : null;

    // ── Parse student_details JSON ───────────────────────────
    $student_details_raw = isset( $_POST['student_details'] ) ? wp_unslash( $_POST['student_details'] ) : '';
    $student_details     = array();

    if ( ! empty( $student_details_raw ) ) {
        if ( is_string( $student_details_raw ) ) {
            $student_details = json_decode( $student_details_raw, true );
            if ( json_last_error() !== JSON_ERROR_NONE ) {
                wp_send_json_error( array( 'message' => 'student_details JSON không hợp lệ.' ), 400 );
            }
        } elseif ( is_array( $student_details_raw ) ) {
            $student_details = $student_details_raw;
        }
    }

    // ── Parse score_groups JSON ──────────────────────────────
    $score_groups_raw = isset( $_POST['score_groups'] ) ? wp_unslash( $_POST['score_groups'] ) : '';
    $score_groups     = array();

    if ( ! empty( $score_groups_raw ) ) {
        if ( is_string( $score_groups_raw ) ) {
            $score_groups = json_decode( $score_groups_raw, true );
            if ( json_last_error() !== JSON_ERROR_NONE ) {
                wp_send_json_error( array( 'message' => 'score_groups JSON không hợp lệ.' ), 400 );
            }
        } elseif ( is_array( $score_groups_raw ) ) {
            $score_groups = $score_groups_raw;
        }
    }

    // ── Validate homework enum values ────────────────────────
    $valid_homework = array( '', '0%', '30%', '50%', '70%', '100%' );

    foreach ( $student_details as $sid => $detail ) {
        $sid_int = absint( $sid );
        if ( ! in_array( $sid_int, $valid_student_ids, true ) ) {
            wp_send_json_error( array( 'message' => 'Học sinh ID ' . $sid_int . ' không thuộc buổi học này.' ), 400 );
        }
        if ( isset( $detail['homework'] ) && ! in_array( (string) $detail['homework'], $valid_homework, true ) ) {
            wp_send_json_error( array(
                'message' => 'Giá trị BTVN không hợp lệ cho học sinh ID ' . $sid_int . '. Chỉ chấp nhận: 0%, 30%, 50%, 70%, 100%.',
            ), 400 );
        }
    }

    // ── Validate score_groups ────────────────────────────────
    // Pre-validate all groups BEFORE transaction to fail fast
    $validated_groups = array();

    if ( is_array( $score_groups ) ) {
        foreach ( $score_groups as $gi => $group ) {
            if ( ! is_array( $group ) ) {
                continue;
            }

            $score_type = isset( $group['score_type'] ) ? sanitize_text_field( $group['score_type'] ) : '';
            $test_name  = isset( $group['test_name'] )  ? sanitize_text_field( $group['test_name'] )  : '';
            $max_score  = isset( $group['max_score'] )   ? floatval( $group['max_score'] )             : 0;
            $entries    = isset( $group['entries'] ) && is_array( $group['entries'] ) ? $group['entries'] : array();

            // Filter entries: only those with valid score_value (D6)
            $valid_entries = array();
            foreach ( $entries as $entry ) {
                if ( ! is_array( $entry ) ) {
                    continue;
                }
                // score_value null/empty → skip (D6 APPROVED)
                if ( ! isset( $entry['score_value'] ) || $entry['score_value'] === '' || $entry['score_value'] === null ) {
                    continue;
                }

                $entry_sid   = isset( $entry['student_id'] ) ? absint( $entry['student_id'] ) : 0;
                $score_value = floatval( $entry['score_value'] );
                $score_note  = isset( $entry['score_note'] ) ? sanitize_text_field( $entry['score_note'] ) : '';

                // Validate student belongs to session
                if ( ! in_array( $entry_sid, $valid_student_ids, true ) ) {
                    wp_send_json_error( array(
                        'message' => 'Học sinh ID ' . $entry_sid . ' trong nhóm điểm không thuộc buổi học này.',
                    ), 400 );
                }

                $valid_entries[] = array(
                    'student_id'  => $entry_sid,
                    'score_value' => $score_value,
                    'score_note'  => mb_substr( $score_note, 0, 500 ),
                );
            }

            // Skip groups with zero valid entries
            if ( empty( $valid_entries ) ) {
                continue;
            }

            // test_name required if group has valid entries
            if ( empty( $test_name ) ) {
                wp_send_json_error( array(
                    'message' => 'Nhóm điểm #' . ( $gi + 1 ) . ' có điểm nhưng thiếu tên bài kiểm tra.',
                ), 400 );
            }

            // max_score validation
            if ( $max_score <= 0 ) {
                wp_send_json_error( array(
                    'message' => 'Thang điểm tối đa phải lớn hơn 0 (nhóm "' . $test_name . '").',
                ), 400 );
            }
            if ( $max_score > 1000 ) {
                wp_send_json_error( array(
                    'message' => 'Thang điểm tối đa không được vượt quá 1000 (nhóm "' . $test_name . '").',
                ), 400 );
            }

            // score_type_label length check
            if ( mb_strlen( $score_type ) > 100 ) {
                wp_send_json_error( array(
                    'message' => 'Loại điểm không được vượt quá 100 ký tự (nhóm "' . $test_name . '").',
                ), 400 );
            }

            // test_name length check
            if ( mb_strlen( $test_name ) > 255 ) {
                wp_send_json_error( array(
                    'message' => 'Tên bài kiểm tra không được vượt quá 255 ký tự.',
                ), 400 );
            }

            // Validate each score_value in range [0, max_score]
            foreach ( $valid_entries as $ve ) {
                if ( $ve['score_value'] < 0 || $ve['score_value'] > $max_score ) {
                    wp_send_json_error( array(
                        'message' => 'Điểm số phải nằm trong khoảng 0 – ' . $max_score . ' (học sinh ID ' . $ve['student_id'] . ', nhóm "' . $test_name . '").',
                    ), 400 );
                }
            }

            // D3 Option B: map scoreType → type ENUM + score_type_label
            $type_enum       = 'test'; // default
            $score_type_lower = mb_strtolower( $score_type );

            if ( in_array( $score_type_lower, array( 'homework', 'btvn', 'bài tập về nhà', 'bài tập' ), true ) ) {
                $type_enum = 'homework';
            } elseif ( in_array( $score_type_lower, array( 'final', 'cuối kỳ', 'cuoi ky', 'thi cuối kỳ' ), true ) ) {
                $type_enum = 'final';
            }
            // Everything else stays 'test' (default)

            $validated_groups[] = array(
                'score_type'       => $score_type,      // original label for score_type_label
                'type_enum'        => $type_enum,        // mapped ENUM value
                'test_name'        => mb_substr( $test_name, 0, 255 ),
                'max_score'        => $max_score,
                'entries'          => $valid_entries,
            );
        }
    }

    // ══════════════════════════════════════════════════════════
    // TRANSACTION — all-or-nothing
    // ══════════════════════════════════════════════════════════

    $now = current_time( 'mysql' );
    $wpdb->query( 'START TRANSACTION' );

    // ── Step 3: Update session-level fields ───────────────────
    $session_update = array( 'updated_at' => $now );
    $session_format = array( '%s' );

    // Chỉ update field nếu client thực sự gửi key đó trong POST
    // (null = không gửi key → không update; '' = gửi rỗng → update thành rỗng/NULL)
    if ( array_key_exists( 'content', $_POST ) ) {
        $session_update['content'] = ! empty( $content ) ? $content : null;
        $session_format[]          = '%s';
    }
    if ( array_key_exists( 'homework_content', $_POST ) ) {
        $session_update['homework_content'] = ! empty( $homework_content ) ? $homework_content : null;
        $session_format[]                   = '%s';
    }
    if ( array_key_exists( 'session_name', $_POST ) ) {
        $session_update['session_name'] = ! empty( $session_name ) ? $session_name : null;
        $session_format[]               = '%s';
    }
    if ( array_key_exists( 'general_comment', $_POST ) ) {
        $session_update['general_comment'] = ! empty( $general_comment ) ? $general_comment : null;
        $session_format[]                  = '%s';
    }

    // Chỉ thực hiện UPDATE nếu có ít nhất 1 field ngoài updated_at
    if ( count( $session_update ) > 1 ) {
        $ok = $wpdb->update( $s_table, $session_update, array( 'id' => $session_id ), $session_format, array( '%d' ) );
        if ( false === $ok ) {
            $wpdb->query( 'ROLLBACK' );
            wp_send_json_error( array( 'message' => 'Không thể cập nhật nội dung buổi học. Vui lòng thử lại.' ), 500 );
        }
    }

    // ── Step 4: Update session_students journal fields ────────
    // [D7 APPROVED] KHÔNG update fee_amount/paid
    $updated_students = 0;

    foreach ( $student_details as $sid => $detail ) {
        $sid_int = absint( $sid );
        if ( ! in_array( $sid_int, $valid_student_ids, true ) ) {
            continue; // đã validate ở trên, nhưng double-safe
        }

        $ss_update = array( 'updated_at' => $now );
        $ss_format = array( '%s' );

        if ( isset( $detail['homework'] ) ) {
            $hw = (string) $detail['homework'];
            $ss_update['homework'] = ! empty( $hw ) ? $hw : null;
            $ss_format[]           = '%s';
        }
        if ( isset( $detail['attitude'] ) ) {
            $att = sanitize_textarea_field( $detail['attitude'] );
            $ss_update['attitude'] = ! empty( $att ) ? $att : null;
            $ss_format[]           = '%s';
        }
        if ( isset( $detail['individual_comment'] ) ) {
            $ic = sanitize_textarea_field( $detail['individual_comment'] );
            $ss_update['individual_comment'] = ! empty( $ic ) ? $ic : null;
            $ss_format[]                     = '%s';
        }
        if ( isset( $detail['note'] ) ) {
            $nt = sanitize_textarea_field( $detail['note'] );
            $ss_update['note'] = ! empty( $nt ) ? $nt : null;
            $ss_format[]       = '%s';
        }

        // Chỉ update nếu có field thay đổi ngoài updated_at
        if ( count( $ss_update ) > 1 ) {
            $ok = $wpdb->update(
                $ss_table,
                $ss_update,
                array( 'session_id' => $session_id, 'student_id' => $sid_int, 'deleted_at' => null ),
                $ss_format,
                array( '%d', '%d' )
            );
            if ( false === $ok ) {
                $wpdb->query( 'ROLLBACK' );
                wp_send_json_error( array( 'message' => 'Không thể cập nhật nhật ký học sinh ID ' . $sid_int . '. Vui lòng thử lại.' ), 500 );
            }
            $updated_students++;
        }
    }

    // ── Step 5: Insert grade records ─────────────────────────
    $created_scores = array();

    foreach ( $validated_groups as $group ) {
        foreach ( $group['entries'] as $entry ) {
            $grade_data = array(
                'student_id'       => $entry['student_id'],
                'class_id'         => (int) $session->class_id,
                'session_id'       => $session_id,
                'test_name'        => $group['test_name'],
                'score'            => $entry['score_value'],
                'scale'            => $group['max_score'],
                'type'             => $group['type_enum'],
                'score_type_label' => ! empty( $group['score_type'] ) ? $group['score_type'] : null,
                'date'             => $session->date,     // server auto-assigns from session
                'note'             => ! empty( $entry['score_note'] ) ? $entry['score_note'] : null,
                'created_at'       => $now,
                'updated_at'       => $now,
            );
            $grade_format = array( '%d', '%d', '%d', '%s', '%f', '%f', '%s', '%s', '%s', '%s', '%s', '%s' );

            $g_ok = $wpdb->insert( $g_table, $grade_data, $grade_format );
            if ( false === $g_ok ) {
    $wpdb->query( 'ROLLBACK' );

   wp_send_json_error(
 array(
   'message' => 'Không thể lưu điểm cho học sinh ID ...'
 ),
 500
);
}

            $created_scores[] = array(
                'id'               => $wpdb->insert_id,
                'student_id'       => $entry['student_id'],
                'test_name'        => $group['test_name'],
                'score'            => $entry['score_value'],
                'scale'            => $group['max_score'],
                'type'             => $group['type_enum'],
                'score_type_label' => $group['score_type'],
                'date'             => $session->date,
            );
        }
    }

    // ── Step 6: COMMIT ───────────────────────────────────────
    $wpdb->query( 'COMMIT' );

    // ── Step 7: Response (D5 APPROVED — trả created_scores) ──
    wp_send_json_success( array(
        'message'          => 'Đã lưu nhật ký và điểm buổi học thành công.',
        'updated_students' => $updated_students,
        'created_scores'   => $created_scores,
    ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Đổi màu hiển thị buổi học (POST) — M6
//
// Action riêng biệt, không gộp vào session_save.
// Logic propagation hoàn toàn do server quyết định:
// - Buổi độc lập: đổi đúng 1 buổi.
// - Buổi trong recurrence group: áp dụng cho current + following
//   theo tuple (repeat_group_id, date, start_time, id).
// ──────────────────────────────────────────────────────────────

/**
 * Cập nhật màu hiển thị (display_color) cho buổi học.
 *
 * Input (POST):
 *   session_id     int     Bắt buộc
 *   display_color  string  Hex format (#RRGGBB) hoặc rỗng để xoá màu
 *
 * Response success:
 *   { id: int, updated_count: int, display_color: string|null, message: string }
 */
function hinteach_ajax_session_display_color() {
    $access = hinteach_schedule_check_access();

    $session_id = isset( $_POST['session_id'] ) ? absint( $_POST['session_id'] ) : 0;
    if ( ! $session_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu session_id.' ), 400 );
    }

    $display_color = isset( $_POST['display_color'] ) ? sanitize_text_field( wp_unslash( $_POST['display_color'] ) ) : '';
    if ( ! empty( $display_color ) ) {
        $sanitized_color = sanitize_hex_color( $display_color );
        if ( ! $sanitized_color ) {
            wp_send_json_error( array( 'message' => 'Màu hiển thị không hợp lệ (định dạng #RRGGBB).' ), 400 );
        }
        $display_color = $sanitized_color;
    } else {
        $display_color = null;
    }

    global $wpdb;
    $s_table = $wpdb->prefix . 'hinteach_sessions';
    $c_table = $wpdb->prefix . 'hinteach_classes';

    // Load session + class ownership
    $session = $wpdb->get_row( $wpdb->prepare(
        "SELECT s.*, c.teacher_id
         FROM {$s_table} s
         JOIN {$c_table} c ON s.class_id = c.id AND c.deleted_at IS NULL
         WHERE s.id = %d AND s.deleted_at IS NULL",
        $session_id
    ) );

    if ( ! $session ) {
        wp_send_json_error( array( 'message' => 'Buổi học không tồn tại hoặc đã bị xoá.' ), 404 );
    }

    // Ownership check
    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $session->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền đổi màu buổi học này.' ), 403 );
    }

    $now = current_time( 'mysql' );

    // ── Xử lý recurrence propagation ──
    if ( $session->repeat_group_id ) {
        // FREEZE danh sách target IDs theo tuple (repeat_group_id, date, start_time, id)
        $target_ids = $wpdb->get_col( $wpdb->prepare(
            "SELECT id FROM {$s_table}
             WHERE repeat_group_id = %d
               AND deleted_at IS NULL
               AND (
                   date > %s
                   OR (date = %s AND start_time > %s)
                   OR (date = %s AND start_time = %s AND id >= %d)
               )
             ORDER BY date ASC, start_time ASC, id ASC",
            (int) $session->repeat_group_id,
            $session->date,
            $session->date, $session->start_time,
            $session->date, $session->start_time, $session_id
        ) );
        $target_ids = array_map( 'intval', $target_ids );

        if ( empty( $target_ids ) ) {
            wp_send_json_error( array( 'message' => 'Không tìm thấy buổi nào để cập nhật màu.' ), 400 );
        }

        $wpdb->query( 'START TRANSACTION' );

        $updated_count = 0;
        foreach ( $target_ids as $tid ) {
            $ok = $wpdb->update(
                $s_table,
                array(
                    'display_color' => $display_color,
                    'updated_at'    => $now,
                ),
                array( 'id' => $tid ),
                array( '%s', '%s' ),
                array( '%d' )
            );

            if ( false === $ok ) {
                $wpdb->query( 'ROLLBACK' );
                wp_send_json_error( array( 'message' => 'Không thể đổi màu buổi học ID ' . $tid . '. Vui lòng thử lại.' ), 500 );
            }
            $updated_count++;
        }

        $wpdb->query( 'COMMIT' );

        wp_send_json_success( array(
            'id'            => $session_id,
            'updated_count' => $updated_count,
            'display_color' => $display_color,
            'message'       => 'Đã đổi màu ' . $updated_count . ' buổi học trong chuỗi lặp.',
        ) );
    }

    // ── Buổi học đơn lẻ (không thuộc chuỗi lặp) ──
    $ok = $wpdb->update(
        $s_table,
        array(
            'display_color' => $display_color,
            'updated_at'    => $now,
        ),
        array( 'id' => $session_id ),
        array( '%s', '%s' ),
        array( '%d' )
    );

    if ( false === $ok ) {
        wp_send_json_error( array( 'message' => 'Không thể đổi màu buổi học. Vui lòng thử lại.' ), 500 );
    }

    wp_send_json_success( array(
        'id'            => $session_id,
        'updated_count' => 1,
        'display_color' => $display_color,
        'message'       => 'Đã đổi màu buổi học thành công.',
    ) );
}

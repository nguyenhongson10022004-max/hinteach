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
add_action( 'wp_ajax_hinteach_session_save', 'hinteach_ajax_session_save' );

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
// Handler: Tạo buổi học (POST) — M2
// ──────────────────────────────────────────────────────────────

/**
 * Tạo buổi học đơn lẻ.
 *
 * M2: hinteach_session_save — CHỈ xử lý CREATE (không có session_id trong payload).
 * Nhánh UPDATE (session_id có giá trị) CHƯA implement — để dành M4, hiện tại phải
 * wp_send_json_error nếu nhận được session_id, KHÔNG được âm thầm bỏ qua.
 *
 * Decision Log (tất cả APPROVED bởi owner, 2026-08-29):
 *   #1 — Conflict scope = teacher_id [HINTEACH DESIGN DECISION]
 *   #2 — Assistant scheduler = full write [HINTEACH DESIGN DECISION]
 *   #3 — type='chung' ≥ 2 học sinh [HINTEACH DESIGN DECISION]
 *   #4 — price = client gửi, backend validate >= 0 [HINTEACH DESIGN DECISION]
 *
 * Input (POST):
 *   class_id, date, start_time, end_time, type, student_ids[],
 *   price, session_name, content, homework_content, general_comment, display_color
 *
 * Response success: { id: int, message: string }
 * Response conflict 409: { message: string, conflict: { id, date, start_time, end_time, session_name } }
 */
function hinteach_ajax_session_save() {
    $access = hinteach_schedule_check_access();
    // Decision Log #2 (APPROVED): assistant có module scheduler bật → được phép tạo buổi.
    // hinteach_schedule_check_access() đã bao gồm hinteach_user_can_module($uid, 'scheduler').
    // Không thêm check manage_hinteach_classes — khác với ajax-classes.php vì Decision Log #2.

    // ── Guard: M2 chỉ hỗ trợ CREATE ─────────────────────────
    $session_id = isset( $_POST['session_id'] ) ? absint( $_POST['session_id'] ) : 0;
    if ( $session_id ) {
        wp_send_json_error( array( 'message' => 'Chỉnh sửa buổi học chưa được hỗ trợ. Chức năng này sẽ có ở phiên bản sau.' ), 400 );
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

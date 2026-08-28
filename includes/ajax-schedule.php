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

<?php
/**
 * HinTeach — AJAX Handlers: Lớp học
 *
 * CRUD lớp học (3 billing_mode: session/course/monthly).
 * Mọi handler: verify nonce → check capability → filter teacher_id → xử lý.
 * Assistant PHẢI qua hinteach_user_can_module($uid, 'classProfiles').
 *
 * @package HinTeach
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Đăng ký AJAX actions
add_action( 'wp_ajax_hinteach_class_list',   'hinteach_ajax_class_list' );
add_action( 'wp_ajax_hinteach_class_get',    'hinteach_ajax_class_get' );
add_action( 'wp_ajax_hinteach_class_save',   'hinteach_ajax_class_save' );
add_action( 'wp_ajax_hinteach_class_delete', 'hinteach_ajax_class_delete' );

// ──────────────────────────────────────────────────────────────
// Helpers chung cho file này
// ──────────────────────────────────────────────────────────────

/**
 * Kiểm tra quyền truy cập module lớp học.
 * Gọi đầu mỗi handler. Nếu fail → wp_send_json_error và die.
 *
 * @return array ['user_id' => int, 'teacher_id' => int]
 */
function hinteach_class_check_access() {
    check_ajax_referer( 'hinteach_nonce', 'nonce' );

    $user_id = get_current_user_id();
    if ( ! $user_id ) {
        wp_send_json_error( array( 'message' => 'Chưa đăng nhập.' ), 401 );
    }

    // Check module permission cho assistant
    if ( ! hinteach_user_can_module( $user_id, 'classProfiles' ) ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền truy cập module Lớp học.' ), 403 );
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

/**
 * Kiểm tra lớp có buổi học nào chưa (để khoá billing_mode + fee_amount).
 *
 * @param int $class_id
 * @return bool
 */
function hinteach_class_has_sessions( $class_id ) {
    global $wpdb;
    $table = $wpdb->prefix . 'hinteach_sessions';

    $count = $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(*) FROM {$table} WHERE class_id = %d AND deleted_at IS NULL",
        $class_id
    ) );

    return (int) $count > 0;
}

// ──────────────────────────────────────────────────────────────
// Handler: Danh sách lớp
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_class_list() {
    $access = hinteach_class_check_access();

    global $wpdb;
    $table = $wpdb->prefix . 'hinteach_classes';

    // Admin có thể xem tất cả (nếu cần impersonate), teacher/assistant chỉ xem của mình
    $where_teacher = '';
    if ( ! current_user_can( 'manage_hinteach_all' ) ) {
        $where_teacher = $wpdb->prepare( 'AND teacher_id = %d', $access['teacher_id'] );
    }

    $classes = $wpdb->get_results(
        "SELECT * FROM {$table} WHERE deleted_at IS NULL {$where_teacher} ORDER BY created_at DESC"
    );

    // Đếm học sinh active cho mỗi lớp
    $sc_table = $wpdb->prefix . 'hinteach_student_class';
    foreach ( $classes as &$class ) {
        $class->student_count = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM {$sc_table} WHERE class_id = %d AND deleted_at IS NULL",
            $class->id
        ) );
        $class->has_sessions = hinteach_class_has_sessions( $class->id );
        // Parse fixed_weekdays JSON
        if ( $class->fixed_weekdays ) {
            $class->fixed_weekdays = json_decode( $class->fixed_weekdays );
        }
    }
    unset( $class );

    wp_send_json_success( array( 'classes' => $classes ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Chi tiết 1 lớp
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_class_get() {
    $access = hinteach_class_check_access();

    $class_id = isset( $_GET['class_id'] ) ? absint( $_GET['class_id'] ) : 0;
    if ( ! $class_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu class_id.' ), 400 );
    }

    global $wpdb;
    $table = $wpdb->prefix . 'hinteach_classes';

    // Lấy lớp + kiểm tra quyền sở hữu
    $class = $wpdb->get_row( $wpdb->prepare(
        "SELECT * FROM {$table} WHERE id = %d AND deleted_at IS NULL",
        $class_id
    ) );

    if ( ! $class ) {
        wp_send_json_error( array( 'message' => 'Lớp không tồn tại.' ), 404 );
    }

    // Filter teacher_id (trừ admin)
    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $class->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền xem lớp này.' ), 403 );
    }

    // Parse JSON fields
    if ( $class->fixed_weekdays ) {
        $class->fixed_weekdays = json_decode( $class->fixed_weekdays );
    }

    $class->has_sessions = hinteach_class_has_sessions( $class_id );

    // Lấy danh sách học sinh trong lớp
    $sc_table = $wpdb->prefix . 'hinteach_student_class';
    $s_table  = $wpdb->prefix . 'hinteach_students';

    $students = $wpdb->get_results( $wpdb->prepare(
        "SELECT s.*, sc.fee_override, sc.id as student_class_id
         FROM {$sc_table} sc
         JOIN {$s_table} s ON s.id = sc.student_id AND s.deleted_at IS NULL
         WHERE sc.class_id = %d AND sc.deleted_at IS NULL
         ORDER BY s.name ASC",
        $class_id
    ) );

    wp_send_json_success( array(
        'class'    => $class,
        'students' => $students,
    ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Tạo / Sửa lớp
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_class_save() {
    $access = hinteach_class_check_access();

    // Chỉ teacher/admin mới được tạo/sửa, assistant không được (chỉ xem)
    if ( ! current_user_can( 'manage_hinteach_classes' ) ) {
        wp_send_json_error( array( 'message' => 'Trợ giảng không có quyền tạo/sửa lớp.' ), 403 );
    }

    global $wpdb;
    $table = $wpdb->prefix . 'hinteach_classes';

    // Thu thập dữ liệu
    $class_id     = isset( $_POST['class_id'] ) ? absint( $_POST['class_id'] ) : 0;
    $name         = isset( $_POST['name'] ) ? sanitize_text_field( $_POST['name'] ) : '';
    $color        = isset( $_POST['color'] ) ? sanitize_hex_color( $_POST['color'] ) : '#4A90D9';
    $billing_mode = isset( $_POST['billing_mode'] ) ? sanitize_text_field( $_POST['billing_mode'] ) : 'session';
    $fee_amount   = isset( $_POST['fee_amount'] ) ? floatval( $_POST['fee_amount'] ) : 0;

    // Course dates (chỉ khi billing_mode = 'course')
    $course_start_date = isset( $_POST['course_start_date'] ) ? sanitize_text_field( $_POST['course_start_date'] ) : null;
    $course_end_date   = isset( $_POST['course_end_date'] ) ? sanitize_text_field( $_POST['course_end_date'] ) : null;

    // Phụ thu mặc định lúc tạo lớp
    $surcharge_name   = isset( $_POST['surcharge_name'] ) ? sanitize_text_field( $_POST['surcharge_name'] ) : null;
    $surcharge_amount = isset( $_POST['surcharge_amount'] ) ? floatval( $_POST['surcharge_amount'] ) : 0;

    // Lịch học
    $schedule_type   = isset( $_POST['schedule_type'] ) ? sanitize_text_field( $_POST['schedule_type'] ) : 'flexible';
    $fixed_weekdays  = isset( $_POST['fixed_weekdays'] ) ? $_POST['fixed_weekdays'] : null;
    $fixed_start_time = isset( $_POST['fixed_start_time'] ) ? sanitize_text_field( $_POST['fixed_start_time'] ) : null;
    $fixed_end_time   = isset( $_POST['fixed_end_time'] ) ? sanitize_text_field( $_POST['fixed_end_time'] ) : null;

    // ── Validate ──

    if ( empty( $name ) ) {
        wp_send_json_error( array( 'message' => 'Tên lớp không được để trống.' ), 400 );
    }

    // Validate billing_mode
    if ( ! in_array( $billing_mode, array( 'session', 'course', 'monthly' ), true ) ) {
        wp_send_json_error( array( 'message' => 'Chế độ thu phí không hợp lệ.' ), 400 );
    }

    if ( $fee_amount < 0 ) {
        wp_send_json_error( array( 'message' => 'Học phí không được âm.' ), 400 );
    }

    // Course mode: bắt buộc start/end date
    if ( 'course' === $billing_mode ) {
        if ( empty( $course_start_date ) || empty( $course_end_date ) ) {
            wp_send_json_error( array( 'message' => 'Chế độ khóa học yêu cầu ngày bắt đầu và kết thúc.' ), 400 );
        }
        if ( $course_start_date >= $course_end_date ) {
            wp_send_json_error( array( 'message' => 'Ngày bắt đầu phải trước ngày kết thúc.' ), 400 );
        }
    } else {
        // Không phải course → xoá date
        $course_start_date = null;
        $course_end_date   = null;
    }

    // Validate schedule_type
    if ( ! in_array( $schedule_type, array( 'flexible', 'fixed' ), true ) ) {
        $schedule_type = 'flexible';
    }

    // Xử lý fixed_weekdays
    if ( 'fixed' === $schedule_type && $fixed_weekdays ) {
        if ( is_string( $fixed_weekdays ) ) {
            $fixed_weekdays = json_decode( $fixed_weekdays, true );
        }
        if ( is_array( $fixed_weekdays ) ) {
            // Chỉ giữ số 0-6
            $fixed_weekdays = array_values( array_filter( $fixed_weekdays, function( $d ) {
                return is_numeric( $d ) && $d >= 0 && $d <= 6;
            } ) );
            $fixed_weekdays = wp_json_encode( array_map( 'intval', $fixed_weekdays ) );
        } else {
            $fixed_weekdays = null;
        }
    } else {
        $fixed_weekdays   = null;
        $fixed_start_time = null;
        $fixed_end_time   = null;
    }

    // ── Nếu sửa: kiểm tra quyền sở hữu + khoá billing_mode nếu đã có buổi ──

    if ( $class_id ) {
        $existing = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM {$table} WHERE id = %d AND deleted_at IS NULL",
            $class_id
        ) );

        if ( ! $existing ) {
            wp_send_json_error( array( 'message' => 'Lớp không tồn tại.' ), 404 );
        }

        if ( (int) $existing->teacher_id !== $access['teacher_id'] && ! current_user_can( 'manage_hinteach_all' ) ) {
            wp_send_json_error( array( 'message' => 'Bạn không có quyền sửa lớp này.' ), 403 );
        }

        // KHOÁ billing_mode + fee_amount nếu đã có buổi học
        if ( hinteach_class_has_sessions( $class_id ) ) {
            $billing_mode = $existing->billing_mode;
            $fee_amount   = (float) $existing->fee_amount;
        }
    }

    // ── Insert hoặc Update ──

    $data = array(
        'name'               => $name,
        'color'              => $color ?: '#4A90D9',
        'billing_mode'       => $billing_mode,
        'fee_amount'         => $fee_amount,
        'course_start_date'  => $course_start_date,
        'course_end_date'    => $course_end_date,
        'surcharge_name'     => $surcharge_name,
        'surcharge_amount'   => $surcharge_amount,
        'schedule_type'      => $schedule_type,
        'fixed_weekdays'     => $fixed_weekdays,
        'fixed_start_time'   => $fixed_start_time,
        'fixed_end_time'     => $fixed_end_time,
        'updated_at'         => current_time( 'mysql' ),
    );

    $format = array( '%s', '%s', '%s', '%f', '%s', '%s', '%s', '%f', '%s', '%s', '%s', '%s', '%s' );

    if ( $class_id ) {
        // Update
        $wpdb->update( $table, $data, array( 'id' => $class_id ), $format, array( '%d' ) );

        // TODO: chờ xác nhận quan hệ surcharge_default ↔ tuition_adjustments
        // Khi tạo/sửa lớp có surcharge, chưa tự sinh record tuition_adjustment

        // TODO: chờ xác nhận logic tự sinh buổi từ lịch cố định
        // Khi schedule_type='fixed', chưa tự sinh sessions

    } else {
        // Insert
        $data['teacher_id'] = $access['teacher_id'];
        $data['created_at'] = current_time( 'mysql' );

        $format[] = '%d'; // teacher_id
        $format[] = '%s'; // created_at

        $wpdb->insert( $table, $data, $format );
        $class_id = $wpdb->insert_id;

        if ( ! $class_id ) {
            wp_send_json_error( array( 'message' => 'Không thể tạo lớp. Vui lòng thử lại.' ), 500 );
        }

        // TODO: chờ xác nhận quan hệ surcharge_default ↔ tuition_adjustments
        // TODO: chờ xác nhận logic tự sinh buổi từ lịch cố định
    }

    // Gán học sinh vào lớp (nếu có gửi kèm)
    if ( isset( $_POST['student_ids'] ) && is_array( $_POST['student_ids'] ) ) {
        $sc_table = $wpdb->prefix . 'hinteach_student_class';

        foreach ( $_POST['student_ids'] as $sid ) {
            $student_id = absint( $sid );
            if ( ! $student_id ) continue;

            // Check duplicate (bao gồm cả record đã soft delete — restore nếu có)
            $existing_sc = $wpdb->get_row( $wpdb->prepare(
                "SELECT id, deleted_at FROM {$sc_table} WHERE student_id = %d AND class_id = %d",
                $student_id,
                $class_id
            ) );

            if ( $existing_sc ) {
                if ( $existing_sc->deleted_at ) {
                    // Restore soft-deleted record
                    $wpdb->update(
                        $sc_table,
                        array( 'deleted_at' => null, 'updated_at' => current_time( 'mysql' ) ),
                        array( 'id' => $existing_sc->id ),
                        array( '%s', '%s' ),
                        array( '%d' )
                    );
                }
                // Đã tồn tại và active → skip
            } else {
                // Tạo mới
                $wpdb->insert( $sc_table, array(
                    'student_id' => $student_id,
                    'class_id'   => $class_id,
                    'created_at' => current_time( 'mysql' ),
                    'updated_at' => current_time( 'mysql' ),
                ), array( '%d', '%d', '%s', '%s' ) );
            }
        }
    }

    wp_send_json_success( array(
        'message'  => $class_id ? 'Đã lưu lớp thành công.' : 'Đã tạo lớp mới.',
        'class_id' => $class_id,
    ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Xoá lớp (soft delete)
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_class_delete() {
    $access = hinteach_class_check_access();

    // Chỉ teacher/admin mới được xoá
    if ( ! current_user_can( 'manage_hinteach_classes' ) ) {
        wp_send_json_error( array( 'message' => 'Trợ giảng không có quyền xoá lớp.' ), 403 );
    }

    $class_id = isset( $_POST['class_id'] ) ? absint( $_POST['class_id'] ) : 0;
    if ( ! $class_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu class_id.' ), 400 );
    }

    global $wpdb;
    $table = $wpdb->prefix . 'hinteach_classes';

    // Kiểm tra tồn tại + quyền sở hữu
    $class = $wpdb->get_row( $wpdb->prepare(
        "SELECT * FROM {$table} WHERE id = %d AND deleted_at IS NULL",
        $class_id
    ) );

    if ( ! $class ) {
        wp_send_json_error( array( 'message' => 'Lớp không tồn tại.' ), 404 );
    }

    if ( (int) $class->teacher_id !== $access['teacher_id'] && ! current_user_can( 'manage_hinteach_all' ) ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền xoá lớp này.' ), 403 );
    }

    // Cảnh báo nếu có học sinh active (client nên đã confirm trước khi gọi)
    $sc_table      = $wpdb->prefix . 'hinteach_student_class';
    $active_count  = (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(*) FROM {$sc_table} WHERE class_id = %d AND deleted_at IS NULL",
        $class_id
    ) );

    // Soft delete lớp
    $now = current_time( 'mysql' );
    $wpdb->update(
        $table,
        array( 'deleted_at' => $now, 'updated_at' => $now ),
        array( 'id' => $class_id ),
        array( '%s', '%s' ),
        array( '%d' )
    );

    wp_send_json_success( array(
        'message'               => 'Đã xoá lớp.',
        'had_active_students'   => $active_count > 0,
        'active_student_count'  => $active_count,
    ) );
}

<?php
/**
 * HinTeach — AJAX Handlers: Học sinh
 *
 * CRUD học sinh, gán/bỏ lớp, import file.
 * Mọi handler: verify nonce → check capability → filter teacher_id → xử lý.
 * Assistant PHẢI qua hinteach_user_can_module($uid, 'students').
 *
 * @package HinTeach
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Đăng ký AJAX actions
add_action( 'wp_ajax_hinteach_student_list',         'hinteach_ajax_student_list' );
add_action( 'wp_ajax_hinteach_student_get',          'hinteach_ajax_student_get' );
add_action( 'wp_ajax_hinteach_student_save',         'hinteach_ajax_student_save' );
add_action( 'wp_ajax_hinteach_student_delete',       'hinteach_ajax_student_delete' );
add_action( 'wp_ajax_hinteach_student_import',       'hinteach_ajax_student_import' );
add_action( 'wp_ajax_hinteach_student_class_add',    'hinteach_ajax_student_class_add' );
add_action( 'wp_ajax_hinteach_student_class_remove', 'hinteach_ajax_student_class_remove' );

// ──────────────────────────────────────────────────────────────
// Helpers chung cho file này
// ──────────────────────────────────────────────────────────────

/**
 * Kiểm tra quyền truy cập module học sinh.
 *
 * @return array ['user_id' => int, 'teacher_id' => int]
 */
function hinteach_student_check_access() {
    check_ajax_referer( 'hinteach_nonce', 'nonce' );

    $user_id = get_current_user_id();
    if ( ! $user_id ) {
        wp_send_json_error( array( 'message' => 'Chưa đăng nhập.' ), 401 );
    }

    // Check module permission cho assistant
    if ( ! hinteach_user_can_module( $user_id, 'students' ) ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền truy cập module Học sinh.' ), 403 );
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
// Handler: Danh sách học sinh
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_student_list() {
    $access = hinteach_student_check_access();

    global $wpdb;
    $s_table  = $wpdb->prefix . 'hinteach_students';
    $sc_table = $wpdb->prefix . 'hinteach_student_class';
    $c_table  = $wpdb->prefix . 'hinteach_classes';

    // Filter: chỉ lấy học sinh thuộc lớp của teacher_id hiện tại
    // Admin có thể xem tất cả
    if ( current_user_can( 'manage_hinteach_all' ) ) {
        $students = $wpdb->get_results(
            "SELECT DISTINCT s.* FROM {$s_table} s
             WHERE s.deleted_at IS NULL
             ORDER BY s.name ASC"
        );
    } else {
        $students = $wpdb->get_results( $wpdb->prepare(
            "SELECT DISTINCT s.* FROM {$s_table} s
             WHERE s.teacher_id = %d AND s.deleted_at IS NULL
             ORDER BY s.name ASC",
            $access['teacher_id']
        ) );
    }

    // Kèm danh sách lớp cho mỗi học sinh
    foreach ( $students as &$student ) {
        $student->classes = $wpdb->get_results( $wpdb->prepare(
            "SELECT c.id, c.name, c.color, c.billing_mode, sc.fee_override
             FROM {$sc_table} sc
             JOIN {$c_table} c ON c.id = sc.class_id AND c.deleted_at IS NULL
             WHERE sc.student_id = %d AND sc.deleted_at IS NULL",
            $student->id
        ) );
    }
    unset( $student );

    wp_send_json_success( array( 'students' => $students ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Chi tiết 1 học sinh
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_student_get() {
    $access = hinteach_student_check_access();

    $student_id = isset( $_GET['student_id'] ) ? absint( $_GET['student_id'] ) : 0;
    if ( ! $student_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu student_id.' ), 400 );
    }

    global $wpdb;
    $s_table  = $wpdb->prefix . 'hinteach_students';
    $sc_table = $wpdb->prefix . 'hinteach_student_class';
    $c_table  = $wpdb->prefix . 'hinteach_classes';

    $student = $wpdb->get_row( $wpdb->prepare(
        "SELECT * FROM {$s_table} WHERE id = %d AND deleted_at IS NULL",
        $student_id
    ) );

    if ( ! $student ) {
        wp_send_json_error( array( 'message' => 'Học sinh không tồn tại.' ), 404 );
    }

    // Filter teacher_id (trừ admin)
    if ( ! current_user_can( 'manage_hinteach_all' ) && (int) $student->teacher_id !== $access['teacher_id'] ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền xem học sinh này.' ), 403 );
    }

    // Danh sách lớp đang tham gia
    $student->classes = $wpdb->get_results( $wpdb->prepare(
        "SELECT c.*, sc.fee_override, sc.id as student_class_id
         FROM {$sc_table} sc
         JOIN {$c_table} c ON c.id = sc.class_id AND c.deleted_at IS NULL
         WHERE sc.student_id = %d AND sc.deleted_at IS NULL",
        $student_id
    ) );

    wp_send_json_success( array( 'student' => $student ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Tạo / Sửa học sinh
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_student_save() {
    $access = hinteach_student_check_access();

    if ( ! current_user_can( 'manage_hinteach_classes' ) ) {
        wp_send_json_error( array( 'message' => 'Trợ giảng không có quyền tạo/sửa học sinh.' ), 403 );
    }

    global $wpdb;
    $s_table = $wpdb->prefix . 'hinteach_students';

    $student_id = isset( $_POST['student_id'] ) ? absint( $_POST['student_id'] ) : 0;
    $name       = isset( $_POST['name'] ) ? sanitize_text_field( $_POST['name'] ) : '';
    $dob        = isset( $_POST['dob'] ) ? sanitize_text_field( $_POST['dob'] ) : null;
    $phone      = isset( $_POST['phone'] ) ? sanitize_text_field( $_POST['phone'] ) : null;
    $email      = isset( $_POST['email'] ) ? sanitize_email( $_POST['email'] ) : null;
    $note       = isset( $_POST['note'] ) ? sanitize_textarea_field( $_POST['note'] ) : null;

    // Validate
    if ( empty( $name ) ) {
        wp_send_json_error( array( 'message' => 'Tên học sinh không được để trống.' ), 400 );
    }

    // Validate dob format — chuẩn hoá nhiều định dạng
    if ( $dob ) {
        $dob = hinteach_normalize_date( $dob );
    }

    $data = array(
        'name'       => $name,
        'dob'        => $dob,
        'phone'      => $phone,
        'email'      => $email,
        'note'       => $note,
        'updated_at' => current_time( 'mysql' ),
    );

    $format = array( '%s', '%s', '%s', '%s', '%s', '%s' );

    if ( $student_id ) {
        // Sửa — kiểm tra quyền sở hữu
        $existing = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM {$s_table} WHERE id = %d AND deleted_at IS NULL",
            $student_id
        ) );

        if ( ! $existing ) {
            wp_send_json_error( array( 'message' => 'Học sinh không tồn tại.' ), 404 );
        }

        if ( (int) $existing->teacher_id !== $access['teacher_id'] && ! current_user_can( 'manage_hinteach_all' ) ) {
            wp_send_json_error( array( 'message' => 'Bạn không có quyền sửa học sinh này.' ), 403 );
        }

        $wpdb->update( $s_table, $data, array( 'id' => $student_id ), $format, array( '%d' ) );
    } else {
        // Tạo mới
        $data['teacher_id'] = $access['teacher_id'];
        $data['created_at'] = current_time( 'mysql' );
        $format[]           = '%d'; // teacher_id
        $format[]           = '%s'; // created_at

        $wpdb->insert( $s_table, $data, $format );
        $student_id = $wpdb->insert_id;

        if ( ! $student_id ) {
            wp_send_json_error( array( 'message' => 'Không thể tạo học sinh.' ), 500 );
        }
    }

    wp_send_json_success( array(
        'message'    => 'Đã lưu học sinh.',
        'student_id' => $student_id,
    ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Xoá học sinh (soft delete)
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_student_delete() {
    $access = hinteach_student_check_access();

    if ( ! current_user_can( 'manage_hinteach_classes' ) ) {
        wp_send_json_error( array( 'message' => 'Trợ giảng không có quyền xoá học sinh.' ), 403 );
    }

    $student_id = isset( $_POST['student_id'] ) ? absint( $_POST['student_id'] ) : 0;
    if ( ! $student_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu student_id.' ), 400 );
    }

    global $wpdb;
    $s_table = $wpdb->prefix . 'hinteach_students';

    $student = $wpdb->get_row( $wpdb->prepare(
        "SELECT * FROM {$s_table} WHERE id = %d AND deleted_at IS NULL",
        $student_id
    ) );

    if ( ! $student ) {
        wp_send_json_error( array( 'message' => 'Học sinh không tồn tại.' ), 404 );
    }

    if ( (int) $student->teacher_id !== $access['teacher_id'] && ! current_user_can( 'manage_hinteach_all' ) ) {
        wp_send_json_error( array( 'message' => 'Bạn không có quyền xoá học sinh này.' ), 403 );
    }

    // Soft delete — dữ liệu cũ (điểm, buổi học) vẫn còn
    $now = current_time( 'mysql' );
    $wpdb->update(
        $s_table,
        array( 'deleted_at' => $now, 'updated_at' => $now ),
        array( 'id' => $student_id ),
        array( '%s', '%s' ),
        array( '%d' )
    );

    wp_send_json_success( array( 'message' => 'Đã xoá học sinh.' ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Import học sinh từ file (Excel/CSV/Word)
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_student_import() {
    $access = hinteach_student_check_access();

    if ( ! current_user_can( 'manage_hinteach_classes' ) ) {
        wp_send_json_error( array( 'message' => 'Trợ giảng không có quyền import.' ), 403 );
    }

    // Kiểm tra file upload
    if ( empty( $_FILES['import_file'] ) ) {
        wp_send_json_error( array( 'message' => 'Không tìm thấy file upload.' ), 400 );
    }

    $file = $_FILES['import_file'];

    // Validate file size: 10MB
    if ( $file['size'] > 10 * 1024 * 1024 ) {
        wp_send_json_error( array( 'message' => 'File quá lớn. Giới hạn 10MB.' ), 400 );
    }

    // Validate file type
    $allowed_types = array(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
        'text/csv',
        'application/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    );
    $allowed_exts = array( 'xlsx', 'csv', 'docx' );

    $ext = strtolower( pathinfo( $file['name'], PATHINFO_EXTENSION ) );
    if ( ! in_array( $ext, $allowed_exts, true ) ) {
        wp_send_json_error( array( 'message' => 'Định dạng file không hỗ trợ. Chỉ chấp nhận: xlsx, csv, docx.' ), 400 );
    }

    // Parse file bằng helper
    $expected_columns = array( 'name' );  // Cột bắt buộc
    $optional_columns = array( 'dob', 'phone', 'email', 'note' );

    $parse_result = hinteach_parse_uploaded_table( $file['tmp_name'], $expected_columns );

    if ( is_wp_error( $parse_result ) ) {
        wp_send_json_error( array( 'message' => $parse_result->get_error_message() ), 400 );
    }

    $rows   = $parse_result['rows'];
    $errors = $parse_result['errors'];

    // Validate giới hạn 500 dòng
    if ( count( $rows ) > 500 ) {
        wp_send_json_error( array(
            'message' => 'File có ' . count( $rows ) . ' dòng dữ liệu, vượt giới hạn 500 dòng/lần.',
        ), 400 );
    }

    // Import từng dòng
    global $wpdb;
    $s_table   = $wpdb->prefix . 'hinteach_students';
    $imported  = 0;
    $skipped   = 0;
    $duplicated = 0;
    $class_id  = isset( $_POST['class_id'] ) ? absint( $_POST['class_id'] ) : 0;

    foreach ( $rows as $index => $row ) {
        $row_num = $index + 2; // +2 vì dòng 1 là header, index bắt đầu từ 0

        $name = isset( $row['name'] ) ? sanitize_text_field( trim( $row['name'] ) ) : '';
        if ( empty( $name ) ) {
            $errors[] = array(
                'row'     => $row_num,
                'message' => 'Tên học sinh trống.',
            );
            $skipped++;
            continue;
        }

        // ── Chuẩn hoá ngày sinh ──
        $dob = null;
        if ( ! empty( $row['dob'] ) ) {
            $dob = hinteach_normalize_date( $row['dob'] );
            if ( null === $dob ) {
                $errors[] = array(
                    'row'     => $row_num,
                    'message' => 'Ngày sinh không đúng định dạng (nhận được: "' . sanitize_text_field( $row['dob'] ) . '"), dòng bị bỏ qua.',
                );
                $skipped++;
                continue;
            }
        }

        $phone = isset( $row['phone'] ) ? sanitize_text_field( $row['phone'] ) : null;

        // ── Kiểm tra trùng lặp: tên + SĐT, hoặc tên + ngày sinh nếu không có SĐT ──
        $existing = null;

        if ( $phone ) {
            $existing = $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$s_table}
                 WHERE teacher_id = %d AND name = %s AND phone = %s AND deleted_at IS NULL
                 LIMIT 1",
                $access['teacher_id'],
                $name,
                $phone
            ) );
        } elseif ( $dob ) {
            // Không có SĐT → fallback check theo tên + ngày sinh
            $existing = $wpdb->get_var( $wpdb->prepare(
                "SELECT id FROM {$s_table}
                 WHERE teacher_id = %d AND name = %s AND dob = %s AND deleted_at IS NULL
                 LIMIT 1",
                $access['teacher_id'],
                $name,
                $dob
            ) );
        }
        // Nếu vừa không có SĐT vừa không có dob → không đủ dữ liệu để chắc chắn là trùng,
        // KHÔNG tự ý chặn (tránh chặn oan 2 học sinh trùng tên thật), để giáo viên tự xử lý sau.

        if ( $existing ) {
            $errors[] = array(
                'row'     => $row_num,
                'message' => 'Học sinh "' . $name . '" đã tồn tại (trùng tên + ngày sinh hoặc SĐT), bỏ qua.',
            );
            $duplicated++;
            $skipped++;
            continue;
        }

        $data = array(
            'name'       => $name,
            'dob'        => $dob,
            'phone'      => $phone,
            'email'      => isset( $row['email'] ) ? sanitize_email( $row['email'] ) : null,
            'note'       => isset( $row['note'] ) ? sanitize_textarea_field( $row['note'] ) : null,
            'teacher_id' => $access['teacher_id'],
            'created_at' => current_time( 'mysql' ),
            'updated_at' => current_time( 'mysql' ),
        );

        $wpdb->insert( $s_table, $data, array( '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s' ) );
        $new_student_id = $wpdb->insert_id;

        if ( ! $new_student_id ) {
            $errors[] = array(
                'row'     => $row_num,
                'message' => 'Lỗi khi lưu vào database.',
            );
            $skipped++;
            continue;
        }

        // Gán vào lớp nếu có class_id
        if ( $class_id ) {
            $sc_table = $wpdb->prefix . 'hinteach_student_class';
            $wpdb->insert( $sc_table, array(
                'student_id' => $new_student_id,
                'class_id'   => $class_id,
                'created_at' => current_time( 'mysql' ),
                'updated_at' => current_time( 'mysql' ),
            ), array( '%d', '%d', '%s', '%s' ) );
        }

        $imported++;
    }

    wp_send_json_success( array(
        'message'    => "Đã import {$imported} học sinh.",
        'imported'   => $imported,
        'skipped'    => $skipped,
        'duplicated' => $duplicated,
        'errors'     => $errors,
        'total'      => count( $rows ),
    ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Gán học sinh vào lớp
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_student_class_add() {
    $access = hinteach_student_check_access();

    if ( ! current_user_can( 'manage_hinteach_classes' ) ) {
        wp_send_json_error( array( 'message' => 'Trợ giảng không có quyền gán học sinh vào lớp.' ), 403 );
    }

    $student_id  = isset( $_POST['student_id'] ) ? absint( $_POST['student_id'] ) : 0;
    $class_id    = isset( $_POST['class_id'] ) ? absint( $_POST['class_id'] ) : 0;
    $fee_override = isset( $_POST['fee_override'] ) ? floatval( $_POST['fee_override'] ) : null;

    if ( ! $student_id || ! $class_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu student_id hoặc class_id.' ), 400 );
    }

    global $wpdb;

    // Verify student ownership
    $s_table = $wpdb->prefix . 'hinteach_students';
    $student = $wpdb->get_row( $wpdb->prepare(
        "SELECT teacher_id FROM {$s_table} WHERE id = %d AND deleted_at IS NULL",
        $student_id
    ) );
    if ( ! $student || ( (int) $student->teacher_id !== $access['teacher_id'] && ! current_user_can( 'manage_hinteach_all' ) ) ) {
        wp_send_json_error( array( 'message' => 'Học sinh không tồn tại hoặc bạn không có quyền.' ), 403 );
    }

    // Verify class ownership
    $c_table = $wpdb->prefix . 'hinteach_classes';
    $class   = $wpdb->get_row( $wpdb->prepare(
        "SELECT teacher_id, billing_mode FROM {$c_table} WHERE id = %d AND deleted_at IS NULL",
        $class_id
    ) );
    if ( ! $class || ( (int) $class->teacher_id !== $access['teacher_id'] && ! current_user_can( 'manage_hinteach_all' ) ) ) {
        wp_send_json_error( array( 'message' => 'Lớp không tồn tại hoặc bạn không có quyền.' ), 403 );
    }

    // fee_override chỉ có ý nghĩa khi billing_mode = 'session'
    if ( 'session' !== $class->billing_mode ) {
        $fee_override = null;
    }

    // Check duplicate
    $sc_table = $wpdb->prefix . 'hinteach_student_class';
    $existing = $wpdb->get_row( $wpdb->prepare(
        "SELECT id, deleted_at FROM {$sc_table} WHERE student_id = %d AND class_id = %d",
        $student_id,
        $class_id
    ) );

    if ( $existing ) {
        if ( $existing->deleted_at ) {
            // Restore soft-deleted
            $wpdb->update(
                $sc_table,
                array(
                    'deleted_at'   => null,
                    'fee_override' => $fee_override,
                    'updated_at'   => current_time( 'mysql' ),
                ),
                array( 'id' => $existing->id ),
                array( '%s', '%f', '%s' ),
                array( '%d' )
            );
            wp_send_json_success( array( 'message' => 'Đã khôi phục học sinh vào lớp.' ) );
        } else {
            // Đã tồn tại active → update fee_override nếu có
            if ( null !== $fee_override ) {
                $wpdb->update(
                    $sc_table,
                    array( 'fee_override' => $fee_override, 'updated_at' => current_time( 'mysql' ) ),
                    array( 'id' => $existing->id ),
                    array( '%f', '%s' ),
                    array( '%d' )
                );
            }
            wp_send_json_success( array( 'message' => 'Học sinh đã có trong lớp.' ) );
        }
    }

    // Tạo mới
    $wpdb->insert( $sc_table, array(
        'student_id'   => $student_id,
        'class_id'     => $class_id,
        'fee_override' => $fee_override,
        'created_at'   => current_time( 'mysql' ),
        'updated_at'   => current_time( 'mysql' ),
    ), array( '%d', '%d', '%f', '%s', '%s' ) );

    wp_send_json_success( array( 'message' => 'Đã gán học sinh vào lớp.' ) );
}

// ──────────────────────────────────────────────────────────────
// Handler: Bỏ học sinh khỏi lớp (soft delete student_class)
// ──────────────────────────────────────────────────────────────

function hinteach_ajax_student_class_remove() {
    $access = hinteach_student_check_access();

    if ( ! current_user_can( 'manage_hinteach_classes' ) ) {
        wp_send_json_error( array( 'message' => 'Trợ giảng không có quyền bỏ học sinh khỏi lớp.' ), 403 );
    }

    $student_id = isset( $_POST['student_id'] ) ? absint( $_POST['student_id'] ) : 0;
    $class_id   = isset( $_POST['class_id'] ) ? absint( $_POST['class_id'] ) : 0;

    if ( ! $student_id || ! $class_id ) {
        wp_send_json_error( array( 'message' => 'Thiếu student_id hoặc class_id.' ), 400 );
    }

    global $wpdb;
    $sc_table = $wpdb->prefix . 'hinteach_student_class';

    // Verify ownership qua class
    $c_table = $wpdb->prefix . 'hinteach_classes';
    $class   = $wpdb->get_row( $wpdb->prepare(
        "SELECT teacher_id FROM {$c_table} WHERE id = %d AND deleted_at IS NULL",
        $class_id
    ) );

    if ( ! $class || ( (int) $class->teacher_id !== $access['teacher_id'] && ! current_user_can( 'manage_hinteach_all' ) ) ) {
        wp_send_json_error( array( 'message' => 'Lớp không tồn tại hoặc bạn không có quyền.' ), 403 );
    }

    $existing = $wpdb->get_row( $wpdb->prepare(
        "SELECT id FROM {$sc_table} WHERE student_id = %d AND class_id = %d AND deleted_at IS NULL",
        $student_id,
        $class_id
    ) );

    if ( ! $existing ) {
        wp_send_json_error( array( 'message' => 'Học sinh không có trong lớp này.' ), 404 );
    }

    // Soft delete
    $now = current_time( 'mysql' );
    $wpdb->update(
        $sc_table,
        array( 'deleted_at' => $now, 'updated_at' => $now ),
        array( 'id' => $existing->id ),
        array( '%s', '%s' ),
        array( '%d' )
    );

    wp_send_json_success( array( 'message' => 'Đã bỏ học sinh khỏi lớp.' ) );
}

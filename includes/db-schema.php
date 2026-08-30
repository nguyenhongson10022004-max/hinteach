<?php
/**
 * HinTeach — Database Schema
 *
 * Định nghĩa TẤT CẢ bảng DB cho plugin. Chạy khi activate plugin.
 * KHÔNG tạo bảng/cột ở bất kỳ file nào khác.
 *
 * @package HinTeach
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Tạo/cập nhật tất cả bảng DB bằng dbDelta().
 *
 * Gọi từ register_activation_hook trong hinteach.php.
 * dbDelta() tự so sánh schema hiện tại và chỉ thay đổi cần thiết.
 */
function hinteach_create_tables() {
    global $wpdb;

    $charset_collate = $wpdb->get_charset_collate();
    $prefix          = $wpdb->prefix . 'hinteach_';

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    // ──────────────────────────────────────────────────────────────
    // 1. wp_hinteach_classes
    // ──────────────────────────────────────────────────────────────
    $sql_classes = "CREATE TABLE {$prefix}classes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(7) DEFAULT '#4A90D9',
        teacher_id BIGINT UNSIGNED NOT NULL,
        billing_mode ENUM('session','course','monthly') NOT NULL DEFAULT 'session',
        fee_amount DECIMAL(12,0) NOT NULL DEFAULT 0,
        course_start_date DATE DEFAULT NULL,
        course_end_date DATE DEFAULT NULL,
        surcharge_name VARCHAR(255) DEFAULT NULL,
        surcharge_amount DECIMAL(12,0) DEFAULT 0,
        schedule_type ENUM('flexible','fixed') NOT NULL DEFAULT 'flexible',
        fixed_weekdays JSON DEFAULT NULL,
        fixed_start_time TIME DEFAULT NULL,
        fixed_end_time TIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY idx_teacher_id (teacher_id),
        KEY idx_billing_mode (billing_mode),
        KEY idx_deleted_at (deleted_at)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 2. wp_hinteach_students
    // ──────────────────────────────────────────────────────────────
    $sql_students = "CREATE TABLE {$prefix}students (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        dob DATE DEFAULT NULL,
        phone VARCHAR(20) DEFAULT NULL,
        email VARCHAR(255) DEFAULT NULL,
        note TEXT DEFAULT NULL,
        teacher_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY idx_teacher_id (teacher_id),
        KEY idx_deleted_at (deleted_at)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 3. wp_hinteach_student_user_map
    //    1-1 mapping học sinh → WP user (hoãn nếu chưa cần tài khoản học sinh)
    // ──────────────────────────────────────────────────────────────
    $sql_student_user_map = "CREATE TABLE {$prefix}student_user_map (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        student_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY uq_student_user (student_id, user_id),
        KEY idx_student_id (student_id),
        KEY idx_user_id (user_id)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 4. wp_hinteach_student_class
    //    N-N: 1 học sinh tham gia nhiều lớp
    //    fee_override CHỈ có ý nghĩa khi lớp đó billing_mode = 'session'
    // ──────────────────────────────────────────────────────────────
    $sql_student_class = "CREATE TABLE {$prefix}student_class (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        student_id BIGINT UNSIGNED NOT NULL,
        class_id BIGINT UNSIGNED NOT NULL,
        fee_override DECIMAL(12,0) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY uq_student_class (student_id, class_id),
        KEY idx_student_id (student_id),
        KEY idx_class_id (class_id),
        KEY idx_deleted_at (deleted_at)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 5. wp_hinteach_sessions
    //    Buổi học — type 'riêng' (1 HS) hoặc 'chung' (nhóm)
    // ──────────────────────────────────────────────────────────────
    $sql_sessions = "CREATE TABLE {$prefix}sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        class_id BIGINT UNSIGNED NOT NULL,
        date DATE NOT NULL,
        start_time TIME DEFAULT NULL,
        end_time TIME DEFAULT NULL,
        price DECIMAL(12,0) NOT NULL DEFAULT 0,
        type ENUM('riêng','chung') NOT NULL DEFAULT 'chung',
        session_name VARCHAR(255) DEFAULT NULL,
        content TEXT DEFAULT NULL,
        homework_content TEXT DEFAULT NULL,
        general_comment TEXT DEFAULT NULL,
        display_color VARCHAR(7) DEFAULT NULL,
        repeat_group_id BIGINT UNSIGNED DEFAULT NULL,
        is_exception TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY idx_class_id (class_id),
        KEY idx_date (date),
        KEY idx_repeat_group_date (repeat_group_id, date, start_time),
        KEY idx_deleted_at (deleted_at)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 6. wp_hinteach_session_students
    //    Điểm danh + nhật ký học tập — nguồn DUY NHẤT
    //    homework: enum '0%','30%','50%','70%','100%'
    //    attitude: TEXT tự do (KHÔNG phải điểm số)
    // ──────────────────────────────────────────────────────────────
    $sql_session_students = "CREATE TABLE {$prefix}session_students (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        session_id BIGINT UNSIGNED NOT NULL,
        student_id BIGINT UNSIGNED NOT NULL,
        fee_amount DECIMAL(12,0) DEFAULT NULL,
        paid TINYINT(1) NOT NULL DEFAULT 0,
        homework ENUM('0%','30%','50%','70%','100%') DEFAULT NULL,
        attitude TEXT DEFAULT NULL,
        individual_comment TEXT DEFAULT NULL,
        note TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY uq_session_student (session_id, student_id),
        KEY idx_session_id (session_id),
        KEY idx_student_id (student_id),
        KEY idx_deleted_at (deleted_at)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 7. wp_hinteach_billing_payments
    //    CHỈ dùng cho billing_mode IN ('course','monthly')
    //    period_key: 'YYYY-MM' (monthly) hoặc 'course:{start}:{end}' (course)
    // ──────────────────────────────────────────────────────────────
    $sql_billing_payments = "CREATE TABLE {$prefix}billing_payments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        student_id BIGINT UNSIGNED NOT NULL,
        class_id BIGINT UNSIGNED NOT NULL,
        period_key VARCHAR(100) NOT NULL,
        paid TINYINT(1) NOT NULL DEFAULT 0,
        amount_paid DECIMAL(12,0) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY idx_student_id (student_id),
        KEY idx_class_id (class_id),
        KEY idx_period_key (period_key),
        KEY idx_deleted_at (deleted_at)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 8. wp_hinteach_payments
    //    Lịch sử thu tiền THẬT cho chế độ 'session'
    //    Mỗi lần xác nhận thu = 1 record MỚI, KHÔNG update đè
    // ──────────────────────────────────────────────────────────────
    $sql_payments = "CREATE TABLE {$prefix}payments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        student_id BIGINT UNSIGNED NOT NULL,
        class_id BIGINT UNSIGNED NOT NULL,
        session_id BIGINT UNSIGNED DEFAULT NULL,
        amount DECIMAL(12,0) NOT NULL DEFAULT 0,
        paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        note TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY idx_student_id (student_id),
        KEY idx_class_id (class_id),
        KEY idx_session_id (session_id),
        KEY idx_deleted_at (deleted_at)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 9. wp_hinteach_tuition_adjustments
    //    Phụ thu / giảm phí
    //    scope: student_id NULL → áp dụng cả lớp
    //    calc_type: 'amount' (cố định) hoặc 'percent' (% học phí gốc)
    // ──────────────────────────────────────────────────────────────
    $sql_tuition_adjustments = "CREATE TABLE {$prefix}tuition_adjustments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        student_id BIGINT UNSIGNED DEFAULT NULL,
        class_id BIGINT UNSIGNED DEFAULT NULL,
        type ENUM('surcharge','discount') NOT NULL,
        calc_type ENUM('amount','percent') NOT NULL DEFAULT 'amount',
        value DECIMAL(12,2) NOT NULL DEFAULT 0,
        month_from VARCHAR(7) DEFAULT NULL,
        month_to VARCHAR(7) DEFAULT NULL,
        note TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY idx_class_id (class_id),
        KEY idx_student_id (student_id),
        KEY idx_deleted_at (deleted_at)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 10. wp_hinteach_grades
    //     Điểm bài kiểm tra
    //     type: 'homework' (BTVN kiểm tra), 'test', 'final'
    //     KHÔNG có type='quiz' ở giai đoạn hiện tại
    // ──────────────────────────────────────────────────────────────
    $sql_grades = "CREATE TABLE {$prefix}grades (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        student_id BIGINT UNSIGNED NOT NULL,
        class_id BIGINT UNSIGNED NOT NULL,
        session_id BIGINT UNSIGNED DEFAULT NULL,
        test_name VARCHAR(255) NOT NULL,
        score DECIMAL(5,2) DEFAULT NULL,
        scale DECIMAL(5,2) NOT NULL DEFAULT 10,
        type ENUM('homework','test','final') NOT NULL DEFAULT 'test',
        score_type_label VARCHAR(100) DEFAULT NULL,
        date DATE DEFAULT NULL,
        note TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY idx_student_id (student_id),
        KEY idx_class_id (class_id),
        KEY idx_session_id (session_id),
        KEY idx_deleted_at (deleted_at)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 11. wp_hinteach_assistant_permissions
    //     Quyền trợ giảng chi tiết theo từng module
    //     module_key: dashboard, scheduler, tuition, students, classProfiles
    // ──────────────────────────────────────────────────────────────
    $sql_assistant_permissions = "CREATE TABLE {$prefix}assistant_permissions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        assistant_user_id BIGINT UNSIGNED NOT NULL,
        module_key VARCHAR(50) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY uq_assistant_module (assistant_user_id, module_key),
        KEY idx_assistant_user_id (assistant_user_id),
        KEY idx_module_key (module_key)
    ) $charset_collate;";

    // ──────────────────────────────────────────────────────────────
    // 12. wp_hinteach_license
    //     Hạn sử dụng tài khoản giáo viên
    // ──────────────────────────────────────────────────────────────
    $sql_license = "CREATE TABLE {$prefix}license (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        expires_at DATETIME DEFAULT NULL,
        status ENUM('active','grace','locked','exempt') NOT NULL DEFAULT 'active',
        last_confirmed_at DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY idx_user_id (user_id),
        KEY idx_status (status)
    ) $charset_collate;";

    // Chạy dbDelta cho tất cả bảng
    dbDelta( $sql_classes );
    dbDelta( $sql_students );
    dbDelta( $sql_student_user_map );
    dbDelta( $sql_student_class );
    dbDelta( $sql_sessions );
    dbDelta( $sql_session_students );
    dbDelta( $sql_billing_payments );
    dbDelta( $sql_payments );
    dbDelta( $sql_tuition_adjustments );
    dbDelta( $sql_grades );
    dbDelta( $sql_assistant_permissions );
    dbDelta( $sql_license );
}

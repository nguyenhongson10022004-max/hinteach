<?php
/**
 * HinTeach — Roles & Capabilities
 *
 * Định nghĩa 3 role + capabilities + helper check quyền trợ giảng theo module.
 *
 * @package HinTeach
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Tạo 3 custom roles cho HinTeach.
 *
 * Gọi từ register_activation_hook trong hinteach.php.
 * Nếu role đã tồn tại, remove trước rồi tạo lại để đảm bảo caps đúng.
 */
function hinteach_create_roles() {
    // Remove trước nếu đã tồn tại (đảm bảo caps luôn đúng khi update plugin)
    remove_role( 'hinteach_admin' );
    remove_role( 'hinteach_teacher' );
    remove_role( 'hinteach_assistant' );

    // 1. Admin HinTeach — toàn quyền: quản lý tài khoản, license, impersonate
    add_role( 'hinteach_admin', 'HinTeach Admin', array(
        'read'                    => true,
        'manage_hinteach_all'     => true,
        'manage_hinteach_classes' => true,
    ) );

    // 2. Giáo viên — quản lý lớp/học sinh/buổi học/học phí/điểm do mình phụ trách
    add_role( 'hinteach_teacher', 'HinTeach Giáo viên', array(
        'read'                    => true,
        'manage_hinteach_classes' => true,
    ) );

    // 3. Trợ giảng — quyền CHI TIẾT theo từng module (tra bảng assistant_permissions)
    //    Không có capability nào ngoài 'read' — phân quyền thật nằm ở
    //    hinteach_user_can_module() bên dưới.
    add_role( 'hinteach_assistant', 'HinTeach Trợ giảng', array(
        'read' => true,
    ) );
}

/**
 * Xoá custom roles khi deactivate plugin.
 *
 * Gọi từ register_deactivation_hook trong hinteach.php (tuỳ chọn).
 */
function hinteach_remove_roles() {
    remove_role( 'hinteach_admin' );
    remove_role( 'hinteach_teacher' );
    remove_role( 'hinteach_assistant' );
}

/**
 * Danh sách module_key hợp lệ cho assistant permissions.
 *
 * Khớp với assistantPermissionDefinitions() quan sát từ bundle.js bản gốc.
 *
 * @return array
 */
function hinteach_get_module_keys() {
    return array( 'dashboard', 'scheduler', 'tuition', 'students', 'classProfiles' );
}

/**
 * Kiểm tra user (role assistant) có quyền truy cập module cụ thể không.
 *
 * Dùng trong AJAX handler thay vì chỉ check capability chung chung.
 * Nếu user KHÔNG phải assistant (là teacher/admin) → luôn trả true.
 *
 * @param int    $user_id    WP user ID
 * @param string $module_key Một trong: dashboard, scheduler, tuition, students, classProfiles
 * @return bool
 */
function hinteach_user_can_module( $user_id, $module_key ) {
    $user = get_userdata( $user_id );

    if ( ! $user ) {
        return false;
    }

    // Admin → toàn quyền
    if ( user_can( $user, 'manage_hinteach_all' ) ) {
        return true;
    }

    // Teacher → quyền đầy đủ trong phạm vi dữ liệu của mình
    if ( user_can( $user, 'manage_hinteach_classes' ) ) {
        return true;
    }

    // Assistant → tra bảng assistant_permissions
    if ( in_array( 'hinteach_assistant', (array) $user->roles, true ) ) {
        global $wpdb;
        $table = $wpdb->prefix . 'hinteach_assistant_permissions';

        $enabled = $wpdb->get_var( $wpdb->prepare(
            "SELECT enabled FROM {$table} WHERE assistant_user_id = %d AND module_key = %s AND deleted_at IS NULL",
            $user_id,
            $module_key
        ) );

        return (bool) $enabled;
    }

    // Không có role HinTeach nào → không có quyền
    return false;
}

/**
 * Kiểm tra user hiện tại có phải role HinTeach hợp lệ không.
 *
 * @param int $user_id WP user ID
 * @return bool
 */
function hinteach_is_valid_user( $user_id ) {
    $user = get_userdata( $user_id );
    if ( ! $user ) {
        return false;
    }

    $hinteach_roles = array( 'hinteach_admin', 'hinteach_teacher', 'hinteach_assistant' );
    return ! empty( array_intersect( $hinteach_roles, (array) $user->roles ) );
}

/**
 * Lấy teacher_id thật sự sở hữu dữ liệu.
 *
 * - Admin/Teacher → chính user_id của họ
 * - Assistant → teacher_id của giáo viên quản lý (lưu trong usermeta)
 *
 * @param int $user_id WP user ID
 * @return int|false teacher_id hoặc false nếu không xác định được
 */
function hinteach_get_teacher_id( $user_id ) {
    $user = get_userdata( $user_id );
    if ( ! $user ) {
        return false;
    }

    // Admin hoặc Teacher → chính mình
    if ( user_can( $user, 'manage_hinteach_classes' ) ) {
        return $user_id;
    }

    // Assistant → lấy teacher_id từ usermeta
    if ( in_array( 'hinteach_assistant', (array) $user->roles, true ) ) {
        $teacher_id = get_user_meta( $user_id, 'hinteach_teacher_id', true );
        return $teacher_id ? (int) $teacher_id : false;
    }

    return false;
}

/**
 * Lấy danh sách permissions của assistant.
 *
 * Dùng cho frontend (truyền vào HT_Config.assistantPermissions).
 *
 * @param int $user_id WP user ID (assistant)
 * @return array Associative: module_key => bool
 */
function hinteach_get_assistant_permissions( $user_id ) {
    global $wpdb;
    $table   = $wpdb->prefix . 'hinteach_assistant_permissions';
    $modules = hinteach_get_module_keys();
    $result  = array();

    foreach ( $modules as $key ) {
        $result[ $key ] = false;
    }

    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT module_key, enabled FROM {$table} WHERE assistant_user_id = %d AND deleted_at IS NULL",
        $user_id
    ) );

    if ( $rows ) {
        foreach ( $rows as $row ) {
            if ( isset( $result[ $row->module_key ] ) ) {
                $result[ $row->module_key ] = (bool) $row->enabled;
            }
        }
    }

    return $result;
}

<?php
/**
 * HinTeach — Shortcodes
 *
 * Shortcode [hinteach_dashboard] render HTML shell cho SPA dashboard.
 * KHÔNG query DB trực tiếp — chỉ render khung HTML + truyền config cho JS.
 *
 * @package HinTeach
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_shortcode( 'hinteach_dashboard', 'hinteach_render_dashboard' );

/**
 * Render dashboard SPA shell.
 *
 * @return string HTML output
 */
function hinteach_render_dashboard() {
    // Phải đăng nhập
    if ( ! is_user_logged_in() ) {
        return '<div class="ht-login-required"><p>Vui lòng <a href="' . esc_url( wp_login_url( get_permalink() ) ) . '">đăng nhập</a> để truy cập.</p></div>';
    }

    $user_id = get_current_user_id();

    // Phải có role HinTeach hợp lệ
    if ( ! hinteach_is_valid_user( $user_id ) ) {
        return '<div class="ht-no-access"><p>Bạn không có quyền truy cập trang này.</p></div>';
    }

    $user       = wp_get_current_user();
    $roles      = (array) $user->roles;
    $role       = 'hinteach_assistant'; // default
    $teacher_id = hinteach_get_teacher_id( $user_id );

    if ( in_array( 'hinteach_admin', $roles, true ) ) {
        $role = 'hinteach_admin';
    } elseif ( in_array( 'hinteach_teacher', $roles, true ) ) {
        $role = 'hinteach_teacher';
    }

    // Lấy assistant permissions (trả mảng rỗng nếu không phải assistant)
    $assistant_permissions = array();
    if ( 'hinteach_assistant' === $role ) {
        $assistant_permissions = hinteach_get_assistant_permissions( $user_id );
    }

    // Truyền config cho JS — KHÔNG hardcode nonce ở HTML, dùng wp_localize_script thay
    // Nhưng vì shortcode render trước enqueue, ta dùng inline script
    $config = array(
        'ajaxUrl'              => admin_url( 'admin-ajax.php' ),
        'nonce'                => wp_create_nonce( 'hinteach_nonce' ),
        'currentUser'          => array(
            'id'          => $user_id,
            'displayName' => $user->display_name,
            'email'       => $user->user_email,
        ),
        'currentRole'          => $role,
        'teacherId'            => $teacher_id,
        'assistantPermissions' => $assistant_permissions,
        'moduleBaseUrl'        => HINTEACH_URL . 'assets/dist/modules/',
    );

    // Danh sách tab theo role
    $tabs = hinteach_get_tabs_for_role( $role, $assistant_permissions );

    ob_start();
    ?>
    <div id="hinteach-app" class="ht-app" data-role="<?php echo esc_attr( $role ); ?>">
        <!-- Sidebar -->
        <aside class="ht-sidebar" id="ht-sidebar">
            <div class="ht-sidebar__header">
                <h2 class="ht-sidebar__title">HinTeach</h2>
            </div>
            <nav class="ht-sidebar__nav" id="ht-sidebar-nav">
                <?php foreach ( $tabs as $tab ) : ?>
                    <button
                        type="button"
                        class="ht-sidebar__tab"
                        data-tab="<?php echo esc_attr( $tab['key'] ); ?>"
                        id="ht-tab-<?php echo esc_attr( $tab['key'] ); ?>"
                    >
                        <span class="ht-sidebar__tab-icon"><?php echo $tab['icon']; ?></span>
                        <span class="ht-sidebar__tab-label"><?php echo esc_html( $tab['label'] ); ?></span>
                    </button>
                <?php endforeach; ?>
            </nav>
        </aside>

        <!-- Main content -->
        <main class="ht-main" id="ht-main">
            <!-- Topbar -->
            <header class="ht-topbar" id="ht-topbar">
                <button type="button" class="ht-topbar__menu-toggle" id="ht-menu-toggle" aria-label="Toggle menu">
                    <span>☰</span>
                </button>
                <div class="ht-topbar__spacer"></div>
                <div class="ht-topbar__user">
                    <span class="ht-topbar__user-name"><?php echo esc_html( $user->display_name ); ?></span>
                    <a href="<?php echo esc_url( wp_logout_url( get_permalink() ) ); ?>" class="ht-topbar__logout">Đăng xuất</a>
                </div>
            </header>

            <!-- Tab content area -->
            <div class="ht-content" id="ht-content">
                <div class="ht-content__loading" id="ht-loading">
                    <div class="ht-spinner"></div>
                    <p>Đang tải...</p>
                </div>
            </div>
        </main>

        <!-- Modal container -->
        <div class="ht-modal-overlay" id="ht-modal-overlay" style="display:none;">
            <div class="ht-modal" id="ht-modal">
                <div class="ht-modal__header">
                    <h3 class="ht-modal__title" id="ht-modal-title"></h3>
                    <button type="button" class="ht-modal__close" id="ht-modal-close" aria-label="Đóng">&times;</button>
                </div>
                <div class="ht-modal__body" id="ht-modal-body"></div>
                <div class="ht-modal__footer" id="ht-modal-footer"></div>
            </div>
        </div>
    </div>

    <script>
        window.HT_Config = <?php echo wp_json_encode( $config ); ?>;
    </script>
    <?php
    return ob_get_clean();
}

/**
 * Lấy danh sách tab hiển thị theo role.
 *
 * @param string $role                  Role hiện tại
 * @param array  $assistant_permissions Mảng permission (chỉ dùng nếu assistant)
 * @return array
 */
function hinteach_get_tabs_for_role( $role, $assistant_permissions = array() ) {
    // Tất cả tab có thể có
    $all_tabs = array(
        // TODO: Bật lại khi code Giai đoạn Dashboard — hiện tại chưa có module JS tương ứng
        // array(
        //     'key'        => 'dashboard',
        //     'label'      => 'Tổng quan',
        //     'icon'       => '📊',
        //     'module_key' => 'dashboard',
        // ),
        array(
            'key'        => 'classes',
            'label'      => 'Lớp học',
            'icon'       => '📚',
            'module_key' => 'classProfiles',
        ),
        array(
            'key'        => 'students',
            'label'      => 'Học sinh',
            'icon'       => '👨‍🎓',
            'module_key' => 'students',
        ),
        array(
            'key'        => 'schedule',
            'label'      => 'Thời khoá biểu',
            'icon'       => '📅',
            'module_key' => 'scheduler',
        ),
        array(
            'key'        => 'tuition',
            'label'      => 'Học phí',
            'icon'       => '💰',
            'module_key' => 'tuition',
        ),
        array(
            'key'        => 'grades',
            'label'      => 'Điểm số',
            'icon'       => '📝',
            'module_key' => null, // Hiện cho teacher/admin, ẩn cho assistant (chưa có module_key riêng)
        ),
    );

    // Admin tab (chỉ admin)
    if ( 'hinteach_admin' === $role ) {
        $all_tabs[] = array(
            'key'        => 'admin',
            'label'      => 'Quản trị',
            'icon'       => '⚙️',
            'module_key' => null,
        );
    }

    // Filter theo role
    if ( 'hinteach_assistant' === $role ) {
        $filtered = array();
        foreach ( $all_tabs as $tab ) {
            // Tab không có module_key → ẩn với assistant
            if ( null === $tab['module_key'] ) {
                continue;
            }
            // Chỉ hiện nếu module được bật
            if ( ! empty( $assistant_permissions[ $tab['module_key'] ] ) ) {
                $filtered[] = $tab;
            }
        }
        return $filtered;
    }

    // Admin/Teacher → hiện tất cả (trừ admin tab đã filter ở trên)
    if ( 'hinteach_teacher' === $role ) {
        // Bỏ tab admin
        return array_filter( $all_tabs, function( $tab ) {
            return 'admin' !== $tab['key'];
        } );
    }

    return $all_tabs;
}

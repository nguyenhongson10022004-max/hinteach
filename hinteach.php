<?php
/**
 * Plugin Name: HinTeach
 * Plugin URI:  https://hinteach.com
 * Description: Nền tảng quản lý lớp học cá nhân cho giáo viên — lớp học, học sinh, thời khoá biểu, học phí, điểm số.
 * Version:     0.1.0
 * Author:      HinTeach Team
 * Text Domain: hinteach
 * Requires PHP: 7.4
 *
 * @package HinTeach
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ══════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════

define( 'HINTEACH_VERSION',    '0.1.0' );
define( 'HINTEACH_PATH',       plugin_dir_path( __FILE__ ) );
define( 'HINTEACH_URL',        plugin_dir_url( __FILE__ ) );
define( 'HINTEACH_DB_VERSION', '1.0.0' );

// ══════════════════════════════════════════════════════════
// Activation / Deactivation
// ══════════════════════════════════════════════════════════

register_activation_hook( __FILE__, 'hinteach_activate' );
register_deactivation_hook( __FILE__, 'hinteach_deactivate' );

function hinteach_activate() {
    // Tạo/cập nhật bảng DB
    require_once HINTEACH_PATH . 'includes/db-schema.php';
    hinteach_create_tables();

    // Tạo roles
    require_once HINTEACH_PATH . 'includes/roles-capabilities.php';
    hinteach_create_roles();

    // Lưu DB version
    update_option( 'hinteach_db_version', HINTEACH_DB_VERSION );

    // Flush rewrite rules (cần cho shortcode page)
    flush_rewrite_rules();
}

function hinteach_deactivate() {
    // Tuỳ chọn: remove roles khi deactivate
    // Uncomment nếu muốn xoá roles khi tắt plugin:
    // require_once HINTEACH_PATH . 'includes/roles-capabilities.php';
    // hinteach_remove_roles();

    flush_rewrite_rules();
}

// ══════════════════════════════════════════════════════════
// Load includes
// ══════════════════════════════════════════════════════════

require_once HINTEACH_PATH . 'includes/roles-capabilities.php';
require_once HINTEACH_PATH . 'includes/shortcodes.php';
require_once HINTEACH_PATH . 'includes/ajax-classes.php';
require_once HINTEACH_PATH . 'includes/ajax-students.php';
require_once HINTEACH_PATH . 'includes/helpers/file-parser.php';

// ══════════════════════════════════════════════════════════
// Enqueue assets — CHỈ trên trang có shortcode [hinteach_dashboard]
// ══════════════════════════════════════════════════════════

add_action( 'wp_enqueue_scripts', 'hinteach_enqueue_assets' );

function hinteach_enqueue_assets() {
    // Chỉ enqueue trên trang có shortcode
    global $post;
    if ( ! $post || ! has_shortcode( $post->post_content ?? '', 'hinteach_dashboard' ) ) {
        return;
    }

    // CSS
    $css_path = HINTEACH_PATH . 'assets/style.css';
    $css_url  = HINTEACH_URL . 'assets/style.css';
    wp_enqueue_style(
        'hinteach-dashboard',
        $css_url,
        array(),
        file_exists( $css_path ) ? filemtime( $css_path ) : HINTEACH_VERSION
    );

    // JS — Core bundle (IIFE, chạy ngay)
    $core_path = HINTEACH_PATH . 'assets/dist/dashboard-core.js';
    $core_url  = HINTEACH_URL . 'assets/dist/dashboard-core.js';

    // Fallback: nếu chưa build, dùng file source trực tiếp
    if ( ! file_exists( $core_path ) ) {
        $core_path = HINTEACH_PATH . 'assets/dashboard-core.js';
        $core_url  = HINTEACH_URL . 'assets/dashboard-core.js';
    }

    wp_enqueue_script(
        'hinteach-core',
        $core_url,
        array(),
        file_exists( $core_path ) ? filemtime( $core_path ) : HINTEACH_VERSION,
        true  // in footer
    );

    // JS — Shell (IIFE, chạy ngay, phụ thuộc core)
    $shell_path = HINTEACH_PATH . 'assets/dist/dashboard-shell.js';
    $shell_url  = HINTEACH_URL . 'assets/dist/dashboard-shell.js';

    if ( ! file_exists( $shell_path ) ) {
        $shell_path = HINTEACH_PATH . 'assets/dashboard-shell.js';
        $shell_url  = HINTEACH_URL . 'assets/dashboard-shell.js';
    }

    wp_enqueue_script(
        'hinteach-shell',
        $shell_url,
        array( 'hinteach-core' ),
        file_exists( $shell_path ) ? filemtime( $shell_path ) : HINTEACH_VERSION,
        true
    );

    // Module JS sẽ được lazy-load bằng import() — KHÔNG enqueue ở đây
}

// ══════════════════════════════════════════════════════════
// Dọn hook WP thừa trên trang dashboard — giảm request/script không cần
// ══════════════════════════════════════════════════════════

add_action( 'wp_head', 'hinteach_cleanup_wp_head', 1 );

function hinteach_cleanup_wp_head() {
    global $post;
    if ( ! $post || ! has_shortcode( $post->post_content ?? '', 'hinteach_dashboard' ) ) {
        return;
    }

    remove_action( 'wp_head', 'wp_generator' );
    remove_action( 'wp_head', 'rsd_link' );
    remove_action( 'wp_head', 'wlwmanifest_link' );
    remove_action( 'wp_head', 'wp_shortlink_wp_head' );
    remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
    remove_action( 'wp_print_styles', 'print_emoji_styles' );
    remove_action( 'wp_head', 'wp_oembed_add_discovery_links' );
    remove_action( 'wp_head', 'rest_output_link_wp_head' );
}

// ══════════════════════════════════════════════════════════
// DB version check — auto upgrade nếu cần
// ══════════════════════════════════════════════════════════

add_action( 'plugins_loaded', 'hinteach_check_db_version' );

function hinteach_check_db_version() {
    $installed_version = get_option( 'hinteach_db_version', '0' );

    if ( version_compare( $installed_version, HINTEACH_DB_VERSION, '<' ) ) {
        require_once HINTEACH_PATH . 'includes/db-schema.php';
        hinteach_create_tables();
        update_option( 'hinteach_db_version', HINTEACH_DB_VERSION );
    }
}

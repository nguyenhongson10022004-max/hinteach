/**
 * HinTeach — Dashboard Shell
 *
 * Render sidebar, topbar, bind tab navigation, responsive menu toggle.
 * Phụ thuộc: dashboard-core.js (HT namespace phải đã sẵn sàng).
 *
 * @package HinTeach
 */

( function() {
    'use strict';

    document.addEventListener( 'DOMContentLoaded', () => {
        initSidebar();
        initTopbar();
        navigateToDefaultTab();
    } );

    // ══════════════════════════════════════════════════════════
    // Sidebar — tab navigation
    // ══════════════════════════════════════════════════════════

    function initSidebar() {
        const nav = document.getElementById( 'ht-sidebar-nav' );
        if ( ! nav ) return;

        // Click tab → navigate
        nav.addEventListener( 'click', ( e ) => {
            const btn = e.target.closest( '.ht-sidebar__tab' );
            if ( ! btn ) return;

            const tabName = btn.dataset.tab;
            if ( tabName ) {
                HT.router.navigate( tabName );
            }

            // Đóng sidebar trên mobile
            document.getElementById( 'ht-sidebar' )?.classList.remove( 'ht-sidebar--open' );
        } );

        // Lắng nghe sự kiện tab change để highlight active
        HT.events.on( 'tab:change', ( { tab } ) => {
            nav.querySelectorAll( '.ht-sidebar__tab' ).forEach( btn => {
                btn.classList.toggle( 'ht-sidebar__tab--active', btn.dataset.tab === tab );
            } );
        } );
    }

    // ══════════════════════════════════════════════════════════
    // Topbar — menu toggle (responsive)
    // ══════════════════════════════════════════════════════════

    function initTopbar() {
        const menuToggle = document.getElementById( 'ht-menu-toggle' );
        const sidebar    = document.getElementById( 'ht-sidebar' );

        if ( menuToggle && sidebar ) {
            menuToggle.addEventListener( 'click', () => {
                sidebar.classList.toggle( 'ht-sidebar--open' );
            } );
        }
    }

    // ══════════════════════════════════════════════════════════
    // Default tab — navigate tới tab đầu tiên
    // ══════════════════════════════════════════════════════════

    function navigateToDefaultTab() {
        const firstTab = document.querySelector( '.ht-sidebar__tab' );
        if ( firstTab ) {
            const tabName = firstTab.dataset.tab;
            if ( tabName ) {
                HT.router.navigate( tabName );
            }
        }
    }

} )();

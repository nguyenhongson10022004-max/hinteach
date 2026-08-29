/**
 * HinTeach — Dashboard Core
 *
 * Namespace HT: API client, state, router, events, modal, utils.
 * KHÔNG gọi fetch() trực tiếp ở module — luôn qua HT.api.call().
 *
 * @package HinTeach
 */

( function() {
    'use strict';

    // ══════════════════════════════════════════════════════════
    // Namespace chính
    // ══════════════════════════════════════════════════════════

    const config = window.HT_Config || {};

    window.HT = {
        config: config,

        // ──────────────────────────────────────────────────────
        // State toàn cục
        // ──────────────────────────────────────────────────────
        state: {
            currentUser:          config.currentUser || {},
            currentRole:          config.currentRole || '',
            teacherId:            config.teacherId || null,
            activeTab:            null,
            assistantPermissions: config.assistantPermissions || {},
            cache:                {},  // Tránh gọi AJAX trùng lặp trong 1 lần render
        },

        // ──────────────────────────────────────────────────────
        // API Client — wrapper fetch tới admin-ajax.php
        // ──────────────────────────────────────────────────────
        api: {
            /**
             * Gọi AJAX endpoint.
             *
             * @param {string} action   Tên wp_ajax action (VD: 'hinteach_class_list')
             * @param {Object} payload  Dữ liệu gửi kèm
             * @param {string} method   'POST' | 'GET' (default: 'POST')
             * @returns {Promise<Object>} Response data
             */
            async call( action, payload = {}, method = 'POST' ) {
                const url = config.ajaxUrl;
                if ( ! url ) {
                    throw new Error( 'HT: ajaxUrl chưa được cấu hình.' );
                }

                let response;

                if ( method === 'GET' ) {
                    const params = new URLSearchParams( {
                        action: action,
                        nonce:  config.nonce,
                        ...payload,
                    } );
                    response = await fetch( `${url}?${params.toString()}`, {
                        method: 'GET',
                        credentials: 'same-origin',
                    } );
                } else {
                    const formData = new FormData();
                    formData.append( 'action', action );
                    formData.append( 'nonce', config.nonce );

                    for ( const [ key, value ] of Object.entries( payload ) ) {
                        if ( value instanceof File ) {
                            formData.append( key, value );
                        } else if ( Array.isArray( value ) ) {
                            value.forEach( ( v, i ) => {
                                formData.append( `${key}[${i}]`, v );
                            } );
                        } else if ( value !== null && value !== undefined ) {
                            formData.append( key, value );
                        }
                    }

                    response = await fetch( url, {
                        method: 'POST',
                        credentials: 'same-origin',
                        body: formData,
                    } );
                }

                if ( ! response.ok ) {
                    // Cố đọc JSON body để lấy data từ wp_send_json_error()
                    let serverMsg  = '';
                    let serverData = null;
                    try {
                        const errJson = await response.json();
                        serverData = errJson?.data || null;
                        serverMsg  = ( typeof serverData === 'object' && serverData !== null )
                            ? ( serverData.message || '' )
                            : String( serverData || '' );
                    } catch ( _parseErr ) {
                        // Response không phải JSON — bỏ qua
                    }
                    const err    = new Error( serverMsg || `HTTP ${response.status}: ${response.statusText}` );
                    err.status     = response.status;
                    err.serverData = serverData;
                    throw err;
                }

                const json = await response.json();

                if ( ! json.success ) {
                    const msg = json.data?.message || json.data || 'Có lỗi xảy ra.';
                    const err    = new Error( msg );
                    err.serverData = json.data || null;
                    throw err;
                }

                return json.data;
            },

            /**
             * Gọi AJAX với cache tạm (tránh gọi trùng trong 1 lần render tab).
             * Cache bị xoá khi chuyển tab.
             */
            async cachedCall( action, payload = {}, method = 'GET' ) {
                const cacheKey = action + ':' + JSON.stringify( payload );
                if ( HT.state.cache[ cacheKey ] ) {
                    return HT.state.cache[ cacheKey ];
                }

                const data = await this.call( action, payload, method );
                HT.state.cache[ cacheKey ] = data;
                return data;
            },
        },

        // ──────────────────────────────────────────────────────
        // Event Bus — pub/sub đơn giản
        // ──────────────────────────────────────────────────────
        events: {
            _listeners: {},

            on( event, callback ) {
                if ( ! this._listeners[ event ] ) {
                    this._listeners[ event ] = [];
                }
                this._listeners[ event ].push( callback );
            },

            off( event, callback ) {
                if ( ! this._listeners[ event ] ) return;
                this._listeners[ event ] = this._listeners[ event ].filter( fn => fn !== callback );
            },

            emit( event, data ) {
                if ( ! this._listeners[ event ] ) return;
                this._listeners[ event ].forEach( fn => {
                    try { fn( data ); } catch ( e ) { console.error( `HT.events error [${event}]:`, e ); }
                } );
            },
        },

        // ──────────────────────────────────────────────────────
        // Router — chuyển tab, lazy-load module
        // ──────────────────────────────────────────────────────
        router: {
            _modules: {},  // Đã load: { tabName: moduleInstance }

            /**
             * Chuyển tới tab.
             * Lazy-load module JS nếu chưa load.
             */
            async navigate( tabName ) {
                if ( HT.state.activeTab === tabName ) return;

                // Xoá cache cũ khi chuyển tab
                HT.state.cache = {};

                const prevTab = HT.state.activeTab;
                HT.state.activeTab = tabName;

                // Update UI sidebar
                HT.events.emit( 'tab:change', { tab: tabName, prevTab } );

                // Show loading
                const content = document.getElementById( 'ht-content' );
                if ( content ) {
                    content.innerHTML = '<div class="ht-content__loading"><div class="ht-spinner"></div><p>Đang tải...</p></div>';
                }

                try {
                    // Lazy-load module nếu chưa có
                    if ( ! this._modules[ tabName ] ) {
                        const moduleUrl = `${config.moduleBaseUrl}${tabName}.min.js`;
                        const module = await import( /* webpackIgnore: true */ moduleUrl );
                        this._modules[ tabName ] = module.default || module;
                    }

                    // Gọi hàm render của module
                    const mod = this._modules[ tabName ];
                    if ( mod && typeof mod.render === 'function' ) {
                        await mod.render( content );
                    } else {
                        content.innerHTML = `<div class="ht-placeholder"><p>Module "${tabName}" chưa được xây dựng.</p></div>`;
                    }
                } catch ( err ) {
                    console.error( `HT.router: Lỗi load module "${tabName}":`, err );
                    if ( content ) {
                        content.innerHTML = `<div class="ht-error"><p>Không thể tải module. Vui lòng thử lại.</p><p class="ht-error__detail">${err.message}</p></div>`;
                    }
                }
            },
        },

        // ──────────────────────────────────────────────────────
        // Modal system
        // ──────────────────────────────────────────────────────
        modal: {
            /**
             * Mở modal với nội dung.
             *
             * @param {Object} opts  { title, body (HTML string), footer (HTML string), onClose }
             */
            open( opts = {} ) {
                const overlay = document.getElementById( 'ht-modal-overlay' );
                const title   = document.getElementById( 'ht-modal-title' );
                const body    = document.getElementById( 'ht-modal-body' );
                const footer  = document.getElementById( 'ht-modal-footer' );

                if ( title )   title.textContent = opts.title || '';
                if ( body )    body.innerHTML     = opts.body || '';
                if ( footer )  footer.innerHTML   = opts.footer || '';
                if ( overlay ) overlay.style.display = 'flex';

                this._onClose = opts.onClose || null;

                // Prevent body scroll
                document.body.classList.add( 'ht-modal-open' );
            },

            close() {
                const overlay = document.getElementById( 'ht-modal-overlay' );
                if ( overlay ) overlay.style.display = 'none';

                document.body.classList.remove( 'ht-modal-open' );

                if ( this._onClose ) {
                    this._onClose();
                    this._onClose = null;
                }
            },

            /**
             * Confirm dialog tiện lợi.
             *
             * @param {string} message
             * @returns {Promise<boolean>}
             */
            confirm( message ) {
                return new Promise( ( resolve ) => {
                    let resolved = false;

                    this.open( {
                        title: 'Xác nhận',
                        body: `<p>${message}</p>`,
                        footer: `
                            <button type="button" class="ht-btn ht-btn--secondary" id="ht-confirm-cancel">Huỷ</button>
                            <button type="button" class="ht-btn ht-btn--danger" id="ht-confirm-ok">Xác nhận</button>
                        `,
                        onClose: () => {
                            if ( resolved ) return;
                            resolved = true;
                            resolve( false );
                        },
                    } );

                    document.getElementById( 'ht-confirm-ok' )?.addEventListener( 'click', () => {
                        resolved = true;
                        this.close();
                        resolve( true );
                    } );
                    document.getElementById( 'ht-confirm-cancel' )?.addEventListener( 'click', () => {
                        resolved = true;
                        this.close();
                        resolve( false );
                    } );
                } );
            },
        },

        // ──────────────────────────────────────────────────────
        // Utilities
        // ──────────────────────────────────────────────────────
        utils: {
            /**
             * Format số tiền VND.
             */
            formatCurrency( amount ) {
                return new Intl.NumberFormat( 'vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                    maximumFractionDigits: 0,
                } ).format( amount || 0 );
            },

            /**
             * Format ngày dd/mm/yyyy.
             */
            formatDate( dateStr ) {
                if ( ! dateStr ) return '';
                const d = new Date( dateStr );
                if ( isNaN( d ) ) return dateStr;
                return d.toLocaleDateString( 'vi-VN' );
            },

            /**
             * Escape HTML.
             */
            escapeHtml( str ) {
                const div = document.createElement( 'div' );
                div.textContent = str || '';
                return div.innerHTML;
            },

            /**
             * Hiện thông báo toast.
             */
            toast( message, type = 'success' ) {
                const container = document.getElementById( 'ht-toast-container' ) || this._createToastContainer();
                const toast = document.createElement( 'div' );
                toast.className = `ht-toast ht-toast--${type}`;
                toast.textContent = message;
                container.appendChild( toast );

                setTimeout( () => {
                    toast.classList.add( 'ht-toast--fade-out' );
                    setTimeout( () => toast.remove(), 300 );
                }, 3000 );
            },

            _createToastContainer() {
                const container = document.createElement( 'div' );
                container.id = 'ht-toast-container';
                container.className = 'ht-toast-container';
                document.body.appendChild( container );
                return container;
            },
        },
    };

    // ══════════════════════════════════════════════════════════
    // Init — bind sự kiện modal close
    // ══════════════════════════════════════════════════════════

    document.addEventListener( 'DOMContentLoaded', () => {
        // Modal close button
        document.getElementById( 'ht-modal-close' )?.addEventListener( 'click', () => HT.modal.close() );

        // Click overlay → close
        document.getElementById( 'ht-modal-overlay' )?.addEventListener( 'click', ( e ) => {
            if ( e.target.id === 'ht-modal-overlay' ) {
                HT.modal.close();
            }
        } );

        // ESC → close modal
        document.addEventListener( 'keydown', ( e ) => {
            if ( e.key === 'Escape' ) {
                HT.modal.close();
            }
        } );
    } );

} )();

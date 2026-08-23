<?php
/**
 * HinTeach — File Import Helper
 *
 * Parse file Excel (.xlsx), CSV, Word (.docx — bảng) thành mảng associative.
 * Giới hạn: 10MB, 500 dòng.
 * Báo lỗi rõ từng dòng thiếu dữ liệu bắt buộc — KHÔNG import 1 phần rồi im lặng bỏ qua.
 *
 * Thư viện: PhpSpreadsheet (xlsx/csv), PhpOffice\PhpWord (docx).
 * Cần cài qua Composer: composer require phpoffice/phpspreadsheet phpoffice/phpword
 *
 * @package HinTeach
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Parse file upload thành mảng dữ liệu.
 *
 * @param string $file_path        Đường dẫn file tạm (tmp_name từ $_FILES)
 * @param array  $expected_columns Danh sách cột BẮT BUỘC (lowercase, trim)
 * @return array|WP_Error
 *   Thành công: ['rows' => [...], 'errors' => [...], 'columns' => [...]]
 *   Lỗi: WP_Error
 */
function hinteach_parse_uploaded_table( $file_path, $expected_columns = array() ) {
    // Validate file tồn tại
    if ( ! file_exists( $file_path ) || ! is_readable( $file_path ) ) {
        return new WP_Error( 'file_not_found', 'File không tồn tại hoặc không thể đọc.' );
    }

    // Validate file size: 10MB
    $file_size = filesize( $file_path );
    if ( $file_size > 10 * 1024 * 1024 ) {
        return new WP_Error( 'file_too_large', 'File quá lớn. Giới hạn 10MB.' );
    }

    // Detect file type bằng extension từ original name (truyền qua $_FILES hoặc context)
    // Trong context này, caller đã validate extension trước khi gọi.
    // Ta detect lại bằng mime/magic bytes
    $finfo = new finfo( FILEINFO_MIME_TYPE );
    $mime  = $finfo->file( $file_path );

    $rows    = array();
    $errors  = array();
    $columns = array();

    // ── XLSX ──
    if ( in_array( $mime, array(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',  // xlsx is a zip
    ), true ) ) {
        $result = hinteach_parse_xlsx( $file_path );
    }
    // ── CSV ──
    elseif ( in_array( $mime, array( 'text/csv', 'text/plain', 'application/csv' ), true ) ) {
        $result = hinteach_parse_csv( $file_path );
    }
    // ── DOCX ──
    elseif ( in_array( $mime, array(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ), true ) ) {
        $result = hinteach_parse_docx( $file_path );
    }
    else {
        return new WP_Error( 'unsupported_type', 'Định dạng file không hỗ trợ. Chấp nhận: xlsx, csv, docx.' );
    }

    if ( is_wp_error( $result ) ) {
        return $result;
    }

    $rows    = $result['rows'];
    $columns = $result['columns'];

    // Validate số dòng
    if ( count( $rows ) > 500 ) {
        return new WP_Error( 'too_many_rows', 'File có ' . count( $rows ) . ' dòng, vượt giới hạn 500 dòng/lần.' );
    }

    if ( empty( $rows ) ) {
        return new WP_Error( 'empty_file', 'File không có dữ liệu.' );
    }

    // Validate cột bắt buộc
    $missing_columns = array();
    foreach ( $expected_columns as $col ) {
        $col_lower = strtolower( trim( $col ) );
        if ( ! in_array( $col_lower, $columns, true ) ) {
            $missing_columns[] = $col;
        }
    }

    if ( ! empty( $missing_columns ) ) {
        return new WP_Error(
            'missing_columns',
            'Thiếu cột bắt buộc: ' . implode( ', ', $missing_columns ) . '. Dòng đầu tiên phải là tên cột.'
        );
    }

    // Validate từng dòng: check cột bắt buộc không trống
    foreach ( $rows as $index => &$row ) {
        foreach ( $expected_columns as $col ) {
            $col_lower = strtolower( trim( $col ) );
            if ( empty( $row[ $col_lower ] ) || '' === trim( $row[ $col_lower ] ) ) {
                $errors[] = array(
                    'row'     => $index + 2,  // +2: dòng 1 = header, index 0-based
                    'column'  => $col,
                    'message' => "Cột '{$col}' bị trống.",
                );
            }
        }
    }
    unset( $row );

    return array(
        'rows'    => $rows,
        'errors'  => $errors,
        'columns' => $columns,
    );
}

// ──────────────────────────────────────────────────────────────
// Parser: XLSX (PhpSpreadsheet)
// ──────────────────────────────────────────────────────────────

function hinteach_parse_xlsx( $file_path ) {
    // Check if PhpSpreadsheet is available
    if ( ! class_exists( '\PhpOffice\PhpSpreadsheet\IOFactory' ) ) {
        // Try loading from plugin's vendor
        $autoload = HINTEACH_PATH . 'vendor/autoload.php';
        if ( file_exists( $autoload ) ) {
            require_once $autoload;
        } else {
            return new WP_Error( 'dependency_missing', 'Thư viện PhpSpreadsheet chưa được cài đặt. Chạy: composer require phpoffice/phpspreadsheet' );
        }
    }

    try {
        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load( $file_path );
        $worksheet   = $spreadsheet->getActiveSheet();
        $data        = $worksheet->toArray();

        if ( empty( $data ) || count( $data ) < 2 ) {
            return new WP_Error( 'empty_file', 'File không có dữ liệu (cần ít nhất 1 dòng header + 1 dòng data).' );
        }

        // Dòng đầu = header
        $headers = array_map( function( $h ) {
            return strtolower( trim( (string) $h ) );
        }, $data[0] );

        $rows = array();
        for ( $i = 1; $i < count( $data ); $i++ ) {
            $row = array();
            foreach ( $headers as $colIndex => $header ) {
                if ( empty( $header ) ) continue;
                $row[ $header ] = isset( $data[ $i ][ $colIndex ] ) ? trim( (string) $data[ $i ][ $colIndex ] ) : '';
            }
            // Skip dòng hoàn toàn trống
            if ( ! empty( array_filter( $row ) ) ) {
                $rows[] = $row;
            }
        }

        return array( 'rows' => $rows, 'columns' => array_filter( $headers ) );

    } catch ( \Exception $e ) {
        return new WP_Error( 'parse_error', 'Lỗi đọc file Excel: ' . $e->getMessage() );
    }
}

// ──────────────────────────────────────────────────────────────
// Parser: CSV
// ──────────────────────────────────────────────────────────────

function hinteach_parse_csv( $file_path ) {
    $handle = fopen( $file_path, 'r' );
    if ( ! $handle ) {
        return new WP_Error( 'file_open_error', 'Không thể mở file CSV.' );
    }

    // Detect BOM UTF-8
    $bom = fread( $handle, 3 );
    if ( $bom !== "\xEF\xBB\xBF" ) {
        rewind( $handle );
    }

    // Đọc header
    $header_row = fgetcsv( $handle );
    if ( ! $header_row ) {
        fclose( $handle );
        return new WP_Error( 'empty_file', 'File CSV trống.' );
    }

    $headers = array_map( function( $h ) {
        return strtolower( trim( (string) $h ) );
    }, $header_row );

    $rows = array();
    $line = 1;
    while ( ( $data = fgetcsv( $handle ) ) !== false ) {
        $line++;
        $row = array();
        foreach ( $headers as $colIndex => $header ) {
            if ( empty( $header ) ) continue;
            $row[ $header ] = isset( $data[ $colIndex ] ) ? trim( (string) $data[ $colIndex ] ) : '';
        }
        if ( ! empty( array_filter( $row ) ) ) {
            $rows[] = $row;
        }
    }

    fclose( $handle );

    if ( empty( $rows ) ) {
        return new WP_Error( 'empty_file', 'File CSV không có dữ liệu.' );
    }

    return array( 'rows' => $rows, 'columns' => array_filter( $headers ) );
}

// ──────────────────────────────────────────────────────────────
// Parser: DOCX (PhpWord — đọc bảng)
// ──────────────────────────────────────────────────────────────

function hinteach_parse_docx( $file_path ) {
    if ( ! class_exists( '\PhpOffice\PhpWord\IOFactory' ) ) {
        $autoload = HINTEACH_PATH . 'vendor/autoload.php';
        if ( file_exists( $autoload ) ) {
            require_once $autoload;
        } else {
            return new WP_Error( 'dependency_missing', 'Thư viện PhpWord chưa được cài đặt. Chạy: composer require phpoffice/phpword' );
        }
    }

    try {
        $phpWord  = \PhpOffice\PhpWord\IOFactory::load( $file_path );
        $all_rows = array();

        // Tìm bảng đầu tiên trong document
        foreach ( $phpWord->getSections() as $section ) {
            foreach ( $section->getElements() as $element ) {
                if ( $element instanceof \PhpOffice\PhpWord\Element\Table ) {
                    $table_rows = $element->getRows();
                    foreach ( $table_rows as $tableRow ) {
                        $cells    = $tableRow->getCells();
                        $row_data = array();
                        foreach ( $cells as $cell ) {
                            $cell_text = '';
                            foreach ( $cell->getElements() as $cellElement ) {
                                if ( method_exists( $cellElement, 'getText' ) ) {
                                    $cell_text .= $cellElement->getText();
                                }
                            }
                            $row_data[] = trim( $cell_text );
                        }
                        $all_rows[] = $row_data;
                    }
                    break 2; // Chỉ lấy bảng đầu tiên
                }
            }
        }

        if ( count( $all_rows ) < 2 ) {
            return new WP_Error( 'empty_file', 'File Word không có bảng dữ liệu (cần bảng có ít nhất header + 1 dòng).' );
        }

        // Dòng đầu = header
        $headers = array_map( function( $h ) {
            return strtolower( trim( $h ) );
        }, $all_rows[0] );

        $rows = array();
        for ( $i = 1; $i < count( $all_rows ); $i++ ) {
            $row = array();
            foreach ( $headers as $colIndex => $header ) {
                if ( empty( $header ) ) continue;
                $row[ $header ] = isset( $all_rows[ $i ][ $colIndex ] ) ? trim( $all_rows[ $i ][ $colIndex ] ) : '';
            }
            if ( ! empty( array_filter( $row ) ) ) {
                $rows[] = $row;
            }
        }

        return array( 'rows' => $rows, 'columns' => array_filter( $headers ) );

    } catch ( \Exception $e ) {
        return new WP_Error( 'parse_error', 'Lỗi đọc file Word: ' . $e->getMessage() );
    }
}

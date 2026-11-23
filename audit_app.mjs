// ============================================================================
// TOOL: audit_app.mjs (Flashcard-3D Static & Domain Radar)
// NGUỒN GỐC: Bộ Công cụ Rà soát Lỗi Toàn Ứng dụng (Bước 1 — Tầng 1 & Tầng 2)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 07:28 (GMT+7)
// NHIỆM VỤ: Quét tĩnh toàn bộ mã nguồn src/ (85 files) bằng Node.js thuần
//           (0 dependencies) theo 9 luật đặc chủng của Flashcard-3D + tự động
//           tích hợp Oxlint (nếu có sẵn trong local), xuất báo cáo phân cấp
//           chi tiết ra tệp audit_report.md tại thư mục gốc dự án.
// CÁCH CHẠY: Đặt tệp này tại thư mục gốc dự án (cùng cấp package.json)
//            và chạy lệnh: node audit_app.mjs
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ============================================================================
// 1. CẤU HÌNH HỆ THỐNG & DANH MỤC CHUẨN (FLASHCARD-3D REGISTRY)
// ============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const REPORT_PATH = path.join(ROOT_DIR, 'audit_report.md');

const CLI_ARGS = new Set(process.argv.slice(2));
const SKIP_OXLINT = CLI_ARGS.has('--no-oxlint');

const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.vite',
  'coverage'
]);

const SEVERITY_ORDER = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  INFO: 3
};

const SEVERITY_BADGE = {
  CRITICAL: '🔴 CRITICAL',
  HIGH: '🟠 HIGH',
  MEDIUM: '🟡 MEDIUM',
  INFO: '⚪ INFO'
};

// Danh sách các tệp được phép thao tác dọn dẹp/di cư khóa hệ thống
const MASTER_STORAGE_WHITELIST = new Set([
  'src/utils/helpers.js',
  'src/hooks/useCoreState.js',
  'src/hooks/useDataIO.js'
]);

const VI_CLEANUP_WHITELIST = new Set([
  'src/hooks/useCoreState.js',
  'src/hooks/useDataIO.js',
  'src/services/db.js',
  'src/utils/helpers.js'
]);

// Danh mục khóa lưu trữ fc_* hợp lệ theo NewMapping.md v3.0
const CANONICAL_FC_KEYS = new Set([
  'fc_lang',
  'fc_ui_lang',
  'fc_data_mode',
  'fc_current_level_en',
  'fc_current_level_zh',
  'fc_current_topic_en',
  'fc_current_topic_zh',
  'fc_master_data_en_vocab',
  'fc_master_data_en_sentence',
  'fc_master_data_zh_vocab',
  'fc_master_data_zh_sentence',
  'fc_data_en',
  'fc_data_zh',
  'fc_apikey',
  'fc_apikey_pool',
  'fc_apikey_sheet',
  'fc_paid_apikey',
  'fc_ai_model',
  'fc_rpd_tracker',
  'fc_ai_config',
  'fc_settings',
  'fc_layout_align',
  'fc_game_sessions',
  'fc_active_exam_session',
  'fc_total_tokens',
  'fc_system_logs',
  'fc_ai_memory',
  'fc_ai_memory_en',
  'fc_ai_memory_zh',
  'fc_ai_chat_history',
  'fc_export_url',
  'fc_default_url',
  'fc_mock_delay',
  'fc_quiz_config',
  'fc_notebook_en',
  'fc_notebook_zh',
  'fc_mastered_en',
  'fc_mastered_zh',
  'fc_incorrect_list',
  'fc_incorrect_list_en',
  'fc_incorrect_list_zh',
  'fc_global_retry_bag',
  'fc_global_retry_bag_en',
  'fc_global_retry_bag_zh',
  'fc_ai_harvest_pool',
  'fc_exam_pool',
  'fc_exam_ratio',
  'fc_user_exam_history',
  'fc_custom_prompts'
]);

// ============================================================================
// 2. HÀM TIỆN ÍCH ĐỌC TỆP & PHÂN TÍCH MÃ NGUỒN AN TOÀN
// ============================================================================

const toPosixPath = (p) => p.split(path.sep).join('/');

/**
 * Quét đệ quy toàn bộ tệp mã nguồn trong thư mục mục tiêu
 */
function walkSourceFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SCAN_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Loại bỏ comment JS/JSX nhưng GIỮ NGUYÊN số dòng và bảo toàn chuỗi/URL (http://, https://)
 * giúp triệt tiêu 95% báo động giả do chú thích Tiếng Việt gây ra.
 */
function stripCommentsPreserveLines(code) {
  let out = '';
  let i = 0;
  const len = code.length;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inBlockComment = false;
  let inLineComment = false;

  while (i < len) {
    const ch = code[i];
    const next = i + 1 < len ? code[i + 1] : '';

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        out += '\n';
      } else {
        out += ' ';
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        out += '  ';
        i += 2;
      } else {
        out += ch === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }

    // Xử lý chuỗi nháy đơn / nháy kép / template literal
    if (inSingle) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '\n') inSingle = false;
      i++;
      continue;
    }

    if (inDouble) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === '"' || ch === '\n') inDouble = false;
      i++;
      continue;
    }

    if (inTemplate) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === '`') inTemplate = false;
      i++;
      continue;
    }

    // Bắt đầu chuỗi (chú ý tránh dấu nháy đơn tiếng Anh trong JSX text giữa các chữ cái)
    if (ch === "'") {
      const prev = i > 0 ? code[i - 1] : '';
      const isContraction = /[a-zA-Z]/.test(prev) && /[a-zA-Z]/.test(next);
      if (!isContraction) inSingle = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      out += ch;
      i++;
      continue;
    }

    // Bắt đầu block comment /* ... */
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      out += '  ';
      i += 2;
      continue;
    }

    // Bắt đầu line comment // ... (bỏ qua nếu là URL dạng http:// hoặc https://)
    if (ch === '/' && next === '/') {
      const prev = i > 0 ? code[i - 1] : '';
      if (prev !== ':') {
        inLineComment = true;
        out += '  ';
        i += 2;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Chuyển chỉ số ký tự (offset) sang số dòng 1-based
 */
function offsetToLine(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

/**
 * Trích xuất khối thân hàm nằm trong cặp dấu ngoặc nhọn { ... } cân bằng
 * bắt đầu từ vị trí dấu '{' đầu tiên.
 */
function extractBalancedBlock(code, openBraceIdx) {
  if (openBraceIdx < 0 || code[openBraceIdx] !== '{') return null;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;

  for (let i = openBraceIdx; i < code.length; i++) {
    const ch = code[i];
    const next = i + 1 < code.length ? code[i + 1] : '';

    if (inSingle) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === "'" || ch === '\n') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"' || ch === '\n') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '`') inTemplate = false;
      continue;
    }

    if (ch === "'") {
      const prev = i > 0 ? code[i - 1] : '';
      if (!(/[a-zA-Z]/.test(prev) && /[a-zA-Z]/.test(next))) inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return {
          start: openBraceIdx,
          end: i,
          body: code.slice(openBraceIdx, i + 1)
        };
      }
    }
  }
  return null;
}

/**
 * Lấy trích đoạn mã nguồn gọn đẹp của 1 dòng để in ra báo cáo
 */
function getLineSnippet(rawLines, lineNum) {
  const line = rawLines[lineNum - 1] || '';
  const trimmed = line.trim();
  return trimmed.length > 140 ? trimmed.slice(0, 137) + '...' : trimmed;
}

// ============================================================================
// 3. LẬP CHỈ MỤC EXPORTS TOÀN DỰ ÁN (PHỤC VỤ LUẬT 4: KIỂM TRA IMPORT/EXPORT)
// ============================================================================

/**
 * Kiểm tra tệp có tồn tại khớp chính xác chữ hoa/thường trên ổ đĩa (chống lỗi khi build Linux/CI)
 */
function existsExactCase(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const entries = fs.readdirSync(dir);
    return entries.includes(base);
  } catch {
    return true;
  }
}

/**
 * Giải quyết đường dẫn import nội bộ (@/... hoặc ./ hoặc ../) sang đường dẫn tuyệt đối
 */
function resolveLocalImport(fromFile, specifier) {
  let basePath = null;
  if (specifier.startsWith('@/')) {
    basePath = path.join(SRC_DIR, specifier.slice(2));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    basePath = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return { isLocal: false };
  }

  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.json`,
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.jsx'),
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx')
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      const exactCase = existsExactCase(cand);
      return {
        isLocal: true,
        resolved: cand,
        exactCase
      };
    }
  }

  return { isLocal: true, resolved: null, exactCase: false };
}

/**
 * Trích xuất toàn bộ tên symbol được export của 1 tệp nguồn
 */
function parseExportsOfFile(cleanCode) {
  const named = new Set();
  let hasDefault = false;
  let hasStarExport = false;

  if (/\bexport\s+default\b/.test(cleanCode)) {
    hasDefault = true;
  }
  if (/\bexport\s*\*\s*from\b/.test(cleanCode)) {
    hasStarExport = true;
  }

  // export const/let/var/function/class Name
  const declRegex =
    /\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = declRegex.exec(cleanCode)) !== null) {
    named.add(m[1]);
  }

  // export const { a, b: c } = ...
  const destructRegex = /\bexport\s+(?:const|let|var)\s*\{([^}]+)\}\s*=/g;
  while ((m = destructRegex.exec(cleanCode)) !== null) {
    const parts = m[1].split(',');
    for (const part of parts) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const aliasMatch = cleaned.match(/:\s*([A-Za-z_$][\w$]*)/);
      const nameMatch = cleaned.match(/^([A-Za-z_$][\w$]*)/);
      if (aliasMatch) named.add(aliasMatch[1]);
      else if (nameMatch) named.add(nameMatch[1]);
    }
  }

  // export { A, B as C } (kể cả re-export from '...')
  const braceExportRegex = /\bexport\s*\{([^}]+)\}/g;
  while ((m = braceExportRegex.exec(cleanCode)) !== null) {
    const parts = m[1].split(',');
    for (const part of parts) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const asMatch = cleaned.match(
        /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/
      );
      if (asMatch) {
        if (asMatch[2] === 'default') hasDefault = true;
        else named.add(asMatch[2]);
      } else {
        const plain = cleaned.match(/^([A-Za-z_$][\w$]*)$/);
        if (plain) named.add(plain[1]);
      }
    }
  }

  return { named, hasDefault, hasStarExport };
}

// ============================================================================
// 4. BỘ 9 LUẬT RADAR ĐẶC CHỦNG CHO FLASHCARD-3D
// ============================================================================

function auditSingleFile(fileInfo, exportsIndex, allFcKeysMap, findings) {
  const { absPath, relPath, rawCode, rawLines, cleanCode, cleanLines } =
    fileInfo;

  const addFinding = (severity, ruleId, line, message, fixHint) => {
    findings.push({
      severity,
      ruleId,
      file: relPath,
      line,
      message,
      snippet: getLineSnippet(rawLines, line),
      fixHint
    });
  };

  // --------------------------------------------------------------------------
  // LUẬT 1 [CRITICAL]: Vi phạm Kiến trúc Kho Master Lai (fc_master_data_*)
  // --------------------------------------------------------------------------
  if (!MASTER_STORAGE_WHITELIST.has(relPath)) {
    const masterDirectRegex =
      /\blocalStorage\.(getItem|setItem)\s*\([^)]*fc_master_data_/g;
    let m;
    while ((m = masterDirectRegex.exec(cleanCode)) !== null) {
      const line = offsetToLine(cleanCode, m.index);
      addFinding(
        'CRITICAL',
        'R01_MASTER_LOCALSTORAGE',
        line,
        `Gọi trực tiếp localStorage.${m[1]}() với khóa fc_master_data_* (dữ liệu Master 9 Levels đã chuyển sang IndexedDB + RAM Mirror 0ms).`,
        'Đổi sang Utils.safeJsonParse(key, null) để đọc 0ms từ RAM Mirror, hoặc Utils.safeLocalStorageSet(key, data) / setMasterDataCache() để ghi.'
      );
    }
  }

  // --------------------------------------------------------------------------
  // LUẬT 2 [CRITICAL]: Bẫy Mảng Đa nhiệm (Multi-select Array Armor)
  // --------------------------------------------------------------------------
  const arrayPropRegex =
    /\b(currentLevel|currentTopic)\s*(?:\?\.)?\.(replace|split|trim|startsWith|endsWith|toLowerCase|toUpperCase|match|substring|substr)\s*\(/g;
  {
    let m;
    while ((m = arrayPropRegex.exec(cleanCode)) !== null) {
      const line = offsetToLine(cleanCode, m.index);
      const lineText = cleanLines[line - 1] || '';
      const prevLineText = cleanLines[line - 2] || '';
      const combinedCtx = prevLineText + ' ' + lineText;
      // Bỏ qua nếu đã được bọc kiểm tra kiểu string hoặc Array.isArray ngay tại chỗ
      const isGuarded =
        /typeof\s+[\w.]*(currentLevel|currentTopic)\s*===?\s*['"]string['"]/.test(
          combinedCtx
        ) ||
        /Array\.isArray\s*\([^)]*(currentLevel|currentTopic)/.test(
          combinedCtx
        ) ||
        /String\s*\([^)]*(currentLevel|currentTopic)/.test(lineText);

      if (!isGuarded) {
        addFinding(
          'CRITICAL',
          'R02_ARRAY_ARMOR_TRAP',
          line,
          `Gọi hàm chuỗi .${m[2]}() trực tiếp lên biến Mảng "${m[1]}" — sẽ gây crash TypeError khi người dùng chọn đa cấp độ/chủ đề.`,
          'Bọc qua getSafeLevelString() hoặc kiểm tra Array.isArray() trước khi xử lý chuỗi.'
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // LUẬT 3 [CRITICAL]: Bẫy React 18 StrictMode (Side-effect trong setState updater)
  // --------------------------------------------------------------------------
  const updaterRegex =
    /\bset[A-Z][\w$]*\s*\(\s*(?:\(\s*[\w$]+\s*\)|[\w$]+)\s*=>\s*\{/g;
  {
    let m;
    while ((m = updaterRegex.exec(cleanCode)) !== null) {
      const openBraceIdx = m.index + m[0].length - 1;
      const block = extractBalancedBlock(cleanCode, openBraceIdx);
      if (!block) continue;

      const sideEffectPatterns = [
        { regex: /\b(?:showToast|globalShowToast)\s*\(/, name: 'showToast()' },
        { regex: /\bFcDB\.(?:set|del|init)\s*\(/, name: 'FcDB.set/del()' },
        {
          regex: /\blocalStorage\.(?:setItem|removeItem)\s*\(/,
          name: 'localStorage.setItem/removeItem()'
        },
        {
          regex: /\bsafeLocalStorageSet\s*\(/,
          name: 'safeLocalStorageSet()'
        },
        { regex: /\bsetMasterDataCache\s*\(/, name: 'setMasterDataCache()' }
      ];

      const detected = [];
      for (const sp of sideEffectPatterns) {
        if (sp.regex.test(block.body)) detected.push(sp.name);
      }

      if (detected.length > 0) {
        const line = offsetToLine(cleanCode, m.index);
        addFinding(
          'CRITICAL',
          'R03_STRICTMODE_UPDATER_SIDEEFFECT',
          line,
          `Phát hiện side-effect (${detected.join(', ')}) nằm bên trong hàm updater của setState — vi phạm tính thuần khiết React 18 StrictMode (dễ ghi DB 2 lần hoặc bắn 2 Toast).`,
          'Tính toán mảng/object mới bên ngoài updater (hoặc lưu trong useEffect), sau đó mới gọi setState(nextVal) và thực thi DB/Toast tuần tự.'
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // LUẬT 4 [CRITICAL]: Kiểm tra Đường dẫn Import & Tên Named Export bị lệch
  // --------------------------------------------------------------------------
  const importRegex =
    /\bimport\s+(?!type\b)([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g;
  {
    let m;
    while ((m = importRegex.exec(cleanCode)) !== null) {
      const clause = (m[1] || '').trim();
      const specifier = m[2] || m[3] || '';
      const line = offsetToLine(cleanCode, m.index);

      if (!specifier) continue;
      // Bỏ qua import CSS/asset
      if (/\.(?:css|scss|less|svg|png|jpg|jpeg|gif|webp|ico)$/i.test(specifier)) {
        continue;
      }

      const resolvedInfo = resolveLocalImport(absPath, specifier);
      if (!resolvedInfo.isLocal) continue;

      if (!resolvedInfo.resolved) {
        addFinding(
          'CRITICAL',
          'R04_BROKEN_IMPORT',
          line,
          `Không tìm thấy tệp đích của import "${specifier}" — sẽ làm hỏng lệnh npm run build!`,
          'Kiểm tra lại đường dẫn tương đối hoặc alias @/ theo bản đồ NewMapping.md.'
        );
        continue;
      }

      if (!resolvedInfo.exactCase) {
        addFinding(
          'HIGH',
          'R04_IMPORT_CASE_MISMATCH',
          line,
          `Đường dẫn import "${specifier}" sai chữ hoa/thường so với tên tệp thật trên ổ đĩa (chạy được trên Windows nhưng sẽ vỡ khi deploy Linux/Vercel).`,
          'Sửa lại đường dẫn import cho khớp chính xác chữ hoa/thường.'
        );
      }

      // Kiểm tra các named imports { A, B as C }
      const targetExports = exportsIndex.get(resolvedInfo.resolved);
      if (targetExports && !targetExports.hasStarExport && clause) {
        const namedMatch = clause.match(/\{([\s\S]*?)\}/);
        if (namedMatch) {
          const items = namedMatch[1].split(',');
          for (const rawItem of items) {
            const item = rawItem.trim();
            if (!item) continue;
            const origName = item.split(/\s+as\s+/)[0].trim();
            if (
              origName &&
              origName !== 'default' &&
              !targetExports.named.has(origName)
            ) {
              const targetRel = toPosixPath(
                path.relative(ROOT_DIR, resolvedInfo.resolved)
              );
              addFinding(
                'CRITICAL',
                'R04_MISSING_NAMED_EXPORT',
                line,
                `Import named symbol "${origName}" không tồn tại trong "${targetRel}"!`,
                `Kiểm tra lại tên export trong ${targetRel} hoặc cập nhật lại câu lệnh import.`
              );
            }
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // LUẬT 5 [HIGH]: Gọi trần localStorage.setItem (Nguy cơ crash QuotaExceededError)
  // --------------------------------------------------------------------------
  if (relPath !== 'src/utils/helpers.js') {
    const rawLsSetRegex = /\blocalStorage\.setItem\s*\(/g;
    let m;
    while ((m = rawLsSetRegex.exec(cleanCode)) !== null) {
      const line = offsetToLine(cleanCode, m.index);
      // Kiểm tra sơ bộ xem 8 dòng phía trên có try { không
      const lookback = cleanLines
        .slice(Math.max(0, line - 9), line)
        .join('\n');
      const hasTryNearby = /\btry\s*\{/.test(lookback);
      addFinding(
        hasTryNearby ? 'MEDIUM' : 'HIGH',
        'R05_UNSAFE_LOCALSTORAGE_SET',
        line,
        hasTryNearby
          ? 'Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).'
          : 'Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.',
        'Thay thế bằng Utils.safeLocalStorageSet(key, value).'
      );
    }
  }

  // --------------------------------------------------------------------------
  // LUẬT 6 [HIGH]: Vết tích nhánh Tiếng Việt ('vi') cũ & Phụ thuộc window.* legacy
  // --------------------------------------------------------------------------
  if (!VI_CLEANUP_WHITELIST.has(relPath)) {
    const deprecatedViRegex =
      /\bvi_level_\d*|\bfc_(?:data|current_level|current_topic|master_data|notebook|mastered|incorrect_list|global_retry_bag|ai_memory)_vi\b|(?<![a-zA-Z0-9_])lang\s*===?\s*['"]vi['"]/g;
    let m;
    while ((m = deprecatedViRegex.exec(cleanCode)) !== null) {
      const line = offsetToLine(cleanCode, m.index);
      addFinding(
        'HIGH',
        'R06A_DEPRECATED_VI_BRANCH',
        line,
        `Còn sót vết tích ngôn ngữ học Tiếng Việt ('vi') đã khai tử: "${m[0]}".`,
        'Gỡ bỏ nhánh định tuyến ngôn ngữ học "vi" (chỉ giữ "en" và "zh"; lưu ý uiLang vẫn hỗ trợ "vi").'
      );
    }
  }

  // 6B: Quét phụ thuộc window.<CoreModule> trong kiến trúc ES Module Vite
  const legacyWindowModules = [
    'Utils',
    'FcDB',
    'ExamEngine',
    'ExamProfiles',
    'QueueEngine',
    'AiFactoryEngine',
    'IoeDataEngine',
    'GameAlgoEngine',
    'FallbackDataEngine',
    'STORAGE_KEYS',
    'CONFIG_SAMPLES',
    'DEFAULT_SHEETS',
    'UI_TEXT'
  ];
  const windowLegacyRegex = new RegExp(
    `\\bwindow\\.(${legacyWindowModules.join('|')})\\b(?!\\s*=)`,
    'g'
  );
  {
    let m;
    while ((m = windowLegacyRegex.exec(cleanCode)) !== null) {
      const line = offsetToLine(cleanCode, m.index);
      const lineText = cleanLines[line - 1] || '';
      // Bỏ qua các dòng fallback có điều kiện an toàn kiểu: FcDB || window.FcDB
      const isFallbackGuard =
        /\|\|\s*\(?\s*typeof\s+window/.test(lineText) ||
        /\?\s*window\./.test(lineText) ||
        /Object\.assign\s*\(\s*window\./.test(lineText);
      if (!isFallbackGuard) {
        addFinding(
          'MEDIUM',
          'R06B_LEGACY_WINDOW_GLOBAL',
          line,
          `Đọc trực tiếp biến toàn cục "window.${m[1]}" từ thời HTML 1 file thay vì import ES Module chuẩn.`,
          `Chuyển sang import { ${m[1]} } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.`
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // LUẬT 7 [HIGH]: Dùng hộp thoại chặn luồng trình duyệt alert() / confirm() / prompt()
  // --------------------------------------------------------------------------
  const nativeDialogRegex =
    /(?<![.\w$])(?:window\.)?(alert|confirm|prompt)\s*\(/g;
  {
    let m;
    while ((m = nativeDialogRegex.exec(cleanCode)) !== null) {
      const line = offsetToLine(cleanCode, m.index);
      const lineText = cleanLines[line - 1] || '';
      // Bỏ qua định nghĩa hàm tên confirm/prompt (VD: const confirm = (...) =>)
      if (/\bfunction\s+(alert|confirm|prompt)\s*\(/.test(lineText)) continue;
      addFinding(
        'HIGH',
        'R07_NATIVE_BLOCKING_DIALOG',
        line,
        `Sử dụng hộp thoại chặn luồng trình duyệt ${m[1]}() — gây đơ UI, không tương thích tốt với PWA/iOS và vi phạm quy chuẩn UX hiện đại.`,
        'Thay thế bằng cơ chế xác nhận 2 lần (resetPending + showToast) hoặc Modal xác nhận nội bộ.'
      );
    }
  }

  // --------------------------------------------------------------------------
  // LUẬT 8 [MEDIUM]: Rò rỉ Timer / EventListener trong useEffect thiếu cleanup
  // --------------------------------------------------------------------------
  const useEffectRegex = /\b(?:React\.)?useEffect\s*\(\s*\(\s*\)\s*=>\s*\{/g;
  {
    let m;
    while ((m = useEffectRegex.exec(cleanCode)) !== null) {
      const openBraceIdx = m.index + m[0].length - 1;
      const block = extractBalancedBlock(cleanCode, openBraceIdx);
      if (!block) continue;

      const hasInterval = /\bsetInterval\s*\(/.test(block.body);
      const hasListener = /\.addEventListener\s*\(/.test(block.body);
      if (!hasInterval && !hasListener) continue;

      const hasCleanupReturn = /\breturn\s*(?:\(\s*\)\s*=>|function\b)/.test(
        block.body
      );
      const hasClearInterval = /\bclearInterval\s*\(/.test(block.body);
      const hasRemoveListener = /\.removeEventListener\s*\(/.test(block.body);

      if (hasInterval && (!hasCleanupReturn || !hasClearInterval)) {
        const line = offsetToLine(cleanCode, m.index);
        addFinding(
          'MEDIUM',
          'R08_EFFECT_LEAK_INTERVAL',
          line,
          'useEffect tạo setInterval() nhưng thiếu hàm dọn dẹp return () => clearInterval(...) — nguy cơ rò rỉ RAM & chạy chồng chéo timer.',
          'Bổ sung return () => clearInterval(timerId) ở cuối useEffect.'
        );
      }

      if (hasListener && (!hasCleanupReturn || !hasRemoveListener)) {
        const line = offsetToLine(cleanCode, m.index);
        addFinding(
          'MEDIUM',
          'R08_EFFECT_LEAK_LISTENER',
          line,
          'useEffect gắn addEventListener() nhưng thiếu return () => removeEventListener(...) — nguy cơ rò rỉ bộ nhớ & kích hoạt sự kiện nhiều lần.',
          'Bổ sung return () => target.removeEventListener(...) ở cuối useEffect.'
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // LUẬT 9 [INFO]: Thu thập toàn bộ khóa lưu trữ fc_* để kiểm kê & phát hiện Typo
  // --------------------------------------------------------------------------
  const fcKeyRegex = /['"`](fc_[a-z0-9_]+)(?:['"`]|\$\{)/g;
  {
    let m;
    while ((m = fcKeyRegex.exec(cleanCode)) !== null) {
      const keyName = m[1];
      const line = offsetToLine(cleanCode, m.index);
      if (!allFcKeysMap.has(keyName)) {
        allFcKeysMap.set(keyName, []);
      }
      allFcKeysMap.get(keyName).push({ file: relPath, line });
    }
  }
}

// ============================================================================
// 5. TÍCH HỢP CHẠY OXLINT (TẦNG 1) NẾU ĐÃ CÓ SẴN TRONG LOCAL
// ============================================================================

function runLocalOxlint() {
  if (SKIP_OXLINT) {
    return { status: 'skipped', output: 'Bỏ qua theo cờ --no-oxlint.' };
  }

  const binName = process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint';
  const localBin = path.join(ROOT_DIR, 'node_modules', '.bin', binName);

  if (!fs.existsSync(localBin)) {
    return {
      status: 'not_installed',
      output:
        'Chưa cài đặt oxlint trong node_modules (bỏ qua để không tải mạng tự động). Bạn có thể chạy riêng lệnh: npx oxlint --react-plugin --import-plugin src/'
    };
  }

  try {
    const res = spawnSync(
      localBin,
      ['--react-plugin', '--import-plugin', 'src'],
      {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        timeout: 30000,
        shell: process.platform === 'win32'
      }
    );

    const combined = [res.stdout || '', res.stderr || '']
      .filter(Boolean)
      .join('\n')
      .trim();

    return {
      status: res.status === 0 ? 'clean' : 'issues',
      exitCode: res.status,
      output: combined || '(Không có đầu ra)'
    };
  } catch (err) {
    return {
      status: 'error',
      output: `Không thể chạy oxlint: ${err?.message || err}`
    };
  }
}

// ============================================================================
// 6. TỔNG HỢP & XUẤT BÁO CÁO AUDIT_REPORT.MD
// ============================================================================

function formatTimestampVN() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} - ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function buildMarkdownReport({
  filesCount,
  durationMs,
  findings,
  allFcKeysMap,
  oxlintResult
}) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, INFO: 0 };
  const byRule = new Map();
  const byFile = new Map();

  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
    byRule.set(f.ruleId, (byRule.get(f.ruleId) || 0) + 1);
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }

  // Sắp xếp danh sách phát hiện theo Mức độ nghiêm trọng -> Tệp -> Số dòng
  const sortedFindings = [...findings].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) return fileDiff;
    return a.line - b.line;
  });

  // Top 10 tệp nhiều điểm cần xử lý nhất
  const hotspots = [...byFile.entries()]
    .map(([file, list]) => ({
      file,
      total: list.length,
      critical: list.filter((x) => x.severity === 'CRITICAL').length,
      high: list.filter((x) => x.severity === 'HIGH').length,
      medium: list.filter((x) => x.severity === 'MEDIUM').length
    }))
    .sort(
      (a, b) =>
        b.critical - a.critical || b.high - a.high || b.total - a.total
    )
    .slice(0, 15);

  // Lọc các khóa fc_* lạ (chưa có trong danh mục chuẩn NewMapping.md)
  const unknownFcKeys = [];
  for (const [keyName, locs] of allFcKeysMap.entries()) {
    // Bỏ qua tiền tố động kết thúc bằng '_' (VD: fc_data_, fc_notebook_)
    if (keyName.endsWith('_')) continue;
    if (!CANONICAL_FC_KEYS.has(keyName)) {
      unknownFcKeys.push({ keyName, locs });
    }
  }
  unknownFcKeys.sort((a, b) => a.keyName.localeCompare(b.keyName));

  const lines = [];
  lines.push('# BÁO CÁO RADAR RÀ SOÁT TOÀN ỨNG DỤNG FLASHCARD-3D');
  lines.push('');
  lines.push(`* **Thời điểm quét:** ${formatTimestampVN()}`);
  lines.push(`* **Phạm vi quét:** \`${filesCount}\` tệp mã nguồn trong \`src/\``);
  lines.push(`* **Thời gian thực thi:** \`${durationMs} ms\``);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. BẢNG TỔNG QUAN MỨC ĐỘ NGHIÊM TRỌNG');
  lines.push('');
  lines.push('| Mức độ | Số lượng phát hiện | Ý nghĩa |');
  lines.push('| :--- | :---: | :--- |');
  lines.push(
    `| 🔴 **CRITICAL** | **${counts.CRITICAL}** | Lỗi gãy build, crash Runtime, vi phạm Kho Master Lai hoặc StrictMode |`
  );
  lines.push(
    `| 🟠 **HIGH** | **${counts.HIGH}** | Rủi ro tràn Quota, nhánh \`vi\` cũ sót, hộp thoại \`alert/confirm\` chặn UI |`
  );
  lines.push(
    `| 🟡 **MEDIUM** | **${counts.MEDIUM}** | Rò rỉ Timer/Listener, phụ thuộc \`window.*\` legacy |`
  );
  lines.push(
    `| ⚪ **INFO** | **${counts.INFO}** | Thông tin đối chiếu kiểm kê |`
  );
  lines.push('');

  if (byRule.size > 0) {
    lines.push('### Thống kê theo Mã Luật Radar');
    lines.push('');
    lines.push('| Mã luật | Số lượng |');
    lines.push('| :--- | :---: |');
    for (const [ruleId, count] of [...byRule.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      lines.push(`| \`${ruleId}\` | ${count} |`);
    }
    lines.push('');
  }

  if (hotspots.length > 0) {
    lines.push('## 2. TOP ĐIỂM NÓNG (TỆP CẦN ƯU TIÊN XỬ LÝ TRƯỚC)');
    lines.push('');
    lines.push('| Tệp mã nguồn | 🔴 Critical | 🟠 High | 🟡 Medium | Tổng |');
    lines.push('| :--- | :---: | :---: | :---: | :---: |');
    for (const h of hotspots) {
      lines.push(
        `| \`${h.file}\` | ${h.critical} | ${h.high} | ${h.medium} | **${h.total}** |`
      );
    }
    lines.push('');
  }

  lines.push('## 3. CHI TIẾT PHÁT HIỆN THEO MỨC ĐỘ');
  lines.push('');

  if (sortedFindings.length === 0) {
    lines.push(
      '✅ **XUẤT SẮC!** Không phát hiện vi phạm nào trên toàn bộ 9 luật đặc chủng của Flashcard-3D.'
    );
    lines.push('');
  } else {
    for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'INFO']) {
      const group = sortedFindings.filter((f) => f.severity === sev);
      if (group.length === 0) continue;

      lines.push(`### ${SEVERITY_BADGE[sev]} (${group.length} mục)`);
      lines.push('');
      for (const item of group) {
        lines.push(
          `- **\`${item.file}:${item.line}\`** [\`${item.ruleId}\`] — ${item.message}`
        );
        if (item.snippet) {
          lines.push(`  - Code: \`${item.snippet.replace(/`/g, "'")}\``);
        }
        if (item.fixHint) {
          lines.push(`  - Gợi ý vá: ${item.fixHint}`);
        }
      }
      lines.push('');
    }
  }

  lines.push('## 4. KIỂM KÊ KHÓA LƯU TRỮ (`fc_*`) NGOÀI DANH MỤC CHUẨN');
  lines.push('');
  if (unknownFcKeys.length === 0) {
    lines.push(
      '✅ Toàn bộ các khóa lưu trữ tĩnh `fc_*` đều khớp với danh mục chuẩn trong `NewMapping.md`.'
    );
  } else {
    lines.push(
      'Các khóa dưới đây chưa có trong danh mục chuẩn `CANONICAL_FC_KEYS` (kiểm tra xem là khóa hợp lệ mới thêm hay gõ nhầm chính tả):'
    );
    lines.push('');
    lines.push('| Khóa `fc_*` | Số lần xuất hiện | Vị trí mẫu |');
    lines.push('| :--- | :---: | :--- |');
    for (const u of unknownFcKeys) {
      const sample = u.locs
        .slice(0, 3)
        .map((l) => `\`${l.file}:${l.line}\``)
        .join(', ');
      lines.push(`| \`${u.keyName}\` | ${u.locs.length} | ${sample} |`);
    }
  }
  lines.push('');

  lines.push('## 5. KẾT QUẢ QUÉT TĨNH OXLINT (TẦNG 1)');
  lines.push('');
  lines.push(`* **Trạng thái:** \`${oxlintResult.status}\``);
  lines.push('');
  lines.push('```text');
  lines.push(oxlintResult.output);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// 7. ĐIỂM KHỞI CHẠY CHÍNH (MAIN RUNNER)
// ============================================================================

function main() {
  const startTime = Date.now();

  if (!fs.existsSync(SRC_DIR)) {
    console.error(
      `❌ Không tìm thấy thư mục "src/" tại: ${ROOT_DIR}\nVui lòng đặt audit_app.mjs tại thư mục gốc dự án (cùng cấp package.json) và chạy lại.`
    );
    process.exit(1);
  }

  const allAbsFiles = walkSourceFiles(SRC_DIR).sort();
  const parsedFiles = [];
  const exportsIndex = new Map();

  // Pha 1: Đọc, làm sạch comment và lập chỉ mục Exports toàn dự án
  for (const absPath of allAbsFiles) {
    try {
      const rawCode = fs.readFileSync(absPath, 'utf8');
      const cleanCode = stripCommentsPreserveLines(rawCode);
      const relPath = toPosixPath(path.relative(ROOT_DIR, absPath));
      const fileInfo = {
        absPath,
        relPath,
        rawCode,
        rawLines: rawCode.split(/\r?\n/),
        cleanCode,
        cleanLines: cleanCode.split(/\r?\n/)
      };
      parsedFiles.push(fileInfo);
      exportsIndex.set(absPath, parseExportsOfFile(cleanCode));
    } catch (readErr) {
      console.warn(`⚠️ Không thể đọc tệp ${absPath}:`, readErr?.message);
    }
  }

  // Pha 2: Quét 9 luật đặc chủng trên từng tệp
  const findings = [];
  const allFcKeysMap = new Map();
  for (const fileInfo of parsedFiles) {
    auditSingleFile(fileInfo, exportsIndex, allFcKeysMap, findings);
  }

  // Pha 3: Tự động chạy Oxlint local (nếu đã cài sẵn)
  const oxlintResult = runLocalOxlint();

  const durationMs = Date.now() - startTime;
  const markdown = buildMarkdownReport({
    filesCount: parsedFiles.length,
    durationMs,
    findings,
    allFcKeysMap,
    oxlintResult
  });

  fs.writeFileSync(REPORT_PATH, markdown, 'utf8');

  // In tóm tắt trực quan ra Terminal VS Code
  const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
  const highCount = findings.filter((f) => f.severity === 'HIGH').length;
  const mediumCount = findings.filter((f) => f.severity === 'MEDIUM').length;

  console.log('\n============================================================');
  console.log('🛡️  FLASHCARD-3D RADAR AUDIT HOÀN TẤT');
  console.log('============================================================');
  console.log(`📁 Tổng số tệp đã quét : ${parsedFiles.length} files (src/)`);
  console.log(`⏱️  Thời gian quét      : ${durationMs} ms`);
  console.log(`🔴 CRITICAL            : ${criticalCount}`);
  console.log(`🟠 HIGH                : ${highCount}`);
  console.log(`🟡 MEDIUM              : ${mediumCount}`);
  console.log(`⚙️  Oxlint              : ${oxlintResult.status}`);
  console.log(`📄 Báo cáo chi tiết    : ${REPORT_PATH}`);
  console.log('============================================================\n');

  if (criticalCount > 0) {
    console.log('👉 Gợi ý: Mở file audit_report.md và gửi cho Kỹ sư Trưởng xử lý các mục 🔴 CRITICAL trước!\n');
  }
}

main();
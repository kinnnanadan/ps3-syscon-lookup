/**
 * PS3 Syscon Web Serial (UART) ツール
 * ps3_syscon_uart_script.py のプロトコル（CXR / CXRF / SW・AUTH）に準拠し、
 * 固定 sleep(1) による遅延を排除して高速な応答・1秒間隔リアルタイム監視を実現します。
 */
(function () {
  'use strict';

  // ==========================================
  // 0. クイック診断ボタン 有効・無効設定（コードで切り替え）
  // ==========================================
  // 各ボタンを true（有効）/ false（無効）で個別に設定できます。
  const QUICK_DIAG_BUTTONS = {
    // 🌡 温度・ファン系
    'tmp 0': true,          // tmp 0 CELL温度取得
    'tmp 1': true,          // tmp 1 RSX温度取得
    'tmp 14': true,         // tmp 14 SB温度取得
    'duty get 0': true,     // duty get 0 ファン速度取得
    'fantbl get 0': true,   // fantbl get 0 CELLファン設定表
    'fantbl get 1': true,   // fantbl get 1 RSXファン設定表
    // ⚡ 電源管理系
    'powersw': true,        // powersw 電源ボタン押下(起動)
    'bringup': true,        // bringup 強制起動シーケンス
    'ejectsw': true,        // ejectsw BDドライブ排出
    'shutdown': true,       // shutdown 強制電源オフ
    // 📜 ログ・EEPROM・稼働実績系
    'errlog': true,         // エラーログ一括取得
    'lasterrlog': true,     // lasterrlog 最新エラーログ取得
    'clearerrlog': false,    // clearerrlog エラーログ全削除
    'eepcsumFix': true,     // eepcsum 確認＆自動修正
    'eepcsum': true,        // eepcsum チェックサム確認のみ
    'becount': true,        // becount 稼働時間・起動回数
    // 🎛 クイック診断UI補助ボタン
    'viewGrouped': true,    // カテゴリ別表示切替
    'viewFlat': true,       // まとめて一覧表示切替
    'searchAllErrors': true, // すべてエラー検索で開く
  };
  // false にしたボタンの表示方法:
  // 'disable' = ボタンを表示したまま常に無効(押下不可)にする / 'hide' = ボタン自体を非表示にする
  const QUICK_DIAG_DISABLED_MODE = 'disable';

  function getQuickDiagBtnKey(btn) {
    if (!btn) return '';
    return btn.getAttribute('data-quick-key') || btn.getAttribute('data-cmd') || '';
  }

  function isQuickDiagButtonEnabled(key) {
    if (!key) return true;
    return QUICK_DIAG_BUTTONS[key] !== false;
  }

  // ==========================================
  // 1. 純粋JS AES-128-CBC（パディングなし・PyCryptodome互換）
  // ==========================================
  const AES_SBOX = new Uint8Array([
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
  ]);

  const AES_INV_SBOX = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    AES_INV_SBOX[AES_SBOX[i]] = i;
  }

  const RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);

  function xtime(a) {
    return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
  }

  function mul(a, b) {
    let p = 0;
    for (let i = 0; i < 8; i++) {
      if (b & 1) p ^= a;
      a = xtime(a);
      b >>= 1;
    }
    return p;
  }

  function expandKey128(key) {
    const w = new Uint8Array(176);
    w.set(key);
    for (let i = 4; i < 44; i++) {
      let t0 = w[(i - 1) * 4];
      let t1 = w[(i - 1) * 4 + 1];
      let t2 = w[(i - 1) * 4 + 2];
      let t3 = w[(i - 1) * 4 + 3];
      if (i % 4 === 0) {
        const tmp = AES_SBOX[t0];
        t0 = AES_SBOX[t1] ^ RCON[i / 4 - 1];
        t1 = AES_SBOX[t2];
        t2 = AES_SBOX[t3];
        t3 = tmp;
      }
      w[i * 4] = w[(i - 4) * 4] ^ t0;
      w[i * 4 + 1] = w[(i - 4) * 4 + 1] ^ t1;
      w[i * 4 + 2] = w[(i - 4) * 4 + 2] ^ t2;
      w[i * 4 + 3] = w[(i - 4) * 4 + 3] ^ t3;
    }
    return w;
  }

  function addRoundKey(state, w, round) {
    const offset = round * 16;
    for (let i = 0; i < 16; i++) state[i] ^= w[offset + i];
  }

  function aesEncryptBlock(block, w) {
    const s = new Uint8Array(block);
    addRoundKey(s, w, 0);
    for (let round = 1; round <= 10; round++) {
      for (let i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
      // ShiftRows (column-major state)
      let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
      t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
      t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
      if (round < 10) {
        for (let c = 0; c < 4; c++) {
          const i = c * 4;
          const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
          const x = a0 ^ a1 ^ a2 ^ a3;
          s[i]     ^= x ^ xtime(a0 ^ a1);
          s[i + 1] ^= x ^ xtime(a1 ^ a2);
          s[i + 2] ^= x ^ xtime(a2 ^ a3);
          s[i + 3] ^= x ^ xtime(a3 ^ a0);
        }
      }
      addRoundKey(s, w, round);
    }
    return s;
  }

  function aesDecryptBlock(block, w) {
    const s = new Uint8Array(block);
    addRoundKey(s, w, 10);
    for (let round = 9; round >= 0; round--) {
      // InvShiftRows
      let t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;
      t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
      t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
      for (let i = 0; i < 16; i++) s[i] = AES_INV_SBOX[s[i]];
      addRoundKey(s, w, round);
      if (round > 0) {
        for (let c = 0; c < 4; c++) {
          const i = c * 4;
          const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
          s[i]     = mul(a0, 0x0e) ^ mul(a1, 0x0b) ^ mul(a2, 0x0d) ^ mul(a3, 0x09);
          s[i + 1] = mul(a0, 0x09) ^ mul(a1, 0x0e) ^ mul(a2, 0x0b) ^ mul(a3, 0x0d);
          s[i + 2] = mul(a0, 0x0d) ^ mul(a1, 0x09) ^ mul(a2, 0x0e) ^ mul(a3, 0x0b);
          s[i + 3] = mul(a0, 0x0b) ^ mul(a1, 0x0d) ^ mul(a2, 0x09) ^ mul(a3, 0x0e);
        }
      }
    }
    return s;
  }

  function aes128EncryptCbc(key, iv, data) {
    if (data.length % 16 !== 0) throw new Error('AES-CBC data length must be multiple of 16');
    const w = expandKey128(key);
    const out = new Uint8Array(data.length);
    let prev = iv;
    for (let off = 0; off < data.length; off += 16) {
      const blk = new Uint8Array(16);
      for (let i = 0; i < 16; i++) blk[i] = data[off + i] ^ prev[i];
      const enc = aesEncryptBlock(blk, w);
      out.set(enc, off);
      prev = enc;
    }
    return out;
  }

  function aes128DecryptCbc(key, iv, data) {
    if (data.length % 16 !== 0) throw new Error('AES-CBC data length must be multiple of 16');
    const w = expandKey128(key);
    const out = new Uint8Array(data.length);
    let prev = iv;
    for (let off = 0; off < data.length; off += 16) {
      const blk = data.subarray(off, off + 16);
      const dec = aesDecryptBlock(blk, w);
      for (let i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
      prev = blk;
    }
    return out;
  }

  // ==========================================
  // 2. バイト・16進数ユーティリティ & Syscon鍵定数
  // ==========================================
  function hexToBytes(hex) {
    const clean = hex.replace(/\s+/g, '');
    if (clean.length % 2 !== 0) throw new Error('Invalid hex length');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      out += bytes[i].toString(16).toUpperCase().padStart(2, '0');
    }
    return out;
  }

  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function asciiChecksumHex(str) {
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
      sum = (sum + (str.charCodeAt(i) & 0xff)) & 0xff;
    }
    return sum.toString(16).toUpperCase().padStart(2, '0');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function encodeAscii(str) {
    const buf = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      buf[i] = str.charCodeAt(i) & 0x7f;
    }
    return buf;
  }

  const SYSCON_KEYS = {
    sc2tb: hexToBytes('71f03f184c01c5ebc3f6a22a42ba9525'),
    tb2sc: hexToBytes('907e730f4d4e0a0b7b75f030eb1d9d36'),
    value: hexToBytes('3350BD7820345C29056A223BA220B323'),
    zero: new Uint8Array(16),
    auth1rHeader: hexToBytes('10100000FFFFFFFF0000000000000000'),
    auth2Header: hexToBytes('10010000000000000000000000000000')
  };

  const AUTH1_CHALLENGE =
    '1000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000';

  // ==========================================
  // 3. Web Serial / WebUSB Syscon クライアント（非同期・高速応答版）
  // ==========================================
  function hasWebSerial() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  function hasWebUsb() {
    return typeof window !== 'undefined' && Boolean(window.WebUsbSerial && window.WebUsbSerial.isSupported());
  }

  function hasAnySerialTransport() {
    return hasWebSerial() || hasWebUsb();
  }

  class WebSysconUART {
    constructor() {
      this.port = null;
      this.reader = null;
      this.writer = null;
      this.scType = 'CXRF';
      this.transportPref = 'auto'; // 'auto' | 'serial' | 'webusb'
      this.connected = false;
      this.authenticated = false;
      this.rxBuffer = '';
      this.activeWaiter = null;
      this.queue = Promise.resolve();
      this.onLog = null;
      this.onSpontaneousLog = null;
      this.streamBootLogs = true;
      this.onDisconnect = null;
      this.readingPromise = null;
    }

    getBaudRate(type) {
      return type === 'CXRF' ? 115200 : 57600;
    }

    resolveTransport() {
      if (this.transportPref === 'serial') {
        return hasWebSerial() ? 'serial' : null;
      }
      if (this.transportPref === 'webusb') {
        return hasWebUsb() ? 'webusb' : null;
      }
      if (hasWebSerial()) return 'serial';
      if (hasWebUsb()) return 'webusb';
      return null;
    }

    async requestPort() {
      const mode = this.resolveTransport();
      if (mode === 'serial') {
        return navigator.serial.requestPort();
      }
      if (mode === 'webusb') {
        return window.WebUsbSerial.requestPort();
      }
      throw new Error('このブラウザは Web Serial / WebUSB に対応していません（PC版 Chrome / Edge、または Android版 Chrome + USB-OTG をご利用ください）。');
    }

    async connect(scType) {
      const port = await this.requestPort();
      await this.connectPort(port, scType);
    }

    async connectPort(port, scType) {
      if (this.connected) {
        await this.disconnect(false);
      }
      const baudRate = this.getBaudRate(scType);
      await port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });

      this.port = port;
      this.scType = scType;
      this.connected = true;
      this.authenticated = false;
      this.rxBuffer = '';
      this.writer = port.writable.getWriter();
      this.reader = port.readable.getReader();
      this.readingPromise = this._readLoop();
      if (port && port.isWebUsb && this.onLog) {
        this.onLog('SYS', `WebUSB 接続 (${port.driverName}): ${port.deviceLabel} @ ${baudRate} bps`);
      }
    }

    async reopenAs(scType) {
      const savedPort = this.port;
      if (!savedPort) {
        throw new Error('再接続できるシリアルポートがありません');
      }
      await this.disconnect(false);
      await sleep(80);
      await this.connectPort(savedPort, scType);
    }

    async disconnect(clearPort = true) {
      this.connected = false;
      this.authenticated = false;

      if (this.activeWaiter) {
        this.activeWaiter.reject(new Error('切断されました'));
        this.activeWaiter = null;
      }

      try {
        if (this.reader) {
          await this.reader.cancel().catch(() => {});
          this.reader.releaseLock();
          this.reader = null;
        }
      } catch (_) {}

      try {
        if (this.writer) {
          this.writer.releaseLock();
          this.writer = null;
        }
      } catch (_) {}

      try {
        if (this.port) {
          await this.port.close().catch(() => {});
          if (clearPort) this.port = null;
        }
      } catch (_) {}

      this.rxBuffer = '';
    }

    async _readLoop() {
      try {
        while (this.connected && this.reader) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;

          // Python の .decode('ascii', 'ignore') 相当
          let chunk = '';
          for (let i = 0; i < value.length; i++) {
            const b = value[i];
            if (b < 0x80) chunk += String.fromCharCode(b);
          }
          if (!chunk) continue;

          this.rxBuffer += chunk;
          if (this.activeWaiter) {
            this.activeWaiter.onData(this.rxBuffer);
          } else if (this.streamBootLogs && (this.rxBuffer.includes('\n') || this.rxBuffer.includes('\r'))) {
            this.flushSpontaneousBuffer(false);
          }
        }
      } catch (err) {
        if (this.connected && this.onLog) {
          this.onLog('ERR', `受信エラー: ${err.message}`);
        }
      } finally {
        const wasConnected = this.connected;
        if (wasConnected) {
          await this.disconnect();
          if (this.onDisconnect) this.onDisconnect();
        }
      }
    }

    enqueue(taskFn) {
      const next = this.queue.then(taskFn, taskFn);
      this.queue = next.catch(() => {});
      return next;
    }

    async _writeAscii(text) {
      if (!this.writer) throw new Error('シリアルポートが開かれていません');
      await this.writer.write(encodeAscii(text));
    }

    async _writePaced(text, chunkSize = 16, delayMs = 3) {
      if (text.length <= chunkSize) {
        await this._writeAscii(text);
        return;
      }
      for (let i = 0; i < text.length; i += chunkSize) {
        await this._writeAscii(text.slice(i, i + chunkSize));
        if (i + chunkSize < text.length) {
          await sleep(delayMs);
        }
      }
    }

    /**
     * 固定 sleep を排除し、終端文字・プロンプト・無通信デバウンスで即座に応答を返す送信メソッド
     */
    command(com, options = {}) {
      return this.enqueue(async () => {
        if (!this.connected) throw new Error('未接続です');

        const cmd = com.trim();
        const maxTimeoutMs = options.timeoutMs ?? 1500;
        const idleMs = options.idleMs ?? (this.scType === 'CXRF' ? 55 : 65);

        // SW で 0x40 (64文字) 以上のコマンドを送る場合は事前に SETCMDLONG FF FF を実行
        if (this.scType === 'SW' && cmd.length >= 0x40 && cmd !== 'SETCMDLONG FF FF') {
          const preRes = await this._executeSingle('SETCMDLONG FF FF', 1200, 65, options.silent, null, false);
          if (preRes.code !== 0) {
            return { code: 0xFFFFFFFF, lines: ['Setcmdlong'], raw: preRes.raw, rttMs: preRes.rttMs };
          }
        }

        return this._executeSingle(cmd, maxTimeoutMs, idleMs, options.silent, options.doneMatcher || null, Boolean(options.strictMatcher));
      });
    }

    _isTelemetryNoiseLine(line) {
      let s = String(line || '').trim();
      if (!s) return true;
      // 分割受信されたプロンプト断片 ([mul, lion]$, [mulli, on]$, ]$, [ 等)
      if (/^(?:\[m?u?l?l?i?o?n?\]?\$?|[a-z]*\]\$|>+\$?|\$)$/i.test(s) && s.length <= 14) return true;
      // 先頭のプロンプトやプロンプト断片 ([mullion]$ / ion]$ 等) を剥がしてからコマンド判定
      s = s.replace(/^(?:\[[^\]]+\]\s*\$|[a-z]*\]\s*\$|>+\$?|\$)\s*/i, '').trim();
      if (!s) return true;
      if (/^(?:tmp\s+\d+|duty\s+get\s+\d+|TZone\s*No\b)/i.test(s)) return true;
      if (/(?:Temperature\s*:|CrntDuty|^\s*Duty\s*:)/i.test(s)) return true;
      if (/^(?:\d+(?:\.\d+)?\s*%\s*(?:\(0x[0-9a-f]+\))?|0x[0-9a-f]+\s*\(\s*\d+(?:\.\d+)?\s*%\s*\))$/i.test(s)) return true;
      if (/^(?:OK\s+00000000\b|00000000\b|R:[0-9A-Fa-f]{2}:OK\s+00000000\b)/i.test(s)) return true;
      return false;
    }

    flushSpontaneousBuffer(forcePartial = false) {
      if (!this.rxBuffer) return;
      const normalized = this.rxBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let emitPart = '';
      if (forcePartial) {
        emitPart = normalized;
        this.rxBuffer = '';
      } else {
        const lastNl = normalized.lastIndexOf('\n');
        if (lastNl < 0) return;
        emitPart = normalized.slice(0, lastNl);
        this.rxBuffer = normalized.slice(lastNl + 1);
      }
      const cleaned = emitPart
        .split('\n')
        .map(s => s.trimEnd())
        .filter(s => !this._isTelemetryNoiseLine(s))
        .join('\n');
      if (cleaned && this.streamBootLogs && this.onSpontaneousLog) {
        this.onSpontaneousLog(cleaned);
      }
    }

    async _executeSingle(com, maxTimeoutMs, idleMs, silent, doneMatcher, strictMatcher = false) {
      // 未処理の自発ログが溜まっていれば（プロンプト残骸を除いて）先に吐き出してからバッファをクリア
      const leftoverLines = this.rxBuffer
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(s => s.trimEnd())
        .filter(s => !this._isTelemetryNoiseLine(s));
      const leftover = leftoverLines.join('\n').trim();
      if (leftover.length > 0) {
        if (!silent && this.onLog) {
          this.onLog('RX', leftover);
        } else if (silent && this.streamBootLogs && this.onSpontaneousLog) {
          this.onSpontaneousLog(leftover);
        }
      }
      this.rxBuffer = '';

      const startMs = performance.now();

      const waitPromise = new Promise((resolve, reject) => {
        let idleTimer = null;
        let maxTimer = null;
        let settled = false;

        const cleanup = () => {
          if (idleTimer) clearTimeout(idleTimer);
          if (maxTimer) clearTimeout(maxTimer);
          if (this.activeWaiter === waiter) this.activeWaiter = null;
        };

        const finish = (reason) => {
          if (settled) return;
          settled = true;
          cleanup();
          const captured = this.rxBuffer;
          this.rxBuffer = '';
          resolve({ raw: captured, reason });
        };

        const checkComplete = (buf) => {
          if (doneMatcher) {
            if (doneMatcher(buf)) {
              finish('custom-matcher');
              return true;
            }
            return false;
          }
          if (this.scType === 'CXR') {
            // CXR は単一行 R:<CSUM>:<DATA>\n または E:<CSUM>:<DATA>\n で完結
            const trimmed = buf.replace(/^\s+/, '');
            if (/^[RE]:[0-9A-Fa-f]{2}:[^\r\n]*[\r\n]/.test(trimmed)) {
              finish('cxr-line');
              return true;
            }
          } else if (this.scType === 'SW') {
            // SW は末尾行が :<CSUM>\n で、ステータスコード(8桁hex)を含む場合即完了
            if (/\n$/.test(buf) || /\r$/.test(buf)) {
              const lines = buf.trim().split(/\r?\n/).filter(Boolean);
              if (lines.length > 0) {
                const last = lines[lines.length - 1];
                const idx = last.lastIndexOf(':');
                if (idx > 0 && /^[0-9A-Fa-f]{2}$/.test(last.slice(idx + 1).trim())) {
                  const bodyTokens = last.slice(0, idx).trim().split(/\s+/);
                  if (bodyTokens.length >= 2 && /^[0-9A-Fa-f]{8}$/.test(bodyTokens[1])) {
                    finish('sw-status');
                    return true;
                  }
                }
              }
            }
          } else {
            // CXRF: エコーバック後のプロンプト ([mullion]$ / >$ / >) 検出で即完了
            const hasLineBreak = buf.includes('\n') || buf.includes('\r');
            if (hasLineBreak && /(?:^|[\r\n])(?:\[[^\]]+\]\s*\$|>\$?|\$)\s*$/.test(buf)) {
              finish('cxrf-prompt');
              return true;
            }
          }
          return false;
        };

        const waiter = {
          onData: (buf) => {
            if (checkComplete(buf)) return;
            if (doneMatcher && strictMatcher) return; // 明示パターン待ち時はデバウンスで早切れさせない
            // 未確定データが届いたら無通信タイマーをリセット
            if (idleTimer) clearTimeout(idleTimer);
            const hasLineEnd = buf.includes('\n') || buf.includes('\r');
            const echoOnly = this.scType === 'CXRF' && buf.replace(/\r/g, '').trim() === com;
            if (echoOnly) {
              // コマンドエコー直後は本体処理中（eepcsum等）の可能性があるため短時間で早切れさせない
              idleTimer = setTimeout(() => finish('idle-echo'), Math.max(idleMs, 450));
            } else if (hasLineEnd || this.scType !== 'CXRF') {
              idleTimer = setTimeout(() => finish('idle'), idleMs);
            } else {
              // CXRFでまだ改行前の場合も少し待って抜ける
              idleTimer = setTimeout(() => finish('idle-raw'), Math.max(idleMs * 2, 120));
            }
          },
          reject: (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
          }
        };

        this.activeWaiter = waiter;
        maxTimer = setTimeout(() => {
          finish('timeout');
        }, maxTimeoutMs);
      });

      // 送信フォーマット（ps3_syscon_uart_script.py 準拠・長文はFIFO溢れ防止のためチャンク分割）
      if (this.scType === 'CXR') {
        const csum = asciiChecksumHex(com);
        if (com.length <= 10) {
          await this._writeAscii(`C:${csum}:${com}\r\n`);
        } else {
          let j = 10;
          await this._writeAscii(`C:${csum}:${com.slice(0, j)}`);
          await sleep(4);
          while (com.length - j > 15) {
            await this._writeAscii(com.slice(j, j + 15));
            await sleep(4);
            j += 15;
          }
          await this._writeAscii(com.slice(j) + '\r\n');
        }
      } else if (this.scType === 'SW') {
        const csum = asciiChecksumHex(com);
        await this._writePaced(`${com}:${csum}\r\n`, 24, 3);
      } else {
        await this._writePaced(`${com}\r\n`, 24, 3);
      }

      const { raw, reason } = await waitPromise;
      const rttMs = Math.round(performance.now() - startMs);
      const parsed = this._parseAnswer(raw, com);

      // 温度/ファン監視中(silent)に割り込んだ起動・YLODログを抽出して表示
      if (silent && this.streamBootLogs && this.onSpontaneousLog && /^(?:tmp|duty)\b/i.test(com)) {
        const comLower = com.trim().toLowerCase();
        const extraLines = raw
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .map(s => s.trim())
          .filter(s => s && s.toLowerCase() !== comLower && !this._isTelemetryNoiseLine(s));
        if (extraLines.length > 0) {
          this.onSpontaneousLog(extraLines.join('\n'));
        }
      }

      if (reason === 'timeout' && !raw.trim()) {
        return { code: 0xFFFFFFFF, lines: ['Timeout (応答なし)'], raw: '', rttMs, timeout: true };
      }

      return { ...parsed, raw, rttMs };
    }

    _parseAnswer(raw, sentCom) {
      const answer = raw.replace(/\r\n/g, '\n').trim();

      if (this.scType === 'CXR') {
        if (!answer) return { code: 0xFFFFFFFF, lines: ['Empty response'] };
        const parts = answer.split(':');
        if (parts.length !== 3) return { code: 0xFFFFFFFF, lines: ['Answer length', answer] };
        const csum = asciiChecksumHex(parts[2]);
        if (parts[0] !== 'R' && parts[0] !== 'E') return { code: 0xFFFFFFFF, lines: ['Magic', answer] };
        if (parts[1] !== csum) return { code: 0xFFFFFFFF, lines: ['Checksum', answer] };

        const data = parts[2].split(' ');
        if ((parts[0] === 'R' && data.length < 2) || (parts[0] === 'E' && data.length !== 2)) {
          return { code: 0xFFFFFFFF, lines: ['Data length', answer] };
        }
        const status = parseInt(data[1], 16);
        if (data[0] !== 'OK' || data.length < 2) {
          return { code: Number.isNaN(status) ? 0xFFFFFFFF : status, lines: [] };
        }
        return { code: status, lines: data.slice(2) };
      }

      if (this.scType === 'SW') {
        if (!answer) return { code: 0xFFFFFFFF, lines: ['Empty response'] };
        const rawLines = answer.split('\n');
        const checked = [];
        for (let i = 0; i < rawLines.length; i++) {
          const line = rawLines[i].replace(/\r/g, '');
          const idx = line.lastIndexOf(':');
          if (idx === -1) return { code: 0xFFFFFFFF, lines: ['Answer length', answer] };
          const body = line.slice(0, idx);
          const csum = line.slice(idx + 1).trim();
          if (csum !== asciiChecksumHex(body)) {
            return { code: 0xFFFFFFFF, lines: ['Checksum', answer] };
          }
          checked.push(body);
        }
        const lastTokens = checked[checked.length - 1].trim().split(' ');
        if (
          lastTokens.length < 2 ||
          (lastTokens[1].length !== 8 && !/^[0-9A-Fa-f]+$/.test(lastTokens[1]))
        ) {
          return { code: 0, lines: checked };
        }
        const status = parseInt(lastTokens[1], 16);
        if (checked.length === 1) {
          return { code: status, lines: lastTokens.slice(2) };
        }
        return { code: status, lines: checked.slice(0, -1) };
      }

      // CXRF: エコーバックや末尾プロンプトを整理して見やすく返す
      const cleaned = this._cleanCxrfOutput(raw, sentCom);
      return { code: 0, lines: cleaned ? [cleaned] : (raw.trim() ? ['(OK)'] : []) };
    }

    _cleanCxrfOutput(raw, sentCom) {
      const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const promptRe = /^(?:\[[^\]]+\]\s*\$|>\$?|\$)$/;
      const targetCmd = sentCom.trim();

      while (lines.length > 0) {
        const first = lines[0].trim();
        if (!first || promptRe.test(first)) {
          lines.shift();
          continue;
        }
        const withoutPrompt = first.replace(/^(?:\[[^\]]+\]\s*\$|>\$?|\$)\s*/, '').trim();
        if (withoutPrompt === targetCmd) {
          lines.shift();
          continue;
        }
        break;
      }

      while (lines.length > 0) {
        const last = lines[lines.length - 1].trim();
        if (!last || promptRe.test(last)) {
          lines.pop();
          continue;
        }
        break;
      }
      return lines.join('\n').trim();
    }

    _buildAuth2Payload(auth1Hex) {
      const auth1Bytes = hexToBytes(auth1Hex);
      if (auth1Bytes.length < 0x40 || !bytesEqual(auth1Bytes.subarray(0, 0x10), SYSCON_KEYS.auth1rHeader)) {
        return { error: 'Auth1 response header invalid' };
      }
      const data = aes128DecryptCbc(SYSCON_KEYS.sc2tb, SYSCON_KEYS.zero, auth1Bytes.subarray(0x10, 0x40));
      const validBody =
        bytesEqual(data.subarray(0x08, 0x10), SYSCON_KEYS.zero.subarray(0, 8)) &&
        bytesEqual(data.subarray(0x10, 0x20), SYSCON_KEYS.value) &&
        bytesEqual(data.subarray(0x20, 0x30), SYSCON_KEYS.zero);

      if (!validBody) {
        return { error: 'Auth1 response body invalid' };
      }

      const newData = new Uint8Array(48);
      newData.set(data.subarray(0x08, 0x10), 0);
      newData.set(data.subarray(0x00, 0x08), 8);
      const auth2Body = aes128EncryptCbc(SYSCON_KEYS.tb2sc, SYSCON_KEYS.zero, newData);
      return { payload: bytesToHex(SYSCON_KEYS.auth2Header) + bytesToHex(auth2Body) };
    }

    async auth(options = {}) {
      if (!this.connected) throw new Error('未接続です');
      const maxAttempts = options.retries ?? 3;
      let lastResult = { ok: false, message: 'Auth failed', rttMs: 0 };

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (!this.connected) throw new Error('未接続です');
        // 接続直後・リトライ前の受信安定化待機
        await sleep(attempt === 1 ? 60 : 180);

        lastResult = await this._authOnce();
        if (lastResult.ok) {
          return { ...lastResult, attempts: attempt };
        }
        if (attempt < maxAttempts && this.onLog && !options.silent) {
          this.onLog('SYS', `AUTH 再試行中 (${attempt + 1}/${maxAttempts})... (${lastResult.message})`);
        }
      }
      return { ...lastResult, attempts: maxAttempts };
    }

    async _authOnce() {
      if (this.scType === 'CXR' || this.scType === 'SW') {
        const auth1r = await this.command(`AUTH1 ${AUTH1_CHALLENGE}`, { timeoutMs: 3000, silent: true });
        if (auth1r.code !== 0 || auth1r.lines.length === 0) {
          return { ok: false, message: 'Auth1 response invalid', rttMs: auth1r.rttMs };
        }
        const built = this._buildAuth2Payload(auth1r.lines[0]);
        if (built.error) {
          return { ok: false, message: built.error, rttMs: auth1r.rttMs };
        }

        await sleep(25);
        const auth2r = await this.command(`AUTH2 ${built.payload}`, { timeoutMs: 3000, silent: true });
        const totalMs = auth1r.rttMs + auth2r.rttMs;
        if (auth2r.code === 0) {
          this.authenticated = true;
          return { ok: true, message: 'Auth successful', rttMs: totalMs };
        }
        return { ok: false, message: 'Auth failed', rttMs: totalMs };
      }

      // CXRF (内部モード): エコー直後の早切れを防ぐため明示的パターン待ちを使用
      const scopen = await this.command('scopen', {
        timeoutMs: 2000,
        silent: true,
        strictMatcher: true,
        doneMatcher: (buf) => /SC_READY/i.test(buf) && (buf.includes('\n') || buf.includes('\r'))
      });
      if (!/SC_READY/i.test(scopen.raw)) {
        return { ok: false, message: 'scopen response invalid (SC_READY 未検出)', rttMs: scopen.rttMs };
      }

      await sleep(25);
      const auth1r = await this.command(AUTH1_CHALLENGE, {
        timeoutMs: 2500,
        silent: true,
        strictMatcher: true,
        doneMatcher: (buf) => {
          const lines = buf.replace(/\r/g, '\n').split('\n');
          return lines.some((rawLine, idx) => {
            const clean = rawLine.trim().replace(/^[$>\s]+/, '');
            if (!/^[0-9A-Fa-f]{128}$/.test(clean) || clean.toUpperCase() === AUTH1_CHALLENGE) return false;
            return idx < lines.length - 1 || buf.endsWith('\n') || buf.endsWith('\r');
          });
        }
      });

      const hexLine = auth1r.raw
        .replace(/\r/g, '\n')
        .split('\n')
        .map(s => s.trim().replace(/^[$>\s]+/, ''))
        .find(s => /^[0-9A-Fa-f]{128}$/.test(s) && s.toUpperCase() !== AUTH1_CHALLENGE);

      if (!hexLine) {
        return { ok: false, message: 'Auth1 response invalid', rttMs: scopen.rttMs + auth1r.rttMs };
      }

      const built = this._buildAuth2Payload(hexLine);
      if (built.error) {
        return { ok: false, message: built.error, rttMs: scopen.rttMs + auth1r.rttMs };
      }

      await sleep(25);
      const auth2r = await this.command(built.payload, {
        timeoutMs: 2500,
        silent: true,
        strictMatcher: true,
        doneMatcher: (buf) => /SC_SUCCESS|SC_FAIL/i.test(buf) && (buf.includes('\n') || buf.includes('\r'))
      });

      const totalMs = scopen.rttMs + auth1r.rttMs + auth2r.rttMs;
      if (/SC_SUCCESS/i.test(auth2r.raw)) {
        this.authenticated = true;
        return { ok: true, message: 'Auth successful', rttMs: totalMs };
      }
      return { ok: false, message: 'Auth failed', rttMs: totalMs };
    }
  }

  // ==========================================
  // 4. 応答パーサー（温度・ファンDuty・エラーコード・eepcsum）
  // ==========================================
  function parseEepcsumMismatches(text) {
    if (!text) return [];
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const mismatches = [];
    let sawSumError = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim().replace(/:[0-9A-Fa-f]{2}$/, '');
      line = line.replace(/^(?:\[[^\]]+\]\s*\$|>\$?|\$)\s*/, '').trim();
      if (!line) continue;
      if (/^sum\s*[:=]\s*0x[0-9A-Fa-f]+/i.test(line)) {
        sawSumError = true;
        continue;
      }
      const m = line.match(/Addr\s*:\s*0x([0-9A-Fa-f]+)\s+should\s+be\s+0x([0-9A-Fa-f]+)/i);
      if (m && sawSumError) {
        sawSumError = false;
        const addr = m[1].replace(/^0+/, '') || '0';
        const valHex = m[2].toUpperCase();
        // 4桁 または 先頭に FFFF / 0000 が付与された8桁表記 (例: 0xFFFF3198 -> 下位4桁 3198) に対応
        let val4 = null;
        if (valHex.length <= 4) {
          val4 = valHex.padStart(4, '0');
        } else if (valHex.length === 8 && (valHex.startsWith('FFFF') || valHex.startsWith('0000'))) {
          val4 = valHex.slice(4, 8);
        }

        if (val4 !== null) {
          const lo = val4.slice(2, 4);
          const hi = val4.slice(0, 2);
          mismatches.push({
            addr,
            expected: `0x${valHex}`,
            cmd: `w ${addr} ${lo} ${hi}`,
            manualRequired: false
          });
        } else {
          mismatches.push({
            addr,
            expected: `0x${valHex}`,
            cmd: null,
            manualRequired: true
          });
        }
      }
    }
    return mismatches;
  }
  function parseTemperature(text) {
    if (!text) return null;
    // 例: "TZone No:00 1st BE Primary Temperature:43.70(0x2bb5)."
    let m = text.match(/Temperature\s*:\s*(-?\d+(?:\.\d+)?)/i);
    if (m) {
      const num = parseFloat(m[1]);
      return { num, label: `${num.toFixed(2)} ℃` };
    }
    // 例: "43.70 C" / "43.70(0x..."
    m = text.match(/(-?\d+\.\d+)\s*(?:\(|°?C\b)/i);
    if (m) {
      const num = parseFloat(m[1]);
      return { num, label: `${num.toFixed(2)} ℃` };
    }
    // 外部モード等で16進数(8.8固定小数点 0x2BB5 -> 43.70℃ 等)が返る場合
    m = text.match(/\b0x([0-9A-Fa-f]{4})\b/) || text.match(/\b([0-9A-Fa-f]{4})\b/);
    if (m && !/^[0]{4}$/.test(m[1]) && !/^[Ff]{4}$/.test(m[1])) {
      const raw = parseInt(m[1], 16);
      const deg = raw / 256;
      if (deg >= 5 && deg <= 125) {
        const num = Math.round(deg * 100) / 100;
        return { num, label: `${num.toFixed(2)} ℃` };
      }
    }
    return null;
  }

  function parseFanDuty(text) {
    if (!text) return null;
    // 例: "CrntDuty(0x0):27%(0x47)."
    let m = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:\((0x[0-9A-Fa-f]+)\))?/i);
    if (m) {
      const pct = parseFloat(m[1]);
      const hex = m[2] ? m[2].toUpperCase().replace('0X', '0x') : null;
      return { pct, hex, label: hex ? `${m[1]}% (${hex})` : `${m[1]}%` };
    }
    // hex のみ返る場合 (0x00〜0xFF)
    m = text.match(/\b(?:0x)?([0-9A-Fa-f]{2})\b/);
    if (m) {
      const val = parseInt(m[1], 16);
      const pct = Math.round((val / 255) * 100);
      const hex = `0x${m[1].toUpperCase()}`;
      return { pct, hex, label: `${pct}% (${hex})` };
    }
    return null;
  }

  function extractErrorCodes(text) {
    if (!text) return [];
    const found = new Set();
    // 8桁Sysconコード (例: A0803034, A0093003, FFFFFFFFは除外)
    const re8 = /\b([A-Fa-f0-9]{4})([1-4][0-9A-Fa-f]{3})\b/g;
    let m;
    while ((m = re8.exec(text)) !== null) {
      const full = (m[1] + m[2]).toUpperCase();
      if (full === 'FFFFFFFF' || full === '00000000') continue;
      if (/^[A-F0-9]{8}$/.test(full)) {
        found.add(m[2].toUpperCase());
      }
    }
    // 4桁コード (1000〜4FFF 帯の代表形式、時刻表記等を避けるため単語境界)
    const re4 = /(?:^|[\s:])([1-4][0-9A-Fa-f]{3})(?=$|[\s.,])/gm;
    while ((m = re4.exec(text)) !== null) {
      const code = m[1].toUpperCase();
      if (code !== '0000' && code !== 'FFFF') found.add(code);
    }
    return Array.from(found);
  }

  function parseBecount(text) {
    if (!text) return null;
    const bMatch = text.match(/Bringup\s*:\s*(\d+)/i);
    const sMatch = text.match(/Shutdown\s*:\s*(\d+)/i);
    const pMatch = text.match(/Power-on\s*:\s*(\d+)\s*day\s+(\d+)\s*hour\s+(\d+)\s*min\s+(\d+)\s*sec/i);
    const pFallback = text.match(/Power-on\s*:\s*([^\r\n.]+)/i);
    if (!bMatch && !sMatch && !pMatch && !pFallback) return null;

    const bringup = bMatch ? parseInt(bMatch[1], 10) : null;
    const shutdown = sMatch ? parseInt(sMatch[1], 10) : null;
    const powerOn = pMatch
      ? `${pMatch[1]}日 ${pMatch[2]}時間 ${pMatch[3]}分 ${pMatch[4]}秒`
      : (pFallback ? pFallback[1].trim() : null);

    return {
      bringup,
      shutdown,
      abnormal: (bringup !== null && shutdown !== null) ? (bringup - shutdown) : null,
      powerOn
    };
  }

  function parseFantblP0(text) {
    if (!text) return null;
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!/^p0+\b/i.test(line)) continue;
      const td = line.match(/TempD\s*:\s*(\d+\.\d+)/i);
      const tu = line.match(/TempU\s*:\s*(\d+\.\d+)/i);
      const dutyHex = line.match(/Duty[^0-9x]*(?:\d+%\s*\()?\s*(0x[0-9A-Fa-f]{2})/i)
        || line.match(/\b(0x[0-9A-Fa-f]{2})\b(?!.*\b0x[0-9A-Fa-f]{2}\b)/i);
      if (td && tu && dutyHex) {
        return {
          tempD: parseFloat(td[1]).toFixed(2),
          tempU: parseFloat(tu[1]).toFixed(2),
          duty: '0x' + dutyHex[1].replace(/^0x/i, '').toUpperCase()
        };
      }
      // 数値2つ＋%表記のフォールバック
      const nums = line.match(/\b\d+\.\d+\b/g);
      const pct = line.match(/(\d+)\s*%/);
      if (nums && nums.length >= 2 && (dutyHex || pct)) {
        const hexStr = dutyHex
          ? '0x' + dutyHex[1].replace(/^0x/i, '').toUpperCase()
          : '0x' + Math.round((parseInt(pct[1], 10) / 100) * 255).toString(16).toUpperCase().padStart(2, '0');
        return {
          tempD: parseFloat(nums[0]).toFixed(2),
          tempU: parseFloat(nums[1]).toFixed(2),
          duty: hexStr
        };
      }
    }
    return null;
  }

  // Mullion (NCP5318 VRD10) / Sherwood (ISL6326 VR11) 電圧VIDテーブル（同梱xlsx準拠）
  const VID_TABLES = {
    MULLION: {
      label: 'Mullion (NCP5318)',
      cellAddr: '3110',
      rsxAddr: '3111',
      decimals: 4,
      entries: [
        {hex:'2A',v:1.6},{hex:'0B',v:1.5875},{hex:'2B',v:1.575},{hex:'0C',v:1.5625},
        {hex:'2C',v:1.55},{hex:'0D',v:1.5375},{hex:'2D',v:1.525},{hex:'0E',v:1.5125},
        {hex:'2E',v:1.5},{hex:'0F',v:1.4875},{hex:'2F',v:1.475},{hex:'10',v:1.4625},
        {hex:'30',v:1.45},{hex:'11',v:1.4375},{hex:'31',v:1.425},{hex:'12',v:1.4125},
        {hex:'32',v:1.4},{hex:'13',v:1.3875},{hex:'33',v:1.375},{hex:'14',v:1.3625},
        {hex:'34',v:1.35},{hex:'15',v:1.3375},{hex:'35',v:1.325},{hex:'16',v:1.3125},
        {hex:'36',v:1.3},{hex:'17',v:1.2875},{hex:'37',v:1.275},{hex:'18',v:1.2625},
        {hex:'38',v:1.25},{hex:'19',v:1.2375},{hex:'39',v:1.225},{hex:'1A',v:1.2125},
        {hex:'3A',v:1.2},{hex:'1B',v:1.1875},{hex:'3B',v:1.175},{hex:'1C',v:1.1625},
        {hex:'3C',v:1.15},{hex:'1D',v:1.1375},{hex:'3D',v:1.125},{hex:'1E',v:1.1125},
        {hex:'3E',v:1.1},{hex:'00',v:1.0875},{hex:'20',v:1.075},{hex:'01',v:1.0625},
        {hex:'21',v:1.05},{hex:'02',v:1.0375},{hex:'22',v:1.025},{hex:'03',v:1.0125},
        {hex:'23',v:1.0},{hex:'04',v:0.9875},{hex:'24',v:0.975},{hex:'05',v:0.9625},
        {hex:'25',v:0.95},{hex:'06',v:0.9375},{hex:'26',v:0.925},{hex:'07',v:0.9125},
        {hex:'27',v:0.9},{hex:'08',v:0.8875},{hex:'28',v:0.875},{hex:'09',v:0.8625},
        {hex:'29',v:0.85},{hex:'0A',v:0.8375}
      ]
    },
    SW: {
      label: 'Sherwood (ISL6326)',
      cellAddr: '50',
      rsxAddr: '51',
      decimals: 5,
      entries: [
        {hex:'00',v:1.59375},{hex:'01',v:1.5875},{hex:'02',v:1.58125},{hex:'03',v:1.575},
        {hex:'04',v:1.56875},{hex:'05',v:1.5625},{hex:'06',v:1.55625},{hex:'07',v:1.55},
        {hex:'08',v:1.54375},{hex:'09',v:1.5375},{hex:'0A',v:1.53125},{hex:'0B',v:1.525},
        {hex:'0C',v:1.51875},{hex:'0D',v:1.5125},{hex:'0E',v:1.50625},{hex:'0F',v:1.5},
        {hex:'10',v:1.49375},{hex:'11',v:1.4875},{hex:'12',v:1.48125},{hex:'13',v:1.475},
        {hex:'14',v:1.46875},{hex:'15',v:1.4625},{hex:'16',v:1.45625},{hex:'17',v:1.45},
        {hex:'18',v:1.44375},{hex:'19',v:1.4375},{hex:'1A',v:1.43125},{hex:'1B',v:1.425},
        {hex:'1C',v:1.41875},{hex:'1D',v:1.4125},{hex:'1E',v:1.40625},{hex:'1F',v:1.4},
        {hex:'20',v:1.39375},{hex:'21',v:1.3875},{hex:'22',v:1.38125},{hex:'23',v:1.375},
        {hex:'24',v:1.36875},{hex:'25',v:1.3625},{hex:'26',v:1.35625},{hex:'27',v:1.35},
        {hex:'28',v:1.34375},{hex:'29',v:1.3375},{hex:'2A',v:1.33125},{hex:'2B',v:1.325},
        {hex:'2C',v:1.31875},{hex:'2D',v:1.3125},{hex:'2E',v:1.30625},{hex:'2F',v:1.3},
        {hex:'30',v:1.29375},{hex:'31',v:1.2875},{hex:'32',v:1.28125},{hex:'33',v:1.275},
        {hex:'34',v:1.26875},{hex:'35',v:1.2625},{hex:'36',v:1.25625},{hex:'37',v:1.25},
        {hex:'38',v:1.24375},{hex:'39',v:1.2375},{hex:'3A',v:1.23125},{hex:'3B',v:1.225},
        {hex:'3C',v:1.21875},{hex:'3D',v:1.2125},{hex:'3E',v:1.20625},{hex:'3F',v:1.2},
        {hex:'40',v:1.19375},{hex:'41',v:1.1875},{hex:'42',v:1.18125},{hex:'43',v:1.175},
        {hex:'44',v:1.16875},{hex:'45',v:1.1625},{hex:'46',v:1.15625},{hex:'47',v:1.15},
        {hex:'48',v:1.14375},{hex:'49',v:1.1375},{hex:'4A',v:1.13125},{hex:'4B',v:1.125},
        {hex:'4C',v:1.11875},{hex:'4D',v:1.1125},{hex:'4E',v:1.10625},{hex:'4F',v:1.1},
        {hex:'50',v:1.09375},{hex:'51',v:1.0875},{hex:'52',v:1.08125},{hex:'53',v:1.075},
        {hex:'54',v:1.06875},{hex:'55',v:1.0625},{hex:'56',v:1.05625},{hex:'57',v:1.05},
        {hex:'58',v:1.04375},{hex:'59',v:1.0375},{hex:'5A',v:1.03125},{hex:'5B',v:1.025},
        {hex:'5C',v:1.01875},{hex:'5D',v:1.0125},{hex:'5E',v:1.00625},{hex:'5F',v:1.0},
        {hex:'60',v:0.99375},{hex:'61',v:0.9875},{hex:'62',v:0.98125},{hex:'63',v:0.975},
        {hex:'64',v:0.96875},{hex:'65',v:0.9625},{hex:'66',v:0.95625},{hex:'67',v:0.95},
        {hex:'68',v:0.94375},{hex:'69',v:0.9375},{hex:'6A',v:0.93125},{hex:'6B',v:0.925},
        {hex:'6C',v:0.91875},{hex:'6D',v:0.9125},{hex:'6E',v:0.90625},{hex:'6F',v:0.9},
        {hex:'70',v:0.89375},{hex:'71',v:0.8875},{hex:'72',v:0.88125},{hex:'73',v:0.875},
        {hex:'74',v:0.86875},{hex:'75',v:0.8625},{hex:'76',v:0.85625},{hex:'77',v:0.85},
        {hex:'78',v:0.84375},{hex:'79',v:0.8375},{hex:'7A',v:0.83125},{hex:'7B',v:0.825},
        {hex:'7C',v:0.81875},{hex:'7D',v:0.8125},{hex:'7E',v:0.80625},{hex:'7F',v:0.8},
        {hex:'80',v:0.79375},{hex:'81',v:0.7875},{hex:'82',v:0.78125},{hex:'83',v:0.775},
        {hex:'84',v:0.76875},{hex:'85',v:0.7625},{hex:'86',v:0.75625},{hex:'87',v:0.75},
        {hex:'88',v:0.74375},{hex:'89',v:0.7375},{hex:'8A',v:0.73125},{hex:'8B',v:0.725},
        {hex:'8C',v:0.71875},{hex:'8D',v:0.7125},{hex:'8E',v:0.70625},{hex:'8F',v:0.7},
        {hex:'90',v:0.69375},{hex:'91',v:0.6875},{hex:'92',v:0.68125},{hex:'93',v:0.675},
        {hex:'94',v:0.66875},{hex:'95',v:0.6625},{hex:'96',v:0.65625},{hex:'97',v:0.65},
        {hex:'98',v:0.64375},{hex:'99',v:0.6375},{hex:'9A',v:0.63125},{hex:'9B',v:0.625},
        {hex:'9C',v:0.61875},{hex:'9D',v:0.6125},{hex:'9E',v:0.60625},{hex:'9F',v:0.6},
        {hex:'A0',v:0.59375},{hex:'A1',v:0.5875},{hex:'A2',v:0.58125},{hex:'A3',v:0.575},
        {hex:'A4',v:0.56875},{hex:'A5',v:0.5625},{hex:'A6',v:0.55625},{hex:'A7',v:0.55},
        {hex:'A8',v:0.54375},{hex:'A9',v:0.5375},{hex:'AA',v:0.53125},{hex:'AB',v:0.525},
        {hex:'AC',v:0.51875},{hex:'AD',v:0.5125},{hex:'AE',v:0.50625},{hex:'AF',v:0.5}
      ]
    }
  };

  // ==========================================
  // 5. UI コントローラ
  // ==========================================
  function initSysconUartTool() {
    const viewEl = document.getElementById('view-uart-monitor');
    if (!viewEl) return;

    const apiWarning = document.getElementById('uartApiWarning');
    const connStyleAutoRadio = document.getElementById('uartConnStyleAuto');
    const connStyleManualRadio = document.getElementById('uartConnStyleManual');
    const autoPanel = document.getElementById('uartAutoPanel');
    const manualPanel = document.getElementById('uartManualPanel');
    const autoModelSelect = document.getElementById('uartAutoModel');
    const scTypeSelect = document.getElementById('uartScType');
    const transportSelect = document.getElementById('uartTransportMode');
    const transportHintEl = document.getElementById('uartTransportHint');
    const autoAuthCheckbox = document.getElementById('uartAutoAuth');
    const connectBtn = document.getElementById('uartConnectBtn');
    const disconnectBtn = document.getElementById('uartDisconnectBtn');
    const authBtn = document.getElementById('uartAuthBtn');
    const statusBadge = document.getElementById('uartStatusBadge');
    const rttBadge = document.getElementById('uartRttBadge');

    const wizardBox = document.getElementById('uartWizardBox');
    const wizardTitle = document.getElementById('uartWizardTitle');
    const wizardBody = document.getElementById('uartWizardBody');
    const wizardActions = document.getElementById('uartWizardActions');

    const pollToggleBtn = document.getElementById('uartPollToggleBtn');
    const miniPollBtn = document.getElementById('uartMiniPollBtn');
    const miniTelemetryEl = document.getElementById('uartMiniTelemetry');
    const pollIntervalSelect = document.getElementById('uartPollInterval');
    const pollFastHintEl = document.getElementById('uartPollFastHint');
    const pollCountBadge = document.getElementById('uartPollCountBadge');
    const pollSweepBadge = document.getElementById('uartPollSweepBadge');
    const valCell = document.getElementById('uartValCell');
    const valRsx = document.getElementById('uartValRsx');
    const valSb = document.getElementById('uartValSb');
    const valFan = document.getElementById('uartValFan');

    const bcPowerOnEl = document.getElementById('uartBcPowerOn');
    const bcBringupEl = document.getElementById('uartBcBringup');
    const bcShutdownEl = document.getElementById('uartBcShutdown');
    const bcAbnormalEl = document.getElementById('uartBcAbnormal');
    const refreshBecountBtn = document.getElementById('uartRefreshBecountBtn');

    const showCellCb = document.getElementById('uartShowCell');
    const showRsxCb = document.getElementById('uartShowRsx');
    const showSbCb = document.getElementById('uartShowSb');
    const showFanCb = document.getElementById('uartShowFan');
    const chartWindowSelect = document.getElementById('uartChartWindow');
    const chartTimeModeSelect = document.getElementById('uartChartTimeMode');
    const tempMinInput = document.getElementById('uartTempMinInput');
    const tempMaxInput = document.getElementById('uartTempMaxInput');
    const fanMinInput = document.getElementById('uartFanMinInput');
    const fanMaxInput = document.getElementById('uartFanMaxInput');
    const resetRangeBtn = document.getElementById('uartResetRangeBtn');
    const csvViewerCard = document.getElementById('uartCsvViewerCard');
    const csvFullscreenBtn = document.getElementById('uartCsvFullscreenBtn');
    const importCsvBtn = document.getElementById('uartImportCsvBtn');
    const importCsvInput = document.getElementById('uartImportCsvInput');
    const csvViewerBadge = document.getElementById('uartCsvViewerBadge');
    const csvShowCellCb = document.getElementById('uartCsvShowCell');
    const csvShowRsxCb = document.getElementById('uartCsvShowRsx');
    const csvShowSbCb = document.getElementById('uartCsvShowSb');
    const csvShowFanCb = document.getElementById('uartCsvShowFan');
    const csvTimeModeSelect = document.getElementById('uartCsvTimeMode');
    const csvTimeStartInput = document.getElementById('uartCsvTimeStartInput');
    const csvTimeEndInput = document.getElementById('uartCsvTimeEndInput');
    const csvResetTimeRangeBtn = document.getElementById('uartCsvResetTimeRangeBtn');
    const csvExportPngBtn = document.getElementById('uartCsvExportPngBtn');
    const csvExportHdPngBtn = document.getElementById('uartCsvExportHdPngBtn');
    const csvExportUhdPngBtn = document.getElementById('uartCsvExportUhdPngBtn');
    const csvClearBtn = document.getElementById('uartCsvClearBtn');
    const csvTempMinInput = document.getElementById('uartCsvTempMinInput');
    const csvTempMaxInput = document.getElementById('uartCsvTempMaxInput');
    const csvFanMinInput = document.getElementById('uartCsvFanMinInput');
    const csvFanMaxInput = document.getElementById('uartCsvFanMaxInput');
    const csvResetRangeBtn = document.getElementById('uartCsvResetRangeBtn');
    const csvChartCanvas = document.getElementById('uartCsvChartCanvas');
    const csvChartTooltip = document.getElementById('uartCsvChartTooltip');
    const csvChartStatsEl = document.getElementById('uartCsvChartStats');
    const exportCsvBtn = document.getElementById('uartExportCsvBtn');
    const exportPngBtn = document.getElementById('uartExportPngBtn');
    const exportHdPngBtn = document.getElementById('uartExportHdPngBtn');
    const exportUhdPngBtn = document.getElementById('uartExportUhdPngBtn');
    const clearRecordsBtn = document.getElementById('uartClearRecordsBtn');
    const popoutChartOnlyBtn = document.getElementById('uartPopoutChartOnlyBtn');
    const liveChartWrapper = document.getElementById('uartLiveChartWrapper');
    const chartCanvas = document.getElementById('uartChartCanvas');
    const chartTooltip = document.getElementById('uartChartTooltip');
    const chartStatsEl = document.getElementById('uartChartStats');

    const fetchErrlogBtn = document.getElementById('uartFetchErrlogBtn');
    const fixEepcsumBtn = document.getElementById('uartFixEepcsumBtn');
    const quickBarEl = document.getElementById('uartQuickBar');
    const quickViewGroupedBtn = document.getElementById('uartQuickViewGroupedBtn');
    const quickViewFlatBtn = document.getElementById('uartQuickViewFlatBtn');
    const quickCmdBtns = document.querySelectorAll('.uart-quick-cmd');
    const detectedErrorsBar = document.getElementById('uartDetectedErrors');
    const detectedErrorsList = document.getElementById('uartDetectedErrorsList');
    const searchAllErrorsBtn = document.getElementById('uartSearchAllErrorsBtn');

    const tempFanSlider = document.getElementById('uartTempFanSlider');
    const tempFanDisplay = document.getElementById('uartTempFanDisplay');
    const tempFanBadge = document.getElementById('uartTempFanBadge');
    const tempFanUpper = document.getElementById('uartTempFanUpper');
    const tempFanPreview = document.getElementById('uartTempFanPreview');
    const applyTempFanBtn = document.getElementById('uartApplyTempFanBtn');
    const restoreTempFanBtn = document.getElementById('uartRestoreTempFanBtn');
    const tempFanPresets = document.querySelectorAll('.uart-fanfix-preset');

    const voltBadge = document.getElementById('uartVoltBadge');
    const readVoltBtn = document.getElementById('uartReadVoltBtn');
    const voltCurrentInfo = document.getElementById('uartVoltCurrentInfo');
    const voltCellSelect = document.getElementById('uartVoltCellSelect');
    const voltRsxSelect = document.getElementById('uartVoltRsxSelect');
    const voltCellSlider = document.getElementById('uartVoltCellSlider');
    const voltRsxSlider = document.getElementById('uartVoltRsxSlider');
    const voltCellSliderVal = document.getElementById('uartVoltCellSliderVal');
    const voltRsxSliderVal = document.getElementById('uartVoltRsxSliderVal');
    const voltCellMinLabel = document.getElementById('uartVoltCellMinLabel');
    const voltCellMaxLabel = document.getElementById('uartVoltCellMaxLabel');
    const voltRsxMinLabel = document.getElementById('uartVoltRsxMinLabel');
    const voltRsxMaxLabel = document.getElementById('uartVoltRsxMaxLabel');
    const voltAutoCsumCb = document.getElementById('uartVoltAutoCsum');
    const applyVoltBtn = document.getElementById('uartApplyVoltBtn');
    const resetVoltBtn = document.getElementById('uartResetVoltBtn');
    const voltPreview = document.getElementById('uartVoltPreview');

    const cachedOrigP0 = { 0: null, 1: null };

    const fantblStatusBadge = document.getElementById('uartFantblStatusBadge');
    const fantblTabs = document.querySelectorAll('.uart-fantbl-tab');
    const fantblSbZoneWrap = document.getElementById('uartFantblSbZoneWrap');
    const fantblSbZoneSelect = document.getElementById('uartFantblSbZoneSelect');
    const fantblReadAllBtn = document.getElementById('uartFantblReadAllBtn');
    const fantblRowsEl = document.getElementById('uartFantblRows');
    const fantblAddStageBtn = document.getElementById('uartFantblAddStageBtn');
    const fantblCanvas = document.getElementById('uartFantblCanvas');
    const fantblTempMinInput = document.getElementById('uartFantblTempMin');
    const fantblTempMaxInput = document.getElementById('uartFantblTempMax');
    const fantblDutyMinInput = document.getElementById('uartFantblDutyMin');
    const fantblDutyMaxInput = document.getElementById('uartFantblDutyMax');
    const fantblResetZoomBtn = document.getElementById('uartFantblResetZoomBtn');
    const fantblZoomPresets = document.querySelectorAll('.uart-fantbl-zoom-preset');
    const fantblTrp0Input = document.getElementById('uartTrp0Input');
    const fantblTshut0Input = document.getElementById('uartTshut0Input');
    const fantblTrp1Input = document.getElementById('uartTrp1Input');
    const fantblTshut1Input = document.getElementById('uartTshut1Input');
    const fantblAutoCsumCb = document.getElementById('uartFantblAutoCsum');
    const fantblWriteZoneBtn = document.getElementById('uartFantblWriteZoneBtn');
    const fantblWriteTrpBtn = document.getElementById('uartFantblWriteTrpBtn');
    const fantblPasteInput = document.getElementById('uartFantblPasteInput');
    const fantblLoadPasteBtn = document.getElementById('uartFantblLoadPasteBtn');
    const fantblExecPasteBtn = document.getElementById('uartFantblExecPasteBtn');
    const fantblPreview = document.getElementById('uartFantblPreview');

    const cmdInput = document.getElementById('uartCommandInput');
    const sendBtn = document.getElementById('uartSendBtn');
    const bootLogToggleCb = document.getElementById('uartBootLogToggle');
    const clearLogBtn = document.getElementById('uartClearLogBtn');
    const downloadLogBtn = document.getElementById('uartDownloadLogBtn');
    const terminalEl = document.getElementById('uartTerminalLog');

    const splitLayout = document.getElementById('uartSplitLayout');
    const resizerEl = document.getElementById('uartResizer');
    const dockToggleBtn = document.getElementById('uartDockToggleBtn');
    const dockConsoleBtn = document.getElementById('uartDockConsoleBtn');
    const widthControl = document.getElementById('uartWidthControl');
    const widthSlider = document.getElementById('uartConsoleWidthSlider');
    const widthLabel = document.getElementById('uartConsoleWidthLabel');

    let lastWizardPort = null;

    if (apiWarning) {
      apiWarning.classList.toggle('hidden', hasAnySerialTransport());
    }

    const client = new WebSysconUART();

    function updateTransportHint() {
      if (!transportHintEl) return;
      const active = client.resolveTransport();
      if (active === 'webusb') {
        transportHintEl.textContent = '📱 Android WebUSB モード（FTDI / CP210x / CH340 / PL2303 / CDC-ACM 対応・USB-OTG 接続）';
      } else if (active === 'serial') {
        transportHintEl.textContent = hasWebUsb()
          ? '💻 PC Web Serial モード（Android 向け WebUSB にも切替可能）'
          : '💻 Web Serial モード';
      } else {
        transportHintEl.textContent = '⚠️ 利用可能な通信 API（Web Serial / WebUSB）が見つかりません。';
      }
    }

    if (transportSelect) {
      const optSerial = transportSelect.querySelector('option[value="serial"]');
      const optWebUsb = transportSelect.querySelector('option[value="webusb"]');
      if (optSerial && !hasWebSerial()) optSerial.disabled = true;
      if (optWebUsb && !hasWebUsb()) optWebUsb.disabled = true;

      try {
        const savedPref = localStorage.getItem('ps3_uart_transport_pref');
        if (savedPref === 'auto' || (savedPref === 'serial' && hasWebSerial()) || (savedPref === 'webusb' && hasWebUsb())) {
          transportSelect.value = savedPref;
          client.transportPref = savedPref;
        }
      } catch (_) {}

      transportSelect.addEventListener('change', () => {
        client.transportPref = transportSelect.value;
        try { localStorage.setItem('ps3_uart_transport_pref', client.transportPref); } catch (_) {}
        updateTransportHint();
        updateUiState();
      });
    }
    updateTransportHint();
    let pollTimer = null;
    let isPolling = false;
    let pollInFlight = false;
    const cmdHistory = [];
    let historyIdx = -1;
    let extractedCodes = [];

    // 監視履歴データ（最大500,000件保持・超過時は古い履歴からバッチ削除）
    const MAX_RECORDS = 500000;
    let records = [];
    let sessionStartMs = null;
    let hoverClientX = null;
    let csvRecords = [];
    let csvSessionStartMs = null;
    let csvHoverClientX = null;
    let csvRangeStartTs = null;
    let csvRangeEndTs = null;
    let csvDragSelection = null;
    let csvLastPlotBounds = null;
    let lastChartPollDrawMs = 0;
    let lastBecount = null;

    function appendLog(type, text) {
      if (!terminalEl) return;
      const now = new Date();
      const ts = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
      const line = document.createElement('div');
      line.className = `uart-log-line uart-log-${type.toLowerCase()}`;
      const sep = (type === 'RX' && String(text).includes('\n')) ? '\n' : ' ';
      line.textContent = `[${ts}] [${type}]${sep}${text}`;
      terminalEl.appendChild(line);

      // 長時間監視でも重くならないよう最大500行に制限
      while (terminalEl.childElementCount > 500) {
        terminalEl.removeChild(terminalEl.firstElementChild);
      }
      terminalEl.scrollTop = terminalEl.scrollHeight;
    }

    function updateUiState() {
      const connected = client.connected;
      const authed = client.authenticated;

      connectBtn.disabled = connected || !client.resolveTransport();
      if (transportSelect) transportSelect.disabled = connected;
      if (connStyleAutoRadio) connStyleAutoRadio.disabled = connected;
      if (connStyleManualRadio) connStyleManualRadio.disabled = connected;
      if (autoModelSelect) autoModelSelect.disabled = connected;
      scTypeSelect.disabled = connected;
      disconnectBtn.disabled = !connected;
      authBtn.disabled = !connected;
      pollToggleBtn.disabled = !connected;
      if (miniPollBtn) miniPollBtn.disabled = !connected;
      if (refreshBecountBtn) refreshBecountBtn.disabled = !connected;
      fetchErrlogBtn.disabled = !connected || !isQuickDiagButtonEnabled('errlog');
      if (fixEepcsumBtn) fixEepcsumBtn.disabled = !connected || !isQuickDiagButtonEnabled('eepcsumFix');
      if (applyTempFanBtn) applyTempFanBtn.disabled = !connected;
      if (restoreTempFanBtn) restoreTempFanBtn.disabled = !connected;
      if (readVoltBtn) readVoltBtn.disabled = !connected;
      if (applyVoltBtn) applyVoltBtn.disabled = !connected;
      if (resetVoltBtn) resetVoltBtn.disabled = !connected;
      if (fantblReadAllBtn) fantblReadAllBtn.disabled = !connected;
      if (fantblWriteZoneBtn) fantblWriteZoneBtn.disabled = !connected;
      if (fantblWriteTrpBtn) fantblWriteTrpBtn.disabled = !connected;
      if (fantblExecPasteBtn) fantblExecPasteBtn.disabled = !connected;
      cmdInput.disabled = !connected;
      sendBtn.disabled = !connected;
      quickCmdBtns.forEach(btn => {
        btn.disabled = !connected || !isQuickDiagButtonEnabled(getQuickDiagBtnKey(btn));
      });
      if (quickViewGroupedBtn) quickViewGroupedBtn.disabled = !isQuickDiagButtonEnabled('viewGrouped');
      if (quickViewFlatBtn) quickViewFlatBtn.disabled = !isQuickDiagButtonEnabled('viewFlat');
      if (searchAllErrorsBtn) searchAllErrorsBtn.disabled = !isQuickDiagButtonEnabled('searchAllErrors');

      statusBadge.classList.remove('status-off', 'status-conn', 'status-auth');
      if (!connected) {
        statusBadge.textContent = '未接続';
        statusBadge.classList.add('status-off');
        rttBadge.textContent = '応答速度: -- ms';
      } else if (authed) {
        statusBadge.textContent = `接続中 (${client.scType} / ${client.getBaudRate(client.scType)}bps) · AUTH済`;
        statusBadge.classList.add('status-auth');
      } else {
        statusBadge.textContent = `接続中 (${client.scType} / ${client.getBaudRate(client.scType)}bps) · 未AUTH`;
        statusBadge.classList.add('status-conn');
      }

      pollToggleBtn.textContent = isPolling ? '⏹ リアルタイム監視を停止' : '▶ リアルタイム監視を開始';
      pollToggleBtn.classList.toggle('active-poll', isPolling);
      if (miniPollBtn) {
        miniPollBtn.textContent = isPolling ? '⏹ 停止' : '▶ 開始';
        miniPollBtn.classList.toggle('active-poll', isPolling);
      }

      updateRecordControls();
    }

    function updateMiniTelemetry(sample) {
      if (!miniTelemetryEl) return;
      if (!sample) {
        miniTelemetryEl.textContent = 'C:-- R:-- S:-- F:--';
        return;
      }
      const fmtT = (v) => (v !== null && !Number.isNaN(v)) ? `${v.toFixed(1)}℃` : '--';
      const fmtF = (v) => (v !== null && !Number.isNaN(v)) ? `${v.toFixed(0)}%` : '--';
      miniTelemetryEl.textContent = `C:${fmtT(sample.cell)} R:${fmtT(sample.rsx)} S:${fmtT(sample.sb)} F:${fmtF(sample.fan)}`;
    }

    function updateRecordControls() {
      const hasRecords = records.length > 0;
      if (pollCountBadge) {
        pollCountBadge.textContent = `記録数: ${records.length.toLocaleString()} 件`;
        pollCountBadge.title = `最大 ${MAX_RECORDS.toLocaleString()} 件まで保持（超過時は古いデータから自動入れ替え）`;
      }
      if (exportCsvBtn) exportCsvBtn.disabled = !hasRecords;
      if (exportPngBtn) exportPngBtn.disabled = !hasRecords;
      if (exportHdPngBtn) exportHdPngBtn.disabled = !hasRecords;
      if (exportUhdPngBtn) exportUhdPngBtn.disabled = !hasRecords;
      if (clearRecordsBtn) clearRecordsBtn.disabled = !hasRecords;
    }

    function formatTimeLabel(ts) {
      const d = new Date(ts);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }

    function formatElapsedTimeLabel(totalSec) {
      const sAll = Math.max(0, Math.floor(totalSec));
      const hh = String(Math.floor(sAll / 3600)).padStart(2, '0');
      const mm = String(Math.floor((sAll % 3600) / 60)).padStart(2, '0');
      const ss = String(sAll % 60).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }

    function formatChartAxisTime(ts, baseTs) {
      if (chartTimeModeSelect && chartTimeModeSelect.value === 'elapsed') {
        return formatElapsedTimeLabel((ts - baseTs) / 1000);
      }
      return formatTimeLabel(ts);
    }

    function formatIsoLocal(ts) {
      const d = new Date(ts);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      return `${y}-${mo}-${da} ${hh}:${mm}:${ss}.${ms}`;
    }

    function getChartPalette() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      return {
        bg: isDark ? '#121212' : '#f4f5f7',
        grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        axis: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)',
        text: isDark ? '#9ca3af' : '#555555',
        crosshair: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'
      };
    }

    function getLiveChartCtx() {
      return {
        getRecords: () => records,
        getSessionStartMs: () => sessionStartMs,
        getHoverX: () => hoverClientX,
        canvas: chartCanvas,
        tooltip: chartTooltip,
        statsEl: chartStatsEl,
        showCellCb,
        showRsxCb,
        showSbCb,
        showFanCb,
        windowSelect: chartWindowSelect,
        timeModeSelect: chartTimeModeSelect,
        tempMinInput,
        tempMaxInput,
        fanMinInput,
        fanMaxInput,
        emptyStatsText: '監視を開始するとここに温度・ファン推移グラフが描画されます。',
        emptyCanvasText: 'データ待機中（監視を開始すると推移が表示されます）'
      };
    }

    function getCsvChartCtx() {
      return {
        getRecords: () => csvRecords,
        getSessionStartMs: () => csvSessionStartMs,
        getHoverX: () => csvHoverClientX,
        getTimeRange: () => (csvRangeStartTs !== null && csvRangeEndTs !== null)
          ? { startTs: csvRangeStartTs, endTs: csvRangeEndTs }
          : null,
        getDragSelection: () => csvDragSelection,
        onPlotBounds: (bounds) => { csvLastPlotBounds = bounds; },
        canvas: csvChartCanvas,
        tooltip: csvChartTooltip,
        statsEl: csvChartStatsEl,
        showCellCb: csvShowCellCb,
        showRsxCb: csvShowRsxCb,
        showSbCb: csvShowSbCb,
        showFanCb: csvShowFanCb,
        windowSelect: null,
        timeModeSelect: csvTimeModeSelect,
        tempMinInput: csvTempMinInput,
        tempMaxInput: csvTempMaxInput,
        fanMinInput: csvFanMinInput,
        fanMaxInput: csvFanMaxInput,
        emptyStatsText: '「📂 CSVファイルを開く」またはドラッグ＆ドロップで CSV を読み込むと、ここに全幅グラフと統計（最小・平均・最大）が表示されます。',
        emptyCanvasText: 'CSVファイル未読込（「📂 CSVファイルを開く」またはドラッグ＆ドロップ）'
      };
    }

    function getVisibleSeriesConfig(cfg = getLiveChartCtx()) {
      return [
        { key: 'cell', label: 'CELL', unit: '℃', color: '#ef4444', enabled: cfg.showCellCb ? cfg.showCellCb.checked : true, isFan: false },
        { key: 'rsx',  label: 'RSX',  unit: '℃', color: '#3b82f6', enabled: cfg.showRsxCb ? cfg.showRsxCb.checked : true,  isFan: false },
        { key: 'sb',   label: 'SB',   unit: '℃', color: '#10b981', enabled: cfg.showSbCb ? cfg.showSbCb.checked : true,   isFan: false },
        { key: 'fan',  label: 'ファン', unit: '%', color: '#f59e0b', enabled: cfg.showFanCb ? cfg.showFanCb.checked : true, isFan: true }
      ];
    }

    function getFilteredRecords(cfg = getLiveChartCtx()) {
      const src = cfg.getRecords();
      const len = src.length;
      if (len === 0) return [];
      const customRange = cfg.getTimeRange ? cfg.getTimeRange() : null;
      if (customRange) {
        let lo = 0;
        let hi = len;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (src[mid].ts < customRange.startTs) lo = mid + 1;
          else hi = mid;
        }
        let rLo = lo;
        let rHi = len;
        while (rLo < rHi) {
          const mid = (rLo + rHi) >>> 1;
          if (src[mid].ts <= customRange.endTs) rLo = mid + 1;
          else rHi = mid;
        }
        return (lo === 0 && rLo === len) ? src : src.slice(lo, rLo);
      }
      const windowSec = cfg.windowSelect ? parseInt(cfg.windowSelect.value, 10) : 0;
      if (!windowSec || windowSec <= 0) return src;
      const cutoff = src[len - 1].ts - windowSec * 1000;
      let lo = 0;
      let hi = len;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (src[mid].ts < cutoff) lo = mid + 1;
        else hi = mid;
      }
      return lo === 0 ? src : src.slice(lo);
    }

    function updateChartStats(viewPoints, seriesList, cfg = getLiveChartCtx()) {
      if (!cfg.statsEl) return { tempLo: null, tempHi: null };
      if (viewPoints.length === 0) {
        cfg.statsEl.textContent = cfg.emptyStatsText;
        return { tempLo: null, tempHi: null };
      }

      const acc = seriesList.map(s => ({
        s,
        min: Infinity,
        max: -Infinity,
        sum: 0,
        cnt: 0
      }));
      let tempLo = Infinity;
      let tempHi = -Infinity;

      for (let i = 0; i < viewPoints.length; i++) {
        const p = viewPoints[i];
        for (let k = 0; k < acc.length; k++) {
          const item = acc[k];
          if (!item.s.enabled) continue;
          const v = p[item.s.key];
          if (v === null || Number.isNaN(v)) continue;
          if (v < item.min) item.min = v;
          if (v > item.max) item.max = v;
          item.sum += v;
          item.cnt++;
          if (!item.s.isFan) {
            if (v < tempLo) tempLo = v;
            if (v > tempHi) tempHi = v;
          }
        }
      }

      const parts = [];
      for (let k = 0; k < acc.length; k++) {
        const item = acc[k];
        if (!item.s.enabled || item.cnt === 0) continue;
        const avg = item.sum / item.cnt;
        const fmt = item.s.isFan ? (v => `${v.toFixed(0)}%`) : (v => `${v.toFixed(1)}℃`);
        parts.push(`${item.s.label}: 最小 ${fmt(item.min)} / 平均 ${fmt(avg)} / 最大 ${fmt(item.max)}`);
      }
      cfg.statsEl.textContent = parts.length > 0 ? parts.join('   |   ') : '表示中の項目がありません。';
      return {
        tempLo: tempLo < Infinity ? tempLo : null,
        tempHi: tempHi > -Infinity ? tempHi : null
      };
    }

    function drawChart(targetCanvas = chartCanvas, solidBg = false, exportScale = 1, cfg = getLiveChartCtx()) {
      if (!targetCanvas) return;
      const rect = targetCanvas.getBoundingClientRect();
      const width = solidBg ? Math.floor(targetCanvas.width / exportScale) : Math.floor(rect.width);
      const height = solidBg ? Math.floor(targetCanvas.height / exportScale) : Math.floor(rect.height);
      if (width <= 0 || height <= 0) return;

      const dpr = solidBg ? exportScale : ((targetCanvas.ownerDocument.defaultView || window).devicePixelRatio || 1);
      if (!solidBg) {
        if (targetCanvas.width !== Math.floor(width * dpr) || targetCanvas.height !== Math.floor(height * dpr)) {
          targetCanvas.width = Math.floor(width * dpr);
          targetCanvas.height = Math.floor(height * dpr);
        }
      }

      const ctx = targetCanvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);

      const palette = getChartPalette();
      if (solidBg) {
        ctx.fillStyle = palette.bg;
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.clearRect(0, 0, width, height);
      }

      const seriesList = getVisibleSeriesConfig(cfg);
      const viewPoints = getFilteredRecords(cfg);
      const statsInfo = updateChartStats(viewPoints, seriesList, cfg);

      const pad = { top: 18, right: 48, bottom: 28, left: 46 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      if (plotW <= 10 || plotH <= 10) {
        ctx.restore();
        return;
      }

      // 温度軸レンジ計算（表示中の温度項目から 5℃ 刻みで自動調整）
      let tMin = 25;
      let tMax = 85;
      if (statsInfo && statsInfo.tempLo !== null && statsInfo.tempHi !== null) {
        tMin = Math.floor((statsInfo.tempLo - 3) / 5) * 5;
        tMax = Math.ceil((statsInfo.tempHi + 3) / 5) * 5;
        if (tMax - tMin < 10) {
          tMax = tMin + 10;
        }
      }

      // ユーザー指定の温度範囲を適用（片側のみの指定にも対応）
      const customTMin = cfg.tempMinInput && cfg.tempMinInput.value.trim() !== '' ? parseFloat(cfg.tempMinInput.value) : NaN;
      const customTMax = cfg.tempMaxInput && cfg.tempMaxInput.value.trim() !== '' ? parseFloat(cfg.tempMaxInput.value) : NaN;
      if (!Number.isNaN(customTMin)) tMin = customTMin;
      if (!Number.isNaN(customTMax)) tMax = customTMax;
      if (tMax <= tMin) tMax = tMin + 5;

      let fMin = 0;
      let fMax = 100;
      const customFMin = cfg.fanMinInput && cfg.fanMinInput.value.trim() !== '' ? parseFloat(cfg.fanMinInput.value) : NaN;
      const customFMax = cfg.fanMaxInput && cfg.fanMaxInput.value.trim() !== '' ? parseFloat(cfg.fanMaxInput.value) : NaN;
      if (!Number.isNaN(customFMin)) fMin = Math.max(0, Math.min(100, customFMin));
      if (!Number.isNaN(customFMax)) fMax = Math.max(0, Math.min(100, customFMax));
      if (fMax <= fMin) fMax = Math.min(100, fMin + 10);

      // 時間軸レンジ計算
      const customRange = cfg.getTimeRange ? cfg.getTimeRange() : null;
      const windowSec = cfg.windowSelect ? parseInt(cfg.windowSelect.value, 10) : 0;
      let xMin = 0;
      let xMax = 60000;
      if (customRange) {
        xMin = customRange.startTs;
        xMax = Math.max(customRange.startTs + 1000, customRange.endTs);
      } else if (viewPoints.length > 0) {
        const firstTs = viewPoints[0].ts;
        const lastTs = viewPoints[viewPoints.length - 1].ts;
        if (windowSec > 0) {
          xMax = Math.max(firstTs + windowSec * 1000, lastTs);
          xMin = xMax - windowSec * 1000;
        } else {
          xMin = firstTs;
          xMax = Math.max(firstTs + 1000, lastTs);
        }
      }
      if (!solidBg && cfg.onPlotBounds) {
        cfg.onPlotBounds({ pad, plotW, plotH, xMin, xMax });
      }

      const xToPx = (ts) => pad.left + ((ts - xMin) / Math.max(1, xMax - xMin)) * plotW;
      const tempToY = (deg) => pad.top + (1 - (deg - tMin) / Math.max(0.1, tMax - tMin)) * plotH;
      const fanToY = (pct) => pad.top + (1 - (pct - fMin) / Math.max(0.1, fMax - fMin)) * plotH;

      // グリッド & Y軸ラベル
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.lineWidth = 1;
      const gridRows = 5;
      for (let i = 0; i <= gridRows; i++) {
        const y = pad.top + (plotH * i) / gridRows;
        ctx.strokeStyle = palette.grid;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();

        // 左軸（温度）
        const degVal = tMax - ((tMax - tMin) * i) / gridRows;
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${(tMax - tMin) < 10 ? degVal.toFixed(1) : degVal.toFixed(0)}℃`, pad.left - 6, y);

        // 右軸（ファン %）
        if (seriesList.find(s => s.isFan && s.enabled)) {
          const fanVal = fMax - ((fMax - fMin) * i) / gridRows;
          ctx.textAlign = 'left';
          ctx.fillText(`${fanVal.toFixed(0)}%`, pad.left + plotW + 6, y);
        }
      }

      // X軸グリッド & 時刻ラベル
      const baseTs = cfg.getSessionStartMs() || (viewPoints.length > 0 ? viewPoints[0].ts : xMin);
      const isElapsedAxis = Boolean(cfg.timeModeSelect && cfg.timeModeSelect.value === 'elapsed');
      const formatAxisTs = (ts) => isElapsedAxis ? formatElapsedTimeLabel((ts - baseTs) / 1000) : formatTimeLabel(ts);
      const xTicks = 4;
      for (let i = 0; i <= xTicks; i++) {
        const x = pad.left + (plotW * i) / xTicks;
        ctx.strokeStyle = palette.grid;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + plotH);
        ctx.stroke();

        if (viewPoints.length > 0) {
          const tsAt = xMin + ((xMax - xMin) * i) / xTicks;
          ctx.fillStyle = palette.text;
          ctx.textAlign = i === 0 ? 'left' : (i === xTicks ? 'right' : 'center');
          ctx.textBaseline = 'top';
          ctx.fillText(formatAxisTs(tsAt), x, pad.top + plotH + 6);
        }
      }

      // 外枠
      ctx.strokeStyle = palette.axis;
      ctx.strokeRect(pad.left, pad.top, plotW, plotH);

      if (viewPoints.length === 0) {
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '13px sans-serif';
        ctx.fillText(cfg.emptyCanvasText, pad.left + plotW / 2, pad.top + plotH / 2);
        ctx.restore();
        return;
      }

      // 折れ線プロット
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.left, pad.top, plotW, plotH);
      ctx.clip();

      const bucketCount = Math.max(200, Math.floor(plotW * dpr));
      // PNG出力時は細かい波形を潰さないよう極力全点描画（20万点超のみダウンサンプル）
      const useDownsample = solidBg ? (viewPoints.length > 200000) : (viewPoints.length > bucketCount * 2);
      const spanTs = Math.max(1, xMax - xMin);

      seriesList.forEach(s => {
        if (!s.enabled) return;
        ctx.strokeStyle = s.color;
        if (solidBg && exportScale >= 2) {
          ctx.lineWidth = s.isFan ? 0.9 : 1.05;
        } else {
          ctx.lineWidth = s.isFan ? 1.8 : 2.2;
        }
        ctx.setLineDash(s.isFan ? [5, 4] : []);
        ctx.beginPath();

        let drawing = false;
        let singlePoint = null;
        let validCount = 0;

        if (!useDownsample) {
          for (let i = 0; i < viewPoints.length; i++) {
            const pt = viewPoints[i];
            const val = pt[s.key];
            if (val === null || Number.isNaN(val)) {
              drawing = false;
              continue;
            }
            const x = xToPx(pt.ts);
            const y = s.isFan ? fanToY(val) : tempToY(val);
            if (!drawing) {
              ctx.moveTo(x, y);
              drawing = true;
            } else {
              ctx.lineTo(x, y);
            }
            singlePoint = { x, y };
            validCount++;
          }
        } else {
          // 大量データ時は描画ピクセル列ごとの最小・最大値のみを描画し、形状を保ったまま超高速化
          const buckets = new Array(bucketCount);
          for (let i = 0; i < viewPoints.length; i++) {
            const pt = viewPoints[i];
            const val = pt[s.key];
            if (val === null || Number.isNaN(val)) continue;
            const b = Math.max(0, Math.min(bucketCount - 1, Math.floor(((pt.ts - xMin) / spanTs) * bucketCount)));
            const entry = buckets[b];
            if (!entry) {
              buckets[b] = { min: val, max: val, minIdx: i, maxIdx: i, tsSum: pt.ts, cnt: 1 };
            } else {
              if (val < entry.min) { entry.min = val; entry.minIdx = i; }
              if (val > entry.max) { entry.max = val; entry.maxIdx = i; }
              entry.tsSum += pt.ts;
              entry.cnt++;
            }
          }
          for (let b = 0; b < bucketCount; b++) {
            const entry = buckets[b];
            // 空バケットは単にそのピクセル列にサンプルが落ちなかっただけなので線を切らずに繋ぐ
            if (!entry) continue;
            const x = xToPx(entry.tsSum / entry.cnt);
            const valsToDraw = entry.min === entry.max
              ? [entry.min]
              : (entry.minIdx <= entry.maxIdx ? [entry.min, entry.max] : [entry.max, entry.min]);
            for (let k = 0; k < valsToDraw.length; k++) {
              const y = s.isFan ? fanToY(valsToDraw[k]) : tempToY(valsToDraw[k]);
              if (!drawing) {
                ctx.moveTo(x, y);
                drawing = true;
              } else {
                ctx.lineTo(x, y);
              }
              singlePoint = { x, y };
              validCount++;
            }
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        if (validCount === 1 && singlePoint) {
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(singlePoint.x, singlePoint.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // マウスドラッグによる範囲選択オーバーレイ
      const dragSel = !solidBg && cfg.getDragSelection ? cfg.getDragSelection() : null;
      if (dragSel && dragSel.active) {
        const sx = Math.max(pad.left, Math.min(pad.left + plotW, Math.min(dragSel.startX, dragSel.currX)));
        const ex = Math.max(pad.left, Math.min(pad.left + plotW, Math.max(dragSel.startX, dragSel.currX)));
        if (ex - sx >= 2) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
          ctx.fillRect(sx, pad.top, ex - sx, plotH);
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(sx, pad.top);
          ctx.lineTo(sx, pad.top + plotH);
          ctx.moveTo(ex, pad.top);
          ctx.lineTo(ex, pad.top + plotH);
          ctx.stroke();
        }
      }

      // ホバー時のクロスヘア & ドット（二分探索で O(log N)）
      const activeHoverX = cfg.getHoverX();
      if (!solidBg && activeHoverX !== null && viewPoints.length > 0) {
        const targetTs = xMin + ((activeHoverX - pad.left) / Math.max(1, plotW)) * spanTs;
        let lo = 0;
        let hi = viewPoints.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (viewPoints[mid].ts < targetTs) lo = mid + 1;
          else hi = mid;
        }
        let nearest = viewPoints[lo];
        let minDist = Math.abs(xToPx(nearest.ts) - activeHoverX);
        if (lo > 0) {
          const prevDist = Math.abs(xToPx(viewPoints[lo - 1].ts) - activeHoverX);
          if (prevDist < minDist) {
            minDist = prevDist;
            nearest = viewPoints[lo - 1];
          }
        }
        if (nearest && minDist <= 40) {
          const hx = xToPx(nearest.ts);
          ctx.strokeStyle = palette.crosshair;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(hx, pad.top);
          ctx.lineTo(hx, pad.top + plotH);
          ctx.stroke();
          ctx.setLineDash([]);

          const timeTitle = isElapsedAxis
            ? `経過: ${formatElapsedTimeLabel(nearest.elapsedSec)} (${formatTimeLabel(nearest.ts)})`
            : `時刻: ${formatTimeLabel(nearest.ts)} (+${nearest.elapsedSec.toFixed(1)}s)`;
          const lines = [timeTitle];
          seriesList.forEach(s => {
            if (!s.enabled) return;
            const val = nearest[s.key];
            if (val !== null && !Number.isNaN(val)) {
              const hy = s.isFan ? fanToY(val) : tempToY(val);
              ctx.fillStyle = s.color;
              ctx.beginPath();
              ctx.arc(hx, hy, 4, 0, Math.PI * 2);
              ctx.fill();
              lines.push(`${s.label}: ${s.isFan ? val.toFixed(0) + '%' : val.toFixed(2) + ' ℃'}`);
            }
          });

          if (cfg.tooltip) {
            cfg.tooltip.textContent = lines.join('\n');
            cfg.tooltip.classList.remove('hidden');
          }
        } else if (cfg.tooltip) {
          cfg.tooltip.classList.add('hidden');
        }
      } else if (!solidBg && cfg.tooltip) {
        cfg.tooltip.classList.add('hidden');
      }

      ctx.restore();
      ctx.restore();
    }

    function drawCsvChart() {
      if (csvChartCanvas) {
        drawChart(csvChartCanvas, false, 1, getCsvChartCtx());
      }
    }

    function formatCommandOutput(res) {
      if (client.scType === 'CXR') {
        const hexCode = (res.code >>> 0).toString(16).toUpperCase().padStart(8, '0');
        return `${hexCode} ${res.lines.join(' ')}`.trim();
      }
      if (client.scType === 'SW') {
        const hexCode = (res.code >>> 0).toString(16).toUpperCase().padStart(8, '0');
        if (res.lines.length === 0) return hexCode;
        return `${hexCode}\n${res.lines.join('\n')}`;
      }
      return res.lines.join('\n') || res.raw.trim();
    }

    function showExtractedErrors(codes) {
      extractedCodes = codes;
      if (!detectedErrorsBar || !detectedErrorsList) return;
      if (codes.length === 0) {
        detectedErrorsBar.classList.add('hidden');
        detectedErrorsList.innerHTML = '';
        return;
      }
      detectedErrorsList.innerHTML = '';
      codes.forEach(code => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preset-btn';
        btn.textContent = code;
        btn.title = `${code} をエラー検索で開く`;
        btn.addEventListener('click', () => jumpToErrorSearch([code]));
        detectedErrorsList.appendChild(btn);
      });
      detectedErrorsBar.classList.remove('hidden');
    }

    function jumpToErrorSearch(codes) {
      const searchInput = document.getElementById('searchInput');
      if (!searchInput || !codes.length) return;
      searchInput.value = codes.join(',');
      searchInput.dispatchEvent(new Event('input'));
      window.location.hash = '#search';
    }

    async function runInteractiveCommand(rawCmd, opts = {}) {
      const cmd = rawCmd.trim();
      if (!cmd || !client.connected) return null;

      if (cmd.toLowerCase() === 'auth') {
        await runAuth();
        return null;
      }

      if (cmd.toLowerCase() === 'lasterrlog' && client.scType === 'CXR') {
        appendLog('SYS', 'CXR モードでは ERRLOG GET 00 で最新エラーログを1件取得します...');
        const resLast = await runInteractiveCommand('ERRLOG GET 00', { timeoutMs: 1200, idleMs: 65 });
        if (resLast) {
          const textLast = (resLast.lines && resLast.lines.length > 0) ? resLast.lines.join(' ') : (resLast.raw || '');
          const codesLast = extractErrorCodes(textLast + '\n' + (resLast.raw || ''));
          if (codesLast.length > 0) showExtractedErrors(codesLast);
        }
        return resLast;
      }

      if (cmd.toLowerCase() === 'becount' && client.scType === 'SW') {
        appendLog('SYS', 'SW (Sherwood) は becount コマンド非対応のため r 800 8 を実行して算出します...');
        const resSw = await runInteractiveCommand('r 800 8', { timeoutMs: 2500, idleMs: 120 });
        if (resSw) {
          const textSw = (resSw.lines && resSw.lines.length > 0) ? resSw.lines.join('\n') : (resSw.raw || '');
          const bytesSw = parseHexBytesN(textSw, '800', 8);
          if (bytesSw) {
            const dec = decodeBecountBytes(bytesSw, 'be');
            if (dec) {
              const upStr = formatUptimeBreakdown(dec.totalSec);
              appendLog('SYS', `📊 [SW r 800 8 解析] Bringup: ${dec.bringup} 回 / Shutdown: ${dec.shutdown} 回 / 稼働時間: ${upStr} (${dec.totalSec}秒)`);
              const bc = {
                bringup: dec.bringup,
                shutdown: dec.shutdown,
                abnormal: dec.bringup - dec.shutdown,
                powerOn: upStr
              };
              lastBecount = bc;
              if (bcPowerOnEl) bcPowerOnEl.textContent = bc.powerOn;
              if (bcBringupEl) bcBringupEl.textContent = `${bc.bringup.toLocaleString()} 回`;
              if (bcShutdownEl) bcShutdownEl.textContent = `${bc.shutdown.toLocaleString()} 回`;
              if (bcAbnormalEl) {
                bcAbnormalEl.textContent = `${bc.abnormal} 回`;
                bcAbnormalEl.classList.toggle('becount-warn', bc.abnormal > 0);
              }
            }
          }
        }
        return resSw;
      }

      appendLog('TX', cmd);
      try {
        const lowerCmd = cmd.toLowerCase();
        const effectiveOpts = { ...opts };
        if (effectiveOpts.timeoutMs === undefined) {
          if (lowerCmd === 'eepcsum' || lowerCmd === 'bringup' || lowerCmd === 'shutdown' || lowerCmd === 'powersw') {
            effectiveOpts.timeoutMs = 3500;
          } else if (lowerCmd === 'errlog' || lowerCmd === 'lasterrlog' || lowerCmd.startsWith('fantbl ') || lowerCmd.startsWith('r ')) {
            effectiveOpts.timeoutMs = 2500;
          }
        }
        if (effectiveOpts.idleMs === undefined) {
          if (lowerCmd === 'eepcsum') {
            effectiveOpts.idleMs = 450;
          } else if (lowerCmd === 'bringup' || lowerCmd === 'shutdown' || lowerCmd === 'powersw') {
            effectiveOpts.idleMs = 200;
          } else if (lowerCmd === 'errlog' || lowerCmd === 'lasterrlog' || lowerCmd.startsWith('fantbl ') || lowerCmd.startsWith('r ')) {
            effectiveOpts.idleMs = 120;
          }
        }
        const res = await client.command(cmd, effectiveOpts);
        rttBadge.textContent = `応答速度: ${res.rttMs} ms`;
        const out = formatCommandOutput(res);
        appendLog(res.timeout ? 'ERR' : 'RX', `${out || '(応答なし)'}  [${res.rttMs}ms]`);

        if (/errlog/i.test(cmd)) {
          const codes = extractErrorCodes(out + '\n' + res.raw);
          if (codes.length > 0) showExtractedErrors(codes);
        }
        return res;
      } catch (err) {
        appendLog('ERR', err.message);
        return null;
      }
    }

    function resetVoltCurrentDisplay(text = '現在の設定: 未取得（Syscon 接続後に自動取得されます）') {
      if (voltCurrentInfo) voltCurrentInfo.textContent = text;
    }

    function resetBecountDisplay(text = '--') {
      lastBecount = null;
      if (bcPowerOnEl) bcPowerOnEl.textContent = text;
      if (bcBringupEl) bcBringupEl.textContent = text;
      if (bcShutdownEl) bcShutdownEl.textContent = text;
      if (bcAbnormalEl) {
        bcAbnormalEl.textContent = text;
        bcAbnormalEl.classList.remove('becount-warn');
      }
    }

    async function fetchBecountSummary() {
      if (!client.connected || !client.authenticated) return;
      if (client.scType === 'CXR') {
        resetBecountDisplay('CXR非対応');
        return;
      }
      try {
        let bc = null;
        if (client.scType === 'SW') {
          // Sherwood (SW) は becount コマンド非対応のため標準アドレス 0x800 (8バイト BE) を参照
          const resSw = await client.command('r 800 8', { timeoutMs: 2500, idleMs: 120 });
          const rawSw = resSw ? ((resSw.lines && resSw.lines.length > 0) ? resSw.lines.join('\n') : (resSw.raw || '')) : '';
          const bytesSw = parseHexBytesN(rawSw, '800', 8);
          if (bytesSw) {
            const dec = decodeBecountBytes(bytesSw, 'be');
            if (dec) {
              bc = {
                bringup: dec.bringup,
                shutdown: dec.shutdown,
                abnormal: dec.bringup - dec.shutdown,
                powerOn: formatUptimeBreakdown(dec.totalSec)
              };
            }
          }
        } else {
          const res = await client.command('becount', { timeoutMs: 1800, idleMs: 70 });
          const combined = (res.lines && res.lines.join('\n')) + '\n' + res.raw;
          bc = parseBecount(combined);
        }
        if (!bc) {
          resetBecountDisplay('取得不可');
          return;
        }
        lastBecount = bc;
        if (bcPowerOnEl) bcPowerOnEl.textContent = bc.powerOn || '--';
        if (bcBringupEl) bcBringupEl.textContent = bc.bringup !== null ? `${bc.bringup.toLocaleString()} 回` : '--';
        if (bcShutdownEl) bcShutdownEl.textContent = bc.shutdown !== null ? `${bc.shutdown.toLocaleString()} 回` : '--';
        if (bcAbnormalEl) {
          if (bc.abnormal !== null) {
            bcAbnormalEl.textContent = `${bc.abnormal.toLocaleString()} 回`;
            bcAbnormalEl.classList.toggle('becount-warn', bc.abnormal > 0);
          } else {
            bcAbnormalEl.textContent = '--';
            bcAbnormalEl.classList.remove('becount-warn');
          }
        }
      } catch (_) {
        resetBecountDisplay('取得失敗');
      }
    }

    async function runAuth() {
      if (!client.connected) return;
      appendLog('SYS', `AUTH 認証を開始 (${client.scType})...`);
      try {
        const res = await client.auth();
        rttBadge.textContent = `応答速度: ${res.rttMs} ms`;
        appendLog(res.ok ? 'SYS' : 'ERR', `${res.message} [${res.rttMs}ms]`);
        updateUiState();
        if (res.ok) {
          syncVoltArchFromClient();
          await fetchBecountSummary();
          if (client.scType !== 'CXR') {
            await readCurrentVoltages(true);
            await readAllFanTables(true);
          } else {
            resetVoltCurrentDisplay('現在の設定: CXR モード非対応（CXRF 内部モードまたは SW で取得可能）');
          }
        }
      } catch (err) {
        appendLog('ERR', `AUTH エラー: ${err.message}`);
      }
    }

    const fastPollChannel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
    if (fastPollChannel) {
      fastPollChannel.port1.onmessage = () => {
        if (isPolling && client.connected) {
          runPollCycle();
        }
      };
    }

    // バックグラウンドタブ時のブラウザによるタイマー大幅遅延(1分制限等)を緩和するための Worker タイマー
    let pollWorker = null;
    try {
      const workerSrc = 'let t=null;self.onmessage=e=>{if(t!==null){clearTimeout(t);t=null;}if(e.data&&e.data.cmd==="start"){t=setTimeout(()=>{t=null;self.postMessage("tick");},Math.max(0,e.data.delay||0));}};';
      const workerBlob = new Blob([workerSrc], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      pollWorker = new Worker(workerUrl);
      URL.revokeObjectURL(workerUrl);
      pollWorker.onmessage = () => {
        if (isPolling && client.connected) {
          runPollCycle();
        }
      };
    } catch (_) {
      pollWorker = null;
    }

    function clearScheduledPoll() {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      if (pollWorker) {
        pollWorker.postMessage({ cmd: 'stop' });
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (records.length > 0) drawChart();
        if (csvRecords.length > 0) drawCsvChart();
      }
    });

    function getPollIntervalMs() {
      const v = parseInt(pollIntervalSelect.value, 10);
      return Number.isNaN(v) ? 1000 : Math.max(0, v);
    }

    async function runPollCycle() {
      if (!isPolling || !client.connected || pollInFlight) return;
      pollInFlight = true;
      const sweepStart = performance.now();
      const intervalMs = getPollIntervalMs();
      const adaptiveIdle = intervalMs <= 100 ? 10 : (intervalMs <= 250 ? 20 : 40);
      const adaptiveTimeout = Math.max(350, Math.min(1200, intervalMs <= 250 ? 400 : 800));

      const fastTelemetryMatcher = (client.scType === 'CXRF')
        ? (buf) => {
            if (!(buf.includes('\n') || buf.includes('\r'))) return false;
            if (/(?:^|[\r\n])(?:\[[^\]]+\]\s*\$|>\$?|\$)\s*$/.test(buf)) return true;
            const lines = buf.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
              if (/Temperature\s*:|CrntDuty|\d+(?:\.\d+)?\s*%/i.test(lines[i])) {
                return true;
              }
            }
            return false;
          }
        : null;

      try {
        const sample = {
          ts: Date.now(),
          elapsedSec: sessionStartMs ? (Date.now() - sessionStartMs) / 1000 : 0,
          cell: null,
          rsx: null,
          sb: null,
          fan: null,
          fanHex: null,
          sweepMs: 0
        };

        const tasks = [
          { key: 'cell', cmd: 'tmp 0',      el: valCell, parser: parseTemperature },
          { key: 'rsx',  cmd: 'tmp 1',      el: valRsx,  parser: parseTemperature },
          { key: 'sb',   cmd: 'tmp 14',     el: valSb,   parser: parseTemperature },
          { key: 'fan',  cmd: 'duty get 0', el: valFan,  parser: parseFanDuty }
        ];

        for (const t of tasks) {
          if (!isPolling || !client.connected) break;
          if (!t.cmd) {
            t.el.textContent = '--';
            continue;
          }
          const useFast = fastTelemetryMatcher && /^tmp\b|^duty\b/i.test(t.cmd);
          const res = await client.command(t.cmd, {
            silent: true,
            timeoutMs: adaptiveTimeout,
            idleMs: adaptiveIdle,
            doneMatcher: useFast ? fastTelemetryMatcher : null
          });
          const text = (res.lines && res.lines.join(' ')) || res.raw;
          const parsed = t.parser(text);
          if (parsed !== null) {
            t.el.textContent = parsed.label;
            if (t.key === 'fan') {
              sample.fan = parsed.pct;
              sample.fanHex = parsed.hex;
            } else {
              sample[t.key] = parsed.num;
            }
          }
          rttBadge.textContent = `応答速度: ${res.rttMs} ms`;
        }

        const sweepMs = Math.round(performance.now() - sweepStart);
        sample.sweepMs = sweepMs;
        pollSweepBadge.textContent = `1周取得時間: ${sweepMs} ms`;

        if (isPolling && client.connected) {
          if (!sessionStartMs) {
            sessionStartMs = sample.ts;
            sample.elapsedSec = 0;
          } else {
            sample.elapsedSec = (sample.ts - sessionStartMs) / 1000;
          }
          records.push(sample);
          if (records.length > MAX_RECORDS + 2000) {
            records.splice(0, records.length - MAX_RECORDS);
          }
          updateMiniTelemetry(sample);
          updateRecordControls();
          const nowDraw = performance.now();
          if (!document.hidden && (records.length <= 5000 || (nowDraw - lastChartPollDrawMs) >= 80)) {
            lastChartPollDrawMs = nowDraw;
            drawChart();
          }
        }
      } catch (err) {
        appendLog('ERR', `監視エラー: ${err.message}`);
        stopPolling();
      } finally {
        pollInFlight = false;
        if (isPolling && client.connected) {
          const elapsed = performance.now() - sweepStart;
          const nextDelay = Math.max(0, intervalMs - elapsed);
          if (nextDelay === 0 && fastPollChannel && !document.hidden) {
            fastPollChannel.port2.postMessage(null);
          } else if (pollWorker) {
            pollWorker.postMessage({ cmd: 'start', delay: nextDelay });
          } else {
            pollTimer = setTimeout(runPollCycle, nextDelay);
          }
        }
      }
    }

    function startPolling() {
      if (!client.connected || isPolling) return;
      isPolling = true;
      if (!sessionStartMs) sessionStartMs = Date.now();
      updateUiState();
      const intervalMs = getPollIntervalMs();
      const intervalLabel = intervalMs === 0 ? '最速 (待機なし連続)' : `${intervalMs} ms 間隔`;
      appendLog('SYS', `リアルタイム監視を開始 (${intervalLabel})`);
      runPollCycle();
    }

    function stopPolling() {
      if (!isPolling && !pollTimer) return;
      isPolling = false;
      clearScheduledPoll();
      pollSweepBadge.textContent = '1周取得時間: -- ms';
      updateUiState();
    }

    client.onLog = (type, msg) => appendLog(type, msg);
    client.onSpontaneousLog = (msg) => {
      appendLog('RX', msg);
    };
    if (bootLogToggleCb) {
      const savedBootLog = localStorage.getItem('uartBootLogMonitor');
      if (savedBootLog !== null) {
        bootLogToggleCb.checked = savedBootLog === 'true';
      }
      client.streamBootLogs = bootLogToggleCb.checked;
      bootLogToggleCb.addEventListener('change', () => {
        client.streamBootLogs = bootLogToggleCb.checked;
        localStorage.setItem('uartBootLogMonitor', String(bootLogToggleCb.checked));
        if (bootLogToggleCb.checked) {
          client.flushSpontaneousBuffer(true);
        }
        appendLog('SYS', `起動/YLODログ監視を ${bootLogToggleCb.checked ? 'ON' : 'OFF'} にしました`);
      });
    }
    client.onDisconnect = () => {
      stopPolling();
      resetVoltCurrentDisplay();
      appendLog('SYS', 'シリアルポートが切断されました');
      updateUiState();
    };

    function showWizard(state, title, bodyHtml, actions = []) {
      if (!wizardBox) return;
      wizardBox.classList.remove('hidden', 'wizard-ok', 'wizard-err');
      if (state === 'ok') wizardBox.classList.add('wizard-ok');
      if (state === 'err') wizardBox.classList.add('wizard-err');
      wizardTitle.textContent = title;
      wizardBody.innerHTML = bodyHtml;
      wizardActions.innerHTML = '';
      actions.forEach(act => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = act.className || 'uart-btn uart-btn-primary';
        btn.textContent = act.label;
        btn.addEventListener('click', act.onClick);
        wizardActions.appendChild(btn);
      });
    }

    function hideWizard() {
      if (!wizardBox) return;
      wizardBox.classList.add('hidden');
      wizardActions.innerHTML = '';
    }

    function syncConnStyleUI() {
      const isAuto = connStyleAutoRadio ? connStyleAutoRadio.checked : false;
      if (autoPanel) autoPanel.classList.toggle('hidden', !isAuto);
      if (manualPanel) manualPanel.classList.toggle('hidden', isAuto);
    }

    if (connStyleAutoRadio) connStyleAutoRadio.addEventListener('change', syncConnStyleUI);
    if (connStyleManualRadio) connStyleManualRadio.addEventListener('change', syncConnStyleUI);
    syncConnStyleUI();

    async function fixEepcsum(silentIfOk = false) {
      if (!client.connected) return { ok: false, reason: '未接続です' };
      if (client.scType === 'CXR') {
        const msg = 'eepcsum の確認・自動修正は CXRF または SW で接続時のみ実行できます。';
        appendLog('ERR', msg);
        return { ok: false, reason: msg };
      }

      const wasPolling = isPolling;
      if (wasPolling) stopPolling();
      try {
        appendLog('SYS', 'eepcsum を実行してチェックサムを確認中...');
        const res1 = await client.command('eepcsum', { timeoutMs: 3500, idleMs: 350 });
        const out1 = formatCommandOutput(res1);
        appendLog('RX', out1 || res1.raw.trim());

        const text1 = res1.raw || (res1.lines ? res1.lines.join('\n') : '');
        const mismatches = parseEepcsumMismatches(text1);
        if (mismatches.length === 0) {
          if (!silentIfOk) {
            appendLog('SYS', '✅ チェックサムの不整合はありません（修正不要）');
          }
          return { ok: true, fixedCount: 0 };
        }

        const manualItems = mismatches.filter(m => m.manualRequired || !m.cmd);
        if (manualItems.length > 0) {
          const detail = manualItems.map(m => `Addr:0x${m.addr} -> ${m.expected}`).join(', ');
          const msg = `自動書き換え対象外の形式が含まれているため停止しました: ${detail}`;
          appendLog('ERR', msg);
          return { ok: false, reason: msg };
        }

        for (const item of mismatches) {
          appendLog('SYS', `不整合検出 (Addr: 0x${item.addr} / 期待値: ${item.expected}) → "${item.cmd}" を実行します`);
          appendLog('TX', item.cmd);
          const wRes = await client.command(item.cmd, { timeoutMs: 1800, idleMs: 120 });
          appendLog('RX', formatCommandOutput(wRes) || wRes.raw.trim());
          await sleep(80);
        }

        await sleep(100);
        appendLog('SYS', '修正後の再検証 (eepcsum) を実行中...');
        const res2 = await client.command('eepcsum', { timeoutMs: 3500, idleMs: 350 });
        appendLog('RX', formatCommandOutput(res2) || res2.raw.trim());
        const text2 = res2.raw || (res2.lines ? res2.lines.join('\n') : '');
        const remain = parseEepcsumMismatches(text2);
        if (remain.length === 0) {
          appendLog('SYS', `✅ チェックサムの修正と再検証が完了しました（修正 ${mismatches.length} 件）`);
          return { ok: true, fixedCount: mismatches.length };
        }
        const msg = `再検証でも不整合が残っています (${remain.length} 件)`;
        appendLog('ERR', msg);
        return { ok: false, reason: msg };
      } finally {
        if (wasPolling && client.connected) startPolling();
      }
    }

    async function reconnectCxrfAndFixChecksum() {
      try {
        showWizard('warn', '⏳ CXRF (115200 bps) で再接続中...', 'AUTH 認証とチェックサム確認を実行しています。しばらくお待ちください。');
        if (client.connected) {
          await client.disconnect(false);
          await sleep(100);
        }
        let port = lastWizardPort || client.port;
        if (port) {
          try {
            await client.connectPort(port, 'CXRF');
          } catch (_) {
            port = await client.requestPort();
            lastWizardPort = port;
            await client.connectPort(port, 'CXRF');
          }
        } else {
          await client.connect('CXRF');
          lastWizardPort = client.port;
        }
        updateUiState();
        appendLog('SYS', 'CXRF (115200 bps) で再接続しました。AUTH を実行します...');

        const authRes = await client.auth({ retries: 3 });
        updateUiState();
        if (!authRes.ok) {
          showWizard(
            'err',
            '❌ CXRF での AUTH 認証に失敗しました',
            'DIAG ピンが GND に確実に接地されているか、また AC 電源の入れ直し（スタンバイ状態）が完了しているか確認して再試行してください。',
            [{ label: '🔄 もう一度再接続して試す', onClick: reconnectCxrfAndFixChecksum }]
          );
          return;
        }
        appendLog('SYS', `Auth successful [${authRes.rttMs}ms]`);
        syncVoltArchFromClient();
        await fetchBecountSummary();
        await readCurrentVoltages(true);
        await readAllFanTables(true);

        const fixRes = await fixEepcsum(false);
        if (fixRes.ok) {
          const msg = fixRes.fixedCount > 0
            ? `チェックサムを ${fixRes.fixedCount} 件自動修正し、正常状態を確認しました。このまま温度監視や各種内部コマンドを使用できます（通常起動に戻す際は作業後に DIAG 線を外して電源を入れ直してください）。`
            : 'チェックサムの不整合はありませんでした。CXRF 内部モードで接続完了しています。';
          showWizard('ok', '🎉 Mullion 内部モード (CXRF) 準備完了', msg);
        } else {
          showWizard('err', '⚠️ チェックサム自動修正でエラーが発生しました', fixRes.reason, [
            { label: '🛠 チェックサム修正を再試行', onClick: reconnectCxrfAndFixChecksum }
          ]);
        }
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          appendLog('ERR', `再接続エラー: ${err.message}`);
          showWizard('err', '❌ 再接続に失敗しました', err.message, [
            { label: '🔄 再試行', onClick: reconnectCxrfAndFixChecksum }
          ]);
        }
      }
    }

    async function connectAutoMode() {
      const model = autoModelSelect ? autoModelSelect.value : 'MULLION';
      hideWizard();

      if (model === 'SW') {
        await client.connect('SW');
        lastWizardPort = client.port;
        appendLog('SYS', '自動モード (SW): 57600 bps で接続しました');
        updateUiState();
        await runAuth();
        return;
      }

      // Mullion 自動フロー: まず CXRF (115200bps) を試行
      await client.connect('CXRF');
      lastWizardPort = client.port;
      appendLog('SYS', '自動モード (Mullion): まず CXRF (115200 bps) で内部モードを確認中...');
      updateUiState();

      const cxrfAuth = await client.auth({ retries: 2, silent: true });
      if (cxrfAuth.ok) {
        appendLog('SYS', `✅ 内部モード (CXRF) 接続・AUTH 成功 [${cxrfAuth.rttMs}ms]`);
        updateUiState();
        syncVoltArchFromClient();
        await fetchBecountSummary();
        await readCurrentVoltages(true);
        await readAllFanTables(true);
        const fixRes = await fixEepcsum(true);
        if (fixRes.ok && fixRes.fixedCount > 0) {
          showWizard('ok', '🎉 CXRF 接続 ＆ チェックサム自動修正完了', `起動時に検出されたチェックサム不整合 (${fixRes.fixedCount} 件) も自動修正しました。`);
        } else if (!fixRes.ok) {
          showWizard('err', '⚠️ チェックサム確認エラー', fixRes.reason);
        } else {
          showWizard('ok', '✅ Mullion 内部モード (CXRF) で接続しました', 'すでに内部モードが有効です。そのままリアルタイム監視や各種コマンドを利用できます。');
        }
        return;
      }

      // CXRF が通らなければ同じポートを 57600bps (CXR) へ切り替えて確認
      appendLog('SYS', 'CXRF 未応答のため CXR (57600 bps) に切り替えて状態を確認します...');
      await client.reopenAs('CXR');
      updateUiState();

      const cxrAuth = await client.auth({ retries: 3 });
      updateUiState();
      if (!cxrAuth.ok) {
        appendLog('ERR', `CXR AUTH 失敗: ${cxrAuth.message}`);
        showWizard('err', '❌ Mullion 接続・AUTH 認証に失敗しました', 'TX/RX のクロス配線、3.3V TTL アダプタ、スタンバイ電源（赤ランプ）が繋がっているか確認してください。');
        return;
      }
      appendLog('SYS', `CXR AUTH 成功 [${cxrAuth.rttMs}ms]`);

      appendLog('SYS', '内部モード有効フラグ (EEP GET 3961 01) を確認中...');
      const getRes = await client.command('EEP GET 3961 01', { timeoutMs: 2000 });
      const val3961 = (getRes.lines[0] || '').trim().toUpperCase();
      appendLog('RX', `EEP GET 3961 01 → ${val3961 || formatCommandOutput(getRes)}`);

      if (getRes.code !== 0 || !/^[0-9A-F]{2}$/.test(val3961)) {
        showWizard('err', '⚠️ EEPROM 0x3961 の読み取りに失敗しました', `取得値: "${formatCommandOutput(getRes)}"。コンソールから手動で確認してください。`);
        return;
      }

      if (val3961 === '00') {
        showWizard(
          'warn',
          '🔌 内部モードフラグ (0x3961) は既に有効 (00) です',
          'EEPROM の設定は既に <code>00</code> になっていますが、現在 <code>CXRF (115200bps)</code> で応答しませんでした。<br>' +
          '1. AC電源を一度抜く（主電源OFF）<br>' +
          '2. 基板上の <strong>DIAG ランドを GND に接続（接地）</strong> する<br>' +
          '3. 再びスタンバイ電源を入れる<br>' +
          'その後、下のボタンを押すと <code>CXRF</code> へ再接続してチェックサムも確認・修正します。',
          [{ label: '🔄 再接続（CXRF 確認 ＆ サム修正）', onClick: reconnectCxrfAndFixChecksum }]
        );
        return;
      }

      // FF 等の場合は自動で 00 へ書き換えて確認
      appendLog('SYS', `0x3961 が "${val3961}" のため、内部モードを有効化 (EEP SET 3961 01 00) します...`);
      const setRes = await client.command('EEP SET 3961 01 00', { timeoutMs: 2000 });
      if (setRes.code !== 0) {
        appendLog('ERR', `EEP SET 3961 01 00 失敗: ${formatCommandOutput(setRes)}`);
        showWizard('err', '❌ 0x3961 の書き換えに失敗しました', formatCommandOutput(setRes));
        return;
      }

      const verifyRes = await client.command('EEP GET 3961 01', { timeoutMs: 2000 });
      const verifiedVal = (verifyRes.lines[0] || '').trim().toUpperCase();
      appendLog('RX', `検証 EEP GET 3961 01 → ${verifiedVal}`);
      if (verifiedVal !== '00') {
        showWizard('err', '❌ 書き換え後の検証に失敗しました', `0x3961 が "${verifiedVal}" のままです。`);
        return;
      }

      // 電源入り切り案内を出し、いったんポートを閉じてスタンバイ再投入に備える
      await client.disconnect(false);
      updateUiState();

      showWizard(
        'warn',
        '⚡ ステップ 2/3: 電源の入り切り ＆ DIAG 接地を行ってください',
        'EEPROM <code>0x3961</code> を <code>' + val3961 + '</code> → <code>00</code> に書き換えました（サム未修正のため電源投入時にピピピッと鳴りますが正常です）。<br>' +
        '<strong>1.</strong> PS3 の主電源（AC ケーブル）を一度抜く<br>' +
        '<strong>2.</strong> 基板上の <strong>DIAG ピンを GND に接地</strong> する<br>' +
        '<strong>3.</strong> 再び AC 電源を繋いでスタンバイ状態にする<br>' +
        '完了したら下のボタンを押してください。自動で <code>CXRF (115200bps)</code> に再接続し、<code>eepcsum</code> の修正まで実行します。',
        [{ label: '🔄 電源入れ直し完了・再接続してサム自動修正', onClick: reconnectCxrfAndFixChecksum }]
      );
    }

    connectBtn.addEventListener('click', async () => {
      const isAuto = connStyleAutoRadio && connStyleAutoRadio.checked;
      try {
        if (isAuto) {
          await connectAutoMode();
        } else {
          hideWizard();
          const scType = scTypeSelect.value;
          await client.connect(scType);
          lastWizardPort = client.port;
          appendLog('SYS', `接続しました (${scType} / ${client.getBaudRate(scType)} bps)`);
          updateUiState();
          if (autoAuthCheckbox.checked) {
            await runAuth();
          }
        }
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          appendLog('ERR', `接続失敗: ${err.message}`);
        }
      }
    });

    disconnectBtn.addEventListener('click', async () => {
      stopPolling();
      await client.disconnect();
      hideWizard();
      cachedOrigP0[0] = null;
      cachedOrigP0[1] = null;
      resetBecountDisplay('--');
      resetVoltCurrentDisplay();
      updateMiniTelemetry(null);
      appendLog('SYS', '切断しました');
      updateUiState();
    });

    authBtn.addEventListener('click', runAuth);

    if (refreshBecountBtn) {
      refreshBecountBtn.addEventListener('click', fetchBecountSummary);
    }

    if (fixEepcsumBtn) {
      fixEepcsumBtn.addEventListener('click', () => {
        if (!isQuickDiagButtonEnabled('eepcsumFix')) return;
        fixEepcsum(false);
      });
    }

    // 一時ファン固定モード（fantbl set 0/1 p0 ＋ 元の制御に戻す）UI・送信
    function updateTempFanPreview() {
      if (!tempFanSlider || !tempFanPreview) return;
      const pct = Math.max(20, Math.min(100, parseInt(tempFanSlider.value, 10) || 40));
      const dec = Math.round((pct / 100) * 255);
      const hex = '0x' + dec.toString(16).toUpperCase().padStart(2, '0');
      const upperRaw = parseFloat((tempFanUpper ? tempFanUpper.value : '90.00').trim());
      const upperStr = (!Number.isNaN(upperRaw) && upperRaw >= 40 && upperRaw <= 105)
        ? upperRaw.toFixed(2)
        : '90.00';

      if (tempFanDisplay) tempFanDisplay.textContent = `${pct}% (${hex})`;
      if (tempFanBadge) tempFanBadge.textContent = `設定: ${pct}% (${hex})`;
      tempFanPreview.textContent =
        `fantbl set 0 p0 00.00 ${upperStr} ${hex}\n` +
        `fantbl set 1 p0 00.00 ${upperStr} ${hex}`;

      tempFanPresets.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.getAttribute('data-pct'), 10) === pct);
      });
      return { pct, hex, upperStr };
    }

    if (tempFanSlider) {
      tempFanSlider.addEventListener('input', updateTempFanPreview);
    }
    if (tempFanUpper) {
      tempFanUpper.addEventListener('input', updateTempFanPreview);
    }
    tempFanPresets.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!tempFanSlider) return;
        tempFanSlider.value = btn.getAttribute('data-pct');
        updateTempFanPreview();
      });
    });
    updateTempFanPreview();

    async function ensureOriginalP0(zone) {
      if (cachedOrigP0[zone]) return cachedOrigP0[zone];
      const res = await client.command(`fantbl getini ${zone}`, { timeoutMs: 2000, idleMs: 80, silent: true });
      const combined = (res.lines && res.lines.join('\n')) + '\n' + res.raw;
      const parsed = parseFantblP0(combined);
      if (parsed) {
        cachedOrigP0[zone] = parsed;
      }
      return parsed;
    }

    if (applyTempFanBtn) {
      applyTempFanBtn.addEventListener('click', async () => {
        if (!client.connected) return;
        if (client.scType === 'CXR') {
          appendLog('ERR', 'fantbl set は CXRF（内部モード）または対応する SW で接続時のみ実行できます。');
          return;
        }
        const info = updateTempFanPreview();
        if (info.pct < 30) {
          const hostWin = applyTempFanBtn.ownerDocument.defaultView || window;
          const ok = hostWin.confirm(
            `ファン速度を ${info.pct}% (${info.hex}) の低回転で一時固定します。\n` +
            '負荷時に過熱する恐れがあります。実温度を監視しながら実行しますか？'
          );
          if (!ok) return;
        }
        // 上書き前に元の EEPROM p0 設定を控えておく
        await ensureOriginalP0(0);
        await ensureOriginalP0(1);

        const cmd0 = `fantbl set 0 p0 00.00 ${info.upperStr} ${info.hex}`;
        const cmd1 = `fantbl set 1 p0 00.00 ${info.upperStr} ${info.hex}`;
        await runInteractiveCommand(cmd0, { timeoutMs: 1500 });
        await runInteractiveCommand(cmd1, { timeoutMs: 1500 });
        appendLog('SYS', `一時ファン固定 (${info.pct}% / ${info.hex} / 上限 ${info.upperStr}℃) を CELL・RSX に適用しました`);
      });
    }

    if (restoreTempFanBtn) {
      restoreTempFanBtn.addEventListener('click', async () => {
        if (!client.connected) return;
        if (client.scType === 'CXR') {
          appendLog('ERR', '元の制御への復元は CXRF（内部モード）または対応する SW で実行してください。');
          return;
        }
        appendLog('SYS', 'EEPROM の初期設定 (fantbl getini) を読み出して元のファン制御に戻します...');
        const p0Cell = await ensureOriginalP0(0);
        const p0Rsx = await ensureOriginalP0(1);
        if (!p0Cell || !p0Rsx) {
          appendLog('ERR', 'fantbl getini から元の p0 を取得できませんでした（電源を入れ直すと元の制御に戻ります）。');
          return;
        }
        const cmd0 = `fantbl set 0 p0 ${p0Cell.tempD} ${p0Cell.tempU} ${p0Cell.duty}`;
        const cmd1 = `fantbl set 1 p0 ${p0Rsx.tempD} ${p0Rsx.tempU} ${p0Rsx.duty}`;
        await runInteractiveCommand(cmd0, { timeoutMs: 1500 });
        await runInteractiveCommand(cmd1, { timeoutMs: 1500 });
        appendLog('SYS', '✅ 元のファン制御（EEPROM p0 設定）に復元しました');
      });
    }

    // ==========================================
    // 5. 電圧変更（CELL / RSX Vcore 調整）
    // ==========================================
    let currentVoltArch = 'MULLION';

    function getVoltConfig() {
      return VID_TABLES[currentVoltArch] || VID_TABLES.MULLION;
    }

    function getSortedVoltEntries(cfg) {
      return [...cfg.entries].sort((a, b) => a.v - b.v);
    }

    function lookupVoltByHex(cfg, hexStr) {
      if (!hexStr) return null;
      const hx = hexStr.toUpperCase().padStart(2, '0');
      if (hx === 'FF') return '純正設定 (デフォルト)';
      const hit = cfg.entries.find(e => e.hex === hx);
      return hit ? `${hit.v.toFixed(cfg.decimals)} V` : '不明/テーブル外';
    }

    function syncVoltArchFromClient() {
      if (!client.connected) return;
      currentVoltArch = client.scType === 'SW' ? 'SW' : 'MULLION';
      populateVoltSelects();
    }

    function syncVoltSliderFromSelect(which, fallbackHex = null) {
      const cfg = getVoltConfig();
      const sorted = getSortedVoltEntries(cfg);
      const sel = which === 'cell' ? voltCellSelect : voltRsxSelect;
      const slider = which === 'cell' ? voltCellSlider : voltRsxSlider;
      const badge = which === 'cell' ? voltCellSliderVal : voltRsxSliderVal;
      if (!sel || !slider || sorted.length === 0) return;

      slider.min = '0';
      slider.max = String(sorted.length - 1);

      const val = sel.value;
      if (!val) {
        if (badge) badge.textContent = '未変更';
        if (fallbackHex) {
          const fbIdx = sorted.findIndex(e => e.hex === fallbackHex.toUpperCase());
          if (fbIdx >= 0) slider.value = String(fbIdx);
        }
        return;
      }
      if (val === 'FF') {
        if (badge) badge.textContent = '純正 (FF)';
        return;
      }
      const idx = sorted.findIndex(e => e.hex === val.toUpperCase());
      if (idx >= 0) {
        slider.value = String(idx);
        const entry = sorted[idx];
        if (badge) badge.textContent = `${entry.v.toFixed(cfg.decimals)} V (${entry.hex})`;
      }
    }

    function populateVoltSelects() {
      if (!voltCellSelect || !voltRsxSelect) return;
      const cfg = getVoltConfig();
      const sorted = getSortedVoltEntries(cfg);
      if (voltBadge) voltBadge.textContent = `テーブル: ${cfg.label}`;

      if (sorted.length > 0) {
        const minLbl = `最低: ${sorted[0].v.toFixed(cfg.decimals)} V`;
        const maxLbl = `最高: ${sorted[sorted.length - 1].v.toFixed(cfg.decimals)} V`;
        if (voltCellMinLabel) voltCellMinLabel.textContent = minLbl;
        if (voltCellMaxLabel) voltCellMaxLabel.textContent = maxLbl;
        if (voltRsxMinLabel) voltRsxMinLabel.textContent = minLbl;
        if (voltRsxMaxLabel) voltRsxMaxLabel.textContent = maxLbl;
      }

      const prevCell = voltCellSelect.value;
      const prevRsx = voltRsxSelect.value;

      [voltCellSelect, voltRsxSelect].forEach((sel, idx) => {
        sel.innerHTML = '';
        const optSkip = document.createElement('option');
        optSkip.value = '';
        optSkip.textContent = '変更しない（スキップ）';
        sel.appendChild(optSkip);

        const optStock = document.createElement('option');
        optStock.value = 'FF';
        optStock.textContent = 'FF — 純正設定に戻す（デフォルト）';
        sel.appendChild(optStock);

        cfg.entries.forEach(entry => {
          const opt = document.createElement('option');
          opt.value = entry.hex;
          opt.textContent = `${entry.v.toFixed(cfg.decimals)} V (HEX: ${entry.hex})`;
          sel.appendChild(opt);
        });

        const prev = idx === 0 ? prevCell : prevRsx;
        if (prev && Array.from(sel.options).some(o => o.value === prev)) {
          sel.value = prev;
        }
      });

      syncVoltSliderFromSelect('cell');
      syncVoltSliderFromSelect('rsx');
      updateVoltPreview();
    }

    function updateVoltPreview() {
      if (!voltPreview) return;
      const cfg = getVoltConfig();
      const cVal = voltCellSelect ? voltCellSelect.value : '';
      const rVal = voltRsxSelect ? voltRsxSelect.value : '';
      const cmds = [];
      if (cVal) cmds.push(`w ${cfg.cellAddr} ${cVal}   # CELL: ${lookupVoltByHex(cfg, cVal)}`);
      if (rVal) cmds.push(`w ${cfg.rsxAddr} ${rVal}   # RSX: ${lookupVoltByHex(cfg, rVal)}`);
      if (voltAutoCsumCb && voltAutoCsumCb.checked && cmds.length > 0) {
        cmds.push('eepcsum (+ 不整合時の w 自動修正)');
      }
      voltPreview.textContent = cmds.length > 0
        ? cmds.join('\n')
        : '（CELL または RSX の目標電圧を選択してください）';
    }

    function parseSingleByteRead(text, addrHex) {
      if (!text) return null;
      const cleanAddr = addrHex.replace(/^0+/, '') || '0';
      const reAddr = new RegExp(`\\b0*${cleanAddr}\\b[\\s:]+([0-9A-Fa-f]{2})\\b`, 'i');
      let m = text.match(reAddr);
      if (m) return m[1].toUpperCase();
      m = text.match(/(?:OK\s+)?[0-9A-Fa-f]{8}\s+([0-9A-Fa-f]{2})\b/i);
      if (m) return m[1].toUpperCase();
      const lines = text.replace(/\r/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        if (/^r\s+/i.test(lines[i])) continue;
        const tok = lines[i].match(/\b([0-9A-Fa-f]{2})\b/);
        if (tok) return tok[1].toUpperCase();
      }
      return null;
    }

    async function readCurrentVoltages(silent = false) {
      const isSilent = silent === true;
      if (!client.connected) return;
      if (client.scType === 'CXR') {
        if (!isSilent) {
          appendLog('ERR', '電圧読み取り (r コマンド) は CXRF または SW で接続時のみ実行できます。');
        } else {
          resetVoltCurrentDisplay('現在の設定: CXR モード非対応（CXRF 内部モードまたは SW で取得可能）');
        }
        return;
      }
      try {
        const cfg = getVoltConfig();
        const resC = isSilent
          ? await client.command(`r ${cfg.cellAddr} 01`, { timeoutMs: 1500, silent: true })
          : await runInteractiveCommand(`r ${cfg.cellAddr} 01`, { timeoutMs: 1500 });
        const resR = isSilent
          ? await client.command(`r ${cfg.rsxAddr} 01`, { timeoutMs: 1500, silent: true })
          : await runInteractiveCommand(`r ${cfg.rsxAddr} 01`, { timeoutMs: 1500 });
        const rawC = resC ? ((resC.lines && resC.lines.join('\n')) + '\n' + resC.raw) : '';
        const rawR = resR ? ((resR.lines && resR.lines.join('\n')) + '\n' + resR.raw) : '';
        const hexC = parseSingleByteRead(rawC, cfg.cellAddr);
        const hexR = parseSingleByteRead(rawR, cfg.rsxAddr);

        const descC = hexC ? `${hexC} (${lookupVoltByHex(cfg, hexC)})` : '読み取り不可';
        const descR = hexR ? `${hexR} (${lookupVoltByHex(cfg, hexR)})` : '読み取り不可';
        if (voltCurrentInfo) {
          voltCurrentInfo.textContent = `現在の設定 [${cfg.label}] — CELL(${cfg.cellAddr}): ${descC} / RSX(${cfg.rsxAddr}): ${descR}`;
        }
        if (hexC) syncVoltSliderFromSelect('cell', hexC);
        if (hexR) syncVoltSliderFromSelect('rsx', hexR);
      } catch (err) {
        if (!isSilent) {
          appendLog('ERR', `電圧読み取りエラー: ${err.message}`);
        }
      }
    }

    async function writeVoltages(cellHex, rsxHex) {
      if (!client.connected) return;
      if (client.scType === 'CXR') {
        appendLog('ERR', 'EEPROM 書き込み (w コマンド) は CXRF または SW で接続時のみ実行できます。');
        return;
      }
      if (!cellHex && !rsxHex) {
        appendLog('ERR', '変更する CELL または RSX の電圧を選択してください。');
        return;
      }
      const cfg = getVoltConfig();
      const summaryLines = [];
      if (cellHex) summaryLines.push(`・CELL (${cfg.cellAddr}): ${cellHex} [${lookupVoltByHex(cfg, cellHex)}]`);
      if (rsxHex) summaryLines.push(`・RSX (${cfg.rsxAddr}): ${rsxHex} [${lookupVoltByHex(cfg, rsxHex)}]`);

      const hostWin = (applyVoltBtn && applyVoltBtn.ownerDocument.defaultView) || window;
      const ok = hostWin.confirm(
        `【EEPROM 電圧書き換えの確認 (${cfg.label})】\n\n` +
        summaryLines.join('\n') +
        '\n\n・高すぎる電圧はチップやVRMを損傷する恐れがあります。\n' +
        '・低すぎる電圧はフリーズやYLOD（起動不能）を引き起こします。\n' +
        '・実行後は eepcsum 修正が必要です。\n\n本当に書き込みを実行しますか？'
      );
      if (!ok) return;

      const wasPolling = isPolling;
      if (wasPolling) stopPolling();
      try {
        if (cellHex) {
          await runInteractiveCommand(`w ${cfg.cellAddr} ${cellHex}`, { timeoutMs: 1800 });
          await sleep(80);
        }
        if (rsxHex) {
          await runInteractiveCommand(`w ${cfg.rsxAddr} ${rsxHex}`, { timeoutMs: 1800 });
          await sleep(80);
        }
        if (voltAutoCsumCb && voltAutoCsumCb.checked) {
          await sleep(80);
          await fixEepcsum(false);
        } else {
          appendLog('SYS', '⚠️ 電圧書き込み完了。起動前に eepcsum 確認＆修正を忘れずに実行してください。');
        }
        await readCurrentVoltages();
      } finally {
        if (wasPolling && client.connected) startPolling();
      }
    }

    if (voltCellSelect) {
      voltCellSelect.addEventListener('change', () => {
        syncVoltSliderFromSelect('cell');
        updateVoltPreview();
      });
    }
    if (voltRsxSelect) {
      voltRsxSelect.addEventListener('change', () => {
        syncVoltSliderFromSelect('rsx');
        updateVoltPreview();
      });
    }
    if (voltCellSlider) {
      voltCellSlider.addEventListener('input', () => {
        const cfg = getVoltConfig();
        const sorted = getSortedVoltEntries(cfg);
        const idx = Math.max(0, Math.min(sorted.length - 1, parseInt(voltCellSlider.value, 10) || 0));
        const entry = sorted[idx];
        if (entry && voltCellSelect) {
          voltCellSelect.value = entry.hex;
          syncVoltSliderFromSelect('cell');
          updateVoltPreview();
        }
      });
    }
    if (voltRsxSlider) {
      voltRsxSlider.addEventListener('input', () => {
        const cfg = getVoltConfig();
        const sorted = getSortedVoltEntries(cfg);
        const idx = Math.max(0, Math.min(sorted.length - 1, parseInt(voltRsxSlider.value, 10) || 0));
        const entry = sorted[idx];
        if (entry && voltRsxSelect) {
          voltRsxSelect.value = entry.hex;
          syncVoltSliderFromSelect('rsx');
          updateVoltPreview();
        }
      });
    }
    if (voltAutoCsumCb) voltAutoCsumCb.addEventListener('change', updateVoltPreview);
    if (readVoltBtn) readVoltBtn.addEventListener('click', () => readCurrentVoltages(false));
    if (applyVoltBtn) {
      applyVoltBtn.addEventListener('click', () => {
        writeVoltages(voltCellSelect ? voltCellSelect.value : '', voltRsxSelect ? voltRsxSelect.value : '');
      });
    }
    if (resetVoltBtn) {
      resetVoltBtn.addEventListener('click', () => writeVoltages('FF', 'FF'));
    }
    populateVoltSelects();

    // ==========================================
    // 7. ファンテーブル ＆ 保護温度書き換え (EEPROM)
    // ==========================================
    const FANTBL_COLORS = [
      '#3b82f6', '#06b6d4', '#14b8a6', '#10b981', '#22c55e',
      '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444'
    ];
    let activeFanZone = '0';
    let sbDetectedZoneId = '2';
    const fanTablesState = {
      '0': {
        label: 'CELL',
        zoneId: '0',
        rows: [
          { dutyPct: 25, tempD: 0, tempU: 65 },
          { dutyPct: 25, tempD: 60, tempU: 66 },
          { dutyPct: 26, tempD: 61, tempU: 67 },
          { dutyPct: 27, tempD: 62, tempU: 69 },
          { dutyPct: 29, tempD: 65, tempU: 73 },
          { dutyPct: 31, tempD: 70, tempU: 77 },
          { dutyPct: 100, tempD: 70, tempU: 85 }
        ],
        trp: null,
        tshutdown: null
      },
      '1': {
        label: 'RSX',
        zoneId: '1',
        rows: [
          { dutyPct: 25, tempD: 0, tempU: 62 },
          { dutyPct: 26, tempD: 57, tempU: 65 },
          { dutyPct: 28, tempD: 60, tempU: 68 },
          { dutyPct: 32, tempD: 64, tempU: 72 },
          { dutyPct: 100, tempD: 68, tempU: 85 }
        ],
        trp: null,
        tshutdown: null
      },
      'sb': {
        label: 'SB',
        zoneId: '2',
        rows: [],
        trp: null,
        tshutdown: null
      }
    };

    function dutyPctToHex(pct) {
      const clamped = Math.max(0, Math.min(100, Math.round(pct)));
      const dec = Math.round((clamped / 100) * 255);
      return '0x' + dec.toString(16).toUpperCase().padStart(2, '0');
    }

    function dutyHexToPct(hexStr) {
      const val = parseInt(String(hexStr).replace(/^0x/i, ''), 16);
      if (Number.isNaN(val)) return 25;
      return Math.max(0, Math.min(100, Math.round((val / 255) * 100)));
    }

    function parseFantblAll(text) {
      if (!text) return [];
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const map = new Map();
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const pm = line.match(/^p0*([0-9])\b/i);
        if (!pm) continue;
        const idx = parseInt(pm[1], 10);
        const td = line.match(/TempD\s*:\s*(\d+(?:\.\d+)?)/i);
        const tu = line.match(/TempU\s*:\s*(\d+(?:\.\d+)?)/i);
        const dutyHexMatch = line.match(/Duty[^0-9x]*(?:\d+%\s*\()?\s*(0x[0-9A-Fa-f]{2})/i)
          || line.match(/\b(0x[0-9A-Fa-f]{2})\b(?!.*\b0x[0-9A-Fa-f]{2}\b)/i);
        const pctMatch = line.match(/(\d+)\s*%/);
        const nums = line.match(/\b\d+\.\d+\b/g);

        let tempD = td ? parseFloat(td[1]) : (nums && nums.length >= 2 ? parseFloat(nums[0]) : NaN);
        let tempU = tu ? parseFloat(tu[1]) : (nums && nums.length >= 2 ? parseFloat(nums[1]) : NaN);
        let dutyPct = NaN;
        if (dutyHexMatch) {
          dutyPct = dutyHexToPct(dutyHexMatch[1]);
        } else if (pctMatch) {
          dutyPct = parseInt(pctMatch[1], 10);
        }
        if (!Number.isNaN(tempD) && !Number.isNaN(tempU) && !Number.isNaN(dutyPct)) {
          map.set(idx, {
            dutyPct: Math.max(0, Math.min(100, dutyPct)),
            tempD: Math.max(0, Math.min(120, Math.round(tempD * 2) / 2)),
            tempU: Math.max(0, Math.min(120, Math.round(tempU * 2) / 2))
          });
        }
      }
      const out = [];
      for (let i = 0; i < 10; i++) {
        if (map.has(i)) out.push(map.get(i));
      }
      return out;
    }

    function parseThermalThreshold(text) {
      if (!text) return null;
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^(?:trp|tshutdown)\s+/i.test(line) || /^(?:\[[^\]]+\]\s*\$|>\$?|\$)$/.test(line)) continue;
        if (/unknown|error|invalid/i.test(line)) return null;
        const mDec = line.match(/(\d+\.\d+)/);
        if (mDec) return parseFloat(mDec[1]);
        const mHex = line.match(/\b0x([0-9A-Fa-f]{4})\b/);
        if (mHex) {
          const deg = parseInt(mHex[1], 16) / 256;
          if (deg >= 20 && deg <= 130) return Math.round(deg * 100) / 100;
        }
        const mInt = line.match(/\b(\d{2,3})\b/);
        if (mInt) {
          const val = parseInt(mInt[1], 10);
          if (val >= 30 && val <= 130) return val;
        }
      }
      return null;
    }

    function getActiveFanZoneObj() {
      const z = fanTablesState[activeFanZone] || fanTablesState['0'];
      if (activeFanZone === 'sb') {
        z.zoneId = fantblSbZoneSelect ? fantblSbZoneSelect.value : sbDetectedZoneId;
      }
      return z;
    }

    function getFanZonePreviewLines() {
      const z = getActiveFanZoneObj();
      const lines = z.rows.map((r, idx) =>
        `fantbl setini ${z.zoneId} p${idx} ${Number(r.tempD).toFixed(2)} ${Number(r.tempU).toFixed(2)} ${dutyPctToHex(r.dutyPct)}`
      );
      if (fantblAutoCsumCb && fantblAutoCsumCb.checked && lines.length > 0) {
        lines.push('eepcsum (+ 不整合時の w 自動修正)');
      }
      return lines;
    }

    function updateFantblPreview() {
      if (!fantblPreview) return;
      const lines = getFanZonePreviewLines();
      fantblPreview.textContent = lines.length > 0
        ? lines.join('\n')
        : '（このゾーンには設定段階がありません。「＋ 段階を追加」または貼り付け機能から追加してください）';
    }

    function renderFanTableRows() {
      if (!fantblRowsEl) return;
      const z = getActiveFanZoneObj();
      fantblRowsEl.innerHTML = '';
      z.rows.forEach((row, idx) => {
        const div = document.createElement('div');
        div.className = 'uart-fantbl-row';

        const lbl = document.createElement('span');
        lbl.className = 'uart-fantbl-stage-lbl';
        const dot = document.createElement('span');
        dot.className = 'uart-fantbl-dot';
        dot.style.backgroundColor = FANTBL_COLORS[idx % FANTBL_COLORS.length];
        lbl.appendChild(dot);
        lbl.appendChild(document.createTextNode(`P${idx}`));

        const inDuty = document.createElement('input');
        inDuty.type = 'number';
        inDuty.min = '0';
        inDuty.max = '100';
        inDuty.step = '1';
        inDuty.value = String(row.dutyPct);
        inDuty.title = `P${idx} デューティ (%)`;
        inDuty.addEventListener('input', () => {
          row.dutyPct = Math.max(0, Math.min(100, parseInt(inDuty.value, 10) || 0));
          updateFantblPreview();
          drawFanTableChart();
        });

        const inD = document.createElement('input');
        inD.type = 'number';
        inD.min = '0';
        inD.max = '115';
        inD.step = '0.5';
        inD.value = String(row.tempD);
        inD.title = `P${idx} TempD (下限 ℃)`;
        inD.addEventListener('input', () => {
          const v = parseFloat(inD.value);
          if (!Number.isNaN(v)) {
            row.tempD = Math.max(0, Math.min(115, v));
            updateFantblPreview();
            drawFanTableChart();
          }
        });

        const inU = document.createElement('input');
        inU.type = 'number';
        inU.min = '0';
        inU.max = '115';
        inU.step = '0.5';
        inU.value = String(row.tempU);
        inU.title = `P${idx} TempU (上限 ℃)`;
        inU.addEventListener('input', () => {
          const v = parseFloat(inU.value);
          if (!Number.isNaN(v)) {
            row.tempU = Math.max(0, Math.min(115, v));
            updateFantblPreview();
            drawFanTableChart();
          }
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'uart-fantbl-del-btn';
        delBtn.textContent = '×';
        delBtn.title = `P${idx} を削除`;
        delBtn.disabled = z.rows.length <= 1;
        delBtn.addEventListener('click', () => {
          if (z.rows.length <= 1) return;
          z.rows.splice(idx, 1);
          renderFanTableRows();
          updateFantblPreview();
          drawFanTableChart();
        });

        div.appendChild(lbl);
        div.appendChild(inDuty);
        div.appendChild(inD);
        div.appendChild(inU);
        div.appendChild(delBtn);
        fantblRowsEl.appendChild(div);
      });

      if (fantblAddStageBtn) {
        fantblAddStageBtn.disabled = z.rows.length >= 10;
      }
      updateFantblPreview();
    }

    function getFantblMetrics(canvas) {
      const rect = canvas.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      const pad = { top: 24, right: 20, bottom: 32, left: 44 };
      const plotW = Math.max(40, width - pad.left - pad.right);
      const plotH = Math.max(40, height - pad.top - pad.bottom);
      return { width, height, pad, plotW, plotH };
    }

    function getFantblViewBounds() {
      let tMin = fantblTempMinInput ? parseFloat(fantblTempMinInput.value) : 0;
      let tMax = fantblTempMaxInput ? parseFloat(fantblTempMaxInput.value) : 100;
      let dMin = fantblDutyMinInput ? parseFloat(fantblDutyMinInput.value) : 0;
      let dMax = fantblDutyMaxInput ? parseFloat(fantblDutyMaxInput.value) : 105;
      if (Number.isNaN(tMin)) tMin = 0;
      if (Number.isNaN(tMax)) tMax = 100;
      if (Number.isNaN(dMin)) dMin = 0;
      if (Number.isNaN(dMax)) dMax = 105;
      tMin = Math.max(0, Math.min(95, tMin));
      tMax = Math.max(tMin + 5, Math.min(100, tMax));
      dMin = Math.max(0, Math.min(95, dMin));
      dMax = Math.max(dMin + 5, Math.min(105, dMax));
      return { tMin, tMax, dMin, dMax };
    }

    function setFantblViewBounds(tMin, tMax, dMin, dMax) {
      const ntMin = Math.max(0, Math.min(95, Math.round(tMin)));
      const ntMax = Math.max(ntMin + 5, Math.min(100, Math.round(tMax)));
      const ndMin = Math.max(0, Math.min(95, Math.round(dMin)));
      const ndMax = Math.max(ndMin + 5, Math.min(105, Math.round(dMax)));
      if (fantblTempMinInput) fantblTempMinInput.value = String(ntMin);
      if (fantblTempMaxInput) fantblTempMaxInput.value = String(ntMax);
      if (fantblDutyMinInput) fantblDutyMinInput.value = String(ndMin);
      if (fantblDutyMaxInput) fantblDutyMaxInput.value = String(ndMax);
      fantblZoomPresets.forEach(btn => {
        const match = Number(btn.getAttribute('data-tmin')) === ntMin &&
          Number(btn.getAttribute('data-tmax')) === ntMax &&
          Number(btn.getAttribute('data-dmin')) === ndMin &&
          Number(btn.getAttribute('data-dmax')) === ndMax;
        btn.classList.toggle('active', match);
      });
      drawFanTableChart();
    }

    if (fantblZoomPresets.length > 0) {
      fantblZoomPresets.forEach(btn => {
        btn.addEventListener('click', () => {
          setFantblViewBounds(
            parseFloat(btn.getAttribute('data-tmin') || '0'),
            parseFloat(btn.getAttribute('data-tmax') || '100'),
            parseFloat(btn.getAttribute('data-dmin') || '0'),
            parseFloat(btn.getAttribute('data-dmax') || '105')
          );
        });
      });
    }
    [fantblTempMinInput, fantblTempMaxInput, fantblDutyMinInput, fantblDutyMaxInput].forEach(inp => {
      if (inp) {
        inp.addEventListener('input', () => {
          fantblZoomPresets.forEach(b => b.classList.remove('active'));
          drawFanTableChart();
        });
      }
    });
    if (fantblResetZoomBtn) {
      fantblResetZoomBtn.addEventListener('click', () => setFantblViewBounds(0, 100, 0, 105));
    }

    function drawFanTableChart() {
      if (!fantblCanvas) return;
      const { width, height, pad, plotW, plotH } = getFantblMetrics(fantblCanvas);
      if (width <= 20 || height <= 20) return;

      const dpr = (fantblCanvas.ownerDocument.defaultView || window).devicePixelRatio || 1;
      if (fantblCanvas.width !== Math.floor(width * dpr) || fantblCanvas.height !== Math.floor(height * dpr)) {
        fantblCanvas.width = Math.floor(width * dpr);
        fantblCanvas.height = Math.floor(height * dpr);
      }

      const ctx = fantblCanvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const palette = getChartPalette();
      const { tMin, tMax, dMin, dMax } = getFantblViewBounds();
      const tSpan = Math.max(5, tMax - tMin);
      const dSpan = Math.max(5, dMax - dMin);
      const xToPx = (deg) => pad.left + ((deg - tMin) / tSpan) * plotW;
      const yToPx = (pct) => pad.top + (1 - (pct - dMin) / dSpan) * plotH;

      // 背景グリッド（拡大率に応じて目盛り間隔を自動調整）
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.lineWidth = 1;
      const dStep = dSpan <= 30 ? 5 : 10;
      const dFirst = Math.ceil(dMin / dStep) * dStep;
      for (let pct = dFirst; pct <= Math.min(100, dMax); pct += dStep) {
        const y = yToPx(pct);
        ctx.strokeStyle = palette.grid;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();

        ctx.fillStyle = palette.text;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${pct}`, pad.left - 6, y);
      }
      const tStep = tSpan <= 35 ? 5 : 10;
      const tFirst = Math.ceil(tMin / tStep) * tStep;
      for (let deg = tFirst; deg <= tMax; deg += tStep) {
        const x = xToPx(deg);
        ctx.strokeStyle = palette.grid;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + plotH);
        ctx.stroke();

        ctx.fillStyle = palette.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${deg}`, x, pad.top + plotH + 6);
      }

      // 軸ラベル
      ctx.fillStyle = palette.text;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('温度 (℃)', pad.left + plotW / 2, height - 2);

      ctx.strokeStyle = palette.axis;
      ctx.strokeRect(pad.left, pad.top, plotW, plotH);

      // プロット領域内をクリッピングして、拡大時に範囲外のバーがはみ出さないようにする
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.left, pad.top, plotW, plotH);
      ctx.clip();

      // 警告 (trp) & シャットダウン (tshutdown) 基準線
      const trpVal = activeFanZone === '0'
        ? parseFloat(fantblTrp0Input ? fantblTrp0Input.value : '')
        : (activeFanZone === '1' ? parseFloat(fantblTrp1Input ? fantblTrp1Input.value : '') : NaN);
      const tshutVal = activeFanZone === '0'
        ? parseFloat(fantblTshut0Input ? fantblTshut0Input.value : '')
        : (activeFanZone === '1' ? parseFloat(fantblTshut1Input ? fantblTshut1Input.value : '') : NaN);

      if (!Number.isNaN(trpVal) && trpVal >= tMin && trpVal <= tMax) {
        const tx = xToPx(trpVal);
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(tx, pad.top);
        ctx.lineTo(tx, pad.top + plotH);
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`警告 trp ${trpVal.toFixed(1)}℃`, tx - 4, pad.top + 4);
        ctx.restore();
      }

      if (!Number.isNaN(tshutVal) && tshutVal >= tMin && tshutVal <= tMax) {
        const sx = xToPx(tshutVal);
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(sx, pad.top);
        ctx.lineTo(sx, pad.top + plotH);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`シャットダウン ${tshutVal.toFixed(1)}℃`, Math.min(pad.left + plotW - 45, sx), pad.top + 4);
        ctx.restore();
      }

      // 各段階バー描画
      const z = getActiveFanZoneObj();
      z.rows.forEach((row, idx) => {
        const color = FANTBL_COLORS[idx % FANTBL_COLORS.length];
        const x1 = xToPx(row.tempD);
        const x2 = xToPx(row.tempU);
        const y = yToPx(row.dutyPct);

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();

        // 両端ハンドル
        [x1, x2].forEach(hx => {
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hx, y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        ctx.fillStyle = color;
        ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`P${idx}`, Math.min(pad.left + plotW - 22, x2 + 7), y);
      });

      ctx.restore();
      ctx.restore();
    }

    // グラフ上のドラッグ操作 (左端=TempD / 右端=TempU / 中央=Duty%) & ホイール拡大
    if (fantblCanvas) {
      let dragTarget = null; // { idx, mode: 'd'|'u'|'duty' }
      const hitTestFantbl = (cx, cy) => {
        const { pad, plotW, plotH } = getFantblMetrics(fantblCanvas);
        const { tMin, tMax, dMin, dMax } = getFantblViewBounds();
        const tSpan = Math.max(5, tMax - tMin);
        const dSpan = Math.max(5, dMax - dMin);
        const xToPx = (deg) => pad.left + ((deg - tMin) / tSpan) * plotW;
        const yToPx = (pct) => pad.top + (1 - (pct - dMin) / dSpan) * plotH;
        const z = getActiveFanZoneObj();
        for (let i = z.rows.length - 1; i >= 0; i--) {
          const r = z.rows[i];
          const x1 = xToPx(r.tempD);
          const x2 = xToPx(r.tempU);
          const y = yToPx(r.dutyPct);
          if (cy < pad.top - 8 || cy > pad.top + plotH + 8) continue;
          if (Math.hypot(cx - x1, cy - y) <= 10 && cx >= pad.left - 8 && cx <= pad.left + plotW + 8) return { idx: i, mode: 'd' };
          if (Math.hypot(cx - x2, cy - y) <= 10 && cx >= pad.left - 8 && cx <= pad.left + plotW + 8) return { idx: i, mode: 'u' };
          const segL = Math.max(pad.left, Math.min(x1, x2));
          const segR = Math.min(pad.left + plotW, Math.max(x1, x2));
          if (cx >= segL && cx <= segR && Math.abs(cy - y) <= 8) {
            return { idx: i, mode: 'duty' };
          }
        }
        return null;
      };

      fantblCanvas.addEventListener('pointerdown', (e) => {
        const rect = fantblCanvas.getBoundingClientRect();
        const hit = hitTestFantbl(e.clientX - rect.left, e.clientY - rect.top);
        if (!hit) return;
        dragTarget = hit;
        fantblCanvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      });

      fantblCanvas.addEventListener('pointermove', (e) => {
        const rect = fantblCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        if (!dragTarget) {
          const hit = hitTestFantbl(cx, cy);
          fantblCanvas.style.cursor = !hit ? 'default' : (hit.mode === 'duty' ? 'ns-resize' : 'ew-resize');
          return;
        }
        const { pad, plotW, plotH } = getFantblMetrics(fantblCanvas);
        const { tMin, tMax, dMin, dMax } = getFantblViewBounds();
        const tSpan = Math.max(5, tMax - tMin);
        const dSpan = Math.max(5, dMax - dMin);
        const z = getActiveFanZoneObj();
        const row = z.rows[dragTarget.idx];
        if (!row) return;

        if (dragTarget.mode === 'duty') {
          const pct = Math.round(dMin + (1 - (cy - pad.top) / plotH) * dSpan);
          row.dutyPct = Math.max(0, Math.min(100, pct));
        } else {
          const rawDeg = tMin + ((cx - pad.left) / plotW) * tSpan;
          const deg = Math.round(rawDeg * 2) / 2;
          const clamped = Math.max(0, Math.min(100, deg));
          if (dragTarget.mode === 'd') {
            row.tempD = Math.min(clamped, row.tempU);
          } else {
            row.tempU = Math.max(clamped, row.tempD);
          }
        }
        renderFanTableRows();
        drawFanTableChart();
      });

      const stopFantblDrag = (e) => {
        if (!dragTarget) return;
        dragTarget = null;
        if (e && fantblCanvas.hasPointerCapture && fantblCanvas.hasPointerCapture(e.pointerId)) {
          fantblCanvas.releasePointerCapture(e.pointerId);
        }
      };
      fantblCanvas.addEventListener('pointerup', stopFantblDrag);
      fantblCanvas.addEventListener('pointercancel', stopFantblDrag);

      fantblCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = fantblCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const { pad, plotW, plotH } = getFantblMetrics(fantblCanvas);
        const { tMin, tMax, dMin, dMax } = getFantblViewBounds();
        const rx = Math.max(0, Math.min(1, (cx - pad.left) / plotW));
        const ry = Math.max(0, Math.min(1, 1 - (cy - pad.top) / plotH));
        const pivotT = tMin + rx * (tMax - tMin);
        const pivotD = dMin + ry * (dMax - dMin);
        const factor = e.deltaY < 0 ? 0.8 : 1.25;
        const newTSpan = Math.max(10, Math.min(100, (tMax - tMin) * factor));
        const newDSpan = Math.max(10, Math.min(105, (dMax - dMin) * factor));
        let ntMin = pivotT - rx * newTSpan;
        let ntMax = ntMin + newTSpan;
        if (ntMin < 0) { ntMin = 0; ntMax = Math.min(100, newTSpan); }
        if (ntMax > 100) { ntMax = 100; ntMin = Math.max(0, 100 - newTSpan); }
        let ndMin = pivotD - ry * newDSpan;
        let ndMax = ndMin + newDSpan;
        if (ndMin < 0) { ndMin = 0; ndMax = Math.min(105, newDSpan); }
        if (ndMax > 105) { ndMax = 105; ndMin = Math.max(0, 105 - newDSpan); }
        setFantblViewBounds(ntMin, ntMax, ndMin, ndMax);
      }, { passive: false });

      fantblCanvas.addEventListener('dblclick', () => {
        setFantblViewBounds(0, 100, 0, 105);
      });
    }

    async function readAllFanTables(silent = false) {
      const isSilent = silent === true;
      if (!client.connected) return;
      if (client.scType === 'CXR') {
        if (!isSilent) appendLog('ERR', 'fantbl getini の取得は CXRF または SW で接続時のみ実行できます。');
        if (fantblStatusBadge) fantblStatusBadge.textContent = 'CXR非対応';
        return;
      }

      const wasPolling = isPolling;
      if (wasPolling) stopPolling();
      try {
        const readOne = async (cmd) => {
          const res = isSilent
            ? await client.command(cmd, { timeoutMs: 1800, idleMs: 90, silent: true })
            : await runInteractiveCommand(cmd, { timeoutMs: 1800, idleMs: 90 });
          return res ? (res.raw || (res.lines ? res.lines.join('\n') : '')) : '';
        };

        const raw0 = await readOne('fantbl getini 0');
        const rows0 = parseFantblAll(raw0);
        if (rows0.length > 0) fanTablesState['0'].rows = rows0;

        const raw1 = await readOne('fantbl getini 1');
        const rows1 = parseFantblAll(raw1);
        if (rows1.length > 0) fanTablesState['1'].rows = rows1;

        // SB 用ゾーンは環境により 2 / 3 / 14 などが存在するため順に確認
        let sbRows = [];
        for (const zId of ['2', '3', '14']) {
          const rawSb = await readOne(`fantbl getini ${zId}`);
          const parsedSb = parseFantblAll(rawSb);
          if (parsedSb.length > 0) {
            sbRows = parsedSb;
            sbDetectedZoneId = zId;
            fanTablesState['sb'].zoneId = zId;
            if (fantblSbZoneSelect) fantblSbZoneSelect.value = zId;
            break;
          }
        }
        fanTablesState['sb'].rows = sbRows;

        const trp0 = parseThermalThreshold(await readOne('trp getini 0'));
        const trp1 = parseThermalThreshold(await readOne('trp getini 1'));
        const tsh0 = parseThermalThreshold(await readOne('tshutdown getini 0'));
        const tsh1 = parseThermalThreshold(await readOne('tshutdown getini 1'));

        fanTablesState['0'].trp = trp0;
        fanTablesState['1'].trp = trp1;
        fanTablesState['0'].tshutdown = tsh0;
        fanTablesState['1'].tshutdown = tsh1;

        if (fantblTrp0Input) fantblTrp0Input.value = trp0 !== null ? String(trp0) : '';
        if (fantblTrp1Input) fantblTrp1Input.value = trp1 !== null ? String(trp1) : '';
        if (fantblTshut0Input) fantblTshut0Input.value = tsh0 !== null ? String(tsh0) : '';
        if (fantblTshut1Input) fantblTshut1Input.value = tsh1 !== null ? String(tsh1) : '';

        if (fantblStatusBadge) {
          fantblStatusBadge.textContent =
            `取得済: CELL ${fanTablesState['0'].rows.length}段 / RSX ${fanTablesState['1'].rows.length}段` +
            (sbRows.length > 0 ? ` / SB(${sbDetectedZoneId}) ${sbRows.length}段` : ' / SB未検出');
        }
        renderFanTableRows();
        drawFanTableChart();
      } catch (err) {
        if (!isSilent) appendLog('ERR', `ファンテーブル取得エラー: ${err.message}`);
      } finally {
        if (wasPolling && client.connected) startPolling();
      }
    }

    async function executeSetiniList(cmds, confirmTitle) {
      if (!client.connected) return;
      if (client.scType === 'CXR') {
        appendLog('ERR', 'EEPROM 書き込み (setini) は CXRF または SW で接続時のみ実行できます。');
        return;
      }
      if (!cmds || cmds.length === 0) {
        appendLog('ERR', '実行するコマンドがありません。');
        return;
      }

      const hostWin = (fantblWriteZoneBtn && fantblWriteZoneBtn.ownerDocument.defaultView) || window;
      const autoCsum = fantblAutoCsumCb && fantblAutoCsumCb.checked;
      const ok = hostWin.confirm(
        `${confirmTitle}\n\n` +
        `実行コマンド (${cmds.length} 件):\n` +
        cmds.slice(0, 12).join('\n') +
        (cmds.length > 12 ? `\n...他 ${cmds.length - 12} 件` : '') +
        (autoCsum ? '\n\n＋ eepcsum 自動確認・修正' : '\n\n※ 書き換え後は eepcsum 修正が必要です') +
        '\n\n本当に EEPROM へ書き込みますか？'
      );
      if (!ok) return;

      const wasPolling = isPolling;
      if (wasPolling) stopPolling();
      try {
        for (const cmd of cmds) {
          await runInteractiveCommand(cmd, { timeoutMs: 1800 });
          await sleep(80);
        }
        if (autoCsum) {
          await sleep(100);
          await fixEepcsum(false);
        } else {
          appendLog('SYS', '⚠️ 書き込み完了。電源投入前に eepcsum 確認＆修正を忘れずに実行してください。');
        }
        await readAllFanTables(true);
      } finally {
        if (wasPolling && client.connected) startPolling();
      }
    }

    fantblTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activeFanZone = tab.getAttribute('data-zone') || '0';
        fantblTabs.forEach(t => t.classList.toggle('active', t === tab));
        if (fantblSbZoneWrap) {
          fantblSbZoneWrap.classList.toggle('hidden', activeFanZone !== 'sb');
        }
        renderFanTableRows();
        drawFanTableChart();
      });
    });

    if (fantblSbZoneSelect) {
      fantblSbZoneSelect.addEventListener('change', () => {
        fanTablesState['sb'].zoneId = fantblSbZoneSelect.value;
        updateFantblPreview();
      });
    }

    if (fantblAddStageBtn) {
      fantblAddStageBtn.addEventListener('click', () => {
        const z = getActiveFanZoneObj();
        if (z.rows.length >= 10) return;
        const last = z.rows[z.rows.length - 1] || { dutyPct: 25, tempD: 0, tempU: 60 };
        z.rows.push({
          dutyPct: Math.min(100, last.dutyPct + 5),
          tempD: Math.min(95, last.tempU),
          tempU: Math.min(100, last.tempU + 5)
        });
        renderFanTableRows();
        drawFanTableChart();
      });
    }

    [fantblTrp0Input, fantblTshut0Input, fantblTrp1Input, fantblTshut1Input].forEach(inp => {
      if (inp) inp.addEventListener('input', drawFanTableChart);
    });
    if (fantblAutoCsumCb) fantblAutoCsumCb.addEventListener('change', updateFantblPreview);
    if (fantblReadAllBtn) fantblReadAllBtn.addEventListener('click', () => readAllFanTables(false));

    if (fantblWriteZoneBtn) {
      fantblWriteZoneBtn.addEventListener('click', async () => {
        const z = getActiveFanZoneObj();
        if (z.rows.length === 0) {
          appendLog('ERR', '書き込むファンテーブル段階がありません。');
          return;
        }
        const cmds = z.rows.map((r, idx) =>
          `fantbl setini ${z.zoneId} p${idx} ${Number(r.tempD).toFixed(2)} ${Number(r.tempU).toFixed(2)} ${dutyPctToHex(r.dutyPct)}`
        );
        await executeSetiniList(cmds, `【ファンテーブル EEPROM 書き込み確認 (${z.label} / ゾーン ${z.zoneId})】`);
      });
    }

    if (fantblWriteTrpBtn) {
      fantblWriteTrpBtn.addEventListener('click', async () => {
        const cmds = [];
        const vTrp0 = fantblTrp0Input && fantblTrp0Input.value.trim() !== '' ? parseFloat(fantblTrp0Input.value) : NaN;
        const vTsh0 = fantblTshut0Input && fantblTshut0Input.value.trim() !== '' ? parseFloat(fantblTshut0Input.value) : NaN;
        const vTrp1 = fantblTrp1Input && fantblTrp1Input.value.trim() !== '' ? parseFloat(fantblTrp1Input.value) : NaN;
        const vTsh1 = fantblTshut1Input && fantblTshut1Input.value.trim() !== '' ? parseFloat(fantblTshut1Input.value) : NaN;

        if (!Number.isNaN(vTrp0)) cmds.push(`trp setini 0 ${vTrp0.toFixed(2)}`);
        if (!Number.isNaN(vTsh0)) cmds.push(`tshutdown setini 0 ${vTsh0.toFixed(2)}`);
        if (!Number.isNaN(vTrp1)) cmds.push(`trp setini 1 ${vTrp1.toFixed(2)}`);
        if (!Number.isNaN(vTsh1)) cmds.push(`tshutdown setini 1 ${vTsh1.toFixed(2)}`);

        if (cmds.length === 0) {
          appendLog('ERR', '書き込む trp または tshutdown の温度を入力してください。');
          return;
        }
        await executeSetiniList(cmds, '【保護温度 (trp / tshutdown) EEPROM 書き込み確認】');
      });
    }

    function parsePastedSetiniCommands(rawText) {
      const lines = (rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('#'));
      const validCmds = [];
      const fantblByZone = new Map();
      const trpUpdates = [];

      for (const line of lines) {
        const mFan = line.match(/^fantbl\s+setini\s+(\d+)\s+p0*([0-9])\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(0x[0-9A-Fa-f]{1,2}|[0-9A-Fa-f]{1,2})\s*$/i);
        if (mFan) {
          const zId = mFan[1];
          const pIdx = parseInt(mFan[2], 10);
          const td = parseFloat(mFan[3]);
          const tu = parseFloat(mFan[4]);
          const hex = '0x' + mFan[5].replace(/^0x/i, '').toUpperCase().padStart(2, '0');
          validCmds.push(`fantbl setini ${zId} p${pIdx} ${td.toFixed(2)} ${tu.toFixed(2)} ${hex}`);
          if (!fantblByZone.has(zId)) fantblByZone.set(zId, new Map());
          fantblByZone.get(zId).set(pIdx, { dutyPct: dutyHexToPct(hex), tempD: td, tempU: tu });
          continue;
        }
        const mTh = line.match(/^(trp|tshutdown)\s+setini\s+(\d+)\s+(\d+(?:\.\d+)?)\s*$/i);
        if (mTh) {
          const kind = mTh[1].toLowerCase();
          const zId = mTh[2];
          const val = parseFloat(mTh[3]);
          validCmds.push(`${kind} setini ${zId} ${val.toFixed(2)}`);
          trpUpdates.push({ kind, zId, val });
        }
      }
      return { validCmds, fantblByZone, trpUpdates };
    }

    if (fantblLoadPasteBtn) {
      fantblLoadPasteBtn.addEventListener('click', () => {
        const parsed = parsePastedSetiniCommands(fantblPasteInput ? fantblPasteInput.value : '');
        if (parsed.validCmds.length === 0) {
          appendLog('ERR', '有効な fantbl setini / trp setini / tshutdown setini コマンドが見つかりませんでした。');
          return;
        }
        let switchedTab = null;
        parsed.fantblByZone.forEach((stageMap, zId) => {
          const key = (zId === '0' || zId === '1') ? zId : 'sb';
          if (key === 'sb') {
            fanTablesState['sb'].zoneId = zId;
            if (fantblSbZoneSelect && Array.from(fantblSbZoneSelect.options).some(o => o.value === zId)) {
              fantblSbZoneSelect.value = zId;
            }
          }
          const rows = [];
          for (let i = 0; i < 10; i++) {
            if (stageMap.has(i)) rows.push(stageMap.get(i));
          }
          if (rows.length > 0) {
            fanTablesState[key].rows = rows;
            if (!switchedTab) switchedTab = key;
          }
        });
        parsed.trpUpdates.forEach(u => {
          if (u.kind === 'trp' && u.zId === '0' && fantblTrp0Input) fantblTrp0Input.value = String(u.val);
          if (u.kind === 'trp' && u.zId === '1' && fantblTrp1Input) fantblTrp1Input.value = String(u.val);
          if (u.kind === 'tshutdown' && u.zId === '0' && fantblTshut0Input) fantblTshut0Input.value = String(u.val);
          if (u.kind === 'tshutdown' && u.zId === '1' && fantblTshut1Input) fantblTshut1Input.value = String(u.val);
        });
        if (switchedTab) {
          activeFanZone = switchedTab;
          fantblTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-zone') === switchedTab));
          if (fantblSbZoneWrap) fantblSbZoneWrap.classList.toggle('hidden', activeFanZone !== 'sb');
        }
        renderFanTableRows();
        drawFanTableChart();
        appendLog('SYS', `貼り付けたコマンド (${parsed.validCmds.length} 行) を表とグラフへ読み込みました。`);
      });
    }

    if (fantblExecPasteBtn) {
      fantblExecPasteBtn.addEventListener('click', async () => {
        const parsed = parsePastedSetiniCommands(fantblPasteInput ? fantblPasteInput.value : '');
        if (parsed.validCmds.length === 0) {
          appendLog('ERR', '実行可能な fantbl setini / trp setini / tshutdown setini コマンドがありません。');
          return;
        }
        await executeSetiniList(parsed.validCmds, '【貼り付けコマンドの一括 EEPROM 書き込み確認】');
      });
    }

    renderFanTableRows();
    drawFanTableChart();

    // ==========================================
    // EEPROM / becount 読み取り用パーサー（読み取り専用表示用）
    // ==========================================
    function parseHexBytesN(text, addrHex, count = 8) {
      if (!text) return null;
      const lines = text.replace(/\r/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
      const bytes = [];
      const cleanAddr = addrHex.replace(/^0+/, '') || '0';
      const addrPrefixRe = new RegExp(`^(?:OK\\s+)?(?:\\+?(?:0x)?)?0*${cleanAddr}(?:\\s*[:\\-]\\s*|\\s+)`, 'i');

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].split('|')[0].trim();
        // SW 応答の末尾チェックサム (:CSUM) と先頭コメント記号 (#) を除去
        line = line.replace(/:[0-9A-Fa-f]{2}\s*$/, '').replace(/^#\s*/, '').trim();
        if (!line) continue;
        if (/^r\s+/i.test(line) || /^(?:\[[^\]]+\]\s*\$|>\$?|\$)$/.test(line)) continue;
        if (/^[0-9A-Fa-f]{8}$/.test(line)) continue;
        if (/\+0\s+\+1\b/.test(line) || /^-{4,}$/.test(line)) continue;
        line = line.replace(addrPrefixRe, '');
        line = line.replace(/^[0-9A-Fa-f]{8}\s+/, '');
        line = line.replace(/^(?:OK\s+)?(?:\+?0x)?[0-9A-Fa-f]{4,8}\s*:\s*/i, '');
        const tokens = line.match(/\b[0-9A-Fa-f]{2}\b/g);
        if (tokens && tokens.length > 0) {
          for (let j = 0; j < tokens.length; j++) {
            bytes.push(parseInt(tokens[j], 16));
            if (bytes.length === count) return bytes;
          }
        }
      }
      return bytes.length === count ? bytes : null;
    }

    function decodeBecountBytes(bytes, endian) {
      if (!bytes || bytes.length < 8) return null;
      if (endian === 'be') {
        const bringup = ((bytes[0] << 8) | bytes[1]) >>> 0;
        const shutdown = ((bytes[2] << 8) | bytes[3]) >>> 0;
        const totalSec = (((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0);
        return { bringup, shutdown, totalSec };
      }
      const bringup = (bytes[0] | (bytes[1] << 8)) >>> 0;
      const shutdown = (bytes[2] | (bytes[3] << 8)) >>> 0;
      const totalSec = ((bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0);
      return { bringup, shutdown, totalSec };
    }

    function formatUptimeBreakdown(totalSec) {
      const t = Math.max(0, Math.floor(totalSec));
      const d = Math.floor(t / 86400);
      const h = Math.floor((t % 86400) / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = t % 60;
      return `${d}日 ${h}時間 ${m}分 ${s}秒`;
    }

    pollToggleBtn.addEventListener('click', () => {
      if (isPolling) stopPolling();
      else startPolling();
    });
    if (miniPollBtn) {
      miniPollBtn.addEventListener('click', () => {
        if (isPolling) stopPolling();
        else startPolling();
      });
    }

    // パネル2の監視・グラフ設定をブラウザから復元
    function restoreSelectSetting(selectEl, storageKey) {
      if (!selectEl) return;
      const saved = localStorage.getItem(storageKey);
      if (saved !== null && Array.from(selectEl.options).some(opt => opt.value === saved)) {
        selectEl.value = saved;
      }
    }
    restoreSelectSetting(pollIntervalSelect, 'uartPollInterval');
    restoreSelectSetting(chartWindowSelect, 'uartChartWindow');
    restoreSelectSetting(chartTimeModeSelect, 'uartChartTimeMode');

    function syncPollFastHint() {
      if (!pollFastHintEl || !pollIntervalSelect) return;
      const ms = getPollIntervalMs();
      pollFastHintEl.classList.toggle('hidden', ms > 100);
    }
    syncPollFastHint();

    pollIntervalSelect.addEventListener('change', () => {
      localStorage.setItem('uartPollInterval', pollIntervalSelect.value);
      syncPollFastHint();
      if (isPolling) {
        stopPolling();
        startPolling();
      }
    });

    fetchErrlogBtn.addEventListener('click', async () => {
      if (!client.connected || !isQuickDiagButtonEnabled('errlog')) return;
      if (client.scType === 'CXR') {
        appendLog('SYS', 'CXR モードでエラーログ (00〜1F) を高速一括取得します...');
        const collected = [];
        const start = performance.now();
        for (let i = 0; i < 32; i++) {
          if (!client.connected) break;
          const idx = i.toString(16).toUpperCase().padStart(2, '0');
          const res = await client.command(`ERRLOG GET ${idx}`, { timeoutMs: 800 });
          const line = res.lines.join(' ');
          appendLog('RX', `[${idx}] ${line}`);
          collected.push(line);
          if (/FFFFFFFF/i.test(line) && i > 0) break;
        }
        const totalMs = Math.round(performance.now() - start);
        appendLog('SYS', `エラーログ取得完了 (${totalMs} ms)`);
        showExtractedErrors(extractErrorCodes(collected.join('\n')));
      } else {
        await runInteractiveCommand('errlog', { timeoutMs: 2500, idleMs: 80 });
      }
    });

    quickCmdBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = getQuickDiagBtnKey(btn);
        if (!isQuickDiagButtonEnabled(key)) return;
        const cmd = btn.getAttribute('data-cmd');
        if (!cmd) return;
        if (btn.hasAttribute('data-confirm')) {
          const hostWin = btn.ownerDocument.defaultView || window;
          const customMsg = btn.getAttribute('data-confirm-msg');
          const ok = hostWin.confirm(customMsg || `「${cmd}」コマンドを Syscon へ送信しますか？`);
          if (!ok) return;
        }
        const timeoutMs = (cmd === 'bringup' || cmd === 'shutdown' || cmd === 'powersw') ? 3500 : 1500;
        const res = await runInteractiveCommand(cmd, { timeoutMs });
        if (cmd === 'clearerrlog' && res && !res.timeout && res.code === 0 && !/unknown command/i.test(res.raw)) {
          showExtractedErrors([]);
        }
      });
    });

    if (searchAllErrorsBtn) {
      searchAllErrorsBtn.addEventListener('click', () => {
        if (!isQuickDiagButtonEnabled('searchAllErrors')) return;
        jumpToErrorSearch(extractedCodes);
      });
    }

    async function handleSendInput() {
      const val = cmdInput.value.trim();
      if (!val) {
        if (!client.connected) return;
        client.flushSpontaneousBuffer(true);
        try {
          await client.enqueue(async () => {
            if (client.connected && client.writer) {
              await client._writeAscii('\r\n');
            }
          });
        } catch (_) {}
        return;
      }
      cmdHistory.unshift(val);
      if (cmdHistory.length > 50) cmdHistory.pop();
      historyIdx = -1;
      cmdInput.value = '';
      await runInteractiveCommand(val);
    }

    sendBtn.addEventListener('click', handleSendInput);
    cmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSendInput();
      } else if (e.key === 'ArrowUp') {
        if (historyIdx + 1 < cmdHistory.length) {
          historyIdx++;
          cmdInput.value = cmdHistory[historyIdx];
          e.preventDefault();
        }
      } else if (e.key === 'ArrowDown') {
        if (historyIdx > 0) {
          historyIdx--;
          cmdInput.value = cmdHistory[historyIdx];
          e.preventDefault();
        } else if (historyIdx === 0) {
          historyIdx = -1;
          cmdInput.value = '';
          e.preventDefault();
        }
      }
    });

    clearLogBtn.addEventListener('click', () => {
      terminalEl.innerHTML = '';
    });

    downloadLogBtn.addEventListener('click', () => {
      const text = Array.from(terminalEl.children).map(el => el.textContent).join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ps3-syscon-uart-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // グラフ表示切替・時間幅・記録出力・クリア
    [showCellCb, showRsxCb, showSbCb, showFanCb].forEach(cb => {
      if (cb) cb.addEventListener('change', () => drawChart());
    });

    if (chartWindowSelect) {
      chartWindowSelect.addEventListener('change', () => {
        localStorage.setItem('uartChartWindow', chartWindowSelect.value);
        drawChart();
      });
    }
    if (chartTimeModeSelect) {
      chartTimeModeSelect.addEventListener('change', () => {
        localStorage.setItem('uartChartTimeMode', chartTimeModeSelect.value);
        drawChart();
      });
    }

    [tempMinInput, tempMaxInput, fanMinInput, fanMaxInput].forEach(inp => {
      if (inp) inp.addEventListener('input', () => drawChart());
    });

    if (resetRangeBtn) {
      resetRangeBtn.addEventListener('click', () => {
        if (tempMinInput) tempMinInput.value = '';
        if (tempMaxInput) tempMaxInput.value = '';
        if (fanMinInput) fanMinInput.value = '';
        if (fanMaxInput) fanMaxInput.value = '';
        drawChart();
      });
    }

    if (clearRecordsBtn) {
      clearRecordsBtn.addEventListener('click', () => {
        records = [];
        sessionStartMs = null;
        hoverClientX = null;
        if (chartTooltip) chartTooltip.classList.add('hidden');
        updateRecordControls();
        drawChart();
      });
    }

    function parseTelemetryCsvText(csvText) {
      const clean = String(csvText || '').replace(/^\uFEFF/, '');
      const lines = clean.split(/\r?\n/);
      const parsed = [];
      let baseTs = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        if (cols.length < 5) continue;
        // ヘッダ行をスキップ
        if (i === 0 && (/日時|timestamp|time/i.test(cols[0]) || Number.isNaN(parseFloat(cols[1])))) {
          continue;
        }
        const elapsedRaw = parseFloat(cols[1]);
        const elapsedSec = Number.isFinite(elapsedRaw) ? elapsedRaw : 0;

        let ts = NaN;
        if (cols[0]) {
          const isoLike = cols[0].includes(' ') && !cols[0].includes('T')
            ? cols[0].replace(' ', 'T')
            : cols[0];
          ts = Date.parse(isoLike);
          if (Number.isNaN(ts)) ts = Date.parse(cols[0]);
        }
        if (Number.isNaN(ts)) {
          if (baseTs === null) baseTs = Date.now();
          ts = baseTs + Math.round(elapsedSec * 1000);
        } else if (baseTs === null) {
          baseTs = ts - Math.round(elapsedSec * 1000);
        }

        const cell = cols[2] !== '' && !Number.isNaN(parseFloat(cols[2])) ? parseFloat(cols[2]) : null;
        const rsx = cols[3] !== '' && !Number.isNaN(parseFloat(cols[3])) ? parseFloat(cols[3]) : null;
        const sb = cols[4] !== '' && !Number.isNaN(parseFloat(cols[4])) ? parseFloat(cols[4]) : null;
        const fan = cols.length > 5 && cols[5] !== '' && !Number.isNaN(parseFloat(cols[5])) ? parseFloat(cols[5]) : null;
        const fanHex = cols.length > 6 && cols[6] ? cols[6] : null;
        const sweepMs = cols.length > 7 && cols[7] !== '' ? (parseInt(cols[7], 10) || 0) : 0;

        parsed.push({ ts, elapsedSec, cell, rsx, sb, fan, fanHex, sweepMs });
      }
      return parsed;
    }

    function updateCsvViewerControls(fileName = null) {
      const hasCsv = csvRecords.length > 0;
      if (csvExportPngBtn) csvExportPngBtn.disabled = !hasCsv;
      if (csvExportHdPngBtn) csvExportHdPngBtn.disabled = !hasCsv;
      if (csvExportUhdPngBtn) csvExportUhdPngBtn.disabled = !hasCsv;
      if (csvClearBtn) csvClearBtn.disabled = !hasCsv;
      if (csvViewerBadge) {
        csvViewerBadge.textContent = hasCsv
          ? `${fileName || '読込済み'} (${csvRecords.length.toLocaleString()} 件)`
          : '未読込';
      }
    }

    function exportChartPng(cfg, width, height, scale, prefix) {
      if (cfg.getRecords().length === 0) return;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = width;
      exportCanvas.height = height;
      drawChart(exportCanvas, true, scale, cfg);
      const url = exportCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      a.click();
    }

    function syncCsvTimeInputsFromState() {
      if (!csvTimeStartInput || !csvTimeEndInput) return;
      if (csvRangeStartTs === null || csvRangeEndTs === null || csvRecords.length === 0) {
        csvTimeStartInput.value = '';
        csvTimeEndInput.value = '';
        return;
      }
      const baseTs = csvSessionStartMs || csvRecords[0].ts;
      const isElapsed = Boolean(csvTimeModeSelect && csvTimeModeSelect.value === 'elapsed');
      if (isElapsed) {
        csvTimeStartInput.value = formatElapsedTimeLabel(Math.max(0, (csvRangeStartTs - baseTs) / 1000));
        csvTimeEndInput.value = formatElapsedTimeLabel(Math.max(0, (csvRangeEndTs - baseTs) / 1000));
      } else {
        csvTimeStartInput.value = formatTimeLabel(csvRangeStartTs);
        csvTimeEndInput.value = formatTimeLabel(csvRangeEndTs);
      }
    }

    function parseCsvTimeInputToTs(raw, isEnd = false) {
      if (csvRecords.length === 0) return null;
      const s = String(raw || '').trim();
      if (!s) return null;
      const firstTs = csvRecords[0].ts;
      const lastTs = csvRecords[csvRecords.length - 1].ts;
      const baseTs = csvSessionStartMs || firstTs;

      // 数値のみの場合は経過秒として解釈
      if (/^\d+(?:\.\d+)?$/.test(s)) {
        return Math.max(firstTs, Math.min(lastTs, baseTs + Math.round(parseFloat(s) * 1000)));
      }
      // HH:MM:SS または MM:SS
      const hms = s.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
      if (hms) {
        const isElapsed = Boolean(csvTimeModeSelect && csvTimeModeSelect.value === 'elapsed');
        const parts = hms[3] !== undefined
          ? [parseInt(hms[1], 10), parseInt(hms[2], 10), parseInt(hms[3], 10)]
          : [0, parseInt(hms[1], 10), parseInt(hms[2], 10)];
        if (isElapsed) {
          const sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          return Math.max(firstTs, Math.min(lastTs, baseTs + sec * 1000));
        }
        const ref = new Date(isEnd ? lastTs : firstTs);
        ref.setHours(parts[0], parts[1], parts[2], isEnd ? 999 : 0);
        return Math.max(firstTs, Math.min(lastTs, ref.getTime()));
      }
      return null;
    }

    function setCsvTimeRange(startTs, endTs) {
      if (csvRecords.length === 0) return;
      const firstTs = csvRecords[0].ts;
      const lastTs = csvRecords[csvRecords.length - 1].ts;
      let s = Math.max(firstTs, Math.min(lastTs, startTs));
      let e = Math.max(firstTs, Math.min(lastTs, endTs));
      if (e < s) [s, e] = [e, s];
      if (e - s < 1000) {
        e = Math.min(lastTs, s + 1000);
        if (e - s < 1000) s = Math.max(firstTs, e - 1000);
      }
      if (s <= firstTs && e >= lastTs) {
        csvRangeStartTs = null;
        csvRangeEndTs = null;
      } else {
        csvRangeStartTs = s;
        csvRangeEndTs = e;
      }
      syncCsvTimeInputsFromState();
      drawCsvChart();
    }

    function resetCsvTimeRange() {
      csvRangeStartTs = null;
      csvRangeEndTs = null;
      syncCsvTimeInputsFromState();
      drawCsvChart();
    }

    function applyCsvTimeRangeFromInputs() {
      if (csvRecords.length === 0) return;
      const rawStart = csvTimeStartInput ? csvTimeStartInput.value.trim() : '';
      const rawEnd = csvTimeEndInput ? csvTimeEndInput.value.trim() : '';
      if (!rawStart && !rawEnd) {
        resetCsvTimeRange();
        return;
      }
      const firstTs = csvRecords[0].ts;
      const lastTs = csvRecords[csvRecords.length - 1].ts;
      const s = rawStart ? parseCsvTimeInputToTs(rawStart, false) : firstTs;
      const e = rawEnd ? parseCsvTimeInputToTs(rawEnd, true) : lastTs;
      if (s === null || e === null) return;
      setCsvTimeRange(s, e);
    }

    async function loadCsvFile(file) {
      if (!file) return;
      const hostWin = (csvViewerCard && csvViewerCard.ownerDocument.defaultView) || window;
      try {
        const text = await file.text();
        const imported = parseTelemetryCsvText(text);
        if (imported.length === 0) {
          hostWin.alert('読み込める記録データが見つかりませんでした。本ツールで出力した CSV 形式か確認してください。');
          return;
        }
        csvRecords = imported;
        csvSessionStartMs = imported[0].ts - Math.round((imported[0].elapsedSec || 0) * 1000);
        csvHoverClientX = null;
        csvRangeStartTs = null;
        csvRangeEndTs = null;
        csvDragSelection = null;
        syncCsvTimeInputsFromState();
        updateCsvViewerControls(file.name);
        drawCsvChart();
      } catch (err) {
        hostWin.alert(`CSV の読み込みに失敗しました: ${err.message}`);
      }
    }

    if (importCsvBtn && importCsvInput) {
      importCsvBtn.addEventListener('click', () => {
        importCsvInput.value = '';
        importCsvInput.click();
      });

      importCsvInput.addEventListener('change', async () => {
        const file = importCsvInput.files && importCsvInput.files[0];
        await loadCsvFile(file);
      });
    }

    if (csvViewerCard) {
      csvViewerCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        csvViewerCard.classList.add('is-dragover');
      });
      csvViewerCard.addEventListener('dragleave', (e) => {
        if (!csvViewerCard.contains(e.relatedTarget)) {
          csvViewerCard.classList.remove('is-dragover');
        }
      });
      csvViewerCard.addEventListener('drop', async (e) => {
        e.preventDefault();
        csvViewerCard.classList.remove('is-dragover');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) {
          await loadCsvFile(file);
        }
      });
    }

    if (csvFullscreenBtn && csvViewerCard) {
      const syncFsBtn = () => {
        const isFs = document.fullscreenElement === csvViewerCard;
        csvFullscreenBtn.textContent = isFs ? '✕ 全画面解除' : '⛶ 全画面表示';
        setTimeout(() => drawCsvChart(), 30);
      };
      csvFullscreenBtn.addEventListener('click', async () => {
        try {
          if (document.fullscreenElement === csvViewerCard) {
            await document.exitFullscreen();
          } else {
            await csvViewerCard.requestFullscreen();
          }
        } catch (_) {}
      });
      document.addEventListener('fullscreenchange', syncFsBtn);
    }

    [csvShowCellCb, csvShowRsxCb, csvShowSbCb, csvShowFanCb].forEach(cb => {
      if (cb) cb.addEventListener('change', () => drawCsvChart());
    });
    if (csvTimeModeSelect) {
      csvTimeModeSelect.addEventListener('change', () => {
        syncCsvTimeInputsFromState();
        drawCsvChart();
      });
    }
    if (csvTimeStartInput) csvTimeStartInput.addEventListener('change', applyCsvTimeRangeFromInputs);
    if (csvTimeEndInput) csvTimeEndInput.addEventListener('change', applyCsvTimeRangeFromInputs);
    if (csvResetTimeRangeBtn) csvResetTimeRangeBtn.addEventListener('click', resetCsvTimeRange);
    [csvTempMinInput, csvTempMaxInput, csvFanMinInput, csvFanMaxInput].forEach(inp => {
      if (inp) inp.addEventListener('input', () => drawCsvChart());
    });
    if (csvResetRangeBtn) {
      csvResetRangeBtn.addEventListener('click', () => {
        if (csvTempMinInput) csvTempMinInput.value = '';
        if (csvTempMaxInput) csvTempMaxInput.value = '';
        if (csvFanMinInput) csvFanMinInput.value = '';
        if (csvFanMaxInput) csvFanMaxInput.value = '';
        drawCsvChart();
      });
    }
    if (csvClearBtn) {
      csvClearBtn.addEventListener('click', () => {
        csvRecords = [];
        csvSessionStartMs = null;
        csvHoverClientX = null;
        csvRangeStartTs = null;
        csvRangeEndTs = null;
        csvDragSelection = null;
        syncCsvTimeInputsFromState();
        updateCsvViewerControls();
        drawCsvChart();
      });
    }
    if (csvExportPngBtn && csvChartCanvas) {
      csvExportPngBtn.addEventListener('click', () => {
        exportChartPng(
          getCsvChartCtx(),
          Math.max(960, csvChartCanvas.clientWidth || 960),
          Math.max(460, csvChartCanvas.clientHeight || 460),
          1,
          'ps3-syscon-csv-chart'
        );
      });
    }
    if (csvExportHdPngBtn && csvChartCanvas) {
      csvExportHdPngBtn.addEventListener('click', () => exportChartPng(getCsvChartCtx(), 3200, 1280, 2, 'ps3-syscon-csv-chart-hd'));
    }
    if (csvExportUhdPngBtn && csvChartCanvas) {
      csvExportUhdPngBtn.addEventListener('click', () => exportChartPng(getCsvChartCtx(), 9600, 3840, 4, 'ps3-syscon-csv-chart-uhd'));
    }

    if (csvChartCanvas) {
      let csvPanState = null;

      const pxToCsvTs = (clientX) => {
        if (!csvLastPlotBounds || csvRecords.length === 0) return null;
        const { pad, plotW, xMin, xMax } = csvLastPlotBounds;
        const ratio = Math.max(0, Math.min(1, (clientX - pad.left) / Math.max(1, plotW)));
        return xMin + ratio * (xMax - xMin);
      };

      csvChartCanvas.addEventListener('mousedown', (e) => {
        if (csvRecords.length === 0 || !csvLastPlotBounds) return;
        const rect = csvChartCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
          // Shift+ドラッグまたは中ボタンドラッグで左右パン移動
          e.preventDefault();
          csvPanState = {
            startX: x,
            origStartTs: csvLastPlotBounds.xMin,
            origEndTs: csvLastPlotBounds.xMax
          };
          csvDragSelection = null;
          return;
        }
        if (e.button === 0) {
          csvDragSelection = { active: true, startX: x, currX: x };
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (csvPanState && csvLastPlotBounds && csvRecords.length > 0) {
          const rect = csvChartCanvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const dx = x - csvPanState.startX;
          const span = csvPanState.origEndTs - csvPanState.origStartTs;
          const dt = -Math.round((dx / Math.max(1, csvLastPlotBounds.plotW)) * span);
          const firstTs = csvRecords[0].ts;
          const lastTs = csvRecords[csvRecords.length - 1].ts;
          let newStart = csvPanState.origStartTs + dt;
          let newEnd = csvPanState.origEndTs + dt;
          if (newStart < firstTs) {
            newStart = firstTs;
            newEnd = Math.min(lastTs, firstTs + span);
          }
          if (newEnd > lastTs) {
            newEnd = lastTs;
            newStart = Math.max(firstTs, lastTs - span);
          }
          setCsvTimeRange(newStart, newEnd);
          return;
        }
        if (csvDragSelection && csvDragSelection.active) {
          const rect = csvChartCanvas.getBoundingClientRect();
          csvDragSelection.currX = e.clientX - rect.left;
          drawCsvChart();
        }
      });

      window.addEventListener('mouseup', () => {
        if (csvPanState) {
          csvPanState = null;
        }
        if (csvDragSelection && csvDragSelection.active) {
          const { startX, currX } = csvDragSelection;
          csvDragSelection = null;
          if (Math.abs(currX - startX) >= 8) {
            const t1 = pxToCsvTs(startX);
            const t2 = pxToCsvTs(currX);
            if (t1 !== null && t2 !== null) {
              setCsvTimeRange(t1, t2);
              return;
            }
          }
          drawCsvChart();
        }
      });

      csvChartCanvas.addEventListener('mousemove', (e) => {
        const rect = csvChartCanvas.getBoundingClientRect();
        csvHoverClientX = e.clientX - rect.left;
        if (!csvDragSelection && !csvPanState) {
          drawCsvChart();
        }
      });

      csvChartCanvas.addEventListener('mouseleave', () => {
        csvHoverClientX = null;
        if (csvChartTooltip) csvChartTooltip.classList.add('hidden');
        if (!csvDragSelection && !csvPanState) {
          drawCsvChart();
        }
      });

      csvChartCanvas.addEventListener('wheel', (e) => {
        if (csvRecords.length === 0 || !csvLastPlotBounds) return;
        e.preventDefault();
        const rect = csvChartCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pivotTs = pxToCsvTs(x);
        if (pivotTs === null) return;
        const firstTs = csvRecords[0].ts;
        const lastTs = csvRecords[csvRecords.length - 1].ts;
        const curStart = csvLastPlotBounds.xMin;
        const curEnd = csvLastPlotBounds.xMax;
        const curSpan = Math.max(1000, curEnd - curStart);
        const factor = e.deltaY < 0 ? 0.72 : 1.38;
        const newSpan = Math.max(2000, Math.min(lastTs - firstTs, curSpan * factor));
        const ratio = (pivotTs - curStart) / curSpan;
        let newStart = pivotTs - ratio * newSpan;
        let newEnd = newStart + newSpan;
        if (newStart < firstTs) {
          newStart = firstTs;
          newEnd = Math.min(lastTs, firstTs + newSpan);
        }
        if (newEnd > lastTs) {
          newEnd = lastTs;
          newStart = Math.max(firstTs, lastTs - newSpan);
        }
        setCsvTimeRange(newStart, newEnd);
      }, { passive: false });

      csvChartCanvas.addEventListener('dblclick', () => {
        if (csvRecords.length > 0) {
          resetCsvTimeRange();
        }
      });

      if (typeof ResizeObserver !== 'undefined' && csvChartCanvas.parentElement) {
        const csvRo = new ResizeObserver(() => drawCsvChart());
        csvRo.observe(csvChartCanvas.parentElement);
      }
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        if (records.length === 0) return;
        const header = '日時,経過時間(秒),CELL温度(℃),RSX温度(℃),SB温度(℃),ファン速度(%),ファンHEX,1周取得時間(ms)';
        const blobParts = ['\uFEFF' + header + '\r\n'];
        const CHUNK = 5000;
        for (let start = 0; start < records.length; start += CHUNK) {
          const end = Math.min(records.length, start + CHUNK);
          const lines = new Array(end - start);
          for (let i = start; i < end; i++) {
            const r = records[i];
            lines[i - start] =
              `${formatIsoLocal(r.ts)},${r.elapsedSec.toFixed(3)},` +
              `${r.cell !== null ? r.cell.toFixed(2) : ''},` +
              `${r.rsx !== null ? r.rsx.toFixed(2) : ''},` +
              `${r.sb !== null ? r.sb.toFixed(2) : ''},` +
              `${r.fan !== null ? r.fan.toFixed(0) : ''},` +
              `${r.fanHex || ''},${r.sweepMs}`;
          }
          blobParts.push(lines.join('\r\n') + (end < records.length ? '\r\n' : ''));
        }
        const blob = new Blob(blobParts, { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ps3-syscon-telemetry-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (exportPngBtn && chartCanvas) {
      exportPngBtn.addEventListener('click', () => {
        if (records.length === 0) return;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = Math.max(960, chartCanvas.clientWidth || 960);
        exportCanvas.height = Math.max(420, chartCanvas.clientHeight || 420);
        drawChart(exportCanvas, true, 1);
        const url = exportCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `ps3-syscon-chart-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
        a.click();
      });
    }

    if (exportHdPngBtn && chartCanvas) {
      exportHdPngBtn.addEventListener('click', () => {
        if (records.length === 0) return;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = 3200;
        exportCanvas.height = 1280;
        drawChart(exportCanvas, true, 2);
        const url = exportCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `ps3-syscon-chart-hd-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
        a.click();
      });
    }

    if (exportUhdPngBtn && chartCanvas) {
      exportUhdPngBtn.addEventListener('click', () => {
        if (records.length === 0) return;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = 9600;
        exportCanvas.height = 3840;
        drawChart(exportCanvas, true, 4);
        const url = exportCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `ps3-syscon-chart-uhd-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
        a.click();
      });
    }

    function applyQuickDiagButtonConfig() {
      const quickPanel = viewEl.querySelector('[data-panel-id="panel-quick"]');
      if (!quickPanel) return;
      const hideDisabled = QUICK_DIAG_DISABLED_MODE === 'hide';

      quickPanel.querySelectorAll('[data-quick-key]').forEach((btn) => {
        const key = getQuickDiagBtnKey(btn);
        const enabled = isQuickDiagButtonEnabled(key);
        btn.classList.toggle('hidden', !enabled && hideDisabled);
        if (!enabled) btn.disabled = true;
      });

      quickPanel.querySelectorAll('.uart-quick-group').forEach((group) => {
        const groupBtns = group.querySelectorAll('[data-quick-key]');
        const anyVisible = Array.from(groupBtns).some((b) => !b.classList.contains('hidden'));
        group.classList.toggle('hidden', !anyVisible);
      });

      const viewBar = quickPanel.querySelector('.uart-quick-view-bar');
      if (viewBar) {
        const viewBtns = viewBar.querySelectorAll('[data-quick-key]');
        const anyViewVisible = Array.from(viewBtns).some((b) => !b.classList.contains('hidden'));
        viewBar.classList.toggle('hidden', !anyViewVisible);
      }
    }

    // クイック診断コマンド カテゴリ別/一覧 表示切り替え
    let quickViewMode = localStorage.getItem('uartQuickViewMode') === 'flat' ? 'flat' : 'grouped';
    function applyQuickViewMode(mode) {
      quickViewMode = mode === 'flat' ? 'flat' : 'grouped';
      localStorage.setItem('uartQuickViewMode', quickViewMode);
      if (quickBarEl) quickBarEl.classList.toggle('flat-mode', quickViewMode === 'flat');
      if (quickViewGroupedBtn) quickViewGroupedBtn.classList.toggle('active', quickViewMode === 'grouped');
      if (quickViewFlatBtn) quickViewFlatBtn.classList.toggle('active', quickViewMode === 'flat');
    }
    if (quickViewGroupedBtn) quickViewGroupedBtn.addEventListener('click', () => {
      if (!isQuickDiagButtonEnabled('viewGrouped')) return;
      applyQuickViewMode('grouped');
    });
    if (quickViewFlatBtn) quickViewFlatBtn.addEventListener('click', () => {
      if (!isQuickDiagButtonEnabled('viewFlat')) return;
      applyQuickViewMode('flat');
    });
    applyQuickViewMode(quickViewMode);
    applyQuickDiagButtonConfig();

    if (chartCanvas) {
      chartCanvas.addEventListener('mousemove', (e) => {
        const rect = chartCanvas.getBoundingClientRect();
        hoverClientX = e.clientX - rect.left;
        drawChart();
      });
      chartCanvas.addEventListener('mouseleave', () => {
        hoverClientX = null;
        if (chartTooltip) chartTooltip.classList.add('hidden');
        drawChart();
      });

      if (typeof ResizeObserver !== 'undefined' && chartCanvas.parentElement) {
        const ro = new ResizeObserver(() => drawChart());
        ro.observe(chartCanvas.parentElement);
      }
      window.addEventListener('resize', () => {
        drawChart();
        drawCsvChart();
      });
      window.addEventListener('hashchange', () => {
        if (window.location.hash === '#uart-monitor') {
          setTimeout(() => {
            applyAllPanelStates();
            drawChart();
          }, 20);
        } else if (window.location.hash === '#csv-viewer') {
          setTimeout(() => drawCsvChart(), 20);
        }
      });

      const themeObserver = new MutationObserver(() => {
        drawChart();
        drawCsvChart();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    }

    // コンソール配置（下部 / 右端固定）と横幅調整
    let isDockedRight = localStorage.getItem('uartConsoleDock') === 'right';
    let consoleWidthPx = parseInt(localStorage.getItem('uartConsoleWidth') || '440', 10);
    if (Number.isNaN(consoleWidthPx) || consoleWidthPx < 300 || consoleWidthPx > 780) {
      consoleWidthPx = 440;
    }

    const viewModeTabBtn = document.getElementById('uartViewModeTabBtn');
    const viewModeStackBtn = document.getElementById('uartViewModeStackBtn');
    const browserTabBar = document.getElementById('uartBrowserTabBar');
    const browserTabs = document.querySelectorAll('.uart-browser-tab');
    const expandAllBtn = document.getElementById('uartExpandAllBtn');
    const collapseAllBtn = document.getElementById('uartCollapseAllBtn');
    const resetLayoutBtn = document.getElementById('uartResetLayoutBtn');
    const workspaceMain = viewEl.querySelector('.uart-workspace-main');
    const consolePaneEl = viewEl.querySelector('.uart-console-pane');
    const consolePanelEl = viewEl.querySelector('.uart-panel[data-panel-id="panel-console"]');

    let panelViewMode = localStorage.getItem('uartPanelViewMode') === 'stacked' ? 'stacked' : 'tabbed';
    let consoleSide = localStorage.getItem('uartConsoleSide') === 'left' ? 'left' : 'right';
    let activeTabPanelId = localStorage.getItem('uartActiveTabPanel') || 'panel-conn';

    // ==========================================
    // 1〜7 パネル 自由配置・リサイズ・最小化 ＆ 別ウィンドウ管理
    // ==========================================
    const PANEL_STORAGE_KEY = 'uartPanelLayoutV1';
    const poppedPanels = new Map(); // id -> { win, placeholder, panel, ro }
    let chartOnlyPopout = null; // { win, placeholder, wrapper, ro }
    let layoutState = { freeLayout: false, topZ: 10, panels: {} };
    try {
      const savedRaw = localStorage.getItem(PANEL_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.panels && typeof parsed.panels === 'object') {
            layoutState = {
              freeLayout: Boolean(parsed.freeLayout),
              topZ: typeof parsed.topZ === 'number' ? parsed.topZ : 10,
              panels: parsed.panels
            };
          } else {
            layoutState.panels = parsed;
          }
        }
      }
    } catch (_) {
      layoutState = { freeLayout: false, topZ: 10, panels: {} };
    }

    function savePanelStates() {
      try {
        localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(layoutState));
      } catch (_) {}
    }

    function getPanelState(id) {
      if (!layoutState.panels[id]) {
        layoutState.panels[id] = { minimized: false, width: null, height: null, x: null, y: null, z: 1 };
      }
      return layoutState.panels[id];
    }

    function syncBrowserTabs() {
      if (workspaceMain) {
        workspaceMain.classList.toggle('tabbed-mode', panelViewMode === 'tabbed');
      }
      if (browserTabBar) {
        browserTabBar.classList.toggle('hidden', panelViewMode !== 'tabbed');
      }
      if (activeTabPanelId === 'panel-monitor') {
        activeTabPanelId = 'panel-chart';
      }
      if (activeTabPanelId === 'panel-becount-edit') {
        activeTabPanelId = 'panel-conn';
      }
      browserTabs.forEach(tab => {
        const pid = tab.getAttribute('data-tab-panel');
        tab.classList.toggle('active', pid === activeTabPanelId);
      });
    }

    function syncConsoleHost() {
      if (!workspaceMain || !consolePaneEl || !consolePanelEl) return;
      const dockedSideActive = Boolean((panelViewMode === 'tabbed' || isDockedRight) && window.innerWidth > 960);
      const popEntry = poppedPanels.get('panel-console');
      const targetNode = popEntry ? popEntry.placeholder : consolePanelEl;

      if (dockedSideActive && !popEntry) {
        if (targetNode.parentElement !== consolePaneEl) {
          consolePaneEl.appendChild(targetNode);
        }
        consolePaneEl.classList.remove('hidden');
      } else {
        if (targetNode.parentElement !== workspaceMain) {
          workspaceMain.appendChild(targetNode);
        }
        consolePaneEl.classList.add('hidden');
      }
    }

    function updateWorkspaceBounds() {
      if (!workspaceMain) return;
      if (panelViewMode === 'tabbed' || !layoutState.freeLayout || window.innerWidth <= 960) {
        workspaceMain.classList.remove('free-layout');
        workspaceMain.style.minHeight = '';
        return;
      }
      workspaceMain.classList.add('free-layout');
      let maxBottom = 560;
      const panels = workspaceMain.querySelectorAll(':scope > .uart-panel[data-panel-id]');
      panels.forEach(p => {
        if (p.classList.contains('hidden')) return;
        const bottom = p.offsetTop + p.offsetHeight;
        if (bottom > maxBottom) maxBottom = bottom;
      });
      workspaceMain.style.minHeight = `${maxBottom + 48}px`;
    }

    function enableFreeLayoutFromSnapshot() {
      if (!workspaceMain || layoutState.freeLayout) return;
      const panels = Array.from(workspaceMain.querySelectorAll(':scope > .uart-panel[data-panel-id]'))
        .filter(p => !p.classList.contains('hidden'));
      // 現在の自動レイアウト座標をそのままスナップショットしてジャンプを防ぐ
      const snapshots = panels.map(p => ({
        panel: p,
        id: p.getAttribute('data-panel-id'),
        x: p.offsetLeft,
        y: p.offsetTop,
        w: p.offsetWidth
      }));
      layoutState.freeLayout = true;
      snapshots.forEach((snap, idx) => {
        const st = getPanelState(snap.id);
        if (st.x === null || typeof st.x !== 'number') st.x = snap.x;
        if (st.y === null || typeof st.y !== 'number') st.y = snap.y;
        if (st.width === null && snap.w > 0) st.width = snap.w;
        if (!st.z) st.z = idx + 1;
      });
      layoutState.topZ = Math.max(layoutState.topZ, snapshots.length + 2);
    }

    function bringPanelToFront(panel) {
      if (!layoutState.freeLayout) return;
      const id = panel.getAttribute('data-panel-id');
      if (!id) return;
      const st = getPanelState(id);
      layoutState.topZ = (layoutState.topZ || 10) + 1;
      st.z = layoutState.topZ;
      panel.style.zIndex = String(st.z);
    }

    function applyPanelState(panel) {
      const id = panel.getAttribute('data-panel-id');
      if (!id) return;
      const st = getPanelState(id);
      const minBtn = panel.querySelector('.uart-minimize-btn');
      const popBtn = panel.querySelector('.uart-popout-btn');
      const isPopped = poppedPanels.has(id);

      if (popBtn) {
        popBtn.textContent = isPopped ? '↩ 戻す' : '🗗';
        popBtn.title = isPopped ? '元のウィンドウに戻す' : '別ウィンドウで開く';
      }

      if (isPopped) {
        panel.classList.add('is-popped-out');
        panel.classList.remove('minimized', 'has-custom-height', 'tab-hidden');
        panel.style.left = '';
        panel.style.top = '';
        panel.style.width = '';
        panel.style.height = '';
        panel.style.zIndex = '';
        const popEntry = poppedPanels.get(id);
        if (popEntry && popEntry.placeholder) {
          popEntry.placeholder.classList.toggle('hidden', panelViewMode === 'tabbed' && id !== activeTabPanelId);
        }
        return;
      }
      panel.classList.remove('is-popped-out');

      if (panelViewMode === 'tabbed' && id !== 'panel-console') {
        panel.classList.remove('minimized', 'has-custom-height');
        panel.classList.toggle('tab-hidden', id !== activeTabPanelId);
        panel.style.left = '';
        panel.style.top = '';
        panel.style.width = '';
        panel.style.height = '';
        panel.style.zIndex = '';
        return;
      }
      panel.classList.remove('tab-hidden');

      const consolePane = id === 'panel-console' ? panel.closest('.uart-console-pane') : null;
      const dockedRightActive = Boolean((panelViewMode === 'tabbed' || isDockedRight) && id === 'panel-console' && window.innerWidth > 960);
      const effectiveMin = (panelViewMode === 'tabbed' && id === 'panel-console') ? false : Boolean(st.minimized);
      const inFreeCanvas = Boolean(panelViewMode === 'stacked' && layoutState.freeLayout && !dockedRightActive && window.innerWidth > 960);

      panel.classList.toggle('minimized', effectiveMin);
      if (minBtn) {
        minBtn.textContent = effectiveMin ? '＋' : '－';
        minBtn.title = effectiveMin ? 'パネルを展開' : 'パネルを最小化';
        minBtn.setAttribute('aria-expanded', effectiveMin ? 'false' : 'true');
      }

      if (consolePane) {
        consolePane.classList.toggle('console-minimized', effectiveMin);
      }

      if (inFreeCanvas) {
        panel.style.left = `${st.x ?? 0}px`;
        panel.style.top = `${st.y ?? 0}px`;
        panel.style.zIndex = String(st.z || 1);
      } else {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.zIndex = '';
      }

      if (effectiveMin) {
        panel.classList.remove('has-custom-height');
        panel.style.height = '';
        if (consolePane) consolePane.style.height = '';
        if (dockedRightActive) {
          panel.style.width = '';
        } else {
          panel.style.width = st.width ? `${st.width}px` : '';
        }
        return;
      }

      if (dockedRightActive) {
        panel.classList.remove('has-custom-height');
        panel.style.width = '';
        panel.style.height = '';
        if (consolePane) {
          consolePane.style.height = st.height ? `${st.height}px` : '';
        }
      } else {
        if (consolePane) consolePane.style.height = '';
        panel.style.width = st.width ? `${st.width}px` : '';
        if (st.height) {
          panel.style.height = `${st.height}px`;
          panel.classList.add('has-custom-height');
        } else {
          panel.style.height = '';
          panel.classList.remove('has-custom-height');
        }
      }
    }

    function applyAllPanelStates() {
      syncBrowserTabs();
      syncConsoleHost();
      const panels = viewEl.querySelectorAll('.uart-panel[data-panel-id]');
      panels.forEach(applyPanelState);
      poppedPanels.forEach(entry => applyPanelState(entry.panel));
      updateWorkspaceBounds();
    }

    function dockBackPanel(id) {
      const entry = poppedPanels.get(id);
      if (!entry) return;
      poppedPanels.delete(id);

      const { win, placeholder, panel, ro } = entry;
      if (ro) {
        try { ro.disconnect(); } catch (_) {}
      }

      panel.classList.remove('is-popped-out');
      try {
        document.adoptNode(panel);
      } catch (_) {}

      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(panel, placeholder);
        placeholder.remove();
      } else if (workspaceMain) {
        workspaceMain.appendChild(panel);
      }

      if (win && !win.closed) {
        try { win.close(); } catch (_) {}
      }

      applyConsoleLayout();
      requestAnimationFrame(() => drawChart());
    }

    function dockBackChartOnly() {
      if (!chartOnlyPopout) return;
      const { win, placeholder, wrapper, ro } = chartOnlyPopout;
      chartOnlyPopout = null;
      if (ro) {
        try { ro.disconnect(); } catch (_) {}
      }
      try {
        document.adoptNode(wrapper);
      } catch (_) {}
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(wrapper, placeholder);
        placeholder.remove();
      }
      if (win && !win.closed) {
        try { win.close(); } catch (_) {}
      }
      if (popoutChartOnlyBtn) {
        popoutChartOnlyBtn.textContent = '🗗 グラフのみ別ウィンドウ';
        popoutChartOnlyBtn.classList.remove('active');
      }
      requestAnimationFrame(() => drawChart());
    }

    function popoutChartOnly() {
      if (!liveChartWrapper) return;
      if (chartOnlyPopout) {
        if (chartOnlyPopout.win && !chartOnlyPopout.win.closed) {
          chartOnlyPopout.win.focus();
          return;
        }
        dockBackChartOnly();
      }
      const popWin = window.open(
        '',
        'uart_popout_chart_only',
        'popup=yes,width=960,height=520,resizable=yes,scrollbars=no'
      );
      if (!popWin) {
        appendLog('ERR', '別ウィンドウを開けませんでした。ブラウザのポップアップブロック設定を許可してください。');
        return;
      }

      const placeholder = document.createElement('div');
      placeholder.className = 'uart-popout-placeholder';
      const infoSpan = document.createElement('span');
      infoSpan.textContent = '🗗 温度・ファン推移グラフのみ別ウィンドウで表示中です';
      const btnGroup = document.createElement('div');
      btnGroup.className = 'uart-header-actions';

      const focusBtn = document.createElement('button');
      focusBtn.type = 'button';
      focusBtn.className = 'uart-btn uart-btn-sm uart-btn-secondary';
      focusBtn.textContent = '前面に表示';
      focusBtn.addEventListener('click', () => {
        if (popWin && !popWin.closed) popWin.focus();
      });

      const returnBtn = document.createElement('button');
      returnBtn.type = 'button';
      returnBtn.className = 'uart-btn uart-btn-sm uart-btn-primary';
      returnBtn.textContent = '↩ 元の画面に戻す';
      returnBtn.addEventListener('click', dockBackChartOnly);

      btnGroup.appendChild(focusBtn);
      btnGroup.appendChild(returnBtn);
      placeholder.appendChild(infoSpan);
      placeholder.appendChild(btnGroup);

      if (liveChartWrapper.parentNode) {
        liveChartWrapper.parentNode.insertBefore(placeholder, liveChartWrapper);
      }

      const popDoc = popWin.document;
      popDoc.open();
      popDoc.write('<!DOCTYPE html><html class="uart-popout-html"><head><meta charset="UTF-8"><title>温度・ファン推移グラフ — PS3 Syscon Tool</title></head><body class="uart-popout-body uart-chart-only-popout"></body></html>');
      popDoc.close();

      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      const fontSize = document.documentElement.getAttribute('data-font-size') || 'medium';
      popDoc.documentElement.setAttribute('data-theme', theme);
      popDoc.documentElement.setAttribute('data-font-size', fontSize);

      chartOnlyPopout = { win: popWin, placeholder, wrapper: liveChartWrapper, ro: null };

      let raf = 0;
      const refresh = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => drawChart());
      };

      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const href = link.href || link.getAttribute('href');
        if (!href) return;
        const cloned = popDoc.createElement('link');
        cloned.rel = 'stylesheet';
        cloned.href = new URL(href, window.location.href).href;
        cloned.addEventListener('load', refresh);
        popDoc.head.appendChild(cloned);
      });

      const adopted = popDoc.adoptNode(liveChartWrapper);
      popDoc.body.appendChild(adopted);

      if (popoutChartOnlyBtn) {
        popoutChartOnlyBtn.textContent = '↩ グラフを元に戻す';
        popoutChartOnlyBtn.classList.add('active');
      }

      popWin.addEventListener('resize', refresh);
      if ('ResizeObserver' in popWin) {
        const ro = new popWin.ResizeObserver(refresh);
        ro.observe(popDoc.body);
        chartOnlyPopout.ro = ro;
      }

      popWin.addEventListener('beforeunload', dockBackChartOnly);
      popWin.addEventListener('pagehide', dockBackChartOnly);
      refresh();
    }

    if (popoutChartOnlyBtn) {
      popoutChartOnlyBtn.addEventListener('click', () => {
        if (chartOnlyPopout) {
          dockBackChartOnly();
        } else {
          popoutChartOnly();
        }
      });
    }

    function closeAllPopouts() {
      dockBackChartOnly();
      Array.from(poppedPanels.keys()).forEach(id => dockBackPanel(id));
    }

    const themeSyncObserver = new MutationObserver(() => {
      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      const fontSize = document.documentElement.getAttribute('data-font-size') || 'medium';
      poppedPanels.forEach(({ win }) => {
        if (win && !win.closed && win.document && win.document.documentElement) {
          win.document.documentElement.setAttribute('data-theme', theme);
          win.document.documentElement.setAttribute('data-font-size', fontSize);
        }
      });
      if (chartOnlyPopout && chartOnlyPopout.win && !chartOnlyPopout.win.closed && chartOnlyPopout.win.document) {
        chartOnlyPopout.win.document.documentElement.setAttribute('data-theme', theme);
        chartOnlyPopout.win.document.documentElement.setAttribute('data-font-size', fontSize);
        requestAnimationFrame(() => drawChart());
      }
      if (poppedPanels.has('panel-chart')) {
        requestAnimationFrame(() => drawChart());
      }
    });
    themeSyncObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-font-size']
    });

    function popoutPanel(panel) {
      const id = panel.getAttribute('data-panel-id');
      if (!id) return;
      const existing = poppedPanels.get(id);
      if (existing) {
        if (existing.win && !existing.win.closed) {
          existing.win.focus();
          return;
        }
        dockBackPanel(id);
      }

      const sizeMap = {
        'panel-chart': { w: 960, h: 640 },
        'panel-console': { w: 760, h: 720 },
        'panel-voltage': { w: 780, h: 700 },
        'panel-fantbl-edit': { w: 1020, h: 720 },
        'panel-quick': { w: 760, h: 620 }
      };
      const dim = sizeMap[id] || { w: 720, h: 560 };
      const popWin = window.open(
        '',
        `uart_popout_${id}`,
        `popup=yes,width=${dim.w},height=${dim.h},resizable=yes,scrollbars=yes`
      );
      if (!popWin) {
        appendLog('ERR', '別ウィンドウを開けませんでした。ブラウザのポップアップブロック設定を許可してください。');
        return;
      }

      const titleText = (panel.querySelector('.uart-panel-header h2')?.textContent || id).trim();
      const placeholder = document.createElement('div');
      placeholder.className = 'uart-popout-placeholder';
      placeholder.setAttribute('data-for-panel', id);

      const infoSpan = document.createElement('span');
      infoSpan.textContent = `🗗 「${titleText}」は別ウィンドウで表示中です`;
      const btnGroup = document.createElement('div');
      btnGroup.className = 'uart-header-actions';

      const focusBtn = document.createElement('button');
      focusBtn.type = 'button';
      focusBtn.className = 'uart-btn uart-btn-sm uart-btn-secondary';
      focusBtn.textContent = '前面に表示';
      focusBtn.addEventListener('click', () => {
        if (popWin && !popWin.closed) popWin.focus();
      });

      const returnBtn = document.createElement('button');
      returnBtn.type = 'button';
      returnBtn.className = 'uart-btn uart-btn-sm uart-btn-primary';
      returnBtn.textContent = '↩ 元の画面に戻す';
      returnBtn.addEventListener('click', () => dockBackPanel(id));

      btnGroup.appendChild(focusBtn);
      btnGroup.appendChild(returnBtn);
      placeholder.appendChild(infoSpan);
      placeholder.appendChild(btnGroup);

      if (panel.parentNode) {
        panel.parentNode.insertBefore(placeholder, panel);
      }

      const popDoc = popWin.document;
      popDoc.open();
      popDoc.write('<!DOCTYPE html><html class="uart-popout-html"><head><meta charset="UTF-8"><title></title></head><body class="uart-popout-body"></body></html>');
      popDoc.close();
      popDoc.title = `${titleText} — PS3 Syscon Tool`;

      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      const fontSize = document.documentElement.getAttribute('data-font-size') || 'medium';
      popDoc.documentElement.setAttribute('data-theme', theme);
      popDoc.documentElement.setAttribute('data-font-size', fontSize);

      const entry = { win: popWin, placeholder, panel, ro: null };
      poppedPanels.set(id, entry);

      let resizeRaf = 0;
      const schedulePopoutRefresh = (forceScrollBottom = false) => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          if (id === 'panel-chart') {
            drawChart();
          }
          if (id === 'panel-fantbl-edit') {
            drawFanTableChart();
          }
          if (id === 'panel-console' && terminalEl) {
            const nearBottom = forceScrollBottom || (terminalEl.scrollHeight - terminalEl.scrollTop - terminalEl.clientHeight) < 80;
            if (nearBottom) {
              terminalEl.scrollTop = terminalEl.scrollHeight;
            }
          }
        });
      };

      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const href = link.href || link.getAttribute('href');
        if (!href) return;
        const cloned = popDoc.createElement('link');
        cloned.rel = 'stylesheet';
        cloned.href = new URL(href, window.location.href).href;
        cloned.addEventListener('load', () => schedulePopoutRefresh(true));
        popDoc.head.appendChild(cloned);
      });

      const adopted = popDoc.adoptNode(panel);
      popDoc.body.appendChild(adopted);

      applyAllPanelStates();

      popWin.addEventListener('resize', () => schedulePopoutRefresh(false));
      if ('ResizeObserver' in popWin) {
        const ro = new popWin.ResizeObserver(() => schedulePopoutRefresh(false));
        ro.observe(popDoc.body);
        entry.ro = ro;
      }

      const handleClose = () => dockBackPanel(id);
      popWin.addEventListener('beforeunload', handleClose);
      popWin.addEventListener('pagehide', handleClose);

      schedulePopoutRefresh(true);
    }

    function initPanelManager() {
      const panels = viewEl.querySelectorAll('.uart-panel[data-panel-id]');
      panels.forEach(panel => {
        const id = panel.getAttribute('data-panel-id');
        const header = panel.querySelector('.uart-panel-header');
        if (!header) return;

        // タイトル前にドラッグ用グリップ(⋮⋮)を追加
        const titleEl = header.querySelector('h2');
        if (titleEl && !header.querySelector('.uart-panel-title-wrap')) {
          const wrap = document.createElement('div');
          wrap.className = 'uart-panel-title-wrap';
          const grip = document.createElement('span');
          grip.className = 'uart-drag-grip';
          grip.textContent = '⋮⋮';
          grip.title = 'ドラッグして任意の位置へ移動';
          titleEl.parentNode.insertBefore(wrap, titleEl);
          wrap.appendChild(grip);
          wrap.appendChild(titleEl);
        }

        // ヘッダー右側に最小化ボタンを配置
        let rightBox = header.querySelector('.uart-panel-header-right');
        if (!rightBox) {
          rightBox = document.createElement('div');
          rightBox.className = 'uart-panel-header-right';
          Array.from(header.children).forEach(child => {
            if (!child.classList.contains('uart-panel-title-wrap') && child.tagName !== 'H2') {
              rightBox.appendChild(child);
            }
          });
          header.appendChild(rightBox);
        }

        let minBtn = rightBox.querySelector('.uart-minimize-btn');
        if (!minBtn) {
          minBtn = document.createElement('button');
          minBtn.type = 'button';
          minBtn.className = 'uart-minimize-btn';
          rightBox.appendChild(minBtn);
        }

        let popBtn = rightBox.querySelector('.uart-popout-btn');
        if (!popBtn) {
          popBtn = document.createElement('button');
          popBtn.type = 'button';
          popBtn.className = 'uart-popout-btn';
          popBtn.textContent = '🗗';
          popBtn.title = '別ウィンドウで開く';
          rightBox.insertBefore(popBtn, minBtn);
        }
        popBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (poppedPanels.has(id)) {
            dockBackPanel(id);
          } else {
            popoutPanel(panel);
          }
        });

        minBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (poppedPanels.has(id)) return;
          const st = getPanelState(id);
          st.minimized = !st.minimized;
          savePanelStates();
          applyPanelState(panel);
          updateWorkspaceBounds();
          requestAnimationFrame(() => drawChart());
        });

        if (titleEl) {
          titleEl.title = 'ドラッグで移動 / ダブルクリックで最小化・展開';
          titleEl.addEventListener('dblclick', () => {
            if (!poppedPanels.has(id)) minBtn.click();
          });
        }

        // パネルクリックで前面表示
        panel.addEventListener('pointerdown', () => {
          if (poppedPanels.has(id)) return;
          if (layoutState.freeLayout) {
            bringPanelToFront(panel);
            savePanelStates();
          }
        });

        // ヘッダーのドラッグ＆ドロップ自由移動
        let movePending = false;
        let moving = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let origPanelX = 0;
        let origPanelY = 0;

        header.addEventListener('pointerdown', (e) => {
          if (poppedPanels.has(id)) return;
          if (e.button !== 0) return;
          if (e.target.closest('button, input, select, textarea, a, label')) return;
          if (window.innerWidth <= 960) return;
          const dockedRightActive = Boolean(isDockedRight && id === 'panel-console');
          if (dockedRightActive) return;

          movePending = true;
          moving = false;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          header.setPointerCapture(e.pointerId);
        });

        header.addEventListener('pointermove', (e) => {
          if (!movePending) return;
          const dx = e.clientX - dragStartX;
          const dy = e.clientY - dragStartY;

          if (!moving) {
            if (Math.hypot(dx, dy) < 5) return;
            moving = true;
            enableFreeLayoutFromSnapshot();
            applyAllPanelStates();
            const st = getPanelState(id);
            origPanelX = st.x ?? panel.offsetLeft;
            origPanelY = st.y ?? panel.offsetTop;
            bringPanelToFront(panel);
            panel.classList.add('dragging-panel');
          }

          const st = getPanelState(id);
          const maxW = workspaceMain ? Math.max(0, workspaceMain.clientWidth - panel.offsetWidth) : 0;
          const snapX = Math.round((origPanelX + dx) / 8) * 8;
          const snapY = Math.round((origPanelY + dy) / 8) * 8;
          st.x = Math.max(0, Math.min(maxW, snapX));
          st.y = Math.max(0, snapY);
          panel.style.left = `${st.x}px`;
          panel.style.top = `${st.y}px`;
          updateWorkspaceBounds();
        });

        const stopMove = (e) => {
          if (!movePending) return;
          movePending = false;
          if (moving) {
            moving = false;
            panel.classList.remove('dragging-panel');
            savePanelStates();
            updateWorkspaceBounds();
            if (id === 'panel-chart') drawChart();
          }
          if (e && header.hasPointerCapture && header.hasPointerCapture(e.pointerId)) {
            header.releasePointerCapture(e.pointerId);
          }
        };
        header.addEventListener('pointerup', stopMove);
        header.addEventListener('pointercancel', stopMove);

        // 右・下・右下のリサイズハンドルを生成
        const dirs = [
          { cls: 'uart-panel-resize-r', dir: 'r', title: '左右にドラッグして横幅を変更' },
          { cls: 'uart-panel-resize-b', dir: 'b', title: '上下にドラッグして縦幅を変更' },
          { cls: 'uart-panel-resize-br', dir: 'br', title: 'ドラッグして縦横サイズを自由に変更' }
        ];

        dirs.forEach(spec => {
          const handle = document.createElement('div');
          handle.className = spec.cls;
          handle.title = spec.title;
          panel.appendChild(handle);

          let dragging = false;
          let startX = 0;
          let startY = 0;
          let startW = 0;
          let startH = 0;

          handle.addEventListener('pointerdown', (e) => {
            if (poppedPanels.has(id)) return;
            const st = getPanelState(id);
            if (st.minimized) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startW = rect.width;
            startH = rect.height;
            panel.classList.add('resizing');
            handle.setPointerCapture(e.pointerId);
            e.preventDefault();
          });

          handle.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const st = getPanelState(id);
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const dockedRightActive = Boolean(isDockedRight && id === 'panel-console' && window.innerWidth > 960);

            if (spec.dir === 'r' || spec.dir === 'br') {
              if (dockedRightActive) {
                setConsoleWidth(startW + dx);
              } else {
                const containerW = panel.parentElement ? panel.parentElement.clientWidth : window.innerWidth;
                const offsetX = layoutState.freeLayout ? (st.x || 0) : 0;
                const maxPanelW = Math.max(260, containerW - offsetX);
                const targetW = Math.max(260, Math.min(maxPanelW, Math.round(startW + dx)));
                if (!layoutState.freeLayout && targetW >= maxPanelW - 4) {
                  st.width = null;
                  panel.style.width = '';
                } else {
                  st.width = targetW;
                  panel.style.width = `${targetW}px`;
                }
              }
            }

            if (spec.dir === 'b' || spec.dir === 'br') {
              const targetH = Math.max(120, Math.min(1400, Math.round(startH + dy)));
              st.height = targetH;
              if (dockedRightActive) {
                const consolePane = panel.closest('.uart-console-pane');
                if (consolePane) consolePane.style.height = `${targetH}px`;
              } else {
                panel.style.height = `${targetH}px`;
                panel.classList.add('has-custom-height');
              }
              updateWorkspaceBounds();
            }

            if (id === 'panel-chart') {
              drawChart();
            }
          });

          const stopResize = (e) => {
            if (!dragging) return;
            dragging = false;
            panel.classList.remove('resizing');
            if (e && handle.hasPointerCapture && handle.hasPointerCapture(e.pointerId)) {
              handle.releasePointerCapture(e.pointerId);
            }
            savePanelStates();
            updateWorkspaceBounds();
            drawChart();
          };

          handle.addEventListener('pointerup', stopResize);
          handle.addEventListener('pointercancel', stopResize);
        });
      });

      applyAllPanelStates();
    }

    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => {
        const panels = viewEl.querySelectorAll('.uart-panel[data-panel-id]');
        panels.forEach(panel => {
          if (panel.classList.contains('hidden')) return;
          const id = panel.getAttribute('data-panel-id');
          getPanelState(id).minimized = false;
        });
        savePanelStates();
        applyAllPanelStates();
        requestAnimationFrame(() => drawChart());
      });
    }

    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        const panels = viewEl.querySelectorAll('.uart-panel[data-panel-id]');
        panels.forEach(panel => {
          if (panel.classList.contains('hidden')) return;
          const id = panel.getAttribute('data-panel-id');
          getPanelState(id).minimized = true;
        });
        savePanelStates();
        applyAllPanelStates();
        requestAnimationFrame(() => drawChart());
      });
    }

    if (resetLayoutBtn) {
      resetLayoutBtn.addEventListener('click', () => {
        closeAllPopouts();
        layoutState = { freeLayout: false, topZ: 10, panels: {} };
        savePanelStates();
        consoleWidthPx = 440;
        localStorage.setItem('uartConsoleWidth', '440');
        applyConsoleLayout();
        requestAnimationFrame(() => drawChart());
      });
    }

    function applyConsoleLayout() {
      if (!splitLayout) return;
      const isTabbed = panelViewMode === 'tabbed';
      splitLayout.classList.toggle('dock-right', isTabbed ? (consoleSide === 'right') : isDockedRight);
      splitLayout.classList.toggle('dock-left', isTabbed && consoleSide === 'left');
      splitLayout.style.setProperty('--uart-console-width', `${consoleWidthPx}px`);

      if (viewModeTabBtn) viewModeTabBtn.classList.toggle('active', isTabbed);
      if (viewModeStackBtn) viewModeStackBtn.classList.toggle('active', !isTabbed);
      if (expandAllBtn) expandAllBtn.classList.toggle('hidden', isTabbed);
      if (collapseAllBtn) collapseAllBtn.classList.toggle('hidden', isTabbed);

      const showSideControls = isTabbed || isDockedRight;
      if (resizerEl) resizerEl.classList.toggle('hidden', !showSideControls);
      if (widthControl) widthControl.classList.toggle('hidden', !showSideControls);
      if (widthSlider) widthSlider.value = String(consoleWidthPx);
      if (widthLabel) widthLabel.textContent = `${consoleWidthPx}px`;

      let labelText;
      let shortText;
      if (isTabbed) {
        labelText = consoleSide === 'right' ? '◧ コンソールを左へ' : '◨ コンソールを右へ';
        shortText = consoleSide === 'right' ? '◧ 左へ' : '◨ 右へ';
      } else {
        labelText = isDockedRight ? '⬇ コンソールを下部に戻す' : '◨ コンソールを右端に固定';
        shortText = isDockedRight ? '⬇ 下部へ' : '◨ 右端に固定';
      }
      if (dockToggleBtn) {
        dockToggleBtn.textContent = labelText;
        dockToggleBtn.classList.toggle('uart-btn-primary', isTabbed || isDockedRight);
      }
      if (dockConsoleBtn) dockConsoleBtn.textContent = shortText;

      applyAllPanelStates();
      requestAnimationFrame(() => {
        drawChart();
        drawFanTableChart();
      });
    }

    function setPanelViewMode(mode) {
      panelViewMode = mode === 'stacked' ? 'stacked' : 'tabbed';
      localStorage.setItem('uartPanelViewMode', panelViewMode);
      applyConsoleLayout();
    }

    function setActiveTabPanel(panelId) {
      activeTabPanelId = panelId;
      localStorage.setItem('uartActiveTabPanel', activeTabPanelId);
      applyAllPanelStates();
      requestAnimationFrame(() => {
        if (panelId === 'panel-chart') drawChart();
        if (panelId === 'panel-fantbl-edit') drawFanTableChart();
      });
    }

    if (viewModeTabBtn) viewModeTabBtn.addEventListener('click', () => setPanelViewMode('tabbed'));
    if (viewModeStackBtn) viewModeStackBtn.addEventListener('click', () => setPanelViewMode('stacked'));
    browserTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const pid = tab.getAttribute('data-tab-panel');
        if (pid) setActiveTabPanel(pid);
      });
    });

    function toggleConsoleDock() {
      if (panelViewMode === 'tabbed') {
        consoleSide = consoleSide === 'right' ? 'left' : 'right';
        localStorage.setItem('uartConsoleSide', consoleSide);
      } else {
        isDockedRight = !isDockedRight;
        localStorage.setItem('uartConsoleDock', isDockedRight ? 'right' : 'bottom');
      }
      applyConsoleLayout();
    }

    function setConsoleWidth(px) {
      const maxAllowed = splitLayout ? Math.max(320, Math.min(780, splitLayout.clientWidth - 312)) : 780;
      consoleWidthPx = Math.max(300, Math.min(maxAllowed, Math.round(px)));
      localStorage.setItem('uartConsoleWidth', String(consoleWidthPx));
      if (splitLayout) splitLayout.style.setProperty('--uart-console-width', `${consoleWidthPx}px`);
      if (widthSlider) widthSlider.value = String(consoleWidthPx);
      if (widthLabel) widthLabel.textContent = `${consoleWidthPx}px`;
      drawChart();
    }

    if (dockToggleBtn) dockToggleBtn.addEventListener('click', toggleConsoleDock);
    if (dockConsoleBtn) dockConsoleBtn.addEventListener('click', toggleConsoleDock);
    if (widthSlider) {
      widthSlider.addEventListener('input', () => {
        setConsoleWidth(parseInt(widthSlider.value, 10));
      });
    }

    if (resizerEl && splitLayout) {
      let dragging = false;
      resizerEl.addEventListener('pointerdown', (e) => {
        if (panelViewMode !== 'tabbed' && !isDockedRight) return;
        dragging = true;
        resizerEl.classList.add('dragging');
        resizerEl.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      resizerEl.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = splitLayout.getBoundingClientRect();
        const isLeft = panelViewMode === 'tabbed' && consoleSide === 'left';
        const newWidth = isLeft ? (e.clientX - rect.left - 6) : (rect.right - e.clientX - 6);
        setConsoleWidth(newWidth);
      });
      const stopDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        resizerEl.classList.remove('dragging');
        if (e && resizerEl.hasPointerCapture && resizerEl.hasPointerCapture(e.pointerId)) {
          resizerEl.releasePointerCapture(e.pointerId);
        }
      };
      resizerEl.addEventListener('pointerup', stopDrag);
      resizerEl.addEventListener('pointercancel', stopDrag);
    }

    initPanelManager();
    applyConsoleLayout();
    window.addEventListener('resize', () => {
      applyAllPanelStates();
      drawFanTableChart();
    });
    window.addEventListener('beforeunload', closeAllPopouts);

    // USB抜去時の安全停止
    if ('serial' in navigator) {
      navigator.serial.addEventListener('disconnect', async (e) => {
        if (client.port && !client.port.isWebUsb && e.target === client.port) {
          stopPolling();
          await client.disconnect();
          resetBecountDisplay('--');
          resetVoltCurrentDisplay();
          updateMiniTelemetry(null);
          appendLog('SYS', 'USBシリアルデバイスが取り外されました');
          updateUiState();
        }
      });
    }
    if ('usb' in navigator) {
      navigator.usb.addEventListener('disconnect', async (e) => {
        if (client.port && client.port.isWebUsb && e.device === client.port.usbDevice) {
          stopPolling();
          await client.disconnect();
          resetBecountDisplay('--');
          resetVoltCurrentDisplay();
          updateMiniTelemetry(null);
          appendLog('SYS', 'WebUSB デバイスが取り外されました');
          updateUiState();
        }
      });
    }

    updateUiState();
    drawChart();
    drawCsvChart();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSysconUartTool);
  } else {
    initSysconUartTool();
  }
})();

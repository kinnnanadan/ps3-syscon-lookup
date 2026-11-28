/**
 * WebUSB シリアルポートアダプタ (Android Chrome + USB-OTG 対応)
 * Web Serial API (navigator.serial) の SerialPort と互換の open / readable / writable / close を提供します。
 * 対応チップ: FTDI (FT232R/H等), Silicon Labs CP210x, WCH CH340/CH341, Prolific PL2303, USB CDC-ACM
 */
(function (root) {
  'use strict';

  const DEFAULT_FILTERS = [
    { vendorId: 0x0403 }, // FTDI (FT232R / FT232H / FT2232 等)
    { vendorId: 0x10C4 }, // Silicon Labs (CP2102 / CP2104 / CP2105 等)
    { vendorId: 0x1A86 }, // WCH (CH340 / CH341 / CH9102 等)
    { vendorId: 0x067B }, // Prolific (PL2303 等)
    { classCode: 0x02, subclassCode: 0x02 }, // USB CDC-ACM
    { classCode: 0x02 }, // USB CDC
    { vendorId: 0x0483 }, // STMicroelectronics Virtual COM
    { vendorId: 0x2341 }, // Arduino
    { vendorId: 0x2E8A }, // Raspberry Pi Pico
    { vendorId: 0x303A }, // Espressif (ESP32-S2/S3/C3/C6)
    { vendorId: 0x239A }, // Adafruit
    { vendorId: 0x1B4F }, // SparkFun
  ];

  const FTDI_FRAC_CODE = [0, 3, 2, 4, 1, 5, 6, 7];

  function computeFtdiDivisor(baudRate) {
    const rate = Math.max(1, Number(baudRate) || 115200);
    const divisor8 = Math.max(1, Math.round((3000000 * 8) / rate));
    const intDiv = divisor8 >> 3;
    const frac = divisor8 & 0x07;
    const encoded = (intDiv & 0x3FFF) | ((FTDI_FRAC_CODE[frac] & 0x07) << 14);
    const value = encoded & 0xFFFF;
    const highBit = (encoded >>> 16) & 0x01;
    return { value, highBit, encoded };
  }

  function stripFtdiModemStatus(bytes, packetSize = 64) {
    if (!bytes || bytes.length <= 2) return new Uint8Array(0);
    const pkt = Math.max(3, Number(packetSize) || 64);
    const chunks = [];
    let total = 0;
    for (let offset = 0; offset < bytes.length; offset += pkt) {
      const end = Math.min(offset + pkt, bytes.length);
      if (end - offset > 2) {
        const slice = bytes.subarray(offset + 2, end);
        chunks.push(slice);
        total += slice.length;
      }
    }
    if (total === 0) return new Uint8Array(0);
    if (chunks.length === 1) return new Uint8Array(chunks[0]);
    const out = new Uint8Array(total);
    let pos = 0;
    for (let i = 0; i < chunks.length; i++) {
      out.set(chunks[i], pos);
      pos += chunks[i].length;
    }
    return out;
  }

  const CH34X_PRESCALERS = [
    { ps: 3, clk: 6000000 },
    { ps: 2, clk: 750000 },
    { ps: 1, clk: 93750 },
    { ps: 0, clk: 11718.75 },
  ];

  function computeCh34xBaudReg(baudRate) {
    const rate = Math.max(1, Number(baudRate) || 115200);
    let picked = CH34X_PRESCALERS[CH34X_PRESCALERS.length - 1];
    for (let i = 0; i < CH34X_PRESCALERS.length; i++) {
      const cand = Math.round(CH34X_PRESCALERS[i].clk / rate);
      if (cand >= 2 && cand <= 256) {
        picked = CH34X_PRESCALERS[i];
        break;
      }
    }
    const div = Math.max(2, Math.min(256, Math.round(picked.clk / rate)));
    const factor = (256 - div) & 0xFF;
    const reg1312 = ((factor << 8) | 0x80 | picked.ps) & 0xFFFF;
    return { reg1312, ps: picked.ps, div, factor };
  }

  function buildCdcLineCoding(baudRate, dataBits = 8, stopBits = 1, parity = 'none') {
    const buf = new ArrayBuffer(7);
    const view = new DataView(buf);
    view.setUint32(0, Number(baudRate) || 115200, true);
    view.setUint8(4, stopBits === 2 ? 2 : 0); // 0: 1 stop bit, 2: 2 stop bits
    const parityMap = { none: 0, odd: 1, even: 2 };
    view.setUint8(5, parityMap[parity] ?? 0);
    view.setUint8(6, dataBits || 8);
    return new Uint8Array(buf);
  }

  function detectDriver(device) {
    const vid = device && typeof device.vendorId === 'number' ? device.vendorId : 0;
    if (vid === 0x0403) return { driver: 'ftdi', driverName: 'FTDI' };
    if (vid === 0x10C4) return { driver: 'cp210x', driverName: 'CP210x' };
    if (vid === 0x1A86) return { driver: 'ch34x', driverName: 'CH340/CH341' };
    if (vid === 0x067B) return { driver: 'pl2303', driverName: 'PL2303' };

    const interfaces = (device && device.configuration && device.configuration.interfaces) || [];
    for (let i = 0; i < interfaces.length; i++) {
      const alts = interfaces[i].alternates || [];
      for (let j = 0; j < alts.length; j++) {
        if (alts[j].interfaceClass === 0x02 || alts[j].interfaceClass === 0x0A) {
          return { driver: 'cdc', driverName: 'CDC-ACM' };
        }
      }
    }
    return { driver: 'cdc', driverName: 'CDC-ACM' };
  }

  function discoverEndpoints(device) {
    const interfaces = (device && device.configuration && device.configuration.interfaces) || [];
    let commInterfaceNumber = null;

    for (let i = 0; i < interfaces.length; i++) {
      const iface = interfaces[i];
      const alts = iface.alternates || [];
      for (let j = 0; j < alts.length; j++) {
        if (alts[j].interfaceClass === 0x02 && commInterfaceNumber === null) {
          commInterfaceNumber = iface.interfaceNumber;
        }
      }
    }

    // Prefer an interface+alternate that has BOTH bulk IN and bulk OUT (skips interrupt endpoints)
    for (let i = 0; i < interfaces.length; i++) {
      const iface = interfaces[i];
      const alts = iface.alternates || [];
      for (let j = 0; j < alts.length; j++) {
        const alt = alts[j];
        const eps = alt.endpoints || [];
        let epIn = null;
        let epOut = null;
        for (let k = 0; k < eps.length; k++) {
          const ep = eps[k];
          if (ep.type !== 'bulk') continue;
          if (ep.direction === 'in' && !epIn) epIn = ep;
          if (ep.direction === 'out' && !epOut) epOut = ep;
        }
        if (epIn && epOut) {
          return {
            commInterfaceNumber,
            dataInterfaceNumber: iface.interfaceNumber,
            dataAlternateSetting: alt.alternateSetting || 0,
            epIn: epIn.endpointNumber,
            epInPacketSize: epIn.packetSize || 64,
            epOut: epOut.endpointNumber,
            epOutPacketSize: epOut.packetSize || 64,
            interfaceCount: interfaces.length,
          };
        }
      }
    }

    throw new Error('USB-UART の Bulk IN/OUT エンドポイントが見つかりませんでした');
  }

  function toUint8Array(chunk) {
    if (chunk instanceof Uint8Array) return chunk;
    if (ArrayBuffer.isView(chunk)) {
      return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    }
    if (chunk instanceof ArrayBuffer) {
      return new Uint8Array(chunk);
    }
    if (typeof chunk === 'string') {
      const out = new Uint8Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) out[i] = chunk.charCodeAt(i) & 0xFF;
      return out;
    }
    throw new TypeError('Unsupported write chunk type');
  }

  class WebUsbSerialPort {
    constructor(usbDevice) {
      this.usbDevice = usbDevice;
      this.isWebUsb = true;
      const detected = detectDriver(usbDevice);
      this.driver = detected.driver;
      this.driverName = detected.driverName;
      this.deviceLabel = (usbDevice && (usbDevice.productName || usbDevice.manufacturerName))
        || `VID:0x${((usbDevice && usbDevice.vendorId) || 0).toString(16).padStart(4, '0')}`;
      this.readable = null;
      this.writable = null;
      this._opened = false;
      this._closing = false;
      this._endpoints = null;
      this._claimedInterfaces = [];
    }

    async open(options = {}) {
      const baudRate = Number(options.baudRate) || 115200;
      const dataBits = Number(options.dataBits) || 8;
      const stopBits = Number(options.stopBits) || 1;
      const parity = options.parity || 'none';

      this._closing = false;
      this._claimedInterfaces = [];

      if (!this.usbDevice.opened) {
        await this.usbDevice.open();
      }
      if (this.usbDevice.configuration === null) {
        await this.usbDevice.selectConfiguration(1);
      }

      const detected = detectDriver(this.usbDevice);
      this.driver = detected.driver;
      this.driverName = detected.driverName;

      const ep = discoverEndpoints(this.usbDevice);
      this._endpoints = ep;

      if (ep.commInterfaceNumber !== null && ep.commInterfaceNumber !== ep.dataInterfaceNumber) {
        try {
          await this.usbDevice.claimInterface(ep.commInterfaceNumber);
          this._claimedInterfaces.push(ep.commInterfaceNumber);
        } catch (_) {
          // Some Android/CDC devices don't require claiming the comm interface separately
        }
      }

      await this.usbDevice.claimInterface(ep.dataInterfaceNumber);
      this._claimedInterfaces.push(ep.dataInterfaceNumber);

      if (ep.dataAlternateSetting !== 0) {
        await this.usbDevice.selectAlternateInterface(ep.dataInterfaceNumber, ep.dataAlternateSetting);
      }

      await this._configureChip(baudRate, dataBits, stopBits, parity);

      const self = this;
      const readSize = this.driver === 'ftdi' ? ep.epInPacketSize : Math.max(ep.epInPacketSize, 64);

      this.readable = new ReadableStream({
        async pull(controller) {
          while (!self._closing) {
            try {
              const res = await self.usbDevice.transferIn(ep.epIn, readSize);
              if (self._closing) {
                try { controller.close(); } catch (_) {}
                return;
              }
              if (res.status === 'stall') {
                await self.usbDevice.clearHalt('in', ep.epIn);
                continue;
              }
              if (res.status === 'ok' && res.data && res.data.byteLength > 0) {
                let bytes = new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength);
                if (self.driver === 'ftdi') {
                  bytes = stripFtdiModemStatus(bytes, ep.epInPacketSize);
                } else {
                  bytes = new Uint8Array(bytes);
                }
                if (bytes.length > 0) {
                  controller.enqueue(bytes);
                  return;
                }
              }
            } catch (err) {
              if (self._closing || !self.usbDevice.opened) {
                try { controller.close(); } catch (_) {}
              } else {
                controller.error(err);
              }
              return;
            }
          }
          try { controller.close(); } catch (_) {}
        },
        cancel() {
          self._closing = true;
        },
      });

      this.writable = new WritableStream({
        async write(chunk) {
          if (self._closing || !self.usbDevice.opened) {
            throw new Error('WebUSB ポートは閉じられています');
          }
          const data = toUint8Array(chunk);
          const maxPkt = ep.epOutPacketSize || 64;
          for (let offset = 0; offset < data.length; offset += maxPkt) {
            const slice = data.subarray(offset, Math.min(offset + maxPkt, data.length));
            let res = await self.usbDevice.transferOut(ep.epOut, slice);
            if (res && res.status === 'stall') {
              await self.usbDevice.clearHalt('out', ep.epOut);
              res = await self.usbDevice.transferOut(ep.epOut, slice);
            }
          }
        },
      });

      this._opened = true;
    }

    async _ctrlOut(setup, data) {
      return this.usbDevice.controlTransferOut(setup, data);
    }

    async _configureChip(baudRate, dataBits, stopBits, parity) {
      const ep = this._endpoints;
      switch (this.driver) {
        case 'ftdi': {
          const channel = ep.dataInterfaceNumber + 1;
          const isMulti = ep.interfaceCount > 1;
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x00, value: 0x0000, index: channel }); // Reset
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x00, value: 0x0001, index: channel }); // Purge RX
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x00, value: 0x0002, index: channel }); // Purge TX
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x04, value: 0x0008, index: channel }); // 8N1
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x02, value: 0x0000, index: channel }); // No flow control
          const { value, highBit } = computeFtdiDivisor(baudRate);
          const baudIndex = isMulti ? ((highBit << 8) | channel) : highBit;
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x03, value, index: baudIndex });
          try {
            await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x09, value: 2, index: channel }); // Latency 2ms
          } catch (_) {}
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x01, value: 0x0303, index: channel }); // DTR=1, RTS=1
          break;
        }
        case 'cp210x': {
          const idx = ep.dataInterfaceNumber;
          await this._ctrlOut({ requestType: 'vendor', recipient: 'interface', request: 0x00, value: 0x0001, index: idx }); // IFC_ENABLE
          const baudBuf = new ArrayBuffer(4);
          new DataView(baudBuf).setUint32(0, baudRate, true);
          try {
            await this._ctrlOut({ requestType: 'vendor', recipient: 'interface', request: 0x1E, value: 0x0000, index: idx }, baudBuf); // SET_BAUDRATE
          } catch (_) {
            const div = Math.max(1, Math.round(3686400 / baudRate));
            await this._ctrlOut({ requestType: 'vendor', recipient: 'interface', request: 0x01, value: div, index: idx }); // Legacy SET_BAUDDIV
          }
          await this._ctrlOut({ requestType: 'vendor', recipient: 'interface', request: 0x03, value: 0x0800, index: idx }); // SET_LINE_CTL 8N1
          await this._ctrlOut({ requestType: 'vendor', recipient: 'interface', request: 0x07, value: 0x0303, index: idx }); // SET_MHS DTR+RTS
          try {
            await this._ctrlOut({ requestType: 'vendor', recipient: 'interface', request: 0x12, value: 0x000F, index: idx }); // PURGE
          } catch (_) {}
          break;
        }
        case 'ch34x': {
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0xA1, value: 0x0000, index: 0x0000 });
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x9A, value: 0x2518, index: 0x00C3 }); // LCR 8N1
          const { reg1312 } = computeCh34xBaudReg(baudRate);
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x9A, value: 0x1312, index: reg1312 });
          try {
            await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x9A, value: 0x0F2C, index: 0x0008 });
          } catch (_) {}
          await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0xA4, value: 0x009F, index: 0x0000 }); // DTR+RTS active
          break;
        }
        case 'pl2303': {
          const idx = ep.dataInterfaceNumber;
          const lineCoding = buildCdcLineCoding(baudRate, dataBits, stopBits, parity);
          await this._ctrlOut({ requestType: 'class', recipient: 'interface', request: 0x20, value: 0x0000, index: idx }, lineCoding);
          await this._ctrlOut({ requestType: 'class', recipient: 'interface', request: 0x22, value: 0x0003, index: idx });
          try {
            await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x01, value: 0x0008, index: 0x0000 });
            await this._ctrlOut({ requestType: 'vendor', recipient: 'device', request: 0x01, value: 0x0009, index: 0x0000 });
          } catch (_) {}
          break;
        }
        case 'cdc':
        default: {
          const idx = ep.commInterfaceNumber !== null ? ep.commInterfaceNumber : ep.dataInterfaceNumber;
          const lineCoding = buildCdcLineCoding(baudRate, dataBits, stopBits, parity);
          await this._ctrlOut({ requestType: 'class', recipient: 'interface', request: 0x20, value: 0x0000, index: idx }, lineCoding);
          await this._ctrlOut({ requestType: 'class', recipient: 'interface', request: 0x22, value: 0x0003, index: idx });
          break;
        }
      }
    }

    async close() {
      this._closing = true;
      if (this.usbDevice && this.usbDevice.opened) {
        if (this.driver === 'cp210x' && this._endpoints) {
          try {
            await this._ctrlOut({
              requestType: 'vendor',
              recipient: 'interface',
              request: 0x00,
              value: 0x0000,
              index: this._endpoints.dataInterfaceNumber,
            });
          } catch (_) {}
        }
        for (let i = 0; i < this._claimedInterfaces.length; i++) {
          try {
            await this.usbDevice.releaseInterface(this._claimedInterfaces[i]);
          } catch (_) {}
        }
        try {
          await this.usbDevice.close();
        } catch (_) {}
      }
      this._claimedInterfaces = [];
      this.readable = null;
      this.writable = null;
      this._opened = false;
    }
  }

  function isSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.usb);
  }

  async function requestPort() {
    if (!isSupported()) {
      throw new Error('このブラウザは WebUSB API に対応していません（Android 版 Google Chrome をご利用ください）。');
    }
    const device = await navigator.usb.requestDevice({ filters: DEFAULT_FILTERS });
    return new WebUsbSerialPort(device);
  }

  const WebUsbSerial = {
    DEFAULT_FILTERS,
    WebUsbSerialPort,
    isSupported,
    requestPort,
    _internal: {
      computeFtdiDivisor,
      stripFtdiModemStatus,
      computeCh34xBaudReg,
      buildCdcLineCoding,
      detectDriver,
      discoverEndpoints,
    },
  };

  if (typeof window !== 'undefined') {
    window.WebUsbSerial = WebUsbSerial;
  } else if (root) {
    root.WebUsbSerial = WebUsbSerial;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebUsbSerial;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

// A mocked camera for the scan flow. getUserMedia returns a canvas stream that draws
// whatever barcode the test asks for, so the real ZXing decoder reads real symbols.

import type { Page } from "@playwright/test";
import { BarcodeFormat, DataMatrixWriter, QRCodeWriter } from "@zxing/library";

type Matrix = string[]; // rows of "0" and "1"

declare global {
  interface Window {
    __showBarcode?: (rows: Matrix | null) => void;
  }
}

export function barcode(text: string, format: "datamatrix" | "qr"): Matrix {
  const m = format === "qr"
    ? new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, new Map()) // QR needs a hints map, even empty
    : new DataMatrixWriter().encode(text, BarcodeFormat.DATA_MATRIX, 0, 0);
  const rows: Matrix = [];
  for (let y = 0; y < m.getHeight(); y++) {
    let row = "";
    for (let x = 0; x < m.getWidth(); x++) row += m.get(x, y) ? "1" : "0";
    rows.push(row);
  }
  return rows;
}

export async function installFakeCamera(page: Page, options: { deny?: boolean } = {}) {
  await page.addInitScript(({ deny }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    let rows: string[] | null = null;

    function draw() {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (rows) {
        const n = Math.max(rows.length, rows[0].length);
        const scale = Math.floor(360 / n);
        const ox = Math.floor((canvas.width - rows[0].length * scale) / 2);
        const oy = Math.floor((canvas.height - rows.length * scale) / 2);
        ctx.fillStyle = "#000";
        rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) if (row[x] === "1") ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
        });
      }
      requestAnimationFrame(draw);
    }

    window.__showBarcode = (next) => { rows = next; };
    const mediaDevices = navigator.mediaDevices ?? ({} as MediaDevices);
    mediaDevices.getUserMedia = async () => {
      if (deny) throw new DOMException("Permission denied", "NotAllowedError");
      draw();
      return canvas.captureStream(15);
    };
    Object.defineProperty(navigator, "mediaDevices", { value: mediaDevices, configurable: true });
  }, { deny: options.deny ?? false });
}

/** Points the fake camera at a barcode. */
export async function show(page: Page, rows: Matrix | null) {
  await page.evaluate((r) => window.__showBarcode?.(r), rows);
}

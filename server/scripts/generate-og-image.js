const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a high-quality 1200x630 OpenGraph PNG
function createOGImage(outputPath) {
  const width = 1200;
  const height = 630;
  
  // RGBA buffer (width * height * 4)
  const buffer = Buffer.alloc(width * height * 4);

  // Brand colors
  // Midnight: #004554 -> (0, 69, 84)
  // Midnight dark: #002e38 -> (0, 46, 56)
  // Moonstone: #44A6B5 -> (68, 166, 181)
  // Lightblue: #B2D5E2 -> (178, 213, 226)
  // Aliceblue: #E9F1F6 -> (233, 241, 246)
  // White: (255, 255, 255)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Deep Midnight gradient background with subtle radial glow in top right
      const rx = (x - 900) / 450;
      const ry = (y - 180) / 350;
      const dist = Math.sqrt(rx * rx + ry * ry);
      const glow = Math.max(0, 1 - dist);

      // Base gradient (0, 69, 84) to (0, 38, 46)
      const gradY = y / height;
      let r = Math.round(0 * (1 - gradY) + 0 * gradY + 30 * glow);
      let g = Math.round(69 * (1 - gradY) + 38 * gradY + 80 * glow);
      let b = Math.round(84 * (1 - gradY) + 48 * gradY + 90 * glow);

      // Card container in center-left for visual hierarchy
      // Subtle border line at y = 620
      if (y >= 622) {
        r = 68; g = 166; b = 181; // Moonstone bottom accent line
      }

      buffer[idx] = Math.min(255, r);
      buffer[idx + 1] = Math.min(255, g);
      buffer[idx + 2] = Math.min(255, b);
      buffer[idx + 3] = 255;
    }
  }

  // Draw simple 5x7 bitmap font for text and vector logo icon
  // Simple bitmap font rendering
  const FONT_5X7 = {
    'A': [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    'B': [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
    'C': [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
    'D': [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
    'E': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
    'F': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
    'G': [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F],
    'H': [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    'I': [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
    'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
    'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
    'M': [0x11, 0x1B, 0x15, 0x11, 0x11, 0x11, 0x11],
    'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    'O': [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    'P': [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
    'Q': [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
    'R': [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
    'S': [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
    'T': [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
    'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0A],
    'X': [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
    'Y': [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
    'Z': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
    'a': [0x00, 0x00, 0x0E, 0x01, 0x0F, 0x11, 0x0F],
    'b': [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x1E],
    'c': [0x00, 0x00, 0x0E, 0x10, 0x10, 0x11, 0x0E],
    'd': [0x01, 0x01, 0x0D, 0x13, 0x11, 0x11, 0x0F],
    'e': [0x00, 0x00, 0x0E, 0x11, 0x1F, 0x10, 0x0E],
    'f': [0x06, 0x09, 0x08, 0x1C, 0x08, 0x08, 0x08],
    'g': [0x00, 0x0F, 0x11, 0x11, 0x0F, 0x01, 0x0E],
    'h': [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x11],
    'i': [0x04, 0x00, 0x0C, 0x04, 0x04, 0x04, 0x0E],
    'j': [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0C],
    'k': [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
    'l': [0x0C, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
    'm': [0x00, 0x00, 0x1A, 0x15, 0x15, 0x11, 0x11],
    'n': [0x00, 0x00, 0x16, 0x19, 0x11, 0x11, 0x11],
    'o': [0x00, 0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E],
    'p': [0x00, 0x00, 0x1E, 0x11, 0x1E, 0x10, 0x10],
    'q': [0x00, 0x00, 0x0D, 0x13, 0x0F, 0x01, 0x01],
    'r': [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
    's': [0x00, 0x00, 0x0F, 0x10, 0x0E, 0x01, 0x1E],
    't': [0x08, 0x08, 0x1C, 0x08, 0x08, 0x09, 0x06],
    'u': [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0D],
    'v': [0x00, 0x00, 0x11, 0x11, 0x11, 0x0A, 0x04],
    'w': [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0A],
    'x': [0x00, 0x00, 0x11, 0x0A, 0x04, 0x0A, 0x11],
    'y': [0x00, 0x00, 0x11, 0x11, 0x0F, 0x01, 0x0E],
    'z': [0x00, 0x00, 0x1F, 0x02, 0x04, 0x08, 0x1F],
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    '-': [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00],
    '—': [0x00, 0x00, 0x00, 0x7F, 0x00, 0x00, 0x00],
    '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C],
    ',': [0x00, 0x00, 0x00, 0x00, 0x04, 0x04, 0x08],
    ':': [0x00, 0x0C, 0x0C, 0x00, 0x0C, 0x0C, 0x00],
    '/': [0x01, 0x02, 0x04, 0x08, 0x10, 0x00, 0x00],
    '!': [0x04, 0x04, 0x04, 0x04, 0x00, 0x04, 0x04],
  };

  function setPixel(px, py, color, alpha = 255) {
    if (px < 0 || px >= width || py < 0 || py >= height) return;
    const i = (py * width + px) * 4;
    const a = alpha / 255;
    buffer[i] = Math.round(buffer[i] * (1 - a) + color[0] * a);
    buffer[i + 1] = Math.round(buffer[i + 1] * (1 - a) + color[1] * a);
    buffer[i + 2] = Math.round(buffer[i + 2] * (1 - a) + color[2] * a);
    buffer[i + 3] = 255;
  }

  function drawText(text, startX, startY, scale, color) {
    let cursorX = startX;
    for (let char of text) {
      const glyph = FONT_5X7[char] || FONT_5X7[' '];
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row] || 0;
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            for (let dy = 0; dy < scale; dy++) {
              for (let dx = 0; dx < scale; dx++) {
                setPixel(cursorX + col * scale + dx, startY + row * scale + dy, color);
              }
            }
          }
        }
      }
      cursorX += (5 + 1.5) * scale;
    }
  }

  // Draw Logo Icon Badge (top-left)
  const iconBoxX = 100;
  const iconBoxY = 90;
  const iconBoxSize = 90;
  
  // Draw rounded icon box with border
  for (let y = iconBoxY; y < iconBoxY + iconBoxSize; y++) {
    for (let x = iconBoxX; x < iconBoxX + iconBoxSize; x++) {
      const dx = Math.max(0, Math.abs(x - (iconBoxX + iconBoxSize / 2)) - (iconBoxSize / 2 - 20));
      const dy = Math.max(0, Math.abs(y - (iconBoxY + iconBoxSize / 2)) - (iconBoxSize / 2 - 20));
      if (dx * dx + dy * dy <= 400) {
        setPixel(x, y, [0, 46, 56]); // Dark midnight
      }
    }
  }

  // Draw Logo Icon Arc + Bridge
  const cx = iconBoxX + iconBoxSize / 2;
  const cy = iconBoxY + iconBoxSize / 2;
  const radius = 32;
  for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
    // Gap in top-right dial
    if (angle > 0.3 && angle < 1.3) continue;
    const ax = Math.round(cx + Math.cos(angle) * radius);
    const ay = Math.round(cy + Math.sin(angle) * radius);
    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        if (ox * ox + oy * oy <= 4) {
          setPixel(ax + ox, ay + oy, [68, 166, 181]); // Moonstone
        }
      }
    }
  }

  // Bridge H & M
  for (let y = cy - 20; y <= cy + 20; y++) {
    for (let ox = -2; ox <= 2; ox++) {
      setPixel(cx - 12 + ox, y, [233, 241, 246]); // Aliceblue
      setPixel(cx + 12 + ox, y, [233, 241, 246]);
    }
  }
  for (let x = cx - 12; x <= cx + 12; x++) {
    for (let oy = -2; oy <= 2; oy++) {
      setPixel(x, cy + oy, [68, 166, 181]);
    }
  }

  // Brand Name next to logo
  drawText('HireByMinute', 215, 110, 7, [255, 255, 255]);
  drawText('Expertise by the minute', 218, 165, 3, [68, 166, 181]);

  // Main Headline
  drawText('Hire Experts by the Minute', 100, 240, 8, [244, 248, 250]);

  // Subtitle / Value Proposition
  drawText('Find the right expert and hire them for the exact time you need.', 100, 325, 4, [178, 213, 226]);
  drawText('Real-time 1-on-1 consultations with server-authoritative minute billing.', 100, 365, 4, [178, 213, 226]);

  // Feature Badges at bottom
  // Badge 1: Verified Experts
  const b1X = 100, b1Y = 460, bW = 260, bH = 60;
  for (let y = b1Y; y < b1Y + bH; y++) {
    for (let x = b1X; x < b1X + bW; x++) {
      setPixel(x, y, [0, 48, 58], 200);
    }
  }
  drawText('VERIFIED SPECIALISTS', 125, 482, 3, [233, 241, 246]);

  // Badge 2: Per-Minute Billing
  const b2X = 390;
  for (let y = b1Y; y < b1Y + bH; y++) {
    for (let x = b2X; x < b2X + bW; x++) {
      setPixel(x, y, [0, 48, 58], 200);
    }
  }
  drawText('PAY FOR MINUTES USED', 415, 482, 3, [68, 166, 181]);

  // Badge 3: Live Audio/Video
  const b3X = 680;
  for (let y = b1Y; y < b1Y + bH; y++) {
    for (let x = b3X; x < b3X + bW; x++) {
      setPixel(x, y, [0, 48, 58], 200);
    }
  }
  drawText('ZERO SCOPE CREEP', 715, 482, 3, [233, 241, 246]);

  // Domain Watermark bottom right
  drawText('hirebyminute.com', 920, 560, 3, [68, 166, 181]);

  // Convert raw RGBA to PNG format
  // PNG layout: [filter(1 byte) + row(width*4 bytes)] * height
  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawScanlines[rowOffset] = 0; // Filter: None
    buffer.copy(rawScanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressedData = zlib.deflateSync(rawScanlines, { level: 9 });

  function crc32(buf) {
    let c = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
      c ^= buf[n];
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const typeAndData = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crcBuf]);
  }

  // PNG Header
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk: 1200, 630, 8 bit, Color Type 6 (RGBA), Deflate(0), Filter(0), Interlace(0)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const pngFile = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(outputPath, pngFile);
  console.log('OG Image generated successfully:', outputPath, pngFile.length, 'bytes');
}

// Generate to client/public/og-image.png
createOGImage(path.join(__dirname, '..', '..', 'client', 'public', 'og-image.png'));

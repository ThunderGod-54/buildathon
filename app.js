/********************************************************************/
/* STEGO PDF VIEWER — DEEP STEALTH + TEXT COMPRESSION VERSION       */
/* FIXED: Marker restoration issue                                 */
/********************************************************************/

const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const viewer = document.getElementById("viewer");
const saveBtn = document.getElementById("savePdfBtn");
const statusMsg = document.getElementById("statusMsg");
const stegoViewUpload = document.getElementById("stegoViewUpload");
let pdfDoc = null;
let pdfBase64 = null;
let pageMarkers = {};

/**************** HELPER: COMPRESS/DECOMPRESS *********************/
async function compressText(text) {
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const response = new Response(stream);
    const buffer = await response.arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  } catch (error) {
    console.warn("Compression failed, using plain text:", error);
    return btoa(encodeURIComponent(text));
  }
}

async function decompressText(base64) {
  try {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  } catch (error) {
    console.warn("Decompression failed, trying plain text:", error);
    try {
      return decodeURIComponent(atob(base64));
    } catch (e2) {
      return atob(base64);
    }
  }
}

/*************************** LOAD PDF ********************************/

document.getElementById("pdfUpload").onchange = async e => {
  handlePdfLoad(e.target.files[0], "PDF Loaded. Deep Stealth mode active.");
};

if (stegoViewUpload) {
  stegoViewUpload.onchange = async e => {
    handlePdfLoad(e.target.files[0], "Scanning for hidden data...", true);
  };
}

async function handlePdfLoad(file, successMsg, isViewMode = false) {
  if (!file) return;
  statusMsg.textContent = "Loading PDF...";
  statusMsg.style.color = "#007bff";

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const base64String = event.target.result.split(',')[1];
      pdfBase64 = base64String;
      const viewerBytes = Uint8Array.from(atob(base64String), c => c.charCodeAt(0));
      pdfDoc = await pdfjsLib.getDocument({ data: viewerBytes }).promise;
      viewer.innerHTML = "";
      pageMarkers = {};
      await renderAllPages();

      const found = await restoreMarkers();

      if (isViewMode) {
        if (found) {
          statusMsg.textContent = "✅ Hidden data found and loaded!";
          statusMsg.style.color = "#28a745";
        } else {
          statusMsg.textContent = "⚠️ No hidden data found in this PDF.";
          statusMsg.style.color = "#dc3545";
        }
      } else {
        statusMsg.textContent = successMsg;
        statusMsg.style.color = "#007bff";
      }
    } catch (error) {
      console.error("Error loading PDF:", error);
      statusMsg.textContent = "❌ Error loading PDF: " + error.message;
      statusMsg.style.color = "#dc3545";
    }
  };
  reader.onerror = () => {
    statusMsg.textContent = "❌ Error reading file";
    statusMsg.style.color = "#dc3545";
  };
  reader.readAsDataURL(file);
}

async function renderAllPages() {
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    try {
      const page = await pdfDoc.getPage(p);
      const vp = page.getViewport({ scale: 1.5 });
      const wrap = document.createElement("div");
      wrap.className = "pageWrapper";
      wrap.style = `width:${vp.width}px; height:${vp.height}px; position:relative; margin:0 auto 30px auto; box-shadow:0 4px 20px rgba(0,0,0,0.4); background:white;`;
      wrap.id = `page-${p}`;

      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      canvas.style.cursor = "crosshair";
      wrap.appendChild(canvas);
      viewer.appendChild(wrap);

      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;

      // Add click event to add markers
      canvas.onclick = (e) => openPopupMenu(e, wrap, p);

      // Initialize markers array for this page
      pageMarkers[p] = [];

    } catch (error) {
      console.error(`Error rendering page ${p}:`, error);
    }
  }
}

/**************** POPUP MENU & RECORDING *********************/
function openPopupMenu(e, wrap, pageNum) {
  closePopup();

  const rect = wrap.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const popup = document.createElement("div");
  popup.id = "stegoPopup";
  popup.className = "menuBox";
  popup.style = `left:${x}px; top:${y}px;`;
  popup.innerHTML = `
    <div style="font-weight:bold; margin-bottom:5px;">Add Hidden Data:</div>
    <button id="btnText" style="background:#28a745;">📝 Text</button>
    <button id="btnImg" style="background:#6f42c1;">🖼️ Image</button>
    <button id="btnAudio" style="background:#fd7e14;">🎤 Audio</button>
    <button onclick="this.parentElement.remove()" style="background:#dc3545;">✕ Cancel</button>
  `;

  wrap.appendChild(popup);

  // Text button
  document.getElementById("btnText").onclick = () => {
    const t = prompt("Enter secret message (will be compressed):");
    if (t && t.trim()) {
      addMarker(pageNum, x, y, "text", t.trim(), wrap, true);
      statusMsg.textContent = "✅ Text marker added!";
      statusMsg.style.color = "#28a745";
    }
    closePopup();
  };

  // Image button
  document.getElementById("btnImg").onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async ev => {
      if (ev.target.files[0]) {
        const bytes = new Uint8Array(await ev.target.files[0].arrayBuffer());
        addMarker(pageNum, x, y, "image", bytes, wrap, true);
        statusMsg.textContent = "✅ Image marker added!";
        statusMsg.style.color = "#28a745";
      }
    };
    input.click();
    closePopup();
  };

  // Audio button
  document.getElementById("btnAudio").onclick = () => {
    recordAudio(pageNum, x, y, wrap);
    closePopup();
  };
}

async function recordAudio(p, x, y, wrap) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // --- COMPRESSION UPDATE START ---
    // We force a low bitrate (32kbps) and the Opus codec for maximum efficiency
    const options = {
      audioBitsPerSecond: 32000,
      mimeType: 'audio/webm;codecs=opus'
    };

    const rec = new MediaRecorder(stream, options);
    // --- COMPRESSION UPDATE END ---

    let chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.start();

    const indicator = document.createElement("div");
    indicator.style = `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #dc3545; color: white; padding: 12px 24px; border-radius: 25px; z-index: 9999; cursor: pointer; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.3);`;
    indicator.innerHTML = "🔴 Recording... Click to Stop & Save";
    document.body.appendChild(indicator);

    indicator.onclick = () => {
      rec.stop();
      indicator.remove();
      stream.getTracks().forEach(t => t.stop());

      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        addMarker(p, x, y, "audio", bytes, wrap, true);
        statusMsg.textContent = "✅ Compressed audio added!";
        statusMsg.style.color = "#28a745";
      };
    };
  } catch (error) {
    console.error("Audio recording failed:", error);
    alert("Microphone access denied or not available.");
  }
}
function addMarker(pageNum, x, y, type, content, wrap, isNew) {
  const m = document.createElement("div");
  m.className = "note-marker";
  // Initial positioning
  m.style.left = `${x - 12}px`;
  m.style.top = `${y - 12}px`;
  m.dataset.type = type;
  m.cachedContent = content;

  let isDragging = false;
  let startX, startY;

  // Handle Clicking to Reveal
  m.onclick = (e) => {
    e.stopPropagation();
    if (!isDragging) {
      revealMarker(m, wrap);
    }
  };

  // Handle Dragging to Move
  m.onmousedown = function (event) {
    if (event.button !== 0) return; // Only left click drags

    isDragging = false;
    startX = event.clientX;
    startY = event.clientY;

    const rect = wrap.getBoundingClientRect();
    let shiftX = event.clientX - m.getBoundingClientRect().left;
    let shiftY = event.clientY - m.getBoundingClientRect().top;

    function moveAt(pageX, pageY) {
      let newX = pageX - rect.left - shiftX;
      let newY = pageY - rect.top - shiftY;

      // Boundary checks to keep marker inside the page
      newX = Math.max(0, Math.min(newX, rect.width - 24));
      newY = Math.max(0, Math.min(newY, rect.height - 24));

      m.style.left = newX + 'px';
      m.style.top = newY + 'px';
    }

    function onMouseMove(event) {
      // If mouse moves more than 5 pixels, it's a drag, not a click
      if (Math.abs(event.clientX - startX) > 5 || Math.abs(event.clientY - startY) > 5) {
        isDragging = true;
        moveAt(event.clientX, event.clientY);
      }
    }

    // Attach to document so it doesn't "lose" the marker if you move fast
    document.addEventListener('mousemove', onMouseMove);

    // DROP LOGIC
    document.onmouseup = function () {
      document.removeEventListener('mousemove', onMouseMove);
      document.onmouseup = null; // Clean up document listener

      if (isDragging) {
        const finalX = parseInt(m.style.left) + 12;
        const finalY = parseInt(m.style.top) + 12;

        // Save new position to global object
        updateMarkerPosition(pageNum, x, y, finalX, finalY);

        // Update local scope variables for future moves
        x = finalX;
        y = finalY;

        statusMsg.textContent = "📍 Marker dropped and fixed.";
        statusMsg.style.color = "#28a745";
      }

      // Prevent click from firing immediately after a long drag
      setTimeout(() => { isDragging = false; }, 100);
    };
  };

  m.ondragstart = () => false;
  wrap.appendChild(m);

  if (isNew) {
    if (!pageMarkers[pageNum]) pageMarkers[pageNum] = [];
    pageMarkers[pageNum].push({ x: Math.round(x), y: Math.round(y), type, content });
  }
}

function revealMarker(m, wrap) {
  const existing = wrap.querySelector('.note-popup');
  if (existing) existing.remove();

  const type = m.dataset.type;
  const content = m.cachedContent;

  // Calculate popup position relative to the marker's current position
  const mLeft = parseInt(m.style.left);
  const mTop = parseInt(m.style.top);

  const display = document.createElement("div");
  display.className = "note-popup";
  // Position popup to the right of the dot
  display.style = `left:${mLeft + 30}px; top:${mTop}px;`;

  if (type === "text") {
    display.innerHTML = `
      <div style="margin-bottom:5px; font-weight:bold;">📝 Hidden Text:</div>
      <div style="max-height:200px; overflow-y:auto; word-break: break-all; white-space: pre-wrap;">${content}</div>
    `;
  } else if (type === "image") {
    const blob = new Blob([content], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    display.innerHTML = `
      <div style="margin-bottom:5px; font-weight:bold;">🖼️ Hidden Image:</div>
      <img src="${url}" style="max-width:250px; max-height:250px; border-radius:4px;">
    `;
  } else if (type === "audio") {
    const blob = new Blob([content], { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    display.innerHTML = `
      <div style="margin-bottom:5px; font-weight:bold;">🎤 Hidden Audio:</div>
      <audio src="${url}" controls style="width:250px; height:40px;"></audio>
    `;
  }

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "✕ Close";
  closeBtn.style = `margin-top:10px; padding:4px 12px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px; width: 100%;`;
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    display.remove();
  };
  display.appendChild(closeBtn);

  wrap.appendChild(display);
}
function closePopup() {
  const p = document.getElementById("stegoPopup");
  if (p) p.remove();
}
/**************** SAVE (METADATA + COMPRESSION) - FIXED *********************/
saveBtn.onclick = async () => {
  if (!pdfBase64) {
    alert("Please load a PDF first!");
    return;
  }

  statusMsg.textContent = "Compressing & Saving...";
  statusMsg.style.color = "#007bff";

  try {
    const { PDFDocument } = PDFLib;
    const pdfLibDoc = await PDFDocument.load(Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0)));

    let metadataEntries = [];

    for (const pageNum in pageMarkers) {
      const markers = pageMarkers[pageNum] || [];

      for (const m of markers) {
        if (m.type === "text") {
          const compressed = await compressText(m.content);
          metadataEntries.push(`${pageNum}|${m.x}|${m.y}|ztext|${compressed}`);
        } else {
          // FIX: Improved Binary to Base64 conversion for large images/audio
          let binary = '';
          const bytes = new Uint8Array(m.content);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Data = btoa(binary);

          metadataEntries.push(`${pageNum}|${m.x}|${m.y}|${m.type}|${base64Data}`);
        }
      }
    }

    if (metadataEntries.length === 0) {
      alert("No markers to save!");
      statusMsg.textContent = "No hidden data to save";
      return;
    }

    const metadataString = JSON.stringify({
      version: "2.0",
      timestamp: new Date().toISOString(),
      markers: metadataEntries
    });

    // We store the data in the "Keywords" field of the PDF
    pdfLibDoc.setKeywords([metadataString]);

    const pdfBytes = await pdfLibDoc.save();

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Stealth_PDF_${Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    statusMsg.textContent = `✅ PDF saved successfully!`;
    statusMsg.style.color = "#28a745";

  } catch (err) {
    console.error("Save failed:", err);
    statusMsg.textContent = "❌ Save failed. Image might be too large.";
    statusMsg.style.color = "#dc3545";
    alert("Save failed: " + err.message);
  }
};
/**************** RESTORE (METADATA + DECOMPRESSION) - UPDATED FOR ARRAY *********************/
async function restoreMarkers() {
  try {
    const { PDFDocument } = PDFLib;
    const pdfLibDoc = await PDFDocument.load(Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0)));

    // Get keywords - PDF-Lib returns an ARRAY
    const keywords = pdfLibDoc.getKeywords();
    console.log("Keywords array:", keywords);

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      console.log("No keywords array found in PDF");
      return false;
    }

    let metadataString = null;

    // Look for our metadata in the keywords array (it's the last element)
    for (let i = keywords.length - 1; i >= 0; i--) {
      const keyword = keywords[i];
      if (typeof keyword === 'string') {
        // Check if it's our JSON metadata
        if (keyword.includes('"markers"') || keyword.includes('"version"')) {
          metadataString = keyword;
          console.log("Found metadata at index", i);
          break;
        }
      }
    }

    if (!metadataString) {
      console.log("No metadata string found in keywords array");
      return false;
    }

    console.log("Metadata string:", metadataString.substring(0, 100) + "...");

    // Parse the metadata
    let markersArray = [];

    try {
      const parsed = JSON.parse(metadataString);
      console.log("Metadata parsed successfully:", parsed);

      if (parsed && parsed.markers && Array.isArray(parsed.markers)) {
        markersArray = parsed.markers;
        console.log(`Found ${markersArray.length} markers in v${parsed.version || '1.0'} format`);
      } else if (Array.isArray(parsed)) {
        markersArray = parsed;
        console.log(`Found ${markersArray.length} markers in old array format`);
      }
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return false;
    }

    if (!Array.isArray(markersArray) || markersArray.length === 0) {
      console.log("No markers array found in metadata");
      return false;
    }

    let restoredCount = 0;

    // Process each marker
    for (let i = 0; i < markersArray.length; i++) {
      const entry = markersArray[i];

      if (typeof entry !== 'string') {
        console.warn(`Marker ${i} is not a string:`, entry);
        continue;
      }

      const parts = entry.split("|");

      // We expect 5 parts: page|x|y|type|data
      if (parts.length !== 5) {
        console.warn(`Invalid marker format (${parts.length} parts):`, entry);
        continue;
      }

      const [pageNum, x, y, type, data] = parts;
      const pageIndex = parseInt(pageNum, 10);

      if (isNaN(pageIndex) || pageIndex < 1) {
        console.warn(`Invalid page number: ${pageNum}`);
        continue;
      }

      // Get the page wrapper
      const wraps = document.querySelectorAll('.pageWrapper');
      if (pageIndex > wraps.length) {
        console.warn(`Page ${pageIndex} not found. Total pages: ${wraps.length}`);
        continue;
      }

      const wrap = wraps[pageIndex - 1];
      const absX = parseFloat(x);
      const absY = parseFloat(y);

      console.log(`Processing marker ${i + 1}: Page ${pageIndex}, Type: ${type}`);

      if (type === "ztext") {
        // Text marker (compressed)
        try {
          const originalText = await decompressText(data);
          console.log(`Text restored: "${originalText.substring(0, 50)}${originalText.length > 50 ? '...' : ''}"`);

          addMarker(pageIndex, absX, absY, "text", originalText, wrap, false);
          restoredCount++;

          // Update pageMarkers for consistency
          if (!pageMarkers[pageIndex]) pageMarkers[pageIndex] = [];
          pageMarkers[pageIndex].push({
            x: absX,
            y: absY,
            type: "text",
            content: originalText
          });

        } catch (error) {
          console.error("Failed to decompress text:", error);
          // Try as plain base64
          try {
            const plainText = atob(data);
            addMarker(pageIndex, absX, absY, "text", plainText, wrap, false);
            restoredCount++;
          } catch (e2) {
            console.error("Failed to decode base64:", e2);
          }
        }
      } else if (type === "image" || type === "audio") {
        // Binary marker - data is Base64
        try {
          // Check if it's valid Base64
          if (!/^[A-Za-z0-9+/=]+$/.test(data)) {
            console.warn(`Invalid Base64 data for ${type}`);
            continue;
          }

          const binaryData = Uint8Array.from(atob(data), c => c.charCodeAt(0));

          if (binaryData.length === 0) {
            console.warn(`Empty binary data for ${type}`);
            continue;
          }

          addMarker(pageIndex, absX, absY, type, binaryData, wrap, false);
          restoredCount++;

          // Update pageMarkers
          if (!pageMarkers[pageIndex]) pageMarkers[pageIndex] = [];
          pageMarkers[pageIndex].push({
            x: absX,
            y: absY,
            type: type,
            content: binaryData
          });

          console.log(`Restored ${type} (${binaryData.length} bytes)`);
        } catch (error) {
          console.error(`Failed to restore ${type}:`, error);
        }
      } else {
        console.warn(`Unknown marker type: ${type}`);
      }
    }

    console.log(`Successfully restored ${restoredCount} markers`);

    if (restoredCount > 0) {
      statusMsg.textContent = `✅ Found ${restoredCount} hidden items! Click red dots to view.`;
      statusMsg.style.color = "#28a745";

      // Add pulse animation for visual feedback
      if (!document.querySelector('#pulse-animation')) {
        const style = document.createElement('style');
        style.id = 'pulse-animation';
        style.textContent = `
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
          }
        `;
        document.head.appendChild(style);
      }

      // Animate markers
      setTimeout(() => {
        const markers = document.querySelectorAll('.note-marker');
        markers.forEach(marker => {
          marker.style.animation = 'pulse 1s ease-in-out 2';
        });
      }, 100);

      return true;
    } else {
      statusMsg.textContent = "⚠️ No hidden data could be restored.";
      statusMsg.style.color = "#dc3545";
      return false;
    }

  } catch (e) {
    console.error("Restore failed:", e);
    statusMsg.textContent = "❌ Error restoring data";
    statusMsg.style.color = "#dc3545";
    return false;
  }
}

/**************** RESTORE (METADATA + DECOMPRESSION) - UPDATED *********************/
async function restoreMarkers() {
  try {
    const { PDFDocument } = PDFLib;
    const pdfLibDoc = await PDFDocument.load(Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0)));

    // Get keywords - PDF-Lib returns a STRING
    const keywords = pdfLibDoc.getKeywords();
    console.log("Keywords found:", keywords);

    if (!keywords || keywords.length === 0) {
      console.log("No keywords found in PDF");
      return false;
    }

    let metadataString = null;

    // Extract JSON from keywords string
    const jsonStart = keywords.indexOf('{');
    const jsonEnd = keywords.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1) {
      metadataString = keywords.substring(jsonStart, jsonEnd + 1);
    } else if (keywords.includes('"markers"')) {
      metadataString = keywords;
    }

    if (!metadataString) {
      console.log("No metadata found");
      return false;
    }

    console.log("Metadata extracted:", metadataString.substring(0, 100) + "...");

    // Parse the metadata
    let markersArray = [];

    try {
      const parsed = JSON.parse(metadataString);
      console.log("Metadata parsed successfully");

      if (parsed && parsed.markers && Array.isArray(parsed.markers)) {
        markersArray = parsed.markers;
        console.log(`Found ${markersArray.length} markers in v${parsed.version || '1.0'} format`);
      } else if (Array.isArray(parsed)) {
        markersArray = parsed;
        console.log(`Found ${markersArray.length} markers in old format`);
      }
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return false;
    }

    if (!Array.isArray(markersArray) || markersArray.length === 0) {
      console.log("No markers array found");
      return false;
    }

    let restoredCount = 0;

    // Process each marker
    for (let i = 0; i < markersArray.length; i++) {
      const entry = markersArray[i];

      if (typeof entry !== 'string') {
        console.warn(`Marker ${i} is not a string:`, entry);
        continue;
      }

      const parts = entry.split("|");

      // Handle both formats: old (5 parts) and new (5 parts with base64 data)
      if (parts.length < 5) {
        console.warn(`Invalid marker format (${parts.length} parts):`, entry);
        continue;
      }

      const [pageNum, x, y, type, data] = parts;
      const pageIndex = parseInt(pageNum, 10);

      if (isNaN(pageIndex) || pageIndex < 1) {
        console.warn(`Invalid page number: ${pageNum}`);
        continue;
      }

      // Get the page wrapper
      const wraps = document.querySelectorAll('.pageWrapper');
      if (pageIndex > wraps.length) {
        console.warn(`Page ${pageIndex} not found. Total pages: ${wraps.length}`);
        continue;
      }

      const wrap = wraps[pageIndex - 1];
      const absX = parseFloat(x);
      const absY = parseFloat(y);

      console.log(`Processing marker ${i + 1}: Page ${pageIndex}, Type: ${type}`);

      if (type === "ztext") {
        // Text marker (compressed)
        try {
          const originalText = await decompressText(data);
          console.log(`Text restored: "${originalText.substring(0, 50)}${originalText.length > 50 ? '...' : ''}"`);

          addMarker(pageIndex, absX, absY, "text", originalText, wrap, false);
          restoredCount++;

          // Update pageMarkers for consistency
          if (!pageMarkers[pageIndex]) pageMarkers[pageIndex] = [];
          pageMarkers[pageIndex].push({
            x: absX,
            y: absY,
            type: "text",
            content: originalText
          });

        } catch (error) {
          console.error("Failed to decompress text:", error);
          // Try as plain base64
          try {
            const plainText = atob(data);
            addMarker(pageIndex, absX, absY, "text", plainText, wrap, false);
            restoredCount++;
          } catch (e2) {
            console.error("Failed to decode base64:", e2);
          }
        }
      } else if (type === "image" || type === "audio") {
        // Binary marker - data could be either:
        // 1. Attachment ID (old format)
        // 2. Base64 data (new format)

        // Check if it looks like Base64 (contains characters not in typical filenames)
        const isBase64 = data.length > 20 && !data.includes('.') &&
          /^[A-Za-z0-9+/=]+$/.test(data);

        if (isBase64) {
          // New format: Base64 data directly in metadata
          try {
            const binaryData = Uint8Array.from(atob(data), c => c.charCodeAt(0));

            addMarker(pageIndex, absX, absY, type, binaryData, wrap, false);
            restoredCount++;

            // Update pageMarkers
            if (!pageMarkers[pageIndex]) pageMarkers[pageIndex] = [];
            pageMarkers[pageIndex].push({
              x: absX,
              y: absY,
              type: type,
              content: binaryData
            });

            console.log(`Restored ${type} from Base64 (${binaryData.length} bytes)`);
          } catch (error) {
            console.error(`Failed to restore ${type} from Base64:`, error);
          }
        } else {
          // Old format: Attachment ID
          console.log(`Old format ${type} attachment cannot be restored: ${data}`);
          // Note: We could try to extract from PDF context, but it's complex
        }
      }
    }

    console.log(`Restored ${restoredCount} markers`);

    if (restoredCount > 0) {
      statusMsg.textContent = `✅ Found ${restoredCount} hidden items! Click red dots to view.`;
      statusMsg.style.color = "#28a745";

      // Add pulse animation for visual feedback
      if (!document.querySelector('#pulse-animation')) {
        const style = document.createElement('style');
        style.id = 'pulse-animation';
        style.textContent = `
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
          }
        `;
        document.head.appendChild(style);
      }
      // Animate markers
      setTimeout(() => {
        const markers = document.querySelectorAll('.note-marker');
        markers.forEach(marker => {
          marker.style.animation = 'pulse 1s ease-in-out 2';
        });
      }, 100);

      return true;
    } else {
      statusMsg.textContent = "⚠️ No hidden data could be restored.";
      statusMsg.style.color = "#dc3545";
      return false;
    }

  } catch (e) {
    console.error("Restore failed:", e);
    statusMsg.textContent = "❌ Error restoring data";
    statusMsg.style.color = "#dc3545";
    return false;
  }
}

/**************** UTILITY FUNCTIONS *********************/
// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    saveBtn.click();
  }
});

// Initialize drop zone visibility
dropZone.classList.add('show');
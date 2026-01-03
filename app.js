/********************************************************************/
/* STEGO PDF VIEWER — DEEP STEALTH + TEXT COMPRESSION VERSION       */
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
let currentRecorder = null;
let recordingStream = null;
let recordingTimer = null;
let recordingSeconds = 0;
let tempRecordingData = null;

// Theme Toggle
// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
const sunIcon = document.getElementById('sunIcon');
const moonIcon = document.getElementById('moonIcon');

themeToggle.addEventListener('click', () => {
  // Add animation class
  themeToggle.classList.add('animate');

  // Toggle theme classes
  document.body.classList.toggle('dark-theme');
  document.body.classList.toggle('light-theme');

  // Fade icons using opacity
  if (document.body.classList.contains('dark-theme')) {
    sunIcon.style.opacity = '0';
    moonIcon.style.opacity = '1';
  } else {
    sunIcon.style.opacity = '1';
    moonIcon.style.opacity = '0';
  }

  // Remove animation class after animation completes
  setTimeout(() => {
    themeToggle.classList.remove('animate');
  }, 600);
  // Updated Fade + Display logic
  if (document.body.classList.contains('dark-theme')) {
    // Hide Sun, Show Moon
    sunIcon.style.display = 'none';
    sunIcon.style.opacity = '0';

    moonIcon.style.display = 'block';
    setTimeout(() => moonIcon.style.opacity = '1', 10);
  } else {
    // Hide Moon, Show Sun
    moonIcon.style.display = 'none';
    moonIcon.style.opacity = '0';

    sunIcon.style.display = 'block';
    setTimeout(() => sunIcon.style.opacity = '1', 10);
  }
});

// Show skeleton loader
function showSkeletonLoader() {
  viewer.innerHTML = `
        <div class="skeleton-loader">
          <div class="skeleton-page"></div>
          <div class="skeleton-text">Loading your PDF...</div>
        </div>
      `;
}

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

  showSkeletonLoader();
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
      viewer.innerHTML = "";
    }
  };
  reader.onerror = () => {
    statusMsg.textContent = "❌ Error reading file";
    statusMsg.style.color = "#dc3545";
    viewer.innerHTML = "";
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

      canvas.onclick = (e) => openPopupMenu(e, wrap, p);
      pageMarkers[p] = [];

    } catch (error) {
      console.error(`Error rendering page ${p}:`, error);
    }
  }
}

/**************** TEXT MODAL *********************/
let currentTextContext = null;

function openTextModal(pageNum, x, y, wrap) {
  currentTextContext = { pageNum, x, y, wrap };
  document.getElementById('textModal').classList.add('active');
  document.getElementById('textInput').value = '';
  document.getElementById('textInput').focus();
}

function closeTextModal() {
  document.getElementById('textModal').classList.remove('active');
  currentTextContext = null;
}

function saveTextMessage() {
  const text = document.getElementById('textInput').value.trim();
  if (text && currentTextContext) {
    const { pageNum, x, y, wrap } = currentTextContext;
    addMarker(pageNum, x, y, "text", text, wrap, true);
    statusMsg.textContent = "✅ Text marker added!";
    statusMsg.style.color = "#28a745";
    closeTextModal();
  }
}

/**************** AUDIO MODAL *********************/
let currentAudioContext = null;

function openAudioModal(pageNum, x, y, wrap) {
  currentAudioContext = { pageNum, x, y, wrap };
  document.getElementById('audioModal').classList.add('active');
  document.getElementById('recordStatus').textContent = 'Click to start recording';
  document.getElementById('recordTime').textContent = '00:00';
  document.getElementById('recordButton').classList.remove('recording');
  recordingSeconds = 0;
}

function cancelAudioRecording() {
  if (currentRecorder && currentRecorder.state === 'recording') {
    currentRecorder.stop();
    if (recordingStream) {
      recordingStream.getTracks().forEach(t => t.stop());
    }
  }
  if (recordingTimer) {
    clearInterval(recordingTimer);
  }
  document.getElementById('audioModal').classList.remove('active');
  currentAudioContext = null;
  currentRecorder = null;
  recordingStream = null;
}

document.getElementById('recordButton').addEventListener('click', async function () {
  if (!currentRecorder || currentRecorder.state === 'inactive') {
    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStream = stream;

      const options = {
        audioBitsPerSecond: 32000,
        mimeType: 'audio/webm;codecs=opus'
      };

      currentRecorder = new MediaRecorder(stream, options);
      let chunks = [];

      currentRecorder.ondataavailable = e => chunks.push(e.data);

      currentRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const bytes = new Uint8Array(await blob.arrayBuffer());

        if (currentAudioContext) {
          const { pageNum, x, y, wrap } = currentAudioContext;
          addMarker(pageNum, x, y, "audio", bytes, wrap, true);
          statusMsg.textContent = "✅ Compressed audio added!";
          statusMsg.style.color = "#28a745";
        }

        document.getElementById('audioModal').classList.remove('active');
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimer);
        currentRecorder = null;
        recordingStream = null;
        currentAudioContext = null;
      };

      currentRecorder.start();
      this.classList.add('recording');
      document.getElementById('recordStatus').textContent = 'Recording... Click to stop';

      recordingSeconds = 0;
      recordingTimer = setInterval(() => {
        recordingSeconds++;
        const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
        const secs = (recordingSeconds % 60).toString().padStart(2, '0');
        document.getElementById('recordTime').textContent = `${mins}:${secs}`;
      }, 1000);

    } catch (error) {
      console.error("Audio recording failed:", error);
      statusMsg.textContent = "❌ Microphone access denied";
      statusMsg.style.color = "#dc3545";
      document.getElementById('audioModal').classList.remove('active');
    }
  } else {
    // Stop recording
    currentRecorder.stop();
    this.classList.remove('recording');
    document.getElementById('recordStatus').textContent = 'Saving...';
  }
});

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
        <button onclick="closePopup()" style="background:#dc3545;">✕ Cancel</button>
      `;

  wrap.appendChild(popup);

  document.getElementById("btnText").onclick = () => {
    openTextModal(pageNum, x, y, wrap);
    closePopup();
  };

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

  document.getElementById("btnAudio").onclick = () => {
    openAudioModal(pageNum, x, y, wrap);
    closePopup();
  };
}

function addMarker(pageNum, x, y, type, content, wrap, isNew) {
  const m = document.createElement("div");
  m.className = "note-marker";
  m.style.left = `${x - 12}px`;
  m.style.top = `${y - 12}px`;
  m.dataset.type = type;
  m.cachedContent = content;

  let isDragging = false;
  let startX, startY;

  m.onclick = (e) => {
    e.stopPropagation();
    if (!isDragging) {
      revealMarker(m, wrap);
    }
  };

  m.onmousedown = function (event) {
    if (event.button !== 0) return;

    isDragging = false;
    startX = event.clientX;
    startY = event.clientY;

    const rect = wrap.getBoundingClientRect();
    let shiftX = event.clientX - m.getBoundingClientRect().left;
    let shiftY = event.clientY - m.getBoundingClientRect().top;

    function moveAt(pageX, pageY) {
      let newX = pageX - rect.left - shiftX;
      let newY = pageY - rect.top - shiftY;

      newX = Math.max(0, Math.min(newX, rect.width - 24));
      newY = Math.max(0, Math.min(newY, rect.height - 24));

      m.style.left = newX + 'px';
      m.style.top = newY + 'px';
    }

    function onMouseMove(event) {
      if (Math.abs(event.clientX - startX) > 5 || Math.abs(event.clientY - startY) > 5) {
        isDragging = true;
        moveAt(event.clientX, event.clientY);
      }
    }

    document.addEventListener('mousemove', onMouseMove);

    document.onmouseup = function () {
      document.removeEventListener('mousemove', onMouseMove);
      document.onmouseup = null;

      if (isDragging) {
        const finalX = parseInt(m.style.left) + 12;
        const finalY = parseInt(m.style.top) + 12;

        updateMarkerPosition(pageNum, x, y, finalX, finalY);

        x = finalX;
        y = finalY;

        statusMsg.textContent = "📍 Marker dropped and fixed.";
        statusMsg.style.color = "#28a745";
      }

      setTimeout(() => { isDragging = false; }, 100);
    };
  };

  m.ondragstart = () => false;
  wrap.appendChild(m);

  if (isNew) {
    if (!pageMarkers[pageNum]) pageMarkers[pageNum] = [];
    const markerData = { x: Math.round(x), y: Math.round(y), type, content };
    if (type === "image") {
      markerData.size = { width: 250, height: 250 };
    }
    pageMarkers[pageNum].push(markerData);
  }
}

function updateMarkerPosition(pageNum, oldX, oldY, newX, newY) {
  if (!pageMarkers[pageNum]) return;

  const marker = pageMarkers[pageNum].find(m =>
    Math.abs(m.x - oldX) < 5 && Math.abs(m.y - oldY) < 5
  );

  if (marker) {
    marker.x = Math.round(newX);
    marker.y = Math.round(newY);
  }
}

function revealMarker(m, wrap) {
  const existing = wrap.querySelector('.note-popup');
  if (existing) existing.remove();

  const type = m.dataset.type;
  const content = m.cachedContent;

  const mLeft = parseInt(m.style.left);
  const mTop = parseInt(m.style.top);

  const display = document.createElement("div");
  display.className = "note-popup";
  display.style = `left:${mLeft + 30}px; top:${mTop}px;`;

  if (type === "text") {
    display.innerHTML = `
          <div class="note-popup-header">📝 Hidden Text:</div>
          <div class="note-popup-content">${content}</div>
        `;
  } else if (type === "image") {
    const blob = new Blob([content], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);

    // Find marker data
    const pageNum = parseInt(wrap.id.split('-')[1]);
    const markerX = parseInt(m.style.left) + 12;
    const markerY = parseInt(m.style.top) + 12;
    const marker = pageMarkers[pageNum].find(mark => mark.x === markerX && mark.y === markerY && mark.type === 'image');
    const size = marker ? marker.size : { width: 250, height: 250 };

    display.innerHTML = `
          <div class="note-popup-header">🖼️ Hidden Image:</div>
          <div class="note-popup-content">
            <img src="${url}" style="width:${size.width}px; height:${size.height}px; border-radius:4px; resize: both; overflow: hidden;">
          </div>
        `;

    // Adjust size to fit image if default size
    const img = display.querySelector('img');
    img.onload = () => {
      if (size.width === 250 && size.height === 250) {
        img.style.width = img.naturalWidth + 'px';
        img.style.height = img.naturalHeight + 'px';
        if (marker) {
          marker.size = { width: img.naturalWidth, height: img.naturalHeight };
        }
      }
    };
  } else if (type === "audio") {
    const blob = new Blob([content], { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    display.innerHTML = `
          <div class="note-popup-header">🎤 Hidden Audio:</div>
          <div class="note-popup-content">
            <audio src="${url}" controls style="width:250px; height:40px;"></audio>
          </div>
        `;
  }

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "✕";
  closeBtn.style = `position:absolute; top:10px; right:10px; padding:4px 8px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer; font-size:14px; font-weight:bold;`;
  closeBtn.onclick = (e) => {
    e.stopPropagation();

    // Save image size if resized
    if (type === "image") {
      const img = display.querySelector('img');
      if (img) {
        const newWidth = img.clientWidth;
        const newHeight = img.clientHeight;
        const pageNum = parseInt(wrap.id.split('-')[1]);
        const markerX = parseInt(m.style.left) + 12;
        const markerY = parseInt(m.style.top) + 12;
        const marker = pageMarkers[pageNum].find(mark => mark.x === markerX && mark.y === markerY && mark.type === 'image');
        if (marker) {
          marker.size = { width: newWidth, height: newHeight };
        }
      }
    }

    display.remove();
  };
  display.appendChild(closeBtn);

  wrap.appendChild(display);
}

function closePopup() {
  const p = document.getElementById("stegoPopup");
  if (p) p.remove();
}

/**************** SAVE (METADATA + COMPRESSION) *********************/
saveBtn.onclick = async () => {
  if (!pdfBase64) {
    statusMsg.textContent = "❌ Please load a PDF first!";
    statusMsg.style.color = "#dc3545";
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
          let binary = '';
          const bytes = new Uint8Array(m.content);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Data = btoa(binary);

          if (m.type === "image") {
            const size = m.size || { width: 250, height: 250 };
            metadataEntries.push(`${pageNum}|${m.x}|${m.y}|${m.type}|${base64Data}|${size.width}|${size.height}`);
          } else {
            metadataEntries.push(`${pageNum}|${m.x}|${m.y}|${m.type}|${base64Data}`);
          }
        }
      }
    }

    if (metadataEntries.length === 0) {
      statusMsg.textContent = "⚠️ No markers to save!";
      statusMsg.style.color = "#dc3545";
      return;
    }

    const metadataString = JSON.stringify({
      version: "2.0",
      timestamp: new Date().toISOString(),
      markers: metadataEntries
    });

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
  }
};

/**************** RESTORE (METADATA + DECOMPRESSION) *********************/
async function restoreMarkers() {
  try {
    const { PDFDocument } = PDFLib;
    const pdfLibDoc = await PDFDocument.load(Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0)));

    const keywords = pdfLibDoc.getKeywords();
    console.log("Keywords found:", keywords);

    if (!keywords || keywords.length === 0) {
      console.log("No keywords found in PDF");
      return false;
    }

    let metadataString = null;

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

    console.log("Metadata extracted");

    let markersArray = [];

    try {
      const parsed = JSON.parse(metadataString);
      console.log("Metadata parsed successfully");

      if (parsed && parsed.markers && Array.isArray(parsed.markers)) {
        markersArray = parsed.markers;
        console.log(`Found ${markersArray.length} markers`);
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

    for (let i = 0; i < markersArray.length; i++) {
      const entry = markersArray[i];

      if (typeof entry !== 'string') {
        console.warn(`Marker ${i} is not a string:`, entry);
        continue;
      }

      const parts = entry.split("|");

      if (parts.length < 5) {
        console.warn(`Invalid marker format:`, entry);
        continue;
      }

      const [pageNum, x, y, type, data] = parts;
      const pageIndex = parseInt(pageNum, 10);

      if (isNaN(pageIndex) || pageIndex < 1) {
        console.warn(`Invalid page number: ${pageNum}`);
        continue;
      }

      const wraps = document.querySelectorAll('.pageWrapper');
      if (pageIndex > wraps.length) {
        console.warn(`Page ${pageIndex} not found`);
        continue;
      }

      const wrap = wraps[pageIndex - 1];
      const absX = parseFloat(x);
      const absY = parseFloat(y);

      if (type === "ztext") {
        try {
          const originalText = await decompressText(data);
          console.log(`Text restored`);

          addMarker(pageIndex, absX, absY, "text", originalText, wrap, false);
          restoredCount++;

          if (!pageMarkers[pageIndex]) pageMarkers[pageIndex] = [];
          pageMarkers[pageIndex].push({
            x: absX,
            y: absY,
            type: "text",
            content: originalText
          });

        } catch (error) {
          console.error("Failed to decompress text:", error);
        }
      } else if (type === "image" || type === "audio") {
        try {
          if (!/^[A-Za-z0-9+/=]+$/.test(data)) {
            console.warn(`Invalid Base64 data for ${type}`);
            continue;
          }

          const binaryData = Uint8Array.from(atob(data), c => c.charCodeAt(0));

          if (binaryData.length === 0) {
            console.warn(`Empty binary data for ${type}`);
            continue;
          }

          let size = null;
          if (type === "image" && parts.length >= 7) {
            size = { width: parseInt(parts[5]), height: parseInt(parts[6]) };
          }

          addMarker(pageIndex, absX, absY, type, binaryData, wrap, false);
          restoredCount++;

          if (!pageMarkers[pageIndex]) pageMarkers[pageIndex] = [];
          const markerData = {
            x: absX,
            y: absY,
            type: type,
            content: binaryData
          };
          if (type === "image") {
            markerData.size = size || { width: 250, height: 250 };
          }
          pageMarkers[pageIndex].push(markerData);

          console.log(`Restored ${type}`);
        } catch (error) {
          console.error(`Failed to restore ${type}:`, error);
        }
      }
    }

    console.log(`Restored ${restoredCount} markers`);

    if (restoredCount > 0) {
      statusMsg.textContent = `✅ Found ${restoredCount} hidden items! Click red dots to view.`;
      statusMsg.style.color = "#28a745";

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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    saveBtn.click();
  }
  if (e.key === 'Escape') {
    closeTextModal();
    cancelAudioRecording();
  }
});

// Close modals on overlay click
document.getElementById('textModal').addEventListener('click', (e) => {
  if (e.target.id === 'textModal') {
    closeTextModal();
  }
});

document.getElementById('audioModal').addEventListener('click', (e) => {
  if (e.target.id === 'audioModal') {
    cancelAudioRecording();
  }
});
window.addEventListener('DOMContentLoaded', () => {
  const shutter = document.getElementById('entranceShutter');
  const content = document.querySelector('.content-wrapper');

  // Smooth delay before starting the reveal
  setTimeout(() => {
    // 1. Open the Shutters
    document.body.classList.add('shutter-open');

    // 2. Reveal the main content with a staggered scale
    content.classList.add('reveal');

    // 3. Cleanup the shutter to free up memory/events
    setTimeout(() => {
      shutter.style.display = 'none';
    }, 1200);
  }, 300);
});

// Optional: Add a "Scanning" effect when a PDF is first rendered
function triggerScanEffect() {
  const viewer = document.getElementById('viewer');
  const scanLine = document.createElement('div');
  scanLine.style = `
        position: absolute;
        top: 0; left: 0; width: 100%; height: 2px;
        background: var(--accent-cyan);
        box-shadow: 0 0 15px var(--accent-cyan);
        z-index: 1000;
        pointer-events: none;
    `;
  viewer.appendChild(scanLine);

  anime({
    targets: scanLine,
    top: ['0%', '100%'],
    opacity: [1, 0],
    easing: 'easeInOutQuad',
    duration: 2000,
    complete: () => scanLine.remove()
  });
}
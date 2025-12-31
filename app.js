/********************************************************************/
/*  STEGO PDF NOTES VIEWER (TEXT + IMAGE + AUDIO) — FINAL VERSION  */
/********************************************************************/
const viewer = document.getElementById("viewer");
const dropZone = document.getElementById("dropZone");
const saveBtn = document.getElementById("savePdfBtn");

let pdfDoc = null;
let loadedPdfBytes = null;
let pageMarkers = {}; // page -> [ {x,y,type,secret} ]

/*********************** ZERO WIDTH ENCODE **************************/
function encodeZW(txt) {
  return [...txt].map(ch =>
    ch.charCodeAt(0).toString(2).padStart(8, "0")
      .replace(/0/g, "\u200B").replace(/1/g, "\u200C") + "\u200D"
  ).join("");
}
function decodeZW(txt) {
  return txt.split("\u200D").filter(v => v).map(b =>
    String.fromCharCode(parseInt(b.replace(/\u200B/g, "0").replace(/\u200C/g, "1"), 2))
  ).join("");
}

/********************** AUDIO UTILS *********************************/
async function blobToBase64(blob) {
  return new Promise(r => {
    const fr = new FileReader();
    fr.onloadend = () => r(fr.result);
    fr.readAsDataURL(blob);
  });
}
function splitChunks(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}
const AUDIO_CHUNK = 3000;

/*************************** LOAD PDF ********************************/
document.getElementById("pdfUpload").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  loadedPdfBytes = await file.arrayBuffer();

  pdfDoc = await pdfjsLib.getDocument({ data: loadedPdfBytes }).promise;
  viewer.innerHTML = "";
  pageMarkers = {};

  await renderAllPages();
  await restoreMarkers();
};

/******************** RENDER ALL PAGES *********************************/
async function renderAllPages() {
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const vp = page.getViewport({ scale: 1.25 });

    const wrap = document.createElement("div");
    wrap.className = "pageWrapper";
    wrap.style.position = "relative";
    wrap.style.width = vp.width + "px";
    wrap.style.margin = "20px auto";

    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    wrap.appendChild(canvas);
    viewer.appendChild(wrap);

    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    canvas.onclick = e => openPopupMenu(e, wrap, p);
    pageMarkers[p] ??= [];
  }
}

/**************** ADD MARKER — TEXT / IMAGE / AUDIO *********************/
function openPopupMenu(e, wrap, page) {
  closePopup();
  const x = e.offsetX, y = e.offsetY;

  const popup = document.createElement("div");
  popup.id = "stegoPopup";
  popup.style.position = "absolute";
  popup.style.left = x + "px"; popup.style.top = y + "px";
  popup.style.background = "#fff";
  popup.style.border = "2px solid #0099ff";
  popup.style.borderRadius = "6px";
  popup.style.padding = "8px";
  popup.style.zIndex = 2000;

  popup.innerHTML = `
    <b>Add:</b><br>
    <button id="btnText">Text</button>
    <button id="btnImg">Image</button>
    <button id="btnAudio">Audio</button>
    <span id="popupClose" style="cursor:pointer; float:right;">✕</span>
  `;
  wrap.appendChild(popup);

  document.getElementById("popupClose").onclick = closePopup;

  document.getElementById("btnText").onclick = () => {
    const t = prompt("Enter hidden text:");
    if (t) addMarker(page, x, y, "text", encodeZW(t), wrap);
    closePopup();
  };

  document.getElementById("btnImg").onclick = async () => {
    const base64 = await pickImage();
    if (base64) addMarker(page, x, y, "image", encodeZW(base64), wrap);
    closePopup();
  };

  document.getElementById("btnAudio").onclick = () => recordAudio(page, x, y, wrap);
}

/*************************** IMAGE PICK *******************************/
function pickImage() {
  return new Promise(res => {
    dropZone.classList.add("show");
    dropZone.onclick = () => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "image/*";
      input.onchange = async e => {
        const base64 = await blobToBase64(e.target.files[0]);
        dropZone.classList.remove("show");
        res(base64);
      };
      input.click();
    };
  });
}

/*************************** AUDIO RECORD ******************************/
async function recordAudio(page, x, y, wrap) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  let chunks = [];
  rec.ondataavailable = e => chunks.push(e.data);
  rec.start();

  alert("Recording... Click OK to stop");
  rec.stop();

  rec.onstop = async () => {
    const base = await blobToBase64(new Blob(chunks, { type: "audio/webm" }));
    const chunked = splitChunks(base, AUDIO_CHUNK);
    const encodedChunks = chunked.map(c => encodeZW(c));
    const packed = encodeZW(JSON.stringify(encodedChunks));
    addMarker(page, x, y, "audio", packed, wrap);
  };
  closePopup();
}

/**************************** ADD MARKER *********************************/
function addMarker(page, x, y, type, secret, wrap) {
  const m = document.createElement("div");
  m.className = "note-marker";
  m.style.left = x + "px"; m.style.top = y + "px";
  m.dataset.type = type;
  m.dataset.secret = secret;
  m.dataset.page = page;

  m.onclick = e => { e.stopPropagation(); revealMarker(m, wrap); };

  m.onmousedown = e => {
    let dx = e.clientX - m.offsetLeft, dy = e.clientY - m.offsetTop;
    document.onmousemove = ev => {
      m.style.left = ev.clientX - dx + "px";
      m.style.top = ev.clientY - dy + "px";
    };
    document.onmouseup = () => document.onmousemove = null;
  };

  wrap.appendChild(m);
  pageMarkers[page].push({ x, y, type, secret });
}

/**************************** REVEAL ***********************************/
function revealMarker(m, wrap) {
  closePopup();
  const type = m.dataset.type, secret = m.dataset.secret;
  const x = m.offsetLeft + 22, y = m.offsetTop + 22;

  if (type === "text") {
    const txt = decodeZW(secret);
    showPopupContent(wrap, x, y, txt);
  }
  else if (type === "image") {
    const img = document.createElement("img");
    img.src = decodeZW(secret);
    img.className = "revealImage";
    img.style.left = x + "px"; img.style.top = y + "px";
    wrap.appendChild(img);
    setTimeout(() => img.remove(), 4000);
  }
  else if (type === "audio") {
    const decoded = decodeZW(secret);
    const chunks = JSON.parse(decoded).map(c => decodeZW(c));
    const base = chunks.join("");
    const audio = new Audio(base); audio.play();
  }
}

function showPopupContent(wrap, x, y, txt) {
  const note = document.createElement("div");
  note.className = "note-popup";
  note.style.left = x + "px"; note.style.top = y + "px";
  note.innerText = txt;
  wrap.appendChild(note);
  setTimeout(() => note.remove(), 4000);
}

/**************************** CLOSE POPUP ******************************/
function closePopup() {
  const popup = document.getElementById("stegoPopup");
  if (popup) popup.remove();
}

/**************************** SAVE PDF *********************************/
saveBtn.onclick = async () => {
  if (!loadedPdfBytes) return alert("Load PDF first");
  const pdf = await PDFLib.PDFDocument.load(loadedPdfBytes);

  for (let p = 1; p <= pdf.getPages().length; p++) {
    const page = pdf.getPage(p - 1);
    if (!pageMarkers[p]) continue;
    for (const m of pageMarkers[p]) {
      page.drawText(m.secret, {
        x: m.x, y: page.getHeight() - m.y, size: 1,
        color: PDFLib.rgb(1, 1, 1) // invisible
      });
    }
  }

  const data = await pdf.save();
  const blob = new Blob([data], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "stego_saved.pdf";
  a.click();
};

/***************** RESTORE EXISTING STEGO ****************************/
async function restoreMarkers() {
  const pdf = await PDFLib.PDFDocument.load(loadedPdfBytes);
  const pages = pdf.getPages();

  for (let p = 0; p < pages.length; p++) {
    try {
      const text = await pages[p].getTextContent();
      const zwRaw = text.items.map(x => x.str).join("");
      const matches = zwRaw.match(/[\u200B\u200C\u200D]+/g);
      if (!matches) continue;

      const wrap = viewer.children[p];
      pageMarkers[p + 1] ??= [];

      matches.forEach(stego => {
        const decoded = decodeZW(stego);
        try {
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed)) {
            addMarker(p + 1, 50, 50, "audio", stego, wrap);
          }
        } catch {
          if (decoded.startsWith("data:image")) addMarker(p + 1, 50, 50, "image", stego, wrap);
          else addMarker(p + 1, 50, 50, "text", stego, wrap);
        }
      });
    } catch { }
  }
}
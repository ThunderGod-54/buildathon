const viewer = document.getElementById("viewer");
const dropZone = document.getElementById("dropZone");
let pdfDoc = null, currentDropResolve = null;

/* 🔐 ZERO WIDTH ENCODER */
function encodeZW(txt) {
  return [...txt].map(ch => ch.charCodeAt(0).toString(2).padStart(8, "0")
    .replace(/0/g, "\u200B").replace(/1/g, "\u200C") + "\u200D").join("");
}
function decodeZW(text) {
  return text.split("\u200D").filter(f => f).map(bin =>
    String.fromCharCode(parseInt(bin.replace(/\u200B/g, "0").replace(/\u200C/g, "1"), 2))
  ).join("");
}

/* 📄 Load PDF */
document.getElementById("pdfUpload").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  pdfDoc = await pdfjsLib.getDocument(url).promise;
  renderPage(1);
};

async function renderPage(pageNo) {
  const page = await pdfDoc.getPage(pageNo);
  const viewport = page.getViewport({ scale: 1.3 });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width; canvas.height = viewport.height;
  viewer.innerHTML = ""; viewer.appendChild(canvas);

  await page.render({ canvasContext: ctx, viewport }).promise;

  // 📌 Click → Choose note type menu (doesn't close)
  canvas.addEventListener("click", handleCanvasClick);
}

async function handleCanvasClick(e) {
  const { offsetX: x, offsetY: y } = e;

  const menu = document.createElement("div");
  menu.className = "note-popup";
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.innerHTML = `
    <b>Select type:</b><br>
    <button id="tText">📝 Text</button>
    <button id="tImage">🖼 Image</button>
    <br><small>(1 = Text, 2 = Image)</small>
  `;
  viewer.appendChild(menu);

  // Button clicks
  menu.querySelector("#tText").onclick = () => {
    menu.remove();
    const text = prompt("Enter hidden note:");
    if (text) placeMarker(x, y, encodeZW(text), "text");
  };

  menu.querySelector("#tImage").onclick = async () => {
    menu.remove();
    const img = await pickImage();
    if (img) placeMarker(x, y, encodeZW(img), "image");
  };

  // Keyboard keys (FIX — no auto close)
  menu.onkeydown = (event) => {
    if (event.key === "1") menu.querySelector("#tText").click();
    if (event.key === "2") menu.querySelector("#tImage").click();
  };

  menu.focus();
}

/* 🖼 Select / Drag Image */
function pickImage() {
  return new Promise(res => {
    currentDropResolve = res;
    dropZone.classList.add("show");
  });
}

dropZone.onclick = () => clickSelect();
dropZone.ondragover = e => e.preventDefault();
dropZone.ondrop = async e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  const b64 = await toBase64(file);
  dropZone.classList.remove("show");
  currentDropResolve(b64);
};

function clickSelect() {
  const i = document.createElement("input");
  i.type = "file"; i.accept = "image/*";
  i.onchange = async e => {
    const f = e.target.files[0];
    const b64 = await toBase64(f);
    dropZone.classList.remove("show");
    currentDropResolve(b64);
  };
  i.click();
}

function toBase64(file) {
  return new Promise(r => {
    let fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(file);
  });
}

/* 🔵 Add Marker (Draggable) */
function placeMarker(x, y, secret, type) {
  const dot = document.createElement("div");
  dot.className = "note-marker";
  dot.style.left = x + "px";
  dot.style.top = y + "px";
  dot.dataset.secret = secret;
  dot.dataset.type = type;

  // Reveal
  dot.onclick = e => {
    e.stopPropagation();
    reveal(dot);
  };

  // 🎯 Drag
  dot.onmousedown = e => {
    let shiftX = e.clientX - dot.offsetLeft;
    let shiftY = e.clientY - dot.offsetTop;

    function move(ev) {
      dot.style.left = (ev.clientX - shiftX) + "px";
      dot.style.top = (ev.clientY - shiftY) + "px";
    }
    document.onmousemove = move;
    document.onmouseup = () => { document.onmousemove = null; };
  };

  viewer.appendChild(dot);
}

/* 👁️ Reveal Text or Image for 5 seconds */
function reveal(dot) {
  const { secret, type } = dot.dataset;
  let x = dot.offsetLeft, y = dot.offsetTop;

  if (type === "text") {
    const msg = decodeZW(secret);
    const pop = popup(x, y, msg);
    setTimeout(() => pop.remove(), 4000);
  } else {
    const image = document.createElement("img");
    image.src = decodeZW(secret);
    image.style.position = "absolute";
    image.style.left = (x + 20) + "px";
    image.style.top = (y + 20) + "px";
    image.style.maxWidth = "200px";
    image.style.border = "2px solid #08f";
    image.style.borderRadius = "4px";
    viewer.appendChild(image);
    setTimeout(() => image.remove(), 5000);
  }
}

/* Popup box */
function popup(x, y, content) {
  const div = document.createElement("div");
  div.className = "note-popup";
  div.style.left = (x + 20) + "px";
  div.style.top = (y + 20) + "px";
  div.textContent = content;
  viewer.appendChild(div);
  return div;
}

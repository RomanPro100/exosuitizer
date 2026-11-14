const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);
const BLUE = "rgb(0, 0, 254)";
const STRIP_RATIO = 0.22;

const state = { file: null, image: null, sourceUrl: null, resultCanvas: null, sourceName: "exosuit_result" };
const $ = (id) => document.getElementById(id);
const fileInput = $("file-input");
const dropzone = $("dropzone");
const sourcePreview = $("source-preview");
const resultPreview = $("result-preview");
const sourceCanvas = $("source-canvas");
const resultCanvas = $("result-canvas");
const inputPlaceholder = $("input-placeholder");
const resultPlaceholder = $("result-placeholder");
const processButton = $("process-button");
const downloadButton = $("download-button");
const formatSelect = $("format-select");
const status = $("status");

function extension(file) {
  const name = file.name.toLowerCase();
  return name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
}

function setStatus(message = "", isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function revokeSourceUrl() {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = null;
}

function resetResult() {
  state.resultCanvas = null;
  resultPreview.removeAttribute("src");
  resultPreview.hidden = true;
  resultPlaceholder.hidden = false;
  downloadButton.disabled = true;
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть изображение."));
    };
    image.src = url;
  });
}

async function loadFile(file) {
  if (!file || !SUPPORTED_EXTENSIONS.has(extension(file))) {
    setStatus("Поддерживаются JPG, JPEG, PNG, WEBP и BMP.", true);
    return;
  }
  try {
    resetResult();
    revokeSourceUrl();
    const decoded = await readImage(file);
    state.file = file;
    state.image = decoded.image;
    state.sourceUrl = decoded.url;
    state.sourceName = file.name.replace(/\.[^.]+$/, "") || "exosuit_result";
    sourcePreview.src = state.sourceUrl;
    sourcePreview.hidden = false;
    inputPlaceholder.hidden = true;
    processButton.disabled = false;
    setStatus(`Загружено: ${file.name}`);
  } catch (error) {
    state.file = null;
    state.image = null;
    setStatus(error.message, true);
  }
}

function selectedSide() {
  return document.querySelector('input[name="side"]:checked').value;
}

function drawSource(image) {
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  sourceCanvas.getContext("2d").drawImage(image, 0, 0);
}

function processImage() {
  if (!state.image) return;
  const width = state.image.naturalWidth;
  const height = state.image.naturalHeight;
  resultCanvas.width = width;
  resultCanvas.height = height;
  const context = resultCanvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.drawImage(state.image, 0, 0);
  const side = selectedSide();
  const strip = Math.max(1, Math.round((side === "top" || side === "bottom" ? height : width) * STRIP_RATIO));
  context.fillStyle = BLUE;
  if (side === "top") context.fillRect(0, 0, width, strip);
  if (side === "bottom") context.fillRect(0, height - strip, width, strip);
  if (side === "left") context.fillRect(0, 0, strip, height);
  if (side === "right") context.fillRect(width - strip, 0, strip, height);
  state.resultCanvas = resultCanvas;
  resultPreview.src = resultCanvas.toDataURL("image/png");
  resultPreview.hidden = false;
  resultPlaceholder.hidden = true;
  downloadButton.disabled = false;
  setStatus("Готово к скачиванию.");
}

function canvasForExport(format) {
  if (format !== "jpeg" && format !== "bmp") return state.resultCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = state.resultCanvas.width;
  canvas.height = state.resultCanvas.height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(state.resultCanvas, 0, 0);
  return canvas;
}

function encodeBmp(canvas) {
  const { width, height } = canvas;
  const pixels = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelOffset = 54;
  const buffer = new ArrayBuffer(pixelOffset + rowSize * height);
  const view = new DataView(buffer);
  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, buffer.byteLength, true);
  view.setUint32(10, pixelOffset, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, rowSize * height, true);
  for (let y = 0; y < height; y += 1) {
    const row = pixelOffset + (height - y - 1) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = row + x * 3;
      view.setUint8(target, pixels[source + 2]);
      view.setUint8(target + 1, pixels[source + 1]);
      view.setUint8(target + 2, pixels[source]);
    }
  }
  return new Blob([buffer], { type: "image/bmp" });
}

function downloadResult() {
  if (!state.resultCanvas) return;
  const format = formatSelect.value;
  const exportCanvas = canvasForExport(format);
  if (format === "bmp") {
    triggerDownload(encodeBmp(exportCanvas), "bmp");
    return;
  }
  const mime = `image/${format}`;
  exportCanvas.toBlob(
    (blob) => {
      if (!blob) {
        setStatus("Браузер не поддерживает этот формат.", true);
        return;
      }
      triggerDownload(blob, format === "jpeg" ? "jpg" : format);
    },
    mime,
    1,
  );
}

function triggerDownload(blob, extensionName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.sourceName}_exosuit.${extensionName}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

$("choose-button").addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
["dragenter", "dragover"].forEach((eventName) =>
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-active");
  }),
);
["dragleave", "drop"].forEach((eventName) =>
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-active");
  }),
);
dropzone.addEventListener("drop", (event) => loadFile([...event.dataTransfer.files][0]));
processButton.addEventListener("click", processImage);
downloadButton.addEventListener("click", downloadResult);
window.addEventListener("beforeunload", revokeSourceUrl);

resetResult();

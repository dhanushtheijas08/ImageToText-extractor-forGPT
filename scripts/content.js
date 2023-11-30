console.log("hi");

const OPTIONS = {
  formatOutput: true,
  showUploadButton: true,
  showLanguageButton: true,
  enableDirectPasting: true,
  enableDragAndDrop: true,
};

const ELEMENT_IDS = {
  textarea: "prompt-textarea",
  script: "image-to-text-content-script",
  uploadButton: "img-upload-button",
  hiddenFileInput: "hidden-file-input",
  progressIndicator: "extraction-progress",
  mainDiv: "main-div",
  overLayer: "over-layer",
};

const BUTTONS = {
  uploadButton: `<svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H12M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11.8125" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> <path d="M17.5 21L17.5 15M17.5 15L20 17.5M17.5 15L15 17.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>`,
};
let worker = null;

async function addScript() {
  const script = document.createElement("script");
  script.id = ELEMENT_IDS.script;
  script.src = chrome.runtime.getURL("scripts/tesseract.min.js");

  script.onload = async function () {
    addExtensionElements();
  };

  (document.head || document.documentElement).appendChild(script);
}

addScript();

async function createWorker() {
  try {
    worker = await Tesseract.createWorker({
      workerPath: chrome.runtime.getURL(
        "scripts/tesseract.js@v4.0.3_dist_worker.min.js"
      ),
      corePath: chrome.runtime.getURL(
        "scripts/tesseract.js-core@4.0.3_tesseract-core-simd.wasm.js"
      ),
      langPath: chrome.runtime.getURL("scripts/languages/"),
      logger: (m) => {
        if (!m?.progress) return;
        let progressIndicator = getProgressIndicator();
        if (progressIndicator) {
          let val = Math.round(m.progress * 100);
          progressIndicator.textContent =
            val < 100 ? `Extracting text... ${val}%` : "";
        }
      },
    });

    const languages = ["eng"];
    await worker.loadLanguage(languages);
    await worker.initialize(languages);

    await worker.setParameters({
      preserve_interword_spaces: 1,
    });

    return worker;
  } catch (error) {
    console.error("Error creating Tesseract worker:", error);
    throw error;
  }
}

async function addExtensionElements() {
  let newWorker = worker;

  if (!worker) {
    console.log("Worker is undefined or null");
    newWorker = await createWorker();
  }

  addPasteListener();
  addUploadButton(newWorker);
  addProgressIndicator();
  createDragAndDrop();
}

function handlePaste(e) {
  let clipboardData = e.clipboardData;

  if (clipboardData) {
    let items = clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        let file = items[i].getAsFile();
        handleFile(file, worker);
      }
    }
  }
}

function addPasteListener() {
  let textarea = getTextArea();

  if (textarea) {
    textarea.addEventListener("paste", handlePaste);
    textarea.hasPasteListener = true;
  }
}

function addUploadButton(fileWorker) {
  let mainDiv = createMainDiv();

  let btn = createButton("Upload file", async function (e) {
    e.preventDefault();
    fileInput.click();
  });

  let fileInput = createFileInput();

  mainDiv.appendChild(btn);

  fileInput.addEventListener("change", function () {
    if (this.files && this.files[0]) {
      handleFile(this.files[0], fileWorker);
      console.log(this.files[0]);
      this.value = null;
    }
  });
}

async function handleFile(file, fileWorker) {
  let textarea = getTextArea();
  let progressIndicator = getProgressIndicator();

  (async () => {
    const { data } = await fileWorker.recognize(file, { rectangle: true });
    let text = calculateIndentation(data);
    console.log(text);

    if (textarea) {
      updateTextareaValue(textarea, text);
      progressIndicator.innerHTML = "";
    }
  })();
}

function calculateIndentation(data) {
  let indentedText = "";

  for (const block of data.blocks) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        let text = line.text;
        if (text.endsWith("\n")) {
          text = text.slice(0, -1);
        }
        let numChars = text.replace(/\s/g, "").length;
        let bboxWidth = line.bbox.x1 - line.bbox.x0;
        let charWidth = numChars > 0 ? bboxWidth / numChars : 0;

        let indentation = line.bbox.x0;
        let spaces = charWidth > 0 ? Math.floor(indentation / charWidth) : 0;
        indentedText += " ".repeat(spaces) + text + "\n";
      }
    }
  }

  return indentedText;
}

function getTextArea() {
  return document.getElementById(ELEMENT_IDS.textarea);
}

function createButton(text, clickHandler) {
  let btn = document.createElement("button");
  btn.id = ELEMENT_IDS.uploadButton;
  btn.title = "Upload image";
  btn.style.margin = "5px";
  btn.style.padding = "8px 5px";
  btn.style.cursor = "pointer";
  btn.style.backgroundColor = "transparent";
  btn.style.border = "1.1px solid #c5c5d2";
  btn.style.borderRadius = "8px";
  btn.style.color = "#fff";
  btn.style.fontSize = "16px";
  btn.style.display = "flex";
  btn.style.alignItems = "center";
  btn.style.gap = "5px";
  btn.innerHTML = text;

  btn.addEventListener(
    "mouseover",
    () => (btn.style.backgroundColor = "#40414f")
  );
  btn.addEventListener(
    "mouseleave",
    () => (btn.style.backgroundColor = "transparent")
  );
  btn.insertAdjacentHTML("afterbegin", BUTTONS.uploadButton);
  btn.addEventListener("click", clickHandler);

  // btn.style.width = "200px";
  // btn.style.color = "white";
  // btn.style.border = "none";
  // btn.style.backgroundColor = "#4CAF50";
  // btn.style.display = "inline";
  // btn.style.borderRadius = "8px";
  // btn.style.fontWeight = "bold";
  // btn.style.outline = "none";
  // outer button
  // btn relative btn-neutral btn-small flex h-9 w-9 items-center justify-center whitespace-nowrap rounded-lg border border-token-border-medium focus:ring-0 ml-2

  // inner div
  // flex w-full gap-2 items-center justify-center

  // SVG
  // <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-black dark:text-white"><path fill-rule="evenodd" clip-rule="evenodd" d="M16.7929 2.79289C18.0118 1.57394 19.9882 1.57394 21.2071 2.79289C22.4261 4.01184 22.4261 5.98815 21.2071 7.20711L12.7071 15.7071C12.5196 15.8946 12.2652 16 12 16H9C8.44772 16 8 15.5523 8 15V12C8 11.7348 8.10536 11.4804 8.29289 11.2929L16.7929 2.79289ZM19.7929 4.20711C19.355 3.7692 18.645 3.7692 18.2071 4.2071L10 12.4142V14H11.5858L19.7929 5.79289C20.2308 5.35499 20.2308 4.64501 19.7929 4.20711ZM6 5C5.44772 5 5 5.44771 5 6V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V14C19 13.4477 19.4477 13 20 13C20.5523 13 21 13.4477 21 14V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V6C3 4.34314 4.34315 3 6 3H10C10.5523 3 11 3.44771 11 4C11 4.55228 10.5523 5 10 5H6Z" fill="currentColor"></path></svg>

  return btn;
}

function createFileInput() {
  let fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  fileInput.id = ELEMENT_IDS.hiddenFileInput;

  document.body.appendChild(fileInput);

  return fileInput;
}

function addProgressIndicator() {
  let progressIndicator = document.createElement("p");
  progressIndicator.id = ELEMENT_IDS.progressIndicator;

  let mainDiv = getMainDiv();
  mainDiv.appendChild(progressIndicator);
}

function getProgressIndicator() {
  return document.getElementById(ELEMENT_IDS.progressIndicator);
}

function updateTextareaValue(textarea, text) {
  textarea.value = textarea.value + text;
  textarea.style.height = "";
  textarea.style.height = textarea.scrollHeight + "px";
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
}

function createMainDiv() {
  let mainDiv = document.createElement("div");
  mainDiv.id = ELEMENT_IDS.mainDiv;
  mainDiv.style.display = "flex";
  mainDiv.style.width = "100%";
  mainDiv.style.gap = "10px";
  mainDiv.style.alignItems = "center";

  let textarea = getTextArea();
  let textareaParent = textarea.parentElement;

  textareaParent.insertBefore(mainDiv, textareaParent.firstChild);

  return mainDiv;
}

function getMainDiv() {
  return document.getElementById(ELEMENT_IDS.mainDiv);
}

function createDragAndDrop() {
  const overLayer = document.createElement("div");
  overLayer.id = ELEMENT_IDS.overLayer;

  overLayer.style.position = "fixed";
  overLayer.style.top = "0";
  overLayer.style.left = "0";
  overLayer.style.width = "100%";
  overLayer.style.height = "100%";
  overLayer.style.zIndex = "1000";
  overLayer.style.display = "none";
  overLayer.style.borderRadius = "5px";
  overLayer.style.textAlign = "center";
  overLayer.style.padding = "5% 10%";
  overLayer.style.cursor = "pointer";
  overLayer.style.userSelect = "none";
  overLayer.style.backdropFilter = "blur(5px)";

  const innerLayer = document.createElement("div");
  innerLayer.style.height = "100%";
  innerLayer.style.borderRadius = "10px";
  innerLayer.style.backgroundColor = "rgba(0,0,0,0.3)";
  innerLayer.style.padding = "30px";
  innerLayer.style.fontSize = "30px";
  innerLayer.style.fontWeight = "bold";
  innerLayer.style.color = "#fff";
  innerLayer.style.cursor = "pointer";
  innerLayer.style.border = "5px dashed #fff";
  innerLayer.style.display = "flex";
  innerLayer.style.alignItems = "center";
  innerLayer.style.justifyContent = "center";
  innerLayer.textContent = "Drop image here";
  document.body.appendChild(overLayer);
  overLayer.appendChild(innerLayer);

  document.body.addEventListener("dragenter", function (e) {
    e.preventDefault();
    overLayer.style.display = "block";
  });

  overLayer.addEventListener("drop", handleDrop, false);
  overLayer.addEventListener("dragleave", handleDragLeave, false);
  overLayer.addEventListener("dragenter", handleDragEnter, false);
  overLayer.addEventListener("dragover", handleDragEnter, false);
}

function handleDrop(e) {
  e.preventDefault();
  const fileInput = e.dataTransfer.items[0];
  if (!fileInput || fileInput.kind !== "file") return;
  if (!fileInput.type.match(/^image\//)) return;

  let file = e.dataTransfer.items[0].getAsFile();
  handleFile(file);

  let overlay = getOverLayer();
  overlay.style.display = "none";
}

function handleDragLeave(e) {
  e.preventDefault();
  if (e.relatedTarget) return;
  let overlay = getOverLayer();
  overlay.style.display = "none";
}

function handleDragEnter(e) {
  e.preventDefault();
}

function getOverLayer() {
  return document.getElementById(ELEMENT_IDS.overLayer);
}

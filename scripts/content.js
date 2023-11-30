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
        console.log(m.progress);
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

  let btn = createButton("Upload image", async function (e) {
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
  btn.innerHTML = text;
  btn.style.width = "200px";
  btn.style.margin = "5px";
  btn.style.padding = "5px";
  btn.style.border = "none";
  btn.style.backgroundColor = "#4CAF50";
  btn.style.color = "white";
  btn.style.cursor = "pointer";
  btn.style.display = "inline";
  btn.style.fontSize = "16px";
  btn.style.borderRadius = "8px";
  btn.style.fontWeight = "bold";
  btn.style.outline = "none";
  btn.addEventListener("click", clickHandler);

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

  // insert into main div
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
  // overLayer.style.display = "none";
  overLayer.style.margin = "100px";
  overLayer.style.backgroundColor = "rgba(70,130,180,0.3)";
  overLayer.style.border = "2px dashed #000000";
  overLayer.style.borderRadius = "5px";
  overLayer.style.textAlign = "center";
  overLayer.style.paddingTop = "30px";
  overLayer.style.fontSize = "30px";
  overLayer.style.fontWeight = "bold";
  overLayer.style.color = "#000000";
  overLayer.style.cursor = "pointer";
  overLayer.style.userSelect = "none";
  overLayer.innerHTML = "Drop image here";

  document.body.appendChild(overLayer);
  // insert into top of body
  overLayer.addEventListener(
    "dragenter",
    function (e) {
      e.preventDefault();
      const fileInput = e.dataTransfer.items[0].getAsFile();
      // validate file type

      // if (
      //   !fileInput ||
      //   fileInput.kind !== "file" ||
      //   !fileInput.type.startsWith("image/")
      // )
      //   return;
      console.log("proper file");
    },
    false
  );
}

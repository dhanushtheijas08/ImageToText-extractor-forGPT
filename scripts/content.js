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
};

let worker = null;

async function addScript() {
  const script = document.createElement("script");
  script.id = ELEMENT_IDS.script;
  script.src = chrome.runtime.getURL("scripts/tesseract.min.js");

  script.onload = async function () {
    console.log("Tesseract.js script loaded");
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
  let textarea = getTextArea();
  let textareaParent = textarea.parentElement;

  let btn = createButton("Upload image", async function (e) {
    e.preventDefault();
    fileInput.click();
  });

  let fileInput = createFileInput();

  textareaParent.insertBefore(btn, textareaParent.firstChild);

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

  (async () => {
    const { data } = await fileWorker.recognize(file, { rectangle: true });
    let text = calculateIndentation(data);
    console.log(text);

    if (textarea) {
      updateTextareaValue(textarea, text);
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

function updateTextareaValue(textarea, text) {
  textarea.value = textarea.value + text;
  textarea.style.height = "";
  textarea.style.height = textarea.scrollHeight + "px";
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
}

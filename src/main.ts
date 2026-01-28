import './style.css';
import { formatText } from './formatter';

const INDENT_SIZE = 4;

type Elements = {
  input: HTMLTextAreaElement;
  output: HTMLTextAreaElement;
  inputPanel: HTMLElement;
  formatButton: HTMLButtonElement;
  copyButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  loadButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root not found.');
}

app.innerHTML = `
  <div class="page">
    <header class="header">
      <div>
        <h1>Razor Indent Formatter</h1>
      </div>
      <div class="controls">
        <div class="control-group buttons">
          <button id="formatBtn" type="button" class="primary">Format</button>
          <button id="copyBtn" type="button">Copy Output</button>
          <button id="clearBtn" type="button">Clear</button>
          <button id="loadBtn" type="button">Load File</button>
          <input id="fileInput" type="file" hidden accept=".cshtml,.razor,.html,.cs,.js,.ts,.txt" />
        </div>
      </div>
    </header>

    <main class="grid">
      <section class="panel" id="inputPanel">
        <div class="panel-header">
          <h2>Input</h2>
          <span class="badge">Paste / Drop file</span>
        </div>
        <textarea id="input" spellcheck="false" wrap="off" placeholder="Paste Razor / HTML / JS here..."></textarea>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h2>Output</h2>
          <span class="badge">Read-only</span>
        </div>
        <textarea id="output" spellcheck="false" wrap="off" readonly></textarea>
      </section>
    </main>

  </div>
`;

const elements = mapElements();

elements.formatButton.addEventListener('click', () => {
  formatAndDisplay(elements);
});

elements.copyButton.addEventListener('click', async () => {
  const text = elements.output.value;
  if (!text) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    elements.copyButton.textContent = 'Copied!';
    window.setTimeout(() => {
      elements.copyButton.textContent = 'Copy Output';
    }, 1200);
  } catch {
    elements.copyButton.textContent = 'Copy failed';
    window.setTimeout(() => {
      elements.copyButton.textContent = 'Copy Output';
    }, 1200);
  }
});

elements.clearButton.addEventListener('click', () => {
  elements.input.value = '';
  elements.output.value = '';
  elements.copyButton.textContent = 'Copy Output';
  elements.input.focus();
});

elements.loadButton.addEventListener('click', () => {
  elements.fileInput.click();
});

elements.fileInput.addEventListener('change', async () => {
  const file = elements.fileInput.files?.[0];
  if (!file) {
    return;
  }
  await loadFileIntoInput(file, elements);
  elements.fileInput.value = '';
});

elements.input.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') {
    return;
  }
  event.preventDefault();

  const start = elements.input.selectionStart ?? 0;
  const end = elements.input.selectionEnd ?? start;
  const insert = ' '.repeat(INDENT_SIZE);
  const value = elements.input.value;

  elements.input.value = value.slice(0, start) + insert + value.slice(end);
  const cursor = start + insert.length;
  elements.input.selectionStart = cursor;
  elements.input.selectionEnd = cursor;
});

setupInputDropZone(elements);

syncPaneScroll(elements.input, elements.output);

function mapElements(): Elements {
  const input = document.querySelector<HTMLTextAreaElement>('#input');
  const output = document.querySelector<HTMLTextAreaElement>('#output');
  const inputPanel = document.querySelector<HTMLElement>('#inputPanel');
  const formatButton = document.querySelector<HTMLButtonElement>('#formatBtn');
  const copyButton = document.querySelector<HTMLButtonElement>('#copyBtn');
  const clearButton = document.querySelector<HTMLButtonElement>('#clearBtn');
  const loadButton = document.querySelector<HTMLButtonElement>('#loadBtn');
  const fileInput = document.querySelector<HTMLInputElement>('#fileInput');

  if (
    !input ||
    !output ||
    !inputPanel ||
    !formatButton ||
    !copyButton ||
    !clearButton ||
    !loadButton ||
    !fileInput
  ) {
    throw new Error('UI elements not found.');
  }

  return {
    input,
    output,
    inputPanel,
    formatButton,
    copyButton,
    clearButton,
    loadButton,
    fileInput
  };
}

function formatAndDisplay(elements: Elements): void {
  const adjustTextBlocks = true;

  const result = formatText(elements.input.value, {
    indentSize: INDENT_SIZE,
    adjustTextBlocks
  });

  if (result.error) {
    elements.output.value = result.output;
    return;
  }

  elements.output.value = result.output;
}

function syncPaneScroll(left: HTMLTextAreaElement, right: HTMLTextAreaElement): void {
  let isSyncing = false;

  const sync = (source: HTMLTextAreaElement, target: HTMLTextAreaElement) => {
    if (isSyncing) {
      return;
    }
    isSyncing = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      isSyncing = false;
    });
  };

  left.addEventListener('scroll', () => sync(left, right), { passive: true });
  right.addEventListener('scroll', () => sync(right, left), { passive: true });
}

function setupInputDropZone(elements: Elements): void {
  const { inputPanel } = elements;

  const setDragState = (active: boolean) => {
    if (active) {
      inputPanel.classList.add('drag-over');
    } else {
      inputPanel.classList.remove('drag-over');
    }
  };

  inputPanel.addEventListener('dragenter', (event) => {
    event.preventDefault();
    setDragState(true);
  });

  inputPanel.addEventListener('dragover', (event) => {
    event.preventDefault();
    setDragState(true);
  });

  inputPanel.addEventListener('dragleave', (event) => {
    const related = event.relatedTarget;
    if (!related || !(related instanceof Node) || !inputPanel.contains(related)) {
      setDragState(false);
    }
  });

  inputPanel.addEventListener('drop', async (event) => {
    event.preventDefault();
    setDragState(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }
    await loadFileIntoInput(file, elements);
  });
}

async function loadFileIntoInput(file: File, elements: Elements): Promise<void> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const encoding = detectEncoding(bytes);
  const decoder = new TextDecoder(encoding);
  const text = decoder.decode(bytes);

  elements.input.value = text;
  elements.output.value = '';
  elements.copyButton.textContent = 'Copy Output';
  elements.input.focus();
}

function detectEncoding(bytes: Uint8Array): 'utf-8' | 'shift_jis' | 'euc-jp' {
  const candidates: Array<'utf-8' | 'shift_jis' | 'euc-jp'> = ['utf-8', 'shift_jis', 'euc-jp'];
  let best = { encoding: 'utf-8' as const, score: Number.NEGATIVE_INFINITY };

  for (const encoding of candidates) {
    const result = decodeWithEncoding(bytes, encoding);
    const score = scoreDecodedText(result.text, result.hadReplacement);
    if (score > best.score) {
      best = { encoding, score };
    }
  }

  return best.encoding;
}

function decodeWithEncoding(
  bytes: Uint8Array,
  encoding: 'utf-8' | 'shift_jis' | 'euc-jp'
): { text: string; hadReplacement: boolean } {
  let text = '';
  let hadReplacement = false;

  if (encoding === 'utf-8') {
    try {
      const strict = new TextDecoder('utf-8', { fatal: true });
      text = strict.decode(bytes);
      return { text, hadReplacement: false };
    } catch {
      // Fall through to lenient decode for scoring.
    }
  }

  const decoder = new TextDecoder(encoding);
  text = decoder.decode(bytes);
  hadReplacement = text.includes('�');
  return { text, hadReplacement };
}

function scoreDecodedText(text: string, hadReplacement: boolean): number {
  let jpCount = 0;
  let controlCount = 0;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0xfffd) {
      continue;
    }
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      controlCount += 1;
      continue;
    }
    if ((code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0xff65 && code <= 0xff9f)) {
      jpCount += 1;
    }
  }

  let score = jpCount * 2 - controlCount * 2;
  if (hadReplacement) {
    score -= 5;
  }


  return score;
}

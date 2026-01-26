import './style.css';
import { formatText } from './formatter';

type Elements = {
  input: HTMLTextAreaElement;
  output: HTMLTextAreaElement;
  formatButton: HTMLButtonElement;
  copyButton: HTMLButtonElement;
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
        </div>
      </div>
    </header>

    <main class="grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Input</h2>
          <span class="badge">Paste here</span>
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

syncPaneScroll(elements.input, elements.output);

function mapElements(): Elements {
  const input = document.querySelector<HTMLTextAreaElement>('#input');
  const output = document.querySelector<HTMLTextAreaElement>('#output');
  const formatButton = document.querySelector<HTMLButtonElement>('#formatBtn');
  const copyButton = document.querySelector<HTMLButtonElement>('#copyBtn');

  if (
    !input ||
    !output ||
    !formatButton ||
    !copyButton
  ) {
    throw new Error('UI elements not found.');
  }

  return {
    input,
    output,
    formatButton,
    copyButton
  };
}

function formatAndDisplay(elements: Elements): void {
  const indentSize = 4;
  const adjustTextBlocks = true;

  const result = formatText(elements.input.value, {
    indentSize,
    adjustTextBlocks
  });

  if (result.error) {
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

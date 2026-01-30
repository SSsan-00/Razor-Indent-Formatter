export type FormatOptions = {
  indentSize: number;
  adjustTextBlocks: boolean;
};

export type FormatResult = {
  output: string;
  logs: string[];
  error?: string;
};

type LineInfo = {
  original: string;
  leading: string;
  rest: string;
  leadingWidth: number;
};

type TextBlock = {
  startLine: number;
  endLine: number;
  parentLevel: number;
  tagName: string;
  skip: boolean;
};

type RawLineMeta = {
  isRawBlock: boolean;
  isCaseOrDefault: boolean;
  isBreak: boolean;
  isSwitchLine: boolean;
};

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

const RAW_TAGS = new Set(['script', 'style']);

const TEXT_OPEN_RE = /<text\s*>/i;
const TEXT_CLOSE_RE = /<\s*\/\s*text\s*>/i;

const HTML_COMMENT_OPEN = '<!--';
const HTML_COMMENT_CLOSE = '-->';

export function formatText(input: string, options: FormatOptions): FormatResult {
  const indentSize = sanitizeIndentSize(options.indentSize);
  const adjustTextBlocks = options.adjustTextBlocks;

  const { lines, lineEnding } = splitLines(input);
  const lineInfos = lines.map((line) => analyzeLine(line, indentSize));

  const desiredIndents: Array<number | null> = new Array(lines.length).fill(null);
  const indentAfterRazorPrefix: boolean[] = new Array(lines.length).fill(false);
  const razorTextContentIndents: number[] = new Array(lines.length).fill(0);
  const rawLineMeta: Array<RawLineMeta | null> = new Array(lines.length).fill(null);
  const logs: string[] = [];
  const textBlocks: TextBlock[] = [];

  let level = 0;
  let inComment = false;
  let inRawTag: string | null = null;
  let inTextBlock = false;
  let currentTextBlock: TextBlock | null = null;
  let inRawBlock = false;
  let inBlockComment = false;
  const switchDepths: number[] = [];
  let caseIndentDepth: number | null = null;
  let pendingSwitch = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const info = lineInfos[i];
    const trimmed = info.rest.trimStart();

    const hasTextClose = TEXT_CLOSE_RE.test(trimmed);
    const hasRawClose = inRawBlock && containsClosingTag(line, currentTextBlock?.tagName ?? '');
    if (inTextBlock && hasTextClose) {
      // Close <text> block before processing the closing line itself.
      if (currentTextBlock) {
        currentTextBlock.endLine = i - 1;
        textBlocks.push(currentTextBlock);
        currentTextBlock = null;
      }
      inTextBlock = false;
    }
    if (inRawBlock && hasRawClose) {
      if (currentTextBlock) {
        currentTextBlock.endLine = i - 1;
        textBlocks.push(currentTextBlock);
        currentTextBlock = null;
      }
      inRawBlock = false;
    }

    if (inTextBlock || inRawBlock) {
      desiredIndents[i] = null;
      continue;
    }

    const commentResult = stripHtmlComments(line, inComment);
    inComment = commentResult.inComment;
    const cleanLine = commentResult.cleaned;

    let leadingCloseCount = countLeadingClosings(trimmed);

    let openCount = 0;
    let closeCount = 0;
    let braceResult = { open: 0, close: 0, inBlockComment };

    if (inRawTag) {
      if (containsClosingTag(cleanLine, inRawTag)) {
        closeCount += 1;
        if (leadingCloseCount === 0 && trimmed.startsWith(`</${inRawTag}`)) {
          leadingCloseCount = 1;
        }
        inRawTag = null;
      }
    } else if (!inComment) {
      if (isHtmlLine(trimmed)) {
        const tags = extractTags(cleanLine);
        for (const tag of tags) {
          if (tag.isClosing) {
            closeCount += 1;
            continue;
          }
          if (tag.isSelfClosing) {
            continue;
          }
          openCount += 1;
          if (RAW_TAGS.has(tag.name)) {
            inRawTag = tag.name;
          }
        }
      }

      braceResult = countBraces(info.rest, inBlockComment);
      inBlockComment = braceResult.inBlockComment;
      openCount += braceResult.open;
      closeCount += braceResult.close;
    }

    const effectiveLevel = Math.max(0, level - leadingCloseCount);
    const isHtml = isHtmlLine(trimmed);
    const isRazorLine = trimmed.startsWith('@');
    const isRazorTextLine = trimmed.startsWith('@:');
    const razorTextContent = isRazorTextLine ? trimmed.slice(2).trimStart() : '';
    const codeTrimmed = isRazorTextLine ? razorTextContent : (isRazorLine ? '' : trimmed);
    const isSwitchLine = !isHtml && /^switch\s*\(/.test(codeTrimmed);
    const isCaseOrDefault = !isHtml && (/^case\b/.test(codeTrimmed) || /^default\b/.test(codeTrimmed));
    const isClosingBraceLine = !isHtml && codeTrimmed.startsWith('}');
    const inSwitch = switchDepths.length > 0 && level >= switchDepths[switchDepths.length - 1];
    const nextLevel = Math.max(0, level - closeCount + openCount);
    const closesSwitch =
      isClosingBraceLine &&
      switchDepths.length > 0 &&
      nextLevel < switchDepths[switchDepths.length - 1];

    let lineIndent = effectiveLevel * indentSize;
    if (inSwitch && caseIndentDepth !== null && !isCaseOrDefault && !closesSwitch) {
      lineIndent += indentSize;
    }
    desiredIndents[i] = lineIndent;

    let pendingSwitchSetThisLine = false;
    if (isSwitchLine) {
      if (braceResult.open > 0) {
        switchDepths.push(nextLevel);
        pendingSwitch = false;
      } else {
        pendingSwitch = true;
        pendingSwitchSetThisLine = true;
      }
    }
    if (pendingSwitch && braceResult.open > 0) {
      if (codeTrimmed.startsWith('{')) {
        switchDepths.push(nextLevel);
        pendingSwitch = false;
      }
    }
    if (!pendingSwitchSetThisLine && pendingSwitch && codeTrimmed.length > 0 && !codeTrimmed.startsWith('{')) {
      pendingSwitch = false;
    }
    if (inSwitch && isCaseOrDefault) {
      caseIndentDepth = level;
    }
    while (switchDepths.length > 0 && nextLevel < switchDepths[switchDepths.length - 1]) {
      switchDepths.pop();
    }
    if (caseIndentDepth !== null && nextLevel < caseIndentDepth) {
      caseIndentDepth = null;
    }

    level = nextLevel;

    if (isLineOpeningTag(trimmed, 'text') && !isLineClosingTag(trimmed, 'text')) {
      inTextBlock = true;
      currentTextBlock = {
        startLine: i + 1,
        endLine: i,
        parentLevel: Math.max(0, level - 1),
        tagName: 'text',
        skip: false
      };
    }
    if (isLineOpeningTag(trimmed, 'script') && !isLineClosingTag(trimmed, 'script')) {
      inRawBlock = true;
      currentTextBlock = {
        startLine: i + 1,
        endLine: i,
        parentLevel: Math.max(0, level - 1),
        tagName: 'script',
        skip: false
      };
    }
    if (isLineOpeningTag(trimmed, 'style') && !isLineClosingTag(trimmed, 'style')) {
      inRawBlock = true;
      currentTextBlock = {
        startLine: i + 1,
        endLine: i,
        parentLevel: Math.max(0, level - 1),
        tagName: 'style',
        skip: false
      };
    }
  }

  if (inTextBlock && currentTextBlock) {
    currentTextBlock.endLine = lines.length - 1;
    currentTextBlock.skip = true;
    textBlocks.push(currentTextBlock);
  }

  if (adjustTextBlocks) {
    applyTextBlockIndentation(
      textBlocks,
      desiredIndents,
      lineInfos,
      indentSize,
      indentAfterRazorPrefix,
      razorTextContentIndents,
      rawLineMeta
    );
  } else {
    applyTextBlockOriginalIndent(textBlocks, desiredIndents, lineInfos);
  }

  for (let i = 0; i < desiredIndents.length; i += 1) {
    if (desiredIndents[i] === null) {
      desiredIndents[i] = lineInfos[i].leadingWidth;
    }
  }

  const outputLines = lines.map((line, index) => {
    const desired = desiredIndents[index] ?? 0;
    let rest = lineInfos[index].rest;
    if (rawLineMeta[index]?.isRawBlock && !indentAfterRazorPrefix[index]) {
      rest = formatRawLineContent(rest);
    }
    if (indentAfterRazorPrefix[index]) {
      return makeRazorTextIndentedLine(rest, desired, razorTextContentIndents[index] ?? 0);
    }
    return makeIndentedLine(rest, desired);
  });

  const switchSpacing = insertSwitchBlankLines(outputLines, rawLineMeta);
  const output = switchSpacing.lines.join(lineEnding);

  const validation = validateOutput(lineInfos, switchSpacing.lines, switchSpacing.insertedBlankLines);
  if (!validation.ok) {
    return {
      output: input,
      logs: [],
      error: validation.message
    };
  }

  logs.push('Validation ok: non-leading content unchanged.');

  for (let i = 0; i < lineInfos.length; i += 1) {
    const before = lineInfos[i].leadingWidth;
    const after = desiredIndents[i] ?? before;
    if (before !== after) {
      logs.push(
        `Line ${i + 1}: ${before} -> ${after}`
      );
    }
  }

  if (logs.length === 0) {
    logs.push('No indentation changes detected.');
  }

  return { output, logs };
}

function sanitizeIndentSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 2;
  }
  return Math.floor(value);
}

function splitLines(input: string): { lines: string[]; lineEnding: string } {
  const lineEnding = input.includes('\r\n') ? '\r\n' : '\n';
  const lines = input.split(/\r\n|\n/);
  return { lines, lineEnding };
}

function analyzeLine(line: string, indentSize: number): LineInfo {
  const match = line.match(/^(\s*)(.*)$/);
  if (!match) {
    return { original: line, leading: '', rest: line, leadingWidth: 0 };
  }
  const leading = match[1];
  const rest = match[2];
  return {
    original: line,
    leading,
    rest,
    leadingWidth: countIndentWidth(leading, indentSize)
  };
}

function countIndentWidth(leading: string, indentSize: number): number {
  let width = 0;
  for (const ch of leading) {
    if (ch === '\t') {
      width += indentSize;
    } else if (ch === ' ') {
      width += 1;
    } else {
      width += 1;
    }
  }
  return width;
}

function stripHtmlComments(line: string, inComment: boolean): { cleaned: string; inComment: boolean } {
  let result = '';
  let index = 0;
  while (index < line.length) {
    if (inComment) {
      const end = line.indexOf(HTML_COMMENT_CLOSE, index);
      if (end === -1) {
        return { cleaned: result, inComment: true };
      }
      index = end + HTML_COMMENT_CLOSE.length;
      inComment = false;
      continue;
    }

    const start = line.indexOf(HTML_COMMENT_OPEN, index);
    if (start === -1) {
      result += line.slice(index);
      break;
    }
    result += line.slice(index, start);
    index = start + HTML_COMMENT_OPEN.length;
    inComment = true;
  }
  return { cleaned: result, inComment };
}

function extractTags(line: string): Array<{ name: string; isClosing: boolean; isSelfClosing: boolean }> {
  const tags: Array<{ name: string; isClosing: boolean; isSelfClosing: boolean }> = [];
  const regex = /<[^>]+>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const raw = match[0];
    if (raw.startsWith('<!') || raw.startsWith('<?') || raw.startsWith('<%')) {
      continue;
    }
    const nameMatch = raw.match(/^<\s*\/?\s*([a-zA-Z0-9:-]+)/);
    if (!nameMatch) {
      continue;
    }
    const name = nameMatch[1].toLowerCase();
    const isClosing = /^<\s*\//.test(raw);
    const isSelfClosing = /\/>\s*$/.test(raw) || VOID_TAGS.has(name);
    tags.push({ name, isClosing, isSelfClosing });
  }
  return tags;
}

function containsClosingTag(line: string, tagName: string): boolean {
  if (!tagName) {
    return false;
  }
  const closeRe = new RegExp(`<\\s*\\/\\s*${tagName}\\s*>`, 'i');
  return closeRe.test(line);
}

function countLeadingClosings(trimmed: string): number {
  let count = 0;
  let rest = trimmed;
  while (true) {
    const tagMatch = rest.match(/^<\s*\/\s*[a-zA-Z0-9:-]+[^>]*>\s*/);
    if (tagMatch) {
      count += 1;
      rest = rest.slice(tagMatch[0].length);
      continue;
    }
    const braceMatch = rest.match(/^@?\}\s*/);
    if (braceMatch) {
      count += 1;
      rest = rest.slice(braceMatch[0].length);
      continue;
    }
    break;
  }
  return count;
}

function isHtmlLine(trimmed: string): boolean {
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('<')) {
    return true;
  }
  if (lower.startsWith('@:')) {
    const after = lower.slice(2).trimStart();
    return after.startsWith('<');
  }
  return false;
}

function isLineOpeningTag(trimmed: string, tagName: string): boolean {
  const lower = trimmed.toLowerCase();
  if (lower.startsWith(`<${tagName}`)) {
    return true;
  }
  if (lower.startsWith('@:')) {
    const after = lower.slice(2).trimStart();
    return after.startsWith(`<${tagName}`);
  }
  return false;
}

function isLineClosingTag(trimmed: string, tagName: string): boolean {
  const lower = trimmed.toLowerCase();
  if (lower.startsWith(`</${tagName}`)) {
    return true;
  }
  if (lower.startsWith('@:')) {
    const after = lower.slice(2).trimStart();
    return after.startsWith(`</${tagName}`);
  }
  return false;
}

function applyTextBlockIndentation(
  blocks: TextBlock[],
  desiredIndents: Array<number | null>,
  lineInfos: LineInfo[],
  indentSize: number,
  indentAfterRazorPrefix: boolean[],
  razorTextContentIndents: number[],
  rawLineMeta: Array<RawLineMeta | null>
): void {
  for (const block of blocks) {
    if (block.skip || block.endLine < block.startLine) {
      applySingleTextBlockOriginalIndent(block, desiredIndents, lineInfos);
      continue;
    }

    const isRawBlock = RAW_TAGS.has(block.tagName);
    if (isRawBlock && shouldPreserveRawBlockIndent(block, lineInfos)) {
      applySingleTextBlockOriginalIndent(block, desiredIndents, lineInfos);
      continue;
    }
    const baseIndent = block.parentLevel * indentSize + (isRawBlock && block.parentLevel === 0 ? 0 : indentSize);
    const switchDepths: number[] = [];
    let level = 0;
    let inBlockComment = false;
    let razorBraceDepth = 0;
    let inRazorCodeBlock = false;
    let caseIndentDepth: number | null = null;
    let pendingSwitch = false;
    let razorTextGroupBaseLevel: number | null = null;

    for (let lineIndex = block.startLine; lineIndex <= block.endLine; lineIndex += 1) {
      const rest = lineInfos[lineIndex].rest;
      if (rest.length === 0) {
        desiredIndents[lineIndex] = 0;
        razorTextGroupBaseLevel = null;
        if (isRawBlock) {
          rawLineMeta[lineIndex] = {
            isRawBlock: true,
            isCaseOrDefault: false,
            isBreak: false,
            isSwitchLine: false
          };
        }
        continue;
      }

      const trimmed = rest.trimStart();
      const leadingCloseCount = countLeadingBraceClosings(trimmed);
      const effectiveLevel = Math.max(0, level - (leadingCloseCount > 0 ? 1 : 0));
      const isRazorLine = trimmed.startsWith('@');
      const isRazorTextLine = trimmed.startsWith('@:');
      const isRazorDirectiveLine = isRazorLine && !isRazorTextLine;
      const lineInRazorBlock = isRawBlock && (inRazorCodeBlock || isRazorDirectiveLine);

      const razorTextContent = isRazorTextLine ? trimmed.slice(2).trimStart() : '';
      const jsTrimmed = isRazorTextLine ? razorTextContent : (isRazorLine ? '' : trimmed);
      const isSwitchLine = isRawBlock && /^switch\s*\(/.test(jsTrimmed);
      const isCaseOrDefault = isRawBlock && (/^case\b/.test(jsTrimmed) || /^default\b/.test(jsTrimmed));
      const isBreakLine = isRawBlock && /^break\b/.test(jsTrimmed);
      const isClosingBraceLine = isRawBlock && jsTrimmed.startsWith('}');
      const inSwitch = isRawBlock && switchDepths.length > 0 && level >= switchDepths[switchDepths.length - 1];
      const braceResult = countBraces(rest, inBlockComment);
      const nextLevel = Math.max(0, level + braceResult.open - braceResult.close);
      const closesSwitch =
        isClosingBraceLine &&
        switchDepths.length > 0 &&
        nextLevel < switchDepths[switchDepths.length - 1];

      let lineIndent = baseIndent + effectiveLevel * indentSize;
      if (inSwitch && caseIndentDepth !== null && !isCaseOrDefault && !closesSwitch) {
        lineIndent += indentSize;
      }

      if (isRawBlock && isRazorTextLine) {
        if (razorTextGroupBaseLevel === null) {
          razorTextGroupBaseLevel = effectiveLevel;
        }
        lineIndent = baseIndent + razorTextGroupBaseLevel * indentSize;
        indentAfterRazorPrefix[lineIndex] = true;
        let contentIndent = Math.max(0, (effectiveLevel - razorTextGroupBaseLevel) * indentSize);
        if (inSwitch && caseIndentDepth !== null && !isCaseOrDefault && !closesSwitch) {
          contentIndent += indentSize;
        }
        razorTextContentIndents[lineIndex] = contentIndent;
      } else if (isRawBlock) {
        razorTextGroupBaseLevel = null;
      }
      desiredIndents[lineIndex] = lineIndent;

      if (isRawBlock) {
        rawLineMeta[lineIndex] = {
          isRawBlock: true,
          isCaseOrDefault: inSwitch && isCaseOrDefault,
          isBreak: inSwitch && isBreakLine,
          isSwitchLine: inSwitch && isSwitchLine
        };
      }

      inBlockComment = braceResult.inBlockComment;

      if (lineInRazorBlock) {
        razorBraceDepth = Math.max(0, razorBraceDepth + braceResult.open - braceResult.close);
        inRazorCodeBlock = razorBraceDepth > 0;
      }

      let pendingSwitchSetThisLine = false;
      if (isRawBlock && isSwitchLine) {
        if (braceResult.open > 0) {
          switchDepths.push(nextLevel);
          pendingSwitch = false;
        } else {
          pendingSwitch = true;
          pendingSwitchSetThisLine = true;
        }
      }
      if (isRawBlock && pendingSwitch && braceResult.open > 0) {
        if (jsTrimmed.startsWith('{')) {
          switchDepths.push(nextLevel);
          pendingSwitch = false;
        }
      }
      if (!pendingSwitchSetThisLine && pendingSwitch && jsTrimmed.length > 0 && !jsTrimmed.startsWith('{')) {
        pendingSwitch = false;
      }
      if (inSwitch && isCaseOrDefault) {
        caseIndentDepth = level;
      }
      while (switchDepths.length > 0 && nextLevel < switchDepths[switchDepths.length - 1]) {
        switchDepths.pop();
      }
      if (caseIndentDepth !== null && nextLevel < caseIndentDepth) {
        caseIndentDepth = null;
      }

      level = nextLevel;
    }
  }
}

function applySingleTextBlockOriginalIndent(
  block: TextBlock,
  desiredIndents: Array<number | null>,
  lineInfos: LineInfo[]
): void {
  for (let lineIndex = block.startLine; lineIndex <= block.endLine; lineIndex += 1) {
    desiredIndents[lineIndex] = lineInfos[lineIndex].leadingWidth;
  }
}

function applyTextBlockOriginalIndent(
  blocks: TextBlock[],
  desiredIndents: Array<number | null>,
  lineInfos: LineInfo[]
): void {
  for (const block of blocks) {
    for (let lineIndex = block.startLine; lineIndex <= block.endLine; lineIndex += 1) {
      desiredIndents[lineIndex] = lineInfos[lineIndex].leadingWidth;
    }
  }
}

function shouldPreserveRawBlockIndent(block: TextBlock, lineInfos: LineInfo[]): boolean {
  let hasRazorDirective = false;
  let hasNonRazorLine = false;
  let razorBraceDepth = 0;

  for (let lineIndex = block.startLine; lineIndex <= block.endLine; lineIndex += 1) {
    const rest = lineInfos[lineIndex].rest;
    const trimmed = rest.trimStart();
    if (trimmed.length === 0) {
      continue;
    }
    const isRazorTextLine = trimmed.startsWith('@:');
    const isRazorDirectiveLine = trimmed.startsWith('@') && !isRazorTextLine;
    const inRazorBlock = razorBraceDepth > 0 || isRazorDirectiveLine;

    if (isRazorDirectiveLine) {
      hasRazorDirective = true;
    } else if (!trimmed.startsWith('@') && !inRazorBlock) {
      hasNonRazorLine = true;
    }

    if (inRazorBlock) {
      const braceResult = countBraces(rest, false);
      razorBraceDepth = Math.max(0, razorBraceDepth + braceResult.open - braceResult.close);
    }
    if (hasRazorDirective && hasNonRazorLine) {
      return true;
    }
  }

  return false;
}

function formatRawLineContent(rest: string): string {
  const trimmed = rest.trimStart();
  const switchMatch = trimmed.match(/^switch\s*\((.*)\)\s*\{\s*$/);
  if (switchMatch) {
    const inner = switchMatch[1].trim();
    return 'switch (' + inner + ') {';
  }
  return rest;
}

function insertSwitchBlankLines(
  lines: string[],
  rawLineMeta: Array<RawLineMeta | null>
): { lines: string[]; insertedBlankLines: boolean } {
  const result: string[] = [];
  let insertedBlankLines = false;
  let inRaw = false;
  let prevRawBreak = false;
  let prevRawLineBlank = false;

  for (let i = 0; i < lines.length; i += 1) {
    const meta = rawLineMeta[i];
    if (!meta || !meta.isRawBlock) {
      inRaw = false;
      prevRawBreak = false;
      prevRawLineBlank = false;
      result.push(lines[i]);
      continue;
    }

    if (!inRaw) {
      inRaw = true;
      prevRawBreak = false;
      prevRawLineBlank = false;
    }

    if (meta.isCaseOrDefault && prevRawBreak && !prevRawLineBlank) {
      const razorPrefixMatch = lines[i].match(/^(\s*)@:/);
      if (razorPrefixMatch) {
        result.push(`${razorPrefixMatch[1]}@:`);
      } else {
        result.push('');
      }
      insertedBlankLines = true;
    }

    result.push(lines[i]);

    const trimmedLine = lines[i].trim();
    const isBlank = trimmedLine.length === 0 || trimmedLine === '@:';
    prevRawLineBlank = isBlank;
    if (!isBlank) {
      prevRawBreak = meta.isBreak;
    }
  }

  return { lines: result, insertedBlankLines };
}

function makeRazorTextIndentedLine(rest: string, indentWidth: number, contentIndentWidth: number): string {
  const match = rest.match(/^@:([\s]*)(.*)$/);
  if (!match) {
    return makeIndentedLine(rest, indentWidth);
  }
  const content = match[2];
  const lineIndent = indentWidth > 0 ? ' '.repeat(indentWidth) : '';
  if (content.length === 0) {
    return `${lineIndent}@:`;
  }
  return `${lineIndent}@: ${' '.repeat(contentIndentWidth)}${content.trimStart()}`;
}

function makeIndentedLine(rest: string, indentWidth: number): string {
  if (indentWidth <= 0) {
    return rest;
  }
  return `${' '.repeat(indentWidth)}${rest}`;
}

function validateOutput(
  lineInfos: LineInfo[],
  outputLines: string[],
  allowBlankLineInsert: boolean
): { ok: boolean; message: string } {
  const originalLines = lineInfos.map((info) => info.original);
  if (!allowBlankLineInsert && originalLines.length !== outputLines.length) {
    return { ok: false, message: 'Validation failed: line count changed.' };
  }

  const changedLines: string[] = [];
  let originalIndex = 0;
  let outputIndex = 0;

  while (originalIndex < originalLines.length && outputIndex < outputLines.length) {
    const outputLine = outputLines[outputIndex];
    const trimmedOutput = outputLine.trim();
    if (allowBlankLineInsert && (trimmedOutput.length === 0 || trimmedOutput === '@:')) {
      const originalLine = originalLines[originalIndex] ?? '';
      const trimmedOriginal = originalLine.trim();
      if (trimmedOriginal.length === 0 || trimmedOriginal === '@:') {
        originalIndex += 1;
        outputIndex += 1;
      } else {
        outputIndex += 1;
      }
      continue;
    }

    const original = normalizeForValidation(originalLines[originalIndex]);
    const formatted = normalizeForValidation(outputLine);
    if (original !== formatted) {
      changedLines.push(String(originalIndex + 1));
    }
    originalIndex += 1;
    outputIndex += 1;
  }

  if (originalIndex < originalLines.length) {
    for (let i = originalIndex; i < originalLines.length; i += 1) {
      changedLines.push(String(i + 1));
    }
  }

  if (!allowBlankLineInsert) {
    if (outputIndex < outputLines.length) {
      return { ok: false, message: 'Validation failed: line count changed.' };
    }
  } else {
    for (let i = outputIndex; i < outputLines.length; i += 1) {
      const trimmed = outputLines[i].trim();
      if (trimmed.length > 0 && trimmed !== '@:') {
        changedLines.push(String(originalLines.length));
        break;
      }
    }
  }

  if (changedLines.length > 0) {
    return {
      ok: false,
      message: `Validation failed: non-indentation content changed on line(s) ${changedLines.join(', ' )}.`
    };
  }

  return { ok: true, message: '' };
}
function normalizeForValidation(line: string): string {
  let normalized = line.replace(/^\s*/, '');
  if (normalized.startsWith('@:')) {
    normalized = normalized.replace(/^@:\s*/, '@:');
  }
  normalized = normalizeSwitchSpacing(normalized);
  return normalized;
}
function normalizeSwitchSpacing(line: string): string {
  const match = line.match(/^switch\s*\((.*)\)\s*\{\s*$/);
  if (!match) {
    return line;
  }
  const inner = match[1].trim();
  return 'switch (' + inner + ') {';
}

function countLeadingBraceClosings(trimmed: string): number {
  let rest = trimmed;
  const razorTextMatch = rest.match(/^@:\s*/);
  if (razorTextMatch) {
    rest = rest.slice(razorTextMatch[0].length);
  }

  let count = 0;
  let index = 0;
  while (index < rest.length) {
    const char = rest[index];
    if (char === '}') {
      count += 1;
      index += 1;
      continue;
    }
    break;
  }
  return count;
}

function countBraces(
  line: string,
  inBlockComment: boolean
): { open: number; close: number; inBlockComment: boolean } {
  let open = 0;
  let close = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1] ?? '';

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) {
      if (char === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (char === '/' && next === '/') {
        break;
      }
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\\\' && (inSingle || inDouble || inTemplate)) {
      escaped = true;
      continue;
    }

    if (!inDouble && !inTemplate && char === '\'') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '\"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      continue;
    }

    if (char === '{') {
      open += 1;
    } else if (char === '}') {
      close += 1;
    }
  }

  return { open, close, inBlockComment };
}

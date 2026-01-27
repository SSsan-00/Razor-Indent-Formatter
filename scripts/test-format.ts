import { formatText } from '../src/formatter';

type TestCase = {
  name: string;
  input: string;
  expected?: string;
  allowLineChange?: boolean;
  allowContentChange?: boolean;
};

function normalizeForComparison(line: string): string {
  let normalized = line.replace(/^\s*/, '');
  if (normalized.startsWith('@:')) {
    normalized = normalized.replace(/^@:\s*/, '@:');
  }
  return normalized;
}

const tests: TestCase[] = [
  {
    name: 'line count and content preserved',
    input: `<div>\n  <span>Test</span>\n</div>`
  },
  {
    name: '<text> block idempotence',
    input: `<div>\n  <text>\n        <span>Inner</span>\n    Text line\n  </text>\n</div>`
  },
  {
    name: '<text> JS indentation',
    input: `<text>\n    function test() {\nconsole.log("test");\n}\n</text>`,
    expected: `<text>\n    function test() {\n        console.log("test");\n    }\n</text>`
  },
  {
    name: 'script block with switch',
    input: `<script>\nswitch(mode){\ncase "A":\nconsole.log("mode A");\nbreak;\n  case "B":\nconsole.log("mode B");\nbreak;\ndefault:\n console.log("default");\nbreak;\n}\n</script>`,
    expected: `<script>\nswitch (mode) {\n    case "A":\n        console.log("mode A");\n        break;\n\n    case "B":\n        console.log("mode B");\n        break;\n\n    default:\n        console.log("default");\n        break;\n}\n</script>`,
    allowLineChange: true,
    allowContentChange: true
  },
  {
    name: 'script block with Razor code block',
    input: `<script>\n@{\nvar count = 3;\nvar isEnabled = true;\n}\n</script>`,
    expected: `<script>\n@{\n    var count = 3;\n    var isEnabled = true;\n}\n</script>`
  },
  {
    name: 'script block with Razor text lines',
    input: `<script>\n@{\nvar count = 3;\nvar isEnabled = true;\n}\n\n@: if (@(isEnabled.ToString().ToLower()))\n@:\n@: {\n@: console.log("enabled");\n@: }\n\n@: for (let i = 0; i < @count; i++)\n@:\n@: {\n@: console.log(i);\n@: }\n</script>`,
    expected: `<script>\n@{\n    var count = 3;\n    var isEnabled = true;\n}\n\n@: if (@(isEnabled.ToString().ToLower()))\n@:\n@: {\n@:     console.log("enabled");\n@: }\n\n@: for (let i = 0; i < @count; i++)\n@:\n@: {\n@:     console.log(i);\n@: }\n</script>`
  },
  {
    name: 'mixed Razor + text blocks',
    input: `@page\n@model SampleApp.Pages.MixedTextTagModel\n@{\nViewData["Title"]="Razor messy <text> + @:";\n  var users=Model.Users;\n}\n\n<h1>@ViewData["Title"]</h1>\n@if(users!=null){\n<ul>\n @foreach(var u in users){\n<li>\n<text>\nユーザー:\n</text>\n@u.Name\n@if(u.IsAdmin){\n<text>\n(Admin)\n</text>\n }else{\n@: (User)\n }\n@if(u.Tags!=null && u.Tags.Count>0){\n<text>\nTags:\n</text>\n @foreach(var t in u.Tags){\n<text>\n[\n</text>\n@t\n<text>\n]\n</text>\n }\n}else{\n@: Tags: none\n}\n</li>\n}\n</ul>\n}else{\n<p>\n<text>\nNo users\n</text>\n</p>\n}\n\n<p>\n@{\n var prefix="ID:";\n}\n<text>\n@prefix\n</text>\n@Model.Id\n</p>\n\n@section Scripts{\n<script>\n function logUser(name){\nif(name){\n console.log("user:"+name);\n}else{\nconsole.log("no name");\n}}\n</script>\n}`,
    expected: `@page\n@model SampleApp.Pages.MixedTextTagModel\n@{\n    ViewData["Title"]="Razor messy <text> + @:";\n    var users=Model.Users;\n}\n\n<h1>@ViewData["Title"]</h1>\n@if(users!=null){\n    <ul>\n        @foreach(var u in users){\n            <li>\n                <text>\n                    ユーザー:\n                </text>\n                @u.Name\n                @if(u.IsAdmin){\n                    <text>\n                        (Admin)\n                    </text>\n                }else{\n                    @: (User)\n                }\n                @if(u.Tags!=null && u.Tags.Count>0){\n                    <text>\n                        Tags:\n                    </text>\n                    @foreach(var t in u.Tags){\n                        <text>\n                            [\n                        </text>\n                        @t\n                        <text>\n                            ]\n                        </text>\n                    }\n                }else{\n                    @: Tags: none\n                }\n            </li>\n        }\n    </ul>\n}else{\n    <p>\n        <text>\n            No users\n        </text>\n    </p>\n}\n\n<p>\n    @{\n        var prefix="ID:";\n    }\n    <text>\n        @prefix\n    </text>\n    @Model.Id\n</p>\n\n@section Scripts{\n    <script>\n        function logUser(name){\n            if(name){\n                console.log("user:"+name);\n            }else{\n                console.log("no name");\n            }}\n    </script>\n}`
  }
];

for (const test of tests) {
  const first = formatText(test.input, { indentSize: 2, adjustTextBlocks: true });
  if (first.error) {
    throw new Error(`Test "${test.name}" failed: ${first.error}`);
  }

  const firstLines = test.input.split(/\r\n|\n/);
  const outputLines = first.output.split(/\r\n|\n/);

  if (!test.allowLineChange) {
    if (firstLines.length !== outputLines.length) {
      throw new Error(`Test "${test.name}" failed: line count changed.`);
    }
  }

  if (!test.allowContentChange) {
    const limit = Math.min(firstLines.length, outputLines.length);
    for (let i = 0; i < limit; i += 1) {
      const original = normalizeForComparison(firstLines[i]);
      const formatted = normalizeForComparison(outputLines[i]);
      if (original !== formatted) {
        throw new Error(`Test "${test.name}" failed: content changed on line ${i + 1}.`);
      }
    }
  }

  if (test.expected) {
    const expected = formatText(test.input, { indentSize: 4, adjustTextBlocks: true });
    if (expected.error) {
      throw new Error(`Test "${test.name}" failed: ${expected.error}`);
    }
    if (expected.output !== test.expected) {
      throw new Error(`Test "${test.name}" failed: output mismatch.`);
    }
  }

  if (test.name === '<text> block idempotence') {
    const second = formatText(first.output, { indentSize: 2, adjustTextBlocks: true });
    if (second.error) {
      throw new Error(`Test "${test.name}" failed on second pass: ${second.error}`);
    }
    if (first.output !== second.output) {
      throw new Error(`Test "${test.name}" failed: formatter is not idempotent.`);
    }
  }
}

console.log('All formatter tests passed.');

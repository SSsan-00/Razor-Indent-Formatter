import { formatText } from '../src/formatter';

type TestCase = {
  name: string;
  input: string;
  expected?: string;
};

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

  if (firstLines.length !== outputLines.length) {
    throw new Error(`Test "${test.name}" failed: line count changed.`);
  }

  for (let i = 0; i < firstLines.length; i += 1) {
    const original = firstLines[i].replace(/^\s*/, '');
    const formatted = outputLines[i].replace(/^\s*/, '');
    if (original !== formatted) {
      throw new Error(`Test "${test.name}" failed: content changed on line ${i + 1}.`);
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

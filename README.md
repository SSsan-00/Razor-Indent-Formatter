# Razor Indent Formatter

改行構造を基本的に変えず、行頭インデントだけを整えるオフラインフォーマッタです。Razor / HTML / JS が混在しても安全側で動作します。

## 使い方

```bash
pnpm install
pnpm dev
```

- 左側に入力を貼り付け、`Format` を押すと右側に整形結果が出ます。
- `Copy Output` で結果をコピーできます。
- `Right → Left` で出力を再入力に戻せます。
- インデント幅は 4 固定です。
- `&lt;text&gt;` 内はブレース構造に合わせてインデントを調整します。
- switch/case の可読性向上のため、case 間に空行を挿入します（Razor text は `@:` 行を挿入）。
- ドラッグ&ドロップ時に UTF-8 / Shift-JIS / EUC-JP を判定して文字化けを避けます。

## ビルド (単一HTML)

```bash
pnpm build:single
pnpm verify:single
```

`dist/index.html` 1本のみが生成されます。

## テスト

```bash
pnpm test
```

- 行数不変
- 行頭以外不変
- &lt;text&gt; ブロックの冪等性
- switch/case のインデントと空行挿入
- Razor text 行内の switch/case も整形対象

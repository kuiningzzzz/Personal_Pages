import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { parseMarkdownHtml } from '../../src/lib/markdown.js';

test('中文标点紧贴正文时双星号仍能加粗，不需要手动添加空格', () => {
    const cases = [
        ['**注意：**这段话', '<strong>注意：</strong>这段话'],
        ['这是**（重要）**内容', '这是<strong>（重要）</strong>内容'],
        ['这是**“重要”**内容', '这是<strong>“重要”</strong>内容'],
        ['**关键概念（Key）**的解释', '<strong>关键概念（Key）</strong>的解释'],
        ['**概念 (Concept)**的解释', '<strong>概念 (Concept)</strong>的解释'],
        ['这是**“甲”**与**“乙”**内容', '这是<strong>“甲”</strong>与<strong>“乙”</strong>内容'],
        ['**（😀）**内容', '<strong>（😀）</strong>内容'],
        ['**[资料](/source/lesson.pdf)：**继续阅读', '<strong><a href="/source/lesson.pdf">资料</a>：</strong>继续阅读']
    ];
    for (const [source, expected] of cases) assert.equal(parseMarkdownHtml(source), `<p>${expected}</p>\n`, source);
});

test('中文加粗内部的斜体、划去、代码和链接继续按 Markdown 解析', () => {
    assert.equal(parseMarkdownHtml('**中文 *斜体*：**接着'), '<p><strong>中文 <em>斜体</em>：</strong>接着</p>\n');
    assert.equal(parseMarkdownHtml('**中文 ~~删除~~：**接着'), '<p><strong>中文 <del>删除</del>：</strong>接着</p>\n');
    assert.equal(parseMarkdownHtml('**中文 `a ** b`：**接着'), '<p><strong>中文 <code>a ** b</code>：</strong>接着</p>\n');
    assert.equal(parseMarkdownHtml('**中文 [示例](/source/a**b.pdf)：**接着'), '<p><strong>中文 <a href="/source/a**b.pdf">示例</a>：</strong>接着</p>\n');
    assert.equal(parseMarkdownHtml('![说明 **注意：**内容](/picture/example.png)'), '<p><img src="/picture/example.png" alt="说明 注意：内容"></p>\n');
});

test('截图中的英文术语和双星号内的意外空格也能加粗', () => {
    const cases = [
        ['与「** inflationary**（输出不小于输入）', '与「<strong>inflationary</strong>（输出不小于输入）'],
        ['与「**inflationary**（输出不小于输入）', '与「<strong>inflationary</strong>（输出不小于输入）'],
        ['** 单调框架**：半格三公理', '<strong>单调框架</strong>：半格三公理'],
        ['**注意： **内容', '<strong>注意：</strong>内容'],
        ['**  关键概念  **解释', '<strong>关键概念</strong>解释'],
        ['**\u00a0inflationary\u00a0**', '<strong>inflationary</strong>'],
        ['** padded *emphasis* **', '<strong>padded <em>emphasis</em></strong>'],
        ['** 甲 **和** 乙 **', '<strong>甲</strong>和<strong>乙</strong>'],
        ['** 甲 `**原样**`： **正文', '<strong>甲 <code>**原样**</code>：</strong>正文'],
        ['基于课件的完整学习报告。上半部分抽象为**单调框架**：半格三公理。', '基于课件的完整学习报告。上半部分抽象为<strong>单调框架</strong>：半格三公理。']
    ];
    for (const [source, expected] of cases) assert.equal(parseMarkdownHtml(source), `<p>${expected}</p>\n`, source);
});

test('代码块、行内代码、转义星号、不完整标记及空白加粗保持字面含义', () => {
    const cases = [
        '```markdown\n**注意：**内容\n```',
        '    **注意：**内容',
        '`**（重要）**`',
        String.raw`\*\*（字面量）\*\*`,
        String.raw`**注意：\*\*后面的文字`,
        '`** inflationary**`',
        '```markdown\n** inflationary**\n```',
        String.raw`\*\* inflationary\*\*`,
        '** **',
        '**\t**',
        '**\n词语**',
        '**注意：内容',
        '[资料](/source/**资料**.pdf)'
    ];
    for (const source of cases) assert.equal(parseMarkdownHtml(source), marked.parse(source, { gfm: true, breaks: true }), source);
});

test('标准加粗、嵌套强调、英文标点、标题、表格、列表保持原有渲染', () => {
    const cases = [
        '这是**普通加粗**文本与 __另一处加粗__。',
        '***加粗斜体***、**加粗 *斜体* 内容**、*斜体 **加粗** 内容*',
        '**word:**text',
        '# 标题\n\n- **加粗**\n- ~~划去~~\n\n第一行\n第二行',
        '| 名称 | 说明 |\n| --- | --- |\n| **内容** | 描述 |',
        '> **引用**\n\n---\n\n[链接](https://example.com/)'
    ];
    for (const source of cases) assert.equal(parseMarkdownHtml(source), marked.parse(source, { gfm: true, breaks: true }), source);
});

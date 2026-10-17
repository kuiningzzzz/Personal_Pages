import test from 'node:test';
import assert from 'node:assert/strict';
import { countMarkdownCharacters, documentWordCount } from '../document-word-count.js';

test('正文按可见 Unicode 字符计数，排除空白、排版标记、图片及链接地址', () => {
    const cases = [
        ['', 0], [' \n\t', 0], ['你好，世界！', 6], ['Hello world', 10], ['甲 😀 乙', 3],
        ['# 标题\n\n**正文**', 4], ['++下划线++、*斜体*和~~删除~~', 9],
        ['[学习资料](https://example.com/a-very-long-path.pdf)', 4],
        ['![图片说明不作为正文](/picture/long-image-name.png)', 0],
        ['[资料][source]\n\n[source]: https://example.com/long-source-url', 2],
        ['- 甲\n- **乙**', 2], ['> 引用\n\n~~删除~~', 4],
        ['| 姓名 | 分数 |\n| --- | --- |\n| 小明 | 100 |', 9],
        ['<p>正文 &amp; &#x1F600; &nbsp; <u>下划线</u></p>', 7],
        ['<span title="a > b">正文</span><!-- 不可见的注释 -->', 2],
        ['<script>不显示的脚本</script>\n\n<style>不可见样式</style>\n\n正文', 2],
        ['** 单调框架**：半格三公理', 10],
        ['与「** inflationary**（输出不小于输入）', [...'与「inflationary（输出不小于输入）'].length],
    ];
    for (const [source, expected] of cases) assert.equal(countMarkdownCharacters(source), expected, source);
});

test('代码保留字面内容，字符实体只解码一次，不把代码中的标签当成 HTML', () => {
    assert.equal(countMarkdownCharacters('`**字**`'), 5);
    assert.equal(countMarkdownCharacters('```html\n<script>字</script>\n```'), '<script>字</script>'.length);
    assert.equal(countMarkdownCharacters('`&amp;`'), 5);
    assert.equal(countMarkdownCharacters('`a < b && c > d`'), 'a<b&&c>d'.length);
    assert.equal(countMarkdownCharacters('&#x1F600;'), 1);
});

test('仅资源库文档提供字数，标题、摘要和按钮文案不计入正文', () => {
    const entry = { kind: 'resource', resource_kind: 'document', title: '标题', summary: '不计入的摘要', body: '**正文**', actions: [{ label: '下载附件', url: 'https://example.com' }] };
    assert.deepEqual(documentWordCount(entry), { word_count: 2 });
    assert.deepEqual(documentWordCount({ ...entry, body: '' }), { word_count: 0 });
    for (const kind of ['collection', 'gallery', 'video']) assert.deepEqual(documentWordCount({ ...entry, resource_kind: kind }), {});
    assert.deepEqual(documentWordCount({ ...entry, kind: 'moment' }), {});
});

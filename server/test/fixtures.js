export function samplePdf() {
    const content = 'BT /F1 20 Tf 50 730 Td (Gradient Descent) Tj 0 -36 Td /F1 13 Tf (f(x) = x squared. Derivative: 2x.) Tj 0 -24 Td (Update: x_next = x - learning_rate * 2x.) Tj 0 -24 Td (Learning rate controls convergence speed.) Tj ET 0.2 0.5 0.9 rg 50 400 180 180 re f';
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
    ];
    let output = '%PDF-1.4\n'; const offsets = [0];
    for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; }
    const xref = Buffer.byteLength(output);
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10,'0')} 00000 n \n`).join('');
    output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(output);
}

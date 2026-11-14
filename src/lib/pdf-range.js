// Use explicit range requests even for initialization. A regular URL-based
// PDF.js load starts a full GET before it discovers range support.
export async function rangedPdfTask(pdfjs, url, { signal, onRangeError = () => {} } = {}) {
  const head = await fetch(url, { method: 'HEAD', signal })
  const length = Number(head.headers.get('Content-Length'))
  if (!head.ok || !Number.isSafeInteger(length) || length < 5 || head.headers.get('Accept-Ranges') !== 'bytes') throw new Error('无法获取 PDF 大小或服务器不支持分段预览。')
  let initializing = true, initializationBytes = 0
  async function range(begin, end) {
    // Broken xrefs can make PDF.js fall back to scanning every byte. Stop that
    // recovery path for large files instead of quietly downloading the book.
    if (initializing && (initializationBytes += end - begin) > 32 * 1024 * 1024) throw new Error('PDF 索引读取超过 32 MB，已停止预览以避免全量扫描。请下载查看或重新导出此 PDF。')
    const response = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, signal })
    if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${begin}-${end - 1}/${length}`) {
      await response.body?.cancel(); throw new Error('服务器未正确支持分段请求，已停止预览以避免下载整个文件。')
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length !== end - begin) throw new Error('PDF 分段数据不完整，请重试。')
    return bytes
  }
  const initial = await range(0, Math.min(length, 65536))
  const transport = new pdfjs.PDFDataRangeTransport(length, initial, true)
  let aborted = false
  transport.requestDataRange = (begin, end) => {
    range(begin, end).then(bytes => { if (!aborted) transport.onDataRange(begin, bytes) }).catch(cause => { if (!aborted) onRangeError(cause) })
  }
  transport.abort = () => { aborted = true }
  const task = pdfjs.getDocument({ range: transport, length, disableStream: true, disableAutoFetch: true, rangeChunkSize: 65536, isEvalSupported: false,
    cMapUrl: '/pdf-assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/' })
  task.promise.then(() => { initializing = false }, () => {})
  return task
}

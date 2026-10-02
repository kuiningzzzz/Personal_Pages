export async function commentsRequest(path, method = 'GET', body) {
  let response
  try {
    response = await fetch(`/api/comments${path}`, { method, credentials: 'same-origin', cache: 'no-store',
      ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }) })
  } catch { throw new Error('暂时连接不到网站，请稍后再试') }
  const result = await response.json().catch(() => ({ message: '评论服务暂时不可用' }))
  if (!response.ok || !result.success) {
    const error = new Error(result.message || '操作失败')
    error.status = response.status
    throw error
  }
  return result
}

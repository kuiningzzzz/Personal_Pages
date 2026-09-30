export const resourceLabel = entry => ({ collection: '合集', gallery: '图集', document: '文档' }[entry.resource_kind] || '文档')
export const entryPath = entry => entry.kind === 'resource' && entry.resource_kind === 'collection'
  ? `/resource/collection/${entry.id}`
  : entry.kind === 'resource' && entry.resource_kind === 'gallery' ? `/resource/gallery/${entry.id}` : `/entry/${entry.id}`

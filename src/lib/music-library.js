export function searchSongs(playlists, query) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return playlists.flatMap(playlist => playlist.tracks.flatMap((track, index) => {
    const text = `${track.title} ${track.artist || ''} ${playlist.title}`.toLocaleLowerCase()
    return words.every(word => text.includes(word)) ? [{ playlistId: playlist.id, playlistTitle: playlist.title, track, index }] : []
  }))
}

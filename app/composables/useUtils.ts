export function useDownloadJson() {
  function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
  }
  return { downloadJson }
}

export function useLogStyle() {
  function formatLogTime(ts: string) {
    try { return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return ts }
  }

  function logColor(level: string) {
    return level === 'error' ? '#f48771' : level === 'warn' ? '#dcdcaa' : '#d4d4d4'
  }

  function logLevelColor(level: string) {
    return level === 'error' ? '#f44747' : level === 'warn' ? '#ce9178' : '#4ec9b0'
  }

  return { formatLogTime, logColor, logLevelColor }
}

// Location is requested by the trusted parent, never by the opaque activity frame.
const failure = (message, code = 2, status = 503) => Object.assign(new Error(message), { code, status })

export function locationOptions(options = {}) {
  options = options && typeof options === 'object' ? options : {}
  const bounded = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
  return {
    enableHighAccuracy: options.enableHighAccuracy === true,
    timeout: bounded(options.timeout, 15000, 1000, 20000),
    maximumAge: bounded(options.maximumAge, 60000, 0, 300000)
  }
}

function cancellable(signal, timeout, message, work) {
  return new Promise((resolve, reject) => {
    let complete = false, timer
    const finish = (fn, value) => {
      if (complete) return
      complete = true; clearTimeout(timer); signal.removeEventListener('abort', abort); fn(value)
    }
    const abort = () => finish(reject, failure('活动页面已切换，请重新点击定位', 2, 499))
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => finish(reject, failure(message, 3, 408)), timeout)
    try { work(value => finish(resolve, value), error => finish(reject, error)) }
    catch { finish(reject, failure('无法发起定位，请手动选择城市')) }
  })
}

export function createActivityGeolocation({ geolocation, secureContext, allowsFeature = () => true, confirm }) {
  let authorized = false, pending = null, controller = new AbortController(), disposed = false
  async function run(rawOptions, signal) {
    if (disposed || signal.aborted) throw failure('活动页面已关闭', 2, 499)
    if (!secureContext) throw failure('定位需要 HTTPS 或本机 localhost，请使用主站 HTTPS 地址打开', 1, 403)
    if (!geolocation?.getCurrentPosition) throw failure('当前浏览器不支持定位，可手动选择城市', 2, 501)
    if (!allowsFeature()) throw failure('主站页面的权限策略禁止定位，请联系站点管理员', 1, 403)
    if (!authorized) {
      const accepted = await cancellable(signal, 30000, '定位确认超时，请重新点击定位', (resolve, reject) => Promise.resolve(confirm()).then(resolve, reject))
      if (!accepted) throw failure('已取消向本活动提供位置，可手动选择城市', 1, 403)
      if (signal.aborted) throw failure('活动页面已切换', 2, 499)
      authorized = true
    }
    const options = locationOptions(rawOptions)
    return cancellable(signal, options.timeout, '定位超时，请重试或手动选择城市', (resolve, reject) => {
      geolocation.getCurrentPosition(position => {
        const { latitude, longitude, accuracy } = position?.coords || {}
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(accuracy) || accuracy < 0) {
          reject(failure('浏览器未返回有效位置，请重试或手动选择城市')); return
        }
        resolve({ coords: { latitude, longitude, accuracy }, timestamp: Number.isFinite(position.timestamp) ? position.timestamp : Date.now() })
      }, error => {
        if (error?.code === 1) reject(failure('主站定位权限未获允许，请检查浏览器及系统的位置权限', 1, 403))
        else if (error?.code === 3) reject(failure('定位超时，请重试或手动选择城市', 3, 408))
        else reject(failure('暂时无法获取位置，请检查系统定位服务或手动选择城市'))
      }, options)
    })
  }
  return {
    getCurrentPosition(options) {
      if (!pending) {
        const job = run(options, controller.signal).finally(() => { if (pending === job) pending = null })
        pending = job
      }
      return pending
    },
    reset() { authorized = false; controller.abort(); controller = new AbortController(); pending = null },
    dispose() { disposed = true; controller.abort(); authorized = false; pending = null }
  }
}

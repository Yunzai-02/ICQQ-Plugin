/** 默认重连参数 */
const DEFAULTS = {
	enable: true,
	/** 被踢下线时是否自动重连 */
	kickoff: true,
	/** 首次重连等待秒数，之后指数递增 */
	interval: 5,
	/** 重连等待上限秒数 */
	max_interval: 300,
	/** 主动重连次数上限，0 为不限 */
	max_attempts: 0
}

/** 登录或 icqq 内部重试卡死多久后接管重连 */
const LOGIN_TIMEOUT = 120000

/** 修正数值配置，非法时回退默认值 */
function toNumber(value, fallback, min = 0, max = Infinity) {
	const num = Number(value)
	return Number.isFinite(num) && num >= min ? Math.min(num, max) : fallback
}

/** 包装 login 跟踪登录状态，避免与 icqq 内部重试并发 */
function trackLogin(bot) {
	const login = bot.login.bind(bot)
	const state = { pending: 0, started: 0 }
	bot.login = (...args) => {
		state.pending++
		state.started = Date.now()
		return Promise.resolve(login(...args)).finally(() => state.pending--)
	}
	return state
}

/**
 * 掉线自动重连
 * icqq 自身会重试网络错误，这里兜底被踢下线、内部重试中断等情况
 */
export function setupReconnect(bot, { id, password, notify, options } = {}) {
	/** 支持 reconnect: false 直接关闭 */
	const conf = options === false ? { enable: false } : options || {}
	const interval = toNumber(conf.interval, DEFAULTS.interval, 1)
	const opt = {
		enable: conf.enable !== false,
		kickoff: conf.kickoff !== false,
		interval,
		max_interval: Math.max(toNumber(conf.max_interval, DEFAULTS.max_interval, 1), interval),
		max_attempts: Math.floor(toNumber(conf.max_attempts, DEFAULTS.max_attempts, 0))
	}
	const state = {
		attempts: 0,
		timer: null,
		offline: false,
		paused: false,
		stopped: false,
		/** 最近一次下线原因 */
		cause: '',
		/** icqq 内部重试定时器及其首次出现时间 */
		retry_timer: null,
		retry_timer_at: 0
	}
	const login = trackLogin(bot)

	/** 记录下线原因，icqq 会先发具体事件再冒泡到 system.offline */
	for (const cause of ['kickoff', 'network'])
		bot.on(`system.offline.${cause}`, () => {
			state.cause = cause
		})

	const log = (level, ...msg) => Bot.makeLog(level, msg, id)

	function status(event) {
		if (typeof notify !== 'function') return
		try {
			notify(event)
		} catch (err) {
			log('error', '发送状态通知错误', err)
		}
	}

	/** 指数退避的重连间隔（秒） */
	function delay() {
		return Math.min(opt.interval * 2 ** Math.max(state.attempts - 1, 0), opt.max_interval)
	}

	function clear() {
		if (state.timer) clearTimeout(state.timer)
		state.timer = null
	}

	function schedule(seconds) {
		clear()
		state.timer = setTimeout(check, (seconds ?? delay()) * 1000)
		state.timer.unref?.()
	}

	/** 停止重连，等待下一次上线重置 */
	function stop(reason) {
		clear()
		state.stopped = true
		state.offline = false
		if (reason) log('warn', `已停止自动重连：${reason}`)
	}

	/** icqq 内部是否仍在重试 */
	function retrying() {
		const timer = bot.login_timer
		if (timer) {
			if (timer !== state.retry_timer) {
				state.retry_timer = timer
				state.retry_timer_at = Date.now()
				return true
			}
			if (Date.now() - state.retry_timer_at < LOGIN_TIMEOUT) return true
		} else state.retry_timer = null
		return login.pending > 0 && Date.now() - login.started < LOGIN_TIMEOUT
	}

	function check() {
		state.timer = null
		if (!state.offline || state.stopped) return
		if (bot.isOnline()) return online()
		if (state.paused) return
		if (retrying()) return schedule(opt.interval)

		if (opt.max_attempts && state.attempts >= opt.max_attempts) {
			log('error', `自动重连失败，已达最大次数 ${opt.max_attempts}`)
			stop()
			status({ type: 'failed', id })
			return
		}

		state.attempts++
		log('mark', `账号离线，自动重连第 ${state.attempts} 次`)
		Promise.resolve(bot.login(id, password)).catch((err) => log('error', '自动重连错误', err))
		schedule()
	}

	/** 上线成功，重置重连状态 */
	function online() {
		const reconnected = state.attempts > 0
		clear()
		state.attempts = 0
		state.offline = false
		state.paused = false
		state.stopped = false
		state.cause = ''
		if (reconnected) status({ type: 'online', id })
		return reconnected
	}

	/**
	 * 处理下线事件
	 * @returns {'auto'|'manual'|'silent'} 自动重连 / 提示手动上线 / 无需提示
	 */
	function offline(message) {
		const cause = state.cause
		state.cause = ''
		if (message === '主动下线') {
			stop()
			return 'silent'
		}
		if (!opt.enable || state.stopped) return 'manual'
		if (cause === 'kickoff' && !opt.kickoff) return 'manual'
		if (state.paused) return 'silent'
		if (!state.offline) log('warn', `账号离线（${cause || '未知原因'}）：${message || ''}`)
		state.offline = true
		schedule(opt.interval)
		return 'auto'
	}

	/** 需要人工验证，暂停自动重连 */
	function verifying() {
		if (!state.offline || state.paused || state.stopped) return
		state.paused = true
		clear()
		log('warn', '登录需要人工验证，已暂停自动重连')
	}

	/** 登录失败，停止自动重连 */
	function fail(data = {}) {
		if (!state.offline || state.stopped) return
		stop(`登录错误（${data.code ?? ''}）：${data.message || ''}`)
	}

	return { offline, online, verifying, fail, stop }
}

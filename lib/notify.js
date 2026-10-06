/** 默认状态通知合并窗口（秒） */
const DEFAULT_INTERVAL = 10

/** 汇总消息最多展示的账号数量 */
const MAX_IDS = 30

function toSeconds(value, fallback) {
	const num = Number(value)
	return Number.isFinite(num) && num >= 0 ? num : fallback
}

function retry(id) {
	return `发送 #Bot上线${id} 重新登录`
}

function formatIds(ids) {
	const shown = ids.slice(0, MAX_IDS)
	const text = shown.join('、')
	return ids.length > shown.length ? `${text} 等 ${ids.length} 个` : text
}

/** 将单条状态格式化为原有提示 */
export function formatStatus(event) {
	if (typeof event === 'string') return event
	const { id } = event
	switch (event.type) {
		case 'offline':
			return `[${id}] 账号下线：${event.detail || '未知原因'}\n${
				event.auto ? '正在自动重连' : retry(id)
			}`
		case 'online':
			return `[${id}] 断线重连成功`
		case 'failed':
			return `[${id}] 自动重连失败\n${retry(id)}`
		case 'login_error':
			return `[${id}] 登录错误：${event.message || '未知错误'}(${event.code ?? ''})\n${retry(id)}`
	}
}

function groupKey(event) {
	switch (event.type) {
		case 'offline':
			return `offline:${event.auto ? 1 : 0}:${event.detail || ''}`
		case 'login_error':
			return `login_error:${event.code ?? ''}:${event.message || ''}`
	}
	return event.type
}

function groupTitle(event) {
	switch (event.type) {
		case 'offline':
			return event.auto
				? `账号下线，正在自动重连${event.detail ? `（${event.detail}）` : ''}`
				: `账号下线，需要手动上线${event.detail ? `（${event.detail}）` : ''}`
		case 'online':
			return '断线重连成功'
		case 'failed':
			return '自动重连失败'
		case 'login_error':
			return `登录错误：${event.message || '未知错误'}(${event.code ?? ''})`
	}
}

/** 合并同一时间窗口内的状态通知 */
export function createStatusNotifier(send, options = {}, onError = () => {}) {
	const interval = toSeconds(options?.notify_interval, DEFAULT_INTERVAL) * 1000
	const queue = []
	let timer = null
	let lastSent = 0

	function deliver(events) {
		const text =
			events.length === 1
				? formatStatus(events[0])
				: formatSummary(events)
		if (!text) return
		try {
			Promise.resolve(send(text)).catch(onError)
		} catch (err) {
			onError(err)
		}
	}

	function formatSummary(events) {
		const groups = new Map()
		for (const event of events) {
			const key = groupKey(event)
			if (!key) continue
			if (!groups.has(key)) groups.set(key, { event, ids: new Set() })
			groups.get(key).ids.add(String(event.id ?? '未知'))
		}
		if (!groups.size) return

		const total = new Set(events.map((event) => String(event.id ?? '未知'))).size
		const lines = [`[ICQQ] 账号状态汇总（${total} 个）`]
		for (const { event, ids } of groups.values()) {
			const list = [...ids].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
			lines.push(`${groupTitle(event)}（${list.length}）：${formatIds(list)}`)
		}
		return lines.join('\n')
	}

	function flush() {
		timer = null
		if (!queue.length) return
		const events = queue.splice(0)
		lastSent = Date.now()
		deliver(events)
	}

	function notify(event) {
		if (!event || typeof send !== 'function') return
		if (!interval) return deliver([event])

		const now = Date.now()
		if (!timer && now - lastSent >= interval) {
			lastSent = now
			return deliver([event])
		}

		queue.push(event)
		if (!timer) {
			timer = setTimeout(flush, Math.max(lastSent + interval - now, 0))
			timer.unref?.()
		}
	}

	return { notify }
}

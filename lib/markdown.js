import { isElemType } from './icqq.js'
import { makeButtons } from './button.js'

/** 转义 markdown 中的链接 */
export function markdownText(text) {
	return String(text).replace(
		/https?:\/\/[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?^=%&:/~\+#]*[\w\-\@?^=%&/~\+#])?/g,
		'<$&>'
	)
}

/** 解析 @ 的显示名称 */
export async function resolveAtName(id, pick, elem) {
	if (elem.name || elem.qq === 'all') return elem.name

	let info
	if (typeof pick.pickMember === 'function') info = pick.pickMember(elem.qq).info
	info ||= Bot[id].pickFriend(elem.qq).info
	info ||= await Bot[id].pickUser(elem.qq).getSimpleInfo()

	if (info) elem.name = info.card || info.nickname
	return elem.name
}

/** 构造 markdown 消息（合并转发节点） */
export async function makeMarkdownMsg(id, pick, msg) {
	const messages = []
	const forward = []
	const buttons = []
	let content = ''
	let appid

	for (let elem of Array.isArray(msg) ? msg : [msg]) {
		if (typeof elem === 'object' && elem !== null) elem = { ...elem }
		else elem = { type: 'text', text: elem }

		switch (elem.type) {
			case 'text':
				content += markdownText(elem.text)
				break

			case 'image':
				content += `![图片](${await Bot.fileToUrl(elem.file, elem)})`
				break

			case 'file':
				if (elem.file) elem.file = await Bot.fileToUrl(elem.file, elem)
				content += markdownText(`文件：${elem.file}`)
				break

			case 'at':
				if (elem.qq === 'all') {
					content += '[@全体成员](mqqapi://markdown/mention?at_type=everyone)'
				} else {
					const name = await resolveAtName(id, pick, elem)
					content += `[@${name ? `${name}(${elem.qq})` : elem.qq}](mqqapi://markdown/mention?at_type=1&at_tinyid=${elem.qq})`
				}
				break

			case 'markdown':
				content += elem.data
				break

			case 'button': {
				const built = elem.data
					? makeButtons({ self_id: id, pick, rows: elem.data, forward: true })
					: { rows: elem.content?.rows, appid: elem.content?.appid }
				if (built.rows?.length) buttons.push(...built.rows)
				appid ??= built.appid
				break
			}

			case 'node':
				for (const item of elem.data)
					for (const message of await makeMarkdownMsg(id, pick, item.message))
						forward.push({ user_id: 80000000, nickname: '匿名消息', ...item, ...message })
				break

			case 'raw':
				messages.push([isElemType(elem.data?.type) ? elem.data : elem])
				break

			default:
				if (isElemType(elem.type)) {
					messages.push([elem])
					continue
				}
				content += markdownText(Bot.String(elem))
		}
	}

	if (content) messages.unshift([{ type: 'markdown', content }])
	if (buttons.length) {
		for (const message of messages) {
			if (message[0].type !== 'markdown') continue
			message.push({ type: 'button', content: { appid, rows: buttons.splice(0, 5) } })
			if (!buttons.length) break
		}
		while (buttons.length)
			messages.push([
				{ type: 'markdown', content: ' ' },
				{ type: 'button', content: { appid, rows: buttons.splice(0, 5) } }
			])
	}

	for (const message of messages) forward.push({ type: 'node', message })
	return forward
}

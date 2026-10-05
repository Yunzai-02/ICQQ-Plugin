import { config } from './config.js'
import { isElemType } from './icqq.js'
import { makeButtons } from './button.js'
import { makeMarkdownMsg, resolveAtName } from './markdown.js'

/** 构造普通消息分组 */
export async function makeMsg(id, pick, msg) {
	if (!Array.isArray(msg)) msg = [msg]
	const message = []
	const messages = []
	const forward = []
	let reply

	for (let elem of msg) {
		if (typeof elem === 'object' && elem !== null) {
			switch (elem.type) {
				case 'text':
				case 'image':
				case 'face':
					break

				case 'file':
					await pick.sendFile(elem.file, elem.name)
					continue

				case 'reply':
					reply = elem
					continue

				case 'at':
					await resolveAtName(id, pick, elem)
					if (elem.name && !elem.text) elem.text = `${elem.name}(${elem.qq})`
					break

				case 'markdown':
					forward.push(...(await makeMarkdownMsg(id, pick, msg)))
					continue

				case 'button': {
					if (!config.markdown.button) continue
					const built = elem.data
						? makeButtons({ self_id: id, pick, rows: elem.data, forward: true })
						: { rows: elem.content?.rows, appid: elem.content?.appid }
					if (!built.rows?.length) continue
					const button = { type: 'button', content: { appid: built.appid, rows: built.rows } }
					if (config.markdown.button === 'direct' || config.markdown.mode === 'mix') message.push(button)
					else if (config.markdown.button === 'separate') messages.push([button])
					else return [await makeMarkdownMsg(id, pick, msg)]
					continue
				}

				case 'node':
					for (const item of elem.data)
						for (const m of await makeMsg(id, pick, item.message))
							forward.push({ user_id: 80000000, nickname: '匿名消息', ...item, type: 'node', message: m })
					continue

				case 'raw':
					if (isElemType(elem.data?.type)) elem = elem.data
					break

				case 'long_msg':
					if (msg.length > 1) continue
					break

				default:
					if (isElemType(elem.type)) {
						messages.push([elem])
						continue
					}
					elem = Bot.String(elem)
			}
		}
		message.push(elem)
	}

	if (message.length) messages.push(message)
	if (forward.length) messages.push(forward)
	if (reply) for (const m of messages) m.unshift(reply)
	return messages
}

/** 按配置构造待发送消息 */
async function buildMsg(id, pick, msg) {
	switch (config.markdown.mode) {
		case 'mix':
			return [...(await makeMsg(id, pick, msg)), ...(await makeMarkdownMsg(id, pick, msg))]
		case false:
			return makeMsg(id, pick, msg)
		default:
			return makeMarkdownMsg(id, pick, msg)
	}
}

/** 发送消息，失败只记录错误 */
export async function sendMsg(id, pick, msg, ...args) {
	const result = { message_id: [], data: [], error: [] }

	for (const i of await buildMsg(id, pick, msg)) {
		try {
			Bot.makeLog('debug', ['发送消息', i], id)
			const ret = await pick.sendMsg(i, ...args)
			Bot.makeLog('debug', ['发送消息返回', ret], id)
			result.data.push(ret)
			if (ret?.message_id) result.message_id.push(ret.message_id)
		} catch (err) {
			Bot.makeLog('error', ['发送消息错误', i, err], id)
			result.error.push(err)
			break
		}
	}

	return result.data.length === 1 ? result.data[0] : result
}

/** 撤回一条或多条消息 */
export async function recallMsg(id, pick, message_id) {
	Bot.makeLog('info', `撤回消息：${message_id}`, id)
	const ids = Array.isArray(message_id) ? message_id : [message_id]
	return Promise.all(ids.map((i) => pick.recallMsg(i)))
}

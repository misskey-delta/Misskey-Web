import * as redis from 'redis';
import * as SocketIO from 'socket.io';
import * as cookie from 'cookie';
import requestApi from '../../../../utils/request-api';
import config from '../../../../config';

interface MKSocketIOSocket extends SocketIO.Socket {
	user: any;
}

module.exports = (io: SocketIO.Server, sessionStore: any) => {
	io.of('/streaming/sites/desktop/home').on('connection', (socket: MKSocketIOSocket) => {
		// Get cookies
		const cookies: { [key: string]: string } = cookie.parse(socket.handshake.headers.cookie);

		// Get sesson key
		const sid: string = cookies[config.sessionKey];
		const sidkey: string = sid.match(/s:(.+?)\./)[1];

		// Resolve session
		sessionStore.get(sidkey, (err: any, session: any) => {
			if (err !== null) {
				return console.error(err);
			} else if (session === null) {
				return;
			}

			// Get user
			socket.user = session.user;

			// Connect to Redis
			const subscriber: redis.RedisClient = redis.createClient(
				6379, config.redisServerHost, <redis.ClientOpts>{
				disable_resubscribing: true
			});

			// Subscribe Home stream channel
			subscriber.subscribe(`misskey:user-stream:${socket.user.id}`);
			subscriber.on('message', (_: any, contentString: string) => {
				// メッセージはJSONなのでパース
				const content: any = JSON.parse(contentString);

				switch (content.type) {
					// 投稿
					case 'post':
						// 投稿ID
						const postId: any = content.value.id;

						// 投稿の詳細を取得
						requestApi('posts/show', {
							'post-id': postId
						}, socket.user.id).then((post: Object) => {
							// HTMLにしてクライアントに送信
							socket.emit(content.type, post);
						});
						break;

					// 通知
					case 'notification':
						// 通知ID
						const notificationId: any = content.value.id;

						// 通知の詳細を取得
						requestApi('notifications/show', {
							'notification-id': notificationId
						}, socket.user.id).then((notification: Object) => {
							// HTMLにしてクライアントに送信
							socket.emit(content.type, notification);
						});
						break;
					default:
						socket.emit(content.type, content.value);
						break;
				}
			});

			socket.on('disconnect', () => {
				subscriber.end();
			});
		});
	});
};

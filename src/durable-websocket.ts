export class ForumWebSocket {
	private state: DurableObjectState;
	private sessions: Map<WebSocket, { postId?: string; userId?: string }> = new Map();

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// WebSocket upgrade
		if (request.headers.get('Upgrade') === 'websocket') {
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);

			const postId = url.searchParams.get('postId') || undefined;
			const userId = url.searchParams.get('userId') || undefined;

			this.handleSession(server, { postId, userId });

			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		}

		// HTTP API for broadcasting
		if (url.pathname === '/broadcast' && request.method === 'POST') {
			const body = await request.json() as { postId: string; message: any };
			this.broadcastToPost(body.postId, body.message);
			return Response.json({ success: true, connections: this.sessions.size });
		}

		// HTTP API for status
		if (url.pathname === '/status' && request.method === 'GET') {
			const postConnections: Record<string, number> = {};
			for (const [, data] of this.sessions) {
				if (data.postId) {
					postConnections[data.postId] = (postConnections[data.postId] || 0) + 1;
				}
			}
			return Response.json({
				totalConnections: this.sessions.size,
				postConnections
			});
		}

		return Response.json({ error: 'Not found' }, { status: 404 });
	}

	private handleSession(ws: WebSocket, data: { postId?: string; userId?: string }) {
		ws.accept();
		this.sessions.set(ws, data);

		// Send connected message
		ws.send(JSON.stringify({
			type: 'connected',
			payload: {
				postId: data.postId,
				connections: this.sessions.size
			}
		}));

		ws.addEventListener('message', (event) => {
			try {
				const msg = JSON.parse(event.data as string);
				this.handleMessage(ws, msg);
			} catch (e) {
				console.error('WebSocket message parse error:', e);
			}
		});

		ws.addEventListener('close', () => {
			this.sessions.delete(ws);
		});

		ws.addEventListener('error', () => {
			this.sessions.delete(ws);
		});
	}

	private handleMessage(ws: WebSocket, msg: { type: string; payload?: any }) {
		const data = this.sessions.get(ws);
		if (!data) return;

		switch (msg.type) {
			case 'subscribe_post':
				if (msg.payload?.postId) {
					data.postId = String(msg.payload.postId);
					this.sessions.set(ws, data);
					ws.send(JSON.stringify({
						type: 'subscribed',
						payload: { postId: data.postId }
					}));
				}
				break;

			case 'unsubscribe_post':
				data.postId = undefined;
				this.sessions.set(ws, data);
				ws.send(JSON.stringify({
					type: 'unsubscribed',
					payload: { success: true }
				}));
				break;

			case 'ping':
				ws.send(JSON.stringify({ type: 'pong' }));
				break;
		}
	}

	private broadcastToPost(postId: string, message: any) {
		const payload = typeof message === 'string' ? message : JSON.stringify(message);
		let sent = 0;

		for (const [ws, data] of this.sessions) {
			if (data.postId === String(postId)) {
				try {
					ws.send(payload);
					sent++;
				} catch (e) {
					console.error('WebSocket send error:', e);
					this.sessions.delete(ws);
				}
			}
		}

		console.log(`[WebSocket] Broadcast to post ${postId}: ${sent} clients`);
	}

	broadcast(message: any) {
		const payload = typeof message === 'string' ? message : JSON.stringify(message);
		for (const [ws] of this.sessions) {
			try {
				ws.send(payload);
			} catch (e) {
				this.sessions.delete(ws);
			}
		}
	}
}

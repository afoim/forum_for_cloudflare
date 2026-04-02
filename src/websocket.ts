type WebSocketData = {
	postId?: string;
	userId?: string;
};

type WebSocketMessage = {
	type: string;
	payload: any;
};

type WebSocketConnection = {
	ws: WebSocket;
	data: WebSocketData;
};

class WebSocketManager {
	private connections: Set<WebSocketConnection> = new Set();

	handleConnection(ws: WebSocket, data: WebSocketData = {}) {
		const connection: WebSocketConnection = { ws, data };
		this.connections.add(connection);

		ws.addEventListener('message', (event) => {
			try {
				const message = JSON.parse(event.data as string) as WebSocketMessage;
				this.handleMessage(connection, message);
			} catch (e) {
				console.error('WebSocket message parse error:', e);
			}
		});

		ws.addEventListener('close', () => {
			this.connections.delete(connection);
		});

		ws.addEventListener('error', () => {
			this.connections.delete(connection);
		});

		ws.accept();
		ws.send(JSON.stringify({ type: 'connected', payload: { message: 'WebSocket connected' } }));
	}

	private handleMessage(connection: WebSocketConnection, message: WebSocketMessage) {
		switch (message.type) {
			case 'subscribe_post':
				if (message.payload?.postId) {
					connection.data.postId = String(message.payload.postId);
					connection.ws.send(JSON.stringify({
						type: 'subscribed',
						payload: { postId: connection.data.postId }
					}));
				}
				break;
			case 'unsubscribe_post':
				connection.data.postId = undefined;
				connection.ws.send(JSON.stringify({
					type: 'unsubscribed',
					payload: { success: true }
				}));
				break;
			case 'ping':
				connection.ws.send(JSON.stringify({ type: 'pong' }));
				break;
		}
	}

	broadcastToPost(postId: string, message: WebSocketMessage) {
		const targetConnections = Array.from(this.connections).filter(
			(conn) => conn.data.postId === String(postId)
		);
		const payload = JSON.stringify(message);
		for (const conn of targetConnections) {
			try {
				conn.ws.send(payload);
			} catch (e) {
				console.error('WebSocket send error:', e);
				this.connections.delete(conn);
			}
		}
	}

	broadcastToAll(message: WebSocketMessage) {
		const payload = JSON.stringify(message);
		for (const conn of this.connections) {
			try {
				conn.ws.send(payload);
			} catch (e) {
				console.error('WebSocket send error:', e);
				this.connections.delete(conn);
			}
		}
	}

	getConnectionCount(): number {
		return this.connections.size;
	}

	getPostConnectionCount(postId: string): number {
		return Array.from(this.connections).filter(
			(conn) => conn.data.postId === String(postId)
		).length;
	}
}

export const wsManager = new WebSocketManager();
export type { WebSocketMessage, WebSocketData };
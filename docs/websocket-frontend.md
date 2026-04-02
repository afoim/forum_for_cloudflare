# WebSocket 实时推送 - 前端对接文档

## 概述

论坛后端已实现基于 **Durable Objects** 的 WebSocket 实时推送功能，支持：

- 帖子详情页实时接收新评论
- 帖子内容更新实时通知
- 自动断线重连

## WebSocket 连接地址

```
ws(s)://{你的域名}/api/ws?postId={帖子ID}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `postId` | string | 否 | 要订阅的帖子 ID，不传则只连接不订阅 |

## 消息协议

所有消息均为 JSON 格式，包含 `type` 和 `payload` 字段。

### 服务端 → 客户端

#### 1. 连接成功
```json
{
  "type": "connected",
  "payload": {
    "postId": "123",
    "connections": 5
  }
}
```

#### 2. 订阅成功
```json
{
  "type": "subscribed",
  "payload": {
    "postId": "123"
  }
}
```

#### 3. 新评论通知
```json
{
  "type": "new_comment",
  "payload": {
    "postId": "123",
    "comment": {
      "content": "评论内容（已转义HTML）",
      "author_name": "用户名",
      "author_id": 1,
      "parent_id": null,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

#### 4. 帖子更新通知
```json
{
  "type": "post_updated",
  "payload": {
    "postId": "123",
    "title": "更新后的标题",
    "content": "更新后的内容",
    "category_id": 1,
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 5. 心跳响应
```json
{
  "type": "pong"
}
```

### 客户端 → 服务端

#### 1. 订阅帖子
```json
{
  "type": "subscribe_post",
  "payload": {
    "postId": "123"
  }
}
```

#### 2. 取消订阅
```json
{
  "type": "unsubscribe_post",
  "payload": {}
}
```

#### 3. 心跳检测
```json
{
  "type": "ping"
}
```

## 前端代码示例

### 方案一：原生 JavaScript

```javascript
class ForumWebSocket {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.currentPostId = null;
    this.onNewComment = null; // 回调函数
    this.onPostUpdated = null; // 回调函数
  }

  // 连接 WebSocket
  connect(postId = null) {
    this.currentPostId = postId;
    const url = postId 
      ? `${this.baseUrl}/api/ws?postId=${postId}`
      : `${this.baseUrl}/api/ws`;
    
    this.ws = new WebSocket(url);
    
    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };
    
    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.stopHeartbeat();
      this.reconnect();
    };
    
    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
  }

  // 处理消息
  handleMessage(data) {
    console.log('[WS] Message:', data.type);
    
    switch (data.type) {
      case 'connected':
        console.log('[WS] Connected to post:', data.payload.postId);
        break;
      case 'subscribed':
        console.log('[WS] Subscribed to post:', data.payload.postId);
        break;
      case 'new_comment':
        if (this.onNewComment) {
          this.onNewComment(data.payload);
        }
        break;
      case 'post_updated':
        if (this.onPostUpdated) {
          this.onPostUpdated(data.payload);
        }
        break;
      case 'pong':
        console.log('[WS] Heartbeat OK');
        break;
    }
  }

  // 订阅帖子
  subscribePost(postId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.currentPostId = postId;
      this.ws.send(JSON.stringify({
        type: 'subscribe_post',
        payload: { postId }
      }));
    }
  }

  // 取消订阅
  unsubscribePost() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.currentPostId = null;
      this.ws.send(JSON.stringify({
        type: 'unsubscribe_post',
        payload: {}
      }));
    }
  }

  // 心跳
  ping() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.ping();
    }, 30000); // 每 30 秒发送一次心跳
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  // 断线重连
  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`[WS] Reconnecting in ${delay}ms...`);
      setTimeout(() => this.connect(this.currentPostId), delay);
    }
  }

  // 断开连接
  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ========== 使用示例 ==========

// 1. 创建连接
const forumWS = new ForumWebSocket('wss://your-domain.com');

// 2. 设置回调
forumWS.onNewComment = (payload) => {
  console.log('收到新评论:', payload.comment);
  // 添加评论到页面
  addCommentToUI(payload.comment);
};

forumWS.onPostUpdated = (payload) => {
  console.log('帖子已更新:', payload);
  // 更新帖子内容
  updatePostContent(payload);
};

// 3. 连接（自动订阅帖子 123）
forumWS.connect('123');

// 4. 页面卸载时断开
window.addEventListener('beforeunload', () => {
  forumWS.disconnect();
});
```

### 方案二：React Hook

```javascript
import { useEffect, useRef, useCallback, useState } from 'react';

function useForumWebSocket(postId) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [newComment, setNewComment] = useState(null);
  const [postUpdate, setPostUpdate] = useState(null);

  const connect = useCallback(() => {
    if (!postId) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/ws?postId=${postId}`;
    
    wsRef.current = new WebSocket(url);
    
    wsRef.current.onopen = () => {
      console.log('[WS] Connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
      
      // 启动心跳
      heartbeatRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'new_comment':
          setNewComment(data.payload);
          break;
        case 'post_updated':
          setPostUpdate(data.payload);
          break;
      }
    };
    
    wsRef.current.onclose = () => {
      console.log('[WS] Disconnected');
      setIsConnected(false);
      
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      
      // 断线重连
      if (reconnectAttempts.current < 5) {
        reconnectAttempts.current++;
        const delay = 1000 * Math.pow(2, reconnectAttempts.current - 1);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
  }, [postId]);

  const subscribePost = useCallback((newPostId) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe_post',
        payload: { postId: newPostId }
      }));
    }
  }, []);

  const unsubscribePost = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe_post',
        payload: {}
      }));
    }
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [connect]);

  return {
    isConnected,
    newComment,
    postUpdate,
    subscribePost,
    unsubscribePost
  };
}

// ========== 使用示例 ==========

function PostDetail({ postId }) {
  const { isConnected, newComment, postUpdate } = useForumWebSocket(postId);
  const [comments, setComments] = useState([]);

  // 监听新评论
  useEffect(() => {
    if (newComment && newComment.postId === String(postId)) {
      setComments(prev => [...prev, newComment.comment]);
    }
  }, [newComment, postId]);

  // 监听帖子更新
  useEffect(() => {
    if (postUpdate && postUpdate.postId === String(postId)) {
      // 更新帖子内容
      console.log('帖子已更新:', postUpdate);
    }
  }, [postUpdate, postId]);

  return (
    <div>
      <div>WebSocket 状态: {isConnected ? '已连接' : '未连接'}</div>
      {/* 帖子内容 */}
      {/* 评论列表 */}
    </div>
  );
}
```

### 方案三：Vue 3 Composition API

```javascript
import { ref, onMounted, onUnmounted, watch } from 'vue';

export function useForumWebSocket(postId) {
  const ws = ref(null);
  const isConnected = ref(false);
  const newComment = ref(null);
  const postUpdate = ref(null);
  
  let heartbeatInterval = null;
  let reconnectTimeout = null;
  let reconnectAttempts = 0;

  function connect() {
    if (!postId) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/ws?postId=${postId}`;
    
    ws.value = new WebSocket(url);
    
    ws.value.onopen = () => {
      console.log('[WS] Connected');
      isConnected.value = true;
      reconnectAttempts = 0;
      
      heartbeatInterval = setInterval(() => {
        if (ws.value?.readyState === WebSocket.OPEN) {
          ws.value.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };
    
    ws.value.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'new_comment') {
        newComment.value = data.payload;
      } else if (data.type === 'post_updated') {
        postUpdate.value = data.payload;
      }
    };
    
    ws.value.onclose = () => {
      console.log('[WS] Disconnected');
      isConnected.value = false;
      
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      
      if (reconnectAttempts < 5) {
        reconnectAttempts++;
        const delay = 1000 * Math.pow(2, reconnectAttempts - 1);
        reconnectTimeout = setTimeout(connect, delay);
      }
    };
  }

  function disconnect() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (ws.value) {
      ws.value.close();
      ws.value = null;
    }
  }

  function subscribePost(newPostId) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'subscribe_post',
        payload: { postId: newPostId }
      }));
    }
  }

  onMounted(() => {
    connect();
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    isConnected,
    newComment,
    postUpdate,
    subscribePost,
    disconnect
  };
}

// ========== 使用示例 ==========

// PostDetail.vue
import { useForumWebSocket } from './composables/useForumWebSocket';

export default {
  props: ['postId'],
  setup(props) {
    const { isConnected, newComment, postUpdate } = useForumWebSocket(props.postId);
    const comments = ref([]);

    watch(newComment, (payload) => {
      if (payload && payload.postId === String(props.postId)) {
        comments.value.push(payload.comment);
      }
    });

    return { isConnected, comments };
  }
};
```

## 调试接口

查看当前 WebSocket 连接状态：

```
GET /api/ws/status
```

响应：
```json
{
  "totalConnections": 5,
  "postConnections": {
    "123": 3,
    "456": 2
  }
}
```

## 注意事项

1. **必须使用 Durable Objects**：WebSocket 连接状态由 Durable Object 维护，确保 `wrangler.jsonc` 中已配置 `WS_MANAGER`

2. **部署后需要执行迁移**：
   ```bash
   wrangler deploy
   ```

3. **HTTPS/WSS**：生产环境必须使用 `wss://` 协议

4. **心跳保活**：建议每 30 秒发送一次 `ping` 消息

5. **断线重连**：使用指数退避策略，避免频繁重连

6. **页面卸载**：在 `beforeunload` 事件中断开连接

## 消息流程图

```
浏览器A (评论者)          后端                    浏览器B (浏览者)
    |                      |                           |
    |--- POST /comments -->|                           |
    |                      |-- 存入数据库              |
    |                      |-- 广播 new_comment ------>|
    |<-- success --------- |                           |
    |                      |                           |-- 收到新评论
    |                      |                           |-- 更新UI
```

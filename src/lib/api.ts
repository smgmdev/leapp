const API_BASE = "https://lethal-seven.vercel.app";

export async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  return res.json();
}

export const chatApi = {
  register: (username: string, displayName: string) =>
    api("/api/chat/register", { method: "POST", body: JSON.stringify({ username, displayName }) }),

  getUsers: (excludeId: string) =>
    api(`/api/chat/users?exclude=${excludeId}`),

  getConversations: (userId: string) =>
    api(`/api/chat/conversations?userId=${userId}`),

  createConversation: (user1Id: string, user2Id: string) =>
    api("/api/chat/conversations", { method: "POST", body: JSON.stringify({ user1Id, user2Id }) }),

  getMessages: (conversationId: string, userId: string) =>
    api(`/api/chat/messages?conversationId=${conversationId}&userId=${userId}`),

  sendMessage: (data: { conversationId: string; senderId: string; text?: string; fileUrl?: string; fileType?: string; fileName?: string; replyToId?: number; replyToText?: string; replyToSender?: string }) =>
    api("/api/chat/messages", { method: "POST", body: JSON.stringify(data) }),

  uploadFile: async (uri: string, name: string, type: string) => {
    const formData = new FormData();
    formData.append("file", { uri, name, type } as any);
    const res = await fetch(`${API_BASE}/api/chat/upload`, { method: "POST", body: formData });
    return res.json();
  },

  sendHeartbeat: (userId: string) =>
    api("/api/chat/heartbeat", { method: "POST", body: JSON.stringify({ userId }) }),

  setTyping: (userId: string, conversationId: string) =>
    api("/api/chat/typing", { method: "POST", body: JSON.stringify({ userId, conversationId }) }),

  checkTyping: (conversationId: string, excludeUserId: string) =>
    api(`/api/chat/typing?conversationId=${conversationId}&exclude=${excludeUserId}`),

  sendCallSignal: (data: { conversationId: string; fromId: string; toId: string; type: string; payload: any }) =>
    api("/api/chat/call", { method: "POST", body: JSON.stringify(data) }),

  getLivekitToken: (roomName: string, identity: string, displayName: string) =>
    api("/api/chat/livekit-token", { method: "POST", body: JSON.stringify({ roomName, identity, displayName }) }),
};

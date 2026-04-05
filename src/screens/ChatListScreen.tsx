import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput } from "react-native";
import { chatApi } from "../lib/api";
import { clearUser, ChatUser } from "../lib/storage";

interface Conversation {
  id: string;
  other_user: any;
  last_message_text: string;
  last_message_at: string;
  unread: number;
}

function timeAgo(ts: string) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function ChatListScreen({ me, onOpenChat, onLogout }: { me: ChatUser; onOpenChat: (convoId: string) => void; onLogout: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [tab, setTab] = useState<"chats" | "contacts">("chats");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [convos, allUsers] = await Promise.all([
      chatApi.getConversations(me.id),
      chatApi.getUsers(me.id),
    ]);
    setConversations(convos);
    setUsers(allUsers);
  }, [me.id]);

  useEffect(() => {
    load();
    chatApi.sendHeartbeat(me.id);
    const i = setInterval(() => { load(); chatApi.sendHeartbeat(me.id); }, 2000);
    return () => clearInterval(i);
  }, [load, me.id]);

  async function startChat(otherUser: any) {
    const data = await chatApi.createConversation(me.id, otherUser.id);
    if (data.ok) onOpenChat(data.conversation.id);
  }

  async function handleLogout() {
    await clearUser();
    onLogout();
  }

  const filteredUsers = users.filter(
    (u) => u.display_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{me.display_name[0]?.toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerName}>{me.display_name}</Text>
            <Text style={styles.headerUsername}>@{me.username}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          placeholderTextColor="#8696a0"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "chats" && styles.tabActive]} onPress={() => setTab("chats")}>
          <Text style={[styles.tabText, tab === "chats" && styles.tabTextActive]}>Chats</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "contacts" && styles.tabActive]} onPress={() => setTab("contacts")}>
          <Text style={[styles.tabText, tab === "contacts" && styles.tabTextActive]}>Contacts</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {tab === "chats" ? (
        conversations.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No chats yet.</Text>
            <TouchableOpacity onPress={() => setTab("contacts")}>
              <Text style={styles.emptyLink}>Go to Contacts to start one</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => onOpenChat(item.id)}>
                <View style={styles.rowAvatarContainer}>
                  <View style={styles.rowAvatar}>
                    <Text style={styles.rowAvatarText}>{item.other_user?.display_name?.[0]?.toUpperCase()}</Text>
                  </View>
                  {item.other_user?.online && <View style={styles.onlineDot} />}
                </View>
                <View style={styles.rowContent}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName}>{item.other_user?.display_name}</Text>
                    <Text style={styles.rowTime}>{timeAgo(item.last_message_at)}</Text>
                  </View>
                  <View style={styles.rowBottom}>
                    <Text style={styles.rowMessage} numberOfLines={1}>{item.last_message_text || "Start chatting..."}</Text>
                    {item.unread > 0 && (
                      <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )
      ) : (
        filteredUsers.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No other users yet.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => startChat(item)}>
                <View style={styles.rowAvatarContainer}>
                  <View style={styles.rowAvatar}>
                    <Text style={styles.rowAvatarText}>{item.display_name[0]?.toUpperCase()}</Text>
                  </View>
                  {item.online && <View style={styles.onlineDot} />}
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowName}>{item.display_name}</Text>
                  <Text style={styles.rowUsername}>@{item.username}</Text>
                </View>
                <Text style={styles.messageBtn}>Message</Text>
              </TouchableOpacity>
            )}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111b21" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#202c33" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#00a884", justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  headerName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  headerUsername: { color: "#8696a0", fontSize: 11 },
  logoutText: { color: "#8696a0", fontSize: 12 },
  searchContainer: { paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { backgroundColor: "#202c33", color: "#fff", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#2a3942" },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#00a884" },
  tabText: { color: "#8696a0", fontSize: 14, fontWeight: "500" },
  tabTextActive: { color: "#00a884" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyText: { color: "#8696a0", fontSize: 14 },
  emptyLink: { color: "#00a884", fontSize: 14, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "#2a394240" },
  rowAvatarContainer: { position: "relative" },
  rowAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#2a3942", justifyContent: "center", alignItems: "center" },
  rowAvatarText: { color: "#8696a0", fontSize: 18, fontWeight: "bold" },
  onlineDot: { position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: "#00a884", borderWidth: 2, borderColor: "#111b21" },
  rowContent: { flex: 1, marginLeft: 12 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  rowName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  rowTime: { color: "#8696a0", fontSize: 11 },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  rowMessage: { color: "#8696a0", fontSize: 13, flex: 1 },
  rowUsername: { color: "#8696a0", fontSize: 12, marginTop: 2 },
  badge: { backgroundColor: "#00a884", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: "center" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  messageBtn: { color: "#00a884", fontSize: 12 },
});

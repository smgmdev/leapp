import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image, KeyboardAvoidingView, Platform, Dimensions, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { chatApi } from "../lib/api";
import { ChatUser } from "../lib/storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Message {
  id: number;
  conversation_id: string;
  sender_id: string;
  text: string | null;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
  read: boolean;
  delivered: boolean;
  created_at: string;
  reply_to_text: string | null;
  reply_to_sender: string | null;
}

export default function ChatRoomScreen({ me, conversationId, onBack }: { me: ChatUser; conversationId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [otherUser, setOtherUser] = useState<any>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [uploading, setUploading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const firstLoadRef = useRef(true);

  useEffect(() => {
    loadMessages();
    loadOtherUser();
    chatApi.sendHeartbeat(me.id);
    const i = setInterval(() => {
      loadMessages();
      loadOtherUser();
      checkTyping();
    }, 800);
    const hb = setInterval(() => chatApi.sendHeartbeat(me.id), 10000);
    return () => { clearInterval(i); clearInterval(hb); };
  }, []);

  async function loadMessages() {
    const data = await chatApi.getMessages(conversationId, me.id);
    setMessages(data);
  }

  async function loadOtherUser() {
    const convos = await chatApi.getConversations(me.id);
    const convo = convos.find((c: any) => c.id === conversationId);
    if (convo?.other_user) setOtherUser(convo.other_user);
  }

  async function checkTyping() {
    const data = await chatApi.checkTyping(conversationId, me.id);
    setIsTyping(data.typing);
  }

  async function sendMessage() {
    if (!text.trim()) return;
    const msg = text.trim();
    setText("");

    const replyData = replyTo ? {
      replyToId: replyTo.id,
      replyToText: replyTo.text || (replyTo.file_name ? `[${replyTo.file_type?.split("/")[0] || "file"}]` : ""),
      replyToSender: replyTo.sender_id === me.id ? me.display_name : otherUser?.display_name || "",
    } : {};
    setReplyTo(null);

    await chatApi.sendMessage({ conversationId, senderId: me.id, text: msg, ...replyData });
    loadMessages();
  }

  async function handlePickFile() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    const asset = result.assets[0];
    const name = asset.fileName || `file.${asset.type === "video" ? "mp4" : "jpg"}`;
    const type = asset.type === "video" ? "video/mp4" : "image/jpeg";

    const data = await chatApi.uploadFile(asset.uri, name, type);
    if (data.ok) {
      await chatApi.sendMessage({ conversationId, senderId: me.id, fileUrl: data.url, fileType: data.type, fileName: data.name });
      loadMessages();
    }
    setUploading(false);
  }

  function handleTyping() {
    chatApi.setTyping(me.id, conversationId);
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function startVoiceCall() {
    // Open web-based call in browser for now
    Linking.openURL(`https://lethal-seven.vercel.app/chat/${conversationId}`);
  }

  function startVideoCall() {
    Linking.openURL(`https://lethal-seven.vercel.app/chat/${conversationId}`);
  }

  function renderTicks(msg: Message) {
    if (msg.sender_id !== me.id) return null;
    const color = msg.read ? "#53bdeb" : "#ffffff80";
    if (msg.read || msg.delivered) return <Text style={{ color, fontSize: 11 }}> ✓✓</Text>;
    return <Text style={{ color: "#ffffff80", fontSize: 11 }}> ✓</Text>;
  }

  function renderMessage({ item: msg }: { item: Message }) {
    const isMine = msg.sender_id === me.id;
    const maxBubbleWidth = SCREEN_WIDTH * 0.75;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onLongPress={() => setReplyTo(msg)}
        style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}
      >
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther, { maxWidth: maxBubbleWidth }]}>
          {msg.reply_to_text && (
            <View style={[styles.replyPreview, isMine ? styles.replyMine : styles.replyOther]}>
              <Text style={[styles.replySender, { color: isMine ? "#06cf9c" : "#53bdeb" }]}>{msg.reply_to_sender}</Text>
              <Text style={styles.replyText} numberOfLines={1}>{msg.reply_to_text}</Text>
            </View>
          )}
          {msg.file_url && msg.file_type?.startsWith("image/") && (
            <Image source={{ uri: msg.file_url }} style={[styles.msgImage, { width: Math.min(240, maxBubbleWidth - 24) }]} resizeMode="cover" />
          )}
          {msg.text && <Text style={styles.msgText}>{msg.text}</Text>}
          {msg.file_url && !msg.file_type?.startsWith("image/") && (
            <Text style={styles.msgFile}>📄 {msg.file_name}</Text>
          )}
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, { color: isMine ? "#ffffff60" : "#8696a0" }]}>{formatTime(msg.created_at)}</Text>
            {renderTicks(msg)}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerAvatarWrap}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{otherUser?.display_name?.[0]?.toUpperCase() || "?"}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: otherUser?.online ? "#00a884" : "#667781" }]} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{otherUser?.display_name || "Loading..."}</Text>
          <Text style={styles.headerStatus}>
            {isTyping ? "typing..." : otherUser?.online ? "online" : "offline"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={startVideoCall} style={styles.headerIcon} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
            <Text style={styles.headerIconText}>📹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={startVoiceCall} style={styles.headerIcon} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
            <Text style={styles.headerIconText}>📞</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMessage}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
      />

      {/* Typing */}
      {isTyping && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>typing...</Text>
        </View>
      )}

      {/* Reply */}
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarContent}>
            <Text style={styles.replyBarSender}>{replyTo.sender_id === me.id ? "You" : otherUser?.display_name}</Text>
            <Text style={styles.replyBarText} numberOfLines={1}>{replyTo.text || replyTo.file_name || "[media]"}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.replyBarClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TouchableOpacity onPress={handlePickFile} disabled={uploading} style={styles.attachBtn}>
          <Text style={styles.attachIcon}>{uploading ? "⏳" : "📎"}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message"
          placeholderTextColor="#8696a0"
          value={text}
          onChangeText={(t) => { setText(t); handleTyping(); }}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity
          onPress={sendMessage}
          disabled={!text.trim()}
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
        >
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#091519" },

  // Header
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#202c33", paddingHorizontal: 8, paddingVertical: 10, gap: 8 },
  backBtn: { paddingHorizontal: 8 },
  backText: { color: "#8696a0", fontSize: 28, fontWeight: "300" },
  headerAvatarWrap: { position: "relative" },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#2a3942", justifyContent: "center", alignItems: "center" },
  headerAvatarText: { color: "#8696a0", fontSize: 17, fontWeight: "bold" },
  statusDot: { position: "absolute", bottom: -1, right: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: "#202c33" },
  headerInfo: { flex: 1, marginLeft: 4 },
  headerName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  headerStatus: { color: "#8696a0", fontSize: 12, marginTop: 1 },
  headerActions: { flexDirection: "row", gap: 16 },
  headerIcon: { padding: 4 },
  headerIconText: { fontSize: 20 },

  // Messages
  messagesList: { flex: 1 },
  messagesContent: { paddingHorizontal: 10, paddingVertical: 8, paddingBottom: 4 },
  msgRow: { marginVertical: 1.5 },
  msgRowRight: { alignItems: "flex-end" },
  msgRowLeft: { alignItems: "flex-start" },
  bubble: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  bubbleMine: { backgroundColor: "#005c4b", borderTopRightRadius: 2 },
  bubbleOther: { backgroundColor: "#202c33", borderTopLeftRadius: 2 },

  // Reply
  replyPreview: { borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 },
  replyMine: { backgroundColor: "#00473d", borderLeftColor: "#06cf9c" },
  replyOther: { backgroundColor: "#1a2930", borderLeftColor: "#53bdeb" },
  replySender: { fontSize: 11, fontWeight: "600" },
  replyText: { fontSize: 12, color: "#ffffff90" },

  // Message content
  msgText: { color: "#fff", fontSize: 15, lineHeight: 21 },
  msgImage: { height: 180, borderRadius: 8, marginVertical: 4 },
  msgFile: { color: "#fff", fontSize: 13, paddingVertical: 4 },
  msgMeta: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 2 },
  msgTime: { fontSize: 10 },

  // Typing
  typingBar: { paddingHorizontal: 16, paddingVertical: 4 },
  typingText: { color: "#00a884", fontSize: 12, fontStyle: "italic" },

  // Reply bar
  replyBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a2530", paddingHorizontal: 16, paddingVertical: 10, borderLeftWidth: 4, borderLeftColor: "#00a884" },
  replyBarContent: { flex: 1 },
  replyBarSender: { color: "#00a884", fontSize: 12, fontWeight: "600" },
  replyBarText: { color: "#8696a0", fontSize: 12, marginTop: 1 },
  replyBarClose: { color: "#8696a0", fontSize: 20, paddingLeft: 16 },

  // Input
  inputBar: { flexDirection: "row", alignItems: "flex-end", backgroundColor: "#202c33", paddingHorizontal: 6, paddingVertical: 6, gap: 4 },
  attachBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  attachIcon: { fontSize: 22 },
  input: { flex: 1, backgroundColor: "#2a3942", color: "#fff", borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120, minHeight: 44 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#00a884", justifyContent: "center", alignItems: "center" },
  sendBtnDisabled: { opacity: 0.3 },
  sendIcon: { color: "#fff", fontSize: 20 },
});

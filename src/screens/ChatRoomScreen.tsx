import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image, KeyboardAvoidingView, Platform, Dimensions, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { chatApi } from "../lib/api";
import { supabase } from "../lib/supabase";
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
  const [inCall, setInCall] = useState(false);
  const [calling, setCalling] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [muted, setMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const flatListRef = useRef<FlatList>(null);
  const livekitRoomRef = useRef<any>(null);

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

    // Listen for call signals
    const channel = supabase
      .channel(`calls-${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_signals", filter: `to_id=eq.${me.id}` },
        (payload: any) => handleCallSignal(payload.new)
      )
      .subscribe();

    return () => { clearInterval(i); clearInterval(hb); supabase.removeChannel(channel); };
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8 });
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

  // ── LiveKit Calls ──
  async function startCall(type: "audio" | "video") {
    if (!me || !otherUser) return;
    setCallType(type); setCalling(true); setMuted(false);
    try {
      const roomName = `call-${conversationId}`;
      const res = await chatApi.getLivekitToken(roomName, me.id, me.display_name);
      if (!res.ok) throw new Error("Token failed");

      const { Room, RoomEvent } = await import("livekit-client");
      const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      livekitRoomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => { setCalling(false); });
      room.on(RoomEvent.ParticipantDisconnected, () => endCall());
      room.on(RoomEvent.Disconnected, () => endCall());
      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (track.kind === "audio") {
          // Native handles audio automatically
        }
      });

      await room.connect(res.url, res.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      if (type === "video") await room.localParticipant.setCameraEnabled(true);

      await chatApi.sendCallSignal({ conversationId, fromId: me.id, toId: otherUser.id, type: "call-start", payload: { roomName, callType: type } });
      setInCall(true);
    } catch (err: any) {
      console.error(err);
      setCalling(false);
    }
  }

  async function answerCall(signal: any) {
    setIncomingCall(null);
    setCallType(signal.payload.callType || "audio"); setInCall(true); setMuted(false);
    try {
      const res = await chatApi.getLivekitToken(signal.payload.roomName, me.id, me.display_name);
      if (!res.ok) throw new Error("Token failed");

      const { Room, RoomEvent } = await import("livekit-client");
      const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      livekitRoomRef.current = room;

      room.on(RoomEvent.ParticipantDisconnected, () => endCall());
      room.on(RoomEvent.Disconnected, () => endCall());

      await room.connect(res.url, res.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      if (signal.payload.callType === "video") await room.localParticipant.setCameraEnabled(true);
    } catch (err: any) {
      console.error(err);
      setInCall(false);
    }
  }

  function endCall() {
    if (livekitRoomRef.current) { try { livekitRoomRef.current.disconnect(); } catch {} livekitRoomRef.current = null; }
    setInCall(false); setCalling(false); setMuted(false);
    if (me && otherUser) chatApi.sendCallSignal({ conversationId, fromId: me.id, toId: otherUser.id, type: "call-end", payload: {} });
  }

  function toggleMute() {
    if (livekitRoomRef.current) {
      const newMuted = !muted;
      livekitRoomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setMuted(newMuted);
    }
  }

  function handleCallSignal(s: any) {
    if (s.type === "call-start") setIncomingCall(s);
    else if (s.type === "call-end") endCall();
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderTicks(msg: Message) {
    if (msg.sender_id !== me.id) return null;
    const color = msg.read ? "#53bdeb" : "#ffffff80";
    if (msg.read || msg.delivered) return <Text style={{ color, fontSize: 11 }}> ✓✓</Text>;
    return <Text style={{ color: "#ffffff80", fontSize: 11 }}> ✓</Text>;
  }

  function renderMessage({ item: msg }: { item: Message }) {
    const isMine = msg.sender_id === me.id;
    return (
      <TouchableOpacity activeOpacity={0.8} onLongPress={() => setReplyTo(msg)} style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther, { maxWidth: SCREEN_WIDTH * 0.75 }]}>
          {msg.reply_to_text && (
            <View style={[styles.replyPreview, isMine ? styles.replyMine : styles.replyOther]}>
              <Text style={[styles.replySender, { color: isMine ? "#06cf9c" : "#53bdeb" }]}>{msg.reply_to_sender}</Text>
              <Text style={styles.replyText} numberOfLines={1}>{msg.reply_to_text}</Text>
            </View>
          )}
          {msg.file_url && msg.file_type?.startsWith("image/") && (
            <Image source={{ uri: msg.file_url }} style={[styles.msgImage, { width: Math.min(240, SCREEN_WIDTH * 0.65) }]} resizeMode="cover" />
          )}
          {msg.text && <Text style={styles.msgText}>{msg.text}</Text>}
          {msg.file_url && !msg.file_type?.startsWith("image/") && (
            <View style={styles.fileRow}><Ionicons name="document" size={20} color="#8696a0" /><Text style={styles.msgFile}>{msg.file_name}</Text></View>
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Incoming call modal */}
      <Modal visible={!!incomingCall} transparent animationType="fade">
        <View style={styles.callOverlay}>
          <View style={styles.callCard}>
            <View style={styles.callAvatar}><Text style={styles.callAvatarText}>{otherUser?.display_name?.[0]?.toUpperCase()}</Text></View>
            <Text style={styles.callName}>{otherUser?.display_name}</Text>
            <Text style={styles.callLabel}>{incomingCall?.payload?.callType === "video" ? "Video" : "Voice"} call...</Text>
            <View style={styles.callActions}>
              <TouchableOpacity style={styles.declineBtn} onPress={() => setIncomingCall(null)}>
                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => answerCall(incomingCall)}>
                <Ionicons name="call" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.callLabelsRow}>
              <Text style={styles.callActionLabel}>Decline</Text>
              <Text style={styles.callActionLabel}>Accept</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* In-call UI */}
      <Modal visible={inCall} animationType="slide">
        <View style={styles.inCallContainer}>
          <View style={styles.callAvatar}><Text style={styles.callAvatarText}>{otherUser?.display_name?.[0]?.toUpperCase()}</Text></View>
          <Text style={styles.callName}>{otherUser?.display_name}</Text>
          <Text style={styles.callLabel}>{calling ? "Connecting..." : "In call"}</Text>
          <View style={styles.inCallActions}>
            <TouchableOpacity style={[styles.callControlBtn, muted && styles.callControlActive]} onPress={toggleMute}>
              <Ionicons name={muted ? "mic-off" : "mic"} size={24} color={muted ? "#333" : "#fff"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.endCallBtn} onPress={endCall}>
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.callControlBtn, callType === "video" && styles.callControlActive]} onPress={() => {
              if (livekitRoomRef.current) {
                const newType = callType === "video" ? "audio" : "video";
                livekitRoomRef.current.localParticipant.setCameraEnabled(newType === "video");
                setCallType(newType);
              }
            }}>
              <Ionicons name={callType === "video" ? "videocam" : "videocam-off"} size={24} color={callType === "video" ? "#333" : "#fff"} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color="#8696a0" />
        </TouchableOpacity>
        <View style={styles.headerAvatarWrap}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{otherUser?.display_name?.[0]?.toUpperCase() || "?"}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: otherUser?.online ? "#00a884" : "#667781" }]} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{otherUser?.display_name || "Loading..."}</Text>
          <Text style={[styles.headerStatus, isTyping && { color: "#00a884" }]}>
            {isTyping ? "typing..." : otherUser?.online ? "online" : "offline"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => startCall("video")} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
            <Ionicons name="videocam-outline" size={24} color="#8696a0" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => startCall("audio")} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
            <Ionicons name="call-outline" size={22} color="#8696a0" />
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

      {isTyping && <View style={styles.typingBar}><Text style={styles.typingText}>typing...</Text></View>}

      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarLine} />
          <View style={styles.replyBarContent}>
            <Text style={styles.replyBarSender}>{replyTo.sender_id === me.id ? "You" : otherUser?.display_name}</Text>
            <Text style={styles.replyBarText} numberOfLines={1}>{replyTo.text || replyTo.file_name || "[media]"}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#8696a0" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TouchableOpacity onPress={handlePickFile} disabled={uploading} style={styles.attachBtn}>
          {uploading ? <Ionicons name="hourglass-outline" size={22} color="#8696a0" /> : <Ionicons name="attach" size={24} color="#8696a0" />}
        </TouchableOpacity>
        <TextInput style={styles.input} placeholder="Type a message" placeholderTextColor="#8696a0" value={text} onChangeText={(t) => { setText(t); chatApi.setTyping(me.id, conversationId); }} multiline maxLength={4000} />
        <TouchableOpacity onPress={sendMessage} disabled={!text.trim()} style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}>
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#091519" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#202c33", paddingHorizontal: 8, paddingVertical: 10, gap: 8 },
  headerAvatarWrap: { position: "relative" },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#2a3942", justifyContent: "center", alignItems: "center" },
  headerAvatarText: { color: "#8696a0", fontSize: 17, fontWeight: "bold" },
  statusDot: { position: "absolute", bottom: -1, right: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: "#202c33" },
  headerInfo: { flex: 1, marginLeft: 4 },
  headerName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  headerStatus: { color: "#8696a0", fontSize: 12, marginTop: 1 },
  headerActions: { flexDirection: "row", gap: 20, paddingRight: 4 },
  messagesList: { flex: 1 },
  messagesContent: { paddingHorizontal: 10, paddingVertical: 8 },
  msgRow: { marginVertical: 1.5 },
  msgRowRight: { alignItems: "flex-end" },
  msgRowLeft: { alignItems: "flex-start" },
  bubble: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  bubbleMine: { backgroundColor: "#005c4b", borderTopRightRadius: 2 },
  bubbleOther: { backgroundColor: "#202c33", borderTopLeftRadius: 2 },
  replyPreview: { borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 },
  replyMine: { backgroundColor: "#00473d", borderLeftColor: "#06cf9c" },
  replyOther: { backgroundColor: "#1a2930", borderLeftColor: "#53bdeb" },
  replySender: { fontSize: 11, fontWeight: "600" },
  replyText: { fontSize: 12, color: "#ffffff90" },
  msgText: { color: "#fff", fontSize: 15, lineHeight: 21 },
  msgImage: { height: 180, borderRadius: 8, marginVertical: 4 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  msgFile: { color: "#fff", fontSize: 13, flex: 1 },
  msgMeta: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 2 },
  msgTime: { fontSize: 10 },
  typingBar: { paddingHorizontal: 16, paddingVertical: 4 },
  typingText: { color: "#00a884", fontSize: 12, fontStyle: "italic" },
  replyBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a2530", paddingHorizontal: 12, paddingVertical: 10 },
  replyBarLine: { width: 4, height: "100%", backgroundColor: "#00a884", borderRadius: 2, marginRight: 10 },
  replyBarContent: { flex: 1 },
  replyBarSender: { color: "#00a884", fontSize: 12, fontWeight: "600" },
  replyBarText: { color: "#8696a0", fontSize: 12, marginTop: 1 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", backgroundColor: "#202c33", paddingHorizontal: 6, paddingVertical: 6, gap: 4 },
  attachBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  input: { flex: 1, backgroundColor: "#2a3942", color: "#fff", borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120, minHeight: 44 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#00a884", justifyContent: "center", alignItems: "center" },
  sendBtnDisabled: { opacity: 0.3 },
  // Call UI
  callOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  callCard: { backgroundColor: "#202c33", borderRadius: 24, padding: 32, alignItems: "center", width: 280 },
  callAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#2a3942", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  callAvatarText: { color: "#8696a0", fontSize: 32, fontWeight: "bold" },
  callName: { color: "#fff", fontSize: 20, fontWeight: "600", marginBottom: 4 },
  callLabel: { color: "#8696a0", fontSize: 14, marginBottom: 24 },
  callActions: { flexDirection: "row", gap: 40 },
  declineBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#ef4444", justifyContent: "center", alignItems: "center" },
  acceptBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#00a884", justifyContent: "center", alignItems: "center" },
  callLabelsRow: { flexDirection: "row", gap: 40, marginTop: 8 },
  callActionLabel: { color: "#8696a0", fontSize: 11, width: 60, textAlign: "center" },
  inCallContainer: { flex: 1, backgroundColor: "#0b141a", justifyContent: "center", alignItems: "center" },
  inCallActions: { flexDirection: "row", gap: 20, position: "absolute", bottom: 60 },
  callControlBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  callControlActive: { backgroundColor: "#fff" },
  endCallBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#ef4444", justifyContent: "center", alignItems: "center" },
});

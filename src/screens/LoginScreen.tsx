import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { chatApi } from "../lib/api";
import { getUser, setUser, ChatUser } from "../lib/storage";

export default function LoginScreen({ onLogin }: { onLogin: (user: ChatUser) => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser().then((user) => {
      if (user) onLogin(user);
      else setLoading(false);
    });
  }, []);

  async function handleLogin() {
    if (!username.trim() || !displayName.trim()) return;
    const data = await chatApi.register(username.trim(), displayName.trim());
    if (data.ok) {
      await setUser(data.user);
      onLogin(data.user);
    }
  }

  if (loading) return <View style={styles.container}><Text style={styles.loadingText}>Loading...</Text></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="chatbubbles" size={32} color="#fff" />
        </View>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.subtitle}>Enter your details to start chatting</Text>
        <TextInput
          style={styles.input}
          placeholder="Display Name"
          placeholderTextColor="#8696a0"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          style={styles.input}
          placeholder="Username (unique)"
          placeholderTextColor="#8696a0"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          onSubmitEditing={handleLogin}
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={!username.trim() || !displayName.trim()}>
          <Text style={styles.buttonText}>Start Chatting</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111b21", justifyContent: "center", alignItems: "center", padding: 20 },
  loadingText: { color: "#8696a0", fontSize: 14 },
  card: { width: "100%", maxWidth: 360, alignItems: "center" },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#00a884", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  title: { color: "#fff", fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  subtitle: { color: "#8696a0", fontSize: 14, marginBottom: 24 },
  input: { width: "100%", backgroundColor: "#2a3942", color: "#fff", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, marginBottom: 12 },
  button: { width: "100%", backgroundColor: "#00a884", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});

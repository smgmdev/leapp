import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import LoginScreen from "./src/screens/LoginScreen";
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatRoomScreen from "./src/screens/ChatRoomScreen";
import { ChatUser } from "./src/lib/storage";

type Screen = { name: "login" } | { name: "list" } | { name: "chat"; conversationId: string };

export default function App() {
  const [me, setMe] = useState<ChatUser | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "login" });

  function handleLogin(user: ChatUser) {
    setMe(user);
    setScreen({ name: "list" });
  }

  function handleLogout() {
    setMe(null);
    setScreen({ name: "login" });
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {screen.name === "login" && (
        <LoginScreen onLogin={handleLogin} />
      )}
      {screen.name === "list" && me && (
        <ChatListScreen
          me={me}
          onOpenChat={(id) => setScreen({ name: "chat", conversationId: id })}
          onLogout={handleLogout}
        />
      )}
      {screen.name === "chat" && me && (
        <ChatRoomScreen
          me={me}
          conversationId={screen.conversationId}
          onBack={() => setScreen({ name: "list" })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111b21" },
});

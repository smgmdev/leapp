import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { View, StyleSheet, Platform } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import LoginScreen from "./src/screens/LoginScreen";
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatRoomScreen from "./src/screens/ChatRoomScreen";
import { ChatUser } from "./src/lib/storage";

type Screen = { name: "login" } | { name: "list" } | { name: "chat"; conversationId: string };

function AppContent() {
  const [me, setMe] = useState<ChatUser | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "login" });
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="light" backgroundColor="#202c33" />
      {screen.name === "login" && (
        <LoginScreen onLogin={(user) => { setMe(user); setScreen({ name: "list" }); }} />
      )}
      {screen.name === "list" && me && (
        <ChatListScreen
          me={me}
          onOpenChat={(id) => setScreen({ name: "chat", conversationId: id })}
          onLogout={() => { setMe(null); setScreen({ name: "login" }); }}
        />
      )}
      {screen.name === "chat" && me && (
        <ChatRoomScreen
          me={me}
          conversationId={screen.conversationId}
          onBack={() => setScreen({ name: "list" })}
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111b21" },
});

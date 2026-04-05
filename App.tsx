import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import LoginScreen from "./src/screens/LoginScreen";
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatRoomScreen from "./src/screens/ChatRoomScreen";
import { ChatUser } from "./src/lib/storage";

type Screen = { name: "login" } | { name: "list" } | { name: "chat"; conversationId: string };

function AppContent() {
  const [me, setMe] = useState<ChatUser | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "login" });
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const insets = useSafeAreaInsets();

  // Check for updates on app start
  useEffect(() => {
    checkForUpdate();
  }, []);

  async function checkForUpdate() {
    if (__DEV__) return; // Skip in development
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateAvailable(true);
      }
    } catch {}
  }

  async function doUpdate() {
    setUpdating(true);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      setUpdating(false);
      setUpdateAvailable(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="light" backgroundColor="#202c33" />

      {/* Update banner */}
      {updateAvailable && !updating && (
        <TouchableOpacity style={styles.updateBanner} onPress={doUpdate}>
          <Text style={styles.updateText}>New update available</Text>
          <Text style={styles.updateBtn}>Update Now</Text>
        </TouchableOpacity>
      )}

      {/* Updating modal */}
      <Modal visible={updating} transparent animationType="fade">
        <View style={styles.updatingOverlay}>
          <View style={styles.updatingCard}>
            <ActivityIndicator size="large" color="#00a884" />
            <Text style={styles.updatingText}>Updating...</Text>
            <Text style={styles.updatingSubtext}>App will restart automatically</Text>
          </View>
        </View>
      </Modal>

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
  updateBanner: { backgroundColor: "#00a884", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  updateText: { color: "#fff", fontSize: 13, fontWeight: "500" },
  updateBtn: { color: "#fff", fontSize: 13, fontWeight: "bold", backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  updatingOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  updatingCard: { backgroundColor: "#202c33", borderRadius: 20, padding: 40, alignItems: "center" },
  updatingText: { color: "#fff", fontSize: 18, fontWeight: "600", marginTop: 16 },
  updatingSubtext: { color: "#8696a0", fontSize: 13, marginTop: 4 },
});

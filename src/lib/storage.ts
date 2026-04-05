import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ChatUser {
  id: string;
  username: string;
  display_name: string;
}

export async function getUser(): Promise<ChatUser | null> {
  const data = await AsyncStorage.getItem("chat_user");
  return data ? JSON.parse(data) : null;
}

export async function setUser(user: ChatUser): Promise<void> {
  await AsyncStorage.setItem("chat_user", JSON.stringify(user));
}

export async function clearUser(): Promise<void> {
  await AsyncStorage.removeItem("chat_user");
}

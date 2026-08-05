import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

const API_URL = "http://100.108.52.79:5000/api";
const TELEGRAM_BOT_URL = "https://t.me/CorridorAuthBot"; // Replace with your actual bot username

export default function AuthScreen({ navigation }) {
  // Mode toggle: "signin" or "register"
  const [authMode, setAuthMode] = useState("signin");

  // Form fields
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("rider"); // "rider" for passenger or "driver"
  
  // States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const [waitingForTelegram, setWaitingForTelegram] = useState(false);

  // Poll server to check if Telegram verification / login has completed
  useEffect(() => {
    let interval;
    if (waitingForTelegram) {
      interval = setInterval(async () => {
        try {
          const endpoint = authMode === "register" 
            ? `${API_URL}/auth/check-status/${pendingSessionId}`
            : `${API_URL}/auth/check-signin/${pendingSessionId}`;

          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            
            if (data.success || data.phone_verified) {
              clearInterval(interval);
              setWaitingForTelegram(false);

              const userRole = data.role || role;
              const userId = data.userId || pendingSessionId;

              if (userRole === "driver" && authMode === "register") {
                navigation.replace("DriverPendingVerification", { userId });
              } else {
                navigation.replace("Passenger", { userId });
              }
            }
          }``
        } catch (err) {
          console.log("Polling error:", err);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [waitingForTelegram, pendingSessionId, authMode, role, navigation]);

  const handleAuthAction = async () => {
    if (authMode === "register" && !fullName.trim()) {
      Alert.alert("Name Required", "Please enter your full name to register.");
      return;
    }

    setIsSubmitting(true);
    try {
      let deepLink = "";

      if (authMode === "register") {
        // 1. Initialize registration record on backend
        const res = await fetch(`${API_URL}/auth/register-init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full_name: fullName, role: role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration init failed.");

        setPendingSessionId(data.userId);
        deepLink = `${TELEGRAM_BOT_URL}?start=verify_${data.userId}`;
      } else {
        // 2. Initialize sign-in tracking session ID
        const sessionId = "signin_" + Date.now();
        setPendingSessionId(sessionId);
        deepLink = `${TELEGRAM_BOT_URL}?start=login_${sessionId}`;
      }

      // Open Telegram Bot
      const supported = await Linking.canOpenURL(deepLink);
      if (supported) {
        await Linking.openURL(deepLink);
        setWaitingForTelegram(true);
      } else {
        Alert.alert("Error", "Could not open Telegram. Ensure Telegram is installed.");
      }
    } catch (err) {
      Alert.alert("Authentication Error", err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBox}>
        <Text style={styles.title}>Corridor</Text>
        <Text style={styles.subtitle}>Verified smart transport across Addis Ababa.</Text>
      </View>

      <View style={styles.formCard}>
        {/* 🔀 TOGGLE TABS: SIGN IN vs REGISTER */}
        <View style={styles.modeToggleRow}>
          <TouchableOpacity
            style={[styles.modeTab, authMode === "signin" && styles.activeModeTab]}
            onPress={() => { setAuthMode("signin"); setWaitingForTelegram(false); }}
          >
            <Text style={[styles.modeTabText, authMode === "signin" && styles.activeModeTabText]}>
              Sign In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, authMode === "register" && styles.activeModeTab]}
            onPress={() => { setAuthMode("register"); setWaitingForTelegram(false); }}
          >
            <Text style={[styles.modeTabText, authMode === "register" && styles.activeModeTabText]}>
              Register
            </Text>
          </TouchableOpacity>
        </View>

        {/* 📝 CONDITIONAL FIELDS FOR REGISTRATION */}
        {authMode === "register" && (
          <>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Abebe Kebede"
              value={fullName}
              onChangeText={setFullName}
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.inputLabel}>I want to register as:</Text>
            <View style={styles.roleToggleRow}>
              <TouchableOpacity
                style={[styles.roleButton, role === "rider" && styles.activeRolePassenger]}
                onPress={() => setRole("rider")}
              >
                <Ionicons name="people" size={18} color={role === "rider" ? "#FFF" : "#4B5563"} />
                <Text style={[styles.roleText, role === "rider" && styles.activeRoleText]}>Passenger</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleButton, role === "driver" && styles.activeRoleDriver]}
                onPress={() => setRole("driver")}
              >
                <FontAwesome5 name="car" size={14} color={role === "driver" ? "#FFF" : "#4B5563"} />
                <Text style={[styles.roleText, role === "driver" && styles.activeRoleText]}>Driver</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* 🚀 ACTION AREA */}
        {waitingForTelegram ? (
          <View style={styles.waitingContainer}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.waitingText}>
              {authMode === "register" ? "Verifying Phone via Telegram..." : "Signing in via Telegram..."}
            </Text>
            <Text style={styles.waitingSubtext}>
              Please tap &quot;Share Contact&quot; in our Telegram bot to proceed.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.telegramButton}
            onPress={handleAuthAction}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.telegramButtonText}>
                  {authMode === "register" ? "Register with Telegram" : "Sign In with Telegram"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", paddingHorizontal: 20, justifyContent: "center" },
  headerBox: { marginBottom: 24, alignItems: "center" },
  title: { fontSize: 28, fontWeight: "900", color: "#111827" },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 4, fontWeight: "600" },
  
  formCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#E5E7EB", elevation: 2 },
  
  modeToggleRow: { flexDirection: "row", backgroundColor: "#F3F4F6", padding: 4, borderRadius: 12, marginBottom: 20 },
  modeTab: { flex: 1, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  activeModeTab: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  modeTabText: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  activeModeTabText: { color: "#111827", fontWeight: "900" },

  inputLabel: { fontSize: 11, fontWeight: "800", color: "#6B7280", marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" },
  textInput: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#111827", fontWeight: "600", marginBottom: 16 },
  
  roleToggleRow: { flexDirection: "row", backgroundColor: "#F3F4F6", padding: 4, borderRadius: 12, marginBottom: 20 },
  roleButton: { flex: 1, flexDirection: "row", height: 42, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  activeRolePassenger: { backgroundColor: "#111827" },
  activeRoleDriver: { backgroundColor: "#059669" },
  roleText: { fontSize: 13, fontWeight: "700", marginLeft: 6, color: "#4B5563" },
  activeRoleText: { color: "#FFFFFF" },

  telegramButton: { backgroundColor: "#229ED9", borderRadius: 12, paddingVertical: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", shadowColor: "#229ED9", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  telegramButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },

  waitingContainer: { alignItems: "center", paddingVertical: 10 },
  waitingText: { fontSize: 13, fontWeight: "800", color: "#059669", marginTop: 10, textAlign: "center" },
  waitingSubtext: { fontSize: 11, color: "#6B7280", textAlign: "center", marginTop: 4, lineHeight: 16 },
});
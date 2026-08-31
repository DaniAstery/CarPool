import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../AuthContext";
import RoleSelectionModal from "./RoleSelectionModal"; // Adjust path if needed

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://98.89.38.224:5000/api";

const TELEGRAM_BOT_URL = "https://t.me/CorridorAuthBot"; 

export default function RegistrationScreen() {
  const { loginSession } = useAuth();
  const [authMode, setAuthMode] = useState("signin");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("rider"); 
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waitingForTelegram, setWaitingForTelegram] = useState(false);

  // 🔀 Multi-role selection modal states
  const [isRoleSelectionVisible, setIsRoleSelectionVisible] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState([]);

  const sessionIdRef = useRef(null);
  const authModeRef = useRef(authMode);

  useEffect(() => {
    authModeRef.current = authMode;
  }, [authMode]);

  // Core function to check auth status against backend
  const checkAuthStatus = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!waitingForTelegram || !currentSessionId) return;

    try {
      const endpoint = authModeRef.current === "register" 
        ? `${API_URL}/auth/check-status/${currentSessionId}`
        : `${API_URL}/auth/check-signin/${currentSessionId}`;

      console.log(`[Auth Polling] Checking endpoint: ${endpoint}`);
      const res = await fetch(endpoint);
      const responseText = await res.text();
      console.log(`[Auth Polling] Response (${res.status}):`, responseText);

      if (res.ok) {
        const data = JSON.parse(responseText);
        
        if (data.success || data.phone_verified) {
          
          // 🔀 CHECK FOR MULTI-ROLE ACCOUNTS
          if (data.requiresRoleSelection && data.accounts) {
            setWaitingForTelegram(false);
            console.log("[Auth Success] Multiple roles detected for this phone number. Prompting user selection.");
            
            setAvailableAccounts(data.accounts);
            setIsRoleSelectionVisible(true);
            return; // Stop here and wait for user to pick a role
          }

          // ⚡ SINGLE ACCOUNT FLOW (Standard)
          setWaitingForTelegram(false);

          const userRole = data.role || role;
          const userId = data.userId || data.id || currentSessionId;

          console.log(`[Auth Success] Logging in user ID: ${userId}, Role: ${userRole}`);
          await loginSession({
            id: userId,
            role: userRole,
            phone_verified: true,
          });
        }
      }
    } catch (err) {
      console.error("[Auth Polling Error]:", err.message);
    }
  };

  // 1. Regular interval polling while waiting
  useEffect(() => {
    let interval;
    if (waitingForTelegram) {
      console.log("[Auth Polling] Interval active...");
      interval = setInterval(checkAuthStatus, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [waitingForTelegram, role, loginSession]);

  // 2. AppState listener: Check immediately when returning from Telegram app
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        console.log("[App State] Returned to app. Checking auth status...");
        checkAuthStatus();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleAuthAction = async () => {
    if (authMode === "register" && !fullName.trim()) {
      Alert.alert("Name Required", "Please enter your full name to register.");
      return;
    }

    setIsSubmitting(true);
    try {
      let deepLink = "";
      let sessionId = "";

      if (authMode === "register") {
        const res = await fetch(`${API_URL}/auth/register-init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full_name: fullName.trim(), role: role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration initialization failed.");

        sessionId = data.userId;
        deepLink = `${TELEGRAM_BOT_URL}?start=verify_${sessionId}`;
      } else {
        const res = await fetch(`${API_URL}/auth/signin-init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Sign-in initialization failed.");

        sessionId = data.sessionId;
        deepLink = `${TELEGRAM_BOT_URL}?start=login_${sessionId}`;
      }

      sessionIdRef.current = sessionId;
      console.log(`[Auth Action] Opening Telegram deep link with session: ${sessionId}`);

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

  const handleCancelWaiting = () => {
    setWaitingForTelegram(false);
    sessionIdRef.current = null;
  };

  // 🎯 STEP 3: Handle the user's workspace choice from the modal
  const handleSelectRole = async (selectedAccount) => {
    setIsRoleSelectionVisible(false);
    console.log(`[Role Selected] Logging in as ${selectedAccount.role} (ID: ${selectedAccount.id})`);
    
    await loginSession({
      id: selectedAccount.id,
      role: selectedAccount.role,
      phone_verified: true,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBox}>
        <Text style={styles.title}>Corridor</Text>
        <Text style={styles.subtitle}>Verified smart transport across Addis Ababa.</Text>
      </View>

      <View style={styles.formCard}>
        {/* MODE TOGGLE TABS */}
        <View style={styles.modeToggleRow}>
          <TouchableOpacity
            style={[styles.modeTab, authMode === "signin" && styles.activeModeTab]}
            onPress={() => { setAuthMode("signin"); handleCancelWaiting(); }}
          >
            <Text style={[styles.modeTabText, authMode === "signin" && styles.activeModeTabText]}>
              Sign In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, authMode === "register" && styles.activeModeTab]}
            onPress={() => { setAuthMode("register"); handleCancelWaiting(); }}
          >
            <Text style={[styles.modeTabText, authMode === "register" && styles.activeModeTabText]}>
              Register
            </Text>
          </TouchableOpacity>
        </View>

        {/* REGISTRATION FIELDS */}
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

        {/* WAITING AREA */}
        {waitingForTelegram ? (
          <View style={styles.waitingContainer}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.waitingText}>
              {authMode === "register" ? "Verifying Phone via Telegram..." : "Signing in via Telegram..."}
            </Text>
            <Text style={styles.waitingSubtext}>
              Please tap &quot;Share Contact&quot; inside Telegram, then return here.
            </Text>

            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelWaiting}>
              <Text style={styles.cancelButtonText}>Cancel / Try Again</Text>
            </TouchableOpacity>
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

      {/* 🔀 NATIVE MULTI-ROLE SELECTION MODAL */}
      <RoleSelectionModal
        visible={isRoleSelectionVisible}
        accounts={availableAccounts}
        onSelectRole={handleSelectRole}
      />
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
  waitingSubtext: { fontSize: 11, color: "#6B7280", textAlign: "center", marginTop: 6, lineHeight: 16 },

  cancelButton: { marginTop: 16, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "#F3F4F6", borderRadius: 8 },
  cancelButtonText: { fontSize: 12, fontWeight: "700", color: "#4B5563" },
});
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
  Modal,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../AuthContext";
import RoleSelectionModal from "./RoleSelectionModal";

const API_URL_SignTG = process.env.EXPO_PUBLIC_API_URL_SignTG || "http://100.108.52.79:5000/api";
const TELEGRAM_BOT_URL = "https://t.me/CorridorAuthBot"; 

export default function RegistrationScreen() {
  const { loginSession } = useAuth();
  const [authMode, setAuthMode] = useState("signin");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("rider"); 
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waitingForTelegram, setWaitingForTelegram] = useState(false);

  // Multi-role selection modal states
  const [isRoleSelectionVisible, setIsRoleSelectionVisible] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState([]);

  // Profile Photo Setup Modal states
  const [isPhotoModalVisible, setIsPhotoModalVisible] = useState(false);
  const [pendingUser, setPendingUser] = useState(null); // { id, role }
  const [selectedImage, setSelectedImage] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const sessionIdRef = useRef(null);
  const authModeRef = useRef(authMode);
  const waitingRef = useRef(waitingForTelegram);

  useEffect(() => {
    authModeRef.current = authMode;
  }, [authMode]);

  useEffect(() => {
    waitingRef.current = waitingForTelegram;
  }, [waitingForTelegram]);

  // Helper: Route to Photo Upload if missing, otherwise proceed to login
  const handlePostAuthRouting = (userObj) => {
    // Prompt photo upload if registering or if profile_photo_url is missing
    const hasPhoto = userObj.profile_photo_url && !userObj.profile_photo_url.includes("placehold.co");
    
    if (authModeRef.current === "register" || !hasPhoto) {
      setPendingUser(userObj);
      setIsPhotoModalVisible(true);
    } else {
      finalizeLogin(userObj);
    }
  };

  const finalizeLogin = async (userObj) => {
    console.log(`[Auth Success] Logging in user ID: ${userObj.id}, Role: ${userObj.role}`);
    await loginSession({
      id: userObj.id,
      role: userObj.role,
      phone_verified: true,
      profile_photo_url: userObj.profile_photo_url || null,
    });
  };

  // Check auth status against backend
  const checkAuthStatus = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!waitingRef.current || !currentSessionId) return;

    try {
      const endpoint = authModeRef.current === "register" 
        ? `${API_URL_SignTG}/auth/check-status/${currentSessionId}`
        : `${API_URL_SignTG}/auth/check-signin/${currentSessionId}`;

      const res = await fetch(endpoint);
      const responseText = await res.text();

      if (responseText.trim().startsWith("<")) {
        console.error("[Auth Error] Server returned HTML instead of JSON.");
        return;
      }

      if (res.ok) {
        const data = JSON.parse(responseText);
        
        if (data.success || data.phone_verified) {
          setWaitingForTelegram(false);

          if (data.requiresRoleSelection && data.accounts) {
            setAvailableAccounts(data.accounts);
            setIsRoleSelectionVisible(true);
            return; 
          }

          const userRole = data.role || role;
          const userId = data.userId || data.id || currentSessionId;

          handlePostAuthRouting({
            id: userId,
            role: userRole,
            profile_photo_url: data.profile_photo_url,
          });
        }
      }
    } catch (err) {
      console.error("[Auth Polling Error]:", err.message);
    }
  };

  // Regular interval polling while waiting
  useEffect(() => {
    let interval;
    if (waitingForTelegram) {
      interval = setInterval(checkAuthStatus, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [waitingForTelegram]);

  // AppState listener: Check immediately when returning from Telegram app
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
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
        const targetUrl = `${API_URL_SignTG}/auth/register-init`;
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full_name: fullName.trim(), role: role }),
        });
        
        const responseText = await res.text();
        if (responseText.trim().startsWith("<")) {
          throw new Error(`Server returned HTML instead of JSON at ${targetUrl}.`);
        }

        const data = JSON.parse(responseText);
        if (!res.ok) throw new Error(data.error || "Registration initialization failed.");

        sessionId = data.userId;
        deepLink = `${TELEGRAM_BOT_URL}?start=verify_${sessionId}`;
      } else {
        const targetUrl = `${API_URL_SignTG}/auth/signin-init`;
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const responseText = await res.text();
        if (responseText.trim().startsWith("<")) {
          throw new Error(`Server returned HTML instead of JSON at ${targetUrl}.`);
        }

        const data = JSON.parse(responseText);
        if (!res.ok) throw new Error(data.error || "Sign-in initialization failed.");

        sessionId = data.sessionId;
        deepLink = `${TELEGRAM_BOT_URL}?start=login_${sessionId}`;
      }

      sessionIdRef.current = sessionId;

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

  const handleSelectRole = (selectedAccount) => {
    setIsRoleSelectionVisible(false);
    handlePostAuthRouting({
      id: selectedAccount.id,
      role: selectedAccount.role,
      profile_photo_url: selectedAccount.profile_photo_url,
    });
  };

  // 📷 PHOTO PICKER & UPLOAD LOGIC
  const handlePickPhoto = async (useCamera = false) => {
    const permissionResult = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert("Permission Required", `Camera/Gallery access is needed to upload your photo.`);
      return;
    }

    const pickerResult = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });

    if (!pickerResult.canceled && pickerResult.assets[0]) {
      setSelectedImage(pickerResult.assets[0]);
    }
  };

  const handleUploadPhoto = async () => {
    if (!selectedImage || !pendingUser) return;

    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", {
        uri: selectedImage.uri,
        type: "image/jpeg",
        name: `user_${pendingUser.id}_avatar.jpg`,
      });
      formData.append("userId", pendingUser.id);

      const res = await fetch(`${API_URL_SignTG}/users/upload-photo`, {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = await res.json();
      if (res.ok && data.photoUrl) {
        setIsPhotoModalVisible(false);
        finalizeLogin({ ...pendingUser, profile_photo_url: data.photoUrl });
      } else {
        throw new Error(data.error || "Failed to upload profile photo.");
      }
    } catch (err) {
      Alert.alert("Upload Failed", err.message || "Could not upload image. Please try again.");
    } finally {
      setIsUploadingPhoto(false);
    }
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

      {/* MULTI-ROLE SELECTION MODAL */}
      <RoleSelectionModal
        visible={isRoleSelectionVisible}
        accounts={availableAccounts}
        onSelectRole={handleSelectRole}
      />

      {/* 🖼️ PROFILE PHOTO CAPTURE MODAL */}
      <Modal visible={isPhotoModalVisible} animationType="slide" transparent={true}>
        <View style={styles.photoModalOverlay}>
          <View style={styles.photoModalCard}>
            <Text style={styles.photoModalTitle}>Profile Identification</Text>
            <Text style={styles.photoModalSub}>
              {pendingUser?.role === "driver"
                ? "Drivers are required to have a clear face photo for passenger safety at pickup hubs."
                : "Add a profile photo so your driver can identify you easily at pickup points."}
            </Text>

            {/* PREVIEW CONTAINER */}
            <View style={styles.avatarPreviewBox}>
              {selectedImage ? (
                <Image source={{ uri: selectedImage.uri }} style={styles.avatarPreviewImage} />
              ) : (
                <Ionicons name="person" size={54} color="#94A3B8" />
              )}
            </View>

            {/* PICKER BUTTONS */}
            <View style={styles.photoPickerRow}>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => handlePickPhoto(true)}>
                <Ionicons name="camera" size={18} color="#059669" />
                <Text style={styles.pickerBtnText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pickerBtn} onPress={() => handlePickPhoto(false)}>
                <Ionicons name="images" size={18} color="#059669" />
                <Text style={styles.pickerBtnText}>Choose Gallery</Text>
              </TouchableOpacity>
            </View>

            {/* ACTION BUTTONS */}
            {selectedImage ? (
              <TouchableOpacity
                style={styles.uploadConfirmBtn}
                onPress={handleUploadPhoto}
                disabled={isUploadingPhoto}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.uploadConfirmText}>Save & Continue</Text>
                )}
              </TouchableOpacity>
            ) : (
              pendingUser?.role === "rider" && (
                <TouchableOpacity
                  style={styles.skipBtn}
                  onPress={() => {
                    setIsPhotoModalVisible(false);
                    finalizeLogin(pendingUser);
                  }}
                >
                  <Text style={styles.skipBtnText}>Skip for Now</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>
      </Modal>

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

  // PHOTO MODAL STYLES
  photoModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  photoModalCard: { width: "100%", backgroundColor: "#FFFFFF", borderRadius: 20, padding: 22, alignItems: "center" },
  photoModalTitle: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 6 },
  photoModalSub: { fontSize: 12, color: "#64748B", textAlign: "center", marginBottom: 16, lineHeight: 18 },
  avatarPreviewBox: { width: 110, height: 110, borderRadius: 55, backgroundColor: "#F1F5F9", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#CBD5E1", overflow: "hidden", marginBottom: 16 },
  avatarPreviewImage: { width: "100%", height: "100%" },
  photoPickerRow: { flexDirection: "row", marginBottom: 16 },
  pickerBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(5, 150, 105, 0.08)", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: "rgba(5, 150, 105, 0.2)", marginHorizontal: 4 },
  pickerBtnText: { fontSize: 12, fontWeight: "700", color: "#059669", marginLeft: 6 },
  uploadConfirmBtn: { backgroundColor: "#059669", width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  uploadConfirmText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  skipBtn: { marginTop: 12, paddingVertical: 8 },
  skipBtnText: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
});
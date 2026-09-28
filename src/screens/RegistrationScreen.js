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
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../AuthContext";
import RoleSelectionModal from "./RoleSelectionModal";



const { width } = Dimensions.get("window");

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const TELEGRAM_BOT_URL = process.env.EXPO_PUBLIC_TELEGRAM_BOT_URL;



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
  const [pendingUser, setPendingUser] = useState(null); 
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

  // Helper: Route to Photo Upload if registering and missing photo, otherwise proceed straight to login
  const handlePostAuthRouting = (userObj) => {
    const hasPhoto = userObj.profile_photo_url && !userObj.profile_photo_url.includes("placehold.co");
    
    if (authModeRef.current === "register" && !hasPhoto) {
      setPendingUser(userObj);
      setIsPhotoModalVisible(true);
    } else {
      finalizeLogin(userObj);
    }
  };

  const finalizeLogin = async (userObj) => {
    console.log(`[Auth Success] Logging in User ID: ${userObj.id}, Name: ${userObj.full_name}, Role: ${userObj.role}`);
    await loginSession({
      id: userObj.id,
      full_name: userObj.full_name || fullName.trim() || "",
      role: userObj.role,
      phone_verified: true,
      profile_photo_url: userObj.profile_photo_url || null,
      wallet_balance: userObj.wallet_balance || 0,
    });
  };

  // Check auth status against backend
  const checkAuthStatus = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!waitingRef.current || !currentSessionId) return;

    try {
      const endpoint = authModeRef.current === "register" 
        ? `${API_URL}/auth/check-status/${currentSessionId}`
        : `${API_URL}/auth/check-signin/${currentSessionId}`;

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
          const userFullName = data.full_name || data.name || fullName.trim() || "";
          const userWallet = parseFloat(data.wallet_balance || data.balance || 0);

          handlePostAuthRouting({
            id: userId,
            full_name: userFullName,
            role: userRole,
            profile_photo_url: data.profile_photo_url,
            wallet_balance: userWallet,
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
        const targetUrl = `${API_URL}/auth/register-init`;
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
        const targetUrl = `${API_URL}/auth/signin-init`;
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
      full_name: selectedAccount.full_name || selectedAccount.name || "",
      role: selectedAccount.role,
      profile_photo_url: selectedAccount.profile_photo_url,
      wallet_balance: parseFloat(selectedAccount.wallet_balance || 0),
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

      const res = await fetch(`${API_URL}/users/upload-photo`, {
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
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          
          {/* HEADER BRANDING WITH ASSET LOGO */}
          <View style={styles.headerBox}>
            <View style={styles.logoContainer}>
              <Image 
                source={require("../../assets/icon.png")} 
                style={styles.logoImage} 
                resizeMode="cover"
              />
            </View>
            <Text style={styles.title}>Corridor</Text>
            <Text style={styles.subtitle}>Smart Ride Pooling & Dispatch across Addis Ababa</Text>
          </View>

          {/* GLASSMORPHISM / PREMIUM CARD CONTAINER */}
          <View style={styles.formCard}>
            
            {/* MODERN PILL TAB TOGGLE */}
            <View style={styles.modeToggleRow}>
              <TouchableOpacity
                style={[styles.modeTab, authMode === "signin" && styles.activeModeTab]}
                onPress={() => { setAuthMode("signin"); handleCancelWaiting(); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeTabText, authMode === "signin" && styles.activeModeTabText]}>
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeTab, authMode === "register" && styles.activeModeTab]}
                onPress={() => { setAuthMode("register"); handleCancelWaiting(); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeTabText, authMode === "register" && styles.activeModeTabText]}>
                  Register
                </Text>
              </TouchableOpacity>
            </View>

            {/* REGISTRATION CONDITIONAL INPUTS */}
            {authMode === "register" && (
              <View style={styles.registerFieldsContainer}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g., Abebe Kebede"
                    value={fullName}
                    onChangeText={setFullName}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <Text style={styles.inputLabel}>I want to join as:</Text>
                <View style={styles.roleToggleRow}>
                  <TouchableOpacity
                    style={[styles.roleButton, role === "rider" && styles.activeRolePassenger]}
                    onPress={() => setRole("rider")}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="people" size={18} color={role === "rider" ? "#FFF" : "#4B5563"} />
                    <Text style={[styles.roleText, role === "rider" && styles.activeRoleText]}>Passenger</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.roleButton, role === "driver" && styles.activeRoleDriver]}
                    onPress={() => setRole("driver")}
                    activeOpacity={0.8}
                  >
                    <FontAwesome5 name="car" size={14} color={role === "driver" ? "#FFF" : "#4B5563"} />
                    <Text style={[styles.roleText, role === "driver" && styles.activeRoleText]}>Driver</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* INTERACTIVE TELEGRAM ACTION & WAITING AREA */}
            <View style={styles.actionSection}>
              {waitingForTelegram ? (
                <View style={styles.waitingContainer}>
                  <View style={styles.pulsingIndicatorBox}>
                    <ActivityIndicator size="large" color="#059669" />
                  </View>
                  <Text style={styles.waitingText}>
                    {authMode === "register" ? "Verifying Telegram Profile..." : "Authenticating Session..."}
                  </Text>
                  <Text style={styles.waitingSubtext}>
                    Please tap <Text style={{ fontWeight: "700", color: "#111827" }}>&quot;Share Contact&quot;</Text> inside Telegram, then return here.
                  </Text>

                  <TouchableOpacity style={styles.cancelButton} onPress={handleCancelWaiting} activeOpacity={0.8}>
                    <Text style={styles.cancelButtonText}>Cancel / Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.telegramButton}
                  onPress={handleAuthAction}
                  disabled={isSubmitting}
                  activeOpacity={0.85}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <View style={styles.tgIconCircle}>
                        <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                      </View>
                      <Text style={styles.telegramButtonText}>
                        {authMode === "register" ? "Continue with Telegram" : "Sign In with Telegram"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* TRUST BADGE FOOTER */}
            <View style={styles.trustBadgeRow}>
              <MaterialCommunityIcons name="shield-check" size={16} color="#059669" />
              <Text style={styles.trustBadgeText}>Secured via Telegram OAuth & PostgreSQL</Text>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
            <View style={styles.modalIndicatorBar} />
            <Text style={styles.photoModalTitle}>Profile Verification</Text>
            <Text style={styles.photoModalSub}>
              {pendingUser?.role === "driver"
                ? "Drivers are required to display a clear facial photo for passenger identification at pickup hubs."
                : "Add a friendly profile picture so your assigned pool driver can spot you easily."}
            </Text>

            {/* PREVIEW CONTAINER */}
            <View style={styles.avatarPreviewBox}>
              {selectedImage ? (
                <Image source={{ uri: selectedImage.uri }} style={styles.avatarPreviewImage} />
              ) : (
                <Ionicons name="camera-reverse-outline" size={48} color="#94A3B8" />
              )}
            </View>

            {/* PICKER BUTTONS */}
            <View style={styles.photoPickerRow}>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => handlePickPhoto(true)} activeOpacity={0.8}>
                <Ionicons name="camera" size={18} color="#059669" />
                <Text style={styles.pickerBtnText}>Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pickerBtn} onPress={() => handlePickPhoto(false)} activeOpacity={0.8}>
                <Ionicons name="images" size={18} color="#059669" />
                <Text style={styles.pickerBtnText}>Gallery</Text>
              </TouchableOpacity>
            </View>

            {/* ACTION BUTTONS WITH SKIP ACCESSIBLE TO ALL ROLES */}
            {selectedImage ? (
              <TouchableOpacity
                style={styles.uploadConfirmBtn}
                onPress={handleUploadPhoto}
                disabled={isUploadingPhoto}
                activeOpacity={0.85}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.uploadConfirmText}>Save & Launch App</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => {
                  setIsPhotoModalVisible(false);
                  finalizeLogin(pendingUser);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.skipBtnText}>Skip for Now</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContainer: { flexGrow: 1, paddingHorizontal: 20, justifyContent: "center", paddingBottom: 30 },
  
  headerBox: { marginBottom: 28, alignItems: "center" },
  logoContainer: { 
    width: 80, 
    height: 80, 
    borderRadius: 24, 
    backgroundColor: "#FFFFFF", 
    justifyContent: "center", 
    alignItems: "center", 
    marginBottom: 16, 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 8 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 16, 
    elevation: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  logoImage: { width: "100%", height: "100%" },
  title: { fontSize: 32, fontWeight: "900", color: "#0F172A", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 6, fontWeight: "600", textAlign: "center", paddingHorizontal: 20 },
  
  formCard: { 
    backgroundColor: "#FFFFFF", 
    borderRadius: 24, 
    padding: 22, 
    borderWidth: 1, 
    borderColor: "#E2E8F0", 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 20, 
    elevation: 4 
  },
  
  modeToggleRow: { flexDirection: "row", backgroundColor: "#F1F5F9", padding: 4, borderRadius: 14, marginBottom: 20 },
  modeTab: { flex: 1, height: 44, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  activeModeTab: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  modeTabText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  activeModeTabText: { color: "#0F172A", fontWeight: "900" },

  registerFieldsContainer: { width: "100%" },
  inputLabel: { fontSize: 11, fontWeight: "800", color: "#64748B", marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" },
  inputWrapper: { position: "relative", justifyContent: "center", marginBottom: 16 },
  inputIcon: { position: "absolute", left: 14, zIndex: 1 },
  textInput: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, paddingLeft: 42, paddingRight: 14, paddingVertical: 12, fontSize: 14, color: "#0F172A", fontWeight: "600" },
  
  roleToggleRow: { flexDirection: "row", backgroundColor: "#F1F5F9", padding: 4, borderRadius: 14, marginBottom: 20 },
  roleButton: { flex: 1, flexDirection: "row", height: 44, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  activeRolePassenger: { backgroundColor: "#0F172A" },
  activeRoleDriver: { backgroundColor: "#059669" },
  roleText: { fontSize: 13, fontWeight: "700", marginLeft: 8, color: "#64748B" },
  activeRoleText: { color: "#FFFFFF" },

  actionSection: { marginTop: 4 },
  telegramButton: { backgroundColor: "#229ED9", borderRadius: 14, paddingVertical: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", shadowColor: "#229ED9", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  tgIconCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center", marginRight: 10 },
  telegramButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14, letterSpacing: 0.3 },

  waitingContainer: { alignItems: "center", paddingVertical: 12 },
  pulsingIndicatorBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(5, 150, 105, 0.1)", justifyContent: "center", alignItems: "center", marginBottom: 8 },
  waitingText: { fontSize: 14, fontWeight: "800", color: "#059669", marginTop: 6, textAlign: "center" },
  waitingSubtext: { fontSize: 12, color: "#64748B", textAlign: "center", marginTop: 6, lineHeight: 18, paddingHorizontal: 10 },

  cancelButton: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: "#F1F5F9", borderRadius: 10 },
  cancelButtonText: { fontSize: 12, fontWeight: "700", color: "#475569" },

  trustBadgeRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  trustBadgeText: { fontSize: 11, fontWeight: "700", color: "#94A3B8", marginLeft: 6 },

  // PHOTO MODAL STYLES
  photoModalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.65)", justifyContent: "flex-end" },
  photoModalCard: { width: "100%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, alignItems: "center", paddingBottom: 40 },
  modalIndicatorBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", marginBottom: 16 },
  photoModalTitle: { fontSize: 20, fontWeight: "900", color: "#0F172A", marginBottom: 8 },
  photoModalSub: { fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 20, lineHeight: 20, paddingHorizontal: 10 },
  avatarPreviewBox: { width: 120, height: 120, borderRadius: 60, backgroundColor: "#F1F5F9", justifyContent: "center", alignItems: "center", borderWidth: 3, borderColor: "#E2E8F0", overflow: "hidden", marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  avatarPreviewImage: { width: "100%", height: "100%" },
  photoPickerRow: { flexDirection: "row", marginBottom: 20, width: "100%", justifyContent: "space-between" },
  pickerBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(5, 150, 105, 0.08)", paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(5, 150, 105, 0.2)", marginHorizontal: 6 },
  pickerBtnText: { fontSize: 13, fontWeight: "800", color: "#059669", marginLeft: 8 },
  uploadConfirmBtn: { backgroundColor: "#059669", width: "100%", paddingVertical: 16, borderRadius: 16, alignItems: "center", shadowColor: "#059669", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  uploadConfirmText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  skipBtn: { marginTop: 14, paddingVertical: 10 },
  skipBtnText: { fontSize: 13, fontWeight: "700", color: "#94A3B8" },
});
import React, { useState } from "react";
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  ScrollView, 
  KeyboardAvoidingView, 
  Platform,
  Alert 
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../AuthContext"; // Ensure this path matches your project structure

const API_URL = "http://192.168.1.3:5000/api";

export default function AuthScreen() {
  const { loginSession } = useAuth();
  
  // Mode toggle: "login" or "register"
  const [authMode, setAuthMode] = useState("login");

  // Common Fields
  const [phoneNumber, setPhoneNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("rider"); // default passenger
  const [imageUri, setImageUri] = useState(null);

  // Driver-Specific Fields
  const [vehicleModel, setVehicleModel] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  const [loading, setLoading] = useState(false);

  // 📸 Launch Camera Roll Module
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert("Permission Denied", "Corridor needs access to your camera roll to upload a profile photo.");
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  // 🚀 Submit Action
  const handleAuthAction = async () => {
    if (!phoneNumber) {
      Alert.alert("Error", "Please enter your phone number.");
      return;
    }

    if (authMode === "register") {
      if (!fullName) {
        Alert.alert("Error", "Please provide your full name.");
        return;
      }
      if (role === "driver" && (!vehicleModel || !licensePlate || !licenseNumber)) {
        Alert.alert("Error", "Please fill in all vehicle compliance metrics.");
        return;
      }
    }

    setLoading(true);
    const formData = new FormData();
    
    formData.append("phone_number", phoneNumber);
    formData.append("role", role);

    if (authMode === "register") {
      formData.append("full_name", fullName);
      formData.append("email", email);

      if (role === "driver") {
        formData.append("vehicle_model", vehicleModel);
        formData.append("license_plate", licensePlate);
        formData.append("license_number", licenseNumber);
      }

      if (imageUri) {
        const filename = imageUri.split("/").pop();
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image`;

        formData.append("photo", {
          uri: Platform.OS === "android" ? imageUri : imageUri.replace("file://", ""),
          name: filename,
          type: type,
        });
      }
    }

    try {
      const response = await fetch(`${API_URL}/auth/verify-otp`, {
        method: "POST",
        body: formData,
        headers: {
          "Accept": "application/json",
          "Content-Type": "multipart/form-data",
        },
      });

      const data = await response.json();
      setLoading(false);

      if (response.ok) {
        Alert.alert("Success", data.message || "Authentication successful.");
        await loginSession(data.user);
      } else {
        Alert.alert("Authentication Failed", data.error || "Validation block exception.");
      }
    } catch (error) {
      setLoading(false);
      console.error(error);
      Alert.alert("Connection Fault", "Could not synchronize with Corridor servers.");
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Brand Header Icon */}
        <View style={styles.brandHeaderIcon}>
          <FontAwesome5 name="car-side" size={26} color="#059669" />
        </View>

        <Text style={styles.title}>Corridor</Text>
        <Text style={styles.subtitle}>
          {authMode === "login" 
            ? "Welcome back! Enter your phone number to sign in." 
            : "Enter your details to initialize your ride-pooling identity."}
        </Text>

        {/* 🔀 Segmented Tab Switcher (Sign In vs Register) */}
        <View style={styles.modeContainer}>
          <TouchableOpacity 
            style={[styles.modeButton, authMode === "login" && styles.activeModeButton]} 
            onPress={() => setAuthMode("login")}
          >
            <Text style={[styles.modeButtonText, authMode === "login" && styles.activeModeButtonText]}>Sign In</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.modeButton, authMode === "register" && styles.activeModeButton]} 
            onPress={() => setAuthMode("register")}
          >
            <Text style={[styles.modeButtonText, authMode === "register" && styles.activeModeButtonText]}>Register</Text>
          </TouchableOpacity>
        </View>

        {/* 📷 Avatar Image Picker Button (Only shown during Register) */}
        {authMode === "register" && (
          <TouchableOpacity style={styles.photoPicker} onPress={pickImage} activeOpacity={0.8}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.avatar} />
            ) : (
              <View style={styles.placeholderAvatar}>
                <Ionicons name="camera-outline" size={24} color="#059669" />
                <Text style={styles.placeholderText}>Add Photo</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* 🎭 Role Toggle Selectors (Only shown during Register) */}
        {authMode === "register" && (
          <View style={styles.roleContainer}>
            <TouchableOpacity 
              style={[styles.roleButton, role === "rider" && styles.activeRoleButton]} 
              onPress={() => setRole("rider")}
            >
              <Ionicons name="person-outline" size={16} color={role === "rider" ? "#059669" : "#6B7280"} style={{ marginRight: 6 }} />
              <Text style={[styles.roleButtonText, role === "rider" && styles.activeRoleButtonText]}>Passenger</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.roleButton, role === "driver" && styles.activeRoleButton]} 
              onPress={() => setRole("driver")}
            >
              <FontAwesome5 name="steering-wheel" size={14} color={role === "driver" ? "#059669" : "#6B7280"} style={{ marginRight: 6 }} />
              <Text style={[styles.roleButtonText, role === "driver" && styles.activeRoleButtonText]}>Driver</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 📝 Core Input Fields */}
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput 
            style={styles.textInputWithIcon} 
            placeholder="Phone Number (e.g., +2519...)" 
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />
        </View>

        {authMode === "register" && (
          <>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput 
                style={styles.textInputWithIcon} 
                placeholder="Full Name" 
                placeholderTextColor="#9CA3AF"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput 
                style={styles.textInputWithIcon} 
                placeholder="Email Address (Optional)" 
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </>
        )}

        {/* 🚗 Dynamic Driver Context Block */}
        {authMode === "register" && role === "driver" && (
          <View style={styles.driverSection}>
            <Text style={styles.sectionHeader}>Vehicle Compliance Verification</Text>
            
            <View style={styles.inputWrapper}>
              <FontAwesome5 name="car" size={16} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput 
                style={styles.textInputWithIcon} 
                placeholder="Vehicle Model (e.g., Toyota Probox)" 
                placeholderTextColor="#9CA3AF"
                value={vehicleModel}
                onChangeText={setVehicleModel}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="card-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput 
                style={styles.textInputWithIcon} 
                placeholder="License Plate (e.g., Code 3 - A0000)" 
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                value={licensePlate}
                onChangeText={setLicensePlate}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput 
                style={styles.textInputWithIcon} 
                placeholder="Driver License Number" 
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                value={licenseNumber}
                onChangeText={setLicenseNumber}
              />
            </View>
          </View>
        )}

        {/* 🏁 Action Trigger Button */}
        <TouchableOpacity style={styles.submitButton} onPress={handleAuthAction} disabled={loading} activeOpacity={0.85}>
          <Text style={styles.submitButtonText}>
            {loading ? "Processing..." : authMode === "login" ? "Sign In to Corridor" : "Verify & Onboard"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, alignItems: "center", paddingTop: 50, paddingBottom: 40 },
  brandHeaderIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#ECFDF5", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "800", color: "#111827", letterSpacing: 0.3, marginBottom: 6 },
  subtitle: { fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 24, paddingHorizontal: 10 },
  
  modeContainer: { flexDirection: "row", marginBottom: 24, backgroundColor: "#F3F4F6", borderRadius: 12, padding: 4, width: "100%" },
  modeButton: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  activeModeButton: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  modeButtonText: { color: "#6B7280", fontWeight: "600", fontSize: 13 },
  activeModeButtonText: { color: "#059669", fontWeight: "700" },

  photoPicker: { marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: "#059669" },
  placeholderAvatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#ECFDF5", justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#A7F3D0", borderStyle: "dashed" },
  placeholderText: { color: "#059669", fontSize: 11, fontWeight: "600", marginTop: 4 },

  roleContainer: { flexDirection: "row", marginBottom: 20, width: "100%", gap: 12 },
  roleButton: { flex: 1, flexDirection: "row", paddingVertical: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12 },
  activeRoleButton: { backgroundColor: "#ECFDF5", borderColor: "#059669" },
  roleButtonText: { color: "#6B7280", fontWeight: "600", fontSize: 13 },
  activeRoleButtonText: { color: "#059669", fontWeight: "700" },

  inputWrapper: { flexDirection: "row", alignItems: "center", width: "100%", height: 52, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, marginBottom: 14, backgroundColor: "#F9FAFB" },
  inputIcon: { marginRight: 12 },
  textInputWithIcon: { flex: 1, fontSize: 14, color: "#111827", height: "100%" },

  driverSection: { width: "100%", marginTop: 6 },
  sectionHeader: { fontSize: 13, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, marginTop: 4 },

  submitButton: { width: "100%", height: 52, backgroundColor: "#059669", borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 16, shadowColor: "#059669", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 },
  submitButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", letterSpacing: 0.5 }
});
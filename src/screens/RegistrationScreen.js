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
      // 🎯 Using your correct verified backend endpoint
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
      style={{ flex: 1, backgroundColor: "#fff" }}
    >
      <ScrollView contentContainerStyle={styles.container}>
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
          <TouchableOpacity style={styles.photoPicker} onPress={pickImage}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.avatar} />
            ) : (
              <View style={styles.placeholderAvatar}>
                <Text style={styles.placeholderText}>📸 Add Photo</Text>
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
              <Text style={[styles.roleButtonText, role === "rider" && styles.activeRoleButtonText]}>Passenger</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.roleButton, role === "driver" && styles.activeRoleButton]} 
              onPress={() => setRole("driver")}
            >
              <Text style={[styles.roleButtonText, role === "driver" && styles.activeRoleButtonText]}>Driver</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 📝 Core Input Fields */}
        <TextInput 
          style={styles.input} 
          placeholder="Phone Number (e.g., +2519...)" 
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
        />

        {authMode === "register" && (
          <>
            <TextInput 
              style={styles.input} 
              placeholder="Full Name" 
              value={fullName}
              onChangeText={setFullName}
            />

            <TextInput 
              style={styles.input} 
              placeholder="Email Address (Optional)" 
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </>
        )}

        {/* 🚗 Dynamic Driver Context Block */}
        {authMode === "register" && role === "driver" && (
          <View style={styles.driverSection}>
            <Text style={styles.sectionHeader}>Vehicle Compliance Verification</Text>
            
            <TextInput 
              style={styles.input} 
              placeholder="Vehicle Model (e.g., Toyota Probox)" 
              value={vehicleModel}
              onChangeText={setVehicleModel}
            />
            <TextInput 
              style={styles.input} 
              placeholder="License Plate (e.g., Code 3 - A0000)" 
              autoCapitalize="characters"
              value={licensePlate}
              onChangeText={setLicensePlate}
            />
            <TextInput 
              style={styles.input} 
              placeholder="Driver License Number" 
              autoCapitalize="characters"
              value={licenseNumber}
              onChangeText={setLicenseNumber}
            />
          </View>
        )}

        {/* 🏁 Action Trigger Button */}
        <TouchableOpacity style={styles.submitButton} onPress={handleAuthAction} disabled={loading}>
          <Text style={styles.submitButtonText}>
            {loading ? "Processing..." : authMode === "login" ? "Sign In to Corridor" : "Verify & Onboard"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, alignItems: "center", paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "bold", color: "#1A1A1A", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 20 },
  modeContainer: { flexDirection: "row", marginBottom: 24, borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 8, overflow: "hidden", width: "100%" },
  modeButton: { flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: "#FAFAFA" },
  activeModeButton: { backgroundColor: "#000" },
  modeButtonText: { color: "#666", fontWeight: "600" },
  activeModeButtonText: { color: "#FFF" },
  photoPicker: { marginBottom: 20 },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  placeholderAvatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#DDD", borderStyle: "dashed" },
  placeholderText: { color: "#666", fontSize: 13, fontWeight: "500" },
  roleContainer: { flexDirection: "row", marginBottom: 20, borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 8, overflow: "hidden", width: "100%" },
  roleButton: { flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: "#FAFAFA" },
  activeRoleButton: { backgroundColor: "#007BFF" },
  roleButtonText: { color: "#666", fontWeight: "600" },
  activeRoleButtonText: { color: "#FFF" },
  input: { width: "100%", height: 50, borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 8, paddingHorizontal: 16, marginBottom: 16, fontSize: 15, backgroundColor: "#FAFAFA" },
  driverSection: { width: "100%", marginTop: 4 },
  sectionHeader: { fontSize: 15, fontWeight: "bold", color: "#333", marginBottom: 12, marginTop: 4 },
  submitButton: { width: "100%", height: 52, backgroundColor: "#000", borderRadius: 8, justifyContent: "center", alignItems: "center", marginTop: 16 },
  submitButtonText: { color: "#FFF", fontSize: 16, fontWeight: "bold" }
});
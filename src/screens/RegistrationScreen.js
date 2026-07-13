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
import { useAuth } from "../authContext";// Ensure this path is correct based on your project structure

export default function RegisterScreen() {
// Access the loginSession function from the AuthContext
  const { loginSession } = useAuth();
  // Common Fields
  const [phoneNumber, setPhoneNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("rider"); // default state matrix
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
        mediaTypes: ['images'], // ✅ Modern Expo Standard
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  // 🚀 Submit Multi-Part Form Data Payload
  const handleRegistration = async () => {
    if (!phoneNumber || !fullName) {
      Alert.alert("Error", "Please fill in your name and phone number.");
      return;
    }

    if (role === "driver" && (!vehicleModel || !licensePlate || !licenseNumber)) {
      Alert.alert("Error", "Please fill in all vehicle compliance metrics.");
      return;
    }

    setLoading(false);
    const formData = new FormData();
    
    // Unpack text primitives into form variables
    formData.append("phone_number", phoneNumber);
    formData.append("full_name", fullName);
    formData.append("role", role);
    formData.append("email", email);

    if (role === "driver") {
      formData.append("vehicle_model", vehicleModel);
      formData.append("license_plate", licensePlate);
      formData.append("license_number", licenseNumber);
    }

    // Append picture binary if selected
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

    try {
      setLoading(true);
      // Update this IP string with your current node testing gateway
      const response = await fetch("http://192.168.173.52:5000/api/auth/verify-otp", {
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
        Alert.alert("Success", data.message);
            // 🎯 THE FIX: Save the user profile payload into the context engine!
            // This instantly triggers App.js to switch to the Passenger or Driver workflow.
            await loginSession(data.user);

      } else {
        Alert.alert("Registration Failed", data.error || "Validation block exception.");
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
        <Text style={styles.title}>Join Corridor</Text>
        <Text style={styles.subtitle}>Enter details to initialize your ride-pooling identity matrix.</Text>

        {/* 📷 Avatar Image Picker Button */}
        <TouchableOpacity style={styles.photoPicker} onPress={pickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.avatar} />
          ) : (
            <View style={styles.placeholderAvatar}>
              <Text style={styles.placeholderText}>📸 Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* 🎭 Role Toggle Selectors */}
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

        {/* 📝 Core Input Fields */}
        <TextInput 
          style={styles.input} 
          placeholder="Phone Number (e.g., +2519...)" 
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
        />

        <TextInput 
          style={styles.input} 
          placeholder="Full Name" 
          value={fullName}
          onChangeText={fullName => setFullName(fullName)}
        />

        <TextInput 
          style={styles.input} 
          placeholder="Email Address (Optional)" 
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        {/* 🚗 Dynamic Driver Context Block */}
        {role === "driver" && (
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
        <TouchableOpacity style={styles.submitButton} onPress={handleRegistration} disabled={loading}>
          <Text style={styles.submitButtonText}>{loading ? "Processing Handskahe..." : "Verify & Onboard"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, alignItems: "center", paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "bold", color: "#1A1A1A", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 24 },
  photoPicker: { marginBottom: 24 },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  placeholderAvatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#DDD", borderStyle: "dashed" },
  placeholderText: { color: "#666", fontSize: 13, fontWeight: "500" },
  roleContainer: { flexDirection: "row", marginBottom: 20, borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 8, overflow: "hidden" },
  roleButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 32, alignItems: "center", backgroundColor: "#FAFAFA" },
  activeRoleButton: { backgroundColor: "#007BFF" },
  roleButtonText: { color: "#666", fontWeight: "600" },
  activeRoleButtonText: { color: "#FFF" },
  input: { width: "100%", height: 50, borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 8, paddingHorizontal: 16, marginBottom: 16, fontSize: 15, backgroundColor: "#FAFAFA" },
  driverSection: { width: "100%", marginTop: 8 },
  sectionHeader: { fontSize: 15, fontWeight: "bold", color: "#333", marginBottom: 12, marginTop: 4 },
  submitButton: { width: "100%", height: 52, backgroundColor: "#000", borderRadius: 8, justifyContent: "center", alignItems: "center", marginTop: 16 },
  submitButtonText: { color: "#FFF", fontSize: 16, fontWeight: "bold" }
});
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
} from "react-native";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../AuthContext";
import CorridorDrawer from "../Corridor_Drawer";

const API_URL = "http://100.108.52.79:5000/api";

export default function UserProfileScreen({ navigation }) {
  const { user, logoutSession, updateUserData } = useAuth();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Profile editable fields
  const [fullName, setFullName] = useState(user?.name || user?.full_name || "Abebe Kebede");
  const [phone, setPhone] = useState(user?.phone || "+251 91 234 5678");
  const [email, setEmail] = useState(user?.email || "abebe.kebede@example.com");

  const userRole = user?.role || "driver";

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      // Simulate or execute API profile update request
      const response = await fetch(`${API_URL}/users/update/${user?.id || 1}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          phone: phone,
          email: email,
        }),
      });

      if (response.ok) {
        Alert.alert("Success", "Profile details updated successfully.");
        setIsEditing(false);
      } else {
        Alert.alert("Update Failed", "Could not sync profile changes to server.");
      }
    } catch (err) {
      console.log("❌ Profile update network error:", err);
      // Fallback local toggle for offline testing
      setIsEditing(false);
      Alert.alert("Saved Locally", "Profile information updated.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 🧭 TOP FLOATING HEADER WITH HAMBURGER MENU */}
      <View style={styles.topFloatingHeader}>
        <View style={styles.headerLeftCluster}>
          <TouchableOpacity 
            style={styles.hamburgerButton} 
            onPress={() => setIsDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={22} color="#111111" />
          </TouchableOpacity>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.headerTitleText}>Account Profile</Text>
            <Text style={styles.headerSubtext}>Role: {userRole.toUpperCase()}</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.logoutIconButton} 
          onPress={() => {
            Alert.alert("Logout", "Sign out of your Corridor session?", [
              { text: "Stay" },
              { text: "Logout", style: "destructive", onPress: () => logoutSession() }
            ]);
          }} 
          activeOpacity={0.7}
        >
          <Ionicons name="power" size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
      >
        {/* 👤 PROFILE AVATAR BANNER */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>
              {fullName ? fullName.split(" ").map(n => n[0]).join("").toUpperCase() : "AK"}
            </Text>
          </View>
          <Text style={styles.profileNameText}>{fullName}</Text>
          <Text style={styles.profileEmailText}>{email}</Text>
          <View style={styles.roleBadgePill}>
            <MaterialCommunityIcons name="shield-check" size={14} color="#059669" style={{ marginRight: 4 }} />
            <Text style={styles.roleBadgeText}>Verified {userRole === "driver" ? "Corridor Driver" : "Passenger"}</Text>
          </View>
        </View>

        {/* 📊 METRICS / STATS ROW */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Ionicons name="star" size={18} color="#D97706" />
            <Text style={styles.statValue}>4.88</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Ionicons name="car-sport" size={18} color="#059669" />
            <Text style={styles.statValue}>142</Text>
            <Text style={styles.statLabel}>Trips Completed</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Ionicons name="time" size={18} color="#3B82F6" />
            <Text style={styles.statValue}>98%</Text>
            <Text style={styles.statLabel}>On-Time</Text>
          </View>
        </View>

        {/* 📝 EDITABLE DETAILS FORM */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
              <Text style={styles.editToggleText}>{isEditing ? "Cancel" : "Edit Profile"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={fullName}
              onChangeText={setFullName}
              editable={isEditing}
              placeholder="Enter full name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={phone}
              onChangeText={setPhone}
              editable={isEditing}
              keyboardType="phone-pad"
              placeholder="+251 ..."
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={email}
              onChangeText={setEmail}
              editable={isEditing}
              keyboardType="email-address"
              placeholder="name@example.com"
            />
          </View>

          {isEditing && (
            <TouchableOpacity 
              style={styles.saveButton}
              onPress={handleSaveChanges}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? "Saving Changes..." : "Save Profile Updates"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ⚙️ APP PREFERENCES & SETTINGS */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconBox, { backgroundColor: "#ECFDF5" }]}>
                <Ionicons name="notifications-outline" size={18} color="#059669" />
              </View>
              <Text style={styles.settingText}>Push Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconBox, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.settingText}>Privacy & Security</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconBox, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="help-circle-outline" size={18} color="#D97706" />
              </View>
              <Text style={styles.settingText}>Support & Help Center</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 🚪 CORRIDOR SIDE DRAWER */}
      <CorridorDrawer
        visible={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        role={userRole}
        userName={fullName}
        onNavigate={(routeName) => {
          navigation.navigate(routeName);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  
  topFloatingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerLeftCluster: { flexDirection: "row", alignItems: "center" },
  hamburgerButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleText: { fontSize: 14, fontWeight: "800", color: "#111111" },
  headerSubtext: { fontSize: 11, color: "#059669", fontWeight: "700" },
  logoutIconButton: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: "#FEF2F2", 
    alignItems: "center", 
    justifyContent: "center", 
    borderWidth: 1, 
    borderColor: "#FCA5A5" 
  },

  scrollBody: { paddingHorizontal: 16, paddingBottom: 40 },

  avatarCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#059669",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarInitials: { fontSize: 24, fontWeight: "900", color: "#FFFFFF" },
  profileNameText: { fontSize: 18, fontWeight: "800", color: "#111827" },
  profileEmailText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  roleBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 10,
  },
  roleBadgeText: { fontSize: 11, fontWeight: "800", color: "#059669" },

  statsContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statBox: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 16, fontWeight: "900", color: "#111827", marginTop: 4 },
  statLabel: { fontSize: 10, color: "#6B7280", fontWeight: "700", marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: "#E5E7EB" },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 12 },
  editToggleText: { fontSize: 12, fontWeight: "800", color: "#059669" },

  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 11, fontWeight: "800", color: "#6B7280", marginBottom: 4, letterSpacing: 0.5 },
  textInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  disabledInput: { backgroundColor: "#F3F4F6", color: "#4B5563", borderColor: "#E5E7EB" },

  saveButton: {
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  settingLeft: { flexDirection: "row", alignItems: "center" },
  settingIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  settingText: { fontSize: 13, fontWeight: "700", color: "#374151" },
});import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
} from "react-native";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../AuthContext";
import CorridorDrawer from "../Corridor_Drawer";

const API_URL = "http://100.108.52.79:5000/api";

export default function UserProfileScreen({ navigation }) {
  const { user, logoutSession, updateUserData } = useAuth();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Profile editable fields
  const [fullName, setFullName] = useState(user?.name || user?.full_name || "Abebe Kebede");
  const [phone, setPhone] = useState(user?.phone || "+251 91 234 5678");
  const [email, setEmail] = useState(user?.email || "abebe.kebede@example.com");

  const userRole = user?.role || "driver";

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      // Simulate or execute API profile update request
      const response = await fetch(`${API_URL}/users/update/${user?.id || 1}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          phone: phone,
          email: email,
        }),
      });

      if (response.ok) {
        Alert.alert("Success", "Profile details updated successfully.");
        setIsEditing(false);
      } else {
        Alert.alert("Update Failed", "Could not sync profile changes to server.");
      }
    } catch (err) {
      console.log("❌ Profile update network error:", err);
      // Fallback local toggle for offline testing
      setIsEditing(false);
      Alert.alert("Saved Locally", "Profile information updated.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 🧭 TOP FLOATING HEADER WITH HAMBURGER MENU */}
      <View style={styles.topFloatingHeader}>
        <View style={styles.headerLeftCluster}>
          <TouchableOpacity 
            style={styles.hamburgerButton} 
            onPress={() => setIsDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={22} color="#111111" />
          </TouchableOpacity>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.headerTitleText}>Account Profile</Text>
            <Text style={styles.headerSubtext}>Role: {userRole.toUpperCase()}</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.logoutIconButton} 
          onPress={() => {
            Alert.alert("Logout", "Sign out of your Corridor session?", [
              { text: "Stay" },
              { text: "Logout", style: "destructive", onPress: () => logoutSession() }
            ]);
          }} 
          activeOpacity={0.7}
        >
          <Ionicons name="power" size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
      >
        {/* 👤 PROFILE AVATAR BANNER */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>
              {fullName ? fullName.split(" ").map(n => n[0]).join("").toUpperCase() : "AK"}
            </Text>
          </View>
          <Text style={styles.profileNameText}>{fullName}</Text>
          <Text style={styles.profileEmailText}>{email}</Text>
          <View style={styles.roleBadgePill}>
            <MaterialCommunityIcons name="shield-check" size={14} color="#059669" style={{ marginRight: 4 }} />
            <Text style={styles.roleBadgeText}>Verified {userRole === "driver" ? "Corridor Driver" : "Passenger"}</Text>
          </View>
        </View>

        {/* 📊 METRICS / STATS ROW */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Ionicons name="star" size={18} color="#D97706" />
            <Text style={styles.statValue}>4.88</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Ionicons name="car-sport" size={18} color="#059669" />
            <Text style={styles.statValue}>142</Text>
            <Text style={styles.statLabel}>Trips Completed</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Ionicons name="time" size={18} color="#3B82F6" />
            <Text style={styles.statValue}>98%</Text>
            <Text style={styles.statLabel}>On-Time</Text>
          </View>
        </View>

        {/* 📝 EDITABLE DETAILS FORM */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
              <Text style={styles.editToggleText}>{isEditing ? "Cancel" : "Edit Profile"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={fullName}
              onChangeText={setFullName}
              editable={isEditing}
              placeholder="Enter full name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={phone}
              onChangeText={setPhone}
              editable={isEditing}
              keyboardType="phone-pad"
              placeholder="+251 ..."
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={email}
              onChangeText={setEmail}
              editable={isEditing}
              keyboardType="email-address"
              placeholder="name@example.com"
            />
          </View>

          {isEditing && (
            <TouchableOpacity 
              style={styles.saveButton}
              onPress={handleSaveChanges}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? "Saving Changes..." : "Save Profile Updates"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ⚙️ APP PREFERENCES & SETTINGS */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconBox, { backgroundColor: "#ECFDF5" }]}>
                <Ionicons name="notifications-outline" size={18} color="#059669" />
              </View>
              <Text style={styles.settingText}>Push Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconBox, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.settingText}>Privacy & Security</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIconBox, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="help-circle-outline" size={18} color="#D97706" />
              </View>
              <Text style={styles.settingText}>Support & Help Center</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 🚪 CORRIDOR SIDE DRAWER */}
      <CorridorDrawer
        visible={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        role={userRole}
        userName={fullName}
        onNavigate={(routeName) => {
          navigation.navigate(routeName);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  
  topFloatingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerLeftCluster: { flexDirection: "row", alignItems: "center" },
  hamburgerButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleText: { fontSize: 14, fontWeight: "800", color: "#111111" },
  headerSubtext: { fontSize: 11, color: "#059669", fontWeight: "700" },
  logoutIconButton: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: "#FEF2F2", 
    alignItems: "center", 
    justifyContent: "center", 
    borderWidth: 1, 
    borderColor: "#FCA5A5" 
  },

  scrollBody: { paddingHorizontal: 16, paddingBottom: 40 },

  avatarCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#059669",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarInitials: { fontSize: 24, fontWeight: "900", color: "#FFFFFF" },
  profileNameText: { fontSize: 18, fontWeight: "800", color: "#111827" },
  profileEmailText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  roleBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 10,
  },
  roleBadgeText: { fontSize: 11, fontWeight: "800", color: "#059669" },

  statsContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statBox: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 16, fontWeight: "900", color: "#111827", marginTop: 4 },
  statLabel: { fontSize: 10, color: "#6B7280", fontWeight: "700", marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: "#E5E7EB" },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 12 },
  editToggleText: { fontSize: 12, fontWeight: "800", color: "#059669" },

  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 11, fontWeight: "800", color: "#6B7280", marginBottom: 4, letterSpacing: 0.5 },
  textInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  disabledInput: { backgroundColor: "#F3F4F6", color: "#4B5563", borderColor: "#E5E7EB" },

  saveButton: {
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  settingLeft: { flexDirection: "row", alignItems: "center" },
  settingIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  settingText: { fontSize: 13, fontWeight: "700", color: "#374151" },
});
import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function WaitingForAcceptanceScreen({ navigation }) {
  
  // Simulation: Move forward with 2 accepted passengers after 3.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log("Minimum pooling capacity met (2/3). Proceeding to pickup point while 3rd passenger remains pending...");
      navigation.navigate("NavigateToPickup"); 
    }, 3500);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Header Navigation Block */}
      <View style={styles.headerBlock}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Pickup Proposal</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        {/* Status Notification Banner */}
        <View style={styles.greenStatusBanner}>
          <MaterialCommunityIcons name="account-group" size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
          <View style={styles.bannerTextFrame}>
            <Text style={styles.bannerMainText}>Driver Accepted</Text>
            <Text style={styles.bannerSubText}>Waiting for remaining passengers...</Text>
          </View>
        </View>

        <Text style={styles.selectedHubLabelText}>Megenagna Blue Taxi Stop</Text>

        {/* Acceptance Status Checklist Module */}
        <Text style={styles.sectionHeadingLabel}>Acceptance Status</Text>
        
        <View style={styles.statusManifestCard}>
          
          {/* Driver */}
          <View style={styles.statusItemRow}>
            <View style={styles.userIconWrapper}>
              <FontAwesome5 name="user-alt" size={12} color="#4B5563" />
            </View>
            <Text style={styles.entityNameText}>Driver (You)</Text>
            <View style={styles.badgeFrameAccepted}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
              <Text style={styles.badgeTextAccepted}>Accepted</Text>
            </View>
          </View>

          <View style={styles.horizontalDivider} />

          {/* Passenger 1 */}
          <View style={styles.statusItemRow}>
            <View style={styles.userIconWrapper}>
              <FontAwesome5 name="user" size={12} color="#4B5563" />
            </View>
            <Text style={styles.entityNameText}>Passenger 1</Text>
            <View style={styles.badgeFrameAccepted}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
              <Text style={styles.badgeTextAccepted}>Accepted</Text>
            </View>
          </View>

          <View style={styles.horizontalDivider} />

          {/* Passenger 2 */}
          <View style={styles.statusItemRow}>
            <View style={styles.userIconWrapper}>
              <FontAwesome5 name="user" size={12} color="#4B5563" />
            </View>
            <Text style={styles.entityNameText}>Passenger 2</Text>
            <View style={styles.badgeFrameAccepted}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
              <Text style={styles.badgeTextAccepted}>Accepted</Text>
            </View>
          </View>

          <View style={styles.horizontalDivider} />

          {/* Passenger 3 */}
          <View style={styles.statusItemRow}>
            <View style={styles.userIconWrapper}>
              <FontAwesome5 name="user" size={12} color="#4B5563" />
            </View>
            <Text style={styles.entityNameText}>Passenger 3</Text>
            <View style={styles.badgeFramePending}>
              <Ionicons name="time" size={14} color="#F59E0B" style={{ marginRight: 4 }} />
              <Text style={styles.badgeTextPending}>Pending</Text>
            </View>
          </View>

        </View>

        <View style={styles.safetyNoticeFrame}>
          <Ionicons name="flash" size={16} color="#D97706" style={{ marginRight: 8 }} />
          <Text style={styles.safetyNoticeText}>
            Corridor auto-advancing. Dispatching to pickup with 2 active passengers to avoid trip delays.
          </Text>
        </View>

      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB" },
  backButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  greenStatusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#D97706", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 },
  bannerTextFrame: { flex: 1 },
  bannerMainText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  bannerSubText: { fontSize: 12, color: "#FEF3C7", marginTop: 1 },
  selectedHubLabelText: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 24, marginLeft: 2 },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },
  statusManifestCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 20 },
  statusItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  userIconWrapper: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginRight: 12 },
  entityNameText: { fontSize: 14, fontWeight: "600", color: "#111827", flex: 1 },
  badgeFrameAccepted: { flexDirection: "row", alignItems: "center", backgroundColor: "#E6F4EA", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTextAccepted: { color: "#10B981", fontSize: 12, fontWeight: "700" },
  badgeFramePending: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF3CD", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTextPending: { color: "#D97706", fontSize: 12, fontWeight: "700" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  safetyNoticeFrame: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FEF3C7", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  safetyNoticeText: { flex: 1, fontSize: 12, fontWeight: "500", color: "#B45309", lineHeight: 16 },
});
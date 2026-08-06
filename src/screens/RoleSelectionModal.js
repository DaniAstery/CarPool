import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function RoleSelectionModal({ visible, accounts, onSelectRole }) {
  if (!visible || !accounts) return null;

  return (
    <Modal visible={visible} transparent={true} animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle}>CHOOSE WORKSPACE</Text>
            <Ionicons name="phone-portrait-outline" size={20} color="#059669" />
          </View>

          <Text style={styles.modalSubtitle}>
            This phone number is registered with multiple roles. Select which account you want to sign into:
          </Text>

          {accounts.map((account) => {
            const isDriver = account.role === "driver";
            return (
              <TouchableOpacity
                key={`account-${account.id}`}
                style={[styles.roleCard, isDriver ? styles.driverCard : styles.riderCard]}
                onPress={() => onSelectRole(account)}
              >
                <Image
                  source={{ uri: account.profile_photo_url || "https://placehold.co/150" }}
                  style={styles.avatar}
                />
                <View style={styles.roleInfo}>
                  <Text style={styles.roleName}>{account.full_name}</Text>
                  <Text style={styles.roleType}>
                    {isDriver ? "🚖 Driver Workspace" : "🎒 Passenger Workspace"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={isDriver ? "#FFFFFF" : "#111111"} />
              </TouchableOpacity>
            );
          })}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: width * 0.88,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 15,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 13, fontWeight: "800", color: "#111111", letterSpacing: 1 },
  modalSubtitle: { fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 18 },

  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  riderCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  driverCard: {
    backgroundColor: "#1E293B",
    borderColor: "#334155",
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E2E8F0" },
  roleInfo: { flex: 1, marginLeft: 12 },
  roleName: { fontSize: 14, fontWeight: "700", color: "#111111" },
  roleType: { fontSize: 12, color: "#059669", fontWeight: "600", marginTop: 2 },
});
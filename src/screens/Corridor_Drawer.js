import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  Dimensions,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function CorridorDrawer({ visible, onClose, role, userName, onNavigate }) {
  const isDriver = role === "driver";

  const driverOptions = [
    { title: "1. User Profile", subtitle: userName || "Driver", route: "ProfileScreen" },
    { title: "2. Linked Payment Methods", subtitle: "CBE, Telebirr", route: "PaymentsScreen" },
    { title: "3. Active Trip History", subtitle: "Detailed", route: "TripHistoryScreen" },
    { title: "4. My Earned Points", subtitle: "Gold Tier", route: "RewardsScreen" },
    { title: "5. Legal & Documents", subtitle: "License, NID", route: "DocumentsScreen" },
    { title: "6. Platform Support", subtitle: "Help & FAQ", route: "SupportScreen" },
  ];

  const passengerOptions = [
    { title: "1. User Profile", subtitle: userName || "Passenger", route: "ProfileScreen" },
    { title: "2. Preferred Payment", subtitle: "Linked Accounts", route: "PaymentsScreen" },
    { title: "3. Past Ride History", subtitle: "Basic List", route: "TripHistoryScreen" },
    { title: "4. Available Rewards", subtitle: "Points & Promos", route: "RewardsScreen" },
    { title: "5. Security & Privacy", subtitle: "Settings", route: "SecurityScreen" },
    { title: "6. Help Center", subtitle: "Support", route: "SupportScreen" },
  ];

  const options = isDriver ? driverOptions : passengerOptions;

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.drawerContainer, isDriver ? styles.darkDrawer : styles.lightDrawer]}>
              
              {/* HEADER */}
              <View style={styles.drawerHeader}>
                <Text style={[styles.drawerTitle, isDriver ? styles.darkText : styles.lightText]}>
                  {isDriver ? "DRIVER SETTINGS" : "PASSENGER SETTINGS"}
                </Text>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={20} color={isDriver ? "#FFFFFF" : "#111111"} />
                </TouchableOpacity>
              </View>

              {/* OPTIONS LIST */}
              {options.map((item, index) => (
                <TouchableOpacity
                  key={`drawer-option-${index}`}
                  style={[styles.optionRow, isDriver ? styles.darkBorder : styles.lightBorder]}
                  onPress={() => {
                    onClose();
                    if (onNavigate) onNavigate(item.route);
                  }}
                >
                  <View>
                    <Text style={[styles.optionTitle, isDriver ? styles.darkText : styles.lightText]}>
                      {item.title}
                    </Text>
                    <Text style={styles.optionSubtitle}>{item.subtitle}</Text>
                  </View>
                </TouchableOpacity>
              ))}

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingTop: 100,
    paddingLeft: 16,
  },
  drawerContainer: {
    width: width * 0.78,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  darkDrawer: { backgroundColor: "#1E293B" },
  lightDrawer: { backgroundColor: "#FFFFFF" },

  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,150,0.2)",
  },
  drawerTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.8 },
  
  optionRow: { paddingVertical: 10, borderBottomWidth: 0.5 },
  darkBorder: { borderBottomColor: "#334155" },
  lightBorder: { borderBottomColor: "#F1F5F9" },

  optionTitle: { fontSize: 14, fontWeight: "700" },
  optionSubtitle: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

  darkText: { color: "#FFFFFF" },
  lightText: { color: "#111111" },
});
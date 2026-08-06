import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../AuthContext";

const { width, height } = Dimensions.get("window");
const API_URL = "http://100.108.52.79:5000/api";

export default function CorridorDrawer({ visible, onClose, userId, role, onNavigate }) {
  const { logoutSession } = useAuth();
  const isDriver = role === "driver";

  const [profileData, setProfileData] = useState(null);
  const [activeSubView, setActiveSubView] = useState(null); // 'history', 'rewards', 'help', null
  const [tripHistory, setTripHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch live profile details on open
  useEffect(() => {
    if (visible && userId) {
      fetch(`${API_URL}/users/profile/${userId}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) setProfileData(data);
        })
        .catch((err) => console.log("Profile fetch error:", err));
    } else {
      setActiveSubView(null);
    }
  }, [visible, userId]);

  // Fetch trip history when requested
  const handleOpenHistory = async () => {
    setActiveSubView("history");
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_URL}/trips/history/${userId}/${role}`);
      const data = await res.json();
      if (Array.isArray(data)) setTripHistory(data);
    } catch (err) {
      console.log("History fetch error:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const passengerOptions = [
    { title: "1. Past Ride History", subtitle: "Last 5 completed trips", action: handleOpenHistory },
    { title: "2. Available Rewards", subtitle: "Promos & discount codes", action: () => setActiveSubView("rewards") },
    { title: "3. Help & Support Center", subtitle: "Contact support team", action: () => setActiveSubView("help") },
  ];

  const driverOptions = [
    { title: "1. Active Trip History", subtitle: "Last 5 completed runs", action: handleOpenHistory },
    { title: "2. My Earned Points & Tier", subtitle: "Gold Tier Status", action: () => setActiveSubView("rewards") },
    { title: "3. Legal & Documents", subtitle: "License & verification", action: () => setActiveSubView("help") },
    { title: "4. Platform Support", subtitle: "Help & FAQ", action: () => setActiveSubView("help") },
  ];

  const options = isDriver ? driverOptions : passengerOptions;

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.drawerContainer, isDriver ? styles.darkDrawer : styles.lightDrawer]}>
              
              {/* 👤 USER PROFILE HEADER (Replaces dedicated Profile Screen) */}
              <View style={[styles.profileHeader, isDriver ? styles.darkBorder : styles.lightBorder]}>
                <Image
                  source={{ uri: profileData?.profile_picture || "https://placehold.co/150" }}
                  style={styles.avatar}
                />
                <View style={styles.profileInfo}>
                  <Text style={[styles.profileName, isDriver ? styles.darkText : styles.lightText]}>
                    {profileData?.full_name || "Corridor User"}
                  </Text>
                  <Text style={styles.profileSub}>
                    ID: #{userId} • <Text style={{ textTransform: "capitalize", color: "#059669", fontWeight: "700" }}>{role}</Text>
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={20} color={isDriver ? "#FFFFFF" : "#111111"} />
                </TouchableOpacity>
              </View>

              {/* 🗂️ DYNAMIC CONTENT AREA */}
              {activeSubView === null ? (
                <View style={styles.optionsList}>
                  <Text style={[styles.sectionTitle, isDriver ? styles.darkTextSub : styles.lightTextSub]}>MENU NAVIGATION</Text>
                  
                  {options.map((item, index) => (
                    <TouchableOpacity
                      key={`drawer-option-${index}`}
                      style={[styles.optionRow, isDriver ? styles.darkBorder : styles.lightBorder]}
                      onPress={item.action}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionTitle, isDriver ? styles.darkText : styles.lightText]}>
                          {item.title}
                        </Text>
                        <Text style={styles.optionSubtitle}>{item.subtitle}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ))}

                  {/* 🚪 LOGOUT BUTTON */}
                  <TouchableOpacity 
                    style={styles.logoutRow} 
                    onPress={() => {
                      onClose();
                      logoutSession();
                    }}
                  >
                    <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                    <Text style={styles.logoutText}>Sign Out Session</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.subViewContainer}>
                  <TouchableOpacity style={styles.backRow} onPress={() => setActiveSubView(null)}>
                    <Ionicons name="arrow-back" size={16} color="#059669" />
                    <Text style={styles.backText}>Back to Menu</Text>
                  </TouchableOpacity>

                  {/* 📜 TRIP HISTORY VIEW */}
                  {activeSubView === "history" && (
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subViewTitle, isDriver ? styles.darkText : styles.lightText]}>Recent Completed Trips</Text>
                      {loadingHistory ? (
                        <ActivityIndicator size="small" color="#059669" style={{ marginTop: 20 }} />
                      ) : tripHistory.length === 0 ? (
                        <Text style={styles.emptyText}>No completed trips found yet.</Text>
                      ) : (
                        <ScrollView showsVerticalScrollIndicator={false}>
                          {tripHistory.map((trip, i) => (
                            <View key={`trip-${i}`} style={[styles.tripCard, isDriver ? styles.darkCard : styles.lightCard]}>
                              <Text style={[styles.tripCorridor, isDriver ? styles.darkText : styles.lightText]}>
                                {trip.corridor || "Corridor Route"}
                              </Text>
                              <View style={styles.tripRowDetails}>
                                <Text style={styles.tripPrice}>ETB {trip.price || "150"}</Text>
                                <Text style={styles.tripDate}>{new Date(trip.created_at).toLocaleDateString()}</Text>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  )}

                  {/* 🎁 REWARDS & PROMO INFO */}
                  {activeSubView === "rewards" && (
                    <View>
                      <Text style={[styles.subViewTitle, isDriver ? styles.darkText : styles.lightText]}>Rewards & Promos</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>💡 How discounts work:</Text>
                        <Text style={styles.infoBoxText}>
                          When your pooling core partner joins, your base rate discount is locked in automatically. You can also enter valid promo codes directly on the payment screen during checkout!
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* 🛟 HELP & SUPPORT */}
                  {activeSubView === "help" && (
                    <View>
                      <Text style={[styles.subViewTitle, isDriver ? styles.darkText : styles.lightText]}>Help Center</Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>📞 Corridor Support</Text>
                        <Text style={styles.infoBoxText}>
                          Need immediate assistance with a ride or payout? Contact our Addis Ababa dispatch support team via Telegram @CorridorSupport or call +251 911 000 000.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingTop: 60,
    paddingLeft: 12,
  },
  drawerContainer: {
    width: width * 0.82,
    maxHeight: height * 0.75,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 12,
  },
  darkDrawer: { backgroundColor: "#1E293B" },
  lightDrawer: { backgroundColor: "#FFFFFF" },

  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 14,
    marginBottom: 10,
    borderBottomWidth: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E2E8F0" },
  profileInfo: { flex: 1, marginLeft: 12 },
  profileName: { fontSize: 14, fontWeight: "700" },
  profileSub: { fontSize: 11, color: "#64748B", marginTop: 2 },
  closeButton: { padding: 4 },

  sectionTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 8, color: "#94A3B8" },
  optionsList: { paddingBottom: 6 },
  optionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 0.5 },
  darkBorder: { borderBottomColor: "#334155" },
  lightBorder: { borderBottomColor: "#F1F5F9" },

  optionTitle: { fontSize: 13, fontWeight: "700" },
  optionSubtitle: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

  logoutRow: { flexDirection: "row", alignItems: "center", paddingTop: 16, marginTop: 8 },
  logoutText: { fontSize: 13, fontWeight: "700", color: "#EF4444", marginLeft: 8 },

  subViewContainer: { minHeight: 220 },
  backRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backText: { fontSize: 12, fontWeight: "700", color: "#059669", marginLeft: 6 },
  subViewTitle: { fontSize: 14, fontWeight: "800", marginBottom: 12 },

  tripCard: { padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  darkCard: { backgroundColor: "#0F172A", borderColor: "#334155" },
  lightCard: { backgroundColor: "#F8FAFC", borderColor: "#E2E8F0" },
  tripCorridor: { fontSize: 12, fontWeight: "700" },
  tripRowDetails: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  tripPrice: { fontSize: 12, fontWeight: "800", color: "#059669" },
  tripDate: { fontSize: 10, color: "#94A3B8" },

  emptyText: { fontSize: 12, color: "#94A3B8", textAlign: "center", marginTop: 20 },
  infoBox: { padding: 12, backgroundColor: "rgba(5, 150, 105, 0.08)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(5, 150, 105, 0.2)" },
  infoBoxTitle: { fontSize: 12, fontWeight: "700", color: "#059669", marginBottom: 4 },
  infoBoxText: { fontSize: 12, color: "#475569", lineHeight: 18 },

  darkText: { color: "#FFFFFF" },
  darkTextSub: { color: "#94A3B8" },
  lightText: { color: "#111111" },
  lightTextSub: { color: "#64748B" },
});
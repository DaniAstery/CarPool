import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Switch,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function DriverHomeScreen({ navigation }) {
  const [isOnline, setIsOnline] = useState(true);
  const [activeTab, setActiveTab] = useState("Feed");

  // Simulated live feed payload directly matching the reference architecture
  const [requests, setRequests] = useState([
    {
      id: "1",
      title: "Bole Hub",
      price: "450 ETB",
      distance: "3 m",
      timeLeft: 14,
      icon: "map-marker-distance",
      iconType: "MCI",
    },
    {
      id: "2",
      title: "Gerji Hub",
      price: "350 ETB",
      distance: "3 m",
      timeLeft: 18,
      icon: "routes",
      iconType: "FA5",
    },
    {
      id: "3",
      title: "Thunder (Place)",
      price: "500 ETB",
      distance: "17 m",
      timeLeft: 22,
      icon: "office-building",
      iconType: "MCI",
    },
  ]);

  // Real-time countdown timer tick effect loop for request urgency simulation
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(() => {
      setRequests((prevRequests) =>
        prevRequests.map((req) => {
          if (req.timeLeft > 0) {
            return { ...req, timeLeft: req.timeLeft - 1 };
          }
          return { ...req, timeLeft: 20 }; // Auto reset loop for persistent prototype testing
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [isOnline]);

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Header Profile & Mode Toggler Panel */}
      <View style={styles.headerBlock}>
        <TouchableOpacity style={styles.menuIconButton} activeOpacity={0.7}>
          <Ionicons name="menu" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.statusToggleContainer}>
          <Text style={[styles.statusLabelText, isOnline ? styles.textOnline : styles.textOffline]}>
            Status: {isOnline ? "ONLINE" : "OFFLINE"}
          </Text>
          <Switch
            trackColor={{ false: "#374151", true: "#059669" }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#374151"
            value={isOnline}
            onValueChange={(val) => setIsOnline(val)}
            style={styles.switchScale}
          />
        </View>
      </View>

      {/* 2. Main Live Requests Feed Body */}
      <ScrollView 
        style={styles.feedScrollArea} 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.feedTitleLabel}>Available Requests <Text style={styles.timerSubText}>(20s Timer)</Text></Text>

        {isOnline ? (
          requests.map((item, index) => (
            <View key={item.id} style={styles.requestItemCard}>
              
              {/* Left Column Layout: Counter/Urgency Flag & Node Visualizer */}
              <View style={styles.leftUrgencyColumn}>
                <View style={styles.nodeIconFrame}>
                  {item.iconType === "MCI" ? (
                    <MaterialCommunityIcons name={item.icon} size={22} color="#111827" />
                  ) : (
                    <FontAwesome5 name={item.icon} size={18} color="#111827" />
                  )}
                  <View style={styles.nodeCounterBadge}>
                    <Text style={styles.nodeCounterText}>{index + 1}</Text>
                  </View>
                </View>
                <Text style={styles.timeLeftLabel}>{item.timeLeft}s left</Text>
              </View>

              {/* Right Column Layout: Destination Details Metadata Frame */}
              <View style={styles.detailsDataColumn}>
                <View style={styles.metaHeaderRow}>
                  <Text style={styles.requestNumberLabel}>REQUEST #{index + 1}:</Text>
                  <View style={styles.distanceCluster}>
                    <Ionicons name="location-sharp" size={11} color="#9CA3AF" />
                    <Text style={styles.distanceText}>{item.distance}</Text>
                  </View>
                </View>

                <Text style={styles.hubTitleText}>{item.title}</Text>
                <Text style={styles.priceTagText}>➔ {item.price}</Text>

                {/* Primary Accept System Trigger */}
                <TouchableOpacity 
                  style={styles.claimJobButton}
                  activeOpacity={0.8}
                  onPress={() => {
                    console.log(`Job approved for dispatch segment identifier: ${item.id}`);
                    // Linked flow state forward segment example:
                    // navigation.navigate("DriverMatchRequestScreen", { hubDetails: item });
                  }}
                >
                  <Text style={styles.claimJobButtonText}>CLAIM JOB</Text>
                </TouchableOpacity>
              </View>

            </View>
          ))
        ) : (
          <View style={styles.offlineFallbackContainer}>
            <MaterialCommunityIcons name="cloud-off-outline" size={48} color="#4B5563" />
            <Text style={styles.offlineFallbackText}>You are currently offline</Text>
            <Text style={styles.offlineFallbackSubText}>Switch your status portal to online mode above to populate regional matching manifests.</Text>
          </View>
        )}
      </ScrollView>

      {/* 3. Global Platform Bottom Navigation App Bar */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity 
          style={styles.tabItemButton} 
          onPress={() => setActiveTab("Feed")}
        >
          <MaterialCommunityIcons 
            name="rss" 
            size={20} 
            color={activeTab === "Feed" ? "#FFFFFF" : "#9CA3AF"} 
          />
          <Text style={[styles.tabItemLabel, activeTab === "Feed" && styles.tabItemActiveLabel]}>Feed</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItemButton} 
          onPress={() => setActiveTab("Map")}
        >
          <Ionicons 
            name="map-outline" 
            size={20} 
            color={activeTab === "Map" ? "#FFFFFF" : "#9CA3AF"} 
          />
          <Text style={[styles.tabItemLabel, activeTab === "Map" && styles.tabItemActiveLabel]}>Map</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItemButton} 
          onPress={() => setActiveTab("History")}
        >
          <MaterialCommunityIcons 
            name="history" 
            size={20} 
            color={activeTab === "History" ? "#FFFFFF" : "#9CA3AF"} 
          />
          <Text style={[styles.tabItemLabel, activeTab === "History" && styles.tabItemActiveLabel]}>History</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1F2937", // Matches image background framework
  },
  headerBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#111827",
    borderBottomWidth: 1,
    borderColor: "#374151",
  },
  menuIconButton: {
    width: 38,
    height: 38,
    backgroundColor: "#374151",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1F2937",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  statusLabelText: {
    fontSize: 11,
    fontWeight: "700",
    marginRight: 8,
    letterSpacing: 0.3,
  },
  textOnline: { color: "#10B981" },
  textOffline: { color: "#9CA3AF" },
  switchScale: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  feedScrollArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  feedTitleLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  timerSubText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "400",
  },
  requestItemCard: {
    flexDirection: "row",
    backgroundColor: "#111827",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#374151",
    padding: 14,
    marginBottom: 12,
  },
  leftUrgencyColumn: {
    alignItems: "center",
    justifyContent: "center",
    width: 70,
    borderRightWidth: 1,
    borderColor: "#374151",
    paddingRight: 12,
  },
  nodeIconFrame: {
    width: 44,
    height: 44,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  nodeCounterBadge: {
    position: "absolute",
    top: -4,
    left: -4,
    backgroundColor: "#4B5563",
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeCounterText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },
  timeLeftLabel: {
    fontSize: 11,
    color: "#EF4444",
    fontWeight: "600",
  },
  detailsDataColumn: {
    flex: 1,
    paddingLeft: 14,
  },
  metaHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  requestNumberLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 0.4,
  },
  distanceCluster: {
    flexDirection: "row",
    alignItems: "center",
  },
  distanceText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginLeft: 3,
  },
  hubTitleText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 2,
  },
  priceTagText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "600",
    marginTop: 2,
    marginBottom: 10,
  },
  claimJobButton: {
    backgroundColor: "#10B981",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  claimJobButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  offlineFallbackContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  offlineFallbackText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 12,
  },
  offlineFallbackSubText: {
    color: "#9CA3AF",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 30,
    marginTop: 6,
    lineHeight: 18,
  },
  bottomTabBar: {
    flexDirection: "row",
    backgroundColor: "#111827",
    borderTopWidth: 1,
    borderColor: "#374151",
    paddingVertical: 10,
  },
  tabItemButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    marginTop: 4,
    fontWeight: "500",
  },
  tabItemActiveLabel: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});